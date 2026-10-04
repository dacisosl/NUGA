import React, { useEffect, useMemo, useRef, useState } from "react";
import { WEEKDAY_LABELS, dateKey, fmtHM, lessonFor, nowIso, slotsForWeekday, weekdayOf, type Category, type LessonSlot, type NugaRecord } from "@nuga/core";
import { classList, studentName, studentsOf, useStore } from "../store";
import { AchPress, Chip, Confirm, Icon } from "../components/ui";
import { TranscriptModal } from "../components/TranscriptView";
import { useTranscripts } from "../lib/transcripts";
import { demoInfo, startDemo } from "../lib/demo";
import { DemoSimulator } from "../components/DemoSimulator";

const hm = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
const SRC_LABEL: Record<string, string> = { watch: "워치", widget: "위젯", phone: "폰", pc: "PC", suggestion: "추천" };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

/** 오늘 기록 칸 (누가기록 화면 왼쪽): 날짜 · 반별 기록 필드(시간표 순서) */
export function TodayPanel({ onCollapse }: { onCollapse?: () => void }) {
  const doc = useStore((s) => s.doc);
  const toast = useStore((s) => s.toast);
  const [date, setDate] = useState(() => new Date());
  const [demo, setDemo] = useState(() => !!demoInfo());
  const [starting, setStarting] = useState(false);
  const beginDemo = async () => { setStarting(true); try { await startDemo(); setDemo(true); setDate(new Date()); toast({ text: "데모 모드: 합성 학급·기록·모의 수업 스크립트를 불러왔습니다" }); } finally { setStarting(false); } };

  const day = dateKey(date);
  const isToday = day === dateKey(new Date());
  const slots = slotsForWeekday(doc.settings, weekdayOf(date));
  // 시간표 순서대로, 같은 반이 두 번이면 두 필드. 시간표에 없는데 그날 기록이 있는 반은 뒤에.
  const fields = useMemo(() => {
    const out: { cls: string; slot: LessonSlot | null }[] = slots.map((s) => ({ cls: s.class, slot: s }));
    const extra = classList(doc).filter((c) => !slots.some((s) => s.class === c) && (slots.length === 0 || doc.records.some((r) => r.class === c && dateKey(r.time) === day)));
    return [...out, ...extra.map((c) => ({ cls: c, slot: null }))];
  }, [slots.map((s) => s.class + s.period).join(), doc.records.length, day, doc.settings.classes]);

  return (
    <div className="today-pane">
      <div className="day-nav">
        {onCollapse && <button className="btn ghost icon fold-btn" onClick={onCollapse} title="오늘 기록 접기" aria-label="오늘 기록 접기"><Icon name="left" size={14} /><Icon name="left" size={14} /></button>}
        <button className="btn ghost icon" onClick={() => setDate(addDays(date, -1))} aria-label="전날"><Icon name="left" /></button>
        <h2>{date.getMonth() + 1}월 {date.getDate()}일 <span className="muted">{WEEKDAY_LABELS[weekdayOf(date)]}요일</span></h2>
        <button className="btn ghost icon" onClick={() => setDate(addDays(date, 1))} aria-label="다음 날"><Icon name="right" /></button>
        {!isToday && <button className="btn sm" onClick={() => setDate(new Date())}>오늘</button>}
        <span className="grow" />
        {!demo ? <button className="btn ghost sm" disabled={starting} onClick={beginDemo} title="합성 학급·기록·모의 수업 스크립트로 전체 흐름을 미리 봅니다">{starting ? "불러오는 중…" : "데모"}</button> : <span className="chip check">데모 모드</span>}
      </div>
      <div className="day-page">
        {fields.length === 0 ? (
          <div className="muted" style={{ padding: 24 }}>설정에서 반·명단과 시간표를 등록하세요.</div>
        ) : <>
          {slots.length === 0 && <div className="muted small">시간표에 수업이 없는 날입니다. 모든 반을 표시합니다.</div>}
          {fields.map((f) => <ClassField key={`${f.cls}-${f.slot?.period ?? "x"}`} cls={f.cls} slot={f.slot} day={day} isToday={isToday} sameClassSlots={slots.filter((s) => s.class === f.cls)} />)}
        </>}
      </div>
      {demo && <DemoSimulator onEnd={() => { setDemo(false); toast({ text: "데모를 끝냈습니다. 샘플 기록은 남아 있습니다." }); }} />}
    </div>
  );
}

