import { describe, expect, it } from "vitest";
import {
  SEAT_IDLE_MIN, SEAT_KICK_MAX, SEAT_RENEW_AFTER, SEAT_TTL, TEST_IDS, TEST_ID_COUNT, TEST_LOGIN, decodeSeatLine, deriveLoginKey, foldSeats, isTestLogin, mySeatState, newSeatSecret, openAdminKey,
  seatFreeBody, seatHoldBody, seatKey, seatKickBody, seatSidOf, signAdmin, testIdLabel, testIdNo, testIdOf,
  type AdminKeyMaterial, type NtfyLine, type SeatEvent, type SeatRole,
} from "../src";

const toolPath = "../../../tools/admin-key.mjs";
const tool = (): Promise<{ makeAdminKey: (password: string, iterations?: number) => Promise<AdminKeyMaterial> }> => import(/* @vite-ignore */ toolPath);

const A = "a".repeat(16), B = "b".repeat(16), C = "c".repeat(16);
let seq = 0;
const hold = (time: number, n: number, role: SeatRole, sid: string, id = `m${String(++seq).padStart(6, "0")}`): SeatEvent => ({ kind: "hold", id, time, n, role, sid, dev: "" });
const free = (time: number, sid: string, id = `m${String(++seq).padStart(6, "0")}`): SeatEvent => ({ kind: "free", id, time, sid });
const kick = (time: number, sids: string[], id = `m${String(++seq).padStart(6, "0")}`): SeatEvent => ({ kind: "kick", id, time, sids });
const holder = (ev: SeatEvent[], now: number, n = 3, role: SeatRole = "pc") => foldSeats(ev, now).seats.get(seatKey(n, role))?.sid;

describe("테스트 아이디 10개", () => {
  it("nuga-test-01 … 10, 번호 ↔ 아이디", () => {
    expect(TEST_IDS.length).toBe(TEST_ID_COUNT);
    expect(TEST_IDS[0]).toBe("nuga-test-01");
    expect(TEST_IDS[9]).toBe("nuga-test-10");
    expect(testIdNo(" NUGA-Test-03 ")).toBe(3);
    expect(testIdNo("nuga-test-11")).toBe(0);
    expect(testIdNo(TEST_LOGIN.id)).toBe(0);
    expect(testIdOf(10)).toBe("nuga-test-10");
    expect(testIdOf(0)).toBe("");
    expect(testIdLabel(3)).toBe("테스트 03");
  });
  it("모두 테스트 계정으로 본다 (실제 이름을 보내지 않는 규칙이 걸린다). 예전 하나짜리 아이디도", () => {
    for (const id of TEST_IDS) expect(isTestLogin(id)).toBe(true);
    expect(isTestLogin(TEST_LOGIN.id)).toBe(true);
    expect(isTestLogin("nuga-test-00")).toBe(false);
    expect(isTestLogin("teacher01")).toBe(false);
  });
  it("아이디마다 통로(열쇠)가 다르다", async () => {
    const ids = await Promise.all(TEST_IDS.map((id) => deriveLoginKey(id, "same-password", 1000).then((k) => k.keyId)));
    expect(new Set(ids).size).toBe(TEST_ID_COUNT);
  });
});

