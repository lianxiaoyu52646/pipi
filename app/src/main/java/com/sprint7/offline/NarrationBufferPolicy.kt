package com.sprint7.offline

/** Decisions use AUDIO DURATION, not number of sentences. Pure Kotlin for regression tests. */
object NarrationBufferPolicy {
    const val MAX_QUEUED_MS = 90000L
    const val STARTUP_TIMEOUT_MS = 90000L
    const val FIRST_AUDIO_TIMEOUT_MS = 90000L

    /** Ratio > 1 means CPU produces less than one second of speech per second. */
    fun synthesisRatio(synthesisMs: Long, generatedAudioMs: Long): Double {
        if (generatedAudioMs <= 0) return 2.0
        return (synthesisMs.toDouble() / generatedAudioMs).coerceIn(0.0, 10.0)
    }

    fun startupTargetMs(synthesisMs: Long, generatedAudioMs: Long): Long {
        val ratio = synthesisRatio(synthesisMs, generatedAudioMs)
        return when {
            ratio <= 0.45 -> 12000L
            ratio <= 0.85 -> 20000L
            ratio <= 1.15 -> 30000L
            ratio <= 1.75 -> 40000L
            else -> 55000L
        }
    }

    /** Leave real speech intact; only the producer's queued PCM counts. */
    fun readyToPlay(bufferedMs: Long, synthesisMs: Long, generatedAudioMs: Long, finished: Boolean): Boolean =
        bufferedMs > 0 && (finished || bufferedMs >= startupTargetMs(synthesisMs, generatedAudioMs))
}
