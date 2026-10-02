import React, { useMemo, useState } from "react";
import type { Standard, TeacherGuide } from "@nuga/core";
import { useStore } from "../store";
import { Confirm, Modal } from "../components/ui";

/** "[12화학01-01] 문장" · "12화학01-01<탭>문장" 한 줄에 하나 */
export function parseStandards(text: string): Standard[] {
  const out: Standard[] = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim(); if (!t) continue;
    const m = t.match(/^\[([^\]]+)\]\s*(.+)$/) || t.match(/^([^\s\t]+)\t+(.+)$/) || t.match(/^(\S+)\s+(.+)$/);
    if (!m) continue;
    const code = m[1].startsWith("[") ? m[1] : `[${m[1].replace(/^\[|\]$/g, "")}]`;
    out.push({ code, text: m[2].trim() });
  }
  return out;
}

/** 데모용 예시 성취기준 (실제 교육과정 원문이 아님. 교사가 원문으로 바꿔 넣는다) */
export const DEMO_STANDARDS: Standard[] = [
  { code: "[예시-화학-01]", text: "원자의 구조와 전자 배치를 이해하고 주기적 성질을 설명할 수 있다." },
  { code: "[예시-화학-02]", text: "화학 결합의 종류에 따라 물질의 성질이 달라짐을 설명할 수 있다." },
  { code: "[예시-화학-03]", text: "가역 반응에서 동적 평형 상태를 이해하고 일상의 예를 들어 설명할 수 있다." },
  { code: "[예시-화학-04]", text: "산과 염기의 중화 반응을 실험으로 확인하고 양적 관계를 설명할 수 있다." },
];

