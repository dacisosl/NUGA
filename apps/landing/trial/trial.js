// 누가 체험 페이지: 장면 10개를 차례로 그린다. 학생·기록·대본은 모두 체험용 합성 데이터이고 AI·서버를 부르지 않는다.
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const stage = $("#stage"), scene = $("#scene"), guideEl = $("#guide"), nextBtn = $("#next"), prevBtn = $("#prev"), curtainEl = $("#curtain");
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const bytes = (t) => [...t].reduce((n, c) => n + (c.charCodeAt(0) > 127 ? 3 : 1), 0);
const LOGO = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 25h7v-7h7v-7h8" fill="none" stroke="currentColor" stroke-width="3"/></svg>';

/* ---------- 무대 맞춤 ---------- */
let SCALE = 1;
function fit() {
  SCALE = Math.min(innerWidth / 960, innerHeight / 540);
  stage.style.transform = `scale(${SCALE})`;
  stage.style.left = `${(innerWidth - 960 * SCALE) / 2}px`;
  stage.style.top = `${(innerHeight - 540 * SCALE) / 2}px`;
}
addEventListener("resize", fit); addEventListener("orientationchange", fit); fit();

/* 세로 화면의 [가로로 돌리기]: 전체 화면으로 바꾸고 가로로 고정한다. 아이폰처럼 지원하지 않으면 직접 돌려 달라고 안내 */
async function toLandscape() {
  const el = document.documentElement;
  try {
    if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" });
    await screen.orientation.lock("landscape");
    return true;
  } catch { return false; }
}
$("#rotbtn").addEventListener("click", async () => {
  const ok = await toLandscape();
  if (!ok) { $("#rotmsg").textContent = "이 기기는 자동으로 돌릴 수 없어요. 휴대폰을 직접 가로로 돌려 주세요. (화면 자동 회전을 켜 주세요)"; $("#rotmsg").classList.add("warn"); }
});

