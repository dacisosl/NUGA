// 기록 방법 1 · 수동 기록 (25초)
// 수업 중 폰에서 번호를 굴려 [저장 · 14번] → 그 기록이 PC에 도착한 순간 계단 한 칸 위로(앱은 보완 전 기록도 센다)
// → 쉬는 시간 '쉬는 시간 기록' 창에서 한 줄 쓰고 Enter → 학생 카드에 그 한 줄이 근거로 남는다.
// 화면은 모두 capture.mjs 로 찍은 실제 앱 화면이고, 손가락·커서·화살표·표시만 위에 얹는다.
import { mount } from "./engine.js";
import { setup, loadManifest, phoneLayer, monitorLayer, P, M, MON, union, center, fit, camera, applyCamera, showTimeline, place, at, tapAt, cursorSvg, chip, seg, easeInOut, easeOut, lerp, el } from "./film.js";

const S = await loadManifest("manual");
const names = (prefix) => Object.keys(S).filter((k) => k.startsWith(prefix)).sort();
const { world, hud, fade } = setup();
const rolls = names("m-phone-roll-"), typing = names("m-pc-type-");
const phone = phoneLayer(world, S, ["m-phone-idle", ...rolls, "m-phone-14", "m-phone-saved"]);
const mon = monitorLayer(world, ["m-stairs-full-before", "m-stairs-full-arrive", "m-stairs-full-after", "m-pc-popup", ...typing, "m-pc-done", "m-card"]);

const R = (shot, key) => S[shot].rects[key];
const phoneAll = P({ x: 0, y: 0, width: phone.size.w, height: phone.size.h });
const monAll = { x: MON.x - 18, y: MON.y - 18, width: MON.w + 36, height: MON.h + 36 + 142 };
const reel = P(R("m-phone-idle", "reel")), saveBtn = P(R("m-phone-idle", "save")), snack = P(R("m-phone-saved", "snack"));
const plateA = M(R("m-stairs-full-before", "plate")), plateB = M(R("m-stairs-full-after", "plate")), stairs = M(R("m-stairs-full-before", "stage"));
// 출발선 ~ 2건 이하 칸: 계단 무대 왼쪽 끝부터, 무대 아래 학생 목록은 빼고
const climbView = { x: stairs.x + 10, y: plateB.y - 150, width: Math.max(700, plateB.x + plateB.width + 200 - stairs.x), height: stairs.y + stairs.height - (plateB.y - 150) };
const modal = M(R("m-pc-popup", "modal")), card = M(R("m-pc-popup", "card")), input = M(R("m-pc-popup", "input"));
const doneModal = M(R("m-pc-done", "modal"));
const studentCard = M(R("m-card", "card"));
// 카드 안 최근 기록 줄 (이름·배지 아래)
const noteLine = { x: studentCard.x + 10, y: studentCard.y + 88, width: studentCard.width - 20, height: 52 };

// 시각표 (초). 소개 페이지 단계 data-at: 0 · 5.4 · 11.0 · 20.6
const T = { roll0: 1.7, roll1: 3.1, tap: 3.8, saved: 3.95, wide: 5.4, climb0: 8.0, arrive: 8.75, after: 9.35, popup: 11.0, click: 12.8, type0: 13.1, type1: 19.1, enter: 19.55, done: 19.7, card: 20.6, end: 25 };

const cam = camera([
  [0, fit(phoneAll, 50)],
  [0.9, fit(phoneAll, 50)],
  [1.6, fit(union(reel, saveBtn), 50)],
  [3.9, fit(union(reel, saveBtn), 50)],
  [4.5, fit(union(reel, snack), 60)],
  [T.wide, fit(union(reel, snack), 60)],
  [6.6, fit(union(phoneAll, monAll), 40, 0)],
  [6.9, fit(union(phoneAll, monAll), 40, 0)],
  [7.7, fit(climbView, 0)],
  [10.6, fit(climbView, 0)],
  [11.5, fit(modal, 30)],
  [12.3, fit(card, 70)],
  [19.9, fit(card, 70)],
  [20.5, fit(doneModal, 30)],
  [21.5, fit(studentCard, 60)],
  [T.end, fit(studentCard, 60)],
]);

