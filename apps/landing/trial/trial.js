// 누가 체험 페이지 (부스용 · 약 1분): 방식 고르기 → 기록 → 한눈에 → 생기부 → (상담)
// 학생·기록·대본은 모두 체험용 합성 데이터이고 AI·서버를 부르지 않는다.
// 안내("이것을 누르세요")는 vendor/driver.js (MIT). 없거나 폰을 세로로 든 경우에는 무대 안 말풍선으로 대신한다.
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const stage = $("#stage"), scene = $("#scene"), curtainEl = $("#curtain"), rotEl = $("#rotate");
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarse = matchMedia("(pointer: coarse)").matches;
// 폰(짧은 변 600px 미만의 터치 기기)에서는 화면 키보드가 무대를 가리므로 한 줄은 예시로만 넣는다
const PHONE = coarse && Math.min(screen.width, screen.height) < 600;
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const bytes = (t) => [...t].reduce((n, c) => n + (c.charCodeAt(0) > 127 ? 3 : 1), 0);
const LOGO = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 25h7v-7h7v-7h8" fill="none" stroke="currentColor" stroke-width="3"/></svg>';
// 부스 태블릿은 ?booth=1 로 연다: 첫 화면에 QR, 손대지 않으면 더 빨리 처음으로
const BOOTH = new URLSearchParams(location.search).has("booth");
const DRV = window.driver?.js?.driver;
// 효과음 · 흔들림 · 쿵 (fx.js). 그 파일이 없거나 막혀도 체험은 그대로 돌게 빈 것으로 받는다
/*fx*/ const FX = window.FX || { s() {}, shake() {}, thud() {}, burst() {}, flash() {}, calm() {} };
let drv = null, hintEls = [], proxy = null, proxyFor = null;

/* ---------- 무대 맞춤 ---------- */
// 960×540 무대를 화면에 맞춘다. 폰을 세로로 들었으면(ROT) 90° 돌려 꽉 채운다: 회전 잠금·아이폰에서도 폰만 옆으로 돌리면 된다
let SCALE = 1, ROT = false;
function fit() {
  const W = innerWidth, H = innerHeight;
  const rot = H > W && Math.min(W, H) < 600;
  if (rot !== ROT) { ROT = rot; hintOff(); }
  SCALE = ROT ? Math.min(H / 960, W / 540) : Math.min(W / 960, H / 540);
  stage.style.transform = ROT
    ? `translate(${(W + 540 * SCALE) / 2}px,${(H - 960 * SCALE) / 2}px) rotate(90deg) scale(${SCALE})`
    : `translate(${(W - 960 * SCALE) / 2}px,${(H - 540 * SCALE) / 2}px) scale(${SCALE})`;
  document.documentElement.style.setProperty("--s", SCALE.toFixed(3));
  document.documentElement.classList.toggle("rot", ROT);
  placeProxy(); drv?.refresh();
}
addEventListener("resize", fit); addEventListener("orientationchange", fit); fit();

/** 전체 화면 + 가로 고정 (되는 기기만: 안드로이드 크롬. 아이폰은 막혀 있어 무대를 돌려 그리는 쪽으로 간다) */
async function toLandscape() {
  const el = document.documentElement;
  try {
    if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" });
    await screen.orientation.lock("landscape");
    return true;
  } catch { return false; }
}
function rotPrompt() {
  if (!ROT || rotEl.dataset.seen) return;
  rotEl.dataset.seen = "1"; rotEl.classList.add("show");
  setTimeout(() => rotEl.classList.remove("show"), 2800);
}
rotEl.addEventListener("click", (e) => { rotEl.classList.remove("show"); if (e.target.closest("#rotbtn")) toLandscape(); });

/* ---------- 데이터 (합성) ---------- */
const NAMES = ["홍도윤", "류지아", "주시우", "용아린", "여재원", "윤수아", "모서아", "권태윤", "국동현", "왕승현", "이태윤", "금이준", "공이준", "설유진", "윤하준", "한예서", "기지아", "문민준", "허서아", "황재원", "허소율", "편예린", "기정우", "손시우", "임다은", "석예은"];
// recs = [카테고리, 날짜, 내용] (오래된 것부터), sens = [문장, 근거가 된 recs 번호]. 생기부는 실제 분량(1,500B 가까이)으로 둔다
const LV = {
  elem: {
    label: "초등", area: "4학년 2반", cls: "4-2", classes: ["4-2"], n: 24, period: "2교시", time: "09:50–10:30", lesson: "국어 · 의견을 나누어요", topic: "토의하기",
    cats: ["학습태도", "발표", "관계", "생활"], item: "행동특성 및 종합의견",
    slide: ["국어 4-2 · 의견을 나누어요", "쉬는 시간 운동장, 어떻게 쓰면 좋을까?", "모둠 토의 → 발표"],
    chips: [
      { t: "친구 의견을 끝까지 듣고 자기 생각을 덧붙임", c: 1, s: "토의에서 친구의 의견을 끝까지 듣고 자신의 생각을 덧붙이며 함께 생각을 키워 가는 모습을 보임." },
      { t: "모둠 준비물을 스스로 챙겨 나눠 줌", c: 3, s: "모둠 준비물을 스스로 챙겨 나누어 주는 등 주변을 살피는 따뜻한 마음이 드러남." },
      { t: "발표가 어려운 친구에게 먼저 차례를 양보함", c: 2, s: "발표를 어려워하는 친구에게 먼저 차례를 양보하며 친구를 배려하는 태도를 보임." },
    ],
    script: [
      ["09:51", 2, "저는 축구하는 친구들이 운동장을 다 써서 불편했어요."],
      ["09:52", 3, "근데 축구를 하고 싶은 사람도 많잖아요."],
      ["09:52", 1, "두 의견 모두 이유가 있네요. 다른 생각 있는 친구?"],
      ["09:53", 4, "저는 생각이 조금 달라요. 요일을 나눠서 쓰면 둘 다 할 수 있을 것 같아요."],
      ["09:54", 5, "그러면 월수금은 축구, 화목은 다른 놀이 어때요?"],
      ["09:54", 2, "좋아요. 그러면 저도 괜찮아요."],
    ],
    pickLine: 3, sgTag: "근거를 든 의견", sgTitle: "다른 의견을 듣고 대안을 제시", sgCat: 1, sgMemo: "운동장 사용 토의에서 요일을 나누자는 대안을 제시함",
    sgS: "운동장 사용 토의에서 요일을 나누어 쓰자는 대안을 제시하며 서로 다른 의견을 함께 풀어 가는 힘을 보여 줌.",
    recs: [
      [3, "09/02", "아침 독서 시간에 스스로 책을 골라 조용히 읽음"],
      [2, "09/04", "모둠 활동에서 친구의 의견을 끝까지 듣고 정리해 줌"],
      [0, "09/09", "수학 시간에 틀린 문제를 스스로 다시 풀어 봄"],
      [3, "09/11", "교실 화분 물 주기를 맡아 한 주 동안 빠짐없이 챙김"],
      [1, "09/16", "과학 실험 결과를 그림으로 그려 발표"],
      [2, "09/18", "다툰 친구에게 먼저 다가가 사과하고 화해함"],
      [0, "09/23", "모르는 낱말을 사전에서 찾아 공책에 정리"],
      [1, "09/25", "국어 시간에 자신의 경험을 들어 의견을 또박또박 발표"],
      [2, "09/30", "전학 온 친구에게 학교 곳곳을 안내해 줌"],
      [3, "10/02", "급식 당번을 맡아 끝까지 책임 있게 마무리"],
      [0, "10/07", "수학 익힘 문제를 다 푼 뒤 친구의 풀이를 도와줌"],
      [1, "10/12", "사회 시간에 우리 고장 조사 내용을 사진과 함께 발표"],
      [3, "10/14", "쉬는 시간에 떨어진 쓰레기를 스스로 주워 정리"],
    ],
    sens: [
      ["모둠 활동에서 친구의 의견을 끝까지 듣고 정리해 주며, 다툰 친구에게 먼저 다가가 사과하고 화해하는 등 친구를 존중하고 관계를 소중히 여기는 마음이 돋보이는 학생임.", [1, 5]],
      ["전학 온 친구에게 학교 곳곳을 안내해 주고 수학 익힘 문제를 다 푼 뒤 친구의 풀이를 도와주는 등 주변을 살피고 돕는 따뜻한 태도를 지님.", [8, 10]],
      ["틀린 문제를 스스로 다시 풀어 보고 모르는 낱말을 사전에서 찾아 공책에 정리하는 등 스스로 배우려는 태도가 꾸준히 자라고 있음.", [2, 6]],
      ["과학 실험 결과를 그림으로 그려 발표하고 우리 고장 조사 내용을 사진과 함께 발표하는 등 자신이 알아낸 것을 알기 쉽게 표현하는 힘이 있음.", [4, 11]],
      ["국어 시간에 자신의 경험을 들어 의견을 또박또박 발표하며 생각을 말로 표현하는 자신감이 커짐.", [7]],
      ["교실 화분 물 주기와 급식 당번을 끝까지 해내며 맡은 일을 소중히 여기는 책임감을 보여 줌.", [3, 9]],
      ["아침 독서 시간에 스스로 책을 골라 읽고 쉬는 시간에 떨어진 쓰레기를 스스로 주워 정리하는 등 바른 생활 습관이 몸에 배어 있음.", [0, 12]],
    ],
    close: "배려와 책임감, 스스로 배우려는 태도가 고르게 자라고 있어 앞으로의 성장이 더욱 기대됨.",
    subj: "국어", talkWho: "학부모 상담", seat: "교실 내 자리로",
    talk: {
      left: "parent", leftName: "학부모님", teacher: "teacherF", teacherName: "담임 선생님",
      lines: [["l", "선생님, 우리 아이 {name}, 학교에서 친구들과 잘 지내나요?"], ["t", "네, 친구들과 두루 잘 지내요. 걱정 안 하셔도 됩니다."], ["l", "다행이네요. 그런데 구체적으로 어떤 모습인지 궁금해요."], ["t", "음… 그게… 늘 밝게 잘 지내는 편이에요."]],
      ev: [1, 5], answer: "<mark>9월 4일 모둠 활동</mark>에서 친구의 의견을 끝까지 듣고 정리해 주었어요. <mark>9월 18일</mark>에는 다툰 친구에게 먼저 다가가 사과하고 화해했고요.", tail: "오늘 수업 기록에도 남아 있어요.",
      after: "아, 그런 모습이 있었군요! 집에서도 꼭 칭찬해 줄게요.",
    },
  },
  mid: {
    label: "중·고등", area: "화학Ⅰ", cls: "2-3", classes: ["2-3", "2-5"], n: 26, period: "2교시", time: "09:50–10:40", lesson: "화학 평형 · 탐구 발표", topic: "탐구 발표",
    cats: ["질문", "발표", "협동", "탐구"], item: "세부능력 및 특기사항",
    slide: ["화학Ⅰ · 화학 평형", "평형은 정말 멈춘 걸까?", "모둠 탐구 → 발표"],
    chips: [
      { t: "르샤틀리에 원리를 실험과 연결해 질문함", c: 0, s: "르샤틀리에 원리를 온도 실험 결과와 연결해 질문하는 등 배운 개념을 실제 현상에 적용해 보려는 탐구적 태도를 보임." },
      { t: "모둠 실험 데이터 기록을 맡아 끝까지 정리함", c: 2, s: "모둠 실험에서 데이터 기록을 맡아 끝까지 정리하며 맡은 역할에 대한 책임감을 보여 줌." },
      { t: "평형 이동 그래프를 칠판에 그려 설명함", c: 1, s: "평형 이동 그래프를 직접 그려 설명하며 개념을 자신의 말로 풀어내는 능력을 보임." },
    ],
    script: [
      ["09:51", 2, "멈춘 것처럼 보여요. 뚜껑을 닫아 두면 더 이상 김이 안 빠지잖아요."],
      ["09:52", 3, "녹는 것과 빠져나오는 게 둘 다 일어나는데 속도가 같아서 변화가 없어 보이는 거 아닐까요?"],
      ["09:53", 1, "맞아요. 정반응과 역반응의 속도가 같은 상태, 동적 평형이라고 합니다."],
      ["09:53", 5, "선생님, 그러면 평형 상태에서는 반응물이랑 생성물 양이 항상 같은 건가요?"],
      ["09:54", 1, "많이들 헷갈리는 부분이죠. 속도가 같다는 거지 양이 같다는 게 아니에요."],
      ["09:54", 5, "아, 양이 아니라 변하지 않는다는 게 핵심이네요."],
    ],
    pickLine: 3, sgTag: "깊이 있는 질문", sgTitle: "원리·조건·예외를 묻는 질문", sgCat: 0, sgMemo: "평형 상태에서 반응물과 생성물의 양이 항상 같은지 질문함",
    sgS: "평형 상태에서 반응물과 생성물의 양이 항상 같은지 질문하며 개념의 조건을 꼼꼼히 따져 보는 탐구적 태도를 보임.",
    // 문장은 앱의 규칙 기반 생성기가 같은 기록으로 실제로 만든 초안에서 가져왔다
    recs: [
      [2, "09/02", "반응 속도 모둠 실험에서 데이터 기록을 담당"],
      [2, "09/04", "농도와 반응 속도 모둠 토의에서 의견을 정리하고 조율"],
      [2, "09/09", "온도와 촉매 활동에서 모둠원의 오개념을 바로잡아 줌"],
      [2, "09/11", "반응 속도 그래프 퀴즈 활동에서 모둠원에게 풀이를 설명"],
      [2, "09/14", "평형 상수 모둠 실험에서 데이터 기록을 담당"],
      [1, "09/16", "평형 상수에 대한 조사 내용을 사례와 함께 발표"],
      [2, "09/18", "평형 이동 실험 활동에서 모둠원의 오개념을 바로잡아 줌"],
      [0, "09/21", "용해 평형을 실생활 사례에 적용할 수 있는지 질문"],
      [3, "09/23", "반응 지수 개념 지도를 스스로 그려 정리"],
      [1, "09/25", "평형 상수를 모형과 그림으로 표현하여 발표"],
      [2, "09/28", "산·염기 평형 활동에서 모둠원의 오개념을 바로잡아 줌"],
      [2, "10/05", "완충 용액 퀴즈 활동에서 모둠원에게 풀이를 설명"],
      [3, "10/07", "전기 화학과 전지 개념 지도를 스스로 그려 정리"],
    ],
    sens: [
      ["용해 평형 수업에서 반응 지수 개념 지도를 스스로 그려 정리하였고, 전기 화학과 전지 개념 지도를 스스로 그려 정리하는 등 자기주도적 학습 태도가 드러나는 학생임.", [8, 12]],
      ["반응 속도와 평형 상수 모둠 실험에서 데이터 기록을 담당하는 과정에서 책임감이 잘 드러남.", [0, 4]],
      ["농도와 반응 속도 모둠 토의에서 의견을 정리하고 조율하며 공동 과제를 이끄는 리더십을 보여줌.", [1]],
      ["온도와 촉매, 평형 이동 실험과 산·염기 평형 활동에서 모둠원의 오개념을 바로잡아 주는 과정에서 개념 이해력이 드러남.", [2, 6, 10]],
      ["반응 속도 그래프와 완충 용액 퀴즈 활동에서 모둠원에게 풀이를 설명하며 동료의 이해를 돕는 협력적 태도를 잘 보여줌.", [3, 11]],
      ["평형 상수에 대한 조사 내용을 사례와 함께 발표하는 과정에서 필요한 정보를 찾아 활용하는 능력이 잘 드러남.", [5]],
      ["용해 평형에 관한 활동에서 평형 상수를 모형과 그림으로 표현하여 발표하는 과정에서 추상적인 개념을 구체화하는 능력이 드러남.", [9]],
      ["용해 평형을 실생활 사례에 적용할 수 있는지 질문하며 탐구적 태도를 보여줌.", [7]],
    ],
    close: "자기주도적 학습 태도, 책임감과 리더십이 드러나는 성실한 학습자임.",
    subj: "화학Ⅰ", talkWho: "학생 · 학부모 상담", seat: "교무실 자리로",
    talk: {
      left: "student", leftName: "학생", teacher: "teacherM", teacherName: "화학 선생님",
      lines: [["l", "선생님, 화학 쪽 진로를 생각하는데 제 강점이 뭘까요?"], ["t", "수업 태도가 좋으니까 열심히 하면 잘할 거야."], ["l", "음… 구체적으로 제가 뭘 잘하는지 알고 싶어요."], ["t", "그러니까… 전반적으로 성실한 편이야."]],
      ev: [3, 9], answer: "<mark>9월 11일</mark> 퀴즈 활동에서 그래프 풀이를 모둠원에게 설명했고, <mark>9월 25일</mark>에는 평형 상수를 모형과 그림으로 표현해 발표했지. 어려운 개념을 눈에 보이게 풀어 설명하는 게 네 강점이야.", tail: "오늘 수업 기록에도 있단다.",
      after: "제가 그런 걸 잘했군요! 다음엔 실험 설계까지 도전해 볼게요.",
    },
  },
};
const MODES = [
  { m: "mobile", t: "모바일 수동기록", d: "수업 중엔 폰에서 번호만,<br>쉬는 시간에 한 줄",
    art: '<svg viewBox="0 0 220 130" aria-hidden="true"><rect class="s" x="34" y="10" width="60" height="110" rx="11"/><path class="l" d="M46 38h36M46 52h36M46 94h36"/><rect class="f" x="42" y="62" width="44" height="18" rx="5"/><circle class="t" cx="88" cy="71" r="11"/><path class="l" d="M106 66h20m-7-7 7 7-7 7"/><rect class="s" x="136" y="34" width="72" height="48" rx="5"/><path class="l" d="M152 98h40M172 82v16M148 50h48M148 62h30"/></svg>' },
  { m: "whale", t: "웨일 수동기록", d: "교탁 개인 화면의 웨일에서<br>명단을 눌러 바로",
    art: '<svg viewBox="0 0 220 130" aria-hidden="true"><rect class="s" x="12" y="24" width="90" height="58" rx="5"/><rect class="s" x="118" y="24" width="90" height="58" rx="5"/><path class="l" d="M57 82v14M163 82v14M6 100h208M28 44h48M28 56h32"/><g class="f"><rect x="128" y="34" width="20" height="11" rx="3"/><rect x="153" y="34" width="20" height="11" rx="3"/><rect x="178" y="34" width="20" height="11" rx="3"/><rect x="128" y="49" width="20" height="11" rx="3"/><rect x="178" y="49" width="20" height="11" rx="3"/><rect x="128" y="64" width="20" height="11" rx="3"/><rect x="153" y="64" width="20" height="11" rx="3"/><rect x="178" y="64" width="20" height="11" rx="3"/></g><rect class="h" x="153" y="49" width="20" height="11" rx="3"/></svg>' },
  { m: "auto", t: "자동녹음 기록", d: "시간표대로 녹음,<br>놓친 발언은 PC가 추천",
    art: '<svg viewBox="0 0 220 130" aria-hidden="true"><rect class="s" x="36" y="16" width="28" height="54" rx="14"/><path class="l" d="M24 54a26 26 0 0 0 52 0M50 80v18M36 100h28"/><path class="w" d="M92 46v30M104 34v54M116 48v26M128 40v42"/><path class="l" d="M146 44h58M146 61h44M146 78h54"/></svg>' },
];

