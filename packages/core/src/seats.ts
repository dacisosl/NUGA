/**
 * 테스트 아이디의 자리 (중복 로그인 막기 · 관리자 강제 로그아웃).
 *
 * 회원 서버가 없으므로 '누가 어느 테스트 아이디를 쓰는 중인지'도 공개 중계(ntfy)의 통로 하나(자리표)에 적어 둔다.
 * - 자리 = 테스트 아이디 하나의 PC 자리 · 폰 자리 (아이디 하나 = PC 1대 + 폰 1대).
 * - 로그인: 자리표에 "이 자리를 씁니다(hold)"를 적는다. 그 자리에 다른 기기가 먼저 적어 두었으면 무시된다(막힘).
 * - 로그아웃: "뗍니다(free)". hold 에 적은 번호(sid)는 비밀 글의 해시라서, 비밀 글을 가진 그 기기만 뗄 수 있다.
 * - 마지막 hold 뒤 60분이 지나면 저절로 풀린다. 기기를 쓸 때(누름 · 입력 · 기록 도착) 마지막 hold 가 30분보다 오래됐으면 hold 를 다시 적는다.
 *   그래서 마지막으로 쓴 뒤 30분은 반드시 지켜지고, 늦어도 60분이면 풀린다. 안 쓰는 기기는 아무것도 보내지 않는다
 *   (쓰는 기기도 30분에 많아야 1건: 공개 중계의 하루 메시지 한도를 같은 와이파이의 기기가 나눠 쓰므로).
 * - 관리자: 서명한 "이 번호들을 로그아웃(kick)". 서명은 admin.ts.
 *
 * 모든 기기가 같은 줄을 같은 순서로 읽어 같은 결론에 이른다 (foldSeats). 시각은 중계 서버가 줄마다 찍은 시각만 쓴다.
 * 알아 둘 것: 테스트 아이디의 비밀번호는 공개돼 있어, 코드를 읽은 사람은 빈 자리를 차지할 수 있다. 막을 수 있는 것은
 * '남의 자리를 떼는 것'과 '관리자 흉내'뿐이다. 자리표에는 아이디 번호 · PC/폰 · 브라우저 종류만 적는다(암호화하지 않음).
 */
import { toHex } from "./crypto";
import { signAdmin, verifyAdmin, type AdminKeyMaterial } from "./admin";
import { ADMIN_KEY } from "./adminKey";
import type { NtfyLine } from "./sync";

/** 테스트 아이디 수 */
export const TEST_ID_COUNT = 10;
/** 자리가 저절로 풀리기까지: 마지막 hold 뒤 60분 (중계 서버 시각) */
export const SEAT_TTL = 3600;
/** 기기를 쓸 때 hold 를 다시 적는 기준: 마지막 hold 뒤 30분. 그래서 마지막으로 쓴 뒤 (60 − 30) = 30분 안에는 풀리지 않는다 */
export const SEAT_RENEW_AFTER = 1800;
/** 쓰지 않으면 풀리기까지 보장하는 시간 (분): 화면 안내용 */
export const SEAT_IDLE_MIN = (SEAT_TTL - SEAT_RENEW_AFTER) / 60;
/** 자리표 통로 (공개 중계). 이름을 바꾸면 이전 판의 기기와 자리표가 갈린다 */
export const SEAT_TOPIC = "nuga-seats-7c1e5d0a94b3f268";

export type SeatRole = "pc" | "phone";
export interface Seat {
  /** 테스트 아이디 번호 1~10 */
  n: number; role: SeatRole;
  /** 이 자리를 쓰는 로그인의 번호 (비밀 글의 해시 앞 8바이트) */
  sid: string;
  /** 쓰기 시작한 때 · 마지막으로 쓴다고 적은 때 (중계 서버 시각, 초) */
  since: number; last: number;
  /** 기기 설명 (예: "크롬 · 윈도우") */
  dev: string;
}
export type SeatEvent =
  | { kind: "hold"; id: string; time: number; n: number; role: SeatRole; sid: string; dev: string }
  | { kind: "free"; id: string; time: number; sid: string }
  | { kind: "kick"; id: string; time: number; sids: string[] };