const phoneList = [[0, "m-phone-idle"], ...rolls.map((n, i) => [T.roll0 + (T.roll1 - T.roll0) * i / rolls.length, n, 0]), [T.roll1, "m-phone-14", 0], [T.saved, "m-phone-saved", 0.15]];
const monList = [[0, "m-stairs-full-before"], [T.arrive, "m-stairs-full-arrive", 0.2], [T.after, "m-stairs-full-after", 0.5], [T.popup, "m-pc-popup", 0.35],
  ...typing.map((n, i) => [T.type0 + (T.type1 - T.type0) * i / (typing.length - 1), n, 0]),
  [T.done, "m-pc-done", 0.2], [T.card, "m-card", 0.5]];

// 얹는 표시
const finger = el("div", { class: "finger" });
const tap = el("div", { class: "tap" });
const click = el("div", { class: "tap", style: { width: "36px", height: "36px", margin: "-18px 0 0 -18px" } });
const cursor = cursorSvg();
const markA = el("div", { class: "mark" });
const markNote = el("div", { class: "mark" });
const ring = el("div", { class: "ring" });
const ns = "http://www.w3.org/2000/svg";
const trail = document.createElementNS(ns, "svg");
trail.setAttribute("class", "trail");
const path = document.createElementNS(ns, "path");
trail.append(path);
const a = center(plateA), b = center(plateB);
const box = union({ x: a.x, y: a.y, width: 1, height: 1 }, { x: b.x, y: b.y, width: 1, height: 1 });
Object.assign(trail.style, { left: `${box.x - 200}px`, top: `${box.y - 200}px`, width: `${box.width + 400}px`, height: `${box.height + 400}px` });
const ox = box.x - 200, oy = box.y - 200;
path.setAttribute("d", `M ${a.x - ox} ${a.y - oy} C ${a.x - ox + 60} ${a.y - oy - 170}, ${b.x - ox - 160} ${b.y - oy - 40}, ${b.x - ox} ${b.y - oy}`);
const glow = el("div", { class: "finger", style: { width: "26px", height: "26px", margin: "-13px 0 0 -13px" } });
const badge = el("div", { class: "badge", html: "14 설유진 · <em>출발선 → 2건 이하</em>" });
const cardBadge = el("div", { class: "badge", html: "14 설유진 · <em>이번 주 +1 · 근거 한 줄</em>" });
world.append(markA, trail, glow, ring, badge, markNote, cardBadge, finger, tap, click, cursor);
const setChip = chip(hud);
const key = el("div", { class: "key", html: "Enter ↵" });
hud.append(key);

const len = path.getTotalLength();
path.style.strokeDasharray = `${len}`;
const pad = (r, p) => ({ x: r.x - p, y: r.y - p, width: r.width + p * 2, height: r.height + p * 2 });

