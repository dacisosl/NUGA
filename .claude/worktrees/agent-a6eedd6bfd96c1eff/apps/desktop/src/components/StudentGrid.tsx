import React, { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { fmtMD, gradeStep, lessonLabel, type NugaDoc, type NugaRecord, type Performance, type RecordCategory, type Student } from "@nuga/core";
import { achievementOf, catLabel, fillLesson, lowRuleOf } from "../store";
import { Empty, SearchBox, useAchPreviewValue, useAchievementPress } from "./ui";
import "./student-grid.css";

/**
 * 누가기록 학생 카드 격자 — 학생 한 명에 카드 한 장. 한 테두리 안에 중요한 순서대로 쌓는다:
 *   이름(카드에서 가장 크게, 맨 위 · 앞에 도달 정도 색 견본) → 번호 · 기록 수와 작은 표시 → 머리선 → 내용.
 * 내용: 최근 기록(분류 점 · 날짜 · 내용, 최근 것부터 — 첫 줄 날짜가 곧 마지막 기록 날짜)을 칸이 허락하는 만큼,
 * 맨 아래 최근 8주 리듬 막대와 분류 비율 막대. 같은 격자 줄의 카드는 머리선·기록이 한 높이에서 시작한다(useRowAlign).
 * 기록이 부족한 학생(store 의 lowRuleOf — 계단·생기부 명단과 같은 기준)은 카드 전체가 옅은 붉은빛으로 바뀌고 '기록 부족' 표시가 붙는다.
 * 카드 어디를 눌러도 학생 기록(onOpen), 오른쪽 클릭이면 도달 정도 슬라이더, 이름 줄 오른쪽 [+ 기록]은 onAdd.
 * 키보드: 이름 단추(학생 기록)와 [+ 기록]이 서로 형제인 두 단추다 (단추 안에 단추를 두지 않는다).
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const WEEKS = 8;
/** 카드에 올려 보는 최근 기록 수. 실제로 보이는 수는 칸 높이가 정한다 (넘치는 기록은 통째로 숨고 '외 N건'에 더해진다) */
const LINES = 6;

type Filter = "all" | "low" | "week0";
type Sort = "no" | "few" | "recent";

interface Line { id: string; cat: RecordCategory; md: string; text: string; tip: string }
interface Mix { cat: RecordCategory; n: number; label: string }
interface Summary {
  /** 건너뜀을 뺀 기록 수 */
  n: number;
  /** 이번 주(월요일 시작) 기록 수 */
  week: number;
  /** 보완 전 기록 수 (보완 대기를 켠 경우만) */
  pending: number;
  /** 마지막 기록 MM/DD, ISO */
  last: string; lastTime: string;
  lines: Line[];
  /** 카드에 올리지 않은 기록 수 (LINES 넘는 것) */
  rest: number;
  /** 최근 8주 주별 기록 수 (오래된 주 → 이번 주) */
  rhythm: number[];
  mix: Mix[];
  low: boolean;
  /** 도달 정도 (부모에서 한꺼번에 계산: 카드가 문서 전체를 구독하지 않게) */
  ach: number | null; edited: boolean; lowConf: boolean;
  /** 같은 내용이면 같은 객체를 다시 써서 memo 카드가 다시 그려지지 않게 하는 서명 */
  sig: string;
}

const keyOf = (s: Pick<Student, "class" | "no">) => `${s.class}|${s.no}`;
const pad2 = (n: number) => String(n).padStart(2, "0");
function mondayMs(d = new Date()): number { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x.getTime(); }
const textOf = (r: NugaRecord) => (r.note || r.memo || r.voiceMemo?.transcript || "").replace(/\s+/g, " ").trim();

/**
 * 같은 격자 줄의 카드는 머리선과 기록이 한 높이에서 시작한다: 번호 줄의 작은 표시가 다음 줄로 넘친 카드가 있으면
 * 그 줄의 카드 모두가 같은 번호 줄 높이(--sg-sub-h)를 잡는다. 넘친 카드가 없는 줄은 한 줄 그대로라 기록 칸을 아낀다.
 * 카드 높이는 4:5 로 정해져 있어 자리를 잡아도 격자 크기가 변하지 않는다 (재기 ↔ 쓰기가 서로 흔들지 않는다).
 * 줄바꿈이 달라지는 때 = 격자 너비(창·열 수) · 카드 내용(deps) · 늦게 온 웹 글꼴.
 */
function useRowAlign(gridRef: React.RefObject<HTMLDivElement>, deps: React.DependencyList) {
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const align = () => {
      const cards = Array.from(grid.children) as HTMLElement[];
      // 먼저 모두 읽는다: 카드의 격자 줄(위치)과 번호 줄 내용의 높이 — 잡아 둔 자리와 상관없이 첫 표시 위 ~ 마지막 표시 아래
      const seen = cards.map((c) => {
        let top = Infinity, bottom = -Infinity;
        for (const k of Array.from(c.querySelector(".sg-sub")?.children ?? []) as HTMLElement[]) {
          top = Math.min(top, k.offsetTop);
          bottom = Math.max(bottom, k.offsetTop + k.offsetHeight);
        }
        return { row: c.offsetTop, h: bottom > top ? bottom - top : 0 };
      });
      const rowMax = new Map<number, number>();
      for (const x of seen) rowMax.set(x.row, Math.max(rowMax.get(x.row) ?? 0, x.h));
      // 그다음 바뀐 카드에만 쓴다
      cards.forEach((c, i) => {
        const v = `${rowMax.get(seen[i].row) ?? 0}px`;
        if (c.style.getPropertyValue("--sg-sub-h") !== v) c.style.setProperty("--sg-sub-h", v);
      });
    };
    align();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(align);
    ro?.observe(grid);
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    fonts?.addEventListener?.("loadingdone", align);
    return () => { ro?.disconnect(); fonts?.removeEventListener?.("loadingdone", align); };
  }, deps);
}

