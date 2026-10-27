// 소개 영상 장면 엔진: 모든 움직임을 시간 t(초)의 함수로 그린다.
// render.mjs 는 window.renderAt(t) 를 프레임마다 불러 한 장씩 찍고, 브라우저에서 열면 ?play 로 미리 볼 수 있다.
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
/** t 가 [a, b] 안에서 얼마나 진행됐는지 0..1 */
export const seg = (t, a, b) => clamp((t - a) / (b - a));
export const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const easeOut = (x) => 1 - Math.pow(1 - x, 3);
export const easeIn = (x) => x * x * x;
export const lerp = (a, b, x) => a + (b - a) * x;
/** 들어왔다 나가는 불투명도: [a,b] 동안 보이고 양끝 fade 초 동안 서서히 */
export const window_ = (t, a, b, fade = 0.4) => Math.min(seg(t, a, a + fade), 1 - seg(t, b - fade, b));

export const $ = (sel, root = document) => root.querySelector(sel);

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "style" && typeof v === "object") Object.assign(node.style, v);
    else if (k === "html") node.innerHTML = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}

/** 모든 이미지가 디코딩된 뒤 resolve (첫 프레임부터 빈칸이 없게) */
export async function ready() {
  await document.fonts.ready;
  await Promise.all([...document.images].map((img) => (img.complete ? img.decode().catch(() => {}) : new Promise((r) => { img.onload = img.onerror = r; }).then(() => img.decode().catch(() => {})))));
}

/**
 * 장면을 등록한다. draw(t) 는 순수하게 t 만 보고 DOM 스타일을 정한다.
 * ?t=12.3 으로 한 장면을 보고, ?play 로 실시간 재생(스크럽바 포함)한다.
 */
export async function mount({ duration, draw }) {
  await ready();
  window.duration = duration;
  window.renderAt = (t) => { draw(Math.min(duration, Math.max(0, t))); return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); };
  const params = new URLSearchParams(location.search);
  if (params.has("play")) {
    const bar = el("input", { type: "range", min: "0", max: String(duration), step: "0.01", value: "0", class: "scrub" });
    document.body.append(bar);
    let start = performance.now(), paused = false, at = 0;
    bar.addEventListener("input", () => { at = Number(bar.value); start = performance.now() - at * 1000; draw(at); });
    document.addEventListener("keydown", (e) => { if (e.key === " ") { paused = !paused; start = performance.now() - at * 1000; } });
    const tick = () => {
      if (!paused) { at = ((performance.now() - start) / 1000) % duration; bar.value = String(at); draw(at); }
      requestAnimationFrame(tick);
    };
    tick();
  } else {
    draw(Number(params.get("t") || 0));
  }
  window.sceneReady = true;
}
