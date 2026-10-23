package com.sprint7.offline

import android.content.Context
import java.io.File
import java.io.RandomAccessFile
import java.nio.channels.FileLock
import java.nio.channels.OverlappingFileLockException

/** Cooperative, cross-PROCESS gate: the old Semaphore only guards one process.
 * The lock file is persistent, but the OS releases the lock if either process dies.
 * Never delete this file during cache clearing. No audio or SQLite format changes.
 */
internal object KokoroProcessGate {
    class Lease internal constructor(private val file: RandomAccessFile, private val lock: FileLock): AutoCloseable {
        override fun close() {
            try { lock.release() } finally { file.close() }
        }
    }
    fun acquire(context:Context, mayWait:()->Boolean, maxWaitMs:Long=0L,
                onWait:()->Unit={}): Lease? {
        val lockFile=File(context.filesDir,"pipi_kokoro_process_gate.lock")
        val file=RandomAccessFile(lockFile,"rw")
        val began=android.os.SystemClock.elapsedRealtime()
        var announced=false
        var handedOff=false
        try {
            while(mayWait()) {
                val lock=try {file.channel.tryLock()}catch(_:OverlappingFileLockException){null}
                if(lock!=null){handedOff=true;return Lease(file,lock)}
                if(maxWaitMs>0 && android.os.SystemClock.elapsedRealtime()-began>=maxWaitMs)return null
                if(!announced){onWait();announced=true}
                Thread.sleep(250L)
            }
            return null
        } finally {
            if(!handedOff)file.close()
        }
    }
}
