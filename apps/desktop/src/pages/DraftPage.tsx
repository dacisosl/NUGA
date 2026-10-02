import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ISSUE_LABEL, buildDraftRequest, countChars, schoolStyle, fmtMD, lessonLabel, nowIso, reviewText, uuid, splitSentences, truncate,
  type Draft, type DraftHistory, type DraftSentence, type NugaRecord, type Performance, type Student,
} from "@nuga/core";
import { ClassTabs, TopBar, useClassStudents } from "../App";
import { achievementOf, catCounts, guideOf, draftOf, fillLesson, isLowRecord, lengthOfText, limitOf, perfsOf, recordsOf, reviewCtxOf, studentsOf, unitOf, useStore } from "../store";
import { CatChip, Chip, Confirm, EditableCell, Empty, Icon, LenBar, Modal, StatusChip, StudentTag, Switch } from "../components/ui";
import { aiReady, generateDraft, labelDraft } from "../lib/ai";
import { pickFile } from "../lib/platform";
import { extractText, hasTextLayer, loadDocument, makeExcerpt, maskedThumb, scrubNames, suggestMasks, type DocPage, type ExtractProgress, type Rect } from "../lib/docOcr";
import { MaskEditor } from "../components/MaskEditor";
import { exportSheets } from "../lib/excel";
import { StudentEditModal } from "../components/StudentEdit";
import { DraftView, SpanLegend, SpanRatioBar, ViewToggles } from "../components/DraftView";

/* ---------------- 공통: 초안 만들기 ---------------- */

interface Working { text: string; sentences: DraftSentence[]; history: DraftHistory[]; dirty: boolean; target?: number; /** 이 작업본의 학생 키 */ owner?: string }
const workingCache = new Map<string, Working>();
/** 내용이 있는 기록만 초안 근거로 쓴다 (보완 전 빈 기록 제외) */
const hasText = (r: NugaRecord) => !!(r.note || r.memo || r.voiceMemo?.transcript || "").trim();
const keyOf = (s: Student) => `${s.class}-${s.no}`;

function useDraftReview(student: Student | null, text: string, sentences: DraftSentence[] | null, targetOverride?: number) {
  const doc = useStore((s) => s.doc);
  return useMemo(() => {
    if (!student) return null;
    const others = doc.drafts.filter((d) => d.class === student.class && d.no !== student.no && d.text).map((d) => ({ text: d.text, label: `${d.no}번` }));
    return reviewText(text, sentences, reviewCtxOf(doc, student, targetOverride || limitOf(doc), recordsOf(doc, student.class, student.no).filter((r) => r.status !== "skipped").length, others));
  }, [doc, student?.class, student?.no, text, sentences, targetOverride]);
}

async function runGenerate(student: Student, records: NugaRecord[], perfs: Performance[], w: Working, instruction: string | undefined) {
  const { doc } = useStore.getState();
  const req = buildDraftRequest({
    achievement: achievementOf(doc, student).value, targetLength: w.target || limitOf(doc), lengthMode: doc.settings.lengthMode, lengthBand: doc.settings.lengthBand,
    styleGuide: schoolStyle(doc.settings.schoolLevel).styleGuide, subject: doc.settings.school.subject,
    school: doc.settings.school,
    records, performances: perfs, categories: doc.settings.categories,
    draft: w.text || undefined, history: w.history, instruction,
  });
  return generateDraft(req, doc.settings.ai, { guide: guideOf(doc) });
}

function makeDraft(student: Student, w: Working, review: ReturnType<typeof reviewText>, prev?: Draft): Draft {
  const { doc } = useStore.getState();
  return {
    id: prev?.id || uuid(), class: student.class, no: student.no, field: "세특", text: w.text,
    length: lengthOfText(doc, w.text),
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
      rows: studentsOf(doc, c).map((s) => { const d = draftOf(doc, c, s.no); return { 번호: s.no, 이름: s.name, 누가기록: recordsOf(doc, c, s.no).length, 세특: d?.text || "", 글자수: d?.length || 0, 상태: d ? "완료" : "대기" }; }),
    }));
    if (await exportSheets(`세특초안-${nowIso().slice(0, 10)}.xlsx`, sheets)) toast({ text: "엑셀 내보내기 완료" });
  };
  return (
    <>
      <TopBar title="초안 작성" onExcel={exportExcel} right={<ViewToggles />} titleSlot={<span className="seg seg-title" role="tablist" aria-label="초안 작성 방식"><button role="tab" aria-selected={mode === "individual"} className={mode === "individual" ? "active" : ""} onClick={() => setMode("individual")}>개별</button><button role="tab" aria-selected={mode === "batch"} className={mode === "batch" ? "active" : ""} onClick={() => setMode("batch")}>일괄</button></span>} />
      <ClassTabs extra={(c) => { const n = studentsOf(doc, c).length; const d = doc.drafts.filter((x) => x.class === c && x.text).length; return <span className="cnt num">{d}/{n}</span>; }} />
      {mode === "individual" ? <Individual /> : <Batch />}
    </>
  );
}

/* ---------------- 개별 생성 ---------------- */

