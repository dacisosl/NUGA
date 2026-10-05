import React, { useMemo, useState } from "react";
import { splitSentences, type AdherenceReport, type Draft, type NugaDoc, type Student } from "@nuga/core";
import { catLabel, evidenceOf } from "../store";

/**
 * 근거 연계 · 프롬프트 반영도 시각화 (v3 16). 3p 검토 우측 패널.
 * 1) 반영도 체크리스트 2) 지표 막대 3) 문장–근거 연결도 4) 카테고리 구성 비교 5) 학기 타임라인
 */

const pct = (x: number) => `${Math.round(x * 100)}%`;
// SVG 속성은 var()를 안정적으로 못 읽으므로 토큰(--c1~c4, --perf)과 같은 hex를 직접 쓴다
const CAT_COLORS: Record<string, string> = { 1: "#2F63B8", 2: "#16756C", 3: "#6A48B0", 4: "#56708D", perf: "#152D4A" };

export function AdherenceChecklist({ rep, onPick }: { rep: AdherenceReport; onPick?: (sentences: number[]) => void }) {
  const [all, setAll] = useState(false);
  const rules = all ? rep.rules : rep.rules.filter((r) => !r.pass || !r.checkable);
  return (
    <div className="chart-card">
      <div className="flex between"><span className="eyebrow">반영도 체크리스트</span><span className={`chip ${rep.score >= 0.95 ? "pass" : rep.score >= 0.8 ? "check" : "fix"}`}>{rep.passed}/{rep.total} · {pct(rep.score)}</span></div>
      <ul className="checklist">
        {rules.map((r) => (
          <li key={r.key} className={!r.checkable ? "na" : r.pass ? "ok" : "bad"} onClick={() => r.sentences?.length && onPick?.(r.sentences)} style={{ cursor: r.sentences?.length ? "pointer" : undefined }}>
            <span className="mark">{!r.checkable ? "–" : r.pass ? "✓" : "✕"}</span><span className="lbl">{r.label}</span><span className="det">{r.detail}</span>
          </li>
        ))}
        {!rules.length && <li className="ok"><span className="mark">✓</span><span className="lbl">모든 규칙 통과</span></li>}
      </ul>
      <button className="btn ghost sm" onClick={() => setAll(!all)}>{all ? "어긴 규칙만" : `전체 규칙 ${rep.rules.length}개 보기`}</button>
    </div>
  );
}

export function MetricBars({ rep }: { rep: AdherenceReport }) {
  const m = rep.metrics;
  const rows: [string, number, string, number][] = [
    ["근거 연결률", m.linkRate, "근거가 있는 문장 비율", 1],
    ["기록 사용률", m.useRate, "쓸 수 있던 기록 중 쓴 비율", 0.5],
    ["근거 일치도", Math.min(1, m.support / 0.4), "문장과 근거 기록이 겹치는 정도", 0.5],
    ["반영도", m.adherence, "통과한 규칙 비율", 0.95],
  ];
  return (
    <div className="chart-card">
      <span className="eyebrow">지표</span>
      {rows.map(([label, v, tip, goal]) => (
        <div key={label} className="metric" title={tip}>
          <span className="ml">{label}</span>
          <span className="mbar"><i style={{ width: pct(Math.max(0, Math.min(1, v))), background: v >= goal ? "#245AA7" : "#C8661F" }} /><b style={{ left: pct(goal) }} /></span>
          <span className="mv num">{pct(v)}</span>
        </div>
      ))}
    </div>
  );
}

/** 문장(왼쪽) – 근거 기록(오른쪽) 연결선. 선 굵기 = 일치도 */
export function SentenceEvidenceGraph({ doc, s, d, support, focus, onFocus }: { doc: NugaDoc; s: Student; d: Draft; support: number[]; focus: number[] | null; onFocus: (i: number[] | null) => void }) {
  const sents = d.sentences.length ? d.sentences : splitSentences(d.text).map((t) => ({ text: t, evidence: [] as string[] }));
  const { evidence } = useMemo(() => evidenceOf(doc, s), [doc, s.class, s.no]);
  const recById = new Map(doc.records.map((r) => [r.id, r]));
  const used = [...new Set(sents.flatMap((x) => x.evidence))].filter((id) => evidence[id] !== undefined);
  const unused = Object.keys(evidence).filter((id) => !used.includes(id));
  const right = [...used, ...unused].slice(0, 14);
  const rowH = 26; const h = Math.max(sents.length, right.length) * rowH + 10; const w = 340;
  const ly = (i: number) => 10 + i * rowH + rowH / 2 - 6;
  const ry = (i: number) => 10 + i * rowH + rowH / 2 - 6;
  const colorOf = (id: string) => { const r = recById.get(id); return r ? (CAT_COLORS[r.category] || CAT_COLORS[4]) : CAT_COLORS.perf; };
  const labelOf = (id: string) => { const r = recById.get(id); return r ? `${r.time.slice(5, 10).replace("-", "/")} ${catLabel(doc, r.category)}` : "PDF기록"; };
  return (
    <div className="chart-card">
      <div className="flex between"><span className="eyebrow">문장–근거 연결도</span><span className="muted small">선 굵기 = 일치도</span></div>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} className="seg-graph" role="img" aria-label="문장과 근거 기록 연결">
        {sents.map((x, i) => x.evidence.map((id) => {
          const j = right.indexOf(id); if (j < 0) return null;
          const strong = Math.max(1, Math.min(5, (support[i] || 0) * 14));
          const on = !focus || focus.includes(i);
          return <path key={`${i}-${id}`} d={`M 120 ${ly(i)} C 175 ${ly(i)}, 175 ${ry(j)}, 222 ${ry(j)}`} stroke={colorOf(id)} strokeWidth={strong} fill="none" opacity={on ? 0.75 : 0.12} />;
        }))}
        {sents.map((x, i) => (
          <g key={i} onMouseEnter={() => onFocus([i])} onMouseLeave={() => onFocus(null)} style={{ cursor: "default" }}>
            <rect x={4} y={ly(i) - 9} width={116} height={18} rx={5} fill={x.evidence.length ? "#F1F6FD" : "#FCEDE2"} stroke={focus?.includes(i) ? "#245AA7" : "none"} />
            <text x={10} y={ly(i) + 4} fontSize={11} fill="#152D4A">{i + 1}. {Array.from(x.text).slice(0, 9).join("")}…</text>
            <title>{x.text}</title>
          </g>
        ))}
        {right.map((id, j) => (
          <g key={id}>
            <rect x={222} y={ry(j) - 9} width={114} height={18} rx={5} fill={used.includes(id) ? "#fff" : "#EEF3FA"} stroke={colorOf(id)} strokeOpacity={used.includes(id) ? 1 : 0.3} />
            <text x={228} y={ry(j) + 4} fontSize={11} fill={used.includes(id) ? "#152D4A" : "#4E6886"}>{labelOf(id)}</text>
            <title>{evidence[id]}</title>
          </g>
        ))}
      </svg>
      {unused.length > 0 && <div className="muted small">쓰지 않은 근거 {unused.length}건 (흐리게)</div>}
    </div>
  );
}

