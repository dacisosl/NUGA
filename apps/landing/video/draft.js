// 기록으로 생기부 초안 (10초)
// 현황판 학생 카드에 쌓인 실제 기록 → 일괄의 초안 편집 창에서 [생성] → 문장마다 근거가 된 기록이 이어지고,
// 마무리로 기록 하나하나가 세특 문장 어디로 이어졌는지 파티클 연결망으로 보여 준다.
// 앱 화면은 모두 capture.mjs draft 로 찍은 실제 화면이고, 연결망의 기록·문장·연결도 그 초안의 실제 근거(evidence) 그대로다.
import { mount } from "./engine.js";
import { setup, loadManifest, monitorLayer, M, union, center, fit, camera, applyCamera, showTimeline, place, at, tapAt, cursorSvg, chip, seg, easeInOut, easeOut, lerp, el } from "./film.js";

const S = await loadManifest("draft");
const { world, hud, fade } = setup();
const mon = monitorLayer(world, ["d-card", "d-empty", "d-draft"]);

const R = (shot, key) => M(S[shot].rects[key]);
const card = R("d-card", "card"), modal = R("d-empty", "modal"), gen = R("d-empty", "gen");
// 카드 안 기록 줄 (이름·번호 아래 ~ 그래프 위)
const cardLines = { x: card.x + 10, y: card.y + 80, width: card.width - 20, height: 150 };
// 근거 기록이 하나뿐인 문장 두 개를 차례로 잇는다: 화면 안에 보이고 문장과 기록 줄이 가까운 것부터 (선이 다른 문장을 가로지르지 않게)
// 문장 표시는 글 끝의 근거 수(dv-ev)까지
const midY = (r) => r.y + r.height / 2;
const pairs = S.pairs.filter((p) => p.rows.length === 1 && p.li && p.ev && p.rows[0].rect && p.li.y + p.li.height < 620 && p.rows[0].rect.y + p.rows[0].rect.height < 620)
  .sort((a, b) => Math.abs(midY(a.li) - midY(a.rows[0].rect)) - Math.abs(midY(b.li) - midY(b.rows[0].rect))).slice(0, 2).sort((a, b) => a.i - b.i).map((p) => {
  const li = M(p.li), ev = M(p.ev);
  return { li: { x: li.x, y: li.y, width: ev.x + ev.width + 4 - li.x, height: li.height }, row: M(p.rows[0].rect) };
});
// 초안 편집 창의 위쪽 (분량 막대·문장·기록 목록)
const linkView = { x: modal.x, y: modal.y, width: modal.width, height: 540 };

// 시각표 (초)
const T = { modal: 1.6, click: 2.8, draft: 2.95, link0: 3.8, link1: 5.1, net: 6.4, end: 10 };

const cam = camera([
  [0, fit(card, 70)],
  [1.3, fit(card, 60)],
  [2.0, fit(modal, 120, 0)],
  [3.1, fit(modal, 120, 0)],
  [3.8, fit(linkView, 50, 0)],
  [T.net, fit(linkView, 50, 0)],
  [T.net + 1.2, fit(linkView, 160, 0)],
]);
const monList = [[0, "d-card"], [T.modal, "d-empty", 0.4], [T.draft, "d-draft", 0.25]];

