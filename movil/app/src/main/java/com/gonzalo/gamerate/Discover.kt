package com.gonzalo.gamerate

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

private const val UA = "Atrio/4.4 (app personal; Android)"

private fun enc(s: String) = URLEncoder.encode(s.trim(), "UTF-8")

/** GET sencillo que devuelve el texto (o lanza un error legible). */
private fun httpGet(url: String, headers: Map<String, String> = emptyMap()): String {
    val c = URL(url).openConnection() as HttpURLConnection
    c.setRequestProperty("User-Agent", UA)
    headers.forEach { (k, v) -> c.setRequestProperty(k, v) }
    c.connectTimeout = 15000
    c.readTimeout = 20000
    try {
        val code = c.responseCode
        if (code !in 200..299) error("El servidor respondió $code")
        return c.inputStream.bufferedReader().readText()
    } finally {
        c.disconnect()
    }
}

/** Error HTTP con su código (para saber si merece la pena reintentar). */
class HttpError(val code: Int, msg: String) : Exception(msg)

private fun httpPost(
    url: String, body: String, headers: Map<String, String> = emptyMap(), type: String = "application/json; charset=utf-8"
): String {
    val c = URL(url).openConnection() as HttpURLConnection
    c.requestMethod = "POST"
    c.doOutput = true
    c.setRequestProperty("User-Agent", UA)
    c.setRequestProperty("Content-Type", type)
    headers.forEach { (k, v) -> c.setRequestProperty(k, v) }
    c.connectTimeout = 15000
    c.readTimeout = 60000
    try {
        c.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
        val code = c.responseCode
        if (code !in 200..299) {
            val err = try { c.errorStream?.bufferedReader()?.readText() ?: "" } catch (e: Exception) { "" }
            val msg = try { JSONObject(err).optJSONObject("error")?.optString("message") ?: "" } catch (e: Exception) { "" }
            throw HttpError(code, if (msg.isNotBlank()) msg else "El servidor respondió $code")
        }
        return c.inputStream.bufferedReader().readText()
    } finally {
        c.disconnect()
    }
}

/** Nombre simplificado para comparar títulos ("The Witcher 3: Wild Hunt" -> "thewitcher3wildhunt"). */
fun normName(s: String): String =
    java.text.Normalizer.normalize(s, java.text.Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "")
        .lowercase().filter { it.isLetterOrDigit() }

/** Géneros de RAWG que se pueden elegir a mano (slug -> nombre). */
val GameGenres = listOf(
    "action" to "Acción", "adventure" to "Aventura", "role-playing-games-rpg" to "Rol (RPG)",
    "shooter" to "Disparos", "indie" to "Indie", "platformer" to "Plataformas", "puzzle" to "Puzles",
    "racing" to "Carreras", "sports" to "Deportes", "strategy" to "Estrategia", "simulation" to "Simulación",
    "fighting" to "Lucha", "family" to "Familiar", "arcade" to "Arcade", "casual" to "Casual",
    "massively-multiplayer" to "Multijugador masivo", "board-games" to "De mesa", "card" to "Cartas"
)

/** Temas de Open Library que se pueden elegir a mano (slug -> nombre). */
val BookSubjects = listOf(
    "fantasy" to "Fantasía", "science_fiction" to "Ciencia ficción", "romance" to "Romance",
    "mystery" to "Misterio", "thriller" to "Thriller", "horror" to "Terror", "historical_fiction" to "Histórica",
    "young_adult_fiction" to "Juvenil", "humor" to "Humor", "classics" to "Clásicos", "biography" to "Biografías",
    "poetry" to "Poesía", "adventure" to "Aventura", "dystopias" to "Distopías", "magic" to "Magia"
)

/** RAWG: base de datos de videojuegos (necesita una clave gratuita). */
object Rawg {
    private const val BASE = "https://api.rawg.io/api"

    /** Mejor coincidencia por nombre. */
    suspend fun find(name: String, key: String): JSONObject? = withContext(Dispatchers.IO) {
        val t = httpGet("$BASE/games?key=${enc(key)}&search=${enc(name)}&page_size=5")
        val a = JSONObject(t).optJSONArray("results") ?: return@withContext null
        if (a.length() == 0) return@withContext null
        val n = normName(name)
        (0 until a.length()).map { a.getJSONObject(it) }.firstOrNull { normName(it.optString("name")) == n } ?: a.getJSONObject(0)
    }

