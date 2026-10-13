package com.gonzalo.gamerate

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

object Reminders {
    fun schedule(ctx: Context, hours: Int) {
        val wm = WorkManager.getInstance(ctx)
        wm.cancelUniqueWork("session")
        val req = PeriodicWorkRequestBuilder<ReminderWorker>(hours.toLong(), TimeUnit.HOURS)
            .setInitialDelay(hours.toLong(), TimeUnit.HOURS)
            .build()
        wm.enqueueUniquePeriodicWork("session", ExistingPeriodicWorkPolicy.KEEP, req)
    }

    fun cancel(ctx: Context) {
        WorkManager.getInstance(ctx).cancelUniqueWork("session")
    }
}

class ReminderWorker(ctx: Context, params: WorkerParameters) : Worker(ctx, params) {
    override fun doWork(): Result {
        val app = applicationContext
        val store = Store(app)
        val id = store.sessionId
        if (id == 0L) return Result.success()
        val play = store.loadPlays().find { it.id == id } ?: return Result.success()

        // Evita avisar de inmediato si el sistema lanza la primera ejecución antes de tiempo.
        val elapsed = System.currentTimeMillis() - store.sessionStart
        if (elapsed < store.sessionHours * 3_600_000L - 10 * 60_000L) return Result.success()

        val nm = app.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel("session", "Sesiones de juego", NotificationManager.IMPORTANCE_DEFAULT)
        )
        val intent = Intent(app, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("play_id", play.id)
        }
        val pi = PendingIntent.getActivity(
            app, play.id.toInt(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val h = elapsed / 3_600_000L
        val n = Notification.Builder(app, "session")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(play.name)
            .setContentText("Llevas unas $h h de sesión. Apunta tus notas y anotaciones.")
            .setContentIntent(pi)
            .setAutoCancel(true)
            .build()
        nm.notify(1001, n)
        return Result.success()
    }
}

/** Comprueba cada media hora (aprox.) si tu pareja tiene novedades. */
object PartnerWatch {
    fun schedule(ctx: Context) {
        val req = PeriodicWorkRequestBuilder<PartnerWorker>(30, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork("partner", ExistingPeriodicWorkPolicy.KEEP, req)
    }

    fun cancel(ctx: Context) {
        WorkManager.getInstance(ctx).cancelUniqueWork("partner")
    }
}

class PartnerWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val app = applicationContext
        val store = Store(app)
        if (!store.paired || !store.notifyPartner) return Result.success()
        val p = try { Couple.pull(store) } catch (e: Exception) { return Result.retry() } ?: return Result.success()
        val news = Couple.news(store, p)
        Couple.markSeen(store, p)
        if (news.isEmpty()) return Result.success()

        val nm = app.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel("partner", "Novedades de tu pareja", NotificationManager.IMPORTANCE_DEFAULT)
        )
        val intent = Intent(app, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("partner", true)
        }
        val pi = PendingIntent.getActivity(app, 2002, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val title = if (news.size == 1) "♥ ${p.name}" else "♥ ${p.name} · ${news.size} novedades"
        val style = Notification.InboxStyle()
        news.take(6).forEach { style.addLine(it) }
        val n = Notification.Builder(app, "partner")
            .setSmallIcon(android.R.drawable.star_on)
            .setContentTitle(title)
            .setContentText(news.first())
            .setStyle(style)
            .setContentIntent(pi)
            .setAutoCancel(true)
            .build()
        nm.notify(2002, n)
        return Result.success()
    }
}

/**
 * Subida a la nube en segundo plano: se programa al salir de la app para que lo último quede guardado
 * aunque la cierres al momento o no tengas conexión (Android la hace en cuanto haya internet).
 */
object CloudSave {
    fun enqueue(ctx: Context) {
        val req = androidx.work.OneTimeWorkRequestBuilder<CloudWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(ctx).enqueueUniqueWork("nube", androidx.work.ExistingWorkPolicy.REPLACE, req)
    }
}

class CloudWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val store = Store(applicationContext)
        var retry = false
        if (store.paired) {
            try { Couple.push(store) } catch (e: Exception) { retry = true }
        }
        if (store.driveUri.isNotBlank()) DriveBackup.save(applicationContext, store)
        return if (retry && runAttemptCount < 5) Result.retry() else Result.success()
    }
}

/**
 * La suite: cada cuarto de hora (lo mínimo que deja Android) mira si Atrio ha apuntado partidas nuevas
 * y avisa para valorarlas. Con la app abierta llegan al momento, sin esperar.
 */
object SuiteWatch {
    fun schedule(ctx: Context) {
        val req = PeriodicWorkRequestBuilder<SuiteWorker>(15, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork("suite", ExistingPeriodicWorkPolicy.KEEP, req)
    }
}

class SuiteWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val app = applicationContext
        val store = Store(app)
        if (!store.paired || !store.notifySegs) return Result.success()
        try { Couple.syncOwn(store) } catch (e: Exception) { return Result.retry() }
        val seen = store.segsNotified
        val skip = store.segsSkipped
        val now = System.currentTimeMillis()
        val fresh = store.loadPlays(0).flatMap { p -> p.unrated().map { p to it } }
            .filter { (_, s) -> s.src == "atrio" && s.id !in seen && s.id !in skip && now - s.e < 12 * 3_600_000L }
        if (fresh.isEmpty()) return Result.success()
        store.segsNotified = seen + fresh.map { it.second.id }
        val nm = app.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel("partes", "Partidas para valorar", NotificationManager.IMPORTANCE_DEFAULT))
        for ((p, s) in fresh.takeLast(3)) {
            val intent = Intent(app, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra("rate", "${p.id}:${s.id}")
            }
            val code = (s.id.hashCode() and 0x7fffffff) % 100000 + 3000
            val pi = PendingIntent.getActivity(app, code, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val n = Notification.Builder(app, "partes")
                .setSmallIcon(android.R.drawable.star_on)
                .setContentTitle(p.name)
                .setContentText("Has jugado ${hoursText(s.min)}${if (s.pc.isNotBlank()) " en ${s.pc}" else ""}. ¿Qué tal esa partida?")
                .setContentIntent(pi)
                .setAutoCancel(true)
                .build()
            nm.notify(code, n)
        }
        return Result.success()
    }
}
