package com.sprint7.offline

import java.lang.ref.WeakReference
import java.util.concurrent.Semaphore

/** Only one Kokoro JNI model is permitted to own the CPU/RAM at a time. */
internal object KokoroModelGuard {
    val gate = Semaphore(1, true)
    @Volatile private var reader = WeakReference<ArticleVoiceEngine>(null)

    fun registerReader(engine: ArticleVoiceEngine) { reader = WeakReference(engine) }
    fun unregisterReader(engine: ArticleVoiceEngine) {
        if (reader.get() === engine) reader = WeakReference(null)
    }
    /** The user requested library precaching, so an idle/background reader
     *  must not hold the shared model lock for hours. The reader cooperatively
     *  releases its model on its own synthesis executor.
     */
    fun requestReaderRelease(): Boolean {
        val current = reader.get() ?: return false
        return try { current.releaseModel(); true } catch (_: RuntimeException) { false }
    }
}
