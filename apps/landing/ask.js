// 소개 페이지의 [?] 묻고 답하기 + 체험에서 넘어왔을 때 한 번만 보이는 안내.
// - 답은 앱 도움말과 같은 자료·같은 답 찾기(ask-data.js = packages/core/src/help.ts 묶음)로 찾는다. AI·서버 없이, 입력은 밖으로 보내지 않는다.
// - 설명서 밖의 지엽적인 질문·엉뚱한 질문은 '제작자에게 물어봐주세요'로 안내한다.
// - 체험 마지막의 [앱 소개 페이지로]는 ?from=trial 을 달고 온다. 이 브라우저에서 처음일 때만 [?] 와 '아래로 둘러보기'를 짚어 준다
//   (부스 태블릿 ?booth=1 은 사람이 바뀌므로 매번).
(() => {
  const H = window.NugaHelp;
  const btn = document.querySelector("#ask-button");
  if (!H || !btn) return;
  const APP = "https://dacisosl.github.io/NUGA/app/";
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const byId = (id) => H.HELP_FAQ.find((f) => f.id === id);

  /* ---------- 묻고 답하기 칸 ---------- */
  const panel = el("aside", "ask-panel");
  panel.id = "ask-panel"; panel.hidden = true;
  panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "누가에게 묻고 답하기");
  panel.innerHTML = `
    <div class="ask-h"><span class="ask-mark" aria-hidden="true">?</span><b>묻고 답하기</b><small>누가 사용법</small><button type="button" class="ask-x" aria-label="닫기" title="닫기 (Esc)">×</button></div>
    <div class="ask-msgs" aria-live="polite"></div>
    <form class="ask-in"><textarea rows="1" maxlength="300" aria-label="질문" placeholder="예: 반 명단은 어떻게 넣어요?"></textarea><button type="submit" class="ask-send">보내기</button></form>
    <p class="ask-foot">사용법을 바로 찾아 답해요 · 입력한 내용은 밖으로 보내지 않아요</p>`;
  document.body.append(panel);
  const msgs = panel.querySelector(".ask-msgs"), form = panel.querySelector("form"), input = panel.querySelector("textarea");

  const chips = (list, label) => {
    if (!list || !list.length) return null;
    const box = el("div", "ask-chips");
    if (label) box.append(el("span", "", label));
    for (const f of list) { const b = el("button", "", f.q); b.type = "button"; b.addEventListener("click", () => ask(f.q)); box.append(b); }
    return box;
  };
  const say = (role, text) => { const m = el("div", `ask-msg ${role}`); m.append(el("p", "", text)); msgs.append(m); return m; };
  const REL = { unsure: "혹시 이 질문인가요?", ambiguous: "이런 걸 물어보실 수 있어요", chat: "이런 걸 물어보실 수 있어요" };

  function ask(raw) {
    const q = String(raw || "").trim();
    if (!q) return;
    input.value = ""; fit();
    say("user", q);
    const r = H.searchHelp(q);
    const m = say("bot", r.text);
    if (r.kind === "answer" || r.kind === "data") {
      const a = el("a", "ask-go", "앱에서 해 보기 →"); a.href = APP; m.append(a);
      m.append(el("small", "ask-src", r.kind === "answer" ? `설명서 · ${r.best.q}` : "설명서"));
    } else if (r.kind === "maker" || r.kind === "unsure") {
      m.append(el("small", "ask-src", "설명서에 없는 내용"));
    }
    const c = chips(r.related, REL[r.kind] || "관련 질문");
    if (c) m.append(c);
    msgs.scrollTo({ top: msgs.scrollHeight, behavior: reduced.matches ? "auto" : "smooth" });
  }
  function fit() { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 96) + "px"; }

  // 첫 인사 + 처음 칩
  const hello = say("bot", "누가 사용법을 물어보세요. 설명서에 있는 것은 바로 답하고, 없는 것은 제작자에게 이어 드려요.");
  hello.append(chips(["about", "start", "phone", "draft"].map(byId).filter(Boolean)));

  form.addEventListener("submit", (e) => { e.preventDefault(); ask(input.value); });
  input.addEventListener("input", fit);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(input.value); } });

  function open() { endTour(); panel.hidden = false; btn.setAttribute("aria-expanded", "true"); input.focus({ preventScroll: true }); }
  function close() { panel.hidden = true; btn.setAttribute("aria-expanded", "false"); btn.focus({ preventScroll: true }); }
  btn.addEventListener("click", () => (panel.hidden ? open() : close()));
  panel.querySelector(".ask-x").addEventListener("click", close);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden) close(); });
  // 칸 안에서 굴려도 뒤 페이지(화면 단위 스크롤)는 움직이지 않게
  panel.addEventListener("wheel", (e) => e.stopPropagation(), { passive: true });

  /* ---------- 체험에서 넘어왔을 때: 처음 한 번만 안내 ---------- */
  const params = new URLSearchParams(location.search);
  const fromTrial = params.get("from") === "trial", booth = params.has("booth");
  const KEY = "nuga.landing.tour";
  let seen = false;
  try { seen = localStorage.getItem(KEY) === "1"; } catch {}
  if (fromTrial) {
    // 주소에서 표시를 지워 새로 고침·공유해도 다시 뜨지 않게 (부스 표시는 남긴다)
    params.delete("from");
    const rest = params.toString();
    try { history.replaceState(null, "", location.pathname + (rest ? `?${rest}` : "") + location.hash); } catch {}
  }
  let tour = null;
  if (fromTrial && (booth || !seen)) {
    try { localStorage.setItem(KEY, "1"); } catch {}
    tour = el("div", "ask-tour");
    tour.setAttribute("role", "dialog"); tour.setAttribute("aria-label", "소개 페이지 안내");
    tour.innerHTML = `
      <div class="ask-tour-dim" aria-hidden="true"></div>
      <div class="ask-tip ask-tip-help"><b>더 궁금한 건 여기서 물어보세요</b><span>사용법을 물으면 바로 답해 드려요</span></div>
      <div class="ask-tip ask-tip-scroll"><b>아래로 스크롤하며 둘러보세요</b><span>누가가 어떻게 기록을 돕는지 화면마다 보여 드려요</span><i aria-hidden="true"></i><button type="button" class="ask-tour-ok">알겠어요</button></div>`;
    document.body.append(tour);
    btn.classList.add("is-tour");
    const ok = tour.querySelector(".ask-tour-ok");
    ok.addEventListener("click", endTour);
    // 스크롤을 시작하면(또는 다른 곳을 누르면) 알아들은 것으로 보고 걷는다
    const later = () => { if (window.scrollY > 40) endTour(); };
    window.addEventListener("scroll", later, { passive: true });
    window.addEventListener("wheel", endTour, { passive: true, once: true });
    window.addEventListener("touchmove", endTour, { passive: true, once: true });
    window.addEventListener("keydown", (e) => { if (["ArrowDown", "PageDown", " ", "Escape", "End"].includes(e.key)) endTour(); });
    tour.querySelector(".ask-tour-dim").addEventListener("click", endTour);
    requestAnimationFrame(() => { tour.classList.add("is-on"); place(); ok.focus({ preventScroll: true }); });
    window.addEventListener("resize", place);
  }
  // [?] 아래에 말풍선 꼬리가 오도록 자리 잡기
  function place() {
    if (!tour) return;
    const r = btn.getBoundingClientRect(), tip = tour.querySelector(".ask-tip-help");
    const w = tip.offsetWidth, x = Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w + 34));
    tip.style.left = `${x}px`; tip.style.top = `${r.bottom + 14}px`;
    tip.style.setProperty("--tail", `${r.left + r.width / 2 - x}px`);
  }
  function endTour() {
    if (!tour) return;
    const t = tour; tour = null;
    btn.classList.remove("is-tour");
    t.classList.remove("is-on");
    setTimeout(() => t.remove(), reduced.matches ? 0 : 260);
  }
})();
