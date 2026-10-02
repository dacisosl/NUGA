import type { Draft, LengthMode, ReviewIssue, ReviewResult } from "./types";
import { countChars, lengthIn, lengthWindow, hasExplicitSubject, hasHonorific, isNominalEnding, similarity, splitSentences, suggestNominal } from "./text";
import { draftSpans, spanRatio } from "./highlight";

/** 기재 금지 사전. 정규식으로 매칭되며 사용자 설정으로 확장 가능. */
export const FORBIDDEN_TERMS: { group: string; terms: string[] }[] = [
  { group: "교외 활동·수상", terms: ["교외", "전국대회", "수상", "입상", "장려상", "금상", "은상", "동상", "최우수상", "우수상", "올림피아드", "경시대회", "공모전", "대상 수상", "표창"] },
  { group: "대학명", terms: ["서울대", "연세대", "고려대", "카이스트", "KAIST", "포스텍", "POSTECH", "성균관대", "한양대", "중앙대", "경희대", "이화여대", "서강대", "의대", "치대", "약대", "대학교", "대학 진학", "대학"] },
  { group: "부모 정보", terms: ["부모", "어머니", "아버지", "엄마", "아빠", "모친", "부친", "학부모", "가정 형편", "직업이"] },
  { group: "기관명", terms: ["학원", "재단", "협회", "연구소", "센터에서", "청소년수련관", "교육청", "시청", "구청"] },
];

export interface ReviewContext {
  /** 한도 (lengthMode 단위) */
  target: number;
  lengthMode: LengthMode;
  lengthBand?: [number, number];
  /** 도달 정도 (0~100, 없으면 null). 80 이상인데 분량이 모자라면 확인 필요 */
  achievement: number | null;
  recordCount: number;
  lowRecordThreshold: number;
  otherDrafts: { text: string; label: string }[];
  similarityThreshold: number;
  studentName?: string;
  extraForbidden?: string[];
}

export interface ReviewOutcome { result: ReviewResult; issues: ReviewIssue[] }

export function reviewText(text: string, sentences: Draft["sentences"] | null, ctx: ReviewContext): ReviewOutcome {
  const issues: ReviewIssue[] = [];
  const trimmed = text.trim();
  if (!trimmed) return { result: "none", issues: [{ kind: "empty", message: "저장된 초안 없음" }] };

  const sents = splitSentences(trimmed);

  // 1. 기재 금지
  const groups = [...FORBIDDEN_TERMS, ...(ctx.extraForbidden?.length ? [{ group: "사용자 지정", terms: ctx.extraForbidden }] : [])];
  sents.forEach((s, i) => {
    for (const g of groups) for (const t of g.terms) {
      if (s.includes(t)) { issues.push({ kind: "forbidden", message: `기재 금지(${g.group}): "${t}"`, sentenceIndex: i, span: t }); break; }
    }
  });

  // 2. 학생 이름 포함
  if (ctx.studentName && ctx.studentName.length >= 2) {
    sents.forEach((s, i) => { if (s.includes(ctx.studentName!)) issues.push({ kind: "name", message: "학생 이름이 포함됨", sentenceIndex: i, span: ctx.studentName }); });
  }

  // 3. 문장 유사(같은 반 다른 학생)
  sents.forEach((s, i) => {
    if (Array.from(s).length < 12) return;
    for (const o of ctx.otherDrafts) {
      for (const os of splitSentences(o.text)) {
        if (Array.from(os).length < 12) continue;
        const sim = similarity(s, os);
        if (sim >= ctx.similarityThreshold) { issues.push({ kind: "similar", message: `${o.label} 초안과 문장 유사 (${Math.round(sim * 100)}%)`, sentenceIndex: i, span: s }); return; }
      }
    }
  });

  // 4. 근거 없는 문장
  if (sentences && sentences.length) {
    sentences.forEach((s, i) => { if (!s.evidence || s.evidence.length === 0) issues.push({ kind: "noEvidence", message: "근거 기록이 없는 문장", sentenceIndex: i, span: s.text }); });
  }

  // 5. 어체
  sents.forEach((s, i) => {
    if (hasHonorific(s)) { issues.push({ kind: "honorific", message: "존칭·감탄 표현", sentenceIndex: i, span: s, suggestion: suggestNominal(s) || undefined }); return; }
    if (!isNominalEnding(s)) issues.push({ kind: "style", message: "명사형 종결이 아님", sentenceIndex: i, span: s, suggestion: suggestNominal(s) || undefined });
    if (hasExplicitSubject(s)) issues.push({ kind: "subject", message: "주어(학생) 표기", sentenceIndex: i, span: s });
  });

  // 6. 글자수
  const cc = countChars(trimmed);
  const len = lengthIn(trimmed, ctx.lengthMode);
  const { min, max } = lengthWindow(ctx.target, ctx.lengthBand);
  const u = ctx.lengthMode === "bytes" ? "B" : "자";
  if (len > max) issues.push({ kind: "length", message: `분량 초과 ${len}/${ctx.target}${u} (목표 ${min}~${max})` });
  else if (len < min) {
    if ((ctx.achievement ?? 0) >= 80) issues.push({ kind: "levelA", message: `도달 정도 높음 · 분량 미달 ${len}/${ctx.target}${u}` });
    else if (ctx.recordCount > ctx.lowRecordThreshold) issues.push({ kind: "length", message: `분량 미달 ${len}/${ctx.target}${u} (목표 ${min}~${max})` });
  }

  // 7. 평가 비중: 교사의 평가 표현이 많고 학생활동이 적으면 확인 필요
  if (cc.withoutSpaces >= 40) {
    const r = spanRatio(draftSpans(trimmed, sentences));
    const ev = r.evaluation / Math.max(1, r.total); const act = r.activity / Math.max(1, r.total);
    if (ev >= 0.3 && act < 0.4) issues.push({ kind: "evalHeavy", message: `평가 표현 비중이 높음 (활동 ${Math.round(act * 100)}% · 평가 ${Math.round(ev * 100)}%)` });
  }

  return { result: summarize(issues), issues };
}

export function summarize(issues: ReviewIssue[]): ReviewResult {
  if (issues.some((i) => i.kind === "empty")) return "none";
  if (issues.some((i) => ["forbidden", "similar", "noEvidence", "name"].includes(i.kind))) return "fix";
  if (issues.length) return "check";
  return "pass";
}

export const RESULT_LABEL: Record<ReviewResult, string> = { pass: "통과", check: "확인 필요", fix: "수정 권장", none: "미작성" };

export const ISSUE_LABEL: Record<ReviewIssue["kind"], string> = {
  forbidden: "기재 금지", similar: "문장 유사", noEvidence: "근거 없음", length: "글자수", style: "어체", honorific: "존칭·감탄", subject: "주어", name: "이름", levelA: "도달 높음·분량 미달", empty: "미작성", evalHeavy: "평가 비중",
};