describe("자리: 중복 로그인 막기", () => {
  it("빈 자리는 먼저 적은 로그인의 것, 같은 자리의 두 번째 로그인은 막힌다", () => {
    const ev = [hold(100, 3, "pc", A), hold(130, 3, "pc", B)];
    const b = foldSeats(ev, 200);
    expect(b.seats.get(seatKey(3, "pc"))).toMatchObject({ sid: A, since: 100, last: 100 });
    expect(mySeatState(b, 3, "pc", A)).toBe("mine");
    expect(mySeatState(b, 3, "pc", B)).toBe("taken");
    expect(mySeatState(b, 3, "pc", C)).toBe("taken");
    expect(mySeatState(b, 4, "pc", C)).toBe("none");
  });
  it("아이디 하나 = PC 1대 + 폰 1대: 같은 아이디의 폰 자리와 다른 아이디는 따로", () => {
    const ev = [hold(100, 3, "pc", A), hold(110, 3, "phone", B), hold(120, 4, "pc", C)];
    const b = foldSeats(ev, 200);
    expect([...b.seats.keys()].sort()).toEqual(["3:pc", "3:phone", "4:pc"]);
    expect(b.seats.get("3:phone")!.sid).toBe(B);
  });
  it("쓰지 않으면 풀리기까지 30분은 보장 (60분 뒤 풀림 · 30분 지나 쓸 때 다시 적음)", () => {
    expect(SEAT_IDLE_MIN).toBe(30);
    expect(SEAT_TTL - SEAT_RENEW_AFTER).toBe(30 * 60);
  });
  it("마지막 hold 뒤 SEAT_TTL 이 지나면 풀린다. 다시 적으면 그때부터", () => {
    expect(holder([hold(100, 3, "pc", A)], 100 + SEAT_TTL - 1)).toBe(A);
    expect(holder([hold(100, 3, "pc", A)], 100 + SEAT_TTL)).toBeUndefined();
    const renewed = [hold(100, 3, "pc", A), hold(1300, 3, "pc", A)];
    expect(holder(renewed, 100 + SEAT_TTL + 500)).toBe(A);
    expect(1300 - 100).toBeLessThan(SEAT_TTL);
    expect(foldSeats(renewed, 2000).seats.get("3:pc")).toMatchObject({ since: 100, last: 1300 });
    expect(holder(renewed, 1300 + SEAT_TTL)).toBeUndefined();
    expect(mySeatState(foldSeats(renewed, 1300 + SEAT_TTL), 3, "pc", A)).toBe("expired");
  });
  it("풀린 자리에 다른 기기가 들어오면, 먼저 쓰던 기기가 뒤늦게 다시 적어도 막힌다", () => {
    const ev = [hold(100, 3, "pc", A), hold(100 + SEAT_TTL + 10, 3, "pc", B), hold(100 + SEAT_TTL + 20, 3, "pc", A)];
    const b = foldSeats(ev, 100 + SEAT_TTL + 30);
    expect(b.seats.get("3:pc")).toMatchObject({ sid: B, since: 100 + SEAT_TTL + 10 });
    expect(mySeatState(b, 3, "pc", A)).toBe("taken");
  });
  it("풀린 자리가 비어 있으면 같은 기기가 다시 잡을 수 있다 (새로 쓰기 시작한 것으로)", () => {
    const b = foldSeats([hold(100, 3, "pc", A), hold(100 + SEAT_TTL + 50, 3, "pc", A)], 100 + SEAT_TTL + 60);
    expect(b.seats.get("3:pc")).toMatchObject({ sid: A, since: 100 + SEAT_TTL + 50 });
  });
  it("로그아웃(free)하면 바로 비고, 끝난 번호로는 다시 못 잡는다", () => {
    const ev = [hold(100, 3, "pc", A), free(150, A), hold(160, 3, "pc", A)];
    const b = foldSeats(ev, 170);
    expect(b.seats.size).toBe(0);
    expect(mySeatState(b, 3, "pc", A)).toBe("freed");
    expect(holder([...ev, hold(180, 3, "pc", B)], 190)).toBe(B);
  });
  it("남의 번호로 보낸 free 는 그 자리를 건드리지 못한다 (자리 주인이 아니면)", () => {
    expect(holder([hold(100, 3, "pc", A), free(120, B)], 130)).toBe(A);
  });
  it("관리자 로그아웃(kick): 그 번호의 자리가 비고, 그 번호는 다시 못 쓴다. 새 로그인은 된다", () => {
    const ev = [hold(100, 3, "pc", A), hold(100, 3, "phone", B), kick(200, [A])];
    const b = foldSeats(ev, 210);
    expect([...b.seats.keys()]).toEqual(["3:phone"]);
    expect(mySeatState(b, 3, "pc", A)).toBe("kicked");
    expect(holder([...ev, hold(220, 3, "pc", A)], 230)).toBeUndefined();
    expect(holder([...ev, hold(220, 3, "pc", C)], 230)).toBe(C);
  });
  it("관리자 명령을 누가 다시 보내도(재전송) 그 뒤의 새 로그인은 건드리지 못한다", () => {
    const ev = [hold(100, 3, "pc", A), kick(200, [A], "k1"), hold(300, 3, "pc", C), kick(400, [A], "k2-replay")];
    expect(holder(ev, 410)).toBe(C);
  });
  it("자리는 서로 따로: 남이 내 로그인 번호로 다른 자리에 적어도(같은 초에 앞서도) 내 자리는 그대로", () => {
    const b = foldSeats([hold(100, 5, "pc", A, "id-1"), hold(100, 3, "pc", A, "id-2"), hold(130, 3, "pc", B)], 140);
    expect(b.seats.get("3:pc")?.sid).toBe(A);
    expect(mySeatState(b, 3, "pc", A)).toBe("mine");
    // 로그아웃(free) · 관리자 로그아웃은 그 번호가 적힌 자리를 모두 비운다
    expect(foldSeats([hold(100, 5, "pc", A), hold(100, 3, "pc", A), free(120, A)], 130).seats.size).toBe(0);
  });
  it("이 자리의 내 hold 가 자리표에 없으면 none (12시간이 지나 기록이 사라진 로그인)", () => {
    const b = foldSeats([hold(100, 5, "pc", A)], 130);
    expect(mySeatState(b, 3, "pc", A)).toBe("none");
  });
  it("같은 초에 두 기기가 같은 자리를 잡으면 줄 id 가 앞선 쪽 — 줄을 어떤 순서로 받든 같은 결론", () => {
    const x = hold(100, 3, "pc", A, "id-2"), y = hold(100, 3, "pc", B, "id-1");
    expect(holder([x, y], 110)).toBe(B);
    expect(holder([y, x], 110)).toBe(B);
  });
  it("같은 초의 hold 와 free 는 hold 먼저 (로그인하자마자 로그아웃해도 자리가 남지 않는다)", () => {
    expect(foldSeats([free(100, A, "id-1"), hold(100, 3, "pc", A, "id-2")], 110).seats.size).toBe(0);
  });
  it("실시간으로도 받고 조회로도 받은 같은 줄은 한 번만 센다 · 순서를 섞어도 결과가 같다", () => {
    const ev = [hold(100, 1, "pc", A, "m1"), hold(105, 1, "pc", B, "m2"), hold(400, 2, "phone", C, "m3"), free(500, A, "m4"), hold(600, 1, "pc", B, "m5")];
    const want = JSON.stringify([...foldSeats(ev, 700).seats]);
    const shuffled = [ev[3], ev[0], ev[4], ev[2], ev[1], ev[0], ev[3]];
    expect(JSON.stringify([...foldSeats(shuffled, 700).seats])).toBe(want);
    expect(foldSeats(ev, 700).seats.get("1:pc")).toMatchObject({ sid: B, since: 600 });
  });
  it("기기 시계가 늦어도(지금 < 마지막 줄 시각) 마지막 줄 시각을 지금으로 본다", () => {
    expect(holder([hold(5000, 3, "pc", A)], 0)).toBe(A);
    expect(holder([hold(100, 3, "pc", A), hold(100 + SEAT_TTL, 4, "pc", B)], 0)).toBeUndefined();
  });
});

