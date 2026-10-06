import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { gradeStep, type NugaDoc, type Student } from "@nuga/core";
import { achievementOf, lowRuleOf, useStore, type LowRule } from "../store";
import { StudentTag } from "./ui";
import "./stairs.css";

/**
 * 한눈에 보기 — 기록 계단: 종이 위에 열린 밤의 창. 랜딩 히어로의 빛나는 유리 계단을 데이터로 옮긴다.
 * 0건은 왼쪽 출발선(점선)에 서고, 한 칸 = 2건씩 오른쪽 위(빛이 드는 쪽)로 오른다.
 * 칸 = 기록 수, 이름표 색 = 도달 정도(누가기록 표와 같은 StudentTag), 하늘빛 점 = 이번 주 기록.
 * 캐릭터 없이 이름표('07 김민준')만 세워, 반이 어디에 모였는지·누가 출발선에 있는지를 1초 안에 읽게 한다.
 */

const MAX_STEPS = 12;

/**
 * 칸 나누기 — 기록 계단과 간략 계단(StairsBrief)이 같은 셈을 쓰도록 여기 하나만 둔다.
 * 출발선 = 0건만. 그다음부터 한 칸 = 2건(1–2, 3–4, …). 기록이 아주 많으면 더 묶는다 (최대 12칸, 최소 4칸).
 * 칸 이름은 아래끝 기준: 출발선 · 2건 이하 · 3건 이상 · 5건 이상 … (묶음이 커지면 6건 이하 · 7건 이상 …)
 */
export interface StairBuckets {
  /** 한 칸에 묶는 건수 */
  size: number;
  /** 칸 수 (출발선 포함) */
  steps: number;
  /** 기록 n건 → 칸 번호 (0 = 출발선) */
  stepOf: (n: number) => number;
  /** 칸 이름의 숫자 (1칸은 size '이하', 그다음은 아래끝 '이상') */
  lo: (i: number) => number;
  /** 이 칸에 들어가는 가장 많은 건수 (기록 부족 칸을 가릴 때) */
  hi: (i: number) => number;
  /** 칸 이름: 출발선 · 2건 이하 · 3건 이상 … */
  name: (i: number) => string;
}
export function stairBuckets(max: number): StairBuckets {
  const size = Math.max(2, Math.ceil(max / (MAX_STEPS - 1)));
  const steps = Math.max(4, 1 + Math.ceil(max / size));
  const stepOf = (n: number) => (n === 0 ? 0 : Math.min(steps - 1, 1 + Math.floor((n - 1) / size)));
  const lo = (i: number) => (i === 1 ? size : (i - 1) * size + 1);
  const hi = (i: number) => i * size;
  const name = (i: number) => (i === 0 ? "출발선" : `${lo(i)}건 ${i === 1 ? "이하" : "이상"}`);
  return { size, steps, stepOf, lo, hi, name };
}

/**
 * 계단의 숫자 — 기록 계단(자세히) · 간략 계단 · 접힌 숫자 줄이 모두 이 셈 하나를 쓴다 (셋이 서로 다른 수를 말하지 않게).
 * kids 는 반 학생마다 n = 건너뜀을 뺀 기록 수, week = 이번 주(월요일 0시부터) 기록 수.
 */
export interface StairModel<K> {
  /** 칸 나누기 (가장 많은 기록 수로 정한다) */
  b: StairBuckets;
  /** 칸마다 학생 (번호순) */
  cols: K[][];
  /** 기록 부족 기준: 학생 카드·생기부 명단과 같은 lowRuleOf (설정의 직접 기준, 아니면 반 평균의 절반 미만) */
  rule: LowRule; lowOn: boolean;
  /** 이 칸의 가장 많은 건수도 기록 부족인가 */
  isLow: (i: number) => boolean;
  /** 기록 부족 구간의 마지막 칸(점선 기준선) · 실제로 오른 가장 높은 칸(빛 번짐은 이 칸 하나에만). 없으면 -1 */
  lowEdge: number; peak: number;
  /** 인원 · 평균 · 가장 많은 기록 수 · 출발선(0건) · 이번 주 기록이 있는 학생 · 기록 부족 학생 */
  total: number; avg: number; max: number; zero: number; weekOn: number; lowN: number;
}
export function stairModel<K extends { n: number; week: number }>(kids: K[], settings: NugaDoc["settings"], no: (k: K) => number): StairModel<K> {
  const max = Math.max(0, ...kids.map((k) => k.n));
  const b = stairBuckets(max);
  const cols = Array.from({ length: b.steps }, (_, i) => kids.filter((k) => b.stepOf(k.n) === i).sort((x, y) => no(x) - no(y)));
  const rule = lowRuleOf(settings, kids.map((k) => k.n));
  const lowOn = rule.active;
  const isLow = (i: number) => lowOn && rule.isLow(b.hi(i));
  const total = kids.length;
  return {
    b, cols, rule, lowOn, isLow, total, max,
    avg: total ? kids.reduce((a, k) => a + k.n, 0) / total : 0,
    zero: cols[0].length,
    weekOn: kids.filter((k) => k.week > 0).length,
    lowN: lowOn ? kids.filter((k) => rule.isLow(k.n)).length : 0,
    lowEdge: Math.max(-1, ...cols.map((_, i) => (i > 0 && isLow(i) ? i : -1))),
    peak: Math.max(-1, ...cols.map((c, i) => (i > 0 && c.length ? i : -1))),
  };
}

