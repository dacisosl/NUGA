import React, { useEffect, useRef, useState } from "react";
import { browserTranscript, nowIso, splitTranscript, uuid, type HeardLine } from "@nuga/core";
import { useStore } from "../store";
import { useTranscripts } from "../lib/transcripts";
import { runSuggestions } from "../lib/suggestFlow";

/**
 * 모바일 화면 [자동녹음] (짧게 시험해 보는 웹판).
 * - [녹음 시작] → 브라우저 음성 인식(ko-KR)이 말을 글자로 옮긴다. 음성 파일은 만들지도 저장하지도 않는다.
 * - [끝내고 PC로 보내기] → 받아 적은 문장을 수업 스크립트로 만들어
 *   · 폰으로 로그인한 기기: PC 로 보낸다(type "transcript", 종단간 암호화). PC 가 추천 카드를 만들어 쉬는 시간 기록 창에 띄운다.
 *   · PC 의 모바일 화면: 이 PC 에 넣고 바로 추천 카드를 만든다. PC 화면으로 돌아가면 쉬는 시간 기록 창이 뜬다.
 * - 추천은 PC 의 AI 설정이 있으면 AI 가, 없으면 규칙이 고른다. 화자를 가르지 못하므로 모든 발언이 추천 후보.
 * - 처음 한 번 녹음 사용 조건을 확인한다(이 기기에 기억).
 */

type Rec = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: (e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean } & ArrayLike<{ transcript: string }>> }) => void;
  onerror: (e: { error: string }) => void; onend: () => void; start: () => void; stop: () => void; abort: () => void;
};
type RecCtor = new () => Rec;
const recCtor = (): RecCtor | null => {
  const W = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return W.SpeechRecognition || W.webkitSpeechRecognition || null;
};

/** 한 번에 녹음하는 최대 시간 (짧게 시험해 보는 용도) */
export const VOICE_MAX_SEC = 180;
const OK_KEY = "nuga.voice.ok";
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
const readOk = () => { try { return localStorage.getItem(OK_KEY) === "1"; } catch { return false; } };

