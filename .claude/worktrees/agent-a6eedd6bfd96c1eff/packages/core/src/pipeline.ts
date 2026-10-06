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
  "- 주어진 관찰 기록에 있는 사실만으로 한 문장을 쓴다. 기록에 없는 행동·역량·감정·진로를 만들지 않는다.",
  "- 명사형 종결(~함, ~임, ~보임)로 끝낸다. 주어(학생, 이름)를 쓰지 않는다. 존칭·감탄을 쓰지 않는다.",
  "- 학생이 실제로 한 행동을 먼저 쓰고, 기록에 드러난 경우에만 그 행동이 보여 주는 역량을 짧게 덧붙인다.",
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
  if (prev.length) { lines.push("", "[앞 문장들] (같은 표현을 되풀이하지 말 것)"); for (const p of prev.slice(-2)) lines.push(`- ${p}`); }
  lines.push("", slot.role === "open" ? "[요청] 이 기록으로 첫 문장을 써줘." : "[요청] 이 기록으로 다음 문장을 써줘.");
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
