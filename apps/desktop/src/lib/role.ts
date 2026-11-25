import { NTFY_BASE } from "@nuga/core";

/**
 * 이 기기의 역할: PC(기록을 받아 쉬는 시간 기록 팝업을 띄움) · 폰(번호를 눌러 PC로 보냄).
 * 기기마다 다르므로 문서가 아니라 이 브라우저의 localStorage 에 둔다. 처음에는 폰 너비 터치 화면이면 폰.
 */
export type Role = "pc" | "phone";
const ROLE_KEY = "nuga.role";
export const PHONE_QUERY = "(max-width: 640px) and (pointer: coarse)";

export function defaultRole(): Role {
  try { return typeof matchMedia === "function" && matchMedia(PHONE_QUERY).matches ? "phone" : "pc"; } catch { return "pc"; }
}
export function loadRole(): Role {
  try { const v = localStorage.getItem(ROLE_KEY); if (v === "pc" || v === "phone") return v; } catch { /* 저장소 없음 */ }
  return defaultRole();
}
export function saveRole(r: Role): void { try { localStorage.setItem(ROLE_KEY, r); } catch { /* 저장소 없음 */ } }

/** 공개 중계 주소. 시험할 때만 localStorage "nuga.ntfyBase" 로 바꾼다 (가짜 중계) */
export function ntfyBase(): string {
  try { return (localStorage.getItem("nuga.ntfyBase") || NTFY_BASE).replace(/\/+$/, ""); } catch { return NTFY_BASE; }
}