/** 반 하나의 기록 필드: 머리(교시·시간·단원) · 기록 줄 · 빠른 추가 */
function ClassField({ cls, slot, day, isToday, sameClassSlots }: { cls: string; slot: LessonSlot | null; day: string; isToday: boolean; sameClassSlots: LessonSlot[] }) {
  const doc = useStore((s) => s.doc);
  const areaId = useStore((s) => s.areaId);
  const openInbox = useStore((s) => s.openInbox);
  const curCls = useStore((s) => s.cls);
  const setClass = useStore((s) => s.setClass);
  const index = useTranscripts((s) => s.index);
  const [script, setScript] = useState<string | null>(null);

  // 같은 반이 하루 두 번이면 기록 시각으로 나눈다 (다음 수업 시작 5분 전까지는 앞 수업)
  const mine = (r: NugaRecord) => {
    if (r.class !== cls || dateKey(r.time) !== day) return false;
    if (!slot || sameClassSlots.length < 2) return true;
    const t = new Date(r.time); const m = t.getHours() * 60 + t.getMinutes();
    const i = sameClassSlots.findIndex((s) => s.period === slot.period);
    const next = sameClassSlots[i + 1];
    return (i === 0 || m >= hm(slot.start) - 5) && (!next || m < hm(next.start) - 5);
  };
  const all = doc.records.filter((r) => mine(r) && r.status !== "skipped").sort((a, b) => a.time.localeCompare(b.time));
  // 보완 대기(도착했지만 아직 확인 안 한 수동 기록)는 알림 팝업에서 처리한 뒤에 여기에 들어온다
  const recs = all.filter((r) => r.status !== "pending");
  const metas = index.filter((m) => m.areaId === areaId && m.class === cls && dateKey(m.startedAt) === day && (!slot || !m.period || m.period === slot.period));
  const pending = all.filter((r) => r.status === "pending");
  const sgNew = metas.reduce((a, m) => a + (m.suggestNew ?? 0), 0);
  const lesson = lessonFor(doc.settings.progress, cls, day);
  const nowM = new Date().getHours() * 60 + new Date().getMinutes();
  const state = !slot || !isToday ? null : nowM < hm(slot.start) ? "예정" : nowM <= hm(slot.end) ? "수업 중" : "끝";
  const todo = pending.length + sgNew;

  return (
    <section className={`day-field ${state === "수업 중" ? "now" : ""} ${curCls === cls ? "sel" : ""}`}>
      <header className="df-head" onClick={() => setClass(cls)} title="오른쪽 누가기록을 이 반으로">
        <b className="df-cls">{cls}</b>
        {slot && <span className="df-slot">{slot.period}교시 <span className="muted num">{slot.start}–{slot.end}</span></span>}
        {lesson?.title && <span className="muted ellipsis">{lesson.title}</span>}
        {state && <span className={`chip ${state === "수업 중" ? "pass" : "none"}`}>{state}</span>}
        <span className="grow" />
        <span className="muted small">기록 {recs.length}</span>
        {metas.length > 0 && <button className="btn ghost sm" onClick={() => setScript(metas[0].id)}><Icon name="mic" size={13} />스크립트</button>}
        {todo > 0 && <button className="btn sm primary" onClick={() => openInbox({ records: pending.map((r) => r.id), transcripts: metas.map((m) => m.id), backlog: false })}>미반영 {todo}</button>}
      </header>
      <div className="df-rows">
        {recs.map((r) => <RecordRow key={r.id} rec={r} />)}
        <AddRow cls={cls} slot={slot} day={day} isToday={isToday} />
      </div>
      {script && <TranscriptModal id={script} onClose={() => setScript(null)} recordable />}
    </section>
  );
}

