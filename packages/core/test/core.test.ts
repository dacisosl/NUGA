import { describe, it, expect } from "vitest";
import {
  buildPairingUri, parsePairingUri, generateSyncKey, keyIdOf, encryptEnvelope, decryptEnvelope, encryptBackup, decryptBackup,
  countChars, splitSentences, isNominalEnding, suggestNominal, similarity, josa,
  reviewText, generateLocalDraft, buildDraftRequest, parseDraftResponse,
  resolveNow, lessonFor, mergeRecords, applyTombstones, makeSampleDoc, studentsFromRows, progressFromRows, toExportJson, parseImportJson,
  type NugaRecord, type SyncMessage,
} from "../src";

describe("crypto", () => {
  it("keyId is 16 hex from sha256 prefix", async () => {
    const key = new Uint8Array(32).fill(7);
    const id = await keyIdOf(key);
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(id).toBe((await keyIdOf(new Uint8Array(32).fill(7))));
  });
  it("pairing uri round trip", () => {
    const key = generateSyncKey();
    const uri = buildPairingUri({ key, relayUrl: "http://192.168.0.5:8787", pcName: "교무실 PC" });
    const p = parsePairingUri(uri);
    expect([...p.key]).toEqual([...key]);
    expect(p.relayUrl).toBe("http://192.168.0.5:8787");
    expect(p.pcName).toBe("교무실 PC");
  });
  it("envelope encrypt/decrypt with AAD", async () => {
    const key = generateSyncKey(); const keyId = await keyIdOf(key);
    const msg: SyncMessage = { v: 1, type: "ping", deviceId: "d", sentAt: "t", payload: { name: "폰" } };
    const env = await encryptEnvelope(key, keyId, msg, "phone", "t");
    expect(await decryptEnvelope(key, keyId, env)).toEqual(msg);
    await expect(decryptEnvelope(key, "0000000000000000", env)).rejects.toBeTruthy();
  });
  it("backup password round trip", async () => {
    const c = await encryptBackup("pw", '{"a":1}', "t");
    expect(await decryptBackup("pw", c)).toBe('{"a":1}');
    await expect(decryptBackup("bad", c)).rejects.toThrow();
  });
});

describe("text", () => {
  it("counts chars and NEIS bytes", () => {
    const c = countChars("가나 a");
    expect(c.withSpaces).toBe(4); expect(c.withoutSpaces).toBe(3); expect(c.neisBytes).toBe(3 + 3 + 1 + 1);
  });
  it("splits sentences keeping decimals", () => {
    expect(splitSentences("농도 3.5%를 계산함. 결과를 발표함. 질문함")).toEqual(["농도 3.5%를 계산함.", "결과를 발표함.", "질문함"]);
  });
  it("nominal endings", () => {
    expect(isNominalEnding("개념을 적용하여 설명함.")).toBe(true);
    expect(isNominalEnding("역량을 드러냄")).toBe(true);
    expect(isNominalEnding("열심히 했다.")).toBe(false);
    expect(suggestNominal("열심히 했다.")).toBe("열심히 함.");
    expect(suggestNominal("태도를 보였다.")).toBe("태도를 보임.");
    expect(suggestNominal("모범적인 학생입니다.")).toBe("모범적인 학생임.");
  });
  it("josa", () => { expect(josa("개념", "을/를")).toBe("개념을"); expect(josa("자료", "을/를")).toBe("자료를"); expect(josa("서울", "으로/로")).toBe("서울로"); expect(josa("책", "으로/로")).toBe("책으로"); });
  it("similarity", () => {
    expect(similarity("중화 적정 오차 원인을 발표함", "중화 적정 오차 원인을 발표함")).toBe(1);
    expect(similarity("중화 적정 오차 원인을 발표함", "전자 배치 규칙을 사례와 함께 설명함")).toBeLessThan(0.2);
  });
});