/* ---------- 데이터 (합성) ---------- */
const NAMES = ["홍도윤", "류지아", "주시우", "용아린", "여재원", "윤수아", "모서아", "권태윤", "국동현", "왕승현", "이태윤", "금이준", "공이준", "설유진", "윤하준", "한예서", "기지아", "문민준", "허서아", "황재원", "허소율", "편예린", "기정우", "손시우", "임다은", "석예은"];
const LV = {
  elem: {
    label: "초등", area: "4학년 2반", cls: "4-2", classes: ["4-2"], n: 24, period: "2교시", time: "09:50–10:30", lesson: "국어 · 의견을 나누어요", topic: "토의하기",
    cats: ["학습태도", "발표", "관계", "생활"], item: "행동특성 및 종합의견", ask: "행동특성 써 줘",
    use: [
      ["학교생활기록부", "행동특성 및 종합의견, 교과 발달상황", "<s>성실하고 배려심이 많음</s> → <em>9월 모둠 활동에서 친구의 의견을 끝까지 듣고 정리해 줌</em>"],
      ["학부모 상담", "막연한 인상이 아니라 실제 장면으로", "<s>친구들과 잘 지냅니다</s> → <em>지난주 급식 당번을 끝까지 책임 있게 마무리했습니다</em>"],
      ["학생 피드백", "쌓인 기록으로 아이마다 다른 다음 걸음", "<em>틀린 문제를 스스로 다시 풀어 본 점이 좋았어요. 다음엔 친구에게 설명해 볼까요?</em>"],
    ],
    hard: [["시간 부족", "한 반, 여러 교과. 수업을 멈추고 적을 수는 없다"], ["여유 부족", "쉬는 시간에도 아이들 곁을 떠날 수 없다"], ["깜빡", "하교 지도까지 마치면 누가 무엇을 했는지 흐려진다"]],
    chips: [
      { t: "토의에서 친구 의견을 끝까지 듣고 자기 생각을 덧붙임", c: 1, s: "토의에서 친구의 의견을 끝까지 듣고 자신의 생각을 덧붙이며 함께 생각을 키워 가는 모습을 보임." },
      { t: "모둠 준비물을 스스로 챙겨 친구들에게 나눠 줌", c: 3, s: "모둠 준비물을 스스로 챙겨 나누어 주는 등 주변을 살피는 따뜻한 마음이 드러남." },
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
    recs: [[2, "09/04", "모둠 활동에서 친구의 의견을 끝까지 듣고 정리해 줌"], [0, "09/11", "수학 시간에 틀린 문제를 스스로 다시 풀어 봄"], [3, "09/18", "교실 화분 물 주기를 맡아 한 주 동안 빠짐없이 챙김"], [1, "09/25", "과학 실험 결과를 그림으로 그려 발표"], [2, "09/30", "다툰 친구에게 먼저 다가가 사과하고 화해함"], [3, "10/05", "급식 당번을 맡아 끝까지 책임 있게 마무리"], [1, "10/14", "국어 시간에 자신의 경험을 들어 의견을 또박또박 발표"]],
    sens: [
      ["모둠 활동에서 친구의 의견을 끝까지 듣고 정리해 주며, 다툰 친구에게 먼저 다가가 사과하고 화해하는 등 친구를 존중하고 관계를 소중히 여기는 마음이 돋보임.", [0, 4]],
      ["틀린 문제를 스스로 다시 풀어 보고 실험 결과를 그림으로 그려 발표하는 등 스스로 배우고 표현하려는 태도가 꾸준히 자라고 있음.", [1, 3]],
      ["교실 화분 물 주기와 급식 당번을 끝까지 해내며 맡은 일을 소중히 여기는 책임감을 보여 줌.", [2, 5]],
      ["자신의 경험을 들어 의견을 또박또박 발표하며 생각을 말로 표현하는 자신감이 커짐.", [6]],
    ],
    close: "배려와 책임감, 스스로 배우려는 태도가 고르게 자라고 있어 앞으로의 성장이 더욱 기대되는 학생임.",
    batch: ["수학 시간에 자신의 풀이를 친구에게 차근차근 설명하며…", "모둠 역할을 스스로 정하고 끝까지 맡은 일을 해내는…", "궁금한 점을 바로 질문하며 수업에 적극적으로 참여하는…", "친구의 발표를 귀 기울여 듣고 좋은 점을 찾아 말해 주는…", "정리 시간에 먼저 나서서 교실을 정돈하는 등…"],
    talkWho: "학부모 상담",
    talk: {
      left: "parent", leftName: "학부모님", teacher: "teacherF", teacherName: "담임 선생님",
      lines: [["l", "선생님, 우리 아이 {name}, 학교에서 친구들과 잘 지내나요?"], ["t", "네, 친구들과 두루 잘 지내요. 걱정 안 하셔도 됩니다."], ["l", "다행이네요. 그런데 구체적으로 어떤 모습인지 궁금해요."], ["t", "음… 그게… 늘 밝게 잘 지내는 편이에요."]],
      ev: [0, 4], answer: "<mark>9월 4일 모둠 활동</mark>에서 친구의 의견을 끝까지 듣고 정리해 주었어요. <mark>9월 30일</mark>에는 다툰 친구에게 먼저 다가가 사과하고 화해했고요.", tail: "오늘 수업 기록에도 남아 있어요.",
      after: "아, 그런 모습이 있었군요! 집에서도 꼭 칭찬해 줄게요.",
    },
    qs: [
      { q: "우리 아이가 친구들과 잘 지내나요?", off: "네, 친구들과 두루 잘 지내고 있습니다. 걱정하지 않으셔도 됩니다.", on: "네. <mark>9월 4일 모둠 활동</mark>에서 친구의 의견을 끝까지 듣고 정리해 주었고, <mark>9월 30일</mark>에는 다툰 친구에게 먼저 다가가 사과하고 화해했습니다.", ev: [0, 4], mine: true },
      { q: "수업 시간에는 어떤가요?", off: "수업 태도도 좋은 편입니다.", on: "<mark>9월 11일 수학 시간</mark>에 틀린 문제를 스스로 다시 풀어 보았고, <mark>9월 25일</mark>에는 과학 실험 결과를 그림으로 그려 발표했습니다. 스스로 해 보려는 태도가 자라고 있습니다.", ev: [1, 3] },
    ],
  },
  mid: {
    label: "중·고등", area: "화학Ⅰ", cls: "2-3", classes: ["2-3", "2-5"], n: 26, period: "2교시", time: "09:50–10:40", lesson: "화학 평형 · 탐구 발표", topic: "탐구 발표",
    cats: ["질문", "발표", "협동", "탐구"], item: "세부능력 및 특기사항", ask: "세특 만들어 줘",
    use: [
      ["학교생활기록부", "세특 · 행동특성 및 종합의견", "<s>수업 참여도가 높음</s> → <em>평형 이동을 온도 실험 결과와 연결해 질문함</em>"],
      ["학생 · 학부모 상담", "막연한 인상이 아니라 실제 장면으로", "<s>수업 태도가 좋습니다</s> → <em>지난 발표에서 평형 상수를 모형과 그림으로 풀어냈습니다</em>"],
      ["학생 피드백", "쌓인 기록으로 학생마다 다른 다음 걸음", "<em>그래프에서 평형 도달 시점을 찾아낸 점이 좋았어요. 다음엔 실험 설계까지 해 볼까요?</em>"],
    ],
    hard: [["시간 부족", "수업 진도와 활동 진행. 멈추고 적을 수는 없다"], ["여유 부족", "쉬는 시간 10분, 다음 반 수업 준비가 먼저다"], ["깜빡", "여러 반 수업을 마치면 누가 무슨 말을 했는지 흐려진다"]],
    chips: [
      { t: "르샤틀리에 원리를 온도 실험 결과와 연결해 질문함", c: 0, s: "르샤틀리에 원리를 온도 실험 결과와 연결해 질문하는 등 배운 개념을 실제 현상에 적용해 보려는 탐구적 태도를 보임." },
      { t: "모둠 실험에서 데이터 기록을 맡아 끝까지 정리함", c: 2, s: "모둠 실험에서 데이터 기록을 맡아 끝까지 정리하며 맡은 역할에 대한 책임감을 보여 줌." },
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
    recs: [[2, "09/04", "농도와 반응 속도 모둠 토의에서 의견을 정리하고 조율"], [3, "09/11", "반응 속도 그래프를 읽고 평형 도달 시점을 찾아 설명"], [0, "09/16", "촉매가 평형 상수를 바꾸지 않는 이유를 질문"], [1, "09/25", "평형 상수를 모형과 그림으로 표현하여 발표"], [3, "09/30", "산·염기 평형 보고서에서 자료 정리를 주도"], [2, "10/05", "완충 용액 퀴즈 활동에서 모둠원에게 풀이를 설명"], [0, "10/14", "용해 평형을 실생활 사례에 적용할 수 있는지 질문"]],
    sens: [
      ["농도와 반응 속도 모둠 토의에서 의견을 정리하고 조율하였고, 완충 용액 퀴즈 활동에서 모둠원에게 풀이를 설명하는 등 동료와 협력하며 공동 활동에 기여하는 태도가 돋보임.", [0, 5]],
      ["반응 속도 그래프에서 평형 도달 시점을 찾아 설명하고, 평형 상수를 모형과 그림으로 표현하여 발표하는 과정에서 추상적인 개념을 구체화하는 능력이 드러남.", [1, 3]],
      ["촉매가 평형 상수를 바꾸지 않는 이유와 용해 평형의 실생활 적용 가능성을 질문하는 등 배운 내용을 넓혀 가려는 탐구적 태도를 보임.", [2, 6]],
      ["산·염기 평형 보고서 작성에서 자료 정리를 주도하며 탐구 결과를 체계적으로 정리함.", [4]],
    ],
    close: "협력적 태도와 개념을 구조화하는 능력, 탐구하려는 자세가 고르게 드러나는 성실한 학습자임.",
    batch: ["산·염기 평형 보고서 작성에서 자료 정리를 주도하며…", "용해 평형을 실생활 사례에 적용할 수 있는지 질문하며…", "평형 상수에 대한 조사 내용을 사례와 함께 발표하는…", "온도와 촉매 활동에서 모둠원의 오개념을 바로잡아 주는…", "반응 지수 개념 지도를 스스로 그려 정리하는 등…"],
    talkWho: "학생 · 학부모 상담",
    talk: {
      left: "student", leftName: "학생", teacher: "teacherM", teacherName: "화학 선생님",
      lines: [["l", "선생님, 화학 쪽 진로를 생각하는데 제 강점이 뭘까요?"], ["t", "수업 태도가 좋으니까 열심히 하면 잘할 거야."], ["l", "음… 구체적으로 제가 뭘 잘하는지 알고 싶어요."], ["t", "그러니까… 전반적으로 성실한 편이야."]],
      ev: [1, 3], answer: "<mark>9월 11일</mark>에 그래프에서 평형 도달 시점을 찾아 설명했고, <mark>9월 25일</mark>에는 평형 상수를 모형과 그림으로 표현해 발표했지. 추상적인 개념을 눈에 보이게 풀어내는 게 네 강점이야.", tail: "오늘 수업 기록에도 있단다.",
      after: "제가 그런 걸 잘했군요! 다음엔 실험 설계까지 도전해 볼게요.",
    },
    qs: [
      { q: "(학부모) 아이가 수업에 잘 참여하고 있나요?", off: "네, 수업에 성실하게 참여하고 있습니다. 크게 걱정하지 않으셔도 됩니다.", on: "네. <mark>9월 4일 모둠 토의</mark>에서는 의견을 정리하고 조율하는 역할을 맡았고, <mark>10월 5일 퀴즈 활동</mark>에서는 모둠원에게 풀이를 설명해 주었습니다.", ev: [0, 5], mine: true },
      { q: "(학생) 화학 쪽 진로를 생각하는데, 제 강점이 뭘까요?", off: "평소 수업 태도가 좋으니 열심히 하면 잘할 수 있을 거예요.", on: "<mark>9월 11일</mark>에 그래프에서 평형 도달 시점을 찾아 설명했고, <mark>9월 25일</mark>에는 평형 상수를 모형과 그림으로 표현해 발표했어요. 추상적인 개념을 눈에 보이게 풀어내는 게 강점이에요. 다음에는 실험 설계까지 도전해 봅시다.", ev: [1, 3] },
    ],
  },
};
const ICON = [
  '<svg viewBox="0 0 48 48"><path d="M12 6h18l8 8v28H12z"/><path d="M30 6v8h8M18 24h14M18 31h14M18 17h6"/></svg>',
  '<svg viewBox="0 0 48 48"><path d="M6 10h26v18H18l-8 7v-7H6z"/><path d="M22 34h12l6 5v-5h4V20h-6"/></svg>',
  '<svg viewBox="0 0 48 48"><path d="M6 40h9v-9h9v-9h9v-9h9"/><circle cx="14" cy="14" r="5"/><path d="M12 14l2 2 3-4"/></svg>',
];
const HARD_ICON = [
  '<svg viewBox="0 0 48 48"><circle cx="24" cy="26" r="15"/><path d="M24 17v9l6 4M19 5h10"/></svg>',
  '<svg viewBox="0 0 48 48"><path d="M8 38c4-12 8-18 16-18s12 6 16 18"/><circle cx="24" cy="12" r="6"/><path d="M4 22l6 2M44 22l-6 2"/></svg>',
  '<svg viewBox="0 0 48 48"><path d="M10 34c-4-3-4-10 1-13 0-7 6-11 12-9 4-5 13-3 14 4 6 2 7 11 1 14"/><path d="M18 40h2M24 40h2M30 40h2"/></svg>',
];

/* ---------- 진행 ---------- */
const fresh = () => ({ i: 0, level: null, pick: null, note: "", noteCat: 0, chip: -1, auto: null });
let S = fresh();
let timers = [];
const later = (fn, ms) => { const t = setTimeout(fn, reduced ? Math.min(ms, 60) : ms); timers.push(() => clearTimeout(t)); return t; };
const every = (fn, ms) => { const t = setInterval(fn, ms); timers.push(() => clearInterval(t)); return t; };
function clearAll() { timers.forEach((f) => f()); timers = []; curtainEl.classList.remove("on"); }
function guide(text, done) { guideEl.textContent = text; guideEl.classList.toggle("done", !!done); nextBtn.classList.toggle("glow", !!done); }
function curtain(text, fn) {
  curtainEl.textContent = text; curtainEl.classList.add("on");
  later(() => { fn(); later(() => curtainEl.classList.remove("on"), 650); }, 480);
}
/** 앞 장면을 건너뛰고 와도 뒤 장면이 돌아가게 기본값을 채운다 */
function ensure() {
  const L = LV[S.level];
  if (!S.pick) S.pick = { i: 13, no: 14, name: NAMES[13] };
  if (!S.note) { S.note = L.chips[0].t; S.noteCat = L.chips[0].c; S.chip = 0; }
  if (!S.auto) S.auto = { i: 23, no: 24, name: NAMES[23] };
  return L;
}

const SC = [
  { id: "start", title: "", render: sStart },
  { id: "level", title: "학교급 선택", render: sLevel },
  { id: "value", title: "기록의 중요성", render: sValue },
  { id: "use", title: "기록의 쓰임", render: sUse },
  { id: "hard", title: "기록이 어려운 이유", render: sHard },
  { id: "manual", title: "기록 방법 1 · 간편 기록", render: sManual },
  { id: "whale", title: "웨일 연계 · 수업 화면에서 바로 기록", render: sWhale },
  { id: "auto", title: "기록 방법 2 · 자동 기록", render: sAuto },
  { id: "apply", title: "기록의 활용 · 대시보드와 생기부", render: sApply },
  { id: "talk", title: "기록의 활용 · 상담", render: sTalk },
  { id: "end", title: "", render: sEnd },
];
$("#dots").innerHTML = SC.slice(1, -1).map(() => "<li></li>").join("");

/** fromHistory = 브라우저 뒤로·앞으로(휴대폰 뒤로 버튼·쓸어 넘기기)로 온 경우. 그 밖에는 장면마다 기록을 남겨 뒤로 가기가 이전 장면이 되게 한다 */
function go(i, fromHistory) {
  i = Math.max(0, Math.min(SC.length - 1, i));
  if (i >= 2 && !S.level) i = 1;
  clearAll();
  $("#timeup")?.remove();
  sceneNext = null;
  if (!fromHistory) { if (i === 0) history.replaceState({ i: 0 }, ""); else if (history.state?.i !== i) history.pushState({ i }, ""); }
  S.i = i;
  const sc = SC[i];
  stage.dataset.scene = sc.id;
  $("#title").textContent = sc.title;
  $("#timer").hidden = sc.id !== "manual";
  $("#timer").classList.remove("stop"); $("#timer-v").textContent = "0.0";
  $("#lv").hidden = !S.level; if (S.level) $("#lv").textContent = `${LV[S.level].label} 선생님`;
  $$("#dots li").forEach((d, k) => { d.className = k + 1 < i ? "past" : k + 1 === i ? "now" : ""; });
  prevBtn.disabled = i < 1;
  nextBtn.disabled = i === 1 && !S.level;
  nextBtn.innerHTML = i === SC.length - 2 ? '마무리 <span aria-hidden="true">→</span>' : '다음 <span aria-hidden="true">→</span>';
  guide("");
  scene.innerHTML = "";
  sc.render(scene);
}
function reset() { S = fresh(); go(0); }
/** [이전] = 브라우저 뒤로 가기와 같은 길 (지나온 장면으로). 기록이 없으면 바로 앞 장면 */
function back() { if (history.state?.i > 0) history.back(); else go(S.i - 1); }
/** 장면이 [다음] 버튼을 잠시 빌려 쓸 때 (상담 장면의 '다음 대화'). go() 가 장면을 바꿀 때마다 비운다 */
let sceneNext = null;
nextBtn.addEventListener("click", () => (sceneNext ? sceneNext() : go(S.i + 1)));
prevBtn.addEventListener("click", back);
addEventListener("popstate", (e) => go(e.state?.i ?? 0, true));
$("#home").addEventListener("click", reset);
addEventListener("keydown", (e) => {
  if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName) || S.i === 0) return;
  if (e.key === "ArrowRight") go(S.i + 1);
  if (e.key === "ArrowLeft") back();
});
// 부스용: 90초 동안 손대지 않으면 처음 화면으로
let idle = 0;
const touch = () => { clearTimeout(idle); idle = setTimeout(() => { if (S.i > 0) reset(); }, 90000); };
["pointerdown", "keydown", "input", "wheel", "touchstart"].forEach((t) => addEventListener(t, touch, { passive: true }));

