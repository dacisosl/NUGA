// 테스트 아이디의 자리 (이 기기 쪽): 자리표 읽기 · 자리 잡기 · 쓰는 동안 다시 적기 · 풀림/강제 로그아웃 알아채기
// 규칙은 core seats.ts (모든 기기가 같은 줄을 같은 순서로 읽어 같은 결론). 여기는 그 규칙을 중계(ntfy)와 잇는다.
// 공개 중계의 한도(인터넷 주소 하나에 하루 메시지 250건 · 요청 1분 12건 · 열린 연결 30개)를 아끼려고:
//  - 로그인 창은 자리표를 한 번 조회만 한다 (실시간 연결 없음).
//  - 자리를 잡을 때부터 실시간 연결(relayStream, 기록 통로와 한 연결)로 자리표를 듣는다. 조회는 자리를 잡기 전후와 연결이 다시 열렸을 때만.
//  - 메시지는 로그인 1건, 로그아웃 1건, 쓰는 동안 30분에 많아야 1건 (안 쓰면 0건).
import { create } from "zustand";
import {
  SEAT_RENEW_AFTER, SEAT_TOPIC, SEAT_TTL, TEST_ID_COUNT, decodeSeatLine, foldSeats, mySeatState, newSeatSecret, parseNtfyLines, seatFreeBody, seatHoldBody, seatKey,
  seatKickBody, seatSidOf, testIdLabel, type NtfyLine, type Seat, type SeatBoard, type SeatEvent, type SeatRole,
} from "@nuga/core";
import { ntfyBase } from "./role";
import { relayStream } from "./relayStream";

/** 이 기기가 쓰는 자리 (localStorage: 새로 고쳐도 같은 로그인으로 이어 쓴다) */
interface MyRec { n: number; role: SeatRole; secret: string; sid: string; /** 마지막 hold 를 적은 때 (이 기기 시각 ms) */ holdAt: number; /** 함께 듣는 내 기록 통로 */ inbox: string }
const REC_KEY = "nuga.seat";
function readRec(): MyRec | null {
  try {
    const r = JSON.parse(localStorage.getItem(REC_KEY) || "null") as MyRec | null;
    return r && typeof r.n === "number" && (r.role === "pc" || r.role === "phone") && typeof r.secret === "string" && typeof r.sid === "string"
      ? { ...r, inbox: typeof r.inbox === "string" ? r.inbox : "", holdAt: Number(r.holdAt) || 0 } : null;
  } catch { return null; }
}
function writeRec(r: MyRec | null) { try { if (r) localStorage.setItem(REC_KEY, JSON.stringify(r)); else localStorage.removeItem(REC_KEY); } catch { /* 저장소 없음 */ } }

/** 자리를 잃은 까닭: 관리자가 로그아웃시킴 · 다른 기기가 먼저 잡음 · 오래 안 써서 풀린 뒤 다른 기기가 씀 · 이 기기에 자리 기록이 없음 */
export type SeatLost = "kicked" | "taken" | "idle-taken" | "gone";
export interface SeatsState {
  /** 지금 쓰는 중인 자리 (seatKey → 자리) */
  seats: Map<string, Seat>;
  /** 자리표를 한 번이라도 읽었는가 · 읽는 중 · 못 읽은 까닭 · 마지막으로 읽은 때(ms) */
  loaded: boolean; loading: boolean; error: string; at: number;
  /** 계산에 쓴 '지금'(중계 서버 시각, 초) */
  now: number;
  /** 이 기기의 자리 */
  mine: { n: number; role: SeatRole; sid: string } | null;
}
export const useSeats = create<SeatsState>(() => ({ seats: new Map(), loaded: false, loading: false, error: "", at: 0, now: 0, mine: null }));

