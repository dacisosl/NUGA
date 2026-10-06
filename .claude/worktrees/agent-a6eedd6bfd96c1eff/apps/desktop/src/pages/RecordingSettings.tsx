import React, { useEffect, useState } from "react";
import { DEFAULT_RECORDING, PROVIDER_INFO, type RecordingSettings } from "@nuga/core";
import { useStore } from "../store";
import { Confirm, Modal, Switch } from "../components/ui";
import { TranscriptModal } from "../components/TranscriptView";
import { useTranscripts } from "../lib/transcripts";
import { hasKey, onSecretsChange, getKey } from "../lib/secrets";
import { syncEngine } from "../lib/syncEngine";

/** v3 7.7 녹음 기능 사용 조건. 모두 확인해야 켤 수 있다. */
const CHECKLIST = [
  { key: "school", title: "학교 승인", desc: "학교장 승인을 받고, 학교 개인정보 보호책임자가 검토했습니다." },
  { key: "notice", title: "사전 고지·동의", desc: "학생·보호자에게 녹음 목적, 음성 보존 기간(1일), 학생 식별 추정을 하지 않음, 스크립트 보존 범위를 알리고 필요한 동의를 받았습니다." },
  { key: "transfer", title: "외부 전송 검토", desc: "음성을 외부(국외 포함) 음성 API로 보내는 것이 개인정보 처리 위탁·국외 이전에 해당하는지 검토했습니다." },
  { key: "stop", title: "녹음 표시·즉시 중단", desc: "수업 중 녹음 중임을 알리고, 학생이 요청하면 즉시 중단합니다." },
];

