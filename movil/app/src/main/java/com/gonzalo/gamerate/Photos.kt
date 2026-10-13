package com.gonzalo.gamerate

import android.content.Context
import android.graphics.Bitmap
import android.graphics.ImageDecoder
import android.net.Uri
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/** Fotos de tu galería usadas como portada: se copian (reducidas) dentro de la app. */
object Photos {
    private const val MAX = 1400

    /** Copia la foto elegida y devuelve su dirección para usarla como portada. */
    suspend fun import(ctx: Context, uri: Uri): String = withContext(Dispatchers.IO) {
        val src = ImageDecoder.createSource(ctx.contentResolver, uri)
        val bm = ImageDecoder.decodeBitmap(src) { dec, info, _ ->
            val w = info.size.width
            val h = info.size.height
            val s = maxOf(w, h).toFloat() / MAX
            if (s > 1f) dec.setTargetSize((w / s).toInt().coerceAtLeast(1), (h / s).toInt().coerceAtLeast(1))
            // Software: así se puede guardar y dibujar en cualquier sitio.
            dec.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
        }
        val dir = File(ctx.filesDir, "covers").apply { mkdirs() }
        val f = File(dir, "foto_${System.currentTimeMillis()}.jpg")
        f.outputStream().use { bm.compress(Bitmap.CompressFormat.JPEG, 88, it) }
        Uri.fromFile(f).toString()
    }

    /** Es una foto tuya (no está en internet, tu pareja no la puede ver). */
    fun isLocal(url: String) = url.startsWith("file:")
}