/* ---------- 상태 · 타이머 ---------- */
const fresh = () => ({ k: 0, mode: null, level: "elem", pick: null, note: "", noteCat: 0, chip: -1, mineS: "", sec: 0, phoneSec: 0, boardSeen: false, made: false, split: false });
let S = fresh();
let timers = [];
const later = (fn, ms) => { const t = setTimeout(fn, reduced ? Math.min(ms, 60) : ms); timers.push(() => clearTimeout(t)); return t; };
const every = (fn, ms) => { const t = setInterval(fn, ms); timers.push(() => clearInterval(t)); return t; };
/** 줄이지 않는 타이머: 움직임 줄이기 설정이어도 이야기 순서(수업 영상의 질문 → 손 들기 → 대답)는 제 시간에 보여 준다 */
const beat = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(() => clearTimeout(t)); return t; };
function clearAll() { timers.forEach((f) => f()); timers = []; curtainEl.classList.remove("on"); $$(".fly", stage).forEach((e) => e.remove()); }
const who = (i) => ({ i, no: i + 1, name: NAMES[i] });
const catChip = (L, c, on) => `<span class="cat c${c} ${on ? "on" : ""}" data-c="${c}">${L.cats[c]}</span>`;
/* ---------- 직접 쓴 한 줄 → 생기부 문장 ----------
   앱의 규칙 생성기(packages/core/src/draft.ts)와 같은 방식: 행동을 '~하며 / ~하는 과정에서'로 잇고, 그 행동에서 드러난 역량으로 맺는다.
   역량 낱말이 행동에 이미 있으면(협동 → 협동심) 되풀이하지 않는 다른 말을 고른다 */
const hasJong = (ch) => { const c = ch.charCodeAt(0) - 0xac00; return c >= 0 && c <= 11171 ? c % 28 !== 0 : /[013678lmnr]/i.test(ch); };
const josa = (w, pair) => { const [a, b] = pair.split("/"); return w + (hasJong([...w].pop() || "") ? a : b); };
/** 말하듯 쓴 한 줄을 기록 문체로: '친구들하고 협동해서 풀어냈어요' → '친구들과 협동하여 풀어냄' */
function tidyNote(t) {
  let s = t.trim().replace(/[\s.!?~…。]+$/, "").replace(/\s+/g, " ");
  s = s.replace(/(^|\s)(진짜|정말|엄청|되게|완전|너무) (?=\S)/g, "$1");
  s = s.replace(/(친구들?|모둠원들?|모둠|짝꿍?|동료들?|선생님|형|누나|언니|오빠|동생)(하고|이랑|랑)(?=\s|$)/g, (m, w) => josa(w, "과/와"));
  s = s.replace(/해서(?=\s)/g, "하여").replace(/(^|\s)같이(?=\s)/g, "$1함께");
  // '모둠 활동 적극 참여' → '모둠 활동에 적극 참여'
  const ADV = /^(적극|적극적으로|열심히|성실히|활발히|꾸준히)$/;
  s = s.replace(/(\S+)((?: (?:적극|적극적으로|열심히|성실히|활발히|꾸준히))?) 참여(함|했음|했다)?$/, (m, w, adv, e = "") => (ADV.test(w) || /(에|에서|도|은|는|게)$/.test(w) ? m : `${w}에${adv} 참여${e}`));
  const END = [
    [/(했|하였)(어요|습니다|다|음)$|(한다|해요|합니다|하다)$/, "함"], [/(줬|주었)(어요|습니다|다|음)$|(준다|줘요|줍니다)$/, "줌"],
    [/(냈|내었)(어요|습니다|다|음)$|(낸다|내요|냅니다)$/, "냄"], [/(봤|보았)(어요|습니다|다|음)$|(본다|봐요|봅니다)$/, "봄"],
    [/(됐|되었)(어요|습니다|다|음)$|(된다|돼요|됩니다)$/, "됨"], [/(였|었|았)(어요|습니다|다)$/, "$1음"],
  ];
  for (const [re, rep] of END) if (re.test(s)) return s.replace(re, rep);
  if (/(참여|발표|설명|정리|협력|협동|질문|해결|제시|탐구|노력|조사|관찰|실험|기록|양보|배려|사과|화해|칭찬|집중|완성|작성|제출|참가|봉사|청소|안내|도전)$/.test(s)) return s + "함";
  return s;
}
/** '~함' → '~하며' (뒤에 역량을 잇는 꼴) */
function meForm(c) {
  const R = [[/함$/, "하며"], [/줌$/, "주며"], [/봄$/, "보며"], [/됨$/, "되며"], [/짐$/, "지며"], [/냄$/, "내며"], [/임$/, "이며"], [/움$/, "우며"], [/씀$/, "쓰며"], [/감$/, "가며"], [/옴$/, "오며"], [/(\S)음$/, "$1으며"]];
  for (const [re, rep] of R) if (re.test(c)) return c.replace(re, rep);
  return null;
}
/** '~함' → '~하는' (뒤에 '과정에서'를 잇는 꼴, 움직임을 나타내는 말만) */
function adnForm(c) {
  const R = [[/함$/, "하는"], [/줌$/, "주는"], [/봄$/, "보는"], [/냄$/, "내는"], [/씀$/, "쓰는"], [/감$/, "가는"], [/옴$/, "오는"]];
  for (const [re, rep] of R) if (re.test(c)) return c.replace(re, rep);
  return null;
}
// [행동 낱말, 초등 역량 후보, 중·고등 역량 후보]. 앞에 있을수록 구체적이다
const MINE_RULES = [
  [/(협동|협력|함께|모둠|친구들과)[^]*(끝까지|포기)|(끝까지|포기)[^]*(협동|협력|함께)/, ["어려운 일도 포기하지 않는 끈기", "꾸준히 노력하는 끈기"], ["포기하지 않는 끈기와 공동체 역량", "끈기와 협업 능력"]],
  [/(친구|모둠원|동료|짝)[^]*(도와|도움|돕|알려|가르|설명)/, ["서로 배우고 돕는 따뜻한 마음", "주변을 살피고 배려하는 마음"], ["동료와 함께 성장하려는 협력적 태도", "동료의 이해를 돕는 협력적 태도"]],
  [/질문|궁금/, ["궁금한 것을 알아보려는 호기심", "배움에 대한 호기심"], ["원리를 정확히 알고자 탐구하는 태도", "개념을 깊이 이해하려는 탐구적 태도"]],
  [/주도|이끌|조율|리더/, ["친구들을 아우르는 리더십"], ["공동 과제를 이끄는 리더십", "구성원을 아우르는 리더십"]],
  [/담당|맡|책임|당번/, ["맡은 일을 소중히 여기는 책임감", "맡은 일을 해내는 성실함"], ["책임감 있게 역할을 수행하는 태도", "공동체에 기여하는 성실함"]],
  [/끝까지|포기|꾸준히|끈기|끈질/, ["어려운 일도 포기하지 않는 끈기", "꾸준히 노력하는 끈기"], ["어려운 과제도 포기하지 않는 끈기와 집중력", "꾸준히 노력하는 끈기"]],
  [/오답|틀린|다시 ?(풀|정리|해|확인)|고쳐|보완|수정/, ["스스로 점검하고 배우려는 태도", "실수에서 배우는 태도"], ["스스로 점검하고 보완하는 자기주도적 학습 태도", "자기주도적 학습 태도"]],
  [/스스로|자발적|솔선|먼저 나서|앞장/, ["할 일을 찾아 실천하는 자기주도적인 태도", "책임감 있는 태도"], ["할 일을 찾아 실천하는 주도성", "자기주도적 태도"]],
  [/양보|배려|위로|사과|화해|칭찬|존중|나눠|나누어/, ["친구를 존중하고 배려하는 마음", "다른 사람을 아끼는 따뜻한 마음"], ["타인을 존중하고 배려하는 공동체 의식", "더불어 살아가는 공동체 의식"]],
  [/협동|협력|모둠|함께|토의|토론/, ["친구들과 힘을 모으는 협동심", "더불어 어울리는 협동심"], ["협력하여 문제를 해결하는 능력", "공동체 역량"]],
  [/발표|말하|설명|전달|의견/, ["자신의 생각을 자신 있게 표현하는 힘", "생각을 말로 표현하는 자신감"], ["자신의 생각을 조리 있게 전달하는 의사소통 능력", "의사소통 능력"]],
  [/실험|관찰|탐구|조사|측정/, ["궁금한 것을 직접 알아보는 탐구심"], ["과학적으로 탐구하는 능력", "탐구 능력"]],
  [/정리|요약|기록|노트|필기/, ["배운 내용을 차근차근 정리하는 습관"], ["배운 내용을 체계적으로 정리하는 능력"]],
  [/책|독서|읽/, ["배움을 넓히려는 바른 독서 습관", "꾸준히 배우려는 바른 습관"], ["배움을 넓히려는 지적 호기심", "폭넓게 배우려는 태도"]],
  [/열심히|성실|집중|최선|적극/, ["배움에 성실히 참여하는 태도", "배우려는 마음가짐"], ["학업에 성실히 임하는 태도", "배움에 대한 열의"]],
  [/태도|자세|수업|참여|활동/, ["배움에 성실히 참여하는 자세", "배우려는 마음가짐"], ["학업에 성실히 임하는 자세", "배움에 대한 열의"]],
  [/해결|풀/, ["문제를 끈기 있게 해결하려는 태도", "깊이 생각하는 힘"], ["논리적으로 사고하는 능력", "문제 해결력"]],
];
// 맞는 낱말이 없을 때: 고른 분류로 (초등 학습태도·발표·관계·생활 / 중·고등 질문·발표·협동·탐구)
const MINE_CAT = {
  elem: [["배움에 성실히 참여하는 태도", "배우려는 마음가짐"], ["자신의 생각을 표현하는 자신감", "표현하는 즐거움"], ["친구와 사이좋게 어울리는 마음", "더불어 지내는 마음"], ["바른 생활 습관", "스스로 생활을 가꾸는 태도"]],
  mid: [["배운 내용을 깊이 이해하려는 탐구적 자세", "배움에 대한 열의"], ["생각을 조리 있게 전달하는 의사소통 능력", "표현력"], ["협력하여 문제를 해결하는 능력", "공동체 역량"], ["스스로 탐구하는 태도", "탐구 능력"]],
};
/** 역량 말이 행동에 이미 있는 낱말을 되풀이하는지 (두 글자 어간으로 본다) */
const repeats = (phrase, clause) => {
  const flat = clause.replace(/\s/g, "");
  if (/돕/.test(phrase) && /도와|도움|돕/.test(flat)) return true;   // '도와줌 … 돕는'
  return phrase.split(" ").filter((w) => [...w].length >= 2).map((w) => w.slice(0, 2)).some((st) => !["하는", "있는", "않는"].includes(st) && flat.includes(st));
};
function mineSentence(note, cat, level) {
  const clause = tidyNote(note), mid = level === "mid";
  let phrase = "";
  for (const [re, el, md] of MINE_RULES) {
    if (!re.test(clause)) continue;
    phrase = (mid ? md : el).find((p) => !repeats(p, clause)) || "";
    if (phrase) break;
  }
  if (!phrase) { const opts = MINE_CAT[mid ? "mid" : "elem"][cat] || MINE_CAT[mid ? "mid" : "elem"][0]; phrase = opts.find((p) => !repeats(p, clause)) || opts[1]; }
  const adn = mid ? adnForm(clause) : null, me = meForm(clause);
  if (adn) return `${adn} 과정에서 ${josa(phrase, "이/가")} 잘 드러남.`;
  if (me) return `${me} ${josa(phrase, "을/를")} ${mid ? "잘 보여줌" : "보여 줌"}.`;
  if (/(모습|태도|자세|마음)$/.test(clause)) return `${josa(clause, "이/가")} 돋보임.`;
  return `${josa(clause, "을/를")} 통해 ${josa(phrase, "이/가")} 드러남.`;
}
/** 방금 남긴 기록과 그 기록으로 쓴 생기부 문장을 채운다 (예시로 넣었으면 지금 학교급 예시로) */
function fillMine() {
  const L = LV[S.level];
  if (S.mode === "auto") { S.note = L.sgMemo; S.noteCat = L.sgCat; S.mineS = L.sgS; return; }
  if (S.chip >= 0 || !S.note) { S.chip = Math.max(0, S.chip); const c = L.chips[S.chip]; S.note = c.t; S.noteCat = c.c; S.mineS = c.s; return; }
  S.mineS = mineSentence(S.note, S.noteCat, S.level);
}
/** 앞 화면을 건너뛰고 와도 뒤 화면이 돌아가게 기본값을 채운다 */
function ensure() {
  const L = LV[S.level];
  if (!S.mode) S.mode = "mobile";
  if (!S.pick || S.pick.i >= L.n) S.pick = who(S.mode === "auto" ? 16 : 6);
  fillMine();
  return L;
}

