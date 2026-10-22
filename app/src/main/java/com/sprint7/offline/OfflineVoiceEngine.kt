package com.sprint7.offline

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.util.LruCache
import com.k2fsa.sherpa.onnx.OfflineTts
import com.k2fsa.sherpa.onnx.OfflineTtsConfig
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsVitsModelConfig
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicLong

/** Completely in-app offline American English TTS, not Android TextToSpeech. */
class OfflineVoiceEngine(
    private val context: Context,
    private val status: StatusCallback
) {
    fun interface StatusCallback { fun onStatus(code: String, message: String) }

    private val worker = Executors.newSingleThreadExecutor { r ->
        Thread(r, "pipi-offline-tts").apply { isDaemon = true }
    }
    private val epoch = AtomicLong(0)
    @Volatile private var player: AudioTrack? = null
    @Volatile private var closed = false
    private var engine: OfflineTts? = null // only accessed on worker
    private val cache = object : LruCache<String, FloatArray>(4 * 1024 * 1024) {
        override fun sizeOf(key: String, value: FloatArray): Int = value.size * 4
    }

    fun speak(raw: String, speed: Float = 1f) {
        if (closed) return
        val text = raw.trim().take(12000)
        if (text.isBlank()) return
        val rate = speed.coerceIn(.6f, 1.5f)
        val id = epoch.incrementAndGet()
        stopCurrentAudio()
        worker.execute {
            try {
                if (id != epoch.get() || closed) return@execute
                if (engine == null) {
                    status.onStatus("loading", "正在初始化皮皮离线英语发音…")
                    engine = makeEngine()
                }
                if (id != epoch.get() || closed) return@execute
                // Long reading passages are broken into small chunks to keep peak RAM bounded.
                // A tap on a different word cancels the current synthesis via the JNI callback.
                for (piece in chunks(text)) {
                    if (id != epoch.get() || closed) return@execute
                    val key = if (piece.length <= 48) "${piece}@$rate" else ""
                    val memo = if (key.isNotEmpty()) cache.get(key) else null
                    // Native JNI callback generation has caused SIGABRT on Android
                    // (sherpa-onnx issue #3492). Use callback-free generation, then
                    // discard stale results after synthesis without touching JNI callbacks.
                    val generated = memo ?: engine!!.generate(piece, 0, rate).samples
                    if (id != epoch.get() || closed) return@execute
                    if (generated.isEmpty()) error("语音合成返回空音频")
                    if (key.isNotEmpty() && memo == null && generated.size < 240000) cache.put(key, generated)
                    play(generated, engine!!.sampleRate(), id)
                }
                if (id == epoch.get() && !closed) status.onStatus("finished", "")
            } catch (t: Throwable) {
                // Preserve the process even if JNI or a model load fails.
                if (id == epoch.get() && !closed) status.onStatus("error", "离线发音失败：${t.message ?: t.javaClass.simpleName}")
            }
        }
    }

    private fun chunks(text: String): List<String> {
        if (text.length <= 220) return listOf(text)
        val words = text.split(Regex("\\s+"))
        val parts = mutableListOf<String>()
        val current = StringBuilder()
        for (word in words) {
            if (word.isBlank()) continue
            if (current.length + word.length + 1 > 220 && current.isNotEmpty()) {
                parts.add(current.toString()); current.clear()
            }
            if (current.isNotEmpty()) current.append(' ')
            current.append(word)
        }
        if (current.isNotEmpty()) parts.add(current.toString())
        return parts
    }

    private fun makeEngine(): OfflineTts {
        val prefix = "tts/vits-piper-en_US-lessac-low"
        // eSpeak NG needs real filesystem paths for its phoneme dictionaries.
        val copied = File(context.noBackupFilesDir, "pipi-tts-espeak-v1")
        val marker = File(copied, ".complete")
        if (!marker.isFile() || (File(copied, "espeak-ng-data").listFiles()?.size ?: 0) < 5) {
            copied.deleteRecursively()
            copied.mkdirs()
            copyAssets("$prefix/espeak-ng-data", File(copied, "espeak-ng-data"))
            if (!File(copied, "espeak-ng-data").isDirectory ||
                File(copied, "espeak-ng-data").listFiles().isNullOrEmpty()) {
                error("英文音素词典文件不完整")
            }
            marker.writeText("1")
        }
        val config = OfflineTtsConfig(
            model = OfflineTtsModelConfig(
                vits = OfflineTtsVitsModelConfig(
                    model = "$prefix/en_US-lessac-low.onnx",
                    tokens = "$prefix/tokens.txt",
                    dataDir = File(copied, "espeak-ng-data").absolutePath
                ),
                numThreads = 2,
                provider = "cpu"
            ),
            maxNumSentences = 1
        )
        val result = OfflineTts(assetManager = context.assets, config = config)
        status.onStatus("ready", "离线美式英语发音已就绪")
        return result
    }

    private fun copyAssets(path: String, dst: File) {
        val children = context.assets.list(path) ?: error("找不到语音资源 $path")
        if (children.isEmpty()) {
            dst.parentFile?.mkdirs()
            context.assets.open(path).use { from ->
                FileOutputStream(dst).use { to -> from.copyTo(to, 32768) }
            }
        } else {
            dst.mkdirs()
            for (child in children) copyAssets("$path/$child", File(dst, child))
        }
    }

    private fun play(samples: FloatArray, rate: Int, id: Long) {
        val buffer = AudioTrack.getMinBufferSize(rate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT)
        if (buffer <= 0) error("音频设备初始化失败")
        val track = AudioTrack.Builder()
            .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
            .setAudioFormat(AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(rate).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
            .setBufferSizeInBytes(maxOf(8192, buffer * 2))
            .setTransferMode(AudioTrack.MODE_STREAM).build()
        player = track
        try {
            track.play()
            var offset = 0
            while (offset < samples.size && epoch.get() == id && !closed) {
                val count = minOf(2048, samples.size - offset)
                val pcm = ShortArray(count) { j -> (samples[offset + j].coerceIn(-1f, 1f) * 32767).toInt().toShort() }
                val n = track.write(pcm, 0, count, AudioTrack.WRITE_BLOCKING)
                if (n <= 0) break
                offset += n
            }
            // PCM write completion != audible completion. Let the hardware drain.
            val limit = System.nanoTime() + ((samples.size.toDouble() / rate) * 1_000_000_000L).toLong() + 2_000_000_000L
            while (epoch.get() == id && !closed && System.nanoTime() < limit) {
                val completed = track.playbackHeadPosition.toLong() and 0xffffffffL
                if (completed >= samples.size.toLong()) break
                Thread.sleep(15)
            }
        } finally {
            if (player === track) player = null
            try { track.pause() } catch (_: Throwable) {}
            try { track.flush() } catch (_: Throwable) {}
            try { track.release() } catch (_: Throwable) {}
        }
    }

    private fun stopCurrentAudio() {
        try { player?.pause() } catch (_: Throwable) {}
        try { player?.flush() } catch (_: Throwable) {}
    }
    fun stop() {
        epoch.incrementAndGet()
        stopCurrentAudio()
    }
    /** Unload Piper while Kokoro reads long articles, preserving the word TTS bridge. */
    fun releaseModel() {
        stop()
        worker.execute {
            try { engine?.free() } catch (_: Throwable) {}
            engine = null
            cache.evictAll()
        }
    }
    fun close() {
        if (closed) return
        closed = true
        stop()
        worker.execute {
            try { engine?.free() } catch (_: Throwable) {}
            engine = null
            cache.evictAll()
        }
        worker.shutdown()
    }
}