/**
 * 빈 칸이 SLIVER_RUN 개 이상 이어지면 양 끝 칸만 이름을 달고, 가운데 칸은 이름 없는 가는 디딤판으로 접는다 (기록 계단·간략 계단 같은 규칙).
 * counts = 칸마다 학생 수 (0 = 출발선은 접지 않는다)
 */
export function sliverRuns(counts: number[]): boolean[] {
  const S = counts.length;
  const sl = counts.map(() => false);
  for (let i = 1; i < S; ) {
    if (counts[i]) { i++; continue; }
    let j = i; while (j + 1 < S && !counts[j + 1]) j++;
    if (j - i + 1 >= SLIVER_RUN) for (let k = i + 1; k < j; k++) sl[k] = true;
    i = j + 1;
  }
  return sl;
}

/** 웹 글꼴(font-display: swap)이 늦게 들어오면 하나씩 오르는 수 — 글자 너비로 정한 배치(이름표·디딤판 글자)를 다시 재게 한다 */
export function useFontTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const fs = typeof document !== "undefined" ? document.fonts : undefined;
    if (!fs) return;
    let live = true;
    const bump = () => { if (live) setTick((x) => x + 1); };
    fs.ready.then(bump, () => {});
    fs.addEventListener?.("loadingdone", bump);
    return () => { live = false; fs.removeEventListener?.("loadingdone", bump); };
  }, []);
  return tick;
}

/** 계단 치수(px). stairs.css 의 --plate-h·--plate-gap, .stair-stack 의 padding(5px 좌우·6px 아래) 과 같아야 한다 */
const BASE = 34, PH = 26, GAP = 4, ROW = PH + GAP;
type Density = "full" | "compact" | "tight" | "ladder";
type Focus = null | "zero" | "week0" | "low";

/** 단 높이(디딤판 사이 최소 차이) 범위. 무대가 높으면 단을 크게 올려 계단이 무대를 채우게 한다(웅장하게) */
const RISE_MIN = 12, RISE_MAX = 6 * ROW;
/** 빈 칸이 SLIVER_RUN 개 이상 이어지면 양 끝 칸만 이름을 달고, 가운데 칸은 이름 없는 가는 디딤판(SLIVER_W)으로 접는다 */
const SLIVER_W = 12, SLIVER_RUN = 4;
/** 맨 윗 디딤판 위 여유 */
const TOP_ROOM = 20;
/**
 * 배치 방식 (앞에서부터 맞춰 본다). 어느 방식이든 지키는 것:
 *  · 무리 꼭대기는 칸 순서대로 한 줄(ROW) 이상씩 높아진다 — 아래 칸이 위 칸보다 높아 보이는 일 없음
 *  · 빈 칸 디딤판은 그 아래 모든 무리보다 높다 — 빈 '5건 이상' 보다 '3건 이상' 무리가 솟지 않는다
 *  · 디딤판은 왼쪽 → 오른쪽으로 늘 오른다 (칸마다 높이를 따로 풀어, 붐비는 칸 다음 디딤판만 더 올린다)
 * strict: 무리 꼭대기가 다음 칸 디딤판보다 낮다 — 이름표가 계단 모서리 안에 앉는다. 한 칸 3줄, 그다음 4줄.
 * mono:   무리가 다음 디딤판 위로 한 줄까지만 솟는다. 3줄, 4줄.
 * tall:   좁은 창. 무리가 다음 디딤판 위로 더 솟을 수 있다(위 칸 무리는 여전히 한 줄 이상 높게). 5줄, 6줄.
 * 가장 높이 오른 무리는 위로 앞지를 무리가 없어 2줄 더 쌓을 수 있다. 어디에도 안 들어가면 ladder(가로 줄, 높은 칸이 위).
 */
interface Mode { over: number; cap: number }
const MODES: Mode[] = [
  { over: -4, cap: 3 }, { over: -4, cap: 4 },
  { over: ROW, cap: 3 }, { over: ROW, cap: 4 },
  { over: Infinity, cap: 5 }, { over: Infinity, cap: 6 },
];
/** 무리 높이: 이름표 rows 줄 + 디딤판 위 6px 틈 (stairs.css .stair-stack 의 gap·padding-bottom) */
const stackH = (rows: number) => (rows ? rows * ROW - GAP + 6 : 0);

