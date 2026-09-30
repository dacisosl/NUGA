import Anthropic from "@anthropic-ai/sdk";
import { DRAFT_JSON_SCHEMA, generateLocalDraft, parseDraftResponse, systemPrompt, userPrompt, type AiSettings, type DraftRequest, type DraftResponse } from "@nuga/core";

export interface DraftProviderResult extends DraftResponse { provider: "anthropic" | "local"; model?: string }

/** 초안 생성. AI 설정이 꺼져 있거나 키가 없으면 로컬 규칙 생성기로 동작. 요청 본문에는 반·번호·이름이 없다. */
export async function generateDraft(req: DraftRequest, ai: AiSettings, opts?: { guide?: string; signal?: AbortSignal }): Promise<DraftProviderResult> {
  const signal = opts?.signal;
  if (!ai.enabled || ai.provider !== "anthropic" || !ai.apiKey.trim()) {
    return { ...generateLocalDraft(req), provider: "local" };
  }
  const client = new Anthropic({ apiKey: ai.apiKey.trim(), dangerouslyAllowBrowser: true, maxRetries: 2, timeout: 120_000 });
  const model = ai.model || "claude-opus-5-5";
  const base = {
    model,
    max_tokens: 4096,
    system: systemPrompt(opts?.guide),
    messages: [{ role: "user" as const, content: userPrompt(req) }],
  };
  let text = "";
  try {
    const res = await client.messages.create(
      { ...base, output_config: { format: { type: "json_schema", schema: DRAFT_JSON_SCHEMA as unknown as Record<string, unknown> } } } as unknown as Anthropic.MessageCreateParamsNonStreaming,
      { signal },
    );
    if (res.stop_reason === "refusal") throw new Error("모델이 요청을 거절함");
    text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
  } catch (e) {
    if (e instanceof Anthropic.BadRequestError) {
      // 구조화 출력 미지원 시 일반 텍스트 응답으로 재시도
      const res = await client.messages.create(base, { signal });
      text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
    } else if (e instanceof Anthropic.AuthenticationError) {
      throw new Error("API 키가 올바르지 않음");
    } else if (e instanceof Anthropic.RateLimitError) {
      throw new Error("요청 한도 초과, 잠시 후 다시 시도");
    } else if (e instanceof Anthropic.APIConnectionError) {
      throw new Error("API 연결 실패 (네트워크 확인)");
    } else throw e;
  }
  const parsed = parseDraftResponse(text);
  return { ...parsed, provider: "anthropic", model };
}

/** 전송될 내용 미리보기(설정 화면용) */
export function previewPayload(req: DraftRequest, guide?: string): string {
  return `[system]\n${systemPrompt(guide)}\n\n[user]\n${userPrompt(req)}`;
}
