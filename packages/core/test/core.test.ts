import { describe, it, expect } from "vitest";
import {
  buildPairingUri, parsePairingUri, generateSyncKey, keyIdOf, encryptEnvelope, decryptEnvelope, encryptBackup, decryptBackup,
  countChars, splitSentences, isNominalEnding, suggestNominal, similarity, josa,
  reviewText, generateLocalDraft, buildDraftRequest, parseDraftResponse,
  resolveNow, lessonFor, syncProgressSkeleton, routeRecordArea, classSortKey, classifySentence, cleanSpans, mergeRecords, applyTombstones, makeSampleDoc, studentsFromRows, progressFromRows, toExportJson, parseImportJson,
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
  it("counts newline as 2 NEIS bytes", () => {
    expect(countChars("가\n나").neisBytes).toBe(3 + 2 + 3);
    expect(countChars("가\r\n나").neisBytes).toBe(3 + 2 + 3);
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
  const ctx = { target: 100, lengthMode: "withSpaces" as const, achievement: 60 as number | null, recordCount: 3, lowRecordThreshold: 1, otherDrafts: [], similarityThreshold: 0.6 };
  it("flags forbidden, honorific, name", () => {
    const r = reviewText("서울대 진학을 희망합니다. 이서연은 성실함.", null, { ...ctx, studentName: "이서연" });
    const kinds = r.issues.map((i) => i.kind);
    expect(kinds).toContain("forbidden"); expect(kinds).toContain("honorific"); expect(kinds).toContain("name"); expect(r.result).toBe("fix");
  });
  it("passes a clean draft in range", () => {
    const text = "수업에 성실히 참여하며 배운 개념을 상황에 적용하려는 태도를 보임. 중화 적정 실험에서 오차 원인을 눈금 읽기와 변색 시점으로 나누어 발표함. 개념 이해가 향상됨.";
    const len = countChars(text).withSpaces;
    const r = reviewText(text, [{ text: "a", evidence: ["x"] }], { ...ctx, target: len + 2 });
    expect(r.issues).toEqual([]); expect(r.result).toBe("pass");
  });
  it("length over → check; A + short → levelA", () => {
    expect(reviewText("개념을 설명함.", null, { ...ctx, target: 5 }).issues.some((i) => i.kind === "length")).toBe(true);
    expect(reviewText("개념을 설명함.", null, { ...ctx, achievement: 85 }).issues.some((i) => i.kind === "levelA")).toBe(true);
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
    const s = doc.students.find((x) => doc.records.filter((r) => r.class === x.class && r.no === x.no && r.status === "confirmed").length >= 3)!;
    const recs = doc.records.filter((r) => r.class === s.class && r.no === s.no && r.status === "confirmed");
    const req = buildDraftRequest({ achievement: 85, targetLength: 370, lengthMode: "withSpaces", subject: "화학Ⅰ", records: recs, performances: [], categories: doc.settings.categories });
    expect(JSON.stringify(req)).not.toContain(s.name);
    expect(JSON.stringify(req)).not.toContain('"class"');
    const out = generateLocalDraft(req);
    expect(countChars(out.text).withSpaces).toBeLessThanOrEqual(370);
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
    expect(s[0]).toEqual({ class: "2-3", no: 15, name: "홍길동", achievement: { auto: null, manual: 85, confidence: "ok" } });
    expect(s[1]).toEqual({ class: "2-5", no: 3, name: "김철수" });
    expect(studentsFromRows([{ 반: "1-1", 번호: 1, 이름: "가", 도달정도: "72" }])[0].achievement?.manual).toBe(72);
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

describe("progress skeleton & class names", () => {
  it("adds blank rows per lesson date, keeps filled rows, drops stale blanks", () => {
    const tt = [{ weekday: 1, period: 3, class: "2-3" }, { weekday: 1, period: 4, class: "2-3" }, { weekday: 3, period: 2, class: "동아리A" }];
    const r = syncProgressSkeleton([{ date: "2026-03-02", class: "2-3", unit: "1단원", lesson: 1, title: "몰" }], tt, 2026, 1);
    expect(r.progress.find((p) => p.date === "2026-03-02")!.unit).toBe("1단원");
    expect(r.progress.filter((p) => p.class === "2-3" && p.date === "2026-03-09").length).toBe(1); // 같은 날 2교시 → 1행
    expect(r.progress.some((p) => p.class === "동아리A" && p.date === "2026-03-04")).toBe(true);
    const r2 = syncProgressSkeleton(r.progress, tt.filter((t) => t.class !== "동아리A"), 2026, 1);
    expect(r2.progress.some((p) => p.class === "동아리A")).toBe(false);
    expect(r2.removed).toBeGreaterThan(0);
    expect(lessonFor(r.progress, "2-3", "2026-03-09")?.unit).toBe("1단원"); // 빈 행은 건너뛰고 이전 진도
  });
  it("sorts free-form class names after numeric ones", () => {
    expect(["동아리A", "2-10", "2-3", "1-1"].sort((a, b) => classSortKey(a) - classSortKey(b))).toEqual(["1-1", "2-3", "2-10", "동아리A"]);
  });
});

describe("highlight (학생활동·역량·평가)", () => {
  const kinds = (s: string) => classifySentence(s).filter((p) => p.kind !== "none").map((p) => `${p.kind}:${p.text}`);
  it("splits activity, competency and evaluation", () => {
    const k = kinds("수업 중 자신이 모르는 부분은 적극적으로 질문하고 자기관리 역량이 매우 뛰어난 학생임.");
    expect(k).toContain("activity:수업 중 자신이 모르는 부분은 적극적으로 질문");
    expect(k).toContain("competency:자기관리 역량");
    expect(k).toContain("evaluation:매우 뛰어난 학생");
  });
  it("spans always rebuild the sentence", () => {
    const s = "평가활동 후에도 스스로 더 개선할 부분을 찾아 학습하고 정리함으로써 꾸준히 발전하고자 노력하는 성실한 언어 학습자임.";
    expect(classifySentence(s).map((p) => p.text).join("")).toBe(s);
    expect(kinds(s).some((x) => x.startsWith("evaluation:") && x.includes("성실한 언어 학습자"))).toBe(true);
  });
  it("flags evaluation-heavy drafts in review", () => {
    const ctx = { target: 500, lengthMode: "withSpaces" as const, achievement: 60, recordCount: 1, lowRecordThreshold: 1, otherDrafts: [], similarityThreshold: 0.7 };
    const heavy = "모든 활동에서 매우 뛰어난 학생임. 탁월한 의사소통 역량과 문제 해결 능력이 매우 뛰어남. 누구보다 모범적인 학생임. 배려심이 남다른 학생임.";
    const light = "수업 중 모르는 부분을 적극적으로 질문하고 독해에서 부족한 부분을 보충함. 글쓰기 과제에서 해결 방안을 자세히 작성함.";
    expect(reviewText(heavy, null, ctx).issues.some((i) => i.kind === "evalHeavy")).toBe(true);
    expect(reviewText(light, null, ctx).issues.some((i) => i.kind === "evalHeavy")).toBe(false);
  });
  it("rejects AI spans that do not rebuild the sentence", () => {
    expect(cleanSpans("질문함.", [{ text: "질문", kind: "activity" }, { text: "함.", kind: "none" }])).toHaveLength(2);
    expect(cleanSpans("질문함.", [{ text: "발표", kind: "activity" }])).toBeUndefined();
  });
});

describe("area routing by time", () => {
  const periods = [{ no: 1, start: "09:00", end: "09:45" }, { no: 2, start: "09:55", end: "10:40" }, { no: 3, start: "10:50", end: "11:35" }];
  // 초등 담임형: 같은 반(3-1)이 국어·수학 두 영역에 걸친다. 2026-10-05는 월요일.
  const areas = [
    { id: "kor", periods, timetable: [{ weekday: 1, period: 1, class: "3-1" }], classes: ["3-1"] },
    { id: "math", periods, timetable: [{ weekday: 1, period: 2, class: "3-1" }], classes: ["3-1"] },
    { id: "sci", periods, timetable: [], classes: ["5-2"] },
  ];
  const at = (h: number, m: number) => new Date(2026, 9, 5, h, m).toISOString();
  it("picks the area whose lesson covers the record time", () => {
    expect(routeRecordArea(areas, { class: "3-1", time: at(9, 10) }, "math")).toBe("kor");
    expect(routeRecordArea(areas, { class: "3-1", time: at(10, 0) }, "kor")).toBe("math");
  });
  it("falls back to the latest earlier lesson of the day", () => {
    expect(routeRecordArea(areas, { class: "3-1", time: at(13, 0) }, "kor")).toBe("math");
  });
  it("falls back to class membership, then current area", () => {
    expect(routeRecordArea(areas, { class: "5-2", time: at(9, 10) }, "kor")).toBe("sci");
    expect(routeRecordArea(areas, { class: "3-1", time: at(8, 0) }, "math")).toBe("math");
    expect(routeRecordArea(areas, { class: "9-9", time: at(9, 10) }, "kor")).toBe("kor");
  });
});

describe("achievement (도달 정도 · 내부 등급)", () => {
  it("grade boundaries", async () => {
    const { gradeOf } = await import("../src");
    expect(gradeOf(100)).toBe("A"); expect(gradeOf(80)).toBe("A"); expect(gradeOf(79)).toBe("B");
    expect(gradeOf(60)).toBe("B"); expect(gradeOf(59)).toBe("C"); expect(gradeOf(40)).toBe("C");
    expect(gradeOf(39)).toBe("D"); expect(gradeOf(20)).toBe("D"); expect(gradeOf(19)).toBe("E"); expect(gradeOf(0)).toBe("E");
    expect(gradeOf(null)).toBeNull();
  });
  it("migrates legacy A/B/C to manual scores", async () => {
    const { migrateDoc, emptyDoc, studentAchievement } = await import("../src");
    const d = emptyDoc();
    d.students = [{ class: "1-1", no: 1, name: "가", level: "A" }, { class: "1-1", no: 2, name: "나", level: "B" }, { class: "1-1", no: 3, name: "다", level: "C" }];
    d.settings.ai.provider = "local";
    const m = migrateDoc(d);
    expect(m.students.map((s) => s.achievement?.manual)).toEqual([85, 60, 35]);
    expect(m.students.every((s) => s.level === undefined)).toBe(true);
    expect(studentAchievement(m.students[0])).toBe(85);
    expect(m.settings.ai.provider).toBe("anthropic");
    expect(migrateDoc(m)).toEqual(m);
  });
  it("estimates from records with confidence", async () => {
    const { estimateAchievement } = await import("../src");
    const rec = (note: string, i: number) => ({ note, memo: "", time: `2026-04-0${i}T10:00:00`, status: "confirmed" as const });
    expect(estimateAchievement([]).confidence).toBe("none");
    const low = estimateAchievement([rec("활동에 참여함", 1)]);
    expect(low.confidence).toBe("low");
    const hi = estimateAchievement([rec("개념 간 관계를 연결하여 새로운 사례에 적용하고 설명함", 1), rec("스스로 가설을 세워 다른 방법으로 검증함", 2), rec("비교하여 분석함", 3)]);
    expect(hi.confidence).toBe("ok");
    expect(hi.value!).toBeGreaterThan(low.value!);
  });
  it("prompt carries vocabulary, not grade or number", async () => {
    const { userPrompt, buildDraftRequest, GRADE_STYLE } = await import("../src");
    const base = { targetLength: 1500, lengthMode: "bytes" as const, subject: "화학Ⅰ", records: [], performances: [], categories: [] };
    const hi = userPrompt(buildDraftRequest({ ...base, achievement: 92 }));
    const lo = userPrompt(buildDraftRequest({ ...base, achievement: 12 }));
    expect(hi).toContain(GRADE_STYLE.A.vocab[0]); expect(lo).toContain(GRADE_STYLE.E.vocab[0]);
    expect(hi).not.toContain("92"); expect(hi).not.toMatch(/등급\s*A|수준\s*A/);
    expect(hi).toContain("1500바이트"); expect(hi).toContain("1440~1500바이트");
    // 경계 근처(81)는 이웃 등급 어휘도 허용
    expect(userPrompt(buildDraftRequest({ ...base, achievement: 81 }))).toContain(GRADE_STYLE.B.vocab[0]);
  });
});

describe("presets & byte length", () => {
  it("applies school preset", async () => {
    const { applySchoolPreset, defaultSettings } = await import("../src");
    const s = applySchoolPreset(defaultSettings(), "elem");
    expect(s.categories.map((c) => c.label)).toEqual(["학습태도", "발표", "관계", "생활"]);
    expect(s.writeItem).toBe("elemSubject"); expect(s.lengthMode).toBe("bytes"); expect(s.targetLength["세특"]).toBe(1500);
    expect(applySchoolPreset(defaultSettings(), "high").categories[3].label).toBe("탐구");
  });
  it("byte window and format", async () => {
    const { lengthWindow, formatLength } = await import("../src");
    expect(lengthWindow(1500)).toEqual({ min: 1440, max: 1500 });
    expect(formatLength("가나다 abc", 1500, "bytes")).toBe("13 / 1,500 B · 약 7자");
  });
  it("local generator stays within byte limit", () => {
    const doc = makeSampleDoc(3);
    const s = doc.students.find((x) => doc.records.filter((r) => r.class === x.class && r.no === x.no && r.note).length >= 4)!;
    const recs = doc.records.filter((r) => r.class === s.class && r.no === s.no);
    const out = generateLocalDraft(buildDraftRequest({ achievement: 60, targetLength: 300, lengthMode: "bytes", subject: "화학Ⅰ", records: recs, performances: [], categories: doc.settings.categories }));
    expect(countChars(out.text).neisBytes).toBeLessThanOrEqual(300);
  });
});
