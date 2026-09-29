package kr.nuga.shared

import kr.nuga.shared.demo.DemoConfig
import kr.nuga.shared.model.ClassDef
import kr.nuga.shared.model.Config
import kr.nuga.shared.model.PeriodDef
import kr.nuga.shared.model.ProgressEntry
import kr.nuga.shared.model.TimetableEntry
import kr.nuga.shared.timetable.TimetableResolver
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime

class TimetableResolverTest {
    // 2026-05-08 is a Friday (weekday 5); 2026-05-05 is Tuesday (weekday 2).
    private val tuesday: LocalDate = LocalDate.of(2026, 5, 5)
    private val friday: LocalDate = LocalDate.of(2026, 5, 8)

    private val config = Config(
        classes = listOf(ClassDef("2-3", 28), ClassDef("2-5", 27)),
        periods = listOf(
            PeriodDef(1, "08:50", "09:40"),
            PeriodDef(2, "09:50", "10:40"),
            PeriodDef(3, "10:50", "11:40"),
        ),
        timetable = listOf(
            TimetableEntry(weekday = 2, period = 3, classLabel = "2-3"),
            TimetableEntry(weekday = 2, period = 1, classLabel = "2-5"),
            TimetableEntry(weekday = 5, period = 2, classLabel = "2-5"),
        ),
        progress = listOf(
            ProgressEntry("2026-05-05", "2-3", "3단원", 2, "화학 평형"),
        ),
    )

    @Test
    fun weekdayNumbering_1IsMonday() {
        assertEquals(2, kr.nuga.shared.time.NugaTime.weekdayOf(tuesday))
        assertEquals(5, kr.nuga.shared.time.NugaTime.weekdayOf(friday))
    }

    @Test
    fun slotsOn_sortedByPeriod_andProgressAttached() {
        val slots = TimetableResolver.slotsOn(config, tuesday)
        assertEquals(listOf(1, 3), slots.map { it.period.no })
        assertEquals("2-5", slots[0].classLabel)
        assertNull(slots[0].progress)
        assertEquals("2-3", slots[1].classLabel)
        assertEquals("화학 평형", slots[1].progress?.title)
        assertEquals("2-3 · 3교시", slots[1].headline)
        assertEquals("3단원 2차시 · 화학 평형", slots[1].subline)
    }

    @Test
    fun resolve_duringLesson_returnsCurrent() {
        val state = TimetableResolver.resolve(config, tuesday.atTime(LocalTime.of(11, 0)))
        assertTrue(state.inClass)
        assertEquals("2-3", state.current?.classLabel)
        assertEquals(3, state.current?.period?.no)
        assertEquals("3단원", state.current?.lessonInfo?.unit)
        // no more lessons Tuesday → next is Friday period 2
        assertEquals(friday, state.next?.date)
        assertEquals(2, state.next?.period?.no)
    }

    @Test
    fun resolve_atStartBoundary_isInClass_atEndBoundary_isNot() {
        assertNotNull(TimetableResolver.current(config, tuesday.atTime(LocalTime.of(10, 50))))
        assertNull(TimetableResolver.current(config, tuesday.atTime(LocalTime.of(11, 40))))
    }

    @Test
    fun resolve_duringBreak_returnsNextLessonToday() {
        val state = TimetableResolver.resolve(config, tuesday.atTime(LocalTime.of(9, 45)))
        assertFalse(state.inClass)
        assertNull(state.current)
        assertEquals("2-3", state.next?.classLabel)
        assertEquals(tuesday, state.next?.date)
        assertEquals("2-3 · 3교시", state.display?.headline)
        assertEquals(2, state.today.size)
    }

    @Test
    fun resolve_afterSchool_returnsNextDayLesson() {
        val state = TimetableResolver.resolve(config, tuesday.atTime(LocalTime.of(17, 0)))
        assertNull(state.current)
        assertEquals(friday, state.next?.date)
        assertEquals("2-5", state.next?.classLabel)
    }

    @Test
    fun resolve_weekend_hasNoLessonsToday() {
        val saturday = LocalDate.of(2026, 5, 9)
        val state = TimetableResolver.resolve(config, saturday.atTime(LocalTime.NOON))
        assertTrue(state.today.isEmpty())
        assertNull(state.current)
        assertEquals(LocalDate.of(2026, 5, 12), state.next?.date) // next Tuesday
    }

    @Test
    fun emptyConfig_resolvesToNothing() {
        val state = TimetableResolver.resolve(Config.EMPTY, LocalDateTime.of(2026, 5, 5, 10, 0))
        assertNull(state.current)
        assertNull(state.next)
        assertTrue(state.today.isEmpty())
    }

    @Test
    fun upcomingStarts_onlyFutureStarts() {
        val starts = TimetableResolver.upcomingStarts(config, tuesday.atTime(LocalTime.of(9, 0)), limit = 3)
        assertEquals(listOf(tuesday.atTime(10, 50), friday.atTime(9, 50), LocalDate.of(2026, 5, 12).atTime(8, 50)), starts.map { it.startDateTime })
    }

    @Test
    fun defaultClass_prefersCurrentThenNextTodayThenFirst() {
        assertEquals("2-3", TimetableResolver.defaultClass(config, tuesday.atTime(11, 0)))
        assertEquals("2-3", TimetableResolver.defaultClass(config, tuesday.atTime(9, 45)))
        assertEquals("2-3", TimetableResolver.defaultClass(config, tuesday.atTime(20, 0))) // first configured
    }

    @Test
    fun demoConfig_isComplete() {
        val demo = DemoConfig.create(friday)
        assertEquals(2, demo.classes.size)
        assertEquals(7, demo.periods.size)
        assertEquals(15, demo.timetable.size)
        assertEquals(3, demo.progress.size)
        assertNull(demo.roster)
        assertTrue(demo.timetable.all { it.weekday in 1..5 })
        val state = TimetableResolver.resolve(demo, friday.atTime(11, 0))
        assertEquals("2-3", state.current?.classLabel)
        assertEquals("화학 평형", state.current?.progress?.title)
    }
}
