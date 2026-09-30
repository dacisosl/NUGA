import React, { useMemo, useState } from "react";
import { fmtMD, fmtHM, lessonLabel, nowIso, truncate, type Category, type NugaRecord, type Student } from "@nuga/core";
import { ClassTabs, TopBar, useClassStudents } from "../App";
import { catLabel, fillLesson, isLowRecord, perfsOf, recordsOf, useStore } from "../store";
import { CatChip, Chip, Confirm, EditableCell, Empty, Icon, LevelBadge, Modal, SearchBox } from "../components/ui";
import { Timeline } from "../components/Timeline";
import { exportSheets } from "../lib/excel";

type Filter = "all" | "low" | "pending";

export function RecordsPage() {
  const doc = useStore((s) => s.doc);
  const cls = useStore((s) => s.cls);
  const students = useClassStudents();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<Student | null>(null);
  const [adding, setAdding] = useState(false);
  const toast = useStore((s) => s.toast);
  const lowOn = doc.settings.lowRecordEnabled; const supp = doc.settings.supplementEnabled;

  const rows = useMemo(() => students.map((s) => {
    const recs = recordsOf(doc, s.class, s.no).map((r) => fillLesson(doc, r));
    return { s, recs, low: isLowRecord(doc, s.class, s.no), pending: recs.filter((r) => r.status === "pending").length };
  }).filter((r) => {
    if (q && !(r.s.name.includes(q) || String(r.s.no) === q)) return false;
    if (filter === "low") return r.low;
    if (filter === "pending") return r.pending > 0;
    return true;
  }), [students, doc, q, filter]);

  const counts = useMemo(() => ({ low: students.filter((s) => isLowRecord(doc, s.class, s.no)).length, pending: doc.records.filter((r) => r.class === cls && r.status === "pending").length }), [students, doc, cls]);

  const exportExcel = async () => {
    const sheets = Array.from(new Set(doc.students.map((s) => s.class))).sort().map((c) => ({
      name: c,
      widths: [8, 10, 6, 8, 80, 12],
      rows: doc.students.filter((s) => s.class === c).sort((a, b) => a.no - b.no).map((s) => {
        const recs = recordsOf(doc, s.class, s.no).map((r) => fillLesson(doc, r));
        return { 번호: s.no, 이름: s.name, 수준: s.level, 기록수: recs.length,
          누가기록: recs.map((r) => `[${catLabel(doc, r.category)}] ${fmtMD(r.time)} ${lessonLabel(r.lesson)} ${r.note || r.memo || ""}`.trim()).join("\n"),
          마지막: recs[0] ? fmtMD(recs[0].time) : "" };
      }),
    }));
    if (await exportSheets(`누가기록-${doc.settings.school.subject || "과목"}-${nowIso().slice(0, 10)}.xlsx`, sheets)) toast({ text: "엑셀 내보내기 완료" });
  };

  return (
    <>
      <TopBar title="누가기록" onExcel={exportExcel} right={<button className="btn" onClick={() => setAdding(true)}><Icon name="plus" />기록</button>} />
      <ClassTabs extra={(c) => { if (!supp) return null; const n = doc.records.filter((r) => r.class === c && r.status === "pending").length; return n ? <span className="badge" style={{ marginLeft: 6 }}>{n}</span> : null; }} />
      <div className="content">
        <div className="flex" style={{ marginBottom: 12 }}>
          <SearchBox value={q} onChange={setQ} />
          <span className="seg">
            <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>전체 {students.length}</button>
            {lowOn && <button className={filter === "low" ? "active" : ""} onClick={() => setFilter("low")}><span className="dot warn" style={{ marginRight: 6 }} />기록 부족 {counts.low}</button>}
            {supp && <button className={filter === "pending" ? "active" : ""} onClick={() => setFilter("pending")}>보완 대기 {counts.pending}</button>}
          </span>
          <span className="grow" />
          {lowOn && <span className="muted small">기록 부족 = {doc.settings.lowRecordThreshold}건 이하</span>}
        </div>
        {students.length === 0 ? <Empty title="명단 없음" desc="설정 → 반·명단에서 학생을 등록하세요" /> : (
          <table className="table">
            <thead><tr><th style={{ width: 60 }}>번호</th><th style={{ width: 120 }}>이름</th><th style={{ width: 56 }}>수준</th><th>누가기록</th><th style={{ width: 110 }}>마지막</th></tr></thead>
            <tbody>
              {rows.map(({ s, recs, low, pending }) => (
                <tr key={s.no} className="row" onClick={() => setOpen(s)}>
                  <td className="num key">{s.no}</td>
                  <td className="key"><span className="flex" style={{ gap: 6 }}>{s.name}{low && <span className="dot warn" title="기록 부족" />}{supp && pending > 0 && <span className="badge" title="보완 대기">{pending}</span>}</span></td>
                  <td><LevelBadge level={s.level} /></td>
                  <td className="tight">
                    <div className="reclist">
                      {recs.length === 0 && <span className="muted small">—</span>}
                      {recs.slice(0, 4).map((r) => (
                        <span key={r.id} className="recitem">
                          <CatChip cat={r.category} /><span className="d num">{fmtMD(r.time)}</span>
                          <span className="t">{r.note || r.memo || r.voiceMemo?.transcript || <span className="muted">{supp && r.status === "pending" ? "보완 전" : "내용 없음"}</span>}</span>
                        </span>
                      ))}
                      {recs.length > 4 && <span className="muted small nowrap">+{recs.length - 4}</span>}
                    </div>
                  </td>
                  <td className="num muted">{recs[0] ? fmtMD(recs[0].time) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {open && <StudentDetail student={open} onClose={() => setOpen(null)} />}
      {adding && <QuickAdd onClose={() => setAdding(false)} />}
    </>
  );
}

export function StudentDetail({ student, onClose }: { student: Student; onClose: () => void }) {
  const doc = useStore((s) => s.doc);
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
    <Modal onClose={onClose} width="wide" header={<div className="flex"><LevelBadge level={student.level} /><h2 style={{ margin: 0 }}>{student.name}</h2><span className="muted">{student.class} · {student.no}번</span><span className="chip outline">{recs.length}건</span></div>}
      footer={<><span className="muted small">항목을 클릭하면 수정</span><span className="grow" /><button className="btn primary" onClick={goDraft}><Icon name="pen" />초안 작성</button></>}>
      <div className="col" style={{ gap: 14 }}>
        <Timeline records={recs} perfs={perfs} semester={doc.settings.school.semester} year={doc.settings.school.year} />
        {recs.length === 0 ? <Empty title="기록 없음" /> : (
          <table className="table">
            <thead><tr><th style={{ width: 90 }}>날짜</th><th style={{ width: 70 }}>분류</th><th style={{ width: 200 }}>단원</th><th>내용</th><th style={{ width: 70 }}>상태</th><th style={{ width: 40 }} /></tr></thead>
            <tbody>
              {recs.map((r) => (
                <tr key={r.id}>
                  <td className="num muted small">{fmtMD(r.time)} {fmtHM(r.time)}</td>
                  <td><select className="select" style={{ height: 28, fontSize: 12 }} value={r.category} onChange={(e) => updateRecord(r.id, { category: Number(e.target.value) as Category })}>{doc.settings.categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></td>
                  <td className="small muted ellipsis" style={{ maxWidth: 200 }}>{lessonLabel(r.lesson) || "—"}</td>
                  <td>
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
            <h3>수행평가</h3>
            {perfs.map((p) => <div key={p.id} className="flex small" style={{ padding: "4px 0" }}><Chip cat="perf" label={p.title} /><span className="muted num">{p.date}</span><span className="ellipsis">{p.excerpt}</span></div>)}
          </div>
        )}
      </div>
      {del && <Confirm title="기록 삭제" body={`${fmtMD(del.time)} · ${catLabel(doc, del.category)} 기록을 삭제합니다. 폰·워치에도 삭제가 전파됩니다.`} okLabel="삭제" danger onOk={() => { deleteRecord(del.id); toast({ text: "삭제됨" }); }} onClose={() => setDel(null)} />}
    </Modal>
  );
}

/** PC에서 직접 기록 추가 (기획서 확장: 워치 없이도 PC에서 바로 남길 수 있게) */
function QuickAdd({ onClose }: { onClose: () => void }) {
  const doc = useStore((s) => s.doc);
  const cls = useStore((s) => s.cls);
  const addRecord = useStore((s) => s.addRecord);
  const toast = useStore((s) => s.toast);
  const students = doc.students.filter((s) => s.class === cls).sort((a, b) => a.no - b.no);
  const [no, setNo] = useState<number>(students[0]?.no || 1);
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
