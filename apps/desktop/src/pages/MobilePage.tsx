import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  CATEGORY_NONE, WEEKDAY_LABELS, dateKey, lessonFor, lessonLabel, nowIso, resolveNow, slotsForWeekday, weekdayOf,
  type LessonSlot, type NugaDoc, type RecordCategory, type RecordSource,
} from "@nuga/core";
import { Sheet } from "../App";
import { classList, studentsOf, useStore } from "../store";
import "./mobile.css";

/**
 * 모바일 화면: 상단 바 [모바일 화면]을 누르면 바로 기록 화면이 열린다 (홈·탭·위젯 같은 대시보드 없음).
 * 반(지금 수업이 켜진 채) → 번호 릴 → [저장]. 카테고리는 고르지 않는다 (0 = 미정, PC가 보충할 때 정한다).
 * 저장하면 PC에서는 곧바로 알림 팝업(쉬는 시간 기록)이 떠서 관찰 내용을 채운다. 폰 너비·터치 화면에서는 팝업 없이
 * 아래 알림 띠만 보이고, 기록은 미반영에 쌓인다 (PC에서 [미반영]으로 처리).
 * 모양은 폰 앱의 '밤의 틀 · 빛나는 종이'(mobile.css)를 따른다. PC에서는 폰 틀 안에, 폰에서는 화면 가득.
 */

/** 기록 판 상태: 카테고리는 고르지 않는다 — 늘 0(미정), PC가 보충할 때 정한다 */
interface SheetState { cls: string; category: RecordCategory; no: number | null; memo: string; source: RecordSource }
type Next = { slot: LessonSlot; date: Date } | null;

const two = (n: number) => String(n).padStart(2, "0");
const hhmm = (d: Date) => `${two(d.getHours())}:${two(d.getMinutes())}`;
const koDate = (d: Date) => `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAY_LABELS[weekdayOf(d)]})`;
const atMin = (day: Date, hm: string, plus = 0) => { const [h, m] = hm.split(":").map(Number); const x = new Date(day); x.setHours(h, m + plus, 0, 0); return x; };
/** 명렬표 이름 (없으면 null) */
const nameOf = (doc: NugaDoc, cls: string, no: number) => doc.students.find((s) => s.class === cls && s.no === no)?.name || null;
/** 반 인원: 명렬표 수와 설정의 반 크기 중 큰 쪽 */
const classSize = (doc: NugaDoc, cls: string) => Math.max(studentsOf(doc, cls).length, doc.settings.classes.find((c) => c.class === cls)?.size || 0);

/** 폰 너비 + 터치 화면이면 '모바일'(알림 팝업 없음), 아니면 PC */
const PHONE_QUERY = "(max-width: 640px) and (pointer: coarse)";
function useIsPhone(): boolean {
  const [on, setOn] = useState(() => typeof matchMedia === "function" && matchMedia(PHONE_QUERY).matches);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const mq = matchMedia(PHONE_QUERY);
    const h = () => setOn(mq.matches);
    mq.addEventListener("change", h); return () => mq.removeEventListener("change", h);
  }, []);
  return on;
}

/** 다음 수업 (오늘 남은 것 → 이후 7일) */
function nextSlot(doc: NugaDoc, now: Date): Next {
  const m = now.getHours() * 60 + now.getMinutes();
  for (let i = 0; i < 8; i++) {
    const d = new Date(now); d.setDate(d.getDate() + i);
    const s = slotsForWeekday(doc.settings, weekdayOf(d)).find((x) => i > 0 || atMin(now, x.start).getHours() * 60 + atMin(now, x.start).getMinutes() > m);
    if (s) return { slot: s, date: d };
  }
  return null;
}

/** 수업 한 줄 설명 (LessonSlot.subline): 지금이면 진도(없으면 시각), 예정이면 '날짜 시각 시작 · 진도' */
function sublineOf(doc: NugaDoc, now: Date, current: LessonSlot | null, next: Next): string | null {
  const sub = (s: LessonSlot, d: Date) => lessonLabel(lessonFor(doc.settings.progress, s.class, dateKey(d)));
  if (current) return sub(current, now) || `${current.start}–${current.end}`;
  if (next) {
    const day = dateKey(next.date) !== dateKey(now) ? koDate(next.date) + " " : "";
    const s = sub(next.slot, next.date);
    return `${day}${next.slot.start} 시작${s ? ` · ${s}` : ""}`;
  }
  return null;
}


