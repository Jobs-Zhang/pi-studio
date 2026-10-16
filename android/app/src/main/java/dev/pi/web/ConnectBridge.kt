package dev.pi.web

import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONObject
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Exposes the connect page's `window.piWebDesktop` contract to JavaScript. The
 * page defines `window.__piWebBridge(id, json)` and awaits every answer, so a
 * single serialized executor keeps calls ordered and the tunnel state safe.
 */
class ConnectBridge(private val webView: WebView, private val service: ConnectionService) {

    private val executor = Executors.newSingleThreadExecutor { runnable -> Thread(runnable, "pi-web-bridge") }
    private val closed = AtomicBoolean(false)

    /** Called from the WebView's JavaScript thread; never from the UI thread. */
    @JavascriptInterface
    fun call(method: String, argsJson: String, callbackId: String) {
        if (closed.get()) return
        executor.execute {
            val result = runCatching { dispatch(method, parseArgs(argsJson)) }
                .getOrElse { error -> JSONObject().put("ok", false).put("error", error.message ?: "连接失败") }
            deliver(callbackId, result)
        }
    }

    fun shutdown() {
        closed.set(true)
        executor.shutdownNow()
    }

    private fun dispatch(method: String, args: JSONObject): Any = when (method) {
        "getHistory" -> service.historyState()
        "saveMode" -> JSONObject().put("lastMode", service.saveMode(args.optString("mode")))
        "connect" -> service.connect(args.optJSONObject("payload") ?: JSONObject())
        "connectRecent" -> service.connectRecent(args.optInt("index", -1))
        "tunnelStatus" -> service.tunnelStatus()
        "reconnect" -> service.reconnect()
        "deleteConnection" -> service.deleteConnection(args.optInt("index", -1))
        "clearHistory" -> service.clearHistory()
        "detectEnvironment" -> service.detectEnvironment()
        "capabilities" -> service.capabilities()
        else -> throw IllegalArgumentException("未知的方法：$method")
    }

    /** `evaluateJavascript` must run on the UI thread; the callback is a global the page owns. */
    private fun deliver(callbackId: String, result: Any) {
        val script = "window.__piWebBridge && window.__piWebBridge(" +
            "${JSONObject.quote(callbackId)}, ${JSONObject.quote(result.toString())})"
        webView.post { runCatching { webView.evaluateJavascript(script, null) } }
    }

    private fun parseArgs(json: String): JSONObject = runCatching { JSONObject(json) }.getOrElse { JSONObject() }
}
