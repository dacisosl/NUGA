import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  buildDraftRequest, countChars, fmtMD, lessonLabel, nowIso, reviewText, uuid, splitSentences, truncate,
  type Draft, type DraftHistory, type DraftSentence, type NugaRecord, type Performance, type Student,
} from "@nuga/core";
import { ClassTabs, TopBar, useClassStudents } from "../App";
import { catCounts, draftOf, fillLesson, isLowRecord, perfsOf, recordsOf, studentsOf, useStore } from "../store";
import { CatChip, Chip, Confirm, EditableCell, Empty, Icon, LenBar, LevelBadge, Modal, StatusChip, Switch } from "../components/ui";
import { Timeline } from "../components/Timeline";
import { generateDraft } from "../lib/ai";
import { pickFile, readFileAsDataUrl } from "../lib/platform";
import { exportSheets } from "../lib/excel";

/* ---------------- 공통: 초안 만들기 ---------------- */

interface Working { text: string; sentences: DraftSentence[]; history: DraftHistory[]; dirty: boolean; target?: number }
const workingCache = new Map<string, Working>();
/** 내용이 있는 기록만 초안 근거로 쓴다 (보완 전 빈 기록 제외) */
const hasText = (r: NugaRecord) => !!(r.note || r.memo || r.voiceMemo?.transcript || "").trim();
const keyOf = (s: Student) => `${s.class}-${s.no}`;

function useDraftReview(student: Student | null, text: string, sentences: DraftSentence[] | null, targetOverride?: number) {
  const doc = useStore((s) => s.doc);
  return useMemo(() => {
    if (!student) return null;
    const others = doc.drafts.filter((d) => d.class === student.class && d.no !== student.no && d.text).map((d) => ({ text: d.text, label: `${d.no}번` }));
    return reviewText(text, sentences, {
      target: targetOverride || doc.settings.targetLength["세특"] || 500, lengthMode: doc.settings.lengthMode, level: student.level,
      recordCount: recordsOf(doc, student.class, student.no).filter((r) => r.status !== "skipped").length,
      lowRecordThreshold: doc.settings.lowRecordThreshold, otherDrafts: others, similarityThreshold: doc.settings.similarityThreshold, studentName: student.name,
    });
  }, [doc, student?.class, student?.no, text, sentences, targetOverride]);
}

async function runGenerate(student: Student, records: NugaRecord[], perfs: Performance[], w: Working, instruction: string | undefined) {
  const { doc } = useStore.getState();
  const req = buildDraftRequest({
    level: student.level, targetLength: w.target || doc.settings.targetLength["세특"] || 500, lengthMode: doc.settings.lengthMode, subject: doc.settings.school.subject,
    records, performances: perfs, categories: doc.settings.categories,
    draft: w.text || undefined, history: w.history, instruction,
  });
  return generateDraft(req, doc.settings.ai);
}

function makeDraft(student: Student, w: Working, review: ReturnType<typeof reviewText>, prev?: Draft): Draft {
  const { doc } = useStore.getState();
  const cc = countChars(w.text);
  return {
    id: prev?.id || uuid(), class: student.class, no: student.no, field: "세특", text: w.text,
    length: doc.settings.lengthMode === "withSpaces" ? cc.withSpaces : cc.withoutSpaces,
    sentences: w.sentences, evidence: [...new Set(w.sentences.flatMap((s) => s.evidence))], status: "saved", targetLength: w.target,
    review: { result: review.result, issues: review.issues, at: nowIso() }, history: w.history, updatedAt: nowIso(),
  };
}

/* ---------------- 페이지 ---------------- */