/* 폰 앱이 쓰는 머티리얼 아이콘 (24 격자) */
const MI = {
  editNote: "M3 10h11v2H3v-2zm0-2h11V6H3v2zm0 8h7v-2H3v2zm15.01-3.13.71-.71c.39-.39 1.02-.39 1.41 0l.71.71c.39.39.39 1.02 0 1.41l-.71.71-2.12-2.12zm-.71.71-5.3 5.3V21h2.12l5.3-5.3-2.12-2.12z",
  mic: "M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z",
  micOff: "M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z",
  signal: "M2 22h20V2z",
  battery: "M15.67 4H14V2h-4v2H8.33C7.6 4 7 4.6 7 5.33v15.33C7 21.4 7.6 22 8.33 22h7.33c.74 0 1.34-.6 1.34-1.33V5.33C17 4.6 16.4 4 15.67 4z",
} as const;
function MIcon({ name, size = 24 }: { name: keyof typeof MI; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d={MI[name]} /></svg>;
}

export function MobilePage() {
  const doc = useStore((s) => s.doc);
  const addRecord = useStore((s) => s.addRecord);
  const deleteRecord = useStore((s) => s.deleteRecord);
  const openInbox = useStore((s) => s.openInbox);
  const phone = useIsPhone();
  const [tick, setTick] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setTick(Date.now()), 15_000); return () => clearInterval(t); }, []);
  const now = useMemo(() => new Date(tick), [tick]);
  const [snack, setSnack] = useState<{ text: string; id?: string } | null>(null);
  const snackTimer = useRef<number>();
  useEffect(() => () => window.clearTimeout(snackTimer.current), []);
  const showSnack = (text: string, id?: string) => {
    setSnack({ text, id });
    window.clearTimeout(snackTimer.current);
    snackTimer.current = window.setTimeout(() => setSnack(null), 5000);
  };

  const current = resolveNow(doc.settings, now).current;
  const next = current ? null : nextSlot(doc, now);
  const classes = classList(doc);
  const slot = current || next?.slot || null;

  /** 릴 시작 번호: PC 설정 '번호 릴 시작'이 last 면 그 반에서 마지막으로 기록한 번호, 아니면 1번 */
  const reelStart = (cls: string) => {
    const size = Math.max(classSize(doc, cls), 1);
    if (doc.settings.options?.reelStart !== "last") return 1;
    const last = doc.records.filter((r) => r.class === cls).sort((a, b) => b.time.localeCompare(a.time))[0]?.no;
    return Math.min(Math.max(last || 1, 1), size);
  };
  // 반은 지금(또는 다음) 수업으로 시작한다
  const [sheet, setSheet] = useState<SheetState>(() => {
    const cls = slot?.class || classes[0] || "";
    return { cls, category: CATEGORY_NONE, no: reelStart(cls), memo: "", source: "phone" };
  });
  // 반이 지워지거나 이름이 바뀌면 첫 반으로
  useEffect(() => {
    if (classes.length && !classes.includes(sheet.cls)) setSheet((s) => ({ ...s, cls: classes[0], no: reelStart(classes[0]) }));
  }, [classes.join(",")]);

  /** 저장: 보완을 쓰면 보완 대기로 들어가고, PC에서는 바로 알림 팝업을 연다 (폰에서는 띄우지 않는다) */
  const save = () => {
    if (!sheet.no || !sheet.cls) return;
    const supp = doc.settings.supplementEnabled;
    const memo = sheet.memo.trim();
    const t = nowIso();
    const rec = addRecord({
      class: sheet.cls, no: sheet.no, category: sheet.category, time: t, lesson: lessonFor(doc.settings.progress, sheet.cls, t),
      memo, voiceMemo: null, note: supp ? "" : memo, status: supp ? "pending" : "confirmed", source: phone ? "phone" : sheet.source,
    });
    setSheet((s) => ({ ...s, memo: "" }));
    // 알림 띠 글자: '저장 · 2-3 · 14번'
    showSnack(`저장 · ${sheet.cls} · ${sheet.no}번`, rec.id);
    if (!phone && supp) openInbox({ records: [rec.id] });
  };
  const undo = (id: string) => { deleteRecord(id); setSnack(null); };
  const sub = slot ? sublineOf(doc, now, current, next) : (doc.settings.timetable.length ? "" : "시간표 없음");

  return (
    <Sheet>
      <div className={`content mp-page ${phone ? "phone" : ""}`}>
        <div className="mp-stage">
          <div className={`mp-phone ${phone ? "full" : ""}`}>
            {!phone && <div className="mp-status"><b>{hhmm(now)}</b><span className="grow" /><MIcon name="signal" size={15} /><MIcon name="battery" size={16} /></div>}
            <div className="mp-recscreen">
              <Header index={current ? "지금 수업" : next ? "다음 수업" : koDate(now)} title={slot ? `${slot.class} · ${slot.period}교시` : "기록"} />
              {sub && <div className="mp-recsub">{sub}</div>}
              {classes.length === 0
                ? <div className="mp-none">PC 설정에서 반·명단을 먼저 등록하세요</div>
                : <RecordPanel doc={doc} sheet={sheet} setSheet={setSheet} showNames reelStart={reelStart} onSave={save} />}
            </div>
            {snack && (
              <div className="mp-snack" role="status"><span className="grow">{snack.text}</span>{snack.id && <button onClick={() => undo(snack.id!)}>취소</button>}</div>
            )}
          </div>
        </div>
      </div>
    </Sheet>
  );
}

