import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  WEEKDAY_LABELS, dateKey, fmtHM, lessonFor, lessonLabel, nowIso, resolveNow, slotsForWeekday, weekdayOf,
  type Category, type LessonSlot, type NugaDoc, type NugaRecord, type RecordSource,
} from "@nuga/core";
import { TopBar } from "../App";
import { classList, studentName, studentsOf, useStore } from "../store";
import { Icon } from "../components/ui";
import { useTranscripts } from "../lib/transcripts";
import { simulateLessonTranscript } from "../lib/demo";

/**
 * 모바일 확인 (테스트용): 안드로이드 폰 앱(android/mobile)의 화면과 동작을 PC에서 그대로 재현한다.
 * 폰에서 저장한 기록은 실제로 이 PC 기록에 들어가고(전송 → 도착), 녹음을 멈추면 합성 수업 스크립트가
 * 도착해 추천 카드가 만들어진다. 화면 구성은 NugaRoot·HomeScreen·NumberSheet·RecordsScreen·RecordingsScreen·SettingsScreen·NugaWidget 과 맞춘다.
 */

type Tab = "home" | "records" | "rec" | "settings";
interface Sheet { cls: string; category: Category; no: number | null; memo: string; source: RecordSource }
interface Ev { at: string; text: string; kind?: "pc" | "phone" }

