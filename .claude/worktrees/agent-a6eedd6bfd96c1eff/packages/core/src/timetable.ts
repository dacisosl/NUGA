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

/** 단원·제목이 모두 비어 있는 진도 행 (시간표로 만든 빈 양식) */
export function isBlankProgress(p: ProgressRow): boolean { return !p.unit.trim() && !p.title.trim(); }

export function lessonFor(progressAll: ProgressRow[], cls: string, isoOrDate: string): Lesson | null {
  const progress = progressAll.filter((p) => !isBlankProgress(p));
  const key = isoOrDate.length > 10 ? dateKey(isoOrDate) : isoOrDate;
  const exact = progress.find((p) => p.class === cls && p.date === key);
  if (exact) return { unit: exact.unit, lesson: exact.lesson, title: exact.title };
  const before = progress.filter((p) => p.class === cls && p.date <= key).sort((a, b) => b.date.localeCompare(a.date))[0];
  return before ? { unit: before.unit, lesson: before.lesson, title: before.title } : null;
}

export function lessonLabel(l: Lesson | null | undefined): string {
  if (!l || (!l.unit && !l.title)) return "";
  return [l.unit, l.lesson ? `${l.lesson}차시` : "", l.title].filter(Boolean).join(" ");
}

/** 학기 기간: 1학기 3/2~7/24, 2학기 8/17~12/31 */
export function semesterRange(year: number, semester: number): { start: Date; end: Date } {
  return semester === 1 ? { start: new Date(year, 2, 2), end: new Date(year, 6, 24) } : { start: new Date(year, 7, 17), end: new Date(year, 11, 31) };
}

/** 시간표에서 반의 수업 날짜 목록 (같은 날 여러 교시는 하루로) */
export function lessonDates(timetable: TimetableCell[], cls: string, year: number, semester: number): string[] {
  const wds = new Set(timetable.filter((t) => t.class === cls).map((t) => t.weekday));
  if (!wds.size) return [];
  const { start, end } = semesterRange(year, semester);
  const out: string[] = [];
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) if (wds.has(weekdayOf(d))) out.push(dateKey(d));
  return out;
}

/**
 * 시간표에 맞춰 진도표 빈 양식을 맞춘다.
 * - 채워진 행은 그대로 둔다.
 * - 수업 날짜인데 행이 없으면 빈 행을 추가한다.
 * - 빈 행인데 더 이상 수업 날짜가 아니면 지운다.
 */
export function syncProgressSkeleton(progress: ProgressRow[], timetable: TimetableCell[], year: number, semester: number): { progress: ProgressRow[]; added: number; removed: number } {
  const classes = [...new Set(timetable.map((t) => t.class))];
  const want = new Map<string, Set<string>>();
  for (const c of classes) want.set(c, new Set(lessonDates(timetable, c, year, semester)));
  let removed = 0;
  const kept = progress.filter((p) => {
    if (!isBlankProgress(p)) return true;
    const ok = want.get(p.class)?.has(p.date) ?? false;
    if (!ok) removed++;
    return ok;
  });
  const have = new Set(kept.map((p) => `${p.class}|${p.date}`));
  let added = 0;
  for (const [c, dates] of want) for (const d of dates) if (!have.has(`${c}|${d}`)) { kept.push({ date: d, class: c, unit: "", lesson: 0, title: "" }); added++; }
  kept.sort((a, b) => a.date.localeCompare(b.date) || a.class.localeCompare(b.class));
  return { progress: kept, added, removed };
}

export function periodLabel(p: PeriodDef): string { return `${p.no}교시 ${p.start}–${p.end}`; }

export function cellKey(t: TimetableCell): string { return `${t.weekday}-${t.period}`; }

export const WEEKDAY_LABELS = ["", "월", "화", "수", "목", "금", "토", "일"];

/** 영역 배정용 요약: 영역 id, 그 영역의 시간표·교시, 반 이름들 */
export interface AreaRoute { id: string; timetable: TimetableCell[]; periods: PeriodDef[]; classes: string[] }

/**
 * 폰에서 온 기록을 어느 영역에 넣을지 정한다.
 * 1) 기록 시각에 그 반 수업이 있는 영역(시작 5분 전 ~ 끝난 뒤 10분)
 * 2) 같은 날 그 반의 직전 수업이 있는 영역(쉬는 시간·방과 후 기록)
 * 3) 그 반을 가진 영역
 * 같은 조건이면 현재 영역을 먼저 고른다. 아무 데도 없으면 현재 영역.
 */
export function routeRecordArea(areas: AreaRoute[], rec: { class: string; time: string }, currentId: string): string {
  const order = [...areas].sort((a, b) => (a.id === currentId ? -1 : b.id === currentId ? 1 : 0));
  const d = new Date(rec.time);
  if (!Number.isNaN(d.getTime())) {
    const wd = weekdayOf(d);
    const mins = d.getHours() * 60 + d.getMinutes();
    let best: { id: string; start: number } | null = null;
    for (const a of order) {
      for (const s of slotsForWeekday(a, wd)) {
        if (s.class !== rec.class) continue;
        const st = hm(s.start), en = hm(s.end);
        if (mins >= st - 5 && mins <= en + 10) return a.id;
        if (st <= mins && (!best || st > best.start)) best = { id: a.id, start: st };
      }
    }
    if (best) return best.id;
  }
  const byClass = order.find((a) => a.classes.includes(rec.class));
  return byClass ? byClass.id : currentId;
}
