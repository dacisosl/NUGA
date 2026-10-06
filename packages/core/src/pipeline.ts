import type { DraftRequest, DraftResponse, AnonRecord, AnonPerf } from "./draft";
import type { DraftSentence } from "./types";
import { achievementGuide } from "./achievement";
import { approxCharsForBytes, lengthIn, lengthWindow } from "./text";

/**
 * 단계형 생성 파이프라인 (v3 17.3) — 작은 로컬 모델(3~4B)용.
 * 1) 근거 정리: 내용 있는 기록·PDF기록만, 같은 주제끼리 묶음
 * 2) 문장 계획(규칙): 목표 분량 ÷ 문장당 분량 = 문장 수, 슬롯마다 근거 id 배정 (강조 카테고리 먼저, 카테고리 편중 방지)
 * 3) 슬롯별 생성: 문장 하나씩 짧은 프롬프트로 (작은 모델도 지시를 잘 지키게)
 * 4) 연결: 문장을 이어 붙이고 한도를 넘으면 뒤 슬롯부터 뺀다
 * 5) 반영도 점검·재생성은 앱이 한다 (adherence.ts)
 */
export interface Slot { index: number; evidence: (AnonRecord | AnonPerf)[]; targetChars: number; role: "open" | "body" | "close" }

const isRecord = (x: AnonRecord | AnonPerf): x is AnonRecord => (x as AnonRecord).category !== undefined;

/** 문장 하나의 목표 길이(공백 포함 글자) */
export function sentenceTarget(req: DraftRequest): number {
  return req.guide?.sentenceLength && req.guide.sentenceLength > 15 ? req.guide.sentenceLength : 70;
}

/** 목표 분량(글자 환산) */
export function targetChars(req: DraftRequest): number {
  const { max } = lengthWindow(req.targetLength, req.lengthBand);
  return req.lengthMode === "bytes" ? approxCharsForBytes(max) : max;
}

export function planSlots(req: DraftRequest): Slot[] {
  const recs = req.records.filter((r) => r.text.trim());
  const items: (AnonRecord | AnonPerf)[] = [...recs, ...req.performance];
  if (!items.length) return [];
  const per = sentenceTarget(req);
  const n = Math.max(1, Math.min(items.length, Math.round(targetChars(req) / (per + 2))));
  // 강조 카테고리 먼저, 그다음 날짜 순. 카테고리가 한쪽에 몰리지 않게 돌아가며 배정
  const emph = new Set(req.guide?.emphasize || []);
  const byCat = new Map<string, (AnonRecord | AnonPerf)[]>();
  for (const it of items) { const c = isRecord(it) ? it.category : "PDF기록"; byCat.set(c, [...(byCat.get(c) || []), it]); }
  const cats = [...byCat.keys()].sort((a, b) => (emph.has(b) ? 1 : 0) - (emph.has(a) ? 1 : 0) || (byCat.get(b)!.length - byCat.get(a)!.length));
  const order: (AnonRecord | AnonPerf)[] = [];
  while (order.length < items.length) for (const c of cats) { const q = byCat.get(c)!; if (q.length) order.push(q.shift()!); }
  const slots: Slot[] = Array.from({ length: n }, (_, i) => ({ index: i, evidence: [], targetChars: per, role: i === 0 ? "open" : i === n - 1 && n > 2 ? "close" : "body" }));
  order.forEach((it, k) => slots[k % n].evidence.push(it));
  // 같은 수업 주제끼리 한 슬롯에 모이도록 슬롯 안을 날짜 순으로
  for (const s of slots) s.evidence.sort((a, b) => ((a as AnonRecord).date || "").localeCompare((b as AnonRecord).date || ""));
  return slots.filter((s) => s.evidence.length);
}

export const SLOT_SYSTEM_PROMPT = [
  "너는 학교생활기록부 문장을 한 문장씩 쓰는 보조자다.",
  "- 사실(활동·행동·결과·반응)은 주어진 관찰 기록에 있는 것만 쓴다. 기록에 없는 행동·결과·감정·진로를 만들지 않는다.",
  "- 해석은 적극적으로: 기록된 행동이 보여 주는 역량·태도를 이름 붙이고, 교사의 평가를 근거의 양에 맞게 덧붙인다.",
  "- 명사형 종결(~함, ~임, ~보임)로 끝낸다. 주어(학생, 이름)를 쓰지 않는다. 존칭·감탄을 쓰지 않는다.",
  "- 활동(어떤 주제·과제에서) · 세부 행동(무엇을 어떻게 했는지, 기록에 적힌 방법·근거·결과) · 드러난 역량을 한 문장에 담는다. 활동 이름만 쓰고 끝내지 않는다.",
  "- 역량은 기록에 적힌 행동에서 이끌어 낸다 (예: 근거를 들어 설명함 → 논리적으로 설명하는 능력, 그래프로 정리하고 해석함 → 자료 해석 능력). 행동 근거가 약하면 행동까지만 쓴다.",
  "- 문장 틀 예 (구조만): '[주제] 활동에서 [세부 행동]하며 [역량]을 보여줌.'",
  "- 문장의 자리에 맞춘다. 도입 = 학생의 학습 성향을 행동과 함께 제시하고 평가, 본문 = 활동 · 세부 행동 · 역량, 마무리 = 앞 문장을 종합해 대표 역량과 학습자상을 평가.",
  "- 단원·차시 번호, 대학명, 교외 수상, 부모 정보는 쓰지 않는다.",
  '- 출력은 JSON 하나: {"text": "문장"}',
].join("\n");

