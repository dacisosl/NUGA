package kr.nuga.app.alarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kr.nuga.app.NugaApp
import kr.nuga.app.R
import kr.nuga.app.graph
import kr.nuga.app.sync.SyncScheduler
import kr.nuga.app.ui.MainActivity
import kr.nuga.app.widget.WidgetUpdater
import kr.nuga.shared.model.Config
import kr.nuga.shared.timetable.TimetableResolver
import java.time.LocalDateTime
import java.time.ZoneId

/** Schedules one exact alarm at the next lesson start (when the "자동 열기" setting is on). */
object LessonAlarmScheduler {
    private const val TAG = "LessonAlarm"
    private const val REQUEST = 4101
    const val EXTRA_HEADLINE = "headline"
    const val EXTRA_SUBLINE = "subline"
    const val EXTRA_CLASS = "classLabel"

    suspend fun reschedule(context: Context) {
        val g = context.graph
        val am = context.getSystemService(AlarmManager::class.java)
        val pending = pendingIntent(context, null, null, null, PendingIntent.FLAG_NO_CREATE)
        if (pending != null) am.cancel(pending)
        val settings = g.prefs.current()
        if (!settings.autoOpenNotify) return
        val config = g.configRepo.current() ?: return
        schedule(context, config)
    }

    private fun schedule(context: Context, config: Config) {
        val am = context.getSystemService(AlarmManager::class.java)
        val next = TimetableResolver.upcomingStarts(config, LocalDateTime.now(), limit = 1).firstOrNull() ?: return
        val at = next.startDateTime.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
        val pi = pendingIntent(context, next.headline, next.subline, next.classLabel, PendingIntent.FLAG_UPDATE_CURRENT)!!
        val canExact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()
        if (canExact) {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
        } else {
            am.setWindow(AlarmManager.RTC_WAKEUP, at, 60_000L, pi)
        }
        Log.i(TAG, "next lesson alarm ${next.headline} at ${next.startDateTime} exact=$canExact")
    }

    private fun pendingIntent(context: Context, headline: String?, subline: String?, classLabel: String?, flags: Int): PendingIntent? {
        val intent = Intent(context, LessonAlarmReceiver::class.java).apply {
            action = "kr.nuga.app.LESSON_START"
            headline?.let { putExtra(EXTRA_HEADLINE, it) }
            subline?.let { putExtra(EXTRA_SUBLINE, it) }
            classLabel?.let { putExtra(EXTRA_CLASS, it) }
        }
        return PendingIntent.getBroadcast(context, REQUEST, intent, flags or PendingIntent.FLAG_IMMUTABLE)
    }
}

class LessonAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val headline = intent.getStringExtra(LessonAlarmScheduler.EXTRA_HEADLINE) ?: return
        val subline = intent.getStringExtra(LessonAlarmScheduler.EXTRA_SUBLINE)
        val classLabel = intent.getStringExtra(LessonAlarmScheduler.EXTRA_CLASS)
        val result = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val config = context.graph.configRepo.current()
                LessonNotifier.notifyLessonStart(context, headline, subline, classLabel, config ?: Config.EMPTY)
                WidgetUpdater.updateAll(context)
                LessonAlarmScheduler.reschedule(context)
            } finally {
                result.finish()
            }
        }
    }
}

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val result = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                SyncScheduler.ensurePeriodic(context)
                LessonAlarmScheduler.reschedule(context)
                WidgetUpdater.updateAll(context)
            } finally {
                result.finish()
            }
        }
    }
}

object LessonNotifier {
    private const val NOTIFICATION_ID = 7001

    fun canPost(context: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, android.Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    /** "2-3 · 3교시 시작" with one action per category; each deep-links into the number sheet. */
    fun notifyLessonStart(context: Context, headline: String, subline: String?, classLabel: String?, config: Config) {
        if (!canPost(context)) return
        val builder = NotificationCompat.Builder(context, NugaApp.CHANNEL_LESSON)
            .setSmallIcon(R.drawable.ic_stat_nuga)
            .setContentTitle("$headline 시작")
            .setContentText(subline ?: "")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .setTimeoutAfter(55 * 60 * 1000L)
            .setContentIntent(deepLink(context, null, classLabel, 0))
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
        config.categories.take(4).forEachIndexed { index, cat ->
            builder.addAction(0, cat.label, deepLink(context, cat.key, classLabel, index + 1))
        }
        NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, builder.build())
    }

    private fun deepLink(context: Context, category: Int?, classLabel: String?, requestCode: Int): PendingIntent {
        val uri = Uri.Builder().scheme("nuga").authority("record").apply {
            if (category != null) appendQueryParameter("category", category.toString())
            if (classLabel != null) appendQueryParameter("class", classLabel)
            appendQueryParameter("src", "notify")
        }.build()
        val intent = Intent(Intent.ACTION_VIEW, uri, context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        return PendingIntent.getActivity(
            context, 9000 + requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }
}
