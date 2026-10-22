package com.sprint7.offline
fun main() {
  val text="A rather long, complex sentence " + "with punctuation, words and spaces; ".repeat(55)
  for(limit in listOf(90,140,220)) {
    val bits=NarrationSynthesisPlan.pieces(text,limit)
    check(bits.size>1)
    check(bits.all{it.isNotEmpty() && it.length<=limit})
    check(bits.joinToString(" ").trim().replace(Regex("\\s+")," ")==text.trim().replace(Regex("\\s+")," "))
  }
  check(NarrationSynthesisPlan.pieces("Hello.") == listOf("Hello."))
  println("PASS bounded native synthesis parts and original text preservation")
}