export function StudentGrid(props: { doc: NugaDoc; students: Student[]; onOpen: (s: Student) => void; onAdd: (s: Student) => void }): JSX.Element {
  const { doc, students } = props;
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("no");
  const [q, setQ] = useState("");

  // 부모가 콜백을 매번 새로 만들어도 카드는 다시 그리지 않도록 최신 콜백을 ref 로 잡는다
  const cb = useRef(props); cb.current = props;
  const open = useCallback((s: Student) => cb.current.onOpen(s), []);
  const add = useCallback((s: Student) => cb.current.onAdd(s), []);

  /** 학생별 요약: 기록을 한 번만 훑어 반 학생별로 나눈 뒤 계산한다. 내용이 같은 학생은 지난 요약 객체를 그대로 쓴다 */
  const prevSums = useRef(new Map<string, Summary>());
  const { sums, rule, weekMax } = useMemo(() => {
    const want = new Set(students.map(keyOf));
    const all = new Map<string, NugaRecord[]>(); // 도달 정도 추정용 (문서 순서 그대로, 건너뜀 포함 — achievementOf 와 같은 입력)
    for (const r of doc.records) {
      const k = keyOf(r);
      if (!want.has(k)) continue;
      const a = all.get(k); if (a) a.push(r); else all.set(k, [r]);
    }
    const perfs = new Map<string, Performance[]>();
    for (const p of doc.performances) {
      const k = keyOf(p);
      if (!want.has(k)) continue;
      const a = perfs.get(k); if (a) a.push(p); else perfs.set(k, [p]);
    }
    const live = (s: Student) => (all.get(keyOf(s)) || []).filter((r) => r.status !== "skipped");
    const rule = lowRuleOf(doc.settings, students.map((s) => live(s).length));
    const weekStart = mondayMs();
    const cats = doc.settings.categories;
    const supp = doc.settings.supplementEnabled;
    let weekMax = 0;
    const sums = new Map<string, Summary>();
    for (const s of students) {
      const k = keyOf(s);
      const recs = live(s).sort((a, b) => b.time.localeCompare(a.time));
      const rhythm = new Array<number>(WEEKS).fill(0);
      let week = 0, pending = 0;
      const catN = new Map<RecordCategory, number>();
      for (const r of recs) {
        const t = new Date(r.time).getTime();
        const ago = t >= weekStart ? 0 : Math.ceil((weekStart - t) / WEEK_MS);
        if (ago === 0) week++;
        if (ago < WEEKS) rhythm[WEEKS - 1 - ago]++;
        if (supp && r.status === "pending") pending++;
        catN.set(r.category, (catN.get(r.category) || 0) + 1);
      }
      for (const v of rhythm) weekMax = Math.max(weekMax, v);
      const mix: Mix[] = [
        ...cats.map((c) => ({ cat: c.key as RecordCategory, n: catN.get(c.key) || 0, label: c.label })),
        { cat: 0 as RecordCategory, n: catN.get(0) || 0, label: "미정" },
      ].filter((m) => m.n > 0);
      const lines: Line[] = recs.slice(0, LINES).map((r0) => {
        const r = fillLesson(doc, r0);
        const md = fmtMD(r.time);
        const lesson = lessonLabel(r.lesson);
        const text = textOf(r);
        return {
          id: r.id, cat: r.category, md, text: text ? text.slice(0, 240) : "내용 없음",
          tip: [md, catLabel(doc, r.category), lesson, supp && r.status === "pending" ? "보완 전" : ""].filter(Boolean).join(" · ") + (text ? `\n${text}` : ""),
        };
      });
      const a = achievementOf(doc, s, { records: all.get(k) || [], performances: perfs.get(k) || [] });
      const body = {
        n: recs.length, week, pending, last: recs[0] ? fmtMD(recs[0].time) : "", lastTime: recs[0]?.time || "",
        lines, rest: Math.max(0, recs.length - LINES), rhythm, mix, low: rule.isLow(recs.length),
        ach: a.value, edited: a.edited, lowConf: !a.edited && a.confidence === "low",
      };
      const sig = JSON.stringify([body, s]);
      const old = prevSums.current.get(k);
      sums.set(k, old && old.sig === sig ? old : { ...body, sig });
    }
    prevSums.current = sums;
    return { sums, rule, weekMax };
  }, [doc, students]);

  const counts = useMemo(() => {
    let low = 0, week0 = 0;
    for (const s of students) { const m = sums.get(keyOf(s)); if (m?.low) low++; if (!m?.week) week0++; }
    return { all: students.length, low, week0 };
  }, [students, sums]);

  const shown = useMemo(() => {
    const t = q.trim().replace(/번$/, "");
    const list = students.filter((s) => {
      const m = sums.get(keyOf(s));
      if (!m) return false;
      if (t && !(s.name.includes(t) || String(s.no) === t || pad2(s.no) === t)) return false;
      if (filter === "low") return m.low;
      if (filter === "week0") return m.week === 0;
      return true;
    });
    const n = (s: Student) => sums.get(keyOf(s))!;
    if (sort === "few") list.sort((a, b) => n(a).n - n(b).n || a.no - b.no);
    else if (sort === "recent") list.sort((a, b) => (n(b).lastTime || "").localeCompare(n(a).lastTime || "") || a.no - b.no);
    else list.sort((a, b) => a.no - b.no);
    return list;
  }, [students, sums, q, filter, sort]);

  const scale = Math.max(3, weekMax); // 한 주 1건이 꽉 찬 막대로 보이지 않게
  const seg = (k: Filter, label: React.ReactNode, n: number, title?: string) => (
    <button type="button" className={filter === k ? "active" : ""} aria-pressed={filter === k} title={title}
      disabled={k !== "all" && n === 0 && filter !== k} onClick={() => setFilter(filter === k && k !== "all" ? "all" : k)}>
      {label}<span className="sg-n">{n}</span>
    </button>
  );
  const narrowed = filter !== "all" || q.trim() !== "";

  // 도구 줄은 스크롤 칸 맨 위에 붙는다: 스크롤 칸의 위 여백만큼 올려 붙여 카드가 그 틈으로 비치지 않게
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const measure = () => {
      let p = ref.current?.parentElement;
      while (p && !/(auto|scroll|overlay)/.test(getComputedStyle(p).overflowY)) p = p.parentElement;
      const pt = p ? parseFloat(getComputedStyle(p).paddingTop) || 0 : 0;
      ref.current?.style.setProperty("--sg-stick", `${pt}px`);
    };
    measure();
    window.addEventListener("resize", measure); // 낮은 화면(1366×768)에서는 여백 토큰이 바뀐다
    return () => window.removeEventListener("resize", measure);
  }, []);

  const gridRef = useRef<HTMLDivElement>(null);
  useRowAlign(gridRef, [shown, sums]);

  return (
    <section ref={ref} className="sg" aria-label="학생 카드">
      <div className="sg-bar">
        <h2 className="eyebrow">학생 {students.length}명{narrowed && <span className="sg-of"> · {shown.length}명 보기</span>}</h2>
        <div className="seg sg-seg" role="group" aria-label="학생 거르기">
          {seg("all", "전체", counts.all)}
          {seg("low", <><i className="sg-lowdot" aria-hidden />기록 부족</>, counts.low, rule.tip)}
          {seg("week0", "이번 주 미기록", counts.week0, "이번 주(월요일부터) 기록이 없는 학생")}
        </div>
        <select className="select sg-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="정렬">
          <option value="no">번호순</option>
          <option value="few">기록 적은 순</option>
          <option value="recent">최근 기록 순</option>
        </select>
        <SearchBox value={q} onChange={setQ} placeholder="이름·번호 찾기" />
        <span className="sg-hint">카드를 누르면 학생 기록 · 오른쪽 클릭으로 도달 정도</span>
      </div>

      {!students.length ? (
        <Empty title="이 반에 학생이 없습니다" desc="설정 → 명단에서 학생을 추가하면 카드가 생깁니다." />
      ) : !shown.length ? (
        <Empty title="조건에 맞는 학생이 없습니다" desc={q.trim() ? `'${q.trim()}' 검색 결과가 없습니다.` : undefined}
          action={<button type="button" className="btn sm" onClick={() => { setFilter("all"); setQ(""); }}>전체 보기</button>} />
      ) : (
        <div className="sg-grid" ref={gridRef}>
          {shown.map((s, i) => <StudentCard key={keyOf(s)} s={s} sum={sums.get(keyOf(s))!} i={i} scale={scale} onOpen={open} onAdd={add} />)}
        </div>
      )}
    </section>
  );
}