    /** Estudios que lo han desarrollado. */
    suspend fun developers(id: Long, key: String): List<String> = withContext(Dispatchers.IO) {
        val o = JSONObject(httpGet("$BASE/games/$id?key=${enc(key)}"))
        val a = o.optJSONArray("developers") ?: JSONArray()
        (0 until a.length()).mapNotNull { a.optJSONObject(it)?.optString("name")?.ifBlank { null } }
    }

    /** Slugs de los géneros de un juego (buscando por nombre). */
    suspend fun genresOf(name: String, key: String): List<String> {
        val g = find(name, key) ?: return emptyList()
        val a = g.optJSONArray("genres") ?: return emptyList()
        return (0 until a.length()).mapNotNull { a.optJSONObject(it)?.optString("slug")?.ifBlank { null } }
    }

    private fun toCard(o: JSONObject): Card? {
        val id = o.optLong("id", 0L)
        val name = o.optString("name")
        if (id == 0L || name.isBlank()) return null
        val gs = o.optJSONArray("genres") ?: JSONArray()
        val genres = (0 until gs.length()).mapNotNull { gs.optJSONObject(it)?.optString("name") }.take(3)
        return Card(
            "rawg:$id", 0, name, o.optString("background_image", ""), o.optString("released", "").take(4),
            genres.joinToString(" · "), "", id, o.optInt("metacritic", 0)
        )
    }

    /** Juegos bien valorados de esos géneros (mezcla los más valorados y los más populares). */
    suspend fun deck(genres: List<String>, key: String, page: Int): List<Card> = withContext(Dispatchers.IO) {
        val g = if (genres.isEmpty()) "" else "&genres=${enc(genres.joinToString(","))}"
        val base = "$BASE/games?key=${enc(key)}$g&page_size=40&page=$page&exclude_additions=true"
        val a = try {
            JSONObject(httpGet("$base&ordering=-metacritic")).optJSONArray("results") ?: JSONArray()
        } catch (e: Exception) { JSONArray() }
        val b = try {
            JSONObject(httpGet("$base&ordering=-added")).optJSONArray("results") ?: JSONArray()
        } catch (e: Exception) { JSONArray() }
        val la = (0 until a.length()).mapNotNull { toCard(a.getJSONObject(it)) }
        val lb = (0 until b.length()).mapNotNull { toCard(b.getJSONObject(it)) }
        val out = ArrayList<Card>()
        for (i in 0 until maxOf(la.size, lb.size)) {
            if (i < la.size) out.add(la[i])
            if (i < lb.size) out.add(lb[i])
        }
        out.distinctBy { it.key }
    }
}

/** Open Library: temas y libros por tema (sin clave). */
object OpenLibDeck {
    private const val COVERS = "https://covers.openlibrary.org/b/id"

    /** Temas de un libro (buscando por título). */
    suspend fun subjectsOf(title: String): List<String> = withContext(Dispatchers.IO) {
        val t = httpGet("https://openlibrary.org/search.json?q=${enc(title)}&fields=subject&limit=1")
        val d = JSONObject(t).optJSONArray("docs") ?: return@withContext emptyList()
        if (d.length() == 0) return@withContext emptyList()
        val s = d.getJSONObject(0).optJSONArray("subject") ?: return@withContext emptyList()
        (0 until s.length()).map { s.optString(it).lowercase().trim().replace(' ', '_') }
            .filter { it.isNotBlank() && it.length < 40 }
    }

    /** Libros de un tema. */
    suspend fun bySubject(subject: String, offset: Int): List<Card> = withContext(Dispatchers.IO) {
        val t = httpGet("https://openlibrary.org/subjects/${enc(subject)}.json?limit=40&offset=$offset")
        val w = JSONObject(t).optJSONArray("works") ?: return@withContext emptyList()
        (0 until w.length()).mapNotNull { i ->
            val o = w.getJSONObject(i)
            val id = o.optString("key").filter { it.isDigit() }.toLongOrNull() ?: return@mapNotNull null
            val cover = o.optLong("cover_id", 0L)
            if (cover <= 0L) return@mapNotNull null
            val authors = o.optJSONArray("authors")
            val author = authors?.optJSONObject(0)?.optString("name") ?: ""
            val year = if (o.has("first_publish_year")) o.optInt("first_publish_year").toString() else ""
            Card("ol:$id", 1, o.optString("title"), "$COVERS/$cover-L.jpg", year, subject.replace('_', ' '), author, id)
        }
    }
}

