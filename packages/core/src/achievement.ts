import type { Achievement, Grade, Level, NugaRecord, Performance, Student } from "./types";

/**
 * 성취기준 도달 정도 (0~100) 와 앱 내부 5등급(A~E).
 * - 등급은 초안의 표현 강도와 어휘를 고르는 데만 쓴다. 화면에는 숫자와 색만, 생기부·내보내기에는 아무것도 나가지 않는다.
 * - 구간: 80~100 A · 60~79 B · 40~59 C · 20~39 D · 0~19 E · 값 없음 → 등급 없음
 */
export const GRADE_BANDS: { grade: Grade; min: number; max: number }[] = [
  { grade: "A", min: 80, max: 100 },
  { grade: "B", min: 60, max: 79 },
  { grade: "C", min: 40, max: 59 },
  { grade: "D", min: 20, max: 39 },
  { grade: "E", min: 0, max: 19 },
];

export function clampScore(v: number): number { return Math.max(0, Math.min(100, Math.round(v))); }

export function gradeOf(v: number | null | undefined): Grade | null {
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  const s = clampScore(v);
  return GRADE_BANDS.find((b) => s >= b.min)!.grade;
}

/** 이름표 색 단계 0~4 (낮음→높음), 값 없음은 -1 */
export function gradeStep(v: number | null | undefined): number {
  const g = gradeOf(v);
  return g ? 4 - GRADE_BANDS.findIndex((b) => b.grade === g) : -1;
}

/** 0.2.0 이하 A·B·C 를 도달 정도로 옮길 때 쓰는 값 */
export const LEGACY_LEVEL_SCORE: Record<Level, number> = { A: 85, B: 60, C: 35 };

export function finalAchievement(a: Achievement | null | undefined): number | null {
  if (!a) return null;
  return a.manual ?? a.auto ?? null;
}

/** 학생의 최종 도달 정도 (교사 조정값 우선, 없으면 자동값, 옛 수준 값) */
export function studentAchievement(s: Pick<Student, "achievement" | "level">): number | null {
  const v = finalAchievement(s.achievement);
  if (v !== null) return v;
  return s.level ? LEGACY_LEVEL_SCORE[s.level] : null;
}

/** 옛 수준(level)을 도달 정도(수동값)로 옮긴다. 이미 옮겼으면 그대로 둔다. */
export function migrateStudent(s: Student): Student {
  if (!s.level) return s;
  const { level, ...rest } = s;
  if (rest.achievement) return rest;
  return { ...rest, achievement: { auto: null, manual: LEGACY_LEVEL_SCORE[level], confidence: "ok" } };
}

/* ---------------- 등급별 표현 방향과 어휘 ---------------- */

export interface GradeStyle {
  /** 표현 방향 (프롬프트에 그대로 들어감) */
  direction: string;
  /** 어울리는 서술어·표현 */
  vocab: string[];
  /** 피할 표현 (기록에 뚜렷한 근거가 없으면) */
  avoid: string[];
}

export const GRADE_STYLE: Record<Grade | "none", GradeStyle> = {
  A: {
    direction: "주도성·심화·확장과 개념 간 연결이 드러나도록 서술한다.",
    vocab: ["개념을 확장하여 새로운 사례에 적용함", "개념 간 관계를 연결하여 설명함", "근거를 들어 논리적으로 설명함", "스스로 탐구 질문을 세움", "다른 관점에서 비판적으로 검토함", "심화하여 탐구함"],
    avoid: ["참여함", "노력함", "익혀 감"],
  },
  B: {
    direction: "이해를 바탕으로 개념을 적용하고 근거를 들어 정리한 모습을 중심으로 서술한다.",
    vocab: ["개념을 적용하여 설명함", "근거를 들어 정리함", "자료를 비교하여 분석함", "원리를 이해하고 설명함", "결과를 해석함"],
    avoid: ["탁월함", "주도적으로 이끎", "심화하여"],
  },
  C: {
    direction: "개념을 이해하고 과제를 성실하게 수행한 과정을 중심으로 서술한다.",
    vocab: ["개념을 이해하고 정리함", "과제를 성실히 수행함", "질문하며 내용을 확인함", "결과를 정리하여 발표함", "개념을 익힘"],
    avoid: ["탁월함", "뛰어남", "심화", "확장"],
  },
  D: {
    direction: "활동에 참여한 사실과 시도한 과정을 중심으로 담백하게 서술한다.",
    vocab: ["활동에 참여함", "결과를 정리하여 발표함", "해결 방법을 시도함", "모둠 활동에 참여함", "과정을 따라 수행함"],
    avoid: ["우수함", "탁월함", "심화", "확장", "분석함"],
  },
  E: {
    direction: "참여 사실과 도움을 받아 해결한 과정 등 기록된 노력 과정만 담백하게 서술한다.",
    vocab: ["활동에 참여하며 익혀 감", "도움을 받아 과제를 해결함", "기본 개념을 익혀 감", "활동에 참여함"],
    avoid: ["우수함", "탁월함", "뛰어남", "심화", "확장", "분석함", "주도적"],
  },
  none: {
    direction: "도달 정도를 판단할 근거가 없으므로 기록된 참여 사실 중심으로 쓰고 평가 표현을 줄인다.",
    vocab: ["활동에 참여함", "내용을 정리함", "발표함"],
    avoid: ["탁월함", "뛰어남", "우수함"],
  },
};

