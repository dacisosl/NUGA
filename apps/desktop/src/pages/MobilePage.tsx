import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  CATEGORY_NONE, WEEKDAY_LABELS, dateKey, fmtHM, lessonFor, lessonLabel, nowIso, resolveNow, slotsForWeekday, weekdayOf,
  type Category, type LessonSlot, type NugaDoc, type NugaRecord, type RecordCategory, type RecordSource,
} from "@nuga/core";
import { Sheet, TopBar } from "../App";
import { arrivalModeOf, classList, studentsOf, useStore } from "../store";
import { useTranscripts } from "../lib/transcripts";
import { simulateLessonTranscript } from "../lib/demo";
import "./mobile.css";

/**
 * 모바일 확인 (테스트용): 안드로이드 폰 앱(android/mobile)의 화면과 동작을 PC에서 그대로 재현한다.
 * 폰에서 저장한 기록은 실제로 이 PC 기록에 들어가고(전송 → 도착), 녹음을 멈추면 합성 수업 스크립트가
 * 도착해 추천 카드가 만들어진다. 화면 구성은 NugaRoot·HomeScreen·NumberSheet·RecordsScreen·RecordingsScreen·SettingsScreen·NugaWidget 과 맞춘다.
 * 기록은 [기록] 버튼 → 번호 릴 → 저장 (카테고리 단계 없음, 0=미정으로 보내고 PC가 정한다).
 * 모양은 ui/theme(Theme.kt · Glass.kt)의 '밤의 틀 · 빛나는 종이'를 mobile.css 가 그대로 옮긴다.
 */

type Tab = "home" | "records" | "rec" | "settings";
/** 기록 시트 상태 (MainViewModel.SheetState): 카테고리는 고르지 않는다 — 늘 0(미정), PC가 보충할 때 정한다 */
interface SheetState { cls: string; category: RecordCategory; no: number | null; memo: string; source: RecordSource }
interface Ev { at: string; text: string; kind?: "pc" | "phone" }
type Next = { slot: LessonSlot; date: Date } | null;