function draw(t) {
  applyCamera(world, cam(t));
  showTimeline(phone.imgs, phoneList, t);
  showTimeline(mon.imgs, monList, t);
  phone.box.style.opacity = String(lerp(1, 0.5, seg(t, T.wide + 0.5, T.wide + 1.5)));
  mon.show(easeInOut(seg(t, T.wide - 0.1, T.wide + 0.8)));

  // 번호 릴을 손가락으로 튕기고 [저장 · 14번]
  const rc = center(reel);
  const f = seg(t, T.roll0 - 0.3, T.roll0 + 0.45);
  at(finger, { x: rc.x + 40, y: lerp(reel.y + reel.height - 30, reel.y + 40, easeOut(f)) }, f > 0 && f < 1 ? Math.min(1, f * 4, (1 - f) * 3) : 0);
  tapAt(tap, center(saveBtn), t, T.tap);

  // 폰 기록이 도착한 순간: 출발선의 이름표 → 빛의 길 → 새 칸에서 고리
  place(markA, pad(plateA, 6), Math.min(seg(t, 7.3, 7.7), 1 - seg(t, T.arrive - 0.2, T.arrive + 0.1)));
  const c = seg(t, T.climb0, T.arrive);
  path.style.strokeDashoffset = String(len * (1 - easeInOut(c)));
  trail.style.opacity = String(t < T.climb0 ? 0 : 1 - seg(t, T.after + 0.4, T.after + 1.2));
  const p = path.getPointAtLength(len * easeInOut(c));
  at(glow, { x: p.x + ox, y: p.y + oy }, c > 0 && c < 1 ? 1 : 0, 1.4);
  const r = seg(t, T.arrive, T.arrive + 0.8);
  const grow = 6 + 10 * (1 - easeOut(r));
  place(ring, { x: plateB.x - grow, y: plateB.y - grow, width: plateB.width + grow * 2, height: plateB.height + grow * 2 }, t < T.arrive ? 0 : Math.min(1, r * 3) * (1 - seg(t, T.popup - 0.5, T.popup)));
  at(badge, { x: plateB.x - 70, y: plateB.y - 66 }, Math.min(seg(t, T.arrive + 0.3, T.arrive + 0.7), 1 - seg(t, T.popup - 0.5, T.popup)));

  // 쉬는 시간: 커서가 입력칸을 누르고 한 줄, Enter
  const ic = center(input);
  const cm = seg(t, 12.2, T.click);
  at(cursor, { x: lerp(ic.x + 260, ic.x - 60, easeInOut(cm)), y: lerp(ic.y + 170, ic.y + 4, easeInOut(cm)) }, t > 12.1 && t < T.type0 + 0.4 ? Math.min(1, seg(t, 12.1, 12.3), 1 - seg(t, T.type0, T.type0 + 0.4)) : 0);
  tapAt(click, { x: ic.x - 60, y: ic.y + 4 }, t, T.click);
  key.style.opacity = String(Math.min(seg(t, T.enter - 0.3, T.enter - 0.1), 1 - seg(t, T.enter + 0.5, T.enter + 0.8)));
  key.style.transform = `translateX(-50%) translateY(${t > T.enter - 0.05 && t < T.enter + 0.12 ? 6 : 0}px)`;

  // 학생 카드에 남은 한 줄
  place(markNote, pad(noteLine, 4), Math.min(seg(t, 21.7, 22.1), 1 - seg(t, T.end - 0.7, T.end - 0.3)));
  at(cardBadge, { x: studentCard.x + 6, y: studentCard.y - 58 }, Math.min(seg(t, 22.0, 22.4), 1 - seg(t, T.end - 0.7, T.end - 0.3)));

  // 단계 칩: 소개 페이지의 단계 01~04 와 같은 말
  const steps = [[0, "01", "수업 중, 번호만 누르기"], [T.wide, "02", "그 순간 PC 계단 한 칸 위로"], [T.popup, "03", "쉬는 시간, 한 줄 쓰고 Enter"], [T.card, "04", "그 한 줄이 성장의 근거로"]];
  let i = 0;
  for (let k = 0; k < steps.length; k++) if (t >= steps[k][0]) i = k;
  const edge = Math.min(i > 0 ? seg(t, steps[i][0], steps[i][0] + 0.25) : 1, i < steps.length - 1 ? 1 - seg(t, steps[i + 1][0] - 0.2, steps[i + 1][0]) : 1);
  setChip(edge, steps[i][1], steps[i][2]);

  fade.style.opacity = String(Math.max(1 - seg(t, 0, 0.5), seg(t, T.end - 0.6, T.end)));
}

await mount({ duration: T.end, draw });
