import { describe, expect, it } from "vitest";
import { HELP_ASK_MAKER, HELP_FAQ, HELP_SECTIONS, helpChatRequest, helpManualText, maskNames, searchHelp } from "../src/help";

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

// 설명서에 그대로 없는 다른 말투 (낱말 바꿔 말하기 · 띄어쓰기 · 조사 · 사이에 낀 말)
const PARAPHRASES: [string, string][] = [
  ["애들 이름 어디다 입력해?", "roster"], ["새 학기 반 세팅 어떻게 해", "roster"], ["엑셀 명렬표 불러오기", "roster"],
  ["학생 추가하는 메뉴가 어디 있죠", "roster"], ["전학생 들어왔는데 어떻게 넣어", "roster"], ["우리반 애들 명단 넣고 싶은데요", "roster"],
  ["학생 명부 업로드", "roster"], ["반을 하나 더 만들고 싶어", "roster"], ["처음 쓰는데 학생들 어떻게 등록해요", "roster"],
  ["명단 엑셀 형식 뭐로 해야 돼", "roster"], ["2반 명단도 넣고 싶어", "roster"], ["학생 명단 수정", "roster"], ["반 이름 정하기", "roster"],
  ["몇 교시에 어느 반인지 등록", "timetable"], ["시간표 설정은 어디서", "timetable"], ["교시별로 반 정해두는 거", "timetable"],
  ["시간표 안 넣으면 안 돼?", "timetable"], ["수업 시간 등록", "timetable"], ["교시 설정", "timetable"],
  ["모바일이랑 컴퓨터 같이 쓰려면", "phone"], ["폰에서 쓴 게 컴에 안 떠요", "phone"], ["핸드폰에 앱 깔고 연결", "phone"],
  ["폰으로 찍은 기록이 컴퓨터에 안 넘어와요", "phone"], ["위젯 추가하는 법", "phone"], ["아이디 로그인 어떻게", "phone"],
  ["스마트폰이랑 연동하는 방법", "phone"], ["테스트 아이디가 뭐야", "phone"], ["동기화가 안 돼요", "phone"], ["안드로이드 앱 연결", "phone"],
  ["핸드폰 기록이 왜 안 보여", "phone"],
  ["손목시계로 기록", "watch"], ["갤워치 되나요", "watch"], ["워치 앱", "watch"], ["워치로 번호 누르기", "watch"], ["갤럭시 워치 기록 방법", "watch"],
  ["노트북에서 관찰 내용 적기", "pc-record"], ["컴퓨터로 기록 남기는 방법", "pc-record"], ["학생 카드 눌러서 쓰는 거 맞아?", "pc-record"],
  ["pc에서 직접 입력하고 싶어요", "pc-record"], ["모바일 화면이 뭐야", "pc-record"], ["현황판에서 기록 추가", "pc-record"],
  ["오타 났어요", "edit"], ["기록 없애는 법", "edit"], ["적은 내용 바꾸고 싶어요", "edit"], ["실수로 쓴 기록 삭제", "edit"],
  ["기록 편집 가능?", "edit"], ["기록 고치는 법", "edit"], ["잘못 넣은 기록 없애기", "edit"], ["오타 수정", "edit"], ["기록 삭제가 안 보여", "edit"],
  ["빨간 숫자 뜨는 거 뭐야", "inbox"], ["미반영 기록 처리하는 법", "inbox"], ["쉬는시간에 뭐 하라는 거야", "inbox"],
  ["알림 팝업 뜨는 거", "inbox"], ["보완은 언제 해", "inbox"], ["미반영 숫자", "inbox"],
  ["수업 중에 말한 거 자동으로 적어줘?", "recording"], ["녹취 기능 있어?", "recording"], ["녹음 기능 켜기", "recording"], ["마이크 권한", "recording"],
  ["음성으로 기록 남길 수 있어?", "recording"], ["녹음하면 음성 파일은 어디 저장돼", "recording"], ["자동 추천이 뭐야", "recording"],
  ["녹음 끄기", "recording"], ["녹음 파일 지워져?", "recording"],
  ["메모해둔 거 통째로 붙여넣기", "bulk"], ["종이에 적은 거 사진 찍어서 올릴 수 있어?", "bulk"], ["엑셀에 정리해둔 관찰기록 넣기", "bulk"],
  ["한글 파일 내용 가져오기", "bulk"], ["사진 올리면 글자 읽어줘?", "bulk"], ["pdf로 기록 올리기", "bulk"], ["한꺼번에 기록하기", "bulk"],
  ["메모장에 쓴 거 넣기", "bulk"], ["엑셀 붙여 넣어서 기록", "bulk"], ["사진으로 기록 입력", "bulk"],
  ["학생부 자동으로 써줘", "draft"], ["교과세특 문장 만들기", "draft"], ["생기부 쓰는 법", "draft"], ["세특 자동 생성", "draft"],
  ["종합의견 초안", "draft"], ["반 전체 한 번에 생성", "draft"], ["초안 생성 버튼", "draft"], ["행발 쓰기", "draft"],
  ["생활기록부 작성 도와줘", "draft"], ["세특 쓰기 도움", "draft"], ["행동특성 초안 생성", "draft"],
  ["인공지능 안 쓰고도 돼?", "no-ai"], ["ai 안 쓰면 어떻게 써져", "no-ai"], ["키 없어도 초안 나와?", "no-ai"],
  ["무료로 쓸 수 있나요", "no-ai"], ["규칙 기반이 뭐야", "no-ai"], ["ai 없으면 초안 품질", "no-ai"],
  ["챗gpt 연결하고 싶어", "ai-key"], ["gpt 키 등록", "ai-key"], ["클로드 연결", "ai-key"], ["ai 모델 바꾸기", "ai-key"],
  ["api 키 넣는 곳", "ai-key"], ["제미나이 쓰고 싶어", "ai-key"], ["openai 키", "ai-key"],
  ["글자수 제한 맞추기", "length"], ["너무 길게 써져요", "length"], ["바이트 수 맞추기", "length"], ["분량 줄이는 법", "length"],
  ["글자 수 초과", "length"], ["바이트 제한", "length"], ["글자수가 너무 많아", "length"], ["분량 설정", "length"],
  ["이 문장 어디서 나온 거야", "evidence"], ["문장 근거 확인", "evidence"], ["이 문장은 어떤 기록에서 나왔어", "evidence"],
  ["근거 기록 보기", "evidence"], ["검토 탭에서 뭘 봐", "evidence"],
  ["나이스 입력", "neis"], ["엑셀로 뽑고 싶어", "neis"], ["나이스로 복사", "neis"], ["엑셀로 내보내기", "neis"],
  ["나이스 붙여넣기", "neis"], ["엑셀 파일로 저장하기", "neis"], ["나이스 복사 붙여넣기", "neis"],
  ["컴퓨터 바꾸면 기록 다 사라져?", "backup"], ["자료 날아가면 어떡해", "backup"], ["백업 파일 불러오기", "backup"],
  ["다른 컴퓨터로 옮기기", "backup"], ["기록 복구", "backup"], ["기록 백업", "backup"], ["새 컴퓨터로 옮겨야 해", "backup"], ["백업 파일 위치", "backup"],
  ["학생 정보 외부로 나가?", "privacy"], ["보안 괜찮아?", "privacy"], ["서버에 이름 저장돼?", "privacy"], ["암호화 되나요", "privacy"],
  ["개인정보 처리 방침", "privacy"], ["서버에 뭐가 저장돼", "privacy"],
  ["웨일북에서 돼?", "whale"], ["웨일 스페이스 연동", "whale"], ["네이버 웨일 브라우저", "whale"], ["웨일 연계가 뭐야", "whale"],
  ["팀보드 연동", "whale"], ["웨일 클래스 연동", "whale"],
  ["계단 그래프 의미", "stairs"], ["출발선 이름표 의미", "stairs"], ["계단이 뭐야", "stairs"], ["이름표가 아래 있는 애는 뭐야", "stairs"],
  ["계단 그래프 보는 법", "stairs"],
  ["학부모 면담 때 활용", "counsel"], ["면담 자료로 쓰기", "counsel"], ["상담 때 활용법", "counsel"], ["학부모 상담 자료", "counsel"],
  ["누가 기록이 제일 적어?", "student-data"], ["기록 제일 많은 학생", "student-data"], ["몇 명이 기록 없어?", "student-data"],
  ["기록 적은 학생 알려줘", "student-data"], ["가장 기록 적은 애", "student-data"],
  ["누가는 어떤 앱이에요?", "about"], ["이 앱 뭐 하는 앱이야", "about"], ["누가 앱 장점이 뭐야", "about"],
  ["어떻게 시작하면 돼?", "start"], ["데모 끝내고 내 반으로 시작하려면?", "start"], ["실제로 시작하고 싶어", "start"], ["데모 데이터로 먼저 보고 싶어", "start"], ["처음 설정 순서", "start"], ["체험해 볼 수 있어?", "start"],
];

