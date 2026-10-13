package com.gonzalo.gamerate

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.time.LocalDate
import java.time.format.DateTimeFormatter

private const val IUA = "Atrio/4.3 (app personal; Android)"

private fun iget(url: String): String {
    val c = URL(url).openConnection() as HttpURLConnection
    c.setRequestProperty("User-Agent", IUA)
    c.connectTimeout = 15000
    c.readTimeout = 20000
    try {
        val code = c.responseCode
        if (code !in 200..299) throw HttpError(code, "El servidor respondió $code")
        return c.inputStream.bufferedReader().readText()
    } finally {
        c.disconnect()
    }
}

private fun ienc(s: String) = URLEncoder.encode(s.trim(), "UTF-8")

/** Lee un CSV respetando comillas, comas y saltos de línea dentro de los campos. */
fun parseCsv(text: String): List<List<String>> {
    val rows = ArrayList<List<String>>()
    var row = ArrayList<String>()
    val cell = StringBuilder()
    var quoted = false
    var i = 0
    val t = text.removePrefix("﻿")
    while (i < t.length) {
        val ch = t[i]
        if (quoted) {
            if (ch == '"') {
                if (i + 1 < t.length && t[i + 1] == '"') { cell.append('"'); i++ } else quoted = false
            } else cell.append(ch)
        } else when (ch) {
            '"' -> quoted = true
            ',' -> { row.add(cell.toString()); cell.clear() }
            '\r' -> {}
            '\n' -> { row.add(cell.toString()); cell.clear(); rows.add(row); row = ArrayList() }
            else -> cell.append(ch)
        }
        i++
    }
    if (cell.isNotEmpty() || row.isNotEmpty()) { row.add(cell.toString()); rows.add(row) }
    return rows.filter { r -> r.any { it.isNotBlank() } }
}

/** Importación de la biblioteca exportada desde Goodreads (Mis libros → Importar/exportar). */
object Goodreads {
    class Book(
        val title: String, val author: String, val rating: Int, val read: Long, val shelf: String,
        val pages: Int, val review: String, val isbn: String, val grId: Long
    )

    private val DAY = DateTimeFormatter.ofPattern("yyyy/MM/dd")

    /** Ids a partir de aquí: libros que Open Library no encontró (no tienen portadas allí). */
    const val FALLBACK_ID = 8_000_000_000L

    /** Quita la saga del título: "Dune (Dune Chronicles, #1)" → "Dune". */
    fun cleanTitle(t: String) = t.replace(Regex("\\s*\\([^)]*#[^)]*\\)\\s*$"), "").trim()

    private fun day(s: String): Long = try { LocalDate.parse(s.trim(), DAY).toEpochDay() } catch (e: Exception) { 0L }

    /** Quita el ="…" con el que Goodreads protege los ISBN. */
    private fun isbn(s: String) = s.trim().removePrefix("=").trim('"')

    fun parse(text: String): List<Book> {
        val rows = parseCsv(text)
        if (rows.isEmpty()) throw IllegalArgumentException("el archivo está vacío")
        val h = rows[0].map { it.trim().lowercase() }
        fun col(name: String) = h.indexOf(name.lowercase())
        val iTitle = col("Title")
        if (iTitle < 0 || col("Exclusive Shelf") < 0) throw IllegalArgumentException("no parece una exportación de Goodreads")
        val iAuthor = col("Author"); val iRating = col("My Rating"); val iRead = col("Date Read")
        val iShelf = col("Exclusive Shelf"); val iPages = col("Number of Pages"); val iReview = col("My Review")
        val iIsbn = col("ISBN13"); val iId = col("Book Id")
        fun at(r: List<String>, i: Int) = if (i in r.indices) r[i] else ""
        return rows.drop(1).mapNotNull { r ->
            val title = at(r, iTitle).trim()
            if (title.isEmpty()) null else Book(
                title, at(r, iAuthor).trim(), at(r, iRating).trim().toIntOrNull() ?: 0, day(at(r, iRead)),
                at(r, iShelf).trim(), at(r, iPages).trim().toIntOrNull() ?: 0,
                at(r, iReview).replace(Regex("<br\\s*/?>"), "\n").replace(Regex("<[^>]+>"), "").trim(),
                isbn(at(r, iIsbn)), at(r, iId).trim().toLongOrNull() ?: 0L
            )
        }
    }

