package com.gonzalo.gamerate

import java.io.InputStream
import java.text.Normalizer
import java.time.LocalDate
import java.util.zip.ZipInputStream
import kotlin.math.roundToInt

/**
 * Importación de Bookmory: su exportación es un .zip con un .txt por libro.
 * Cada .txt tiene "### Información del libro", uno o varios "### Registro de lectura N"
 * y, si apuntaste frases, "### Lista de notas".
 */
object Bookmory {
    class Reading(val start: Long, val end: Long, val stars: Float, val comment: String, val minutes: Int)
    class Note(val day: Long, val page: Int, val text: String)

    enum class State { READ, READING, PAUSED, DROPPED, LATER }

    class Book(
        val title: String, val author: String, val isbn: String, val pages: Int,
        val state: State, val fav: Boolean, val readings: List<Reading>, val notes: List<Note>
    ) {
        /** Lectura más reciente (la que manda en la nota y las fechas). */
        val last: Reading? get() = readings.maxByOrNull { maxOf(it.end, it.start) }

        /** Nota de 0 a 100: las estrellas (0,5 a 5) por 20; la última lectura con estrellas. */
        val score: Int
            get() = readings.filter { it.stars > 0f }.maxByOrNull { maxOf(it.end, it.start) }
                ?.let { (it.stars * 20).roundToInt().coerceIn(1, 100) } ?: 0

        val minutes: Int get() = readings.sumOf { it.minutes }
    }

    /** Sin tildes ni mayúsculas, para reconocer las etiquetas aunque cambie la forma de escribirlas. */
    private fun plain(s: String) = Normalizer.normalize(s, Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "").lowercase().trim()

    /** "4/7/2024" o "4/7/2024 23:17" → día; 0 si no hay fecha. */
    fun day(s: String): Long {
        val m = Regex("(\\d{1,2})/(\\d{1,2})/(\\d{4})").find(s) ?: return 0L
        val (d, mo, y) = m.destructured
        return try { LocalDate.of(y.toInt(), mo.toInt(), d.toInt()).toEpochDay() } catch (e: Exception) { 0L }
    }

    /** "14h 53m", "33m", "2h" → minutos. */
    fun minutes(s: String): Int {
        val h = Regex("(\\d+)\\s*h").find(s)?.groupValues?.get(1)?.toIntOrNull() ?: 0
        val m = Regex("(\\d+)\\s*m").find(s)?.groupValues?.get(1)?.toIntOrNull() ?: 0
        return h * 60 + m
    }

    /** "Pág. 432" → 432; "100,00%" (libros que se siguen por porcentaje) → 0. */
    private fun pages(s: String) = if ('%' in s) 0 else s.filter { it.isDigit() }.take(6).toIntOrNull() ?: 0

    private fun state(s: String): State {
        val p = plain(s)
        return when {
            "termin" in p || p == "leido" -> State.READ
            "pausa" in p -> State.PAUSED
            "deje" in p || "abandon" in p -> State.DROPPED
            "leyendo" in p -> State.READING
            else -> State.LATER
        }
    }

    /** Lee un .txt de Bookmory. null si no lo es. */
    fun parse(text: String): Book? {
        val lines = text.removePrefix("﻿").replace("\r\n", "\n").replace('\r', '\n').split('\n')
        // Secciones con sus campos en orden; un campo puede ocupar varias líneas (comentarios, notas).
        class Sec(val name: String) { val fields = ArrayList<Pair<String, StringBuilder>>() }
        val secs = ArrayList<Sec>()
        val field = Regex("^- ([^:\\n]{1,40}):[ \\t]?(.*)$")
        for (raw in lines) {
            val line = raw.trimEnd()
            if (line.startsWith("### ")) { secs.add(Sec(plain(line.removePrefix("### ")))); continue }
            val s = secs.lastOrNull() ?: continue
            val m = field.find(line)
            // Solo cuenta como campo nuevo si la etiqueta es una de las de Bookmory; si no, es otra línea del texto anterior.
            if (m != null && plain(m.groupValues[1]) in KEYS) {
                s.fields.add(plain(m.groupValues[1]) to StringBuilder(m.groupValues[2]))
            } else if (s.fields.isNotEmpty()) {
                s.fields.last().second.append('\n').append(line)
            }
        }
        val info = secs.firstOrNull { it.name.startsWith("informacion") } ?: return null
        fun Sec.get(k: String) = fields.firstOrNull { it.first == k }?.second?.toString()?.trim() ?: ""
        val title = info.get("titulo")
        if (title.isEmpty()) return null
        val cols = plain(info.get("colecciones"))

        val readings = secs.filter { it.name.startsWith("registro de lectura") }.map { r ->
            val per = r.get("periodo de lectura").split("~")
            Reading(
                day(per.getOrElse(0) { "" }), day(per.getOrElse(1) { "" }),
                r.get("calificaciones de estrellas").replace(',', '.').toFloatOrNull() ?: 0f,
                r.get("comentario"), minutes(r.get("tiempo total de lectura"))
            )
        }
        // Notas: cada "- Fecha:" empieza una nueva.
        val notes = ArrayList<Note>()
        secs.filter { it.name.startsWith("lista de notas") }.forEach { s ->
            var d = 0L
            var pg = 0
            for ((k, v) in s.fields) when (k) {
                "fecha" -> { d = day(v.toString()); pg = 0 }
                "pagina" -> pg = pages(v.toString())
                "contenido" -> v.toString().trim().takeIf { it.isNotEmpty() }?.let { notes.add(Note(d, pg, it)) }
            }
        }
        return Book(
            title, info.get("autores/as").split(",").first().trim(),
            info.get("isbn").filter { it.isDigit() || it == 'X' }, pages(info.get("total de paginas")),
            state(info.get("estado")), "favorito" in cols, readings, notes
        )
    }

