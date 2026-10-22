package com.sprint7.offline

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.SystemClock
import android.util.AtomicFile
import android.util.Log
import org.json.JSONObject
import java.io.File

/** Cross-process durable task intent/status, and an alarm fallback if the isolated
 *  native Kokoro process is killed. Alarms are best-effort under Android/OEM limits. */
internal object VoiceCacheRecovery {
    private const val TAG = "PipiCacheRecovery"
    private const val INTENT_FILE = "pipi_voice_cache_intent.json"
    private const val STATUS_FILE = "pipi_voice_cache_live.json"
    private const val TICK_MS = 8L * 60L * 1000L
    private const val HEARTBEAT_STALE_MS = 3L * 60L * 1000L

    private fun atomic(context: Context, name: String) = AtomicFile(File(context.filesDir, name))

    private fun read(context: Context, name: String): JSONObject? = try {
        JSONObject(atomic(context, name).openRead().bufferedReader(Charsets.UTF_8).use { it.readText() })
    } catch (_: Exception) { null }

    private fun write(context: Context, name: String, data: JSONObject) {
        val output = atomic(context, name)
        val stream = output.startWrite()
        try {
            stream.write(data.toString().toByteArray(Charsets.UTF_8))
            output.finishWrite(stream)
        } catch (e: Exception) {
            output.failWrite(stream)
            throw e
        }
    }

    fun desired(context: Context): Boolean = read(context, INTENT_FILE)?.optBoolean("wanted", false)
        ?: context.getSharedPreferences("pipi_library_voice_cache", Context.MODE_PRIVATE)
            .getBoolean("user_wants_continuous_cache", false)

    fun request(context: Context, wanted: Boolean, speaker: Int = 3, speed: Float = 1f) {
        val params = JSONObject().put("wanted", wanted).put("speaker", speaker)
            .put("speed", speed.toDouble()).put("requestedAt", System.currentTimeMillis())
        write(context, INTENT_FILE, params)
        if (wanted) schedule(context) else cancel(context)
    }

    fun parameters(context: Context): Pair<Int, Float> {
        val saved = read(context, INTENT_FILE)
        val legacy = context.getSharedPreferences("pipi_library_voice_cache", Context.MODE_PRIVATE)
        return (saved?.optInt("speaker", legacy.getInt("speaker", 3)) ?: legacy.getInt("speaker", 3)) to
            (saved?.optDouble("speed", legacy.getFloat("speed", 1f).toDouble())?.toFloat()
                ?: legacy.getFloat("speed", 1f))
    }

    fun status(context: Context): JSONObject? = read(context, STATUS_FILE)

    fun publish(context: Context, data: JSONObject) {
        data.put("wanted", desired(context))
        write(context, STATUS_FILE, data)
    }

    private fun pending(context: Context): PendingIntent = PendingIntent.getBroadcast(
        context, 9821, Intent(context, VoiceCacheRecoveryReceiver::class.java)
            .setAction("com.sprint7.offline.CACHE_RECOVERY_TICK"),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    fun schedule(context: Context, delay: Long = TICK_MS) {
        if (!desired(context)) return
        val alarm = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        // Inexact while-idle alarms need no SCHEDULE_EXACT_ALARM permission. They may
        // be delayed under Doze, but are a backup to START_STICKY + foreground service.
        alarm.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP,
            SystemClock.elapsedRealtime() + delay.coerceAtLeast(30_000L), pending(context))
    }

    fun cancel(context: Context) {
        (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(pending(context))
    }

    fun onTick(context: Context) {
        if (!desired(context)) { cancel(context); return }
        val status = status(context)
        val age = System.currentTimeMillis() - (status?.optLong("updatedAt") ?: 0L)
        val state = status?.optString("state") ?: "unknown"
        if (age > HEARTBEAT_STALE_MS || state == "recovering" || state == "error") {
            val (speaker, speed) = parameters(context)
            try {
                context.startForegroundService(Intent(context, LibraryVoiceCacheService::class.java)
                    .setAction(LibraryVoiceCacheService.ACTION_RESTORE)
                    .putExtra("speaker", speaker).putExtra("speed", speed))
                Log.i(TAG, "Recovery tick requested foreground cache service; last heartbeat age=$age")
            } catch (e: Exception) {
                // Android 12+ may reject an FGS launch from background. Keep retrying;
                // MainActivity onResume has a foreground fallback too.
                Log.w(TAG, "Android restricted background recovery launch", e)
            }
        }
        schedule(context)
    }
}

/** Runs in the default app process, never in :voice_cache. */
class VoiceCacheRecoveryReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action == "com.sprint7.offline.CACHE_RECOVERY_TICK") {
            VoiceCacheRecovery.onTick(context.applicationContext)
        }
    }
}