/** 학생의 전체 기록 카테고리 비율 vs 초안에 쓴 근거의 카테고리 비율 */
export function CategoryCompare({ doc, s, d }: { doc: NugaDoc; s: Student; d: Draft }) {
  const recs = doc.records.filter((r) => r.class === s.class && r.no === s.no && r.status !== "skipped");
  const usedIds = new Set(d.sentences.flatMap((x) => x.evidence));
  const cats = doc.settings.categories;
  const all = cats.map((c) => recs.filter((r) => r.category === c.key).length);
  const used = cats.map((c) => recs.filter((r) => r.category === c.key && usedIds.has(r.id)).length);
  const bar = (vals: number[]) => { const t = vals.reduce((a, b) => a + b, 0) || 1; return <span className="stack">{vals.map((v, i) => v ? <i key={i} style={{ width: pct(v / t), background: CAT_COLORS[cats[i].key] }} title={`${cats[i].label} ${v}`} /> : null)}</span>; };
  return (
    <div className="chart-card">
      <span className="eyebrow">카테고리 구성</span>
      <div className="metric"><span className="ml">전체 기록</span>{bar(all)}<span className="mv num">{all.reduce((a, b) => a + b, 0)}</span></div>
      <div className="metric"><span className="ml">초안 근거</span>{bar(used)}<span className="mv num">{used.reduce((a, b) => a + b, 0)}</span></div>
      <div className="legend-row">{cats.map((c) => <span key={c.key}><i style={{ background: CAT_COLORS[c.key] }} />{c.label}</span>)}</div>
    </div>
  );
}

/** 학기 타임라인: 기록 날짜를 점으로, 초안에 쓴 기록은 진하게 */
export function SemesterTimeline({ doc, s, d }: { doc: NugaDoc; s: Student; d: Draft }) {
  const recs = doc.records.filter((r) => r.class === s.class && r.no === s.no && r.status !== "skipped").sort((a, b) => a.time.localeCompare(b.time));
  const usedIds = new Set(d.sentences.flatMap((x) => x.evidence));
  if (!recs.length) return null;
  const { year, semester } = doc.settings.school;
  const start = new Date(year, semester === 1 ? 2 : 7, semester === 1 ? 2 : 17).getTime();
  const end = new Date(year, semester === 1 ? 6 : 11, semester === 1 ? 24 : 31).getTime();
  const t0 = Math.min(start, new Date(recs[0].time).getTime()); const t1 = Math.max(end, new Date(recs[recs.length - 1].time).getTime());
  const x = (iso: string) => 8 + ((new Date(iso).getTime() - t0) / Math.max(1, t1 - t0)) * 324;
  const months: { x: number; m: number }[] = [];
  for (let d0 = new Date(t0); d0.getTime() <= t1; d0 = new Date(d0.getFullYear(), d0.getMonth() + 1, 1)) months.push({ x: x(new Date(d0.getFullYear(), d0.getMonth(), 1).toISOString()), m: d0.getMonth() + 1 });
  return (
    <div className="chart-card">
      <div className="flex between"><span className="eyebrow">학기 타임라인</span><span className="muted small">진한 점 = 초안에 쓴 기록</span></div>
      <svg width="100%" viewBox="0 0 340 54" role="img" aria-label="학기 기록 타임라인">
        <line x1={8} x2={332} y1={26} y2={26} stroke="#CFDBEB" />
        {months.filter((m) => m.x >= 8 && m.x <= 332).map((m) => <g key={m.x}><line x1={m.x} x2={m.x} y1={22} y2={30} stroke="#CFDBEB" /><text x={m.x + 2} y={48} fontSize={10} fill="#4E6886">{m.m}월</text></g>)}
        {recs.map((r, i) => <circle key={r.id} cx={x(r.time)} cy={26 - (i % 2 ? 7 : -7) * 0} r={usedIds.has(r.id) ? 5 : 3.5} fill={CAT_COLORS[r.category] || CAT_COLORS[4]} opacity={usedIds.has(r.id) ? 0.95 : 0.3}><title>{`${r.time.slice(0, 10)} ${catLabel(doc, r.category)}: ${r.note || r.memo}`}</title></circle>)}
      </svg>
    </div>
  );
}