/* ---------- 안내 ---------- */
/** 무대 안 좌표 (화면 좌표가 아니라 offset 으로: 무대를 줄이거나 돌려 그려도 맞는다) */
function box(el, root = stage) {
  let x = 0, y = 0;
  for (let e = el; e && e !== root; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}
/** 안내가 대신 짚는 빈 상자를 진짜 대상 위에 맞춘다 (화면 좌표) */
function placeProxy() {
  if (!proxy || !proxyFor?.isConnected) return;
  const r = proxyFor.getBoundingClientRect();
  Object.assign(proxy.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
}
function hintOff() {
  if (drv) { try { drv.destroy(); } catch { /* 이미 닫힘 */ } drv = null; }
  hintEls.forEach((e) => e.remove()); hintEls = []; proxy = proxyFor = null;
  $$(".hinted").forEach((e) => e.classList.remove("hinted"));
}
/**
 * "이것을 누르세요 / 여기에 쓰세요".
 * 기본은 주변을 어둡게 하고 짚은 곳과 위쪽 막대만 눌리게 한다(driver.js). allow 로 더 눌리게 할 곳을 넘긴다. dim:false 는 말풍선만 띄운다(선택 단계).
 * dim:false + ring:true 는 주변을 어둡게 하지 않고 짚은 곳에 밝은 테두리만 두른다 (화면을 계속 보여 주면서 다음 단추를 짚을 때).
 */
function hint(target, text, opt = {}) {
  hintOff();
  if ($("#timeup")) return;   // '기록 완료!' 창이 떠 있으면 늦게 온 안내는 띄우지 않는다 ([다음]을 가리지 않게)
  const el = typeof target === "string" ? $(target) : target;
  if (!el) return;
  const dim = opt.dim !== false;
  el.classList.add("hinted");
  if (dim && DRV && !ROT) {
    // driver.js 는 대상을 자르는(overflow) 조상의 크기를 '키우기 전' 값으로 셈해서, 무대를 키운 화면에서는 강조 구멍이 작게 잘린다.
    // 그래서 대상과 같은 자리에 겹쳐 둔 빈 상자(body 바로 아래)를 대신 짚게 하고, 진짜 대상은 allowedElements 로 눌리게 한다
    proxy = document.createElement("div"); proxy.className = "hintproxy"; proxyFor = el;
    document.body.append(proxy); hintEls.push(proxy); placeProxy();
    drv = DRV({
      animate: !reduced, duration: 260, overlayColor: "#020812", overlayOpacity: opt.opacity ?? 0.6,
      stagePadding: Math.round(6 * SCALE), stageRadius: Math.round(12 * SCALE), popoverOffset: Math.round(12 * SCALE),
      allowClose: false, overlayClickBehavior: "none", allowKeyboardControl: false, scrollIntoView: false, smoothScroll: false, focus: "none",
      showButtons: [], popoverClass: "nuga-hint", allowedElements: [".top", el, ...(opt.allow ? [opt.allow] : [])],
    });
    drv.highlight({ element: proxy, popover: { description: text, side: opt.side || "bottom", align: opt.align || "center", showButtons: [] } });
    return;
  }
  // 무대 안 좌표: 화면에 보이는 자리(줌·축소 transform 포함)를 무대 좌표로 되돌린다. 폰을 세로로 들어 무대를 90° 돌렸으면 축도 돌린다
  const er = el.getBoundingClientRect(), sr = stage.getBoundingClientRect();
  const r = ROT
    ? { x: (er.top - sr.top) / SCALE, y: (sr.right - er.right) / SCALE, w: er.height / SCALE, h: er.width / SCALE }
    : { x: (er.left - sr.left) / SCALE, y: (er.top - sr.top) / SCALE, w: er.width / SCALE, h: er.height / SCALE };
  if (dim || opt.ring) {
    const ring = document.createElement("div");
    ring.className = dim ? "hintr" : "hintr soft";
    Object.assign(ring.style, { left: `${r.x - 6}px`, top: `${r.y - 6}px`, width: `${r.w + 12}px`, height: `${r.h + 12}px` });
    stage.append(ring); hintEls.push(ring);
  }
  const b = document.createElement("div");
  b.className = "hintb"; b.textContent = text;
  stage.append(b); hintEls.push(b);
  const w = b.offsetWidth, h = b.offsetHeight;
  let side = opt.side || "bottom";
  if (side === "bottom" && r.y + r.h + h + 20 > 540) side = "top";
  if (side === "top" && r.y - h - 20 < 0) side = "bottom";
  if (side === "left" && r.x - w - 20 < 0) side = "right";
  if (side === "right" && r.x + r.w + w + 20 > 960) side = "left";
  let x = side === "left" ? r.x - w - 16 : side === "right" ? r.x + r.w + 16 : r.x + r.w / 2 - w / 2;
  let y = side === "top" ? r.y - h - 16 : side === "bottom" ? r.y + r.h + 16 : r.y + r.h / 2 - h / 2;
  x = Math.max(8, Math.min(952 - w, x)); y = Math.max(8, Math.min(532 - h, y));
  b.dataset.side = side;
  Object.assign(b.style, { left: `${x}px`, top: `${y}px` });
  b.style.setProperty("--ax", `${Math.max(16, Math.min(w - 16, r.x + r.w / 2 - x))}px`);
  b.style.setProperty("--ay", `${Math.max(14, Math.min(h - 14, r.y + r.h / 2 - y))}px`);
}

/* ---------- 진행 ---------- */
const FLOW = {
  mobile: ["pick", "m-phone", "m-desk", "board", "draft", "batch", "points", "talk"],
  whale: ["pick", "w-desk", "board", "draft", "batch", "points", "talk"],
  auto: ["pick", "a-rec", "a-desk", "board", "draft", "batch", "points", "talk"],
};
const STEP = { "m-phone": 0, "m-desk": 0, "w-desk": 0, "a-rec": 0, "a-desk": 0, board: 1, draft: 2, batch: 2, points: 2, talk: 3 };
const SCREEN = { pick: sPick, "m-phone": sPhone, "m-desk": sDesk, "w-desk": sWhale, "a-rec": sRec, "a-desk": sDesk, board: sBoard, draft: sDraft, batch: sBatch, points: sPoints, talk: sTalk };
const flow = () => FLOW[S.mode] || ["pick"];

/** fromHistory = 브라우저 뒤로·앞으로(휴대폰 뒤로 버튼)로 온 경우. 그 밖에는 화면마다 기록을 남겨 뒤로 가기가 이전 화면이 되게 한다 */
function go(k, fromHistory) {
  const f = flow();
  k = Math.max(0, Math.min(f.length - 1, k));
  clearAll(); hintOff(); $("#timeup")?.remove();
  FX.calm(false);
  if (!fromHistory) { if (k > S.k && S.k > 0) FX.s("step"); else if (k < S.k) FX.s("back"); }
  if (!fromHistory) {
    if (k === 0) history.replaceState({ k: 0 }, "");
    else if (history.state?.k !== k || history.state?.mode !== S.mode) history.pushState({ k, mode: S.mode }, "");
  }
  S.k = k;
  const id = f[k];
  stage.dataset.scene = id;
  $("#prev").hidden = k === 0;
  const st = STEP[id] ?? -1;
  $$("#steps li").forEach((li, i) => { if (st === i && !li.classList.contains("on")) FX.thud(li); li.className = st === i ? "on" : st > i ? "done" : ""; });
  $$("#lvsw button").forEach((b) => b.classList.toggle("on", b.dataset.lv === S.level));
  scene.innerHTML = "";
  SCREEN[id](scene);
  rotPrompt();
}
/** [이전] = 브라우저 뒤로 가기와 같은 길 (지나온 화면으로) */
function back() { if (S.k === 0) return; FX.s("back"); if (history.state?.k > 0) history.back(); else go(S.k - 1); }
function reset() { S = fresh(); go(0); }
/** 학교급을 바꾸면 지금 화면을 그 학교급 예시로 다시 그린다 (고른 학생·잰 시간은 그대로) */
function setLevel(lv) {
  if (lv === S.level) return;
  FX.s("pick");
  S.level = lv;
  if (S.pick && S.pick.i >= LV[lv].n) S.pick = who(LV[lv].n - 1);
  if (S.note) fillMine();
  go(S.k, true);
}
$("#prev").addEventListener("click", back);
$("#home").addEventListener("click", reset);
$("#home").addEventListener("click", () => FX.s("back"));
$$("#lvsw button").forEach((b) => b.addEventListener("click", () => setLevel(b.dataset.lv)));
$("#steps").addEventListener("click", (e) => {
  const li = e.target.closest("li.done");
  if (!li) return;
  const k = flow().findIndex((id) => STEP[id] === Number(li.dataset.i));
  if (k > 0) go(k);
});
addEventListener("popstate", (e) => { const st = e.state || { k: 0 }; if (st.mode) S.mode = st.mode; go(st.k || 0, true); });
addEventListener("keydown", (e) => {
  if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
  if (e.key === "ArrowLeft" || e.key === "Escape") back();
});
// 손대지 않으면 처음 화면으로 (부스 45초, 그 밖에는 90초)
let idle = 0;
const touch = () => { clearTimeout(idle); idle = setTimeout(() => { if (S.k > 0) reset(); }, BOOTH ? 45000 : 90000); };
["pointerdown", "keydown", "input", "wheel", "touchstart"].forEach((t) => addEventListener(t, touch, { passive: true }));

/* ---------- 함께 쓰는 조각 ---------- */
/** 교사 모니터: 앱의 위 메뉴 + 흰 시트. 웨일 방식이면 웨일 브라우저 틀 안에 그린다 (chrome: full = 탭 + 주소줄, 그 밖 = 탭만) */
function monitor(L, inner, chrome) {
  const wh = S.mode === "whale";
  const tabs = `<div class="wb-tabs"><span class="lights"><i></i><i></i><i></i></span><span class="tab on"><img src="../assets/whale-logo.png" alt="">누가 · ${L.cls}</span><span class="tab">웨일 스페이스</span><span class="tab add">+</span><span class="g"></span><span class="demo">웨일 연계 예시 · 데모 데이터</span></div>`;
  const bar = '<div class="wb-bar"><span class="nv">‹ › ↻</span><span class="url">누가 — 웨일 브라우저에서 바로 기록</span></div>';
  return `<div class="mon main ${wh ? "wh" : ""}">${wh ? tabs + (chrome === "full" ? bar : "") : ""}
    <div class="pc-nav"><span class="lg">${LOGO}누가</span><span class="ar">${L.area}</span><span class="g"></span><span class="nb w">미반영<b>4</b></span><span class="nb">일괄 기록 +</span><button class="nb mk" id="mkdraft" type="button">✎ 생기부 생성</button></div>
    <div class="pc-sheet" id="sheet">${inner}</div></div>`;
}
const deco = (two) => `<div class="deco" aria-hidden="true">${two ? '<i class="stand s2"></i><i class="foot s2"></i>' : ""}<i class="stand"></i><i class="foot"></i><i class="desk"></i><i class="kbd"></i><i class="mug"></i></div>`;
const monLabel = () => (S.mode === "whale" ? "개인 화면 · 웨일" : "교사 PC 화면");
const rosterGrid = (L, cls = "") => `<div class="roster ${cls}" id="roster">${NAMES.slice(0, L.n).map((n, i) => `<button type="button" data-i="${i}"><i>${i + 1}</i>${n}</button>`).join("")}</div>`;
/** 한 줄 기록 칸: 카테고리 · 한 줄 · 저장 · 예시 (쉬는 시간 창과 웨일 개인 화면이 함께 쓴다) */
/** pick = 수업 중 폰에서 고른 학생이라는 표시(빨간 테두리 + 이어진 선 + 이름표) */
function entryForm(L, p, meta, pick) {
  const who = pick
    ? `<b class="pick-n">${p.no} ${p.name}</b><span class="pick-call"><i aria-hidden="true"></i><em>아까 수업 중 폰으로 고른 학생 · ${meta}</em></span>`
    : `<b>${p.no} ${p.name}</b><span>${meta}</span>`;
  return `<div class="ib-item man"><div class="t">${who}<i class="tm" id="tm">0.0초</i></div>
    <div class="catrow" id="cats">${L.cats.map((_, c) => catChip(L, c, c === 0)).join("")}</div>
    <div id="entry"><div class="line"><textarea id="note" placeholder="${ROT || PHONE ? "아래 예시를 눌러 주세요" : "무엇을 했는지 한 줄 (Enter 저장)"}" maxlength="80" ${ROT || PHONE ? "readonly" : ""}></textarea><button class="b p" id="nsave" type="button" disabled>저장</button></div>
      <div class="ex"><small>예시 · 눌러서 넣기</small>${L.chips.map((c, i) => `<button type="button" data-k="${i}">${c.t}</button>`).join("")}</div></div></div>`;
}
/** 한 줄 기록 칸 동작. 시간은 칸(또는 예시)에 커서가 올라가거나 누른 순간부터 저장(Enter)까지 잰다 */
let entryOff = null;   // 앞서 연 한 줄 칸의 시계·키 처리를 걷는다 (웨일에서 학생을 바꿔 누를 때)
function wireEntry(L, onDone) {
  entryOff?.();
  const note = $("#note"), ns = $("#nsave");
  let cat = 0, t1 = 0, tick = 0, fin = false;
  const setCat = (c) => { cat = c; $$("#cats .cat").forEach((x) => x.classList.toggle("on", Number(x.dataset.c) === c)); };
  const startLine = () => {
    if (t1) return;
    t1 = performance.now();
    tick = every(() => { const el = $("#tm"); if (el) el.textContent = `${((performance.now() - t1) / 1000).toFixed(1)}초`; }, 100);
  };
  const check = () => { ns.disabled = !note.value.trim(); ns.classList.toggle("glow", !ns.disabled); };
  ["pointerenter", "pointerdown", "focus"].forEach((t) => note.addEventListener(t, startLine));
  note.addEventListener("focus", () => { if (!note.readOnly) hintOff(); });   // 글쓰기를 막지 않게 안내를 닫는다
  note.addEventListener("input", () => { S.chip = -1; FX.s("key"); check(); });
  $$("#cats .cat").forEach((x) => x.addEventListener("click", () => setCat(Number(x.dataset.c))));
  $$("#cats .cat").forEach((x) => x.addEventListener("click", () => FX.s("pick")));
  $$(".ex button").forEach((b) => {
    ["pointerenter", "pointerdown"].forEach((t) => b.addEventListener(t, startLine));
    b.addEventListener("click", () => {
      const k = Number(b.dataset.k), c = L.chips[k];
      startLine(); note.value = c.t; S.chip = k; setCat(c.c); check();
      FX.s("pick"); FX.thud(note);
      hint("#nsave", "저장(Enter)을 눌러 주세요", { side: "bottom", allow: ".ib-item.man, #roster" });
    });
  });
  const done = () => {
    if (fin || !note.value.trim()) return;
    fin = true; hintOff(); startLine(); clearInterval(tick);
    FX.s("save");
    const sec = (performance.now() - t1) / 1000;
    S.note = note.value.trim(); S.noteCat = cat; S.sec = sec;
    if (S.chip >= 0 && L.chips[S.chip].t !== S.note) S.chip = -1;
    fillMine();
    onDone(sec);
  };
  ns.addEventListener("click", done);
  // Enter 는 칸 안에서든 밖에서든(예시를 누른 직후) 저장이다. 칸 안에서는 줄바꿈이 들어가지 않게 한다
  note.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) e.preventDefault(); });
  const onKey = (e) => { if (e.key === "Enter" && !e.isComposing && !ns.disabled && !fin) { e.preventDefault(); done(); } };
  addEventListener("keydown", onKey);
  entryOff = () => { clearInterval(tick); removeEventListener("keydown", onKey); entryOff = null; };
  timers.push(() => entryOff?.());
}
/** 저장하면 걸린 시간: 숫자와 한 줄만. 저절로 넘어가지 않고 [다음]을 눌러야 넘어간다 */
function timeUp({ sec }, after) {
  hintOff();
  let fin = false;
  // Enter·스페이스로도 넘긴다 (저장할 때 누른 Enter 가 바로 넘기지 않게 0.5초 뒤부터, 누르고 있는 키는 무시)
  const armAt = performance.now() + 500;
  const onKey = (e) => { if ((e.key === "Enter" || e.key === " ") && !e.repeat && performance.now() > armAt) { e.preventDefault(); end(); } };
  const end = () => { if (fin) return; fin = true; removeEventListener("keydown", onKey); $("#timeup")?.remove(); after(); };
  addEventListener("keydown", onKey);
  timers.push(() => removeEventListener("keydown", onKey));
  stage.insertAdjacentHTML("beforeend", `<div class="timeup" id="timeup"><div class="tu-card" role="dialog" aria-label="기록에 걸린 시간">
      <p class="tu-n"><b id="tun">0.0</b><span>초</span></p><p class="tu-m">기록 완료!</p>
      <button class="cta" id="tuok" type="button">다음 <span aria-hidden="true">→</span></button></div></div>`);
  const el = $("#tun"), t0 = performance.now(), dur = reduced ? 0 : 800;
  FX.thud(".tu-card"); FX.shake(1);
  const run = () => {
    const k = dur ? Math.min(1, (performance.now() - t0) / dur) : 1;
    el.textContent = (sec * (1 - Math.pow(1 - k, 3))).toFixed(1);
    if (k < 1 && el.isConnected) requestAnimationFrame(run);
    if (k >= 1 && el.isConnected) { if (dur) FX.s("win"); FX.burst(el, { n: 14 }); } else if (k < 1) FX.s("tick");   // 올라가는 동안 똑똑, 멈추는 순간 성공음 (한 번)
  };
  run();
  $("#tuok").addEventListener("click", end);
}
/** 수업 → 쉬는 시간 전환 */
function breakTime(fn, from = "10:05") {
  const L = LV[S.level];
  curtainEl.innerHTML = `<i>딩동댕</i><b>쉬는 시간</b><span>${from} <u>→</u> <em>${L.time.split("–")[1]}</em> · ${L.seat}</span>`;
  curtainEl.classList.add("on");
  FX.s("arrive");   // 딩동댕
  later(fn, 1500);
}
/** 기록 조각이 from 에 잠깐(hold) 떠 있다가 to 로 날아간다 (무대 안 좌표) */
function fly(text, from, to, hold, ms, cb) {
  const f = document.createElement("div");
  f.className = "fly"; f.textContent = text;
  Object.assign(f.style, { left: `${from.x}px`, top: `${from.y}px` });
  stage.append(f);
  later(() => {
    f.style.transition = `transform ${ms}ms cubic-bezier(.5,0,.2,1),opacity ${Math.round(ms * 0.3)}ms ease-in ${Math.round(ms * 0.7)}ms`;
    f.style.transform = `translate(calc(-50% + ${to.x - from.x}px),calc(-50% + ${to.y - from.y}px)) scale(.5)`;
    f.style.opacity = "0";
    FX.s("send");
    later(() => { f.remove(); cb?.(); }, ms);
  }, hold);
}

