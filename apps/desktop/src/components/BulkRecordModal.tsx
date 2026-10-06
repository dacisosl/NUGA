import { useMemo, useState } from "react";
import { dateKey, nowIso, parseBulkRecords, type BulkRow, type Category, type RecordCategory } from "@nuga/core";
import { classList, useStore } from "../store";
import { pickFile } from "../lib/platform";
import { extractText, loadDocument, type ExtractProgress } from "../lib/docOcr";
import { Icon, Modal } from "./ui";

/**
 * 일괄 기록 (상단 바 [일괄 기록 +]): 관찰기록 여러 건을 한 번에.
 *  1) 글 — 붙여넣기(엑셀 칸 · 한글 문서 · 메모) 또는 [PDF·사진에서 글자 읽기](스캔본은 OCR). 글자는 이 PC 안에서만 읽고 파일은 저장하지 않는다.
 *  2) 확인 — 한 줄 = 기록 하나로 나눈 표(core parseBulkRecords): 학생 · 날짜 · 분류 · 내용을 고치고 뺄 줄은 체크를 푼다.
 * 넣은 기록은 PC 기록(source pc · 확정)이다. 단원 · 차시는 진도표에서 자동으로 채워진다.
 */

interface Row extends BulkRow { id: number; on: boolean }

const EXAMPLE = [
  "3 김민준 발표에서 근거를 들어 설명함",
  "05번 이서연: 모둠 토의를 이끔 (9/18)",
  "[질문] 7 박지호 실험 조건을 바꾸면 어떻게 되는지 질문",
].join("\n");

function progressLabel(p: ExtractProgress | null): string {
  if (!p) return "파일 여는 중";
  return p.stage === "text" ? `${p.page}/${p.pages}쪽 글자 읽는 중` : `${p.page}/${p.pages}쪽 OCR ${Math.round(p.ratio * 100)}%`;
}

