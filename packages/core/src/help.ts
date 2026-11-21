/**
 * 앱 안 도움말: 핵심만 담은 사용설명서 + '묻고 답하기' 챗봇의 자료와 답 찾기.
 * - 챗봇은 앱 사용법만 답한다. 학생 기록은 읽지 않는다.
 * - AI 가 없으면 searchHelp 로 설명서에서 답을 찾고(외부 전송 없음), AI 가 있으면 helpChatRequest 로 설명서만 근거로 묻는다.
 * - 화면 이름은 앱의 실제 버튼 이름과 같게 쓴다 (미반영 · 일괄 기록 + · 생기부 생성 · 모바일 화면 · 저장 ▾ …).
 */

/** [바로 가기] 가 여는 곳. 'settings:<탭>' 은 설정의 그 탭 */
export type HelpGo =
  | "main" | "draft" | "mobile" | "inbox" | "bulk" | "whale" | "chat"
  | "settings:roster" | "settings:timetable" | "settings:sync" | "settings:ai" | "settings:recording"
  | "settings:backup" | "settings:length" | "settings:privacy";
export interface HelpLink { label: string; go: HelpGo }
export interface HelpSection {
  id: string;
  title: string;
  /** 제목 옆 짧은 표 (걸리는 시간·때) */
  tag?: string;
  /** 언제 쓰나 */
  when: string;
  lines: string[];
  links: HelpLink[];
}
export interface HelpFaq {
  id: string;
  q: string;
  a: string;
  /** 같은 뜻의 말 (질문에 들어 있으면 이 항목으로) */
  keys: string[];
  links?: HelpLink[];
  /** 학생 기록을 묻는 질문 (챗봇이 답하지 않는 범위를 안내) */
  data?: boolean;
}

export const HELP_FLOW = "수업 중 10초 기록 → 쉬는 시간 30초 보완 → 현황판으로 한눈에 → 학기 말 생기부 초안";

export const HELP_SECTIONS: HelpSection[] = [
  {
    id: "setup", title: "처음 설정", tag: "5분", when: "앱을 처음 열었을 때",
    lines: ["학교급을 고르면 항목·분량·문체가 정해져요", "설정 → 반·명단에 엑셀을 가져오거나 이름을 붙여 넣어요", "시간표에 반을 넣어 두면 지금 수업 반이 먼저 떠요"],
    links: [{ label: "반·명단", go: "settings:roster" }, { label: "시간표", go: "settings:timetable" }],
  },
  {
    id: "record", title: "수업 중 기록", tag: "10초", when: "수업 중 눈에 띈 순간",
    lines: ["폰 위젯·워치에서 번호를 누르고 [기록]", "PC에서는 로고 아래 [모바일 화면]에서 번호 → 저장", "무엇을 했는지는 쉬는 시간에 한 줄로"],
    links: [{ label: "모바일 화면", go: "mobile" }, { label: "폰 연결", go: "settings:sync" }],
  },
  {
    id: "inbox", title: "쉬는 시간 보완", tag: "30초", when: "수업이 끝난 뒤",
    lines: ["위쪽 [미반영]을 누르면 쉬는 시간 기록 창이 열려요", "수동 기록: 관찰 내용을 한 줄 쓰고 Enter", "자동 추천(녹음): 추천 문구를 보고 명단에서 학생만 누르기"],
    links: [{ label: "미반영 열기", go: "inbox" }],
  },
  {
    id: "board", title: "현황판", tag: "한눈에", when: "언제든",
    lines: ["위는 기록 계단, 아래는 학생 카드", "옅은 붉은 카드·출발선 이름표 = 기록이 부족한 학생", "카드를 눌러 맨 위 칸에 쓰고 Enter 하면 바로 기록"],
    links: [{ label: "현황판", go: "main" }],
  },
  {
    id: "bulk", title: "여러 건 한꺼번에", when: "적어 둔 관찰기록이 많을 때",
    lines: ["[일괄 기록 +]에 엑셀·한글·메모를 붙여 넣거나 PDF·사진을 올려요", "한 줄이 기록 하나 · 번호·이름·날짜·분류를 함께 읽어요"],
    links: [{ label: "일괄 기록", go: "bulk" }],
  },
  {
    id: "draft", title: "생기부 생성", tag: "학기 말", when: "학기 말",
    lines: ["위쪽 [생기부 생성] → 개별 · 일괄 · 검토", "체크한 기록으로 초안을 쓰고, 문장마다 근거 기록이 붙어요", "[AI 생성] 스위치로 AI와 규칙 기반 비교 · [복사]로 NEIS에"],
    links: [{ label: "생기부 생성", go: "draft" }, { label: "항목·분량", go: "settings:length" }],
  },
  {
    id: "safe", title: "녹음 · 개인정보 · 백업", when: "필요할 때",
    lines: ["수업 녹음은 기본 꺼짐 · 설정 → 녹음에서 조건 4가지를 확인한 뒤 켜요", "학생 이름은 PC에만 · 폰과는 반·번호만 암호화해 주고받아요", "[저장 ▾] → 전체 백업(JSON) · 누가기록 엑셀"],
    links: [{ label: "녹음", go: "settings:recording" }, { label: "백업", go: "settings:backup" }],
  },
];

