import { describe, expect, it } from "vitest";
import { HELP_FAQ, HELP_SECTIONS, helpChatRequest, helpManualText, maskNames, searchHelp } from "../src/help";

// 선생님이 실제로 물을 법한 말 → 맞는 항목
const CASES: [string, string][] = [
  ["반 명단은 어떻게 넣어요?", "roster"],
  ["학생 목록 엑셀로 올리고 싶어요", "roster"],
  ["학생 등록 어디서 해", "roster"],
  ["시간표 꼭 넣어야 돼?", "timetable"],
  ["폰이랑 연결이 안 돼요", "phone"],
  ["휴대폰 앱 QR 찍는 법", "phone"],
  ["갤럭시 워치로도 기록돼?", "watch"],
  ["컴퓨터에서 바로 기록하려면", "pc-record"],
  ["기록 잘못 썼는데 수정 어떻게 해요", "edit"],
  ["기록 지우고 싶어요", "edit"],
  ["미반영이 뭐예요", "inbox"],
  ["수업 녹음 켜는 법", "recording"],
  ["자동녹음 기록은 어떻게 하나요", "recording"],
  ["관찰기록 여러 개 한 번에 넣기", "bulk"],
  ["스캔한 PDF도 읽어요?", "bulk"],
  ["세특 초안 만들기", "draft"],
  ["행동특성 및 종합의견 써줘", "draft"],
  ["AI 없이도 쓸 수 있나요", "no-ai"],
  ["제미나이 키 어디에 넣어요", "ai-key"],
  ["1500바이트 넘어요", "length"],
  ["어떤 기록이 문장 근거인지 보고 싶어", "evidence"],
  ["나이스에 옮기는 법", "neis"],
  ["백업은 어떻게 해요", "backup"],
  ["학생 이름이 서버로 가나요? 개인정보 걱정돼요", "privacy"],
  ["웨일 사이드바에서 쓸 수 있어?", "whale"],
  ["출발선이 뭐야", "stairs"],
  ["학부모 상담할 때 쓸 수 있어?", "counsel"],
  ["기록 부족한 학생 누구야?", "student-data"],
  ["우리 반에서 기록 가장 많은 애 몇 명이야", "student-data"],
];

describe("도움말 답 찾기", () => {
  it.each(CASES)("%s → %s", (q, id) => {
    expect(searchHelp(q).best?.id).toBe(id);
  });
  it("엉뚱한 질문은 찾지 못함 + 가까운 질문 2개", () => {
    for (const q of ["오늘 날씨 어때", "점심 메뉴 추천", "ㅋㅋㅋ"]) {
      const r = searchHelp(q);
      expect(r.best).toBeNull();
      expect(r.related).toHaveLength(2);
    }
  });
  it("관련 질문은 답과 겹치지 않고 학생 기록 안내는 빠진다", () => {
    const r = searchHelp("폰 연결");
    expect(r.related.map((f) => f.id)).not.toContain(r.best!.id);
    expect(r.related.some((f) => f.data)).toBe(false);
  });
  it("항목 id 가 겹치지 않고 모두 바로 가기가 있다", () => {
    expect(new Set(HELP_FAQ.map((f) => f.id)).size).toBe(HELP_FAQ.length);
    for (const f of HELP_FAQ) expect(f.links?.length).toBeGreaterThan(0);
    for (const s of HELP_SECTIONS) expect(s.links.length).toBeGreaterThan(0);
  });
});

describe("AI 요청", () => {
  it("설명서만 근거로 주고 학생 이름은 가린다", () => {
    const req = helpChatRequest("홍도윤 기록은 어떻게 고쳐요?", [{ role: "user", text: "류지아가 미반영에 있어요" }, { role: "bot", text: "미반영을 누르세요" }], ["홍도윤", "류지아"]);
    expect(req.system).toContain(helpManualText());
    expect(req.user).not.toMatch(/홍도윤|류지아/);
    expect(req.user).toContain("학생 기록은 어떻게 고쳐요?");
    expect(req.masked).toBe(true);
  });
  it("학생 기록 안내 항목은 설명서 전문에 넣지 않는다", () => {
    expect(helpManualText()).not.toContain("기록이 부족한 학생은 누구인가요?");
  });
  it("한 글자 이름은 가리지 않는다 (낱말을 망가뜨리지 않게)", () => {
    expect(maskNames("반 명단", ["반"]).text).toBe("반 명단");
  });
});
