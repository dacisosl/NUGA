// 도움말: 위쪽 막대 [?](또는 F1) → 오른쪽 칸. [사용설명서 | 묻고 답하기]
// - 사용설명서: 핵심 7절, 절마다 [바로 가기]로 그 화면을 연다.
// - 묻고 답하기: 앱 사용법만 답한다. AI 가 없으면 설명서에서 찾아 답하고(외부 전송 없음),
//   AI 가 있으면 설명서만 근거로 AI 가 답한다(질문 속 학생 이름은 '학생'으로 가려 보낸다). 학생 기록은 읽지 않는다.
// 대화는 이 실행 동안만 남고 저장하지 않는다.
import React, { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import {
  HELP_FAQ, HELP_FLOW, HELP_SECTIONS, HELP_STARTERS, PROVIDER_INFO, helpChatRequest, searchHelp,
  type HelpFaq, type HelpGo, type HelpLink, type HelpTurn,
} from "@nuga/core";
import { useStore } from "../store";
import { aiErrorText, aiReady } from "../lib/ai";
import { providerFor } from "../lib/providers";
import { enterWhale, useWhale } from "../lib/whale";
import { Icon } from "./ui";
import "./help.css";

type Tab = "manual" | "chat";
interface Msg { id: number; role: "user" | "bot"; text: string; src?: string; note?: string; links?: HelpLink[]; related?: HelpFaq[]; pending?: boolean }
interface HelpState { tab: Tab | null; msgs: Msg[]; useAi: boolean }
export const useHelp = create<HelpState>(() => ({ tab: null, msgs: [], useAi: true }));

let seq = 0;
const narrow = () => window.matchMedia("(max-width: 760px)").matches;

/** 도움말 열기·닫기 (오른쪽 칸은 하나만: 열면 웨일 둘러보기 칸은 알약으로 접는다) */
export function openHelp(tab: Tab = "manual") {
  if (useWhale.getState().on) useWhale.setState({ min: true });
  useHelp.setState({ tab });
}
export function closeHelp() { useHelp.setState({ tab: null }); }
export function toggleHelp() { if (useHelp.getState().tab) closeHelp(); else openHelp(); }

/** [바로 가기]: 그 화면을 연다. 좁은 화면에서는 시트를 닫아 화면이 보이게 한다 */
function go(g: HelpGo) {
  const st = useStore.getState();
  if (g === "chat") { useHelp.setState({ tab: "chat" }); return; }
  if (g === "whale") {
    closeHelp();
    st.toast({ text: "웨일 모드를 준비하는 중 · 데모 영역을 따로 만들어요 (선생님 기록은 그대로)", ttl: 3000 });
    void enterWhale("app");
    return;
  }
  if (g === "main" || g === "draft" || g === "mobile") st.setPage(g);
  else if (g === "inbox") st.openInbox({ backlog: true });
  else if (g === "bulk") st.setBulkOpen(true);
  else if (g.startsWith("settings:")) { st.setPage("settings"); st.setSettingsTab(g.slice(9)); }
  if (narrow()) closeHelp();
}

function Links({ links }: { links?: HelpLink[] }) {
  if (!links?.length) return null;
  return <div className="hp-links">{links.map((l) => <button key={l.go} type="button" className="hp-go" onClick={() => go(l.go)}>{l.label} <span aria-hidden="true">→</span></button>)}</div>;
}

export function HelpPanel() {
  const tab = useHelp((s) => s.tab);
  const loaded = useStore((s) => s.loaded);
  // F1 = 열기·닫기, Esc = 닫기 (다른 창이 떠 있으면 그 창이 먼저)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "F1") { e.preventDefault(); toggleHelp(); return; }
      if (e.key === "Escape" && useHelp.getState().tab && !useStore.getState().inbox && !document.querySelector(".overlay")) { closeHelp(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  if (!tab || !loaded) return null;
  return (
    <aside className="help-panel" role="complementary" aria-label="도움말">
      <div className="hp-h">
        <Icon name="help" size={18} />
        <b>도움말</b>
        <div className="hp-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "manual"} className={tab === "manual" ? "on" : ""} onClick={() => useHelp.setState({ tab: "manual" })}>사용설명서</button>
          <button type="button" role="tab" aria-selected={tab === "chat"} className={tab === "chat" ? "on" : ""} onClick={() => useHelp.setState({ tab: "chat" })}>묻고 답하기</button>
        </div>
        <button type="button" className="hp-x" onClick={closeHelp} aria-label="도움말 닫기" title="닫기 (Esc)">×</button>
      </div>
      {tab === "manual" ? <Manual /> : <Chat />}
    </aside>
  );
}

/* ---------- 사용설명서 ---------- */
const FLOW_SEC = ["record", "inbox", "board", "draft"];
function Manual() {
  const box = useRef<HTMLDivElement>(null);
  const jump = (id: string) => box.current?.querySelector<HTMLElement>(`[data-sec="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  return (
    <div className="hp-b" ref={box}>
      <p className="hp-lead">누가는 이렇게 씁니다</p>
      <ol className="hp-flow">{HELP_FLOW.split(" → ").map((t, i) => <li key={t}><button type="button" onClick={() => jump(FLOW_SEC[i])}>{t}</button></li>)}</ol>
      {HELP_SECTIONS.map((s, i) => (
        <section key={s.id} className="hp-sec" data-sec={s.id}>
          <h3><i>{i + 1}</i>{s.title}{s.tag && <small>{s.tag}</small>}</h3>
          <p className="hp-when">{s.when}</p>
          <ul>{s.lines.map((l) => <li key={l}>{l}</li>)}</ul>
          <Links links={s.links} />
        </section>
      ))}
      <p className="hp-more">더 궁금한 것은 <button type="button" onClick={() => go("chat")}>묻고 답하기</button>에서 물어보세요.</p>
    </div>
  );
}

/* ---------- 묻고 답하기 ---------- */
function Chat() {
  const msgs = useHelp((s) => s.msgs);
  const useAi = useHelp((s) => s.useAi);
  const ai = useStore((s) => s.doc.settings.ai);
  const [text, setText] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const ready = aiReady(ai);
  const prov = ready ? providerFor(ai) : null;
  const provName = prov ? PROVIDER_INFO[prov.id].label : "";
  const busy = msgs.some((m) => m.pending);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" }); }, [msgs]);
  useEffect(() => { input.current?.focus(); }, []);

  const push = (m: Omit<Msg, "id">) => { const id = ++seq; useHelp.setState((s) => ({ msgs: [...s.msgs, { ...m, id }] })); return id; };
  const replace = (id: number, m: Omit<Msg, "id">) => useHelp.setState((s) => ({ msgs: s.msgs.map((x) => (x.id === id ? { ...m, id } : x)) }));
  /** 설명서에서 찾은 답 */
  const local = (q: string, note?: string): Omit<Msg, "id"> => {
    const r = searchHelp(q);
    return r.best
      ? { role: "bot", text: r.best.a, src: `설명서 · ${r.best.q}`, links: r.best.links, related: r.related, note }
      : { role: "bot", text: "설명서에서 찾지 못했어요. 이런 질문은 어떨까요?", src: "설명서", related: r.related, note };
  };

  const ask = async (raw: string) => {
    const q = raw.trim();
    if (!q || busy) return;
    setText("");
    const history: HelpTurn[] = useHelp.getState().msgs.filter((m) => !m.pending).map((m) => ({ role: m.role, text: m.text }));
    push({ role: "user", text: q });
    const found = searchHelp(q);
    // 학생 기록을 묻는 질문은 AI 에 보내지 않고 안내만
    if (!(useAi && prov) || found.best?.data) { push(local(q)); return; }
    const id = push({ role: "bot", text: "", pending: true });
    try {
      const names = useStore.getState().doc.students.map((s) => s.name);
      const req = helpChatRequest(q, history, names);
      const out = (await prov.generate({ system: req.system, user: req.user, maxTokens: 600 })).trim();
      if (!out) throw new Error("빈 답");
      replace(id, { role: "bot", text: out, src: `AI · ${provName}`, links: found.best?.links, related: found.related, note: req.masked ? "학생 이름은 '학생'으로 바꿔 보냈어요" : undefined });
    } catch (e) {
      replace(id, local(q, `AI 연결 실패(${aiErrorText(e)}) · 설명서에서 찾은 답`));
    }
  };
  const starters = HELP_STARTERS.map((id) => HELP_FAQ.find((f) => f.id === id)!).filter(Boolean);

  return (
    <div className="hp-chat">
      <div className="hp-msgs" ref={list} aria-live="polite">
        <div className="hp-msg bot"><p>누가 사용법을 물어보세요. 답과 함께 그 화면으로 가는 버튼을 드려요.</p>
          {!msgs.length && <div className="hp-chips">{starters.map((f) => <button key={f.id} type="button" onClick={() => void ask(f.q)}>{f.q}</button>)}</div>}
        </div>
        {msgs.map((m) => (
          <div key={m.id} className={`hp-msg ${m.role}${m.pending ? " pending" : ""}`}>
            {m.pending ? <p className="hp-dots" aria-label="답을 쓰는 중"><i /><i /><i /></p> : <p>{m.text}</p>}
            {m.role === "bot" && !m.pending && <>
              <Links links={m.links} />
              {m.src && <small className="hp-src">{m.src}</small>}
              {m.note && <small className="hp-note">{m.note}</small>}
              {!!m.related?.length && <div className="hp-chips rel"><span>관련 질문</span>{m.related.map((f) => <button key={f.id} type="button" onClick={() => void ask(f.q)}>{f.q}</button>)}</div>}
            </>}
          </div>
        ))}
      </div>
      <form className="hp-in" onSubmit={(e) => { e.preventDefault(); void ask(text); }}>
        <textarea ref={input} rows={1} value={text} placeholder="예: 반 명단은 어떻게 넣어요?" aria-label="질문" maxLength={300}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void ask(text); } }} />
        <button type="submit" className="hp-send" disabled={!text.trim() || busy} aria-label="보내기">보내기</button>
      </form>
      <div className="hp-foot">
        {prov ? <>
          <label className="hp-sw"><input type="checkbox" checked={useAi} onChange={(e) => useHelp.setState({ useAi: e.target.checked })} />AI로 답하기</label>
          <span>{useAi ? `질문만 ${provName}로 보냅니다 · 학생 이름은 빼고` : "설명서에서 찾아 답합니다 · 외부로 보내지 않음"}</span>
        </> : <span>설명서에서 찾아 답합니다 · 외부로 보내지 않음</span>}
        {!!msgs.length && <button type="button" className="hp-clear" onClick={() => useHelp.setState({ msgs: [] })} disabled={busy}>지우기</button>}
      </div>
    </div>
  );
}
