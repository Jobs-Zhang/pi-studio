package dev.pi.web

import org.json.JSONArray
import org.json.JSONObject

private const val APP_TITLE = "PI Web"

/**
 * Connect-page backend: history, feature negotiation and the tunnel lifecycle.
 * It mirrors the IPC handlers in `desktop/main.cjs`, minus everything that
 * needs a local OpenSSH client, `~/.ssh/config` or an identity file.
 */
class ConnectionService(private val store: ConnectionStore) {

    private var config: ConnectionConfig = store.load()

    private val tunnelLock = Any()
    private var activeTunnel: SshTunnel? = null

    /** Feature negotiation with the shared connect page. */
    fun capabilities(): JSONObject = JSONObject().apply {
        put("sshConfig", false)
        put("identityFile", false)
        put("shortcutHints", false)
        put("appTitle", APP_TITLE)
    }

    fun historyState(): JSONObject = JSONObject().apply {
        put("history", historyArray())
        put("lastMode", config.lastMode)
        put("passwordStorageAvailable", PasswordCipher.isAvailable())
    }

    fun saveMode(mode: String): String {
        val next = if (mode == ConnectionEntry.TYPE_SSH) ConnectionEntry.TYPE_SSH else ConnectionEntry.TYPE_DIRECT
        update { it.copy(lastMode = next) }
        return next
    }

    fun deleteConnection(index: Int): JSONArray {
        update { current -> current.copy(recentConnections = current.recentConnections.filterIndexed { i, _ -> i != index }) }
        return historyArray()
    }

    fun clearHistory(): JSONArray {
        update { it.copy(recentConnections = emptyList()) }
        return historyArray()
    }

    /** Android has no ssh client and no `~/.ssh/config`; the page hides those paths. */
    fun detectEnvironment(): JSONObject = JSONObject().apply {
        put("platform", "android")
        put("client", JSONObject().put("available", false))
        put("hosts", JSONArray())
    }

    fun connect(payload: JSONObject): JSONObject = when (payload.stringOrNull("type")) {
        ConnectionEntry.TYPE_DIRECT -> connectDirect(payload.stringOrNull("url").orEmpty())
        ConnectionEntry.TYPE_SSH -> openSsh(
            host = payload.stringOrNull("host").orEmpty(),
            port = payload.intOrNull("port"),
            user = payload.stringOrNull("user"),
            password = payload.stringOrNull("password"),
            targetUrl = payload.stringOrNull("targetUrl").orEmpty(),
            rememberPassword = payload.optBoolean("rememberPassword", false),
        )
        else -> failure("未知的连接类型")
    }

    fun connectRecent(index: Int): JSONObject {
        val entry = config.recentConnections.getOrNull(index) ?: return failure("连接不存在")
        if (entry.type != ConnectionEntry.TYPE_SSH) return connectDirect(entry.url.orEmpty())

        val stored = entry.password
        if (stored == null) return needsPassword("该连接未保存密码，请输入密码")
        val password = PasswordCipher.decrypt(stored) ?: return needsPassword("保存的密码无法解密，请重新输入")
        return openSsh(
            host = entry.host.orEmpty(),
            port = entry.port,
            user = entry.user,
            password = password,
            targetUrl = entry.targetUrl.orEmpty(),
            storedSecret = stored,
        )
    }

    /** Closes the single active tunnel, if any (used when leaving the gateway page). */
    fun closeTunnel() {
        val tunnel = synchronized(tunnelLock) {
            activeTunnel.also { activeTunnel = null }
        }
        tunnel?.close()
    }

    fun shutdown() {
        closeTunnel()
    }

    // ------------------------------------------------------------------
    // Connect paths
    // ------------------------------------------------------------------

    private fun connectDirect(input: String): JSONObject {
        val url = ConnectPayloads.normalizeDirectUrl(input) ?: return failure("请输入 PI WEB 网关地址")
        if (ConnectPayloads.parseGatewayTarget(url) == null) return failure("网关地址无效，请填写 http(s)://host:port")
        record(ConnectionEntry(type = ConnectionEntry.TYPE_DIRECT, url = url))
        return JSONObject().apply {
            put("ok", true)
            put("url", url)
        }
    }

