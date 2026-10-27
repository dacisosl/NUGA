// 두 영상이 함께 쓰는 '세계'와 카메라.
// 세계 좌표 = 앱 화면의 CSS 픽셀. 왼쪽에 폰(앱의 모바일 화면), 오른쪽에 모니터(앱 PC 화면 1440×900)를 놓고
// 카메라(16:9 사각형)가 시간에 따라 옮겨 가며 1920×1080 무대에 비춘다.
import { clamp, seg, easeInOut, easeOut, lerp, el } from "./engine.js";

export const W = 1920, H = 1080;
export const PHONE = { x: 0, y: 110 };
export const MON = { x: 780, y: 0, w: 1440, h: 900, pad: 18 };

export const shotUrl = (name) => `shots/${name}.png`;
export async function loadManifest(group) {
  const all = await (await fetch("shots/manifest.json", { cache: "no-store" })).json();
  return all[group];
}

/** 무대 · 세계 · 화면 고정층 */
export function setup() {
  const stage = el("div", { class: "stage" });
  const world = el("div", { class: "world" });
  const hud = el("div", { class: "hud" });
  const fade = el("div", { class: "fade" });
  stage.append(world, hud, fade);
  document.body.append(stage);
  return { stage, world, hud, fade };
}

/** 폰 화면 이미지들 (모두 같은 자리) */
export function phoneLayer(world, shots, names) {
  const s = shots[names[0]];
  const box = el("div", { class: "phone-box", style: { left: `${PHONE.x}px`, top: `${PHONE.y}px`, width: `${s.width}px`, height: `${s.height}px` } });
  const imgs = {};
  for (const n of names) {
    const img = el("img", { class: "shot phone-shot", src: shotUrl(n), style: { position: "absolute", left: "0", top: "0", width: "100%", height: "100%", opacity: "0" } });
    box.append(img);
    imgs[n] = img;
  }
  world.append(box);
  return { box, imgs, size: { w: s.width, h: s.height } };
}

/** 모니터(베젤·받침) 안에 PC 화면 이미지들 */
export function monitorLayer(world, names) {
  const { x, y, w, h, pad } = MON;
  const frame = el("div", { class: "monitor", style: { left: `${x - pad}px`, top: `${y - pad}px`, width: `${w + pad * 2}px`, height: `${h + pad * 2}px` } });
  const screen = el("div", { class: "monitor-screen", style: { position: "absolute", left: `${pad}px`, top: `${pad}px`, width: `${w}px`, height: `${h}px` } });
  frame.append(screen);
  const neck = el("div", { class: "neck", style: { left: `${x + w / 2 - 110}px`, top: `${y + h + pad}px`, width: "220px", height: "120px" } });
  const foot = el("div", { class: "foot", style: { left: `${x + w / 2 - 260}px`, top: `${y + h + pad + 120}px`, width: "520px", height: "22px" } });
  world.append(neck, foot, frame);
  const imgs = {};
  for (const n of names) {
    const img = el("img", { class: "shot", src: shotUrl(n), style: { opacity: "0" } });
    screen.append(img);
    imgs[n] = img;
  }
  /** 모니터 전체(받침 포함) 불투명도 */
  const show = (o) => { for (const n of [frame, neck, foot]) n.style.opacity = String(o); };
  return { frame, imgs, show };
}

