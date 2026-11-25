// 로그인: 같은 아이디·비밀번호로 로그인한 폰과 PC 를 잇는다 (회원 서버 없음)
// - 아이디·비밀번호 → 암호 열쇠(core deriveLoginKey). 같은 열쇠를 가진 기기끼리 공개 중계 ntfy.sh 로 암호문만 주고받는다.
// - 폰에서 번호를 눌러 저장하면 폰에는 미반영으로 남고, PC 에는 쉬는 시간 기록 팝업이 뜬다.
// - 테스트 아이디 10개(테스트 01~10): 여럿이 동시에 시험할 수 있게. 아이디 하나는 PC 1대 + 폰 1대 (같은 자리에 두 번째 기기는 막힌다, lib/seats).
//   누구나 쓰는 공개 계정이므로 데모 데이터일 때만 이름을 보낸다.
// - 관리자 아이디: 관리자 비밀번호로 서명 키를 열어 테스트 아이디를 쓰는 기기를 로그아웃시킨다 (AdminPanel).
import React, { useEffect, useState } from "react";
import { create } from "zustand";
import {
  SEAT_IDLE_MIN, TEST_LOGIN, checkLogin, deriveLoginKey, hasAdminKey, isAdminLogin, isTestLogin, normalizeLoginId, nowIso, ntfyTopic, openAdminKey, testIdLabel, testIdNo, testIdOf,
} from "@nuga/core";
import { useStore } from "../store";
import { syncEngine } from "../lib/syncEngine";
import { demoInfo } from "../lib/demo";
import { WHALE_AREA } from "../lib/whale";
import { hostName } from "../lib/platform";
import { defaultRole, ntfyBase, type Role } from "../lib/role";
import { claimSeat, deviceLabel, loadSeats, onSeatLost, releaseSeat, seatRows, useSeats } from "../lib/seats";
import { useAdmin } from "./AdminPanel";
import { Modal, Switch } from "./ui";
import "./login.css";

/** notice = 창 맨 위에 보여 줄 안내 (자리를 잃어 로그아웃된 까닭 등) */
export const useLoginUi = create<{ open: boolean; notice: string }>(() => ({ open: false, notice: "" }));
export const openLogin = () => useLoginUi.setState({ open: true });
const closeLogin = () => useLoginUi.setState({ open: false, notice: "" });

/** 지금 PC 의 데이터가 합성 데모인지 (데모로 둘러보기 · 웨일 데모 영역) */
export function isDemoData(): boolean { return useStore.getState().areaId === WHALE_AREA || demoInfo() !== null; }

/** 화면에 보이는 아이디: 테스트 아이디는 "테스트 03" */
export function loginLabel(id: string): string { const n = testIdNo(id); return n ? testIdLabel(n) : isTestLogin(id) ? "테스트" : id; }

/** 로그인: (테스트 아이디면 자리를 잡고) 열쇠를 만들어 동기화 설정에 넣고, 폰이면 폰 연결 영역으로. 문제가 있으면 그 문구 */
export async function loginWith(id: string, password: string, role: Role, shareNames: boolean): Promise<string | null> {
  const err = checkLogin(id, password);
  if (err) return err;
  const nid = normalizeLoginId(id);
  if (nid === TEST_LOGIN.id) return "테스트 아이디는 위 목록의 '테스트 01~10' 가운데 하나를 고릅니다";
  if (isAdminLogin(nid)) return "관리자 아이디는 기기 연결에 쓰지 않습니다";
  const n = testIdNo(nid);
  if (n && password !== TEST_LOGIN.password) return "테스트 아이디의 비밀번호가 맞지 않습니다";
  const k = await deriveLoginKey(nid, password);
  const st = useStore.getState();
  if (n) {
    // 자리부터: 같은 자리를 다른 기기가 쓰는 중이면 여기서 막힌다 (전에 쓰던 자리는 새 자리를 잡은 뒤 뗀다)
    const r = await claimSeat(n, role, deviceLabel(), ntfyTopic(k.keyId, role));
    if (!r.ok) return r.text;
  } else await releaseSeat();
  const test = isTestLogin(nid);
  const names = role === "pc" && (test ? isDemoData() : shareNames);
  // 예전에 쌓아 둔 보낼 것(다른 연결용)은 새 통로로 보내지 않는다
  st.drainOutbox();
  st.setRole(role);
  st.setSettings((s) => ({
    ...s,
    options: role === "pc" ? { ...s.options, showPhoneNames: names } : s.options,
    sync: {
      keyB64: k.keyB64, keyId: k.keyId, relayUrl: ntfyBase(), pcName: role === "pc" ? hostName() : "폰", pairedAt: nowIso(), shareRoster: names,
      transport: "ntfy",
      // 기기 시계가 조금 달라도 로그인 직후 메시지를 놓치지 않게 30초 여유
      login: { id: nid, at: Math.floor(Date.now() / 1000) - 30 },
    },
  }));
  if (role === "phone") await useStore.getState().enterPhoneArea();
  syncEngine.restart();
  return null;
}