/** 경계 근처(±5)면 이웃 등급의 어휘도 함께 허용한다 (연속값 반영) */
function neighborGrade(v: number): Grade | null {
  const g = gradeOf(v)!; const band = GRADE_BANDS.find((b) => b.grade === g)!;
  const i = GRADE_BANDS.indexOf(band);
  if (v - band.min < 5 && i < GRADE_BANDS.length - 1) return GRADE_BANDS[i + 1].grade;
  if (band.max - v < 5 && i > 0) return GRADE_BANDS[i - 1].grade;
  return null;
}

/**
 * 생성 프롬프트에 넣는 표현 지침. 등급 이름과 숫자는 넣지 않는다.
 * (도달 정도는 표현 방향만 정하며, 기록에 없는 성취를 만들지 않는다.)
 */
export function achievementGuide(v: number | null | undefined): string[] {
  const g = gradeOf(v);
  const st = GRADE_STYLE[g ?? "none"];
  const lines = [`- 표현 방향: ${st.direction}`, `- 어울리는 서술: ${st.vocab.join(", ")}`];
  if (g && v !== null && v !== undefined) {
    const n = neighborGrade(clampScore(v));
    if (n) lines.push(`- 함께 써도 되는 서술: ${GRADE_STYLE[n].vocab.slice(0, 3).join(", ")}`);
  }
  lines.push(`- 근거가 뚜렷하지 않으면 피할 표현: ${st.avoid.join(", ")}`);
  lines.push("- 어휘는 방향만 정한다. 기록에 없는 성취·역량은 어떤 경우에도 만들지 않는다.");
  return lines;
}

/* ---------------- 규칙 기반 자동 추정 (AI 추정 전 임시 값) ---------------- */

const STRONG = /(확장|심화|연결|관계|비판|검토|제안|설계|가설|일반화|새로운\s*사례|스스로|주도|논리적|반박|오류를?\s*찾|다른\s*방법)/;
const APPLY = /(적용|설명|분석|비교|해석|근거|원리|예측|계산|추론|정리하여|요약|탐구)/;
const PARTICIPATE = /(참여|발표|질문|협력|도움|시도|수행|완성|제출)/;

/** 기록 한 건의 도달 신호 0~1 (내용이 없으면 null) */
export function recordSignal(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  let v = 0.35;
  if (PARTICIPATE.test(t)) v += 0.1;
  if (APPLY.test(t)) v += 0.2;
  if (STRONG.test(t)) v += 0.25;
  if (Array.from(t).length >= 40) v += 0.05;
  return Math.max(0.05, Math.min(0.95, v));
}

/**
 * 기록으로 도달 정도를 거칠게 추정한다. 최근 기록 가중치가 크다.
 * minRecords 미만이면 confidence low, 0건이면 none.
 */
export function estimateAchievement(records: Pick<NugaRecord, "note" | "memo" | "time" | "status">[], perfs: Pick<Performance, "excerpt" | "ocrText">[] = [], minRecords = 3): { value: number | null; confidence: Achievement["confidence"] } {
  const recs = records.filter((r) => r.status !== "skipped").sort((a, b) => a.time.localeCompare(b.time));
  const sig: { v: number; w: number }[] = [];
  recs.forEach((r, i) => { const v = recordSignal(r.note || r.memo || ""); if (v !== null) sig.push({ v, w: 1 + i / Math.max(1, recs.length) }); });
  for (const p of perfs) { const v = recordSignal(p.excerpt || p.ocrText.slice(0, 300)); if (v !== null) sig.push({ v, w: 1 }); }
  if (!sig.length) return { value: null, confidence: "none" };
  const mean = sig.reduce((a, s) => a + s.v * s.w, 0) / sig.reduce((a, s) => a + s.w, 0);
  return { value: clampScore(mean * 100), confidence: sig.length >= minRecords ? "ok" : "low" };
}

/** 학생의 자동값을 새로 계산해 넣는다 (교사 조정값은 그대로) */
export function withAutoAchievement(s: Student, records: Parameters<typeof estimateAchievement>[0], perfs: Parameters<typeof estimateAchievement>[1] = [], minRecords = 3): Student {
  const est = estimateAchievement(records, perfs, minRecords);
  const prev = migrateStudent(s).achievement;
  if (prev && prev.auto === est.value && prev.confidence === est.confidence) return migrateStudent(s);
  return { ...migrateStudent(s), achievement: { auto: est.value, manual: prev?.manual ?? null, confidence: est.confidence, byStandard: prev?.byStandard, updatedAt: new Date().toISOString() } };
}
