package com.sprint7.offline

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build
import android.util.AtomicFile
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** Small bounded durable log; kept out of the 82k-item PCM and SQLite hot paths. */
internal object VoiceCacheDiagnostics {
    private const val MAX_EVENTS=32
    private const val FILE="pipi_voice_cache_diagnostics_v1.json"
    private fun atomic(context:Context)=AtomicFile(File(context.filesDir,FILE))
    @Synchronized fun record(context:Context, category:String, detail:String, key:String="") {
        try {
            val old=read(context)
            val events=old.optJSONArray("events")?:JSONArray()
            val recent=JSONArray()
            for(i in maxOf(0,events.length()-MAX_EVENTS+1) until events.length())recent.put(events.getJSONObject(i))
            recent.put(JSONObject().put("at",System.currentTimeMillis()).put("kind",category)
                .put("detail",detail.take(220)).put("key",key.take(16)))
            val a=atomic(context);val stream=a.startWrite()
            try {stream.write(JSONObject().put("events",recent).toString().toByteArray(Charsets.UTF_8));a.finishWrite(stream)}
            catch(e:Exception){a.failWrite(stream);throw e}
        }catch(_:Exception){ /* Diagnostics must never terminate a healthy cache job. */ }
    }
    fun read(context:Context):JSONObject=try{
        JSONObject(atomic(context).openRead().bufferedReader(Charsets.UTF_8).use{it.readText()})
    }catch(_:Exception){JSONObject().put("events",JSONArray())}

    fun latestProcessExit(context:Context, since:Long):JSONObject? {
        if(Build.VERSION.SDK_INT<30)return null
        return try {
            val am=context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val matching=am.getHistoricalProcessExitReasons(context.packageName,0,12)
                .filter { it.processName?.endsWith(":voice_cache")==true && it.timestamp>=since }
                .maxByOrNull{it.timestamp} ?:return null
            val why=when(matching.reason){
                ApplicationExitInfo.REASON_LOW_MEMORY->"系统低内存回收"
                ApplicationExitInfo.REASON_CRASH_NATIVE->"原生层崩溃"
                ApplicationExitInfo.REASON_CRASH->"进程异常崩溃"
                ApplicationExitInfo.REASON_ANR->"应用无响应(ANR)"
                ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE->"系统资源使用限制"
                ApplicationExitInfo.REASON_USER_REQUESTED->"用户或系统主动停止（可能由系统省电策略、后台清理或任务管理器触发）"
                ApplicationExitInfo.REASON_EXIT_SELF->"进程自行退出"
                else->"退出代码${matching.reason}"
            }
            JSONObject().put("at",matching.timestamp).put("reason",why)
                .put("rawReason",matching.reason)
                .put("importance",matching.importance).put("description",matching.description?:"")
                .put("process",matching.processName?:"")
        }catch(_:Exception){null}
    }
}