export function DraftPage() {
  const mode = useStore((s) => s.mode2p);
  const setMode = useStore((s) => s.setMode2p);
  const doc = useStore((s) => s.doc);
  const toast = useStore((s) => s.toast);
  const exportExcel = async () => {
    const sheets = Array.from(new Set(doc.students.map((s) => s.class))).sort().map((c) => ({
      name: c, widths: [8, 10, 6, 10, 90, 8, 10],
      rows: studentsOf(doc, c).map((s) => { const d = draftOf(doc, c, s.no); return { 번호: s.no, 이름: s.name, 수준: s.level, 누가기록: recordsOf(doc, c, s.no).length, 세특: d?.text || "", 글자수: d?.length || 0, 상태: d ? "완료" : "대기" }; }),
    }));
    if (await exportSheets(`세특초안-${nowIso().slice(0, 10)}.xlsx`, sheets)) toast({ text: "엑셀 내보내기 완료" });
  };
  return (
    <>
      <TopBar title="초안 작성" onExcel={exportExcel} center={<span className="seg"><button className={mode === "individual" ? "active" : ""} onClick={() => setMode("individual")}>개별</button><button className={mode === "batch" ? "active" : ""} onClick={() => setMode("batch")}>일괄</button></span>} />
      <ClassTabs extra={(c) => { const n = studentsOf(doc, c).length; const d = doc.drafts.filter((x) => x.class === c && x.text).length; return <span className="cnt num">{d}/{n}</span>; }} />
      {mode === "individual" ? <Individual /> : <Batch />}
    </>
  );
}

/* ---------------- 개별 생성 ---------------- */

