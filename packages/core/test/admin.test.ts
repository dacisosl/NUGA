import { describe, expect, it } from "vitest";
import { ADMIN_KEY, canonicalJson, hasAdminKey, isAdminLogin, openAdminKey, signAdmin, verifyAdmin, type AdminKeyMaterial } from "../src";

// 키를 만드는 쪽은 도구(tools/admin-key.mjs, Node), 여는 쪽은 앱(core): 둘이 맞물리는지 본다
const toolPath = "../../../tools/admin-key.mjs";
const tool = (): Promise<{ makeAdminKey: (password: string, iterations?: number) => Promise<AdminKeyMaterial>; randomAdminPassword: (n?: number) => string }> => import(/* @vite-ignore */ toolPath);
const FAST = 1000;

describe("관리자 명령 서명", () => {
  it("정해진 순서의 JSON: 키 순서가 달라도 같은 글자", () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 1, c: null }], z: undefined })).toBe('{"a":[2,{"c":null,"d":1}],"b":1}');
    expect(canonicalJson({ a: [2, { c: null, d: 1 }], b: 1 })).toBe(canonicalJson({ b: 1, a: [2, { d: 1, c: null }] }));
  });

  it("도구가 만든 키를 비밀번호로 열어 서명하고, 공개키로 확인한다", async () => {
    const { makeAdminKey, randomAdminPassword } = await tool();
    const password = randomAdminPassword();
    expect(password).toMatch(/^[a-z0-9]{26}$/);
    const m = await makeAdminKey(password, FAST);
    const key = await openAdminKey(password, m);
    expect(key).not.toBeNull();
    expect(key!.extractable).toBe(false);
    const cmd = { v: 1, act: "logout", id: "*", upto: 1795600000 };
    const msg = await signAdmin(key!, cmd);
    expect(msg.nuga).toBe("adm1");
    expect(await verifyAdmin(msg, m)).toEqual(cmd);
    // 전송을 거쳐도 (JSON 으로 썼다 읽어도) 그대로
    expect(await verifyAdmin(JSON.parse(JSON.stringify(msg)), m)).toEqual(cmd);
  });

  it("비밀번호가 틀리면 열리지 않는다", async () => {
    const { makeAdminKey } = await tool();
    const m = await makeAdminKey("right-password-123", FAST);
    expect(await openAdminKey("right-password-124", m)).toBeNull();
    expect(await openAdminKey("", m)).toBeNull();
  });

  it("글자를 바꾸거나 다른 키로 서명한 명령은 버린다", async () => {
    const { makeAdminKey } = await tool();
    const m = await makeAdminKey("pw-one", FAST), other = await makeAdminKey("pw-two", FAST);
    const key = (await openAdminKey("pw-one", m))!, otherKey = (await openAdminKey("pw-two", other))!;
    const msg = await signAdmin(key, { act: "logout", id: "nuga-test-03", upto: 100 });
    expect(await verifyAdmin({ ...msg, p: msg.p.replace("03", "04") }, m)).toBeNull();
    expect(await verifyAdmin({ ...msg, s: msg.s.slice(0, -2) + (msg.s.endsWith("AA") ? "BB" : "AA") }, m)).toBeNull();
    expect(await verifyAdmin(await signAdmin(otherKey, { act: "logout", id: "*", upto: 100 }), m)).toBeNull();
    // 서명은 맞아도 '정해진 순서'가 아닌 글자는 버린다 (같은 명령을 다른 글자로 다시 보내지 못하게)
    expect(await verifyAdmin(await signAdmin(key, { act: "logout" }).then((x) => ({ ...x, p: `${x.p} ` })), m)).toBeNull();
    for (const junk of [null, 1, "x", {}, { nuga: "adm1" }, { nuga: "adm1", p: "{}", s: "AAAA" }, { nuga: "adm0", p: msg.p, s: msg.s }]) expect(await verifyAdmin(junk, m)).toBeNull();
  });

  it("다른 키의 잠긴 개인키가 섞이면 열리지 않는다", async () => {
    const { makeAdminKey } = await tool();
    const a = await makeAdminKey("same-password", FAST), b = await makeAdminKey("same-password", FAST);
    expect(await openAdminKey("same-password", { pub: a.pub, blob: b.blob })).toBeNull();
  });

  it("코드에 든 관리자 키: 형식이 맞고, 아무 글이나 통과시키지 않는다", async () => {
    expect(hasAdminKey()).toBe(true);
    expect(ADMIN_KEY.pub).not.toContain(" ");
    expect(await verifyAdmin({ nuga: "adm1", p: '{"act":"logout"}', s: "A".repeat(86) })).toBeNull();
    expect(await openAdminKey("guess")).toBeNull();
    expect(isAdminLogin(" NUGA-Admin ")).toBe(true);
    expect(isAdminLogin("nuga-test-01")).toBe(false);
  });
});
