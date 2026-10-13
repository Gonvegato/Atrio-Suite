package com.gonzalo.gamerate

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import org.json.JSONArray
import org.json.JSONObject
import org.junit.AfterClass
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.BeforeClass
import org.junit.Test
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Lógica de la suite en el ordenador: el streaming contra el Firebase de mentira (herramientas/fakefirebase.js)
 * y la mezcla de apuntes rápidos y partes jugadas. Necesita node en el PATH.
 */
class SuiteTest {
    companion object {
        private var proc: Process? = null
        private val port = 9600 + (Math.random() * 300).toInt()
        val base = "http://127.0.0.1:$port"

        @BeforeClass @JvmStatic fun up() {
            var dir = File("").absoluteFile
            while (!File(dir, "herramientas/fakefirebase.js").exists()) dir = dir.parentFile ?: error("no encuentro herramientas/")
            proc = ProcessBuilder("node", File(dir, "herramientas/fakefirebase.js").path, port.toString()).redirectErrorStream(true).start()
            Thread.sleep(800)
        }

        @AfterClass @JvmStatic fun down() { proc?.destroy() }

        fun http(method: String, url: String, body: String? = null): String {
            val c = URL(url).openConnection() as HttpURLConnection
            c.requestMethod = method
            if (body != null) { c.doOutput = true; c.outputStream.use { it.write(body.toByteArray()) } }
            return (if (c.responseCode in 200..299) c.inputStream else c.errorStream).bufferedReader().readText()
        }
    }

    @Test fun streamingRecibeCambiosAlMomento() {
        val su = JSONObject(http("POST", "$base/v1/accounts:signUp?key=k", JSONObject().put("email", "s${System.nanoTime()}@ronron.example.com").put("password", "secreto1").toString()))
        val uid = su.getString("localId")
        val tok = su.getString("idToken")
        val got = CountDownLatch(1)
        var last: JSONObject? = null
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val s = FbStream("prueba", { "$base/users/$uid/suite.json?auth=$tok" }, { t, _ ->
            last = t
            if (t?.optJSONObject("live")?.optJSONObject("pc1")?.optBoolean("on") == true) got.countDown()
        })
        s.start(scope)
        Thread.sleep(600)
        val t0 = System.currentTimeMillis()
        http("PUT", "$base/users/$uid/suite/live/pc1.json?auth=$tok", JSONObject().put("on", true).put("name", "PC").toString())
        assertTrue("no ha llegado el cambio", got.await(5, TimeUnit.SECONDS))
        assertTrue("tarda demasiado", System.currentTimeMillis() - t0 < 2000)
        assertEquals("PC", last!!.getJSONObject("live").getJSONObject("pc1").getString("name"))
        // Borrar también llega
        val gone = CountDownLatch(1)
        val s2 = FbStream("prueba2", { "$base/users/$uid/suite.json?auth=$tok" }, { t, _ -> if (t?.optJSONObject("live") == null) gone.countDown() })
        s.stop()
        http("DELETE", "$base/users/$uid/suite/live/pc1.json?auth=$tok")
        s2.start(scope)
        assertTrue(gone.await(5, TimeUnit.SECONDS))
        s2.stop()
        scope.cancel()
    }

    @Test fun apuntesYPartesSeSumanAlMezclar() {
        val a = playToJson(Play(1, "Juego", "", "", 1, emptyList(), memos = listOf(Memo(10, "uno", u = 10)), segs = listOf(Seg("a1", 1, 2, 30, "atrio"))))
        val b = playToJson(Play(1, "Juego", "", "", 1, emptyList(), memos = listOf(Memo(10, "", del = true, u = 20), Memo(30, "tres")), segs = listOf(Seg("t5", 5, 6, 10, "timer"))))
        val m = playFromJson(uniteLists(JSONObject(a.toString()), JSONObject(b.toString())))
        assertEquals(listOf("a1", "t5"), m.segs.map { it.id })
        assertEquals(listOf(30L), m.liveMemos.map { it.t }) // el borrado gana y no revive
        assertEquals(2, m.memos.size)
    }

    @Test fun lasValoracionesDePartesSeConservan() {
        val e = Entry(5, 70, 60, 50, 40, 30, "bien", 0, seg = "a1", part = "Acto 2")
        val p = Play(9, "X", "", "", 1, listOf(e), segs = listOf(Seg("a1", 1, 2, 30, "atrio", "pc"), Seg("a2", 3, 4, 15, "atrio")))
        val back = playFromJson(JSONObject(playToJson(p).toString()))
        assertEquals("a1", back.entries[0].seg)
        assertEquals("Acto 2", back.entries[0].part)
        assertEquals(listOf("a2"), back.unrated().map { it.id })
        assertEquals("Partida en pc", back.segs[0].label())
    }

    @Test fun fichasAntiguasSinCamposNuevos() {
        val old = JSONObject().put("id", 3).put("name", "Viejo").put("cover", "").put("hero", "").put("status", 1)
            .put("entries", JSONArray().put(JSONObject().put("time", 1).put("general", 50).put("gfx", 50).put("story", 50).put("music", 50).put("gameplay", 50).put("note", "")))
        val p = playFromJson(old)
        assertTrue(p.memos.isEmpty() && p.segs.isEmpty())
        assertEquals("", p.entries[0].seg)
        assertNotNull(playToJson(p))
        // Si no hay apuntes rápidos ni partes, la ficha se guarda igual que antes
        assertTrue(!playToJson(p).has("memos") && !playToJson(p).has("segs"))
    }
}
