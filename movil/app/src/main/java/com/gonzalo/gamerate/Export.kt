package com.gonzalo.gamerate

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.drawable.BitmapDrawable
import android.graphics.pdf.PdfDocument
import android.os.Environment
import android.provider.MediaStore
import android.text.StaticLayout
import android.text.TextPaint
import coil.ImageLoader
import coil.request.ImageRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

object Export {
    private const val W = 1080
    // La ficha exportada siempre es clara, aunque la app esté en modo oscuro.
    private val CRUDO = 0xFFF4F2ED.toInt()
    private val SAND = 0xFFECE9E2.toInt()
    private val LINE = 0xFFE2DED5.toInt()
    private val CHAR = 0xFF1E1D22.toInt()
    private val MUTED = 0xFF86827A.toInt()
    private val COLS = intArrayOf(
        0xFFC4473F.toInt(), 0xFF4E78B8.toInt(), 0xFFBF8E34.toInt(),
        0xFF3B9273.toInt(), 0xFF7763B8.toInt()
    )

    private suspend fun load(ctx: Context, url: String): Bitmap? {
        if (url.isBlank()) return null
        return try {
            val r = ImageRequest.Builder(ctx).data(url).allowHardware(false).build()
            (ImageLoader(ctx).execute(r).drawable as? BitmapDrawable)?.bitmap
        } catch (e: Exception) { null }
    }