interface Slot { w: number; rows: number; min: number; t: number; sliver: boolean }
interface Layout { density: Density; tagw: number; L: Slot[]; note: number | null }
/** 잰 글자 너비로 정한 치수: 이름표 너비 단계(가장 긴 이름이 말줄임 없이 들어가는 너비), 칸마다 범위 글자가 들어갈 최소 너비 */
interface Fit { tiers: [Density, number][]; occ: number[]; vac: number[]; ladder: number; note: boolean }
interface Treads { T: number[]; E: number[]; top: number }

/**
 * 디딤판 높이를 아래(출발선)부터 푼다. T = 디딤판 윗면, E = 무리 꼭대기(빈 칸은 디딤판 윗면), 모두 칸 바닥에서 잰 px.
 * 각 디딤판은 앞 디딤판 + rise 이상이고, 위 조건(MODES)을 지키는 데 필요한 만큼만 더 오른다.
 */
function treads(counts: number[], rows: number[], rise: number, m: Mode, sl: boolean[]): Treads {
  const S = counts.length, T = new Array<number>(S), E = new Array<number>(S);
  T[0] = 0; E[0] = stackH(rows[0]);
  let lo = counts[0] ? 0 : -1, hi = E[0];
  for (let i = 1; i < S; i++) {
    let t = i === 1 ? Math.max(BASE, rise) : T[i - 1] + (sl[i] ? Math.max(6, Math.round(rise / 2)) : rise);
    if (counts[i]) {
      t = Math.max(t, E[i - 1] - m.over); // 바로 앞 무리가 이 디딤판 위로 솟는 한도 (strict: 4px 아래)
      if (lo >= 0) t = Math.max(t, E[lo] + ROW - stackH(rows[i])); // 이 무리 꼭대기는 앞 무리보다 한 줄 이상 높게
      E[i] = t + stackH(rows[i]); lo = i;
    } else { t = Math.max(t, hi + 4); E[i] = t; } // 빈 칸 디딤판은 아래 모든 무리보다 높게
    T[i] = t; hi = Math.max(hi, E[i]);
  }
  return { T, E, top: hi };
}

/**
 * 계단 배치 풀이. 이름표 무리는 탑으로 쌓지 않고 디딤판 위에 옆으로 넓게 앉힌다.
 * 배치 방식 → 이름표 너비 단계 순으로 맞춰 본다. 한 방식·단계 안에서는
 *  1) 모두 한 줄로 시작해, 너비가 들어갈 때까지 높이를 가장 적게 쓰는 칸부터 한 열씩 접고(줄↑)
 *  2) 남는 너비로 줄이 많은 칸부터 다시 펴고(줄↓)
 *  3) 단 높이는 들어가는 가장 큰 값으로(계단이 고르게), 붐비는 칸 다음 디딤판만 더 오른다.
 */
