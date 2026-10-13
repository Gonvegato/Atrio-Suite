package com.gonzalo.gamerate

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.LibraryMusic
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext

/** Videojuegos, películas y series tienen botón de banda sonora. */
val Kind.hasSoundtrack: Boolean get() = isGame || isMovie || isTv

/** Búsqueda de su banda sonora en YouTube Music (se abre en la app si la tienes). */
fun soundtrackUrl(name: String): String =
    "https://music.youtube.com/search?q=" + Uri.encode(Goodreads.cleanTitle(name).trim() + " soundtrack")

fun openSoundtrack(ctx: Context, name: String) {
    try {
        ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(soundtrackUrl(name))).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (e: Exception) { /* sin navegador ni YouTube Music: no hay nada que abrir */ }
}

@Composable
fun SoundtrackButton(name: String, modifier: Modifier = Modifier) {
    val ctx = LocalContext.current
    ActionPill(Icons.Rounded.LibraryMusic, "Banda sonora en YouTube Music", modifier) { openSoundtrack(ctx, name) }
}