export const HELP_FAQ: HelpFaq[] = [
  { id: "roster", q: "반·명단은 어떻게 넣나요?", keys: ["명단", "학생 목록", "학생 등록", "명렬", "반 만들", "반 추가", "이름 넣", "출석부", "학생 추가"],
    a: "설정 → 반·명단에서 반을 만들고 엑셀 파일을 가져오거나 이름을 붙여 넣으면 돼요. 웨일 스페이스 관리자 명단 파일도 그대로 읽어요.",
    links: [{ label: "반·명단", go: "settings:roster" }] },
  { id: "timetable", q: "시간표는 왜 넣나요?", keys: ["시간표", "교시", "수업 시간", "진도"],
    a: "시간표가 있으면 폰과 모바일 화면이 지금 수업하는 반을 먼저 띄워서 번호만 누르면 돼요. 설정 → 시간표에서 칸에 반을 지정해요.",
    links: [{ label: "시간표", go: "settings:timetable" }] },
  { id: "phone", q: "폰과는 어떻게 연결하나요?", keys: ["폰", "핸드폰", "휴대폰", "스마트폰", "연결", "동기화", "qr", "페어링", "위젯", "안드로이드", "아이폰"],
    a: "PC 설정 → 동기화에서 [동기화 키 생성]을 누르고 나온 QR을 폰 앱으로 찍어요. 연결이 안 되면 릴레이 주소와 PC 방화벽(8787)을 확인하세요.",
    links: [{ label: "동기화", go: "settings:sync" }] },
  { id: "watch", q: "워치에서도 기록되나요?", keys: ["워치", "시계", "갤럭시 워치", "wear"],
    a: "네. Wear OS 워치에서 [기록] → 번호 → 저장하면 폰 기록과 같이 PC의 미반영으로 모여요.",
    links: [{ label: "동기화", go: "settings:sync" }] },
  { id: "pc-record", q: "PC에서 바로 기록하려면?", keys: ["pc에서", "컴퓨터", "바로 기록", "직접 입력", "기록 추가", "기록하", "기록 남기", "입력"],
    a: "현황판에서 학생 카드를 눌러 맨 위 칸에 한 줄 쓰고 Enter 하면 돼요. 번호만 빠르게 남기려면 로고 아래 [모바일 화면]을 쓰세요.",
    links: [{ label: "현황판", go: "main" }, { label: "모바일 화면", go: "mobile" }] },
  { id: "edit", q: "기록을 고치거나 지우려면?", keys: ["수정", "고치", "고쳐", "삭제", "지우", "잘못", "편집", "취소"],
    a: "학생 카드를 눌러 기록 창을 열고, 항목을 누르면 고칠 수 있어요. 지울 때는 그 항목의 [삭제]를 눌러요.",
    links: [{ label: "현황판", go: "main" }] },
  { id: "inbox", q: "미반영이 뭔가요?", keys: ["미반영", "쉬는 시간", "보완", "처리", "대기", "알림", "팝업"],
    a: "폰·워치에서 번호만 남긴 기록과 녹음 추천처럼 아직 내용을 채우지 않은 것들이에요. 위쪽 [미반영]을 눌러 한 줄씩 채우면 학생 기록이 돼요.",
    links: [{ label: "미반영 열기", go: "inbox" }] },
  { id: "recording", q: "수업 녹음은 어떻게 켜나요?", keys: ["녹음", "음성", "자동 기록", "자동녹음", "받아쓰기", "마이크", "스크립트", "자동 추천", "녹음 추천"],
    a: "설정 → 녹음에서 사용 조건 4가지(학교 승인, 사전 안내·동의, 외부 전송 검토, 녹음 표시·즉시 중단)를 확인한 뒤 켜요. 기본은 꺼짐이고, 음성은 폰에만 두었다가 24시간 뒤 지워요.",
    links: [{ label: "녹음", go: "settings:recording" }] },
  { id: "bulk", q: "기록 여러 건을 한꺼번에 넣을 수 있나요?", keys: ["한꺼번에", "여러 건", "여러 개", "일괄 기록", "한 번에", "한글 문서", "pdf", "사진", "스캔", "ocr", "메모장"],
    a: "위쪽 [일괄 기록 +]에 엑셀·한글·메모를 붙여 넣거나 PDF·사진을 올리면 돼요. 한 줄이 기록 하나이고, 줄 앞의 번호·이름·날짜·분류를 함께 읽어요.",
    links: [{ label: "일괄 기록", go: "bulk" }] },
  { id: "draft", q: "생기부 초안은 어떻게 만드나요?", keys: ["생기부", "세특", "초안", "생성", "행특", "종합의견", "행동특성", "작성", "써 줘", "써줘"],
    a: "위쪽 [생기부 생성] → 개별 탭에서 학생을 고르고 체크한 기록으로 초안을 만들어요. 반 전체는 [일괄], 다 쓴 뒤 확인은 [검토] 탭이에요.",
    links: [{ label: "생기부 생성", go: "draft" }] },
  { id: "no-ai", q: "AI 없이도 되나요?", keys: ["ai 없이", "키 없이", "무료", "규칙", "오프라인", "인터넷 없"],
    a: "네. AI 키가 없으면 규칙 기반으로 초안을 써요. 생성 창의 [AI 생성] 스위치로 AI와 규칙 기반을 번갈아 비교할 수 있어요.",
    links: [{ label: "생기부 생성", go: "draft" }, { label: "AI 설정", go: "settings:ai" }] },
  { id: "ai-key", q: "AI 키는 어디에 넣나요?", keys: ["api", "키", "claude", "gemini", "제미나이", "클로드", "gpt", "openrouter", "로컬 llm", "모델", "ai 설정"],
    a: "설정 → AI에서 제공자를 고르고 키를 넣은 뒤 [연결 테스트]를 눌러요. 키는 PC 보안 저장소에 두고 백업 파일에는 넣지 않아요.",
    links: [{ label: "AI 설정", go: "settings:ai" }] },
  { id: "length", q: "글자 수(바이트)는 어떻게 맞추나요?", keys: ["바이트", "글자 수", "글자수", "분량", "길이", "1500", "1,500", "500자", "넘쳐", "넘어", "줄이"],
    a: "설정 → 항목·분량에서 NEIS 바이트 한도를 정하면 초안이 그 안에 맞춰 써져요. 초안 위에 '1,452/1,500B'처럼 지금 분량이 보여요.",
    links: [{ label: "항목·분량", go: "settings:length" }] },
  { id: "evidence", q: "어떤 기록이 어떤 문장이 됐는지 볼 수 있나요?", keys: ["근거", "출처", "어느 기록", "어떤 기록", "연결", "반영도", "검토"],
    a: "초안의 문장을 누르면 근거가 된 기록이 이어져 보여요. [검토] 탭에서는 문장–근거 연결도와 반영도 체크리스트를 봐요.",
    links: [{ label: "생기부 생성", go: "draft" }] },
  { id: "neis", q: "NEIS에는 어떻게 옮기나요?", keys: ["neis", "나이스", "복사", "옮기", "내보내", "엑셀로 저장", "엑셀 저장"],
    a: "초안의 [복사]로 NEIS 입력칸에 붙여 넣으면 돼요. 기록 전체는 위쪽 [저장 ▾] → 누가기록 엑셀로 내보내기.",
    links: [{ label: "생기부 생성", go: "draft" }] },
  { id: "backup", q: "백업은 어떻게 하나요?", keys: ["백업", "복원", "다른 pc", "다른 컴퓨터", "옮겨", "날아", "잃어", "저장"],
    a: "위쪽 [저장 ▾] → 전체 백업(JSON)으로 설정과 기록을 한 파일로 저장해요. 다른 PC에서는 설정 → 백업에서 불러와요.",
    links: [{ label: "백업", go: "settings:backup" }] },
  { id: "privacy", q: "학생 개인정보는 안전한가요?", keys: ["개인정보", "보안", "유출", "서버", "암호화", "안전", "이름이 밖"],
    a: "학생 이름은 PC에만 있어요. 폰·워치·서버에는 반·번호만 종단간 암호화로 오가고, AI 초안 요청에도 이름이 들어가지 않아요.",
    links: [{ label: "개인정보 처리방침", go: "settings:privacy" }] },
  { id: "whale", q: "네이버 웨일에서도 쓸 수 있나요?", keys: ["웨일", "웨일 스페이스", "웨일 클래스", "팀보드", "사이드바", "네이버", "웨일북"],
    a: "웨일 브라우저 사이드바에 모바일 화면을 띄워 기록할 수 있고, 웨일 스페이스 명단 파일을 그대로 가져와요. 위쪽 [웨일 연계]에서 서비스별로 둘러볼 수 있어요.",
    links: [{ label: "웨일 연계", go: "whale" }] },
  { id: "stairs", q: "기록 계단은 무엇인가요?", keys: ["계단", "출발선", "이름표", "그래프", "기록 흐름"],
    a: "기록 수에 따라 학생 이름표가 출발선(0건)부터 계단을 올라요. 아래쪽에 남은 학생이 다음 수업에서 눈여겨볼 학생이에요.",
    links: [{ label: "현황판", go: "main" }] },
  { id: "counsel", q: "상담에 기록을 쓸 수 있나요?", keys: ["상담", "학부모", "면담", "진로"],
    a: "학생 카드를 눌러 날짜별 기록을 보며 이야기하면 돼요. '9월 18일 모둠 활동에서…'처럼 구체적인 장면으로 말할 수 있어요.",
    links: [{ label: "현황판", go: "main" }] },
  { id: "student-data", data: true, q: "기록이 부족한 학생은 누구인가요?", keys: ["누구", "몇 명", "어떤 학생", "우리 반", "부족한 학생", "기록 많은", "기록 적은", "가장 많", "가장 적"],
    a: "챗봇은 학생 기록을 보지 않아요. 현황판의 옅은 붉은 카드와 기록 계단의 출발선 이름표에서 바로 확인하세요.",
    links: [{ label: "현황판", go: "main" }] },
];