const cursor = cursorSvg();
const click = el("div", { class: "tap", style: { width: "36px", height: "36px", margin: "-18px 0 0 -18px" } });
const markCard = el("div", { class: "mark" });
const ns = "http://www.w3.org/2000/svg";
const links = pairs.map((p) => {
  const markLi = el("div", { class: "mark" }), markRow = el("div", { class: "mark" });
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", "trail");
  const path = document.createElementNS(ns, "path");
  svg.append(path);
  // 기록 줄 왼쪽 → 문장 오른쪽 끝
  const a = { x: p.row.x - 8, y: p.row.y + p.row.height / 2 }, b = { x: p.li.x + p.li.width + 8, y: p.li.y + p.li.height / 2 };
  const box = union({ x: a.x, y: a.y, width: 1, height: 1 }, { x: b.x, y: b.y, width: 1, height: 1 });
  const ox = box.x - 120, oy = box.y - 120;
  Object.assign(svg.style, { left: `${ox}px`, top: `${oy}px`, width: `${box.width + 240}px`, height: `${box.height + 240}px` });
  path.setAttribute("d", `M ${a.x - ox} ${a.y - oy} C ${a.x - ox - 90} ${a.y - oy}, ${b.x - ox + 90} ${b.y - oy}, ${b.x - ox} ${b.y - oy}`);
  world.append(markLi, markRow, svg);
  const len = path.getTotalLength();
  path.style.strokeDasharray = `${len}`;
  return { ...p, markLi, markRow, svg, path, len };
});
world.append(markCard, click, cursor);

/* ---------- 마무리: 기록 → 세특 문장 파티클 연결망 ---------- */
const net = el("canvas", { class: "net", width: "1920", height: "1080" });
const ctx = net.getContext("2d");
// 기록은 날짜 순(위가 먼저) 작은 점, 생기부 문장은 세 개만 큰 카드로:
// 근거 기록이 여럿인 문장 둘(초안 순서대로) + 모든 기록이 모이는 마지막 문장
const recOrder = S.records.map((r, k) => ({ ...r, k })).sort((a, b) => a.date.localeCompare(b.date));
const RX = 500, SX = 1010;
const recY = (i) => 580 + (i - (recOrder.length - 1) / 2) * Math.min(56, 720 / recOrder.length);
const last = S.pairs[S.pairs.length - 1];
const multi = S.pairs.slice(0, -1).filter((p) => p.rows.length >= 2).sort((a, b) => b.rows.length - a.rows.length).slice(0, 2).sort((a, b) => a.i - b.i);
const picked = [...multi, last];
const SY = [315, 580, 845];
const recPos = new Map(recOrder.map((r, i) => [r.k, { x: RX, y: recY(i) }]));
const sens = picked.map((p, i) => ({ ...p, pos: { x: SX, y: SY[i] } }));
const edges = [];
for (const s of sens) for (const r of s.rows) edges.push({ a: recPos.get(r.k), b: s.pos, s: s.i, n: edges.length });
const bez = (a, b, u) => {
  const c1 = { x: a.x + 240, y: a.y }, c2 = { x: b.x - 240, y: b.y }, v = 1 - u;
  return { x: v * v * v * a.x + 3 * v * v * u * c1.x + 3 * v * u * u * c2.x + u * u * u * b.x, y: v * v * v * a.y + 3 * v * v * u * c1.y + 3 * v * u * u * c2.y + u * u * u * b.y };
};
// 배경에 떠도는 입자 (시간만으로 위치가 정해지게: 같은 t 면 같은 그림)
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const dust = Array.from({ length: 70 }, () => ({ x: rnd() * 1920, y: rnd() * 1080, ax: 20 + rnd() * 40, ay: 14 + rnd() * 30, f: 0.25 + rnd() * 0.5, p: rnd() * 6.28, r: 1 + rnd() * 1.6 }));
const short = (s, n) => (s.length > n ? `${s.slice(0, n).trim()}…` : s);
const recLabels = recOrder.map((r) => {
  const p = recPos.get(r.k);
  const node = el("div", { class: "net-rec", html: `<small>${r.date}</small>${r.text}` });
  Object.assign(node.style, { left: `${p.x - 22 - 430}px`, top: `${p.y}px` });
  return node;
});
const senLabels = sens.map((s) => {
  const node = el("div", { class: "net-sen", html: `<small><i>세특</i>문장 ${s.i + 1} · 근거 기록 ${s.rows.length}건</small>${short(s.text, 62)}` });
  Object.assign(node.style, { left: `${s.pos.x + 30}px`, top: `${s.pos.y}px` });
  return node;
});
const colL = el("div", { class: "net-col", html: `<b>누가 기록</b> ${recOrder.length}건`, style: { left: `${RX - 22 - 430}px`, width: "430px", textAlign: "right", top: "146px" } });
const colR = el("div", { class: "net-col gold", html: `<b>학교생활기록부 · 세특</b> ${S.pairs.length}문장 중 ${sens.length}문장`, style: { left: `${SX + 30}px`, top: "146px" } });
const foot = el("div", { class: "net-foot", html: `${S.student.name} · 수업 중 남긴 기록 <b>${recOrder.length}건</b>이 모여 세특 <b>${S.pairs.length}문장</b>의 근거가 됩니다` });
const netLayer = el("div", { class: "net-layer", style: { position: "absolute", inset: "0", opacity: "0" } }, net, colL, colR, ...recLabels, ...senLabels, foot);
hud.append(netLayer);
const setChip = chip(hud);
hud.append(hud.querySelector(".chip"));