/* ---------------- 공통 조각 (Glass.kt) ---------------- */

/** 머리 띠 (ScreenHeader): '01 ——' 쪽 번호 + 크고 촘촘한 하늘빛 제목. 오른쪽에 숫자 하나 */
function Header({ index, title, children }: { index: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mp-head">
      <div className="mp-idx">{index}</div>
      <div className="mp-head-row"><div className="mp-htitle">{title}</div>{children}</div>
    </div>
  );
}


/** 테두리 입력칸 (M3 OutlinedTextField): 비어 있으면 이름표가 칸 안에, 쓰거나 누르면 위 테두리로 올라간다 */
function Field({ label, value, onChange, rows = 1, night, autoFocus, err, children }: {
  label: string; value: string; onChange: (v: string) => void; rows?: number; night?: boolean; autoFocus?: boolean; err?: string; children?: React.ReactNode;
}) {
  const id = useId();
  return (
    <div className={`mp-field ${night ? "night" : ""} ${children ? "trail" : ""}`}>
      <div className="mp-fbox">
        <textarea id={id} rows={rows} placeholder=" " value={value} onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus} />
        <label htmlFor={id}>{label}</label>
        {children}
      </div>
      {err && <div className="mp-err">{err}</div>}
    </div>
  );
}

/* ---------------- 기록 판: 반 · 번호 릴 · [메모] [저장] ---------------- */

type SpeechRec = { lang: string; interimResults: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onerror: (e: { error: string }) => void; onend: () => void; start: () => void; stop: () => void };

/** 릴 한 칸 높이와 한 번에 보이는 칸 수 (가운데 하나 + 위아래 둘씩) — NumberSheet.kt ReelRow · ReelRows */
const REEL_ROW = 56;
const REEL_ROWS = 5;
const clampRow = (i: number, count: number) => Math.min(Math.max(i, 0), count - 1);

/**
 * 기록 판 (화면에 바로 펼친 기록 시트): 카테고리는 고르지 않는다 (0 = 미정, PC가 보충할 때 정한다).
 * 번호는 세로 릴 — 굴리면 한 칸씩 딸깍 멈추고, 가운데 유리 판 위의 숫자가 고른 번호다.
 * 메모·음성 메모는 저장 옆 작은 [메모] 버튼을 눌렀을 때만 펼친다. 저장하면 메모 칸은 접힌다.
 */
