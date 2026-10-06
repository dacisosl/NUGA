import {
  SLOT_JSON_SCHEMA, SLOT_SYSTEM_PROMPT, assembleSlots, parseSlotResponse, planSlots, slotUserPrompt,
  ACH_JSON_SCHEMA, ACH_SYSTEM_PROMPT, achUserPrompt, parseAchResponse, achievementFromSignals, anonymizeRecords,
  type NugaRecord, type Standard,
  SUGGEST_JSON_SCHEMA, SUGGEST_SYSTEM_PROMPT, parseSuggestResponse, ruleSuggestions, scrubTranscriptNames, suggestUserPrompt, topicKeywords,
  type CategoryDef, type Suggestion, type Transcript,
  DRAFT_JSON_SCHEMA, DRAFT_JSON_SCHEMA_LITE, DraftFormatError, LLMError, LABEL_JSON_SCHEMA, LABEL_SYSTEM_PROMPT, PROVIDER_INFO, generateLocalDraft, labelUserPrompt, parseDraftResponse, parseLabelResponse, systemPrompt, userPrompt,
  type AiProvider, type AiSettings, type DraftRequest, type DraftResponse, type DraftSpan,
} from "@nuga/core";
import { generateJson, providerFor } from "./providers";

/** provider "rules" = AI 없이 규칙 기반 생성기 */
export interface DraftProviderResult extends DraftResponse { provider: AiProvider | "rules"; model?: string }

/** 초안 생성. AI 가 꺼져 있거나 키가 없으면 규칙 기반 생성기로 동작. 요청 본문에는 반·번호·이름이 없다. */
export async function generateDraft(req: DraftRequest, ai: AiSettings, opts?: { guide?: string; signal?: AbortSignal }): Promise<DraftProviderResult> {
  const prov = providerFor(ai);
  if (!prov) return { ...generateLocalDraft(req), provider: "rules" };
  const staged = ai.pipeline === "on" || ((ai.pipeline ?? "auto") === "auto" && prov.id === "local");
  // 수정 요청(대화)은 한 번에 처리하고, 새로 만들 때만 단계형으로 쓴다
  if (staged && !req.draft) {
    const slots = planSlots(req);
    if (slots.length) {
      const texts: string[] = [];
      for (const slot of slots) {
        const t = await generateJson(prov, {
          system: SLOT_SYSTEM_PROMPT, user: slotUserPrompt(slot, req, texts), schema: SLOT_JSON_SCHEMA as unknown as Record<string, unknown>, schemaName: "sentence",
          maxTokens: 512, signal: opts?.signal,
        }, parseSlotResponse);
        texts.push(t);
      }
      const out = assembleSlots(slots, texts, req);
      return { ...out, provider: prov.id, model: `${prov.model} · 단계형 ${slots.length}문장` };
    }
  }
  // 잘리거나 읽지 못하면 구간(spans) 없는 가벼운 형식으로 한 번 더 (구간은 앱이 규칙으로 나눈다)
  let parsed: DraftResponse;
  try { parsed = await askDraft(prov, req, opts, false); }
  catch (e) {
    if (!retryable(e)) throw e;
    parsed = await askDraft(prov, req, opts, true);
  }
  return { ...parsed, provider: prov.id, model: prov.model };
}

/**
 * 초안 응답 길이 한도: 아주 넉넉하게 (생각하는 모델은 생각도 한도에 든다. 실제 초안은 몇천 토큰이면 된다).
 * 모델이 그만큼 받지 못한다고 하면(400) 한 단계씩 낮춰 다시. 이 PC 의 로컬 모델은 문맥이 짧아 낮게
 */
const DRAFT_TOKEN_CAPS: Record<AiProvider, number[]> = {
  gemini: [65536, 32768, 16384],
  anthropic: [64000, 32000, 16000],
  openrouter: [65536, 32000, 16000],
  local: [8192],
};
/** 요청한 길이 한도를 모델이 받지 못함 (예: 'max_tokens: 65536 > 64000') */
const capRejected = (e: unknown) => e instanceof LLMError && e.kind === "format" && /max[_\s-]*(output[_\s-]*)?tokens|maxOutputTokens|output token/i.test(e.message);
const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((res, rej) => {
  const t = window.setTimeout(res, ms);
  signal?.addEventListener("abort", () => { window.clearTimeout(t); rej(new Error("취소됨")); }, { once: true });
});

/**
 * 초안 한 번 묻기. 요청 한도 초과 · 연결 끊김 · 서버 과부하는 잠시(5초 · 15초) 기다렸다가 같은 요청을 다시 —
 * 일괄 생성처럼 연달아 보낼 때 몇 명이 그냥 실패하지 않게
 */
async function askDraft(prov: NonNullable<ReturnType<typeof providerFor>>, req: DraftRequest, opts: { guide?: string; signal?: AbortSignal } | undefined, lite: boolean): Promise<DraftResponse> {
  let lastErr: unknown;
  for (const cap of DRAFT_TOKEN_CAPS[prov.id]) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await generateJson(prov, {
          system: systemPrompt(opts?.guide, { spans: !lite }), user: userPrompt(req),
          schema: (lite ? DRAFT_JSON_SCHEMA_LITE : DRAFT_JSON_SCHEMA) as unknown as Record<string, unknown>, schemaName: "draft",
          maxTokens: cap, signal: opts?.signal,
        }, parseDraftResponse);
      } catch (e) {
        lastErr = e;
        if (e instanceof LLMError && (e.kind === "rate" || e.kind === "network" || e.kind === "server") && attempt < 2) { await sleep(attempt ? 15_000 : 5_000, opts?.signal); continue; }
        if (capRejected(e)) break; // 다음(더 낮은) 한도로
        throw e;
      }
    }
  }
  throw lastErr;
}

/** 다시 물어볼 만한 실패: 길이 한도에서 잘림 · 초안 형식이 아님 */
function retryable(e: unknown): boolean {
  return e instanceof DraftFormatError || e instanceof SyntaxError || (e instanceof LLMError && (e.kind === "length" || (e.kind === "format" && !capRejected(e))));
}

/** 초안 만들기 실패를 교사가 읽을 말로 */
export function aiErrorText(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (retryable(e)) return `${m} — 두 번 시도했지만 AI 응답을 끝까지 받지 못했습니다. 잠시 뒤 다시 시도하거나, 체크한 기록을 줄이거나, 설정 → AI 에서 다른 모델을 골라 보세요.`;
  return m;
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