/* ---------- 1 · 시작 ---------- */
const heroBg = () => reduced ? '<img class="bg" src="../assets/growth-poster.png" alt="">' : '<video class="bg" muted loop playsinline autoplay poster="../assets/growth-poster.png"><source src="../assets/growth-motion.mp4" type="video/mp4"></video>';
function sStart(root) {
  root.innerHTML = `<section class="hero">${heroBg()}<div class="shade"></div><div class="copy">
    <p class="eyebrow">누가 · 체험</p>
    <h2>수업 중 빛나는 순간을,<br><em>가장 선명할 때</em> 기록합니다.</h2>
    <button class="cta blink" id="start" type="button">체험하기 <span aria-hidden="true">→</span></button>
    <ul class="notes"><li>화면 안내를 따라가시면 자연스럽게 체험하실 수 있도록 준비했습니다. (약 5분)</li><li>체험 속 폰 화면은 수업 중 교사가 들고 있는 폰·워치·웨일북 역할입니다.</li><li>모든 학생과 기록은 체험용 가상 데이터입니다.</li></ul>
    <a class="link" href="../app/">체험 없이 앱 시작하기</a></div></section>`;
  $("#start").addEventListener("click", () => {
    // 폰·태블릿이면 전체 화면 + 가로 고정을 시도한다 (되는 기기만)
    if (matchMedia("(pointer: coarse)").matches) toLandscape();
    go(1);
  });
}

/* ---------- 2 · 학교급 ---------- */
function sLevel(root) {
  root.innerHTML = `<section class="q"><h2>어느 학교급 선생님이신가요?</h2><p class="sub">고르신 학교급에 맞춰 설명과 사례가 바뀝니다.</p>
    <div class="circles">
      <button type="button" data-lv="elem" class="${S.level === "elem" ? "on" : ""}"><span class="pic"><img src="assets/level-elem.webp" alt="" width="730" height="880"></span><span class="txt"><b>초등</b><span>담임 · 한 반, 여러 교과</span><small>학습태도 · 발표 · 관계 · 생활</small></span><i class="go" aria-hidden="true">선택 →</i></button>
      <button type="button" data-lv="mid" class="${S.level === "mid" ? "on" : ""}"><span class="pic"><img src="assets/level-mid.webp" alt="" width="730" height="880"></span><span class="txt"><b>중·고등</b><span>교과 · 여러 반</span><small>질문 · 발표 · 협동 · 탐구</small></span><i class="go" aria-hidden="true">선택 →</i></button>
    </div></section>`;
  guide("학교급을 눌러 주세요");
  $$(".circles button").forEach((b) => b.addEventListener("click", () => {
    // 시작 화면을 건너뛰고 들어온 폰이면 여기서 전체 화면 + 가로 고정을 시도한다 (누르는 순간이어야 허용됨)
    if (matchMedia("(pointer: coarse)").matches && !document.fullscreenElement) toLandscape();
    const keep = S.level === b.dataset.lv;
    S = { ...(keep ? S : fresh()), level: b.dataset.lv, i: 1 };
    $$(".circles button").forEach((x) => x.classList.toggle("on", x === b));
    later(() => go(2), 260);
  }));
}

/* ---------- 3 · 기록의 중요성 (슬라이드 바) ---------- */
function sValue(root) {
  const words = ["솔직히, 없어도 수업은 됩니다", "있으면 좋지만 늘 뒤로 밀려요", "중요하다는 건 알고 있어요", "평가와 상담에 꼭 필요해요", "기록이 없으면 근거도 없어요"];
  root.innerHTML = `<section class="q"><p class="eyebrow">질문 1</p><h2>기록, <em>얼마나 중요하다</em>고 생각하세요?</h2>
    <div class="meter"><div class="bars">${[30, 60, 90, 120, 150].map((h) => `<i style="height:${h}px"></i>`).join("")}</div><output id="out"><small>5</small>${words[2]}</output></div>
    <div class="range"><input id="rng" type="range" min="1" max="10" step="1" value="5" aria-label="기록의 중요도 (1~10)"><div class="ends"><span>1 · 없어도 된다</span><span>10 · 없으면 안 된다</span></div></div>
    <p class="reveal" id="rev"></p></section>`;
  guide("슬라이드 바를 움직여 생각하시는 만큼 놓아 주세요");
  const rng = $("#rng"), bars = $$(".bars i");
  const draw = () => {
    const v = Number(rng.value), k = Math.min(4, Math.floor((v - 1) / 2));   // 1~2 · 3~4 · 5~6 · 7~8 · 9~10
    bars.forEach((b, i) => b.classList.toggle("on", i <= k));
    $("#out").innerHTML = `<small>${v}</small>${words[k]}`;
  };
  draw();
  rng.addEventListener("input", () => {
    draw();
    $("#rev").innerHTML = "어디에 두셨든, 기록은 <b>과정 중심 평가의 핵심</b>입니다.<br>학생의 성장은 기록으로만 남습니다.";
    guide("기록이 어디에 쓰이는지 보러 갑니다. [다음]을 눌러 주세요", true);
  });
}

