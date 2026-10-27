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
        const val MAX_AUTO_FAILURES = 8
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
        // Never drop a user's 83k-row index during a schema upgrade. Future
        // migrations must be explicit, transactional and backwards-compatible.
        // Failing closed leaves the existing DB/PCM intact for recovery.
        throw android.database.sqlite.SQLiteException("Unsupported voice-index migration $oldVersion -> $newVersion; cache preserved")
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

    /** One book is the unit of work; only its current chapter is imported when needed.
     * Existing V1 segment rows stay in the SAME per-voice SQLite DB and are adopted
     * without discarding verified PCM/ready flags. No global PCM scan on restart. */
    data class BookTask(val id:String,val title:String,val startSeq:Int,val endSeq:Int,
                        val chapters:Int,val indexedChapters:Int,val finished:Boolean)

    private fun manifest(context:Context):JSONArray = JSONArray(context.assets.open("voice-library/index.json")
        .bufferedReader().use { it.readText() })
    // The chapter plan was verified against all 20 original book JSON files at
    // APK build time. Runtime reads only this small manifest and one chapter.
    // Old book signatures use the same SHA-256 of original raw JSON bytes.
    private val chapterPlan: Map<String, JSONObject> by lazy {
        val manifest=JSONObject(appContext.assets.open("voice-library/chapter-manifest.json")
            .bufferedReader().use { it.readText() })
        require(manifest.getInt("version")==1) { "Unsupported chapter manifest" }
        val rows=manifest.getJSONArray("books")
        (0 until rows.length()).associate { i ->
            val row=rows.getJSONObject(i)
            row.getString("id") to row
        }
    }
    private val appContext=context.applicationContext
    private fun plan(id:String):JSONObject = chapterPlan[id] ?: error("Missing chapter plan: $id")
    private fun bookSignature(context:Context,id:String):String = plan(id).getString("sha256")
    private fun bookwiseSignature(context:Context):String {
        val data=context.assets.open("voice-library/index.json").use { it.readBytes() }
        return "bookwise_v2:"+digest().digest(data).joinToString(""){ "%02x".format(it) }
    }
    private fun createBookTasks(db:SQLiteDatabase) {
        db.execSQL("CREATE TABLE IF NOT EXISTS book_tasks(id TEXT PRIMARY KEY,title TEXT NOT NULL,start_seq INTEGER NOT NULL,end_seq INTEGER NOT NULL,chapters INTEGER NOT NULL,indexed_chapters INTEGER NOT NULL DEFAULT 0,signature TEXT NOT NULL DEFAULT '',finished INTEGER NOT NULL DEFAULT 0)")
        db.execSQL("CREATE INDEX IF NOT EXISTS books_start_seq ON book_tasks(start_seq)")
    }
    private fun createBookSnoozes(db:SQLiteDatabase) {
        // Independent from book_tasks, so V5.12.22 records upgrade in place.
        db.execSQL("CREATE TABLE IF NOT EXISTS book_snooze(book_id TEXT PRIMARY KEY, until_at INTEGER NOT NULL, reason TEXT NOT NULL)")
    }
    private fun sameBookLayout(db:SQLiteDatabase,books:JSONArray):Boolean {
        var expectedStart=1
        db.rawQuery("SELECT id,start_seq,end_seq,chapters FROM book_tasks ORDER BY start_seq",null).use { c ->
            for(i in 0 until books.length()) {
                if(!c.moveToNext())return false
                val b=books.getJSONObject(i)
                val end=expectedStart+b.getInt("sentences")-1
                if(c.getString(0)!=b.getString("id") || c.getInt(1)!=expectedStart ||
                    c.getInt(2)!=end || c.getInt(3)!=b.getInt("chapters"))return false
                expectedStart=end+1
            }
            return !c.moveToNext()
        }
    }
    private fun reconcileBookSignatures(db:SQLiteDatabase, shouldContinue:()->Boolean) {
        val changed=ArrayList<Pair<String,Pair<Int,Int>>>()
        db.rawQuery("SELECT id,start_seq,end_seq,signature,indexed_chapters,finished FROM book_tasks",null).use { c ->
            while(c.moveToNext()) {
                if(!shouldContinue())throw InterruptedException("书籍签名核验已暂停")
                val id=c.getString(0)
                if(c.getInt(4)>0 || c.getInt(5)!=0) {
                    // Missing signatures on indexed books are NOT trustworthy.
                    if(c.getString(3)!=bookSignature(appContext,id))
                        changed.add(id to (c.getInt(1) to c.getInt(2)))
                }
            }
        }
        if(changed.isEmpty())return
        db.beginTransaction()
        try {
            for((id,range) in changed) {
                val ready=db.rawQuery("SELECT COUNT(*) FROM segments WHERE ready=1 AND seq BETWEEN ? AND ?",
                    arrayOf(range.first.toString(),range.second.toString())).use { c->c.moveToFirst();c.getInt(0) }
                db.delete("segments","seq BETWEEN ? AND ?",arrayOf(range.first.toString(),range.second.toString()))
                db.execSQL("UPDATE book_tasks SET indexed_chapters=0,signature='',finished=0 WHERE id=?",arrayOf(id))
                db.execSQL("DELETE FROM book_snooze WHERE book_id=?",arrayOf(id))
                db.execSQL("UPDATE meta SET done=MAX(0,done-?) WHERE id=1",arrayOf(ready))
            }
            // A previous PCM scan is no longer authoritative after row deletion.
            db.execSQL("CREATE TABLE IF NOT EXISTS pcm_reconciliation (id INTEGER PRIMARY KEY CHECK(id=1), files_seen INTEGER NOT NULL)")
            db.execSQL("DELETE FROM pcm_reconciliation")
            db.setTransactionSuccessful()
        }finally {db.endTransaction()}
    }
    /** Legacy global queue is trusted ONLY when its old full-content signature matches.
     * The one-time migration hashes assets but never reads/rebuilds the 83k PCM files. */
    fun prepare(context:Context,disk:NarrationAudioCache,shouldContinue:()->Boolean,
                onScan:(Int,Int)->Unit):Boolean {
        ensureFailures()
        val books=manifest(context)
        val expectedTotal=(0 until books.length()).sumOf{books.getJSONObject(it).getInt("sentences")}
        val expected=bookwiseSignature(context)
        val db=writableDatabase
        createBookTasks(db)
        createBookSnoozes(db)
        val former=db.rawQuery("SELECT signature,total,done FROM meta WHERE id=1",null).use { c ->
            if(c.moveToFirst()) Triple(c.getString(0),c.getInt(1),c.getInt(2)) else null
        }
        val bookCount=db.rawQuery("SELECT COUNT(*) FROM book_tasks",null).use { c->c.moveToFirst();c.getInt(0) }
        if(former!=null && former.second==expectedTotal && bookCount==books.length() &&
            sameBookLayout(db,books) && former.first.startsWith("bookwise_v2:")) {
            // The manifest may change only a title or a book's content hash.
            // With identical sequence ranges, preserve every unaffected old
            // row and reconcile *only* books whose full text SHA differs.
            // Reconcile before committing the top-level manifest signature.
            // If a paused/corrupt migration fails, the old signature remains and
            // the next start cannot mistake a half-migrated index for current.
            reconcileBookSignatures(db,shouldContinue)
            if(former.first!=expected)
                db.execSQL("UPDATE meta SET signature=? WHERE id=1",arrayOf(expected))
            return true
        }
        if(!shouldContinue()) throw InterruptedException("缓存任务准备已暂停")
        val existingRows=db.rawQuery("SELECT COUNT(*) FROM segments",null).use {c->c.moveToFirst();c.getInt(0)}
        // Old V1 full import has no book_tasks rows; preserve its per-clip flags if
        // all content is identical to the currently bundled originals.
        val legacy=former!=null && !former.first.startsWith("bookwise_v2:") &&
            former.second==expectedTotal && existingRows==expectedTotal &&
            former.first==signature(context)
        if(!shouldContinue())throw InterruptedException("缓存任务准备已暂停")
        // Calculate per-book signatures once during migration; only the active
        // book file will be parsed during subsequent normal startup/resume.
        val signatures=if(legacy)(0 until books.length()).map { i ->
            if(!shouldContinue())throw InterruptedException("缓存任务准备已暂停")
            bookSignature(context,books.getJSONObject(i).getString("id"))
        } else emptyList()
        db.beginTransaction()
        try {
            db.delete("book_tasks",null,null)
            db.delete("book_snooze",null,null)
            // If an old index is stale, rebuild only its INDEX, never any PCM file.
            if(!legacy) {
                db.delete("segments",null,null)
                db.delete("failures",null,null)
            }
            db.execSQL("DROP TABLE IF EXISTS import_state")
            db.execSQL("DROP TABLE IF EXISTS pcm_reconciliation")
            var first=1
            for(i in 0 until books.length()) {
                val b=books.getJSONObject(i)
                val count=b.getInt("sentences")
                val ch=b.getInt("chapters")
                val id=b.getString("id")
                val ready=if(legacy)db.rawQuery("SELECT COUNT(*) FROM segments WHERE ready=0 AND seq BETWEEN ? AND ?",
                    arrayOf(first.toString(),(first+count-1).toString())).use {c->c.moveToFirst();c.getInt(0)==0} else false
                db.execSQL("INSERT INTO book_tasks(id,title,start_seq,end_seq,chapters,indexed_chapters,signature,finished) VALUES(?,?,?,?,?,?,?,?)",
                    arrayOf(id,b.getString("title"),first,first+count-1,ch,if(legacy)ch else 0,
                        if(legacy)signatures[i] else "",if(ready)1 else 0))
                first+=count
            }
            db.execSQL("INSERT OR REPLACE INTO meta(id,signature,total,done) VALUES(1,?,?,?)",
                arrayOf(expected,expectedTotal,if(legacy)former!!.third else 0))
            db.setTransactionSuccessful()
        }finally {db.endTransaction()}
        onScan(counts().done,expectedTotal)
        return false
    }

    /** Skip a book whose remaining clips are cooling down or quarantined,
     * but keep it unfinished; other books continue without losing progress. */
    fun activeBook(now:Long=System.currentTimeMillis()):BookTask? = readableDatabase.rawQuery(
        "SELECT b.id,b.title,b.start_seq,b.end_seq,b.chapters,b.indexed_chapters,b.finished FROM book_tasks b LEFT JOIN book_snooze q ON q.book_id=b.id WHERE b.finished=0 AND (q.until_at IS NULL OR q.until_at<=?) ORDER BY b.start_seq LIMIT 1",
        arrayOf(now.toString())).use {c->
        if(c.moveToFirst())BookTask(c.getString(0),c.getString(1),c.getInt(2),c.getInt(3),c.getInt(4),c.getInt(5),c.getInt(6)!=0)
        else null
    }
    fun unresolvedBooks():Int = readableDatabase.rawQuery(
        "SELECT COUNT(*) FROM book_tasks WHERE finished=0",null).use {c->c.moveToFirst();c.getInt(0)}
    /** Returns a wait duration for the next retry, or 0 when only manual review remains. */
    fun nextBookWakeMs(now:Long=System.currentTimeMillis()):Long = readableDatabase.rawQuery(
        "SELECT MIN(q.until_at) FROM book_tasks b JOIN book_snooze q ON q.book_id=b.id WHERE b.finished=0 AND q.until_at>? AND q.until_at<?",
        arrayOf(now.toString(),Long.MAX_VALUE.toString())).use { c->
        if(c.moveToFirst()&&!c.isNull(0))(c.getLong(0)-now).coerceAtLeast(1000L) else 0L
    }
    fun snoozeBook(book:BookTask,until:Long,reason:String) {
        writableDatabase.execSQL("INSERT OR REPLACE INTO book_snooze(book_id,until_at,reason) VALUES(?,?,?)",
            arrayOf(book.id,until,reason.take(90)))
    }
    fun resetBookSnoozes() { writableDatabase.delete("book_snooze",null,null) }
    fun finishedBooks():Int = readableDatabase.rawQuery("SELECT COUNT(*) FROM book_tasks WHERE finished=1",null).use{c->c.moveToFirst();c.getInt(0)}
    fun totalBooks():Int = readableDatabase.rawQuery("SELECT COUNT(*) FROM book_tasks",null).use{c->c.moveToFirst();c.getInt(0)}
    fun bookCounts(book:BookTask):Counts=readableDatabase.rawQuery(
        "SELECT COUNT(*),COALESCE(SUM(ready),0) FROM segments WHERE seq BETWEEN ? AND ?",
        arrayOf(book.startSeq.toString(),book.endSeq.toString())).use{c->c.moveToFirst();Counts(c.getInt(1),book.endSeq-book.startSeq+1)}
    fun pendingInBook(book:BookTask):Int=readableDatabase.rawQuery(
        "SELECT COUNT(*) FROM segments WHERE ready=0 AND seq BETWEEN ? AND ?",
        arrayOf(book.startSeq.toString(),book.endSeq.toString())).use{c->c.moveToFirst();c.getInt(0)}
    /** Lazily imports only the next chapter. One chapter + its duplicate-key map
     * are held in memory. Cursor and completed count commit in one transaction. */
    fun indexNextChapter(context:Context,disk:NarrationAudioCache,book:BookTask,
                         shouldContinue:()->Boolean,onScan:(Int,Int)->Unit):Boolean {
        if(!shouldContinue())return false
        val sig=bookSignature(context,book.id)
        val db=writableDatabase
        val oldSig=db.rawQuery("SELECT signature FROM book_tasks WHERE id=?",arrayOf(book.id)).use{c->c.moveToFirst();c.getString(0)}
        if(oldSig!=sig) {
            // A changed book invalidates ONLY its index rows. Content-addressed PCM
            // files are not deleted, and valid identical sentences are rediscovered.
            db.beginTransaction()
            try {
                val oldReady=db.rawQuery("SELECT COUNT(*) FROM segments WHERE ready=1 AND seq BETWEEN ? AND ?",
                    arrayOf(book.startSeq.toString(),book.endSeq.toString())).use{c->c.moveToFirst();c.getInt(0)}
                db.delete("segments","seq BETWEEN ? AND ?",arrayOf(book.startSeq.toString(),book.endSeq.toString()))
                db.execSQL("UPDATE meta SET done=MAX(0,done-?) WHERE id=1",arrayOf(oldReady))
                db.execSQL("UPDATE book_tasks SET indexed_chapters=0,signature=?,finished=0 WHERE id=?",arrayOf(sig,book.id))
                db.execSQL("CREATE TABLE IF NOT EXISTS pcm_reconciliation (id INTEGER PRIMARY KEY CHECK(id=1), files_seen INTEGER NOT NULL)")
                db.execSQL("DELETE FROM pcm_reconciliation")
                db.setTransactionSuccessful()
            }finally{db.endTransaction()}
        }
        val chapter=db.rawQuery("SELECT indexed_chapters FROM book_tasks WHERE id=?",arrayOf(book.id)).use{c->c.moveToFirst();c.getInt(0)}
        if(chapter>=book.chapters)return false
        // Opening a chapter never parses the full book or rehashes all chapters.
        val chapterMeta=plan(book.id).getJSONArray("chapters")
        require(chapterMeta.length()==book.chapters){"原著章节数量发生变化：${book.id}"}
        val section=chapterMeta.getJSONObject(chapter)
        val position=book.startSeq+section.getInt("start")
        val chapterNo=(chapter+1).toString().padStart(3,'0')
        val raw=context.assets.open("voice-library/chapters/${book.id}/$chapterNo.json").use { it.readBytes() }
        val sha=digest().digest(raw).joinToString(""){ "%02x".format(it) }
        require(sha==section.getString("sha256")){"章节资源校验失败：${book.id}/$chapterNo"}
        val texts=JSONObject(String(raw,Charsets.UTF_8)).getJSONArray("sentences")
        require(texts.length()==section.getInt("count") && position+texts.length()-1<=book.endSeq) {
            "原著章节片段或索引越界：${book.id}/$chapterNo"
        }
        val unique=HashMap<String,Boolean>()
        var imported=0
        db.beginTransaction()
        try {
            val insert=db.compileStatement("INSERT OR REPLACE INTO segments(seq,cache_key,text,book,chapter,chapter_index,chapter_total,ready) VALUES(?,?,?,?,?,?,?,?)")
            try {
                for(i in 0 until texts.length()) {
                    if(!shouldContinue())throw InterruptedException("章节索引中断，事务已回滚")
                    val text=texts.getString(i)
                    val key=disk.key(text,voiceSpeaker,voiceSpeed)
                    val ready=unique.getOrPut(key){disk.has(key)}
                    insert.clearBindings()
                    insert.bindLong(1,(position+i).toLong())
                    insert.bindString(2,key);insert.bindString(3,text);insert.bindString(4,book.title)
                    insert.bindLong(5,(chapter+1).toLong());insert.bindLong(6,(i+1).toLong())
                    insert.bindLong(7,texts.length().toLong());insert.bindLong(8,if(ready)1 else 0)
                    insert.executeInsert()
                    if(ready)imported++
                }
            }finally{insert.close()}
            db.execSQL("UPDATE book_tasks SET indexed_chapters=?,signature=? WHERE id=?",arrayOf(chapter+1,sig,book.id))
            db.execSQL("UPDATE meta SET done=done+? WHERE id=1",arrayOf(imported))
            db.setTransactionSuccessful()
        }finally{db.endTransaction()}
        onScan(imported,texts.length())
        return true
    }
    /** A missing/corrupt SQLite row is not equivalent to a completed clip.
     * Rebuild only the book's INDEX when row coverage is inconsistent; never
     * touch PCM. A chapter will re-import the already verified audio by hash. */
    private fun resetMissingBookRows(book:BookTask) {
        val db=writableDatabase
        db.beginTransaction()
        try {
            val ready=db.rawQuery("SELECT COUNT(*) FROM segments WHERE ready=1 AND seq BETWEEN ? AND ?",
                arrayOf(book.startSeq.toString(),book.endSeq.toString())).use {c->c.moveToFirst();c.getInt(0)}
            db.delete("segments","seq BETWEEN ? AND ?",arrayOf(book.startSeq.toString(),book.endSeq.toString()))
            db.execSQL("UPDATE book_tasks SET indexed_chapters=0,finished=0 WHERE id=?",arrayOf(book.id))
            db.execSQL("UPDATE meta SET done=MAX(0,done-?) WHERE id=1",arrayOf(ready))
            db.execSQL("DELETE FROM book_snooze WHERE book_id=?",arrayOf(book.id))
            db.execSQL("CREATE TABLE IF NOT EXISTS pcm_reconciliation (id INTEGER PRIMARY KEY CHECK(id=1), files_seen INTEGER NOT NULL)")
            db.execSQL("DELETE FROM pcm_reconciliation")
            db.setTransactionSuccessful()
        }finally{db.endTransaction()}
    }
    /** Advance to the next book only when ALL its chapters and PCM are complete. */
    fun finishBookIfComplete(book:BookTask):Boolean {
        if(pendingInBook(book)>0)return false
        val db=writableDatabase
        val indexed=db.rawQuery("SELECT indexed_chapters FROM book_tasks WHERE id=?",arrayOf(book.id)).use{c->c.moveToFirst();c.getInt(0)}
        if(indexed<book.chapters)return false
        val actual=db.rawQuery("SELECT COUNT(*) FROM segments WHERE seq BETWEEN ? AND ?",
            arrayOf(book.startSeq.toString(),book.endSeq.toString())).use{c->c.moveToFirst();c.getInt(0)}
        if(actual!=book.endSeq-book.startSeq+1) {
            resetMissingBookRows(book)
            return false
        }
        val verifiedReady=db.rawQuery("SELECT COUNT(*) FROM segments WHERE ready=1 AND seq BETWEEN ? AND ?",
            arrayOf(book.startSeq.toString(),book.endSeq.toString())).use {c->c.moveToFirst();c.getInt(0)}
        if(verifiedReady!=actual)return false
        db.execSQL("UPDATE book_tasks SET finished=1 WHERE id=?",arrayOf(book.id))
        return true
    }
    private fun reopenBooksForMissing() {
        val db=writableDatabase
        db.execSQL("UPDATE book_tasks SET finished=0 WHERE finished=1 AND EXISTS (SELECT 1 FROM segments s WHERE s.seq BETWEEN book_tasks.start_seq AND book_tasks.end_seq AND s.ready=0)")
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
    /** Recover existing PCM clips if a matching queue was incorrectly reset to zero.
     * This is an exceptional bounded file import, not a per-start full scan.
     * A marker prevents repeated scans for a profile that legitimately has zero clips.
     * This operation never deletes or rewrites PCM files. */
    fun restoreExistingPcm(disk: NarrationAudioCache, shouldContinue: () -> Boolean,
                           force: Boolean = false): Int {
        val initial=counts()
        if(initial.total<=0)return 0
        val keys=disk.existingPcmKeys()
        if(keys.isEmpty())return 0
        val db=writableDatabase
        db.execSQL("CREATE TABLE IF NOT EXISTS pcm_reconciliation (id INTEGER PRIMARY KEY CHECK(id=1), files_seen INTEGER NOT NULL)")
        val previouslyChecked=db.rawQuery("SELECT files_seen FROM pcm_reconciliation WHERE id=1",null).use { c ->
            if(c.moveToFirst())c.getInt(0) else -1
        }
        // An index may have been reset while PCM filenames stayed unchanged.
        // Never trust a file-count-only marker when the queue reports zero done.
        if(!force && previouslyChecked==keys.size && initial.done>0)return 0
        var recovered=0
        db.beginTransaction()
        try {
            val isPending=db.compileStatement("SELECT COUNT(*) FROM segments WHERE cache_key=? AND ready=0")
            val complete=db.compileStatement("UPDATE segments SET ready=1 WHERE cache_key=? AND ready=0")
            try {
                for(key in keys) {
                    if(!shouldContinue())throw InterruptedException("缓存文件恢复被暂停")
                    isPending.clearBindings();isPending.bindString(1,key)
                    if(isPending.simpleQueryForLong()<=0L)continue
                    if(!disk.has(key))continue
                    complete.clearBindings();complete.bindString(1,key)
                    recovered+=complete.executeUpdateDelete()
                }
            }finally {isPending.close();complete.close()}
            if(recovered>0)db.execSQL("UPDATE meta SET done=done+? WHERE id=1",arrayOf(recovered))
            db.execSQL("INSERT OR REPLACE INTO pcm_reconciliation(id,files_seen) VALUES(1,?)",arrayOf(keys.size))
            db.setTransactionSuccessful()
        }finally {db.endTransaction()}
        return recovered
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
            val attempts=(previous+1).coerceAtMost(MAX_AUTO_FAILURES)
            val delay=when { attempts==1->20_000L; attempts==2->120_000L; attempts==3->600_000L; else->minOf(6L*60*60*1000,1_800_000L*(1L shl minOf(attempts-4,3))) }
            db.execSQL("INSERT OR REPLACE INTO failures(cache_key,attempts,last_error,failed_at,retry_after) VALUES(?,?,?,?,?)",
                arrayOf(key,attempts,why.take(180),now,now+delay))
            db.setTransactionSuccessful()
            return attempts
        }finally{db.endTransaction()}
    }
    fun pendingCooldownMs(now:Long=System.currentTimeMillis(),book:BookTask?=null):Long {
        ensureFailures()
        return readableDatabase.rawQuery("SELECT MIN(f.retry_after) FROM segments s JOIN failures f ON f.cache_key=s.cache_key WHERE s.ready=0 AND f.attempts<? AND f.retry_after>? AND (?='' OR s.seq BETWEEN ? AND ?)",arrayOf(MAX_AUTO_FAILURES.toString(),now.toString(),book?.id?:"", (book?.startSeq?:0).toString(),(book?.endSeq?:0).toString())).use { c ->
            if(c.moveToFirst()&&!c.isNull(0))(c.getLong(0)-now).coerceAtLeast(1000L) else 0L
        }
    }
    fun deferredCount(now:Long=System.currentTimeMillis(),book:BookTask?=null):Int {
        ensureFailures()
        return readableDatabase.rawQuery("SELECT COUNT(*) FROM segments s JOIN failures f ON f.cache_key=s.cache_key WHERE s.ready=0 AND f.attempts<? AND f.retry_after>? AND (?='' OR s.seq BETWEEN ? AND ?)",arrayOf(MAX_AUTO_FAILURES.toString(),now.toString(),book?.id?:"", (book?.startSeq?:0).toString(),(book?.endSeq?:0).toString())).use { c->c.moveToFirst();c.getInt(0) }
    }
    /** Terminal failures are NOT completed and are never automatically retried.
     * Explicit user Start can clear this quarantine; ordinary service restarts cannot. */
    fun terminalCount(book:BookTask?=null): Int {
        ensureFailures()
        return readableDatabase.rawQuery("SELECT COUNT(*) FROM segments s JOIN failures f ON f.cache_key=s.cache_key WHERE s.ready=0 AND f.attempts>=? AND (?='' OR s.seq BETWEEN ? AND ?)",
            arrayOf(MAX_AUTO_FAILURES.toString(),book?.id?:"",(book?.startSeq?:0).toString(),(book?.endSeq?:0).toString())).use { c -> c.moveToFirst(); c.getInt(0) }
    }
    fun resetTerminalFailures(): Int {
        ensureFailures()
        return writableDatabase.delete("failures","attempts>=?",arrayOf(MAX_AUTO_FAILURES.toString()))
    }
    fun next(now:Long=System.currentTimeMillis(),book:BookTask?=null): Job? {
        ensureFailures()
        return readableDatabase.rawQuery("SELECT s.cache_key,s.text,s.book,s.chapter,s.chapter_index,s.chapter_total FROM segments s LEFT JOIN failures f ON f.cache_key=s.cache_key WHERE s.ready=0 AND (f.attempts IS NULL OR f.attempts<?) AND (f.retry_after IS NULL OR f.retry_after<=?) AND (?='' OR s.seq BETWEEN ? AND ?) ORDER BY s.seq LIMIT 1",arrayOf(MAX_AUTO_FAILURES.toString(),now.toString(),book?.id?:"",(book?.startSeq?:0).toString(),(book?.endSeq?:0).toString())).use { c ->
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
            if(affected>0)db.execSQL("UPDATE meta SET done=MAX(0,done-?) WHERE id=1",arrayOf(affected))
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
        if(reopened>0)reopenBooksForMissing()
        onChecked(checked,total)
        return reopened
    }
}
