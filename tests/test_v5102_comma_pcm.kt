package com.sprint7.offline

import kotlin.math.abs

/** Executable: kotlinc NarrationPcmPacing.kt this_file -include-runtime -d test.jar && java -jar test.jar */
fun main() {
    val sampleRate = 10000
    fun voiced(ms: Int, amp: Float=0.08f): FloatArray = FloatArray(ms*sampleRate/1000) { if (it%2==0) amp else -amp }
    fun quiet(ms: Int): FloatArray = FloatArray(ms*sampleRate/1000)
    fun concat(vararg arr: FloatArray): FloatArray {
        val result = FloatArray(arr.sumOf { it.size })
        var cursor=0
        for (a in arr) { System.arraycopy(a,0,result,cursor,a.size);cursor+=a.size }
        return result
    }
    fun loudCount(a: FloatArray): Int = a.count { abs(it) > .0035f }

    // Reported comma regression: >1 second inserted silence *inside* a single
    // sentence. Both voiced clauses must be preserved exactly.
    val comma = concat(voiced(700), quiet(1300), voiced(710), quiet(250), voiced(490))
    val fixedComma = NarrationPcmPacing.smooth(comma,sampleRate,"After all, perhaps we should go, I suppose.")
    check(fixedComma.size <= comma.size - sampleRate) { "long internal comma pause not compressed: ${fixedComma.size}" }
    check(loudCount(fixedComma)==loudCount(comma)) { "voiced samples were trimmed" }
    check(fixedComma.first()==comma.first() && fixedComma.last()==comma.last())

    // Natural 180ms silent consonant transition should not change whatsoever.
    val natural=concat(voiced(900),quiet(180),voiced(900))
    check(NarrationPcmPacing.smooth(natural,sampleRate,"Come, let us go!").contentEquals(natural))

    // The 300ms quiet interval reported by sherpa-onnx #1866 must improve.
    val shortExtra=concat(voiced(750),quiet(310),voiced(750))
    val shortFixed=NarrationPcmPacing.smooth(shortExtra,sampleRate,"Hello, world.")
    check(shortFixed.size < shortExtra.size - sampleRate/20)
    check(loudCount(shortFixed)==loudCount(shortExtra))

    val normalPhrase=concat(voiced(900),quiet(180),voiced(900))
    check(NarrationPcmPacing.smooth(normalPhrase,sampleRate,"Hello. Again!").contentEquals(normalPhrase))
    val dramatic=concat(voiced(900),quiet(650),voiced(900))
    val dramaticFixed=NarrationPcmPacing.smooth(dramatic,sampleRate,"He said... then stopped.")
    check(dramaticFixed.size < dramatic.size)
    check(dramaticFixed.size > concat(voiced(900),quiet(220),voiced(900)).size)
    check(loudCount(dramaticFixed)==loudCount(dramatic))

    // 1.4-second trailing near-silence still trimmed by previous release.
    val ending=concat(voiced(900),quiet(1400))
    val fixedEnding=NarrationPcmPacing.smooth(ending,sampleRate,"Stop!")
    check(fixedEnding.size < ending.size)
    check(loudCount(fixedEnding)==loudCount(ending))

    // No hidden damage on uninterrupted PCM, no unconditional punctuation sleep.
    val continuous=voiced(3000)
    check(NarrationPcmPacing.smooth(continuous,sampleRate,"Wait, stop? Yes!").contentEquals(continuous))
    println("PASS V5.10.2: comma inside-utterance PCM silence compression, punctuation, intact voiced audio")
}
