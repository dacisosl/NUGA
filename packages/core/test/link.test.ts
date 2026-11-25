import { describe, expect, it } from "vitest";
import {
  NtfyClient, TEST_LOGIN, assembleNtfy, checkLogin, chunkForNtfy, deriveLoginKey, isTestLogin, ntfyCursor, ntfyTopic, parseNtfyCursor, parseNtfyLines,
  type NtfyLine, type SyncMessage,
} from "../src";

// 로그인 열쇠는 21만 회라 테스트에서는 줄여서도 같은 성질을 본다 (실제 값은 한 번만 확인)
const FAST = 1000;

describe("로그인 열쇠", () => {
  it("같은 아이디·비밀번호면 같은 열쇠, 아이디는 대소문자·앞뒤 공백을 가리지 않음", async () => {
    const a = await deriveLoginKey("Teacher01", "pass-1234", FAST);
    const b = await deriveLoginKey("  teacher01 ", "pass-1234", FAST);
    expect(a.keyB64).toBe(b.keyB64);
    expect(a.keyId).toBe(b.keyId);
    expect(a.keyId).toMatch(/^[0-9a-f]{16}$/);
    expect(a.key.length).toBe(32);
  });
  it("비밀번호나 아이디가 다르면 다른 열쇠", async () => {
    const a = await deriveLoginKey("teacher01", "pass-1234", FAST);
    expect((await deriveLoginKey("teacher01", "pass-1235", FAST)).keyId).not.toBe(a.keyId);
    expect((await deriveLoginKey("teacher02", "pass-1234", FAST)).keyId).not.toBe(a.keyId);
  });
  it("실제 반복 횟수로도 만들어짐 (테스트 계정)", async () => {
    const k = await deriveLoginKey(TEST_LOGIN.id, TEST_LOGIN.password);
    expect(k.keyId).toMatch(/^[0-9a-f]{16}$/);
    expect(isTestLogin(" NUGA-TEST ")).toBe(true);
    expect(isTestLogin("someone")).toBe(false);
  });
  it("입력 검사", () => {
    expect(checkLogin("a", "1234")).toMatch(/아이디/);
    expect(checkLogin("ab", "123")).toMatch(/비밀번호/);
    expect(checkLogin("ab", "1234")).toBeNull();
  });
});

describe("ntfy 조각", () => {
  it("짧은 글은 그대로, 긴 글은 4KB 이하 조각으로 나뉘고 다시 합쳐짐", () => {
    expect(chunkForNtfy("hello", "m1")).toEqual(["hello"]);
    const long = "x".repeat(9000);
    const parts = chunkForNtfy(long, "m2");
    expect(parts.length).toBe(3);
    for (const p of parts) expect(new TextEncoder().encode(p).length).toBeLessThan(4096);
    const lines: NtfyLine[] = parts.map((message, i) => ({ id: `id${i}`, time: 100, event: "message", message }));
    expect(assembleNtfy(lines, 100)).toEqual({ units: [{ id: "id2", time: 100, text: long }], upto: 2 });
  });
  it("조각이 덜 왔으면 그 앞에서 멈춤, 오래도록 안 오면 건너뜀 (영원히 막히지 않게)", () => {
    const parts = chunkForNtfy("y".repeat(8000), "m3");
    const lines: NtfyLine[] = [
      { id: "a", time: 100, event: "message", message: "first" },
      { id: "b", time: 100, event: "message", message: parts[0] },
      { id: "c", time: 101, event: "message", message: "after" },
    ];
    expect(assembleNtfy(lines, 101)).toEqual({ units: [{ id: "a", time: 100, text: "first" }], upto: 0 });
    expect(assembleNtfy(lines, 200).units.map((u) => u.text)).toEqual(["first", "after"]);
  });
  it("머리 조각이 없는 묶음(이미 받은 묶음의 꼬리)은 막지 않고 건너뜀", () => {
    // 실제 ntfy.sh: 같은 초의 앞 조각을 다시 주므로 짝 잃은 조각이 맨 앞에 올 수 있다
    const cfg = chunkForNtfy("z".repeat(5000), "old");
    const lines: NtfyLine[] = [
      { id: "x2", time: 169, event: "message", message: cfg[1] },
      { id: "r1", time: 175, event: "message", message: "record" },
    ];
    expect(assembleNtfy(lines, 176)).toEqual({ units: [{ id: "r1", time: 175, text: "record" }], upto: 1 });
  });
  it("줄 단위 JSON 에서 메시지만 읽음", () => {
    const body = ['{"id":"o","event":"open"}', '{"id":"k","event":"keepalive"}', '{"id":"m1","event":"message","message":"hi"}', "깨진 줄", ""].join("\n");
    expect(parseNtfyLines(body).map((l) => l.id)).toEqual(["m1"]);
  });
  it("이어 받을 위치 = 시각 + 그 초에 받은 id", () => {
    const lines: NtfyLine[] = [{ id: "a", time: 10, event: "message" }, { id: "b", time: 12, event: "message" }, { id: "c", time: 12, event: "message" }];
    const c = ntfyCursor(lines, 2);
    expect(c).toBe("c:12:b,c");
    expect(parseNtfyCursor(c)).toEqual({ time: 12, ids: ["b", "c"] });
    expect(parseNtfyCursor("old-id")).toBeNull();
    expect(ntfyCursor([{ id: "d", time: 12, event: "message" }], 0, { time: 12, ids: ["b", "c"] })).toBe("c:12:b,c,d");
  });
});