/* ---------- 4 · 기록의 쓰임 ---------- */
function sUse(root) {
  const L = LV[S.level];
  root.innerHTML = `<section class="q"><p class="eyebrow">질문 2</p><h2>기록은 <em>어디에</em> 쓰일까요?</h2><p class="sub">쓰고 계신 곳을 모두 눌러 보세요. ${L.label} 사례가 열립니다.</p>
    <div class="picks">${L.use.map((u, i) => `<button class="pick" type="button">${ICON[i]}<i class="ck">✓</i><b>${u[0]}</b><span>${u[1]}</span><span class="more">${u[2]}</span></button>`).join("")}</div>
    <div class="answer"><p id="ans"></p></div></section>`;
  guide("카드를 눌러 보세요 (여러 개 선택)");
  $$(".pick").forEach((p) => p.addEventListener("click", () => {
    p.classList.toggle("on");
    const n = $$(".pick.on").length;
    $("#ans").innerHTML = n ? `막연한 인상 대신 <b>실제 수업 장면</b>. 기록이 있어야 가능한 말입니다.` : "";
    guide(n ? "그런데 왜 기록은 어려울까요? [다음]을 눌러 주세요" : "카드를 눌러 보세요 (여러 개 선택)", n > 0);
  }));
}

/* ---------- 5 · 기록이 어려운 이유 ---------- */
function sHard(root) {
  const L = LV[S.level];
  root.innerHTML = `<section class="q"><p class="eyebrow">질문 3</p><h2>그런데, 기록은 <em>왜 어려울까요?</em></h2><p class="sub">공감되는 것을 모두 눌러 보세요.</p>
    <div class="picks">${L.hard.map((u, i) => `<button class="pick" type="button">${HARD_ICON[i]}<i class="ck">✓</i><b>${u[0]}</b><span>${u[1]}</span></button>`).join("")}</div>
    <div class="answer" id="ansbox" hidden><p>그래서 누가는 <b>가장 선명한 순간에, 10초면</b> 기록되게 했습니다.</p><button class="cta blink" id="begin" type="button">기록 체험 시작 <span aria-hidden="true">→</span></button></div></section>`;
  guide("공감되는 이유를 눌러 보세요 (여러 개 선택)");
  $$(".pick").forEach((p) => p.addEventListener("click", () => {
    p.classList.toggle("on");
    const n = $$(".pick.on").length;
    $("#ansbox").hidden = !n;
    guide(n ? "[기록 체험 시작]을 눌러 주세요" : "공감되는 이유를 눌러 보세요 (여러 개 선택)", n > 0);
  }));
  $("#begin").addEventListener("click", () => go(S.i + 1));
}

/* ---------- 앱 화면 조각: 교사 PC · 폰 ---------- */
const catChip = (L, c, on) => `<span class="cat c${c} ${on ? "on" : ""}" data-c="${c}">${L.cats[c]}</span>`;
function pc(L, inner, pending) {
  return `<div class="pc"><div class="pc-nav"><span class="lg">${LOGO}누가</span><span class="ar">${L.area}</span><span class="g"></span><span class="nb w">미반영<b id="pend">${pending}</b></span><span class="nb">일괄 기록 +</span><span class="nb">✓ 저장</span><span class="nb">생기부 생성</span></div><div class="pc-sheet" id="sheet">${inner}</div></div>`;
}
/** 현황판: 반 탭 · 요약 · 학생 카드 3장 (가운데가 고른 학생). added = 방금 더한 한 줄 */
function desk(L, pick, added) {
  const mid = Math.min(L.n - 2, Math.max(1, pick ? pick.i : 13));
  const card = (i) => {
    if (pick && i === pick.i) {
      const lines = L.recs.slice(-2).reverse().map((r) => `<p>${r[1]} ${r[2]}</p>`).join("");
      return `<div class="scard ${added ? "hit" : ""}" id="mycard"><h4>${NAMES[i]}</h4><div class="m">${String(i + 1).padStart(2, "0")}번 · 기록 ${L.recs.length + (added ? 1 : 0)}건</div>${added ? `<p class="new">오늘 ${esc(added)}</p>` : ""}${lines}</div>`;
    }
    return i % 3 === 0
      ? `<div class="scard low"><h4>${NAMES[i]}</h4><div class="m">${String(i + 1).padStart(2, "0")}번 · 기록 1건<i>기록 부족</i></div><p>${L.recs[1][1]} ${L.recs[1][2]}</p></div>`
      : `<div class="scard"><h4>${NAMES[i]}</h4><div class="m">${String(i + 1).padStart(2, "0")}번 · 기록 3건</div><p>${L.recs[3][1]} ${L.recs[3][2]}</p><p>${L.recs[0][1]} ${L.recs[0][2]}</p></div>`;
  };
  return `<div class="desk"><div class="tabs">${L.classes.map((c, i) => (i ? `<span>${c}</span>` : `<b>${c}</b>`)).join("")}</div>
    <div class="statbar"><div><small>평균</small><b>2.3<i>건</i></b></div><div class="o"><small>출발선</small><b>3<i>명</i></b></div><div><small>이번 주 기록</small><b>${added ? 2 : 1}<i>/${L.n}명</i></b></div><div class="o"><small>기록 부족</small><b>9<i>명</i></b></div></div>
    <div class="cards">${card(mid - 1)}${card(mid)}${card(mid + 1)}</div></div>`;
}
function inbox(L, auto, man, pending, kind) {
  return `<div class="veil"></div><div class="inbox" id="inbox"><div class="ib-h"><b>쉬는 시간 기록</b><span>기억이 남아 있을 때 바로 처리하세요</span><i>미반영 ${pending}</i></div>
    <div class="ib-cols ${kind}"><span>반</span><span>자동 추천 · 수업 녹음</span><span>수동 기록 · 폰 · 워치</span></div>
    <div class="ib-row ${kind}"><div class="ib-cls"><b>${L.cls}</b>${L.period}<br>${L.time}<br>${L.topic}</div><div class="ib-auto">${auto}</div><div class="ib-man">${man}</div></div>
    <div class="ib-f"><kbd>Enter</kbd> 저장 · 번호를 누르면 추천이 바로 기록됩니다<span class="g"></span><span class="b">닫기</span></div></div>`;
}
const ROW = 32;
function phoneRecord(L) {
  const rows = NAMES.slice(0, L.n).map((n, i) => `<button class="r" data-i="${i}" type="button"><b>${i + 1}</b><span>${n}</span></button>`).join("");
  return `<div class="phone"><div class="scr"><div class="ph-status"><span>10:05</span><span>◢ ▮</span></div><div class="ph-kicker">지금 수업 ──</div><div class="ph-now">${L.cls} · ${L.period}</div><div class="ph-lesson">${L.lesson}</div><div class="ph-grow"></div>
    <div class="ph-chips">${L.classes.map((c, i) => `<b class="${i ? "" : "on"}">${c}</b>`).join("")}<span>${L.n}명</span></div>
    <div class="reel"><div class="plate"></div><div class="sc" id="reel">${rows}</div></div>
    <div class="ph-btns"><button class="memo" type="button" tabindex="-1">메모</button><button class="save" id="psave" type="button">저장 · 1번</button></div></div></div>`;
}