const PHONE_SOURCES = new Set(["phone", "watch", "widget"]);
const two = (n: number) => String(n).padStart(2, "0");
const hhmm = (d: Date) => `${two(d.getHours())}:${two(d.getMinutes())}`;
const koDate = (d: Date) => `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAY_LABELS[weekdayOf(d)]})`;
const atMin = (day: Date, hm: string, plus = 0) => { const [h, m] = hm.split(":").map(Number); const x = new Date(day); x.setHours(h, m + plus, 0, 0); return x; };
const toLocalInput = (d: Date) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}:${two(d.getMinutes())}`;

/** 다음 수업 (오늘 남은 것 → 이후 7일) */
function nextSlot(doc: NugaDoc, now: Date): { slot: LessonSlot; date: Date } | null {
  const m = now.getHours() * 60 + now.getMinutes();
  for (let i = 0; i < 8; i++) {
    const d = new Date(now); d.setDate(d.getDate() + i);
    const s = slotsForWeekday(doc.settings, weekdayOf(d)).find((x) => i > 0 || atMin(now, x.start).getHours() * 60 + atMin(now, x.start).getMinutes() > m);
    if (s) return { slot: s, date: d };
  }
  return null;
}

export function MobilePage() {
  const doc = useStore((s) => s.doc);
  const addRecord = useStore((s) => s.addRecord);
  const updateRecord = useStore((s) => s.updateRecord);
  const deleteRecord = useStore((s) => s.deleteRecord);
  const openInbox = useStore((s) => s.openInbox);
  const [clock, setClock] = useState(""); // "" = 실제 시각
  const [tick, setTick] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setTick(Date.now()), 15_000); return () => clearInterval(t); }, []);
  const now = useMemo(() => (clock ? new Date(clock) : new Date(tick)), [clock, tick]);
  const [view, setView] = useState<"app" | "widget">("app");
  const [tab, setTab] = useState<Tab>("home");
  const [showNames, setShowNames] = useState(true);
  const [alarm, setAlarm] = useState(true);
  const [popup, setPopup] = useState(true); // 도착하면 PC 알림 모달 띄우기
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [snack, setSnack] = useState<{ text: string; id?: string } | null>(null);
  const [sending, setSending] = useState<Set<string>>(new Set());
  const [events, setEvents] = useState<Ev[]>([]);
  const snackTimer = useRef<number>();

  const log = (text: string, kind?: Ev["kind"]) => setEvents((p) => [{ at: hhmm(new Date()), text, kind }, ...p].slice(0, 40));
  const showSnack = (text: string, id?: string) => {
    setSnack({ text, id });
    window.clearTimeout(snackTimer.current);
    snackTimer.current = window.setTimeout(() => setSnack(null), 5000);
  };

  const info = resolveNow(doc.settings, now);
  const current = info.current;
  const next = current ? null : nextSlot(doc, now);
  const classes = classList(doc);
  const cats = doc.settings.categories.slice(0, 4);

  // 시각 바꾸기: 앞뒤 일주일의 수업 시간
  const presets = useMemo(() => {
    const out: { v: string; label: string }[] = [];
    const base = new Date(); base.setHours(12, 0, 0, 0);
    for (let i = -6; i <= 6; i++) {
      const d = new Date(base); d.setDate(d.getDate() + i);
      for (const s of slotsForWeekday(doc.settings, weekdayOf(d))) out.push({ v: toLocalInput(atMin(d, s.start, 10)), label: `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAY_LABELS[weekdayOf(d)]}) ${s.period}교시 ${s.class} · 수업 중` });
    }
    return out;
  }, [doc.settings.timetable, doc.settings.periods]);

  const openSheet = (p: { category?: Category; cls?: string; source?: RecordSource }) => {
    const cls = p.cls || current?.class || next?.slot.class || classes[0] || "";
    setSheet({ cls, category: p.category ?? cats[0]?.key ?? 1, no: null, memo: "", source: p.source || "phone" });
  };

  /** 폰 저장 → (전송 1.2초) → PC 도착. 보완을 쓰면 보완 대기로 들어가 알림 모달이 뜬다 */
  const saveSheet = () => {
    if (!sheet?.no) return;
    const supp = doc.settings.supplementEnabled;
    const memo = sheet.memo.trim();
    const rec = addRecord({
      class: sheet.cls, no: sheet.no, category: sheet.category, time: nowIso(now), lesson: lessonFor(doc.settings.progress, sheet.cls, nowIso(now)),
      memo, voiceMemo: null, note: supp ? "" : memo, status: supp ? "pending" : "confirmed", source: sheet.source,
    });
    const label = `${sheet.cls} ${sheet.no}번 ${cats.find((c) => c.key === sheet.category)?.label || ""}`;
    setSheet(null);
    showSnack(`저장 · ${label}`, rec.id);
    log(`폰 저장 · ${label}${memo ? ` · “${memo}”` : ""} → 전송 대기`, "phone");
    setSending((p) => new Set(p).add(rec.id));
    window.setTimeout(() => {
      setSending((p) => { const n = new Set(p); n.delete(rec.id); return n; });
      if (!useStore.getState().doc.records.some((r) => r.id === rec.id)) return; // 취소됨
      log(`도착 · ${label}${supp ? " · 보완 대기" : ""}`, "pc");
      if (supp && popup) { openInbox({ records: [rec.id] }); log("알림 모달(쉬는 시간 기록) 열림", "pc"); }
    }, 1200);
  };
  const undo = (id: string) => { deleteRecord(id); setSnack(null); log("저장 취소 · 기록 삭제", "phone"); };

  const phoneRecs = useMemo(() => doc.records.filter((r) => PHONE_SOURCES.has(r.source)).sort((a, b) => b.time.localeCompare(a.time)), [doc.records]);
  const todayRecs = phoneRecs.filter((r) => dateKey(r.time) === dateKey(now));

  return (
    <>
      <TopBar title="모바일 확인" center={<span className="chip outline">테스트용</span>} />
      <div className="content mp-page">
        <div className="mp-tools">
          <label className="mp-tool">
            <span className="muted small">폰 시각</span>
            <select value={clock} onChange={(e) => setClock(e.target.value)}>
              <option value="">실제 시각 ({hhmm(new Date(tick))})</option>
              {presets.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}
            </select>
          </label>
          <div className="mp-seg">
            <button className={view === "app" ? "on" : ""} onClick={() => setView("app")}>폰 앱</button>
            <button className={view === "widget" ? "on" : ""} onClick={() => setView("widget")}>홈 화면 위젯</button>
          </div>
          <label className="flex small"><input type="checkbox" checked={popup} onChange={(e) => setPopup(e.target.checked)} />도착하면 PC 알림 모달 띄우기</label>
        </div>

        <div className="mp-stage">
          <div className="mp-phone">
            <div className="mp-status"><b>{hhmm(now)}</b><span className="grow" /><span>5G</span><span className="mp-batt" /></div>
            {view === "widget" ? (
              <WidgetHome doc={doc} now={now} current={current} todayCount={todayRecs.length} onCategory={(k) => openSheet({ category: k, source: "widget" })} onOpenApp={() => setView("app")} />
            ) : (
              <>
                <div className="mp-screen">
                  {tab === "home" && <HomeTab doc={doc} now={now} current={current} next={next} today={info.today} todayRecs={todayRecs} showNames={showNames} sending={sending} onCategory={(k, cls) => openSheet({ category: k, cls })} onSlot={(cls) => openSheet({ cls })} />}
                  {tab === "records" && <RecordsTab doc={doc} recs={phoneRecs} showNames={showNames} sending={sending} onSave={(id, memo) => { updateRecord(id, { memo }); log("폰에서 메모 수정 → PC 반영", "phone"); }} onDelete={(id) => { deleteRecord(id); log("폰에서 기록 삭제 → PC 반영", "phone"); }} />}
                  {tab === "rec" && <RecordingTab doc={doc} now={now} current={current} log={log} onArrive={(id) => { if (popup) { openInbox({ transcripts: [id] }); log("알림 모달(쉬는 시간 기록) 열림", "pc"); } }} />}
                  {tab === "settings" && <SettingsTab doc={doc} showNames={showNames} setShowNames={setShowNames} alarm={alarm} setAlarm={setAlarm} onSync={() => { showSnack("동기화 완료"); log("지금 동기화 · 보낼 기록 없음", "phone"); }} />}
                </div>
                <nav className="mp-nav">
                  {([["home", "홈", "sun"], ["records", "기록", "list"], ["rec", "녹음", "mic"], ["settings", "설정", "gear"]] as const).map(([k, l, ic]) => (
                    <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}><span className="pill"><Icon name={ic} size={18} /></span>{l}</button>
                  ))}
                </nav>
              </>
            )}
            {snack && (
              <div className="mp-snack"><span className="grow">{snack.text}</span>{snack.id && <button onClick={() => undo(snack.id!)}>취소</button>}</div>
            )}
            {sheet && <NumberSheet doc={doc} sheet={sheet} setSheet={setSheet} showNames={showNames} onSave={saveSheet} />}
          </div>

          <aside className="mp-side">
            <h3>이렇게 확인하세요</h3>
            <ol className="mp-steps">
              <li><b>폰 시각</b>에서 수업 시간을 고르면 홈 화면이 “지금” 수업으로 바뀝니다.</li>
              <li>홈의 카테고리 버튼 → 번호를 누르고 <b>저장</b>. 5초 안에 <b>취소</b>할 수 있습니다.</li>
              <li>1초 뒤 PC에 도착해 <b>쉬는 시간 기록</b> 알림 모달이 뜹니다.</li>
              <li><b>녹음</b> 탭에서 녹음 시작 → 정지하면 합성 수업 스크립트가 도착하고 자동 추천이 만들어집니다.</li>
              <li>기록 탭에서 메모를 고치거나 지우면 PC에도 반영됩니다.</li>
            </ol>
            <h3>동작 기록</h3>
            <div className="mp-log">
              {events.length === 0 ? <div className="muted small">아직 없음</div> : events.map((e, i) => (
                <div key={i} className={`mp-ev ${e.kind || ""}`}><span className="num">{e.at}</span><span className="tag">{e.kind === "pc" ? "PC" : "폰"}</span>{e.text}</div>
              ))}
            </div>
            <div className="muted small" style={{ marginTop: 10 }}>폰 앱과 같은 화면 구성입니다. 실제 폰과 달리 릴레이를 거치지 않고 이 PC 기록에 바로 들어갑니다. 녹음은 실제 음성 대신 합성 수업 스크립트를 씁니다.</div>
          </aside>
        </div>
      </div>
    </>
  );
}

/* ---------------- 홈 (HomeScreen.kt) ---------------- */

function HomeTab({ doc, now, current, next, today, todayRecs, showNames, sending, onCategory, onSlot }: {
  doc: NugaDoc; now: Date; current: LessonSlot | null; next: { slot: LessonSlot; date: Date } | null; today: LessonSlot[]; todayRecs: NugaRecord[];
  showNames: boolean; sending: Set<string>; onCategory: (k: Category, cls: string) => void; onSlot: (cls: string) => void;
}) {
  const slot = current || next?.slot || null;
  const sub = (s: LessonSlot, d: Date) => lessonLabel(lessonFor(doc.settings.progress, s.class, dateKey(d)));
  const cls = slot?.class || classList(doc)[0] || "미지정";
  const nowM = now.getHours() * 60 + now.getMinutes();
  const hm = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
  return (
    <div className="mp-pad">
      <div className="mp-row-b"><span className="mp-h">{koDate(now)}</span><span className="grow" /><span className="mp-t2">오늘 {todayRecs.length}건</span></div>
      <div className="mp-card mp-lesson">
        <div className="mp-row-c">
          <div className="grow">
            <div className={`mp-title ${current ? "accent" : ""}`}>{slot ? `${slot.class} · ${slot.period}교시` : "수업 없음"}</div>
            <div className="mp-t2">
              {!slot ? (doc.settings.timetable.length ? "" : "시간표 없음")
                : current ? (sub(current, now) || `${current.start}–${current.end}`)
                : `${next && dateKey(next.date) !== dateKey(now) ? koDate(next.date) + " " : ""}${next!.slot.start} 시작${sub(next!.slot, next!.date) ? ` · ${sub(next!.slot, next!.date)}` : ""}`}
            </div>
          </div>
          {slot && <span className={`mp-marker ${current ? "now" : ""}`}>{current ? "지금" : "예정"}</span>}
        </div>
        <div className="mp-cats">
          {doc.settings.categories.slice(0, 4).map((c) => <button key={c.key} className={`c${c.key}`} onClick={() => onCategory(c.key, cls)}>{c.label}</button>)}
        </div>
      </div>
      {today.length > 0 && <>
        <div className="mp-sec">오늘 시간표</div>
        <div className="mp-card">
          {today.map((s) => {
            const n = todayRecs.filter((r) => r.class === s.class && fmtHM(r.time) >= s.start && fmtHM(r.time) < s.end).length;
            const marker = nowM >= hm(s.start) && nowM < hm(s.end) ? "지금" : hm(s.start) > nowM ? "예정" : "";
            return (
              <button key={s.period} className="mp-tt" onClick={() => onSlot(s.class)}>
                <span className="mp-pno">{s.period}</span>
                <span className="grow"><b>{s.class}</b><span className="mp-t2 block">{[`${s.start}–${s.end}`, sub(s, now)].filter(Boolean).join(" · ")}</span></span>
                {n > 0 && <span className="mp-count">{n}</span>}
                {marker && <span className={`mp-marker ${marker === "지금" ? "now" : ""}`}>{marker}</span>}
              </button>
            );
          })}
        </div>
      </>}
      <div className="mp-sec">최근 기록</div>
      <div className="mp-card">
        {todayRecs.length === 0 ? <div className="mp-empty">없음</div> : todayRecs.slice(0, 10).map((r) => <RecRow key={r.id} r={r} doc={doc} showNames={showNames} sending={sending.has(r.id)} />)}
      </div>
    </div>
  );
}

function RecRow({ r, doc, showNames, sending, onClick }: { r: NugaRecord; doc: NugaDoc; showNames: boolean; sending: boolean; onClick?: () => void }) {
  const memo = [r.memo, r.voiceMemo?.transcript].filter(Boolean).join(" / ");
  const cat = doc.settings.categories.find((c) => c.key === r.category);
  return (
    <div className={`mp-rec ${onClick ? "click" : ""}`} onClick={onClick}>
      <span className="mp-time">{fmtHM(r.time)}</span>
      <span className="grow">
        <span className="mp-row-c"><b>{r.class} · {r.no}번</b>{showNames && <span className="mp-t2">{studentName(doc, r.class, r.no)}</span>}{r.status === "pending" && <i className="mp-dot warn" title="보완 대기" />}</span>
        {memo && <span className="mp-t2 block ellipsis">{memo}</span>}
      </span>
      <span className={`mp-chip c${r.category}`}>{cat?.label || r.category}</span>
      {sending && <i className="mp-dot" title="전송 대기" />}
    </div>
  );
}

/* ---------------- 번호 입력 시트 (NumberSheet.kt) ---------------- */

type SpeechRec = { lang: string; interimResults: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onerror: (e: { error: string }) => void; onend: () => void; start: () => void; stop: () => void };

function NumberSheet({ doc, sheet, setSheet, showNames, onSave }: { doc: NugaDoc; sheet: Sheet; setSheet: (s: Sheet | null) => void; showNames: boolean; onSave: () => void }) {
  const classes = classList(doc);
  const students = studentsOf(doc, sheet.cls);
  const size = Math.max(students.length, doc.settings.classes.find((c) => c.class === sheet.cls)?.size || 0);
  const [listening, setListening] = useState(false);
  const [err, setErr] = useState("");
  const recRef = useRef<SpeechRec | null>(null);
  const set = (p: Partial<Sheet>) => setSheet({ ...sheet, ...p });
  useEffect(() => () => recRef.current?.stop(), []);
  const mic = () => {
    if (listening) { recRef.current?.stop(); return; }
    const W = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const Ctor = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!Ctor) { setErr("이 브라우저는 음성 입력을 지원하지 않습니다"); return; }
    const r = new Ctor(); r.lang = "ko-KR"; r.interimResults = false;
    r.onresult = (e) => { const t = e.results[0]?.[0]?.transcript || ""; if (t) setSheet({ ...sheet, memo: (sheet.memo ? sheet.memo + " " : "") + t }); };
    r.onerror = (e) => setErr(e.error === "not-allowed" ? "마이크 권한 필요" : `음성 오류: ${e.error}`);
    r.onend = () => setListening(false);
    recRef.current = r; setErr(""); setListening(true); r.start();
  };
  return (
    <div className="mp-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setSheet(null); }}>
      <div className="mp-sheet">
        <div className="mp-row-c">
          {classes.length > 1 ? classes.map((c) => <button key={c} className={`mp-fchip ${c === sheet.cls ? "dark" : ""}`} onClick={() => set({ cls: c, no: null })}>{c}</button>) : <span className="mp-title">{sheet.cls}</span>}
          <span className="grow" /><span className="mp-t2">{size}명</span>
        </div>
        <div className="mp-row-c mp-catchips">
          {doc.settings.categories.slice(0, 4).map((c) => <button key={c.key} className={`mp-fchip cat c${c.key} ${sheet.category === c.key ? "sel" : ""}`} onClick={() => set({ category: c.key })}>{c.label}</button>)}
        </div>
        <div className="mp-grid">
          {Array.from({ length: size }, (_, i) => i + 1).map((n) => {
            const name = showNames ? students.find((s) => s.no === n)?.name : undefined;
            return (
              <button key={n} className={`mp-cell ${sheet.no === n ? `sel c${sheet.category}` : ""}`} onClick={() => set({ no: sheet.no === n ? null : n })}>
                <b>{n}</b>{name && <span>{name}</span>}
              </button>
            );
          })}
        </div>
        <div className="mp-memo">
          <label>{listening ? "듣는 중…" : "메모"}</label>
          <textarea rows={2} value={sheet.memo} onChange={(e) => set({ memo: e.target.value })} />
          <button className={`mp-mic ${listening ? "on" : ""}`} onClick={mic} title="음성"><Icon name="mic" size={18} /></button>
          {err && <div className="mp-err">{err}</div>}
        </div>
        <button className={`mp-save c${sheet.category}`} disabled={!sheet.no} onClick={onSave}>{sheet.no ? `저장 · ${sheet.no}번` : "저장"}</button>
      </div>
    </div>
  );
}

/* ---------------- 기록 (RecordsScreen.kt) ---------------- */

function RecordsTab({ doc, recs, showNames, sending, onSave, onDelete }: { doc: NugaDoc; recs: NugaRecord[]; showNames: boolean; sending: Set<string>; onSave: (id: string, memo: string) => void; onDelete: (id: string) => void }) {
  const [filter, setFilter] = useState<Category | 0>(0);
  const [editing, setEditing] = useState<NugaRecord | null>(null);
  const [memo, setMemo] = useState("");
  const list = (filter ? recs.filter((r) => r.category === filter) : recs).slice(0, 150);
  const days = useMemo(() => { const m = new Map<string, NugaRecord[]>(); for (const r of list) { const k = dateKey(r.time); m.set(k, [...(m.get(k) || []), r]); } return [...m]; }, [list]);
  return (
    <div className="mp-recs">
      <div className="mp-filters">
        <button className={`mp-fchip ${filter === 0 ? "dark" : ""}`} onClick={() => setFilter(0)}>전체</button>
        {doc.settings.categories.slice(0, 4).map((c) => <button key={c.key} className={`mp-fchip cat c${c.key} ${filter === c.key ? "sel" : ""}`} onClick={() => setFilter(filter === c.key ? 0 : c.key)}>{c.label}</button>)}
      </div>
      <div className="mp-pad">
        {days.length === 0 && <div className="mp-t2">없음</div>}
        {days.map(([day, rs]) => (
          <div key={day}>
            <div className="mp-dayh"><span>{koDate(new Date(day + "T12:00:00"))}</span><span className="grow" /><span>{rs.length}건</span></div>
            <div className="mp-card">{rs.map((r) => <RecRow key={r.id} r={r} doc={doc} showNames={showNames} sending={sending.has(r.id)} onClick={() => { setEditing(r); setMemo(r.memo); }} />)}</div>
          </div>
        ))}
      </div>
      {editing && (
        <div className="mp-scrim center" onMouseDown={(e) => { if (e.target === e.currentTarget) setEditing(null); }}>
          <div className="mp-dialog">
            <div className="mp-title">{editing.class} · {editing.no}번 · {doc.settings.categories.find((c) => c.key === editing.category)?.label}</div>
            <div className="mp-t2">{koDate(new Date(editing.time))} {fmtHM(editing.time)}</div>
            {editing.voiceMemo?.transcript && <div className="mp-t2">음성: {editing.voiceMemo.transcript}</div>}
            <div className="mp-memo"><label>메모</label><textarea rows={3} value={memo} onChange={(e) => setMemo(e.target.value)} autoFocus /></div>
            <div className="mp-row-c mp-dlg-acts">
              <button className="warn" onClick={() => { onDelete(editing.id); setEditing(null); }}>삭제</button>
              <span className="grow" />
              <button onClick={() => setEditing(null)}>닫기</button>
              <button className="accent" onClick={() => { onSave(editing.id, memo); setEditing(null); }}>저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- 녹음 (RecordingsScreen.kt) ---------------- */

function RecordingTab({ doc, now, current, log, onArrive }: { doc: NugaDoc; now: Date; current: LessonSlot | null; log: (t: string, k?: Ev["kind"]) => void; onArrive: (id: string) => void }) {
  const areaId = useStore((s) => s.areaId);
  const index = useTranscripts((s) => s.index);
  const loaded = useTranscripts((s) => s.loaded);
  const load = useTranscripts((s) => s.load);
  useEffect(() => { if (!loaded) load(); }, [loaded]);
  const [rec, setRec] = useState<{ cls: string; period: number; start: Date; t0: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [sec, setSec] = useState(0);
  const [preview, setPreview] = useState(false);
  useEffect(() => { if (!rec) return; const t = setInterval(() => setSec(Math.floor((Date.now() - rec.t0) / 1000)), 500); return () => clearInterval(t); }, [rec]);
  const enabled = !!doc.settings.recording?.enabled || preview;
  const cls = current?.class || classList(doc)[0] || "";
  const start = () => { setRec({ cls, period: current?.period || 0, start: now, t0: Date.now() }); setSec(0); log(`녹음 시작 · ${cls}${current ? ` ${current.period}교시` : ""}`, "phone"); };
  const stop = async () => {
    if (!rec) return;
    const r = rec; setRec(null); setBusy(true);
    log("녹음 정지 → 음성 변환 중 (합성 스크립트)", "phone");
    await new Promise((z) => setTimeout(z, 1500));
    const out = await simulateLessonTranscript(r.cls, r.period, r.start);
    setBusy(false);
    log(`도착 · 수업 스크립트 ${r.cls} → 자동 추천 ${out.count}개`, "pc");
    if (out.count > 0) onArrive(out.id);
  };
  const mine = index.filter((m) => m.areaId === areaId).slice(0, 8);
  return (
    <div className="mp-pad">
      <div className="mp-card mp-pad2">
        {!enabled ? <>
          <div className="mp-title">수업 녹음이 꺼져 있습니다</div>
          <div className="mp-t2" style={{ marginTop: 6 }}>PC 설정 → 녹음에서 사용 조건(학교 승인·고지·동의)을 확인한 뒤 켜면 이 폰에 반영됩니다.</div>
          <button className="mp-btn outline" style={{ marginTop: 12 }} onClick={() => setPreview(true)}>미리보기에서만 켜기</button>
        </> : <>
          <div className="mp-row-c">
            <i className={`mp-recdot ${rec ? "on" : ""}`} />
            <span className={`mp-title ${rec ? "red" : ""}`}>{busy ? "변환 중…" : rec ? `녹음 중 · ${rec.cls} ${rec.period ? `${rec.period}교시` : ""}` : "녹음하지 않는 중"}</span>
            <span className="grow" />
            {rec && <span className="mp-t2 num">{two(Math.floor(sec / 60))}:{two(sec % 60)}</span>}
          </div>
          <div className="mp-row-c" style={{ marginTop: 12 }}>
            {rec ? <button className="mp-btn red" onClick={stop}>정지하고 보내기</button>
              : <button className="mp-btn red" disabled={busy || !cls} onClick={start}>지금 녹음 시작 · {cls}</button>}
          </div>
          <div className="mp-t2" style={{ marginTop: 8 }}>미리보기는 실제 마이크 대신 합성 모의 수업 스크립트를 보냅니다.</div>
        </>}
      </div>
      <div className="mp-sec">수업별 녹음</div>
      <div className="mp-card">
        {mine.length === 0 ? <div className="mp-empty">없음</div> : mine.map((m) => { const d = new Date(m.startedAt); return (
          <div key={m.id} className="mp-rec">
            <span className="mp-time">{d.getMonth() + 1}/{d.getDate()}</span>
            <span className="grow"><b>{m.class}{m.period ? ` · ${m.period}교시` : ""}</b><span className="mp-t2 block">{hhmm(d)} · 변환 완료 · {m.segmentCount}발언</span></span>
            {(m.suggestNew ?? 0) > 0 && <span className="mp-chip c1">추천 {m.suggestNew}</span>}
          </div>
        ); })}
      </div>
    </div>
  );
}

/* ---------------- 설정 (SettingsScreen.kt) ---------------- */

function SettingsTab({ doc, showNames, setShowNames, alarm, setAlarm, onSync }: { doc: NugaDoc; showNames: boolean; setShowNames: (v: boolean) => void; alarm: boolean; setAlarm: (v: boolean) => void; onSync: () => void }) {
  const days = [1, 2, 3, 4, 5];
  const periods = doc.settings.periods;
  return (
    <div className="mp-pad">
      <div className="mp-sec">PC 연결</div>
      <div className="mp-card mp-pad2">
        <div className="mp-row-c"><i className="mp-dot ok" /><b>이 PC와 연결됨</b><span className="mp-t2">(미리보기)</span></div>
        <div className="mp-t2" style={{ marginTop: 4 }}>{doc.settings.school.subject || "과목"} · 반 {classList(doc).join(", ") || "없음"}</div>
        <div className="mp-row-c" style={{ marginTop: 10 }}><button className="mp-btn" onClick={onSync}>지금 동기화</button><button className="mp-btn outline" disabled>QR 다시 스캔</button></div>
      </div>
      <div className="mp-sec">표시</div>
      <div className="mp-card">
        <Toggle title="이름 표시" sub="번호 옆에 학생 이름" on={showNames} set={setShowNames} />
        <Toggle title="수업 시작 알림" sub="수업 시작 때 기록 버튼 알림" on={alarm} set={setAlarm} />
      </div>
      <div className="mp-sec">시간표</div>
      <div className="mp-card mp-pad2">
        <div className="mp-ttgrid" style={{ gridTemplateColumns: `28px repeat(${periods.length}, 1fr)` }}>
          <span />{periods.map((p) => <span key={p.no} className="h">{p.no}<small>{p.start}</small></span>)}
          {days.map((d) => <React.Fragment key={d}>
            <span className="h">{WEEKDAY_LABELS[d]}</span>
            {periods.map((p) => { const c = doc.settings.timetable.find((t) => t.weekday === d && t.period === p.no); return <span key={p.no} className={c ? "on" : ""}>{c?.class || ""}</span>; })}
          </React.Fragment>)}
        </div>
      </div>
    </div>
  );
}

function Toggle({ title, sub, on, set }: { title: string; sub: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <button className="mp-toggle" onClick={() => set(!on)}>
      <span className="grow"><b>{title}</b><span className="mp-t2 block">{sub}</span></span>
      <span className={`mp-switch ${on ? "on" : ""}`}><i /></span>
    </button>
  );
}

/* ---------------- 홈 화면 위젯 (NugaWidget.kt) ---------------- */

function WidgetHome({ doc, now, current, todayCount, onCategory, onOpenApp }: { doc: NugaDoc; now: Date; current: LessonSlot | null; todayCount: number; onCategory: (k: Category) => void; onOpenApp: () => void }) {
  return (
    <div className="mp-home">
      <div className="mp-clock">{hhmm(now)}<small>{koDate(now)}</small></div>
      <div className="mp-widget">
        <div className="mp-row-c">
          <div className="grow"><b>{current ? `${current.class} · ${current.period}교시` : "수업 없음"}</b><span className="mp-t2 block">누가</span></div>
          <div className="mp-wcount"><b>{todayCount}</b><small>오늘</small></div>
        </div>
        <div className="mp-wcats">
          {doc.settings.categories.slice(0, 4).map((c) => <button key={c.key} className={`c${c.key}`} onClick={() => onCategory(c.key)}>{c.label}</button>)}
        </div>
      </div>
      <div className="mp-apps">
        <button onClick={onOpenApp}><span className="mp-appicon">누</span>누가</button>
      </div>
    </div>
  );
}