export function StandardsSection() {
  const s = useStore((x) => x.doc.settings);
  const setSettings = useStore((x) => x.setSettings);
  const toast = useStore((x) => x.toast);
  const standards = s.standards || [];
  const [paste, setPaste] = useState(false);
  const [text, setText] = useState("");
  const [del, setDel] = useState<string | null>(null);
  const units = useMemo(() => [...new Set(s.progress.map((p) => p.unit.trim()).filter(Boolean))], [s.progress]);
  const unitsOf = (code: string) => new Set(s.progress.filter((p) => p.standards?.includes(code)).map((p) => p.unit.trim()));
  const toggleUnit = (code: string, unit: string) => setSettings((x) => {
    const on = x.progress.some((p) => p.unit.trim() === unit && p.standards?.includes(code));
    return { ...x, progress: x.progress.map((p) => p.unit.trim() !== unit ? p : { ...p, standards: on ? (p.standards || []).filter((c) => c !== code) : [...new Set([...(p.standards || []), code])] }) };
  });
  const parsed = parseStandards(text);
  const g: TeacherGuide = s.guide || {};
  const upGuide = (p: Partial<TeacherGuide>) => setSettings((x) => ({ ...x, guide: { ...(x.guide || {}), ...p } }));
  const list = (v?: string[]) => (v || []).join(", ");
  const split = (v: string) => v.split(/[,，\n]/).map((w) => w.trim()).filter(Boolean);
  const areaName = s.school.subject || "현재 영역";

  return (
    <>
      <div className="card pad">
        <div className="flex between">
          <h3 style={{ margin: 0 }}>성취기준 <span className="muted small">{areaName} 영역 · {standards.length}개</span></h3>
          <span className="flex">
            {!standards.length && <button className="btn sm" onClick={() => { setSettings({ standards: DEMO_STANDARDS }); toast({ text: "예시 성취기준을 넣었습니다. 원문으로 바꿔 주세요." }); }}>예시 넣기</button>}
            <button className="btn sm primary" onClick={() => { setText(""); setPaste(true); }}>붙여넣기</button>
          </span>
        </div>
        <div className="muted small" style={{ margin: "6px 0 10px" }}>
          교육과정 원문을 한 줄에 하나씩 붙여넣고, 단원에 연결하세요. 연결된 성취기준은 그 수업 기록으로 초안을 쓸 때 함께 전달되고, 도달 정도 추정의 기준이 됩니다.
        </div>
        {standards.length === 0 ? <div className="muted small">아직 없습니다.</div> : (
          <table className="table">
            <thead><tr><th style={{ width: 150 }}>코드</th><th>성취기준</th><th style={{ width: 280 }}>연결한 단원</th><th style={{ width: 50 }} /></tr></thead>
            <tbody>
              {standards.map((st) => { const on = unitsOf(st.code); return (
                <tr key={st.code}>
                  <td className="mono small">{st.code}</td>
                  <td className="small">{st.text}</td>
                  <td>{units.length ? <span className="flex wrap" style={{ gap: 4 }}>{units.map((u) => <button key={u} className={`chip clickable outline ${on.has(u) ? "selected" : ""}`} onClick={() => toggleUnit(st.code, u)}>{u}</button>)}</span> : <span className="muted small">진도표에 단원을 먼저 넣으세요</span>}</td>
                  <td><button className="btn ghost sm" style={{ color: "var(--warn)" }} onClick={() => setDel(st.code)}>삭제</button></td>
                </tr>
              ); })}
            </tbody>
          </table>
        )}
      </div>

      <div className="card pad">
        <h3>교사 지침 <span className="muted small">{areaName} 영역</span></h3>
        <div className="muted small" style={{ marginBottom: 10 }}>점검할 수 있는 항목은 아래 칸에 넣으면 초안 생성에 반영되고 반영도 점검에서 지켰는지 확인합니다. 자유 문장은 프롬프트에만 들어가고 "자동 점검 불가"로 표시됩니다.</div>
        <div className="grid2">
          <div className="field"><label>한 문장 목표 길이 (글자)</label><input type="number" className="num" min={0} placeholder="예: 60" value={g.sentenceLength ?? ""} onChange={(e) => upGuide({ sentenceLength: e.target.value ? Number(e.target.value) : undefined })} /></div>
          <div className="field"><label>강조할 카테고리</label>
            <span className="flex wrap" style={{ gap: 4 }}>{s.categories.map((c) => { const on = (g.emphasize || []).includes(c.label); return <button key={c.key} className={`chip clickable c${c.key} ${on ? "selected" : ""}`} onClick={() => upGuide({ emphasize: on ? (g.emphasize || []).filter((x) => x !== c.label) : [...(g.emphasize || []), c.label] })}>{c.label}</button>; })}</span>
          </div>
          <div className="field"><label>꼭 넣을 표현 (쉼표로 구분)</label><input defaultValue={list(g.mustInclude)} key={`m-${list(g.mustInclude)}`} onBlur={(e) => upGuide({ mustInclude: split(e.target.value) })} placeholder="예: 탐구 과정" /></div>
          <div className="field"><label>쓰지 말 표현 (쉼표로 구분)</label><input defaultValue={list(g.avoid)} key={`a-${list(g.avoid)}`} onBlur={(e) => upGuide({ avoid: split(e.target.value) })} placeholder="예: 열심히, 뛰어난" /></div>
        </div>
        <div className="field" style={{ marginTop: 10 }}><label>자유 지침</label><textarea rows={3} defaultValue={g.note || ""} key={`n-${g.note || ""}`} onBlur={(e) => upGuide({ note: e.target.value })} placeholder="예: 탐구 과정과 개념 연결을 중심으로 서술" /></div>
      </div>

      {paste && (
        <Modal title="성취기준 붙여넣기" onClose={() => setPaste(false)} footer={<><span className="muted small">{parsed.length}개 인식</span><span className="grow" /><button className="btn" onClick={() => setPaste(false)}>취소</button><button className="btn primary" disabled={!parsed.length} onClick={() => {
          const map = new Map(standards.map((x) => [x.code, x])); for (const p of parsed) map.set(p.code, p);
          setSettings({ standards: [...map.values()] }); toast({ text: `성취기준 ${parsed.length}개 저장` }); setPaste(false);
        }}>저장</button></>}>
          <textarea rows={12} autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={"한 줄에 하나씩\n[12화학Ⅰ01-01] 성취기준 문장…\n[12화학Ⅰ01-02] …"} style={{ width: "100%" }} />
        </Modal>
      )}
      {del && <Confirm title="성취기준 삭제" body={`${del} 를 지우고 진도표 연결도 해제합니다.`} okLabel="삭제" danger onOk={() => setSettings((x) => ({ ...x, standards: (x.standards || []).filter((y) => y.code !== del), progress: x.progress.map((p) => (p.standards?.includes(del) ? { ...p, standards: p.standards.filter((c) => c !== del) } : p)) }))} onClose={() => setDel(null)} />}
    </>
  );
}