describe("review", () => {
  const ctx = { target: 100, lengthMode: "withSpaces" as const, level: "B" as const, recordCount: 3, lowRecordThreshold: 1, otherDrafts: [], similarityThreshold: 0.6 };
  it("flags forbidden, honorific, name", () => {
    const r = reviewText("서울대 진학을 희망합니다. 이서연은 성실함.", null, { ...ctx, studentName: "이서연" });
    const kinds = r.issues.map((i) => i.kind);
    expect(kinds).toContain("forbidden"); expect(kinds).toContain("honorific"); expect(kinds).toContain("name"); expect(r.result).toBe("fix");
  });
  it("passes a clean draft in range", () => {
    const text = "수업에 성실히 참여하며 배운 개념을 상황에 적용하려는 태도를 보임. 중화 적정 실험에서 오차 원인을 눈금 읽기와 변색 시점으로 나누어 발표함. 개념 이해가 향상됨.";
    const len = countChars(text).withSpaces;
    const r = reviewText(text, [{ text: "a", evidence: ["x"] }], { ...ctx, target: len + 5 });
    expect(r.issues).toEqual([]); expect(r.result).toBe("pass");
  });
  it("length over → check; A + short → levelA", () => {
    expect(reviewText("개념을 설명함.", null, { ...ctx, target: 5 }).issues.some((i) => i.kind === "length")).toBe(true);
    expect(reviewText("개념을 설명함.", null, { ...ctx, level: "A" }).issues.some((i) => i.kind === "levelA")).toBe(true);
    expect(reviewText("개념을 설명함.", null, { ...ctx, recordCount: 1 }).result).toBe("pass");
  });
  it("similar sentence to other student → fix", () => {
    const s = "중화 적정 실험에서 오차 원인을 눈금 읽기와 변색 시점으로 나누어 발표함.";
    const r = reviewText(s, null, { ...ctx, target: 60, otherDrafts: [{ text: s, label: "2-3 5번" }] });
    expect(r.issues.some((i) => i.kind === "similar")).toBe(true);
  });
});

describe("draft", () => {
  const doc = makeSampleDoc(1);
  it("local generator respects target and maps evidence", () => {
    const s = doc.students.find((x) => x.level === "A" && doc.records.filter((r) => r.class === x.class && r.no === x.no && r.status === "confirmed").length >= 3)!;
    const recs = doc.records.filter((r) => r.class === s.class && r.no === s.no && r.status === "confirmed");
    const req = buildDraftRequest({ level: s.level, targetLength: 370, lengthMode: "withSpaces", subject: "화학Ⅰ", records: recs, performances: [], categories: doc.settings.categories });
    expect(JSON.stringify(req)).not.toContain(s.name);
    expect(JSON.stringify(req)).not.toContain('"class"');
    const out = generateLocalDraft(req);
    expect(countChars(out.text).withSpaces).toBeLessThanOrEqual(369);
    expect(out.sentences.every((x) => x.evidence.length > 0)).toBe(true);
    for (const sen of splitSentences(out.text)) expect(isNominalEnding(sen)).toBe(true);
  });
  it("parses model json", () => {
    const p = parseDraftResponse('여기 결과: {"text":"설명함.","sentences":[{"text":"설명함.","evidence":["r1"]}]}');
    expect(p.text).toBe("설명함."); expect(p.sentences[0].evidence).toEqual(["r1"]);
  });
});

describe("timetable & sync", () => {
  const doc = makeSampleDoc(3);
  it("resolves current lesson", () => {
    const mon = new Date("2026-05-11T11:00:00"); // 월 3교시 10:50–11:40 → 2-3
    const n = resolveNow(doc.settings, mon);
    expect(n.current?.class).toBe("2-3"); expect(n.current?.period).toBe(3);
    const early = resolveNow(doc.settings, new Date("2026-05-11T08:00:00"));
    expect(early.current).toBeNull(); expect(early.next?.class).toBe("2-3");
  });
  it("lessonFor falls back to latest earlier progress", () => {
    const l = lessonFor(doc.settings.progress, "2-3", "2026-05-12");
    expect(l).not.toBeNull();
  });
  it("merge prefers newer updatedAt and applies tombstones", () => {
    const a: NugaRecord = { ...doc.records[0], note: "old", updatedAt: "2026-05-01T00:00:00+09:00" };
    const b: NugaRecord = { ...a, note: "new", updatedAt: "2026-05-02T00:00:00+09:00" };
    const m = mergeRecords([a], [b]);
    expect(m.records[0].note).toBe("new"); expect(m.updated.length).toBe(1);
    const t = applyTombstones(m.records, [{ id: a.id, deletedAt: "x" }]);
    expect(t.records.length).toBe(0);
  });
});

describe("import/export", () => {
  it("students from rows with 학번", () => {
    const s = studentsFromRows([{ 학번: "20315", 이름: "홍길동", 수준: "a" }, { 반: "2-5", 번호: 3, 성명: "김철수" }]);
    expect(s[0]).toEqual({ class: "2-3", no: 15, name: "홍길동", level: "A" });
    expect(s[1]).toEqual({ class: "2-5", no: 3, name: "김철수", level: "B" });
  });
  it("progress from rows", () => {
    const p = progressFromRows([{ 날짜: "2026.05.08", 반: "2-3", 단원: "3단원", 차시: 2, 제목: "화학 평형" }]);
    expect(p[0]).toEqual({ date: "2026-05-08", class: "2-3", unit: "3단원", lesson: 2, title: "화학 평형" });
  });
  it("json round trip strips api key", () => {
    const doc = makeSampleDoc(5); doc.settings.ai.apiKey = "secret";
    const text = toExportJson(doc, "t");
    expect(text).not.toContain("secret");
    const back = parseImportJson(text);
    expect(back.students.length).toBe(doc.students.length);
  });
});
