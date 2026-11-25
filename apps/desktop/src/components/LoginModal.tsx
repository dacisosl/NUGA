// 로그인: 같은 아이디·비밀번호로 로그인한 폰과 PC 를 잇는다 (회원 서버 없음)
// - 아이디·비밀번호 → 암호 열쇠(core deriveLoginKey). 같은 열쇠를 가진 기기끼리 공개 중계 ntfy.sh 로 암호문만 주고받는다.
// - 폰에서 번호를 눌러 저장하면 폰에는 미반영으로 남고, PC 에는 쉬는 시간 기록 팝업이 뜬다.
// - [테스트 아이디로]: 코드에 고정된 공개 테스트 계정. 누구나 들어올 수 있으므로 데모 데이터일 때만 이름을 보낸다.
import React, { useEffect, useState } from "react";
import { create } from "zustand";
import { TEST_LOGIN, checkLogin, deriveLoginKey, isTestLogin, normalizeLoginId, nowIso } from "@nuga/core";
import { useStore } from "../store";
import { syncEngine } from "../lib/syncEngine";
import { demoInfo } from "../lib/demo";
import { WHALE_AREA } from "../lib/whale";
import { hostName } from "../lib/platform";
import { defaultRole, ntfyBase, type Role } from "../lib/role";
import { Modal, Switch } from "./ui";
import "./login.css";

export const useLoginUi = create<{ open: boolean }>(() => ({ open: false }));
export const openLogin = () => useLoginUi.setState({ open: true });
const closeLogin = () => useLoginUi.setState({ open: false });

/** 지금 PC 의 데이터가 합성 데모인지 (데모로 둘러보기 · 웨일 데모 영역) */
export function isDemoData(): boolean { return useStore.getState().areaId === WHALE_AREA || demoInfo() !== null; }

/** 로그인: 열쇠를 만들어 동기화 설정에 넣고, 폰이면 폰 연결 영역으로. 문제가 있으면 그 문구 */
export async function loginWith(id: string, password: string, role: Role, shareNames: boolean): Promise<string | null> {
  const err = checkLogin(id, password);
  if (err) return err;
  const k = await deriveLoginKey(id, password);
  const st = useStore.getState();
  const test = isTestLogin(id);
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
      login: { id: normalizeLoginId(id), at: Math.floor(Date.now() / 1000) - 30 },
    },
  }));
  if (role === "phone") await useStore.getState().enterPhoneArea();
  syncEngine.restart();
  return null;
}

export function logout() {
  useStore.getState().setSettings((s) => ({ ...s, sync: null }));
  syncEngine.restart();
}

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
      <i className={`led ${led}`} aria-hidden="true" /><span className="login-id">{isTestLogin(id) ? "테스트" : id}</span><span className="login-role">{role === "phone" ? "폰" : "PC"}</span>
    </button>
  );
}

export function LoginModal() {
  const open = useLoginUi((s) => s.open);
  if (!open) return null;
  return <LoginDialog />;
}

function LoginDialog() {
  const sync = useStore((s) => s.doc.settings.sync);
  const status = useStore((s) => s.syncStatus);
  const curRole = useStore((s) => s.role);
  const toast = useStore((s) => s.toast);
  const loggedIn = sync?.transport === "ntfy" && !!sync.login?.id;
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [role, setRole] = useState<Role>(loggedIn ? curRole : defaultRole());
  const demo = isDemoData();
  const [names, setNames] = useState(demo);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { setErr(""); }, [id, pw]);

  const go = async (lid: string, lpw: string) => {
    setBusy(true); setErr("");
    try {
      const e = await loginWith(lid, lpw, role, names);
      if (e) { setErr(e); return; }
      closeLogin();
      toast({ text: role === "phone" ? "폰으로 로그인 · PC가 반과 명단을 보내면 번호 칸이 채워집니다" : "PC로 로그인 · 폰에서 저장하면 여기에 쉬는 시간 기록 팝업이 뜹니다", kind: "notice", ttl: 6000 });
    } catch (e) { setErr(e instanceof Error ? e.message : "로그인 실패"); }
    finally { setBusy(false); }
  };

  return (
    <Modal title="로그인 · 폰과 PC 연결" onClose={closeLogin} width="narrow">
      <div className="login">
        {loggedIn && (
          <div className="login-now">
            <div><b>{isTestLogin(sync!.login!.id) ? "테스트 아이디" : sync!.login!.id}</b>로 로그인됨 · 이 기기는 <b>{curRole === "phone" ? "폰" : "PC"}</b></div>
            <div className="muted small">{status.message}{status.lastAt ? ` · ${status.lastAt.slice(11, 16)}` : ""}</div>
            <button className="btn" onClick={() => { logout(); closeLogin(); toast({ text: "로그아웃 · 폰과의 연결을 끊었습니다" }); }}>로그아웃</button>
          </div>
        )}
        <p className="login-lead">폰과 PC에서 <b>같은 아이디·비밀번호</b>로 로그인하면, 폰에서 번호를 눌러 저장할 때 PC에 <b>쉬는 시간 기록</b> 팝업이 뜹니다. 폰에는 미반영으로 남습니다.</p>
        <div className="field"><label htmlFor="lg-id">아이디</label><input id="lg-id" value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" autoCapitalize="off" spellCheck={false} /></div>
        <div className="field"><label htmlFor="lg-pw">비밀번호</label><input id="lg-pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password"
          onKeyDown={(e) => { if (e.key === "Enter" && !busy) void go(id, pw); }} /></div>
        <div className="login-role-row">
          <span className="muted small">이 기기</span>
          <span className="seg" role="group" aria-label="이 기기의 역할">
            <button type="button" className={role === "pc" ? "active" : ""} aria-pressed={role === "pc"} onClick={() => setRole("pc")}>PC · 팝업 받기</button>
            <button type="button" className={role === "phone" ? "active" : ""} aria-pressed={role === "phone"} onClick={() => setRole("phone")}>폰 · 번호 보내기</button>
          </span>
        </div>
        {role === "pc" && <Switch on={names} onChange={setNames} label="폰에서 학생 이름 보기 (끄면 번호만)" />}
        {err && <div className="login-err" role="alert">{err}</div>}
        <div className="login-acts">
          <button className="btn primary" disabled={busy || !id.trim() || !pw} onClick={() => void go(id, pw)}>{busy ? "연결 중…" : "로그인"}</button>
          <button className="btn" disabled={busy} onClick={() => void go(TEST_LOGIN.id, TEST_LOGIN.password)}>테스트 아이디로</button>
        </div>
        <ul className="login-notes">
          <li>회원 가입이 없습니다. 아이디·비밀번호로 이 기기 안에서 암호 열쇠를 만들고, 기록은 그 열쇠로 암호화해 공개 중계(ntfy.sh)로만 오갑니다. 비밀번호는 저장하지 않습니다.</li>
          <li>테스트 아이디는 누구나 쓰는 공개 계정입니다. {demo ? "지금은 데모 데이터라 이름도 보냅니다." : "실제 명단이 있으면 이름은 보내지 않고 번호만 보냅니다."}</li>
          {role === "phone" && <li>폰으로 로그인하면 '폰 연결' 영역이 따로 생기고, PC의 반·명단이 그 영역에 채워집니다. 이 기기의 다른 영역은 그대로입니다.</li>}
        </ul>
      </div>
    </Modal>
  );
}