export const SLOT_JSON_SCHEMA = { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false } as const;

export function slotUserPrompt(slot: Slot, req: DraftRequest, prev: string[]): string {
  const lines = [
    `[영역] ${req.subject || "(미지정)"}`,
    `[문장 길이] 공백 포함 ${slot.targetChars}자 안팎, 한 문장`,
    "[표현 방향]", ...achievementGuide(req.achievement),
  ];
  if (req.styleGuide) lines.push(`[학교급 문체] ${req.styleGuide}`);
  const g = req.guide;
  if (g?.avoid?.length) lines.push(`[쓰지 말 표현] ${g.avoid.join(", ")}`);
  if (g?.mustInclude?.length && slot.index === 0) lines.push(`[가능하면 넣을 표현] ${g.mustInclude.join(", ")}`);
  if (g?.note?.trim()) lines.push(`[교사 지침] ${g.note.trim()}`);
  lines.push("", "[이 문장에 쓸 기록]");
  for (const e of slot.evidence) {
    if (isRecord(e)) lines.push(`- ${e.date} | ${e.category} | ${e.topic || "-"} | ${e.text}`);
    else lines.push(`- PDF기록 '${e.title}' | ${e.excerpt}`);
  }
  // 도입은 학생 전체의 성향을 말해야 하므로 다른 기록도 짧게 보여 준다 (사실은 이 문장의 기록에서만)
  if (slot.role === "open") {
    const others = req.records.filter((r) => r.text.trim() && !slot.evidence.some((e) => e.id === r.id)).slice(0, 8);
    if (others.length) { lines.push("", "[이 학생의 다른 기록] (성향을 가늠하는 데만 쓰고 이 문장에 옮기지 않음)"); for (const r of others) lines.push(`- ${r.text}`); }
  }
  const prevShown = slot.role === "close" ? prev : prev.slice(-2);
  if (prevShown.length) { lines.push("", "[앞 문장들] (같은 표현·같은 역량을 되풀이하지 말 것)"); for (const p of prevShown) lines.push(`- ${p}`); }
  const ask = slot.role === "open"
    ? "[요청] 도입 문장을 써줘: 이 기록의 행동을 근거로, 이 학생의 학습 성향이나 강점을 역량 이름과 교사의 평가로 제시한다. (예 구조: '[행동]하는 모습을 통해 [역량]이 돋보이는 학생임.')"
    : slot.role === "close"
      ? "[요청] 마무리 문장을 써줘: 이 기록의 행동을 담으면서 앞 문장들을 종합해 대표 역량과 학습자상을 교사의 평가로 맺는다. (예 구조: '[행동]하는 과정에서 [역량]이 돋보이며, [특성]한 학습자임.')"
      : "[요청] 본문 문장을 써줘: 수업 주제 → 구체적 행동 → 그 행동이 보여 주는 역량 순으로, 앞 문장과 다른 역량을 드러낸다.";
  lines.push("", ask);
  return lines.join("\n");
}

export function parseSlotResponse(raw: string): string {
  let t = raw.trim();
  try { const j = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)); if (typeof j.text === "string") t = j.text; } catch { /* JSON 이 아니면 원문 */ }
  t = t.replace(/^["'“”\s-]+|["'“”\s]+$/g, "").split(/\n/)[0].trim();
  if (t && !/[.]$/.test(t)) t += ".";
  return t;
}

/** 슬롯 문장들을 이어 붙이고 한도를 넘으면 뒤에서부터 뺀다 */
export function assembleSlots(slots: Slot[], texts: string[], req: DraftRequest): DraftResponse {
  const { max } = lengthWindow(req.targetLength, req.lengthBand);
  const kept: DraftSentence[] = [];
  slots.forEach((s, i) => { const t = (texts[i] || "").trim(); if (t) kept.push({ text: t, evidence: s.evidence.map((e) => e.id) }); });
  const checks: string[] = [];
  while (kept.length > 1 && lengthIn(kept.map((k) => k.text).join(" "), req.lengthMode) > max) { kept.pop(); checks.push("분량 한도 때문에 마지막 문장을 뺐습니다."); }
  const text = kept.map((k) => k.text).join(" ");
  return { text, sentences: kept, checks };
}
