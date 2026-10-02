import {
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