const events = new Map<string, SeatEvent>();
const decoded = new Set<string>();
let board: SeatBoard = { seats: new Map(), ended: new Map(), held: new Set() };
let rec: MyRec | null = null;
let lostHandler: (why: SeatLost, n: number, role: SeatRole) => void = () => {};
/** 자리를 잃었을 때 부를 것 (로그인 창이 등록: 로그아웃 + 안내) */
export function onSeatLost(fn: typeof lostHandler) { lostHandler = fn; }

const nowSec = () => relayStream.now() ?? Math.floor(Date.now() / 1000);
const url = (path: string) => `${ntfyBase()}/${SEAT_TOPIC}${path}`;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

class RelayBusy extends Error {}
/** 중계가 막았을 때(429)의 안내 */
async function busyText(r: Response): Promise<string> {
  let code = 0;
  try { code = Number(((await r.json()) as { code?: number }).code) || 0; } catch { /* 본문 없음 */ }
  return code === 42908
    ? "오늘 이 인터넷(와이파이)에서 공개 중계로 보낼 수 있는 양을 다 썼습니다. 다른 인터넷(휴대폰 데이터 등)으로 바꾸거나 내일 다시 해 주세요"
    : "중계가 잠시 바쁩니다(요청이 많음). 조금 뒤 다시 해 주세요";
}
const failText = (e: unknown) => (e instanceof RelayBusy ? e.message : "중계에 연결하지 못했습니다. 인터넷을 확인해 주세요");

function refold() {
  const now = nowSec();
  // 12시간(중계 보관 시간)보다 오래된 줄은 버린다. 기기 시계는 틀릴 수 있으므로 중계 서버 시각을 알 때만, 버린 줄은 다시 받을 수 있게
  const server = relayStream.now();
  if (server !== null) for (const [id, e] of events) if (e.time < server - 43200 - 600) { events.delete(id); decoded.delete(id); }
  board = foldSeats([...events.values()], now);
  useSeats.setState({ seats: new Map(board.seats), now });
  checkMine();
}

async function ingest(lines: NtfyLine[]) {
  let added = false;
  for (const l of lines) {
    if (!l.id || decoded.has(l.id) || (l.topic && l.topic !== SEAT_TOPIC)) continue;
    decoded.add(l.id);
    const e = await decodeSeatLine(l);
    if (e) { events.set(e.id, e); added = true; }
  }
  if (added) refold();
}

/**
 * 내 자리표가 빠짐없는가: 실시간 연결이 열린 '뒤에' 시작한 조회가 성공했고, 그 뒤로 연결이 다시 열린 적이 없다.
 * (연결이 열리기 전의 줄은 조회로, 열린 뒤의 줄은 실시간으로 받으므로 사이에 빠지는 줄이 없다.)
 * 실시간 연결을 못 여는 환경이면 마지막 조회 기준. 빠짐없을 때만 '내 자리를 잃었다'고 판단한다.
 */
let streamGen = 0, freshGen = -1;
const fresh = () => freshGen === streamGen;

let loadingP: Promise<boolean> | null = null;
let loadingGen = -1;
let retryTimer: ReturnType<typeof setTimeout> | null = null, retryMs = 0;
/** 자리표 전체(보관된 12시간)를 조회해 다시 계산한다. 성공하면 true */
export function loadSeats(): Promise<boolean> {
  if (loadingP) {
    // 지금 도는 조회가 연결이 다시 열리기 전에 시작한 것이면, 끝난 뒤 한 번 더 (그래야 빠짐없다)
    if (loadingGen !== streamGen) return loadingP.then(() => (loadingGen !== streamGen || !fresh() ? loadSeats() : true));
    return loadingP;
  }
  loadingGen = streamGen;
  useSeats.setState({ loading: true });
  const gen = streamGen;
  const box: { p?: Promise<boolean> } = {};
  const p: Promise<boolean> = (async () => {
    try {
      const r = await fetch(url("/json?poll=1&since=all"));
      if (r.status === 429) throw new RelayBusy(await busyText(r));
      if (!r.ok) throw new Error(String(r.status));
      await ingest(parseNtfyLines(await r.text()));
      if (gen === streamGen) freshGen = gen;
      retryMs = 0;
      useSeats.setState({ loaded: true, loading: false, error: "", at: Date.now() });
      refold();
      return true;
    } catch (e) {
      useSeats.setState({ loading: false, error: failText(e) });
      // 자리를 쓰는 중인데 빠짐없는 자리표가 아니면, 간격을 두고 다시 (관리자 로그아웃 · 중복을 놓치지 않게)
      if (rec && !fresh() && !retryTimer) {
        retryMs = Math.min(300_000, retryMs ? retryMs * 2 : 20_000);
        retryTimer = setTimeout(() => { retryTimer = null; if (rec && !fresh()) void loadSeats(); }, retryMs + Math.random() * 5000);
      }
      return false;
    } finally { if (loadingP === box.p) loadingP = null; }
  })();
  box.p = p; loadingP = p;
  return p;
}

