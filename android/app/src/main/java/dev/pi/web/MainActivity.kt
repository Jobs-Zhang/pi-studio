package dev.pi.web

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.os.Build
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
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

private const val CONNECT_PAGE_URL = "file:///android_asset/connect.html"
private const val BRIDGE_NAME = "AndroidBridge"
private const val NOTIFICATION_SHIM_ASSET = "pi-web-notification-shim.js"
private const val TAG = "PiWeb"

/**
 * WebView shell around the shared connect page. Direct connections load the
 * gateway URL as-is; SSH connections load it through the loopback tunnel the
 * bridge opened, exactly like the desktop client's window.
 */
class MainActivity : ComponentActivity() {

    private lateinit var service: ConnectionService
    private lateinit var webView: WebView
    private lateinit var bridge: ConnectBridge
    private lateinit var notifications: SystemNotifications
    private var showingConnectPage = true
    private var pendingNotificationClick: String? = null

    private val notificationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { deliverNotificationPermission() }

    /**
     * Closing a JSch session writes to its socket, which must not happen on the
     * UI thread, so tunnel teardown triggered by the UI is handed off here.
     */
    private val tunnelExecutor: ExecutorService = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "pi-web-tunnel")
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // The connect page is dark, so system bars always need light icons.
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
        )

        service = ConnectionService(ConnectionStore(this))
        webView = createWebView()
        // The bridge must be registered before the first loadUrl: WebView only
        // injects Java interfaces that were added before the page started.
        bridge = ConnectBridge(webView, service)
        webView.addJavascriptInterface(bridge, BRIDGE_NAME)
        notifications = SystemNotifications(this)
        webView.addJavascriptInterface(notifications, SystemNotifications.BRIDGE_NAME)
        installNotificationShim()
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

        loadConnectPage()
        handleNotificationIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleNotificationIntent(intent)
    }

    override fun onDestroy() {
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
        webViewClient = PiWebViewClient()
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

    /**
     * Gives the page the Web Notification API it cannot have natively. Registered
     * for every origin, because the gateway runs on the user's own address.
     */
    private fun installNotificationShim() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            Log.w(TAG, "WebView does not support document-start scripts; system notifications are unavailable")
            return
        }
        val script = runCatching {
            assets.open(NOTIFICATION_SHIM_ASSET).bufferedReader().use { it.readText() }
        }.getOrElse { error ->
            Log.w(TAG, "Could not read the notification shim", error)
            return
        }
        runCatching { WebViewCompat.addDocumentStartJavaScript(webView, script, setOf("*")) }
            .onFailure { error -> Log.w(TAG, "Could not install the notification shim", error) }
    }

    /** Called by the page's shim when it wants the Android 13+ notification grant. */
    fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || notifications.isGranted()) {
            deliverNotificationPermission()
            return
        }
        notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
    }

    private fun deliverNotificationPermission() {
        val result = if (notifications.isGranted()) "granted" else "denied"
        webView.post {
            webView.evaluateJavascript(
                "window.__piWebNotifyPermission && window.__piWebNotifyPermission(${JSONObject.quote(result)})",
                null,
            )
        }
    }

    /** Routes a notification tap back to the page instance that raised it. */
    private fun handleNotificationIntent(intent: Intent?) {
        val id = intent?.getStringExtra(EXTRA_NOTIFICATION_ID) ?: return
        intent.removeExtra(EXTRA_NOTIFICATION_ID)
        pendingNotificationClick = id
        dispatchNotificationClick()
    }

    private fun dispatchNotificationClick() {
        val id = pendingNotificationClick ?: return
        webView.post {
            webView.evaluateJavascript(
                "window.__piWebNotifyClick && window.__piWebNotifyClick(${JSONObject.quote(id)})",
            ) { pendingNotificationClick = null }
        }
    }

    private fun loadConnectPage() {
        showingConnectPage = true
        webView.loadUrl(CONNECT_PAGE_URL)
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

    private inner class PiWebViewClient : WebViewClient() {

        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            // Only tracks which screen is showing; the bridge stays registered
            // because re-injecting it mid-session would reload the page.
            showingConnectPage = url?.startsWith(CONNECT_PAGE_URL) == true
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (!request.isForMainFrame) return
            Toast.makeText(this@MainActivity, "无法打开页面：${error.description}", Toast.LENGTH_LONG).show()
        }

        override fun onPageFinished(view: WebView, url: String?) {
            // A tap that started the app has no live page instance until now.
            dispatchNotificationClick()
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
        /** Set on a notification's pending intent so a tap can be replayed into the page. */
        const val EXTRA_NOTIFICATION_ID = "dev.pi.web.notificationId"
    }
}
