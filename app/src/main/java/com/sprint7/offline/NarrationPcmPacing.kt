package com.sprint7.offline

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

/**
 * V5.10.8: Audio quality is more important than aggressively deleting pauses.
 * Keep ALL pauses inside an utterance, where Kokoro shapes the prosody.
 * Only discard demonstrably quiet excess at external boundaries; preserve a
 * natural breath and ramp the final waveform to zero to prevent PCM clicks.
 * This is deliberately JVM-testable without Android or the ONNX runtime.
 */
internal object NarrationPcmPacing {
    private const val QUIET_PEAK = 0.0015f

    private fun trailingAllowance(text: String): Int {
        val ending = text.trimEnd().trimEnd('"', '\'', '”', '’', ')', ']', '»').trimEnd()
        return when {
            ending.endsWith("...") || ending.endsWith('…') -> 360
            ending.endsWith('!') || ending.endsWith('！') -> 205
            ending.endsWith('?') || ending.endsWith('？') -> 210
            ending.endsWith('.') || ending.endsWith('。') -> 200
            else -> 170
        }
    }

    internal fun smooth(samples: FloatArray, sampleRate: Int, text: String): FloatArray {
        if (samples.isEmpty()) return samples
        // Bad ONNX samples can otherwise become sharp digital clicks on conversion.
        val clean = FloatArray(samples.size) { i ->
            val x = samples[i]
            if (!x.isFinite()) 0f else x.coerceIn(-0.98f, 0.98f)
        }
        if (sampleRate !in 8000..96000) return clean
        val hop = (sampleRate / 200).coerceAtLeast(1) // 5ms
        val maxLead = min(clean.size / 3, sampleRate * 1000 / 1000)
        val maxTail = min(clean.size / 2, sampleRate * 4)

        // Trim only contiguous quiet blocks at the start and end. Never inspect
        // /remove internal silences, consonant gaps, commas, breaths, or clauses.
        var lead = 0
        while (lead + hop <= maxLead && isQuiet(clean, lead, lead + hop)) lead += hop
        val keepLead = sampleRate * 65 / 1000
        val begin = if (lead > sampleRate * 150 / 1000) (lead - keepLead).coerceAtLeast(0) else 0

        var tail = 0
        while (tail + hop <= maxTail && isQuiet(clean, clean.size - tail - hop, clean.size - tail)) tail += hop
        val allowedTail = sampleRate * trailingAllowance(text) / 1000
        val end = if (tail > allowedTail + sampleRate * 100 / 1000)
            (clean.size - tail + allowedTail).coerceAtMost(clean.size) else clean.size
        val selected = if (end - begin >= sampleRate / 8) clean.copyOfRange(begin, end) else clean

        // A 12ms cosine envelope at each clip boundary prevents hard jumps
        // caused by concatenating independently synthesized PCM utterances.
        val fade = min(selected.size / 4, sampleRate * 12 / 1000)
        if (fade > 0) {
            for (i in 0 until fade) {
                val phase = (i + 1).toDouble() / (fade + 1)
                val gain = (0.5 - 0.5 * cos(PI * phase)).toFloat()
                selected[i] *= gain
                selected[selected.lastIndex - i] *= gain
            }
        }
        return selected
    }

    /** Compatibility only: formerly compressed silence *inside* a sentence.
     * Left as a no-op to preserve natural Kokoro emphasis and intonation. */
    internal fun compressInternalSilence(samples: FloatArray, sampleRate: Int, text: String): FloatArray = samples

    private fun isQuiet(samples: FloatArray, from: Int, until: Int): Boolean {
        for (i in from until until) if (abs(samples[i]) > QUIET_PEAK) return false
        return true
    }
}