    private fun fill(col: Int) = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = col }

    private fun blurry(b: Bitmap): Bitmap =
        Bitmap.createScaledBitmap(b, maxOf(1, b.width / 24), maxOf(1, b.height / 24), true)

    private fun drawCrop(c: Canvas, b: Bitmap, l: Float, t: Float, r: Float, bt: Float) {
        val dw = r - l
        val dh = bt - t
        val s = maxOf(dw / b.width, dh / b.height)
        val sw = dw / s
        val sh = dh / s
        val sx = (b.width - sw) / 2f
        val sy = (b.height - sh) / 2f
        c.drawBitmap(b, Rect(sx.toInt(), sy.toInt(), (sx + sw).toInt(), (sy + sh).toInt()),
            RectF(l, t, r, bt), Paint(Paint.FILTER_BITMAP_FLAG))
    }

    private var body: Typeface = Typeface.DEFAULT
    private var bodyBold: Typeface = Typeface.DEFAULT_BOLD
    private var display: Typeface = Typeface.DEFAULT_BOLD

    private fun fonts(ctx: Context) {
        try {
            body = ctx.resources.getFont(R.font.body_regular)
            bodyBold = ctx.resources.getFont(R.font.body_semibold)
            display = ctx.resources.getFont(R.font.display_regular)
        } catch (e: Exception) { /* se quedan las de sistema */ }
    }

    private fun text(c: Canvas, s: String, x: Float, y: Float, size: Float, col: Int, bold: Boolean) {
        val p = Paint(Paint.ANTI_ALIAS_FLAG)
        p.color = col
        p.textSize = size
        p.textAlign = Paint.Align.CENTER
        p.typeface = if (bold) bodyBold else body
        c.drawText(s, x, y, p)
    }

    private fun ring(c: Canvas, cx: Float, cy: Float, d: Float, value: Int, col: Int) {
        val sw = d * 0.05f
        val r = RectF(cx - d / 2 + sw / 2, cy - d / 2 + sw / 2, cx + d / 2 - sw / 2, cy + d / 2 - sw / 2)
        val p = Paint(Paint.ANTI_ALIAS_FLAG)
        p.style = Paint.Style.STROKE
        p.strokeWidth = sw
        p.strokeCap = Paint.Cap.ROUND
        p.color = LINE
        c.drawArc(r, 120f, 300f, false, p)
        p.color = col
        if (value > 0) c.drawArc(r, 120f, 300f * value / 100f, false, p)
        val tp = Paint(Paint.ANTI_ALIAS_FLAG)
        tp.color = CHAR
        tp.textSize = d * 0.32f
        tp.textAlign = Paint.Align.CENTER
        tp.typeface = display
        c.drawText("$value", cx, cy + d * 0.32f * 0.35f, tp)
    }

    suspend fun render(ctx: Context, g: Game, kind: Kind): Bitmap = withContext(Dispatchers.Default) {
        fonts(ctx)
        val hero = load(ctx, g.hero)
        val cover = load(ctx, g.cover)
        val bg: Bitmap? = hero ?: if (kind.isBook && cover != null) blurry(cover) else null
        val tp = TextPaint(Paint.ANTI_ALIAS_FLAG)
        tp.color = CHAR
        tp.textSize = 38f
        tp.typeface = body
        val review = g.review.ifBlank { " " }
        val sl = StaticLayout.Builder.obtain(review, 0, review.length, tp, W - 120)
            .setLineSpacing(0f, 1.2f).build()
        val reviewTop = 1550f
        val h = (reviewTop + sl.height + 150f).toInt()

        val bm = Bitmap.createBitmap(W, h, Bitmap.Config.ARGB_8888)
        val c = Canvas(bm)
        c.drawColor(CRUDO)

        val heroH = 420f
        c.save()
        c.clipRect(0f, 0f, W.toFloat(), heroH)
        if (bg != null) {
            drawCrop(c, bg, 0f, 0f, W.toFloat(), heroH)
            if (hero == null) c.drawRect(0f, 0f, W.toFloat(), heroH, fill(0x33000000))
        } else {
            c.drawRect(0f, 0f, W.toFloat(), heroH, fill(SAND))
        }
        c.restore()

        val cw = 300f
        val ch = 450f
        val cl = (W - cw) / 2f
        val ct = 110f
        c.drawRoundRect(RectF(cl, ct + 6f, cl + cw, ct + ch + 6f), 24f, 24f, fill(0x22000000))
        c.save()
        c.clipPath(Path().apply { addRoundRect(RectF(cl, ct, cl + cw, ct + ch), 24f, 24f, Path.Direction.CW) })
        if (cover != null) drawCrop(c, cover, cl, ct, cl + cw, ct + ch)
        else c.drawRect(cl, ct, cl + cw, ct + ch, fill(SAND))
        c.restore()

        val np = Paint(Paint.ANTI_ALIAS_FLAG)
        np.typeface = display
        np.textAlign = Paint.Align.CENTER
        np.color = CHAR
        var ts = 54f
        np.textSize = ts
        while (np.measureText(g.name) > W - 120 && ts > 28f) { ts -= 2f; np.textSize = ts }
        c.drawText(g.name, W / 2f, 650f, np)
        val extra = listOfNotNull(
            g.creator.ifBlank { null }, g.platform.ifBlank { null },
            if (!kind.isBook && g.minutes > 0) hoursText(g.minutes) else null,
            if (kind.isBook && g.pages > 0) "${g.pages} págs." else null
        ).joinToString(" · ")
        text(c, if (extra.isNotEmpty()) extra else "Media de criterios: ${"%.1f".format(g.avgFor(kind))}", W / 2f, 710f, 34f, MUTED, false)

        val v = g.scores()
        ring(c, W / 2f, 930f, 340f, v[0], COLS[0])
        text(c, kind.labels[0].uppercase(), W / 2f, 1155f, 30f, MUTED, true)
        val n = kind.crit
        for (i in 1..n) {
            val cx = W * (i - 0.5f) / n
            ring(c, cx, 1330f, 180f, v[i], COLS[i])
            text(c, kind.labels[i].uppercase(), cx, 1470f, 24f, MUTED, true)
        }

        c.save()
        c.translate(60f, reviewTop)
        sl.draw(c)
        c.restore()
        val wp = Paint(Paint.ANTI_ALIAS_FLAG)
        wp.color = MUTED
        wp.textSize = 30f
        wp.textAlign = Paint.Align.CENTER
        wp.typeface = display
        c.drawText("Ronrón", W / 2f, h - 50f, wp)
        bm
    }

    /**
     * Resumen del año para compartir: cifras grandes, el mejor valorado, el top 3 con portadas
     * y un gráfico de meses. Formato vertical (1080×1920), pensado para historias.
     */
    suspend fun renderYear(ctx: Context, kind: Kind, all: List<Game>, year: Int, name: String): Bitmap = withContext(Dispatchers.Default) {
        fonts(ctx)
        val games = all.filter { it.end > 0L && java.time.LocalDate.ofEpochDay(it.end).year == year }
        val top = games.sortedByDescending { it.general }.take(3)
        val covers = top.map { load(ctx, it.cover) }
        val H = 1920
        val bm = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888)
        val c = Canvas(bm)
        c.drawColor(CRUDO)
        val m = 90f

        fun left(s: String, x: Float, y: Float, size: Float, col: Int, tf: Typeface) {
            val p = Paint(Paint.ANTI_ALIAS_FLAG)
            p.color = col; p.textSize = size; p.typeface = tf
            var ts = size
            while (p.measureText(s) > W - x - m && ts > 20f) { ts -= 2f; p.textSize = ts }
            c.drawText(s, x, y, p)
        }

        left(("Ronrón · " + kind.title).uppercase(), m, 170f, 30f, MUTED, bodyBold)
        left(if (name.isNotBlank()) "El $year de $name" else "Mi $year", m, 270f, 84f, CHAR, display)
        c.drawRect(m, 330f, W - m, 332f, fill(LINE))

        // Cifras
        val avg = if (games.isEmpty()) 0 else games.map { it.general }.average().toInt()
        val third = when {
            kind.isBook -> {
                val pg = games.sumOf { it.pages }
                (if (pg > 0) "$pg" else "—") to "páginas"
            }
            kind.isGame -> {
                val mins = games.sumOf { it.minutes }
                (if (mins > 0) "${mins / 60}" else "—") to "horas"
            }
            else -> "${games.count { it.fav }}" to "favoritos"
        }
        val nums = listOf("${games.size}" to kind.doneWord.lowercase(), "$avg" to "nota media", third)
        nums.forEachIndexed { i, (v, l) ->
            val x = m + i * (W - 2 * m) / 3f
            left(v, x, 500f, 120f, CHAR, display)
            left(l, x, 556f, 32f, MUTED, body)
        }
        c.drawRect(m, 620f, W - m, 622f, fill(LINE))

        // Top 3
        left("LO MEJOR DEL AÑO", m, 700f, 28f, MUTED, bodyBold)
        val cw = (W - 2 * m - 2 * 40f) / 3f
        val ch = cw * 1.5f
        top.forEachIndexed { i, g ->
            val l = m + i * (cw + 40f)
            val t = 740f
            c.save()
            c.clipPath(Path().apply { addRoundRect(RectF(l, t, l + cw, t + ch), 18f, 18f, Path.Direction.CW) })
            val b = covers[i]
            if (b != null) drawCrop(c, b, l, t, l + cw, t + ch) else c.drawRect(l, t, l + cw, t + ch, fill(SAND))
            c.restore()
            val sp = Paint(Paint.ANTI_ALIAS_FLAG)
            sp.color = CHAR; sp.textSize = 30f; sp.typeface = body
            var nm = g.name
            while (sp.measureText(nm) > cw && nm.length > 3) nm = nm.dropLast(2) + "…"
            c.drawText(nm, l, t + ch + 50f, sp)
            sp.color = MUTED; sp.typeface = bodyBold
            c.drawText("${i + 1}º · ${g.general}", l, t + ch + 92f, sp)
        }
        val afterTop = 740f + ch + 200f

        // Meses
        left("MES A MES", m, afterTop, 28f, MUTED, bodyBold)
        val counts = (1..12).map { mo -> games.count { java.time.LocalDate.ofEpochDay(it.end).monthValue == mo } }
        val mx = (counts.maxOrNull() ?: 1).coerceAtLeast(1)
        val chartTop = afterTop + 40f
        val chartH = 220f
        val slot = (W - 2 * m) / 12f
        val letters = "EFMAMJJASOND"
        counts.forEachIndexed { i, n ->
            val x = m + i * slot + slot * 0.25f
            val h = if (n == 0) 4f else chartH * n / mx
            c.drawRoundRect(RectF(x, chartTop + chartH - h, x + slot * 0.5f, chartTop + chartH), 6f, 6f, fill(if (n == 0) LINE else CHAR))
            text(c, letters[i].toString(), x + slot * 0.25f, chartTop + chartH + 44f, 26f, MUTED, false)
        }

        // Pie: estudio/autor más repetido
        val fav = games.filter { it.creator.isNotBlank() }.groupBy { it.creator.trim() }.maxByOrNull { it.value.size }
        if (fav != null && fav.value.size >= 2) {
            left(kind.creatorWord.uppercase() + " DEL AÑO", m, chartTop + chartH + 140f, 28f, MUTED, bodyBold)
            left(fav.key + " · " + fav.value.size, m, chartTop + chartH + 200f, 48f, CHAR, display)
        }
        val wp = Paint(Paint.ANTI_ALIAS_FLAG)
        wp.color = MUTED; wp.textSize = 30f; wp.textAlign = Paint.Align.CENTER; wp.typeface = display
        c.drawText("Ronrón", W / 2f, H - 70f, wp)
        bm
    }

    /** Guarda el JPG en Imágenes/GameRate y devuelve su dirección (null si falla). */
    fun saveJpgUri(ctx: Context, bm: Bitmap, name: String): Uri? {
        val cv = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, "$name.jpg")
            put(MediaStore.MediaColumns.MIME_TYPE, "image/jpeg")
            put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/GameRate")
        }
        val uri = ctx.contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cv) ?: return null
        val ok = ctx.contentResolver.openOutputStream(uri)?.use { bm.compress(Bitmap.CompressFormat.JPEG, 92, it) } ?: false
        return if (ok) uri else null
    }

    /** Abre el menú de compartir de Android con la imagen. */
    fun share(ctx: Context, uri: Uri, title: String) {
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "image/jpeg"
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_TEXT, title)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        val chooser = Intent.createChooser(send, "Compartir ficha")
        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        ctx.startActivity(chooser)
    }

    fun saveJpg(ctx: Context, bm: Bitmap, name: String): Boolean {
        val cv = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, "$name.jpg")
            put(MediaStore.MediaColumns.MIME_TYPE, "image/jpeg")
            put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/GameRate")
        }
        val uri = ctx.contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cv) ?: return false
        val ok = ctx.contentResolver.openOutputStream(uri)?.use { bm.compress(Bitmap.CompressFormat.JPEG, 92, it) } ?: false
        return ok
    }

    fun savePdf(ctx: Context, bm: Bitmap, name: String): Boolean {
        val cv = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, "$name.pdf")
            put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf")
            put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/GameRate")
        }
        val uri = ctx.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv) ?: return false
        val doc = PdfDocument()
        try {
            val page = doc.startPage(PdfDocument.PageInfo.Builder(bm.width, bm.height, 1).create())
            page.canvas.drawBitmap(bm, 0f, 0f, null)
            doc.finishPage(page)
            val ok = ctx.contentResolver.openOutputStream(uri)?.use { doc.writeTo(it); true } ?: false
            return ok
        } finally {
            doc.close()
        }
    }
}
