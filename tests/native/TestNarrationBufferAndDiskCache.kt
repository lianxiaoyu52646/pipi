package com.sprint7.offline

import java.nio.file.Files

fun main() {
    val p = NarrationBufferPolicy
    check(p.startupTargetMs(1000, 5000) == 12000L) // fast device
    check(p.startupTargetMs(9000, 9000) == 30000L)
    check(p.startupTargetMs(12000, 4000) == 55000L) // slow device
    check(!p.readyToPlay(10000, 5000, 5000, false))
    check(p.readyToPlay(36000, 5000, 5000, false))
    check(p.readyToPlay(2000, 5000, 5000, true))

    val dir = Files.createTempDirectory("pipi-kokoro-cache-test").toFile()
    try {
        val cache = NarrationAudioCache(dir, 150000)
        val key = cache.key("Hello, Mary! How are you?", 3, 1f)
        check(key != cache.key("Hello, Mary! How are you?", 2, 1f))
        check(key != cache.key("Hello, Mary! How are you?", 3, 1.25f))
        check(cache.get(key) == null)
        val pcm = ShortArray(24000) { i -> ((i % 32000) - 16000).toShort() }
        cache.put(key, pcm, 24000)
        check(cache.get(key)?.pcm?.contentEquals(pcm) == true)
        check(cache.get(key)?.sampleRate == 24000)
        // Corruption must never play broken audio or crash playback.
        dir.resolve("$key.pcm").writeBytes(byteArrayOf(1, 2, 3))
        check(cache.get(key) == null)
        check(!dir.resolve("$key.pcm").exists())
        cache.put(key, pcm, 24000)
        check(cache.get(key)?.pcm?.contentEquals(pcm) == true)
        val key2 = cache.key("Another line, with a comma, and a continuation.", 7, 0.75f)
        cache.put(key2, pcm, 24000)
        cache.trim()
        check(dir.listFiles()!!.filter { it.extension == "pcm" }.sumOf { it.length() } <= 150000L)
        println("PASS: startup by PCM seconds, slow/fast synthesis, speaker+rate cache keys, corruption recovery and byte-budget trimming")
    } finally { dir.deleteRecursively() }
}
