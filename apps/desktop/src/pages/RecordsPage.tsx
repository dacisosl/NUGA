import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { fmtMD, fmtHM, lessonLabel, nowIso, type Category, type NugaDoc, type NugaRecord, type RecordCategory, type Student } from "@nuga/core";
import { ClassTabs, Sheet, useClassStudents } from "../App";
import { catLabel, fillLesson, perfsOf, recordsOf, standardsFor, useStore } from "../store";
import { aiReady, estimateAchievementAI } from "../lib/ai";
import { Chip, Confirm, EditableCell, Empty, Icon, Modal, StudentTag } from "../components/ui";
import { StairsPanel } from "../components/StairsBrief";
import { StudentGrid } from "../components/StudentGrid";
import { exportSheets } from "../lib/excel";
import { StudentEditModal } from "../components/StudentEdit";

/**
 * 현황판 (메인): 반 탭 → 한 스크롤 안에 위는 기록 계단(반 전체를 한눈에), 아래는 학생 카드 격자.
 * 기록 계단은 [접기 | 간략히 | 자세히] 로 고른다 (기본 간략히, 고른 보기는 기억 — components/StairsBrief).
 * 카드를 누르면 학생 기록 창, 카드의 [+ 기록]은 같은 창을 입력칸에 초점을 둔 채 연다 (기록은 그 창 맨 위에서 바로 남긴다).
 */
export function RecordsPage() {
  const doc = useStore((s) => s.doc);
  const cls = useStore((s) => s.cls);
  const students = useClassStudents();
  const toast = useStore((s) => s.toast);
  const aiOn = aiReady(doc.settings.ai);
  const setAutoAchievement = useStore((s) => s.setAutoAchievement);
  const [estimating, setEstimating] = useState<number | null>(null);
  const estimate = async () => {
    setEstimating(0); let done = 0; let fail = 0;
    for (const st of students) {
      const recs = recordsOf(doc, st.class, st.no).map((r) => fillLesson(doc, r));
      try {
        const a = await estimateAchievementAI(recs, standardsFor(doc, recs), doc.settings.categories, doc.settings.ai);
        setAutoAchievement(st.class, st.no, a);
      } catch { fail++; }
      setEstimating(++done);
    }
    setEstimating(null);
    toast({ text: fail ? `도달 정도 추정 완료 · 실패 ${fail}명` : `도달 정도 추정 완료 · ${done}명 (교사 조정값은 그대로)` });
  };
  const [open, setOpen] = useState<Student | null>(null);
  // [+ 기록]으로 열었으면 입력칸에 바로 초점
  const [compose, setCompose] = useState(false);
  const show = (s: Student, write = false) => { setOpen(s); setCompose(write); };
  const supp = doc.settings.supplementEnabled;
  // 반을 바꾸면 맨 위(그 반의 계단)부터 다시 본다: 카드 사이에 머물던 스크롤을 그리기 전에 되돌린다
  const boardRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { boardRef.current?.scrollTo({ top: 0 }); }, [cls]);

  return (
    <>
      <Sheet>
        <ClassTabs
          extra={(c) => { if (!supp) return null; const n = doc.records.filter((r) => r.class === c && r.status === "pending").length; return n ? <span className="badge" style={{ marginLeft: 6 }}>{n}</span> : null; }}
          right={aiOn && students.length > 0 ? (
            <button className="btn ghost sm" disabled={estimating !== null} onClick={estimate} title="이 반 학생들의 기록을 성취기준에 비추어 AI로 도달 정도를 추정합니다 (반·번호·이름은 보내지 않음)">
              <Icon name="spark" size={13} />{estimating !== null ? `도달 정도 추정 ${estimating}/${students.length}` : "AI 도달 정도 추정"}
            </button>
          ) : null} />
        <div className="content board" ref={boardRef}>
          {/* 위: 반 전체 기록 계단 — 접기(숫자 한 줄) · 간략히(작은 계단) · 자세히(이름표 계단). 찾기는 아래 격자에서 */}
          <StairsPanel doc={doc} students={students} cls={cls} onOpen={show} />
          {/* 아래: 학생 카드 격자 (반마다 거르기·정렬·찾기를 새로) */}
          <StudentGrid key={cls} doc={doc} students={students} onOpen={show} onAdd={(s) => show(s, true)} />
        </div>
      </Sheet>
      {open && <StudentDetail student={open} compose={compose} onClose={() => { setOpen(null); setCompose(false); }} onChange={setOpen} />}
    </>
  );
}

