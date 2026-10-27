// 기록 방법 2 · 자동 기록 (약 26초)
// 녹음 설정 켜기(사용 조건 확인 · 하루 대기: 아침 1탭, 시간표대로) → 폰의 '녹음 중' 알림 → 이름 없이 화자만 구분된 스크립트
// → PC가 고른 발언 → 교사가 학생 지정 → 기록 계단 한 칸 위로.
// 폰 알림만 안드로이드 앱 문구로 그린 그림이고, 나머지는 capture.mjs 로 찍은 실제 앱 화면이다.
import { mount } from "./engine.js";
import { setup, loadManifest, phoneLayer, monitorLayer, P, M, MON, union, center, fit, camera, applyCamera, showTimeline, place, at, tapAt, cursorSvg, chip, seg, easeInOut, easeOut, lerp, el } from "./film.js";

const S = await loadManifest("auto");
const { world, hud, fade } = setup();
const phone = phoneLayer(world, S, ["a-phone-now"]);
const mon = monitorLayer(world, ["a-rec-off", "a-rec-check-0", "a-rec-check-4", "a-rec-on", "a-transcript", "a-transcript-students", "a-transcript-hl", "a-inbox", "a-inbox-pick", "a-inbox-done", "a-stairs-full-before", "a-stairs-full-arrive", "a-stairs-full-after"]);

const R = (shot, key) => S[shot].rects[key];
const phoneAll = P({ x: 0, y: 0, width: phone.size.w, height: phone.size.h });
const monAll = { x: MON.x - 18, y: MON.y - 18, width: MON.w + 36, height: MON.h + 36 + 142 };
const cardOff = M(R("a-rec-off", "card")), sw = M(R("a-rec-off", "switch"));
const checkModal = M(R("a-rec-check-0", "modal")), okBtn = M(R("a-rec-check-4", "ok"));
const cardOn = M(R("a-rec-on", "card")), standby = M(R("a-rec-on", "standby")), ttl = M(R("a-rec-on", "ttl"));
const list = M(R("a-transcript", "list")), note = M(R("a-transcript", "note")), s8 = M(R("a-transcript-students", "s8"));
const inbox = M(R("a-inbox", "modal")), sgCard = M(R("a-inbox", "card")), quote = M(R("a-inbox", "quote")), pick = M(R("a-inbox-pick", "pick")), roster = M(R("a-inbox-pick", "roster"));
const doneToast = M(R("a-inbox-done", "toast"));
const plateA = M(R("a-stairs-full-before", "plate")), plateB = M(R("a-stairs-full-after", "plate")), stairs = M(R("a-stairs-full-before", "stage"));
const climbView = { x: plateA.x - 150, y: plateB.y - 110, width: plateB.x + plateB.width + 120 - (plateA.x - 150), height: plateA.y + plateA.height + 90 - (plateB.y - 110) };
// 화자 열이 보이는 스크립트 왼쪽 부분
const speakers = { x: list.x, y: list.y - 50, width: 720, height: 300 };

// 폰 장면(아침 대기 → 수업 시간 녹음) 뒤의 시각은 모두 L() 만큼 늦춘다
const L = (x) => x + 0.6;
// 소개 페이지 단계 data-at: 0 · transcript · inbox · pickAt (= 0 · 10.5 · 15.3 · 18.4)
const T = { switchClick: 1.2, check: 1.35, ticks: 2.2, okClick: 3.55, on: 3.7, wide: 6.2, standby: 7.3, rec: 8.6, transcript: L(9.9), students: L(11.2), hl: L(12.3), inbox: L(14.7), pickAt: L(17.8), pickClick: L(18.85), done: L(18.95), stairsIn: L(20.6), climb0: L(21.7), arrive: L(22.45), after: L(23.05), end: L(26) };

