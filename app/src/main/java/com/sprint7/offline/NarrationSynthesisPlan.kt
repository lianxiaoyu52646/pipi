package com.sprint7.offline

/** Bound each native generate() call without changing the cache key: the complete
 *  original sentence is still stored as one clip, and readers can reuse it. */
internal object NarrationSynthesisPlan {
    fun pieces(text: String, maxChars: Int = 220): List<String> {
        require(maxChars >= 48)
        val source = text.trim()
        if (source.length <= maxChars) return listOf(source)
        val result = mutableListOf<String>()
        var start = 0
        while (start < source.length) {
            val tentative = minOf(start + maxChars, source.length)
            if (tentative == source.length) { result.add(source.substring(start)); break }
            val minBreak = start + maxChars / 2
            var end = tentative
            for (at in tentative downTo minBreak) {
                if (source[at - 1].isWhitespace() || source[at - 1] in ",;:.!?") {
                    end = at
                    break
                }
            }
            result.add(source.substring(start, end).trim())
            start = end
            while (start < source.length && source[start].isWhitespace()) start++
        }
        return result.filter { it.isNotEmpty() }
    }
}
