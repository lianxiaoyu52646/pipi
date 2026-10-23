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
import org.json.JSONObject

/** Foreground playback survives a screen lock and an Activity recreation.
 * Android can still kill the entire process under extreme memory pressure;
 * the reader's persisted bookmark is the recovery point in that case.
 */
class ArticlePlaybackService: Service() {
    companion object {
        const val ACTION_PLAY="com.sprint7.offline.ARTICLE_PLAY"
        const val ACTION_PAUSE="com.sprint7.offline.ARTICLE_PAUSE"
        const val ACTION_RESUME="com.sprint7.offline.ARTICLE_RESUME"
        const val ACTION_STOP="com.sprint7.offline.ARTICLE_STOP"
        private const val CHANNEL="pipi_article_reading"
        private const val NOTE_ID=861
        @Volatile private var engine: ArticleVoiceEngine?=null
        @Volatile private var instance: ArticlePlaybackService?=null
        @JvmStatic @Synchronized fun reconnectEngine(context: Context, callback: ArticleVoiceEngine.EventCallback): ArticleVoiceEngine {
            val current=engine
            if(current != null && current.isReading()){current.setEventCallback(callback);return current}
            current?.close()
            return ArticleVoiceEngine(context.applicationContext,callback).also { engine=it }
        }
        @JvmStatic fun detachCallback(reader: ArticleVoiceEngine?) { if(engine===reader)reader?.setEventCallback(null) }
        @JvmStatic fun onEngineEvent(event: JSONObject){
            val code=event.optString("code")
            val service=instance ?: return
            if(code=="article-paused"||code=="article-playing"||code=="article-audio-start"){
                service.refreshNotification()
            } else if(code=="article-batch-done"||code=="article-stopped"){
                if(code=="article-batch-done")engine?.stop()
                service.stopSelf()
            }
        }
        @JvmStatic fun hasActiveReading(): Boolean = engine?.isReading()==true
    }
    override fun onCreate(){super.onCreate();instance=this
        (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(
            NotificationChannel(CHANNEL,"皮皮 · 锁屏听书",NotificationManager.IMPORTANCE_LOW))
    }
    override fun onBind(intent:Intent?): IBinder?=null
    private fun action(name:String): PendingIntent {
        val it=Intent(this,ArticlePlaybackService::class.java).setAction(name)
        return PendingIntent.getService(this,name.hashCode(),it,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
    private fun notification():Notification {
        val paused=engine?.isPaused()==true
        val opening=PendingIntent.getActivity(this,0,Intent(this,MainActivity::class.java),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        return Notification.Builder(this,CHANNEL)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle("皮皮 · 离线原著朗读")
            .setContentText(if(paused) "已暂停，可从通知栏继续" else "锁屏后继续播放 · 完全离线")
            .setContentIntent(opening).setOngoing(true)
            .addAction(Notification.Action.Builder(android.R.drawable.ic_media_pause,if(paused) "继续" else "暂停",action(if(paused) ACTION_RESUME else ACTION_PAUSE)).build())
            .addAction(Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel,"停止",action(ACTION_STOP)).build())
            .build()
    }
    private fun refreshNotification(){try{(getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(NOTE_ID,notification())}catch(_:Exception){}}
    override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int{
        when(intent?.action){
            ACTION_PAUSE->{engine?.pause();refreshNotification()}
            ACTION_RESUME->{engine?.resume();refreshNotification()}
            ACTION_STOP->{engine?.stop();stopSelf();return START_NOT_STICKY}
            ACTION_PLAY->{
                if(Build.VERSION.SDK_INT>=29)startForeground(NOTE_ID,notification(),ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
                else startForeground(NOTE_ID,notification())
            }
        }
        return START_NOT_STICKY // user starts the narration explicitly
    }
    override fun onDestroy(){
        instance=null
        try{stopForeground(STOP_FOREGROUND_REMOVE)}catch(_:Exception){}
        // The foreground Activity may still reuse the same model instance.
        // An Activity recreation reattaches its callback; do not close here.
        super.onDestroy()
    }
}