function RecordPanel({ doc, sheet, setSheet, showNames, reelStart, onSave }: {
  doc: NugaDoc; sheet: SheetState; setSheet: React.Dispatch<React.SetStateAction<SheetState>>; showNames: boolean; reelStart: (cls: string) => number; onSave: () => void;
}) {
  const classes = classList(doc);
  const size = Math.max(classSize(doc, sheet.cls), 1);
  const withNames = showNames && doc.students.some((s) => s.class === sheet.cls);
  const [memoOpen, setMemoOpen] = useState(sheet.memo !== "");
  const [focusMemo, setFocusMemo] = useState(false);
  const [listening, setListening] = useState(false);
  const [err, setErr] = useState("");
  const recRef = useRef<SpeechRec | null>(null);
  const set = (p: Partial<SheetState>) => setSheet((s) => ({ ...s, ...p }));
  useEffect(() => () => recRef.current?.stop(), []);
  const mic = () => {
    if (listening) { recRef.current?.stop(); return; }
    const W = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const Ctor = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!Ctor) { setErr("이 브라우저는 음성 입력을 지원하지 않습니다"); return; }
    const r = new Ctor(); r.lang = "ko-KR"; r.interimResults = false;
    // 폰의 appendSheetMemo 처럼 뒤에 이어 붙인다
    r.onresult = (e) => { const t = e.results[0]?.[0]?.transcript || ""; if (t) setSheet((s) => ({ ...s, memo: s.memo.trim() ? `${s.memo.trimEnd()} ${t}` : t })); };
    r.onerror = (e) => setErr(e.error === "not-allowed" ? "마이크 권한 필요" : `음성 오류: ${e.error}`);
    r.onend = () => setListening(false);
    recRef.current = r; setErr(""); setListening(true); r.start();
  };
  const toggleMemo = () => {
    const open = !memoOpen;
    setMemoOpen(open);
    if (open) setFocusMemo(true); else recRef.current?.stop();
  };
  const save = () => { recRef.current?.stop(); setMemoOpen(false); setFocusMemo(false); onSave(); };
  return (
    <div className="mp-sheet" role="form" aria-label="기록">
      {/* 반: 여러 반이면 칩(지금 수업 반이 켜진 채로 열린다), 한 반이면 큰 이름. 오른쪽에 인원 */}
      <div className="mp-sheet-top">
        {classes.length > 1 ? (
          <div className="mp-sheet-classes">
            {classes.map((c) => <button key={c} className={`mp-nchip cls ${c === sheet.cls ? "on" : ""}`} aria-pressed={c === sheet.cls} onClick={() => { if (c !== sheet.cls) set({ cls: c, no: reelStart(c) }); }}>{c}</button>)}
          </div>
        ) : <span className="mp-sheet-cls">{sheet.cls}</span>}
        <span className="mp-sheet-n">{size}명</span>
      </div>
      {/* 번호 릴: 반을 바꾸면 새로 만든다 (key) */}
      <NumberReel key={`${sheet.cls}:${size}`} count={size} initial={clampRow((sheet.no ?? 1) - 1, size) + 1} withNames={withNames}
        nameOf={(n) => (showNames ? nameOf(doc, sheet.cls, n) : null)} onSelect={(no) => set({ no })} />
      {/* 메모(선택): 펼쳤을 때만. 마이크는 칸 안 오른쪽 */}
      {memoOpen && (
        <Field night label={listening ? "듣는 중…" : "메모"} value={sheet.memo} onChange={(memo) => set({ memo })} err={err} autoFocus={focusMemo}>
          <button className={`mp-mic ${listening ? "on" : ""}`} onClick={mic} title="음성" aria-label="음성"><MIcon name={listening ? "micOff" : "mic"} /></button>
        </Field>
      )}
      {/* [메모] [저장 · N번]: 저장이 화면의 주인공(ButtonTone.Lit), 메모는 옆의 작은 유리 버튼 */}
      <div className="mp-sheet-acts">
        <button className={`mp-memo ${memoOpen ? "open" : ""} ${!memoOpen && sheet.memo.trim() ? "has" : ""}`} role="switch" aria-checked={memoOpen} onClick={toggleMemo}><MIcon name="editNote" size={20} />메모</button>
        <button className="mp-btn night lit save" disabled={!sheet.no} onClick={save}>{sheet.no ? `저장 · ${sheet.no}번` : "저장"}</button>
      </div>
    </div>
  );
}

/**
 * 세로 번호 릴 1..count (NumberSheet.kt NumberReel). 위아래 두 칸씩 여백을 두어 1번과 마지막 번호도 가운데에 설 수 있다.
 * 휠·끌기로 굴리면 가장 가까운 칸에 딸깍 멈추고(scroll-snap, 끄는 동안은 끄고 손을 떼면 굴려 맞춘다), 가운데 칸이 바뀔 때마다 [onSelect].
 * 다른 칸을 누르면 그 번호가 가운데로 굴러온다. 가운데에서 멀수록 작고 흐리다 (재렌더 없이 스크롤마다 style 로 칠한다).
 * [initial]은 처음 한 번만 읽는다. 밖에서 번호를 바꾸려면 key 로 릴을 새로 만든다.
 */
