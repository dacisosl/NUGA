package kr.nuga.wear.alarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kr.nuga.shared.timetable.TimetableResolver
import kr.nuga.wear.R
import kr.nuga.wear.WatchApp
import kr.nuga.wear.ui.MainActivity
import kr.nuga.wear.watchGraph
import java.time.LocalDateTime
import java.time.ZoneId

/** Brings the watch app to the front at each lesson start (config.options.autoLaunchWatch / on-watch toggle). */
object WatchAlarmScheduler {
    private const val TAG = "WatchAlarm"
    private const val REQUEST = 5101
    const val EXTRA_HEADLINE = "headline"

    suspend fun reschedule(context: Context) {
        val g = context.watchGraph
        val am = context.getSystemService(AlarmManager::class.java)
        pendingIntent(context, null, PendingIntent.FLAG_NO_CREATE)?.let { am.cancel(it) }
        if (!g.store.effectiveAutoLaunch()) return
        val config = g.store.currentConfig() ?: return
        val next = TimetableResolver.upcomingStarts(config, LocalDateTime.now(), limit = 1).firstOrNull() ?: return
        val at = next.startDateTime.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
        val pi = pendingIntent(context, next.headline, PendingIntent.FLAG_UPDATE_CURRENT)!!
        val canExact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()
        if (canExact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
        else am.setWindow(AlarmManager.RTC_WAKEUP, at, 60_000L, pi)
        Log.i(TAG, "next launch ${next.headline} at ${next.startDateTime} exact=$canExact")
    }

    private fun pendingIntent(context: Context, headline: String?, flags: Int): PendingIntent? {
        val intent = Intent(context, WatchAlarmReceiver::class.java).apply {
            action = "kr.nuga.wear.LESSON_START"
            headline?.let { putExtra(EXTRA_HEADLINE, it) }
        }
        return PendingIntent.getBroadcast(context, REQUEST, intent, flags or PendingIntent.FLAG_IMMUTABLE)
    }
}

class WatchAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val headline = intent.getStringExtra(WatchAlarmScheduler.EXTRA_HEADLINE) ?: "수업 시작"
        launchOrNotify(context, headline)
        val result = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                WatchAlarmScheduler.reschedule(context)
            } finally {
                result.finish()
            }
        }
    }

    /**
     * API 29+ restricts background activity starts, so the reliable path is a full-screen-intent
     * notification (the system shows it immediately on the watch); startActivity is attempted too.
     */
    private fun launchOrNotify(context: Context, headline: String) {
        val open = Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        runCatching { context.startActivity(open) }
        val canPost = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, android.Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        if (!canPost) return
        val pi = PendingIntent.getActivity(context, 1, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val n = NotificationCompat.Builder(context, WatchApp.CHANNEL_LESSON)
            .setSmallIcon(R.drawable.ic_stat_nuga)
            .setContentTitle("$headline 시작")
            .setContentText("누가")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setAutoCancel(true)
            .setTimeoutAfter(10 * 60 * 1000L)
            .setContentIntent(pi)
            .setFullScreenIntent(pi, true)
            .build()
        NotificationManagerCompat.from(context).notify(7101, n)
    }
}

class WatchBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val result = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                WatchAlarmScheduler.reschedule(context)
                context.watchGraph.sync.flush()
            } finally {
                result.finish()
            }
        }
    }
}