export function seatKey(n: number, role: SeatRole): string { return `${n}:${role}`; }

const SID = /^[0-9a-f]{16}$/, SECRET = /^[0-9a-f]{32}$/;
const buf = (u: Uint8Array): ArrayBuffer => { const b = new ArrayBuffer(u.length); new Uint8Array(b).set(u); return b; };

/** 새 로그인의 비밀 글 (이 기기에만 둔다) */
export function newSeatSecret(): string { const b = new Uint8Array(16); crypto.getRandomValues(b); return toHex(b); }
/** 비밀 글 → 자리표에 적는 번호 */
export async function seatSidOf(secret: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", buf(new TextEncoder().encode(`nuga-seat-v1|${secret}`))));
  return toHex(h.slice(0, 8));
}

/** 기기 설명을 자리표에 적을 만큼만 (글자 · 숫자 · 공백 · 가운뎃점, 24자) */
export function cleanSeatDev(dev: unknown): string {
  return typeof dev === "string" ? dev.replace(/[^\p{L}\p{N} ·.-]/gu, "").trim().slice(0, 24) : "";
}

export function seatHoldBody(n: number, role: SeatRole, sid: string, dev = ""): string {
  return JSON.stringify({ nuga: "s1", t: "hold", n, r: role === "pc" ? "pc" : "ph", sid, dev: cleanSeatDev(dev) });
}
export function seatFreeBody(secret: string): string { return JSON.stringify({ nuga: "s1", t: "free", key: secret }); }
/** 관리자: 이 번호(sid)들을 로그아웃. 번호는 로그인마다 새로 생기므로, 이 글을 누가 다시 보내도 그 뒤의 로그인은 건드리지 못한다 */
export async function seatKickBody(adminKey: CryptoKey, sids: string[]): Promise<string> {
  return JSON.stringify(await signAdmin(adminKey, { v: 1, act: "logout", sids: [...new Set(sids)].filter((s) => SID.test(s)).sort() }));
}
/** 한 번에 로그아웃시킬 수 있는 번호 수 (메시지 하나 4KB 안) */
export const SEAT_KICK_MAX = 60;

/** 자리표의 한 줄 → 사건. 형식이 다르거나 서명이 틀린 줄은 null (누구나 쓸 수 있는 통로라 엄격히 본다) */
export async function decodeSeatLine(line: NtfyLine, material: AdminKeyMaterial = ADMIN_KEY): Promise<SeatEvent | null> {
  const time = line.time || 0;
  if (!line.id || !time || !line.message || line.message.length > 3000) return null;
  let j: Record<string, unknown>;
  try { j = JSON.parse(line.message) as Record<string, unknown>; } catch { return null; }
  if (!j || typeof j !== "object") return null;
  if (j.nuga === "s1" && j.t === "hold") {
    const n = j.n, sid = j.sid;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > TEST_ID_COUNT) return null;
    if (j.r !== "pc" && j.r !== "ph") return null;
    if (typeof sid !== "string" || !SID.test(sid)) return null;
    return { kind: "hold", id: line.id, time, n, role: j.r === "pc" ? "pc" : "phone", sid, dev: cleanSeatDev(j.dev) };
  }
  if (j.nuga === "s1" && j.t === "free") {
    if (typeof j.key !== "string" || !SECRET.test(j.key)) return null;
    return { kind: "free", id: line.id, time, sid: await seatSidOf(j.key) };
  }
  if (j.nuga === "adm1") {
    const cmd = await verifyAdmin<{ v?: number; act?: string; sids?: unknown }>(j, material);
    if (!cmd || cmd.v !== 1 || cmd.act !== "logout" || !Array.isArray(cmd.sids) || cmd.sids.length > SEAT_KICK_MAX) return null;
    const sids = cmd.sids.filter((s): s is string => typeof s === "string" && SID.test(s));
    return sids.length ? { kind: "kick", id: line.id, time, sids } : null;
  }
  return null;
}