function NumberReel({ count, initial, nameOf: name, withNames, onSelect }: {
  count: number; initial: number; nameOf: (n: number) => string | null; withNames: boolean; onSelect: (n: number) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const rows = useRef<(HTMLButtonElement | null)[]>([]);
  const report = useRef(onSelect);
  report.current = onSelect;
  const reported = useRef(initial);
  const raf = useRef(0);
  const drag = useRef<{ y: number; top: number; moved: boolean } | null>(null);
  const dragged = useRef(false);
  const snapTimer = useRef<number>();

  /** 가운데에 선 칸(소수)으로 각 칸의 크기·투명도를 칠한다: 0 → 1.0·1.0, 1 → 0.74·0.58, 2 → 0.56·0.30. 가운데 칸이 바뀌면 알린다 */
  const paint = () => {
    const el = scroller.current;
    if (!el) return;
    const centre = el.scrollTop / REEL_ROW;
    rows.current.forEach((r, i) => {
      if (!r) return;
      const d = Math.min(Math.abs(i - centre), 2.5);
      const s = d <= 1 ? 1 - 0.26 * d : 0.74 - 0.18 * (d - 1);
      const a = d <= 1 ? 1 - 0.42 * d : Math.max(0.58 - 0.28 * (d - 1), 0);
      r.style.transform = `scale(${s.toFixed(3)})`;
      r.style.opacity = a.toFixed(3);
    });
    const n = clampRow(Math.round(centre), count) + 1;
    if (n !== reported.current) {
      reported.current = n;
      rows.current.forEach((r, i) => r?.setAttribute("aria-selected", String(i + 1 === n)));
      report.current(n);
    }
  };
  const schedule = () => { cancelAnimationFrame(raf.current); raf.current = requestAnimationFrame(paint); };
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = (initial - 1) * REEL_ROW;
    paint();
    return () => { cancelAnimationFrame(raf.current); window.clearTimeout(snapTimer.current); };
  }, []); // 처음 한 번만: initial 은 마운트 때만 읽는다 (바꾸려면 key 로 새로 만든다)
  const roll = (i: number) => scroller.current?.scrollTo({ top: clampRow(i, count) * REEL_ROW, behavior: "smooth" });

  // 마우스로 끌어 굴리기: 4px 넘게 움직이면 끌기로 보고 스냅을 끈다. 손을 떼면 가장 가까운 칸으로 굴린 뒤 스냅을 되살린다 (터치는 브라우저가 알아서)
  const down = (e: React.PointerEvent) => {
    if (e.button !== 0 || e.pointerType === "touch" || !scroller.current) return;
    window.clearTimeout(snapTimer.current);
    dragged.current = false;
    drag.current = { y: e.clientY, top: scroller.current.scrollTop, moved: false };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current; const el = scroller.current;
    if (!d || !el) return;
    const dy = e.clientY - d.y;
    if (!d.moved) {
      if (Math.abs(dy) < 4) return;
      d.moved = true; el.classList.add("drag"); el.setPointerCapture(e.pointerId);
    }
    el.scrollTop = d.top - dy;
  };
  const up = (e: React.PointerEvent) => {
    const d = drag.current; const el = scroller.current;
    drag.current = null;
    if (!d?.moved || !el) return;
    dragged.current = true;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    roll(Math.round(el.scrollTop / REEL_ROW));
    snapTimer.current = window.setTimeout(() => el.classList.remove("drag"), 360);
  };

  return (
    <div className="mp-reel" style={{ height: REEL_ROW * REEL_ROWS }}>
      {/* 가운데 유리 판: 고른 번호가 서는 자리 (움직이지 않는다) */}
      <div className="mp-reel-plate" aria-hidden />
      <div ref={scroller} className="mp-reel-scroll" role="listbox" aria-label="번호" style={{ padding: `${REEL_ROW * ((REEL_ROWS - 1) / 2)}px 0` }}
        onScroll={schedule} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        {Array.from({ length: count }, (_, i) => {
          const n = i + 1;
          return (
            <button key={n} ref={(el) => { rows.current[i] = el; }} type="button" role="option" aria-selected={n === initial} title={`${n}번 고르기`}
              className={`mp-reel-row ${withNames ? "named" : ""}`} onClick={() => { if (!dragged.current) roll(i); }}>
              <b>{n}</b>{withNames && <span>{name(n) || ""}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
