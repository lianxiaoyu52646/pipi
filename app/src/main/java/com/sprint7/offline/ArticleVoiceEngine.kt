package com.sprint7.offline

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.util.LruCache
import com.k2fsa.sherpa.onnx.OfflineTts
import com.k2fsa.sherpa.onnx.OfflineTtsConfig
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsKokoroModelConfig
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong

/**
 * In-app Kokoro English narration, independent from Piper word pronunciations.
 * The producer performs ONNX synthesis; a second worker streams previously-generated
 * PCM to AudioTrack so the next sentence can be prefetched without blocking playback.
 * Both model and voices are bundled in the APK; no network/system TTS is used.
 */
class ArticleVoiceEngine(private val context: Context, onEvent: EventCallback) {
    fun interface EventCallback { fun onEvent(event: JSONObject) }
    private data class Segment(val chapter: Int, val page: Int, val part: Int, val sub: Int, val paragraph: Int, val sentence: Int, val text: String)
    private data class AudioSegment(val index: Int, val segment: Segment, val samples: ShortArray, val rate: Int)
    private data class PlaybackMarker(val index: Int, val startingFrame: Long)
    private class Session(val id: Long, val token: String, first: List<Segment>, val cacheOnly: Boolean = false) {
        @Volatile var paused = false
        @Volatile var synthesisDone = false
        @Volatile var ended = false
        @Volatile var playbackDone = false
        @Volatile var playbackFailed = false
        private val segments = first.toMutableList()
        private val queue = ArrayBlockingQueue<AudioSegment>(512)
        private var queuedMs = 0L
        @Volatile var generatedAudioMs = 0L
        @Volatile var synthesisMs = 0L
        @Volatile var generatedCount = 0
        @Synchronized fun offerAudio(part: AudioSegment): Boolean {
            val duration = (part.samples.size * 1000L / part.rate).coerceAtLeast(1L)
            if (queue.size >= 500 || (queuedMs > 0L && queuedMs + duration > NarrationBufferPolicy.MAX_QUEUED_MS)) return false
            val ok = queue.offer(part)
            if (ok) queuedMs += duration
            return ok
        }
        @Synchronized fun pollAudio(): AudioSegment? {
            val part = queue.poll() ?: return null
            queuedMs = (queuedMs - (part.samples.size * 1000L / part.rate).coerceAtLeast(1L)).coerceAtLeast(0)
            return part
        }
        @Synchronized fun bufferedMs(): Long = queuedMs
        // Marker callbacks have their own worker; they must never block PCM writes.
        val markers = ArrayBlockingQueue<PlaybackMarker>(64)
        @Synchronized fun append(items: List<Segment>): Boolean {
            if (ended || segments.size + items.size > 120000) return false
            segments.addAll(items)
            return true
        }
        @Synchronized fun count(): Int = segments.size
        @Synchronized fun segmentAt(i: Int): Segment? = segments.getOrNull(i)
    }
    private val synthWorker = Executors.newSingleThreadExecutor { r -> Thread(r, "pipi-kokoro-synthesis") }
    private val playWorker = Executors.newSingleThreadExecutor { r -> Thread(r, "pipi-kokoro-playback") }
    private val markerWorker = Executors.newSingleThreadExecutor { r -> Thread(r, "pipi-kokoro-sentence-markers") }
    private val epoch = AtomicLong(0)
    @Volatile private var current: Session? = null
    @Volatile private var track: AudioTrack? = null
    @Volatile private var closed = false
    // JNI object is confined to synthWorker.
    private var kokoro: OfflineTts? = null
    private var holdsKokoroGate = false
    private var processLease: KokoroProcessGate.Lease? = null
    private val audioCache = object : LruCache<String, NarrationAudioCache.Clip>(16 * 1024 * 1024) {
        override fun sizeOf(key: String, value: NarrationAudioCache.Clip) = value.pcm.size * 2
    }
    private val diskCache = NarrationAudioCache(LibraryVoiceCacheService.cacheFolder(context), Long.MAX_VALUE, Int.MAX_VALUE)