function RecordRow({ rec }: { rec: NugaRecord }) {
  const doc = useStore((s) => s.doc);
  const updateRecord = useStore((s) => s.updateRecord);
  const deleteRecord = useStore((s) => s.deleteRecord);
  const [note, setNote] = useState(rec.note);
  const [del, setDel] = useState(false);
  useEffect(() => { setNote(rec.note); }, [rec.note]);
  const commit = () => {
    const v = note.trim();
    if (v === rec.note && !(rec.status === "pending" && v)) return;
    updateRecord(rec.id, { note: v, ...(rec.status === "pending" && v ? { status: "confirmed" as const } : {}) });
  };
  const cats = doc.settings.categories;
  const nextCat = () => { const i = cats.findIndex((c) => c.key === rec.category); updateRecord(rec.id, { category: cats[(i + 1) % cats.length].key }); };
  const memo = rec.memo || rec.voiceMemo?.transcript || "";
  const stu = doc.students.find((s) => s.class === rec.class && s.no === rec.no);
  return (
    <div className={`df-row ${rec.status === "pending" ? "pending" : ""}`}>
      <AchPress student={stu} className="df-no num">{rec.no}</AchPress>
      <AchPress student={stu} className="df-name ellipsis">{studentName(doc, rec.class, rec.no)}</AchPress>
      <Chip cat={rec.category} label={cats.find((c) => c.key === rec.category)?.label || rec.category} onClick={nextCat} />
      <input className="df-note" value={note} onChange={(e) => setNote(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) (e.target as HTMLInputElement).blur(); }}
        placeholder={memo ? `메모: ${memo}` : rec.status === "pending" ? "보완 대기 · 관찰 내용을 적으세요" : "관찰 내용"} title={memo ? `메모: ${memo}` : undefined} />
      <span className="df-time muted small num">{fmtHM(rec.time)} {SRC_LABEL[rec.source] || ""}</span>
      <button className="x" onClick={() => setDel(true)} aria-label="삭제" title="삭제">×</button>
      {del && <Confirm title="이 기록을 지울까요?" body={`${rec.no}번 ${studentName(doc, rec.class, rec.no)} · ${note || memo || "내용 없음"}`} okLabel="삭제" danger onOk={() => deleteRecord(rec.id)} onClose={() => setDel(false)} />}
    </div>
  );
}

/** 빠른 추가: 번호 → 카테고리 → 내용 → Enter */
function AddRow({ cls, slot, day, isToday }: { cls: string; slot: LessonSlot | null; day: string; isToday: boolean }) {
  const doc = useStore((s) => s.doc);
  const addRecord = useStore((s) => s.addRecord);
  const [no, setNo] = useState("");
  const [cat, setCat] = useState<Category>(doc.settings.categories[0]?.key ?? 1);
  const [note, setNote] = useState("");
  const noRef = useRef<HTMLInputElement>(null);
  const students = studentsOf(doc, cls);
  const st = students.find((s) => s.no === Number(no));
  const add = () => {
    if (!st) { noRef.current?.focus(); return; }
    let t = new Date();
    if (!isToday) { t = new Date(`${day}T${slot?.start || "12:00"}:00`); t.setMinutes(t.getMinutes() + 10); }
    addRecord({ class: cls, no: st.no, category: cat, time: nowIso(t), lesson: lessonFor(doc.settings.progress, cls, day), memo: "", voiceMemo: null, note: note.trim(), status: "confirmed", source: "pc" });
    setNo(""); setNote(""); noRef.current?.focus();
  };
  const onEnter = (e: React.KeyboardEvent) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); add(); } };
  return (
    <div className="df-row add">
      <input ref={noRef} className="df-no-in num" value={no} onChange={(e) => setNo(e.target.value.replace(/\D/g, "").slice(0, 3))} onKeyDown={onEnter} placeholder="번호" inputMode="numeric" list={`roster-${cls}`} />
      <datalist id={`roster-${cls}`}>{students.map((s) => <option key={s.no} value={s.no}>{s.name}</option>)}</datalist>
      <AchPress student={st} className={`df-name ellipsis ${st ? "" : "muted"}`}>{st ? st.name : no ? "없는 번호" : ""}</AchPress>
      <span className="df-cats">{doc.settings.categories.map((c) => <Chip key={c.key} cat={c.key} label={c.label} selected={cat === c.key} onClick={() => setCat(c.key)} />)}</span>
      <input className="df-note" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={onEnter} placeholder="관찰 내용 (Enter 추가)" />
      <button className="btn sm" onClick={add} disabled={!st}><Icon name="plus" size={13} />추가</button>
    </div>
  );
}
