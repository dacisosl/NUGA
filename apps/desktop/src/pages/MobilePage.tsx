import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  CATEGORY_NONE, lessonFor, nowIso, resolveNow, slotsForWeekday, weekdayOf,
  type LessonSlot, type NugaDoc, type RecordCategory, type RecordSource,
} from "@nuga/core";
import { Sheet } from "../App";
import { classList, studentsOf, useStore } from "../store";
import "./mobile.css";

/**
 * 모바일 화면: 상단 바 [모바일 화면]을 누르면 바로 기록 화면이 열린다 (홈·탭·위젯 같은 대시보드 없음).
 * 위에는 반 · 과목 · 지금 시각만. 아래는 3열 번호 칸(번호 크게 · 이름 작게, 한 화면에 9명) → 누르면 바로 고름 → [저장].
 * 반은 지금(또는 다음) 수업 반으로 열린다. 카테고리는 고르지 않는다 (0 = 미정, PC가 보충할 때 정한다).
 * 저장하면 PC에서는 곧바로 알림 팝업(쉬는 시간 기록)이 떠서 관찰 내용을 채운다. 폰 너비·터치 화면에서는 팝업 없이
 * 아래 알림 띠만 보이고, 기록은 미반영에 쌓인다 (PC에서 [미반영]으로 처리).
 * 모양은 폰 앱의 '밤의 틀 · 빛나는 종이'(mobile.css)를 따른다. PC에서는 폰 틀 안에, 폰에서는 화면 가득.
 */

/** 기록 판 상태: 카테고리는 고르지 않는다 — 늘 0(미정), PC가 보충할 때 정한다 */
interface SheetState { cls: string; category: RecordCategory; no: number | null; memo: string; source: RecordSource }
type Next = { slot: LessonSlot; date: Date } | null;

const two = (n: number) => String(n).padStart(2, "0");
const hhmm = (d: Date) => `${two(d.getHours())}:${two(d.getMinutes())}`;
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

