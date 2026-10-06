import Anthropic from "@anthropic-ai/sdk";
import {
  DEFAULT_LOCAL_URL, LLMError, PROVIDER_INFO, extractJson, geminiBody, geminiText, httpError, openAiBody, openAiText,
  type AiProvider, type AiSettings, type LLMProvider, type LLMRequest,
} from "@nuga/core";
import { getKey } from "./secrets";

/** 제공자별 모델 이름 (설정에 없으면 기본값) */
export function modelOf(ai: AiSettings, p: AiProvider): string {
  return ai.models?.[p] || (p === "anthropic" ? ai.model : "") || PROVIDER_INFO[p].defaultModel;
}

async function postJson(url: string, body: unknown, headers: Record<string, string>, provider: AiProvider, signal?: AbortSignal): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body), signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new LLMError(provider === "local" ? "로컬 LLM에 연결할 수 없음 (llama-server 실행·주소 확인)" : `${PROVIDER_INFO[provider].label}: 연결 실패 (네트워크 확인)`, "network");
  }
  const text = await res.text();
  if (!res.ok) throw httpError(res.status, text, provider);
  try { return JSON.parse(text); } catch { throw new LLMError("응답을 읽을 수 없음", "format"); }
}

function anthropicProvider(model: string): LLMProvider {
  return {
    id: "anthropic", model,
    async generate(req: LLMRequest) {
      const client = new Anthropic({ apiKey: getKey("anthropic"), dangerouslyAllowBrowser: true, maxRetries: 2, timeout: 120_000 });
      const base = { model, max_tokens: req.maxTokens ?? 4096, system: req.system, messages: [{ role: "user" as const, content: req.user }] };
      const textOf = (res: Anthropic.Message) => {
        if (res.stop_reason === "refusal") throw new LLMError("모델이 요청을 거절함", "refusal");
        return res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
      };
      try {
        const params = req.schema ? { ...base, output_config: { format: { type: "json_schema", schema: req.schema } } } : base;
        return textOf(await client.messages.create(params as unknown as Anthropic.MessageCreateParamsNonStreaming, { signal: req.signal }));
      } catch (e) {
        if (e instanceof Anthropic.BadRequestError && req.schema) return textOf(await client.messages.create(base, { signal: req.signal })); // 구조화 출력 미지원 모델
        if (e instanceof Anthropic.AuthenticationError) throw new LLMError("Claude: API 키가 올바르지 않음", "auth");
        if (e instanceof Anthropic.RateLimitError) throw new LLMError("Claude: 요청 한도 초과, 잠시 후 다시 시도", "rate");
        if (e instanceof Anthropic.APIConnectionError) throw new LLMError("Claude: 연결 실패 (네트워크 확인)", "network");
        throw e;
      }
    },
  };
}

function geminiProvider(model: string): LLMProvider {
  return {
    id: "gemini", model,
    async generate(req) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      const headers = { "x-goog-api-key": getKey("gemini") };
      try {
        return geminiText(await postJson(url, geminiBody(req), headers, "gemini", req.signal));
      } catch (e) {
        // 스키마를 받지 못하는 모델이면 JSON 모드만으로 다시 시도
        if (e instanceof LLMError && e.kind === "format" && req.schema) {
          const body = geminiBody({ ...req, schema: undefined }) as { generationConfig: Record<string, unknown> };
          body.generationConfig.responseMimeType = "application/json";
          return geminiText(await postJson(url, body, headers, "gemini", req.signal));
        }
        throw e;
      }
    },
  };
}

function openRouterProvider(model: string): LLMProvider {
  return {
    id: "openrouter", model,
    async generate(req) {
      const headers = { authorization: `Bearer ${getKey("openrouter")}`, "X-Title": "Nuga" };
      // 데이터 수집(학습)을 하는 공급자는 쓰지 않는다
      const extra = { provider: { data_collection: "deny", require_parameters: !!req.schema } };
      try {
        return openAiText(await postJson("https://openrouter.ai/api/v1/chat/completions", openAiBody(req, model, extra), headers, "openrouter", req.signal));
      } catch (e) {
        if (e instanceof LLMError && e.kind === "format" && req.schema) {
          const body = openAiBody({ ...req, schema: undefined }, model, { provider: { data_collection: "deny" }, response_format: { type: "json_object" } });
          return openAiText(await postJson("https://openrouter.ai/api/v1/chat/completions", body, headers, "openrouter", req.signal));
        }
        throw e;
      }
    },
  };
}

function localProvider(model: string, baseUrl: string): LLMProvider {
  return {
    id: "local", model,
    async generate(req) {
      const url = `${baseUrl.replace(/\/+$/, "")}/v1/chat/completions`;
      // llama-server 는 response_format.json_schema 를 문법(GBNF)으로 바꿔 강제한다
      return openAiText(await postJson(url, openAiBody(req, model), {}, "local", req.signal));
    },
  };
}

/** 설정에 맞는 제공자. 키가 없거나 꺼져 있으면 null */
export function providerFor(ai: AiSettings, which?: AiProvider): LLMProvider | null {
  if (!ai.enabled) return null;
  const p = which || (ai.provider === "rules" ? null : ai.provider);
  if (!p) return null;
  const model = modelOf(ai, p);
  if (p === "local") return localProvider(model, ai.localUrl || DEFAULT_LOCAL_URL);
  if (!getKey(p)) return null;
  if (p === "anthropic") return anthropicProvider(model);
  if (p === "gemini") return geminiProvider(model);
  return openRouterProvider(model);
}

/** JSON 응답을 받아 해석기로 넘긴다 */
export async function generateJson<T>(provider: LLMProvider, req: LLMRequest, parse: (text: string) => T): Promise<T> {
  const raw = await provider.generate(req);
  return parse(extractJson(raw));
}

/** [연결 테스트]: 짧은 JSON 하나를 받아 본다 */
export async function testProvider(ai: AiSettings, p: AiProvider): Promise<{ ok: boolean; message: string; ms: number }> {
  const t0 = performance.now();
  const prov = providerFor({ ...ai, enabled: true }, p);
  if (!prov) return { ok: false, message: "API 키를 먼저 넣어 주세요", ms: 0 };
  try {
    const out = await generateJson(prov, {
      system: "너는 연결 확인용 응답기다. 지시한 JSON만 출력한다.",
      user: '{"ok": true, "reply": "연결됨"} 과 같은 형식으로, reply 에 "연결됨"을 넣어 답해.',
      schema: { type: "object", properties: { ok: { type: "boolean" }, reply: { type: "string" } }, required: ["ok", "reply"], additionalProperties: false },
      schemaName: "ping", maxTokens: 1024,
    }, (t) => JSON.parse(t) as { ok: boolean; reply: string });
    return { ok: !!out.ok, message: `${prov.model} 응답: ${out.reply}`, ms: Math.round(performance.now() - t0) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "실패", ms: Math.round(performance.now() - t0) };
  }
}