/** 한 학생의 초안 작업 상태와 동작. 개별 페이지와 일괄 모달이 함께 쓴다. */
function useDraftWorkspace(student: Student | null, opts?: { onGenerateStart?: () => void }) {
  const doc = useStore((s) => s.doc);
  const saveDraft = useStore((s) => s.saveDraft);
  const toast = useStore((s) => s.toast);
  const recs = useMemo(() => student ? recordsOf(doc, student.class, student.no).map((r) => fillLesson(doc, r)) : [], [doc, student]);
  const perfs = useMemo(() => student ? perfsOf(doc, student.class, student.no) : [], [doc, student]);
  const saved = student ? draftOf(doc, student.class, student.no) : undefined;

  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [w, setW] = useState<Working>({ text: "", sentences: [], history: [], dirty: false });
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [confirmA, setConfirmA] = useState(false);

  // 학생 바뀌면 작업본 로드 (캐시 → 저장본 → 빈 값)
  useEffect(() => {
    if (!student) return;
    const k = keyOf(student);
    const cached = workingCache.get(k);
    setW(cached ? { ...cached, owner: k } : { text: saved?.text || "", sentences: saved?.sentences || [], history: saved?.history || [], dirty: false, target: saved?.targetLength, owner: k });
    const evid = new Set(saved?.evidence || []);
    setChecked(new Set([...recs.filter((r) => r.status !== "skipped" && hasText(r) && (evid.size ? evid.has(r.id) : true)).map((r) => r.id), ...perfs.filter((p) => (evid.size ? evid.has(p.id) : true)).map((p) => p.id)]));
    setInput("");
  }, [student?.class, student?.no]);
  // 학생이 바뀌는 렌더에서는 w 가 아직 이전 학생 것이므로 주인이 같을 때만 기록한다
  useEffect(() => { if (student && w.owner === keyOf(student)) workingCache.set(w.owner, w); }, [w, student]);

  const target = w.target || limitOf(doc);
  const review = useDraftReview(student, w.text, w.sentences.length ? w.sentences : null, target);
  const len = lengthOfText(doc, w.text);
  const chars = countChars(w.text).withSpaces;
  const toggle = (id: string) => setChecked((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const generate = async (instruction?: string) => {
    if (!student || busy) return;
    const useRecs = recs.filter((r) => checked.has(r.id) && hasText(r));
    const usePerfs = perfs.filter((p) => checked.has(p.id));
    if (!useRecs.length && !usePerfs.length) { toast({ text: "체크된 기록이 없음" }); return; }
    setBusy(true); opts?.onGenerateStart?.();
    const msg = instruction || (w.text ? "초안을 다시 만들어줘" : "체크한 기록으로 세특 만들어줘");
    const history: DraftHistory[] = [...w.history, { role: "user", text: msg, at: nowIso() }];
    setW((x) => ({ ...x, history }));
    try {
      const res = await runGenerate(student, useRecs, usePerfs, { ...w, history: history.slice(0, -1) }, instruction);
      const base = res.provider === "rules" ? "규칙 기반으로 초안을 갱신함 (AI 꺼짐)" : `초안을 갱신함 (${res.model})`;
      const note = res.checks?.length ? `${base}\n확인 필요:\n${res.checks.map((c) => `· ${c}`).join("\n")}` : base;
      setW((x) => ({ text: res.text, sentences: res.sentences, history: [...history, { role: "assistant", text: note, at: nowIso() }], dirty: true, target: x.target, owner: x.owner }));
    } catch (e) {
      setW((x) => ({ ...x, history: [...history, { role: "assistant", text: `실패: ${e instanceof Error ? e.message : String(e)}`, at: nowIso() }] }));
    } finally { setBusy(false); setInput(""); }
  };

  const doSave = () => {
    if (!student || !review) return;
    saveDraft(makeDraft(student, w, review, saved));
    workingCache.set(keyOf(student), { ...w, dirty: false, owner: keyOf(student) });
    setW((x) => ({ ...x, dirty: false }));
    toast({ text: `${student.name} 초안 저장 · ${len.toLocaleString("ko-KR")}${unitOf(doc)}` });
  };
  /** 바로 저장했으면 true, 확인이 필요하면(수준 A·미달) false */
  const save = (): boolean => {
    if (!student || !review) return false;
    if (review.issues.some((i) => i.kind === "levelA")) { setConfirmA(true); return false; }
    doSave(); return true;
  };
  const onTextEdit = (t: string) => setW((x) => ({ ...x, text: t, sentences: resplit(x.sentences, t), dirty: true }));

  const [labeling, setLabeling] = useState(false);
  /** AI 로 학생활동·역량·평가를 다시 나눈다 (근거 연결은 그대로) */
  const relabel = async () => {
    if (!w.text.trim() || labeling) return;
    const parts = splitSentences(w.text);
    setLabeling(true);
    try {
      const spans = await labelDraft(parts, doc.settings.ai);
      setW((x) => ({ ...x, dirty: true, sentences: parts.map((t, i) => { const old = x.sentences.find((s0) => s0.text === t); return { text: t, evidence: old?.evidence || [], spans: spans[i] }; }) }));
      const failed = spans.filter((sp) => !sp).length;
      toast({ text: failed ? `AI 구별 완료 · ${failed}문장은 규칙으로 표시` : "AI로 다시 구별함" });
    } catch (e) { toast({ text: e instanceof Error ? e.message : "구별 실패" }); }
    finally { setLabeling(false); }
  };

  return { doc, recs, perfs, saved, checked, toggle, w, setW, busy, input, setInput, confirmA, setConfirmA, target, review, len, chars, generate, doSave, save, onTextEdit, relabel, labeling };
}

const SUGGESTIONS = ["체크한 기록으로 세특 만들어줘", "협동 부분 줄이고 질문 쪽을 강조해줘", "더 간결하게 줄여줘", "마지막 문장 다시 써줘"];

function Individual() {
  const doc = useStore((s) => s.doc);
  const cls = useStore((s) => s.cls);
  const students = useClassStudents();
  const selected = useStore((s) => s.selected);
  const select = useStore((s) => s.select);
  const toast = useStore((s) => s.toast);

  const student = useMemo(() => students.find((s) => selected && s.class === selected.class && s.no === selected.no) || students[0] || null, [students, selected]);
  useEffect(() => { if (student && (!selected || selected.class !== cls)) select({ class: student.class, no: student.no }); }, [student?.class, student?.no, cls]);

  const [expanded, setExpanded] = useState(false);
  const [dockH, setDockH] = useState(360);
  const [addPerf, setAddPerf] = useState(false);
  const [editStu, setEditStu] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const { recs, perfs, checked, toggle, w, setW, busy, input, setInput, confirmA, setConfirmA, target, review, len, chars, generate, doSave, save, onTextEdit, relabel, labeling } = useDraftWorkspace(student, { onGenerateStart: () => setExpanded(true) });
  const view = useStore((s) => s.view);
  const [editView, setEditView] = useState(false);
  const aiOn = aiReady(doc.settings.ai);

  // 명단에서 ↑↓ 키로 학생 이동 (입력란에 포커스가 있을 때는 제외)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (document.querySelector(".overlay")) return;
      const i = students.findIndex((s) => student && s.no === student.no);
      const n = students[i + (e.key === "ArrowDown" ? 1 : -1)];
      if (n) { e.preventDefault(); select({ class: n.class, no: n.no }); document.querySelector(`[data-stu="${n.no}"]`)?.scrollIntoView({ block: "nearest" }); }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [students, student, select]);
  useEffect(() => { logRef.current?.scrollTo({ top: 1e9 }); }, [w.history.length, expanded]);

  if (!student) return <div className="content"><Empty title="명단 없음" desc="설정 → 반·명단에서 학생을 등록하세요" /></div>;
  const counts = catCounts(recs);
  const suggestions = SUGGESTIONS;

  return (
    <div className="content noscroll">
      <div className="draft-layout">
        <div className="stulist">
          {students.map((s) => {
            const d = draftOf(doc, s.class, s.no); const low = isLowRecord(doc, s.class, s.no);
            const cache = workingCache.get(keyOf(s));
            return (
              <button key={s.no} data-stu={s.no} className={`stu ${s.no === student.no ? "active" : ""}`} onClick={() => select({ class: s.class, no: s.no })}>
                <span className="no num">{s.no}</span><span className="n"><StudentTag student={s} size="sm" /></span>
                {cache?.dirty ? <span className="dot" style={{ background: "var(--accent)" }} title="저장 안 됨" /> : d?.text ? <span style={{ color: "var(--accent)" }}>✓</span> : (achievementOf(doc, s).value ?? 0) >= 80 && low ? <span title="도달 정도 높음 · 기록 부족" style={{ color: "var(--warn)" }}><Icon name="warn" size={14} /></span> : null}
              </button>
            );
          })}
        </div>
        <div className="draft-main">
          <div className="draft-scroll">
            <div className="card profile">
              <StudentTag student={student} size="lg" />
              <div className="muted small">{student.class} · {student.no}번</div>
              <button className="btn sm" onClick={() => setEditStu(true)}><Icon name="pen" size={13} />번호·이름 수정</button>
              <div className="stats">
                {doc.settings.categories.map((c) => <Chip key={c.key} cat={c.key} label={`${c.label} ${counts[c.key]}`} />)}
                <Chip cat="perf" label={`PDF ${perfs.length}`} />
              </div>
            </div>
            <div className="card">
              {recs.length === 0 && <Empty title="기록 없음" />}
              {recs.map((r) => (
                <label key={r.id} className={`reccard ${checked.has(r.id) ? "" : "off"}`} style={{ cursor: "pointer" }}>
                  <input type="checkbox" className="checkbox" checked={checked.has(r.id)} onChange={() => toggle(r.id)} style={{ marginTop: 3 }} />
                  <div className="grow">
                    <div className="meta"><CatChip cat={r.category} /><span className="num">{fmtMD(r.time)}</span><span>{lessonLabel(r.lesson)}</span>{doc.settings.supplementEnabled && r.status === "pending" && <span className="chip pending">보완 전</span>}</div>
                    <div className="rc-text">{r.note || r.memo || r.voiceMemo?.transcript || <span className="muted">내용 없음</span>}</div>
                  </div>
                </label>
              ))}
              {perfs.map((p) => (
                <label key={p.id} className={`reccard ${checked.has(p.id) ? "" : "off"}`} style={{ cursor: "pointer" }}>
                  <input type="checkbox" className="checkbox" checked={checked.has(p.id)} onChange={() => toggle(p.id)} style={{ marginTop: 3 }} />
                  {p.file && <img src={p.file} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6, border: "1px solid var(--line)" }} />}
                  <div className="grow">
                    <div className="meta"><Chip cat="perf" label={p.title} /><span className="num">{p.date}</span></div>
                    <div className="rc-text">{p.excerpt || <span className="muted">발췌 없음</span>}</div>
                  </div>
                </label>
              ))}
              <div style={{ padding: "10px 16px" }}><button className="btn sm" onClick={() => setAddPerf(true)}><Icon name="plus" size={14} />PDF기록</button></div>
            </div>
          </div>

          <div className="chatdock" style={expanded ? { height: dockH } : undefined}>
            {expanded && <DragHandle onDrag={(dy) => setDockH((h) => Math.max(220, Math.min(window.innerHeight - 200, h - dy)))} />}
            <div className="bar">
              <button className="btn ghost sm" onClick={() => setExpanded(!expanded)}>{expanded ? "접기" : "펼치기"}</button>
              <LenBar len={len} target={target} mode={doc.settings.lengthMode} chars={chars} band={doc.settings.lengthBand} />
              <span className="flex small muted" title="이 학생의 분량 한도 (비우면 설정값)">목표 <input type="number" className="num" style={{ width: 66, height: 28 }} value={w.target ?? ""} placeholder={String(limitOf(doc))} onChange={(e) => setW((x) => ({ ...x, target: e.target.value ? Number(e.target.value) : undefined, dirty: true }))} />{unitOf(doc)}</span>
              {review && w.text && <StatusChip result={review.result} />}
              {view.highlight && w.text && <><SpanRatioBar text={w.text} sentences={w.sentences} /><SpanLegend /></>}
              {view.highlight && w.text && aiOn && <button className="btn ghost sm" onClick={relabel} disabled={labeling}>{labeling ? "구별 중" : "AI로 다시 구별"}</button>}
              {w.dirty && <span className="muted small">저장 안 됨</span>}
              <span className="grow" />
              {busy && <span className="spin" />}
              <button className="btn sm" disabled={!w.text} onClick={() => navigator.clipboard.writeText(w.text).then(() => toast({ text: "복사됨" }))}>복사</button>
              <button className="btn primary sm" disabled={!w.text} onClick={save}>저장</button>
            </div>
            {expanded && (
              <>
                {(view.split || view.highlight) && w.text && !editView
                  ? <DraftView className="draft dv-box" style={{ height: Math.max(90, dockH * 0.42) }} text={w.text} sentences={w.sentences} split={view.split} highlight={view.highlight} showEvidence onClick={() => setEditView(true)} />
                  : <textarea className="draft" style={{ height: Math.max(90, dockH * 0.42) }} value={w.text} autoFocus={editView} onBlur={() => setEditView(false)} onChange={(e) => onTextEdit(e.target.value)} placeholder="초안이 여기에 표시됩니다. 직접 편집할 수 있습니다." />}
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
      {editStu && <StudentEditModal student={student} onClose={() => setEditStu(false)} onSaved={(s, oldNo) => {
        const oldKey = `${s.class}-${oldNo}`; const w0 = workingCache.get(oldKey);
        if (w0 && oldNo !== s.no) { workingCache.delete(oldKey); workingCache.set(keyOf(s), { ...w0, owner: keyOf(s) }); }
        select({ class: s.class, no: s.no });
      }} />}
    </div>
  );
}


/* ---------------- 일괄 → 모달: 초안 편집에 집중한 화면 ---------------- */

function DraftModal({ students, startNo, onClose }: { students: Student[]; startNo: number; onClose: () => void }) {
  const select = useStore((s) => s.select);
  const setMode = useStore((s) => s.setMode2p);
  const toast = useStore((s) => s.toast);
  const [no, setNo] = useState(startNo);
  const student = students.find((s) => s.no === no) || null;
  const idx = students.findIndex((s) => s.no === no);
  const ws = useDraftWorkspace(student);
  const { doc, recs, perfs, checked, toggle, w, setW, busy, input, setInput, confirmA, setConfirmA, target, review, len, chars, generate, doSave, save, onTextEdit, relabel, labeling } = ws;
  const view = useStore((s) => s.view);
  const [editView, setEditView] = useState(false);
  const aiOn = aiReady(doc.settings.ai);
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => { logRef.current?.scrollTo({ top: 1e9 }); }, [w.history.length, no]);

  const [nextAfterConfirm, setNextAfterConfirm] = useState(false);
  const go = (d: number) => { const n = students[idx + d]; if (n) setNo(n.no); };
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); if (w.text) save(); return; }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (document.querySelectorAll(".overlay").length > 1) return;
      e.preventDefault(); go(e.key === "ArrowDown" ? 1 : -1);
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  });

  if (!student) return null;
  const openPage = () => { select({ class: student.class, no: student.no }); setMode("individual"); onClose(); };
  const saveNext = () => { if (save()) go(1); else setNextAfterConfirm(true); };
  const issues = (review?.issues || []).filter((i) => i.kind !== "empty");
  const usedCount = recs.filter((r) => checked.has(r.id) && hasText(r)).length + perfs.filter((p) => checked.has(p.id)).length;

  return (
    <Modal onClose={onClose} width="xl" header={
      <div className="flex dm-head">
        <span className="flex" style={{ gap: 2 }}>
          <button className="btn ghost icon sm" disabled={idx <= 0} onClick={() => go(-1)} aria-label="이전 학생"><Icon name="left" size={14} /></button>
          <span className="num muted small">{idx + 1} / {students.length}</span>
          <button className="btn ghost icon sm" disabled={idx >= students.length - 1} onClick={() => go(1)} aria-label="다음 학생"><Icon name="right" size={14} /></button>
        </span>
        <span className="num dm-no">{student.no}</span>
        <StudentTag student={student} size="lg" />
        {w.dirty && <span className="chip check">저장 안 됨</span>}
        <span className="grow" />
        <ViewToggles />
        <button className="btn sm" onClick={openPage}>개별 페이지로 열기</button>
      </div>
    } footer={
      <>
        <span className="muted small"><span className="kbd">↑</span><span className="kbd">↓</span> 학생 이동 · <span className="kbd">Ctrl</span>+<span className="kbd">S</span> 저장</span>
        <span className="grow" />
        <button className="btn" disabled={!w.text} onClick={() => navigator.clipboard.writeText(w.text).then(() => toast({ text: "복사됨" }))}>복사</button>
        <button className="btn" disabled={!w.text} onClick={save}>저장</button>
        <button className="btn primary" disabled={!w.text || idx >= students.length - 1} onClick={saveNext}>저장 후 다음</button>
      </>
    }>
      <div className="dm-body">
        <div className="dm-left">
          <div className="flex dm-bar">
            <LenBar len={len} target={target} mode={doc.settings.lengthMode} chars={chars} band={doc.settings.lengthBand} />
            <span className="flex small muted" title="이 학생의 분량 한도 (비우면 설정값)">목표 <input type="number" className="num" style={{ width: 66, height: 28 }} value={w.target ?? ""} placeholder={String(limitOf(doc))} onChange={(e) => setW((x) => ({ ...x, target: e.target.value ? Number(e.target.value) : undefined, dirty: true }))} />{unitOf(doc)}</span>
            {review && w.text && <StatusChip result={review.result} />}
            {view.highlight && w.text && <SpanRatioBar text={w.text} sentences={w.sentences} />}
            <span className="grow" />
            {view.highlight && w.text && <SpanLegend />}
            {view.highlight && w.text && aiOn && <button className="btn ghost sm" onClick={relabel} disabled={labeling}>{labeling ? "구별 중" : "AI로 다시 구별"}</button>}
            {busy && <span className="flex small muted"><span className="spin" />생성 중</span>}
          </div>
          {(view.split || view.highlight) && w.text && !editView
            ? <DraftView className="dm-draft dv-box" text={w.text} sentences={w.sentences} split={view.split} highlight={view.highlight} showEvidence onClick={() => setEditView(true)} />
            : <textarea className="dm-draft" value={w.text} autoFocus={editView} onBlur={() => setEditView(false)} onChange={(e) => onTextEdit(e.target.value)} placeholder="아직 초안이 없습니다. 아래에서 AI에게 요청하거나 여기에 직접 쓰세요." />}
          {issues.length > 0 && (
            <div className="dm-issues">
              {issues.slice(0, 5).map((i, k) => <span key={k} className={`chip ${["forbidden", "similar", "noEvidence", "name"].includes(i.kind) ? "fix" : "check"}`} title={i.span || ""}>{ISSUE_LABEL[i.kind]} · {truncate(i.message, 28)}</span>)}
              {issues.length > 5 && <span className="muted small">외 {issues.length - 5}건</span>}
            </div>
          )}
          <div className="dm-chat">
            <div className="chatlog" ref={logRef}>
              {w.history.length === 0 && <span className="muted small">요청을 쓰면 AI가 전체 초안을 다시 써 줍니다. 편집한 내용도 함께 전달됩니다.</span>}
              {w.history.map((h, i) => <div key={i} className={`msg ${h.role}`}>{h.text}</div>)}
            </div>
            <div className="suggest">{SUGGESTIONS.map((x) => <button key={x} className="chip outline clickable" onClick={() => generate(x)} disabled={busy}>{x}</button>)}</div>
            <div className="inputbar">
              <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={w.text ? "예: 두 번째 문장을 더 구체적으로" : "예: 체크한 기록으로 세특 만들어줘"} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing && input.trim()) generate(input.trim()); }} disabled={busy} />
              <button className="btn primary" disabled={busy} onClick={() => generate(input.trim() || undefined)}>{w.text ? "AI 수정" : "AI 생성"}</button>
            </div>
          </div>
        </div>
        <aside className="dm-right">
          <div className="flex between dm-right-h"><b>기록</b><span className="muted small">사용 {usedCount}건</span></div>
          <div className="dm-recs">
            {recs.length === 0 && perfs.length === 0 && <div className="muted small" style={{ padding: 12 }}>기록 없음</div>}
            {recs.map((r) => {
              const text = r.note || r.memo || r.voiceMemo?.transcript || "";
              return (
                <label key={r.id} className={`dm-rec ${checked.has(r.id) ? "" : "off"}`} title={`${fmtMD(r.time)} ${lessonLabel(r.lesson)}\n${text}`}>
                  <input type="checkbox" className="checkbox" checked={checked.has(r.id)} onChange={() => toggle(r.id)} disabled={!text} />
                  <CatChip cat={r.category} />
                  <span className="d num">{fmtMD(r.time)}</span>
                  <span className="t">{text || <span className="muted">내용 없음</span>}</span>
                </label>
              );
            })}
            {perfs.map((p) => (
              <label key={p.id} className={`dm-rec ${checked.has(p.id) ? "" : "off"}`} title={`${p.title}\n${p.excerpt}`}>
                <input type="checkbox" className="checkbox" checked={checked.has(p.id)} onChange={() => toggle(p.id)} />
                <Chip cat="perf" label="PDF" />
                <span className="t">{p.title}{p.excerpt ? ` · ${p.excerpt}` : ""}</span>
              </label>
            ))}
          </div>
          <div className="muted small" style={{ padding: "8px 12px" }}>체크한 기록만 AI 요청에 쓰입니다.</div>
        </aside>
      </div>
      {confirmA && <Confirm title="수준 A · 글자수 미달" body={`목표 ${target}자에 미달(${len}자)입니다. 기록이 부족한 상태로 저장할까요?`} okLabel={nextAfterConfirm ? "저장 후 다음" : "저장"} onOk={() => { doSave(); if (nextAfterConfirm) go(1); }} onClose={() => { setConfirmA(false); setNextAfterConfirm(false); }} />}
    </Modal>
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