const PHONE_SOURCES = new Set(["phone", "watch", "widget"]);
const two = (n: number) => String(n).padStart(2, "0");
const hhmm = (d: Date) => `${two(d.getHours())}:${two(d.getMinutes())}`;
const koDate = (d: Date) => `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAY_LABELS[weekdayOf(d)]})`;
const atMin = (day: Date, hm: string, plus = 0) => { const [h, m] = hm.split(":").map(Number); const x = new Date(day); x.setHours(h, m + plus, 0, 0); return x; };
const toLocalInput = (d: Date) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}:${two(d.getMinutes())}`;
/** 명렬표 이름 (폰의 cfg.nameOf 처럼 없으면 null) */
const nameOf = (doc: NugaDoc, cls: string, no: number) => doc.students.find((s) => s.class === cls && s.no === no)?.name || null;
/** 반 인원 (Config.classSize): 명렬표 수와 설정의 반 크기 중 큰 쪽 */
const classSize = (doc: NugaDoc, cls: string) => Math.max(studentsOf(doc, cls).length, doc.settings.classes.find((c) => c.class === cls)?.size || 0);
/** 카테고리가 정해졌는지 (MainViewModel.hasCategory): 1..4 만. 0(미정)은 칩을 붙이지 않는다 */
const hasCategory = (c: RecordCategory): c is Category => c >= 1 && c <= 4;

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

/* 폰 앱이 쓰는 머티리얼 아이콘 (Icons.Filled.* · Rounded.Edit · Outlined.EditNote, 24 격자) */
const MI = {
  edit: "M3 17.46v3.04c0 .28.22.5.5.5h3.04c.13 0 .26-.05.35-.15L17.81 9.94l-3.75-3.75L3.15 17.1c-.1.1-.15.22-.15.36zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
  pencil: "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
  editNote: "M3 10h11v2H3v-2zm0-2h11V6H3v2zm0 8h7v-2H3v2zm15.01-3.13.71-.71c.39-.39 1.02-.39 1.41 0l.71.71c.39.39.39 1.02 0 1.41l-.71.71-2.12-2.12zm-.71.71-5.3 5.3V21h2.12l5.3-5.3-2.12-2.12z",
  home: "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z",
  list: "M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z",
  mic: "M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z",
  micOff: "M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z",
  settings: "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z",
  signal: "M2 22h20V2z",
  battery: "M15.67 4H14V2h-4v2H8.33C7.6 4 7 4.6 7 5.33v15.33C7 21.4 7.6 22 8.33 22h7.33c.74 0 1.34-.6 1.34-1.33V5.33C17 4.6 16.4 4 15.67 4z",
} as const;
function MIcon({ name, size = 24 }: { name: keyof typeof MI; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d={MI[name]} /></svg>;
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
  const setSettings = useStore((s) => s.setSettings);
  const mode = arrivalModeOf(doc.settings); // 설정 → 도착한 기록 처리
  const popup = mode === "popup";
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [editing, setEditing] = useState<NugaRecord | null>(null);
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

  /** 릴 시작 번호 (MainViewModel.loadReelStart): PC 설정 '번호 릴 시작'이 last 면 그 반에서 마지막으로 기록한 번호, 아니면 1번 */
  const reelStart = (cls: string) => {
    const size = Math.max(classSize(doc, cls), 1);
    if (doc.settings.options?.reelStart !== "last") return 1;
    const last = doc.records.filter((r) => r.class === cls).sort((a, b) => b.time.localeCompare(a.time))[0]?.no;
    return Math.min(Math.max(last || 1, 1), size);
  };
  /** 기록 시트 열기 (MainViewModel.openSheet): 반은 지금(또는 다음) 수업, 번호는 릴 시작 번호. 카테고리는 늘 0(미정) */
  const openSheet = (p: { cls?: string; source?: RecordSource }) => {
    const cls = p.cls || current?.class || next?.slot.class || classes[0] || "";
    setSheet({ cls, category: CATEGORY_NONE, no: reelStart(cls), memo: "", source: p.source || "phone" });
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
    // 알림 띠 글자는 폰과 같게: '저장 · 2-3 · 14번' (카테고리는 미정이라 붙지 않는다)
    const label = `${sheet.cls} · ${sheet.no}번`;
    setSheet(null);
    showSnack(`저장 · ${label}`, rec.id);
    log(`폰 저장 · ${label}${memo ? ` · “${memo}”` : ""} → 전송 대기`, "phone");
    setSending((p) => new Set(p).add(rec.id));
    window.setTimeout(() => {
      setSending((p) => { const n = new Set(p); n.delete(rec.id); return n; });
      if (!useStore.getState().doc.records.some((r) => r.id === rec.id)) return; // 취소됨
      log(`도착 · ${label}${supp ? " · 미반영(수동 기록)" : " · 바로 확정"}`, "pc");
      if (popup) { openInbox({ records: [rec.id] }); log("알림 팝업(쉬는 시간 기록) 열림 — 처리하면 오늘 기록에 들어감", "pc"); }
      else if (supp) log("팝업 없이 미반영에 쌓임", "pc");
    }, 1200);
  };
  const undo = (id: string) => { deleteRecord(id); setSnack(null); log("저장 취소 · 기록 삭제", "phone"); };

  const phoneRecs = useMemo(() => doc.records.filter((r) => PHONE_SOURCES.has(r.source)).sort((a, b) => b.time.localeCompare(a.time)), [doc.records]);
  const todayRecs = phoneRecs.filter((r) => dateKey(r.time) === dateKey(now));
  const tabs = [["home", "홈", "home"], ["records", "기록", "list"], ["rec", "녹음", "mic"], ["settings", "설정", "settings"]] as const;

  return (
    <>
      <TopBar title="모바일 확인" center={<span className="chip outline">테스트용</span>} />
      <Sheet>
        <div className="content mp-page">
          <div className="mp-tools">
            <label className="mp-tool">
              <span className="muted small">폰 시각</span>
              <select className="select" value={clock} onChange={(e) => setClock(e.target.value)}>
                <option value="">실제 시각 ({hhmm(new Date(tick))})</option>
                {presets.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}
              </select>
            </label>
            <div className="mp-seg" role="tablist" aria-label="미리보기 화면">
              <button role="tab" aria-selected={view === "app"} className={view === "app" ? "on" : ""} onClick={() => setView("app")}>폰 앱</button>
              <button role="tab" aria-selected={view === "widget"} className={view === "widget" ? "on" : ""} onClick={() => setView("widget")}>홈 화면 위젯</button>
            </div>
            <label className="mp-tool">
              <span className="muted small">도착한 기록</span>
              <select className="select" value={mode} onChange={(e) => { const k = e.target.value as typeof mode; setSettings({ arrivalMode: k, supplementEnabled: k !== "direct" }); }} title="설정 → 동기화 → 도착한 기록 처리와 같은 값">
                <option value="popup">알림 팝업으로 먼저 확인</option>
                <option value="queue">팝업 없이 미반영에 쌓기</option>
                <option value="direct">바로 기록에 넣기</option>
              </select>
            </label>
          </div>

          <div className="mp-stage">
            <div className={`mp-phone ${view === "widget" ? "wall" : ""}`}>
              <div className="mp-status"><b>{hhmm(now)}</b><span className="grow" /><MIcon name="signal" size={15} /><MIcon name="battery" size={16} /></div>
              {view === "widget" ? (
                <WidgetHome doc={doc} now={now} current={current} next={next} todayCount={todayRecs.length}
                  onCapture={() => openSheet({ source: "widget" })} onOpenApp={() => setView("app")} onRecord={() => { setView("app"); setTab("rec"); }} />
              ) : (
                <>
                  <div className={`mp-screen ${tab}`}>
                    {tab === "home" && <HomeTab doc={doc} now={now} current={current} next={next} today={info.today} todayRecs={todayRecs} showNames={showNames} sending={sending} onRecord={(cls) => openSheet({ cls })} onSlot={(cls) => openSheet({ cls })} />}
                    {tab === "records" && <RecordsTab doc={doc} recs={phoneRecs} showNames={showNames} sending={sending} onEdit={setEditing} />}
                    {tab === "rec" && <RecordingTab doc={doc} now={now} current={current} log={log} onArrive={(id) => { if (popup) { openInbox({ transcripts: [id] }); log("알림 모달(쉬는 시간 기록) 열림", "pc"); } }} />}
                    {tab === "settings" && <SettingsTab doc={doc} showNames={showNames} setShowNames={setShowNames} alarm={alarm} setAlarm={setAlarm} onSync={() => { showSnack("동기화 완료"); log("지금 동기화 · 보낼 기록 없음", "phone"); }} />}
                  </div>
                  <nav className="mp-nav">
                    {tabs.map(([k, l, ic]) => (
                      <button key={k} className={tab === k ? "on" : ""} aria-current={tab === k ? "page" : undefined} onClick={() => setTab(k)}>
                        <span className="pill"><MIcon name={ic} size={22} /></span><span className="lbl">{l}</span>
                      </button>
                    ))}
                  </nav>
                </>
              )}
              {snack && (
                <div className="mp-snack" role="status"><span className="grow">{snack.text}</span>{snack.id && <button onClick={() => undo(snack.id!)}>취소</button>}</div>
              )}
              {sheet && <NumberSheet doc={doc} sheet={sheet} setSheet={setSheet} showNames={showNames} reelStart={reelStart} onSave={saveSheet} />}
              {editing && (
                <EditDialog doc={doc} rec={editing} onClose={() => setEditing(null)}
                  onSave={(memo) => { updateRecord(editing.id, { memo }); setEditing(null); log("폰에서 메모 수정 → PC 반영", "phone"); }}
                  onDelete={() => { deleteRecord(editing.id); setEditing(null); log("폰에서 기록 삭제 → PC 반영", "phone"); }} />
              )}
            </div>

            <aside className="mp-side">
              <h3>이렇게 확인하세요</h3>
              <ol className="mp-steps">
                <li><b>폰 시각</b>에서 수업 시간을 고르면 홈 화면이 “지금” 수업으로 바뀝니다.</li>
                <li>홈의 <b>기록</b> 버튼 → 번호 릴을 굴려(휠·끌기·누르기) 고르고 <b>저장</b>. 5초 안에 <b>취소</b>할 수 있습니다. 카테고리는 고르지 않습니다(미정 → PC에서 정함).</li>
                <li>1초 뒤 PC에 도착해 <b>쉬는 시간 기록</b> 알림 팝업이 뜹니다. 팝업에서 저장해야 오늘 기록에 들어갑니다.</li>
                <li><b>녹음</b> 탭에서 녹음 시작 → 정지하면 합성 수업 스크립트가 도착하고 자동 추천이 만들어집니다.</li>
                <li>기록 탭에서 메모를 고치거나 지우면 PC에도 반영됩니다.</li>
              </ol>
              <h3>동작 기록</h3>
              <div className="mp-log">
                {events.length === 0 ? <div className="muted small">아직 없음</div> : events.map((e, i) => (
                  <div key={i} className={`mp-ev ${e.kind || ""}`}><span className="num">{e.at}</span><span className="tag">{e.kind === "pc" ? "PC" : "폰"}</span>{e.text}</div>
                ))}
              </div>
              <div className="mp-note muted small">폰 앱과 같은 화면 구성입니다. 실제 폰과 달리 릴레이를 거치지 않고 이 PC 기록에 바로 들어갑니다. 녹음은 실제 음성 대신 합성 수업 스크립트를 씁니다.</div>
            </aside>
          </div>
        </div>
      </Sheet>
    </>
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

/** '지금'은 파랑 바탕 + 점 하나, '예정'은 조용한 회색 (HomeScreen.kt Marker) */
function Marker({ now }: { now: boolean }) {
  return <span className={`mp-marker ${now ? "now" : ""}`}>{now ? "지금" : "예정"}</span>;
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

/* ---------------- 홈 (HomeScreen.kt) ---------------- */

function HomeTab({ doc, now, current, next, today, todayRecs, showNames, sending, onRecord, onSlot }: {
  doc: NugaDoc; now: Date; current: LessonSlot | null; next: Next; today: LessonSlot[]; todayRecs: NugaRecord[];
  showNames: boolean; sending: Set<string>; onRecord: (cls: string) => void; onSlot: (cls: string) => void;
}) {
  const slot = current || next?.slot || null;
  const sub = (s: LessonSlot, d: Date) => lessonLabel(lessonFor(doc.settings.progress, s.class, dateKey(d)));
  const cls = slot?.class || classList(doc)[0] || "미지정";
  const nowM = now.getHours() * 60 + now.getMinutes();
  const hm = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
  const subline = slot ? sublineOf(doc, now, current, next) : (doc.settings.timetable.length ? "" : "시간표 없음");
  return (
    <div className="mp-pad">
      <Header index="01" title={koDate(now)}><span className="mp-today">오늘 <b>{todayRecs.length}</b>건</span></Header>
      {/* 화면의 초점 하나: 지금 수업이면 하늘빛 테두리로 켜진 카드. 아래에 큰 [기록] 버튼 하나 → 번호 릴 */}
      <div className={`mp-card mp-lesson ${current ? "lit" : ""}`}>
        <div className="mp-lhead">
          <div className="grow">
            <div className={`mp-ltitle ${current ? "is-now" : ""}`}>{slot ? `${slot.class} · ${slot.period}교시` : "수업 없음"}</div>
            {subline && <div className="mp-lsub">{subline}</div>}
          </div>
          {slot && <Marker now={!!current} />}
        </div>
        {/* 수업 중 한 번에 누르는 [기록] (CaptureButton): 화면에서 가장 밝은 것 하나. 카테고리 없이 번호 릴로 바로 간다 */}
        <div className="mp-cap">
          <button className="mp-capture" onClick={() => onRecord(cls)} title="번호 고르기"><MIcon name="edit" size={22} />기록</button>
        </div>
      </div>
      {today.length > 0 && <>
        <div className="mp-sec">오늘 시간표</div>
        <div className="mp-card">
          {today.map((s) => {
            const n = todayRecs.filter((r) => r.class === s.class && fmtHM(r.time) >= s.start && fmtHM(r.time) < s.end).length;
            const marker = nowM >= hm(s.start) && nowM < hm(s.end) ? "지금" : hm(s.start) > nowM ? "예정" : "";
            return (
              <button key={s.period} className={`mp-tt ${marker === "지금" ? "now" : ""}`} onClick={() => onSlot(s.class)}>
                <span className="mp-pno">{s.period}</span>
                <span className="grow"><b className="mp-cls">{s.class}</b><span className="mp-meta block">{[`${s.start}–${s.end}`, sub(s, now)].filter(Boolean).join(" · ")}</span></span>
                {n > 0 && <span className="mp-count">{n}</span>}
                {marker && <Marker now={marker === "지금"} />}
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
  const name = showNames ? nameOf(doc, r.class, r.no) : null;
  return (
    <div className={`mp-rec ${onClick ? "click" : ""}`} onClick={onClick}>
      <span className="mp-time">{fmtHM(r.time)}</span>
      <span className="grow">
        <span className="mp-rec-h"><b>{r.class} · {r.no}번</b>{name && <span className="mp-name">{name}</span>}{r.status === "pending" && <i className="mp-dot warn" title="보완 대기" />}</span>
        {memo && <span className="mp-meta block ellipsis">{memo}</span>}
      </span>
      {/* 카테고리는 PC가 정했을 때(1..4)만. 0(미정)은 칩 없이 */}
      {hasCategory(r.category) && <span className={`mp-chip c${r.category}`}>{cat?.label || r.category}</span>}
      {sending && <i className="mp-dot sync" title="전송 대기" />}
    </div>
  );
}

/* ---------------- 기록 시트 (NumberSheet.kt): 반 · 번호 릴 · [메모] [저장] ---------------- */

type SpeechRec = { lang: string; interimResults: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onerror: (e: { error: string }) => void; onend: () => void; start: () => void; stop: () => void };

/** 릴 한 칸 높이와 한 번에 보이는 칸 수 (가운데 하나 + 위아래 둘씩) — NumberSheet.kt ReelRow · ReelRows */
const REEL_ROW = 56;
const REEL_ROWS = 5;
const clampRow = (i: number, count: number) => Math.min(Math.max(i, 0), count - 1);

/**
 * 기록 시트: 카테고리는 고르지 않는다 (0 = 미정, PC가 보충할 때 정한다).
 * 밤의 시트: 위 테두리에 빛줄기, 오른쪽 위 번짐. 번호는 세로 릴 — 굴리면 한 칸씩 딸깍 멈추고, 가운데 유리 판 위의 숫자가 고른 번호다.
 * 메모·음성 메모는 저장 옆 작은 [메모] 버튼을 눌렀을 때만 펼친다.
 */
function NumberSheet({ doc, sheet, setSheet, showNames, reelStart, onSave }: {
  doc: NugaDoc; sheet: SheetState; setSheet: React.Dispatch<React.SetStateAction<SheetState | null>>; showNames: boolean; reelStart: (cls: string) => number; onSave: () => void;
}) {
  const classes = classList(doc);
  const size = Math.max(classSize(doc, sheet.cls), 1);
  const withNames = showNames && doc.students.some((s) => s.class === sheet.cls);
  const [memoOpen, setMemoOpen] = useState(sheet.memo !== "");
  const [focusMemo, setFocusMemo] = useState(false);
  const [listening, setListening] = useState(false);
  const [err, setErr] = useState("");
  const recRef = useRef<SpeechRec | null>(null);
  const set = (p: Partial<SheetState>) => setSheet((s) => (s ? { ...s, ...p } : s));
  useEffect(() => () => recRef.current?.stop(), []);
  const mic = () => {
    if (listening) { recRef.current?.stop(); return; }
    const W = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const Ctor = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!Ctor) { setErr("이 브라우저는 음성 입력을 지원하지 않습니다"); return; }
    const r = new Ctor(); r.lang = "ko-KR"; r.interimResults = false;
    // 폰의 appendSheetMemo 처럼 뒤에 이어 붙인다
    r.onresult = (e) => { const t = e.results[0]?.[0]?.transcript || ""; if (t) setSheet((s) => (s ? { ...s, memo: s.memo.trim() ? `${s.memo.trimEnd()} ${t}` : t } : s)); };
    r.onerror = (e) => setErr(e.error === "not-allowed" ? "마이크 권한 필요" : `음성 오류: ${e.error}`);
    r.onend = () => setListening(false);
    recRef.current = r; setErr(""); setListening(true); r.start();
  };
  const toggleMemo = () => {
    const open = !memoOpen;
    setMemoOpen(open);
    if (open) setFocusMemo(true); else recRef.current?.stop();
  };
  return (
    <div className="mp-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setSheet(null); }}>
      <div className="mp-sheet" role="dialog" aria-modal="true" aria-label="기록">
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
          <button className="mp-btn night lit save" disabled={!sheet.no} onClick={onSave}>{sheet.no ? `저장 · ${sheet.no}번` : "저장"}</button>
        </div>
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

/* ---------------- 기록 (RecordsScreen.kt) ---------------- */

function RecordsTab({ doc, recs, showNames, sending, onEdit }: { doc: NugaDoc; recs: NugaRecord[]; showNames: boolean; sending: Set<string>; onEdit: (r: NugaRecord) => void }) {
  // 0 = 전체, -1 = 미정(분류 없이 온 기록), 1..4 = 카테고리 (RecordsScreen.kt 와 같음)
  const [filter, setFilter] = useState<Category | 0 | -1>(0);
  const hasNone = recs.some((r) => !hasCategory(r.category));
  const list = (filter === -1 ? recs.filter((r) => !hasCategory(r.category)) : filter ? recs.filter((r) => r.category === filter) : recs).slice(0, 150);
  const days = useMemo(() => { const m = new Map<string, NugaRecord[]>(); for (const r of list) { const k = dateKey(r.time); m.set(k, [...(m.get(k) || []), r]); } return [...m]; }, [list]);
  return (
    <div className="mp-recs">
      <Header index="02" title="기록" />
      {/* 필터: 밤 위 칩. '전체'는 밝은 판, 카테고리는 그 색으로 켜진다 */}
      <div className="mp-filters">
        <button className={`mp-nchip ${filter === 0 ? "on" : ""}`} aria-pressed={filter === 0} onClick={() => setFilter(0)}>전체</button>
        {hasNone && <button className={`mp-nchip ${filter === -1 ? "on" : ""}`} aria-pressed={filter === -1} onClick={() => setFilter(filter === -1 ? 0 : -1)}>미정</button>}
        {doc.settings.categories.slice(0, 4).map((c) => (
          <button key={c.key} className={`mp-nchip cat c${c.key} ${filter === c.key ? "on" : ""}`} aria-pressed={filter === c.key} onClick={() => setFilter(filter === c.key ? 0 : c.key)}><i className="sw" />{c.label}</button>
        ))}
      </div>
      {days.length === 0 && <div className="mp-none">없음</div>}
      <div className="mp-reclist">
        {days.map(([day, rs]) => (
          <div key={day} className="mp-day">
            {/* 날짜 꼬리표: 불투명한 밤 유리라 아래로 지나가는 카드를 가린다 */}
            <div className="mp-dayh"><span className="mp-daytag"><b>{koDate(new Date(day + "T12:00:00"))}</b><span>{rs.length}건</span></span></div>
            <div className="mp-card">{rs.map((r) => <RecRow key={r.id} r={r} doc={doc} showNames={showNames} sending={sending.has(r.id)} onClick={() => onEdit(r)} />)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 기록 고치기 (RecordsScreen.kt EditDialog): 흰 대화상자, 버튼은 오른쪽에 [삭제][닫기] [저장] */
function EditDialog({ doc, rec, onClose, onSave, onDelete }: { doc: NugaDoc; rec: NugaRecord; onClose: () => void; onSave: (memo: string) => void; onDelete: () => void }) {
  const [memo, setMemo] = useState(rec.memo);
  return (
    <div className="mp-scrim center" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mp-dialog" role="dialog" aria-modal="true">
        {/* 카테고리는 PC가 정했을 때(1..4)만 붙인다. 0(미정)은 반·번호만 */}
        <div className="mp-dtitle">{[rec.class, `${rec.no}번`, hasCategory(rec.category) ? doc.settings.categories.find((c) => c.key === rec.category)?.label : null].filter(Boolean).join(" · ")}</div>
        <div className="mp-dbody">
          <div className="mp-meta">{koDate(new Date(rec.time))} {fmtHM(rec.time)}</div>
          {rec.voiceMemo?.transcript && <div className="mp-meta">음성: {rec.voiceMemo.transcript}</div>}
          <Field label="메모" rows={2} value={memo} onChange={setMemo} autoFocus />
        </div>
        <div className="mp-dacts">
          <span className="grp">
            <button className="mp-tbtn del" onClick={onDelete}>삭제</button>
            <button className="mp-tbtn mute" onClick={onClose}>닫기</button>
          </span>
          <button className="mp-tbtn strong" onClick={() => onSave(memo)}>저장</button>
        </div>
      </div>
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
      <Header index="03" title="녹음" />
      <div className="mp-card mp-rcard">
        {!enabled ? <>
          <div className="mp-t17">수업 녹음이 꺼져 있습니다</div>
          <div className="mp-body">PC 설정 → 녹음에서 사용 조건(학교 승인·고지·동의)을 확인한 뒤 켜면 이 폰에 반영됩니다.</div>
          <div className="mp-btns"><button className="mp-btn secondary" onClick={() => setPreview(true)}>미리보기에서만 켜기</button></div>
        </> : <>
          <div className="mp-rstate">
            {/* 녹음 중: 빨간 점 + 옅은 고리 (깜박이지 않는다) */}
            <i className={`mp-recdot ${rec ? "on" : ""}`} />
            <span className={`mp-t17 ${rec ? "rec" : ""}`}>{busy ? "변환 중…" : rec ? `녹음 중 · ${rec.cls} ${rec.period ? `${rec.period}교시` : ""}` : "녹음하지 않는 중"}</span>
            {rec && <span className="mp-timer">{two(Math.floor(sec / 60))}:{two(sec % 60)}</span>}
          </div>
          <div className="mp-btns">
            {rec ? <button className="mp-btn record" onClick={stop}>정지하고 보내기</button>
              : <button className="mp-btn record" disabled={busy || !cls} onClick={start}>지금 녹음 시작 · {cls}</button>}
          </div>
          <div className="mp-help">미리보기는 실제 마이크 대신 합성 모의 수업 스크립트를 보냅니다.</div>
        </>}
      </div>
      {mine.length === 0 ? <div className="mp-none sm">녹음한 수업이 없습니다.</div> : <>
        <div className="mp-sec">수업별 녹음</div>
        <div className="mp-card">
          {mine.map((m) => { const d = new Date(m.startedAt); return (
            <div key={m.id} className="mp-rrow">
              <div className="mp-rrow-h">
                <b>{m.class}{m.period ? ` · ${m.period}교시` : ""}</b>
                <span className="mp-m13">{d.getMonth() + 1}/{d.getDate()} {hhmm(d)}</span>
                <span className="mp-schip">PC 받음</span>
              </div>
              <div className="mp-m13">변환 완료 · 발언 {m.segmentCount}개{(m.suggestNew ?? 0) > 0 ? ` · 추천 ${m.suggestNew}개` : ""}</div>
            </div>
          ); })}
        </div>
      </>}
    </div>
  );
}

/* ---------------- 설정 (SettingsScreen.kt) ---------------- */

function SettingsTab({ doc, showNames, setShowNames, alarm, setAlarm, onSync }: { doc: NugaDoc; showNames: boolean; setShowNames: (v: boolean) => void; alarm: boolean; setAlarm: (v: boolean) => void; onSync: () => void }) {
  const [hint, setHint] = useState(true);
  const days = [1, 2, 3, 4, 5];
  const periods = [...doc.settings.periods].sort((a, b) => a.no - b.no);
  const classes = classList(doc);
  const roster = doc.students.filter((s) => classes.includes(s.class)).length;
  const sc = doc.settings.school;
  return (
    <div className="mp-pad">
      <Header index="04" title="설정" />
      <div className="mp-sec">동기화</div>
      <div className="mp-card mp-sync">
        <div className="mp-kv"><span>상태</span><b>이 PC와 연결됨 (미리보기)</b></div>
        <div className="mp-kv"><span>반</span><b>{classes.join(", ") || "없음"}</b></div>
        <div className="mp-btns"><button className="mp-btn primary" onClick={onSync}>지금 동기화</button><button className="mp-btn secondary" disabled>QR 다시 스캔</button></div>
      </div>
      <div className="mp-sec">시간표</div>
      <div className="mp-card">
        {doc.settings.timetable.length === 0 ? <div className="mp-empty">없음</div> : (
          <div className="mp-ttwrap">
            <div className="mp-ttable" style={{ gridTemplateColumns: `28px repeat(${periods.length}, 44px)` }}>
              <span />{periods.map((p) => <span key={p.no} className="h"><b>{p.no}</b><small>{p.start}</small></span>)}
              {days.map((d) => <React.Fragment key={d}>
                <span className="d">{WEEKDAY_LABELS[d]}</span>
                {periods.map((p) => { const c = doc.settings.timetable.find((t) => t.weekday === d && t.period === p.no); return <span key={p.no} className={c ? "on" : "off"}>{c?.class || "·"}</span>; })}
              </React.Fragment>)}
            </div>
          </div>
        )}
      </div>
      <div className="mp-sec">옵션</div>
      <div className="mp-card">
        <Toggle title="이름 표시" sub={roster ? `명렬표 ${roster}명` : "명렬표 없음"} on={showNames && roster > 0} disabled={!roster} set={setShowNames} />
        <Toggle title="수업 시작 알림" sub="[기록] 버튼 → 번호" on={alarm} set={setAlarm} />
        <Toggle title="위젯 안내" sub={hint ? "홈 화면 길게 누르기 → 위젯 → 누가 4×2" : ""} on={hint} set={setHint} />
      </div>
      <div className="mp-foot">{sc.year}학년도 {sc.semester}학기 · {sc.grade}학년 {sc.subject}</div>
    </div>
  );
}

function Toggle({ title, sub, on, set, disabled }: { title: string; sub: string; on: boolean; set: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button className="mp-toggle" role="switch" aria-checked={on} disabled={disabled} onClick={() => set(!on)}>
      <span className="grow"><b>{title}</b>{sub && <span className="mp-meta block">{sub}</span>}</span>
      <span className={`mp-switch ${on ? "on" : ""}`}><i /></span>
    </button>
  );
}

/* ---------------- 홈 화면 위젯 (NugaWidget.kt) ---------------- */

function WidgetHome({ doc, now, current, next, todayCount, onCapture, onOpenApp, onRecord }: {
  doc: NugaDoc; now: Date; current: LessonSlot | null; next: Next; todayCount: number; onCapture: () => void; onOpenApp: () => void; onRecord: () => void;
}) {
  const head = current ? `${current.class} · ${current.period}교시` : next ? `예정 · ${next.slot.class} · ${next.slot.period}교시` : "수업 없음";
  const line = sublineOf(doc, now, current, next) ?? "시간표 없음";
  return (
    <div className="mp-home">
      <div className="mp-clock">{hhmm(now)}<small>{koDate(now)}</small></div>
      {/* 위젯은 늘 밤 유리: 어떤 배경화면 위에서도 같은 대비 */}
      <div className="mp-widget">
        <div className="mp-whead">
          <div className="grow"><b className={current ? "now" : ""}>{head}</b><span>{line}</span></div>
          {doc.settings.recording?.enabled && <button className="mp-wrec" onClick={onRecord}>● 녹음</button>}
          <div className="mp-wcount"><b>{todayCount}</b><small>오늘</small></div>
        </div>
        {/* 큰 [기록] 버튼 하나: 밤 위에 켜진 밝은 유리(#DEEBFF)에 남색 글자. 누르면 번호 릴이 열린다 */}
        <button className="mp-wcapture" onClick={onCapture}><MIcon name="pencil" size={20} />기록</button>
      </div>
      <div className="mp-apps">
        <button onClick={onOpenApp}><span className="mp-appicon"><AppIcon /></span>누가</button>
      </div>
    </div>
  );
}

/** 앱 아이콘 (ic_nuga_bg + ic_nuga_fg): 밤 장면 바탕 + 하늘빛 계단 선과 빛나는 끝점. 적응형 아이콘의 가운데 72dp */
function AppIcon() {
  return (
    <svg viewBox="18 18 72 72" aria-hidden>
      <defs>
        <radialGradient id="mp-ic-pool" cx="76" cy="84" r="70" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#142C49" /><stop offset="1" stopColor="#142C49" stopOpacity="0" /></radialGradient>
        <radialGradient id="mp-ic-bloom" cx="88" cy="12" r="64" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#5495FD" stopOpacity=".4" /><stop offset=".5" stopColor="#5495FD" stopOpacity=".1" /><stop offset="1" stopColor="#5495FD" stopOpacity="0" /></radialGradient>
        <radialGradient id="mp-ic-dot" cx="76.9" cy="39.9" r="9" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#7DA6DF" stopOpacity=".7" /><stop offset="1" stopColor="#7DA6DF" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="108" height="108" fill="#081422" />
      <rect width="108" height="108" fill="url(#mp-ic-pool)" />
      <rect width="108" height="108" fill="url(#mp-ic-bloom)" />
      <path d="M31.1 68.1H47V54H61V39.9H76.9" fill="none" stroke="#ACCDFF" strokeWidth="4.4" strokeLinecap="square" />
      <circle cx="76.9" cy="39.9" r="9" fill="url(#mp-ic-dot)" />
      <circle cx="76.9" cy="39.9" r="3.4" fill="#DCEBFF" />
    </svg>
  );
}