/* ---------- 0 · 방식 고르기 ---------- */
function sPick(root) {
  // 첫 화면은 고를 것 셋만. 학교급은 위쪽 막대의 작은 [초등 | 중·고등]으로
  root.innerHTML = `<section class="pick"><h2>3개의 <em>기록</em> 방식 중 1개를 골라 주세요.</h2>
      <div class="modes">${MODES.map((x) => `<button type="button" data-m="${x.m}"><span class="art">${x.art}</span><b>${x.t}</b></button>`).join("")}</div>
      ${BOOTH ? '<div class="qr"><img src="assets/qr-trial.svg" alt="체험 주소 QR 코드" width="74" height="74"><span>내 폰으로<br>체험하기</span></div>' : ""}</section>`;
  $$(".modes button").forEach((b) => b.addEventListener("click", () => {
    if (PHONE && !document.fullscreenElement) toLandscape();   // 폰만: 전체 화면 + 가로 고정 (누르는 순간이어야 허용된다)
    S = { ...fresh(), level: S.level, mode: b.dataset.m };
    FX.s("pick"); FX.flash();
    go(1);
  }));
}

/* ---------- 1-A · 모바일 수동기록: 왼쪽 '수업 중 화면'(짧은 영상) | 오른쪽 '내 폰' ----------
   영상에서 한 학생이 수업 중 빛나는 말을 하고, 영상이 끝나면 폰에서 그 학생 칸을 눌러 저장한다.
   폰 화면: 위에 반 · 과목 · 지금 시각만, 아래는 3열 칸(번호 크게 · 이름 작게)으로 한 화면에 12명 */
// 영상 속 수업: 선생님 질문 → 한 학생이 손을 들고 좋은 말 (who = 그 학생 번호-1, 폰 첫 화면 12명 안에 있는 자리)
const CLIP = {
  elem: { who: 4, q: "운동장을 다 함께 쓰려면 어떻게 하면 좋을까요?", a: "앞 친구 말처럼 축구도 중요해요. 그래서 저는 요일을 나눠 쓰면 좋겠어요!" },
  mid: { who: 3, q: "온도를 높이면 평형은 어느 쪽으로 이동할까요?", a: "아까 실험에서 색이 진해진 게 르샤틀리에 원리 때문이죠? 그럼 흡열 쪽이네요!" },
};
const CLIP_MS = 6800;
function sPhone(root) {
  const L = LV[S.level], C = CLIP[S.level];
  // 뒤로 왔다가 다시 오면 아까 고른 학생을 그대로 골라 둔다
  const prev = S.pick && S.pick.i < L.n ? S.pick.i : -1;
  S.phoneSec = 0;
  const kids = [C.who - 1, C.who, C.who + 1];
  const cellsHtml = NAMES.slice(0, L.n).map((n, i) => `<button class="pc" data-i="${i}" type="button"><b>${i + 1}</b><span>${n}</span></button>`).join("");
  root.innerHTML = `<section class="stg split2">
      <div class="half"><p class="half-h"><b>수업 중 화면</b><span>${L.cls} · ${L.lesson}</span></p>
        <div class="clip" id="clip">
          <div class="cl-board"><small>${L.slide[0]}</small><b>${L.slide[1]}</b></div>
          <div class="cl-t" id="clt">${person(L.talk.teacher)}<span class="nm">선생님</span></div>
          <div class="cl-kids">${kids.map((i) => `<div class="kid ${i === C.who ? "star" : ""}" data-i="${i}"><i class="hand" aria-hidden="true">✋</i>${person("student")}<span class="nm">${i + 1} ${NAMES[i]}</span></div>`).join("")}</div>
          <div class="cl-bub q" id="clq" hidden>${C.q}</div><div class="cl-bub a" id="cla" hidden>${C.a}</div>
          <div class="cl-bar"><span class="live">● 수업 중</span><span id="clclock">10:03</span><i class="prog"><i id="clprog"></i></i><button type="button" id="clreplay" hidden>다시 보기 ↺</button></div>
        </div></div>
      <div class="half ph-half" id="phhalf"><p class="half-h"><b>내 폰</b><span>칸을 눌러 바로 기록</span></p>
        <div class="phone"><div class="scr">
          <div class="ph-top"><b>${L.cls}</b><span>${L.subj}</span><time>10:05</time></div>
          <div class="pgrid" id="pgrid">${cellsHtml}</div>
          <div class="ph-btns"><button class="save" id="psave" type="button" disabled>번호를 눌러 주세요</button></div></div></div>
        <p class="ph-wait" id="phwait">영상이 끝나면 여기서 기록해요</p></div></section>`;
  // 영상: 선생님 질문 → 손 들기 → 좋은 말 → 끝. 움직임 줄이기 설정이어도 순서는 그대로(beat), 흔들림·확대만 빠진다
  const clip = $("#clip"), star = $(".kid.star"), clock = $("#clclock");
  const talk = (el, on) => el?.classList.toggle("talking", on);
  let sel = prev, t0 = 0, saved = false, asked = prev >= 0;
  const end = () => {
    clip.classList.add("done"); $("#clreplay").hidden = false; clock.textContent = "10:05";
    talk($("#clt"), false); talk(star, false);
    $("#phhalf").classList.add("ready");
    FX.s("arrive");
    if (!asked) hint("#pgrid", `방금 말한 ${C.who + 1}번 ${josa(NAMES[C.who], "을/를")} 눌러 주세요`, { dim: false, side: "bottom" });
  };
  $("#clreplay").addEventListener("click", () => go(S.k, true));
  const prog = $("#clprog"), c0 = performance.now();
  const bar = every(() => { const k = Math.min(1, (performance.now() - c0) / CLIP_MS); prog.style.transform = `scaleX(${k})`; if (k >= 1) clearInterval(bar); }, 100);
  beat(() => { $("#clq").hidden = false; talk($("#clt"), true); }, 600);
  beat(() => { talk($("#clt"), false); star.classList.add("up"); FX.s("pop", { i: 1 }); clock.textContent = "10:04"; }, 2500);
  beat(() => { $("#clq").classList.add("old"); $("#cla").hidden = false; star.classList.add("shine"); FX.s("pop", { i: 4 }); FX.burst(star, { n: 8 }); talk(star, true); }, 3300);
  beat(end, CLIP_MS);
  // 폰: 칸을 누르면 바로 고르고, [저장]으로 남긴다. 고른 뒤에도 다른 칸으로 바꿀 수 있다
  const grid = $("#pgrid"), save = $("#psave"), cells = $$(".pc", grid);
  const begin = () => { if (!t0) t0 = performance.now(); };
  ["pointerdown", "wheel", "touchstart"].forEach((t) => grid.addEventListener(t, begin, { passive: true }));
  if (prev >= 0) { cells[prev].classList.add("sel"); save.disabled = false; save.textContent = `저장 · ${prev + 1}번`; }
  cells.forEach((c) => c.addEventListener("click", () => {
    if (saved) return;
    begin(); sel = Number(c.dataset.i);
    FX.s("pop", { i: sel }); FX.thud(c);
    cells.forEach((x) => x.classList.toggle("sel", x === c));
    save.disabled = false; save.textContent = `저장 · ${sel + 1}번`;
    if (!asked) { asked = true; hint("#psave", "저장을 눌러 주세요", { side: "top", allow: "#pgrid" }); }
  }));
  save.addEventListener("click", () => {
    if (saved || sel < 0) return;
    saved = true; hintOff();
    if (t0) S.phoneSec = (performance.now() - t0) / 1000;
    S.pick = who(sel);
    $(".scr").insertAdjacentHTML("beforeend", `<div class="ph-snack"><span>저장 · ${L.cls} · ${S.pick.no}번</span><i>취소</i></div>`);
    FX.s("save"); FX.thud(".ph-snack"); FX.shake(1);
    later(() => breakTime(() => go(S.k + 1)), 700);
  });
}

