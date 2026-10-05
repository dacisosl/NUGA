import React, { useEffect, useMemo, useState } from "react";
import { ISSUE_LABEL, RESULT_LABEL, countChars, nowIso, reviewText, splitSentences, summarize, truncate, type Draft, type ReviewIssue, type ReviewResult, type Student } from "@nuga/core";
import { ClassTabs, Sheet, TopBar, useClassStudents } from "../App";
import { adherenceOf, draftOf, lengthOfText, limitOf, recordsOf, reviewCtxOf, studentsOf, useStore } from "../store";
import { AdherenceChecklist, CategoryCompare, MetricBars, SemesterTimeline, SentenceEvidenceGraph } from "../components/Charts";
import { Empty, Icon, LenBar, StatusChip, StudentTag } from "../components/ui";
import { exportSheets } from "../lib/excel";
import { DraftView, ViewToggles } from "../components/DraftView";
import { AdherenceChip } from "./DraftPage";

type Row = { s: Student; d: Draft | undefined; result: ReviewResult };

export function ReviewPage({ tabs }: { tabs?: React.ReactNode }) {
  const doc = useStore((s) => s.doc);
  const cls = useStore((s) => s.cls);
  const students = useClassStudents();
  const saveDraft = useStore((s) => s.saveDraft);
  const setPage = useStore((s) => s.setPage);
  const select = useStore((s) => s.select);
  const setMode2p = useStore((s) => s.setMode2p);
  const toast = useStore((s) => s.toast);
  const view = useStore((s) => s.view);
  const [filter, setFilter] = useState<ReviewResult | "all">("all");
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [cur, setCur] = useState<number | null>(null);
  const target = limitOf(doc);

  useEffect(() => { setSel(new Set()); setCur(null); }, [cls]);

  const rows: Row[] = useMemo(() => students.map((s) => { const d = draftOf(doc, s.class, s.no); return { s, d, result: d?.text ? d.review.result : "none" }; }), [students, doc]);
  const counts = useMemo(() => { const c: Record<ReviewResult, number> = { pass: 0, check: 0, fix: 0, none: 0 }; rows.forEach((r) => c[r.result]++); return c; }, [rows]);
  const visible = rows.filter((r) => filter === "all" || r.result === filter);

  const reviewOne = (s: Student, d: Draft): Draft => {
    const others = doc.drafts.filter((x) => x.class === s.class && x.no !== s.no && x.text).map((x) => ({ text: x.text, label: `${x.no}번` }));
    const r = reviewText(d.text, d.sentences.length ? d.sentences : null, reviewCtxOf(doc, s, d.targetLength || target, recordsOf(doc, s.class, s.no).filter((x) => x.status !== "skipped").length, others));
    return { ...d, review: { result: r.result, issues: r.issues, at: nowIso() }, adherence: adherenceOf(doc, s, d.text, d.sentences.length ? d.sentences : null, d.targetLength || target) };
  };
  const runReview = () => {
    const targets = rows.filter((r) => r.d?.text && (sel.size === 0 || sel.has(r.s.no)));
    targets.forEach((r) => saveDraft(reviewOne(r.s, r.d!)));
    toast({ text: `검토 완료 · ${targets.length}명` });
  };

  const exportExcel = async () => {
    const sheets = Array.from(new Set(doc.students.map((s) => s.class))).sort().map((c) => ({
      name: c, widths: [8, 10, 6, 90, 8, 10, 40],
      rows: studentsOf(doc, c).map((s) => { const d = draftOf(doc, c, s.no); return { 번호: s.no, 이름: s.name, 세특: d?.text || "", 글자수: d?.length || 0, 상태: RESULT_LABEL[d?.text ? d.review.result : "none"], 문제: d?.review.issues.map((i) => i.message).join("; ") || "" }; }),
    }));
    if (await exportSheets(`세특검토-${nowIso().slice(0, 10)}.xlsx`, sheets)) toast({ text: "엑셀 내보내기 완료" });
  };

  const curRow = rows.find((r) => r.s.no === cur) || null;
  const goNext = () => { const i = visible.findIndex((r) => r.s.no === cur); const n = visible[(i + 1) % visible.length]; if (n) setCur(n.s.no); };
  const openDraft = (s: Student, instruction?: string) => { select({ class: s.class, no: s.no }); setMode2p("individual"); setPage("draft"); if (instruction) toast({ text: `요청 예: "${instruction}"`, ttl: 8000 }); };

  return (
    <>
      <TopBar title="생기부 검토" titleSlot={tabs} onExcel={exportExcel} right={<><ViewToggles /><button className="btn primary" onClick={runReview}><Icon name="check" />{sel.size ? `선택 ${sel.size}명 검토` : "전체 검토"}</button></>} />
      <Sheet>
      <ClassTabs extra={(c) => { const n = studentsOf(doc, c).filter((s) => { const d = draftOf(doc, c, s.no); return d?.text && d.review.result === "fix"; }).length; return n ? <span className="badge" style={{ marginLeft: 6 }}>{n}</span> : null; }} />
      <div className="content noscroll">
        <div className="review-layout">
          <div className="col" style={{ minHeight: 0 }}>
            <div className="flex wrap">
              <button className={`chip clickable ${filter === "all" ? "selected" : ""} outline`} onClick={() => setFilter("all")}>전체 {rows.length}</button>
              {(["pass", "check", "fix", "none"] as ReviewResult[]).map((r) => <button key={r} className={`chip clickable ${r} ${filter === r ? "selected" : ""}`} onClick={() => setFilter(filter === r ? "all" : r)}>{RESULT_LABEL[r]} {counts[r]}</button>)}
              <span className="grow" />
              <span className="muted small">행 클릭 → 우측 패널</span>
            </div>
            <div className="tablewrap grow" style={{ overflow: "auto" }}>
              {visible.length === 0 ? <Empty title="해당 없음" /> : (
                <table className="table">
                  <thead><tr><th style={{ width: 36 }}><input type="checkbox" className="checkbox" checked={visible.length > 0 && visible.every((r) => sel.has(r.s.no))} onChange={(e) => setSel(e.target.checked ? new Set(visible.map((r) => r.s.no)) : new Set())} /></th><th style={{ width: 50 }}>번호</th><th style={{ width: 120 }}>이름</th><th>세특</th><th style={{ width: 130 }}>분량</th><th style={{ width: 84 }}>반영도</th><th style={{ width: 110 }}>상태</th></tr></thead>
                  <tbody>
                    {visible.map(({ s, d, result }) => (
                      <tr key={s.no} className={`row ${cur === s.no ? "selected" : ""}`} onClick={() => setCur(s.no)}>
                        <td onClick={(e) => e.stopPropagation()}><input type="checkbox" className="checkbox" checked={sel.has(s.no)} onChange={() => setSel((x) => { const n = new Set(x); n.has(s.no) ? n.delete(s.no) : n.add(s.no); return n; })} /></td>
                        <td className="num key">{s.no}</td><td className="key name"><StudentTag student={s} /></td>
                        <td className="wrap">{d?.text ? (view.highlight || view.split ? <DraftView className={view.split ? "" : "review-preview"} text={d.text} sentences={d.sentences} split={view.split} highlight={view.highlight} /> : <div className="review-preview">{d.text}</div>) : <span className="muted">—</span>}</td>
                        <td>{d?.text ? <LenBar len={d.length} target={d.targetLength || target} mode={doc.settings.lengthMode} band={doc.settings.lengthBand} /> : ""}</td>
                        <td>{d?.text && d.adherence ? <AdherenceChip rep={d.adherence} /> : ""}</td>
                        <td><StatusChip result={result} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
          <div className="review-side">
            {!curRow ? <div className="card pad muted">행을 선택하면 문제 목록이 표시됩니다.</div> : <SidePanel row={curRow} target={curRow.d?.targetLength || target} onNext={goNext} onOpen={openDraft} onUpdate={(d) => saveDraft(reviewOne(curRow.s, d))} />}
          </div>
        </div>
      </div>
      </Sheet>
    </>
  );
}

function SidePanel({ row, target, onNext, onOpen, onUpdate }: { row: Row; target: number; onNext: () => void; onOpen: (s: Student, instruction?: string) => void; onUpdate: (d: Draft) => void }) {
  const doc = useStore((s) => s.doc);
  const [tab, setTab] = useState<"issues" | "charts">(() => { try { return (localStorage.getItem("nuga.reviewTab") as "issues" | "charts") || "issues"; } catch { return "issues"; } });
  const pickTab = (t: "issues" | "charts") => { setTab(t); try { localStorage.setItem("nuga.reviewTab", t); } catch { /* 무시 */ } };
  const [focus, setFocus] = useState<number[] | null>(null);
  const rep = useMemo(() => (row.d?.text ? adherenceOf(doc, row.s, row.d.text, row.d.sentences.length ? row.d.sentences : null, row.d.targetLength || target) : null), [doc, row.s, row.d, target]);
  const { s, d } = row;
  if (!d?.text) return <div className="card pad"><div className="flex"><StudentTag student={s} /><StatusChip result="none" /></div><div className="muted" style={{ marginTop: 8 }}>저장된 초안이 없습니다.</div><button className="btn" style={{ marginTop: 12 }} onClick={() => onOpen(s)}>초안 작성</button></div>;
  const sents = splitSentences(d.text);
  const issues = d.review.issues;
  const cc = countChars(d.text);
  const evid = d.sentences.length ? `${d.sentences.filter((x) => x.evidence.length).length}/${d.sentences.length} 문장에 근거` : "근거 매핑 없음";
  const styleOk = issues.filter((i) => i.kind === "style" || i.kind === "honorific").length === 0;

  const patchText = (newSents: string[], keepIssues: ReviewIssue[]) => {
    const text = newSents.join(" ");
    const sentences = d.sentences.length ? newSents.map((t) => d.sentences.find((x) => x.text === t) || { text: t, evidence: [] }) : [];
    onUpdate({ ...d, text, sentences, length: lengthOfText(doc, text), review: { ...d.review, issues: keepIssues, result: summarize(keepIssues) } });
  };
  const removeSentence = (i: number) => { if (i === undefined || i < 0 || i >= sents.length) return; const n = sents.filter((_, k) => k !== i); patchText(n, issues.filter((x) => x.sentenceIndex !== i)); };
  const rewrite = (iss: ReviewIssue) => {
    if (iss.suggestion && iss.sentenceIndex !== undefined) { const n = [...sents]; n[iss.sentenceIndex] = iss.suggestion; patchText(n, issues.filter((x) => x !== iss)); }
    else onOpen(s, `이 문장 다시 써줘: ${truncate(iss.span || sents[iss.sentenceIndex ?? 0] || "", 40)}`);
  };
  const ignore = (iss: ReviewIssue) => { const keep = issues.filter((x) => x !== iss); onUpdate({ ...d, review: { ...d.review, issues: keep, result: summarize(keep) } }); };

  return (
    <>
      <div className="card pad">
        <div className="flex"><StudentTag student={s} /><span className="muted small">{s.class} · {s.no}번</span><span className="grow" /><StatusChip result={d.review.result} /></div>
        <div className="reviewtext" style={{ marginTop: 10 }}>
          {sents.map((t, i) => { const hit = issues.filter((x) => x.sentenceIndex === i); const f = focus?.includes(i); return <span key={i} className={f ? "focus-sent" : ""}>{hit.length ? <mark className={hit.every((h) => h.kind === "style" || h.kind === "honorific" || h.kind === "subject") ? "style" : ""}>{t}</mark> : t}{" "}</span>; })}
        </div>
        <div className="flex wrap small muted" style={{ marginTop: 10, gap: 12 }}>
          <span className="num">{doc.settings.lengthMode === "bytes" ? `${cc.neisBytes.toLocaleString("ko-KR")} / ${(d.targetLength || target).toLocaleString("ko-KR")} B · 약 ${cc.withSpaces}자 (공백 제외 ${cc.withoutSpaces})` : `${cc.withSpaces}자 (공백 제외 ${cc.withoutSpaces} · NEIS ${cc.neisBytes}B) / ${d.targetLength || target}`}</span>
          <span>{evid}</span>
          <span>어체 {styleOk ? "✓" : "!"}</span>
          {rep && <span>반영도 {rep.passed}/{rep.total}</span>}
        </div>
      </div>
      <span className="seg" style={{ alignSelf: "flex-start" }}>
        <button className={tab === "issues" ? "active" : ""} onClick={() => pickTab("issues")}>문제 {issues.length}</button>
        <button className={tab === "charts" ? "active" : ""} onClick={() => pickTab("charts")}>근거·반영도</button>
      </span>
      {tab === "charts" && rep && <>
        <AdherenceChecklist rep={rep} onPick={(ix) => setFocus(ix)} />
        <MetricBars rep={rep} />
        <SentenceEvidenceGraph doc={doc} s={s} d={d} support={rep.sentenceSupport} focus={focus} onFocus={setFocus} />
        <CategoryCompare doc={doc} s={s} d={d} />
        <SemesterTimeline doc={doc} s={s} d={d} />
      </>}
      {tab === "issues" && issues.length === 0 && <div className="card pad" style={{ color: "var(--accent)" }}>✓ 문제 없음</div>}
      {tab === "issues" && issues.map((iss, k) => (
        <div key={k} className="card issue">
          <div className="flex"><span className={`chip ${["forbidden", "similar", "noEvidence", "name"].includes(iss.kind) ? "fix" : "check"}`}>{ISSUE_LABEL[iss.kind]}</span><span className="small">{iss.message}</span></div>
          {iss.sentenceIndex !== undefined && sents[iss.sentenceIndex] && (
            <div className="q">{highlight(sents[iss.sentenceIndex], iss.span)}{iss.suggestion && <div className="sug">→ {iss.suggestion}</div>}</div>
          )}
          <div className="flex" style={{ gap: 6 }}>
            {iss.sentenceIndex !== undefined && <button className="btn sm" onClick={() => removeSentence(iss.sentenceIndex!)}>삭제</button>}
            <button className="btn sm" onClick={() => rewrite(iss)}>{iss.suggestion ? "고침 적용" : "다시 쓰기"}</button>
            <button className="btn ghost sm" onClick={() => ignore(iss)}>무시</button>
          </div>
        </div>
      ))}
      <div className="flex"><button className="btn" onClick={() => onOpen(s)}><Icon name="pen" />초안 열기</button><span className="grow" /><button className="btn" onClick={onNext}>다음 항목<Icon name="right" /></button></div>
    </>
  );
}

function highlight(text: string, span?: string) {
  if (!span || span === text || !text.includes(span)) return text;
  const i = text.indexOf(span);
  return <>{text.slice(0, i)}<mark>{span}</mark>{text.slice(i + span.length)}</>;
}
