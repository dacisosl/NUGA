// 관리자 화면: 테스트 아이디 10개를 누가 쓰는지 보고, 기기를 로그아웃시킨다
// 관리자 비밀번호로 연 서명 키는 이 탭의 메모리에만 있다 (저장하지 않는다). 로그아웃 명령은 그 키로 서명해 자리표에 적고,
// 모든 기기는 코드에 든 관리자 공개키로 서명을 확인한 명령만 따른다 (core admin.ts · seats.ts).
import React, { useEffect, useState } from "react";
import { create } from "zustand";
import { SEAT_IDLE_MIN, SEAT_TTL, testIdLabel, type Seat } from "@nuga/core";
import { kickSeats, loadSeats, seatRows, unwatchSeats, useSeats, watchSeats } from "../lib/seats";
import { Confirm, Modal } from "./ui";

export const useAdmin = create<{ key: CryptoKey | null; open: boolean }>(() => ({ key: null, open: false }));
const closeAdmin = () => useAdmin.setState({ open: false });

/** 위쪽 막대: 관리자로 들어와 있을 때만 */
export function AdminButton() {
  const key = useAdmin((s) => s.key);
  if (!key) return null;
  return <button className="btn admin-btn" onClick={() => useAdmin.setState({ open: true })} title="테스트 아이디 관리">관리자</button>;
}

export function AdminPanel() {
  const open = useAdmin((s) => s.open);
  const key = useAdmin((s) => s.key);
  if (!open || !key) return null;
  return <AdminDialog adminKey={key} />;
}

const hm = (sec: number) => { const d = new Date(sec * 1000); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

function AdminDialog({ adminKey }: { adminKey: CryptoKey }) {
  const { seats, now, loading, error, at } = useSeats();
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [askAll, setAskAll] = useState(false);
  useEffect(() => { watchSeats("admin"); void loadSeats(); return () => unwatchSeats("admin"); }, []);
  const rows = seatRows(seats);
  const all = [...seats.values()];

  const kick = async (list: Seat[], label: string) => {
    if (!list.length) return;
    setBusy(label); setMsg("");
    const e = await kickSeats(adminKey, list.map((s) => s.sid));
    setBusy("");
    setMsg(e || `${label} · 로그아웃시켰습니다. 그 기기는 바로(인터넷이 끊겨 있으면 다시 연결될 때) 로그아웃됩니다`);
  };
  const cell = (s: Seat | null, n: number, role: "PC" | "폰") => {
    if (!s) return <td className="adm-free">비어 있음</td>;
    const idle = Math.max(0, Math.floor((now - s.last) / 60));
    const left = Math.max(0, Math.ceil((s.last + SEAT_TTL - now) / 60));
    const label = `${testIdLabel(n)} ${role}`;
    return (
      <td className="adm-used">
        <div className="adm-dev">{s.dev || "기기"}</div>
        <div className="muted small num">{hm(s.since)}부터 · 마지막 {idle < 1 ? "방금" : `${idle}분 전`} · {left}분 뒤 풀림</div>
        <button className="btn sm warn" disabled={!!busy} onClick={() => void kick([s], label)}>{busy === label ? "보내는 중" : "로그아웃"}</button>
      </td>
    );
  };

  return (
    <Modal title="관리자 · 테스트 아이디" onClose={closeAdmin} width="wide">
      <div className="adm">
        <div className="adm-bar">
          <b>쓰는 중 <span className="num">{all.length}</span>/20 자리</b>
          <span className="muted small">{loading ? "확인 중…" : at ? `실시간 · ${new Date(at).toTimeString().slice(0, 5)}에 읽음` : ""}</span>
          <span className="grow" />
          <button className="btn sm" onClick={() => void loadSeats()} disabled={loading}>새로 읽기</button>
          <button className="btn sm warn" onClick={() => setAskAll(true)} disabled={!all.length || !!busy}>모두 로그아웃</button>
          <button className="btn sm ghost" onClick={() => { useAdmin.setState({ key: null, open: false }); }}>관리자 나가기</button>
        </div>
        {error && <div className="login-err" role="alert">{error}</div>}
        {msg && <div className="adm-msg" role="status">{msg}</div>}
        <div className="adm-wrap">
          <table className="adm-table">
            <thead><tr><th>아이디</th><th>PC 자리</th><th>폰 자리</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => {
                const both = [r.pc, r.phone].filter((x): x is Seat => !!x);
                const label = `${testIdLabel(r.n)} 둘 다`;
                return (
                  <tr key={r.n} data-adm={r.n} className={both.length ? "on" : ""}>
                    <th scope="row">{testIdLabel(r.n)}</th>
                    {cell(r.pc, r.n, "PC")}
                    {cell(r.phone, r.n, "폰")}
                    <td>{both.length === 2 && <button className="btn sm ghost" disabled={!!busy} onClick={() => void kick(both, label)}>둘 다 로그아웃</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <ul className="login-notes">
          <li>로그아웃시킨 자리는 곧바로 비어 다른 사람이 쓸 수 있습니다. 같은 사람이 다시 로그인하는 것은 막지 않습니다.</li>
          <li>{SEAT_IDLE_MIN}분 넘게 쓰지 않은 자리는 저절로 풀려 목록에서 빠집니다 (늦어도 {SEAT_TTL / 60}분).</li>
          <li>관리자 비밀번호는 이 탭에서만 쓰고 저장하지 않습니다. [관리자 나가기]나 탭을 닫으면 잊습니다.</li>
        </ul>
      </div>
      {askAll && <Confirm title="모두 로그아웃할까요?" body={`테스트 아이디를 쓰는 ${all.length}자리를 모두 로그아웃시킵니다.`} okLabel="모두 로그아웃" danger onOk={() => void kick(all, "모두")} onClose={() => setAskAll(false)} />}
    </Modal>
  );
}