/* ---------- 6 · 간편 기록 ---------- */
function sManual(root) {
  const L = LV[S.level];
  S.pick = null; S.note = ""; S.chip = -1;
  root.innerHTML = `<section class="split"><div id="colp">${phoneRecord(L)}<p class="cap">수업 중 · 교사의 폰 (워치 · 웨일북)</p></div><div id="colc">${pc(L, desk(L, null), 4)}<p class="cap">교무실 · 교사 PC</p></div></section>`;
  guide("폰에서 번호를 굴려 학생을 고르고 [저장]을 눌러 주세요");
  const reel = $("#reel"), save = $("#psave"), rows = $$(".r", reel);
  let sel = 0, t0 = 0, tick = 0, saved = false, phoneSec = 0;
  const sync = () => {
    sel = Math.max(0, Math.min(L.n - 1, Math.round(reel.scrollTop / ROW)));
    rows.forEach((r, i) => { r.classList.toggle("sel", i === sel); r.classList.toggle("near", Math.abs(i - sel) === 1); });
    save.textContent = `저장 · ${sel + 1}번`;
  };
  const startTimer = () => {
    if (t0 || saved) return;
    t0 = performance.now(); save.classList.add("glow");
    tick = every(() => { $("#timer-v").textContent = ((performance.now() - t0) / 1000).toFixed(1); }, 100);
  };
  let raf = 0;
  reel.addEventListener("scroll", () => { if (reel.scrollTop > 2) startTimer(); cancelAnimationFrame(raf); raf = requestAnimationFrame(sync); }, { passive: true });
  rows.forEach((r) => r.addEventListener("click", () => { startTimer(); reel.scrollTo({ top: Number(r.dataset.i) * ROW, behavior: reduced ? "auto" : "smooth" }); }));
  sync();

  save.addEventListener("click", () => {
    if (saved) return;
    saved = true; sync(); clearInterval(tick);
    if (t0) { phoneSec = (performance.now() - t0) / 1000; $("#timer-v").textContent = phoneSec.toFixed(1); $("#timer").classList.add("stop"); }
    save.classList.remove("glow");
    S.pick = { i: sel, no: sel + 1, name: NAMES[sel] };
    $(".scr").insertAdjacentHTML("beforeend", `<div class="ph-snack"><span>저장 · ${L.cls} · ${S.pick.no}번</span><i>취소</i></div>`);
    $("#sheet").innerHTML = desk(L, S.pick) + `<div class="pc-toast">폰 기록 1건 도착<small>${L.cls} · ${S.pick.no}번 ${S.pick.name} · 10:05</small></div>`;
    $("#pend").textContent = "5";
    guide(`${t0 ? "번호만 눌렀는데 벌써 PC에 도착했습니다. " : ""}이제 수업이 끝났습니다`);
    later(() => {
      $("#colc .pc").insertAdjacentHTML("beforeend", '<button class="back" id="back" type="button">수업 마치고 자리로 돌아가기 ▶</button>');
      guide("[수업 마치고 자리로 돌아가기]를 눌러 주세요");
      $("#back").addEventListener("click", () => curtain("쉬는 시간 · 교무실 자리로", atDesk));
    }, 900);
  });

  function atDesk() {
    $("#back")?.remove();
    $("#colp").classList.add("dim");
    const man = `<div class="ib-item man"><div class="t">${S.pick.no} ${S.pick.name}<span>10:05 · 폰</span></div>
      <textarea id="note" placeholder="무엇을 했는지 한 줄 (Enter 저장)" maxlength="80"></textarea>
      <div class="catrow" id="cats">${L.cats.map((_, c) => catChip(L, c, c === 0)).join("")}</div>
      <div class="ib-act"><button class="b p" id="nsave" type="button" disabled>저장</button><span class="b">나중에</span><span class="b t">건너뛰기</span></div>
      <div class="ex"><small>예시를 눌러도 됩니다</small>${L.chips.map((c, i) => `<button type="button" data-k="${i}">${c.t}</button>`).join("")}</div></div>`;
    $("#sheet").innerHTML = desk(L, S.pick) + inbox(L, "녹음 없음", man, 5, "");
    guide("기록칸에 한 줄을 쓰거나 예시를 누르고 [저장]을 눌러 주세요");
    const note = $("#note"), ns = $("#nsave");
    // 한 줄 기록 시간: 기록칸에 커서가 올라가거나 누른 순간부터 저장(Enter)까지
    let t1 = 0, tick2 = 0;
    $("#timer-v").textContent = "0.0"; $("#timer").classList.remove("stop");
    const startLine = () => {
      if (t1) return;
      t1 = performance.now();
      tick2 = every(() => { $("#timer-v").textContent = ((performance.now() - t1) / 1000).toFixed(1); }, 100);
    };
    ["pointerenter", "pointerdown", "focus"].forEach((t) => note.addEventListener(t, startLine));
    $$(".ex button").forEach((b) => ["pointerenter", "pointerdown"].forEach((t) => b.addEventListener(t, startLine)));
    let cat = 0;
    const setCat = (c) => { cat = c; $$("#cats .cat").forEach((x) => x.classList.toggle("on", Number(x.dataset.c) === c)); };
    const check = () => { ns.disabled = !note.value.trim(); ns.classList.toggle("glow", !ns.disabled); };
    $$("#cats .cat").forEach((x) => x.addEventListener("click", () => setCat(Number(x.dataset.c))));
    $$(".ex button").forEach((b) => b.addEventListener("click", () => { const c = L.chips[Number(b.dataset.k)]; note.value = c.t; S.chip = Number(b.dataset.k); setCat(c.c); check(); }));
    note.addEventListener("input", check);
    const done = () => {
      if (ns.disabled || !note.value.trim()) return;
      if (!t1) startLine();
      clearInterval(tick2); $("#timer").classList.add("stop");
      const sec = (performance.now() - t1) / 1000;
      $("#timer-v").textContent = sec.toFixed(1);
      S.note = note.value.trim(); S.noteCat = cat;
      if (S.chip >= 0 && L.chips[S.chip].t !== S.note) S.chip = -1;
      $(".ib-man").innerHTML = `<div class="ib-done">${L.cls} ${S.pick.no}번 ${S.pick.name} · 기록했습니다<small>${L.cats[cat]} · 폰 기록에 한 줄이 붙었습니다</small></div>`;
      later(() => timeUp(sec, () => {
        $("#sheet").innerHTML = desk(L, S.pick, S.note);
        $("#pend").textContent = "4";
        $("#colp").classList.remove("dim");
        guide(`한 줄 ${sec.toFixed(1)}초. 그 한 줄이 학생 카드에 근거로 남았습니다`, true);
      }), 500);
    };
    /** 저장하면 걸린 시간을 큰 글씨로: 숫자가 0에서 올라가며 멈춘다 */
    function timeUp(sec, after) {
      const total = sec + phoneSec;
      $("#stage").insertAdjacentHTML("beforeend", `<div class="timeup" id="timeup"><div class="tu-card" role="dialog" aria-label="기록에 걸린 시간">
          <p class="tu-k">${S.pick.no}번 ${esc(S.pick.name)} · 한 줄 기록</p>
          <p class="tu-n"><b id="tun">0.0</b><span>초</span></p>
          <p class="tu-m">이만큼의 시간으로<br><em>수업 속 한 장면</em>을 기록했습니다.</p>
          ${phoneSec ? `<p class="tu-s">수업 중 폰에서 번호 누르기 <b>${phoneSec.toFixed(1)}초</b> + 쉬는 시간 한 줄 <b>${sec.toFixed(1)}초</b> = 모두 <b>${total.toFixed(1)}초</b></p>` : ""}
          <button class="cta" id="tuok" type="button">확인 <span aria-hidden="true">→</span></button></div></div>`);
      const el = $("#tun"), t0n = performance.now(), dur = reduced ? 0 : 900;
      const run = () => {
        const k = dur ? Math.min(1, (performance.now() - t0n) / dur) : 1;
        el.textContent = (sec * (1 - Math.pow(1 - k, 3))).toFixed(1);
        if (k < 1) requestAnimationFrame(run);
      };
      run();
      $("#tuok").focus({ preventScroll: true });
      $("#tuok").addEventListener("click", () => { $("#timeup").remove(); after(); });
    }
    ns.addEventListener("click", done);
    note.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); done(); } });
  }
}

