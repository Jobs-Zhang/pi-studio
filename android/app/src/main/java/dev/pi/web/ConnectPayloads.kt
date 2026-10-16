package dev.pi.web

import java.net.URI
import java.net.URISyntaxException

/** Where the SSH tunnel points: the gateway as seen from the SSH host. */
data class GatewayTarget(val host: String, val port: Int)

/**
 * Pure payload helpers shared by the connect paths. These mirror
 * `desktop/main.cjs` (`normalizeDirectUrl`, `parseTunnelTarget`,
 * `tunnelDisplayUrl`, `splitUserHost`).
 */
object ConnectPayloads {
    const val LOOPBACK = "127.0.0.1"
    const val DEFAULT_HTTP_PORT = 80
    const val DEFAULT_HTTPS_PORT = 443

    /** Adds a missing `http://` scheme; returns null for a blank input. */
    fun normalizeDirectUrl(input: String): String? {
        val url = input.trim()
        if (url.isEmpty()) return null
        return if (url.startsWith("http://") || url.startsWith("https://")) url else "http://$url"
    }

    /** Parses the gateway URL into the tunnel target; null when it is not http(s). */
    fun parseGatewayTarget(targetUrl: String): GatewayTarget? {
        val uri = parseUri(targetUrl) ?: return null
        val scheme = uri.scheme?.lowercase() ?: return null
        if (scheme != "http" && scheme != "https") return null
        val host = uri.host ?: return null
        val port = if (uri.port > 0) uri.port else if (scheme == "https") DEFAULT_HTTPS_PORT else DEFAULT_HTTP_PORT
        return GatewayTarget(host, port)
    }

    /** The URL the WebView opens once the tunnel is up: the gateway through loopback. */
    fun tunnelDisplayUrl(targetUrl: String, localPort: Int): String {
        val uri = parseUri(targetUrl) ?: return "http://$LOOPBACK:$localPort"
        // An explicit root path keeps relative app URLs resolving the same as
        // they do on the desktop client (URL#toString always prints one).
        val path = uri.path.ifEmpty { "/" }
        return URI(uri.scheme, uri.userInfo, LOOPBACK, localPort, path, uri.query, uri.fragment).toString()
    }

    /** Splits `user@host` so the user field and the host stay independent. */
    fun splitUserHost(value: String): Pair<String, String?> {
        val at = value.lastIndexOf('@')
        if (at == -1) return value to null
        return value.substring(at + 1) to value.substring(0, at).ifEmpty { null }
    }

    private fun parseUri(value: String): URI? = try {
        URI(value.trim())
    } catch (_: URISyntaxException) {
        null
    }
}
