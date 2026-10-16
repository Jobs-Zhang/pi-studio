package dev.pi.studio

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

private const val CONNECT_PAGE_URL = "file:///android_asset/connect.html"
private const val BRIDGE_NAME = "AndroidBridge"
private const val TAG = "PiStudio"

/**
 * WebView shell around the shared connect page. Direct connections load the
 * gateway URL as-is; SSH connections load it through the loopback tunnel the
 * bridge opened, exactly like the desktop client's window.
 */
class MainActivity : ComponentActivity() {

    private lateinit var service: ConnectionService
    private lateinit var webView: WebView
    private lateinit var bridge: ConnectBridge
    private var showingConnectPage = true
    private var reconnectFailures = 0

    private val watchdogHandler = android.os.Handler(android.os.Looper.getMainLooper())

    /**
     * Closing a JSch session writes to its socket, which must not happen on the
     * UI thread, so tunnel teardown triggered by the UI is handed off here.
     */
    private val tunnelExecutor: ExecutorService = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "pi-studio-tunnel")
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        applySystemBarTheme()


        service = ConnectionService(ConnectionStore(this))
        webView = createWebView()
        // The bridge must be registered before the first loadUrl: WebView only
        // injects Java interfaces that were added before the page started.
        bridge = ConnectBridge(webView, service)
        webView.addJavascriptInterface(bridge, BRIDGE_NAME)
        // WebView padding does not shrink the web viewport, so the system bar
        // insets are applied to a wrapper the WebView is laid out inside.
        val content = FrameLayout(this).apply {
            addView(
                webView,
                FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT),
            )
        }
        setContentView(content)
        applySystemBarInsets(content)

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() = navigateBack()
            },
        )

        webView.loadUrl(CONNECT_PAGE_URL)
    }

    override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
        super.onConfigurationChanged(newConfig)
        applySystemBarTheme()
    }

    private fun applySystemBarTheme() {
        val dark = (resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK) == android.content.res.Configuration.UI_MODE_NIGHT_YES
        enableEdgeToEdge(
            statusBarStyle = if (dark) SystemBarStyle.dark(Color.TRANSPARENT) else SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
            navigationBarStyle = if (dark) SystemBarStyle.dark(Color.TRANSPARENT) else SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
        )
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
    }

    override fun onResume() {
        super.onResume()
        applySystemBarTheme()
        resumeTunnelIfNeeded()
        watchdogHandler.postDelayed(tunnelWatchdog, TUNNEL_WATCHDOG_INTERVAL_MS)
    }

    override fun onDestroy() {
        watchdogHandler.removeCallbacks(tunnelWatchdog)
        tunnelExecutor.execute { service.shutdown() }
        tunnelExecutor.shutdown()
        bridge.shutdown()
        super.onDestroy()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun createWebView(): WebView = WebView(this).apply {
        settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            // The connect page is a local asset; gateway pages are normal http(s).
            allowFileAccess = true
            mediaPlaybackRequiresUserGesture = false
        }
        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true)
        webViewClient = PiStudioViewClient()
        webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(message: ConsoleMessage): Boolean {
                Log.d(TAG, "${message.message()} (${message.sourceId()}:${message.lineNumber()})")
                return true
            }
        }
    }

    /** Keeps page content clear of the status/navigation bars and the keyboard. */
    private fun applySystemBarInsets(content: View) {
        ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or
                    WindowInsetsCompat.Type.displayCutout() or
                    WindowInsetsCompat.Type.ime(),
            )
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            // Consumed: the inset is already spent as layout padding, so the page
            // must not also receive it as a CSS safe-area inset.
            WindowInsetsCompat.CONSUMED
        }
    }

    private fun loadConnectPage() {
        showingConnectPage = true
        webView.loadUrl("$CONNECT_PAGE_URL?manual=1")
    }

    /** Back leaves the gateway; the connect page itself is the app's root. */
    private fun navigateBack() {
        if (showingConnectPage) {
            finish()
            return
        }
        loadConnectPage()
        tunnelExecutor.execute { service.closeTunnel() }
    }

    /**
     * Foreground resume: the tunnel may have died in the background (Doze, NAT
     * timeout, process standby). Redial the same loopback port when needed so the
     * already-loaded gateway page — and its reconnect button — works again.
     * Direct connections have no tunnel to redial; the page's own WebSocket
     * retry loop recovers them as soon as the network is back.
     */
    private fun resumeTunnelIfNeeded() {
        if (showingConnectPage) return
        tunnelExecutor.execute {
            val status = runCatching { service.tunnelStatus() }.getOrNull() ?: return@execute
            if (status.optBoolean("hasTunnel", false) == false) return@execute
            if (status.optBoolean("connected", true)) return@execute
            redialTunnel()
        }
    }

    /** Redials the remembered SSH tunnel and refreshes the page on success. */
    private fun redialTunnel() {
        val result = runCatching { service.reconnect() }.getOrNull() ?: return
        if (result.optBoolean("ok", false)) {
            reconnectFailures = 0
        } else {
            reconnectFailures += 1
            val message = result.optString("error", "重连失败，请返回重新连接")
            webView.post {
                Toast.makeText(this@MainActivity, message, Toast.LENGTH_LONG).show()
                if (reconnectFailures >= 3) {
                    loadConnectPage()
                    tunnelExecutor.execute { service.closeTunnel() }
                }
            }
        }
    }

    /**
     * While resumed, keeps checking the SSH session: ServerAlive marks a dead
     * path disconnected within ~90s, and this redials shortly after, so a tunnel
     * that dies mid-use heals without the user leaving the page.
     */
    private val tunnelWatchdog = object : Runnable {
        override fun run() {
            if (showingConnectPage) {
                watchdogHandler.postDelayed(this, TUNNEL_WATCHDOG_INTERVAL_MS)
                return
            }
            tunnelExecutor.execute {
                val status = runCatching { service.tunnelStatus() }.getOrNull() ?: return@execute
                if (status.optBoolean("hasTunnel", false) && status.optBoolean("connected", true) == false) {
                    redialTunnel()
                }
            }
            watchdogHandler.postDelayed(this, TUNNEL_WATCHDOG_INTERVAL_MS)
        }
    }

    override fun onPause() {
        super.onPause()
        // Background is allowed to die; stop checking until the next resume.
        watchdogHandler.removeCallbacks(tunnelWatchdog)
    }

    private inner class PiStudioViewClient : WebViewClient() {

        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            // Only tracks which screen is showing; the bridge stays registered
            // because re-injecting it mid-session would reload the page.
            showingConnectPage = url?.startsWith(CONNECT_PAGE_URL) == true
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (!request.isForMainFrame) return
            Toast.makeText(this@MainActivity, "无法打开页面：${error.description}", Toast.LENGTH_LONG).show()
            if (!showingConnectPage) loadConnectPage()
        }

        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val scheme = request.url.scheme?.lowercase()
            if (scheme == "http" || scheme == "https") return false
            return runCatching {
                startActivity(Intent(Intent.ACTION_VIEW, request.url))
                true
            }.getOrDefault(true)
        }
    }

    companion object {
        /** Foreground tunnel health-check cadence; see [tunnelWatchdog]. */
        private const val TUNNEL_WATCHDOG_INTERVAL_MS = 10_000L
    }
}
