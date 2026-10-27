package com.sprint7.offline
import java.io.File
import java.nio.file.Files
import java.security.MessageDigest

fun main(){
 val dir=Files.createTempDirectory("pipi-v51224-pcm-").toFile()
 try {
  val cache=NarrationAudioCache(dir,Long.MAX_VALUE,Int.MAX_VALUE)
  val pcm=ShortArray(24000){ ((it*17)%24001-12000).toShort() }
  val key=cache.key("Cross-day cache interruption test",3,1f)
  val other=cache.key("Cross-day cache interruption test",4,1f)
  check(key!=other)
  check(cache.put(key,pcm,24000))
  val voice=File(dir,"$key.pcm")
  val side=File(dir,"$key.sha256")
  check(voice.isFile && side.isFile)
  check(cache.hasDeep(key))
  check(cache.get(key)!!.pcm.contentEquals(pcm))
  // A repeated write for the same clip must not corrupt valid content.
  val old=voice.readBytes()
  check(cache.put(key,ShortArray(16){1234},24000))
  check(voice.readBytes().contentEquals(old))
  // Stale/orphaned temp files must not be mistaken for completed audio.
  File(dir,"$other.interrupted.tmp").writeBytes(byteArrayOf(1,2,3))
  check(other !in cache.existingPcmKeys())
  // Legacy clips without SHA sidecars still work and gain one on audit.
  check(side.delete());check(cache.has(key));check(cache.hasDeep(key));check(side.isFile)
  // A matching-size silent corruption must fail deep verification.
  val damaged=voice.readBytes();damaged[damaged.lastIndex]=(damaged.last().toInt() xor 1).toByte();voice.writeBytes(damaged)
  check(!cache.hasDeep(key))
  check(!voice.exists())
  check(cache.put(key,pcm,24000));check(cache.hasDeep(key))
  check(dir.listFiles()!!.none{it.name.endsWith(".tmp")&&it.name.contains(key)})
  println("PASS V5.12.24 PCM atomic temporary write, unique cache keys, dedup, sidecar recovery, SHA corruption check")
 }finally {dir.deleteRecursively()}
}
