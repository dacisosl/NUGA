import type { AiProvider } from "./types";

/**
 * AI 제공자 공통 계층.
 * 모든 제공자는 같은 일을 한다: system·user 프롬프트와 JSON 스키마를 받아 JSON 문자열을 돌려준다.
 * 요청 본문을 만드는 일과 응답에서 글을 꺼내는 일은 여기(순수 함수)에 두고, 실제 전송은 앱(fetch·SDK)이 한다.
 */
export type JsonSchema = Record<string, unknown>;

export interface LLMRequest {
  system: string;
  user: string;
  /** 응답 JSON 스키마 (없으면 자유 응답) */
  schema?: JsonSchema;
  schemaName?: string;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface LLMProvider {
  id: AiProvider;
  model: string;
  /** 모델의 원문 응답(JSON 문자열 기대) */
  generate(req: LLMRequest): Promise<string>;
}

export interface ProviderInfo {
  label: string;
  /** 짧은 설명 (설정 화면) */
  desc: string;
  defaultModel: string;
  /** 고를 수 있는 모델 예시 (직접 입력도 가능) */
  models: string[];
  needsKey: boolean;
  keyHint: string;
  keyUrl?: string;
  /** 데이터가 어디로 가는지 */
  where: string;
}

export const PROVIDER_INFO: Record<AiProvider, ProviderInfo> = {
  anthropic: {
    label: "Claude (Anthropic)", desc: "문체·지시 준수가 가장 안정적", defaultModel: "claude-opus-5-5",
    models: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-4-5"], needsKey: true, keyHint: "sk-ant-…",
    keyUrl: "https://console.anthropic.com/settings/keys", where: "Anthropic API (미국)",
  },
  gemini: {
    label: "Gemini (Google)", desc: "음성 변환(폰)과 같은 키를 쓸 수 있음", defaultModel: "gemini-2.5-flash",
    models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-3-flash-preview", "gemini-3-pro-preview"], needsKey: true, keyHint: "AIza…",
    keyUrl: "https://aistudio.google.com/apikey", where: "Google Gemini API — 유료 등급 키는 학습에 쓰이지 않음",
  },
  openrouter: {
    label: "OpenRouter", desc: "여러 회사 모델을 한 키로 비교", defaultModel: "google/gemini-2.5-flash",
    models: ["google/gemini-2.5-flash", "anthropic/claude-sonnet-4.5", "openai/gpt-5-mini", "qwen/qwen3-235b-a22b"], needsKey: true, keyHint: "sk-or-…",
    keyUrl: "https://openrouter.ai/keys", where: "OpenRouter 경유 각 모델 회사 (데이터 수집 거부 옵션으로 전송)",
  },
  local: {
    label: "로컬 LLM (이 PC)", desc: "인터넷 없이 이 PC에서 실행 (llama-server)", defaultModel: "local",
    models: ["local"], needsKey: false, keyHint: "",
    where: "이 PC 안에서만 처리 (외부 전송 없음)",
  },
};

export const PROVIDER_ORDER: AiProvider[] = ["anthropic", "gemini", "openrouter", "local"];

export const DEFAULT_LOCAL_URL = "http://127.0.0.1:8080";

/* ---------------- 스키마 변환 ---------------- */

/** Gemini responseSchema(OpenAPI 부분집합): additionalProperties 를 지우고 type 은 대문자(OBJECT·STRING…)로 */
export function toGeminiSchema(schema: JsonSchema): JsonSchema {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (k === "additionalProperties" || k === "$schema") continue;
        out[k] = k === "type" && typeof x === "string" ? x.toUpperCase() : walk(x);
      }
      return out;
    }
    return v;
  };
  return walk(schema) as JsonSchema;
}

/* ---------------- 요청 본문 ---------------- */

