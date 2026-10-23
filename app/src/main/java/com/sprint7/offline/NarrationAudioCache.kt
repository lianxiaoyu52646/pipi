package com.sprint7.offline

import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.security.MessageDigest

/** Versioned, corruption-checked disk cache of synthesized Kokoro PCM-16 clips. */
class NarrationAudioCache(private val directory: File, private val maxBytes: Long = 144L * 1024 * 1024, private val maxEntries: Int = 1500) {
    data class Clip(val pcm: ShortArray, val sampleRate: Int)
    private val magic = 0x50495049
    private val version = 2
    // Some authentic book sentences exceed 90 seconds at 0.75x. Rejecting
    // them made the cache service endlessly retry the same never-storable clip.
    private val maxClipSeconds = 300
    private var saves = 0

    fun key(text: String, speaker: Int, speed: Float): String {
        val bytes = "kokoro-int8-en-v0_19|natural-envelope-v5108|$speaker|${speed.toRawBits()}|$text".toByteArray(Charsets.UTF_8)
        return MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
    }

    fun get(key: String): Clip? {
        val file = fileFor(key)
        if (!file.isFile) return null
        return try {
            if(!verifyDigestIfPresent(key)){file.delete();digestFile(key).delete();return null}
            DataInputStream(BufferedInputStream(FileInputStream(file))).use { input ->
                if (input.readInt() != magic || input.readInt() != version) error("cache version")
                val rate = input.readInt()
                val samples = input.readInt()
                if (rate !in 8000..96000 || samples !in 1..(rate * maxClipSeconds) || file.length() != 16L + samples * 2L) error("cache length")
                val pcm = ShortArray(samples) { input.readShort() }
                file.setLastModified(System.currentTimeMillis())
                Clip(pcm, rate)
            }
        } catch (_: Exception) {
            file.delete() // Truncated/incompatible cache is never played.
            null
        }
    }

    fun put(key: String, pcm: ShortArray, sampleRate: Int): Boolean {
        if (sampleRate !in 8000..96000 || pcm.isEmpty() || pcm.size > sampleRate * maxClipSeconds) return false
        try {
            directory.mkdirs()
            // The cache is optional; reserve breathing room for Android itself.
            if (directory.usableSpace < 256L * 1024L * 1024L) return false
            val target = fileFor(key)
            val temp = File(directory, "$key.tmp")
            DataOutputStream(BufferedOutputStream(FileOutputStream(temp))).use { out ->
                out.writeInt(magic)
                out.writeInt(version)
                out.writeInt(sampleRate)
                out.writeInt(pcm.size)
                // PCM bulk writes avoid a virtual writeShort call per sample;
                // bytes remain big-endian, identical to legacy v2 cache format.
                val bytes = ByteArray(64 * 1024)
                var offset = 0
                while (offset < pcm.size) {
                    val count = minOf(bytes.size / 2, pcm.size - offset)
                    for (i in 0 until count) {
                        val sample = pcm[offset + i].toInt()
                        bytes[i * 2] = (sample ushr 8).toByte()
                        bytes[i * 2 + 1] = sample.toByte()
                    }
                    out.write(bytes, 0, count * 2)
                    offset += count
                }
            }
            if (!temp.renameTo(target)) {
                temp.delete()
                return false
            }
            // Integrity metadata is optional for legacy v2 clips but mandatory
            // for newly generated clips; the PCM byte format never changes.
            digestFile(key).writeText(fileSha256(target),Charsets.UTF_8)
            saves++
            if (saves % 12 == 0 && maxBytes != Long.MAX_VALUE) trim()
            return true
        } catch (_: Exception) { return false }
    }

    fun has(key: String): Boolean {
        val file = fileFor(key)
        if (!file.isFile || file.length() < 18) return false
        return try {
            // Validate all header bytes and exact length without loading the PCM.
            DataInputStream(BufferedInputStream(FileInputStream(file))).use { input ->
                val m = input.readInt(); val v = input.readInt()
                val rate = input.readInt(); val samples = input.readInt()
                val valid = m == magic && v == version && rate in 8000..96000 &&
                    samples in 1..(rate * maxClipSeconds) && file.length() == 16L + samples * 2L
                if (!valid) file.delete()
                valid
            }
        } catch (_: Exception) { file.delete(); false }
    }

    private fun digestFile(key:String)=File(directory,"$key.sha256")
    private fun fileSha256(file:File):String {
        val digest=MessageDigest.getInstance("SHA-256")
        FileInputStream(file).use{input->
            val buf=ByteArray(64*1024)
            while(true){val n=input.read(buf);if(n<0)break;digest.update(buf,0,n)}
        }
        return digest.digest().joinToString(""){ "%02x".format(it) }
    }
    private fun verifyDigestIfPresent(key:String):Boolean {
        val side=digestFile(key)
        return !side.exists() || side.readText(Charsets.UTF_8).trim()==fileSha256(fileFor(key))
    }
    /** Strong verification only on full audit / actual playback; ordinary queue lookups
     * stay fast (header + length) and never hash all 80k audio clips on each resume.
     * Legacy v2 clips receive a checksum sidecar on their first full audit.
     */
    fun hasDeep(key:String):Boolean {
        if(!has(key))return false
        val file=fileFor(key)
        return try{
            val side=digestFile(key)
            val digest=fileSha256(file)
            if(side.exists() && side.readText(Charsets.UTF_8).trim()!=digest){
                file.delete();side.delete();false
            }else {
                if(!side.exists())side.writeText(digest,Charsets.UTF_8)
                true
            }
        }catch(_:Exception){false}
    }

    fun trim() {
        if (maxBytes == Long.MAX_VALUE && maxEntries == Int.MAX_VALUE) return
        val files = directory.listFiles()?.filter { it.isFile && it.extension == "pcm" }
            ?.sortedByDescending { it.lastModified() } ?: return
        var total = 0L
        for ((index, file) in files.withIndex()) {
            val bytes = file.length()
            if (total + bytes > maxBytes || index >= maxEntries) { file.delete();File(directory,file.nameWithoutExtension+".sha256").delete() }
            else total += bytes
        }
    }

    private fun fileFor(key: String): File {
        require(key.length == 64 && key.all { it in '0'..'9' || it in 'a'..'f' })
        return File(directory, "$key.pcm")
    }
}