    class Found(val id: Long, val cover: String, val pages: Int)

    /** Busca la obra en Open Library para tener su id y su portada. */
    suspend fun lookup(b: Book): Found? = withContext(Dispatchers.IO) {
        val clean = cleanTitle(b.title)
        val url = "https://openlibrary.org/search.json?title=${ienc(clean)}" +
            (if (b.author.isNotBlank()) "&author=${ienc(b.author)}" else "") +
            "&fields=key,cover_i,number_of_pages_median&limit=1"
        try {
            val docs = JSONObject(iget(url)).optJSONArray("docs")
            val o = docs?.optJSONObject(0) ?: return@withContext null
            val id = o.optString("key").filter { it.isDigit() }.toLongOrNull() ?: return@withContext null
            val ci = o.optLong("cover_i", 0L)
            Found(
                id,
                when {
                    ci > 0 -> "https://covers.openlibrary.org/b/id/$ci-L.jpg"
                    b.isbn.length >= 10 -> "https://covers.openlibrary.org/b/isbn/${b.isbn}-L.jpg"
                    else -> ""
                },
                o.optInt("number_of_pages_median", 0)
            )
        } catch (e: Exception) { null }
    }

    class Result(val games: List<Game>, val plays: List<Play>, val added: Int, val skipped: Int)

    /**
     * Convierte los libros en fichas: "read" → leídos (la nota de 1–5 estrellas pasa a 20–100),
     * "currently-reading" → leyendo y el resto → en lista. Los que ya tienes no se tocan.
     */
    suspend fun import(
        books: List<Book>, have: List<Game>, havePlays: List<Play>, progress: (Int, Int, String) -> Unit
    ): Result {
        val names = (have.map { normName(it.name) } + havePlays.map { normName(it.name) }).toMutableSet()
        val ids = (have.map { it.id } + havePlays.map { it.id }).toMutableSet()
        val gs = ArrayList<Game>()
        val ps = ArrayList<Play>()
        var skipped = 0
        val now = System.currentTimeMillis()
        books.forEachIndexed { i, b ->
            progress(i + 1, books.size, b.title)
            if (normName(b.title) in names || normName(cleanTitle(b.title)) in names) { skipped++; return@forEachIndexed }
            val f = lookup(b)
            delay(350) // Open Library pide no saturarla
            // Si Open Library dice que es una obra que ya tienes, no se duplica.
            if (f != null && f.id in ids) { skipped++; return@forEachIndexed }
            val id = f?.id ?: (FALLBACK_ID + (if (b.grId > 0) b.grId else (b.title.hashCode().toLong() and 0xFFFFFFF)))
            if (id in ids) { skipped++; return@forEachIndexed }
            ids.add(id); names.add(normName(b.title))
            val cover = f?.cover ?: if (b.isbn.length >= 10) "https://covers.openlibrary.org/b/isbn/${b.isbn}-L.jpg" else ""
            val pages = if (b.pages > 0) b.pages else f?.pages ?: 0
            when (b.shelf) {
                "read" -> {
                    val sc = if (b.rating in 1..5) b.rating * 20 else 50
                    gs.add(Game(id, b.title, cover, sc, sc, sc, sc, sc, b.review, "", 0L, b.read, b.author,
                        pages = pages, updated = now))
                }
                "currently-reading" -> ps.add(Play(id, b.title, cover, "", 1, emptyList(), creator = b.author, pages = pages, updated = now))
                else -> ps.add(Play(id, b.title, cover, "", 0, emptyList(), creator = b.author, pages = pages, updated = now))
            }
        }
        return Result(gs, ps, gs.size + ps.size, skipped)
    }
}