/* ---------------- PDF기록 등록(개별) ---------------- */
/*
 * 흐름: 파일 선택 → 쪽 이미지로 펼치기 → [가리기] → 글자 뽑기(글자층 또는 OCR) → 이름 한 번 더 지우기 → 발췌 → 등록
 * 원본 파일은 저장하지 않는다. 저장하는 것은 가린 첫 쪽 축소 이미지와 뽑은 글자뿐이다.
 */

type OcrStage = "idle" | "loading" | "mask" | "extract" | "done";

function progressLabel(p: ExtractProgress | null): string {
  if (!p) return "";
  return p.stage === "text" ? `${p.page}/${p.pages}쪽 글자층 읽는 중` : `${p.page}/${p.pages}쪽 OCR ${Math.round(p.ratio * 100)}%`;
}

function PerfAddModal({ student, onClose }: { student: Student; onClose: () => void }) {
  const doc = useStore((s) => s.doc);
  const addPerformance = useStore((s) => s.addPerformance);
  const toast = useStore((s) => s.toast);
  const names = useMemo(() => doc.students.map((s) => s.name), [doc.students]);
  const [title, setTitle] = useState("탐구보고서");
  const [date, setDate] = useState(nowIso().slice(0, 10));
  const [fileName, setFileName] = useState("");
  const [pages, setPages] = useState<DocPage[] | null>(null);
  const [auto, setAuto] = useState<Rect[][]>([]);
  const [masks, setMasks] = useState<Rect[][] | null>(null);
  const [stage, setStage] = useState<OcrStage>("idle");
  const [prog, setProg] = useState<ExtractProgress | null>(null);
  const [text, setText] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [thumb, setThumb] = useState<string | null>(null);
  const [scrubbed, setScrubbed] = useState(0);
  const [err, setErr] = useState("");

  const pick = async () => {
    const [f] = await pickFile("application/pdf,.pdf,image/*");
    if (!f) return;
    setErr(""); setStage("loading"); setFileName(f.name); setText(""); setThumb(null); setMasks(null);
    try {
      const { pages: pg, truncated } = await loadDocument(f);
      if (truncated) toast({ text: "앞 10쪽까지만 처리합니다" });
      setPages(pg); setAuto(suggestMasks(pg, [...names, student.name])); setStage("mask");
    } catch (e) { setErr(`파일을 열 수 없음: ${e instanceof Error ? e.message : String(e)}`); setStage("idle"); }
  };
  const run = async (m: Rect[][]) => {
    if (!pages) return;
    setMasks(m); setStage("extract"); setProg(null);
    try {
      const raw = await extractText(pages, m, setProg);
      const s = scrubNames(raw, [...names, student.name]);
      setText(s.text); setScrubbed(s.count);
      setExcerpt((x) => x || makeExcerpt(s.text));
      setThumb(await maskedThumb(pages[0], m[0] || []));
      setStage("done");
    } catch (e) { setErr(`글자 추출 실패: ${e instanceof Error ? e.message : String(e)}`); setStage("done"); }
  };
  const save = () => {
    addPerformance({ class: student.class, no: student.no, title: title.trim() || "PDF기록", date, file: thumb, ocrText: text, excerpt: excerpt.trim(), matched: true });
    toast({ text: "PDF기록 등록" }); onClose();
  };
  const autoCount = auto.reduce((n, a) => n + a.length, 0);
  const maskCount = masks?.reduce((n, a) => n + a.length, 0) ?? 0;

  return (
    <>
      <Modal title={`PDF기록 · ${student.name}`} onClose={onClose} footer={<><span className="muted small">원본 파일은 저장되지 않습니다</span><span className="grow" /><button className="btn" onClick={onClose}>취소</button><button className="btn primary" onClick={save} disabled={stage === "loading" || stage === "extract" || stage === "mask"}>등록</button></>}>
        <div className="col" style={{ gap: 12 }}>
          <div className="grid2"><div className="field"><label>제목</label><input value={title} onChange={(e) => setTitle(e.target.value)} /></div><div className="field"><label>날짜</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div></div>
          <div className="ocr-steps">
            <span className={`st ${stage !== "idle" ? "done" : "cur"}`}>1 파일</span>
            <span className={`st ${masks ? "done" : stage === "mask" || stage === "loading" ? "cur" : ""}`}>2 가리기</span>
            <span className={`st ${stage === "done" ? "done" : stage === "extract" ? "cur" : ""}`}>3 글자 뽑기</span>
            <span className="grow" />
            <button className="btn sm" onClick={pick} disabled={stage === "loading" || stage === "extract"}>{fileName ? "다른 파일" : "PDF·이미지 선택"}</button>
            {pages && stage !== "loading" && stage !== "extract" && <button className="btn sm" onClick={() => setStage("mask")}>다시 가리기</button>}
          </div>
          {fileName && <div className="small muted">{fileName}{pages ? ` · ${pages.length}쪽` : ""}{masks ? ` · 가림 ${maskCount}곳` : ""}{scrubbed ? ` · 남은 이름 ${scrubbed}곳 ○○○ 처리` : ""}</div>}
          {stage === "loading" && <div className="flex small"><span className="spin" />쪽 이미지로 펼치는 중</div>}
          {stage === "extract" && <div className="flex small"><span className="spin" />{progressLabel(prog) || "준비 중"} <span className="muted">(처음 OCR은 한글 인식 데이터를 내려받느라 시간이 걸립니다)</span></div>}
          {err && <div className="small" style={{ color: "var(--warn)" }}>{err}</div>}
          {stage === "done" && (
            <div className="grid2" style={{ gridTemplateColumns: "160px 1fr", alignItems: "start" }}>
              {thumb ? <img src={thumb} alt="가린 첫 쪽" style={{ width: 160, borderRadius: 8, border: "1px solid var(--line)" }} /> : <span />}
              <div className="field"><label>뽑은 글자 (고칠 수 있음)</label><textarea rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder="뽑은 글자가 없습니다. 직접 입력할 수 있습니다." /></div>
            </div>
          )}
          <div className="field"><label>발췌 (초안에 쓰이는 내용)</label><textarea rows={3} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} placeholder="예: 생활 속 산화·환원 반응 — 철의 부식과 방지 방법 조사" /></div>
        </div>
      </Modal>
      {stage === "mask" && pages && (
        <MaskEditor title={fileName} pages={pages} initial={masks ?? auto} autoCount={autoCount}
          onCancel={() => { setStage(masks ? "done" : "idle"); if (!masks) { setPages(null); setFileName(""); } }}
          onConfirm={run} />
      )}
    </>
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
  const [modalNo, setModalNo] = useState<number | null>(null);
  const view = useStore((s) => s.view);
  // 초안 칸 행 높이: 자동(전체 글이 보이게) / 고정(N줄, 넘치면 칸 안에서 스크롤)
  const [rowMode, setRowMode] = useState<"auto" | "fixed">(() => { try { return localStorage.getItem("nuga.batchRowMode") === "fixed" ? "fixed" : "auto"; } catch { return "auto"; } });
  const [rowLines, setRowLines] = useState<number>(() => { try { return Number(localStorage.getItem("nuga.batchRowLines")) || 3; } catch { return 3; } });
  useEffect(() => { try { localStorage.setItem("nuga.batchRowMode", rowMode); localStorage.setItem("nuga.batchRowLines", String(rowLines)); } catch { /* 보기 설정 저장 실패는 무시 */ } }, [rowMode, rowLines]);
  // 누가기록·PDF기록 열 접기 (보기 설정이라 이 기기에만 저장)
  const [fold, setFold] = useState<{ recs: boolean; perfs: boolean }>(() => {
    try { return { recs: false, perfs: false, ...JSON.parse(localStorage.getItem("nuga.batchFold") || "{}") }; } catch { return { recs: false, perfs: false }; }
  });
  const toggleFold = (k: "recs" | "perfs") => setFold((f) => {
    const n = { ...f, [k]: !f[k] };
    try { localStorage.setItem("nuga.batchFold", JSON.stringify(n)); } catch { /* 저장 못 해도 동작에는 지장 없음 */ }
    return n;
  });
  const foldHead = (k: "recs" | "perfs", label: string) => (
    <button type="button" className="fold-th" onClick={() => toggleFold(k)} title={fold[k] ? `${label} 펼치기` : `${label} 접기`} aria-expanded={!fold[k]}>
      {fold[k] ? <Icon name="right" size={12} /> : <Icon name="left" size={12} />}{!fold[k] && <span>{label}</span>}
    </button>
  );
  const stopRef = useRef(false);
  const target = limitOf(doc);

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
      const w: Working = { text: res.text, sentences: res.sentences, history: [{ role: "user", text: "일괄 생성", at: nowIso() }, { role: "assistant", text: res.provider === "rules" ? "규칙 기반 생성" : `생성 (${res.model})`, at: nowIso() }], dirty: false };
      const d = useStore.getState().doc;
      const others = d.drafts.filter((x) => x.class === s.class && x.no !== s.no && x.text).map((x) => ({ text: x.text, label: `${x.no}번` }));
      const review = reviewText(w.text, w.sentences, reviewCtxOf(d, s, target, recs.length, others));
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
        <span className="flex small muted" title="초안 칸의 행 높이">행 높이
          <span className="seg"><button className={rowMode === "auto" ? "active" : ""} onClick={() => setRowMode("auto")}>전체 보기</button><button className={rowMode === "fixed" ? "active" : ""} onClick={() => setRowMode("fixed")}>고정</button></span>
          {rowMode === "fixed" && <select className="select" style={{ height: 30 }} value={rowLines} onChange={(e) => setRowLines(Number(e.target.value))}>{[1, 2, 3, 4, 5, 6, 8].map((n) => <option key={n} value={n}>{n}줄</option>)}</select>}
        </span>
        <Switch on={overwrite} onChange={setOverwrite} label="저장된 초안 덮어쓰기" />
        <span className="grow" />
        <button className="btn" onClick={() => setPerfPanel(true)}>PDF기록 일괄 등록</button>
        {running ? <button className="btn warn" onClick={() => { stopRef.current = true; }}>중지</button> : <button className="btn primary" onClick={runAll} disabled={!sel.size}>일괄 생성</button>}
      </div>
      {running && <div className="prog" style={{ marginBottom: 12 }}><i style={{ width: `${(doneCount / Math.max(1, sel.size)) * 100}%` }} /></div>}
      {students.length === 0 ? <Empty title="명단 없음" /> : (
        <table className="table">
          <thead><tr>
            <th style={{ width: 40 }}><input type="checkbox" className="checkbox" checked={allSel} onChange={() => setSel(allSel ? new Set() : new Set(students.map((s) => s.no)))} /></th>
            <th style={{ width: 56 }}>번호</th><th style={{ width: 130 }}>이름</th><th className={`foldable ${fold.recs ? "folded" : ""}`} style={{ width: fold.recs ? 44 : 120 }}>{foldHead("recs", "누가기록")}</th><th className={`foldable ${fold.perfs ? "folded" : ""}`} style={{ width: fold.perfs ? 44 : 90 }}>{foldHead("perfs", "PDF기록")}</th><th>초안</th><th style={{ width: 90 }}>글자수</th><th style={{ width: 110 }}>상태</th>
          </tr></thead>
          <tbody>
            {students.map((s) => {
              const recs = recordsOf(doc, s.class, s.no); const d = draftOf(doc, s.class, s.no); const perfs = perfsOf(doc, s.class, s.no); const st = state[s.no];
              return (
                <tr key={s.no} className={`row ${sel.has(s.no) ? "selected" : ""}`} onDoubleClick={() => { select({ class: s.class, no: s.no }); setMode("individual"); }}>
                  <td onClick={(e) => e.stopPropagation()}><input type="checkbox" className="checkbox" checked={sel.has(s.no)} onChange={() => setSel((x) => { const n = new Set(x); n.has(s.no) ? n.delete(s.no) : n.add(s.no); return n; })} /></td>
                  <td className="num key">{s.no}</td>
                  <td className="key name"><StudentTag student={s} onNameClick={() => setModalNo(s.no)} title="이름: 초안 편집 창 열기" /></td>
                  <td className={fold.recs ? "folded-cell" : ""} title={fold.recs ? `누가기록 ${recs.length}건` : undefined}>{fold.recs ? <span className="num small">{recs.length}</span> : <span className="flex" style={{ gap: 4 }}><span className="num">{recs.length}</span>{recs.slice(0, 8).map((r) => <span key={r.id} className={`dot c${r.category}`} />)}</span>}</td>
                  <td className={fold.perfs ? "folded-cell" : ""} title={fold.perfs ? `PDF기록 ${perfs.length}건` : undefined}>{fold.perfs ? <span className="num small">{perfs.length || "–"}</span> : perfs.length ? <span className="chip perf">등록 {perfs.length}</span> : <span className="muted small">미등록</span>}</td>
                  <td className="draft-td" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                    <DraftCell text={d?.text || ""} sentences={d?.sentences} split={view.split} highlight={view.highlight} lines={rowMode === "fixed" ? rowLines : null} onSave={(v) => { if (!d) return; const w: Working = { text: v, sentences: resplit(d.sentences, v), history: d.history, dirty: false, target: d.targetLength }; const others = doc.drafts.filter((x) => x.class === s.class && x.no !== s.no && x.text).map((x) => ({ text: x.text, label: `${x.no}번` })); const review = reviewText(v, w.sentences, reviewCtxOf(doc, s, d.targetLength || target, recs.length, others)); saveDraft(makeDraft(s, w, review, d)); }} />
                  </td>
                  <td>{d?.text ? <LenBar len={d.length} target={d.targetLength || target} /> : <span className="muted">—</span>}</td>
                  <td>
                    {st?.st === "running" ? <span className="flex small"><span className="spin" />생성 중</span>
                      : st?.st === "error" ? <span className="flex small" style={{ color: "var(--warn)" }}>{st.msg} <button className="btn sm" onClick={() => runOne(s)}>재시도</button></span>
                      : workingCache.get(keyOf(s))?.dirty ? <span className="chip check">작성 중</span>
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
      {modalNo !== null && <DraftModal students={students} startNo={modalNo} onClose={() => setModalNo(null)} />}
    </div>
  );
}

/** 일괄 표의 초안 칸. lines 가 없으면 전체 글을 보여 행이 늘어나고, 있으면 그 줄 수로 고정하고 칸 안에서 스크롤한다.
 *  누르면 같은 크기의 여러 줄 편집칸으로 바뀌고, 칸 밖을 누르거나 Ctrl+Enter 로 저장, Esc 로 취소한다. */
function DraftCell({ text, sentences, split, highlight, lines, onSave }: { text: string; sentences?: DraftSentence[]; split: boolean; highlight: boolean; lines: number | null; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(text);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (!editing) setV(text); }, [text, editing]);
  useEffect(() => {
    const el = ref.current; if (!editing || !el) return;
    el.focus(); el.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);
  // 자동 모드에서는 편집칸 높이를 글에 맞춘다
  useEffect(() => { const el = ref.current; if (editing && el && !lines) { el.style.height = "auto"; el.style.height = `${el.scrollHeight + 2}px`; } }, [v, editing, lines]);
  const style = lines ? { maxHeight: `${lines * 1.6}em` } : undefined;
  if (!text && !editing) return <span className="muted">—</span>;
  if (!editing) return (
    <div>
      {split || highlight
        ? <DraftView className={`draft-cell ${lines ? "fixed" : ""}`} style={style} text={text} sentences={sentences} split={split} highlight={highlight} onClick={() => setEditing(true)} />
        : <div className={`draft-cell ${lines ? "fixed" : ""}`} style={style} onClick={() => setEditing(true)} title="눌러서 고치기">{text}</div>}
      {highlight && <SpanRatioBar text={text} sentences={sentences} compact />}
    </div>
  );
  const commit = () => { setEditing(false); if (v.trim() && v !== text) onSave(v.trim()); else setV(text); };
  return (
    <textarea ref={ref} className="draft-cell-edit" style={lines ? { height: `${lines * 1.6 + 0.9}em` } : undefined} value={v}
      onChange={(e) => setV(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Escape") { setV(text); setEditing(false); } if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(); } }} />
  );
}

/* ---------------- PDF기록 일괄 등록 ---------------- */

interface PerfCandidate {
  id: string; fileName: string; pages: DocPage[]; auto: Rect[][]; masks: Rect[][] | null;
  no: number | null; text: string; excerpt: string; thumb: string | null;
  status: "ready" | "extracting" | "done" | "error"; note: string; textLayer: boolean;
}

function PerfBatchPanel({ onClose }: { onClose: () => void }) {
  const doc = useStore((s) => s.doc);
  const cls = useStore((s) => s.cls);
  const students = useClassStudents();
  const addPerformance = useStore((s) => s.addPerformance);
  const toast = useStore((s) => s.toast);
  const names = useMemo(() => doc.students.map((s) => s.name), [doc.students]);
  const [title, setTitle] = useState("탐구보고서");
  const [date, setDate] = useState(nowIso().slice(0, 10));
  const [items, setItems] = useState<PerfCandidate[]>([]);
  const [loading, setLoading] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [prog, setProg] = useState<Record<string, string>>({});
  const patchItem = (id: string, p: Partial<PerfCandidate>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));

  /** 학생 찾기: 파일명 → PDF 글자층(메모리에서만 읽고 저장하지 않음) */
  const match = (filename: string, rawText: string): number | null => {
    const hay = `${filename} ${rawText}`;
    for (const s of students) if (s.name && hay.includes(s.name)) return s.no;
    const m = hay.match(/(\d)(\d{2})(\d{2})/);
    if (m) { const c = `${m[1]}-${parseInt(m[2], 10)}`; const no = parseInt(m[3], 10); if (c === cls && students.some((s) => s.no === no)) return no; }
    const m2 = filename.match(/^(\d{1,2})[_\-\s.]/);
    if (m2) { const no = parseInt(m2[1], 10); if (students.some((s) => s.no === no)) return no; }
    return null;
  };

  const pick = async () => {
    const files = await pickFile("application/pdf,.pdf,image/*", true);
    for (const f of files) {
      setLoading(f.name);
      try {
        const { pages } = await loadDocument(f);
        const raw = pages.map((p) => p.items.map((i) => i.str).join(" ")).join(" ");
        const auto = suggestMasks(pages, names);
        const textLayer = pages.some(hasTextLayer);
        setItems((xs) => [...xs, { id: uuid(), fileName: f.name, pages, auto, masks: null, no: match(f.name, raw), text: "", excerpt: "", thumb: null, status: "ready", note: "", textLayer }]);
      } catch (e) { toast({ text: `${f.name}: 열 수 없음` }); }
    }
    setLoading("");
  };

  const extractOne = async (it: PerfCandidate, masks: Rect[][]) => {
    patchItem(it.id, { masks, status: "extracting" });
    try {
      const raw = await extractText(it.pages, masks, (p) => setProg((x) => ({ ...x, [it.id]: progressLabel(p) })));
      const s = scrubNames(raw, names);
      const thumb = await maskedThumb(it.pages[0], masks[0] || []);
      patchItem(it.id, { text: s.text, excerpt: makeExcerpt(s.text), thumb, status: "done", note: s.count ? `남은 이름 ${s.count}곳 ○○○` : "" });
    } catch (e) { patchItem(it.id, { status: "error", note: e instanceof Error ? e.message : "실패" }); }
  };
  const extractAllAuto = async () => {
    for (const it of items.filter((x) => x.status === "ready")) await extractOne(it, it.auto);
  };

  const ready = items.filter((i) => i.no !== null && i.status === "done");
  const pending = items.filter((i) => i.status === "ready").length;
  const register = () => {
    for (const i of ready) addPerformance({ class: cls, no: i.no!, title, date, file: i.thumb, ocrText: i.text, excerpt: i.excerpt, matched: true });
    toast({ text: `${ready.length}건 등록` }); onClose();
  };
  const cur = items.find((x) => x.id === editing);

  return (
    <>
      <Modal title={`PDF기록 일괄 등록 · ${cls}`} onClose={onClose} width="wide" footer={<><span className="muted small">파일명이나 PDF 속 이름·학번으로 학생을 찾습니다. 원본 파일은 저장되지 않습니다.</span><span className="grow" /><button className="btn" onClick={onClose}>취소</button><button className="btn primary" disabled={!ready.length} onClick={register}>{ready.length}건 등록</button></>}>
        <div className="col" style={{ gap: 12 }}>
          <div className="flex">
            <div className="field"><label>제목</label><input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div className="field"><label>날짜</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <span className="grow" />
            <button className="btn" onClick={pick} disabled={!!loading}>{loading ? <><span className="spin" /> {loading}</> : "PDF·이미지 올리기"}</button>
            <button className="btn primary" onClick={extractAllAuto} disabled={!pending}>자동 가리기로 모두 뽑기 ({pending})</button>
          </div>
          {items.some((x) => x.status === "ready" && !x.textLayer) && <div className="small" style={{ color: "var(--warn)" }}>스캔본(글자층 없음)은 이름을 자동으로 찾지 못합니다. "가리기"로 직접 확인한 뒤 뽑으세요.</div>}
          {items.length > 0 && (
            <table className="table">
              <thead><tr><th style={{ width: 64 }}>미리보기</th><th style={{ width: 200 }}>파일</th><th style={{ width: 190 }}>학생</th><th>발췌</th><th style={{ width: 170 }}>가리기 · 추출</th></tr></thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td>{it.thumb ? <img src={it.thumb} alt="" style={{ width: 44, height: 56, objectFit: "cover", borderRadius: 4, border: "1px solid var(--line)" }} /> : <span className="chip outline">{it.pages.length}쪽</span>}</td>
                    <td className="small ellipsis" title={it.fileName}>{it.fileName}<div className="muted">{it.textLayer ? "글자층 있음" : "스캔본"} · 자동 {it.auto.reduce((n, a) => n + a.length, 0)}곳</div></td>
                    <td>
                      <span className="flex">{it.no !== null ? <span style={{ color: "var(--accent)" }}>✓</span> : <span style={{ color: "var(--warn)" }}>!</span>}
                        <select className="select" style={{ height: 30 }} value={it.no ?? ""} onChange={(e) => patchItem(it.id, { no: e.target.value ? Number(e.target.value) : null })}>
                          <option value="">학생 선택</option>{students.map((s) => <option key={s.no} value={s.no}>{s.no}번 {s.name}</option>)}
                        </select></span>
                    </td>
                    <td className="content">{it.status === "done" ? <EditableCell value={it.excerpt} placeholder="발췌 입력" onSave={(v) => patchItem(it.id, { excerpt: v })} /> : <span className="muted small">{it.status === "extracting" ? prog[it.id] || "뽑는 중" : it.status === "error" ? it.note : "가리기 후 뽑기"}</span>}{it.note && it.status === "done" && <div className="muted small">{it.note}</div>}</td>
                    <td>
                      <span className="flex">
                        {it.status === "extracting" ? <span className="spin" /> : <>
                          <button className="btn sm" onClick={() => setEditing(it.id)}>{it.masks ? "다시 가리기" : "가리기"}</button>
                          {it.status !== "done" && <button className="btn sm ghost" onClick={() => extractOne(it, it.auto)} title="자동으로 찾은 곳만 가리고 뽑기">자동</button>}
                        </>}
                        {it.status === "done" && <span className="chip pass">✓</span>}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Modal>
      {cur && (
        <MaskEditor title={cur.fileName} pages={cur.pages} initial={cur.masks ?? cur.auto} autoCount={cur.auto.reduce((n, a) => n + a.length, 0)}
          onCancel={() => setEditing(null)} onConfirm={(m) => { setEditing(null); extractOne(cur, m); }} />
      )}
    </>
  );
}
