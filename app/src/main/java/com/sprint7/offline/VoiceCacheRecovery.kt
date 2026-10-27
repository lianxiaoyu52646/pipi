package com.sprint7.offline

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
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
    private const val RESUME_FILE = "pipi_voice_cache_recovery_attempt_v1.json"
    private const val NOTIFY_FILE = "pipi_voice_cache_recovery_notice_v1.json"
    private const val MANUAL_CHANNEL = "pipi_cache_manual_recovery"
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

    /** The selected voice profile survives manual pause, process death and app restarts.
     * Null means there has never been a persisted cache start, so the UI may choose freely. */
    fun rememberedParameters(context: Context): Pair<Int, Float>? {
        val saved = read(context, INTENT_FILE)
        if (saved != null && saved.has("speaker") && saved.has("speed")) {
            return saved.optInt("speaker", 3) to saved.optDouble("speed", 1.0).toFloat()
        }
        val legacy = context.getSharedPreferences("pipi_library_voice_cache", Context.MODE_PRIVATE)
        return if (legacy.contains("speaker") && legacy.contains("speed"))
            legacy.getInt("speaker", 3) to legacy.getFloat("speed", 1f) else null
    }

    fun parameters(context: Context): Pair<Int, Float> {
        val saved = read(context, INTENT_FILE)
        val legacy = context.getSharedPreferences("pipi_library_voice_cache", Context.MODE_PRIVATE)
        return (saved?.optInt("speaker", legacy.getInt("speaker", 3)) ?: legacy.getInt("speaker", 3)) to
            (saved?.optDouble("speed", legacy.getFloat("speed", 1f).toDouble())?.toFloat()
                ?: legacy.getFloat("speed", 1f))
    }

    fun status(context: Context): JSONObject? = read(context, STATUS_FILE)

    /** Durable across both app processes, including failed foreground-service starts.
     * This file is diagnostic only: a failed recovery is never reported as success. */
    fun recoveryAttempt(context: Context): JSONObject? = read(context, RESUME_FILE)
    private fun recordAttempt(context: Context, outcome: String, detail: String) {
        try {
            write(context, RESUME_FILE, JSONObject().put("at", System.currentTimeMillis())
                .put("outcome", outcome).put("detail", detail.take(320)))
        } catch (e: Exception) { Log.w(TAG, "Cannot persist recovery attempt", e) }
    }

    fun noteForegroundRecovery(context: Context, message: String) {
        recordAttempt(context, "foreground_requested", message)
        // A fresh user-initiated app opening allows us to remove the stale alert.
        try { (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
            .cancel(852) } catch (_: Exception) {}
    }

    fun noteForegroundRecoveryFailed(context: Context, error: String) {
        recordAttempt(context, "foreground_failed", error)
    }

    /** When Android denies background FGS start, let the user safely resume with
     * an explicit tap. Android Force Stop may prevent even this notification. */
    private fun notifyManualResume(context: Context) {
        try {
            if (Build.VERSION.SDK_INT >= 33 &&
                context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) !=
                    android.content.pm.PackageManager.PERMISSION_GRANTED) return
            val now=System.currentTimeMillis()
            if (now-(read(context,NOTIFY_FILE)?.optLong("at")?:0L)<2L*60L*60L*1000L)return
            val manager=context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(NotificationChannel(MANUAL_CHANNEL,
                "皮皮语音缓存恢复提醒",NotificationManager.IMPORTANCE_DEFAULT))
            val open=PendingIntent.getActivity(context,852,
                Intent(context,MainActivity::class.java),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val notification=Notification.Builder(context,MANUAL_CHANNEL)
                .setSmallIcon(android.R.drawable.stat_notify_error)
                .setContentTitle("皮皮 · 后台缓存恢复受限")
                .setContentText("手机限制自动恢复，点此打开皮皮继续缓存，已有音频不会丢失")
                .setContentIntent(open).setAutoCancel(true).build()
            manager.notify(852,notification)
            write(context,NOTIFY_FILE,JSONObject().put("at",now))
        }catch(e:Exception){ Log.w(TAG,"Unable to post manual recovery notification",e) }
    }

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

    /** BOOT_COMPLETED only reschedules; launching a foreground service directly
     * from boot can be restricted by Android versions and OEM power policy. */
    fun onBoot(context: Context) {
        if(!desired(context))return
        VoiceCacheDiagnostics.record(context,"boot_resume","手机已重启，正在重新安排离线缓存恢复检查")
        try { schedule(context,65_000L) }
        catch(e:Exception) { Log.w(TAG,"Unable to reschedule cache after boot",e) }
    }

    fun onTick(context: Context) {
        if (!desired(context)) { cancel(context); return }
        val status = status(context)
        val age = System.currentTimeMillis() - (status?.optLong("updatedAt") ?: 0L)
        val state = status?.optString("state") ?: "unknown"
        // An OS exit recorded AFTER the last heartbeat means this process is dead,
        // even within the 3-minute stale-heartbeat window. Resume sooner when allowed.
        val latestExit = VoiceCacheDiagnostics.latestProcessExit(context,
            (status?.optLong("updatedAt") ?: 0L) + 1L)
        val terminated = latestExit != null
        if (age > HEARTBEAT_STALE_MS || state == "recovering" || state == "error" || terminated) {
            val (speaker, speed) = parameters(context)
            try {
                context.startForegroundService(Intent(context, LibraryVoiceCacheService::class.java)
                    .setAction(LibraryVoiceCacheService.ACTION_RESTORE)
                    .putExtra("speaker", speaker).putExtra("speed", speed))
                recordAttempt(context, "launch_requested", "恢复闹钟已请求启动服务；尚需等待后台服务心跳确认")
                Log.i(TAG, "Recovery tick requested foreground cache service; heartbeat age=$age exit=$terminated")
            } catch (e: Exception) {
                // Android 12+ and Xiaomi restrictions may reject background FGS
                // starts. Neither START_STICKY nor alarms can override Force Stop.
                val message="Android阻止后台恢复：${e.javaClass.simpleName}: ${e.message ?: ""}；重新打开皮皮后将从SQLite断点继续"
                recordAttempt(context, "launch_blocked", message)
                Log.w(TAG, "Android restricted background recovery launch", e)
                VoiceCacheDiagnostics.record(context,"background_launch_blocked",message)
                notifyManualResume(context)
            }
        }
        schedule(context)
    }
}

/** Runs in the default app process, never in :voice_cache. */
class VoiceCacheRecoveryReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        when(intent?.action) {
            "com.sprint7.offline.CACHE_RECOVERY_TICK" -> VoiceCacheRecovery.onTick(context.applicationContext)
        }
    }
}

/** System reboot loses elapsed-realtime alarms, but does not delete PCM or SQLite. */
class VoiceCacheBootReceiver: BroadcastReceiver() {
    override fun onReceive(context:Context, intent:Intent?) {
        if(intent?.action==Intent.ACTION_BOOT_COMPLETED) {
            VoiceCacheRecovery.onBoot(context.applicationContext)
        }
    }
}