/* ---------- 6-2 · 웨일 연계: 수업 관리 화면에서 학생을 바로 골라 기록 ---------- */
// 웨일 브라우저 안 '수업 관리'(학생 화면 모아 보기) + 오른쪽 사이드바의 누가. 연계 예시 · 데모 데이터 (실제 웨일 화면이 아니라 누가 디자인으로 그린 예시)
function sWhale(root) {
  const L = LV[S.level];
  const shown = Math.min(24, L.n);
  const raise = 6; // 손 든 학생 (눈에 띄게)
  const tiles = NAMES.slice(0, shown).map((n, i) => `<button class="tile ${i === raise ? "raise" : ""}" type="button" data-i="${i}"><span class="scr v${i % 4}"><i></i></span><span class="tn"><i>${String(i + 1).padStart(2, "0")}</i>${n}</span>${i === raise ? '<b class="hand">✋ 손 들었어요</b>' : ""}</button>`).join("");
  const before = S.pick && S.note
    ? `<li>${catChip(L, S.noteCat)}<span><b>${S.pick.no} ${esc(S.pick.name)}</b><small>폰 · 10:05</small></span></li>`
    : `<li>${catChip(L, 1)}<span><b>3 ${NAMES[2]}</b><small>폰 · 10:02</small></span></li>`;
  root.innerHTML = `<section class="wl"><div class="wb">
      <div class="wb-tabs"><span class="lights"><i></i><i></i><i></i></span><span class="tab on"><img src="../assets/whale-logo.png" alt="">웨일 클래스 · ${L.cls} ${L.period}</span><span class="tab">교과서</span><span class="tab add">+</span><span class="g"></span><span class="demo">웨일 연계 예시 · 데모 데이터</span></div>
      <div class="wb-bar"><span class="nv">‹ › ↻</span><span class="url">웨일 스페이스 · 수업 관리 · ${L.cls} 학생 화면</span><span class="sbtn on" title="사이드바 · 누가">${LOGO}</span></div>
      <div class="wb-body">
        <div class="wb-main"><div class="wm-h"><b>학생 화면 ${L.n}명</b><span>${L.lesson}</span><span class="g"></span><span class="hint">눈에 띈 학생 칸을 누르면 누가에 바로 기록됩니다</span></div>
          <div class="tiles" id="tiles">${tiles}</div></div>
        <aside class="wb-side"><div class="ws-h">${LOGO}<b>누가</b><small>웨일 사이드바</small></div>
          <div class="ws-now"><small>지금 수업</small><b>${L.cls} · ${L.period}</b></div>
          <div class="ws-cnt">오늘 기록 <b id="wcnt">1</b>건</div>
          <ul class="ws-list" id="wlist">${before}</ul>
          <p class="ws-f">카테고리와 번호만 남기고, 쉬는 시간에 한 줄을 더합니다</p></aside>
      </div></div></section>`;
  guide("웨일 수업 관리 화면입니다. 눈에 띈 학생 칸을 눌러 보세요");
  let n = 1, open = null;
  const close = () => { open?.querySelector(".pop")?.remove(); open = null; };
  $$("#tiles .tile").forEach((t) => t.addEventListener("click", (e) => {
    if (e.target.closest(".pop")) return;
    if (open === t) return close();
    close(); open = t;
    const i = Number(t.dataset.i);
    t.insertAdjacentHTML("beforeend", `<span class="pop ${i % 6 >= 4 ? "left" : ""}"><small>${i + 1}번 ${NAMES[i]} · 무엇이 보였나요?</small>${L.cats.map((_, c) => `<button type="button" class="cat c${c}" data-c="${c}">${L.cats[c]}</button>`).join("")}</span>`);
    guide(`${NAMES[i]} 학생에게서 보인 것을 골라 주세요`);
    $$(".pop .cat", t).forEach((b) => b.addEventListener("click", () => {
      const c = Number(b.dataset.c);
      close();
      t.classList.add("done"); t.querySelector(".hand")?.remove();
      t.querySelector(".ok")?.remove();
      t.insertAdjacentHTML("beforeend", `<b class="ok">✓ ${L.cats[c]}</b>`);
      $("#wlist").insertAdjacentHTML("afterbegin", `<li class="new">${catChip(L, c)}<span><b>${i + 1} ${NAMES[i]}</b><small>웨일 수업 관리 · 지금</small></span></li>`);
      $("#wcnt").textContent = String(++n);
      S.whale = { i, c };
      guide(`수업 화면을 떠나지 않고 ${NAMES[i]} 기록 끝. 다른 학생도 눌러 보세요 · [다음]`, true);
    }));
  }));
}

/* ---------- 7 · 자동 기록 ---------- */
function sAuto(root) {
  const L = LV[S.level];
  S.auto = null;
  const noti = (rec) => rec
    ? `<div class="ph-noti"><div class="h"><i></i>누가 · 지금</div><b class="rec">녹음 중 · ${L.cls} ${L.period}</b><p>음성은 이 폰에만 저장되고 24시간 뒤 지워집니다</p><div class="a"><span>일시정지</span><span>중단</span></div></div>`
    : `<div class="ph-noti"><div class="h"><i></i>누가 · 아침 8:20</div><b>오늘 녹음 대기 중</b><p>시간표의 수업 시간에 자동으로 녹음합니다</p><div class="a"><span>대기 끄기</span></div></div>`;
  root.innerHTML = `<section class="split"><div id="colp"><div class="phone"><div class="scr"><div class="ph-status"><span id="pclock">09:49</span><span>◢ ▮</span></div><div id="noti">${noti(false)}</div>
      <div class="waves" id="waves">${Array.from({ length: 13 }, (_, i) => `<i style="animation-delay:${(i * 0.07).toFixed(2)}s;height:${24 + ((i * 37) % 34)}px"></i>`).join("")}</div>
      <div class="ph-clock" id="rclock">00:00<small>시간표: ${L.period} ${L.time}</small></div><div class="ph-grow"></div>
      <button class="ph-big" id="bell" type="button">${L.period} 시작 종 울리기 ▶</button></div></div><p class="cap">수업 중 · 교사의 폰</p></div>
    <div id="colc">${pc(L, `<div class="tr"><div class="tr-h"><b>${L.cls} · ${L.period}</b><span>받은 스크립트 · 합성 모의 수업</span></div><p class="tr-n">화자 라벨은 이 수업 안에서만 의미가 있고, 학생과 연결해 저장하지 않습니다.</p><div class="tr-list" id="trl"><div class="tr-empty">수업 시간이 되면 폰이 저절로 녹음을 시작합니다.<br>폰이 수업을 글로 옮겨 PC로 보냅니다. 음성 파일은 보내지 않습니다.</div></div></div>`, 4)}<p class="cap">교무실 · 교사 PC · 녹음은 기본 꺼짐, 학교 승인·안내·동의 후 사용</p></div></section>`;
  guide(`폰에서 [${L.period} 시작 종 울리기]를 눌러 주세요. 시간표대로 녹음이 저절로 시작됩니다`);

  $("#bell").addEventListener("click", () => {
    $("#bell").remove();
    $("#noti").innerHTML = noti(true); $("#waves").classList.add("on"); $("#pclock").textContent = "09:51";
    let sec = 0;
    every(() => { sec += 7; $("#rclock").firstChild.textContent = `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`; }, 250);
    guide("녹음되는 동안 PC에는 이름 없이 화자만 구분된 글이 쌓입니다");
    const list = $("#trl"); list.innerHTML = "";
    L.script.forEach((s, k) => later(() => {
      list.insertAdjacentHTML("beforeend", `<div class="seg ${s[1] === 1 ? "t1" : ""}" data-k="${k}"><time>${s[0]}</time><b class="sp${s[1]}">화자${s[1]}</b><span>${s[2]}${s[1] === 1 ? " <small>(교사 추정)</small>" : ""}</span></div>`);
      if (k === L.script.length - 1) later(() => {
        $("#waves").classList.remove("on");
        $("#colc .pc").insertAdjacentHTML("beforeend", '<button class="back" id="back" type="button">수업 마치고 자리로 돌아가기 ▶</button>');
        guide("[수업 마치고 자리로 돌아가기]를 눌러 주세요");
        $("#back").addEventListener("click", () => curtain("쉬는 시간 · 교무실 자리로", atDesk));
      }, 900);
    }, 500 + k * 1000));
  });

  function atDesk() {
    timers.forEach((f) => f()); timers = [];
    $("#back")?.remove(); $("#colp").classList.add("dim");
    const s = L.script, p = L.pickLine;
    const card = `<div class="sg"><div class="l"><div class="hd"><b>${s[p][0]}</b><i>${L.sgTag}</i></div><div class="ti">${L.sgTitle}</div>
        <div class="ctx"><span>화자${s[p - 1][1]}: ${s[p - 1][2]}</span><q>${s[p][2]}</q><span>화자${s[p + 1][1]}: ${s[p + 1][2]}</span></div>
        <div class="catrow">${L.cats.map((_, c) => catChip(L, c, c === L.sgCat)).join("")}</div></div>
      <div class="r"><b>${L.cls} 명단<small>누르면 저장</small></b><div class="roster glow" id="roster">${NAMES.slice(0, L.n).map((n, i) => `<button type="button" data-i="${i}"><i>${i + 1}</i>${n}</button>`).join("")}</div></div></div>`;
    $("#sheet").innerHTML = desk(L, null) + inbox(L, card, "수동 기록 없음", 5, "a") + `<div class="pc-toast">수업 스크립트 1건 도착<small>${L.cls} ${L.period} · PC가 발언 1건을 골랐습니다</small></div>`;
    guide("PC가 고른 발언입니다. 누구의 발언인지 떠올려 명단에서 학생을 눌러 주세요");
    later(() => $(".pc-toast")?.remove(), 3200);
    $$("#roster button").forEach((b) => b.addEventListener("click", () => {
      const i = Number(b.dataset.i);
      S.auto = { i, no: i + 1, name: NAMES[i] };
      $(".ib-auto").innerHTML = `<div class="ib-done">${L.cls} ${S.auto.no}번 ${S.auto.name} · 기록했습니다<small>${L.cats[L.sgCat]} · ${L.sgMemo}</small></div>`;
      $(".pc-toast")?.remove();
      later(() => {
        $("#sheet").innerHTML = desk(L, { i, no: i + 1, name: NAMES[i] }, L.sgMemo);
        $("#colp").classList.remove("dim");
        guide("놓친 발언은 PC가 찾아 주고, 누구인지는 선생님이 정합니다. [다음]을 눌러 주세요", true);
      }, 1200);
    }));
  }
}