/* ---------------- 지켜보기 (실시간) ---------------- */
const watchers = new Set<string>();
let tick: ReturnType<typeof setInterval> | null = null;
let pendingInbox = "";
function applyStream() {
  if (!watchers.size) { relayStream.clear("seats"); streamGen++; return; }
  relayStream.set("seats", {
    // 내 기록 통로도 같이 적어 둔다: 로그인 직후 동기화 엔진이 같은 통로를 들으려 할 때 연결을 다시 열지 않게
    base: ntfyBase(), topics: [SEAT_TOPIC, ...(pendingInbox ? [pendingInbox] : []), ...(rec?.inbox ? [rec.inbox] : [])],
    onLine: (line) => { void ingest([line]); },
    onOpen: () => {
      // 연결이 (다시) 열렸다: 그 전의 줄을 조회로 받아야 빠짐없다. 자리를 쓰는 중이거나 관리자 화면이면 바로 받는다
      const again = streamGen > 0;
      streamGen++;
      if (rec || watchers.has("admin")) { if (again && !watchers.has("claim")) setTimeout(() => void loadSeats(), Math.random() * 4000); else void loadSeats(); }
    },
  });
}
/** 자리표를 실시간으로 지켜본다 (자리를 잡는 동안 · 테스트 아이디로 로그인한 동안 · 관리자 화면). 같은 이름으로 여러 번 불러도 한 번 */
export function watchSeats(name: string) {
  watchers.add(name);
  applyStream();
  // 오래된 자리가 화면에서 빠지게 (요청 없이 계산만)
  if (!tick) tick = setInterval(refold, 30_000);
}
export function unwatchSeats(name: string) {
  if (!watchers.delete(name)) return;
  applyStream();
  if (!watchers.size && tick) { clearInterval(tick); tick = null; }
}

/* ---------------- 내 자리 ---------------- */
async function post(body: string, keepalive = false): Promise<NtfyLine | null> {
  const r = await fetch(url(""), { method: "POST", body, keepalive });
  if (r.status === 429) throw new RelayBusy(await busyText(r));
  if (!r.ok) throw new Error(`중계 전송 실패 ${r.status}`);
  let line: NtfyLine | null = null;
  try { [line] = parseNtfyLines(JSON.stringify(await r.json())); } catch { line = null; }
  if (line) { relayStream.noteTime(line.time); await ingest([line]); }
  return line || null;
}

function setMine(r: MyRec | null) {
  const had = !!rec;
  const prevSid = rec?.sid;
  rec = r;
  // 같은 브라우저의 다른 탭이 새로 로그인해 둔 기록은 지우지 않는다
  if (r) writeRec(r); else if (!prevSid || readRec()?.sid === prevSid) writeRec(null);
  useSeats.setState({ mine: r ? { n: r.n, role: r.role, sid: r.sid } : null });
  if (r && !had) watchSeats("mine");
  else if (r) applyStream();
  else unwatchSeats("mine");
}

