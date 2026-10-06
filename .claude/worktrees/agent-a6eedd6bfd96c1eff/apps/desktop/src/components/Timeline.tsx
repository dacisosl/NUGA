import React from "react";
import type { NugaRecord, Performance } from "@nuga/core";
import { fmtMD } from "@nuga/core";

/** 학기 타임라인 스트립 (3~7월 또는 8~12월). 기록은 카테고리 색 점, PDF기록은 사각 점. */
export function Timeline({ records, perfs, semester, year, onPick }: { records: NugaRecord[]; perfs: Performance[]; semester: number; year: number; onPick?: (id: string) => void }) {
  const startM = semester === 1 ? 2 : 7; // 0-based: 3월 / 8월
  const start = new Date(year, startM, 1).getTime();
  const end = new Date(year, startM + 5, 0).getTime();
  const pct = (t: number) => Math.max(0, Math.min(100, ((t - start) / (end - start)) * 100));
  const months = Array.from({ length: 5 }, (_, i) => new Date(year, startM + i, 1));
  const today = Date.now();
  return (
    <div className="timeline" title="학기 타임라인">
      {months.map((m) => <span key={m.getMonth()} className="m" style={{ left: pct(m.getTime()) + "%" }}>{m.getMonth() + 1}월</span>)}
      {today >= start && today <= end && <span className="today" style={{ left: pct(today) + "%" }} />}
      {records.map((r) => (
        <span key={r.id} className={`p ${r.status === "pending" ? "pending" : ""}`} style={{ left: pct(new Date(r.time).getTime()) + "%", background: `var(--c${r.category})` }} title={`${fmtMD(r.time)} ${r.note || r.memo || ""}`} onClick={() => onPick?.(r.id)} />
      ))}
      {perfs.map((p) => (
        <span key={p.id} className="p perf" style={{ left: pct(new Date(p.date).getTime()) + "%", background: "var(--perf)", top: 8 }} title={`${p.date} ${p.title}`} />
      ))}
    </div>
  );
}