/**
 * Busca un libro importado para tener su id de Open Library, su portada y sus páginas:
 * primero por ISBN, luego por título y autor, luego solo por título (comprobando el autor).
 * Si Open Library no tiene portada, se prueba con Google Books.
 */
object BookFind {
    private const val F = "&fields=key,title,author_name,cover_i,number_of_pages_median"

    private fun plainWords(s: String) = java.text.Normalizer.normalize(s, java.text.Normalizer.Form.NFD)
        .replace(Regex("\\p{M}+"), "").lowercase().split(Regex("[^a-z]+")).filter { it.length > 2 }.toSet()

    /**
     * Mismo título, o uno empieza por el otro ("Alas de hierro" ↔ "Alas de hierro (Empíreo 2)").
     * Si solo está en medio ("Estuche La Selección") no vale: suele ser un estuche u otra obra.
     */
    private fun sameTitle(want: String, got: String): Boolean {
        val a = normName(want)
        val b = normName(got)
        return a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a))
    }

    /** Comparte al menos un apellido o nombre con el autor (palabras completas). */
    private fun sameAuthor(want: String, got: org.json.JSONArray?): Boolean {
        val w = plainWords(want)
        if (w.isEmpty() || got == null) return w.isEmpty()
        return (0 until got.length()).any { i -> plainWords(got.optString(i)).any { it in w } }
    }

    private fun docs(url: String): List<JSONObject> = try {
        val a = JSONObject(iget(url)).optJSONArray("docs")
        if (a == null) emptyList() else (0 until a.length()).map { a.getJSONObject(it) }
    } catch (e: Exception) { emptyList() }

    /** El mejor resultado: título exacto antes que parecido, y con portada antes que sin ella. */
    private fun best(title: String, l: List<JSONObject>): JSONObject? = l.maxByOrNull { o ->
        val t = o.optString("title")
        (if (normName(t) == normName(title)) 4 else if (normName(t).startsWith(normName(title))) 2 else 0) +
            (if (o.optLong("cover_i", 0L) > 0) 1 else 0)
    }

    private fun hit(o: JSONObject?): Bookmory.Hit? {
        o ?: return null
        val id = o.optString("key").filter { it.isDigit() }.toLongOrNull() ?: return null
        val ci = o.optLong("cover_i", 0L)
        return Bookmory.Hit(id, if (ci > 0) "https://covers.openlibrary.org/b/id/$ci-L.jpg" else "", o.optInt("number_of_pages_median", 0))
    }

    /** Portada de Google Books (por ISBN o por título y autor). "" si no hay. */
    private fun google(title: String, author: String, isbn: String): String {
        val q = if (isbn.length >= 10) "isbn:$isbn" else "intitle:${ienc(title)}" + if (author.isNotBlank()) "+inauthor:${ienc(author)}" else ""
        return try {
            val items = JSONObject(iget("https://www.googleapis.com/books/v1/volumes?q=$q&maxResults=5")).optJSONArray("items")
                ?: return ""
            (0 until items.length()).map { items.getJSONObject(it).optJSONObject("volumeInfo") ?: JSONObject() }
                .firstOrNull { v -> (isbn.length >= 10 || sameTitle(title, v.optString("title"))) && v.optJSONObject("imageLinks") != null }
                ?.optJSONObject("imageLinks")?.let { it.optString("thumbnail").ifBlank { it.optString("smallThumbnail") } }
                ?.replace("http://", "https://")?.replace("&edge=curl", "") ?: ""
        } catch (e: Exception) { "" }
    }

    suspend fun find(rawTitle: String, author: String, isbn: String): Bookmory.Hit? = withContext(Dispatchers.IO) {
        val title = Goodreads.cleanTitle(rawTitle)
        var h: Bookmory.Hit? = null
        if (isbn.length >= 10) {
            h = hit(docs("https://openlibrary.org/search.json?isbn=${ienc(isbn)}$F&limit=1").firstOrNull())
            delay(300)
        }
        if (h == null && author.isNotBlank()) {
            h = hit(best(title, docs("https://openlibrary.org/search.json?title=${ienc(title)}&author=${ienc(author)}$F&limit=5")
                .filter { sameTitle(title, it.optString("title")) }))
            delay(300)
        }
        if (h == null) {
            h = hit(best(title, docs("https://openlibrary.org/search.json?title=${ienc(title)}$F&limit=10")
                .filter { sameTitle(title, it.optString("title")) && sameAuthor(author, it.optJSONArray("author_name")) }))
            delay(300)
        }
        if (h == null || h.cover.isBlank()) {
            val g = google(title, author, isbn).ifBlank { if (isbn.length >= 10) google(title, author, "") else "" }
            if (g.isNotBlank()) h = Bookmory.Hit(h?.id ?: 0L, g, h?.pages ?: 0)
        }
        h
    }
}