/* ---------- 8 · 기록의 활용: 계단 → 생기부 ---------- */
function sApply(root) {
  const L = ensure();
  const mine = { cat: S.noteCat, text: S.note };
  const recs = [[mine.cat, "오늘", mine.text, true], ...L.recs.slice().reverse()];          // 화면 순서 (최근이 위)
  const recIndex = (k) => (k === "mine" ? 0 : L.recs.length - k);                           // 원래 번호 → 화면 줄
  const chipS = S.chip >= 0 && L.chips[S.chip].t === S.note ? L.chips[S.chip].s : null;
  const n = S.note.replace(/[.。]+$/, "");
  const mineS = chipS || (/함$/.test(n) ? `${n.slice(0, -1)}하는 등 수업에 꾸준히 참여하는 모습을 보임.` : `'${n}' 기록에서 드러나듯 수업에 꾸준히 참여하는 모습을 보임.`);
  // 기록마다 근거가 붙은 문장 + 방금 쓴 한 줄로 만든 문장 + 모든 기록을 묶는 마무리 문장
  const sens = [...L.sens.map((s) => ({ text: s[0], ev: s[1].map(recIndex) })), { text: mineS, ev: [0], mine: true }, { text: L.close, ev: recs.map((_, k) => k) }];
  const total = sens.reduce((a, x) => a + bytes(x.text) + 1, -1);

  // 계단: 고른 학생은 3건 이상 → 5건 이상, 추천으로 기록한 학생은 2건 이하 → 3건 이상
  const pat = [0, 1, 1, 2, 1, 2, 2, 1, 3, 2, 1, 2, 1];
  const steps = [[], [], [], []], gone = [[], [], [], []];
  for (let i = 0; i < L.n; i++) {
    let base = pat[(i * 7 + 3) % pat.length], to = base;
    if (i === S.pick.i) { base = 2; to = 3; } else if (i === S.auto.i) { base = 1; to = 2; }
    steps[to].push({ i, moved: to !== base });
    if (to !== base) gone[base].push(i);
  }
  const names = ["출발선", "2건 이하", "3건 이상", "5건 이상"];
  const plate = (p) => `<span class="plt ${p.moved ? "new" : ""}"><i>${String(p.i + 1).padStart(2, "0")}</i>${NAMES[p.i]}</span>`;
  root.innerHTML = `<section class="apply">${pc(L, `<div class="stairs-wrap">
      <div class="statbar"><div><small>평균</small><b>2.4<i>건</i></b></div><div class="o"><small>출발선</small><b>${steps[0].length}<i>명</i></b></div><div><small>이번 주 기록</small><b>2<i>/${L.n}명</i></b></div><div><small>가장 높이</small><b>5<i>건</i></b></div></div>
      <span class="tag"><i></i>방금 기록한 학생 · 한 칸 위로</span>
      <div class="stairs">${steps.map((st, k) => `<div class="stp s${k}"><div class="pl">${st.map(plate).join("")}${gone[k].map((i) => `<span class="plt gone">${NAMES[i]}</span>`).join("")}</div><div class="bar"><b>${names[k]}</b> ${st.length}명</div></div>`).join("")}</div>
    </div>`, 4)}<button class="go" id="todraft" type="button">이 기록으로 생기부 쓰기 →</button></section>`;
  guide(`${S.pick.name}, ${S.auto.name} 학생이 한 칸 올라갔습니다. [이 기록으로 생기부 쓰기]를 눌러 주세요`);
  $("#todraft").addEventListener("click", openDraft);

  function openDraft() {
    $("#todraft").remove();
    $("#sheet").insertAdjacentHTML("beforeend", `<div class="veil"></div><div class="dm"><div class="dm-h"><span class="sgm"><button type="button" class="on" data-t="one">개별</button><button type="button" data-t="all">일괄</button></span><span class="no">${S.pick.no}</span><span class="nm">${S.pick.name}</span><span class="it">${L.item}</span><span class="g"></span><span class="it">합성 데이터</span></div><div class="dm-b" id="dmb"></div></div>`);
    $$(".sgm button").forEach((b) => b.addEventListener("click", () => { $$(".sgm button").forEach((x) => x.classList.toggle("on", x === b)); (b.dataset.t === "one" ? one : all)(); }));
    one();
  }
  let made = false;
  function one() {
    $("#dmb").innerHTML = `<div class="dm-l"><div class="dm-bar"><span class="len"><i id="lenb"></i></span><span id="lent">0/1,500B</span><span id="chips"></span></div>
        <div class="dm-draft" id="draft"><div class="ph">아직 초안이 없습니다. 아래 [생성]을 누르면 오른쪽 기록으로 초안을 씁니다.</div></div>
        <div class="dm-in"><span>예: 체크한 기록으로 ${L.ask}</span><button class="b p glow" id="gen" type="button">생성</button></div></div>
      <div class="dm-r"><h5>기록<span>사용 ${recs.length}건</span></h5>${recs.map((r, k) => `<div class="rec ${r[3] ? "mine" : ""}" data-k="${k}"><span class="ckb">✓</span>${catChip(L, r[0])}<time>${r[1]}</time><span>${esc(r[2])}</span></div>`).join("")}<p>체크한 기록만 초안에 쓰입니다.</p></div>
      <svg class="link" id="link"></svg>`;
    const show = (instant) => {
      const ul = document.createElement("ul");
      $("#draft").innerHTML = ""; $("#draft").append(ul);
      sens.forEach((s, k) => later(() => {
        ul.insertAdjacentHTML("beforeend", `<li data-k="${k}" class="${s.mine ? "mine" : ""}">${esc(s.text)}<span class="ev">${s.ev.length}</span></li>`);
        ul.lastElementChild.addEventListener("click", () => pick(k));
        if (k === sens.length - 1) {
          $("#lenb").style.width = `${Math.min(100, (total / 1500) * 100)}%`; $("#lent").textContent = `${total.toLocaleString("ko-KR")}/1,500B`;
          $("#chips").innerHTML = `<span class="chipx ok">✓ 모든 문장에 근거</span>`;
          made = true;
          later(() => { pick(sens.length - 2); guide("방금 쓴 한 줄이 생기부 문장이 됐습니다. 다른 문장 · [일괄] 탭도 눌러 보세요", true); }, instant ? 0 : 500);
        }
      }, instant ? 0 : 500 + k * 420));
    };
    if (made) { $("#gen").textContent = "수정"; $("#gen").classList.remove("glow"); show(true); return; }
    guide("[생성]을 눌러 주세요. 오른쪽 기록으로 초안을 씁니다");
    $("#gen").addEventListener("click", () => { $("#gen").disabled = true; $("#gen").classList.remove("glow"); $("#gen").textContent = "작성 중"; $("#draft").innerHTML = '<div class="ph">기록을 엮어 초안을 쓰는 중…</div>'; later(() => { $("#gen").textContent = "수정"; show(false); }, 600); });
  }
  /** 문장을 누르면 근거가 된 기록 줄과 선으로 잇는다 */
  function pick(k) {
    const base = $("#dmb").getBoundingClientRect(), li = $(`#draft li[data-k="${k}"]`);
    if (!li) return;
    $$("#draft li").forEach((x) => x.classList.toggle("on", x === li));
    $$(".dm-r .rec").forEach((r) => r.classList.toggle("on", sens[k].ev.includes(Number(r.dataset.k))));
    const a = li.getBoundingClientRect(), ax = (a.right - base.left) / SCALE, ay = (a.top + a.height / 2 - base.top) / SCALE;
    $("#link").innerHTML = sens[k].ev.map((e) => {
      const r = $(`.dm-r .rec[data-k="${e}"]`).getBoundingClientRect(), bx = (r.left - base.left) / SCALE, by = (r.top + r.height / 2 - base.top) / SCALE;
      return `<path style="--l:${Math.ceil(Math.hypot(bx - ax, by - ay) * 1.4)}" d="M${ax} ${ay} C${ax + 18} ${ay},${bx - 18} ${by},${bx} ${by}"/>`;
    }).join("");
  }
  function all() {
    const others = [0, 1, 2, 3, 4].map((k) => (S.pick.i + 3 + k * 4) % L.n).filter((i) => i !== S.pick.i);
    const list = [{ i: S.pick.i, n: recs.length, tx: sens[0].text, me: true, b: total }, ...others.map((i, k) => ({ i, n: 3 + (k % 3), tx: L.batch[k], b: 1436 + ((i * 13) % 60) }))];
    $("#dmb").style.gridTemplateColumns = "1fr";
    $("#dmb").innerHTML = `<div class="dm-l"><div class="dm-bar"><span>${L.cls} · 선택 ${list.length}명 · 일괄 목표 1,500B</span><span style="flex:1"></span><button class="b p glow" id="run" type="button">일괄 생성</button></div>
      <div class="bt"><div class="hd"><span>번호</span><span>이름</span><span>누가기록</span><span>초안</span><span>상태</span></div>${list.map((s, k) => `<div class="row ${s.me ? "me" : ""}" data-k="${k}"><span>${s.i + 1}</span><b>${NAMES[s.i]}</b><span>${s.n}건</span><span class="tx">—</span><span class="st">대기</span></div>`).join("")}</div></div>`;
    guide("[일괄 생성]을 눌러 주세요. 반 전체 초안을 차례로 씁니다");
    $("#run").addEventListener("click", () => {
      $("#run").disabled = true; $("#run").classList.remove("glow");
      list.forEach((s, k) => {
        const row = $(`.bt .row[data-k="${k}"]`);
        later(() => { $(".st", row).className = "st run"; $(".st", row).textContent = "작성 중"; }, k * 650);
        later(() => {
          $(".tx", row).textContent = s.tx; $(".st", row).className = "st ok"; $(".st", row).textContent = `완료 · ${s.b.toLocaleString("ko-KR")}B`;
          if (k === list.length - 1) guide("반 전체 초안 완성. 문장마다 근거는 [개별] 탭에서 · [다음]", true);
        }, k * 650 + 560);
      });
    });
    // 개별 탭으로 돌아오면 두 칸 배치로 되돌린다
    $(".sgm button[data-t=one]").addEventListener("click", () => { $("#dmb").style.gridTemplateColumns = ""; }, { once: true });
  }
}

