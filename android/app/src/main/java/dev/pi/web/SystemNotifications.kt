package dev.pi.web

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.webkit.JavascriptInterface
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

/**
 * OS notifications for the page's attention signals.
 *
 * Android WebView has no Web Notification API, so
 * `assets/pi-web-notification-shim.js` turns the page's `new Notification(...)`
 * calls into calls on the `AndroidNotifications` bridge handled here. The page's
 * own notification id is the identity: it is what a tap is routed back to, and
 * the `tag` option replaces an existing entry the way the Web contract says.
 */
class SystemNotifications(private val activity: MainActivity) {

    @JavascriptInterface
    fun permission(): String = if (isGranted()) GRANTED else DENIED

    /** Asks the activity for the runtime grant; the answer returns via `__piWebNotifyPermission`. */
    @JavascriptInterface
    fun requestPermission() {
        activity.runOnUiThread { activity.requestNotificationPermission() }
    }

    @JavascriptInterface
    fun show(id: String, tag: String, title: String, body: String) {
        if (!isGranted()) return
        ensureChannel()
        val key = keyFor(id, tag)
        val notification = NotificationCompat.Builder(activity, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(clickIntent(id))
            .build()
        runCatching { NotificationManagerCompat.from(activity).notify(key, key.hashCode(), notification) }
    }

    @JavascriptInterface
    fun close(id: String, tag: String) {
        val key = keyFor(id, tag)
        runCatching { NotificationManagerCompat.from(activity).cancel(key, key.hashCode()) }
    }

    fun isGranted(): Boolean = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    } else {
        NotificationManagerCompat.from(activity).areNotificationsEnabled()
    }

    /** Tagged notifications collapse onto one entry; untagged ones stay independent. */
    private fun keyFor(id: String, tag: String): String = tag.ifEmpty { id }

    private fun ensureChannel() {
        val manager = activity.getSystemService(NotificationManager::class.java) ?: return
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return
        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                activity.getString(R.string.notification_channel_name),
                NotificationManager.IMPORTANCE_HIGH,
            ).apply { description = activity.getString(R.string.notification_channel_description) },
        )
    }

    /** Tapping a notification re-enters the app, which replays the click into the page. */
    private fun clickIntent(id: String): PendingIntent {
        val intent = Intent(activity, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
            putExtra(MainActivity.EXTRA_NOTIFICATION_ID, id)
        }
        return PendingIntent.getActivity(
            activity,
            id.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    companion object {
        /** Name of the injected JavaScript interface object. */
        const val BRIDGE_NAME = "AndroidNotifications"

        private const val CHANNEL_ID = "pi-web-attention"
        private const val GRANTED = "granted"
        private const val DENIED = "denied"
    }
}