function drawNet(t) {
  const k = seg(t, T.net, T.net + 0.6);
  netLayer.style.opacity = String(easeInOut(k));
  if (k <= 0) return;
  ctx.clearRect(0, 0, 1920, 1080);
  // 배경 입자와 가까운 입자끼리의 옅은 선
  const pts = dust.map((d) => ({ x: d.x + Math.sin(t * d.f + d.p) * d.ax, y: d.y + Math.cos(t * d.f * 0.8 + d.p) * d.ay, r: d.r }));
  ctx.lineWidth = 1;
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y, d = Math.hypot(dx, dy);
    if (d < 170) { ctx.strokeStyle = `rgba(172,205,255,${(1 - d / 170) * 0.16})`; ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y); ctx.stroke(); }
  }
  for (const p of pts) { ctx.fillStyle = "rgba(172,205,255,.38)"; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill(); }

  // 기록 → 문장 연결선: 차례로 그려지고, 그 위로 빛 입자가 기록에서 문장으로 흐른다
  const t0 = T.net + 0.5;
  for (const e of edges) {
    const s = t0 + e.n * 0.05, p = easeInOut(seg(t, s, s + 0.7));
    if (p <= 0) continue;
    const grad = ctx.createLinearGradient(e.a.x, 0, e.b.x, 0);
    grad.addColorStop(0, "rgba(172,205,255,.38)"); grad.addColorStop(1, "rgba(255,215,106,.5)");
    ctx.strokeStyle = grad; ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let u = 0; u <= p + 1e-6; u += 0.02) { const q = bez(e.a, e.b, Math.min(u, p)); if (u === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y); }
    ctx.stroke();
    if (p < 1) continue;
    // 빛 입자: 기록에서 출발할 땐 하늘빛, 생기부에 닿을수록 금빛
    for (let j = 0; j < 2; j++) {
      const u = ((t - (s + 0.7)) * 0.5 + j / 2 + e.n * 0.13) % 1;
      const q = bez(e.a, e.b, u);
      const rgb = `${Math.round(lerp(172, 255, u))},${Math.round(lerp(205, 215, u))},${Math.round(lerp(255, 106, u))}`;
      const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, 10);
      g.addColorStop(0, "rgba(255,255,255,.95)"); g.addColorStop(0.35, `rgba(${rgb},.75)`); g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q.x, q.y, 10, 0, 6.283); ctx.fill();
    }
  }
  // 마디: 기록은 작은 하늘빛 점, 생기부 문장은 큰 금빛 마디. 숨 쉬듯 빛난다
  const node = (p, r, rgb, a, i, glow = 3.2) => {
    const pulse = 1 + 0.12 * Math.sin(t * 3 + i);
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * glow * pulse);
    g.addColorStop(0, `rgba(${rgb},${0.55 * a})`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r * glow * pulse, 0, 6.283); ctx.fill();
    ctx.fillStyle = `rgba(${rgb},${a})`; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.283); ctx.fill();
  };
  recOrder.forEach((r, i) => {
    const a = seg(t, T.net + 0.1 + i * 0.025, T.net + 0.4 + i * 0.025);
    node(recPos.get(r.k), 5.5, "172,205,255", a, i, 2.6);
    recLabels[i].style.opacity = String(a);
  });
  sens.forEach((s, i) => {
    const a = seg(t, T.net + 0.4 + i * 0.12, T.net + 0.8 + i * 0.12);
    node(s.pos, 16, "255,215,106", a, i + 5, 3.4);
    senLabels[i].style.opacity = String(a);
    senLabels[i].style.transform = `translateY(-50%) scale(${lerp(0.94, 1, easeOut(a))})`;
  });
  foot.style.opacity = String(seg(t, T.net + 1.6, T.net + 2.1));
}