export function VoicePanel({ cls, period, phone, top, onDone }: {
  cls: string; period: number; phone: boolean; top: React.ReactNode;
  /** 보낸 뒤 알림 띠에 띄울 글 */
  onDone: (text: string) => void;
}) {
  const role = useStore((s) => s.role);
  const linked = useStore((s) => s.doc.settings.sync?.transport === "ntfy");
  const toPc = role === "phone" && linked;
  const [ok, setOk] = useState(readOk);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<HeardLine[]>([]);
  const [interim, setInterim] = useState("");
  const [sec, setSec] = useState(0);
  const [err, setErr] = useState("");
  const live = useRef({ on: false, lines: [] as HeardLine[], interim: "", start: 0, rec: null as Rec | null });
  const list = useRef<HTMLDivElement>(null);
  const supported = !!recCtor();

  useEffect(() => () => { live.current.on = false; live.current.rec?.abort(); }, []);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [lines.length, interim]);
  // 시계 + 최대 시간에서 저절로 끝내기
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => {
      const s = Math.floor((Date.now() - live.current.start) / 1000);
      setSec(s);
      if (s >= VOICE_MAX_SEC) void finish();
    }, 500);
    return () => clearInterval(t);
  }, [on]);

  /** 문장 하나씩 받아 적는다: 한 문장이 끝나면 인식이 멈추므로, 녹음 중이면 곧바로 다시 듣는다 (기기마다 연속 인식이 달라 이쪽이 안정적) */
  const listen = () => {
    const Ctor = recCtor();
    if (!Ctor || !live.current.on) return;
    const r = new Ctor();
    r.lang = "ko-KR"; r.continuous = false; r.interimResults = true;
    r.onresult = (e) => {
      let tmp = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i], text = res[0]?.transcript || "";
        if (res.isFinal) { if (text.trim()) { live.current.lines = [...live.current.lines, { text: text.trim(), at: Date.now() }]; setLines(live.current.lines); } }
        else tmp += text;
      }
      live.current.interim = tmp; setInterim(tmp);
    };
    r.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") { setErr("마이크 권한이 필요해요. 브라우저 주소창의 권한에서 마이크를 허용해 주세요"); stopListening(); return; }
      if (e.error === "network") { setErr("음성 인식에 인터넷 연결이 필요해요"); stopListening(); return; }
      setErr(`음성 인식 오류: ${e.error}`);
    };
    r.onend = () => {
      // 듣다 만 말이 확정되지 않고 끝났으면 그대로 한 문장으로
      if (live.current.interim.trim()) { live.current.lines = [...live.current.lines, { text: live.current.interim.trim(), at: Date.now() }]; setLines(live.current.lines); live.current.interim = ""; setInterim(""); }
      if (live.current.on) setTimeout(listen, 120);
    };
    live.current.rec = r;
    try { r.start(); } catch { /* 이미 듣는 중 */ }
  };
  const stopListening = () => { live.current.on = false; setOn(false); try { live.current.rec?.stop(); } catch { /* 이미 멈춤 */ } };

  const start = () => {
    setErr(""); setLines([]); setInterim(""); setSec(0);
    live.current = { on: true, lines: [], interim: "", start: Date.now(), rec: null };
    setOn(true);
    listen();
  };
  const cancel = () => { stopListening(); live.current.lines = []; setLines([]); setInterim(""); setSec(0); };

  /** 끝내고 보내기: 마지막 말이 확정되기를 잠깐 기다린 뒤 스크립트로 */
  async function finish() {
    if (!live.current.on && !live.current.lines.length) return;
    stopListening();
    setBusy(true);
    await new Promise((r) => setTimeout(r, 700));
    const heard = [...live.current.lines, ...(live.current.interim.trim() ? [{ text: live.current.interim.trim(), at: Date.now() }] : [])];
    live.current.interim = ""; setInterim("");
    if (!heard.length) { setBusy(false); setErr("받아 적은 말이 없어요. 폰 가까이에서 또렷하게 말해 보세요"); return; }
    const st = useStore.getState();
    const tr = browserTranscript(heard, { id: uuid(), class: cls, period, startedAt: new Date(live.current.start), endedAt: new Date() }, (d) => nowIso(d));
    try {
      if (toPc) {
        for (const part of splitTranscript(tr)) st.queueMessage({ v: 1, type: "transcript", deviceId: st.deviceId, sentAt: nowIso(), payload: part });
        onDone(`발언 ${tr.segments.length}개를 PC로 보냄 · PC에 추천이 떠요`);
      } else {
        await useTranscripts.getState().save(tr, st.areaId);
        const r = await runSuggestions(tr.id);
        if (!r.count) onDone(`발언 ${tr.segments.length}개 · 기록할 만한 발언을 찾지 못했어요`);
        else if (phone) onDone(`추천 ${r.count}건 · PC와 연결하려면 로그인하세요`);
        else { st.deferTranscripts([tr.id]); onDone(`추천 ${r.count}건 (${r.by}) · PC 화면으로 돌아가면 보여요`); }
      }
      live.current.lines = []; setLines([]); setSec(0);
    } catch (e) {
      setErr(`보내지 못했어요: ${e instanceof Error ? e.message : "오류"}`);
    } finally {
      setBusy(false);
    }
  }

  const confirmOk = () => { try { localStorage.setItem(OK_KEY, "1"); } catch { /* 기억 못 하면 다음에 다시 묻는다 */ } setOk(true); };

  return (
    <div className="mp-sheet mp-voice">
      {top}
      {!supported ? (
        <div className="mv-card"><b>이 브라우저는 음성 인식을 지원하지 않아요</b><p>안드로이드는 크롬, 아이폰은 사파리에서 열어 주세요.</p></div>
      ) : !ok ? (
        <div className="mv-card">
          <b>녹음 전에 확인해 주세요</b>
          <ul>
            <li>학교 승인과 학생·보호자 사전 안내·동의를 받은 수업에서만 써요</li>
            <li>녹음 중에는 화면에 표시되고, 언제든 바로 멈출 수 있어요</li>
            <li>음성은 저장하지 않아요. 브라우저 음성 인식(구글·애플)이 글자로 바꾼 내용만 {toPc ? "PC로 암호화해 보내요" : "이 기기에 남겨요"}</li>
          </ul>
          <button type="button" className="mp-btn night lit mv-main" onClick={confirmOk}>확인했어요</button>
        </div>
      ) : (
        <>
          <div className={`mv-state ${on ? "on" : ""}`} role="status">
            {on ? <><i aria-hidden className="mv-dot" />녹음 중 · {cls} <time>{mmss(sec)}</time><small>최대 {VOICE_MAX_SEC / 60}분</small></>
              : busy ? <>추천할 발언을 보내는 중…</>
              : <>짧게 한두 마디 말해 보세요. 기록할 만한 발언을 PC에 추천으로 띄워요</>}
          </div>
          <div className="mv-lines" ref={list} aria-live="polite">
            {!lines.length && !interim && <p className="mv-empty">{on ? "듣는 중… 말하면 여기에 글로 나타나요" : "예: “지난 시간에 배운 중화 반응이랑 비슷한 것 같아요”"}</p>}
            {lines.map((l, i) => <p key={i}><span>{mmss(Math.max(0, Math.round((l.at - live.current.start) / 1000)))}</span>{l.text}</p>)}
            {interim && <p className="interim"><span>…</span>{interim}</p>}
          </div>
          {err && <div className="mp-err">{err}</div>}
          <div className="mp-sheet-acts">
            {on
              ? <><button type="button" className="mp-memo" onClick={cancel}>취소</button><button type="button" className="mp-btn night lit save" onClick={() => void finish()}>끝내고 {toPc ? "PC로 보내기" : "추천 받기"}</button></>
              : <button type="button" className="mp-btn night lit save mv-rec" onClick={start} disabled={busy}><i aria-hidden className="mv-dot" />녹음 시작</button>}
          </div>
          <p className="mv-foot">음성은 저장하지 않고 글자만 {toPc ? "PC로 보내요" : "이 기기에 남겨요"} · 추천은 PC의 AI 설정이 있으면 AI가, 없으면 규칙이 골라요</p>
        </>
      )}
    </div>
  );
}