/** Horas de Steam: lee tu biblioteca pública y las copia en los juegos que ya tienes. */
object Steam {
    private val roman = mapOf("ii" to "2", "iii" to "3", "iv" to "4", "v" to "5", "vi" to "6", "vii" to "7", "viii" to "8", "ix" to "9", "x" to "10")
    private val extras = setOf("edition", "definitive", "remastered", "goty", "complete", "deluxe", "directors", "cut", "enhanced", "ultimate")

    /** Clave para emparejar nombres: "Alan Wake II" = "Alan Wake 2", sin ™ ni "Edition". */
    fun key(name: String): String {
        val words = java.text.Normalizer.normalize(name, java.text.Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "")
            .lowercase().replace(Regex("[^a-z0-9]+"), " ").trim().split(" ").filter { it.isNotEmpty() }
        val w = words.map { roman[it] ?: it }
        val cut = w.indexOfFirst { it in extras }.let { if (it > 0) w.take(it) else w }
        return cut.joinToString("").removeSuffix("gameoftheyear")
    }

    class Owned(val name: String, val minutes: Int)

    private suspend fun steamId(user: String, key: String): String = withContext(Dispatchers.IO) {
        val u = user.trim().trimEnd('/')
        // Acepta el número (SteamID64), la URL del perfil o el nombre personalizado.
        val tail = u.substringAfterLast("/")
        if (tail.length == 17 && tail.all { it.isDigit() }) return@withContext tail
        val txt = try {
            iget("https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${ienc(key)}&vanityurl=${ienc(tail)}")
        } catch (e: HttpError) {
            if (e.code == 401 || e.code == 403) throw IllegalArgumentException("la clave de Steam no es válida")
            throw e
        }
        val o = JSONObject(txt).optJSONObject("response")
        if (o?.optInt("success") != 1) throw IllegalArgumentException("no encuentro el perfil \"$tail\"")
        o.optString("steamid")
    }

    suspend fun owned(user: String, key: String): List<Owned> {
        val id = steamId(user, key)
        return withContext(Dispatchers.IO) {
            val txt = try {
                iget("https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${ienc(key)}&steamid=$id&include_appinfo=1&include_played_free_games=1&format=json")
            } catch (e: HttpError) {
                if (e.code == 401 || e.code == 403) throw IllegalArgumentException("la clave de Steam no es válida")
                throw e
            }
            val arr = JSONObject(txt).optJSONObject("response")?.optJSONArray("games")
                ?: throw IllegalArgumentException("tu biblioteca es privada: en Steam, Perfil → Privacidad → Detalles del juego: Público")
            (0 until arr.length()).map { arr.getJSONObject(it) }
                .map { Owned(it.optString("name"), it.optInt("playtime_forever", 0)) }
                .filter { it.name.isNotBlank() }
        }
    }
}
