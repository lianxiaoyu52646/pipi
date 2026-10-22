package com.sprint7.offline
import java.nio.file.Files
fun main(){
  val folder=Files.createTempDirectory("pipi-fullbook-audio").toFile()
  try {
    val bulk=NarrationAudioCache(folder,Long.MAX_VALUE,Int.MAX_VALUE)
    val pcm=ShortArray(25000){i -> (i%32767).toShort()}
    val one=bulk.key("Hello, there!",3,1f)
    val two=bulk.key("Hello, there!",7,1f)
    check(one!=two)
    check(bulk.put(one,pcm,24000))
    check(bulk.has(one))
    check(bulk.get(one)?.pcm?.contentEquals(pcm)==true)
    bulk.trim() // Must never remove full-book precomputation.
    check(bulk.has(one))
    folder.resolve("$two.pcm").writeBytes(ByteArray(64){42})
    check(!bulk.has(two))
    check(!folder.resolve("$two.pcm").exists())
    // App-created cache objects use the exact same keys and share persisted data.
    val playback=NarrationAudioCache(folder,Long.MAX_VALUE,Int.MAX_VALUE)
    check(playback.get(one)?.pcm?.contentEquals(pcm)==true)
    println("PASS durable shared cache; no auto-eviction; corrupt header redone; speaker isolation")
  } finally{folder.deleteRecursively()}
}