function Individual() {
  const doc = useStore((s) => s.doc);
  const cls = useStore((s) => s.cls);
  const students = useClassStudents();
  const selected = useStore((s) => s.selected);
  const select = useStore((s) => s.select);
  const saveDraft = useStore((s) => s.saveDraft);
  const toast = useStore((s) => s.toast);

  const student = useMemo(() => students.find((s) => selected && s.class === selected.class && s.no === selected.no) || students[0] || null, [students, selected]);
  useEffect(() => { if (student && (!selected || selected.class !== cls)) select({ class: student.class, no: student.no }); }, [student?.class, student?.no, cls]);

  const recs = useMemo(() => student ? recordsOf(doc, student.class, student.no).map((r) => fillLesson(doc, r)) : [], [doc, student]);
  const perfs = useMemo(() => student ? perfsOf(doc, student.class, student.no) : [], [doc, student]);
  const saved = student ? draftOf(doc, student.class, student.no) : undefined;

  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [w, setW] = useState<Working>({ text: "", sentences: [], history: [], dirty: false });
  const [expanded, setExpanded] = useState(false);
  const [dockH, setDockH] = useState(360);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [confirmA, setConfirmA] = useState(false);
  const [addPerf, setAddPerf] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  // 학생 바뀌면 작업본 로드 (캐시 → 저장본 → 빈 값)
  useEffect(() => {
    if (!student) return;
    const k = keyOf(student);
    const cached = workingCache.get(k);
    setW(cached || { text: saved?.text || "", sentences: saved?.sentences || [], history: saved?.history || [], dirty: false, target: saved?.targetLength });
    const evid = new Set(saved?.evidence || []);
    setChecked(new Set([...recs.filter((r) => r.status !== "skipped" && hasText(r) && (evid.size ? evid.has(r.id) : true)).map((r) => r.id), ...perfs.filter((p) => (evid.size ? evid.has(p.id) : true)).map((p) => p.id)]));
    setInput("");
  }, [student?.class, student?.no]);
  useEffect(() => { if (student) workingCache.set(keyOf(student), w); }, [w, student]);
  useEffect(() => { logRef.current?.scrollTo({ top: 1e9 }); }, [w.history.length, expanded]);

  const target = w.target || doc.settings.targetLength["세특"] || 500;
  const review = useDraftReview(student, w.text, w.sentences.length ? w.sentences : null, target);
  const len = doc.settings.lengthMode === "withSpaces" ? countChars(w.text).withSpaces : countChars(w.text).withoutSpaces;

  const toggle = (id: string) => setChecked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const generate = async (instruction?: string) => {
    if (!student || busy) return;
    const useRecs = recs.filter((r) => checked.has(r.id) && hasText(r));
    const usePerfs = perfs.filter((p) => checked.has(p.id));
    if (!useRecs.length && !usePerfs.length) { toast({ text: "체크된 기록이 없음" }); return; }
    setBusy(true); setExpanded(true);
    const msg = instruction || (w.text ? "초안을 다시 만들어줘" : "체크한 기록으로 세특 만들어줘");
    const history: DraftHistory[] = [...w.history, { role: "user", text: msg, at: nowIso() }];
    setW((x) => ({ ...x, history }));
    try {
      const res = await runGenerate(student, useRecs, usePerfs, { ...w, history: history.slice(0, -1) }, instruction);
      const note = res.provider === "local" ? "규칙 기반으로 초안을 갱신함 (AI 꺼짐)" : `초안을 갱신함 (${res.model})`;
      setW({ text: res.text, sentences: res.sentences, history: [...history, { role: "assistant", text: note, at: nowIso() }], dirty: true });
    } catch (e) {
      setW((x) => ({ ...x, history: [...history, { role: "assistant", text: `실패: ${e instanceof Error ? e.message : String(e)}`, at: nowIso() }] }));
    } finally { setBusy(false); setInput(""); }
  };

  const doSave = () => {
    if (!student || !review) return;
    saveDraft(makeDraft(student, w, review, saved));
    setW((x) => ({ ...x, dirty: false }));
    toast({ text: `${student.name} 초안 저장 · ${len}자` });
  };
  const save = () => {
    if (!student || !review) return;
    if (student.level === "A" && review.issues.some((i) => i.kind === "levelA")) { setConfirmA(true); return; }
    doSave();
  };
  const onTextEdit = (t: string) => setW((x) => ({ ...x, text: t, sentences: resplit(x.sentences, t), dirty: true }));

  if (!student) return <div className="content"><Empty title="명단 없음" desc="설정 → 반·명단에서 학생을 등록하세요" /></div>;
  const counts = catCounts(recs);
  const suggestions = ["체크한 기록으로 세특 만들어줘", "협동 부분 줄이고 질문 쪽을 강조해줘", "더 간결하게 줄여줘", "마지막 문장 다시 써줘"];

  return (
    <div className="content noscroll">
      <div className="draft-layout">
        <div className="stulist">
          {students.map((s) => {
            const d = draftOf(doc, s.class, s.no); const low = isLowRecord(doc, s.class, s.no);
            const cache = workingCache.get(keyOf(s));
            return (
              <button key={s.no} className={`stu ${s.no === student.no ? "active" : ""}`} onClick={() => select({ class: s.class, no: s.no })}>
                <span className="no num">{s.no}</span><span className="n">{s.name}</span>
                {cache?.dirty ? <span className="dot" style={{ background: "var(--accent)" }} title="저장 안 됨" /> : d?.text ? <span style={{ color: "var(--accent)" }}>✓</span> : s.level === "A" && low ? <span title="A · 기록 부족" style={{ color: "var(--warn)" }}><Icon name="warn" size={14} /></span> : null}
                <LevelBadge level={s.level} student={s} />
              </button>
            );
          })}
        </div>
        <div className="draft-main">
          <div className="draft-scroll">
            <div className="card profile">
              <LevelBadge level={student.level} student={student} />
              <div><div className="name">{student.name}</div><div className="muted small">{student.class} · {student.no}번</div></div>
              <div className="stats">
                {doc.settings.categories.map((c) => <Chip key={c.key} cat={c.key} label={`${c.label} ${counts[c.key]}`} />)}
                <Chip cat="perf" label={`수행 ${perfs.length}`} />
              </div>
            </div>
            <Timeline records={recs} perfs={perfs} semester={doc.settings.school.semester} year={doc.settings.school.year} onPick={toggle} />
            <div className="card">
              {recs.length === 0 && <Empty title="기록 없음" />}
              {recs.map((r) => (
                <label key={r.id} className={`reccard ${checked.has(r.id) ? "" : "off"}`} style={{ cursor: "pointer" }}>
                  <input type="checkbox" className="checkbox" checked={checked.has(r.id)} onChange={() => toggle(r.id)} style={{ marginTop: 3 }} />
                  <div className="grow">
                    <div className="meta"><CatChip cat={r.category} /><span className="num">{fmtMD(r.time)}</span><span>{lessonLabel(r.lesson)}</span>{doc.settings.supplementEnabled && r.status === "pending" && <span className="chip pending">보완 전</span>}</div>
                    <div>{r.note || r.memo || r.voiceMemo?.transcript || <span className="muted">내용 없음</span>}</div>
                  </div>
                </label>
              ))}
              {perfs.map((p) => (
                <label key={p.id} className={`reccard ${checked.has(p.id) ? "" : "off"}`} style={{ cursor: "pointer" }}>
                  <input type="checkbox" className="checkbox" checked={checked.has(p.id)} onChange={() => toggle(p.id)} style={{ marginTop: 3 }} />
                  {p.file && <img src={p.file} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6, border: "1px solid var(--line)" }} />}
                  <div className="grow">
                    <div className="meta"><Chip cat="perf" label={p.title} /><span className="num">{p.date}</span></div>
                    <div>{p.excerpt || <span className="muted">발췌 없음</span>}</div>
                  </div>
                </label>
              ))}
              <div style={{ padding: "10px 16px" }}><button className="btn sm" onClick={() => setAddPerf(true)}><Icon name="plus" size={14} />수행평가</button></div>
            </div>
          </div>

          <div className="chatdock" style={expanded ? { height: dockH } : undefined}>
            {expanded && <DragHandle onDrag={(dy) => setDockH((h) => Math.max(220, Math.min(window.innerHeight - 200, h - dy)))} />}
            <div className="bar">
              <button className="btn ghost sm" onClick={() => setExpanded(!expanded)}>{expanded ? "접기" : "펼치기"}</button>
              <LenBar len={len} target={target} mode={doc.settings.lengthMode} />
              <span className="flex small muted" title="이 학생의 목표 글자수 (비우면 설정값)">목표 <input type="number" className="num" style={{ width: 66, height: 28 }} value={w.target ?? ""} placeholder={String(doc.settings.targetLength["세특"] || 500)} onChange={(e) => setW((x) => ({ ...x, target: e.target.value ? Number(e.target.value) : undefined, dirty: true }))} />자</span>
              {review && w.text && <StatusChip result={review.result} />}
              {w.dirty && <span className="muted small">저장 안 됨</span>}
              <span className="grow" />
              {busy && <span className="spin" />}
              <button className="btn sm" disabled={!w.text} onClick={() => navigator.clipboard.writeText(w.text).then(() => toast({ text: "복사됨" }))}>복사</button>
              <button className="btn primary sm" disabled={!w.text} onClick={save}>저장</button>
            </div>
            {expanded && (
              <>
                <textarea className="draft" style={{ height: Math.max(90, dockH * 0.42) }} value={w.text} onChange={(e) => onTextEdit(e.target.value)} placeholder="초안이 여기에 표시됩니다. 직접 편집할 수 있습니다." />
                <div className="chatlog" ref={logRef}>
                  {w.history.length === 0 && <span className="muted small">아래 입력창에 요청을 쓰면 초안이 만들어집니다.</span>}
                  {w.history.map((h, i) => <div key={i} className={`msg ${h.role}`}>{h.text}</div>)}
                </div>
              </>
            )}
            <div className="suggest">{suggestions.map((s) => <button key={s} className="chip outline clickable" onClick={() => generate(s)} disabled={busy}>{s}</button>)}</div>
            <div className="inputbar">
              <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="예: 체크한 기록으로 세특 만들어줘" onKeyDown={(e) => { if (e.key === "Enter" && input.trim()) generate(input.trim()); }} disabled={busy} />
              <button className="btn primary" disabled={busy} onClick={() => generate(input.trim() || undefined)}>{w.text ? "수정" : "생성"}</button>
            </div>
          </div>
        </div>
      </div>
      {confirmA && <Confirm title="수준 A · 글자수 미달" body={`목표 ${target}자에 미달(${len}자)입니다. 기록이 부족한 상태로 저장할까요?`} okLabel="저장" onOk={doSave} onClose={() => setConfirmA(false)} />}
      {addPerf && <PerfAddModal student={student} onClose={() => setAddPerf(false)} />}
    </div>
  );
}

