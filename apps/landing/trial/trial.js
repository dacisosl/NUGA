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
    talkWho: "학부모 상담", seat: "교실 내 자리로",
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
    talkWho: "학생 · 학부모 상담", seat: "교무실 자리로",
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
function clearAll() { timers.forEach((f) => f()); timers = []; curtainEl.classList.remove("on"); $$(".fly", stage).forEach((e) => e.remove()); }
const who = (i) => ({ i, no: i + 1, name: NAMES[i] });
const catChip = (L, c, on) => `<span class="cat c${c} ${on ? "on" : ""}" data-c="${c}">${L.cats[c]}</span>`;
/** 방금 남긴 기록과 그 기록으로 쓴 생기부 문장을 채운다 (예시로 넣었으면 지금 학교급 예시로) */
function fillMine() {
  const L = LV[S.level];
  if (S.mode === "auto") { S.note = L.sgMemo; S.noteCat = L.sgCat; S.mineS = L.sgS; return; }
  if (S.chip >= 0 || !S.note) { S.chip = Math.max(0, S.chip); const c = L.chips[S.chip]; S.note = c.t; S.noteCat = c.c; S.mineS = c.s; return; }
  const n = S.note.replace(/[.。]+$/, "");
  S.mineS = /함$/.test(n) ? `${n.slice(0, -1)}하는 등 수업에 꾸준히 참여하는 모습을 보임.` : `‘${n}’ 기록에서 드러나듯 수업에 꾸준히 참여하는 모습을 보임.`;
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
 */
function hint(target, text, opt = {}) {
  hintOff();
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
  const r = box(el);
  if (dim) {
    const ring = document.createElement("div");
    ring.className = "hintr";
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
  mobile: ["pick", "m-phone", "m-desk", "board", "draft", "talk"],
  whale: ["pick", "w-desk", "board", "draft", "talk"],
  auto: ["pick", "a-rec", "a-desk", "board", "draft", "talk"],
};
const STEP = { "m-phone": 0, "m-desk": 0, "w-desk": 0, "a-rec": 0, "a-desk": 0, board: 1, draft: 2, talk: 3 };
const SCREEN = { pick: sPick, "m-phone": sPhone, "m-desk": sDesk, "w-desk": sWhale, "a-rec": sRec, "a-desk": sDesk, board: sBoard, draft: sDraft, talk: sTalk };
const flow = () => FLOW[S.mode] || ["pick"];

/** fromHistory = 브라우저 뒤로·앞으로(휴대폰 뒤로 버튼)로 온 경우. 그 밖에는 화면마다 기록을 남겨 뒤로 가기가 이전 화면이 되게 한다 */
function go(k, fromHistory) {
  const f = flow();
  k = Math.max(0, Math.min(f.length - 1, k));
  clearAll(); hintOff(); $("#timeup")?.remove();
  if (!fromHistory) {
    if (k === 0) history.replaceState({ k: 0 }, "");
    else if (history.state?.k !== k || history.state?.mode !== S.mode) history.pushState({ k, mode: S.mode }, "");
  }
  S.k = k;
  const id = f[k];
  stage.dataset.scene = id;
  $("#prev").hidden = k === 0;
  const st = STEP[id] ?? -1;
  $$("#steps li").forEach((li, i) => { li.className = st === i ? "on" : st > i ? "done" : ""; });
  $$("#lvsw button").forEach((b) => b.classList.toggle("on", b.dataset.lv === S.level));
  scene.innerHTML = "";
  SCREEN[id](scene);
  rotPrompt();
}
/** [이전] = 브라우저 뒤로 가기와 같은 길 (지나온 화면으로) */
function back() { if (S.k === 0) return; if (history.state?.k > 0) history.back(); else go(S.k - 1); }
function reset() { S = fresh(); go(0); }
/** 학교급을 바꾸면 지금 화면을 그 학교급 예시로 다시 그린다 (고른 학생·잰 시간은 그대로) */
function setLevel(lv) {
  if (lv === S.level) return;
  S.level = lv;
  if (S.pick && S.pick.i >= LV[lv].n) S.pick = who(LV[lv].n - 1);
  if (S.note) fillMine();
  go(S.k, true);
}
$("#prev").addEventListener("click", back);
$("#home").addEventListener("click", reset);
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
function entryForm(L, p, meta) {
  return `<div class="ib-item man"><div class="t"><b>${p.no} ${p.name}</b><span>${meta}</span><i class="tm" id="tm">0.0초</i></div>
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
  note.addEventListener("input", () => { S.chip = -1; check(); });
  $$("#cats .cat").forEach((x) => x.addEventListener("click", () => setCat(Number(x.dataset.c))));
  $$(".ex button").forEach((b) => {
    ["pointerenter", "pointerdown"].forEach((t) => b.addEventListener(t, startLine));
    b.addEventListener("click", () => {
      const k = Number(b.dataset.k), c = L.chips[k];
      startLine(); note.value = c.t; S.chip = k; setCat(c.c); check();
      hint("#nsave", "저장(Enter)을 눌러 주세요", { side: "bottom", allow: ".ib-item.man, #roster" });
    });
  });
  const done = () => {
    if (fin || !note.value.trim()) return;
    fin = true; hintOff(); startLine(); clearInterval(tick);
    const sec = (performance.now() - t1) / 1000;
    S.note = note.value.trim(); S.noteCat = cat; S.sec = sec;
    if (S.chip >= 0 && L.chips[S.chip].t !== S.note) S.chip = -1;
    fillMine();
    onDone(sec);
  };
  ns.addEventListener("click", done);
  // Enter 는 칸 안에서든 밖에서든(예시를 누른 직후) 저장이다. 칸 안에서는 줄바꿈이 들어가지 않게 한다
  note.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) e.preventDefault(); });
  const onKey = (e) => { if (e.key === "Enter" && !e.isComposing && !ns.disabled) { e.preventDefault(); done(); } };
  addEventListener("keydown", onKey);
  entryOff = () => { clearInterval(tick); removeEventListener("keydown", onKey); entryOff = null; };
  timers.push(() => entryOff?.());
}
/** 저장하면 걸린 시간을 큰 숫자로. 2.8초 뒤 저절로 넘어가고, 눌러도 넘어간다 */
function timeUp({ sec, head, sub }, after) {
  let fin = false;
  const end = () => { if (fin) return; fin = true; $("#timeup")?.remove(); after(); };
  stage.insertAdjacentHTML("beforeend", `<div class="timeup" id="timeup"><div class="tu-card" role="dialog" aria-label="기록에 걸린 시간">
      <p class="tu-k">${head}</p><p class="tu-n"><b id="tun">0.0</b><span>초</span></p>
      <p class="tu-m">이만큼의 시간으로<br><em>수업 속 한 장면</em>을 기록했습니다.</p>${sub ? `<p class="tu-s">${sub}</p>` : ""}
      <button class="cta" id="tuok" type="button">다음 <span aria-hidden="true">→</span><i></i></button></div></div>`);
  const el = $("#tun"), t0 = performance.now(), dur = reduced ? 0 : 800;
  const run = () => {
    const k = dur ? Math.min(1, (performance.now() - t0) / dur) : 1;
    el.textContent = (sec * (1 - Math.pow(1 - k, 3))).toFixed(1);
    if (k < 1 && el.isConnected) requestAnimationFrame(run);
  };
  run();
  $("#tuok").addEventListener("click", end);
  const t = setTimeout(end, 2800);
  timers.push(() => clearTimeout(t));
}
/** 수업 → 쉬는 시간 전환 */
function breakTime(fn, from = "10:05") {
  const L = LV[S.level];
  curtainEl.innerHTML = `<i>딩동댕</i><b>쉬는 시간</b><span>${from} <u>→</u> <em>${L.time.split("–")[1]}</em> · ${L.seat}</span>`;
  curtainEl.classList.add("on");
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
    later(() => { f.remove(); cb?.(); }, ms);
  }, hold);
}

/* ---------- 0 · 방식 고르기 ---------- */
function sPick(root) {
  root.innerHTML = `<section class="pick"><h2>수업 중 빛나는 순간, <em>10초면</em> 기록됩니다</h2>
      <p class="pick-s">기록 방법을 하나 골라 체험해 보세요 · 약 1분</p>
      <div class="pick-lv"><span>예시 수업</span><span class="lvsw big" role="group" aria-label="예시 수업 학교급">${["elem", "mid"].map((lv) => `<button type="button" data-lv="${lv}" class="${S.level === lv ? "on" : ""}">${LV[lv].label}</button>`).join("")}</span></div>
      <div class="modes">${MODES.map((x) => `<button type="button" data-m="${x.m}"><span class="art">${x.art}</span><b>${x.t}</b><span class="d">${x.d}</span><i class="go" aria-hidden="true">체험 →</i></button>`).join("")}</div>
      <p class="pick-f">모든 학생과 기록은 체험용 가상 데이터입니다</p>
      ${BOOTH ? '<div class="qr"><img src="assets/qr-trial.svg" alt="체험 주소 QR 코드" width="74" height="74"><span>내 폰으로<br>체험하기</span></div>' : ""}</section>`;
  $$(".pick .lvsw button").forEach((b) => b.addEventListener("click", () => setLevel(b.dataset.lv)));
  $$(".modes button").forEach((b) => b.addEventListener("click", () => {
    if (PHONE && !document.fullscreenElement) toLandscape();   // 폰만: 전체 화면 + 가로 고정 (누르는 순간이어야 허용된다)
    S = { ...fresh(), level: S.level, mode: b.dataset.m };
    go(1);
  }));
}

/* ---------- 1-A · 모바일 수동기록: 수업 중 · 내 폰 ---------- */
const ROW = 46;
function sPhone(root) {
  const L = LV[S.level];
  S.pick = null; S.phoneSec = 0;
  const rows = NAMES.slice(0, L.n).map((n, i) => `<button class="r" data-i="${i}" type="button"><b>${i + 1}</b><span>${n}</span></button>`).join("");
  root.innerHTML = `<section class="stg phonestage"><div class="where"><small>수업 중</small><b>내 폰</b><span>${L.cls} · ${L.period}</span></div>
      <div class="phone"><div class="scr"><div class="ph-status"><span>10:05</span><span>◢ ▮</span></div><div class="ph-kicker">지금 수업 ──</div><div class="ph-now">${L.cls} · ${L.period}</div><div class="ph-lesson">${L.lesson}</div><div class="ph-grow"></div>
        <div class="ph-chips">${L.classes.map((c, i) => `<b class="${i ? "" : "on"}">${c}</b>`).join("")}<span>${L.n}명</span></div>
        <div class="reel" id="reelbox"><div class="plate"></div><div class="sc" id="reel">${rows}</div></div>
        <div class="ph-btns"><button class="memo" type="button" tabindex="-1">메모</button><button class="save" id="psave" type="button">저장 · 3번</button></div></div></div>
      <div class="say"><b>수업 중엔 번호만.</b><span>무엇을 했는지는<br>쉬는 시간에 한 줄.</span></div></section>`;
  const reel = $("#reel"), save = $("#psave"), rs = $$(".r", reel);
  let sel = 2, t0 = 0, saved = false, raf = 0;
  const sync = () => {
    sel = Math.max(0, Math.min(L.n - 1, Math.round(reel.scrollTop / ROW)));
    rs.forEach((r, i) => { r.classList.toggle("sel", i === sel); r.classList.toggle("near", Math.abs(i - sel) === 1); });
    save.textContent = `저장 · ${sel + 1}번`;
  };
  const begin = () => { if (!t0) t0 = performance.now(); };
  reel.scrollTop = sel * ROW;
  // 학생을 고르면(누르거나 굴리면) 안내가 [저장]으로 옮겨 간다. 그 뒤에도 명단은 바꿀 수 있다
  let asked = false, settle = 0;
  const ask = () => { if (asked || saved) return; asked = true; hint("#psave", "저장을 눌러 주세요", { side: "top", allow: "#reelbox" }); };
  reel.addEventListener("scroll", () => {
    cancelAnimationFrame(raf); raf = requestAnimationFrame(sync);
    if (t0 && !asked) { clearTimeout(settle); settle = setTimeout(ask, 350); }
  }, { passive: true });
  timers.push(() => clearTimeout(settle));
  ["pointerdown", "wheel", "touchstart"].forEach((t) => reel.addEventListener(t, begin, { passive: true }));
  rs.forEach((r) => r.addEventListener("click", () => {
    begin();
    reel.scrollTo({ top: Number(r.dataset.i) * ROW, behavior: reduced ? "auto" : "smooth" });
    ask();
  }));
  sync();
  save.addEventListener("click", () => {
    if (saved) return;
    saved = true; hintOff(); sync();
    if (t0) S.phoneSec = (performance.now() - t0) / 1000;
    S.pick = who(sel);
    $(".scr").insertAdjacentHTML("beforeend", `<div class="ph-snack"><span>저장 · ${L.cls} · ${S.pick.no}번</span><i>취소</i></div>`);
    later(() => breakTime(() => go(S.k + 1)), 700);
  });
  later(() => { if (!asked) hint("#reelbox", "수업 중입니다. 눈에 띈 학생을 눌러 주세요", { side: "right", allow: "#psave" }); }, 350);
}

/* ---------- 1-A · 1-C · 쉬는 시간: 교사 PC 화면 ---------- */
function inboxShell(L, auto, man, cls) {
  return `<div class="inbox ${cls}"><div class="ib-h"><b>쉬는 시간 기록</b><span>기억이 남아 있을 때 바로 처리하세요</span><i>미반영 5</i></div>
    <div class="ib-cols"><span>반</span><span>자동 추천 · 수업 녹음</span><span>수동 기록 · 폰 · 워치</span></div>
    <div class="ib-row"><div class="ib-cls"><b>${L.cls}</b>${L.period}<br>${L.time}<br>${L.topic}</div><div class="ib-auto">${auto}</div><div class="ib-man">${man}</div></div></div>`;
}
function sDesk(root) {
  const L = LV[S.level], auto = S.mode === "auto";
  S.boardSeen = false; S.made = false; S.split = false;
  let body;
  if (auto) {
    const s = L.script, p = L.pickLine;
    body = inboxShell(L, `<div class="sg"><div class="sgl"><div class="hd"><b>${s[p][0]}</b><i>${L.sgTag}</i>${catChip(L, L.sgCat, true)}<span class="ti">${L.sgTitle}</span></div>
        <div class="ctx"><span>화자${s[p - 1][1]}: ${s[p - 1][2]}</span><q>${s[p][2]}</q></div><p class="sgn">PC가 수업 녹음에서 고른 발언입니다</p></div>
        <div class="sgr"><div class="who2"><b>누구의 발언인가요?</b><small>명단을 누르면 저장</small><i class="tm" id="tm">0.0초</i></div>${rosterGrid(L)}</div></div>`, "수동 기록 없음", "a");
  } else {
    if (!S.pick || S.pick.i >= L.n) S.pick = who(6);
    body = inboxShell(L, "녹음 없음", entryForm(L, S.pick, "10:05 · 폰"), "m");
  }
  root.innerHTML = `<section class="stg deskstage"><div class="cam ${reduced ? "" : "far"}" id="cam">${monitor(L, body)}${deco()}</div><div class="mon-label big" id="monlabel">교사 PC 화면</div></section>`;
  later(() => $("#cam").classList.remove("far"), 650);   // 책상 위 모니터를 잠깐 보여 준 뒤 줌인
  later(() => $("#monlabel").classList.remove("big"), 1800);
  if (!auto) {
    wireEntry(L, (sec) => timeUp({
      sec, head: `${S.pick.no}번 ${S.pick.name} · 한 줄 기록`,
      sub: S.phoneSec ? `수업 중 폰에서 번호 누르기 <b>${S.phoneSec.toFixed(1)}초</b> + 쉬는 시간 한 줄 <b>${sec.toFixed(1)}초</b> = 모두 <b>${(S.phoneSec + sec).toFixed(1)}초</b>` : "",
    }, () => go(S.k + 1)));
    later(() => hint(".ib-item.man", "예시를 누르거나 한 줄을 써 주세요", { side: "top" }), 2100);
    return;
  }
  // 자동녹음: PC가 고른 발언에 학생만 붙인다. 시간은 카드가 보인 뒤부터 학생을 누를 때까지
  let t1 = 0, tick = 0, fin = false;
  later(() => {
    t1 = performance.now();
    tick = every(() => { const el = $("#tm"); if (el) el.textContent = `${((performance.now() - t1) / 1000).toFixed(1)}초`; }, 100);
    hint(".sg", "PC가 고른 발언입니다. 누구의 말인지 눌러 주세요", { side: "top" });
  }, 2100);
  $$("#roster button").forEach((b) => b.addEventListener("click", () => {
    if (fin) return;
    fin = true; hintOff(); clearInterval(tick);
    const sec = t1 ? (performance.now() - t1) / 1000 : 0;
    S.pick = who(Number(b.dataset.i)); S.sec = sec; S.phoneSec = 0;
    fillMine();
    b.classList.add("on");
    timeUp({ sec, head: `${S.pick.no}번 ${S.pick.name} · 학생 지정`, sub: `${L.cats[L.sgCat]} · ${L.sgMemo}` }, () => go(S.k + 1));
  }));
}

/* ---------- 1-B · 웨일 수동기록: 교탁의 모니터 2대 ---------- */
function sWhale(root) {
  const L = LV[S.level];
  S.pick = null; S.note = ""; S.chip = -1; S.phoneSec = 0; S.boardSeen = false; S.made = false; S.split = false;
  const page = `<div class="wr"><div class="wr-main"><div class="wr-h"><b>${L.cls} · ${L.period}</b><span>${L.lesson}</span><i>웨일 스페이스 명단 그대로 · ${L.n}명</i></div>${rosterGrid(L, "big")}</div>
      <aside class="wr-side" id="wside"><div class="wr-empty"><b>학생을 누르면</b>여기에서 바로 기록합니다<small>보던 화면을 떠나지 않아요</small></div></aside></div>`;
  root.innerHTML = `<section class="stg deskstage two"><div class="cam ${reduced ? "" : "far2"}" id="cam">
        <div class="mon slide"><div class="sl"><small>${L.slide[0]}</small><b>${L.slide[1]}</b><span>${L.slide[2]}</span></div></div>
        <span class="montag t1">수업용 화면<small>교실 TV와 같은 화면</small></span><span class="montag t2">개인 화면<small>웨일 · 누가</small></span>
        ${monitor(L, page, "full")}${deco(true)}</div>
      <div class="mon-label big ${reduced ? "" : "hide"}" id="monlabel">개인 화면 · 웨일</div></section>`;
  later(() => { $("#cam").classList.remove("far2"); $("#monlabel").classList.remove("hide"); }, 1800);   // 두 모니터를 잠깐 보여 준 뒤 개인 화면으로
  later(() => $("#monlabel").classList.remove("big"), 3000);
  later(() => hint("#roster", "명단에서 학생을 눌러 주세요", { side: "top" }), 3300);
  $$("#roster button").forEach((b) => b.addEventListener("click", () => {
    $$("#roster button").forEach((x) => x.classList.toggle("on", x === b));
    S.pick = who(Number(b.dataset.i)); S.chip = -1;
    $("#wside").innerHTML = entryForm(L, S.pick, "지금 · 웨일");
    wireEntry(L, (sec) => timeUp({ sec, head: `${S.pick.no}번 ${S.pick.name} · 한 줄 기록`, sub: "수업용 화면은 그대로, <b>개인 화면에서 바로</b> 기록했습니다" }, () => go(S.k + 1)));
    hint(".ib-item.man", "예시를 누르거나 한 줄을 써 주세요", { side: "left", allow: "#roster" });
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
      <div class="stt"><h3>글로 옮기는 중<small>이름 없이 화자만 구분합니다</small></h3><div class="stt-list" id="stt"></div><p class="stt-f">녹음은 기본 꺼짐 · 학교 승인·안내·동의 후 사용</p></div></section>`;
  let sec = 0;
  every(() => { sec += 9; $("#rclock").textContent = `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`; }, 250);
  L.script.forEach((s, k) => later(() => {
    $("#stt").insertAdjacentHTML("beforeend", `<div class="seg ${s[1] === 1 ? "t1" : ""}"><b class="sp${s[1]}">화자${s[1]}</b><span>${s[2]}</span></div>`);
    if (k === L.script.length - 1) later(() => breakTime(() => go(S.k + 1), "09:50"), 1000);
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
  };
  const ring = () => alerts.forEach((i, k) => later(() => { const c = $(`#c${i}`); c.classList.add("warn"); c.insertAdjacentHTML("beforeend", '<s class="bell">기록이 필요해요</s>'); $(`#p${i}`)?.classList.add("warn"); }, k * 280));
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
  const spent = S.sec + S.phoneSec;
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
    $("#link").innerHTML = pairs().map(([s, r, mine]) => {
      const a = box(s, dpb), b = box(r, dpb);
      const x1 = d.x + d.w, y1 = Math.max(d.y + 8, Math.min(d.y + d.h - 8, a.y + a.h / 2 - draft.scrollTop)), x2 = b.x, y2 = b.y + b.h / 2;
      return `<path class="${mine ? "m" : ""}${still ? " still" : ""}" style="--l:${Math.ceil(Math.hypot(x2 - x1, y2 - y1) * 1.5)}" d="M${x1} ${y1} C${x1 + 18} ${y1},${x2 - 18} ${y2},${x2} ${y2}"/>`;
    }).join("");
  };
  const mark = (ks, rs) => {
    $$("#para .sn").forEach((x) => x.classList.toggle("on", ks.includes(Number(x.dataset.k))));
    $$("#recs .rec").forEach((x) => x.classList.toggle("on", rs.includes(Number(x.dataset.k))));
  };
  const selS = (k) => { cur = ["s", k]; mark([k], D.sens[k].ev); pairs = () => D.sens[k].ev.map((e) => [sn(k), row(e), D.sens[k].mine]); draw(); };
  const selR = (r) => {
    cur = ["r", r];
    let ks = D.sens.map((s, k) => (s.ev.includes(r) && s.ev.length < D.recs.length ? k : -1)).filter((k) => k >= 0);
    if (!ks.length) ks = [D.sens.length - 1];   // 문장에 따로 쓰이지 않은 기록은 마무리 문장으로
    mark(ks, [r]); pairs = () => ks.map((k) => [sn(k), row(r), r === 0]); draw();
  };
  const done = () => {
    S.made = true;
    $("#lenb").style.width = `${Math.min(100, (D.total / 1500) * 100)}%`; $("#lent").textContent = `${D.total.toLocaleString("ko-KR")}/1,500B`;
    $("#split").disabled = false; $("#swl").classList.add("ready");
    $("#dpf").innerHTML = `<p class="dp-msg hit">${spent ? `방금 <b>${spent.toFixed(1)}초</b> 기록이` : "방금 남긴 기록이"} 생기부 <b>한 문장</b>이 됐습니다</p>
      <button class="btn2" id="totalk" type="button">다른 활용 보기 · 상담</button><a class="btn2 fill" href="../">앱 소개 페이지로 →</a>`;
    $("#totalk").addEventListener("click", () => go(S.k + 1));
    $$("#para .sn").forEach((x) => x.addEventListener("click", () => selS(Number(x.dataset.k))));
    $$("#recs .rec").forEach((x) => x.addEventListener("click", () => selR(Number(x.dataset.k))));
    draft.scrollTop = 0;
    selS(D.sens.findIndex((s) => s.mine));
    if (!S.split) later(() => { hint("#swl", "문장별로도 볼 수 있어요", { dim: false, side: "left" }); later(hintOff, 6000); }, 1400);
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
    const tick = every(() => { n += 5; paint(); draft.scrollTop = draft.scrollHeight; if (n >= all) { clearInterval(tick); done(); } }, 16);
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
    draft.innerHTML = `<div class="dl"><i></i><i></i><i></i><i></i><b>초안을 쓰는 중 · 기록 ${D.recs.length}건을 엮고 있어요</b></div>`;
    later(() => typeOut(false), 1100);
  });
  later(() => hint("#gen", "생성을 눌러 주세요", { side: "top" }), 500);
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
      hint("#nuga", "막연한 말뿐입니다. 누가기록을 꺼내 보세요", { side: "left" });
      return;
    }
    say("l", fill(T.after), "happy");
    $("#tkact").innerHTML = '<a class="cta" href="../">앱 소개 페이지로 <span aria-hidden="true">→</span></a>';
    $("#replay").hidden = false;
  };
  $("#tnext").addEventListener("click", next);
  $("#nuga").addEventListener("click", () => {
    hintOff();
    $("#nuga").hidden = true;
    $(".talk2").classList.add("answered");
    $("#evs").innerHTML = `<p>누가에 쌓인 ${esc(name)}의 기록</p>` + evRecs.map((r, k) => `<div class="evc" style="animation-delay:${k * 0.18}s">${catChip(L, r[0])}<time>${r[1]}</time><span>${esc(r[2])}</span></div>`).join("");
    later(() => { say("t", `<small>누가 기록 ${evRecs.length}건으로</small>${T.answer} ${T.tail} <mark>“${esc(S.note)}”</mark>`, "good"); $("#tnext").hidden = false; }, 800);
  });
  $("#replay").addEventListener("click", () => go(S.k, true));
  later(next, 300);
}

go(0);
touch();
