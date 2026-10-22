package com.sprint7.offline

import java.util.concurrent.Semaphore

/** One CPU Kokoro model at a time: foreground reading and background caching
 * must not allocate two large ONNX sessions concurrently on small phones. */
internal object KokoroModelGuard {
    val gate = Semaphore(1, true)
}
