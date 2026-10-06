import type { AiProvider } from "@nuga/core";
import { isTauri } from "./platform";

/**
 * API 키 보관.
 * - PC 설치형: Windows 자격 증명 관리자 (Tauri 명령 secret_get / secret_set)
 * - 웹 버전: 기본은 이 탭이 열려 있는 동안만(sessionStorage). "이 브라우저에 기억"을 켜면 localStorage.
 * 키는 문서 JSON·백업·내보내기에 넣지 않는다.
 */
const PROVIDERS: AiProvider[] = ["anthropic", "gemini", "openrouter", "local"];
const cache = new Map<AiProvider, string>();
const listeners = new Set<() => void>();
const name = (p: AiProvider) => `nuga-key-${p}`;
const REMEMBER = "nuga.keys.remember";

async function invoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  const core = await import("@tauri-apps/api/core");
  return core.invoke<T>(cmd, args);
}

function webStore(): Storage | null {
  try { return localStorage.getItem(REMEMBER) === "1" ? localStorage : sessionStorage; } catch { return null; }
}

export function webRemember(): boolean { try { return localStorage.getItem(REMEMBER) === "1"; } catch { return false; } }
export function setWebRemember(on: boolean) {
  try {
    if (on) { localStorage.setItem(REMEMBER, "1"); for (const [p, v] of cache) localStorage.setItem(name(p), v); }
    else { localStorage.removeItem(REMEMBER); for (const p of PROVIDERS) { localStorage.removeItem(name(p)); const v = cache.get(p); if (v) sessionStorage.setItem(name(p), v); } }
  } catch { /* 저장소 사용 불가 */ }
}

/** 시작할 때 한 번: 저장소에서 키를 읽어 메모리에 둔다 */
export async function loadSecrets(): Promise<void> {
  for (const p of PROVIDERS) {
    try {
      const v = isTauri ? await invoke<string | null>("secret_get", { name: name(p) }) : webStore()?.getItem(name(p)) ?? null;
      if (v) cache.set(p, v); else cache.delete(p);
    } catch { /* 자격 증명 관리자 접근 실패 → 키 없음으로 */ }
  }
  listeners.forEach((f) => f());
}

export function getKey(p: AiProvider): string { return cache.get(p) || ""; }
export function hasKey(p: AiProvider): boolean { return !!cache.get(p); }

export async function setKey(p: AiProvider, value: string): Promise<void> {
  const v = value.trim();
  if (isTauri) await invoke("secret_set", { name: name(p), value: v });
  else { const s = webStore(); try { if (v) s?.setItem(name(p), v); else s?.removeItem(name(p)); } catch { /* 무시 */ } }
  if (v) cache.set(p, v); else cache.delete(p);
  listeners.forEach((f) => f());
}

export function onSecretsChange(f: () => void): () => void { listeners.add(f); return () => listeners.delete(f); }

export function keyStoreLabel(): string { return isTauri ? "Windows 자격 증명 관리자" : webRemember() ? "이 브라우저(localStorage)" : "이 탭이 열려 있는 동안만"; }