/** 처음 칩으로 보여 줄 질문 */
export const HELP_STARTERS = ["roster", "phone", "draft", "no-ai"];

/* ---------- 설명서에서 답 찾기 (AI 없이) ---------- */

// 질문에 흔히 붙는 말 (답을 가르는 데 쓰지 않는다)
const FILLER = /(어떻게|어디서|어디에|어디|무엇을|무엇|뭐예요|뭔가요|뭐야|뭐지|하나요|할까요|되나요|있나요|인가요|해야|하면|하려면|방법|알려\s*줘|싶어요|싶은데|궁금해요|궁금|주세요|좀|이거|그거|해요|돼요|가요|나요|까요|어요|아요|요|\?|!|\.)/g;
const flat = (s: string) => s.toLowerCase().replace(/\s+/g, "");
const clean = (s: string) => flat(s.toLowerCase().replace(FILLER, " "));
const bigrams = (s: string): Set<string> => { const a = Array.from(s); const out = new Set<string>(); for (let i = 0; i < a.length - 1; i++) out.add(a[i] + a[i + 1]); return out; };

export interface HelpHit { faq: HelpFaq; score: number }
export interface HelpAnswer {
  /** 가장 맞는 항목 (기준에 못 미치면 null) */
  best: HelpFaq | null;
  /** 함께 보여 줄 관련 질문 (최대 2개) */
  related: HelpFaq[];
}