export function BulkRecordModal({ onClose }: { onClose: () => void }) {
  const doc = useStore((s) => s.doc);
  const curCls = useStore((s) => s.cls);
  const addRecords = useStore((s) => s.addRecords);
  const toast = useStore((s) => s.toast);
  const classes = classList(doc);
  const [cls, setCls] = useState(curCls || classes[0] || "");
  const [text, setText] = useState("");
  const [defDate, setDefDate] = useState(() => dateKey(new Date()));
  const [rows, setRows] = useState<Row[] | null>(null); // null = 1단계(글)
  const [reading, setReading] = useState<{ name: string; p: ExtractProgress | null } | null>(null);
  const [err, setErr] = useState("");

  const roster = useMemo(() => doc.students.filter((s) => s.class === cls).sort((a, b) => a.no - b.no), [doc.students, cls]);
  const cats = doc.settings.categories;
  const lineCount = text.split(/\r?\n/).filter((l) => l.trim()).length;

  const readFile = async () => {
    const [f] = await pickFile("application/pdf,.pdf,image/*");
    if (!f) return;
    setErr(""); setReading({ name: f.name, p: null });
    try {
      const { pages, truncated } = await loadDocument(f);
      if (truncated) toast({ text: "앞 10쪽까지만 읽습니다" });
      const got = (await extractText(pages, [], (p) => setReading({ name: f.name, p }))).trim();
      if (!got) setErr("글자를 찾지 못했습니다. 더 선명한 스캔본이나 사진으로 다시 해 보세요.");
      else { setText((t) => (t.trim() ? `${t.trimEnd()}\n\n${got}` : got)); toast({ text: `${f.name} · 글자 ${got.length.toLocaleString()}자 읽음 — 틀린 글자는 고쳐 주세요` }); }
    } catch (e) { setErr(`파일을 읽을 수 없습니다: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setReading(null); }
  };

  const check = () => {
    const parsed = parseBulkRecords(text, { students: roster.map((s) => ({ no: s.no, name: s.name })), categories: cats.map((c) => ({ key: c.key, label: c.label })), defaultDate: defDate });
    setRows(parsed.map((r, i) => ({ ...r, id: i, on: r.no !== null })));
  };
  const patch = (id: number, p: Partial<Row>) => setRows((rs) => rs && rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const ready = rows ? rows.filter((r) => r.on && r.no !== null && r.text.trim()) : [];
  const counts = rows ? { ok: rows.filter((r) => r.no !== null && r.status === "ok").length, check: rows.filter((r) => r.no !== null && r.status === "check").length, none: rows.filter((r) => r.no === null).length } : null;

  const save = () => {
    if (!ready.length) return;
    const today = dateKey(new Date());
    const added = addRecords(ready.map((r, i) => {
      // 오늘 = 지금 시각, 다른 날 = 그날 낮 12시 (같은 날 여러 건은 1초씩 띄워 붙여넣은 순서를 지킨다)
      const [y, m, d] = r.date.split("-").map(Number);
      const time = r.date === today ? nowIso() : nowIso(new Date(y, m - 1, d, 12, 0, i % 60, 0));
      return { class: cls, no: r.no!, category: r.category as RecordCategory, time, lesson: null, memo: "", voiceMemo: null, note: r.text.trim(), status: "confirmed" as const, source: "pc" as const };
    }));
    toast({ text: `${cls} · 기록 ${added.length}건 추가` });
    onClose();
  };

  const footer = rows ? (
    <>
      <button className="btn" onClick={() => setRows(null)}>← 글 고치기</button>
      <span className="grow" />
      <span className="muted small">{ready.length ? `${ready.length}건을 ${cls}에 넣습니다` : "넣을 줄이 없습니다"}</span>
      <button className="btn primary" disabled={!ready.length} onClick={save}><Icon name="plus" size={14} />기록 {ready.length}건 추가</button>
    </>
  ) : (
    <>
      <span className="muted small">한 줄에 기록 하나 · 번호나 이름으로 학생을 찾습니다</span>
      <span className="grow" />
      <button className="btn" onClick={onClose}>취소</button>
      <button className="btn primary" disabled={!text.trim() || !!reading || !roster.length} onClick={check}>확인하기 ({lineCount}줄) →</button>
    </>
  );

  return (
    <Modal onClose={onClose} width="wide" header={<div className="flex"><h2 style={{ margin: 0 }}>일괄 기록</h2><span className="muted small">{rows ? "2/2 · 줄마다 학생 확인" : "1/2 · 붙여넣기 또는 스캔본 PDF"}</span></div>} footer={footer}>
      <div className="col bulk" style={{ gap: 12 }}>
        <div className="bulk-opts">
          <label className="flex small">반
            <select className="select" value={cls} onChange={(e) => { setCls(e.target.value); setRows(null); }}>{classes.map((c) => <option key={c} value={c}>{c}</option>)}</select>
          </label>
          <label className="flex small" title="줄에 날짜가 없으면 이 날짜로 넣습니다">날짜 없는 줄
            <input type="date" value={defDate} onChange={(e) => { setDefDate(e.target.value || dateKey(new Date())); setRows(null); }} />
          </label>
          <span className="grow" />
          {!rows && (
            <button className="btn" onClick={readFile} disabled={!!reading} title="스캔본 PDF · 사진은 OCR, 글자층이 있는 PDF는 글자를 그대로 읽습니다. 이 PC 안에서만 읽고 파일은 저장하지 않습니다">
              <Icon name="list" size={14} />{reading ? progressLabel(reading.p) : "PDF·사진에서 글자 읽기"}
            </button>
          )}
        </div>
        {!roster.length && <div className="bulk-err">{cls || "이 반"}에 명단이 없습니다. 설정 → 반·명단에서 학생을 먼저 등록하세요.</div>}
        {err && <div className="bulk-err">{err}</div>}

        {!rows ? (
          <>
            <textarea className="bulk-text" rows={12} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false}
              placeholder={`관찰기록을 붙여넣으세요. 예)\n${EXAMPLE}\n\n엑셀에서 번호 · 이름 · 내용 칸을 그대로 복사해도 됩니다. 날짜(9/18)와 분류([발표])는 줄 앞이나 끝에 있으면 함께 읽습니다.`} />
            <div className="muted small">학생 이름만 있는 줄 아래의 '- 내용' 줄들은 그 학생의 기록이 되고, 번호·이름 없이 이어지는 줄은 바로 위 기록에 붙습니다. 스캔본은 글자가 틀릴 수 있으니 다음 단계 표에서 확인하세요.</div>
          </>
        ) : (
          <>
            <div className="flex wrap bulk-sum">
              <span className="chip pass">학생 찾음 {counts!.ok}</span>
              {counts!.check > 0 && <span className="chip check">확인 필요 {counts!.check}</span>}
              {counts!.none > 0 && <span className="chip none">학생 없음 {counts!.none}</span>}
              <span className="muted small">체크를 풀면 그 줄은 넣지 않습니다. 학생 없음 줄은 학생을 고르면 들어갑니다.</span>
            </div>
            {rows.length === 0 ? <div className="muted">기록으로 읽은 줄이 없습니다.</div> : (
              <div className="tablewrap bulk-table">
                <table className="table">
                  <thead><tr><th style={{ width: 34 }} /><th style={{ width: 150 }}>학생</th><th style={{ width: 140 }}>날짜</th><th style={{ width: 92 }}>분류</th><th>내용</th></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className={`${r.on ? "" : "off"} ${r.no === null ? "none" : r.status}`} title={r.raw}>
                        <td><input type="checkbox" className="checkbox" checked={r.on} disabled={r.no === null} onChange={(e) => patch(r.id, { on: e.target.checked })} aria-label="이 줄 넣기" /></td>
                        <td>
                          <select className="select" value={r.no ?? ""} onChange={(e) => { const no = e.target.value ? Number(e.target.value) : null; patch(r.id, { no, on: no !== null, status: no === null ? "none" : "ok", hint: undefined }); }}>
                            <option value="">학생 고르기</option>
                            {roster.map((s) => <option key={s.no} value={s.no}>{s.no}번 {s.name}</option>)}
                          </select>
                          {r.hint && <div className={`bulk-hint ${r.no === null ? "none" : r.status}`}>{r.hint}</div>}
                        </td>
                        <td><input type="date" value={r.date} onChange={(e) => e.target.value && patch(r.id, { date: e.target.value, dated: true })} className={r.dated ? "" : "soft"} /></td>
                        <td>
                          <select className="select" value={r.category} onChange={(e) => patch(r.id, { category: Number(e.target.value) as Category })}>
                            <option value={0}>미정</option>
                            {cats.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                          </select>
                        </td>
                        <td><textarea rows={1} value={r.text} onChange={(e) => patch(r.id, { text: e.target.value })} className="bulk-cell" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