/* ---------- 1-A · 1-C · 쉬는 시간: 교사 PC 화면 ---------- */
function inboxShell(L, auto, man, cls) {
  return `<div class="inbox ${cls}"><div class="ib-h"><b>쉬는 시간 기록</b><span>기억이 남아 있을 때 바로 처리하세요</span><i>미반영 5</i></div>
    <div class="ib-cols"><span>반</span><span>자동 추천 · 수업 녹음</span><span>수동 기록 · 폰 · 워치</span></div>
    <div class="ib-row"><div class="ib-cls"><b>${L.cls}</b>${L.period}<br>${L.time}<br>${L.topic}</div><div class="ib-auto">${auto}</div><div class="ib-man">${man}</div></div></div>`;
}
function sDesk(root) {
  const L = LV[S.level], auto = S.mode === "auto";
  S.boardSeen = false; S.boardFx = false; S.made = false; S.split = false;
  let body;
  if (auto) {
    const s = L.script, p = L.pickLine;
    body = inboxShell(L, `<div class="sg"><div class="sgl"><div class="hd"><b>${s[p][0]}</b><i>${L.sgTag}</i>${catChip(L, L.sgCat, true)}<span class="ti">${L.sgTitle}</span></div>
        <div class="ctx"><span>화자${s[p - 1][1]}: ${s[p - 1][2]}</span><q class="key">${s[p][2]}</q></div><p class="sgn">수업 시간 중 선별된 발언입니다</p></div>
        <div class="sgr"><div class="who2"><b>누가 말했을까요?</b><small>명단을 누르면 저장</small><i class="tm" id="tm">0.0초</i></div>${rosterGrid(L)}</div></div>`, "수동 기록 없음", "a");
  } else {
    // 빨간 '아까 폰으로 고른 학생' 표시는 폰에서 실제로 고른 학생에게만 (건너뛰어 왔으면 예시 학생, 표시 없음)
    const picked = !!S.pick && S.pick.i < L.n;
    if (!picked) S.pick = who(6);
    body = inboxShell(L, "녹음 없음", entryForm(L, S.pick, "10:05", picked), "m");
  }
  root.innerHTML = `<section class="stg deskstage"><div class="cam far" id="cam">${monitor(L, body)}${deco()}</div><div class="mon-label big" id="monlabel">교사 PC 화면</div></section>`;
  later(() => $("#cam").classList.remove("far"), 650);   // 책상 위 모니터를 잠깐 보여 준 뒤 줌인
  later(() => $("#monlabel").classList.remove("big"), 1800);
  if (!auto) {
    wireEntry(L, (sec) => timeUp({ sec }, () => go(S.k + 1)));
    later(() => hint(".ib-item.man", "예시를 누르거나 한 줄을 써 주세요", { side: "top" }), 2100);
    return;
  }
  // 자동녹음: 수업 중 선별된 발언(테두리)에 학생만 붙인다. 시간은 카드가 보인 뒤부터 학생을 누를 때까지
  let t1 = 0, tick = 0, fin = false;
  const s0 = performance.now();
  later(() => {
    if (fin) return;
    t1 = performance.now();
    tick = every(() => { const el = $("#tm"); if (el) el.textContent = `${((performance.now() - t1) / 1000).toFixed(1)}초`; }, 100);
    hint(".sg", "수업 시간 중 선별된 발언입니다.\n누가 말했을까요?", { side: "top" });
  }, 2100);
  $$("#roster button").forEach((b) => b.addEventListener("click", () => {
    if (fin) return;
    fin = true; hintOff(); clearInterval(tick);
    const sec = (performance.now() - (t1 || s0)) / 1000;
    S.pick = who(Number(b.dataset.i)); S.sec = sec; S.phoneSec = 0;
    fillMine();
    b.classList.add("on");
    FX.s("save"); FX.thud(b);
    timeUp({ sec }, () => go(S.k + 1));
  }));
}

/* ---------- 1-B · 웨일 수동기록: 교탁의 모니터 2대 ---------- */
function sWhale(root) {
  const L = LV[S.level];
  S.pick = null; S.note = ""; S.chip = -1; S.phoneSec = 0; S.boardSeen = false; S.boardFx = false; S.made = false; S.split = false;
  const page = `<div class="wr"><div class="wr-main"><div class="wr-h"><b>${L.cls} · ${L.period}</b><span>${L.lesson}</span><i>웨일 스페이스 명단 그대로 · ${L.n}명</i></div>${rosterGrid(L, "big")}</div>
      <aside class="wr-side" id="wside"><div class="wr-empty"><b>학생을 누르면</b>여기에서 바로 기록합니다<small>보던 화면을 떠나지 않아요</small></div></aside></div>`;
  root.innerHTML = `<section class="stg deskstage two"><div class="cam far2" id="cam">
        <div class="mon slide"><div class="sl"><small>${L.slide[0]}</small><b>${L.slide[1]}</b><span>${L.slide[2]}</span></div></div>
        <span class="montag t1">수업용 화면<small>교실 TV와 같은 화면</small></span><span class="montag t2">개인 화면<small>웨일 · 누가</small></span>
        ${monitor(L, page, "full")}${deco(true)}</div>
      <div class="mon-label big hide" id="monlabel">개인 화면 · 웨일</div></section>`;
  // 두 모니터가 다 보이는 채로 개인 화면의 명단에서 학생을 고른다(명단만 크게). 고르면 개인 화면으로 줌인해 그 자리에서 한 줄
  const cam = $("#cam"), label = $("#monlabel");
  let zoomed = false;
  beat(() => { if (!S.pick) hint("#roster", "개인 화면의 명단에서 학생을 눌러 주세요", { side: "bottom", opacity: 0.4 }); }, 900);
  $$("#roster button").forEach((b) => b.addEventListener("click", () => {
    hintOff();
    $$("#roster button").forEach((x) => x.classList.toggle("on", x === b));
    S.pick = who(Number(b.dataset.i)); S.chip = -1;
    FX.s("pick"); FX.thud(b);
    $("#wside").innerHTML = entryForm(L, S.pick, "지금 · 웨일");
    wireEntry(L, (sec) => timeUp({ sec }, () => go(S.k + 1)));
    const ask = () => hint(".ib-item.man", "예시를 누르거나 한 줄을 써 주세요", { side: "left", allow: "#roster" });
    if (zoomed) { ask(); return; }
    zoomed = true;
    cam.classList.remove("far2"); label.classList.remove("hide");   // 고른 순간 개인 화면으로 확대
    later(() => label.classList.remove("big"), 1300);
    beat(ask, reduced ? 200 : 1350);
  }));
}

/* ---------- 1-C · 자동녹음 기록: 수업 중 (자동 재생) ---------- */
function sRec(root) {
  const L = LV[S.level];
  root.innerHTML = `<section class="stg phonestage auto"><div class="where"><small>수업 중</small><b>내 폰</b><span>${L.cls} · ${L.period}</span></div>
      <div class="phone"><div class="scr"><div class="ph-status"><span>09:50</span><span>◢ ▮</span></div>
        <div class="ph-noti"><div class="h"><i></i>누가 · 지금</div><b class="rec">녹음 중 · ${L.cls} ${L.period}</b><p>시간표의 수업 시간이 되어 자동으로 시작했습니다</p><div class="a"><span>일시정지</span><span>중단</span></div></div>
        <div class="waves on">${Array.from({ length: 13 }, (_, i) => `<i style="animation-delay:${(i * 0.07).toFixed(2)}s;height:${28 + ((i * 37) % 40)}px"></i>`).join("")}</div>
        <div class="ph-clock" id="rclock">00:00</div><div class="ph-grow"></div><p class="ph-fine">음성은 이 폰에만 저장되고<br>24시간 뒤 지워집니다</p></div></div>
      <div class="stt"><h3 id="stth">글로 옮기는 중<small>이름 없이 화자만 구분합니다</small></h3><div class="stt-list" id="stt"></div>
        <div class="stt-f" id="sttf"><span>녹음은 기본 꺼짐 · 학교 승인·안내·동의 후 사용</span></div></div></section>`;
  let sec = 0;
  const clock = every(() => { sec += 9; $("#rclock").textContent = `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`; }, 250);
  // 다 옮기면 저절로 넘어가지 않고 멈춘다: 기록할 만한 발언에 테두리를 치고(이 발언을 학생과 잇게 된다), [다음]을 눌러야 쉬는 시간으로
  const pause = () => {
    clearInterval(clock);
    $(".waves").classList.remove("on");
    $(".ph-noti b").textContent = `녹음 끝 · ${L.cls} ${L.period}`; $(".ph-noti b").classList.remove("rec");
    $("#stth").firstChild.textContent = "글로 옮겼어요";
    const key = $(`#stt .seg[data-k="${L.pickLine}"]`);
    key.classList.add("key"); key.insertAdjacentHTML("beforeend", "<em>기록할 만한 발언</em>");
    FX.s("pick");
    $("#sttf").innerHTML = '<span>테두리 친 발언을 쉬는 시간에 학생과 연결해요</span><button class="cta" id="recnext" type="button">다음 <span aria-hidden="true">→</span></button>';
    $("#recnext").classList.add("hinted");
    $("#recnext").addEventListener("click", () => { $("#recnext").disabled = true; breakTime(() => go(S.k + 1), "09:50"); });
  };
  L.script.forEach((s, k) => later(() => {
    $("#stt").insertAdjacentHTML("beforeend", `<div class="seg ${s[1] === 1 ? "t1" : ""}" data-k="${k}"><b class="sp${s[1]}">화자${s[1]}</b><span>${s[2]}</span></div>`);
    FX.s("row", { i: k });
    if (k === L.script.length - 1) later(pause, 800);
  }, 500 + k * 750));
}