    @Volatile private var eventCallback: EventCallback? = onEvent
    fun setEventCallback(callback: EventCallback?) { eventCallback=callback }
    init { KokoroModelGuard.registerReader(this) }

    private fun emit(code: String, run: Session? = null, index: Int = -1, message: String = "") {
        val event = JSONObject().put("code", code).put("session", run?.id ?: epoch.get())
            .put("index", index).put("token", run?.token ?: "").put("message", message)
        val s = run?.segmentAt(index)
        if (s != null) {
            event.put("chapter", s.chapter).put("page", s.page).put("part", s.part).put("sub", s.sub)
                .put("paragraph", s.paragraph).put("sentence", s.sentence)
        }
        eventCallback?.onEvent(event)
        ArticlePlaybackService.onEngineEvent(event)
    }

    private fun parseSegments(json: String): List<Segment> {
        val array = JSONArray(json)
        require(array.length() in 1..40) { "一次最多提交40个句段" }
        return (0 until array.length()).map { i ->
            val item = array.getJSONObject(i)
            val sentence = item.getString("text").trim()
            require(sentence.isNotEmpty() && sentence.length <= 1400) { "原文句子超出语音引擎安全长度" }
            Segment(item.getInt("chapter"), item.getInt("page"), item.getInt("part"), item.optInt("sub", 0),
                item.optInt("paragraph", item.getInt("part")), item.optInt("sentence", item.optInt("sub", 0)), sentence)
        }
    }

    fun speakBatch(json: String, rate: Float, speakerId: Int, requestToken: String) {
        if (closed) return
        val segments = try { parseSegments(json) } catch (e: Exception) {
            emit("article-error", message = "朗读内容不正确：${e.message}")
            return
        }
        val run = Session(epoch.incrementAndGet(), requestToken.take(64), segments)
        current = run
        stopTrack()
        val speed = rate.coerceIn(0.7f, 1.3f)
        // 0 (af), 1 (am) are valid voices of the English 11-speaker model.
        val sid = speakerId.coerceIn(0, 10)
        synthWorker.execute { produce(run, speed, sid) }
        playWorker.execute { consume(run) }
        markerWorker.execute { dispatchMarkers(run) }
    }

    /** Play existing verified PCM while the separate library cache keeps synthesizing.
     * Never acquire the Kokoro model gate in this mode. If a clip is missing,
     * report it rather than silently stopping the user's background job.
     */
    fun speakCachedBatch(json: String, rate: Float, speakerId: Int, requestToken: String) {
        if (closed) return
        val segments = try { parseSegments(json) } catch (e: Exception) {
            emit("article-error", message = "朗读内容不正确：${e.message}");return
        }
        val run=Session(epoch.incrementAndGet(),requestToken.take(64),segments,true)
        current=run;stopTrack()
        val speed=rate.coerceIn(0.7f,1.3f);val sid=speakerId.coerceIn(0,10)
        synthWorker.execute { produce(run,speed,sid) }
        playWorker.execute { consume(run) }
        markerWorker.execute { dispatchMarkers(run) }
    }

    // Append ahead of playback without creating a new session or AudioTrack.
    // Token validation prevents delayed JS messages from entering another book/voice.
    fun appendBatch(json: String, requestToken: String) {
        val run = current ?: return
        if (!active(run) || run.token != requestToken.take(64)) return
        try {
            if (!run.append(parseSegments(json))) emit("article-error", run, message = "朗读缓冲已关闭或超出上限")
        } catch (e: Exception) { emit("article-error", run, message = "追加朗读失败：${e.message}") }
    }

    fun finishBatch(requestToken: String) {
        val run = current ?: return
        if (active(run) && run.token == requestToken.take(64)) run.ended = true
    }