/** 질문 하나를 항목마다 점수로: 같은 뜻의 말(keys) 일치 + 글자 두 개씩 겹침 */
export function scoreHelp(question: string): HelpHit[] {
  const q = flat(question), qc = clean(question);
  const qb = bigrams(qc);
  return HELP_FAQ.map((faq) => {
    let score = 0;
    for (const k of faq.keys) { const kf = flat(k); if (kf && q.includes(kf)) score += 2 + Math.min(Array.from(kf).length, 4) * 0.5; }
    if (qb.size) {
      const fb = bigrams(clean(`${faq.q} ${faq.keys.join(" ")}`));
      let hit = 0; qb.forEach((b) => { if (fb.has(b)) hit++; });
      score += (hit / qb.size) * 4;
    }
    return { faq, score };
  }).sort((a, b) => b.score - a.score);
}

const THRESHOLD = 2.4;
/** 설명서에서 답 찾기. 학생 기록을 묻는 질문(누구·몇 명 …)은 사용법 낱말이 없을 때만 그 안내로 */
export function searchHelp(question: string): HelpAnswer {
  if (!question.trim()) return { best: null, related: HELP_STARTERS.map((id) => HELP_FAQ.find((f) => f.id === id)!).slice(0, 2) };
  const hits = scoreHelp(question);
  const howTo = /(어떻게|방법|하려면|어디)/.test(question);
  let ranked = hits;
  if (howTo) ranked = hits.filter((h) => !h.faq.data || h.score >= THRESHOLD * 2).concat(hits.filter((h) => h.faq.data && h.score < THRESHOLD * 2));
  const top = ranked[0];
  const best = top && top.score >= THRESHOLD ? top.faq : null;
  const related = ranked.filter((h) => h.faq !== best && !h.faq.data && h.score > 0.6).slice(0, 2).map((h) => h.faq);
  if (related.length < 2) for (const id of HELP_STARTERS) { const f = HELP_FAQ.find((x) => x.id === id)!; if (f !== best && !related.includes(f) && related.length < 2) related.push(f); }
  return { best, related };
}