export function logout() {
  void releaseSeat();
  useStore.getState().setSettings((s) => ({ ...s, sync: null }));
  syncEngine.restart();
}

// 자리를 잃으면(관리자 로그아웃 · 다른 기기가 먼저 잡음 · 오래 안 써서 풀린 뒤 남이 씀): 로그아웃하고 까닭을 알린다
onSeatLost((why, n, role) => {
  const st = useStore.getState();
  st.setSettings((s) => ({ ...s, sync: null }));
  syncEngine.restart();
  const who = `${testIdLabel(n)}(${role === "pc" ? "PC" : "폰"})`;
  const text = why === "kicked" ? `관리자가 ${who} 로그인을 끝냈습니다.`
    : why === "taken" ? `다른 기기가 ${who} 자리를 먼저 잡아 로그아웃했습니다.`
    : why === "idle-taken" ? `${SEAT_IDLE_MIN}분 넘게 쓰지 않아 ${who} 자리가 풀렸고, 지금은 다른 기기가 씁니다.`
    : `${who} 로그인이 끝나 로그아웃했습니다.`;
  st.toast({ text: `${text} 다시 쓰려면 로그인해 주세요`, kind: "notice", ttl: 15000, action: { label: "로그인", onClick: openLogin } });
  useLoginUi.setState({ open: true, notice: text });
});

/** 위쪽 막대의 [로그인] / ● 아이디 */
export function LoginButton() {
  const sync = useStore((s) => s.doc.settings.sync);
  const status = useStore((s) => s.syncStatus);
  const role = useStore((s) => s.role);
  const id = sync?.transport === "ntfy" ? sync.login?.id : null;
  if (!id) return <button className="btn login-btn" onClick={openLogin} title="같은 아이디로 로그인한 폰과 PC를 연결">로그인</button>;
  const led = status.state === "idle" ? "on" : status.state === "busy" ? "busy" : status.state === "error" ? "err" : "";
  return (
    <button className="btn login-btn on" onClick={openLogin} title={`${role === "phone" ? "폰" : "PC"}으로 연결 · ${status.message}`}>
      <i className={`led ${led}`} aria-hidden="true" /><span className="login-id">{loginLabel(id)}</span><span className="login-role">{role === "phone" ? "폰" : "PC"}</span>
    </button>
  );
}

export function LoginModal() {
  const open = useLoginUi((s) => s.open);
  if (!open) return null;
  return <LoginDialog />;
}