describe("자리표의 줄 읽기", () => {
  const line = (message: string, time = 1795600000, id = `L${++seq}`): NtfyLine => ({ id, time, event: "message", message });

  it("hold · free: 비밀 글의 해시가 번호", async () => {
    const secret = newSeatSecret();
    expect(secret).toMatch(/^[0-9a-f]{32}$/);
    const sid = await seatSidOf(secret);
    expect(sid).toMatch(/^[0-9a-f]{16}$/);
    const h = await decodeSeatLine(line(seatHoldBody(7, "phone", sid, "크롬 · 안드로이드 <script>")));
    expect(h).toMatchObject({ kind: "hold", n: 7, role: "phone", sid, dev: "크롬 · 안드로이드 script" });
    const f = await decodeSeatLine(line(seatFreeBody(secret)));
    expect(f).toMatchObject({ kind: "free", sid });
    expect((await decodeSeatLine(line(seatFreeBody(newSeatSecret()))))!).not.toMatchObject({ sid });
    expect(seatHoldBody(7, "phone", sid, "x").length).toBeLessThan(200);
  });

  it("형식이 다른 줄은 버린다", async () => {
    const sid = "0123456789abcdef";
    const bad = [
      "", "hello", "[]", "null", '{"nuga":"s1"}',
      JSON.stringify({ nuga: "s1", t: "hold", n: 0, r: "pc", sid }),
      JSON.stringify({ nuga: "s1", t: "hold", n: 11, r: "pc", sid }),
      JSON.stringify({ nuga: "s1", t: "hold", n: 1.5, r: "pc", sid }),
      JSON.stringify({ nuga: "s1", t: "hold", n: "3", r: "pc", sid }),
      JSON.stringify({ nuga: "s1", t: "hold", n: 3, r: "tv", sid }),
      JSON.stringify({ nuga: "s1", t: "hold", n: 3, r: "pc", sid: "XYZ" }),
      JSON.stringify({ nuga: "s1", t: "hold", n: 3, r: "pc", sid: sid.toUpperCase() }),
      JSON.stringify({ nuga: "s1", t: "free", key: "short" }),
      JSON.stringify({ nuga: "s0", t: "hold", n: 3, r: "pc", sid }),
      JSON.stringify({ nuga: "s1", t: "hold", n: 3, r: "pc", sid, pad: "x".repeat(4000) }),
    ];
    for (const m of bad) expect(await decodeSeatLine(line(m))).toBeNull();
    // 시각이나 id 가 없는 줄도
    expect(await decodeSeatLine({ id: "x", event: "message", message: seatHoldBody(3, "pc", sid) })).toBeNull();
    expect(await decodeSeatLine({ id: "", time: 5, event: "message", message: seatHoldBody(3, "pc", sid) })).toBeNull();
  });

  it("관리자 로그아웃: 관리자 키로 서명한 것만", async () => {
    const { makeAdminKey } = await tool();
    const m = await makeAdminKey("admin-pw", 1000), other = await makeAdminKey("other-pw", 1000);
    const key = (await openAdminKey("admin-pw", m))!, otherKey = (await openAdminKey("other-pw", other))!;
    const a = "1111111111111111", b = "2222222222222222";
    const body = await seatKickBody(key, [b, a, a, "not-a-sid"]);
    expect(body.length).toBeLessThan(400);
    expect(await decodeSeatLine(line(body), m)).toMatchObject({ kind: "kick", sids: [a, b] });
    // 다른 키로 서명 · 글자를 바꿈 · 코드에 든 진짜 키로 확인
    expect(await decodeSeatLine(line(await seatKickBody(otherKey, [a])), m)).toBeNull();
    expect(await decodeSeatLine(line(body.replace(a, "3333333333333333")), m)).toBeNull();
    expect(await decodeSeatLine(line(body))).toBeNull();
    // 관리자 서명이어도 다른 명령 · 빈 명령 · 너무 많은 번호는 버린다
    expect(await decodeSeatLine(line(JSON.stringify(await signAdmin(key, { v: 1, act: "wipe", sids: [a] }))), m)).toBeNull();
    expect(await decodeSeatLine(line(JSON.stringify(await signAdmin(key, { v: 1, act: "logout", sids: [] }))), m)).toBeNull();
    expect(await decodeSeatLine(line(JSON.stringify(await signAdmin(key, { v: 2, act: "logout", sids: [a] }))), m)).toBeNull();
    const many = Array.from({ length: SEAT_KICK_MAX + 1 }, (_, i) => i.toString(16).padStart(16, "0"));
    expect(await decodeSeatLine(line(JSON.stringify(await signAdmin(key, { v: 1, act: "logout", sids: many }))), m)).toBeNull();
    // 20자리(아이디 10 × PC·폰)를 한 번에 로그아웃시켜도 메시지 하나(4KB)에 들어간다
    expect((await seatKickBody(key, many.slice(0, 20))).length).toBeLessThan(1000);
  });

  it("줄 → 사건 → 자리: 처음부터 끝까지", async () => {
    const s1 = newSeatSecret(), s2 = newSeatSecret();
    const [a, b] = [await seatSidOf(s1), await seatSidOf(s2)];
    const lines = [line(seatHoldBody(2, "pc", a, "크롬 · 윈도우"), 1000, "x1"), line(seatHoldBody(2, "pc", b), 1010, "x2"), line("garbage", 1011, "x3"), line(seatFreeBody(s1), 1020, "x4"), line(seatHoldBody(2, "pc", b), 1030, "x5")];
    const ev = (await Promise.all(lines.map((l) => decodeSeatLine(l)))).filter((e): e is SeatEvent => !!e);
    expect(ev.length).toBe(4);
    expect(foldSeats(ev, 1040).seats.get("2:pc")).toMatchObject({ sid: b, since: 1030 });
    expect(foldSeats(ev.slice(0, 2), 1015).seats.get("2:pc")).toMatchObject({ sid: a, dev: "크롬 · 윈도우" });
  });
});
