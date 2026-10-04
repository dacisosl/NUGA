import React, { useMemo } from "react";
import { fmtMD, type NugaDoc, type Student } from "@nuga/core";
import { StudentTag } from "./ui";

/**
 * 한눈에 보기 — 기록 계단: 기록 건수만큼 계단을 올라간 학생 캐릭터.
 * 0건은 왼쪽 아래 출발선에 모이고, 기록이 많을수록 오른쪽 위로 올라간다.
 * 이름표 색은 도달 정도(누가기록 표와 같음). 재미 요소이면서 반의 기록 현황을 한눈에 본다.
 */

const MAX_STEPS = 12;
const HAIRS = ["#2B2420", "#5A3A22", "#8A5A2B", "#1F2A44", "#3C3C3C", "#7A2E2E"];
const ACCS = ["", "cap", "ribbon", "glasses", "", "band"];

function hash(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

interface Kid { s: Student; n: number; week: number; last: string; byCat: string }

export function StairsView({ doc, students, onOpen }: { doc: NugaDoc; students: Student[]; onOpen: (s: Student) => void }) {
  const weekStart = useMemo(() => { const x = new Date(); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x.getTime(); }, []);
  const kids: Kid[] = useMemo(() => students.map((s) => {
    const recs = doc.records.filter((r) => r.class === s.class && r.no === s.no && r.status !== "skipped").sort((a, b) => b.time.localeCompare(a.time));
    const cats = doc.settings.categories.map((c) => ({ l: c.label, n: recs.filter((r) => r.category === c.key).length })).filter((x) => x.n);
    return { s, n: recs.length, week: recs.filter((r) => new Date(r.time).getTime() >= weekStart).length, last: recs[0] ? fmtMD(recs[0].time) : "", byCat: cats.map((x) => `${x.l} ${x.n}`).join(" · ") };
  }), [students, doc.records, doc.settings.categories]);

  const max = Math.max(0, ...kids.map((k) => k.n));
  // 출발선 = 0건만. 그다음부터 한 칸 = 2건(1–2, 3–4, …). 기록이 아주 많으면 더 묶는다 (최대 12칸)
  const size = Math.max(2, Math.ceil(max / (MAX_STEPS - 1)));
  const steps = Math.max(4, 1 + Math.ceil(max / size));
  const stepOf = (n: number) => (n === 0 ? 0 : Math.min(steps - 1, 1 + Math.floor((n - 1) / size)));
  const label = (i: number) => (i === 0 ? "0건" : `${(i - 1) * size + 1}–${i * size}건`);
  const cols = Array.from({ length: steps }, (_, i) => kids.filter((k) => stepOf(k.n) === i).sort((a, b) => a.s.no - b.s.no));
  const lowOn = doc.settings.lowRecordEnabled; const lowTh = doc.settings.lowRecordThreshold;
  const avg = kids.length ? kids.reduce((a, k) => a + k.n, 0) / kids.length : 0;
  const zero = kids.filter((k) => k.n === 0).length;
  const weekOn = kids.filter((k) => k.week > 0).length;
  let order = 0;

  if (!students.length) return <div className="muted" style={{ padding: 24 }}>명단이 없습니다.</div>;
  return (
    <div className="stairs-wrap">
      <div className="stairs-sum">
        <span>평균 <b className="num">{avg.toFixed(1)}</b>건</span>
        <span>가장 높이 <b className="num">{max}</b>건</span>
        <span className={zero ? "warn" : ""}>출발선 <b className="num">{zero}</b>명</span>
        <span>이번 주 기록 <b className="num">{weekOn}</b>/{kids.length}명</span>
        <span className="grow" />
        <span className="muted small">이름표 색 = 도달 정도 · 누르면 학생 기록 · 오른쪽 클릭으로 성취도 조절</span>
      </div>
      <div className="stairs" style={{ gridTemplateColumns: cols.map((c) => `minmax(92px, ${Math.max(1, Math.ceil(c.length / 3))}fr)`).join(" ") }}>
        <div className="stairs-sky" aria-hidden><i className="cloud c1" /><i className="cloud c2" /></div>
        {cols.map((col, i) => {
          const low = lowOn && i * size <= lowTh; // 이 칸의 가장 많은 건수가 기준 이하
          const h = 10 + (i / Math.max(1, steps - 1)) * 62; // 계단 높이 %
          return (
            <div key={i} className={`stair-col ${i === steps - 1 ? "top" : ""}`}>
              <div className="stair-kids" style={{ bottom: `${h}%` }}>
                {col.map((k) => <KidChar key={k.s.no} k={k} i={order++} onOpen={onOpen} />)}
              </div>
              <div className={`stair-step ${low ? "low" : ""} ${i === 0 ? "start" : ""}`} style={{ height: `${h}%` }}>
                <span className="stair-label">{i === 0 ? `출발 · ${label(0)}` : label(i)}</span>
                {col.length > 0 && <span className="stair-n">{col.length}명</span>}
                {i === steps - 1 && <i className="flag" aria-hidden />}
              </div>
            </div>
          );
        })}
      </div>
      {lowOn && <div className="muted small" style={{ marginTop: 6 }}><i className="stairs-low-key" /> 기록 부족 구간 ({lowTh}건 이하)</div>}
    </div>
  );
}

function KidChar({ k, i, onOpen }: { k: Kid; i: number; onOpen: (s: Student) => void }) {
  const h = hash(k.s.name || `${k.s.class}-${k.s.no}`);
  const hair = HAIRS[h % HAIRS.length];
  const acc = ACCS[(h >>> 4) % ACCS.length];
  const tip = `${k.s.no}번 ${k.s.name} · 기록 ${k.n}건${k.byCat ? ` (${k.byCat})` : ""}${k.last ? ` · 마지막 ${k.last}` : ""}${k.week ? ` · 이번 주 +${k.week}` : ""}`;
  return (
    <div className="kid" style={{ ["--i" as string]: i, ["--hair" as string]: hair }} title={tip} onClick={() => onOpen(k.s)}>
      {k.week > 0 && <span className="kid-up">+{k.week}</span>}
      <span className={`kid-head ${acc}`} data-mood={k.n === 0 ? "wait" : k.week ? "happy" : "ok"}>
        <i className="eye l" /><i className="eye r" /><i className="mouth" />
      </span>
      <StudentTag student={k.s} size="sm" />
    </div>
  );
}

/** 누가기록 상단 [한눈에] 스위치 상태 (이 기기에 기억) */
export function useStairsMode(): [boolean, (v: boolean) => void] {
  const [on, setOn] = React.useState(() => { try { return localStorage.getItem("nuga.stairs") === "1"; } catch { return false; } });
  const set = (v: boolean) => { setOn(v); try { localStorage.setItem("nuga.stairs", v ? "1" : "0"); } catch { /* 저장 불가 */ } };
  return [on, set];
}