describe("NtfyClient", () => {
  // 가짜 ntfy: 통로별 메시지 목록. 진짜처럼 since=<초> 는 그 초를 포함하고, 메시지 세 개가 같은 초에 들어온다
  function fakeNtfy() {
    const topics = new Map<string, { id: string; time: number; event: string; message: string }[]>();
    let seq = 0;
    const fetchImpl = (async (url: string, init?: { method?: string; body?: string }) => {
      const u = new URL(url);
      const topic = u.pathname.split("/").filter(Boolean)[0];
      const list = topics.get(topic) || [];
      if (init?.method === "POST") {
        const m = { id: `n${++seq}`, time: 1_700_000_000 + Math.floor(seq / 3), event: "message", message: String(init.body) };
        topics.set(topic, [...list, m]);
        return new Response(JSON.stringify(m), { status: 200 });
      }
      const since = Number(u.searchParams.get("since") || 0);
      return new Response(list.filter((m) => m.time >= since).map((m) => JSON.stringify(m)).join("\n"), { status: 200 });
    }) as unknown as typeof fetch;
    return { fetchImpl, topics };
  }
  const rec = (id: string): SyncMessage => ({ v: 1, type: "records", deviceId: "phone-1", sentAt: "2026-11-25T10:05:00+09:00", payload: [{
    id, class: "2-3", no: 5, category: 0, time: "2026-11-25T10:05:00+09:00", lesson: null, memo: "", voiceMemo: null, note: "", status: "pending", source: "phone",
    createdAt: "2026-11-25T10:05:00+09:00", updatedAt: "2026-11-25T10:05:00+09:00" }] });

  it("폰이 보낸 기록을 PC 가 받고, 같은 초에 온 것도 한 번씩만 받음", async () => {
    const { fetchImpl, topics } = fakeNtfy();
    const k = await deriveLoginKey("teacher01", "pass-1234", FAST);
    const phone = new NtfyClient("https://ntfy.example", k.keyId, k.key, 0, fetchImpl);
    const pc = new NtfyClient("https://ntfy.example", k.keyId, k.key, 0, fetchImpl);
    await phone.send(rec("r1"), "phone");
    expect([...topics.keys()]).toEqual([ntfyTopic(k.keyId, "pc")]);
    const got = await pc.pull("pc");
    expect(got).toHaveLength(1);
    expect(got[0].message).toEqual(rec("r1"));
    expect(got[0].item.from).toBe("phone");
    // 같은 초에 하나 더: 앞의 것은 다시 오지 않고 새것만
    await phone.send(rec("r2"), "phone");
    const got2 = await pc.pull("pc", got[0].item.id);
    expect(got2.map((g) => g.message && g.message.type === "records" ? g.message.payload[0].id : null)).toEqual(["r2"]);
    expect(await pc.pull("pc", got2[0].item.id)).toHaveLength(0);
    // PC 쪽 통로에서는 폰이 받을 것이 없다
    expect(await phone.pull("phone")).toHaveLength(0);
  });

  it("큰 config 는 조각으로 가서 합쳐지고, 같은 초의 앞 조각이 다시 와도 막히지 않음", async () => {
    const { fetchImpl, topics } = fakeNtfy();
    const k = await deriveLoginKey("teacher01", "pass-1234", FAST);
    const pc = new NtfyClient("https://ntfy.example", k.keyId, k.key, 0, fetchImpl);
    const phone = new NtfyClient("https://ntfy.example", k.keyId, k.key, 0, fetchImpl);
    const roster = Array.from({ length: 120 }, (_, i) => ({ class: "2-3", no: i + 1, name: `학생${i + 1}` }));
    const cfg = { v: 1, type: "config", deviceId: "pc-1", sentAt: "2026-11-25T10:00:00+09:00", payload: { roster } } as unknown as SyncMessage;
    await pc.send(cfg, "pc");
    expect(topics.get(ntfyTopic(k.keyId, "phone"))!.length).toBeGreaterThan(1);
    const got = await phone.pull("phone");
    expect(got).toHaveLength(1);
    expect(got[0].message).toEqual(cfg);
    // 그 뒤에 온 기록 (같은 초·다음 초): config 조각을 다시 받거나 막히지 않고 기록만
    await pc.send(rec("r9"), "pc");
    const next = await phone.pull("phone", got[0].item.id);
    expect(next.map((g) => g.message?.type)).toEqual(["records"]);
  });

  it("조회에 아직 안 나온 새 메시지도 알림(SSE)으로 받은 것으로 바로 받고, 나중에 조회에 나와도 다시 받지 않음", async () => {
    const { fetchImpl, topics } = fakeNtfy();
    const k = await deriveLoginKey("teacher01", "pass-1234", FAST);
    const phone = new NtfyClient("https://ntfy.example", k.keyId, k.key, 0, fetchImpl);
    const pc = new NtfyClient("https://ntfy.example", k.keyId, k.key, 0, fetchImpl);
    await phone.send(rec("r1"), "phone");
    const got = await pc.pull("pc");
    await phone.send(rec("r2"), "phone");
    // 진짜 ntfy.sh 처럼: 방금 온 r2 는 아직 조회 결과에 없고 알림으로만 왔다
    const list = topics.get(ntfyTopic(k.keyId, "pc"))!;
    const fresh = list.pop()!;
    expect(pc.feed("pc", JSON.stringify(fresh))).toBe(true);
    expect(pc.feed("pc", JSON.stringify({ id: "open", event: "open" }))).toBe(false);
    const got2 = await pc.pull("pc", got[0].item.id);
    expect(got2.map((g) => g.message && g.message.type === "records" ? g.message.payload[0].id : null)).toEqual(["r2"]);
    // 조회 결과에 늦게 나타나도 다시 오지 않음
    list.push(fresh);
    expect(await pc.pull("pc", got2[0].item.id)).toHaveLength(0);
  });

  it("다른 비밀번호로는 풀리지 않고, 로그인 전 메시지는 받지 않음", async () => {
    const { fetchImpl } = fakeNtfy();
    const k = await deriveLoginKey("teacher01", "pass-1234", FAST);
    const other = await deriveLoginKey("teacher01", "wrong-pass", FAST);
    expect(other.keyId).not.toBe(k.keyId);
    const pc = new NtfyClient("https://ntfy.example", k.keyId, k.key, 0, fetchImpl);
    await pc.send(rec("r1"), "pc");
    const intruder = new NtfyClient("https://ntfy.example", k.keyId, other.key, 0, fetchImpl);
    expect((await intruder.pull("phone"))[0].message).toBeNull();
    const late = new NtfyClient("https://ntfy.example", k.keyId, k.key, 1_900_000_000, fetchImpl);
    expect(await late.pull("phone")).toHaveLength(0);
  });
});