/** Detecta el estudio de un juego: primero RAWG (si hay clave) y si no, Wikidata. */
object Studio {
    suspend fun detect(name: String, rawgKey: String): String? {
        if (rawgKey.isNotBlank()) {
            try {
                val g = Rawg.find(name, rawgKey)
                if (g != null) {
                    val devs = Rawg.developers(g.optLong("id"), rawgKey)
                    if (devs.isNotEmpty()) return devs.take(2).joinToString(", ")
                }
            } catch (e: Exception) { /* se prueba con Wikidata */ }
        }
        return try { wikidata(name) } catch (e: Exception) { null }
    }

    private suspend fun wikidata(name: String): String? = withContext(Dispatchers.IO) {
        val api = "https://www.wikidata.org/w/api.php?format=json"
        val ids = LinkedHashSet<String>()
        for (lang in listOf("es", "en")) {
            val t = httpGet("$api&action=wbsearchentities&type=item&limit=7&language=$lang&search=${enc(name)}")
            val a = JSONObject(t).optJSONArray("search") ?: JSONArray()
            for (i in 0 until a.length()) a.optJSONObject(i)?.optString("id")?.let { if (it.isNotBlank()) ids.add(it) }
        }
        if (ids.isEmpty()) return@withContext null
        val ents = JSONObject(httpGet("$api&action=wbgetentities&props=claims&ids=${enc(ids.take(12).joinToString("|"))}"))
            .optJSONObject("entities") ?: return@withContext null
        fun values(claims: JSONObject, prop: String): List<String> {
            val a = claims.optJSONArray(prop) ?: return emptyList()
            return (0 until a.length()).mapNotNull {
                a.optJSONObject(it)?.optJSONObject("mainsnak")?.optJSONObject("datavalue")?.optJSONObject("value")?.optString("id")
            }
        }
        // Videojuego (Q7889) con desarrollador (P178), en el orden de la búsqueda.
        var devIds: List<String> = emptyList()
        for (id in ids) {
            val claims = ents.optJSONObject(id)?.optJSONObject("claims") ?: continue
            if ("Q7889" !in values(claims, "P31")) continue
            val d = values(claims, "P178")
            if (d.isNotEmpty()) { devIds = d.take(2); break }
        }
        if (devIds.isEmpty()) return@withContext null
        val labels = JSONObject(httpGet("$api&action=wbgetentities&props=labels&languages=es|en&ids=${enc(devIds.joinToString("|"))}"))
            .optJSONObject("entities") ?: return@withContext null
        devIds.mapNotNull { d ->
            val l = labels.optJSONObject(d)?.optJSONObject("labels")
            (l?.optJSONObject("es") ?: l?.optJSONObject("en"))?.optString("value")
        }.joinToString(", ").ifBlank { null }
    }
}

/** Pulir textos dictados: quita muletillas y repeticiones con reglas fijas (sin internet ni inteligencia artificial). */
object Polish {
    private val fillers = Regex(
        "(?i)(?<![\\p{L}])(e+h+|e+m+|m{2,}|a+h+|u+h+|ehm+|o sea|en plan|¿?sabes\\??|digamos|y tal)(?![\\p{L}])[,.]?"
    )

    /** Quita titubeos y palabras repetidas, y arregla mayúsculas y puntuación. Sin internet. */
    fun local(text: String): String {
        var t = text.replace(fillers, " ")
        // Palabras repetidas seguidas ("el el", "que que"); se respeta "muy muy" y "tan tan".
        t = t.replace(Regex("(?i)\\b(\\p{L}+)(\\s+\\1\\b)+")) { m ->
            val w = m.groupValues[1]
            if (w.lowercase() in setOf("muy", "tan", "más")) m.value else w
        }
        t = t.replace(Regex("\\s+([,.;:!?])"), "$1").replace(Regex("\\s{2,}"), " ").trim()
        t = t.replace(Regex("^[,.;:]\\s*"), "")
        // Mayúscula al principio y tras punto.
        val sb = StringBuilder(t)
        var up = true
        for (i in sb.indices) {
            val ch = sb[i]
            if (up && ch.isLetter()) { sb.setCharAt(i, ch.uppercaseChar()); up = false }
            else if (ch == '.' || ch == '!' || ch == '?') up = true
        }
        t = sb.toString()
        if (t.isNotEmpty() && t.last() !in ".!?…") t += "."
        return t
    }
}


