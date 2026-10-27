package com.sprint7.offline
import java.nio.file.Files
fun main(){
 val dir=Files.createTempDirectory("pipi-voice-restore-").toFile()
 try {
  val c=NarrationAudioCache(dir,Long.MAX_VALUE,Int.MAX_VALUE)
  val a=c.key("A recovered phrase.",3,1f)
  val b=c.key("A different voice cache.",7,1f)
  val pcm=ShortArray(4096){(it%1000).toShort()}
  check(c.put(a,pcm,24000));check(c.put(b,pcm,24000))
  val found=c.existingPcmKeys().toSet()
  check(a in found && b in found && found.size==2)
  check(c.has(a) && c.has(b))
  // Calling the enumerator only enumerates: it must never mutate audio content.
  check(c.existingPcmKeys().toSet()==found)
  check(c.get(a)!!.pcm.contentEquals(pcm))
  println("PASS valid PCM discovery for recovery; no file deletion; separate voice hashes stay distinct")
 }finally {dir.deleteRecursively()}
}