/** 텍스트를 직접 고쳤을 때 문장-근거 매핑을 최대한 보존 */
function resplit(prev: DraftSentence[], text: string): DraftSentence[] {
  const parts = splitSentences(text);
  return parts.map((p) => {
    const same = prev.find((s) => s.text === p);
    if (same) return same;
    let best: DraftSentence | null = null; let bestScore = 0;
    for (const s of prev) { const a = new Set(Array.from(s.text)); let hit = 0; for (const ch of p) if (a.has(ch)) hit++; const sc = hit / Math.max(1, p.length); if (sc > bestScore) { bestScore = sc; best = s; } }
    return { text: p, evidence: bestScore > 0.6 && best ? best.evidence : [] };
  });
}

function DragHandle({ onDrag }: { onDrag: (dy: number) => void }) {
  const onDown = (e: React.MouseEvent) => {
    let last = e.clientY;
    const mv = (ev: MouseEvent) => { onDrag(ev.clientY - last); last = ev.clientY; };
    const up = () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
  };
  return <div className="drag" onMouseDown={onDown} />;
}

/* ---------------- 수행평가 등록(개별) ---------------- */

async function tryOcr(dataUrl: string, onProgress?: (p: number) => void): Promise<string> {
  try {
    const url = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js";
    const mod = await import(/* @vite-ignore */ url);
    const worker = await mod.createWorker("kor+eng", 1, { logger: (m: { status: string; progress: number }) => { if (m.status === "recognizing text") onProgress?.(m.progress); } });
    const { data } = await worker.recognize(dataUrl);
    await worker.terminate();
    return String(data.text || "").trim();
  } catch { return ""; }
}