    private fun active(run: Session) = !closed && epoch.get() == run.id && current === run

    private fun produce(run: Session, speed: Float, sid: Int) {
        try {
            if (!active(run)) return
            diskCache.trim()
            // Cached playback starts immediately without allocating the native Kokoro model.
            // The model is acquired lazily ONLY when an uncached sentence is met.
            emit("article-ready",run)
            var index = 0
            while (active(run)) {
                // Permit JS to supply the next chapter/batch before the current
                // AudioTrack is drained. Empty input waits briefly; end-of-book is explicit.
                val seg = run.segmentAt(index)
                if (seg == null) {
                    if (run.ended) break
                    Thread.sleep(45)
                    continue
                }
                // A word pronunciation or app background pause should not cause Kokoro
                // to keep occupying CPU alongside the independent Piper engine.
                waitIfPaused(run)
                if (!active(run)) break
                val started = System.nanoTime()
                val key = diskCache.key(seg.text, sid, speed)
                val memory = audioCache.get(key)
                val persisted = if (memory == null) diskCache.get(key) else null
                val clip = memory ?: persisted ?: run {
                    if(run.cacheOnly)error("当前句尚未缓存完成；后台生成继续进行，稍后可再播放（不会暂停缓存任务）")
                    if(kokoro==null){
                        emit("article-loading",run,message="正在加载 Kokoro，为未缓存句子补充朗读…")
                        KokoroModelGuard.gate.acquire()
                        holdsKokoroGate=true
                        try {
                            processLease=KokoroProcessGate.acquire(context,{active(run)},12_000L)
                                ?: error("后台整书缓存正在使用Kokoro；可先暂停缓存，已缓存片段仍可直接播放")
                            kokoro=loadModel()
                        } catch(t:Throwable) {
                            try{processLease?.close()}catch(_:Throwable){}
                            processLease=null
                            holdsKokoroGate=false;KokoroModelGuard.gate.release();throw t
                        }
                    }
                    val engine=kokoro ?: error("Kokoro 模型初始化失败")
                    // sherpa-onnx JNI callback generation crashed on some Android devices;
                    // use the stable synchronous entry point, only on synthWorker.
                    val raw = engine.generate(seg.text, sid, speed).samples
                    if (!active(run)) return
                    val smooth = NarrationPcmPacing.smooth(raw, engine.sampleRate(), seg.text)
                    if (smooth.isEmpty()) error("Kokoro 合成音频为空")
                    val pcm = ShortArray(smooth.size) { j -> (smooth[j].coerceIn(-1f, 1f) * 32767).toInt().toShort() }
                    NarrationAudioCache.Clip(pcm, engine.sampleRate())
                }
                if (!active(run)) break
                if (memory == null && clip.pcm.size * 2 <= 6 * 1024 * 1024) audioCache.put(key, clip)
                if (memory == null && persisted == null) diskCache.put(key, clip.pcm, clip.sampleRate)
                val output = AudioSegment(index, seg, clip.pcm, clip.sampleRate)
                run.generatedAudioMs += clip.pcm.size * 1000L / clip.sampleRate
                run.synthesisMs += TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started)
                run.generatedCount++
                while (active(run) && !run.offerAudio(output)) Thread.sleep(45)
                index++
            }
        } catch (e: Throwable) {
            if (active(run)) {
                emit("article-error", run, message = "Kokoro 朗读失败：${e.message ?: e.javaClass.simpleName}")
                // Stops the consumer; do not mark a failed generation as complete.
                stop()
            }
        } finally {
            run.synthesisDone = true
            // Do not hold Kokoro RAM / the cross-process lock after the last batch.
            // A new reading session can lazily load it again if needed.
            if (run.ended || !active(run)) freeModelOnSynthWorker()
        }
    }

    /**
     * A single AudioTrack persists across queued batches and chapters, avoiding
     * reinitialization at the old 36-sentence boundaries. Producer/consumer threads still run concurrently:
     * the model can synthesize upcoming sentences while PCM is being played.
     * Do not use generateWithCallback(): it can crash some sherpa-onnx Android JNI builds.
     */
    private fun consume(run: Session) {
        var player: AudioTrack? = null
        var framesWritten = 0L
        try {
            // Never block an old session's single playback worker for 90 seconds.
            val deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(NarrationBufferPolicy.FIRST_AUDIO_TIMEOUT_MS)
            var first: AudioSegment? = null
            while (active(run) && first == null && System.nanoTime() < deadline) {
                first = run.pollAudio()
                if (first == null) Thread.sleep(80)
            }
            if (!active(run)) return
            if (first == null) error("Kokoro 未能在90秒内生成首句音频，请检查设备性能或语音模型")
            bufferBeginning(run, first)
            emit("article-audio-start", run)
            var output: AudioSegment? = first
            while (active(run) && output != null) {
                waitIfPaused(run)
                if (!active(run)) return
                if (player == null) {
                    player = createPlayer(output.rate)
                    track = player
                }
                // Keep continuous PCM flowing. The old waitForSpeechBoundary()
                // blocked the writer for every sentence, creating audible gaps.
                // A separate worker tracks real playback for accurate UI highlighting.
                while (active(run) && !run.markers.offer(PlaybackMarker(output.index, framesWritten), 100, TimeUnit.MILLISECONDS)) { }
                // Kokoro clips must share a clock rate. A corrupted cache
                // should never be sent to the same track at the wrong speed.
                if (output.rate != first.rate) error("朗读缓存采样率不匹配：${output.rate} / ${first.rate}")
                writePcm(run, player, output.samples)
                framesWritten += output.samples.size
                output = run.pollAudio()
                var waiting = false
                var playerDrained = false
                while (output == null && active(run) && !run.synthesisDone) {
                    if (!waiting) {
                        emit("article-waiting", run, message = "正在补充语音缓冲，稍后继续…")
                        waiting = true
                    }
                    // On underrun don't leave an actively playing AudioTrack with
                    // nothing to feed. Drain the already-written phoneme first,
                    // then park the stream; the next PCM clip fades in gently.
                    val head = player.playbackHeadPosition.toLong() and 0xffffffffL
                    if (!playerDrained && head >= framesWritten) {
                        try { player.pause() } catch (_: Throwable) { }
                        playerDrained = true
                    }
                    Thread.sleep(35)
                    output = run.pollAudio()
                }
                // Wait briefly for additional *generated* PCM on a true underrun.
                // A fast device resumes immediately; a slow one gets a short
                // refill rather than stuttering on every tiny next sentence.
                if (waiting && output != null && active(run) && !run.synthesisDone) {
                    val refillBy = System.nanoTime() + TimeUnit.SECONDS.toNanos(8)
                    while (active(run) && !run.paused && !run.synthesisDone &&
                        run.bufferedMs() < 4000L && System.nanoTime() < refillBy) {
                        Thread.sleep(45)
                    }
                }
                if (waiting && output != null && active(run)) emit("article-audio-start", run)
            }
            if (active(run) && player != null) drainPlayer(run, player, framesWritten)
        } catch (e: Throwable) {
            run.playbackFailed = true
            if (active(run)) emit("article-error", run, message = "音频播放失败：${e.message ?: e.javaClass.simpleName}")
        } finally {
            // Markers are drained before the reader gets its end-of-book event.
            run.playbackDone = true
            val previous = player
            if (previous != null) {
                if (track === previous) track = null
                try { previous.pause() } catch (_: Throwable) {}
                try { previous.flush() } catch (_: Throwable) {}
                try { previous.release() } catch (_: Throwable) {}
            }
        }
    }

    private fun bufferBeginning(run: Session, first: AudioSegment) {
        // Sentence counts are misleading: three exclamations may be < 2 s of sound.
        // Estimate synthesis real-time factor and prebuffer actual audio duration.
        val firstMs = first.samples.size * 1000L / first.rate
        val deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(NarrationBufferPolicy.STARTUP_TIMEOUT_MS)
        var lastMessage = 0L
        while (active(run) && !run.synthesisDone && System.nanoTime() < deadline) {
            waitIfPaused(run)
            if (!active(run)) return
            val queued = run.bufferedMs() + firstMs
            if (NarrationBufferPolicy.readyToPlay(queued, run.synthesisMs, run.generatedAudioMs, false)) break
            val now = System.nanoTime()
            if (TimeUnit.NANOSECONDS.toMillis(now - lastMessage) >= 1700L) {
                val seconds = queued / 1000
                val goal = NarrationBufferPolicy.startupTargetMs(run.synthesisMs, run.generatedAudioMs) / 1000
                emit("article-buffering", run, message = "正在准备连续朗读 $seconds/$goal 秒音频…")
                lastMessage = now
            }
            Thread.sleep(90)
        }
    }

    /** Deliver sentence highlighters independently from AudioTrack.write(). */
    private fun dispatchMarkers(run: Session) {
        while (active(run)) {
            val marker = run.markers.poll(80, TimeUnit.MILLISECONDS)
            if (marker == null) {
                if (run.playbackDone) break
                continue
            }
            while (active(run) && !run.playbackFailed && !run.playbackDone) {
                waitIfPaused(run)
                val player = track
                val played = (player?.playbackHeadPosition?.toLong() ?: -1L) and 0xffffffffL
                if (player != null && played >= marker.startingFrame) break
                Thread.sleep(12)
            }
            if (!active(run) || run.playbackFailed) return
            emit("article-segment", run, marker.index)
        }
        if (active(run) && !run.playbackFailed) emit("article-batch-done", run)
    }

    private fun waitIfPaused(run: Session) {
        while (active(run) && run.paused) Thread.sleep(60)
    }

    private fun createPlayer(rate: Int): AudioTrack {
        val buffer = AudioTrack.getMinBufferSize(rate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT)
        check(buffer > 0) { "AudioTrack 缓冲区无效" }
        return AudioTrack.Builder()
            .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
            .setAudioFormat(AudioFormat.Builder().setSampleRate(rate).setEncoding(AudioFormat.ENCODING_PCM_16BIT).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
            .setBufferSizeInBytes(maxOf(16384, buffer * 6))
            .setTransferMode(AudioTrack.MODE_STREAM).build()
    }

    private fun writePcm(run: Session, player: AudioTrack, samples: ShortArray) {
        waitIfPaused(run)
        if (!active(run)) return
        // Pre-fill the hardware buffer with the first few frames BEFORE play().
        // Calling play() on an empty stream creates an avoidable underrun and
        // can sound like a tiny burst or hard voice attack on some devices.
        var offset = 0
        if (player.playState != AudioTrack.PLAYSTATE_PLAYING && samples.isNotEmpty()) {
            val seeded = player.write(samples, 0, minOf(2048, samples.size), AudioTrack.WRITE_BLOCKING)
            if (seeded <= 0 && active(run)) error("AudioTrack 预写失败：$seeded")
            offset = maxOf(0, seeded)
            if (active(run) && !run.paused) player.play()
        }
        while (offset < samples.size && active(run)) {
            waitIfPaused(run)
            if (!active(run)) break
            val count = minOf(4096, samples.size - offset)
            val written = player.write(samples, offset, count, AudioTrack.WRITE_BLOCKING)
            if (written <= 0 && active(run)) error("AudioTrack 写入失败：$written")
            offset += maxOf(0, written)
        }
    }

    private fun drainPlayer(run: Session, player: AudioTrack, totalFrames: Long) {
        // write() only confirms PCM was queued, not that the speaker finished.
        // Poll the hardware head before reporting batch completion, preventing
        // the next batch from cutting off the final phrase.
        while (active(run)) {
            waitIfPaused(run)
            if (!active(run)) return
            val head = player.playbackHeadPosition.toLong() and 0xffffffffL
            if (head >= totalFrames) return
            Thread.sleep(15)
        }
    }

    private fun loadModel(): OfflineTts {
        val prefix = "tts/kokoro-int8-en-v0_19"
        val packaged = context.assets.list(prefix)?.toSet() ?: emptySet()
        check(setOf("model.int8.onnx", "voices.bin", "tokens.txt", "espeak-ng-data").all { it in packaged }) {
            "当前APK缺少 Kokoro 音色或模型资源，请核对打包结果"
        }
        val data = File(context.noBackupFilesDir, "pipi-tts-kokoro-espeak-v1")
        val ready = File(data, ".complete")
        val dictionaries = File(data, "espeak-ng-data")
        if (!ready.isFile() || (dictionaries.listFiles()?.size ?: 0) < 5) {
            data.deleteRecursively()
            data.mkdirs()
            copyAssets("$prefix/espeak-ng-data", File(data, "espeak-ng-data"))
            check(File(data, "espeak-ng-data").listFiles()?.isNotEmpty() == true) { "Kokoro 音素数据缺失" }
            ready.writeText("1")
        }
        return OfflineTts(
            assetManager = context.assets,
            config = OfflineTtsConfig(
                model = OfflineTtsModelConfig(
                    kokoro = OfflineTtsKokoroModelConfig(
                        model = "$prefix/model.int8.onnx",
                        voices = "$prefix/voices.bin",
                        tokens = "$prefix/tokens.txt",
                        dataDir = File(data, "espeak-ng-data").absolutePath
                    ),
                    numThreads = 2, provider = "cpu"
                ),
                maxNumSentences = 1
            )
        )
    }

    private fun copyAssets(source: String, dst: File) {
        val children = context.assets.list(source) ?: error("缺少 $source")
        if (children.isEmpty()) {
            dst.parentFile?.mkdirs()
            context.assets.open(source).use { input -> FileOutputStream(dst).use { out -> input.copyTo(out, 32768) } }
        } else {
            dst.mkdirs()
            for (child in children) copyAssets("$source/$child", File(dst, child))
        }
    }

    fun isReading(): Boolean = current?.let { active(it) } == true
    fun isPaused(): Boolean = current?.let { active(it) && it.paused } == true

    fun pause() {
        val run = current ?: return
        if (!active(run)) return
        run.paused = true
        try { track?.pause() } catch (_: Throwable) {}
        emit("article-paused", run)
    }
    fun resume() {
        val run = current ?: return
        if (!active(run)) return
        run.paused = false
        try { track?.play() } catch (_: Throwable) {}
        emit("article-playing", run)
    }
    private fun stopTrack() {
        try { track?.pause() } catch (_: Throwable) {}
        try { track?.flush() } catch (_: Throwable) {}
    }
    fun stop() {
        epoch.incrementAndGet()
        current = null
        stopTrack()
    }
    private fun freeModelOnSynthWorker() {
        try { kokoro?.free() } catch (_: Throwable) {}
        kokoro = null
        try { processLease?.close() } catch (_: Throwable) {}
        processLease = null
        if (holdsKokoroGate) { holdsKokoroGate = false; KokoroModelGuard.gate.release() }
    }
    fun releaseModel() {
        val before = current
        stop()
        if (before != null) emit("article-stopped", before)
        synthWorker.execute {
            freeModelOnSynthWorker()
            audioCache.evictAll() // Disk PCM persists for future reading sessions.
        }
    }
    fun close() {
        if (closed) return
        closed = true
        KokoroModelGuard.unregisterReader(this)
        releaseModel()
        synthWorker.shutdown()
        playWorker.shutdown()
        markerWorker.shutdown()
    }
}