function layout(counts: number[], W: number, H: number, f: Fit): Layout {
  const S = counts.length;
  const topOcc = counts.reduce((a, n, i) => (n ? i : a), -1);
  const sl = sliverRuns(counts);
  const noteH = W >= 320 ? 46 : 68; // 빈 반 안내문(두 줄 · 좁으면 세 줄) 높이
  /** 한 방식·한 이름표 너비로 맞춰 본다. 안 들어가면 null */
  const tryFit = (m: Mode, density: Density, tagw: number): Layout | null => {
    const rows = counts.map((n): number => (n ? 1 : 0));
    const cap = (i: number) => (i === topOcc ? m.cap + 2 : m.cap);
    const cols = (i: number, r: number) => Math.ceil(counts[i] / r);
    const colW = (i: number, r: number) => (counts[i] ? Math.max(cols(i, r) * (tagw + GAP) - GAP + 10 + (i ? 0 : 6), f.occ[i]) : sl[i] ? SLIVER_W : f.vac[i]);
    const solve = (rise: number) => treads(counts, rows, rise, m, sl);
    const fits = (t: Treads, room = TOP_ROOM) => t.top <= H - 8 && t.T[S - 1] + room <= H;
    let sum = rows.reduce((a, r, i) => a + colW(i, r), 0);
    // 1) 접기: 높이를 가장 적게 쓰는(같으면 너비를 많이 버는) 칸부터 한 열씩
    while (sum > W) {
      const cur = solve(RISE_MIN).top;
      let best = -1, bc = Infinity, bs = 0, br = 0;
      for (let i = 0; i < S; i++) {
        const w = counts[i] ? cols(i, rows[i]) : 0;
        if (w <= 1) continue;
        const r2 = Math.ceil(counts[i] / (w - 1));
        if (r2 > cap(i)) continue;
        const saved = colW(i, rows[i]) - colW(i, r2);
        if (saved <= 0) continue;
        const keep = rows[i]; rows[i] = r2;
        const c = (solve(RISE_MIN).top - cur) / saved;
        rows[i] = keep;
        if (c < bc - 1e-9 || (c < bc + 1e-9 && saved > bs)) { best = i; bc = c; bs = saved; br = r2; }
      }
      if (best < 0) break;
      sum -= bs; rows[best] = br;
    }
    if (sum > W || !fits(solve(RISE_MIN))) return null;
    // 2) 펴기: 남는 너비로 줄이 가장 많은 칸부터(같으면 낮은 칸) 한 줄씩, 높이도 들어갈 때만
    for (let again = true; again; ) {
      again = false;
      const order = rows.map((_, i) => i).filter((i) => rows[i] > 1).sort((a, b) => rows[b] - rows[a] || a - b);
      for (const i of order) {
        const r2 = Math.ceil(counts[i] / Math.ceil(counts[i] / (rows[i] - 1)));
        const add = colW(i, r2) - colW(i, rows[i]);
        if (sum + add > W) continue;
        const keep = rows[i]; rows[i] = r2;
        if (!fits(solve(RISE_MIN))) { rows[i] = keep; continue; }
        sum += add; again = true; break;
      }
    }
    // 3) 단 높이: 들어가는 가장 큰 값. 빈 반 안내문은 맨 윗 디딤판 위에 자리가 날 때만 (무리·디딤판과 겹치지 않게)
    for (const withNote of f.note ? [true, false] : [false]) {
      for (let rise = RISE_MAX; rise >= RISE_MIN; rise -= 2) {
        const t = solve(rise);
        if (!fits(t, withNote ? 24 + noteH : TOP_ROOM)) continue;
        return {
          density, tagw, note: withNote ? t.T[S - 1] + 24 : null,
          L: counts.map((n, i) => ({ w: n ? cols(i, rows[i]) : 0, rows: rows[i], min: colW(i, rows[i]), t: t.T[i], sliver: sl[i] })),
        };
      }
    }
    return null;
  };
  for (const m of MODES) {
    // strict·mono: 큰 이름표부터 처음 들어가는 것. tall: 탑이 가장 낮은(최대 줄 수가 가장 적은) 것, 같으면 큰 이름표
    let pick: Layout | null = null, pickRows = Infinity;
    for (const [density, tagw] of f.tiers) {
      const got = tryFit(m, density, tagw);
      if (!got) continue;
      if (m.over !== Infinity) return got;
      const maxRows = Math.max(...got.L.map((x) => x.rows));
      if (maxRows < pickRows) { pick = got; pickRows = maxRows; }
    }
    if (pick) return pick;
  }
  return { density: "ladder", tagw: f.ladder, note: null, L: counts.map((n) => ({ w: n, rows: n ? 1 : 0, min: 0, t: 0, sliver: false })) };
}

/** 글자 너비(px). 굵기는 실제보다 한 단계 굵게 재어 넉넉히 잡는다. 캔버스가 없으면 한 글자 = 1em (간략 계단도 이것으로 잰다) */
let measureCtx: CanvasRenderingContext2D | null | undefined;
export function textW(s: string, px: number, weight: number, family: string): number {
  if (measureCtx === undefined) { try { measureCtx = document.createElement("canvas").getContext("2d"); } catch { measureCtx = null; } }
  if (!measureCtx) return s.length * px;
  measureCtx.font = `${weight} ${px}px ${family}`;
  return measureCtx.measureText(s).width;
}

