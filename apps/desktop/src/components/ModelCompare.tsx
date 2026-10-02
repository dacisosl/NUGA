import React, { useMemo, useRef, useState } from "react";
import { PROVIDER_INFO, PROVIDER_ORDER, buildDraftRequest, schoolStyle, type AiProvider, type AiSettings } from "@nuga/core";
import { achievementOf, adherenceOf, fillLesson, guideOf, limitOf, perfsOf, recordsOf, standardsFor, useStore } from "../store";
import { generateDraft } from "../lib/ai";
import { modelOf, providerFor } from "../lib/providers";

type Engine = AiProvider | "rules";
interface Row { engine: Engine; label: string; n: number; adherence: number; link: number; forbidden: number; band: number; sec: number; errors: number }

const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * 모델 비교표 (v3 17): 같은 학생·같은 기록으로 제공자마다 초안을 만들어
 * 반영도, 근거 연결률, 금지어 위반률, 목표 구간 적중률, 평균 시간을 비교한다. 결과 초안은 저장하지 않는다.
 */
export function ModelCompare() {
  const doc = useStore((s) => s.doc);
  const cls = useStore((s) => s.cls);
  const toast = useStore((s) => s.toast);
  const ai = doc.settings.ai;
  const ready = useMemo(() => PROVIDER_ORDER.filter((p) => !!providerFor({ ...ai, enabled: true }, p)), [ai]);
  const [pick, setPick] = useState<Set<Engine>>(new Set(["rules", ...ready.filter((p) => p !== "local").slice(0, 2)]));
  const [n, setN] = useState(5);
  const [rows, setRows] = useState<Row[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const stop = useRef(false);
  const students = doc.students.filter((s) => s.class === cls && recordsOf(doc, s.class, s.no).some((r) => r.status !== "skipped" && (r.note || r.memo).trim())).slice(0, n);

  const run = async () => {
    stop.current = false; setRows([]);
    const out: Row[] = [];
    const engines: Engine[] = [...PROVIDER_ORDER.filter((p) => pick.has(p)), ...(pick.has("rules") ? ["rules" as const] : [])];
    for (const engine of engines) {
      const conf: AiSettings = engine === "rules" ? { ...ai, enabled: false } : { ...ai, enabled: true, provider: engine };
      const label = engine === "rules" ? "규칙 기반 (AI 없음)" : `${PROVIDER_INFO[engine].label} · ${modelOf(ai, engine)}`;
      const r: Row = { engine, label, n: 0, adherence: 0, link: 0, forbidden: 0, band: 0, sec: 0, errors: 0 };
      for (const [i, s] of students.entries()) {
        if (stop.current) break;
        setProgress(`${label} · ${i + 1}/${students.length}`);
        const recs = recordsOf(doc, s.class, s.no).map((x) => fillLesson(doc, x)).filter((x) => x.status !== "skipped" && (x.note || x.memo).trim());
        const req = buildDraftRequest({
          achievement: achievementOf(doc, s).value, targetLength: limitOf(doc), lengthMode: doc.settings.lengthMode, lengthBand: doc.settings.lengthBand,
          styleGuide: schoolStyle(doc.settings.schoolLevel).styleGuide, guide: doc.settings.guide, standards: standardsFor(doc, recs),
          subject: doc.settings.school.subject, school: doc.settings.school, records: recs, performances: perfsOf(doc, s.class, s.no), categories: doc.settings.categories,
        });
        const t0 = performance.now();
        try {
          const res = await generateDraft(req, conf, { guide: guideOf(doc) });
          const rep = adherenceOf(doc, s, res.text, res.sentences, limitOf(doc));
          r.n++; r.sec += (performance.now() - t0) / 1000; r.adherence += rep.score; r.link += rep.metrics.linkRate;
          if (rep.rules.some((x) => x.key === "forbidden" && !x.pass)) r.forbidden++;
          if (rep.rules.some((x) => x.key === "band" && x.pass)) r.band++;
        } catch { r.errors++; }
      }
      out.push(r); setRows([...out]);
    }
    setProgress(null);
    toast({ text: "모델 비교 완료" });
  };

  const copy = () => {
    const head = "| 엔진 | 학생 | 반영도 | 근거 연결률 | 금지어 위반률 | 목표 구간 적중 | 평균 시간 |\n| --- | --- | --- | --- | --- | --- | --- |";
    const body = rows.map((r) => `| ${r.label} | ${r.n} | ${pct(r.adherence / Math.max(1, r.n))} | ${pct(r.link / Math.max(1, r.n))} | ${pct(r.forbidden / Math.max(1, r.n))} | ${pct(r.band / Math.max(1, r.n))} | ${(r.sec / Math.max(1, r.n)).toFixed(1)}초 |`).join("\n");
    navigator.clipboard?.writeText(`${head}\n${body}`).then(() => toast({ text: "표를 복사했습니다 (마크다운)" }));
  };

  return (
    <div className="card pad">
      <div className="flex between"><h3 style={{ margin: 0 }}>모델 비교</h3>{rows.length > 0 && <button className="btn sm" onClick={copy}>표 복사</button>}</div>
      <div className="muted small" style={{ margin: "6px 0 10px" }}>같은 학생({cls || "반 선택"} · 기록 있는 학생 {students.length}명)의 기록으로 엔진마다 초안을 만들어 비교합니다. 만든 초안은 저장하지 않습니다. 외부 API는 요금이 들 수 있습니다.</div>
      <div className="flex wrap" style={{ gap: 6 }}>
        {(["rules", ...PROVIDER_ORDER] as Engine[]).map((e) => {
          const ok = e === "rules" || ready.includes(e as AiProvider);
          return <label key={e} className={`chip clickable outline ${pick.has(e) ? "selected" : ""}`} style={{ opacity: ok ? 1 : 0.45 }} title={ok ? "" : "키 또는 주소가 없음"}>
            <input type="checkbox" disabled={!ok} checked={pick.has(e)} onChange={() => setPick((x) => { const y = new Set(x); y.has(e) ? y.delete(e) : y.add(e); return y; })} style={{ marginRight: 4 }} />
            {e === "rules" ? "규칙 기반" : PROVIDER_INFO[e as AiProvider].label}
          </label>;
        })}
        <span className="grow" />
        <span className="small muted">학생</span>
        <select className="select" value={n} onChange={(e) => setN(Number(e.target.value))}>{[3, 5, 10].map((x) => <option key={x} value={x}>{x}명</option>)}</select>
        {progress ? <button className="btn" onClick={() => { stop.current = true; }}>멈추기</button> : <button className="btn primary" disabled={!pick.size || !students.length} onClick={run}>비교 실행</button>}
      </div>
      {progress && <div className="small muted" style={{ marginTop: 8 }}>{progress}</div>}
      {rows.length > 0 && (
        <table className="table" style={{ marginTop: 12 }}>
          <thead><tr><th>엔진</th><th style={{ width: 60 }}>학생</th><th style={{ width: 80 }}>반영도</th><th style={{ width: 96 }}>근거 연결률</th><th style={{ width: 104 }}>금지어 위반률</th><th style={{ width: 104 }}>목표 구간 적중</th><th style={{ width: 84 }}>평균 시간</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.engine}>
            <td className="small">{r.label}{r.errors ? <span className="small" style={{ color: "var(--warn)" }}> · 실패 {r.errors}</span> : null}</td>
            <td className="num">{r.n}</td><td className="num">{pct(r.adherence / Math.max(1, r.n))}</td><td className="num">{pct(r.link / Math.max(1, r.n))}</td>
            <td className="num">{pct(r.forbidden / Math.max(1, r.n))}</td><td className="num">{pct(r.band / Math.max(1, r.n))}</td><td className="num">{(r.sec / Math.max(1, r.n)).toFixed(1)}초</td>
          </tr>)}</tbody>
        </table>
      )}
    </div>
  );
}