// 지엽적인 질문 · 설명서에 없는 기능 · 앱 오류 · 엉뚱한 질문 → 제작자에게 (짐작해서 답하지 않는다)
const ASK_MAKER = [
  "오늘 날씨 어때", "점심 메뉴 추천", "ㅋㅋㅋ", "너 누가 만들었어?", "환불 되나요", "앱 버전 몇이야", "다크모드 있어?", "맥에서도 돼?",
  "글꼴 바꾸고 싶어", "학교 메신저랑 연동돼?", "주식 추천해줘", "수행평가 채점 기준 알려줘", "업데이트 언제 해요", "출결 관리도 돼?",
  "폰트 크기 키우기", "아이패드 지원해?", "가격이 얼마야", "로그인 비밀번호 잊어버렸어", "사랑해", "돈 내야 돼?",
  "앱이 자꾸 꺼져요", "생기부 생성하다 오류 나요", "업데이트는 어떻게 받아요", "윈도우7에서도 돼?", "오늘 점심 뭐 먹지", "날씨 알려줘",
  "다크모드 지원?", "아이패드에서 써도 돼?", "비밀번호 까먹었어", "가격 얼마예요", "카톡으로 공유 가능?", "학생 성적 분석해줘", "수행평가 채점해줘",
  "너 이름이 뭐야", "인생 상담 좀", "학급 운영 팁 알려줘", "교육청 공문 써줘", "프린트 하고 싶어", "학생 사진 넣을 수 있어?", "기록에 태그 붙이기",
  "학년 올라가면 기록 넘어가?",
  "앱이 안 열려요", "설치 파일 어디서 받아", "로그아웃이 안 돼요?", "학생 생일 등록", "오늘 몇 일이야", "영어로 바꿀 수 있어?", "엑셀 매크로 짜줘",
  "회의록 써줘", "급식표 보여줘", "누가 앱 만든 회사 어디야", "구글 드라이브 연동", "학부모한테 문자 보내기", "기록에 별표 표시", "졸업생 기록 보관 기간", "버튼 색 바꾸기",
  "앱이 느려요", "와이파이 없으면?", "학급 홈페이지 만들어줘", "생기부 표절 검사", "교무수첩 연동", "음악 틀어줘", "번역해줘",
];

