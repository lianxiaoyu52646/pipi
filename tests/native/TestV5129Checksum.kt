package com.sprint7.offline
import java.io.RandomAccessFile
import java.nio.file.Files
fun main(){
 val dir=Files.createTempDirectory("pipi-v5129-sha").toFile()
 try {
  val store=NarrationAudioCache(dir,Long.MAX_VALUE,Int.MAX_VALUE)
  val key=store.key("Careful verification after byte-level corruption.",3,1f)
  check(store.put(key,ShortArray(4096){it.toShort()},24000))
  check(store.has(key));check(store.hasDeep(key))
  val clip=dir.resolve("$key.pcm")
  RandomAccessFile(clip,"rw").use {f->f.seek(300L);f.writeByte(123)}
  check(store.has(key)) {"Lightweight header check should not scan every audio byte"}
  check(!store.hasDeep(key)) {"Full audit must detect a valid-header, same-size payload corruption"}
  check(!clip.exists())
  println("PASS: SHA-256 detects same-length PCM corruption; fast resume remains header-only")
 }finally{dir.deleteRecursively()}
}
