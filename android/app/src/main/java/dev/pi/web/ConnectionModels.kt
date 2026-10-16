package dev.pi.web

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

/** How many recent connections are kept, matching `desktop/history.cjs`. */
const val MAX_HISTORY = 10

/**
 * One recent-connection entry, mirroring `desktop/history.cjs` so both clients
 * keep the same shape and dedupe rules.
 */
data class ConnectionEntry(
    val type: String,
    val url: String? = null,
    val via: String? = null,
    val host: String? = null,
    val port: Int? = null,
    val user: String? = null,
    val identityFile: String? = null,
    val password: String? = null,
    val targetUrl: String? = null,
    val lastUsedAt: String? = null,
) {
    /** Direct entries dedupe by URL; SSH entries keep via/user/host/port/target distinct. */
    val key: String
        get() = if (type != TYPE_SSH) {
            "$TYPE_DIRECT:$url"
        } else {
            "ssh:${via ?: VIA_MANUAL}:${user ?: ""}@$host:${port ?: DEFAULT_SSH_PORT}->$targetUrl"
        }

    /** Renderer-facing view: the encrypted password never leaves this process. */
    fun toPublicJson(): JSONObject = toJson().apply {
        remove("password")
        put("hasPassword", !password.isNullOrEmpty())
    }

    fun toJson(): JSONObject = JSONObject().apply {
        put("type", type)
        url?.let { put("url", it) }
        via?.let { put("via", it) }
        host?.let { put("host", it) }
        port?.let { put("port", it) }
        user?.let { put("user", it) }
        identityFile?.let { put("identityFile", it) }
        password?.let { put("password", it) }
        targetUrl?.let { put("targetUrl", it) }
        lastUsedAt?.let { put("lastUsedAt", it) }
    }

    companion object {
        const val TYPE_DIRECT = "direct"
        const val TYPE_SSH = "ssh"
        const val VIA_MANUAL = "manual"
        const val VIA_CONFIG = "config"
        const val DEFAULT_SSH_PORT = 22

        /** Returns null for entries the desktop client also drops as malformed. */
        fun fromJson(json: JSONObject): ConnectionEntry? {
            val type = json.stringOrNull("type") ?: return null
            if (type == TYPE_DIRECT) {
                val url = json.stringOrNull("url") ?: return null
                return ConnectionEntry(type = type, url = url, lastUsedAt = json.stringOrNull("lastUsedAt"))
            }
            if (type != TYPE_SSH) return null
            val host = json.stringOrNull("host") ?: return null
            val targetUrl = json.stringOrNull("targetUrl") ?: return null
            return ConnectionEntry(
                type = type,
                via = if (json.stringOrNull("via") == VIA_CONFIG) VIA_CONFIG else VIA_MANUAL,
                host = host,
                port = json.intOrNull("port"),
                user = json.stringOrNull("user"),
                identityFile = json.stringOrNull("identityFile"),
                password = json.stringOrNull("password"),
                targetUrl = targetUrl,
                lastUsedAt = json.stringOrNull("lastUsedAt"),
            )
        }
    }
}

/** Persisted connect-page config: the last used mode plus the recent list. */
data class ConnectionConfig(
    val lastMode: String = ConnectionEntry.TYPE_DIRECT,
    val recentConnections: List<ConnectionEntry> = emptyList(),
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("lastMode", lastMode)
        put("recentConnections", JSONArray(recentConnections.map { it.toJson() }))
    }

    /** Moves [entry] to the front, replacing any same-key entry, and stamps the time. */
    fun record(entry: ConnectionEntry, nowIso: String = Instant.now().toString()): ConnectionConfig = copy(
        recentConnections = (
            listOf(entry.copy(lastUsedAt = nowIso)) +
                recentConnections.filter { existing -> existing.key != entry.key }
            ).take(MAX_HISTORY),
    )

    companion object {
        fun fromJson(json: JSONObject): ConnectionConfig {
            val raw = json.optJSONArray("recentConnections")
            val entries = buildList {
                for (index in 0 until (raw?.length() ?: 0)) {
                    val item = raw?.optJSONObject(index) ?: continue
                    ConnectionEntry.fromJson(item)?.let { add(it) }
                }
            }
            return ConnectionConfig(
                lastMode = if (json.stringOrNull("lastMode") == ConnectionEntry.TYPE_SSH) {
                    ConnectionEntry.TYPE_SSH
                } else {
                    ConnectionEntry.TYPE_DIRECT
                },
                recentConnections = entries.take(MAX_HISTORY),
            )
        }
    }
}

internal fun JSONObject.stringOrNull(key: String): String? {
    if (!has(key) || isNull(key)) return null
    return optString(key, "").ifEmpty { null }
}

internal fun JSONObject.intOrNull(key: String): Int? {
    if (!has(key) || isNull(key)) return null
    return optInt(key)
}