/** 누가기록 엑셀: 반마다 시트 하나 (번호 · 이름 · 기록수 · 누가기록 · 마지막). 상단 [저장 ▾] 메뉴에서 부른다 */
export async function exportRecordsExcel(doc: NugaDoc): Promise<boolean> {
  const sheets = Array.from(new Set(doc.students.map((s) => s.class))).sort().map((c) => ({
    name: c,
    widths: [8, 10, 6, 8, 80, 12],
    rows: doc.students.filter((s) => s.class === c).sort((a, b) => a.no - b.no).map((s) => {
      const recs = recordsOf(doc, s.class, s.no).map((r) => fillLesson(doc, r));
      return { 번호: s.no, 이름: s.name, 기록수: recs.length,
        누가기록: recs.map((r) => `[${catLabel(doc, r.category)}] ${fmtMD(r.time)} ${lessonLabel(r.lesson)} ${r.note || r.memo || ""}`.trim()).join("\n"),
        마지막: recs[0] ? fmtMD(recs[0].time) : "" };
    }),
  }));
  return exportSheets(`누가기록-${doc.settings.school.subject || "과목"}-${nowIso().slice(0, 10)}.xlsx`, sheets);
}

export function StudentDetail({ student: initial, compose, onClose, onChange }: { student: Student; compose?: boolean; onClose: () => void; onChange?: (s: Student) => void }) {
  const doc = useStore((s) => s.doc);
  const student = doc.students.find((x) => x.class === initial.class && x.no === initial.no) || initial;
  const [editing, setEditing] = useState(false);
  const updateRecord = useStore((s) => s.updateRecord);
  const deleteRecord = useStore((s) => s.deleteRecord);
  const setPage = useStore((s) => s.setPage);
  const select = useStore((s) => s.select);
  const setMode2p = useStore((s) => s.setMode2p);
  const toast = useStore((s) => s.toast);
  const [del, setDel] = useState<NugaRecord | null>(null);
  const recs = recordsOf(doc, student.class, student.no).map((r) => fillLesson(doc, r));
  const perfs = perfsOf(doc, student.class, student.no);
  const goDraft = () => { select({ class: student.class, no: student.no }); setMode2p("individual"); setPage("draft"); onClose(); };
  return (
    <Modal onClose={onClose} width="wide" header={<div className="flex"><StudentTag student={student} size="lg" /><span className="muted">{student.class} · {student.no}번</span><span className="chip outline">{recs.length}건</span><button className="btn sm" onClick={() => setEditing(true)}><Icon name="pen" size={13} />번호·이름 수정</button></div>}
      footer={<><span className="muted small">항목을 클릭하면 수정</span><span className="grow" /><button className="btn primary" onClick={goDraft}><Icon name="pen" />초안 작성</button></>}>
      <div className="col" style={{ gap: 14 }}>
        <RecordComposer key={`${student.class}|${student.no}`} student={student} focus={compose || recs.length === 0} />
        {recs.length === 0 ? <Empty title="기록 없음" desc="위 입력칸에 첫 기록을 남겨 보세요." /> : (
          <table className="table sd-table">
            <thead><tr><th style={{ width: 90 }}>날짜</th><th style={{ width: 70 }}>분류</th><th style={{ width: 200 }}>단원</th><th className="content-h">내용</th><th style={{ width: 70 }}>상태</th><th style={{ width: 40 }} /></tr></thead>
            <tbody>
              {recs.map((r) => (
                <tr key={r.id}>
                  <td className="num muted small">{fmtMD(r.time)} {fmtHM(r.time)}</td>
                  <td><select className="select" style={{ height: 28, fontSize: 12 }} value={r.category} onChange={(e) => updateRecord(r.id, { category: Number(e.target.value) as Category })}>{!r.category && <option value={0}>미정</option>}{doc.settings.categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></td>
                  <td className="small muted ellipsis" style={{ maxWidth: 200 }}>{lessonLabel(r.lesson) || "—"}</td>
                  <td className="content">
                    <EditableCell value={r.note || r.memo || r.voiceMemo?.transcript || ""} placeholder="내용 입력" onSave={(v) => { updateRecord(r.id, { note: v, status: v ? "confirmed" : r.status }); toast({ text: "수정됨" }); }} />
                  </td>
                  <td>{doc.settings.supplementEnabled && r.status === "pending" ? <span className="chip pending">보완 전</span> : r.status === "skipped" ? <span className="chip none">생략</span> : <span className="chip pass">확정</span>}</td>
                  <td><button className="btn ghost icon sm" onClick={() => setDel(r)} aria-label="삭제"><Icon name="trash" size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {perfs.length > 0 && (
          <div className="card pad">
            <h3>PDF기록</h3>
            {perfs.map((p) => <div key={p.id} className="flex small" style={{ padding: "4px 0" }}><Chip cat="perf" label={p.title} /><span className="muted num nowrap">{p.date}</span><span className="ellipsis">{p.excerpt}</span></div>)}
          </div>
        )}
      </div>
      {editing && <StudentEditModal student={student} onClose={() => setEditing(false)} onSaved={(s) => onChange?.(s)} />}
      {del && <Confirm title="기록 삭제" body={`${fmtMD(del.time)} · ${catLabel(doc, del.category)} 기록을 삭제합니다. 폰·워치에도 삭제가 전파됩니다.`} okLabel="삭제" danger onOk={() => { deleteRecord(del.id); toast({ text: "삭제됨" }); }} onClose={() => setDel(null)} />}
    </Modal>
  );
}

/**
 * 학생 기록 창 맨 위 입력칸: 적고 Enter 면 바로 확정 기록 (PC 기록). 줄바꿈은 Shift+Enter, 한글 조합 중 Enter 는 글자 확정만.
 * 분류는 고르지 않으면 미정(0) — 칩을 다시 누르면 풀린다. 시각은 기본 '지금', [지금 ▾]을 누르면 다른 날짜·시각.
 * 단원·차시는 진도표에서 자동으로 채워진다 (fillLesson).
 */
function RecordComposer({ student, focus }: { student: Student; focus?: boolean }) {
  const cats = useStore((s) => s.doc.settings.categories);
  const addRecord = useStore((s) => s.addRecord);
  const toast = useStore((s) => s.toast);
  const [note, setNote] = useState("");
  const [cat, setCat] = useState<RecordCategory>(0);
  const [when, setWhen] = useState<string | null>(null); // null = 지금
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (focus) ref.current?.focus(); }, [focus]);
  const text = note.trim();
  const save = () => {
    if (!text) return;
    const time = when ? nowIso(new Date(when)) : nowIso();
    addRecord({ class: student.class, no: student.no, category: cat, time, lesson: null, memo: "", voiceMemo: null, note: text, status: "confirmed", source: "pc" });
    toast({ text: `${student.no}번 ${student.name || ""} 기록 추가`.trim() });
    setNote(""); setWhen(null);
    ref.current?.focus();
  };
  return (
    <div className="rec-compose">
      <textarea ref={ref} rows={2} value={note} onChange={(e) => setNote(e.target.value)} aria-label={`${student.name || student.no + "번"} 새 기록`}
        placeholder="관찰한 내용을 적고 Enter — 바로 기록됩니다 (줄바꿈은 Shift+Enter)"
        onKeyDown={(e) => {
          if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing || e.keyCode === 229) return;
          e.preventDefault(); save();
        }} />
      <div className="rec-compose-row">
        <div className="flex wrap rec-cats">
          {cats.map((c) => <Chip key={c.key} cat={c.key} label={c.label} selected={cat === c.key} onClick={() => setCat(cat === c.key ? 0 : (c.key as Category))} />)}
        </div>
        <span className="grow" />
        {when === null ? (
          <button type="button" className="btn ghost sm" onClick={() => setWhen(nowIso().slice(0, 16))} title="다른 날짜·시각으로 기록">지금 ▾</button>
        ) : (
          <span className="flex rec-when">
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} aria-label="기록 시각" />
            <button type="button" className="btn ghost icon sm" onClick={() => setWhen(null)} aria-label="지금 시각으로" title="지금 시각으로">×</button>
          </span>
        )}
        <button type="button" className="btn primary sm" disabled={!text} onClick={save}><Icon name="plus" size={13} />기록 추가</button>
      </div>
    </div>
  );
}