    private val KEYS = setOf(
        "titulo", "autores/as", "traductores/as", "ilustradores/as", "narradores/as", "editorial",
        "fecha de publicacion", "idioma", "isbn", "total de paginas", "etiquetas en uso", "colecciones",
        "lista de deseos", "estado", "periodo de lectura", "calificaciones de estrellas", "comentario",
        "tiempo total de lectura", "fecha", "pagina", "tipo de nota", "contenido"
    )

    /** Abre el .zip (o un .txt suelto) y devuelve los libros, sin repetir títulos. */
    fun read(input: InputStream): List<Book> {
        val bytes = input.readBytes()
        val texts = ArrayList<String>()
        if (bytes.size > 1 && bytes[0] == 'P'.code.toByte() && bytes[1] == 'K'.code.toByte()) {
            ZipInputStream(bytes.inputStream(), Charsets.UTF_8).use { z ->
                while (true) {
                    val e = z.nextEntry ?: break
                    val n = e.name
                    if (!e.isDirectory && n.endsWith(".txt", true) && !n.contains("__MACOSX") && !n.substringAfterLast('/').startsWith("._")) {
                        texts.add(String(z.readBytes(), Charsets.UTF_8))
                    }
                }
            }
        } else texts.add(String(bytes, Charsets.UTF_8))
        val books = texts.mapNotNull { parse(it) }
        if (books.isEmpty()) throw IllegalArgumentException("no encuentro libros de Bookmory en ese archivo")
        return books.distinctBy { normName(it.title) }
    }

    private fun date(d: Long) = LocalDate.ofEpochDay(d).let { "${it.dayOfMonth}/${it.monthValue}/${it.year}" }
    private fun stars(f: Float) = (if (f % 1f == 0f) f.toInt().toString() else f.toString().replace('.', ',')) + " ★"

    /** Comentarios, relecturas y frases subrayadas, para la reseña del libro. */
    fun review(b: Book): String {
        val parts = ArrayList<String>()
        b.readings.sortedBy { it.start }.map { it.comment.trim() }.filter { it.isNotEmpty() }.distinct()
            .takeIf { it.isNotEmpty() }?.let { parts.add(it.joinToString("\n\n")) }
        val done = b.readings.filter { it.start > 0 || it.end > 0 }.sortedBy { it.start }
        if (done.size > 1) {
            parts.add(
                "Leído ${done.size} veces: " + done.joinToString(" · ") { r ->
                    val span = when {
                        r.start > 0 && r.end > 0 && r.end != r.start -> "${date(r.start)} – ${date(r.end)}"
                        else -> date(maxOf(r.start, r.end))
                    }
                    if (r.stars > 0f) "$span (${stars(r.stars)})" else span
                }
            )
        }
        if (b.notes.isNotEmpty()) {
            parts.add("Citas\n" + b.notes.sortedBy { it.day }.joinToString("\n\n") { n ->
                "«${n.text}»" + if (n.page > 0) " (pág. ${n.page})" else ""
            })
        }
        return parts.joinToString("\n\n")
    }

    /** Lo que se encontró en internet del libro: id de Open Library (0 = no está), portada y páginas. */
    class Hit(val id: Long, val cover: String, val pages: Int)

    enum class Outcome { ADDED, UPDATED, SAME }

    class Step(val games: List<Game>, val plays: List<Play>, val outcome: Outcome)

