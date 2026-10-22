package com.sprint7.offline

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import com.sprint7.offline.NarrationAudioCache
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest

/**
 * Durable per-voice work queue. Each occurrence has its own row; identical sentences
 * share one PCM key, and marking a key as complete marks every occurrence atomically.
 *
 * The index is an accelerator, never a replacement for the PCM file. On first use or
 * an asset change, old PCM files are validated and imported; newly written PCM is
 * validated before its DB transaction commits. On all-done, a final integrity audit
 * repairs unexpected externally removed/corrupt files.
 */
internal class VoiceCacheIndex(context: Context, speaker: Int, speed: Float) :
    SQLiteOpenHelper(context, dbName(speaker, speed), null, 1) {
    companion object {
        private const val PREFIX = "pipi_library_voice_queue_v1_"
        private fun dbName(speaker: Int, speed: Float) = "$PREFIX${speaker}_${speed.toRawBits()}.db"
        fun deleteFor(context: Context, speaker: Int, speed: Float) {
            context.deleteDatabase(dbName(speaker,speed))
        }
        fun deleteAll(context: Context) {
            context.databaseList().filter { it.startsWith(PREFIX) && it.endsWith(".db") }
                .forEach { context.deleteDatabase(it) }
        }
    }
    data class Job(val key: String, val text: String, val book: String,
                   val chapter: Int, val chapterIndex: Int, val chapterTotal: Int)
    data class Counts(val done: Int, val total: Int)

    init { setWriteAheadLoggingEnabled(true) }
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE meta (id INTEGER PRIMARY KEY CHECK (id=1), signature TEXT NOT NULL, total INTEGER NOT NULL, done INTEGER NOT NULL)")
        db.execSQL("CREATE TABLE segments (seq INTEGER PRIMARY KEY, cache_key TEXT NOT NULL, text TEXT NOT NULL, book TEXT NOT NULL, chapter INTEGER NOT NULL, chapter_index INTEGER NOT NULL, chapter_total INTEGER NOT NULL, ready INTEGER NOT NULL DEFAULT 0)")
        db.execSQL("CREATE INDEX segments_ready_seq ON segments(ready,seq)")
        db.execSQL("CREATE INDEX segments_key ON segments(cache_key)")
    }
    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        db.execSQL("DROP TABLE IF EXISTS segments")
        db.execSQL("DROP TABLE IF EXISTS meta")
        onCreate(db)
    }
    private fun digest(): MessageDigest = MessageDigest.getInstance("SHA-256")
    private fun signature(context: Context): String {
        val md=digest()
        // Hash the ACTUAL voice index and section content, not package version or
        // just the title/count: updates with the same number of sentences matter.
        val assets=context.assets
        val library=JSONArray(assets.open("voice-library/index.json").bufferedReader().use { it.readText() })
        md.update(library.toString().toByteArray(Charsets.UTF_8))
        for (i in 0 until library.length()) {
            val id=library.getJSONObject(i).getString("id")
            md.update(id.toByteArray(Charsets.UTF_8))
            assets.open("voice-library/$id.json").use { input ->
                val buffer=ByteArray(32*1024)
                while (true) {
                    val n=input.read(buffer)
                    if (n<0) break
                    md.update(buffer,0,n)
                }
            }
        }
        return md.digest().joinToString("") { "%02x".format(it) }
    }
    fun counts(): Counts = readableDatabase.rawQuery("SELECT done,total FROM meta WHERE id=1", null).use { c ->
        if (c.moveToFirst()) Counts(c.getInt(0),c.getInt(1)) else Counts(0,0)
    }
    fun hasIndex(): Boolean = readableDatabase.rawQuery("SELECT 1 FROM meta WHERE id=1",null).use { it.moveToFirst() }

    /** Returns true if an existing verified index was reused without any full file scan. */
    fun prepare(context: Context, disk: NarrationAudioCache, shouldContinue: () -> Boolean,
                onScan: (Int, Int) -> Unit): Boolean {
        val expected=signature(context)
        readableDatabase.rawQuery("SELECT signature FROM meta WHERE id=1",null).use { c ->
            if (c.moveToFirst() && c.getString(0)==expected) return true
        }
        val books=JSONArray(context.assets.open("voice-library/index.json").bufferedReader().use{it.readText()})
        val expectedTotal=(0 until books.length()).sumOf { books.getJSONObject(it).getInt("sentences") }
        val db=writableDatabase
        val verifiedKeys=HashMap<String,Boolean>(expectedTotal.coerceAtMost(100000))
        val insert=db.compileStatement("INSERT INTO segments(seq,cache_key,text,book,chapter,chapter_index,chapter_total,ready) VALUES(?,?,?,?,?,?,?,?)")
        var seq=0;var verified=0
        db.beginTransaction()
        try {
            db.delete("meta",null,null)
            db.delete("segments",null,null)
            for (i in 0 until books.length()) {
                if (!shouldContinue()) throw InterruptedException("缓存索引建立中断")
                val b=books.getJSONObject(i)
                val name=b.getString("title")
                val sections=JSONObject(context.assets.open("voice-library/${b.getString("id")}.json")
                    .bufferedReader().use{it.readText()}).getJSONArray("sections")
                for (j in 0 until sections.length()) {
                    val texts=sections.getJSONObject(j).getJSONArray("sentences")
                    for (k in 0 until texts.length()) {
                        if (!shouldContinue()) throw InterruptedException("缓存索引建立中断")
                        val text=texts.getString(k)
                        val key=disk.key(text,voiceSpeaker,voiceSpeed)
                        val ready=verifiedKeys.getOrPut(key) { disk.has(key) }
                        insert.clearBindings()
                        insert.bindLong(1,(seq+1).toLong())
                        insert.bindString(2,key)
                        insert.bindString(3,text)
                        insert.bindString(4,name)
                        insert.bindLong(5,(j+1).toLong())
                        insert.bindLong(6,(k+1).toLong())
                        insert.bindLong(7,texts.length().toLong())
                        insert.bindLong(8,if(ready)1L else 0L)
                        insert.executeInsert()
                        seq++
                        if(ready)verified++
                        if(seq%2000==0)onScan(verified,expectedTotal)
                    }
                }
            }
            check(seq==expectedTotal){"语音索引与原著片段数量不一致：$seq/$expectedTotal"}
            db.execSQL("INSERT INTO meta(id,signature,total,done) VALUES(1,?,?,?)",arrayOf(expected,seq,verified))
            db.setTransactionSuccessful()
        } finally {
            insert.close()
            db.endTransaction()
        }
        onScan(verified,seq)
        return false
    }

    private var voiceSpeaker=3
    private var voiceSpeed=1f
    fun setVoice(speaker:Int,speed:Float) {voiceSpeaker=speaker;voiceSpeed=speed}

    fun next(): Job? = readableDatabase.rawQuery("SELECT cache_key,text,book,chapter,chapter_index,chapter_total FROM segments WHERE ready=0 ORDER BY seq LIMIT 1",null).use { c ->
        if(c.moveToFirst()) Job(c.getString(0),c.getString(1),c.getString(2),c.getInt(3),c.getInt(4),c.getInt(5)) else null
    }
    /** A single verified PCM makes EVERY identical occurrence ready. */
    fun complete(key: String): Int {
        val db=writableDatabase
        db.beginTransaction()
        return try {
            val count=db.compileStatement("UPDATE segments SET ready=1 WHERE cache_key=? AND ready=0").use { statement ->
                statement.bindString(1,key);statement.executeUpdateDelete()
            }
            if(count>0)db.execSQL("UPDATE meta SET done=done+? WHERE id=1", arrayOf(count))
            db.setTransactionSuccessful()
            count
        } finally {db.endTransaction()}
    }
    private fun markMissing(key:String):Int {
        val db=writableDatabase
        db.beginTransaction()
        return try {
            val affected=db.compileStatement("UPDATE segments SET ready=0 WHERE cache_key=? AND ready=1").use { st ->
                st.bindString(1,key);st.executeUpdateDelete()
            }
            if(affected>0)db.execSQL("UPDATE meta SET done=done-? WHERE id=1",arrayOf(affected))
            db.setTransactionSuccessful()
            affected
        }finally {db.endTransaction()}
    }
    /** Only called when the queue becomes empty: missing or damaged files are repaired. */
    fun auditComplete(disk:NarrationAudioCache, shouldContinue:()->Boolean, onChecked:(Int,Int)->Unit):Int {
        val db=readableDatabase
        val total=counts().total
        var checked=0;var reopened=0
        // Iterate DISTINCT keys so duplicate sentences do not reread the same PCM.
        val missing=ArrayList<String>()
        db.rawQuery("SELECT DISTINCT cache_key FROM segments WHERE ready=1",null).use { cursor ->
            while(cursor.moveToNext()) {
                if(!shouldContinue())throw InterruptedException("校验已被暂停")
                val key=cursor.getString(0)
                if(!disk.has(key))missing.add(key)
                checked++
                if(checked%2000==0)onChecked(checked,total)
            }
        }
        for(key in missing) {
            if(!shouldContinue())throw InterruptedException("校验已被暂停")
            reopened+=markMissing(key)
        }
        onChecked(checked,total)
        return reopened
    }
}