export type ClaimResult = { ok: true } | { ok: false; why: "taken" | "error"; text: string };
let claiming = false;
/** 자리를 잡은 뒤 확인 조회까지 기다리는 시간: 공개 서버가 새 줄을 조회 결과에 넣기까지 걸리는 시간(1초쯤)보다 길게 */
let CLAIM_WAIT = 2000;
/**
 * 자리를 잡는다 (테스트 아이디 n 의 PC 또는 폰 자리).
 * 실시간 연결을 먼저 열고 → 자리표를 읽어 비어 있으면 hold 를 적고 → 조금 기다렸다 다시 읽어 내 것이 됐는지 확인한다.
 * 두 기기가 동시에 잡으면 자리표의 순서로 한쪽만 된다 (core foldSeats).
 * @param inbox 로그인 뒤 들을 내 기록 통로 (같은 연결에 미리 넣어 둔다)
 */
export async function claimSeat(n: number, role: SeatRole, dev: string, inbox: string): Promise<ClaimResult> {
  if (claiming) return { ok: false, why: "error", text: "로그인하는 중입니다" };
  claiming = true;
  const taken: ClaimResult = { ok: false, why: "taken", text: `${testIdLabel(n)}의 ${role === "pc" ? "PC" : "폰"} 자리는 다른 기기가 쓰는 중입니다. 다른 번호를 골라 주세요` };
  let done = false, posted = false, secret = "";
  try {
    pendingInbox = inbox;
    watchSeats("claim");
    await relayStream.opened(4000);
    if (!(await loadSeats())) return { ok: false, why: "error", text: useSeats.getState().error };
    if (board.seats.has(seatKey(n, role))) return taken;
    secret = newSeatSecret(); const sid = await seatSidOf(secret);
    posted = true;
    await post(seatHoldBody(n, role, sid, dev));
    await sleep(CLAIM_WAIT);
    if (!(await loadSeats())) { await sleep(1500); if (!(await loadSeats())) return { ok: false, why: "error", text: useSeats.getState().error }; }
    if (mySeatState(board, n, role, sid) !== "mine") return taken;
    dirty = false;
    const prev = rec;
    setMine({ n, role, secret, sid, holdAt: Date.now(), inbox });
    // 다른 번호로 바꿔 로그인했으면 전에 쓰던 자리를 뗀다
    if (prev && prev.sid !== sid) void post(seatFreeBody(prev.secret), true).catch(() => {});
    done = true;
    return { ok: true };
  } catch (e) {
    return { ok: false, why: "error", text: failText(e) };
  } finally {
    claiming = false; pendingInbox = ""; unwatchSeats("claim");
    // hold 를 적었는데 로그인하지 못했으면 뗀다 (안 그러면 아무도 못 쓰는 자리가 한 시간 남는다)
    if (posted && !done && secret) void post(seatFreeBody(secret), true).catch(() => {});
    if (done) checkMine();
  }
}

/** 자리를 뗀다 (로그아웃). 실패해도 한 시간 안에 저절로 풀린다 */
export async function releaseSeat(): Promise<void> {
  const r = rec;
  if (!r) return;
  setMine(null);
  try { await post(seatFreeBody(r.secret), true); } catch { /* 저절로 풀린다 */ }
}

/** 이 기기가 지금 쓰는 자리 */
export function mySeat(): { n: number; role: SeatRole } | null { return rec ? { n: rec.n, role: rec.role } : null; }

/**
 * 앱을 다시 열었을 때: 저장해 둔 자리로 이어 쓴다. 실시간 연결이 열리면 자리표를 읽어 아직 내 자리인지 본다
 * (그사이 풀렸으면 쓸 때 다시 잡고, 남이 쓰고 있거나 관리자가 로그아웃시켰으면 로그아웃).
 */