const phoneTop = fit(P({ x: 0, y: 0, width: phone.size.w, height: 360 }), 30);
const cam = camera([
  [0, fit(cardOff, 40, 960)],
  [1.3, fit(cardOff, 40, 960)],
  [2.0, fit(checkModal, 30)],
  [3.6, fit(checkModal, 30)],
  [4.3, fit(union(standby, ttl, { x: cardOn.x, y: cardOn.y, width: 600, height: 1 }), 40)],
  [T.wide, fit(union(standby, ttl, { x: cardOn.x, y: cardOn.y, width: 600, height: 1 }), 40)],
  [6.7, fit(union(phoneAll, monAll), 40, 0)],
  [6.9, fit(union(phoneAll, monAll), 40, 0)],
  [7.6, phoneTop],
  [L(9.6), phoneTop],
  [L(10.4), fit(list, 20, 0)],
  [L(11.0), fit(list, 20, 0)],
  [L(11.8), fit(speakers, 0)],
  [L(12.9), fit(speakers, 0)],
  [L(13.5), fit(note, 60)],
  [L(14.4), fit(note, 60)],
  [L(15.2), fit(inbox, 20, 0)],
  [L(15.8), fit(sgCard, 30)],
  [L(17.6), fit(sgCard, 30)],
  [L(18.2), fit(union(quote, pick), 40)],
  [L(19.1), fit(union(quote, pick), 40)],
  [L(19.6), fit(doneToast, 60)],
  [L(20.4), fit(doneToast, 60)],
  [L(21.2), fit(climbView, 0)],
  [L(24.0), fit(climbView, 0)],
  [L(24.9), fit(stairs, 30)],
  [T.end, fit(stairs, 30)],
]);

const monList = [[0, "a-rec-off"], [T.check, "a-rec-check-0", 0.25], [2.95, "a-rec-check-4", 0.3], [T.on, "a-rec-on", 0.3],
  [T.transcript, "a-transcript", 0.4], [T.students, "a-transcript-students", 0.35], [T.hl, "a-transcript-hl", 0.3],
  [T.inbox, "a-inbox", 0.4], [T.pickAt, "a-inbox-pick", 0.3], [T.done, "a-inbox-done", 0.2],
  [T.stairsIn, "a-stairs-full-before", 0.45], [T.arrive, "a-stairs-full-arrive", 0.2], [T.after, "a-stairs-full-after", 0.5]];

// 안드로이드 앱의 알림 (RecordingService 의 실제 문구): 아침 [오늘 녹음 대기] 1탭 → 수업 시간에 녹음 중
const notifBox = el("div", { style: { overflow: "hidden", borderRadius: "38px" } });
place(notifBox, P({ x: 11, y: 11, width: phone.size.w - 22, height: phone.size.h - 22 }));
const appRow = (time) => `<div class="app"><svg viewBox="0 0 32 32"><path d="M3 26h9v-8h8v-8h9"/></svg>누가 · 수업 녹음<time>${time}</time></div>`;
const standbyNotif = el("div", { class: "notif", html: `${appRow("")}<b>오늘 녹음 대기 중</b><p>시간표의 수업 시간에 자동으로 녹음합니다</p><div class="acts"><span>대기 끄기</span></div>` });
const notif = el("div", { class: "notif", html: `${appRow("15:02")}<b><i></i>녹음 중 · 2-3 2교시</b><p>음성은 이 폰에만 저장되고 24시간 뒤 지워집니다</p><div class="acts"><span>일시정지</span><span>중단</span></div>` });
for (const n of [standbyNotif, notif]) { n.style.position = "absolute"; n.style.left = "9px"; notifBox.append(n); }
const morningBadge = el("div", { class: "badge", html: "아침 · <em>[오늘 녹음 대기] 1탭</em>" });
const autoBadge = el("div", { class: "badge", html: "09:50 2교시 시작 · <em>시간표대로 자동 녹음</em>" });

