package com.sprint7.offline

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.sin

fun main() {
    val rate = 24000
    fun clip(leadMs: Int, speechMs: Int, tailMs: Int): FloatArray {
        val lead = rate * leadMs / 1000
        val voice = rate * speechMs / 1000
        val tail = rate * tailMs / 1000
        return FloatArray(lead + voice + tail) { idx ->
            if (idx < lead || idx >= lead + voice) 0f
            else (0.15 * sin(2 * PI * 190 * (idx - lead) / rate)).toFloat()
        }
    }
    for (ending in listOf("Wait!", "Really?", "She said.", "Oh...", "look;", "Yes, and")) {
        val original = clip(240, 1050, 950)
        val improved = NarrationPcmPacing.smooth(original, rate, ending)
        check(improved.size < original.size - rate / 2) { "Should remove excess padding: '$ending'" }
        check(improved.size > rate * 1050 / 1000) { "Phonemes appear truncated: '$ending'" }
        check(abs(improved.first()) < 0.00001f && abs(improved.last()) < 0.00001f)
    }
    val exact = clip(12, 1050, 25)
    val safe = NarrationPcmPacing.smooth(exact, rate, "Hi!")
    check(safe.size >= exact.size - rate / 40) { "Natural boundary trimmed too much" }
    check(NarrationPcmPacing.smooth(floatArrayOf(.2f),rate,"! ").size==1)
    println("PASS: V5.10.8 punctuation-specific outer pads trimmed; voiced PCM intact")
}
