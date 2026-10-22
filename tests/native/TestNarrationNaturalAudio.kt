package com.sprint7.offline

import kotlin.math.abs

fun main() {
    val sr = 24000
    fun voice(ms: Int, level: Float = .15f) = FloatArray(sr * ms / 1000) { if (it % 2 == 0) level else -level }
    fun gap(ms: Int) = FloatArray(sr * ms / 1000)
    fun join(vararg arrays: FloatArray): FloatArray {
        val data = FloatArray(arrays.sumOf { it.size });var pos = 0
        for (a in arrays) {System.arraycopy(a, 0, data, pos, a.size);pos += a.size}
        return data
    }

    // Critical regression from the previous version: never cut interior quiet
    // periods that Kokoro uses for emphasis, commas or character dialogue.
    val sentence = join(voice(750), gap(1250), voice(850), gap(180), voice(740))
    val polished = NarrationPcmPacing.smooth(sentence, sr, "No, please! Listen... Really?")
    check(polished.size == sentence.size) { "Internal pause was removed" }
    val interior = sr * 800 / 1000
    check(polished[interior] == 0f && polished[interior + sr / 2] == 0f) { "Long internal pause changed" }
    check(abs(polished.first()) < .01f && abs(polished.last()) < .01f) { "No fade on clip edges" }
    check(polished[sr] == sentence[sr]) { "Sound was changed away from short boundaries" }

    val raw = join(gap(450), voice(800), gap(1500))
    val smooth = NarrationPcmPacing.smooth(raw, sr, "Hello, Sarah!")
    check(smooth.size < raw.size - sr / 2)
    check(smooth.size > sr * 800 / 1000)
    check(smooth.all { it.isFinite() && abs(it) <= 1f })
    val invalid = floatArrayOf(Float.NaN, Float.POSITIVE_INFINITY, Float.NEGATIVE_INFINITY, 3.2f, -.9f)
    val clean = NarrationPcmPacing.smooth(invalid, sr, "What?")
    check(clean.all { it.isFinite() && abs(it) <= 0.98f }) { "Non-finite PCM was not fixed" }
    check(NarrationPcmPacing.compressInternalSilence(sentence, sr, "No, really!").contentEquals(sentence))
    println("PASS: V5.10.8 keeps natural internal pauses, smooths clip edges, rejects invalid PCM")
}
