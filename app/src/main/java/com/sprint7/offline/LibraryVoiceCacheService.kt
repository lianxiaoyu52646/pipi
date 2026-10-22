package com.sprint7.offline

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.Process
import android.os.StatFs
import android.database.sqlite.SQLiteDatabaseCorruptException
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import com.k2fsa.sherpa.onnx.OfflineTts
import com.k2fsa.sherpa.onnx.OfflineTtsConfig
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsKokoroModelConfig
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

/** Fully native, user-initiated foreground batch job. Does not depend on WebView or screen-on state.
 *  Clips use *exactly* the same text, PCM envelope and key as ArticleVoiceEngine.
 *  No network or model download. Pause is cooperative between synthesis calls.
 */
class LibraryVoiceCacheService : Service() {
    companion object {
        const val ACTION_START="com.sprint7.offline.CACHE_START"
        const val ACTION_PAUSE="com.sprint7.offline.CACHE_PAUSE"
        const val ACTION_CLEAR="com.sprint7.offline.CACHE_CLEAR"
        const val ACTION_RESTORE="com.sprint7.offline.CACHE_RESTORE"
        private const val TAG="PipiVoiceCache"
        private const val CHANNEL="pipi_offline_voice_cache"
        private const val NOTIFICATION=851
        private const val PREF="pipi_library_voice_cache"
        private const val MIN_FREE_BYTES=256L*1024L*1024L
        private const val DESIRED="user_wants_continuous_cache"
        private val running=AtomicBoolean(false)
        /** A status query is intentionally read-only: checking progress cannot pause a job. */
        @JvmStatic fun isActive(): Boolean = running.get()
        @JvmStatic fun shouldResume(context: Context): Boolean = VoiceCacheRecovery.desired(context)
        fun status(context: Context): String {
            val current = VoiceCacheRecovery.status(context)
                ?: return "{\"state\":\"idle\",\"done\":0,\"total\":0}"
            val wanted = VoiceCacheRecovery.desired(context)
            val state = current.optString("state")
            val age = System.currentTimeMillis() - current.optLong("updatedAt", 0L)
            if (wanted && (state == "running" || state == "retrying") && age > 90_000L) {
                current.put("state", "recovering")
                current.put("error", "后台服务心跳超过90秒未更新；恢复闹钟和前台服务正在尝试续接")
            }
            return current.toString()
        }
        fun cacheFolder(context: Context)=File(context.filesDir,"pipi-kokoro-library-v1")
    }
    @Volatile private var pauseRequested=false
    private var wake: PowerManager.WakeLock?=null
    private var synthesisThread: Thread?=null
    @Volatile private var lastDone=0
    @Volatile private var lastTotal=0
    private var lastBook=""
    private var lastChapter=0
    private var lastSpeaker=3
    private var lastSpeed=1f
    // Progress must distinguish model initialization from synthesis, and be
    // observable even when the whole-book percentage remains below 1%.
    @Volatile private var lastPhase="idle"
    private var lastChapterDone=0
    private var lastChapterTotal=0
    @Volatile private var indexingScanned=0
    @Volatile private var indexingTotal=0
    @Volatile private var phaseStartedAt=0L
    private var lastPublishedAt=0L
    @Volatile private var lastProgressAt=0L // only completed / verified clips count as progress
    @Volatile private var lastWrittenAt=0L  // a new PCM file was really written
    @Volatile private var activeSynthesisAt=0L
    @Volatile private var activeSynthesisChars=0
    @Volatile private var stallWarningAt=0L
    private var monitorThread: Thread?=null
    private val STALL_WARNING_MS=5L*60L*1000L
    private val WATCHDOG_RECYCLE_MS=12L*60L*1000L
    @Volatile private var lastNativeWorkAt=0L
    @Volatile private var activeWriteAt=0L
    @Volatile private var lastError=""
    private var autoRestarts=0
    private var lastRestartReason=""
    private var completedStartAt=0L
    @Volatile private var newlyGeneratedClips=0
    @Volatile private var newlyGeneratedBytes=0L
    private fun stage(phase:String) {
        if(lastPhase!=phase) {
            lastPhase=phase
            phaseStartedAt=System.currentTimeMillis()
            publish("running")
        }
    }
    private fun prefs()=getSharedPreferences(PREF,MODE_PRIVATE)
    @Synchronized private fun publish(state:String, error:String="") {
        if (error.isNotBlank()) lastError = error
        if (state == "finished" || state == "paused") lastError = ""
        val displayedError = if (error.isNotBlank()) error else lastError
        val json=JSONObject().put("state",state).put("done",lastDone).put("total",lastTotal)
            .put("book",lastBook).put("chapter",lastChapter).put("speaker",lastSpeaker)
            .put("speed",lastSpeed).put("error",displayedError)
            .put("phase",lastPhase).put("chapterDone",lastChapterDone)
            .put("chapterTotal",lastChapterTotal).put("indexingScanned",indexingScanned)
            .put("indexingTotal",indexingTotal).put("phaseStartedAt",phaseStartedAt)
            .put("lastProgressAt",lastProgressAt)
            .put("lastWrittenAt",lastWrittenAt)
            .put("activeSynthesisAt",activeSynthesisAt)
            .put("activeSynthesisChars",activeSynthesisChars)
            .put("lastNativeWorkAt",lastNativeWorkAt)
            .put("activeWriteAt",activeWriteAt)
            .put("startedAt",completedStartAt)
            .put("newClips",newlyGeneratedClips)
            .put("newBytes",newlyGeneratedBytes)
            .put("autoRestarts",autoRestarts)
            .put("lastRestartReason",lastRestartReason)
            .put("clipsPerHour",if(completedStartAt>0L)
                newlyGeneratedClips.toLong()*3_600_000L / maxOf(1L,System.currentTimeMillis()-completedStartAt) else 0L)
            .put("updatedAt",System.currentTimeMillis())
        // Durable and cross-process readable; UI and watchdog never infer work
        // from a CSS animation or the stale main-process SharedPreferences cache.
        VoiceCacheRecovery.publish(this,json)
        prefs().edit().putString("status",json.toString()).apply()
        lastPublishedAt=System.currentTimeMillis()
        val title=when(state){"running"->"皮皮 · 离线语音缓存中";"paused"->"皮皮 · 缓存已暂停";"finished"->"皮皮 · 缓存完成";"error"->"皮皮 · 缓存异常";else->"皮皮 · 离线语音缓存"}
        val percent=if(lastTotal>0) (lastDone.toLong()*100/lastTotal).toInt() else 0
        val manager=getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL,"皮皮离线语音预生成",NotificationManager.IMPORTANCE_LOW))
        val open=PendingIntent.getActivity(this,0,Intent(this,MainActivity::class.java),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val toggle=if(state=="running") ACTION_PAUSE else ACTION_START
        val toggleLabel=if(state=="running") "暂停" else "继续"
        val action=PendingIntent.getService(this,1,Intent(this,LibraryVoiceCacheService::class.java).setAction(toggle)
            .putExtra("speaker",lastSpeaker).putExtra("speed",lastSpeed),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val notification=Notification.Builder(this,CHANNEL).setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle(title).setContentText("$lastBook · 第${lastChapter}章 · $lastPhase · $percent% ($lastDone/$lastTotal)")
            .setProgress(lastTotal,lastDone,false).setContentIntent(open).setOngoing(state=="running")
            .addAction(Notification.Action.Builder(null,toggleLabel,action).build()).build()
        try {manager.notify(NOTIFICATION,notification)} catch (_: SecurityException) { /* FGS still runs if notification permission was denied. */ }
    }
    private fun foreground() {
        val manager=getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL,"皮皮离线语音预生成",NotificationManager.IMPORTANCE_LOW))
        val n=Notification.Builder(this,CHANNEL).setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle("皮皮 · 准备离线语音").setContentText("正在启动缓存任务").build()
        if(Build.VERSION.SDK_INT>=34) startForeground(NOTIFICATION,n,ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        else startForeground(NOTIFICATION,n)
    }
    override fun onBind(intent:Intent?):IBinder?=null

    private fun wantsCache(): Boolean = VoiceCacheRecovery.desired(this)
    private fun rememberDesired(wants:Boolean) {
        prefs().edit().putBoolean(DESIRED,wants).commit()
        VoiceCacheRecovery.request(this,wants,lastSpeaker,lastSpeed)
    }

    override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int {
        when(intent?.action) {
            ACTION_PAUSE -> {
                Log.i(TAG,"User manually requested pause")
                // Only the explicit Pause button / notification action writes this flag.
                rememberDesired(false)
                pauseRequested=true
                if (!running.get()) { lastPhase="paused";publish("paused");stopSelf() }
                else {lastPhase="stopping";publish("running","已收到暂停指令，等待当前合成结束")}
                return START_NOT_STICKY
            }
            ACTION_CLEAR -> {
                // A delete attempt must not silently pause an existing cache job.
                if (running.get() || wantsCache()) {
                    publish("running","请先手动暂停缓存，再删除已缓存的音频")
                } else {
                    cacheFolder(this).deleteRecursively()
                    VoiceCacheIndex.deleteAll(this)
                    lastDone=0;lastTotal=0;lastBook="";lastPhase="idle"
                    publish("idle");stopSelf()
                }
                return START_NOT_STICKY
            }
            ACTION_START -> {
                Log.i(TAG,"User started or resumed cache")
                val speaker=intent.getIntExtra("speaker",3).coerceIn(0,10)
                val speed=intent.getFloatExtra("speed",1f).let{if(it.isFinite())it.coerceIn(.7f,1.3f) else 1f}
                // Persist parameters so Android's sticky restart does not reset voice settings.
                lastSpeaker=speaker;lastSpeed=speed
                prefs().edit().putBoolean(DESIRED,true).putInt("speaker",speaker)
                    .putFloat("speed",speed).commit()
                VoiceCacheRecovery.request(this,true,speaker,speed)
                startWorker(speaker,speed,false)
                return START_STICKY
            }
            // START_STICKY passes a null Intent after Android re-creates a killed service.
            null, ACTION_RESTORE -> {
                Log.i(TAG,"Android service restored; will resume only if user requested continuous cache")
                if (!wantsCache()) { stopSelf();return START_NOT_STICKY }
                val (speaker,speed)=VoiceCacheRecovery.parameters(this)
                VoiceCacheRecovery.request(this,true,speaker,speed)
                startWorker(speaker,speed,true)
                return START_STICKY
            }
            else -> { stopSelf();return START_NOT_STICKY }
        }
    }

    private fun startWorker(speaker:Int,speed:Float,autoRestore:Boolean) {
        if (!running.compareAndSet(false,true)) {
            Log.i(TAG,"Ignoring duplicate start; synthesis worker still active (no unsafe second Kokoro session)")
            return
        }
        pauseRequested=false
        lastSpeaker=speaker;lastSpeed=speed
        // UI sees the last durable checkpoint immediately, even during recovery.
        // The SQLite index will replace these numbers with verified disk data.
        val previous=VoiceCacheRecovery.status(this)
        val sameTask=autoRestore || (previous?.optBoolean("wanted",false)==true &&
            previous.optInt("speaker",speaker)==speaker &&
            previous.optDouble("speed",speed.toDouble()).toFloat()==speed)
        lastBook=previous?.optString("book") ?: ""
        lastChapter=previous?.optInt("chapter") ?: 0
        lastChapterDone=previous?.optInt("chapterDone") ?: 0
        lastChapterTotal=previous?.optInt("chapterTotal") ?: 0
        indexingScanned=0;indexingTotal=0
        lastDone=previous?.optInt("done") ?: 0
        lastTotal=previous?.optInt("total") ?: 0
        lastPhase="resuming";phaseStartedAt=System.currentTimeMillis()
        lastProgressAt=previous?.optLong("lastProgressAt") ?: 0L
        lastWrittenAt=previous?.optLong("lastWrittenAt") ?: 0L
        lastError=""
        autoRestarts=(if(sameTask)previous?.optInt("autoRestarts") ?: 0 else 0)+(if(autoRestore && previous?.optString("state")!="recovering")1 else 0)
        lastRestartReason=if(autoRestore)previous?.optString("error")?.takeIf{it.isNotBlank()}
            ?: "Android后台服务重新启动" else if(sameTask)previous?.optString("lastRestartReason") ?: "" else ""
        lastNativeWorkAt=System.currentTimeMillis()
        completedStartAt=(if(sameTask)previous?.optLong("startedAt") ?: 0L else 0L).takeIf{it>0} ?: System.currentTimeMillis()
        newlyGeneratedClips=if(sameTask)previous?.optInt("newClips") ?: 0 else 0
        newlyGeneratedBytes=if(sameTask)previous?.optLong("newBytes") ?: 0L else 0L
        activeSynthesisAt=0L;activeSynthesisChars=0;stallWarningAt=0L
        try {
            foreground()
            publish("running")
            synthesisThread=thread(name="pipi-library-voice-precache") { execute() }
            monitorThread=thread(isDaemon=true,name="pipi-cache-stall-monitor") { monitorProgress() }
        }catch(e:Exception){
            running.set(false)
            lastPhase="error";publish("error","前台服务启动失败：${e.message}")
            stopSelf()
        }
    }

    /** Never start a second native Kokoro job when JNI is possibly blocked.
     *  Warn based on real completed files, not the repeating CSS animation.
     */
    private fun monitorProgress() {
        while (running.get()) {
            try { Thread.sleep(20_000L) } catch (_: InterruptedException) { return }
            if (!running.get()) continue
            val now=System.currentTimeMillis()
            // Manual Pause must also work if the native call will never return.
            // Only :voice_cache is terminated, and desired=false prevents restart.
            if (!stillWanted()) {
                if ((activeSynthesisAt>0L || lastPhase=="loading_model") &&
                    now - maxOf(activeSynthesisAt,phaseStartedAt) > 30_000L) {
                    lastPhase="paused";publish("paused")
                    Process.killProcess(Process.myPid())
                    return
                }
                continue
            }
            // A live service is not proof that audio is being written. The UI
            // receives a separate verified-output timestamp and an explicit state.
            if(lastPhase=="generating" && lastTotal>lastDone && lastWrittenAt>0L &&
                now-lastWrittenAt>5L*60L*1000L && now-lastNativeWorkAt>5L*60L*1000L) {
                lastError="缓存服务仍运行，但5分钟无新音频且合成没有活动；看门狗正在检查自动恢复"
            }
            // Real service heartbeats (unrelated to new audio) enable another
            // process to distinguish a healthy worker from a vanished service.
            publish("running")
            val nativeHang = (lastPhase == "generating" && activeSynthesisAt > 0L &&
                now - lastNativeWorkAt > WATCHDOG_RECYCLE_MS)
            val modelHang = lastPhase == "loading_model" &&
                now - phaseStartedAt > WATCHDOG_RECYCLE_MS
            val writeHang = activeWriteAt > 0L && now - activeWriteAt > WATCHDOG_RECYCLE_MS
            val workHang = lastPhase=="generating" &&
                now - maxOf(lastNativeWorkAt,lastProgressAt,lastWrittenAt) > WATCHDOG_RECYCLE_MS
            val scanHang = lastPhase=="scanning" && now-phaseStartedAt > 15L*60L*1000L
            if (nativeHang || modelHang || writeHang || workHang || scanHang) {
                val kind = when {
                    nativeHang -> "Kokoro原生合成超时"
                    modelHang -> "Kokoro模型加载超时"
                    writeHang -> "音频文件写入超时"
                    scanHang -> "缓存扫描超时"
                    else -> "生成线程长时间无真实进展"
                }
                Log.e(TAG,"$kind; recycling isolated :voice_cache process for automatic restart")
                lastPhase="recovering"
                // Persist *before* terminating the isolated native process.
                autoRestarts += 1
                lastRestartReason = kind
                publish("recovering","$kind，后台将重启独立语音缓存进程并从已完成片段续接")
                // This SERVICE runs in :voice_cache, never in the UI process.
                // A JNI call cannot reliably be interrupted in-process; killing
                // ONLY this dedicated process frees the deadlocked native model.
                VoiceCacheRecovery.schedule(this,35_000L)
                Process.killProcess(Process.myPid())
                return
            }
            val stalledFor=now-maxOf(lastProgressAt,phaseStartedAt)
            if (lastTotal>0 && lastDone<lastTotal &&
                (lastPhase=="generating" || lastPhase=="loading_model") &&
                stalledFor>=STALL_WARNING_MS && now-stallWarningAt>=60_000L) {
                stallWarningAt=now
                val message=if(activeSynthesisAt>0L)
                    "连续${stalledFor/60000}分钟没有完成新片段；可能是Kokoro处理长句(${activeSynthesisChars}字)耗时或原生合成卡住。为避免同时启动两个大模型，不会强行并发重启；请查看日志"
                    else "连续${stalledFor/60000}分钟没有实际进度；正在检查模型占用和等待状态"
                Log.w(TAG,"Cache has no completed-clip progress for ${stalledFor/1000}s; phase=$lastPhase chars=$activeSynthesisChars")
                publish("running",message)
            }
        }
    }

    private fun stillWanted() = !pauseRequested && wantsCache()
    private fun ensureAwake() {
        val previous=wake
        if(previous!=null) { if(!previous.isHeld) previous.acquire();return }
        val power=getSystemService(POWER_SERVICE) as PowerManager
        wake=power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"Pipi:OfflineBookVoice")
            .apply{acquire()}
    }
    private fun releaseWake() {
        wake?.let {if(it.isHeld)it.release()}
    }
    /** Keep the foreground task alive and automatically continue when space returns. */
    private fun waitForSpace():Boolean {
        while(stillWanted()) {
            val free=StatFs(filesDir.absolutePath).availableBytes
            if(free>=MIN_FREE_BYTES+8L*1024L*1024L) {
                ensureAwake()
                if(lastPhase=="waiting_storage")stage("generating")
                return true
            }
            if(lastPhase!="waiting_storage" || System.currentTimeMillis()-lastPublishedAt>25000L){
                lastPhase="waiting_storage";phaseStartedAt=System.currentTimeMillis()
                publish("running","剩余存储空间不足，请清理空间（至少保留约264MB）；空间恢复后自动继续，不会主动暂停")
            }
            // The job is explicitly user-initiated: keep CPU awake while polling.
            // Releasing the only wake lock here can make Thread.sleep(15s) last all night
            // with the screen off, although the UI still says "running".
            ensureAwake()
            for (tick in 0 until 15) {
                if(!stillWanted())return false
                Thread.sleep(1000)
            }
        }
        return false
    }
    private fun sleepUntilRetry(ms:Long) {
        // Do not release PARTIAL_WAKE_LOCK during timed retry; otherwise the
        // countdown itself can stall indefinitely after Android enters deep sleep.
        ensureAwake()
        var remaining=ms
        while(remaining>0 && stillWanted()) {
            val step=minOf(remaining,1000L)
            Thread.sleep(step)
            remaining-=step
        }
    }
    private fun execute(){
        var failures=0
        try {
            while(stillWanted()) {
                val previousWrittenAt=lastWrittenAt
                try {
                    ensureAwake()
                    val completed=cacheAll()
                    if (completed && stillWanted()) {
                        rememberDesired(false)
                        Log.i(TAG,"Voice cache finished")
                        lastPhase="finished";publish("finished")
                        return
                    }
                    break
                }catch(e:Throwable) {
                    if(!stillWanted())break
                    // Keep the user's task intent even for an invalid/missing
                    // installed resource. This requires an app/resource update;
                    // a status message is more honest than fake progress/finished.
                    val reason=e.message?.takeIf{it.isNotBlank()}?:e.javaClass.simpleName
                    if (e is LinkageError || e is IllegalArgumentException ||
                        reason.contains("缺少 Kokoro") || reason.contains("voice-library")) {
                        failures++
                        lastPhase="waiting_configuration"
                        publish("running","无法生成语音（模型或内容资源异常）：$reason。保留任务与已有音频，每30分钟检查一次；可能需要修复应用资源")
                        sleepUntilRetry(30L*60L*1000L)
                        continue
                    }
                    // A later failure after successful new clips should not be
                    // treated as a continuous failure streak.
                    if(lastWrittenAt>previousWrittenAt)failures=0
                    failures++
                    Log.w(TAG,"Cache synthesis interrupted; auto retry #$failures: $reason",e)
                    // Never silently clear the user's run-until-done choice. On
                    // low RAM / storage, back off longer and retry when resources
                    // recover. Existing verified clips are always reused.
                    val resourceProblem = e is OutOfMemoryError || reason.contains("写盘失败")
                    val delay=if (resourceProblem && failures>=3) 5L*60L*1000L
                        else minOf(120_000L,5_000L shl minOf(failures-1,4))
                    lastPhase="retrying";phaseStartedAt=System.currentTimeMillis()
                    publish("running","语音生成暂时失败：$reason；${delay/1000}秒后自动重试（第${failures}次）。已生成片段不删除，用户无需再点击开始")
                    sleepUntilRetry(delay)
                }
            }
            if(!stillWanted()) { lastPhase="paused";publish("paused") }
            else {
                lastPhase="recovering"
                publish("recovering","缓存线程意外退出，恢复闹钟将自动尝试重新拉起")
                VoiceCacheRecovery.schedule(this,35_000L)
            }
        }finally {
            releaseWake();wake=null
            running.set(false)
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
        }
    }

    /**
     * Fast durable resume: the SQLite queue stores each occurrence, keyed to the
     * unchanged v2 PCM format. A crashed native synthesizer is never allowed to
     * make the database claim a nonexistent clip was written.
     *
     * On first upgrade / book-content change a ONE-TIME full import validates old
     * files. Every subsequent restore reads one indexed pending row at a time;
     * no repeated 83k-file scan on every start/retry.
     */
    private fun cacheAll():Boolean {
        var model:OfflineTts?=null
        val disk=NarrationAudioCache(cacheFolder(this),Long.MAX_VALUE,Int.MAX_VALUE)
        var index=VoiceCacheIndex(this,lastSpeaker,lastSpeed)
        index.setVoice(lastSpeaker,lastSpeed)
        try {
            stage("resuming")
            var reused=false
            var repaired=false
            while (stillWanted()) {
                try {
                    reused=index.prepare(this,disk,{stillWanted()}){done,total->
                        // Index preparation is transactional. Scan counts are NOT
                        // committed completed clips until the database succeeds.
                        indexingScanned=done;indexingTotal=total
                        if(System.currentTimeMillis()-lastPublishedAt>1800L) {
                            lastPhase="indexing";publish("running")
                        }
                    }
                    break
                } catch(e:SQLiteDatabaseCorruptException) {
                    if(repaired) throw e
                    // Repair the INDEX only. The old PCM cache remains intact,
                    // and a one-time full validation reconstructs accurate state.
                    repaired=true
                    index.close()
                    VoiceCacheIndex.deleteFor(this,lastSpeaker,lastSpeed)
                    lastPhase="indexing"
                    publish("running","缓存索引损坏，正在自动重建；已缓存的音频不会删除")
                    index=VoiceCacheIndex(this,lastSpeaker,lastSpeed)
                    index.setVoice(lastSpeaker,lastSpeed)
                }
            }
            if(!stillWanted())return false
            val snapshot=index.counts()
            lastDone=snapshot.done;lastTotal=snapshot.total
            indexingScanned=0;indexingTotal=0
            if(!reused && snapshot.done>0)lastProgressAt=System.currentTimeMillis()
            lastPhase=if(reused)"resuming" else "index_ready"
            publish("running")
            var generatedSinceNotice=0
            var alreadyCheckedCompletion=false
            while(stillWanted()) {
                val job=index.next()
                if(job==null) {
                    if(alreadyCheckedCompletion) {
                        check(lastDone==lastTotal){"数据库状态与已生成片段不一致：$lastDone/$lastTotal"}
                        return true
                    }
                    stage("verifying")
                    publish("running")
                    val reopened=index.auditComplete(disk,{stillWanted()}){_,_->
                        if(System.currentTimeMillis()-lastPublishedAt>10_000L)publish("running")
                    }
                    val actual=index.counts()
                    lastDone=actual.done;lastTotal=actual.total
                    if(reopened>0) {
                        Log.w(TAG,"Final integrity audit re-queued $reopened missing occurrences")
                        publish("running","终检发现${reopened}段缺失/损坏，正在自动补齐")
                        alreadyCheckedCompletion=false
                        continue
                    }
                    alreadyCheckedCompletion=true
                    return true
                }
                alreadyCheckedCompletion=false
                lastBook=job.book
                lastChapter=job.chapter
                lastChapterTotal=job.chapterTotal
                lastChapterDone=job.chapterIndex-1
                stage("generating")
                if(!stillWanted())return false
                // A file may have appeared since the queue was indexed: reader
                // and offline precache share the same content-addressed folder.
                if(disk.has(job.key)) {
                    val added=index.complete(job.key)
                    lastDone+=added
                    lastProgressAt=System.currentTimeMillis()
                    lastChapterDone=job.chapterIndex
                    if(System.currentTimeMillis()-lastPublishedAt>1500L) publish("running")
                    continue
                }
                if(!waitForSpace())return false
                if(model==null) {
                    stage("waiting_model")
                    if(!stillWanted())return false
                    stage("loading_model")
                    model=loadModel()
                    lastNativeWorkAt=System.currentTimeMillis()
                    stage("generating")
                }
                val text=job.text
                activeSynthesisAt=System.currentTimeMillis()
                activeSynthesisChars=text.length
                Log.d(TAG,"synth begin book=${job.book} ch=${job.chapter} segment=${job.chapterIndex}/${job.chapterTotal} chars=${text.length}")
                val pieces=NarrationSynthesisPlan.pieces(text)
                val samples=try {
                    val blocks=ArrayList<FloatArray>(pieces.size)
                    var sampleCount=0L
                    for(piece in pieces) {
                        if(!stillWanted())return false
                        activeSynthesisAt=System.currentTimeMillis()
                        activeSynthesisChars=piece.length
                        val audio=model.generate(piece,lastSpeaker,lastSpeed).samples
                        if(audio.isEmpty())throw IllegalStateException("Kokoro返回空音频")
                        sampleCount+=audio.size.toLong()
                        if(sampleCount>model.sampleRate().toLong()*300L)
                            throw IllegalStateException("单句超过5分钟音频缓存上限")
                        blocks.add(audio)
                        lastNativeWorkAt=System.currentTimeMillis()
                    }
                    val joined=FloatArray(sampleCount.toInt())
                    var pos=0
                    for(block in blocks){System.arraycopy(block,0,joined,pos,block.size);pos+=block.size}
                    joined
                }finally {activeSynthesisAt=0L;activeSynthesisChars=0}
                if(!stillWanted())return false
                val smooth=NarrationPcmPacing.smooth(samples,model.sampleRate(),text)
                if(smooth.isEmpty())throw IllegalStateException("语音合成返回空音频")
                val rate=model.sampleRate()
                require(smooth.size.toLong()<=rate.toLong()*300L){
                    "原著片段过长，超过5分钟缓存上限：${job.book} 第${job.chapter}章第${job.chapterIndex}段，请检查原著句子切分"
                }
                val pcm=ShortArray(smooth.size){i->(smooth[i].coerceIn(-1f,1f)*32767).toInt().toShort()}
                activeWriteAt=System.currentTimeMillis()
                try {
                    if(!disk.put(job.key,pcm,rate)) {
                        throw IllegalStateException("语音片段写盘失败(采样点=${pcm.size}，采样率=$rate)，检查存储空间和缓存片段长度")
                    }
                    check(disk.has(job.key)){"语音片段写入后校验失败，将自动重试"}
                    // The PCM file is durably closed and validated BEFORE this
                    // transaction increments completed occurrences.
                    val added=index.complete(job.key)
                    lastDone+=added
                    lastProgressAt=System.currentTimeMillis()
                    lastWrittenAt=lastProgressAt
                    newlyGeneratedClips++
                    newlyGeneratedBytes+=pcm.size.toLong()*2L+16L
                    lastError=""
                }finally {activeWriteAt=0L}
                lastChapterDone=job.chapterIndex
                generatedSinceNotice++
                if(generatedSinceNotice>=5 || System.currentTimeMillis()-lastPublishedAt>=1300L) {
                    publish("running");generatedSinceNotice=0
                }
            }
            return false
        }finally {
            try{model?.free()}catch(_:Throwable){}
            index.close()
        }
    }
    private fun loadModel():OfflineTts {
        val prefix="tts/kokoro-int8-en-v0_19"
        val content=assets.list(prefix)?.toSet()?: emptySet()
        check(content.containsAll(listOf("model.int8.onnx","voices.bin","tokens.txt","espeak-ng-data"))) { "缺少 Kokoro 模型或音素文件" }
        val root=File(noBackupFilesDir,"pipi-tts-kokoro-espeak-v1")
        val dir=File(root,"espeak-ng-data")
        if(!File(root,".complete").isFile()||(dir.listFiles()?.size?:0)<5) {
            root.deleteRecursively();root.mkdirs();copyTree("$prefix/espeak-ng-data",dir)
            File(root,".complete").writeText("1")
        }
        return OfflineTts(assetManager=assets,config=OfflineTtsConfig(model=OfflineTtsModelConfig(
            kokoro=OfflineTtsKokoroModelConfig(model="$prefix/model.int8.onnx",voices="$prefix/voices.bin",tokens="$prefix/tokens.txt",dataDir=dir.absolutePath),
            numThreads=minOf(4,maxOf(2,Runtime.getRuntime().availableProcessors()-1)),provider="cpu"),maxNumSentences=1))
    }
    private fun copyTree(path:String,target:File) {
        val items=assets.list(path)?:emptyArray()
        if(items.isEmpty()){target.parentFile?.mkdirs();assets.open(path).use{a->FileOutputStream(target).use{b->a.copyTo(b)}}}
        else {target.mkdirs();items.forEach{copyTree("$path/$it",File(target,it))}}
    }
}
