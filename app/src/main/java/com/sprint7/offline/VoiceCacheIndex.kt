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
        db.execSQL("CREATE TABLE IF NOT EXISTS failures (cache_key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, last_error TEXT NOT NULL, failed_at INTEGER NOT NULL, retry_after INTEGER NOT NULL)")
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
        // Existing V5.12.15 databases do not yet contain this auxiliary table.
        // Create it BEFORE any rebuild transaction that may clear old failure rows.
        ensureFailures()
        val expected=signature(context)
        readableDatabase.rawQuery("SELECT signature FROM meta WHERE id=1",null).use { c ->
            if (c.moveToFirst() && c.getString(0)==expected) return true
        }
        val books=JSONArray(context.assets.open("voice-library/index.json").bufferedReader().use{it.readText()})
        val expectedTotal=(0 until books.length()).sumOf { books.getJSONObject(it).getInt("sentences") }
        val db=writableDatabase
        // This table is created on existing v1 databases without dropping validated queues.
        // Each committed batch persists its cursor atomically with the rows.
        db.execSQL("CREATE TABLE IF NOT EXISTS import_state(id INTEGER PRIMARY KEY CHECK(id=1), signature TEXT NOT NULL, total INTEGER NOT NULL, processed INTEGER NOT NULL, verified INTEGER NOT NULL)")
        var checkpoint=0;var verified=0
        db.rawQuery("SELECT signature,total,processed,verified FROM import_state WHERE id=1",null).use { c ->
            if(c.moveToFirst() && c.getString(0)==expected && c.getInt(1)==expectedTotal) {
                checkpoint=c.getInt(2);verified=c.getInt(3)
            }
        }
        // A committed cursor must correspond exactly to the rows persisted.
        val rows=db.rawQuery("SELECT COUNT(*) FROM segments",null).use { c -> c.moveToFirst();c.getInt(0) }
        if(checkpoint !in 0..expectedTotal || rows!=checkpoint) checkpoint=0
        if(checkpoint==0){
            db.beginTransaction()
            try{
                db.delete("segments",null,null)
                db.delete("meta",null,null)
                db.delete("import_state",null,null)
                db.execSQL("INSERT INTO import_state(id,signature,total,processed,verified) VALUES(1,?,?,0,0)",arrayOf(expected,expectedTotal))
                db.setTransactionSuccessful()
            }finally{db.endTransaction()}
            verified=0
        }
        val verifiedKeys=HashMap<String,Boolean>(4000)
        var seq=0;var nextBatch=checkpoint;var inTransaction=false
        val insert=db.compileStatement("INSERT INTO segments(seq,cache_key,text,book,chapter,chapter_index,chapter_total,ready) VALUES(?,?,?,?,?,?,?,?)")
        fun commitBatch(){
            if(!inTransaction)return
            db.execSQL("UPDATE import_state SET processed=?, verified=? WHERE id=1",arrayOf(seq,verified))
            db.setTransactionSuccessful()
            db.endTransaction()
            inTransaction=false
            onScan(verified,expectedTotal)
            verifiedKeys.clear()
        }
        try {
            for(i in 0 until books.length()){
                if(!shouldContinue())throw InterruptedException("缓存索引建立中断")
                val b=books.getJSONObject(i)
                val name=b.getString("title")
                val sections=JSONObject(context.assets.open("voice-library/${b.getString("id")}.json")
                    .bufferedReader().use{it.readText()}).getJSONArray("sections")
                for(j in 0 until sections.length()){
                    val texts=sections.getJSONObject(j).getJSONArray("sentences")
                    for(k in 0 until texts.length()){
                        if(!shouldContinue())throw InterruptedException("缓存索引建立中断")
                        // Already indexed sentences only need their ordinal counted;
                        // NEVER reread/revalidate all their PCM files during resume.
                        if(seq<checkpoint){seq++;continue}
                        if(!inTransaction){db.beginTransaction();inTransaction=true}
                        val text=texts.getString(k)
                        val key=disk.key(text,voiceSpeaker,voiceSpeed)
                        val ready=verifiedKeys.getOrPut(key){disk.has(key)}
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
                        if(seq-nextBatch>=1000){commitBatch();nextBatch=seq}
                    }
                }
            }
            commitBatch()
            check(seq==expectedTotal){"语音索引与原著片段数量不一致：$seq/$expectedTotal"}
            db.beginTransaction()
            try{
                db.execSQL("INSERT OR REPLACE INTO meta(id,signature,total,done) VALUES(1,?,?,?)",arrayOf(expected,seq,verified))
                db.delete("import_state",null,null)
                db.execSQL("DELETE FROM failures")
                db.setTransactionSuccessful()
            }finally{db.endTransaction()}
        }finally{
            if(inTransaction)db.endTransaction() // interrupted batch rolls back; previous batches survive
            insert.close()
        }
        onScan(verified,seq)
        return false
    }

    private var voiceSpeaker=3
    private var voiceSpeed=1f
    fun setVoice(speaker:Int,speed:Float) {voiceSpeaker=speaker;voiceSpeed=speed}

    @Volatile private var failuresReady=false
    @Synchronized private fun ensureFailures() {
        if(failuresReady)return
        writableDatabase.execSQL("CREATE TABLE IF NOT EXISTS failures (cache_key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, last_error TEXT NOT NULL, failed_at INTEGER NOT NULL, retry_after INTEGER NOT NULL)")
        failuresReady=true
    }
    /** Failure cooldown applies per content hash, not per occurrence. Unfinished rows stay unfinished. */
    fun clearFailure(key:String) {
        ensureFailures()
        writableDatabase.execSQL("DELETE FROM failures WHERE cache_key=?",arrayOf(key))
    }
    fun recordFailure(key:String, why:String, now:Long=System.currentTimeMillis()):Int {
        ensureFailures()
        val db=writableDatabase
        db.beginTransaction()
        try {
            val previous=db.rawQuery("SELECT attempts FROM failures WHERE cache_key=?",arrayOf(key)).use { c ->
                if(c.moveToFirst())c.getInt(0) else 0
            }
            val attempts=previous+1
            val delay=when { attempts==1->20_000L; attempts==2->120_000L; attempts==3->600_000L; else->minOf(6L*60*60*1000,1_800_000L*(1L shl minOf(attempts-4,3))) }
            db.execSQL("INSERT OR REPLACE INTO failures(cache_key,attempts,last_error,failed_at,retry_after) VALUES(?,?,?,?,?)",
                arrayOf(key,attempts,why.take(180),now,now+delay))
            db.setTransactionSuccessful()
            return attempts
        }finally{db.endTransaction()}
    }
    fun pendingCooldownMs(now:Long=System.currentTimeMillis()):Long {
        ensureFailures()
        return readableDatabase.rawQuery("SELECT MIN(f.retry_after) FROM segments s JOIN failures f ON f.cache_key=s.cache_key WHERE s.ready=0 AND f.retry_after>?",arrayOf(now.toString())).use { c ->
            if(c.moveToFirst()&&!c.isNull(0))(c.getLong(0)-now).coerceAtLeast(1000L) else 0L
        }
    }
    fun deferredCount(now:Long=System.currentTimeMillis()):Int {
        ensureFailures()
        return readableDatabase.rawQuery("SELECT COUNT(*) FROM segments s JOIN failures f ON f.cache_key=s.cache_key WHERE s.ready=0 AND f.retry_after>?",arrayOf(now.toString())).use { c->c.moveToFirst();c.getInt(0) }
    }
    fun next(now:Long=System.currentTimeMillis()): Job? {
        ensureFailures()
        return readableDatabase.rawQuery("SELECT s.cache_key,s.text,s.book,s.chapter,s.chapter_index,s.chapter_total FROM segments s LEFT JOIN failures f ON f.cache_key=s.cache_key WHERE s.ready=0 AND (f.retry_after IS NULL OR f.retry_after<=?) ORDER BY s.seq LIMIT 1",arrayOf(now.toString())).use { c ->
            if(c.moveToFirst()) Job(c.getString(0),c.getString(1),c.getString(2),c.getInt(3),c.getInt(4),c.getInt(5)) else null
        }
    }
    /** A single verified PCM makes EVERY identical occurrence ready. */
    fun complete(key: String): Int {
        val db=writableDatabase
        db.beginTransaction()
        return try {
            val count=db.compileStatement("UPDATE segments SET ready=1 WHERE cache_key=? AND ready=0").use { statement ->
                statement.bindString(1,key);statement.executeUpdateDelete()
            }
            if(count>0) {
                db.execSQL("UPDATE meta SET done=done+? WHERE id=1", arrayOf(count))
                db.execSQL("DELETE FROM failures WHERE cache_key=?",arrayOf(key))
            }
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
                if(!disk.hasDeep(key))missing.add(key)
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