export function geminiBody(req: LLMRequest): Record<string, unknown> {
  return {
    systemInstruction: { parts: [{ text: req.system }] },
    contents: [{ role: "user", parts: [{ text: req.user }] }],
    generationConfig: {
      maxOutputTokens: req.maxTokens ?? 8192,
      temperature: 0.4,
      ...(req.schema ? { responseMimeType: "application/json", responseSchema: toGeminiSchema(req.schema) } : {}),
    },
  };
}

/** OpenAI 호환(OpenRouter·llama-server) chat/completions 본문 */
export function openAiBody(req: LLMRequest, model: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    model,
    max_tokens: req.maxTokens ?? 4096,
    temperature: 0.4,
    messages: [{ role: "system", content: req.system }, { role: "user", content: req.user }],
    ...(req.schema ? { response_format: { type: "json_schema", json_schema: { name: req.schemaName || "result", strict: true, schema: req.schema } } } : {}),
    ...extra,
  };
}

/* ---------------- 응답 해석 ---------------- */

export class LLMError extends Error {
  /** length = 응답 길이 한도에서 잘림 (생각하는 모델은 생각도 한도에 든다) */
  constructor(message: string, public kind: "auth" | "rate" | "network" | "refusal" | "format" | "length" | "server" | "other" = "other") { super(message); }
}

export function geminiText(json: unknown): string {
  const j = json as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[]; promptFeedback?: { blockReason?: string } };
  if (j.promptFeedback?.blockReason) throw new LLMError(`요청이 차단됨 (${j.promptFeedback.blockReason})`, "refusal");
  const c = j.candidates?.[0];
  if (!c) throw new LLMError("응답이 비어 있음", "format");
  if (c.finishReason && ["SAFETY", "RECITATION", "PROHIBITED_CONTENT", "BLOCKLIST"].includes(c.finishReason)) throw new LLMError(`응답이 차단됨 (${c.finishReason})`, "refusal");
  const text = (c.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || "").join("");
  // 한도에서 잘리면 앞부분이 있어도 끝(JSON 닫는 괄호)이 없다 — 받은 척하지 않고 잘렸다고 알린다
  if (c.finishReason === "MAX_TOKENS") throw new LLMError("응답이 길이 한도에서 잘림", "length");
  if (!text.trim()) throw new LLMError("응답이 비어 있음", "format");
  return text;
}

export function openAiText(json: unknown): string {
  const j = json as { choices?: { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }[]; error?: { message?: string } };
  if (j.error?.message) throw new LLMError(j.error.message, "server");
  const c = j.choices?.[0];
  if (!c) throw new LLMError("응답이 비어 있음", "format");
  if (c.message?.refusal) throw new LLMError("모델이 요청을 거절함", "refusal");
  const text = c.message?.content || "";
  if (c.finish_reason === "length") throw new LLMError("응답이 길이 한도에서 잘림", "length");
  if (!text.trim()) throw new LLMError("응답이 비어 있음", "format");
  return text;
}

/** HTTP 상태를 교사가 읽을 수 있는 오류로 */
export function httpError(status: number, body: string, provider: AiProvider): LLMError {
  const label = PROVIDER_INFO[provider].label;
  let msg = "";
  try { const j = JSON.parse(body); msg = j.error?.message || j.message || ""; } catch { msg = body.slice(0, 160); }
  if (status === 401 || status === 403) return new LLMError(`${label}: API 키가 올바르지 않거나 권한이 없음`, "auth");
  if (status === 429) return new LLMError(`${label}: 요청 한도 초과, 잠시 후 다시 시도`, "rate");
  if (status === 402) return new LLMError(`${label}: 크레딧 부족`, "auth");
  if (status >= 500) return new LLMError(`${label}: 서버 오류 (${status})`, "server");
  return new LLMError(`${label}: ${msg || `요청 실패 (${status})`}`, status === 400 ? "format" : "other");
}

/** 응답에서 JSON 부분만 꺼낸다 (코드 블록·앞뒤 설명 제거) */
export function extractJson(text: string): string {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const a = t.indexOf("{"); const b = t.lastIndexOf("}");
  return a >= 0 && b > a ? t.slice(a, b + 1) : t;
}
