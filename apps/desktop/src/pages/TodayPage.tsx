import React, { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_RECORDING, WEEKDAY_LABELS, dateKey, lessonFor, nowIso, resolveNow, segmentDate, suggestionContext,
  type Category, type NugaDoc, type Suggestion, type Transcript, type TranscriptSegment,
} from "@nuga/core";
import { TopBar } from "../App";
import { catLabel, classList, studentsOf, useStore } from "../store";
import { Chip, Empty, Icon, Modal, StudentTag } from "../components/ui";
import { SegmentLine, TranscriptModal, speakerColor } from "../components/TranscriptView";
import { useTranscripts, type TranscriptMeta } from "../lib/transcripts";
import { AssignModal } from "../components/AssignModal";
import { runSuggestions } from "../lib/suggestFlow";
import { demoInfo, startDemo } from "../lib/demo";
import { DemoSimulator } from "../components/DemoSimulator";

const hm = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
const minsOf = (d: Date) => d.getHours() * 60 + d.getMinutes();
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** 이번 주(월요일부터) 시작 */
function weekStart(d = new Date()): Date { const x = new Date(d); const w = (x.getDay() + 6) % 7; x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - w); return x; }

/** 0p 오늘 (v3 14.3): 오늘 수업 카드 · 추천함 · 스크립트 보기 · 이번 주 기록 형평성 */
export function TodayPage() {
  const doc = useStore((s) => s.doc);
  const areaId = useStore((s) => s.areaId);
  const setPage = useStore((s) => s.setPage);
  const setClass = useStore((s) => s.setClass);
  const setRecordsFilter = useStore((s) => s.setRecordsFilter);
  const openSupplement = useStore((s) => s.openSupplement);
  const index = useTranscripts((s) => s.index);
  const loaded = useTranscripts((s) => s.loaded);
  const load = useTranscripts((s) => s.load);
  useEffect(() => { if (!loaded) load(); }, [loaded]);
  const toast = useStore((s) => s.toast);
  const [demo, setDemo] = useState(() => !!demoInfo());
  const [starting, setStarting] = useState(false);
  const beginDemo = async () => { setStarting(true); try { await startDemo(); setDemo(true); toast({ text: "데모 모드: 합성 학급·기록·모의 수업 스크립트를 불러왔습니다" }); } finally { setStarting(false); } };
  const [focus, setFocus] = useState<string | null>(null); // 추천함을 이 스크립트로 좁히기
  const [view, setView] = useState<{ id: string; seg?: string } | null>(null);

  const now = new Date();
  const today = resolveNow(doc.settings, now).today;
  const myIndex = useMemo(() => index.filter((m) => m.areaId === areaId), [index, areaId]);
  const recOn = !!doc.settings.recording?.enabled || myIndex.length > 0;
  const todayKey = dateKey(nowIso());
  const metaFor = (cls: string, start: string, end: string) => myIndex.find((m) => {
    const d = new Date(m.startedAt);
    return m.class === cls && sameDay(d, now) && minsOf(d) >= hm(start) - 15 && minsOf(d) <= hm(end);
  });

  const lessons = today.map((s) => {
    const recs = doc.records.filter((r) => r.class === s.class && dateKey(r.time) === todayKey && minsOf(new Date(r.time)) >= hm(s.start) - 5 && minsOf(new Date(r.time)) <= hm(s.end) + 15);
    const meta = metaFor(s.class, s.start, s.end);
    const lesson = lessonFor(doc.settings.progress, s.class, todayKey);
    const nowM = minsOf(now);
    const state = nowM < hm(s.start) ? "예정" : nowM <= hm(s.end) ? "지금" : "끝";
    return { s, recs, pending: recs.filter((r) => r.status === "pending"), meta, lesson, state };
  });

  // 이번 주 기록 0건 학생 (반별)
  const ws = weekStart(now).getTime();
  const fairness = classList(doc).map((c) => {
    const st = studentsOf(doc, c);
    const has = new Set(doc.records.filter((r) => r.class === c && r.status !== "skipped" && new Date(r.time).getTime() >= ws).map((r) => r.no));
    return { c, total: st.length, zero: st.filter((s) => !has.has(s.no)).length };
  }).filter((x) => x.total > 0);

  const inbox = useMemo(() => (focus ? myIndex.filter((m) => m.id === focus) : myIndex.filter((m) => (m.suggestNew ?? 0) > 0)).slice(0, 12), [myIndex, focus]);
  const otherAreas = index.filter((m) => m.areaId !== areaId && (m.suggestNew ?? 0) > 0).length;

  return (
    <>
      <TopBar title="오늘" center={<span className="muted">{now.getMonth() + 1}월 {now.getDate()}일 ({WEEKDAY_LABELS[((now.getDay() + 6) % 7) + 1]})</span>}
        right={!demo ? <button className="btn" disabled={starting} onClick={beginDemo} title="합성 학급·기록·모의 수업 스크립트로 전체 흐름을 미리 봅니다">{starting ? "불러오는 중…" : "데모 모드"}</button> : <span className="chip check">데모 모드</span>} />
      <div className="content today">
        <section>
          <h3 className="sec-h">오늘 수업</h3>
          {lessons.length === 0 ? <div className="muted small">오늘 시간표에 수업이 없습니다.</div> : (
            <div className="lesson-cards">
              {lessons.map(({ s, recs, pending, meta, lesson, state }) => (
                <div key={`${s.class}-${s.period}`} className={`lesson-card ${state === "지금" ? "now" : ""} ${focus && meta?.id === focus ? "sel" : ""}`} onClick={() => meta && setFocus(focus === meta.id ? null : meta.id)}>
                  <div className="flex between"><b>{s.class} · {s.period}교시</b><span className={`chip ${state === "지금" ? "pass" : "none"}`}>{state}</span></div>
                  <div className="muted small">{s.start}–{s.end}{lesson?.title ? ` · ${lesson.title}` : ""}</div>
                  <div className="lc-stats">
                    <span>1차 기록 <b>{recs.length}</b></span>
                    {doc.settings.supplementEnabled && <span>보완 대기 <b className={pending.length ? "warn" : ""}>{pending.length}</b></span>}
                    {recOn && <span>스크립트 <b>{meta ? `${meta.segmentCount}발언` : "—"}</b></span>}
                    {recOn && meta && <span>추천 <b className={(meta.suggestNew ?? 0) ? "accent" : ""}>{meta.suggestNew ?? 0}</b></span>}
                  </div>
                  <div className="flex" style={{ gap: 6, marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
                    {pending.length > 0 && <button className="btn sm primary" onClick={() => openSupplement(pending.map((r) => r.id))}>보완 {pending.length}</button>}
                    {meta && <button className="btn sm" onClick={() => setView({ id: meta.id })}>스크립트</button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="today-grid">
          <section>
            <div className="flex between">
              <h3 className="sec-h">추천함 {focus && <button className="btn ghost sm" onClick={() => setFocus(null)}>전체 보기</button>}</h3>
              {otherAreas > 0 && <span className="muted small">다른 영역에 추천 {otherAreas}개 수업</span>}
            </div>
            {!recOn && myIndex.length === 0 ? (
              <Empty title="수업 녹음이 꺼져 있습니다" desc="설정 → 공통 설정 → 녹음에서 켜면, 폰이 보낸 수업 스크립트에서 기록할 만한 발언을 골라 여기에 보여 줍니다." action={<button className="btn" onClick={beginDemo} disabled={starting}>데모 모드로 미리 보기</button>} />
            ) : inbox.length === 0 ? (
              <Empty title="처리할 추천이 없습니다" desc="새 스크립트가 도착하면 추천 카드가 여기에 나타납니다." />
            ) : inbox.map((m) => <SuggestionGroup key={m.id} meta={m} doc={doc} onOpenScript={(seg) => setView({ id: m.id, seg })} />)}
          </section>
          <aside>
            <h3 className="sec-h">이번 주 기록 형평성</h3>
            <div className="card pad" style={{ padding: 12 }}>
              {fairness.length === 0 ? <div className="muted small">명단이 없습니다.</div> : fairness.map((f) => (
                <button key={f.c} className="fair-row" onClick={() => { setClass(f.c); setRecordsFilter("week0"); setPage("records"); }} title="누가기록에서 이번 주 0건 학생 보기">
                  <span className="key">{f.c}</span>
                  <span className="fair-bar"><i style={{ width: `${f.total ? ((f.total - f.zero) / f.total) * 100 : 0}%` }} /></span>
                  <span className={`small ${f.zero ? "warn" : "muted"}`}>0건 {f.zero}명</span>
                </button>
              ))}
              <div className="muted small" style={{ marginTop: 8 }}>월요일부터 지금까지 기록이 한 건도 없는 학생 수입니다.</div>
            </div>
            {myIndex.length > 0 && <>
              <h3 className="sec-h" style={{ marginTop: 16 }}>최근 스크립트</h3>
              <div className="card" style={{ padding: 4 }}>
                {myIndex.slice(0, 6).map((m) => { const d = new Date(m.startedAt); return (
                  <button key={m.id} className="fair-row" onClick={() => setView({ id: m.id })}>
                    <span className="key">{m.class}{m.period ? ` ${m.period}교시` : ""}</span>
                    <span className="muted small">{d.getMonth() + 1}/{d.getDate()} · {m.segmentCount}발언</span>
                    <span className="small accent">{m.suggestNew ? `추천 ${m.suggestNew}` : ""}</span>
                  </button>
                ); })}
              </div>
            </>}
          </aside>
        </div>
      </div>
      {view && <TranscriptModal id={view.id} focusSegment={view.seg} onClose={() => setView(null)} recordable />}
      {demo && <DemoSimulator onEnd={() => { setDemo(false); toast({ text: "데모를 끝냈습니다. 샘플 기록은 남아 있습니다." }); }} />}
    </>
  );
}

/** 수업 하나의 추천 카드 묶음 */
function SuggestionGroup({ meta, doc, onOpenScript }: { meta: TranscriptMeta; doc: NugaDoc; onOpenScript: (seg?: string) => void }) {
  const get = useTranscripts((s) => s.get);
  const loadSg = useTranscripts((s) => s.loadSuggestions);
  const list = useTranscripts((s) => s.suggestions[meta.id]);
  const toast = useStore((s) => s.toast);
  const [tr, setTr] = useState<Transcript | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { get(meta.id).then(setTr); loadSg(meta.id); }, [meta.id, meta.teacher]);
  const d = new Date(meta.startedAt);
  const items = (list || []).filter((x) => x.status === "new" || x.status === "later").sort((a, b) => (a.status === "later" ? 1 : 0) - (b.status === "later" ? 1 : 0));
  const rerun = async () => { setBusy(true); const r = await runSuggestions(meta.id); setBusy(false); toast({ text: r.error ? `규칙으로 추천함 (${r.error})` : `추천 ${r.count}개 · ${r.by}` }); };
  return (
    <div className="sg-group">
      <div className="flex between sg-head">
        <span><b>{meta.class}{meta.period ? ` · ${meta.period}교시` : ""}</b> <span className="muted small">{d.getMonth() + 1}/{d.getDate()} {String(d.getHours()).padStart(2, "0")}:{String(d.getMinutes()).padStart(2, "0")} · {meta.suggestBy || "추천 전"}</span></span>
        <span className="flex"><button className="btn ghost sm" onClick={() => onOpenScript()}>스크립트 보기</button><button className="btn ghost sm" disabled={busy} onClick={rerun}><Icon name="spark" size={14} />{busy ? "추천 중" : "다시 추천"}</button></span>
      </div>
      {!tr ? <div className="muted small">불러오는 중…</div> : items.length === 0 ? <div className="muted small" style={{ padding: "8px 0" }}>남은 추천이 없습니다.</div> : items.map((s) => <SuggestionCard key={s.id} s={s} tr={tr} doc={doc} onOpenScript={onOpenScript} />)}
    </div>
  );
}

function SuggestionCard({ s, tr, doc, onOpenScript }: { s: Suggestion; tr: Transcript; doc: NugaDoc; onOpenScript: (seg?: string) => void }) {
  const setStatus = useTranscripts((x) => x.setSuggestionStatus);
  const [ctx, setCtx] = useState(false);
  const [assign, setAssign] = useState(false);
  const c = suggestionContext(tr, s);
  if (!c.main.length) return null;
  const at = segmentDate(tr, c.main[0]);
  return (
    <div className={`sg-card ${s.status === "later" ? "later" : ""}`}>
      <div className="flex wrap" style={{ gap: 8 }}>
        <span className="num small muted">{String(at.getHours()).padStart(2, "0")}:{String(at.getMinutes()).padStart(2, "0")}:{String(at.getSeconds()).padStart(2, "0")}</span>
        <span className="small" style={{ fontWeight: 700, color: speakerColor(tr, c.main[0].speaker) }}>{c.main[0].speaker}</span>
        <span className="chip outline">{s.criteria}</span>
        <Chip cat={s.category} label={catLabel(doc, s.category)} />
        {s.status === "later" && <span className="chip none">나중에</span>}
        <span className="grow" />
        <span className="muted small">{s.source === "llm" ? "AI" : "규칙"} · {Math.round(s.score * 100)}</span>
      </div>
      {ctx && c.before && <div className="sg-ctx">{c.before.speaker}: {c.before.text}</div>}
      <div className="sg-text">“{c.main.map((x) => x.text).join(" ")}”</div>
      {ctx && c.after && <div className="sg-ctx">{c.after.speaker}: {c.after.text}</div>}
      <div className="sg-reason">{s.reason}</div>
      <div className="flex" style={{ gap: 6, marginTop: 8 }}>
        <button className="btn sm primary" onClick={() => setAssign(true)}>학생 지정</button>
        <button className="btn sm" onClick={() => setStatus(tr.id, s.id, "later")} disabled={s.status === "later"}>나중에</button>
        <button className="btn sm ghost" onClick={() => setStatus(tr.id, s.id, "dismissed")}>무시</button>
        <span className="grow" />
        <button className="btn ghost sm" onClick={() => setCtx(!ctx)}>{ctx ? "문맥 접기" : "앞뒤 문맥"}</button>
        <button className="btn ghost sm" onClick={() => onOpenScript(c.main[0].id)}>스크립트에서</button>
      </div>
      {assign && <AssignModal tr={tr} segs={c.main} category={s.category} reason={s.reason} onClose={() => setAssign(false)} onDone={(recordId) => setStatus(tr.id, s.id, "recorded", recordId)} />}
    </div>
  );
}

