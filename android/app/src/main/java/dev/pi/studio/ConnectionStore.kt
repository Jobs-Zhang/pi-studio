package dev.pi.studio

import android.content.Context
import org.json.JSONObject

/** Stores the connect-page config; passwords arrive here already encrypted. */
class ConnectionStore(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

    fun load(): ConnectionConfig {
        val raw = preferences.getString(KEY_CONFIG, null) ?: return ConnectionConfig()
        return runCatching { ConnectionConfig.fromJson(JSONObject(raw)) }.getOrElse { ConnectionConfig() }
    }

    fun save(config: ConnectionConfig) {
        preferences.edit().putString(KEY_CONFIG, config.toJson().toString()).apply()
    }

    private companion object {
        const val PREFERENCES = "pi-studio-android"
        const val KEY_CONFIG = "config"
    }
}