/* ---------- AI 로 답하기 (키가 있을 때) ---------- */

/** AI 에 근거로 주는 설명서 전문 (사용설명서 + 자주 묻는 질문) */
export function helpManualText(): string {
  const secs = HELP_SECTIONS.map((s, i) => `${i + 1}. ${s.title}${s.tag ? ` (${s.tag})` : ""} — ${s.when}\n${s.lines.map((l) => `- ${l}`).join("\n")}`).join("\n");
  const faq = HELP_FAQ.filter((f) => !f.data).map((f) => `Q. ${f.q}\nA. ${f.a}`).join("\n");
  return `[누가 한눈에] ${HELP_FLOW}\n\n[사용설명서]\n${secs}\n\n[자주 묻는 질문]\n${faq}`;
}

export interface HelpTurn { role: "user" | "bot"; text: string }

/** 질문 속 학생 이름을 '학생'으로 (두 글자 이상 이름만, 긴 이름부터) */
export function maskNames(text: string, names: string[]): { text: string; masked: boolean } {
  let out = text, masked = false;
  const list = [...new Set(names.map((n) => n.trim()).filter((n) => Array.from(n).length >= 2))].sort((a, b) => b.length - a.length);
  for (const n of list) if (out.includes(n)) { out = out.split(n).join("학생"); masked = true; }
  return { text: out, masked };
}

/** AI 에 보낼 요청: 설명서만 근거로, 학생 이름은 가리고, 최근 대화 3턴까지 */
export function helpChatRequest(question: string, history: HelpTurn[], names: string[]): { system: string; user: string; masked: boolean } {
  const system = [
    "너는 교사용 기록 앱 '누가'의 도움말 도우미다.",
    "아래 설명서에 있는 내용만 근거로, 한국어 존댓말 2~4문장으로 짧게 답한다. 버튼·메뉴 이름은 설명서에 쓰인 그대로 [ ]로 적는다.",
    "설명서에 없는 기능은 지어내지 말고 '설명서에서 찾지 못했어요'라고 한 뒤 가장 가까운 항목을 안내한다.",
    "학생 기록·성적·특정 학생에 대한 질문에는 답하지 않고, 현황판에서 확인하라고 안내한다.",
    "",
    helpManualText(),
  ].join("\n");
  const q = maskNames(question, names);
  let masked = q.masked;
  const recent = history.slice(-6).map((t) => { const m = maskNames(t.text, names); masked ||= m.masked; return `${t.role === "user" ? "교사" : "도우미"}: ${m.text}`; });
  const user = `${recent.length ? `[이전 대화]\n${recent.join("\n")}\n\n` : ""}[질문]\n${q.text}`;
  return { system, user, masked };
}