/** 테스트 아이디 10개: 이 기기 역할(PC · 폰)의 자리가 비어 있는 번호만 고를 수 있다 */
function TestIdGrid({ role, busy, onPick }: { role: Role; busy: boolean; onPick: (n: number) => void }) {
  const { seats, loaded, loading, error, mine } = useSeats();
  useEffect(() => { void loadSeats(); }, []);
  const rows = seatRows(seats);
  const free = rows.filter((r) => !(role === "pc" ? r.pc : r.phone)).length;
  // PC: 둘 다 빈 첫 번호를 권한다. 폰: PC가 먼저 들어와 기다리는 번호를 눈에 띄게
  const pick = role === "pc" ? rows.find((r) => !r.pc && !r.phone)?.n : 0;
  return (
    <section className="tid" aria-label="테스트 아이디">
      <div className="tid-head">
        <b>테스트 아이디</b>
        <span className="muted small">{loading && !loaded ? "자리 확인 중…" : loaded ? `${role === "pc" ? "PC" : "폰"} 빈 자리 ${free}/10` : ""}</span>
        <span className="grow" />
        <button type="button" className="btn ghost sm" onClick={() => void loadSeats()} disabled={loading}>{loading ? "확인 중" : "새로 확인"}</button>
      </div>
      {error && <div className="login-err" role="alert">{error}</div>}
      <div className="tid-grid">
        {rows.map((r) => {
          const mineHere = !!mine && mine.n === r.n && mine.role === role;
          const taken = role === "pc" ? r.pc : r.phone;
          const partner = role === "pc" ? r.phone : r.pc;
          const st = mineHere ? "이 기기" : taken ? "쓰는 중" : partner ? (role === "phone" ? "PC가 기다림" : "폰이 기다림") : "빈 자리";
          return (
            <button key={r.n} type="button" data-tid={r.n}
              className={`tid-cell${taken && !mineHere ? " taken" : ""}${mineHere ? " mine" : ""}${partner && !taken ? " wait" : ""}${r.n === pick ? " pick" : ""}`}
              disabled={busy || !loaded || !!taken} onClick={() => onPick(r.n)}
              title={`${testIdLabel(r.n)} · PC ${r.pc ? `쓰는 중(${r.pc.dev || "기기"})` : "비어 있음"} · 폰 ${r.phone ? `쓰는 중(${r.phone.dev || "기기"})` : "비어 있음"}`}>
              <b className="tid-no">{String(r.n).padStart(2, "0")}</b>
              <span className="tid-dots" aria-hidden="true"><i className={r.pc ? "on" : ""} />PC<i className={r.phone ? "on" : ""} />폰</span>
              <span className="tid-st">{st}</span>
            </button>
          );
        })}
      </div>
      <div className="muted small tid-note">PC와 폰에서 <b>같은 번호</b>를 고르면 연결됩니다. 번호 하나는 PC 1대 · 폰 1대만 쓸 수 있고, {SEAT_IDLE_MIN}분 넘게 쓰지 않으면 자리가 풀립니다.</div>
    </section>
  );
}