interface Kid {
  s: Student; n: number; week: number; last: string;
  cats: { key: number; l: string; n: number }[];
  ach: number | null; step: number; edited: boolean; lowConf: boolean;
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const md = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}. ${d.getDate()}.`; };

export function StairsView({ doc, students, onOpen, q = "" }: { doc: NugaDoc; students: Student[]; onOpen: (s: Student) => void; q?: string }) {
  const cls = useStore((s) => s.cls);
  // 반을 바꾸면 무대를 새로 세운다: 등장 동작은 반마다 한 번, 그 뒤 데이터가 바뀌어도 다시 재생하지 않는다
  return <Stage key={cls} cls={cls} doc={doc} students={students} onOpen={onOpen} q={q} />;
}

function Stage({ cls, doc, students, onOpen, q }: { cls: string; doc: NugaDoc; students: Student[]; onOpen: (s: Student) => void; q: string }) {
  const setPage = useStore((s) => s.setPage);
  const setSettingsTab = useStore((s) => s.setSettingsTab);
  const weekStart = useMemo(() => { const x = new Date(); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x.getTime(); }, []);
  const kids: Kid[] = useMemo(() => students.map((s) => {
    const recs = doc.records.filter((r) => r.class === s.class && r.no === s.no && r.status !== "skipped").sort((a, b) => b.time.localeCompare(a.time));
    const cats = doc.settings.categories.map((c) => ({ key: c.key, l: c.label, n: recs.filter((r) => r.category === c.key).length })).filter((x) => x.n);
    const a = achievementOf(doc, s);
    return {
      s, n: recs.length, week: recs.filter((r) => new Date(r.time).getTime() >= weekStart).length, last: recs[0] ? md(recs[0].time) : "", cats,
      ach: a.value, step: gradeStep(a.value), edited: a.edited, lowConf: !a.edited && a.confidence === "low",
    };
  }), [students, doc, weekStart]);

  // 칸 나누기·KPI·기록 부족(학생 카드·생기부 명단과 같은 기준)·정상은 stairModel 하나로 (간략 계단·접힌 숫자 줄과 같은 셈)
  const model = useMemo(() => stairModel(kids, doc.settings, (k) => k.s.no), [kids, doc.settings]);
  const { max, total, avg, zero, weekOn, lowN, cols, rule: lowRule, lowOn, isLow, lowEdge, peak } = model;
  const { size, steps, stepOf, lo, name: stepName } = model.b;
  const anyGx = kids.some((k) => k.step < 0);

  // KPI 토글: 조건에 맞는 학생만 밝게(나머지는 흐리게, 실루엣은 그대로). 검색어와 함께 걸린다(AND)
  const [focus, setFocus] = useState<Focus>(null);
  const left = { zero, week0: total - weekOn, low: lowN };
  useEffect(() => { if (focus && !left[focus]) setFocus(null); }, [focus, left.zero, left.week0, left.low]);
  const toggle = (f: Exclude<Focus, null>) => setFocus((x) => (x === f ? null : f));
  const qq = q.trim();
  const matchQ = (k: Kid) => !qq || (k.s.name || "").includes(qq) || String(k.s.no) === qq;
  const matchF = (k: Kid) => (focus === "zero" ? k.n === 0 : focus === "week0" ? k.week === 0 : focus === "low" ? lowRule.isLow(k.n) : true);
  const filtering = !!qq || !!focus;

  // 잰 크기로 배치: 계단 칸(.stairs-field) 하나만 ResizeObserver 로 본다(2px 미만 변화는 무시). 첫 측정 전에는 칸을 그리지 않는다.
  // 격자는 칸 안에 절대 위치로 놓여 내용이 칸 크기를 바꾸지 못한다(측정 ↔ 배치가 서로 흔들지 않게)
  const hasRoster = students.length > 0;
  const fieldRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = fieldRef.current; if (!el) return;
    const put = (w: number, h: number) => setBox((b) => (Math.abs(b.w - w) < 2 && Math.abs(b.h - h) < 2 ? b : { w, h }));
    if (typeof ResizeObserver === "undefined") { put(el.clientWidth, el.clientHeight); return; }
    const ro = new ResizeObserver(([e]) => put(e.contentRect.width, e.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasRoster]);

  // 이름은 말줄임 없이: 가장 긴 이름과 칸 범위 글자를 무대 글꼴로 한 번 재어 이름표·칸 최소 너비를 정한다.
  // 웹 글꼴이 늦게 들어오면 다시 잰다
  const fontTick = useFontTick();
  const nameKey = students.map((s) => s.name || `${s.no}번`).join("\n");
  const empty = max === 0;
  const fit: Fit = useMemo(() => {
    const fam = getComputedStyle(document.body).fontFamily || "sans-serif";
    const names = nameKey ? nameKey.split("\n") : [];
    const n13 = Math.ceil(Math.max(0, ...names.map((s) => textW(s, 13, 700, fam)))); // full·compact·ladder: 13px 650
    const n12 = Math.ceil(Math.max(0, ...names.map((s) => textW(s, 12, 700, fam)))); // tight: 12px 650
    // 이름 칸 = 판 너비 − 좌우 여백 (full 25+7 · compact/ladder 7+7 · tight 5+5) − 2px 여유
    const tiers: [Density, number][] = [["full", Math.max(76, n13 + 34)], ["compact", Math.max(62, n13 + 16)], ["tight", Math.max(46, n12 + 12)]];
    // 사람 있는 칸: '11건 이상' 이 한 줄로 (디딤판 좌우 여백 8+8). 빈 칸: '11건 / 이상' 두 줄 (여백 2+2). 출발선 빈 칸: '출발선'
    const occ = Array.from({ length: steps }, (_, i) => (i ? Math.ceil(textW(String(lo(i)), 12, 700, fam) + textW(`건 ${i === 1 ? "이하" : "이상"}`, 10.5, 600, fam) + 1) + 17 : 0));
    const vac = Array.from({ length: steps }, (_, i) => (i
      ? Math.max(30, Math.ceil(Math.max(textW(`${lo(i)}건`, 11, 700, fam), textW("이상", 11, 700, fam))) + 6)
      : Math.max(48, Math.ceil(textW("출발선", 12, 700, fam)) + 12)));
    return { tiers, occ, vac, ladder: Math.max(62, n13 + 16), note: empty };
  }, [nameKey, steps, size, empty, fontTick]); // lo 는 size 로만 정해진다

  // 높은 칸이 늘 높아 보이게: 무리는 옆으로 넓히고 줄 수를 막고, 디딤판은 칸마다 필요한 만큼 올려 무리 꼭대기가 칸 순서대로 오른다 (layout 참고)
  const countSig = cols.map((c) => c.length).join(",");
  const lay = useMemo(() => (box.h > 0 ? layout(countSig.split(",").map(Number), box.w, box.h, fit) : null), [countSig, box.w, box.h, fit]);
  const density = lay?.density, tagw = lay?.tagw ?? fit.ladder, L = lay?.L ?? [];
  // 출발선 무리·가는 디딤판은 늘리지 않는다. 남는 너비는 계단 칸들이 필요한 열 수에 비례해 나눠 가진다
  const template = !lay || density === "ladder" ? undefined
    : L.map((x, i) => (i === 0 || x.sliver ? `${x.min}px` : x.w ? `minmax(${x.min}px, ${x.w}fr)` : `minmax(${x.min}px, .45fr)`)).join(" ");
  // 사다리(가로 줄, column-reverse)는 넘치면 맨 아래부터 보인다 → 처음에는 가장 높은 칸이 보이게 맨 위로 올려 둔다.
  // 잰 배치가 사다리로 정해진 뒤(격자가 그려진 뒤)에 돈다: 첫 측정 전에는 격자가 없다
  const gridRef = useRef<HTMLDivElement>(null);
  const isLadder = density === "ladder";
  useLayoutEffect(() => { const g = gridRef.current; if (g && isLadder) g.scrollTop = -g.scrollHeight; }, [isLadder, countSig]);

  // 등장은 무대가 설 때 한 번. 그 뒤로는 한 칸 오른 학생만 'arrive' 고리를 한 번 켠다
  const [settled, setSettled] = useState(false);
  useEffect(() => { const t = window.setTimeout(() => setSettled(true), 1300); return () => window.clearTimeout(t); }, []);
  const prevRef = useRef<Map<number, number> | null>(null);
  const arriveT = useRef<number | undefined>(undefined);
  const [arrived, setArrived] = useState<Set<number>>(() => new Set());
  const sig = kids.map((k) => `${k.s.no}:${stepOf(k.n)}`).join(",");
  const [tip, setTip] = useState<{ no: number; r: DOMRect } | null>(null);
  const closeTip = useCallback(() => setTip(null), []);
  useEffect(() => {
    setTip(null); // 이름표가 칸을 옮기면 떠 있던 카드는 거둔다
    const now = new Map(kids.map((k) => [k.s.no, stepOf(k.n)] as const));
    const prev = prevRef.current; prevRef.current = now;
    if (!prev) return;
    const up = [...now].filter(([no, st]) => (prev.get(no) ?? st) < st).map(([no]) => no);
    if (!up.length) return;
    setArrived(new Set(up));
    window.clearTimeout(arriveT.current);
    arriveT.current = window.setTimeout(() => setArrived(new Set()), 1000);
  }, [sig]);
  useEffect(() => () => window.clearTimeout(arriveT.current), []);

  const tipKid = tip ? kids.find((k) => k.s.no === tip.no) : undefined;
  const label = students[0]?.class || cls;
  const hintId = useId();
  let order = 0;
  return (
    <div className="stairs-wrap">
      <section className={`stairs-stage ${filtering ? "filtering" : ""} ${settled ? "settled" : ""}`} data-density={lay ? density : undefined}
        role="region" aria-label="기록 계단: 반 전체 기록 현황"
        style={{ "--tagw": `${tagw}px` } as React.CSSProperties}
        onKeyDown={(e) => { if (e.key === "Escape" && focus) { e.stopPropagation(); setFocus(null); } }}>
        <header className="stairs-head">
          <p className="eyebrow">기록 계단 <b>{label ? `${label} · ` : ""}{total}명</b></p>
          {hasRoster && <div className="kpis">
            <div className="kpi"><span className="k">평균</span><b>{avg.toFixed(1)}<small>건</small></b></div>
            <button type="button" className={`kpi tg ${zero ? "warn" : ""}`} aria-pressed={focus === "zero"} disabled={!zero} onClick={() => toggle("zero")} title="출발선(0건) 학생만 밝게">
              <span className="k">출발선</span><b>{zero}<small>명</small></b>
            </button>
            <button type="button" className="kpi tg" aria-pressed={focus === "week0"} disabled={!left.week0} onClick={() => toggle("week0")} title="이번 주 기록이 없는 학생만 밝게">
              <span className="k">이번 주 기록</span><b>{weekOn}<small>/{total}명</small></b>
              <i className="meter" style={{ "--v": total ? weekOn / total : 0 } as React.CSSProperties}><i /></i>
            </button>
            {lowOn && <button type="button" className={`kpi tg ${lowN ? "warn" : ""}`} aria-pressed={focus === "low"} disabled={!lowN} onClick={() => toggle("low")} title={`${lowRule.tip}
