package dev.pi.web

import com.jcraft.jsch.JSch
import com.jcraft.jsch.Session
import com.jcraft.jsch.UserInfo
import java.io.Closeable

/** Credentials for one SSH hop; Android has no ssh agent or config to fall back on. */
data class SshSpec(val host: String, val port: Int, val user: String, val password: String)

/** A live local forward: `127.0.0.1:localPort` reaches the gateway through the SSH host. */
class SshTunnel internal constructor(private val session: Session, val localPort: Int) : Closeable {
    /** True while the underlying SSH session is still up. No I/O is performed. */
    val isAlive: Boolean
        get() = runCatching { session.isConnected }.getOrDefault(false)

    override fun close() {
        runCatching { session.disconnect() }
    }
}

/**
 * Opens the equivalent of `ssh -N -L 127.0.0.1:<port>:<gateway>` using JSch,
 * the same model as `desktop/tunnel.cjs` — except that Android ships no OpenSSH
 * client, so the library is the transport instead of a spawned process.
 */
object SshTunnelFactory {
    const val DEFAULT_TIMEOUT_MS = 15_000
    /** Matches the desktop/server `ServerAliveInterval=30 / CountMax=3` pair. */
    private const val SERVER_ALIVE_INTERVAL_MS = 30_000
    private const val SERVER_ALIVE_COUNT_MAX = 3

    /**
     * Authenticates and asks the server for a local listener on a free port.
     * JSch opens that listener only after authentication succeeds, so a returned
     * tunnel is a ready tunnel (no separate readiness probe needed).
     */
    fun open(
        spec: SshSpec,
        target: GatewayTarget,
        timeoutMs: Int = DEFAULT_TIMEOUT_MS,
        reuseLocalPort: Int = 0,
    ): SshTunnel {
        val session = JSch().getSession(spec.user, spec.host, spec.port).apply {
            setPassword(spec.password)
            // First contact is accepted like ssh's accept-new; a changed host key is not.
            setConfig("StrictHostKeyChecking", "accept-new")
            setConfig("PreferredAuthentications", "password,keyboard-interactive")
            userInfo = PasswordUserInfo(spec.password)
            this.timeout = timeoutMs
            // Foreground-only keepalive: detects a dead NAT/firewall path while the
            // app is open without trying to hold the tunnel through Doze/background kill.
            setServerAliveInterval(SERVER_ALIVE_INTERVAL_MS)
            setServerAliveCountMax(SERVER_ALIVE_COUNT_MAX)
        }
        try {
            session.connect(timeoutMs)
            // Reopening on the same loopback port keeps the already-loaded gateway
            // page (and its relative URLs) working without a full navigation.
            val localPort = try {
                session.setPortForwardingL(ConnectPayloads.LOOPBACK, reuseLocalPort, target.host, target.port)
            } catch (bindError: Throwable) {
                if (reuseLocalPort == 0) throw bindError
                session.setPortForwardingL(ConnectPayloads.LOOPBACK, 0, target.host, target.port)
            }
            return SshTunnel(session, localPort)
        } catch (error: Throwable) {
            runCatching { session.disconnect() }
            throw error
        }
    }

    /** Supplies the password to `password` and `keyboard-interactive` prompts. */
    private class PasswordUserInfo(private val password: String) : UserInfo {
        override fun getPassword(): String = password
        override fun getPassphrase(): String = password
        override fun promptPassword(message: String?): Boolean = true
        override fun promptPassphrase(message: String?): Boolean = true
        override fun promptYesNo(message: String?): Boolean = true
        override fun showMessage(message: String?) = Unit
    }
}