function LoginDialog() {
  const sync = useStore((s) => s.doc.settings.sync);
  const status = useStore((s) => s.syncStatus);
  const curRole = useStore((s) => s.role);
  const toast = useStore((s) => s.toast);
  const notice = useLoginUi((s) => s.notice);
  const loggedIn = sync?.transport === "ntfy" && !!sync.login?.id;
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [role, setRole] = useState<Role>(loggedIn ? curRole : defaultRole());
  const demo = isDemoData();
  const [names, setNames] = useState(demo);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => { setErr(""); }, [id, pw, role]);
  const admin = isAdminLogin(id);
  const adminOn = useAdmin((s) => !!s.key);

  const go = async (lid: string, lpw: string, label = "로그인") => {
    setBusy(label); setErr("");
    try {
      const e = await loginWith(lid, lpw, role, names);
      if (e) { setErr(e); return; }
      closeLogin();
      const n = testIdNo(lid);
      const who = n ? ` · ${testIdLabel(n)}` : "";
      toast({ text: role === "phone" ? `폰으로 로그인${who} · PC가 반과 명단을 보내면 번호 칸이 채워집니다` : `PC로 로그인${who} · ${n ? `폰에서도 ${testIdLabel(n)}을 고르세요. ` : ""}폰에서 저장하면 여기에 쉬는 시간 기록 팝업이 뜹니다`, kind: "notice", ttl: 8000 });
    } catch (e) { setErr(e instanceof Error ? e.message : "로그인 실패"); }
    finally { setBusy(""); }
  };
  const goAdmin = async () => {
    if (!hasAdminKey()) { setErr("이 판에는 관리자 키가 없습니다"); return; }
    setBusy("관리자"); setErr("");
    try {
      const key = await openAdminKey(pw);
      if (!key) { setErr("관리자 비밀번호가 맞지 않습니다"); return; }
      setPw("");
      useAdmin.setState({ key, open: true });
      closeLogin();
    } finally { setBusy(""); }
  };
  const submit = () => { if (busy || !id.trim() || !pw) return; if (admin) void goAdmin(); else void go(id, pw); };

  return (
    <Modal title="로그인 · 폰과 PC 연결" onClose={closeLogin} width="narrow">
      <div className="login">
        {notice && <div className="login-notice" role="alert">{notice}</div>}
        {adminOn && <button type="button" className="btn login-admin" onClick={() => { closeLogin(); useAdmin.setState({ open: true }); }}>관리자 화면 열기</button>}
        {loggedIn && (
          <div className="login-now">
            <div><b>{loginLabel(sync!.login!.id)}</b>로 로그인됨 · 이 기기는 <b>{curRole === "phone" ? "폰" : "PC"}</b></div>
            <div className="muted small">{status.message}{status.lastAt ? ` · ${status.lastAt.slice(11, 16)}` : ""}</div>
            <button className="btn" onClick={() => { logout(); closeLogin(); toast({ text: "로그아웃 · 폰과의 연결을 끊었습니다" }); }}>로그아웃</button>
          </div>
        )}
        <p className="login-lead">폰과 PC에서 <b>같은 아이디</b>로 로그인하면, 폰에서 번호를 눌러 저장할 때 PC에 <b>쉬는 시간 기록</b> 팝업이 뜹니다. 폰에는 미반영으로 남습니다.</p>
        {!admin && (
          <div className="login-role-row">
            <span className="muted small">이 기기</span>
            <span className="seg" role="group" aria-label="이 기기의 역할">
              <button type="button" className={role === "pc" ? "active" : ""} aria-pressed={role === "pc"} onClick={() => setRole("pc")}>PC · 팝업 받기</button>
              <button type="button" className={role === "phone" ? "active" : ""} aria-pressed={role === "phone"} onClick={() => setRole("phone")}>폰 · 번호 보내기</button>
            </span>
          </div>
        )}
        {!admin && <TestIdGrid role={role} busy={!!busy} onPick={(n) => void go(testIdOf(n), TEST_LOGIN.password, `seat:${n}`)} />}
        {busy.startsWith("seat:") && <div className="muted small login-busy" role="status"><span className="spin" /> {testIdLabel(Number(busy.slice(5)))} 자리를 잡는 중…</div>}
        {err && <div className="login-err" role="alert">{err}</div>}
        <details className="login-own" open={!!id || admin}>
          <summary>아이디로 로그인 (직접 입력 · 관리자)</summary>
          <div className="field"><label htmlFor="lg-id">아이디</label><input id="lg-id" value={id} onChange={(e) => setId(e.target.value)} autoComplete={admin ? "off" : "username"} autoCapitalize="off" spellCheck={false} /></div>
          {/* 관리자 비밀번호는 브라우저가 저장하지 않게: 비밀번호 칸이 아닌 글자 칸을 가려서 쓴다 */}
          <div className="field"><label htmlFor="lg-pw">{admin ? "관리자 비밀번호" : "비밀번호"}</label><input id="lg-pw" type={admin ? "text" : "password"} className={admin ? "secret" : undefined} value={pw} onChange={(e) => setPw(e.target.value)}
            autoComplete={admin ? "one-time-code" : "current-password"} autoCapitalize="off" spellCheck={false} data-lpignore={admin ? "true" : undefined} data-1p-ignore={admin ? "" : undefined}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }} /></div>
          {role === "pc" && !admin && !isTestLogin(id) && <Switch on={names} onChange={setNames} label="폰에서 학생 이름 보기 (끄면 번호만)" />}
          <div className="login-acts">
            <button className="btn primary" disabled={!!busy || !id.trim() || !pw} onClick={submit}>{busy === "로그인" || busy === "관리자" ? "확인 중…" : admin ? "관리자로 들어가기" : "로그인"}</button>
          </div>
        </details>
        <ul className="login-notes">
          <li>회원 가입이 없습니다. 아이디·비밀번호로 이 기기 안에서 암호 열쇠를 만들고, 기록은 그 열쇠로 암호화해 공개 중계(ntfy.sh)로만 오갑니다. 비밀번호는 저장하지 않습니다.</li>
          <li>테스트 아이디는 누구나 쓰는 공개 계정입니다. {demo ? "지금은 데모 데이터라 이름도 보냅니다." : "실제 명단이 있으면 이름은 보내지 않고 번호만 보냅니다."} 어느 번호를 어떤 브라우저가 쓰는지는 공개 중계에 암호화 없이 적힙니다.</li>
          {role === "phone" && !admin && <li>폰으로 로그인하면 '폰 연결' 영역이 따로 생기고, PC의 반·명단이 그 영역에 채워집니다. 이 기기의 다른 영역은 그대로입니다.</li>}
          {admin && <li>관리자 비밀번호는 이 탭의 메모리에서만 쓰고 저장하지 않습니다. 탭을 닫으면 다시 넣어야 합니다.</li>}
        </ul>
      </div>
    </Modal>
  );
}