const cursor = cursorSvg();
const click = el("div", { class: "tap", style: { width: "36px", height: "36px", margin: "-18px 0 0 -18px" } });
const markStandby = el("div", { class: "mark" }), markTtl = el("div", { class: "mark" }), markRow = el("div", { class: "mark" }), markNote = el("div", { class: "mark" }), markQuote = el("div", { class: "mark" });
const ring = el("div", { class: "ring" }), markA = el("div", { class: "mark" });
const ns = "http://www.w3.org/2000/svg";
const trail = document.createElementNS(ns, "svg");
trail.setAttribute("class", "trail");
const path = document.createElementNS(ns, "path");
trail.append(path);
const a = center(plateA), b = center(plateB);
const ox = Math.min(a.x, b.x) - 200, oy = Math.min(a.y, b.y) - 200;
Object.assign(trail.style, { left: `${ox}px`, top: `${oy}px`, width: `${Math.abs(b.x - a.x) + 400}px`, height: `${Math.abs(b.y - a.y) + 400}px` });
path.setAttribute("d", `M ${a.x - ox} ${a.y - oy} C ${a.x - ox + 80} ${a.y - oy - 180}, ${b.x - ox - 200} ${b.y - oy - 40}, ${b.x - ox} ${b.y - oy}`);
const glow = el("div", { class: "finger", style: { width: "26px", height: "26px", margin: "-13px 0 0 -13px" } });
const badge = el("div", { class: "badge", html: "24 손시우 · <em>2건 이하 → 3건 이상</em>" });
world.append(notifBox, morningBadge, autoBadge, markStandby, markTtl, markRow, markNote, markQuote, markA, trail, glow, ring, badge, click, cursor);
const setChip = chip(hud);
const len = path.getTotalLength();
path.style.strokeDasharray = `${len}`;

const pad = (r, p) => ({ x: r.x - p, y: r.y - p, width: r.width + p * 2, height: r.height + p * 2 });
const showMark = (node, r, t, from, to) => place(node, pad(r, 6), Math.min(seg(t, from, from + 0.3), 1 - seg(t, to - 0.3, to)));

/** 커서 경로: [[t, 점], ...] 사이를 부드럽게 */
function cursorAt(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) {
    const k = easeInOut(seg(t, keys[i - 1][0], keys[i][0]));
    return { x: lerp(keys[i - 1][1].x, keys[i][1].x, k), y: lerp(keys[i - 1][1].y, keys[i][1].y, k) };
  }
  return keys[keys.length - 1][1];
}
const swc = center(sw), okc = center(okBtn), pc = center(pick);
// 사용 조건 체크 상자 4개 (a-rec-check-0 화면에서 잰 위치)
const checks = [0, 1, 2, 3].map((i) => ({ x: checkModal.x + 48, y: checkModal.y + 118 + i * 75 }));
const cursorKeys = [[0.3, { x: swc.x + 160, y: swc.y + 110 }], [1.1, swc], [1.6, swc], [2.15, checks[0]], [2.35, checks[0]], [2.5, checks[1]], [2.6, checks[1]], [2.75, checks[2]], [2.85, checks[2]], [3.0, checks[3]], [3.1, checks[3]], [3.5, okc], [4.4, { x: standby.x + standby.width - 30, y: standby.y + standby.height + 12 }],
  [L(15.9), { x: pc.x + 140, y: pc.y - 120 }], [L(18.0), { x: pc.x + 140, y: pc.y - 120 }], [L(18.75), pc]];
const clicks = [T.switchClick, 2.35, 2.6, 2.85, 3.1, T.okClick, T.pickClick];

