import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_RECORDING, WEEKDAY_LABELS, alignCandidates, dateKey, fmtHM, lessonFor, nowIso, segmentDate, slotsForWeekday, suggestionContext, weekdayOf,
  type AlignCandidate, type Category, type NugaDoc, type NugaRecord, type Suggestion, type Transcript,
} from "@nuga/core";
import { catLabel, studentName, studentsOf, useStore } from "../store";
import { useTranscripts, type TranscriptMeta } from "../lib/transcripts";
import { AchPress, Chip, Modal } from "./ui";

/**
 * 알림 모달 (쉬는 시간 기록): 반마다 한 줄, [반 | 자동 추천 | 수동 기록].
 * - 자동 추천: 수업 녹음 스크립트에서 고른 발언 → 학생 번호를 누르면 바로 누가기록 저장.
 * - 수동 기록: 폰·워치로 찍어 둔 1차 기록(보완 대기) → 관찰 내용을 쓰고 Enter.
 * [나중에]로 미룬 것과 닫을 때 남은 것은 오른쪽 위 [미반영]에서 다시 처리한다.
 */

/** 반마다 처음에 보이는 추천 수. 하나를 처리하면 다음 것이 올라온다. */
const SG_SHOWN = 3;
const SRC_LABEL: Record<string, string> = { watch: "워치", widget: "위젯", phone: "폰", pc: "PC", suggestion: "추천" };
const two = (n: number) => String(n).padStart(2, "0");
const hms = (d: Date) => `${two(d.getHours())}:${two(d.getMinutes())}`;

/** 미반영 = 보완 대기 기록 + 처리하지 않은 추천(새로·나중에) */
export function useBacklogCount(): number {
  const doc = useStore((s) => s.doc);
  const areaId = useStore((s) => s.areaId);
  const index = useTranscripts((s) => s.index);
  const loaded = useTranscripts((s) => s.loaded);
  const load = useTranscripts((s) => s.load);
  useEffect(() => { if (!loaded) load(); }, [loaded]);
  const pending = doc.records.filter((r) => r.status === "pending").length;
  return pending + index.filter((m) => m.areaId === areaId).reduce((a, m) => a + (m.suggestNew ?? 0), 0);
}

interface Row { key: string; day: string; cls: string; period: number | null; time: string; lesson: string; records: NugaRecord[]; metas: TranscriptMeta[] }

