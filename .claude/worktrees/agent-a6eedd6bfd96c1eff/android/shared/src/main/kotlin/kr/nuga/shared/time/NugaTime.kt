package kr.nuga.shared.time

import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

/** ISO-8601 helpers. All timestamps carry the local offset (PROTOCOL.md §0). */
object NugaTime {
    private val isoOffset: DateTimeFormatter = DateTimeFormatter.ISO_OFFSET_DATE_TIME
    private val isoDate: DateTimeFormatter = DateTimeFormatter.ISO_LOCAL_DATE
    private val hhmm: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")

    fun nowIso(zone: ZoneId = ZoneId.systemDefault()): String =
        ZonedDateTime.now(zone).truncatedTo(ChronoUnit.SECONDS).toOffsetDateTime().format(isoOffset)

    fun toIso(dateTime: LocalDateTime, zone: ZoneId = ZoneId.systemDefault()): String =
        dateTime.atZone(zone).truncatedTo(ChronoUnit.SECONDS).toOffsetDateTime().format(isoOffset)

    fun todayIso(zone: ZoneId = ZoneId.systemDefault()): String = LocalDate.now(zone).format(isoDate)

    fun dateOf(iso: String): LocalDate = parse(iso)?.toLocalDate() ?: LocalDate.now()

    fun parse(iso: String): LocalDateTime? = runCatching {
        OffsetDateTime.parse(iso).atZoneSameInstant(ZoneId.systemDefault()).toLocalDateTime()
    }.getOrNull() ?: runCatching { LocalDateTime.parse(iso) }.getOrNull()

    fun parseEpochMillis(iso: String): Long? = runCatching { OffsetDateTime.parse(iso).toInstant().toEpochMilli() }.getOrNull()

    fun formatDate(date: LocalDate): String = date.format(isoDate)

    fun parseHHmm(text: String): LocalTime? = runCatching { LocalTime.parse(text.trim(), hhmm) }.getOrNull()
        ?: runCatching { LocalTime.parse(text.trim()) }.getOrNull()

    fun formatHHmm(time: LocalTime): String = time.format(hhmm)

    /** 1=Mon … 7=Sun, matching PROTOCOL weekday numbering. */
    fun weekdayOf(date: LocalDate): Int = date.dayOfWeek.value

    fun shortTime(iso: String): String = parse(iso)?.toLocalTime()?.format(hhmm) ?: ""

    fun koreanDate(date: LocalDate): String {
        val names = arrayOf("월", "화", "수", "목", "금", "토", "일")
        return "${date.monthValue}월 ${date.dayOfMonth}일 (${names[date.dayOfWeek.value - 1]})"
    }
}