export function resumeSeat(n: number, role: SeatRole, inbox: string): void {
  if (rec && rec.n === n && rec.role === role) { if (rec.inbox !== inbox) setMine({ ...rec, inbox }); return; }
  const r = readRec();
  if (!r || r.n !== n || r.role !== role) { lostHandler("gone", n, role); return; }
  setMine({ ...r, inbox });
}

/** 실시간 연결이 없을 때(막힘 · 끊김) 동기화 엔진의 확인 주기에 맞춰 자리표를 조회한다 */
export function pollSeatsIfQuiet(): void {
  if (rec && !loadingP && (!relayStream.alive() || !fresh()) && !retryTimer) void loadSeats();
}

let lostBusy = false;
function lose(why: SeatLost) {
  const r = rec;
  if (!r || lostBusy) return;
  lostBusy = true;
  setMine(null);
  try { lostHandler(why, r.n, r.role); } finally { lostBusy = false; }
}

/** 자리표가 바뀔 때마다: 아직 내 자리인가 */
function checkMine() {
  const r = rec;
  if (!r || claiming || !fresh()) return;
  const st = mySeatState(board, r.n, r.role, r.sid);
  if (st === "mine") return;
  if (st === "kicked") return lose("kicked");
  if (st === "taken") {
    // 오래 안 써서 풀린 뒤 남이 잡았는지: 내 마지막 hold 와 남이 잡은 때를 중계 서버 시각으로 비교한다 (기기 시계는 믿지 않는다)
    const cur = board.seats.get(seatKey(r.n, r.role));
    let myLast = 0;
    for (const e of events.values()) if (e.kind === "hold" && e.sid === r.sid && e.time > myLast) myLast = e.time;
    return lose(cur && myLast && cur.since - myLast >= SEAT_TTL ? "idle-taken" : "taken");
  }
  // 다른 탭이 로그아웃했다 (이 탭이 뗐으면 rec 가 이미 없다)
  if (st === "freed") return lose("gone");
  // 이 자리의 내 hold 가 자리표에 없다: 12시간 보관이 지나 기록(관리자 로그아웃 포함)이 사라진 로그인 → 다시 로그인하게
  if (st === "none") return lose("gone");
  // expired: 오래 조용해 풀렸지만 아직 빈 자리 → 지금 쓰는 중이면 다시 적는다 (조용하면 다음에 쓸 때)
  if (dirty && Date.now() >= renewFailUntil) void renew();
}

/* ---------------- 쓰는 동안 다시 적기 ---------------- */
let dirty = false;           // 마지막 hold 뒤로 이 기기를 썼는가
let renewing = false;
let renewFailUntil = 0;      // 다시 적기에 실패했으면 이때까지 쉰다 (연달아 보내지 않게)

/**
 * hold 를 다시 적는다 (같은 로그인 번호로). 자리가 아직 내 것이면 시간이 늘고,
 * 오래 조용해 풀린 빈 자리면 다시 내 것이 되고, 그사이 남이 잡았으면 무시돼 '다른 기기가 씀'으로 로그아웃된다.
 */
async function renew() {
  const r = rec;
  if (!r || renewing || claiming || Date.now() < renewFailUntil) return;
  renewing = true;
  let ok = false;
  try {
    await post(seatHoldBody(r.n, r.role, r.sid));
    ok = true;
    if (rec && rec.sid === r.sid) { dirty = false; setMine({ ...rec, holdAt: Date.now() }); }
  } catch (e) {
    // 하루 한도면 10분, 아니면 30초 쉬었다가 (쓰는 동안 다음 누름에 다시)
    renewFailUntil = Date.now() + (e instanceof RelayBusy && /다 썼습니다/.test(e.message) ? 600_000 : 30_000);
  } finally { renewing = false; }
  if (ok) checkMine();
}

