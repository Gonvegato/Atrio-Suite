package com.gonzalo.gamerate

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Copia automática en un archivo de Google Drive, elegido con el selector de archivos de Android.
 * No hace falta ninguna cuenta de desarrollador: escribe a través de la app de Drive del dispositivo.
 */
object DriveBackup {
    /** Guarda el permiso para seguir escribiendo en ese archivo aunque se reinicie la app. */
    fun link(ctx: Context, store: Store, uri: Uri) {
        try {
            ctx.contentResolver.takePersistableUriPermission(
                uri, Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            )
        } catch (e: Exception) { /* algunos proveedores no lo permiten; se intenta igual */ }
        store.driveUri = uri.toString()
        store.driveErr = ""
    }

    fun unlink(ctx: Context, store: Store) {
        val u = store.driveUri
        if (u.isNotBlank()) {
            try {
                ctx.contentResolver.releasePersistableUriPermission(
                    Uri.parse(u), Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                )
            } catch (e: Exception) { }
        }
        store.driveUri = ""
        store.driveErr = ""
    }

    /** Nombre del archivo vinculado (o null si no se puede leer). */
    fun name(ctx: Context, store: Store): String? {
        val u = store.driveUri
        if (u.isBlank()) return null
        return try {
            ctx.contentResolver.query(Uri.parse(u), arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
                if (c.moveToFirst()) c.getString(0) else null
            }
        } catch (e: Exception) { null }
    }

    /** Escribe con un modo concreto; si el archivo era más largo y el modo no lo recorta, se recorta a mano. */
    private fun write(ctx: Context, uri: Uri, bytes: ByteArray, mode: String): Boolean {
        val pfd = ctx.contentResolver.openFileDescriptor(uri, mode) ?: return false
        android.os.ParcelFileDescriptor.AutoCloseOutputStream(pfd).use { out ->
            out.write(bytes)
            out.flush()
            try { out.channel.truncate(bytes.size.toLong()) } catch (e: Exception) { /* tubería: no se puede recortar */ }
        }
        return true
    }

    /** Lee el archivo tal y como ha quedado y comprueba que es exactamente la copia. */
    private fun verify(ctx: Context, uri: Uri, bytes: ByteArray): Boolean = try {
        ctx.contentResolver.openInputStream(uri)?.use { it.readBytes() }?.contentEquals(bytes) == true
    } catch (e: Exception) { false }

    /**
     * Escribe la copia completa y la comprueba leyéndola otra vez. Devuelve true si ha quedado bien.
     * La subida a los servidores de Google la hace después la app de Drive.
     */
    suspend fun save(ctx: Context, store: Store): Boolean = withContext(Dispatchers.IO) {
        val u = store.driveUri
        if (u.isBlank()) return@withContext false
        val bytes = store.exportAll().toByteArray(Charsets.UTF_8)
        val uri = Uri.parse(u)
        var err = ""
        var ok = false
        // Cada proveedor entiende modos distintos: se prueban de más a menos seguro y se comprueba el resultado.
        for (mode in listOf("wt", "rwt", "w")) {
            try {
                if (write(ctx, uri, bytes, mode) && verify(ctx, uri, bytes)) { ok = true; break }
                err = "al leer el archivo no coincide con la copia"
            } catch (e: SecurityException) {
                err = "la app ya no tiene permiso para ese archivo: vuelve a vincularlo"
                break
            } catch (e: Exception) {
                err = e.message ?: "no se pudo escribir"
            }
        }
        if (ok) {
            store.driveLast = System.currentTimeMillis()
            store.driveErr = ""
        } else {
            store.driveErr = err.ifBlank { "no se pudo escribir" }
        }
        ok
    }

    /** Lee un archivo de copia. */
    suspend fun read(ctx: Context, uri: Uri): String = withContext(Dispatchers.IO) {
        ctx.contentResolver.openInputStream(uri)?.use { String(it.readBytes(), Charsets.UTF_8) } ?: error("no se pudo leer")
    }
}