export function InboxModal() {
  const inbox = useStore((s) => s.inbox)!;
  const doc = useStore((s) => s.doc);
  const areaId = useStore((s) => s.areaId);
  const openInbox = useStore((s) => s.openInbox);
  const closeInbox = useStore((s) => s.closeInbox);
  const index = useTranscripts((s) => s.index);
  const tLoaded = useTranscripts((s) => s.loaded);
  const tLoad = useTranscripts((s) => s.load);
  const tGet = useTranscripts((s) => s.get);
  const loadSg = useTranscripts((s) => s.loadSuggestions);
  const sgAll = useTranscripts((s) => s.suggestions);
  const backlogCount = useBacklogCount();
  /** 이번 창에서 [나중에]로 미룬 수동 기록 (보완 대기로 남는다) */
  const [deferred, setDeferred] = useState<Set<string>>(new Set());
  const [trs, setTrs] = useState<Record<string, Transcript>>({});
  /** 추천을 모두 펼친 반 (기본은 반마다 앞 3개) */
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  useEffect(() => { if (!tLoaded) tLoad(); }, [tLoaded]);

  const backlog = inbox.backlog;
  const myIndex = useMemo(() => index.filter((m) => m.areaId === areaId), [index, areaId]);
  const today = dateKey(new Date());

  // 이번 알림이 가리키는 (날짜, 반) 묶음. 미반영 보기는 전체.
  const keys = useMemo(() => {
    const k = new Set<string>();
    for (const id of inbox.records) { const r = doc.records.find((x) => x.id === id); if (r) k.add(`${dateKey(r.time)}|${r.class}`); }
    for (const id of inbox.transcripts) { const m = index.find((x) => x.id === id); if (m) k.add(`${dateKey(m.startedAt)}|${m.class}`); }
    return k;
  }, [inbox.records.join(), inbox.transcripts.join(), index.length]);
  const inScope = (day: string, cls: string) => backlog || keys.has(`${day}|${cls}`);

  const pendingRecs = doc.records.filter((r) => r.status === "pending" && (backlog || !deferred.has(r.id)) && inScope(dateKey(r.time), r.class));
  const metas = myIndex.filter((m) => inScope(dateKey(m.startedAt), m.class) && (backlog ? (m.suggestNew ?? 0) > 0 : true));

  useEffect(() => {
    let alive = true;
    for (const m of metas) {
      loadSg(m.id);
      if (!trs[m.id]) tGet(m.id).then((t) => { if (alive && t) setTrs((p) => ({ ...p, [m.id]: t })); });
    }
    return () => { alive = false; };
  }, [metas.map((m) => m.id).join()]);

  const rows: Row[] = useMemo(() => {
    const map = new Map<string, Row>();
    const rowOf = (day: string, cls: string) => {
      const key = `${day}|${cls}`;
      let r = map.get(key);
      if (!r) {
        const slot = slotsForWeekday(doc.settings, weekdayOf(new Date(`${day}T12:00:00`))).find((s) => s.class === cls);
        r = { key, day, cls, period: slot?.period ?? null, time: slot ? `${slot.start}–${slot.end}` : "", lesson: lessonFor(doc.settings.progress, cls, day)?.title || "", records: [], metas: [] };
        map.set(key, r);
      }
      return r;
    };
    for (const r of pendingRecs) rowOf(dateKey(r.time), r.class).records.push(r);
    for (const m of metas) rowOf(dateKey(m.startedAt), m.class).metas.push(m);
    for (const r of map.values()) r.records.sort((a, b) => a.time.localeCompare(b.time));
    // 최근 날짜 먼저, 같은 날은 시간표 순서
    return [...map.values()].sort((a, b) => b.day.localeCompare(a.day) || (a.period ?? 99) - (b.period ?? 99) || a.cls.localeCompare(b.cls));
  }, [pendingRecs.map((r) => r.id + r.updatedAt).join(), metas.map((m) => m.id).join(), doc.settings]);

  const sgFor = (row: Row) => row.metas.flatMap((m) => (sgAll[m.id] || []).filter((s) => s.status === "new" || (backlog && s.status === "later")).map((s) => ({ s, meta: m })));
  const remaining = rows.reduce((a, r) => a + r.records.length + sgFor(r).length, 0);

  return (
    <Modal width="inbox" onClose={closeInbox} header={
      <div className="ib-head">
        <h2>{backlog ? "미반영 기록" : "쉬는 시간 기록"}</h2>
        <span className="muted small">{backlog ? "미뤄 둔 추천과 보완 대기 기록입니다" : "기억이 남아 있을 때 바로 처리하세요"}</span>
        <span className="grow" />
        {backlog
          ? (keys.size > 0 && <button className="btn sm" onClick={() => openInbox({ backlog: false })}>방금 수업만</button>)
          : <button className={`btn sm ${backlogCount ? "warn-outline" : ""}`} onClick={() => openInbox({ backlog: true })} title="미뤄 둔 기록 모두 보기">미반영 <b className="num">{backlogCount}</b></button>}
      </div>
    } footer={
      <>
        <span className="muted small"><span className="kbd">Enter</span> 저장 · 번호를 누르면 추천이 바로 기록됩니다 · <span className="kbd">Esc</span> 닫기</span>
        <span className="grow" />
        {remaining > 0 && <span className="small warn">남은 {remaining}건은 미반영에 남습니다</span>}
        <button className="btn primary" onClick={closeInbox}>{remaining ? "닫기" : "완료"}</button>
      </>
    }>
      <div className="ib-grid">
        <div className="ib-th">반</div><div className="ib-th">자동 추천 <span className="muted small">수업 녹음</span></div><div className="ib-th">수동 기록 <span className="muted small">폰 · 워치</span></div>
        {rows.length === 0 && <div className="ib-empty">처리할 기록이 없습니다.{!backlog && backlogCount > 0 && <> <button className="btn sm" onClick={() => openInbox({ backlog: true })}>미반영 {backlogCount}건 보기</button></>}</div>}
        {rows.map((row) => {
          const sgs = sgFor(row);
          const d = new Date(`${row.day}T12:00:00`);
          return (
            <React.Fragment key={row.key}>
              <div className="ib-cls">
                <b>{row.cls}</b>
                {row.period && <span className="small">{row.period}교시</span>}
                <span className="muted small">{row.day === today ? row.time : `${d.getMonth() + 1}/${d.getDate()} (${WEEKDAY_LABELS[weekdayOf(d)]})`}</span>
                {row.lesson && <span className="muted small ellipsis" title={row.lesson}>{row.lesson}</span>}
              </div>
              <div className="ib-col">
                {sgs.length === 0
                  ? <div className="ib-none">{row.metas.length ? (row.metas.some((m) => !sgAll[m.id]) ? "불러오는 중…" : "남은 추천 없음") : "녹음 없음"}</div>
                  : <>
                    {(expanded.has(row.key) ? sgs : sgs.slice(0, SG_SHOWN)).map(({ s, meta }, i) => trs[meta.id] ? <SuggestItem key={s.id} s={s} tr={trs[meta.id]} doc={doc} open={i === 0} /> : null)}
                    {sgs.length > SG_SHOWN && (
                      <button className="btn ghost sm ib-more" onClick={() => setExpanded((p) => { const n = new Set(p); if (n.has(row.key)) n.delete(row.key); else n.add(row.key); return n; })}>
                        {expanded.has(row.key) ? "접기" : `추천 ${sgs.length - SG_SHOWN}개 더 보기`}
                      </button>
                    )}
                  </>}
              </div>
              <div className="ib-col">
                {row.records.length === 0
                  ? <div className="ib-none">수동 기록 없음</div>
                  : row.records.map((r, i) => <ManualItem key={r.id} rec={r} trs={row.metas.map((m) => trs[m.id]).filter(Boolean)} autoFocus={i === 0 && row === rows.find((x) => x.records.length)} canDefer={!backlog} onDefer={() => setDeferred((p) => new Set(p).add(r.id))} />)}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </Modal>
  );
}

/** 자동 추천 한 장: 발언 · 이유(고칠 수 있음) · 학생 번호 → 저장 */
function SuggestItem({ s, tr, doc, open: open0 }: { s: Suggestion; tr: Transcript; doc: NugaDoc; open: boolean }) {
  const setStatus = useTranscripts((x) => x.setSuggestionStatus);
  const addRecord = useStore((x) => x.addRecord);
  const toast = useStore((x) => x.toast);
  const [open, setOpen] = useState(open0);
  const [cat, setCat] = useState<Category>(s.category);
  const [note, setNote] = useState(s.reason);
  const [ctx, setCtx] = useState(false);
  useEffect(() => { if (open0) setOpen(true); }, [open0]); // 앞 카드를 처리하면 다음 카드가 펼쳐진다
  const c = suggestionContext(tr, s);
  if (!c.main.length) return null;
  const at = segmentDate(tr, c.main[0]);
  const students = studentsOf(doc, tr.class);
  const save = (no: number) => {
    const rec = addRecord({
      class: tr.class, no, category: cat, time: nowIso(at), lesson: lessonFor(doc.settings.progress, tr.class, nowIso(at)),
      memo: `“${c.main.map((x) => x.text).join(" ")}”`, voiceMemo: null, note: note.trim(), status: "confirmed", source: "suggestion",
    });
    setStatus(tr.id, s.id, "recorded", rec.id);
    toast({ text: `${tr.class} ${no}번 ${studentName(doc, tr.class, no)} · 기록했습니다` });
  };
  return (
    <div className={`ib-item sg ${open ? "open" : ""} ${s.status === "later" ? "later" : ""}`}>
      <div className="ib-meta" onClick={() => setOpen(!open)}>
        <span className="num">{hms(at)}</span>
        <span className="chip outline">{s.criteria}</span>
        {s.status === "later" && <span className="chip none">미룸</span>}
        <span className="grow" />
        <span className="muted small">{s.source === "llm" ? "AI" : "규칙"}</span>
      </div>
      <div className="ib-quote" onClick={() => setOpen(!open)}>
        {ctx && c.before && <div className="ib-ctx">{c.before.speaker}: {c.before.text}</div>}
        “{c.main.map((x) => x.text).join(" ")}”
        {ctx && c.after && <div className="ib-ctx">{c.after.speaker}: {c.after.text}</div>}
      </div>
      {!open ? <div className="ib-reason">{s.reason}</div> : <>
        <div className="flex wrap" style={{ gap: 4 }}>
          {doc.settings.categories.map((x) => <Chip key={x.key} cat={x.key} label={x.label} selected={cat === x.key} onClick={() => setCat(x.key)} />)}
          <span className="grow" />
          <button className="btn ghost sm" onClick={() => setCtx(!ctx)}>{ctx ? "문맥 접기" : "앞뒤 문맥"}</button>
        </div>
        <input className="ib-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="관찰 내용" />
        <div className="ib-nums" title="누구의 발언인지 떠올려 번호를 누르세요 · 길게 누르면 성취도 조절">
          {students.length === 0 ? <span className="muted small">명단이 없습니다</span> : students.map((st) => <AchPress key={st.no} student={st} onClick={() => save(st.no)}>{st.no}</AchPress>)}
        </div>
      </>}
      <div className="ib-acts">
        {!open && <button className="btn sm primary" onClick={() => setOpen(true)}>학생 지정</button>}
        {s.status !== "later" && <button className="btn sm" onClick={() => setStatus(tr.id, s.id, "later")}>나중에</button>}
        <button className="btn sm ghost" onClick={() => setStatus(tr.id, s.id, "dismissed")}>무시</button>
      </div>
    </div>
  );
}

/** 수동 기록 한 건: 번호·이름·카테고리 · 관찰 내용 → Enter 저장 */
function ManualItem({ rec, trs, autoFocus, canDefer, onDefer }: { rec: NugaRecord; trs: Transcript[]; autoFocus: boolean; canDefer: boolean; onDefer: () => void }) {
  const doc = useStore((s) => s.doc);
  const updateRecord = useStore((s) => s.updateRecord);
  const [note, setNote] = useState(rec.note || "");
  const [cat, setCat] = useState<Category>(rec.category);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (autoFocus) setTimeout(() => ref.current?.focus(), 30); }, []);
  // 기록 시각 전후 발언 (v3 7.4). 화자와 학생은 연결하지 않는다.
  const cands: AlignCandidate[] = useMemo(() => {
    if (!trs.length) return [];
    const win = (doc.settings.recording || DEFAULT_RECORDING).alignWindowSec || [-60, 15];
    return alignCandidates(rec, trs, catLabel(doc, cat), win as [number, number], 2);
  }, [trs.length, rec.time, cat]);
  const lesson = rec.lesson || lessonFor(doc.settings.progress, rec.class, rec.time);
  const save = () => updateRecord(rec.id, { note: note.trim(), category: cat, status: "confirmed", lesson });
  const skip = () => updateRecord(rec.id, { status: "skipped", category: cat, lesson });
  const memo = rec.memo || rec.voiceMemo?.transcript || "";
  return (
    <div className="ib-item man">
      <div className="ib-meta">
        <AchPress student={doc.students.find((s) => s.class === rec.class && s.no === rec.no)} className="ib-who"><b className="num">{rec.no}</b> <b>{studentName(doc, rec.class, rec.no)}</b></AchPress>
        <span className="grow" />
        <span className="muted small num">{fmtHM(rec.time)} · {SRC_LABEL[rec.source] || rec.source}</span>
      </div>
      <div className="flex wrap" style={{ gap: 4 }}>
        {doc.settings.categories.map((x) => <Chip key={x.key} cat={x.key} label={x.label} selected={cat === x.key} onClick={() => setCat(x.key)} />)}
      </div>
      {memo && <div className="ib-reason">{rec.voiceMemo ? "음성 " : "메모 "}<b>{memo}</b></div>}
      <textarea ref={ref} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="무엇을 했는지 한 줄 (Enter 저장)"
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); save(); } }} />
      {cands.length > 0 && (
        <div className="ib-cands">
          {cands.map((c) => <button key={c.transcriptId + c.segment.id} onClick={() => { setNote(c.segment.text); ref.current?.focus(); }} title="눌러서 넣기"><span className="muted">{hms(c.at)} {c.segment.speaker}</span> {c.segment.text}</button>)}
        </div>
      )}
      <div className="ib-acts">
        <button className="btn sm primary" onClick={save}>저장</button>
        {canDefer && <button className="btn sm" onClick={onDefer}>나중에</button>}
        <button className="btn sm ghost" onClick={skip}>건너뛰기</button>
      </div>
    </div>
  );
}