let lastNote = 0;
/**
 * 이 기기를 쓰고 있다 (누름 · 글자 입력 · 기록 도착). 자주 불려도 된다.
 * 마지막 hold 가 30분보다 오래됐으면 지금 다시 적는다: 그래서 마지막으로 쓴 뒤 30분 안에는 풀리지 않는다.
 */
export function noteSeatActivity() {
  if (!rec) return;
  dirty = true;
  const t = Date.now();
  if (t - lastNote < 3000) return;
  lastNote = t;
  if (t - rec.holdAt >= SEAT_RENEW_AFTER * 1000) void renew();
}
/** 자리표가 빠짐없지 않으면(연결이 끊겼거나 다시 연 뒤 조회를 못 함) 조회한다 */
function ensureFresh() { if (rec && !loadingP && (!fresh() || !relayStream.alive())) { if (!relayStream.alive()) streamGen++; void loadSeats(); } }
if (typeof window !== "undefined") {
  for (const ev of ["pointerdown", "keydown"] as const) window.addEventListener(ev, noteSeatActivity, { passive: true, capture: true });
  // 절전에서 깨어나 화면으로 돌아왔을 때: 그사이 자리가 어떻게 됐는지 계산부터 다시
  // 연결이 죽어 있으면(잠든 동안 끊긴 채 남은 연결) 빠짐없지 않은 것으로 보고 자리표부터 다시 읽는다
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && rec) { refold(); ensureFresh(); } });
}

/* ---------------- 관리자 ---------------- */
/** 관리자: 이 로그인들을 로그아웃시킨다. 문제가 있으면 그 문구 */
export async function kickSeats(adminKey: CryptoKey, sids: string[]): Promise<string | null> {
  if (!sids.length) return null;
  try { await post(await seatKickBody(adminKey, sids)); return null; }
  catch (e) { return failText(e); }
}

/** 화면용: 아이디 1~10 의 PC · 폰 자리 */
export function seatRows(seats: Map<string, Seat>): { n: number; pc: Seat | null; phone: Seat | null }[] {
  return Array.from({ length: TEST_ID_COUNT }, (_, i) => ({ n: i + 1, pc: seats.get(seatKey(i + 1, "pc")) || null, phone: seats.get(seatKey(i + 1, "phone")) || null }));
}

/** 기기 설명: "크롬 · 윈도우" (자리표에 적는 것은 이것뿐) */
export function deviceLabel(): string {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const br = /Whale\//.test(ua) ? "웨일" : /SamsungBrowser\//.test(ua) ? "삼성 인터넷" : /Edg\//.test(ua) ? "엣지" : /Firefox\//.test(ua) ? "파이어폭스" : /Chrome\//.test(ua) ? "크롬" : /Safari\//.test(ua) ? "사파리" : "브라우저";
  const os = /Android/.test(ua) ? "안드로이드" : /iPhone|iPad|iPod/.test(ua) ? "아이폰" : /Windows/.test(ua) ? "윈도우" : /Mac OS X/.test(ua) ? "맥" : /CrOS/.test(ua) ? "크롬북" : /Linux/.test(ua) ? "리눅스" : "";
  return os ? `${br} · ${os}` : br;
}

// 개발 서버에서만: 자동 검사가 들여다보고 시간을 당길 수 있게
if (import.meta.env.DEV) (globalThis as unknown as { __nugaSeats?: unknown }).__nugaSeats = {
  state: () => ({ rec: rec ? { n: rec.n, role: rec.role, sid: rec.sid, holdAt: rec.holdAt } : null, events: events.size, seats: [...board.seats.keys()], dirty, fresh: fresh(), watchers: [...watchers] }),
  setClaimWait: (ms: number) => { CLAIM_WAIT = ms; },
  /** 마지막 hold 를 ms 전에 적은 것처럼 (30분 지남 검사) */
  ageHold: (ms: number) => { if (rec) { rec = { ...rec, holdAt: rec.holdAt - ms }; writeRec(rec); } },
  refold, loadSeats,
};