    private fun openSsh(
        host: String,
        port: Int?,
        user: String?,
        password: String?,
        targetUrl: String,
        rememberPassword: Boolean = false,
        storedSecret: String? = null,
    ): JSONObject {
        val rawHost = host.trim()
        if (rawHost.isEmpty()) return failure("请输入 SSH 主机")
        val target = ConnectPayloads.parseGatewayTarget(targetUrl) ?: return failure("远程网关地址无效，请填写 http(s)://host:port")
        if (port != null && port !in 1..65535) return failure("端口需为 1-65535 之间的数字")

        // Android has no system ssh user to fall back on, so a login name is required.
        val (hostName, hostUser) = ConnectPayloads.splitUserHost(rawHost)
        val loginUser = user?.trim().orEmpty().ifEmpty { hostUser.orEmpty() }
        if (loginUser.isEmpty()) return failure("请输入登录用户")
        if (password.isNullOrEmpty()) return failure("请输入密码")

        val spec = SshSpec(
            host = hostName,
            port = port ?: ConnectionEntry.DEFAULT_SSH_PORT,
            user = loginUser,
            password = password,
        )
        val tunnel = try {
            replaceActiveTunnel(spec, target)
        } catch (error: Throwable) {
            return failure("SSH 隧道建立失败：${describeSshError(error)}")
        }

        // A fresh password persists only on request; reconnecting keeps what is already stored.
        val persistedSecret = storedSecret ?: if (rememberPassword) PasswordCipher.encrypt(password) else null
        record(
            ConnectionEntry(
                type = ConnectionEntry.TYPE_SSH,
                via = ConnectionEntry.VIA_MANUAL,
                host = hostName,
                port = port,
                user = loginUser,
                password = persistedSecret,
                targetUrl = targetUrl.trim(),
            ),
        )
        return JSONObject().apply {
            put("ok", true)
            put("url", ConnectPayloads.tunnelDisplayUrl(targetUrl.trim(), tunnel.localPort))
            put("passwordSaved", rememberPassword && persistedSecret != null)
            put("passwordSaveSkipped", rememberPassword && persistedSecret == null)
        }
    }

    private fun replaceActiveTunnel(spec: SshSpec, target: GatewayTarget): SshTunnel {
        closeTunnel()
        val tunnel = SshTunnelFactory.open(spec, target)
        synchronized(tunnelLock) { activeTunnel = tunnel }
        return tunnel
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private fun historyArray(): JSONArray = JSONArray(config.recentConnections.map { it.toPublicJson() })

    private fun update(transform: (ConnectionConfig) -> ConnectionConfig) {
        config = transform(config)
        store.save(config)
    }

    private fun record(entry: ConnectionEntry) = update { it.record(entry) }

    private fun failure(message: String): JSONObject = JSONObject().apply {
        put("ok", false)
        put("error", message)
    }

    private fun needsPassword(message: String): JSONObject = failure(message).apply { put("needsPassword", true) }

    /** Turns library exceptions into the causes a user can act on. */
    private fun describeSshError(error: Throwable): String {
        val message = error.message.orEmpty()
        return when {
            message.contains("auth fail", ignoreCase = true) || message.contains("auth cancel", ignoreCase = true) ->
                "认证失败，请检查用户名与密码"
            message.contains("unknownhost", ignoreCase = true) -> "无法解析主机名"
            message.contains("timeout", ignoreCase = true) || message.contains("timed out", ignoreCase = true) -> "连接超时"
            message.contains("connection refused", ignoreCase = true) -> "目标主机拒绝连接"
            message.contains("no route to host", ignoreCase = true) -> "目标主机不可达"
            message.isEmpty() -> error.javaClass.simpleName
            else -> message
        }
    }
}