/* ---------- 9 · 상담: 두 사람 + 말풍선, [누가기록!]으로 근거 있는 설명 ---------- */
/** 말하는 사람: assets/chars/*.svg 를 그대로 끼워 넣는다 (말할 때 입 모양을 CSS 로 바꾸려고 img 가 아니라 인라인) */
const CHAR = { teacherF: "teacher-f", teacherM: "teacher-m", parent: "parent", student: "student" };
const charCache = {};
const charSvg = (kind) => (charCache[kind] ||= fetch(`assets/chars/${CHAR[kind]}.svg`).then((r) => (r.ok ? r.text() : Promise.reject())));
function person(kind) {
  const slot = `<span class="fig" data-k="${kind}"><img src="assets/chars/${CHAR[kind]}.svg" alt=""></span>`;
  charSvg(kind).then((svg) => $$(`.fig[data-k="${kind}"]`).forEach((el) => { el.innerHTML = svg; })).catch(() => {});
  return slot;
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
      <button class="nuga-btn" id="nuga" type="button" hidden><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 25h7v-7h7v-7h8" fill="none" stroke="currentColor" stroke-width="3.4"/></svg>누가기록!</button>
      <div class="evs" id="evs"></div>
      <button class="replay" id="replay" type="button" hidden>처음부터 다시 보기</button>
    </section>`;
  const say = (side, html, cls = "") => {
    const me = $(side === "l" ? "#bl" : "#bt"), other = $(side === "l" ? "#bt" : "#bl"), who = $(side === "l" ? "#wl" : "#wt");
    me.className = `bub ${side} ${cls}`; me.innerHTML = html; me.hidden = false;
    me.style.animation = "none"; void me.offsetWidth; me.style.animation = "";
    other.classList.add("old");
    who.classList.add("talking"); later(() => who.classList.remove("talking"), 1300);
  };
  // 대화는 아래 [다음 대화 →]로 한 마디씩 넘긴다. 대화가 끝나야 그 버튼이 [마무리 →]가 된다
  let step = 0;
  const label = (t) => { nextBtn.innerHTML = `${t} <span aria-hidden="true">→</span>`; };
  const talkNext = () => {
    if (step < T.lines.length) {
      const ln = T.lines[step];
      say(ln[0], fill(ln[1]), step === T.lines.length - 1 ? "vague" : "");
      step++;
      nextBtn.classList.add("glow"); nextBtn.disabled = false;
      guide(step === 1 ? "기록 없이 나누는 상담입니다. [다음 대화]로 이어 가세요" : "[다음 대화]를 눌러 주세요");
      return;
    }
    if (step === T.lines.length) {   // 막연한 답 다음: [누가기록!]을 눌러야 이어진다
      step++;
      $("#bt").hidden = true; $("#nuga").hidden = false;
      nextBtn.disabled = true; nextBtn.classList.remove("glow");
      guide("막연한 말뿐입니다. 선생님 위의 [누가기록!]을 눌러 주세요");
      return;
    }
    // 근거 있는 설명 다음: 상대의 반응 → 대화 끝
    say("l", fill(T.after), "happy");
    sceneNext = null; label("마무리"); nextBtn.classList.add("glow");
    $("#replay").hidden = false;
    guide("같은 질문, 다른 답. 누가 기록이 상담의 근거가 됩니다 · [마무리]", true);
  };
  const play = () => {
    timers.forEach((f) => f()); timers = [];
    $("#bl").hidden = $("#bt").hidden = true; $("#evs").innerHTML = ""; $("#nuga").hidden = true; $("#replay").hidden = true;
    $(".talk2").classList.remove("answered");
    step = 0; sceneNext = talkNext; label("다음 대화");
    later(talkNext, 300);
  };
  $("#nuga").addEventListener("click", () => {
    $("#nuga").hidden = true;
    $(".talk2").classList.add("answered");
    $("#evs").innerHTML = `<p>누가에 쌓인 ${esc(name)}의 기록</p>` + evRecs.map((r, k) => `<div class="evc" style="animation-delay:${k * 0.18}s">${catChip(L, r[0])}<time>${r[1]}</time><span>${esc(r[2])}</span></div>`).join("");
    later(() => {
      say("t", `<small>누가 기록 ${evRecs.length}건으로</small>${T.answer} ${T.tail} <mark>“${esc(S.note)}”</mark>`, "good");
      nextBtn.disabled = false; nextBtn.classList.add("glow");
      guide("이번엔 날짜와 장면으로 설명합니다. [다음 대화]를 눌러 주세요");
    }, 800);
  });
  $("#replay").addEventListener("click", play);
  play();
}

/* ---------- 10 · 마무리 ---------- */
function sEnd(root) {
  root.innerHTML = `<section class="hero end">${heroBg()}<div class="shade"></div><div class="copy">
    <p class="eyebrow">성장을 이끄는 기록</p><p class="word">누가</p>
    <ol><li><b>1</b>기록은 어렵습니다. 수업 중엔 틈이 없고, 끝나면 흐려집니다.</li><li><b>2</b>그러나 기록은 그 이상으로 가치 있습니다.</li><li><b>3</b>그래서 가장 선명한 순간에, 10초로 기록합니다.</li><li><b>4</b>그 기록이 피드백이 되어 학생의 성장을 이끕니다.</li></ol>
    <div class="row"><a class="btn2 fill" href="../">누가 소개 페이지로 →</a><button class="btn2" id="again" type="button">처음으로</button></div></div></section>`;
  $("#again").addEventListener("click", reset);
}

// 소개 페이지의 [체험하기]는 ?start=level 로 들어와 시작 화면을 건너뛰고 학교급 선택부터. 뒤로 가기는 소개 페이지로
if (new URLSearchParams(location.search).get("start") === "level") { history.replaceState({ i: 1 }, ""); go(1, true); } else go(0);
touch();
