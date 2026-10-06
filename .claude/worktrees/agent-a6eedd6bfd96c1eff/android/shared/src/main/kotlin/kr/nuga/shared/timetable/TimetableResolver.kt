package kr.nuga.shared.timetable

import kr.nuga.shared.model.Config
import kr.nuga.shared.model.LessonInfo
import kr.nuga.shared.model.PeriodDef
import kr.nuga.shared.model.ProgressEntry
import kr.nuga.shared.time.NugaTime
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime

/** One lesson on a given date: which class, which period, and (if known) the progress row. */
data class LessonSlot(
    val date: LocalDate,
    val period: PeriodDef,
    val classLabel: String,
    val progress: ProgressEntry?,
) {
    val start: LocalTime get() = NugaTime.parseHHmm(period.start) ?: LocalTime.MIDNIGHT
    val end: LocalTime get() = NugaTime.parseHHmm(period.end) ?: LocalTime.MIDNIGHT
    val startDateTime: LocalDateTime get() = date.atTime(start)
    val endDateTime: LocalDateTime get() = date.atTime(end)
    val lessonInfo: LessonInfo? get() = progress?.toLessonInfo()

    /** "2-3 · 3교시" */
    val headline: String get() = "$classLabel · ${period.no}교시"

    /** "3단원 2차시 · 화학 평형" or null */
    val subline: String?
        get() = progress?.let { p ->
            val head = listOf(p.unit, "${p.lesson}차시").filter { it.isNotBlank() }.joinToString(" ")
            if (p.title.isBlank()) head else "$head · ${p.title}"
        }

    fun contains(time: LocalDateTime): Boolean =
        time.toLocalDate() == date && !time.toLocalTime().isBefore(start) && time.toLocalTime().isBefore(end)
}

/** Result of resolving the timetable against a wall-clock time. */
data class LessonState(
    /** Lesson in progress right now, or null. */
    val current: LessonSlot?,
    /** Next lesson starting after now (today first, then following days), or null. */
    val next: LessonSlot?,
    /** All lessons scheduled on the date of `now`, ordered by period. */
    val today: List<LessonSlot>,
) {
    val inClass: Boolean get() = current != null
    val display: LessonSlot? get() = current ?: next
}

object TimetableResolver {
    private const val LOOKAHEAD_DAYS = 14

    fun periodsSorted(config: Config): List<PeriodDef> = config.periods.sortedBy { it.no }

    /** Lessons for [date], ordered by period number. */
    fun slotsOn(config: Config, date: LocalDate): List<LessonSlot> {
        val weekday = NugaTime.weekdayOf(date)
        val periodsByNo = config.periods.associateBy { it.no }
        return config.timetable
            .asSequence()
            .filter { it.weekday == weekday }
            .mapNotNull { entry ->
                val period = periodsByNo[entry.period] ?: return@mapNotNull null
                LessonSlot(
                    date = date,
                    period = period,
                    classLabel = entry.classLabel,
                    progress = progressFor(config, date, entry.classLabel),
                )
            }
            .sortedBy { it.period.no }
            .toList()
    }

    /** Progress row for exactly this date+class, or null (PC fills it in later when unknown). */
    fun progressFor(config: Config, date: LocalDate, classLabel: String): ProgressEntry? {
        val iso = NugaTime.formatDate(date)
        return config.progress.firstOrNull { it.date == iso && it.classLabel == classLabel }
    }

    fun current(config: Config, now: LocalDateTime): LessonSlot? =
        slotsOn(config, now.toLocalDate()).firstOrNull { it.contains(now) }

    /** Next lesson strictly after [now], looking ahead up to two weeks. */
    fun next(config: Config, now: LocalDateTime): LessonSlot? {
        val today = slotsOn(config, now.toLocalDate()).firstOrNull { it.startDateTime.isAfter(now) }
        if (today != null) return today
        var date = now.toLocalDate()
        repeat(LOOKAHEAD_DAYS) {
            date = date.plusDays(1)
            val first = slotsOn(config, date).firstOrNull()
            if (first != null) return first
        }
        return null
    }

    fun resolve(config: Config, now: LocalDateTime): LessonState =
        LessonState(
            current = current(config, now),
            next = next(config, now),
            today = slotsOn(config, now.toLocalDate()),
        )

    /** Lesson start times from [from] onward (inclusive of later today) within the lookahead window. */
    fun upcomingStarts(config: Config, from: LocalDateTime, limit: Int = 20): List<LessonSlot> {
        val out = ArrayList<LessonSlot>()
        var date = from.toLocalDate()
        var day = 0
        while (out.size < limit && day <= LOOKAHEAD_DAYS) {
            for (slot in slotsOn(config, date)) {
                if (slot.startDateTime.isAfter(from)) out += slot
                if (out.size >= limit) break
            }
            date = date.plusDays(1)
            day++
        }
        return out
    }

    /** Class label whose lesson is happening now, or the class to pre-select (next lesson today), or the first configured class. */
    fun defaultClass(config: Config, now: LocalDateTime): String? =
        current(config, now)?.classLabel
            ?: next(config, now)?.takeIf { it.date == now.toLocalDate() }?.classLabel
            ?: config.classes.firstOrNull()?.classLabel

    fun lessonInfoFor(config: Config, now: LocalDateTime, classLabel: String): LessonInfo? =
        progressFor(config, now.toLocalDate(), classLabel)?.toLessonInfo()
}
