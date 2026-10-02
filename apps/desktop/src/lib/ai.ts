import {
  ACH_JSON_SCHEMA, ACH_SYSTEM_PROMPT, achUserPrompt, parseAchResponse, achievementFromSignals, anonymizeRecords,
  type NugaRecord, type Standard,
  SUGGEST_JSON_SCHEMA, SUGGEST_SYSTEM_PROMPT, parseSuggestResponse, ruleSuggestions, scrubTranscriptNames, suggestUserPrompt, topicKeywords,
  type CategoryDef, type Suggestion, type Transcript,
  DRAFT_JSON_SCHEMA, LABEL_JSON_SCHEMA, LABEL_SYSTEM_PROMPT, PROVIDER_INFO, generateLocalDraft, labelUserPrompt, parseDraftResponse, parseLabelResponse, systemPrompt, userPrompt,
  type AiProvider, type AiSettings, type DraftRequest, type DraftResponse, type DraftSpan,
} from "@nuga/core";
import { generateJson, providerFor } from "./providers";

/** provider "rules" = AI 없이 규칙 기반 생성기 */
export interface DraftProviderResult extends DraftResponse { provider: AiProvider | "rules"; model?: string }

/** 초안 생성. AI 가 꺼져 있거나 키가 없으면 규칙 기반 생성기로 동작. 요청 본문에는 반·번호·이름이 없다. */
export async function generateDraft(req: DraftRequest, ai: AiSettings, opts?: { guide?: string; signal?: AbortSignal }): Promise<DraftProviderResult> {
  const prov = providerFor(ai);
  if (!prov) return { ...generateLocalDraft(req), provider: "rules" };
  const parsed = await generateJson(prov, {
    system: systemPrompt(opts?.guide), user: userPrompt(req), schema: DRAFT_JSON_SCHEMA as unknown as Record<string, unknown>, schemaName: "draft",
    maxTokens: 8192, signal: opts?.signal,
  }, parseDraftResponse);
  return { ...parsed, provider: prov.id, model: prov.model };
}

/** 전송될 내용 미리보기(설정 화면용) */
export function previewPayload(req: DraftRequest, guide?: string): string {
  return `[system]\n${systemPrompt(guide)}\n\n[user]\n${userPrompt(req)}`;
}

export function aiReady(ai: AiSettings): boolean { return !!providerFor(ai); }

/** 지금 쓰는 제공자 이름 (화면 표시용) */
export function aiLabel(ai: AiSettings): string {
  const p = providerFor(ai);
  return p ? `${PROVIDER_INFO[p.id].label} · ${p.model}` : "규칙 기반 (AI 꺼짐)";
}

/** 문장마다 학생활동·역량·교사의 평가 구간을 AI 로 다시 나눈다. 검증에 실패한 문장은 undefined. */
export async function labelDraft(sentences: string[], ai: AiSettings): Promise<(DraftSpan[] | undefined)[]> {
  const prov = providerFor(ai);
  if (!prov) throw new Error("AI가 꺼져 있어 규칙으로 구별합니다");
  return generateJson(prov, {
    system: LABEL_SYSTEM_PROMPT, user: labelUserPrompt(sentences), schema: LABEL_JSON_SCHEMA as unknown as Record<string, unknown>, schemaName: "labels", maxTokens: 8192,
  }, (t) => parseLabelResponse(t, sentences));
}

/**
 * 수업 스크립트에서 추천 카드 만들기. AI 가 켜져 있으면 LLM 판별(이름은 ○○○로 가려 보냄), 아니면 규칙.
 * LLM 이 실패하면 규칙 결과를 돌려준다.
 */
export async function suggestFromTranscript(tr: Transcript, opts: { ai: AiSettings; categories: CategoryDef[]; topic?: string; names: string[]; max: number }): Promise<{ items: Suggestion[]; by: string; error?: string }> {
  const rules = ruleSuggestions(tr, { categories: opts.categories, topicKeywords: topicKeywords(opts.topic || ""), max: opts.max });
  const prov = providerFor(opts.ai);
  if (!prov) return { items: rules, by: "규칙" };
  try {
    const safe = scrubTranscriptNames(tr, opts.names);
    const items = await generateJson(prov, {
      system: SUGGEST_SYSTEM_PROMPT, user: suggestUserPrompt(safe, { topic: opts.topic, categories: opts.categories, max: opts.max }),
      schema: SUGGEST_JSON_SCHEMA as unknown as Record<string, unknown>, schemaName: "suggestions", maxTokens: 4096,
    }, (t) => parseSuggestResponse(t, tr, opts.categories, opts.max));
    return { items, by: `${PROVIDER_INFO[prov.id].label} · ${prov.model}` };
  } catch (e) {
    return { items: rules, by: "규칙", error: e instanceof Error ? e.message : "AI 추천 실패" };
  }
}

/** AI 로 기록별 도달 신호를 추정해 학생 도달 정도(자동값)를 만든다. 반·번호·이름은 보내지 않는다. */
export async function estimateAchievementAI(records: NugaRecord[], standards: Standard[], categories: CategoryDef[], ai: AiSettings) {
  const prov = providerFor(ai);
  if (!prov) throw new Error("AI가 꺼져 있습니다");
  const anon = anonymizeRecords(records.filter((r) => r.status !== "skipped"), categories);
  if (!anon.length) return { value: null, confidence: "none" as const, byStandard: {} };
  const signals = await generateJson(prov, {
    system: ACH_SYSTEM_PROMPT, user: achUserPrompt(anon, standards), schema: ACH_JSON_SCHEMA as unknown as Record<string, unknown>, schemaName: "signals", maxTokens: 4096,
  }, (t) => parseAchResponse(t, anon.map((r) => r.id)));
  const timeOf = new Map(records.map((r) => [r.id, r.time]));
  return achievementFromSignals(signals.map((x) => ({ ...x, time: timeOf.get(x.id) || "" })));
}