function PerfAddModal({ student, onClose }: { student: Student; onClose: () => void }) {
  const addPerformance = useStore((s) => s.addPerformance);
  const toast = useStore((s) => s.toast);
  const [title, setTitle] = useState("탐구보고서");
  const [date, setDate] = useState(nowIso().slice(0, 10));
  const [excerpt, setExcerpt] = useState("");
  const [file, setFile] = useState<string | null>(null);
  const [ocr, setOcr] = useState("");
  const [prog, setProg] = useState<number | null>(null);
  const pick = async () => {
    const [f] = await pickFile("image/*,.pdf");
    if (!f) return;
    const url = await readFileAsDataUrl(f); setFile(url);
    if (f.type.startsWith("image/")) { setProg(0); const t = await tryOcr(url, setProg); setProg(null); setOcr(t); if (t && !excerpt) setExcerpt(truncate(t.replace(/\s+/g, " "), 120)); }
  };
  const save = () => { addPerformance({ class: student.class, no: student.no, title: title.trim() || "수행평가", date, file, ocrText: ocr, excerpt: excerpt.trim(), matched: true }); toast({ text: "수행평가 등록" }); onClose(); };
  return (
    <Modal title={`수행평가 · ${student.name}`} onClose={onClose} width="narrow" footer={<><span className="grow" /><button className="btn" onClick={onClose}>취소</button><button className="btn primary" onClick={save}>등록</button></>}>
      <div className="col" style={{ gap: 12 }}>
        <div className="grid2"><div className="field"><label>제목</label><input value={title} onChange={(e) => setTitle(e.target.value)} /></div><div className="field"><label>날짜</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div></div>
        <div className="flex"><button className="btn sm" onClick={pick}>파일 선택</button>{file && <span className="muted small">첨부됨</span>}{prog !== null && <span className="muted small">OCR {Math.round(prog * 100)}%</span>}</div>
        {file && file.startsWith("data:image") && <img src={file} alt="" style={{ maxHeight: 160, borderRadius: 8, border: "1px solid var(--line)", objectFit: "contain" }} />}
        <div className="field"><label>발췌 (초안에 사용되는 내용)</label><textarea rows={3} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} placeholder="예: 생활 속 산화·환원 반응 — 철의 부식과 방지 방법 조사" /></div>
        {ocr && <details><summary className="muted small">OCR 전체 텍스트</summary><pre className="small" style={{ whiteSpace: "pre-wrap", maxHeight: 120, overflow: "auto" }}>{ocr}</pre></details>}
      </div>
    </Modal>
  );
}

