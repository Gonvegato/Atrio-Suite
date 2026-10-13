package com.gonzalo.gamerate

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.text.TextUtils
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.content.MutableContextWrapper
import org.json.JSONObject

/**
 * Una guía abierta dentro de Atrio, en su propia ventana (con vistas de Android de siempre: la web se pinta
 * bien en cualquier móvil). Va en la misma tarea que Atrio y la web sigue viva al cerrarla o salir de la app:
 * vuelves y está donde la dejaste. Si el móvil cerró la app del todo, se reabre en la última página que viste.
 */
class WebActivity : Activity() {
    private lateinit var web: WebView
    private lateinit var titleView: TextView
    private lateinit var hostView: TextView
    private lateinit var bar: ProgressBar

    companion object {
        /**
         * Webs abiertas que siguen vivas aunque cierres la ventana o salgas de la app: al volver está todo igual
         * (la página, el scroll, lo que hubieras buscado). Las 4 últimas; la más vieja se libera.
         */
        private val alive = object : LinkedHashMap<String, WebView>(8, 0.75f, true) {
            override fun removeEldestEntry(e: MutableMap.MutableEntry<String, WebView>): Boolean {
                if (size <= 4) return false
                try { e.value.destroy() } catch (x: Exception) { }
                return true
            }
        }

        fun open(ctx: Context, g: Guide) {
            // En la misma tarea que Atrio: si sales un rato y vuelves a la app, la guía sigue ahí delante
            val i = Intent(ctx, WebActivity::class.java).putExtra("url", g.url).putExtra("title", g.title)
            if (ctx !is Activity) i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            ctx.startActivity(i)
        }

        private fun prefs(ctx: Context) = ctx.getSharedPreferences("gamerate", Context.MODE_PRIVATE)

        /** Dónde te quedaste en una guía (dirección inicial → última página y su título), si fue hace menos de 2 semanas. */
        fun lastPage(ctx: Context, start: String): Pair<String, String>? = try {
            val o = JSONObject(prefs(ctx).getString("guide_last", "{}")).optJSONObject(start)
            if (o == null || System.currentTimeMillis() - o.optLong("at") > 14L * 24 * 3600 * 1000) null
            else o.optString("u").takeIf { it.startsWith("http") }?.let { it to o.optString("t") }
        } catch (e: Exception) { null }

        fun forget(ctx: Context, start: String) {
            val all = try { JSONObject(prefs(ctx).getString("guide_last", "{}")) } catch (e: Exception) { JSONObject() }
            all.remove(start)
            prefs(ctx).edit().putString("guide_last", all.toString()).apply()
            alive.remove(start)?.let { try { it.destroy() } catch (e: Exception) { } }
        }

        private fun remember(ctx: Context, start: String, u: String, t: String) {
            val all = try { JSONObject(prefs(ctx).getString("guide_last", "{}")) } catch (e: Exception) { JSONObject() }
            all.put(start, JSONObject().put("u", u).put("t", t).put("at", System.currentTimeMillis()))
            // Solo las 40 más recientes
            if (all.length() > 40) {
                val old = all.keys().asSequence().toList().sortedBy { all.optJSONObject(it)?.optLong("at") ?: 0 }
                old.take(all.length() - 40).forEach { all.remove(it) }
            }
            prefs(ctx).edit().putString("guide_last", all.toString()).apply()
        }
    }

