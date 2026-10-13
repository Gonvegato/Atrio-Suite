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

/**
 * Una guía abierta dentro de Atrio, en su propia ventana (con vistas de Android de siempre: la web se pinta
 * bien en cualquier móvil). Sale en Recientes como «Atrio · guía», así la tienes a mano mientras juegas en el PC.
 */
class WebActivity : Activity() {
    private lateinit var web: WebView
    private lateinit var titleView: TextView
    private lateinit var hostView: TextView
    private lateinit var bar: ProgressBar

    companion object {
        fun open(ctx: Context, g: Guide) {
            ctx.startActivity(Intent(ctx, WebActivity::class.java).putExtra("url", g.url).putExtra("title", g.title)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_DOCUMENT or Intent.FLAG_ACTIVITY_MULTIPLE_TASK))
        }
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun button(text: String, desc: String, onClick: () -> Unit) = TextView(this).apply {
        this.text = text
        contentDescription = desc
        setTextColor(Color.parseColor("#EDEBE6"))
        textSize = 20f
        gravity = Gravity.CENTER
        layoutParams = LinearLayout.LayoutParams(dp(46), dp(46))
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

        web = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.loadWithOverviewMode = true
            settings.useWideViewPort = true
            settings.builtInZoomControls = true
            settings.displayZoomControls = false
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
        setTaskDescription(android.app.ActivityManager.TaskDescription("Atrio · ${intent.getStringExtra("title") ?: "guía"}"))
        hostView.text = host(url)
        if (savedInstanceState != null) web.restoreState(savedInstanceState) else web.loadUrl(url)
    }

    private fun host(u: String) = (Uri.parse(u).host ?: u).removePrefix("www.")

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    @Deprecated("Atrás dentro de la web antes de cerrar")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    override fun onDestroy() {
        try { web.destroy() } catch (e: Exception) { }
        super.onDestroy()
    }
}