    /** Tu ficha de ese libro, si ya la tienes (mismo título o misma obra de Open Library). */
    fun existing(b: Book, hitId: Long, games: List<Game>, plays: List<Play>): Any? {
        val n = setOf(normName(b.title), normName(Goodreads.cleanTitle(b.title)))
        return games.find { normName(it.name) in n || normName(Goodreads.cleanTitle(it.name)) in n }
            ?: plays.find { normName(it.name) in n || normName(Goodreads.cleanTitle(it.name)) in n }
            ?: if (hitId > 0) games.find { it.id == hitId } ?: plays.find { it.id == hitId } else null
    }

    /** Id para un libro que Open Library no conoce: sale del título y no choca con ninguno tuyo. */
    fun fallbackId(title: String, used: Set<Long>): Long {
        var id = Goodreads.FALLBACK_ID + (normName(title).hashCode().toLong() and 0xFFFFFFF)
        while (id in used) id++
        return id
    }

    /**
     * Mete un libro de Bookmory en tus listas. Lo nuevo se añade; lo que ya tenías solo se completa
     * (fechas, autor, páginas, favorito, reseña vacía) y nunca se pisan tus notas. Si lo tenías pendiente
     * y en Bookmory está terminado, pasa a Leídos.
     */
    fun apply(b: Book, hit: Hit?, games: List<Game>, plays: List<Play>, now: Long): Step {
        val name = Goodreads.cleanTitle(b.title).ifBlank { b.title }
        val r = b.last
        val start = r?.start ?: 0L
        val end = r?.let { if (it.end > 0) it.end else it.start } ?: 0L
        val score = b.score.takeIf { it > 0 } ?: 50
        val text = review(b)
        val pages = if (b.pages > 0) b.pages else hit?.pages ?: 0
        val cover = hit?.cover ?: ""
        val status = when (b.state) {
            State.READING, State.PAUSED -> 1
            State.DROPPED -> 2
            else -> 0
        }
        when (val ex = existing(b, hit?.id ?: 0L, games, plays)) {
            is Game -> {
                // Ya lo tienes valorado: solo se rellena lo que falte.
                val noDates = ex.start == 0L && ex.end == 0L
                val g = ex.copy(
                    start = if (noDates && b.state == State.READ) start else ex.start,
                    end = if (noDates && b.state == State.READ) end else ex.end,
                    creator = ex.creator.ifBlank { b.author },
                    pages = if (ex.pages > 0) ex.pages else pages,
                    cover = ex.cover.ifBlank { cover },
                    minutes = maxOf(ex.minutes, b.minutes),
                    fav = ex.fav || b.fav,
                    review = ex.review.ifBlank { text }
                )
                return if (g == ex) Step(games, plays, Outcome.SAME)
                else Step(games.map { if (it.id == ex.id) g.copy(updated = now) else it }, plays, Outcome.UPDATED)
            }
            is Play -> {
                if (b.state == State.READ && ex.entries.isEmpty()) {
                    // Lo tenías pendiente y ya lo terminaste: pasa a Leídos con tu nota de Bookmory.
                    val g = Game(
                        ex.id, ex.name, ex.cover.ifBlank { cover }, score, score, score, score, score, text, ex.hero,
                        start, end, ex.creator.ifBlank { b.author }, b.fav, ex.platform,
                        if (ex.pages > 0) ex.pages else pages, maxOf(ex.minutes, b.minutes), now
                    )
                    return Step(games + g, plays.filter { it.id != ex.id }, Outcome.UPDATED)
                }
                val p = ex.copy(
                    status = if (ex.status == 0 && status > 0) status else ex.status,
                    start = if (ex.start == 0L) start else ex.start,
                    creator = ex.creator.ifBlank { b.author },
                    pages = if (ex.pages > 0) ex.pages else pages,
                    cover = ex.cover.ifBlank { cover },
                    minutes = maxOf(ex.minutes, b.minutes)
                )
                return if (p == ex) Step(games, plays, Outcome.SAME)
                else Step(games, plays.map { if (it.id == ex.id) p.copy(updated = now) else it }, Outcome.UPDATED)
            }
        }
        val used = (games.map { it.id } + plays.map { it.id }).toSet()
        val id = hit?.id?.takeIf { it > 0 && it !in used } ?: fallbackId(name, used)
        return if (b.state == State.READ) {
            Step(
                games + Game(id, name, cover, score, score, score, score, score, text, "", start, end, b.author,
                    b.fav, "", pages, b.minutes, now),
                plays, Outcome.ADDED
            )
        } else {
            Step(
                games,
                plays + Play(id, name, cover, "", status, emptyList(), creator = b.author, pages = pages,
                    start = if (status > 0) start else 0L, minutes = b.minutes, updated = now),
                Outcome.ADDED
            )
        }
    }
}
