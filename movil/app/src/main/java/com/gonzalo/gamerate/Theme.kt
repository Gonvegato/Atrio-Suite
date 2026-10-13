package com.gonzalo.gamerate

import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/*
 * Paleta sobria: papel, superficie, una línea fina y tinta. Todo cambia solo con el modo oscuro,
 * porque cada color se lee en el momento (Mode.dark).
 */
private fun pick(light: Long, dark: Long) = Color(if (Mode.dark) dark else light)

/** Fondo de la app. */
val Paper: Color get() = pick(0xFFF4F2ED, 0xFF121214)

/** Superficie de tarjetas y paneles (antes "crudo"). */
val Crudo: Color get() = pick(0xFFFBFAF7, 0xFF1B1B1E)

/** Relleno suave (casillas, chips apagados). */
val Sand: Color get() = pick(0xFFECE9E2, 0xFF26262A)

/** Línea fina de separación. */
val Line: Color get() = pick(0xFFE2DED5, 0xFF303035)

/** Tinta principal. */
val Charcoal: Color get() = pick(0xFF1E1D22, 0xFFEDEBE6)

/** Borde de campos de texto: algo más visible que la línea fina. */
val Edge: Color get() = pick(0xFFC9C4BA, 0xFF4E4E55)

/** Texto secundario. */
val Muted: Color get() = pick(0xFF86827A, 0xFF9D988F)

val ColGeneral: Color get() = pick(0xFFC4473F, 0xFFE2665D)
val ColGfx: Color get() = pick(0xFF4E78B8, 0xFF7EA3DE)
val ColStory: Color get() = pick(0xFFBF8E34, 0xFFDDB061)
val ColMusic: Color get() = pick(0xFF3B9273, 0xFF5EBA96)
val ColGameplay: Color get() = pick(0xFF7763B8, 0xFFA18FDF)
val ColAvg: Color get() = pick(0xFF9A968E, 0xFF77736C)
val Gold: Color get() = pick(0xFFC99A22, 0xFFE2B947)

/** Dorado legible sobre fondo de tinta (avisos), en claro y en oscuro. */
val GoldOnInk: Color get() = pick(0xFFE2B947, 0xFF8A6A12)

/** Esquema de Material a partir de la paleta. */
fun appColors() = if (Mode.dark) darkColorScheme(
    primary = Charcoal, onPrimary = Crudo, secondary = Charcoal, onSecondary = Crudo,
    background = Paper, onBackground = Charcoal, surface = Crudo, onSurface = Charcoal,
    surfaceVariant = Sand, onSurfaceVariant = Charcoal, surfaceContainer = Crudo,
    surfaceContainerHigh = Crudo, surfaceContainerHighest = Sand, surfaceContainerLow = Crudo,
    outline = Edge, outlineVariant = Line, error = ColGeneral
) else lightColorScheme(
    primary = Charcoal, onPrimary = Crudo, secondary = Charcoal, onSecondary = Crudo,
    background = Paper, onBackground = Charcoal, surface = Crudo, onSurface = Charcoal,
    surfaceVariant = Sand, onSurfaceVariant = Charcoal, surfaceContainer = Crudo,
    surfaceContainerHigh = Crudo, surfaceContainerHighest = Sand, surfaceContainerLow = Crudo,
    outline = Edge, outlineVariant = Line, error = ColGeneral
)

/** Letra de títulos: serif clásica (Fraunces). */
val Display = FontFamily(
    Font(R.font.display_regular, FontWeight.Normal),
    Font(R.font.display_medium, FontWeight.Medium),
    Font(R.font.display_semibold, FontWeight.SemiBold),
    Font(R.font.display_semibold, FontWeight.Bold),
    Font(R.font.display_italic, FontWeight.Normal, FontStyle.Italic)
)

/** Letra del resto: sans neutra (Inter). */
val Body = FontFamily(
    Font(R.font.body_regular, FontWeight.Normal),
    Font(R.font.body_italic, FontWeight.Normal, FontStyle.Italic),
    Font(R.font.body_medium, FontWeight.Medium),
    Font(R.font.body_semibold, FontWeight.SemiBold),
    Font(R.font.body_bold, FontWeight.Bold),
    Font(R.font.body_bold, FontWeight.ExtraBold)
)

private val base = Typography()

private fun TextStyle.body() = copy(fontFamily = Body)
private fun TextStyle.display() = copy(fontFamily = Display, fontWeight = FontWeight.Normal)

val AppTypography = Typography(
    displayLarge = base.displayLarge.display(),
    displayMedium = base.displayMedium.display(),
    displaySmall = base.displaySmall.display(),
    headlineLarge = base.headlineLarge.display(),
    headlineMedium = base.headlineMedium.display(),
    headlineSmall = base.headlineSmall.display(),
    titleLarge = base.titleLarge.display(),
    titleMedium = base.titleMedium.body(),
    titleSmall = base.titleSmall.body(),
    bodyLarge = base.bodyLarge.body().copy(fontSize = 15.sp, lineHeight = 22.sp),
    bodyMedium = base.bodyMedium.body(),
    bodySmall = base.bodySmall.body(),
    labelLarge = base.labelLarge.body().copy(fontWeight = FontWeight.SemiBold),
    labelMedium = base.labelMedium.body().copy(fontWeight = FontWeight.Medium),
    labelSmall = base.labelSmall.body()
)

fun fmt(t: Long): String = SimpleDateFormat("dd/MM HH:mm", Locale.getDefault()).format(Date(t))

/** "12 h 30 min", "45 min" o "0 h". */
fun hoursText(minutes: Int): String {
    val h = minutes / 60
    val m = minutes % 60
    return when {
        h > 0 && m > 0 -> "$h h $m min"
        h > 0 -> "$h h"
        m > 0 -> "$m min"
        else -> "0 h"
    }
}