export function RecordingSection() {
  const doc = useStore((s) => s.doc);
  const setSettings = useStore((s) => s.setSettings);
  const toast = useStore((s) => s.toast);
  const rec: RecordingSettings = { ...DEFAULT_RECORDING, ...(doc.settings.recording || {}) };
  const up = (p: Partial<RecordingSettings>) => setSettings((s) => ({ ...s, recording: { ...DEFAULT_RECORDING, ...(s.recording || {}), ...p } }));
  const [checking, setChecking] = useState(false);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [, bump] = useState(0);
  useEffect(() => onSecretsChange(() => bump((x) => x + 1)), []);
  const paired = !!doc.settings.sync;
  const keyOk = hasKey(rec.speech.provider);
  const index = useTranscripts((s) => s.index);
  const load = useTranscripts((s) => s.load);
  const loaded = useTranscripts((s) => s.loaded);
  const remove = useTranscripts((s) => s.remove);
  useEffect(() => { if (!loaded) load(); }, [loaded]);
  const [view, setView] = useState<string | null>(null);
  const [del, setDel] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const on = rec.enabled && rec.approvedChecklist;

  const sendKey = async () => {
    const k = getKey(rec.speech.provider);
    if (!k) { toast({ text: "공통 설정 → AI 에서 Gemini 키를 먼저 저장하세요" }); return; }
    try { if (await syncEngine.sendSecrets({ [rec.speech.provider]: k })) toast({ text: "음성 변환 키를 폰으로 보냄 (종단간 암호화)" }); else toast({ text: "폰과 먼저 페어링하세요" }); }
    catch (e) { toast({ text: `보내기 실패: ${e instanceof Error ? e.message : e}` }); }
  };
  const clearKey = async () => {
    try { if (await syncEngine.sendSecrets({ [rec.speech.provider]: "" })) toast({ text: "폰의 음성 변환 키를 지우도록 보냄" }); } catch (e) { toast({ text: `보내기 실패: ${e instanceof Error ? e.message : e}` }); }
  };

  return (
    <>
      <div className="card pad">
        <div className="flex between">
          <h3 style={{ margin: 0 }}>수업 녹음 <span className="muted small">기본 꺼짐</span></h3>
          <span className={`chip ${on ? "pass" : "none"}`}>{on ? "켜짐" : "꺼짐"}</span>
        </div>
        <div className="muted small" style={{ margin: "6px 0 12px" }}>
          폰이 수업을 녹음해 스크립트(화자1·화자2…)로 바꾼 뒤 글만 PC로 보냅니다. 음성은 폰에만 두고 1일 뒤 지웁니다. 누가 말했는지 추정하지 않으며, 학생 지정은 교사가 합니다.
        </div>
        <div className="col" style={{ gap: 14 }}>
          <Switch on={on} onChange={(v) => { if (v) { setChecks({}); setChecking(true); } else up({ enabled: false }); }} label={on ? "녹음 사용 중 — 설정이 폰에 전달됩니다" : "녹음 사용 (켜기 전에 사용 조건을 확인합니다)"} />
          {on && (
            <>
              <div className="field"><label>시작 방식</label>
                <span className="seg">
                  <button className={rec.mode === "tap" ? "active" : ""} onClick={() => up({ mode: "tap" })}>1탭 — 수업 시작 알림의 [녹음 시작]</button>
                  <button className={rec.mode === "standby" ? "active" : ""} onClick={() => up({ mode: "standby" })}>하루 대기 — 아침 1탭, 시간표대로 자동</button>
                </span>
                <span className="muted small">Android 14 이상은 앱이 스스로 마이크를 켤 수 없어 교사의 1탭이 필요합니다. 녹음 중에는 폰 알림에 계속 표시되고, 알림·위젯에서 일시정지·중단할 수 있습니다.</span>
              </div>
              <div className="grid2">
                <div className="field"><label>음성 보존</label>
                  <select className="select" value={rec.audioTTLHours} onChange={(e) => up({ audioTTLHours: Number(e.target.value) })}>{[6, 12, 24].map((h) => <option key={h} value={h}>{h}시간 뒤 삭제{h === 24 ? " (기본)" : ""}</option>)}</select>
                  <span className="muted small">폰에서 다시 들을 수 있는 기간입니다. PC·서버로는 음성을 보내지 않습니다.</span>
                </div>
                <div className="field"><label>음성 변환 (폰 → {PROVIDER_INFO.gemini.label})</label>
                  <input list="speech-models" value={rec.speech.model} onChange={(e) => up({ speech: { provider: "gemini", model: e.target.value } })} />
                  <datalist id="speech-models">{["gemini-2.5-flash", "gemini-2.5-pro", "gemini-3-flash-preview"].map((m) => <option key={m} value={m} />)}</datalist>
                  <Switch on={rec.wifiOnly} onChange={(v) => up({ wifiOnly: v })} label={rec.wifiOnly ? "Wi-Fi에서만 변환" : "모바일 데이터로도 변환"} />
                </div>
              </div>
              <div className="field"><label>폰의 음성 변환 키</label>
                <span className="flex wrap">
                  <button className="btn sm primary" disabled={!paired || !keyOk} onClick={sendKey}>폰으로 키 보내기</button>
                  <button className="btn sm ghost" disabled={!paired} onClick={clearKey}>폰에서 키 지우기</button>
                  {!keyOk && <span className="small" style={{ color: "var(--warn)" }}>공통 설정 → AI 에서 Gemini 키를 먼저 저장하세요.</span>}
                  {!paired && <span className="small" style={{ color: "var(--warn)" }}>동기화 탭에서 폰과 먼저 페어링하세요.</span>}
                </span>
                <span className="muted small">키는 동기화 키로 종단간 암호화되어 폰의 Android Keystore 저장소에만 보관됩니다. 유료 등급(입력 데이터를 학습에 쓰지 않는 조건) 키를 쓰세요. 음성 API로는 음성과 지시문만 보내고 반·번호·이름은 보내지 않습니다.</span>
              </div>
            </>
          )}
          <div className="note small">대회 개발·시연 단계에서는 실제 수업 녹음을 쓰지 않습니다. 음성 합성으로 만든 모의 수업 음성만 사용합니다. 이 화면의 확인 항목은 법률 자문이 아니며, 학교 개인정보 보호책임자와 교육청 확인이 필요합니다.</div>
        </div>
      </div>

      <div className="card pad">
        <div className="flex between">
          <h3 style={{ margin: 0 }}>받은 스크립트 <span className="muted small">{index.length}개 수업</span></h3>
          {index.length > 0 && <button className="btn sm ghost" style={{ color: "var(--warn)" }} onClick={() => setConfirmClear(true)}>모두 삭제</button>}
        </div>
        <div className="muted small" style={{ margin: "6px 0 10px" }}>PC에 계속 보존됩니다(수업 1회 약 수십 KB). 학년도가 끝나면 정리하세요.</div>
        {index.length === 0 ? <div className="muted small">아직 없습니다.</div> : (
          <table className="table">
            <thead><tr><th style={{ width: 130 }}>날짜</th><th>반·교시</th><th style={{ width: 90 }}>발언</th><th style={{ width: 90 }}>화자</th><th style={{ width: 150 }} /></tr></thead>
            <tbody>
              {index.map((m) => { const d = new Date(m.startedAt); return (
                <tr key={m.id}>
                  <td className="num small">{d.getMonth() + 1}/{d.getDate()} {String(d.getHours()).padStart(2, "0")}:{String(d.getMinutes()).padStart(2, "0")}</td>
                  <td className="key">{m.class}{m.period ? ` · ${m.period}교시` : ""}</td>
                  <td className="num">{m.segmentCount}</td>
                  <td className="num">{m.speakers}명</td>
                  <td><span className="flex" style={{ justifyContent: "flex-end" }}><button className="btn sm" onClick={() => setView(m.id)}>보기</button><button className="btn ghost sm" style={{ color: "var(--warn)" }} onClick={() => setDel(m.id)}>삭제</button></span></td>
                </tr>
              ); })}
            </tbody>
          </table>
        )}
      </div>

      {checking && (
        <Modal title="녹음 기능 사용 조건 확인" onClose={() => setChecking(false)} footer={<>
          <span className="muted small">{Object.values(checks).filter(Boolean).length}/{CHECKLIST.length} 확인</span><span className="grow" />
          <button className="btn" onClick={() => setChecking(false)}>취소</button>
          <button className="btn primary" disabled={CHECKLIST.some((c) => !checks[c.key])} onClick={() => { up({ enabled: true, approvedChecklist: true }); setChecking(false); toast({ text: "수업 녹음을 켰습니다. 다음 동기화 때 폰에 반영됩니다." }); }}>확인하고 켜기</button>
        </>}>
          <div className="col" style={{ gap: 10 }}>
            <div className="muted small">수업 녹음은 학생 음성(개인정보)을 다룹니다. 아래 조건을 모두 갖춘 뒤 켜 주세요.</div>
            {CHECKLIST.map((c) => (
              <label key={c.key} className="check-row">
                <input type="checkbox" checked={!!checks[c.key]} onChange={(e) => setChecks((x) => ({ ...x, [c.key]: e.target.checked }))} />
                <span><b>{c.title}</b><br /><span className="muted small">{c.desc}</span></span>
              </label>
            ))}
            <div className="note small">이 확인은 법률 자문이 아닙니다. 대회 개발 단계에서는 실제 수업 녹음을 쓰지 않습니다.</div>
          </div>
        </Modal>
      )}
      {view && <TranscriptModal id={view} onClose={() => setView(null)} />}
      {del && <Confirm title="스크립트 삭제" body="이 수업의 스크립트를 PC에서 지웁니다." okLabel="삭제" danger onOk={() => remove(del)} onClose={() => setDel(null)} />}
      {confirmClear && <Confirm title="스크립트 모두 삭제" body={`받은 스크립트 ${index.length}개를 PC에서 지웁니다.`} okLabel="모두 삭제" danger onOk={async () => { for (const m of index) await remove(m.id); toast({ text: "스크립트를 모두 지웠습니다" }); }} onClose={() => setConfirmClear(false)} />}
    </>
  );
}
