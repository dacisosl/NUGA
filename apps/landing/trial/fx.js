// 누가 체험: 효과음 · 흔들림 · 쿵 — 게임을 하는 것 같은 손맛.
// - 소리는 파일 없이 브라우저에서 바로 만든다(Web Audio): 내려받는 것이 없고, 은은하게(작은 소리 · 짧게) 낸다.
// - 처음 화면을 누를 때 소리 장치를 연다(브라우저는 손대기 전에는 소리를 못 낸다). 위쪽 막대의 스피커 단추로 끄고 켠다(이 기기에 기억).
// - 흔들림 · 쿵 · 불꽃은 Web Animations 로 얹는다: 화면에 이미 걸린 CSS 애니메이션과 겹치지 않는다.
//   '움직임 줄이기'를 켠 기기에서는 흔들림 · 불꽃을 내지 않는다. 소리는 나지만, 그런 기기에서는 장면이 한꺼번에 지나가므로
//   잔소리는 빼고 겹치는 소리 가운데 가장 중요한 것 하나만 낸다.
// - 큰 소리(쿵 · 화음 · 저장)끼리는 0.3초 안에 겹치지 않게 뒤의 것을 늦춘다. 이미 본 장면을 다시 볼 때는 조용히(calm).
// trial.js 는 FX.s("pop") 처럼 부르기만 한다. 이 파일이 없어도 체험은 그대로 돈다(trial.js 맨 위의 빈 FX).
"use strict";
(() => {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const KEY = "nuga.trial.sound";
  let on = true;
  try { on = localStorage.getItem(KEY) !== "off"; } catch { /* 저장소 없음 */ }
  const stage = document.getElementById("stage"), scene = document.getElementById("scene");

  /* ================= 소리 ================= */
  let ctx = null, bus = null, comp = null, noiseBuf = null;
  const VOL = 0.55;
  /** 새 음량 단: 앞서 예약해 둔 소리는 옛 단에 남아 들리지 않게 된다 (탭을 떠날 때 · 다시 그릴 때) */
  function freshBus() {
    try { bus?.disconnect(); } catch { /* 이미 끊김 */ }
    bus = ctx.createGain(); bus.gain.value = on ? VOL : 0;
    bus.connect(comp);
  }
  function open() {
    if (ctx || !on) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      ctx = new AC({ latencyHint: "interactive" });
      // 여러 소리가 겹쳐도 튀지 않게: 전체 음량 → 누르개
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -20; comp.knee.value = 18; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.18;
      comp.connect(ctx.destination);
      freshBus();
      const len = ctx.sampleRate;   // 1초짜리 흰 소음 (바람 · 딸깍 · 쿵의 재료)
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch { ctx = null; }
  }
  /** 손을 댈 때마다: 소리 장치를 열거나(처음) 다시 깨운다(탭을 떠났다 돌아온 뒤) */
  function unlock() {
    if (!on) return;
    open();
    if (ctx && ctx.state !== "running") ctx.resume().catch(() => {});
  }
  for (const ev of ["pointerdown", "touchend", "keydown", "click"]) addEventListener(ev, unlock, { capture: true, passive: true });
  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.hidden) { try { freshBus(); } catch { /* 닫힌 장치 */ } pend = null; ctx.suspend().catch(() => {}); }
    else if (on) ctx.resume().catch(() => {});
  });

  /** 음량 모양: 빠르게 올라갔다가 부드럽게 사라진다 */
  function env(g, t0, peak, a, dur) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }
  /** 음 하나. f → to 로 미끄러질 수 있다 */
  function tone(f, o = {}) {
    const t0 = ctx.currentTime + (o.at || 0), dur = o.dur || 0.15;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || "sine";
    osc.frequency.setValueAtTime(f, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + (o.glide || dur));
    env(g, t0, o.g || 0.08, o.a || 0.005, dur);
    osc.connect(g); g.connect(bus);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  }
  /** 걸러 낸 소음 한 줄기 (바람 · 딸깍 · 쿵의 숨) */
  function noise(o = {}) {
    const t0 = ctx.currentTime + (o.at || 0), dur = Math.min(0.9, o.dur || 0.1);
    const src = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf;
    flt.type = o.type || "bandpass"; flt.Q.value = o.q || 1;
    flt.frequency.setValueAtTime(o.f || 1000, t0);
    if (o.to) flt.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
    env(g, t0, o.g || 0.05, o.a || 0.004, dur);
    src.connect(flt); flt.connect(g); g.connect(bus);
    src.start(t0, Math.random() * 0.05); src.stop(t0 + dur + 0.05);
  }
  // 5음 음계(도 레 미 솔 라): 어떤 순서로 울려도 어울린다
  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  const up = (base, i) => base * 2 ** (PENTA[Math.max(0, i | 0) % PENTA.length] / 12);
  const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5, D6 = 1174.66, E6 = 1318.5, G6 = 1567.98;

  const SOUNDS = {
    /** 단추 누름: 가벼운 톡 */
    tap() { tone(880, { to: 640, dur: 0.05, g: 0.05 }); noise({ type: "highpass", f: 3200, dur: 0.014, g: 0.022 }); },
    /** 고르기: 밝은 두 음 */
    pick() { tone(E5, { type: "triangle", dur: 0.11, g: 0.075 }); tone(E5 * 1.5, { type: "triangle", at: 0.055, dur: 0.16, g: 0.07 }); },
    /** 글자 한 자: 아주 작은 딸깍 */
    key() { noise({ f: 1900 + Math.random() * 900, q: 2.2, dur: 0.022, g: 0.03 }); },
    /** 번호 칸: 물방울 뿅 (누를수록 음이 올라간다) */
    pop(o) { const f = up(440, o.i); tone(f, { to: f * 1.55, glide: 0.06, dur: 0.12, g: 0.12 }); tone(f * 2, { at: 0.012, dur: 0.07, g: 0.03 }); },
    /** 저장: 슉 + 딩 */
    save() { noise({ f: 500, to: 3200, dur: 0.15, g: 0.045, q: 0.9 }); tone(C6, { at: 0.09, dur: 0.5, g: 0.1 }); tone(G6, { at: 0.09, dur: 0.38, g: 0.045 }); tone(C6 * 2, { at: 0.095, dur: 0.2, g: 0.018 }); },
    /** 날아감: 휘익 */
    send() { noise({ f: 700, to: 4200, dur: 0.24, g: 0.055, q: 0.8 }); tone(380, { to: 1250, dur: 0.2, g: 0.035 }); },
    /** 도착: 맑은 두 음 */
    arrive() { tone(G5, { dur: 0.42, g: 0.085 }); tone(G5, { type: "triangle", dur: 0.2, g: 0.03 }); tone(D6, { at: 0.11, dur: 0.55, g: 0.085 }); tone(D6 * 2, { at: 0.115, dur: 0.22, g: 0.015 }); },
    /** 내려앉음: 낮은 툭 */
    land() { tone(150, { to: 52, dur: 0.17, g: 0.3, a: 0.003 }); noise({ type: "lowpass", f: 420, dur: 0.07, g: 0.085 }); tone(E5, { at: 0.02, dur: 0.16, g: 0.03 }); },
    /** 이어짐: 줄 튕김 */
    link(o) { const f = up(293.66, o.i); tone(f, { type: "triangle", dur: 0.2, g: 0.065, a: 0.003 }); tone(f * 2, { dur: 0.12, g: 0.022 }); },
    /** 생성 시작: 반짝이며 올라감 */
    gen() { [C5, E5, G5, C6, E6].forEach((f, i) => tone(f, { at: i * 0.055, dur: 0.22, g: 0.05 })); noise({ type: "highpass", f: 2500, to: 7000, dur: 0.42, g: 0.016 }); },
    /** 한 줄 채워짐: 작은 삑 (줄이 내려갈수록 음이 오른다) */
    row(o) { const f = up(587.33, o.i % 8); tone(f, { dur: 0.07, g: 0.05 }); },
    /** 한 단계 해냄: 올라가는 화음 */
    win() { [C5, E5, G5, C6].forEach((f, i) => { tone(f, { type: "triangle", at: i * 0.07, dur: 0.5, g: 0.07 }); tone(f, { at: i * 0.07, dur: 0.6, g: 0.045 }); }); noise({ type: "highpass", f: 5200, at: 0.2, dur: 0.3, g: 0.012 }); },
    /** 큰 순간: 쿵 + 환한 화음 */
    big() {
      tone(112, { to: 36, dur: 0.55, g: 0.36, a: 0.004 }); noise({ type: "lowpass", f: 260, dur: 0.2, g: 0.13 });
      [C5, E5, G5, C6, E6].forEach((f, i) => { tone(f, { at: 0.03, dur: 1.15, g: 0.05 }); tone(f, { type: "triangle", at: 0.03, dur: 0.6, g: 0.022 + i * 0.002 }); });
      tone(G6, { at: 0.2, dur: 0.5, g: 0.04 }); tone(C6 * 2, { at: 0.3, dur: 0.7, g: 0.035 });
      noise({ type: "highpass", f: 6000, at: 0.05, dur: 0.5, g: 0.014 });
    },
    /** 다음 장면: 부드러운 스윽 */
    step() { noise({ f: 320, to: 1900, dur: 0.2, g: 0.032, q: 0.7 }); tone(330, { to: 495, dur: 0.16, g: 0.028 }); },
    /** 뒤로 · 처음으로: 내려가는 두 음 */
    back() { tone(660, { dur: 0.08, g: 0.05 }); tone(495, { at: 0.06, dur: 0.1, g: 0.05 }); },
    /** 아직 안 됨: 낮게 둥 */
    warn() { tone(220, { to: 190, type: "triangle", dur: 0.2, g: 0.075 }); },
    /** 초 읽기: 똑 */
    tick() { tone(1000, { dur: 0.03, g: 0.035 }); noise({ type: "highpass", f: 4000, dur: 0.01, g: 0.015 }); },
  };
  // 같은 소리가 너무 촘촘히 겹치지 않게 (이름별 가장 짧은 간격, ms)
  const GAP = { key: 34, row: 42, tap: 45, pop: 40, link: 60, tick: 80 };
  const last = {};
  let specificAt = 0, errors = 0;
  const SMALL = new Set(["key", "row", "tick", "link"]);          // 잔소리 (촘촘히 이어지는 것)
  const LOUD = new Set(["big", "win", "land", "save"]);           // 큰 소리 (서로 겹치면 시끄럽다)
  const PRIO = { big: 5, win: 4, land: 4, save: 4, arrive: 3, gen: 3, send: 3, pop: 2, pick: 2, warn: 2, step: 1, back: 1, tap: 1 };
  let calm = false, loudAt = -1e9, pend = null, pendTimer = null;
  /** 자동 검사가 '실제로 낸' 효과를 볼 수 있게 (window.__fxPlayed 배열이 있을 때만 적는다) */
  const seen = (x) => { const a = window.__fxPlayed; if (Array.isArray(a)) a.push(x); };
  /** 이미 본 장면을 다시 볼 때: 잔소리 · 번쩍 · 불꽃 없이, 흔들림은 살짝만, 가장 큰 소리는 한 단계 작게 */
  function setCalm(v) { calm = !!v; }
  /** 실제로 소리를 만든다 (소리 장치가 막 깨어나는 중이면 깨어난 뒤. 너무 늦었으면 버린다: 엉뚱한 때 울리지 않게) */
  function fire(name, o) {
    seen(name);
    const t = performance.now();
    const play = () => { try { SOUNDS[name](o || {}); } catch { errors++; /* 소리 실패는 체험을 막지 않는다 */ } };
    if (ctx.state === "running") return play();
    ctx.resume().then(() => { if (on && performance.now() - t < 450) play(); }).catch(() => {});
  }
  /** 소리 내기. 소리가 꺼져 있거나 아직 손대지 않았으면 아무 일도 없다 */
  function s(name, o) {
    const now = performance.now();
    if (name !== "tap") specificAt = now;
    if (!on || !ctx || !SOUNDS[name] || document.hidden) return;
    if (calm) { if (SMALL.has(name)) return; if (name === "big") name = "win"; }
    if (now - (last[name] || 0) < (GAP[name] ?? 70)) return;
    last[name] = now;
    if (reduced) {
      // 움직임 줄이기: 저절로 넘어가는 장면이 한꺼번에 지나가 소리가 몰린다 → 잔소리는 빼고, 0.09초 동안 모아 가장 중요한 것 하나만
      if (SMALL.has(name)) return;
      if (!pend || (PRIO[name] || 0) > (PRIO[pend.name] || 0)) pend = { name, o };
      if (!pendTimer) pendTimer = setTimeout(() => { const p = pend; pend = null; pendTimer = null; if (p && on && !document.hidden) fire(p.name, p.o); }, 90);
      return;
    }
    if (LOUD.has(name)) {
      // 큰 소리끼리는 0.3초 안에 겹치지 않게: 뒤의 것을 그만큼 늦춘다
      const at = Math.max(now, loudAt + 300);
      loudAt = at;
      if (at > now + 4) { setTimeout(() => { if (on && !document.hidden) fire(name, o); }, at - now); return; }
    }
    fire(name, o);
  }
  // 따로 소리가 없는 단추 · 링크: 누르면 가벼운 톡 (그 누름으로 다른 소리가 났으면 내지 않는다)
  addEventListener("click", (e) => {
    const el = e.target instanceof Element ? e.target.closest("button, a, [role=button], summary") : null;
    if (!el || el.disabled || el.id === "snd") return;
    const at = performance.now();
    setTimeout(() => { if (specificAt < at) s("tap"); }, 0);
  }, true);

  /* ================= 움직임 ================= */
  const buzz = (ms) => { if (on && !reduced) { try { navigator.vibrate?.(ms); } catch { /* 진동 없는 기기 */ } } };
  let shakeUntil = 0;
  /** 장면 흔들기: 1 살짝 · 2 덜컹 · 3 쿵 (위쪽 막대는 가만히 있다) */
  function shake(level = 1) {
    if (reduced || document.hidden || !scene?.animate) return;
    if (calm) level = 1;
    const now = performance.now();
    if (now < shakeUntil) return;   // 흔들리는 중에는 겹치지 않는다
    seen(`shake:${Math.max(1, Math.min(3, level | 0))}`);
    const a = [0, 2.5, 5, 9][Math.max(1, Math.min(3, level | 0))], dur = [0, 170, 260, 420][Math.max(1, Math.min(3, level | 0))];
    shakeUntil = now + dur;
    const k = [[0, 0, 0], [-1, 0.5, -0.12], [0.9, -0.7, 0.1], [-0.7, 0.6, -0.08], [0.5, -0.4, 0.05], [-0.25, 0.2, 0], [0, 0, 0]];
    scene.animate(k.map(([x, y, r]) => ({ translate: `${(x * a).toFixed(1)}px ${(y * a).toFixed(1)}px`, rotate: `${(r * a / 9).toFixed(2)}deg` })), { duration: dur, easing: "ease-out" });
    if (level >= 2) buzz(level >= 3 ? 26 : 12);
  }
  const elOf = (t) => (typeof t === "string" ? document.querySelector(t) : t instanceof Element ? t : null);
  /** 한 곳에 쿵: 눌렸다가 튀어 오른다 */
  function thud(target) {
    const el = elOf(target);
    if (!el || reduced || document.hidden || !el.animate) return;
    el.animate([{ scale: "1 1" }, { scale: "1.07 0.9", offset: 0.22 }, { scale: "0.96 1.06", offset: 0.5 }, { scale: "1.02 0.985", offset: 0.75 }, { scale: "1 1" }], { duration: 430, easing: "cubic-bezier(.2,.8,.3,1)" });
    buzz(10);
  }
  /** 무대(960×540) 안 좌표로: 화면에 보이는 자리에서 무대의 확대 · 회전을 되돌린다 */
  function stagePoint(el) {
    const er = el.getBoundingClientRect(), sr = stage.getBoundingClientRect();
    const rot = document.documentElement.classList.contains("rot");
    const S = (rot ? sr.height / 960 : sr.width / 960) || 1;
    const px = er.left + er.width / 2, py = er.top + er.height / 2;
    return rot ? { x: (py - sr.top) / S, y: (sr.right - px) / S } : { x: (px - sr.left) / S, y: (py - sr.top) / S };
  }
  let layer = null;
  function fxLayer() {
    if (!layer || !layer.isConnected) { layer = document.createElement("div"); layer.className = "fx-layer"; layer.setAttribute("aria-hidden", "true"); stage.append(layer); }
    return layer;
  }
  const COLORS = { spark: ["#ffd76a", "#fff3c4", "#ffffff", "#accdff"], confetti: ["#ffb300", "#ff6b57", "#2f6fe0", "#27b47a", "#8f5bff", "#ffd76a"] };   // 밝은 종이 위에서도 보이게 짙은 색
  /** 불꽃 · 색종이: 그 자리에서 터져 흩어진다 */
  function burst(target, o = {}) {
    const el = elOf(target);
    if (!el || reduced || calm || document.hidden || !stage?.animate) return;
    const kind = o.kind === "confetti" ? "confetti" : "spark";
    seen(`burst:${kind}`);
    const n = Math.max(4, Math.min(48, o.n || (kind === "confetti" ? 26 : 12)));
    const { x, y } = stagePoint(el), L = fxLayer(), cols = COLORS[kind];
    for (let i = 0; i < n; i++) {
      const p = document.createElement("i");
      p.className = `fx-p ${kind}`;
      const ang = (i / n) * Math.PI * 2 + Math.random() * 0.7, far = (kind === "confetti" ? 70 : 34) + Math.random() * (kind === "confetti" ? 130 : 60);
      const dx = Math.cos(ang) * far, dy = Math.sin(ang) * far - (kind === "confetti" ? 40 : 10), fall = kind === "confetti" ? 70 + Math.random() * 90 : 14;
      const size = kind === "confetti" ? 6 + Math.random() * 6 : 3 + Math.random() * 4;
      Object.assign(p.style, { left: `${x}px`, top: `${y}px`, width: `${size}px`, height: `${kind === "confetti" ? size * 1.6 : size}px`, background: cols[i % cols.length] });
      L.append(p);
      const dur = (kind === "confetti" ? 900 : 520) + Math.random() * 380, spin = (Math.random() - 0.5) * 720;
      p.animate([
        { translate: "0 0", rotate: "0deg", opacity: 1, scale: "0.4" },
        { translate: `${dx.toFixed(0)}px ${dy.toFixed(0)}px`, rotate: `${(spin * 0.6).toFixed(0)}deg`, opacity: 1, scale: "1", offset: 0.45 },
        { translate: `${(dx * 1.15).toFixed(0)}px ${(dy + fall).toFixed(0)}px`, rotate: `${spin.toFixed(0)}deg`, opacity: 0, scale: "0.7" },
      ], { duration: dur, easing: "cubic-bezier(.15,.7,.3,1)", fill: "forwards" }).onfinish = () => p.remove();
    }
  }
  /** 환하게 번쩍 (아주 짧게) */
  function flash() {
    if (reduced || calm || document.hidden || !stage?.animate) return;
    seen("flash");
    const f = document.createElement("i");
    f.className = "fx-flash";
    fxLayer().append(f);
    f.animate([{ opacity: 0 }, { opacity: 0.26, offset: 0.25 }, { opacity: 0 }], { duration: 300, easing: "ease-out" }).onfinish = () => f.remove();
  }

  /* ================= 끄고 켜기 ================= */
  const ICON_ON = '<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.6 7.6 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  const ICON_OFF = '<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  function paint(btn) {
    btn.innerHTML = on ? ICON_ON : ICON_OFF;
    btn.setAttribute("aria-pressed", String(on));
    btn.setAttribute("aria-label", on ? "효과음 끄기" : "효과음 켜기");
    btn.title = on ? "효과음 끄기" : "효과음 켜기";
    btn.classList.toggle("off", !on);
  }
  function mount() {
    const top = document.querySelector("header.top");
    if (!top || document.getElementById("snd")) return;
    const btn = document.createElement("button");
    btn.type = "button"; btn.id = "snd"; btn.className = "tb snd";
    paint(btn);
    btn.addEventListener("click", () => {
      on = !on;
      try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* 저장소 없음 */ }
      paint(btn);
      // 끄면 울리던 소리도 바로 잦아들게 전체 음량을 내린다. 소리 장치는 재우지 않는다(다시 켤 때 바로 소리가 나게)
      if (ctx && bus) { try { bus.gain.cancelScheduledValues(ctx.currentTime); bus.gain.setTargetAtTime(on ? VOL : 0, ctx.currentTime, 0.015); } catch { /* 닫힌 장치 */ } }
      if (!on) pend = null;
      if (on) { unlock(); s("pick"); }
    });
    // 오른쪽 끝 [처음으로] 앞에
    top.insertBefore(btn, top.querySelector("#home"));
  }
  mount();

  // state · errors · names 는 자동 검사용 (소리 장치 상태, 소리를 만들다 난 오류 수, 소리 이름)
  window.FX = { s, shake, thud, burst, flash, calm: setCalm, get on() { return on; }, get state() { return ctx ? ctx.state : "none"; }, get errors() { return errors; }, names: Object.keys(SOUNDS) };
})();