/** 앱 화면 안 사각형 → 세계 좌표 */
export const P = (r) => ({ x: PHONE.x + r.x, y: PHONE.y + r.y, width: r.width, height: r.height });
export const M = (r) => ({ x: MON.x + r.x, y: MON.y + r.y, width: r.width, height: r.height });
export const union = (...rs) => {
  const x = Math.min(...rs.map((r) => r.x)), y = Math.min(...rs.map((r) => r.y));
  return { x, y, width: Math.max(...rs.map((r) => r.x + r.width)) - x, height: Math.max(...rs.map((r) => r.y + r.height)) - y };
};
export const center = (r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

/** 사각형이 들어오는 16:9 카메라. minW 보다 좁히지 않는다 (원본 2배 해상도를 넘겨 키우지 않게) */
export function fit(r, pad = 40, minW = 680) {
  const w = Math.max(minW, r.width + pad * 2, (r.height + pad * 2) * 16 / 9);
  const c = center(r);
  return { x: c.x - w / 2, y: c.y - (w * 9 / 16) / 2, w };
}

/** 카메라 열쇠 [[t, cam], ...] 사이를 부드럽게 옮긴다 */
export function camera(keys) {
  return (t) => {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [t1, c1] = keys[i];
      if (t <= t1) {
        const [t0, c0] = keys[i - 1];
        const k = easeInOut(seg(t, t0, t1));
        // 확대 비율은 로그로 보간해야 줌이 고르게 느껴진다
        const w = Math.exp(lerp(Math.log(c0.w), Math.log(c1.w), k));
        const cx = lerp(c0.x + c0.w / 2, c1.x + c1.w / 2, k), cy = lerp(c0.y + c0.w * 9 / 32, c1.y + c1.w * 9 / 32, k);
        return { x: cx - w / 2, y: cy - w * 9 / 32, w };
      }
    }
    return keys[keys.length - 1][1];
  };
}

export function applyCamera(world, cam) {
  const s = W / cam.w;
  world.style.transform = `scale(${s}) translate(${-cam.x}px, ${-cam.y}px)`;
}

/** 시점 목록 [[t, name, dur?], ...]: t 이후로 그 화면. 바뀔 때 dur 초(기본 0.35) 동안 겹쳐 바꾼다 */
export function showTimeline(imgs, list, t) {
  let cur = -1;
  for (let i = 0; i < list.length; i++) if (t >= list[i][0]) cur = i;
  for (const img of Object.values(imgs)) img.style.opacity = "0";
  if (cur < 0) return null;
  const [tc, name, dur = 0.35] = list[cur];
  imgs[name].style.opacity = "1";
  if (cur > 0 && dur > 0 && t - tc < dur) {
    const prev = list[cur - 1][1];
    if (prev !== name) {
      imgs[prev].style.opacity = "1";
      imgs[name].style.opacity = String(easeInOut((t - tc) / dur));
      // 새 화면을 위에 둔다
      imgs[prev].style.zIndex = "1"; imgs[name].style.zIndex = "2";
    }
  } else imgs[name].style.zIndex = "2";
  return name;
}

/** 프레임 묶음 names 를 [a, b] 동안 차례로 (그 밖이면 null) */
export function sequence(names, t, a, b) {
  if (t < a || t > b) return null;
  return names[Math.min(names.length - 1, Math.floor(seg(t, a, b) * names.length))];
}

export function place(node, r, o = 1) {
  Object.assign(node.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.width}px`, height: `${r.height}px`, opacity: String(o) });
}
export function at(node, p, o = 1, scale = 1) {
  Object.assign(node.style, { left: `${p.x}px`, top: `${p.y}px`, opacity: String(o), transform: `scale(${scale})` });
}

/** 누름 물결: 시각 tt 에 눌러 0.6초 동안 퍼짐 */
export function tapAt(node, p, t, tt) {
  const k = seg(t, tt - 0.12, tt + 0.55);
  if (k <= 0 || k >= 1) { node.style.opacity = "0"; return; }
  const press = t < tt ? 1 - 0.25 * seg(t, tt - 0.12, tt) : 0.75 + 0.9 * easeOut(seg(t, tt, tt + 0.55));
  at(node, p, t < tt ? seg(t, tt - 0.12, tt) : 1 - seg(t, tt + 0.15, tt + 0.55), press);
}

export const cursorSvg = () => {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 22 30");
  svg.setAttribute("class", "cursor");
  svg.innerHTML = '<path d="M2 2 L2 24 L8 18.5 L12 27.5 L15.5 26 L11.6 17.2 L19.5 17.2 Z" fill="#fff" stroke="#0b1d33" stroke-width="1.6" stroke-linejoin="round"/>';
  return svg;
};

export function chip(hud) {
  const node = el("div", { class: "chip" }, el("span"), el("b"));
  hud.append(node);
  let last = "";
  return (o, num, text) => {
    node.style.opacity = String(o);
    const key = num + text;
    if (key !== last) { node.querySelector("span").textContent = num; node.querySelector("b").textContent = text; last = key; }
  };
}

export { clamp, seg, easeInOut, easeOut, lerp, el };