/* ---------- 2 · 한눈에: 기록이 카드로 날아가고, 줌아웃, 기록 부족 알림 ---------- */
function sBoard(root) {
  const L = ensure(), N = L.n, mine = S.pick.i;
  const base = [0, 2, 1, 4, 3, 0, 5, 2, 3, 1, 6, 2, 0, 4, 3, 1, 2, 5, 0, 3, 2, 4, 1, 3, 2, 1];
  const cnt = (i) => (i === mine ? L.recs.length : base[i % base.length]);
  const stepOf = (n) => (n === 0 ? 0 : n <= 2 ? 1 : n <= 4 ? 2 : 3);
  const ids = [...Array(N).keys()];
  const alerts = ids.filter((i) => i !== mine && cnt(i) === 0).slice(0, 4);
  const stairs = `<div class="st"><div class="st-h"><b>기록 계단</b><span>${L.cls} · ${N}명</span><i>기록이 쌓일수록 위로</i></div><div class="st-steps">${["출발선", "2건 이하", "3건 이상", "5건 이상"].map((nm, k) => {
    const mem = ids.filter((i) => stepOf(cnt(i)) === k);
    return `<div class="stc s${k}"><div class="pls">${mem.map((i) => `<i class="pl ${i === mine ? "me" : ""}" id="p${i}">${NAMES[i]}</i>`).join("")}</div><div class="bar"><b>${nm}</b> ${mem.length}명</div></div>`;
  }).join("")}</div></div>`;
  const line = (i, j) => { const r = L.recs[(i * 5 + j * 3) % L.recs.length]; return `<p>${r[1]} ${r[2]}</p>`; };
  const cards = ids.map((i) => {
    const n = cnt(i), low = n <= 1;
    const body = i === mine ? L.recs.slice(-2).reverse().map((r) => `<p>${r[1]} ${r[2]}</p>`).join("") : n ? line(i, 0) + (n > 1 ? line(i, 1) : "") : '<p class="no">아직 기록 없음</p>';
    return `<div class="bc ${low ? "low" : ""} ${i === mine ? "me" : ""}" id="c${i}"><b><i>${String(i + 1).padStart(2, "0")}</i>${NAMES[i]}</b><span class="n">기록 <em>${n}</em>건${low ? "<u>기록 부족</u>" : ""}</span>${body}</div>`;
  }).join("");
  root.innerHTML = `<section class="stg deskstage"><div class="cam" id="cam">${monitor(L, `<div class="page" id="page">${stairs}<div class="grid">${cards}</div></div>`)}</div><div class="mon-label" id="monlabel">${monLabel()}</div></section>`;
  const page = $("#page"), sheet = $("#sheet"), card = $(`#c${mine}`);
  const sw = sheet.clientWidth, sh = sheet.clientHeight, pw = page.offsetWidth, ph = page.offsetHeight;
  const cam = (z, x, y, ms) => { page.style.transition = ms ? `transform ${ms}ms cubic-bezier(.3,.05,.2,1)` : "none"; page.style.transform = `translate(${x}px,${y}px) scale(${z})`; };
  const farZ = Math.min(1, (sh - 12) / ph, (sw - 6) / pw);
  const out = (ms) => cam(farZ, (sw - pw * farZ) / 2, (sh - ph * farZ) / 2, ms);
  const land = () => {
    card.querySelector("em").textContent = String(L.recs.length + 1);
    card.querySelectorAll("p").forEach((p) => p.remove());
    card.querySelector(".n").insertAdjacentHTML("afterend", `<p class="new">오늘 ${esc(S.note)}</p>`);
    card.classList.add("hit"); $(`#p${mine}`)?.classList.add("hit");
    if (!S.boardSeen && !S.boardFx) { S.boardFx = true; FX.s("land"); FX.thud(card); FX.shake(3); FX.burst(card, { n: 10 }); }   // 그 기록에 한 번만. 다시 볼 때는 조용히
  };
  const ring = () => alerts.forEach((i, k) => later(() => { const c = $(`#c${i}`); c.classList.add("warn"); if (!S.boardSeen) FX.s(k ? "tick" : "warn"); c.insertAdjacentHTML("beforeend", '<s class="bell">기록이 필요해요</s>'); $(`#p${i}`)?.classList.add("warn"); }, k * 280));
  const ask = () => { S.boardSeen = true; hint("#mkdraft", "쌓인 기록으로 생기부를 써 보세요", { side: "bottom", align: "end", opacity: 0.42 }); };
  $("#mkdraft").addEventListener("click", () => go(S.k + 1));
  if (S.boardSeen || reduced) { out(0); land(); ring(); later(ask, 400); return; }
  // 그 학생 카드를 크게 → 기록 조각이 날아와 붙고 → 뒤로 빠지며 반 전체
  const z = 2.3, cx = card.offsetLeft + card.offsetWidth / 2, cy = card.offsetTop + card.offsetHeight / 2;
  const clamp = (v, lo) => Math.max(lo, Math.min(0, v));   // 가장자리 학생이어도 화면이 현황판 밖으로 나가지 않게
  const zx = clamp(sw / 2 - cx * z, sw - pw * z), zy = clamp(sh / 2 - cy * z, sh - ph * z);
  cam(z, zx, zy, 0);
  const sb = box(sheet), to = { x: sb.x + zx + cx * z, y: sb.y + zy + cy * z };
  fly(S.note, { x: Math.max(200, Math.min(760, to.x - 180)), y: 150 }, to, 600, 650, land);
  later(() => out(1300), 2000);
  later(() => FX.s("step"), 2000);
  later(ring, 3500);
  later(ask, 3500 + alerts.length * 280 + 500);
}

/* ---------- 3 · 생기부: 내 기록(연한 빨강)이 어느 문구가 됐는지 ---------- */
function draftData(L) {
  const recs = [{ c: S.noteCat, d: "오늘", t: S.note, mine: true }, ...L.recs.map(([c, d, t]) => ({ c, d, t })).reverse()];   // 화면 순서: 내 기록, 그다음 최근 것부터
  const ri = (k) => L.recs.length - k;   // recs 번호 → 화면 줄
  const pre = L.sens.map(([t, ev]) => ({ t, ev: ev.map(ri) }));
  const sens = [pre[0], { t: S.mineS, ev: [0], mine: true }, ...pre.slice(1), { t: L.close, ev: recs.map((_, k) => k) }];
  const total = () => sens.reduce((n, x) => n + bytes(x.t) + 1, -1);
  while (total() > 1500 && sens.length > 4) sens.splice(sens.length - 2, 1);   // 1,500B 를 넘으면 뒤쪽 예시 문장부터 덜어 낸다
  return { recs, sens, total: total() };
}
function sDraft(root) {
  const L = ensure(), D = draftData(L);
  const spent = S.sec;   // '기록 완료!' 창과 같은 숫자 (한 줄 칸에 커서가 올라간 때부터 저장까지)
  const rows = D.recs.map((r, k) => `<div class="rec ${r.mine ? "mine" : ""}" data-k="${k}">${r.mine ? '<span class="tagm">방금 기록</span>' : ""}${catChip(L, r.c)}${r.mine ? "" : `<time>${r.d}</time>`}<span class="tx">${esc(r.t)}</span></div>`).join("");
  root.innerHTML = `<section class="stg deskstage"><div class="cam" id="cam">${monitor(L, `<div class="dp">
        <div class="dp-h"><span class="no">${S.pick.no}</span><span class="nm">${S.pick.name}</span><b class="it">${L.item}</b><span class="g"></span>
          <label class="swl" id="swl"><span>한 문장씩</span><button class="sw" id="split" type="button" role="switch" aria-checked="false" disabled></button></label>
          <span class="len"><i id="lenb"></i></span><span class="lent" id="lent">0/1,500B</span></div>
        <div class="dp-b" id="dpb"><div class="dp-l"><div class="dp-draft" id="draft"><p class="ph">아직 초안이 없습니다. [생성]을 누르면 오른쪽 기록으로 초안을 씁니다.</p></div>
            <div class="dp-f" id="dpf"><p class="dp-msg">체크한 기록 <b>${D.recs.length}건</b>으로 ${L.item} 초안을 씁니다</p><button class="cta gen" id="gen" type="button">생성</button></div></div>
          <div class="dp-r" id="recs"><h5>기록<span>사용 ${D.recs.length}건</span></h5>${rows}</div><svg class="link" id="link" aria-hidden="true"></svg></div></div>`)}</div>
      <div class="mon-label" id="monlabel">${monLabel()}</div></section>`;
  const dpb = $("#dpb"), draft = $("#draft");
  $("#mkdraft").classList.add("on");
  let cur = null, pairs = () => [];   // 지금 이어 보이는 것: ["s", 문장] 또는 ["r", 기록], 그리고 그 연결선
  const sn = (k) => $(`#para .sn[data-k="${k}"]`), row = (k) => $(`#recs .rec[data-k="${k}"]`);
  const draw = (still) => {
    const d = box(draft, dpb);
    $("#link").innerHTML = pairs().map(([s, r, mine], i) => {
      const a = box(s, dpb), b = box(r, dpb);
      const x1 = d.x + d.w, y1 = Math.max(d.y + 8, Math.min(d.y + d.h - 8, a.y + a.h / 2 - draft.scrollTop)), x2 = b.x, y2 = b.y + b.h / 2;
      return `<path class="${mine ? "m" : ""}${still ? " still" : ""}" style="--l:${Math.ceil(Math.hypot(x2 - x1, y2 - y1) * 1.5)};animation-delay:${(i * 0.14).toFixed(2)}s" d="M${x1} ${y1} C${x1 + 18} ${y1},${x2 - 18} ${y2},${x2} ${y2}"/>`;
    }).join("");
  };
  const mark = (ks, rs) => {
    $$("#para .sn").forEach((x) => x.classList.toggle("on", ks.includes(Number(x.dataset.k))));
    $$("#recs .rec").forEach((x) => x.classList.toggle("on", rs.includes(Number(x.dataset.k))));
  };
  // 처음 보여 줄 모습: 내 기록(빨강) + 다른 문장 두어 개의 근거 기록 3~4건(노랑)이 함께 이어진 모습
  const selAll = () => {
    cur = ["all"];
    const mineK = D.sens.findIndex((s) => s.mine), ks = [mineK], rs = [0];
    // 노란 문장은 내 문장(빨강)보다 아래에서 한 문장씩 건너뛰며 고른다: 빨강과 붙지 않고 드문드문 보이게. 기록은 모두 3~4건
    const take = (from) => {
      for (let k = from; k < D.sens.length - 1 && rs.length - 1 < 4; k += 2) {
        const ev = D.sens[k].ev.filter((e) => !rs.includes(e));
        if (ks.includes(k) || !ev.length || rs.length - 1 + ev.length > 4) continue;
        ks.push(k); rs.push(...ev);
      }
    };
    take(mineK + 2);
    if (rs.length - 1 < 3) take(mineK + 3);
    mark(ks, rs);
    pairs = () => ks.flatMap((k) => D.sens[k].ev.filter((e) => rs.includes(e)).map((e) => [sn(k), row(e), D.sens[k].mine]));
    draw();
  };
  const selS = (k) => { cur = ["s", k]; FX.s("link", { i: k }); mark([k], D.sens[k].ev); pairs = () => D.sens[k].ev.map((e) => [sn(k), row(e), D.sens[k].mine]); draw(); };
  const selR = (r) => {
    cur = ["r", r];
    let ks = D.sens.map((s, k) => (s.ev.includes(r) && s.ev.length < D.recs.length ? k : -1)).filter((k) => k >= 0);
    if (!ks.length) ks = [D.sens.length - 1];   // 문장에 따로 쓰이지 않은 기록은 마무리 문장으로
    mark(ks, [r]); pairs = () => ks.map((k) => [sn(k), row(r), r === 0]); draw();
    FX.s("link", { i: r });
  };
  const done = () => {
    S.made = true; hintOff();
    $("#lenb").style.width = `${Math.min(100, (D.total / 1500) * 100)}%`; $("#lent").textContent = `${D.total.toLocaleString("ko-KR")}/1,500B`;
    $("#split").disabled = false; $("#swl").classList.add("ready");
    $("#dpf").innerHTML = `<p class="dp-msg hit">${spent ? `방금 <b>${spent.toFixed(1)}초</b> 기록이` : "방금 남긴 기록이"} 생기부 <b>한 문장</b>이 됐습니다</p>
      <button class="btn2 fill" id="tobatch" type="button">반 전체 일괄 작성 보기 <span aria-hidden="true">→</span></button>`;
    $("#tobatch").addEventListener("click", () => go(S.k + 1));
    $$("#para .sn").forEach((x) => x.addEventListener("click", () => selS(Number(x.dataset.k))));
    $$("#recs .rec").forEach((x) => x.addEventListener("click", () => selR(Number(x.dataset.k))));
    draft.scrollTop = 0;
    selAll();
    // 개인 작성이 끝나면 [반 전체 일괄 작성 보기]를 짚는다 (잠깐 초안과 연결선을 본 뒤).
    // 여기서는 화면을 어둡게 하지 않는다: 방금 만든 초안과 연결선이 그대로 보이게, 단추에 밝은 테두리와 말풍선만
    later(() => hint("#tobatch", "반 전체도 한 번에 써 볼까요?", { side: "top", dim: false, ring: true }), 1700);
  };
  /** 한 문단이 타자 치듯 채워진다 (instant = 이미 만든 초안을 다시 열 때) */
  const typeOut = (instant) => {
    draft.innerHTML = `<p class="para" id="para">${D.sens.map((s, k) => `<span class="sn ${s.mine ? "mine" : ""}" data-k="${k}"><span class="tx"></span><em class="ev">${s.ev.length}</em></span>`).join(" ")}</p>`;
    draft.classList.toggle("split", S.split);
    const spans = $$("#para .tx"), full = D.sens.map((s) => s.t), all = full.reduce((n, t) => n + t.length + 1, 0);
    let n = instant ? all : 0;
    const paint = () => {
      let left = n, b = -1;
      spans.forEach((sp, k) => { const t = full[k].slice(0, Math.max(0, left)); sp.textContent = t; if (t) b += bytes(t) + 1; left -= full[k].length + 1; });
      $("#lent").textContent = `${Math.max(0, b).toLocaleString("ko-KR")}/1,500B`; $("#lenb").style.width = `${Math.min(100, (Math.max(0, b) / 1500) * 100)}%`;
    };
    if (instant) { paint(); done(); return; }
    const tick = every(() => { n += 5; FX.s("key"); paint(); draft.scrollTop = draft.scrollHeight; if (n >= all) { clearInterval(tick); done(); FX.s("win"); FX.burst("#para .sn.mine", { n: 14 }); FX.shake(1); } }, 16);
  };
  $("#split").addEventListener("click", () => {
    S.split = !S.split; hintOff();
    $("#split").classList.toggle("on", S.split); $("#split").setAttribute("aria-checked", String(S.split));
    draft.classList.toggle("split", S.split);
    const el = cur?.[0] === "s" ? sn(cur[1]) : null;   // 보던 문장이 계속 보이게
    draft.scrollTop = el ? Math.max(0, el.offsetTop - 60) : 0;
    draw();
  });
  draft.addEventListener("scroll", () => draw(true), { passive: true });
  if (S.made) { $("#split").classList.toggle("on", S.split); typeOut(true); return; }
  $("#gen").addEventListener("click", () => {
    hintOff();
    $("#gen").disabled = true; $("#gen").textContent = "쓰는 중";
    FX.s("gen");
    draft.innerHTML = `<div class="dl"><i></i><i></i><i></i><i></i><b>초안을 쓰는 중 · 기록 ${D.recs.length}건을 엮고 있어요</b></div>`;
    later(() => typeOut(false), 1100);
  });
  later(() => { if (!$("#gen")?.disabled && !S.made) hint("#gen", "생성을 눌러 주세요", { side: "top" }); }, 500);
}

