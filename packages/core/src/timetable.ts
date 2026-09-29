import type { Lesson, PeriodDef, ProgressRow, Settings, TimetableCell } from "./types";
import { dateKey } from "./ids";

/** 1=월 … 7=일 */
export function weekdayOf(d: Date): number { const w = d.getDay(); return w === 0 ? 7 : w; }

function hm(s: string): number { const [h, m] = s.split(":").map(Number); return h * 60 + m; }

export interface LessonSlot { class: string; period: number; start: string; end: string; weekday: number }

export interface NowInfo {
  weekday: number;
  current: LessonSlot | null;
  next: LessonSlot | null;
  today: LessonSlot[];
}

export function slotsForWeekday(settings: Pick<Settings, "timetable" | "periods">, weekday: number): LessonSlot[] {
  const pmap = new Map(settings.periods.map((p) => [p.no, p]));
  return settings.timetable
    .filter((t) => t.weekday === weekday)
    .map((t) => { const p = pmap.get(t.period); return p ? { class: t.class, period: t.period, start: p.start, end: p.end, weekday } : null; })
    .filter((x): x is LessonSlot => !!x)
    .sort((a, b) => a.period - b.period);
}

export function resolveNow(settings: Pick<Settings, "timetable" | "periods">, d: Date = new Date()): NowInfo {
  const weekday = weekdayOf(d);
  const today = slotsForWeekday(settings, weekday);
  const mins = d.getHours() * 60 + d.getMinutes();
  // 수업 시작 5분 전부터 종료 후 10분까지를 "현재 수업"으로 본다 (기록 보완 여유).
  const current = today.find((s) => mins >= hm(s.start) - 5 && mins <= hm(s.end) + 10) || null;
  const next = today.find((s) => hm(s.start) - 5 > mins) || null;
  return { weekday, current, next, today };
}

export function lessonFor(progress: ProgressRow[], cls: string, isoOrDate: string): Lesson | null {
  const key = isoOrDate.length > 10 ? dateKey(isoOrDate) : isoOrDate;
  const exact = progress.find((p) => p.class === cls && p.date === key);
  if (exact) return { unit: exact.unit, lesson: exact.lesson, title: exact.title };
  const before = progress.filter((p) => p.class === cls && p.date <= key).sort((a, b) => b.date.localeCompare(a.date))[0];
  return before ? { unit: before.unit, lesson: before.lesson, title: before.title } : null;
}

export function lessonLabel(l: Lesson | null | undefined): string {
  if (!l) return "";
  return `${l.unit} ${l.lesson}차시${l.title ? " " + l.title : ""}`;
}

export function periodLabel(p: PeriodDef): string { return `${p.no}교시 ${p.start}–${p.end}`; }

export function cellKey(t: TimetableCell): string { return `${t.weekday}-${t.period}`; }

export const WEEKDAY_LABELS = ["", "월", "화", "수", "목", "금", "토", "일"];