export interface SeatBoard {
  /** 지금 쓰는 중인 자리 (seatKey → 자리) */
  seats: Map<string, Seat>;
  /** 끝난 로그인 번호: 스스로 뗐거나(free) 관리자가 로그아웃시킴(kick). 다시 쓸 수 없다 */
  ended: Map<string, "free" | "kick">;
  /** 한 번이라도 자리를 얻은 (자리, 로그인 번호): "${seatKey}|${sid}" */
  held: Set<string>;
}

const ORDER = { hold: 0, kick: 1, free: 2 } as const;
/**
 * 자리표의 사건들 → 지금의 자리.
 * 순서는 중계 서버 시각(초), 같은 초에서는 hold → kick → free, 그다음 줄 id. 어느 기기가 읽어도 같은 순서가 된다.
 * - hold: 빈 자리(또는 30분 넘게 조용한 자리)면 그 로그인의 것이 된다. 같은 로그인의 hold 면 시간만 늘린다.
 *   다른 로그인이 쓰는 중이면 무시된다 = 중복 로그인 막힘.
 * - 한 번 끝난(free · kick) 로그인 번호의 hold 는 무시한다. 자리는 서로 따로 계산한다:
 *   hold 는 서명이 없어 남의 로그인 번호로도 적을 수 있으므로, 다른 자리에 적힌 줄이 내 자리를 건드리면 안 된다.
 * @param nowSec 지금(중계 서버 시각). 마지막 hold 가 SEAT_TTL 보다 오래된 자리는 빈 것으로 본다
 */
export function foldSeats(events: SeatEvent[], nowSec: number): SeatBoard {
  const seen = new Set<string>();
  const sorted = events.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)))
    .sort((a, b) => a.time - b.time || ORDER[a.kind] - ORDER[b.kind] || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const seats = new Map<string, Seat>();
  const ended = new Map<string, "free" | "kick">();
  const held = new Set<string>();
  const end = (sid: string, why: "free" | "kick") => {
    if (!ended.has(sid)) ended.set(sid, why);
    for (const [k, s] of seats) if (s.sid === sid) seats.delete(k);
  };
  let latest = 0;
  for (const e of sorted) {
    latest = Math.max(latest, e.time);
    if (e.kind === "kick") { for (const sid of e.sids) end(sid, "kick"); continue; }
    if (e.kind === "free") { end(e.sid, "free"); continue; }
    if (ended.has(e.sid)) continue;
    const k = seatKey(e.n, e.role);
    let cur = seats.get(k);
    if (cur && e.time - cur.last >= SEAT_TTL) { seats.delete(k); cur = undefined; }
    if (!cur) { seats.set(k, { n: e.n, role: e.role, sid: e.sid, since: e.time, last: e.time, dev: e.dev }); held.add(`${k}|${e.sid}`); }
    else if (cur.sid === e.sid) { cur.last = e.time; if (e.dev) cur.dev = e.dev; }
    // 다른 로그인이 쓰는 중: 무시 (막힘)
  }
  const now = Math.max(nowSec, latest);
  for (const [k, s] of seats) if (now - s.last >= SEAT_TTL) seats.delete(k);
  return { seats, ended, held };
}

/** 내 로그인(sid)의 지금 상태 */
export type MySeat = "mine" | "taken" | "kicked" | "freed" | "expired" | "none";
/**
 * - mine: 내 자리. taken: 다른 기기가 쓰는 중(내 hold 가 졌거나, 내가 조용한 사이 풀려 남이 들어옴).
 * - kicked: 관리자가 로그아웃시킴. freed: 내가 뗌. expired: 오래 조용해 풀림(아직 빈 자리).
 * - none: 자리표에 이 자리의 내 hold 가 없음 (아직 안 적었거나, 12시간 보관이 지나 기록이 사라짐).
 */
export function mySeatState(board: SeatBoard, n: number, role: SeatRole, sid: string): MySeat {
  const why = board.ended.get(sid);
  if (why === "kick") return "kicked";
  if (why === "free") return "freed";
  const cur = board.seats.get(seatKey(n, role));
  if (cur) return cur.sid === sid ? "mine" : "taken";
  return board.held.has(`${seatKey(n, role)}|${sid}`) ? "expired" : "none";
}