/** Duración de un juego, en minutos (0 = no se sabe). main = lo normal; extra = deprisa; full = al 100 %. */
class TtbResult(val main: Int, val extra: Int, val full: Int, val src: String)

/**
 * Cuánto dura un juego, con datos de bases de datos de juegos (sin inteligencia artificial):
 * 1) IGDB (de Twitch): tiempos que registran sus jugadores (deprisa, normal y al 100 %). Necesita tu Client ID y tu secreto.
 * 2) Si no, RAWG: media de horas que han jugado sus usuarios (no es exactamente lo que se tarda en pasarlo).
 */
object TimeToBeat {
    suspend fun find(name: String, store: Store): TtbResult = withContext(Dispatchers.IO) {
        var last: Exception? = null
        if (store.igdbId.isNotBlank() && store.igdbSecret.isNotBlank()) {
            try {
                Igdb.timeToBeat(name, store)?.let { return@withContext it }
                last = Exception("IGDB no tiene tiempos de este juego")
            } catch (e: Exception) { last = e }
        }
        if (store.rawgKey.isNotBlank()) {
            try {
                val h = Rawg.find(name, store.rawgKey)?.optInt("playtime", 0) ?: 0
                if (h > 0) return@withContext TtbResult(h * 60, 0, 0, "RAWG · media de horas jugadas por sus usuarios")
                if (last == null) last = Exception("RAWG no tiene horas de este juego")
            } catch (e: Exception) { if (last == null) last = e }
        }
        throw last ?: Exception("pon tu Client ID y secreto de IGDB, o la clave de RAWG, en Ajustes → Servicios")
    }
}

/** IGDB (Internet Game Database, de Twitch). Se entra con una clave de aplicación de Twitch. */
object Igdb {
    private fun token(store: Store, fresh: Boolean): String {
        if (!fresh && store.igdbToken.isNotBlank() && store.igdbExp > System.currentTimeMillis() + 60_000) return store.igdbToken
        val t = try {
            httpPost(
                "https://id.twitch.tv/oauth2/token?client_id=${enc(store.igdbId)}&client_secret=${enc(store.igdbSecret)}&grant_type=client_credentials",
                "", type = "application/x-www-form-urlencoded"
            )
        } catch (e: HttpError) {
            throw Exception(if (e.code in 400..403) "Twitch no acepta ese Client ID o ese secreto" else "Twitch respondió ${e.code}")
        }
        val o = JSONObject(t)
        val tok = o.optString("access_token")
        if (tok.isBlank()) error("Twitch no ha dado acceso")
        store.igdbToken = tok
        store.igdbExp = System.currentTimeMillis() + o.optLong("expires_in", 3600L) * 1000L
        return tok
    }

    private fun query(store: Store, endpoint: String, body: String): JSONArray {
        fun go(fresh: Boolean) = httpPost(
            "https://api.igdb.com/v4/$endpoint", body,
            mapOf("Client-ID" to store.igdbId, "Authorization" to "Bearer ${token(store, fresh)}", "Accept" to "application/json"),
            type = "text/plain"
        )
        val t = try { go(false) } catch (e: HttpError) { if (e.code == 401) go(true) else throw e }
        return JSONArray(t)
    }

    /** Tiempos de IGDB para ese juego, o null si no hay. */
    fun timeToBeat(name: String, store: Store): TtbResult? {
        val q = name.replace("\"", "").trim()
        val games = query(store, "games", "search \"$q\"; fields id,name; limit 10;")
        if (games.length() == 0) return null
        val list = (0 until games.length()).map { games.getJSONObject(it) }
        val g = list.firstOrNull { normName(it.optString("name")) == normName(name) } ?: list.first()
        val r = query(store, "game_time_to_beats", "fields hastily,normally,completely,count; where game_id = ${g.optLong("id")};")
        val o = r.optJSONObject(0) ?: return null
        fun min(k: String) = (o.optLong(k, 0L) / 60L).toInt().coerceIn(0, 60 * 500)
        val normal = min("normally")
        val fast = min("hastily")
        val full = min("completely")
        if (normal == 0 && fast == 0 && full == 0) return null
        val n = o.optInt("count", 0)
        return TtbResult(if (normal > 0) normal else fast, fast, full,
            "IGDB · ${g.optString("name")}" + if (n > 0) " · $n jugadores" else "")
    }
}
