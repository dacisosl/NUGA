package kr.nuga.shared.demo

import kr.nuga.shared.model.ClassDef
import kr.nuga.shared.model.Config
import kr.nuga.shared.model.ConfigOptions
import kr.nuga.shared.model.PeriodDef
import kr.nuga.shared.model.ProgressEntry
import kr.nuga.shared.model.ReelStart
import kr.nuga.shared.model.SchoolInfo
import kr.nuga.shared.model.TimetableEntry
import kr.nuga.shared.time.NugaTime
import java.time.DayOfWeek
import java.time.LocalDate

/** Demo configuration so the apps can be tried without a paired PC. Contains no names. */
object DemoConfig {
    const val CLASS_A = "2-3"
    const val CLASS_B = "2-5"

    fun create(today: LocalDate = LocalDate.now()): Config {
        val periods = listOf(
            PeriodDef(1, "08:50", "09:40"),
            PeriodDef(2, "09:50", "10:40"),
            PeriodDef(3, "10:50", "11:40"),
            PeriodDef(4, "11:50", "12:40"),
            // lunch 12:40–13:30
            PeriodDef(5, "13:30", "14:20"),
            PeriodDef(6, "14:30", "15:20"),
            PeriodDef(7, "15:30", "16:20"),
        )
        val timetable = listOf(
            TimetableEntry(1, 1, CLASS_A), TimetableEntry(1, 3, CLASS_B), TimetableEntry(1, 5, CLASS_A),
            TimetableEntry(2, 2, CLASS_B), TimetableEntry(2, 4, CLASS_A), TimetableEntry(2, 7, CLASS_B),
            TimetableEntry(3, 1, CLASS_B), TimetableEntry(3, 3, CLASS_A), TimetableEntry(3, 6, CLASS_B),
            TimetableEntry(4, 2, CLASS_A), TimetableEntry(4, 5, CLASS_B), TimetableEntry(4, 6, CLASS_A),
            TimetableEntry(5, 3, CLASS_A), TimetableEntry(5, 4, CLASS_B), TimetableEntry(5, 7, CLASS_A),
        )
        // Progress rows around "today" so the lesson card has something to show even on a weekend.
        val anchor = if (today.dayOfWeek == DayOfWeek.SATURDAY) today.plusDays(2)
        else if (today.dayOfWeek == DayOfWeek.SUNDAY) today.plusDays(1) else today
        val progress = listOf(
            ProgressEntry(NugaTime.formatDate(anchor), CLASS_A, "3단원", 2, "화학 평형"),
            ProgressEntry(NugaTime.formatDate(anchor), CLASS_B, "3단원", 1, "가역 반응"),
            ProgressEntry(NugaTime.formatDate(anchor.plusDays(1)), CLASS_A, "3단원", 3, "평형 상수"),
        )
        return Config(
            school = SchoolInfo(grade = 2, subject = "화학Ⅰ", year = today.year, semester = if (today.monthValue in 3..7) 1 else 2),
            categories = Config.DEFAULT_CATEGORIES,
            classes = listOf(ClassDef(CLASS_A, 28), ClassDef(CLASS_B, 27)),
            periods = periods,
            timetable = timetable,
            progress = progress,
            roster = null,
            options = ConfigOptions(autoLaunchWatch = true, reelStart = ReelStart.ONE),
            updatedAt = NugaTime.nowIso(),
        )
    }
}
