import { useLayoutEffect, useRef, useState } from "react";
import { fmtMD, fmtHM, lessonLabel, nowIso, type Category, type NugaDoc, type NugaRecord, type Student } from "@nuga/core";
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
 * 카드를 누르면 학생 기록, 카드의 [+]는 그 학생으로 맞춘 기록 추가.
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
  const [adding, setAdding] = useState<Student | null>(null);
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
          <StairsPanel doc={doc} students={students} cls={cls} onOpen={setOpen} />
          {/* 아래: 학생 카드 격자 (반마다 거르기·정렬·찾기를 새로) */}
          <StudentGrid key={cls} doc={doc} students={students} onOpen={setOpen} onAdd={setAdding} />
        </div>
      </Sheet>
      {open && <StudentDetail student={open} onClose={() => setOpen(null)} onChange={setOpen} />}
      {adding && <QuickAdd cls={adding.class} initialNo={adding.no} onClose={() => setAdding(null)} />}
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

export function StudentDetail({ student: initial, onClose, onChange }: { student: Student; onClose: () => void; onChange?: (s: Student) => void }) {
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
        {recs.length === 0 ? <Empty title="기록 없음" /> : (
          <table className="table">
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
            {perfs.map((p) => <div key={p.id} className="flex small" style={{ padding: "4px 0" }}><Chip cat="perf" label={p.title} /><span className="muted num">{p.date}</span><span className="ellipsis">{p.excerpt}</span></div>)}
          </div>
        )}
      </div>
      {editing && <StudentEditModal student={student} onClose={() => setEditing(false)} onSaved={(s) => onChange?.(s)} />}
      {del && <Confirm title="기록 삭제" body={`${fmtMD(del.time)} · ${catLabel(doc, del.category)} 기록을 삭제합니다. 폰·워치에도 삭제가 전파됩니다.`} okLabel="삭제" danger onOk={() => { deleteRecord(del.id); toast({ text: "삭제됨" }); }} onClose={() => setDel(null)} />}
    </Modal>
  );
}

/**
 * PC에서 직접 기록 추가 (기획서 확장: 워치 없이도 PC에서 바로 남길 수 있게).
 * cls·initialNo 를 주면 그 반·학생으로 맞춰 연다 (학생 카드의 [+]). 없으면 지금 반의 첫 학생
 */
export function QuickAdd({ onClose, cls: clsProp, initialNo }: { onClose: () => void; cls?: string; initialNo?: number }) {
  const doc = useStore((s) => s.doc);
  const curCls = useStore((s) => s.cls);
  const cls = clsProp || curCls;
  const addRecord = useStore((s) => s.addRecord);
  const toast = useStore((s) => s.toast);
  const students = doc.students.filter((s) => s.class === cls).sort((a, b) => a.no - b.no);
  const [no, setNo] = useState<number>(() => (initialNo != null && students.some((s) => s.no === initialNo) ? initialNo : students[0]?.no || 1));
  const [cat, setCat] = useState<Category>(1);
  const [note, setNote] = useState("");
  const [date, setDate] = useState(nowIso().slice(0, 16));
  const save = () => {
    const time = nowIso(new Date(date));
    addRecord({ class: cls, no, category: cat, time, lesson: null, memo: "", voiceMemo: null, note: note.trim(), status: note.trim() ? "confirmed" : "pending", source: "pc" });
    toast({ text: `${cls} · ${no}번 기록 추가` }); onClose();
  };
  return (
    <Modal title={`기록 추가 · ${cls}`} onClose={onClose} width="narrow" footer={<><span className="grow" /><button className="btn" onClick={onClose}>취소</button><button className="btn primary" onClick={save}>저장</button></>}>
      <div className="col" style={{ gap: 12 }}>
        <div className="grid2">
          <div className="field"><label>학생</label><select className="select" value={no} onChange={(e) => setNo(Number(e.target.value))}>{students.map((s) => <option key={s.no} value={s.no}>{s.no}번 {s.name}</option>)}</select></div>
          <div className="field"><label>일시</label><input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        </div>
        <div className="flex wrap">{doc.settings.categories.map((c) => <Chip key={c.key} cat={c.key} label={c.label} selected={cat === c.key} onClick={() => setCat(c.key)} />)}</div>
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="관찰 내용" autoFocus onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save(); }} />
        <span className="muted small">단원·차시는 진도표에서 자동으로 채워짐</span>
      </div>
    </Modal>
  );
}