const pad = (r, p) => ({ x: r.x - p, y: r.y - p, width: r.width + p * 2, height: r.height + p * 2 });

function draw(t) {
  applyCamera(world, cam(t));
  showTimeline(mon.imgs, monList, t);
  mon.show(1);
  // 연결망이 들어올 때 앱 화면은 뒤로 물러난다
  world.style.opacity = String(lerp(1, 0.06, easeInOut(seg(t, T.net - 0.1, T.net + 0.6))));
  world.style.filter = t > T.net - 0.1 ? `blur(${(6 * seg(t, T.net - 0.1, T.net + 0.6)).toFixed(2)}px)` : "none";

  // 쌓인 기록
  place(markCard, pad(cardLines, 4), Math.min(seg(t, 0.4, 0.7), 1 - seg(t, 1.3, 1.6)));

  // [생성] 누르기
  const g = center(gen);
  const cm = seg(t, 2.15, T.click - 0.05);
  at(cursor, { x: lerp(g.x - 280, g.x - 6, easeInOut(cm)), y: lerp(g.y - 220, g.y + 2, easeInOut(cm)) }, t > 2.05 && t < T.click + 0.5 ? Math.min(seg(t, 2.05, 2.25), 1 - seg(t, T.click + 0.2, T.click + 0.5)) : 0);
  tapAt(click, { x: g.x - 6, y: g.y + 2 }, t, T.click);

  // 문장 ↔ 근거 기록
  links.forEach((l, i) => {
    const t0 = i ? T.link1 : T.link0, t1 = i ? T.net : T.link1 - 0.05;
    const o = Math.min(seg(t, t0, t0 + 0.25), 1 - seg(t, t1 - 0.25, t1));
    place(l.markRow, pad(l.row, 3), o);
    l.path.style.strokeDashoffset = String(l.len * (1 - easeInOut(seg(t, t0 + 0.15, t0 + 0.65))));
    l.svg.style.opacity = String(t < t0 ? 0 : o);
    place(l.markLi, pad(l.li, 4), Math.min(seg(t, t0 + 0.55, t0 + 0.8), 1 - seg(t, t1 - 0.25, t1)));
  });

  drawNet(t);

  const steps = [[0, "01", "수업 중 쌓인 실제 기록"], [T.modal, "02", "생성 한 번, 그 기록으로 초안"], [T.link0, "03", "문장마다 근거가 된 기록"], [T.net, "04", "기록 하나하나가 세특 문장으로"]];
  let i = 0;
  for (let k = 0; k < steps.length; k++) if (t >= steps[k][0]) i = k;
  const edge = Math.min(i > 0 ? seg(t, steps[i][0], steps[i][0] + 0.25) : 1, i < steps.length - 1 ? 1 - seg(t, steps[i + 1][0] - 0.2, steps[i + 1][0]) : 1);
  setChip(edge, steps[i][1], steps[i][2]);

  fade.style.opacity = String(1 - seg(t, 0, 0.35));
}

await mount({ duration: T.end, draw });