describe("도움말 답 찾기", () => {
  it.each(CASES)("%s → %s", (q, id) => {
    expect(searchHelp(q).best?.id).toBe(id);
  });
  it.each(PARAPHRASES)("다른 말투: %s → %s", (q, id) => {
    expect(searchHelp(q).best?.id).toBe(id);
  });
  it.each(ASK_MAKER)("설명서 밖: %s → 제작자에게", (q) => {
    const r = searchHelp(q);
    expect(r.best).toBeNull();
    expect(["maker", "unsure"]).toContain(r.kind);
    expect(r.text).toContain(HELP_ASK_MAKER);
  });
  it("엉뚱한 질문은 비슷한 질문 칩 없이 바로 제작자에게", () => {
    for (const q of ["오늘 날씨 어때", "점심 메뉴 추천", "ㅋㅋㅋ"]) {
      const r = searchHelp(q);
      expect(r.kind).toBe("maker");
      expect(r.related).toHaveLength(0);
    }
  });
  it("앱 오류는 설명서 낱말이 있어도 제작자에게 (짐작해서 답하지 않음)", () => {
    const r = searchHelp("생기부 생성하다 오류 나요");
    expect(r.kind).toBe("maker");
    expect(r.related.map((f) => f.id)).toContain("draft");
  });
  it("설치처럼 약한 말은 설명서 답이 뚜렷하면 답한다", () => {
    expect(searchHelp("폰 앱 설치 후 연결").best?.id).toBe("phone");
  });
  it("애매하면 '혹시 이 질문인가요?' 칩 + 제작자 안내", () => {
    const r = searchHelp("학년 올라가면 기록 넘어가?");
    expect(r.kind).toBe("unsure");
    expect(r.related.length).toBeGreaterThan(0);
  });
  it("한 낱말만 물으면 되묻는다 · 인사에는 인사로", () => {
    const r = searchHelp("기록");
    expect(r.kind).toBe("ambiguous");
    expect(r.related).toHaveLength(3);
    expect(searchHelp("안녕하세요").kind).toBe("chat");
    expect(searchHelp("고마워요!").kind).toBe("chat");
  });
  it("설명서 질문을 그대로 물으면 바로 그 답", () => {
    for (const f of HELP_FAQ) expect(searchHelp(f.q).best?.id).toBe(f.id);
  });
  it("빠르다 (질문 하나 1ms 아래)", () => {
    const qs = PARAPHRASES.map(([q]) => q);
    searchHelp(qs[0]);
    const t = performance.now();
    for (let i = 0; i < 1000; i++) searchHelp(qs[i % qs.length]);
    expect((performance.now() - t) / 1000).toBeLessThan(1);
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
  it("설명서로 답할 수 없으면 '제작자에게 물어봐주세요'라고 하도록 시킨다", () => {
    expect(helpChatRequest("다크모드 있어요?", [], []).system).toContain(HELP_ASK_MAKER);
  });
  it("학생 기록 안내 항목은 설명서 전문에 넣지 않는다", () => {
    expect(helpManualText()).not.toContain("기록이 부족한 학생은 누구인가요?");
  });
  it("한 글자 이름은 가리지 않는다 (낱말을 망가뜨리지 않게)", () => {
    expect(maskNames("반 명단", ["반"]).text).toBe("반 명단");
  });
});