interface CardProps { s: Student; sum: Summary; i: number; scale: number; onOpen: (s: Student) => void; onAdd: (s: Student) => void }

/**
 * 카드 하나. 학생 객체는 문서가 바뀔 때마다 새로 만들어지므로 비교에서 빼고, 학생 내용까지 담은 sum(서명으로 재사용)으로 판단한다.
 * 도달 정도 미리보기(슬라이더를 끄는 중)만 이 카드가 따로 구독한다.
 */
const StudentCard = memo(function StudentCard({ s, sum, i, scale, onOpen, onAdd }: CardProps) {
  const preview = useAchPreviewValue(s);
  const shownAch = preview ?? sum.ach;
  const step = gradeStep(shownAch);
  const { bind, popover } = useAchievementPress(s);
  const name = s.name || `${s.no}번`;
  const add = (e: React.SyntheticEvent) => { e.stopPropagation(); onAdd(s); };
  const achTip = `도달 정도 ${shownAch ?? "—"}${sum.edited ? " (교사 조정)" : sum.lowConf ? " (근거 부족 · 참고용)" : shownAch === null ? " (추정 불가)" : ""}`;
  // 화면에 쌓인 순서 그대로 읽는다: 이름 → 번호 → 기록 수 · 표시 → 도달 정도
  const label = [
    s.name || "", `${s.no}번`, sum.n ? `기록 ${sum.n}건` : "기록 없음", sum.last ? `마지막 기록 ${sum.last}` : "",
    sum.low ? "기록 부족" : "", sum.pending ? `보완 전 ${sum.pending}건` : "", sum.week ? `이번 주 ${sum.week}건` : "", achTip,
  ].filter(Boolean).join(", ");
  const rhythmTip = `최근 8주 기록: ${sum.rhythm.join(" · ")}건 (오른쪽이 이번 주)`;
  const mixTip = sum.mix.map((m) => `${m.label} ${m.n}`).join(" · ");

  // 요약 줄은 칸이 허락하는 만큼: 넘치는 기록은 옆 단으로 밀려 통째로 숨는다(줄 중간이 잘리지 않게). 숨은 수를 재어 '외 N건'에 더한다
  const linesRef = useRef<HTMLOListElement>(null);
  const [hidden, setHidden] = useState(0);
  useLayoutEffect(() => {
    const ol = linesRef.current;
    if (!ol) { setHidden(0); return; }
    const measure = () => {
      let h = 0;
      for (const li of Array.from(ol.children) as HTMLElement[]) if (li.offsetLeft > 0) h++;
      setHidden(h);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    // 칸 크기만이 아니라 기록 줄마다의 높이도 본다: 글꼴이 늦게 와 줄바꿈이 바뀌면 칸 크기는 그대로여도 숨는 기록 수가 달라진다
    const ro = new ResizeObserver(measure);
    ro.observe(ol);
    for (const li of Array.from(ol.children)) ro.observe(li);
    return () => ro.disconnect();
  }, [sum]);
  const more = hidden + sum.rest;

  return (
    <>
      <div className={`sg-card${sum.low ? " low" : ""}`} style={{ "--i": Math.min(i, 18) } as React.CSSProperties}
        onClick={() => onOpen(s)} {...bind}>
        {/* 1. 이름 (가장 크게, 맨 위) = 이 카드의 '열기' 단추. 탭 순서: 이름 → [+ 기록].
            단추가 스스로 연다 (카드의 onClick 까지 올라가는 것에 기대지 않는다) */}
        <div className="sg-head">
          <button type="button" className="sg-open" aria-label={label} onClick={(e) => { e.stopPropagation(); onOpen(s); }}>
            <i className={`sg-sw g${step < 0 ? "x" : step}${sum.lowConf ? " lowconf" : ""}`} title={achTip} aria-hidden />
            <b className="sg-name">{name}</b>
          </button>
          {sum.n > 0 && <button type="button" className="sg-add" onClick={add} aria-label={`${name} 기록 추가`} title="이 학생 기록 추가">+ 기록</button>}
        </div>

        {/* 2. 번호 · 기록 수, 이어서 작은 표시 (넘치면 다음 줄로 — 같은 격자 줄의 카드는 높이를 함께 잡는다).
            마지막 기록 날짜는 바로 아래 첫 기록 줄의 날짜라 여기서는 title·aria-label 로만. 기록 0건이면 번호만 ('아직 기록 없음'은 아래 한 번) */}
        <div className="sg-sub">
          <span className="sg-id" title={sum.last ? `마지막 기록 ${sum.last}` : undefined}>
            <b className="sg-no">{pad2(s.no)}번</b>{sum.n > 0 && ` · 기록 ${sum.n}건`}
          </span>
          {sum.low && <span className="sg-lowb">기록 부족</span>}
          {sum.pending > 0 && <span className="sg-pend" title={`보완 전 기록 ${sum.pending}건`}>보완 {sum.pending}</span>}
          {sum.week > 0 && <span className="sg-week" title={`이번 주 기록 ${sum.week}건`}><i aria-hidden />이번 주 +{sum.week}</span>}
        </div>

        {/* 3. 내용: 최근 기록 → 맨 아래 8주 리듬 · 분류 비율 */}
        {sum.n === 0 ? (
          <div className="sg-none">
            <span>아직 기록 없음</span>
            <button type="button" className="btn ghost sm" onClick={add} aria-label={`${name} 기록 추가`}>+ 기록</button>
          </div>
        ) : (
          <ol ref={linesRef} className={`sg-lines${sum.n <= 2 ? " roomy" : ""}`}>
            {sum.lines.map((l) => (
              <li key={l.id} className="sg-line" title={l.tip}>
                <i className={`sg-dot c${l.cat}`} aria-hidden /><span className="sg-date">{l.md}</span>{l.text}
              </li>
            ))}
          </ol>
        )}

        {sum.n > 0 && (
          <div className="sg-foot">
            {more > 0 && <span className="sg-more">외 {more}건</span>}
            <div className="sg-rhythm" title={rhythmTip} aria-hidden>
              {sum.rhythm.map((v, w) => (
                <i key={w} className={`${v ? "" : "z"}${w === WEEKS - 1 ? " now" : ""}`}
                  style={v ? { height: `${Math.max(3, Math.round((Math.min(v, scale) / scale) * 100))}%` } : undefined} />
              ))}
            </div>
            <div className="sg-mix" title={mixTip} aria-hidden>
              {sum.mix.map((m) => <i key={m.cat} className={`c${m.cat}`} style={{ flexGrow: m.n }} />)}
            </div>
          </div>
        )}
      </div>
      {popover}
    </>
  );
}, (a, b) => a.sum === b.sum && a.i === b.i && a.scale === b.scale && a.onOpen === b.onOpen && a.onAdd === b.onAdd);