    private lateinit var start: String
    private var fresh = true

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun button(text: String, desc: String, onClick: () -> Unit) = TextView(this).apply {
        this.text = text
        contentDescription = desc
        setTextColor(Color.parseColor("#EDEBE6"))
        textSize = 20f
        gravity = Gravity.CENTER
        layoutParams = LinearLayout.LayoutParams(dp(42), dp(46))
        isClickable = true
        isFocusable = true
        setOnClickListener { onClick() }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val url = intent.getStringExtra("url") ?: run { finish(); return }
        val ink = Color.parseColor("#121214")
        window.statusBarColor = ink
        window.navigationBarColor = ink

        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(ink) }
        val top = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(4), dp(4), dp(4), dp(4))
        }
        top.addView(button("✕", "Cerrar") { finish() })
        val texts = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            setPadding(dp(6), 0, dp(6), 0)
        }
        titleView = TextView(this).apply {
            text = intent.getStringExtra("title") ?: ""
            setTextColor(Color.parseColor("#EDEBE6")); textSize = 15f; typeface = Typeface.DEFAULT_BOLD
            maxLines = 1; ellipsize = TextUtils.TruncateAt.END
        }
        hostView = TextView(this).apply {
            setTextColor(Color.parseColor("#9D988F")); textSize = 12f; maxLines = 1; ellipsize = TextUtils.TruncateAt.END
        }
        texts.addView(titleView); texts.addView(hostView)
        top.addView(texts)
        top.addView(button("⌂", "Inicio de la guía") { web.loadUrl(start) })
        top.addView(button("‹", "Atrás") { if (web.canGoBack()) web.goBack() })
        top.addView(button("⟳", "Recargar") { web.reload() })
        top.addView(button("⇪", "Compartir") {
            try { startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, web.url ?: url), "Compartir")) } catch (e: Exception) { }
        })
        top.addView(button("↗", "Abrir en el navegador") {
            try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(web.url ?: url))) } catch (e: Exception) { }
        })
        root.addView(top)
        bar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            progressTintList = android.content.res.ColorStateList.valueOf(Color.parseColor("#FF6B5E"))
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3))
        }
        root.addView(bar)

        start = url
        val kept = alive[url]
        fresh = kept == null
        web = kept?.also { (it.parent as? ViewGroup)?.removeView(it); (it.context as? MutableContextWrapper)?.baseContext = this } ?: WebView(MutableContextWrapper(this)).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.loadWithOverviewMode = true
            settings.useWideViewPort = true
            settings.builtInZoomControls = true
            settings.displayZoomControls = false
        }
        web.apply {
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    if (request.url.scheme == "http" || request.url.scheme == "https") return false
                    // Enlaces a apps (discord://, intent://…): fuera
                    try { startActivity(Intent(Intent.ACTION_VIEW, request.url)) } catch (e: Exception) { }
                    return true
                }
                override fun onPageStarted(view: WebView, u: String, favicon: Bitmap?) { hostView.text = host(u) }
                override fun onPageFinished(view: WebView, u: String) {
                    hostView.text = host(u)
                    view.title?.takeIf { it.isNotBlank() }?.let { titleView.text = it }
                    if (u.startsWith("http")) remember(view.context.applicationContext, start, u, view.title ?: "")
                }
            }
            webChromeClient = object : WebChromeClient() {
                override fun onProgressChanged(view: WebView, p: Int) {
                    bar.progress = p
                    bar.visibility = if (p in 1..99) View.VISIBLE else View.INVISIBLE
                }
                override fun onReceivedTitle(view: WebView, t: String?) { if (!t.isNullOrBlank()) titleView.text = t }
            }
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f)
        }
        root.addView(web)
        setContentView(FrameLayout(this).apply { fitsSystemWindows = true; setBackgroundColor(ink); addView(root) })
        hostView.text = host(web.url ?: url)
        web.title?.takeIf { it.isNotBlank() && !fresh }?.let { titleView.text = it }
        if (fresh) {
            alive[url] = web
            when {
                savedInstanceState != null -> web.restoreState(savedInstanceState)
                // Sigue donde lo dejaste (la app se cerró del todo, o el móvil liberó memoria)
                else -> web.loadUrl(lastPage(this, url)?.first ?: url)
            }
        }
    }

    private fun host(u: String) = (Uri.parse(u).host ?: u).removePrefix("www.")

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        if (::web.isInitialized) web.saveState(outState)
    }

    @Deprecated("Atrás dentro de la web antes de cerrar")
    override fun onBackPressed() {
        if (::web.isInitialized && web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    override fun onPause() { super.onPause(); if (::web.isInitialized) web.onPause() }
    override fun onResume() { super.onResume(); if (::web.isInitialized) web.onResume() }

    override fun onDestroy() {
        // La web no se destruye: queda viva para la próxima vez (sin la ventana, con el contexto de la app)
        if (!::web.isInitialized) { super.onDestroy(); return }
        (web.parent as? ViewGroup)?.removeView(web)
        (web.context as? MutableContextWrapper)?.baseContext = applicationContext
        if (alive[start] !== web) try { web.destroy() } catch (e: Exception) { }
        super.onDestroy()
    }
}