누르면 기록 부족 학생만 밝게`}>
              <span className="k">기록 부족</span><b>{lowN}<small>명</small></b>
            </button>}
            <div className="kpi"><span className="k">가장 높이</span><b>{max}<small>건</small></b></div>
          </div>}
          {hasRoster && <div className="stairs-legend" aria-hidden="true">
            <span className="lg-row">도달 정도 <span className="sw"><i className="g0" /><i className="g1" /><i className="g2" /><i className="g3" /><i className="g4" /></span> 낮음 → 높음</span>
            <span className="lg-row"><i className="wk" />이번 주 기록{lowOn && <><i className="lowk" />기록 부족 ({lowRule.short})</>}{anyGx && <><i className="gxk" />미정</>}</span>
          </div>}
        </header>

        {hasRoster ? (
          <div className="stairs-field" ref={fieldRef}>
            {lay && (
              <div className="stairs-grid" ref={gridRef} style={{ gridTemplateColumns: template }}>
                {cols.map((col, i) => {
                  const p = L[i];
                  const cn = ["stair-col", i === 0 && "start", i === steps - 1 && "top", i === peak && "peak", !col.length && "vacant", p.sliver && "sliver", isLow(i) && "low", i === lowEdge && "low-edge"].filter(Boolean).join(" ");
                  return (
                    <div key={i} role="group" aria-label={`${i ? stepName(i) : "출발선 0건"}, ${col.length}명${isLow(i) ? ", 기록 부족 구간" : ""}`} className={cn}
                      style={{ "--i": i, "--rows": p.rows || 1, "--t": `${p.t}px` } as React.CSSProperties}>
                      {col.length > 0 && (
                        <div className="stair-stack">
                          {/* 빈자리를 먼저 채워 구멍은 왼쪽 위에, 이름표는 디딤판 위에 평평하게 놓인다 (번호순: 위→아래, 왼→오) */}
                          {Array.from({ length: p.w * p.rows - col.length }, (_, j) => <i key={"ph" + j} className="ph" aria-hidden="true" />)}
                          {col.map((k) => <Plate key={k.s.no} k={k} order={order++} hit={filtering && matchQ(k) && matchF(k)} arrived={arrived.has(k.s.no)} hintId={hintId} onOpen={onOpen} onTip={setTip} />)}
                        </div>
                      )}
                      {i === 0
                        ? <div className="stair-start"><span className="stair-range">출발선</span><span className="stair-n">{col.length}명</span></div>
                        : <div className="stair-step" data-tier={Math.round((i / Math.max(1, steps - 1)) * 3)}>
                            <span className="stair-range">{lo(i)}<small>건 {i === 1 ? "이하" : "이상"}</small></span>{col.length > 0 && <span className="stair-n">{col.length}명</span>}
                          </div>}
                    </div>
                  );
                })}
                {lay.note != null && <p className="stairs-note" style={{ bottom: lay.note }}><b>시작</b>첫 기록이 쌓이면 계단에 불이 켜집니다</p>}
              </div>
            )}
            <span id={hintId} className="stairs-sr">이름표: Enter 학생 기록 열기, Shift+F10 또는 메뉴 키 도달 정도 조정</span>
          </div>
        ) : (
          <>
            <div className="stairs-empty">
              <b>명단이 없습니다</b>
              <p>설정 → 반·명단에서 학생을 등록하면 계단이 채워집니다</p>
              <button type="button" className="btn" onClick={() => { setSettingsTab("roster"); setPage("settings"); }}>설정 열기</button>
            </div>
            <i className="stairs-mark" aria-hidden="true" />
          </>
        )}
        <div className="stairs-horizon" aria-hidden="true" />
      </section>
      {tip && tipKid && <StairTip key={tip.no} k={tipKid} r={tip.r} onClose={closeTip} />}
    </div>
  );
}

/**
 * 이름표 판: 누가기록 표와 같은 StudentTag 를 그대로 세운다(색 단계·근거 부족 점선·오른쪽 클릭 도달 정도 창 공유).
 * 판 전체가 이름 단추라서 어디를 눌러도 학생 기록이 열리고, 오른쪽 클릭·메뉴 키·Shift+F10 은 StudentTag 가 받는다.
 * 번호('07')는 판 위에 겹쳐 그리기만 한다(클릭은 통과).
 */
function Plate({ k, order, hit, arrived, hintId, onOpen, onTip }: {
  k: Kid; order: number; hit: boolean; arrived: boolean; hintId: string;
  onOpen: (s: Student) => void; onTip: (t: { no: number; r: DOMRect } | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  // 떠 있는 유리는 한 번에 하나: 도달 정도 창(.ach-pop)이 열려 있으면 카드를 띄우지 않는다
  const show = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { if (ref.current && !document.querySelector(".ach-pop")) onTip({ no: k.s.no, r: ref.current.getBoundingClientRect() }); }, 120);
  };
  const hide = () => { window.clearTimeout(timer.current); onTip(null); };
  // 키보드(메뉴 키·Shift+F10)로도 도달 정도 창: 이름표에 contextmenu 를 보내 StudentTag 가 열게 한다.
  // keydown 을 막아 브라우저가 따로 보내는 contextmenu 와 겹치지 않는다
  const keyMenu = (e: React.KeyboardEvent) => {
    if (!(e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) || !ref.current?.contains(e.target as Node)) return;
    const tag = ref.current.querySelector(".stag"); if (!tag) return;
    e.preventDefault(); hide();
    const r = tag.getBoundingClientRect();
    tag.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
  };
  const name = k.s.name || `${k.s.no}번`;
  // 색·카드로만 보이던 것(교사 조정·근거 부족·마지막 기록)도 화면 읽기 프로그램에 읽힌다. 단축키 안내는 무대에 하나만 두고 가리킨다
  const achNote = k.edited ? " (교사 조정)" : k.lowConf ? " (근거 부족)" : "";
  return (
    <div ref={ref} role="group" className={`plate ${hit ? "hit" : ""} ${arrived ? "arrive" : ""}`} data-week={k.week > 0 ? "" : undefined}
      aria-label={`${k.s.no}번 ${name}, 기록 ${k.n}건${k.week ? `, 이번 주 ${k.week}건` : ""}${k.last ? `, 마지막 기록 ${k.last}` : ""}, 도달 정도 ${k.ach ?? "없음"}${achNote}`}
      aria-describedby={hintId} aria-keyshortcuts="Shift+F10 ContextMenu"
      style={{ "--k": order } as React.CSSProperties}
      onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide} onContextMenuCapture={hide} onKeyDown={keyMenu}>
      <StudentTag student={k.s} size="sm" title="" onNameClick={() => { hide(); onOpen(k.s); }} />
      <span className="plate-no" aria-hidden="true">{pad2(k.s.no)}</span>
    </div>
  );
}

/** 이름표 위 카드(title 대신): 기록 수·영역별·이번 주·마지막 날짜·도달 정도. 스스로 높이를 재서 위(자리 없으면 아래)에 띄운다 */
function StairTip({ k, r, onClose }: { k: Kid; r: DOMRect; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    const left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8));
    const top = r.top - h - 8 >= 8 ? r.top - h - 8 : r.bottom + 8;
    setPos({ left: Math.round(left), top: Math.round(top) });
  }, [r]);
  useEffect(() => {
    window.addEventListener("scroll", onClose, true); window.addEventListener("resize", onClose);
    return () => { window.removeEventListener("scroll", onClose, true); window.removeEventListener("resize", onClose); };
  }, [onClose]);
  return createPortal(
    <div ref={ref} className={`stair-tip ${pos ? "show" : ""}`} role="tooltip" style={pos ?? { left: -9999, top: 0 }}>
      <b>{pad2(k.s.no)} {k.s.name || `${k.s.no}번`}</b>
      <div className="r"><span>기록</span><em>{k.n}건</em></div>
      {k.cats.length > 0 && <div className="r cats">{k.cats.map((c) => <span key={c.key}><i className={`sw c${c.key}`} />{c.l} {c.n}</span>)}</div>}
      <div className="r"><span>이번 주</span><em>{k.week ? `+${k.week}` : "—"}</em></div>
      <div className="r"><span>마지막</span><em>{k.last || "—"}</em></div>
      <div className="r"><span>도달 정도</span><em>{k.ach ?? "—"}{k.edited ? " · 교사 조정" : k.lowConf ? " · 근거 부족" : ""}</em></div>
    </div>,
    document.body,
  );
}