function draw(t) {
  applyCamera(world, cam(t));
  showTimeline(phone.imgs, [[0, "a-phone-now"]], t);
  showTimeline(mon.imgs, monList, t);
  const onPhone = seg(t, T.wide, 7.0) * (1 - seg(t, L(9.6), L(10.2)));
  mon.frame.style.opacity = String(1 - 0.5 * onPhone);
  phone.box.style.opacity = String(Math.max(0.35, onPhone, 1 - seg(t, 0, 0.1)) * (t > L(10.2) ? 0.5 : 1));

  // 커서 (설정 화면 · 학생 지정)
  const cv = (t > 0.3 && t < 4.9) || (t > L(15.9) && t < L(19.4));
  const cp = cursorAt(t, cursorKeys);
  at(cursor, { x: cp.x - 3, y: cp.y - 2 }, cv ? Math.min(seg(t, 0.3, 0.6) + seg(t, L(15.9), L(16.2)), 1 - seg(t, 4.5, 4.9) * (t < 10 ? 1 : 0), 1 - seg(t, L(19.1), L(19.4))) : 0);
  const near = clicks.reduce((m, c) => (Math.abs(t - c) < Math.abs(t - m) ? c : m), clicks[0]);
  tapAt(click, cursorAt(near, cursorKeys), t, near);

  showMark(markStandby, standby, t, 4.4, T.wide);
  showMark(markTtl, ttl, t, 4.9, T.wide);

  // 폰: 아침 1탭으로 '오늘 녹음 대기' → 수업 시간이 되면 같은 자리 알림이 '녹음 중'으로 바뀐다
  const n = easeOut(seg(t, T.standby, T.standby + 0.5));
  const swap = easeInOut(seg(t, T.rec, T.rec + 0.35));
  Object.assign(standbyNotif.style, { top: `${lerp(-170, 44, n)}px`, opacity: String(1 - swap) });
  Object.assign(notif.style, { top: "44px", opacity: String(swap) });
  notifBox.style.opacity = String(t < T.standby ? 0 : 1);
  const sec = 15 * 60 + 2 + Math.max(0, Math.floor(t - T.rec));
  notif.querySelector("time").textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  at(morningBadge, P({ x: 24, y: 236 }), Math.min(seg(t, T.standby + 0.5, T.standby + 0.8), 1 - seg(t, T.rec - 0.2, T.rec + 0.1)));
  at(autoBadge, P({ x: 24, y: 236 }), Math.min(seg(t, T.rec + 0.2, T.rec + 0.5), 1 - seg(t, L(9.4), L(9.8))));

  showMark(markRow, { ...s8, width: Math.min(s8.width, 700) }, t, T.hl, L(13.2));
  showMark(markNote, note, t, L(13.4), L(14.6));
  showMark(markQuote, quote, t, L(16.0), L(17.9));

  // 계단 한 칸
  showMark(markA, plateA, t, T.stairsIn + 0.7, T.arrive + 0.1);
  const c = seg(t, T.climb0, T.arrive);
  path.style.strokeDashoffset = String(len * (1 - easeInOut(c)));
  trail.style.opacity = String(t < T.climb0 ? 0 : 1 - seg(t, T.after + 0.4, T.after + 1.2));
  const p = path.getPointAtLength(len * easeInOut(c));
  at(glow, { x: p.x + ox, y: p.y + oy }, c > 0 && c < 1 ? 1 : 0, 1.4);
  const r = seg(t, T.arrive, T.arrive + 0.8);
  const grow = 6 + 10 * (1 - easeOut(r));
  place(ring, { x: plateB.x - grow, y: plateB.y - grow, width: plateB.width + grow * 2, height: plateB.height + grow * 2 }, t < T.arrive ? 0 : Math.min(1, r * 3) * (1 - 0.55 * seg(t, T.after + 1, T.after + 2)));
  at(badge, { x: plateB.x - 110, y: plateB.y - 66 }, Math.min(seg(t, T.arrive + 0.3, T.arrive + 0.7), 1 - seg(t, L(24.4), L(24.9))));

  const steps = [[0, "01", "아침 1탭, 시간표대로 녹음"], [T.transcript, "02", "이름 없이 화자만 구분"], [T.inbox, "03", "놓친 발언을 PC가 추천"], [T.pickAt, "04", "교사가 학생 지정 → 계단 한 칸 위로"]];
  let i = 0;
  for (let k = 0; k < steps.length; k++) if (t >= steps[k][0]) i = k;
  const edge = Math.min(i > 0 ? seg(t, steps[i][0], steps[i][0] + 0.25) : 1, i < steps.length - 1 ? 1 - seg(t, steps[i + 1][0] - 0.2, steps[i + 1][0]) : 1);
  setChip(edge, steps[i][1], steps[i][2]);

  fade.style.opacity = String(Math.max(1 - seg(t, 0, 0.5), seg(t, T.end - 0.6, T.end)));
}

await mount({ duration: T.end, draw });