/** forcePhone: 웨일 사이드바 창. 터치가 아니어도 폰처럼 화면 가득, 알림 팝업 없이 큰 창의 미반영으로 보낸다 */
export function MobilePage({ forcePhone = false }: { forcePhone?: boolean }) {
  const doc = useStore((s) => s.doc);
  const addRecord = useStore((s) => s.addRecord);
  const deleteRecord = useStore((s) => s.deleteRecord);
  const openInbox = useStore((s) => s.openInbox);
  const phone = useIsPhone() || forcePhone;
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

  /** 처음 골라 둘 번호: PC 설정 '폰·워치 번호 릴 시작'이 last 면 그 반에서 마지막으로 기록한 번호, 아니면 1번 */
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
  const subject = doc.settings.school.subject.trim();

  return (
    <Sheet>
      <div className={`content mp-page ${phone ? "phone" : ""}`}>
        <div className="mp-stage">
          <div className={`mp-phone ${phone ? "full" : ""}`}>
            <div className="mp-recscreen">
              {classes.length === 0
                ? <><TopRow cls="" classes={[]} subject={subject} now={now} onClass={() => {}} /><div className="mp-none">PC 설정에서 반·명단을 먼저 등록하세요</div></>
                : <RecordPanel doc={doc} sheet={sheet} setSheet={setSheet} reelStart={reelStart} onSave={save} subject={subject} now={now} />}
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

/** 맨 위 한 줄: 반 · 과목 · 지금 시각만. 반이 여럿이면 반 이름을 눌러 바꾼다 (지금 수업 반으로 열린다) */
function TopRow({ cls, classes, subject, now, onClass }: { cls: string; classes: string[]; subject: string; now: Date; onClass: (c: string) => void }) {
  return (
    <div className="mp-top">
      {classes.length > 1
        ? <label className="mp-top-cls pick"><select value={cls} onChange={(e) => onClass(e.target.value)} aria-label="반 바꾸기">{classes.map((c) => <option key={c} value={c}>{c}</option>)}</select><span aria-hidden>▾</span></label>
        : cls && <b className="mp-top-cls">{cls}</b>}
      {subject && <span className="mp-top-subj">{subject}</span>}
      <time className="mp-top-time">{hhmm(now)}</time>
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

/* ---------------- 기록 판: 반 · 과목 · 시각 / 번호 칸 / [메모] [저장] ---------------- */

type SpeechRec = { lang: string; interimResults: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onerror: (e: { error: string }) => void; onend: () => void; start: () => void; stop: () => void };

/**
 * 기록 판 (화면에 바로 펼친 기록 시트): 카테고리는 고르지 않는다 (0 = 미정, PC가 보충할 때 정한다).
 * 번호는 3열 칸 — 칸 하나에 번호(크게)와 이름(작게). 한 화면에 9명이 보이고, 더 많으면 칸 안에서 아래로 민다. 누르면 바로 고른다.
 * 칸은 엄지가 닿는 아래쪽, [저장] 바로 위에 둔다. 메모·음성 메모는 [메모]를 눌렀을 때만 펼친다. 저장하면 메모 칸은 접힌다.
 */
function RecordPanel({ doc, sheet, setSheet, reelStart, onSave, subject, now }: {
  doc: NugaDoc; sheet: SheetState; setSheet: React.Dispatch<React.SetStateAction<SheetState>>; reelStart: (cls: string) => number; onSave: () => void; subject: string; now: Date;
}) {
  const classes = classList(doc);
  const size = Math.max(classSize(doc, sheet.cls), 1);
  const [memoOpen, setMemoOpen] = useState(sheet.memo !== "");
  const [focusMemo, setFocusMemo] = useState(false);
  const [listening, setListening] = useState(false);
  const [err, setErr] = useState("");
  const recRef = useRef<SpeechRec | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const set = (p: Partial<SheetState>) => setSheet((s) => ({ ...s, ...p }));
  useEffect(() => () => recRef.current?.stop(), []);
  // 반을 바꾸거나 처음 열 때: 골라 둔 칸이 보이게 칸 안에서만 민다 (페이지는 움직이지 않는다)
  useLayoutEffect(() => {
    const el = grid.current, on = el?.querySelector<HTMLElement>(".mp-cell.on");
    if (el) el.scrollTop = on ? Math.max(0, on.offsetTop - 4) : 0;
  }, [sheet.cls]);
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
      <TopRow cls={sheet.cls} classes={classes} subject={subject} now={now} onClass={(c) => { if (c !== sheet.cls) set({ cls: c, no: reelStart(c) }); }} />
      {/* 번호 칸: 3열, 한 화면에 9명. 누르면 바로 고른다 */}
      <div ref={grid} className="mp-grid" role="listbox" aria-label="번호">
        {Array.from({ length: size }, (_, i) => {
          const n = i + 1, nm = nameOf(doc, sheet.cls, n), on = sheet.no === n;
          return (
            <button key={n} type="button" role="option" aria-selected={on} className={`mp-cell ${on ? "on" : ""}`} onClick={() => set({ no: n })} title={nm ? `${n}번 ${nm}` : `${n}번`}>
              <b>{n}</b>{nm && <span>{nm}</span>}
            </button>
          );
        })}
      </div>
      {/* 메모(선택): 펼쳤을 때만. 마이크는 칸 안 오른쪽 */}
      {memoOpen && (
        <Field night label={listening ? "듣는 중…" : "메모"} value={sheet.memo} onChange={(memo) => set({ memo })} err={err} autoFocus={focusMemo}>
          <button className={`mp-mic ${listening ? "on" : ""}`} onClick={mic} title="음성" aria-label="음성"><MIcon name={listening ? "micOff" : "mic"} /></button>
        </Field>
      )}
      {/* [메모] [저장 · N번]: 저장이 화면의 주인공(ButtonTone.Lit), 메모는 옆의 작은 유리 버튼 */}
      <div className="mp-sheet-acts">
        <button className={`mp-memo ${memoOpen ? "open" : ""} ${!memoOpen && sheet.memo.trim() ? "has" : ""}`} role="switch" aria-checked={memoOpen} onClick={toggleMemo}><MIcon name="editNote" size={20} />메모</button>
        <button className="mp-btn night lit save" disabled={!sheet.no} onClick={save}>{sheet.no ? `저장 · ${sheet.no}번` : "번호를 눌러 주세요"}</button>
      </div>
    </div>
  );
}