/* ---------- 3-2 · 반 전체 일괄 작성: 영상처럼 저절로 재생 ---------- */
// 학생마다 첫 문장: 각자의 기록으로 쓰니 모두 다르다 (체험용 합성 문장)
const FIRST = {
  elem: [
    "모둠 토의에서 친구들의 의견을 차례로 정리해 주며 서로의 생각을 잇는 배려심을 보여 줌.",
    "과학 실험에서 관찰한 변화를 그림으로 꼼꼼히 기록하며 끝까지 살피는 탐구심이 돋보임.",
    "틀린 수학 문제를 스스로 다시 풀어 보며 실수에서 배우는 태도가 꾸준히 자라고 있음.",
    "아침 독서 시간에 읽은 책을 친구에게 소개하며 생각을 나누는 즐거움을 알아 감.",
    "교실 화분 물 주기를 한 주 동안 빠짐없이 챙기며 맡은 일을 소중히 여기는 책임감을 보여 줌.",
    "전학 온 친구에게 학교 곳곳을 먼저 안내해 주며 주변을 살피는 따뜻한 마음이 돋보임.",
    "국어 시간에 자신의 경험을 들어 의견을 또박또박 발표하며 말하기 자신감이 커짐.",
    "급식 당번을 맡아 정리까지 책임 있게 마무리하며 공동체를 위하는 마음을 보여 줌.",
    "다툰 친구에게 먼저 다가가 사과하고 화해하며 관계를 소중히 여기는 성숙함을 보임.",
    "우리 고장 조사 내용을 사진과 함께 발표하며 알아낸 것을 알기 쉽게 전하는 힘이 있음.",
    "쉬는 시간에 떨어진 쓰레기를 스스로 주워 정리하며 바른 생활 습관이 몸에 배어 있음.",
    "모르는 낱말을 사전에서 찾아 공책에 정리하며 스스로 배우려는 습관을 길러 가고 있음.",
    "줄넘기 연습을 매일 이어 가며 목표를 향해 꾸준히 도전하는 끈기를 보여 줌.",
    "리코더 합주에서 친구들과 박자를 맞추며 함께 어울려 완성하는 기쁨을 느낌.",
    "미술 협동 작품에서 배경 그리기를 맡아 끝까지 완성하며 맡은 몫을 해내는 성실함이 돋보임.",
    "학급 회의에서 운동장 사용 규칙을 제안하며 문제를 함께 풀어 가는 힘을 보여 줌.",
    "도서관 정리를 자원하여 책을 번호대로 꽂으며 스스로 일을 찾아 하는 태도를 보임.",
    "수학 익힘 문제를 먼저 푼 뒤 친구의 풀이를 도와주며 함께 배우는 기쁨을 나눔.",
    "동물 기르기 관찰 일지를 하루도 빠짐없이 쓰며 작은 변화도 놓치지 않는 관찰력을 보여 줌.",
    "발표를 어려워하는 친구에게 먼저 차례를 양보하며 친구의 마음을 헤아리는 배려를 보임.",
    "탐구 주제를 스스로 정해 자료를 찾으며 궁금한 것을 끝까지 알아보는 호기심이 돋보임.",
    "짝과 함께 받아쓰기 문장을 서로 불러 주며 협력하여 배우는 태도를 보여 줌.",
    "학급 텃밭의 상추를 돌보며 생명을 아끼고 보살피는 마음을 키워 감.",
    "독후 감상문을 친구들 앞에서 읽으며 생각을 글로 표현하는 힘이 자라고 있음.",
    "수업 중 궁금한 점을 손 들어 질문하며 배움에 적극적으로 참여하는 모습을 보임.",
    "이어달리기에서 넘어진 친구를 일으켜 함께 달리며 따뜻한 동료애를 보여 줌.",
  ],
  mid: [
    "반응 속도 실험에서 농도에 따른 변화를 그래프로 정리하며 자료를 해석하는 능력이 돋보임.",
    "동적 평형을 물의 증발 사례로 설명하며 추상적인 개념을 구체화하는 능력을 보여줌.",
    "르샤틀리에 원리를 온도 변화 실험과 연결해 질문하며 원리를 깊이 이해하려는 탐구적 태도를 보임.",
    "평형 상수 계산 과정을 모둠원에게 단계별로 설명하며 동료의 이해를 돕는 협력적 태도를 보여줌.",
    "촉매의 역할에 관한 기사를 찾아 발표하며 배운 내용을 사회 현상과 연결하는 시야를 보여줌.",
    "산·염기 적정 실험에서 데이터 기록을 맡아 끝까지 정리하며 맡은 역할을 책임 있게 수행함.",
    "완충 용액의 원리를 모형으로 표현하여 발표하며 개념을 시각화하는 능력이 인상적임.",
    "반응 지수와 평형 상수를 비교하는 개념 지도를 스스로 그리며 개념 사이의 관계를 구조화함.",
    "실험 오차의 원인을 스스로 찾아 보고서에 정리하며 결과를 비판적으로 검토하는 태도를 보여줌.",
    "모둠 토의에서 의견을 조율하여 실험 계획을 세우며 공동 과제를 이끄는 리더십을 발휘함.",
    "직접 만든 레몬 전지로 전지의 원리를 확인하며 과학적으로 탐구하는 능력을 보여줌.",
    "오개념 퀴즈에서 모둠원의 잘못된 이해를 근거를 들어 바로잡으며 논리적으로 설명하는 능력이 돋보임.",
    "용해 평형을 탄산음료 사례에 적용하며 배운 개념을 일상에 연결하는 응용력을 보임.",
    "반응 속도 요인을 변인 통제 실험으로 설계하며 가설을 세우고 검증하는 능력을 보여줌.",
    "산화·환원 반응식을 친구들에게 풀이하며 개념을 자기 말로 풀어내는 표현력이 뛰어남.",
    "평형 이동 실험에서 색 변화를 정밀하게 관찰하고 기록하며 꼼꼼한 실험 태도가 돋보임.",
    "화학 반응과 에너지에 관한 보고서를 쓰며 자료를 찾아 체계적으로 정리하는 능력을 보임.",
    "엔탈피 개념의 조건과 예외를 묻는 질문을 하며 원리를 정확히 알고자 하는 태도를 보여줌.",
    "중화 반응 실험의 안전 수칙을 모둠원과 점검하며 실험 활동의 책임감과 안전 의식을 보여줌.",
    "기체 반응 실험 결과를 표와 그래프로 비교하여 발표하며 정량적으로 분석하는 능력이 돋보임.",
    "화학 평형 복습 노트를 스스로 만들어 친구들과 나누며 함께 성장하려는 태도를 보임.",
    "반응 속도론 심화 문제에 끝까지 도전하여 해결하며 어려운 과제도 포기하지 않는 끈기를 보여줌.",
    "촉매 실험에서 예상과 다른 결과를 근거로 가설을 고치며 유연한 사고력을 보여줌.",
    "실험 기구 정리를 자발적으로 맡아 마무리하며 공동체를 위해 먼저 나서는 태도가 돋보임.",
    "평형 개념을 활용한 공기 정화 원리를 조사해 발표하며 화학을 진로와 연결하는 탐구심을 보임.",
    "전해질 수용액의 전기 전도성을 반복 측정하며 결과의 신뢰도를 높이려는 태도를 보여줌.",
  ],
};
// 기록이 없는 학생 · 기록이 적은 학생 (현황판에서 '기록 부족'이던 자리, 첫 줄은 초안 전체를 보여 줄 학생이라 비워 둔다)
const BATCH_ZERO = 18, BATCH_SHORT = 12;
/** 반 전체 초안 목록: 방금 쓴 학생은 그 초안, 기록이 없으면 쓰지 않고, 적으면 짧게 */
function batchRows(L) {
  const mine = S.pick ? S.pick.i : -1, D = draftData(L), pool = FIRST[S.level];
  return NAMES.slice(0, L.n).map((name, i) => {
    if (i === mine) return { i, name, n: L.recs.length + 1, first: L.sens[0][0], bytes: D.total, mine: true };
    if (i === BATCH_ZERO) return { i, name, n: 0, first: "", bytes: 0, zero: true };
    const first = pool[i % pool.length];
    if (i === BATCH_SHORT) return { i, name, n: 3, first, bytes: 700 + ((i * 53) % 90), short: true };
    return { i, name, n: 8 + ((i * 7) % 9), first, bytes: 1330 + ((i * 137) % 165) };
  });
}
// 첫 번째 학생의 초안 전체 (첫 문장 뒤에 이어지는 문장들, 체험용 합성). 분량 1,500B 를 넘으면 뒤에서부터 덜어 낸다
const SHOW_REST = {
  elem: [
    "쉬는 시간에 혼자 있는 친구에게 먼저 다가가 함께 놀이를 제안하며 친구 관계를 넓혀 감.",
    "국어 시간에 이야기의 장면을 바꾸어 쓰는 활동에서 인물의 마음을 섬세하게 살펴 표현하는 힘이 돋보임.",
    "과학 시간에 식물의 자람을 관찰하며 날마다 키를 재어 표로 정리하는 꼼꼼함을 보여 줌.",
    "학급 역할인 칠판 정리를 한 학기 동안 빠짐없이 맡아 책임감 있게 해냄.",
    "수학 시간에 어려운 문제를 만나도 그림을 그려 가며 끝까지 해결하려는 끈기를 보임.",
    "체육 시간에 경기 규칙을 지키며 친구들을 응원하는 모습에서 바른 운동 태도가 드러남.",
    "미술 시간에 친구의 작품에서 좋은 점을 찾아 칭찬하며 서로를 북돋우는 분위기를 만듦.",
    "학급 문고를 맡아 친구들이 읽은 책을 기록하고 추천 목록을 만들어 나눔.",
    "사회 시간에 우리 동네 지도를 그리며 자신이 사는 곳에 대한 관심을 넓혀 감.",
    "수업이 끝난 뒤 모둠 자리를 스스로 정리하며 함께 쓰는 공간을 아끼는 태도를 보임.",
  ],
  mid: [
    "촉매가 활성화 에너지를 낮추는 원리를 에너지 도표로 그려 모둠원에게 설명하며 개념을 구조화하는 능력을 보여줌.",
    "동적 평형 단원에서 평형 상태의 조건을 묻는 질문을 하며 원리를 정확히 알고자 하는 탐구적 태도를 보임.",
    "산·염기 중화 실험에서 지시약의 색 변화를 꼼꼼히 기록하고 오차의 원인을 스스로 분석함.",
    "모둠 탐구에서 실험 설계를 맡아 변인을 체계적으로 통제하며 공동 과제를 책임 있게 이끎.",
    "전기 화학 단원에서 전지의 원리를 실생활 기기와 연결해 발표하며 배운 개념을 적용하는 능력이 돋보임.",
    "화학 반응식의 계수를 맞추는 문제를 친구들과 함께 풀며 서로의 풀이 과정을 비교하고 다듬음.",
    "산화수 변화를 표로 정리한 학습지를 스스로 만들어 복습하며 자기주도적으로 학습함.",
    "실험 보고서에서 그래프의 경향을 근거로 결론을 이끌어 내며 논리적으로 서술하는 능력을 보임.",
    "모둠 발표에서 받은 질문에 답하며 실험 결과의 한계를 솔직하게 인정하고 보완할 방향을 스스로 제시함.",
  ],
};
const SHOW_CLOSE = { elem: "친구를 배려하는 따뜻한 마음과 맡은 일을 끝까지 해내는 책임감이 고르게 자라고 있어 앞으로의 성장이 더욱 기대됨.", mid: "자료를 해석하는 능력과 탐구적 태도를 고루 갖춘 성실한 학습자임." };
/** 첫 학생의 초안 전체 (방금 쓴 학생이면 그 초안 그대로) */
function showcaseText(L, r) {
  if (r.mine) return draftData(L).sens.map((s) => s.t).join(" ");
  const sens = [r.first, ...SHOW_REST[S.level], SHOW_CLOSE[S.level]];
  const total = () => bytes(sens.join(" "));
  while (total() > 1500 && sens.length > 3) sens.splice(sens.length - 2, 1);
  return sens.join(" ");
}
function sBatch(root) {
  const L = ensure(), rows = batchRows(L), n = rows.length;
  FX.calm(!!S.batchSeen && !S.batchReplay); S.batchReplay = false;
  // 첫 학생: 초안 전체를 크게 보여 준 뒤 자기 줄로 줄어든다. 나머지는 줄에서 같은 방식으로 채워진다
  const first = rows[0], full = showcaseText(L, first);
  if (!first.mine) first.bytes = bytes(full);
  const row = (r) => `<div class="br${r.mine ? " mine" : ""}${r.zero ? " zero" : ""}" data-i="${r.i}"><b>${String(r.i + 1).padStart(2, "0")}</b><span class="nm">${r.name}</span><span class="ev">${r.n ? `기록 ${r.n}건` : "기록 없음"}</span><span class="tx"></span><span class="bl"><i></i><em>–</em></span><span class="bs">대기</span></div>`;
  root.innerHTML = `<section class="stg deskstage"><div class="cam" id="cam">${monitor(L, `<div class="bt2" id="bt2">
        <div class="bt2-h"><b>생기부 생성</b><span class="tabs"><i>개별</i><i class="on">일괄</i><i>검토</i></span><span class="it">${L.item} · ${L.cls} ${n}명</span><span class="g"></span><span class="cnt"><b id="btdone">0</b>/${n}명</span><button class="cta bt2-go" id="btgo" type="button" tabindex="-1">일괄 생성</button></div>
        <div class="bt2-cols"><span>번호</span><span>이름</span><span>근거</span><span>초안 (첫 문장)</span><span>분량</span><span>상태</span></div>
        <div class="bt2-list" id="btlist">${rows.map(row).join("")}</div>
        <div class="bt2-show${first.mine ? " mine" : ""}" id="btshow" hidden><div class="bs-h"><span class="bs-tag">1명째 · 초안 전체</span><b>${String(first.i + 1).padStart(2, "0")} ${first.name}</b><span>기록 ${first.n}건 · ${L.item}</span><span class="g"></span><em id="bsb">0/1,500B</em></div><p id="bsp"></p></div></div>`)}</div>
      <div class="vbar" id="vbar"><span class="live" id="vlive">● 반 전체 일괄 작성</span><span id="vtime">0.0초</span><i class="prog"><i id="vprog"></i></i><button type="button" id="vreplay" hidden>다시 보기 ↺</button><button class="cta" id="btnext" type="button" hidden>강점 3가지 보기 <span aria-hidden="true">→</span></button></div>
      <div class="mon-label" id="monlabel">${monLabel()}</div></section>`;
  $("#mkdraft").classList.add("on");
  const list = $("#btlist"), els = $$(".br", list), prog = $("#vprog"), show = $("#btshow"), t0 = performance.now();
  const START = 700, TYPE = 2600, HOLD = 900, SHRINK = 950, REST = START + TYPE + HOLD + SHRINK + 150, GAP = 170, WRITE = 480;
  const total = REST + (n - 2) * GAP + WRITE + 150;
  let processed = 0;
  const count = () => { processed++; $("#btdone").textContent = processed; };
  const clock = every(() => {
    const t = Math.min(performance.now() - t0, total);
    prog.style.transform = `scaleX(${t / total})`; $("#vtime").textContent = `${(t / 1000).toFixed(1)}초`;
  }, 100);
  const finishRow = (r, el) => {
    $(".tx", el).textContent = r.first; $(".bl em", el).textContent = `${r.bytes.toLocaleString("ko-KR")}B`; $(".bl i", el).style.width = `${(r.bytes / 1500) * 100}%`;
    el.classList.remove("run"); el.classList.add("done");
    $(".bs", el).textContent = r.mine ? "완료 · 방금 쓴 초안" : r.short ? "완료 · 기록만큼 짧게" : "완료";
    count();
  };
  /** 나머지 학생: 줄에서 '쓰는 중' → 첫 문장이 채워지고 분량이 오른 뒤 '완료' */
  const run = (r, el) => {
    const top = el.offsetTop - list.clientHeight + el.offsetHeight * 2.6;   // 이 줄이 화면 아래 영상 막대 위에 보이게
    if (top > list.scrollTop) list.scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
    const st = $(".bs", el), tx = $(".tx", el), em = $(".bl em", el), bar = $(".bl i", el);
    if (r.zero) { el.classList.add("done"); st.textContent = "기록이 없어 쓰지 않음"; tx.textContent = "—"; em.textContent = "0B"; FX.s("warn"); count(); return; }
    el.classList.add("run"); st.textContent = "쓰는 중";
    const s0 = performance.now();
    const w = every(() => {
      const k = reduced ? 1 : Math.min(1, (performance.now() - s0) / WRITE);
      tx.textContent = r.first.slice(0, Math.ceil(r.first.length * k));
      const b = Math.round(r.bytes * k);
      em.textContent = `${b.toLocaleString("ko-KR")}B`; bar.style.width = `${(b / 1500) * 100}%`;
      if (k >= 1) { clearInterval(w); finishRow(r, el); FX.s("row", { i: r.i }); }
    }, 40);
  };
  // 1) [일괄 생성] → 첫 학생의 초안 전체가 크게 써진다
  later(() => $("#btgo").classList.add("press"), 350);
  later(() => { FX.s("pick"); FX.thud("#btgo"); }, 350);
  later(() => {
    els[0].classList.add("run"); $(".bs", els[0]).textContent = "쓰는 중";
    $("#vlive").textContent = `● ${first.name} · 초안 전체`;
    show.hidden = false;
    FX.s("gen");
    const p = $("#bsp"), b = $("#bsb"), s0 = performance.now();
    const w = every(() => {
      const k = reduced ? 1 : Math.min(1, (performance.now() - s0) / TYPE);
      const t = full.slice(0, Math.ceil(full.length * k));
      p.textContent = t; b.textContent = `${bytes(t).toLocaleString("ko-KR")}/1,500B`;
      FX.s("key");
      if (k >= 1) clearInterval(w);
    }, 30);
  }, START);
  // 2) 잠깐 보여 준 뒤 그 학생의 줄 크기로 줄어들며 들어간다
  later(() => {
    FX.s("send");
    const host = $("#bt2"), sb = box(show, host), rb = box(els[0], host);
    rb.y -= list.scrollTop;
    show.style.transition = `transform ${SHRINK}ms cubic-bezier(.5,0,.2,1), opacity ${SHRINK}ms ease-in`;
    show.style.transformOrigin = "0 0";
    show.style.transform = `translate(${rb.x - sb.x}px, ${rb.y - sb.y}px) scale(${rb.w / sb.w}, ${rb.h / sb.h})`;
    show.style.opacity = "0.15";
  }, START + TYPE + HOLD);
  later(() => {
    show.hidden = true; finishRow(first, els[0]);
    els[0].classList.add("landed");
    FX.s("land"); FX.shake(1);
    $("#vlive").textContent = `● 나머지 ${n - 1}명도 같은 방식으로`;
  }, START + TYPE + HOLD + SHRINK);
  // 3) 나머지 학생들
  rows.slice(1).forEach((r, k) => later(() => run(r, els[k + 1]), REST + k * GAP));
  later(() => {
    clearInterval(clock); prog.style.transform = "scaleX(1)";
    FX.s("big"); FX.shake(3); FX.flash(); FX.burst("#bt2", { kind: "confetti", n: 34 });   // 반 전체가 끝난 순간
    S.batchSeen = true;
    $("#vlive").textContent = `● 끝 · ${n}명`; $("#vtime").textContent = `${(total / 1000).toFixed(1)}초`;
    $("#vreplay").hidden = false; $("#btnext").hidden = false; $("#btnext").classList.add("hinted");
    later(() => list.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" }), 600);   // 끝나면 맨 위(첫 학생 · 방금 쓴 학생)로
  }, total);
  $("#vreplay").addEventListener("click", () => { S.batchReplay = true; go(S.k, true); });
  $("#btnext").addEventListener("click", () => go(S.k + 1));
}

/* ---------- 3-3 · 강점 3가지 ---------- */
function sPoints(root) {
  const L = ensure(), rows = batchRows(L);
  const written = rows.filter((r) => !r.zero), sum = written.reduce((a, r) => a + r.n, 0);
  const three = rows.filter((r) => !r.mine && !r.zero && !r.short).slice(0, 3);
  // 첫 문장의 '무엇을 했는지'(…며 앞)를 칠해 학생마다 다른 곳이 보이게
  const lit = (t) => { const k = t.indexOf("며 "); return k > 0 ? `<mark>${esc(t.slice(0, k + 1))}</mark>${esc(t.slice(k + 1))}` : esc(t); };
  const bars = rows.map((r) => `<i class="${r.mine ? "mine" : ""}" style="height:${Math.max(3, (r.bytes / 1500) * 100)}%"></i>`).join("");
  root.innerHTML = `<section class="pts">
      <h2>누가 생기부 초안의 <em>강점 3가지</em></h2>
      <div class="pt-cards">
        <article class="pt"><p class="pt-n">1</p><h3>실제 기록으로 씁니다</h3>
          <div class="pt-body"><span class="rc">${esc(S.note)}</span><i class="pt-ar" aria-hidden="true">↓</i><p class="pt-sen">${esc(S.mineS)}</p></div>
          <p class="pt-cap">선생님이 남긴 기록 <b>${sum.toLocaleString("ko-KR")}건</b>으로 <b>${written.length}명</b> · 없는 내용은 만들지 않아요</p></article>
        <article class="pt"><p class="pt-n">2</p><h3>학생마다 모두 다릅니다</h3>
          <div class="pt-body">${three.map((r) => `<p class="pt-one"><b>${r.i + 1} ${r.name}</b>${lit(r.first)}</p>`).join("")}</div>
          <p class="pt-cap">각자의 기록으로 쓰니 <b>${written.length}명 ${written.length}가지</b> 초안</p></article>
        <article class="pt"><p class="pt-n">3</p><h3>한 번에 반 전체, 분량까지</h3>
          <div class="pt-body"><p class="pt-big"><b>${rows.length}</b>명</p><div class="pt-bars" aria-hidden="true"><span class="lim">1,500B</span>${bars}</div></div>
          <p class="pt-cap">[일괄 생성] 한 번 · 모두 <b>1,500B 안</b>에 · 기록이 적으면 억지로 늘리지 않아요</p></article>
      </div>
      <div class="pt-end" id="ptend"><button class="btn2" id="totalk" type="button">다른 활용 보기 · 상담</button><a class="btn2 fill" href="../">앱 소개 페이지로 →</a></div></section>`;
  $$(".pt").forEach((c, k) => later(() => c.classList.add("in"), 250 + k * 850));
  $$(".pt").forEach((c, k) => later(() => { FX.s("pop", { i: k * 2 }); FX.thud($(".pt-n", c)); }, 430 + k * 850));
  later(() => $("#ptend").classList.add("in"), 250 + 3 * 850);
  later(() => FX.s("win"), 250 + 3 * 850);
  $("#totalk").addEventListener("click", () => go(S.k + 1));
}

/* ---------- 4 · 상담: 두 사람 + 말풍선, [누가기록!]으로 근거 있는 설명 ---------- */
/** 말하는 사람: assets/chars/*.svg 를 그대로 끼워 넣는다 (말할 때 입 모양을 CSS 로 바꾸려고 img 가 아니라 인라인) */
const CHAR = { teacherF: "teacher-f", teacherM: "teacher-m", parent: "parent", student: "student" };
const charCache = {};
const charSvg = (kind) => (charCache[kind] ||= fetch(`assets/chars/${CHAR[kind]}.svg`).then((r) => (r.ok ? r.text() : Promise.reject())));
function person(kind) {
  charSvg(kind).then((svg) => $$(`.fig[data-k="${kind}"]`).forEach((el) => { el.innerHTML = svg; })).catch(() => {});
  return `<span class="fig" data-k="${kind}"><img src="assets/chars/${CHAR[kind]}.svg" alt=""></span>`;
}
function sTalk(root) {
  const L = ensure(), T = L.talk, name = S.pick.name;
  const evRecs = [...T.ev.map((k) => L.recs[k]), [S.noteCat, "오늘", S.note]];
  const fill = (t) => esc(t).replace(/\{name\}/g, esc(name));
  root.innerHTML = `<section class="talk2">
      <p class="tk-cap">${L.talkWho} · ${S.pick.no}번 ${esc(name)} <span>이름과 기록은 교사 기기에만 있습니다</span></p>
      <div class="who l" id="wl">${person(T.left)}<span class="nm">${T.left === "parent" ? `${esc(name)} ${T.leftName}` : `${esc(name)} (${T.leftName})`}</span></div>
      <div class="who t" id="wt">${person(T.teacher)}<span class="nm">${T.teacherName}</span></div>
      <div class="bub l" id="bl" hidden></div><div class="bub t" id="bt" hidden></div>
      <button class="nuga-btn" id="nuga" type="button" hidden>${LOGO}누가기록!</button>
      <div class="evs" id="evs"></div>
      <div class="tk-act" id="tkact"><button class="cta" id="tnext" type="button">다음 대화 <span aria-hidden="true">→</span></button></div>
      <button class="replay" id="replay" type="button" hidden>처음부터 다시 보기</button></section>`;
  const say = (side, html, cls = "") => {
    const me = $(side === "l" ? "#bl" : "#bt"), other = $(side === "l" ? "#bt" : "#bl"), w = $(side === "l" ? "#wl" : "#wt");
    me.className = `bub ${side} ${cls}`; me.innerHTML = html; me.hidden = false;
    if (cls === "vague") FX.s("warn"); else if (cls !== "good" && cls !== "happy") FX.s("pop", { i: side === "l" ? 2 : 5 });
    me.style.animation = "none"; void me.offsetWidth; me.style.animation = "";
    other.classList.add("old");
    w.classList.add("talking"); later(() => w.classList.remove("talking"), 1300);
  };
  // 대화는 [다음 대화]로 한 마디씩 넘긴다. 막연한 답 다음에는 [누가기록!]을 눌러야 이어진다
  let step = 0;
  const next = () => {
    const btn = $("#tnext");
    if (step < T.lines.length) { const ln = T.lines[step]; say(ln[0], fill(ln[1]), step === T.lines.length - 1 ? "vague" : ""); step++; return; }
    if (step === T.lines.length) {
      step++;
      $("#bt").hidden = true; $("#nuga").hidden = false; btn.hidden = true;
      FX.s("arrive");
      hint("#nuga", "막연한 말뿐입니다. 누가기록을 꺼내 보세요", { side: "left" });
      return;
    }
    say("l", fill(T.after), "happy");
    FX.s("big"); FX.shake(2); FX.burst("#bl", { kind: "confetti", n: 30 });   // 체험의 마지막
    $("#tkact").innerHTML = '<a class="cta" href="../">앱 소개 페이지로 <span aria-hidden="true">→</span></a>';
    $("#replay").hidden = false;
  };
  $("#tnext").addEventListener("click", next);
  $("#nuga").addEventListener("click", () => {
    hintOff();
    $("#nuga").hidden = true;
    $(".talk2").classList.add("answered");
    FX.s("send"); FX.shake(2); FX.flash();
    evRecs.forEach((_, k) => later(() => FX.s("link", { i: k + 3 }), 80 + k * 180));
    $("#evs").innerHTML = `<p>누가에 쌓인 ${esc(name)}의 기록</p>` + evRecs.map((r, k) => `<div class="evc" style="animation-delay:${k * 0.18}s">${catChip(L, r[0])}<time>${r[1]}</time><span>${esc(r[2])}</span></div>`).join("");
    later(() => { say("t", `<small>누가 기록 ${evRecs.length}건으로</small>${T.answer} ${T.tail} <mark>“${esc(S.note)}”</mark>`, "good"); FX.s("win"); FX.burst("#bt", { n: 12 }); $("#tnext").hidden = false; }, 800);
  });
  $("#replay").addEventListener("click", () => go(S.k, true));
  later(next, 300);
}

go(0);
touch();