/* ---------------- 일괄 생성 ---------------- */

type RowState = "idle" | "running" | "done" | "error";

function Batch() {
  const doc = useStore((s) => s.doc);
  const cls = useStore((s) => s.cls);
  const students = useClassStudents();
  const saveDraft = useStore((s) => s.saveDraft);
  const setMode = useStore((s) => s.setMode2p);
  const select = useStore((s) => s.select);
  const setSettings = useStore((s) => s.setSettings);
  const toast = useStore((s) => s.toast);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [overwrite, setOverwrite] = useState(false);
  const [state, setState] = useState<Record<number, { st: RowState; msg?: string }>>({});
  const [running, setRunning] = useState(false);
  const [perfPanel, setPerfPanel] = useState(false);
  const stopRef = useRef(false);
  const target = doc.settings.targetLength["세특"] || 500;

  useEffect(() => { setSel(new Set()); setState({}); }, [cls]);

  const runOne = async (s: Student) => {
    const recs = recordsOf(doc, s.class, s.no).map((r) => fillLesson(doc, r)).filter((r) => r.status !== "skipped" && hasText(r));
    const perfs = perfsOf(doc, s.class, s.no);
    const prev = draftOf(useStore.getState().doc, s.class, s.no);
    if (prev?.text && !overwrite) { setState((x) => ({ ...x, [s.no]: { st: "done", msg: "기존 유지" } })); return; }
    if (!recs.length && !perfs.length) { setState((x) => ({ ...x, [s.no]: { st: "error", msg: "기록 없음" } })); return; }
    setState((x) => ({ ...x, [s.no]: { st: "running" } }));
    try {
      const res = await runGenerate(s, recs, perfs, { text: "", sentences: [], history: [], dirty: false }, undefined);
      const w: Working = { text: res.text, sentences: res.sentences, history: [{ role: "user", text: "일괄 생성", at: nowIso() }, { role: "assistant", text: res.provider === "local" ? "규칙 기반 생성" : `생성 (${res.model})`, at: nowIso() }], dirty: false };
      const d = useStore.getState().doc;
      const others = d.drafts.filter((x) => x.class === s.class && x.no !== s.no && x.text).map((x) => ({ text: x.text, label: `${x.no}번` }));
      const review = reviewText(w.text, w.sentences, { target, lengthMode: d.settings.lengthMode, level: s.level, recordCount: recs.length, lowRecordThreshold: d.settings.lowRecordThreshold, otherDrafts: others, similarityThreshold: d.settings.similarityThreshold, studentName: s.name });
      saveDraft(makeDraft(s, w, review, prev));
      workingCache.delete(keyOf(s));
      setState((x) => ({ ...x, [s.no]: { st: "done" } }));
    } catch (e) { setState((x) => ({ ...x, [s.no]: { st: "error", msg: e instanceof Error ? e.message : "실패" } })); }
  };

  const runAll = async () => {
    const targets = students.filter((s) => sel.has(s.no));
    if (!targets.length) { toast({ text: "선택된 학생이 없음" }); return; }
    setRunning(true); stopRef.current = false;
    for (const s of targets) { if (stopRef.current) break; await runOne(s); }
    setRunning(false);
    toast({ text: "일괄 생성 완료" });
  };

  const allSel = students.length > 0 && students.every((s) => sel.has(s.no));
  const doneCount = Object.values(state).filter((x) => x.st === "done").length;

  return (
    <div className="content">
      <div className="flex" style={{ marginBottom: 12 }}>
        <span className="muted">선택 <b className="num">{sel.size}</b>명</span>
        <span className="flex small muted">일괄 목표 <input type="number" className="num" style={{ width: 70, height: 30 }} value={target} onChange={(e) => setSettings((s) => ({ ...s, targetLength: { ...s.targetLength, "세특": Number(e.target.value) || 0 } }))} />자</span>
        <Switch on={overwrite} onChange={setOverwrite} label="저장된 초안 덮어쓰기" />
        <span className="grow" />
        <button className="btn" onClick={() => setPerfPanel(true)}>수행평가 일괄 등록</button>
        {running ? <button className="btn warn" onClick={() => { stopRef.current = true; }}>중지</button> : <button className="btn primary" onClick={runAll} disabled={!sel.size}>일괄 생성</button>}
      </div>
      {running && <div className="prog" style={{ marginBottom: 12 }}><i style={{ width: `${(doneCount / Math.max(1, sel.size)) * 100}%` }} /></div>}
      {students.length === 0 ? <Empty title="명단 없음" /> : (
        <table className="table">
          <thead><tr>
            <th style={{ width: 40 }}><input type="checkbox" className="checkbox" checked={allSel} onChange={() => setSel(allSel ? new Set() : new Set(students.map((s) => s.no)))} /></th>
            <th style={{ width: 56 }}>번호</th><th style={{ width: 100 }}>이름</th><th style={{ width: 56 }}>수준</th><th style={{ width: 120 }}>누가기록</th><th style={{ width: 90 }}>수행평가</th><th>초안</th><th style={{ width: 90 }}>글자수</th><th style={{ width: 110 }}>상태</th>
          </tr></thead>
          <tbody>
            {students.map((s) => {
              const recs = recordsOf(doc, s.class, s.no); const d = draftOf(doc, s.class, s.no); const perfs = perfsOf(doc, s.class, s.no); const st = state[s.no];
              return (
                <tr key={s.no} className={`row ${sel.has(s.no) ? "selected" : ""}`} onDoubleClick={() => { select({ class: s.class, no: s.no }); setMode("individual"); }}>
                  <td onClick={(e) => e.stopPropagation()}><input type="checkbox" className="checkbox" checked={sel.has(s.no)} onChange={() => setSel((x) => { const n = new Set(x); n.has(s.no) ? n.delete(s.no) : n.add(s.no); return n; })} /></td>
                  <td className="num key">{s.no}</td>
                  <td className="key">{s.name}</td>
                  <td><LevelBadge level={s.level} student={s} /></td>
                  <td><span className="flex" style={{ gap: 4 }}><span className="num">{recs.length}</span>{recs.slice(0, 8).map((r) => <span key={r.id} className={`dot c${r.category}`} />)}</span></td>
                  <td>{perfs.length ? <span className="chip perf">등록 {perfs.length}</span> : <span className="muted small">미등록</span>}</td>
                  <td onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
                    <EditableCell value={d?.text ? truncate(d.text, 80) : ""} placeholder="—" onSave={(v) => { if (!d) return; const w: Working = { text: v, sentences: resplit(d.sentences, v), history: d.history, dirty: false }; const others = doc.drafts.filter((x) => x.class === s.class && x.no !== s.no && x.text).map((x) => ({ text: x.text, label: `${x.no}번` })); const review = reviewText(v, w.sentences, { target, lengthMode: doc.settings.lengthMode, level: s.level, recordCount: recs.length, lowRecordThreshold: doc.settings.lowRecordThreshold, otherDrafts: others, similarityThreshold: doc.settings.similarityThreshold, studentName: s.name }); saveDraft(makeDraft(s, w, review, d)); }} />
                  </td>
                  <td>{d?.text ? <LenBar len={d.length} target={d.targetLength || target} /> : <span className="muted">—</span>}</td>
                  <td>
                    {st?.st === "running" ? <span className="flex small"><span className="spin" />생성 중</span>
                      : st?.st === "error" ? <span className="flex small" style={{ color: "var(--warn)" }}>{st.msg} <button className="btn sm" onClick={() => runOne(s)}>재시도</button></span>
                      : d?.text ? (d.review.result === "check" || d.review.result === "fix" ? <StatusChip result={d.review.result} /> : <span className="chip pass">✓ 완료</span>)
                      : <span className="chip none">대기</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {perfPanel && <PerfBatchPanel onClose={() => setPerfPanel(false)} />}
    </div>
  );
}

/* ---------------- 수행평가 일괄 등록 ---------------- */

interface PerfCandidate { name: string; file: string; ocr: string; no: number | null; excerpt: string }

function PerfBatchPanel({ onClose }: { onClose: () => void }) {
  const doc = useStore((s) => s.doc);
  const cls = useStore((s) => s.cls);
  const students = useClassStudents();
  const addPerformance = useStore((s) => s.addPerformance);
  const toast = useStore((s) => s.toast);
  const [title, setTitle] = useState("탐구보고서");
  const [date, setDate] = useState(nowIso().slice(0, 10));
  const [items, setItems] = useState<PerfCandidate[]>([]);
  const [busy, setBusy] = useState<string>("");

  const match = (text: string, filename: string): number | null => {
    const hay = `${filename} ${text}`;
    for (const s of students) if (s.name && hay.includes(s.name)) return s.no;
    const m = hay.match(/(\d)(\d{2})(\d{2})/);
    if (m) { const c = `${m[1]}-${parseInt(m[2], 10)}`; const no = parseInt(m[3], 10); if (c === cls && students.some((s) => s.no === no)) return no; }
    const m2 = filename.match(/^(\d{1,2})[_\-\s.]/);
    if (m2) { const no = parseInt(m2[1], 10); if (students.some((s) => s.no === no)) return no; }
    return null;
  };

  const pick = async () => {
    const files = await pickFile("image/*,.pdf", true);
    if (!files.length) return;
    const out: PerfCandidate[] = [];
    for (const f of files) {
      setBusy(f.name);
      const url = await readFileAsDataUrl(f);
      const ocr = f.type.startsWith("image/") ? await tryOcr(url) : "";
      out.push({ name: f.name, file: url, ocr, no: match(ocr, f.name), excerpt: truncate(ocr.replace(/\s+/g, " "), 120) });
      setItems([...items, ...out]);
    }
    setBusy("");
  };
  const ready = items.filter((i) => i.no !== null);
  const register = () => {
    for (const i of ready) addPerformance({ class: cls, no: i.no!, title, date, file: i.file, ocrText: i.ocr, excerpt: i.excerpt, matched: true });
    toast({ text: `${ready.length}건 등록` }); onClose();
  };
  return (
    <Modal title={`수행평가 일괄 등록 · ${cls}`} onClose={onClose} width="wide" footer={<><span className="muted small">파일명에 이름 또는 학번(20315)이 있으면 자동 매칭. 이미지는 OCR 시도.</span><span className="grow" /><button className="btn" onClick={onClose}>취소</button><button className="btn primary" disabled={!ready.length} onClick={register}>{ready.length}건 등록</button></>}>
      <div className="col" style={{ gap: 12 }}>
        <div className="flex">
          <div className="field"><label>제목</label><input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="field"><label>날짜</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <span className="grow" />
          <button className="btn" onClick={pick} disabled={!!busy}>{busy ? <><span className="spin" /> {busy}</> : "파일 업로드"}</button>
        </div>
        {items.length > 0 && (
          <table className="table">
            <thead><tr><th style={{ width: 60 }}>미리보기</th><th>파일</th><th style={{ width: 180 }}>학생</th><th>발췌</th></tr></thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx}>
                  <td>{it.file.startsWith("data:image") ? <img src={it.file} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4 }} /> : <span className="chip outline">PDF</span>}</td>
                  <td className="small ellipsis" style={{ maxWidth: 200 }}>{it.name}</td>
                  <td>
                    <span className="flex">{it.no !== null ? <span style={{ color: "var(--accent)" }}>✓</span> : <span style={{ color: "var(--warn)" }}>!</span>}
                      <select className="select" style={{ height: 30 }} value={it.no ?? ""} onChange={(e) => setItems((xs) => xs.map((x, i) => i === idx ? { ...x, no: e.target.value ? Number(e.target.value) : null } : x))}>
                        <option value="">인식 실패 — 선택</option>{students.map((s) => <option key={s.no} value={s.no}>{s.no}번 {s.name}</option>)}
                      </select></span>
                  </td>
                  <td><EditableCell value={it.excerpt} placeholder="발췌 입력" onSave={(v) => setItems((xs) => xs.map((x, i) => i === idx ? { ...x, excerpt: v } : x))} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  );
}
