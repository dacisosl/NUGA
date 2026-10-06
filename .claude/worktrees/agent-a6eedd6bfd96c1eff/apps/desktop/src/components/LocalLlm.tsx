import React, { useEffect, useState } from "react";
import { DEFAULT_LOCAL_URL } from "@nuga/core";
import { useStore } from "../store";
import { isTauri } from "../lib/platform";

/**
 * 로컬 LLM (이 PC, 외부 전송 없음). 8GB 메모리·GPU 없는 PC 기준 3~4B 4비트 모델.
 * 공공 서비스에 쓸 수 있는 공개 라이선스 모델만 목록에 둔다 (EXAONE 등 비상업 라이선스 제외).
 */
export const LOCAL_MODELS = [
  { file: "Qwen3-4B-Instruct-2507-Q4_K_M.gguf", label: "Qwen3 4B Instruct (권장)", size: "약 2.5GB", license: "Apache-2.0", url: "https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf" },
  { file: "gemma-3-4b-it-Q4_K_M.gguf", label: "Gemma 3 4B IT", size: "약 2.5GB", license: "Gemma 이용 약관", url: "https://huggingface.co/unsloth/gemma-3-4b-it-GGUF/resolve/main/gemma-3-4b-it-Q4_K_M.gguf" },
  { file: "Qwen3-1.7B-Q4_K_M.gguf", label: "Qwen3 1.7B (가벼움·품질 낮음)", size: "약 1.1GB", license: "Apache-2.0", url: "https://huggingface.co/unsloth/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q4_K_M.gguf" },
];

interface Status { server_path: string | null; models_dir: string; models: { file: string; size: number }[]; running: boolean; port: number; model: string }
interface Progress { file: string; received: number; total: number; done: boolean; error: string | null }

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const core = await import("@tauri-apps/api/core");
  return core.invoke<T>(cmd, args);
}

export function LocalLlmCard() {
  const ai = useStore((s) => s.doc.settings.ai);
  const setSettings = useStore((s) => s.setSettings);
  const toast = useStore((s) => s.toast);
  const [st, setSt] = useState<Status | null>(null);
  const [dl, setDl] = useState<Progress | null>(null);
  const [busy, setBusy] = useState(false);
  const port = Number((ai.localUrl || DEFAULT_LOCAL_URL).split(":").pop()) || 8080;
  const refresh = () => invoke<Status>("llm_status").then(setSt).catch(() => setSt(null));

  useEffect(() => {
    if (!isTauri) return;
    refresh();
    let un: (() => void) | undefined;
    import("@tauri-apps/api/event").then((ev) => ev.listen<Progress>("llm-download", (e) => {
      setDl(e.payload.done ? null : e.payload);
      if (e.payload.done) { refresh(); toast({ text: e.payload.error ? `모델 내려받기 실패: ${e.payload.error}` : `${e.payload.file} 내려받기 완료` }); }
    }).then((f) => { un = f; }));
    return () => un?.();
  }, []);

  if (ai.provider !== "local") return null;
  if (!isTauri) {
    return (
      <div className="card pad">
        <h3>로컬 LLM</h3>
        <div className="muted small">웹 버전에서는 이 PC에서 직접 실행한 llama-server 주소로 접속합니다. PC 설치형에서는 앱이 llama-server 를 함께 설치하고 모델 내려받기·시작·중지를 관리합니다.</div>
      </div>
    );
  }
  const has = (f: string) => st?.models.some((m) => m.file === f);
  const start = async (file: string) => {
    setBusy(true);
    try {
      await invoke("llm_start", { file, port, ctx: 8192, threads: 0 });
      setSettings((s) => ({ ...s, ai: { ...s.ai, localUrl: `http://127.0.0.1:${port}`, models: { ...(s.ai.models || {}), local: file.replace(/\.gguf$/, "") } } }));
      // 모델을 메모리에 올리는 데 시간이 걸린다 → /health 가 될 때까지 기다림
      for (let i = 0; i < 90; i++) {
        try { const r = await fetch(`http://127.0.0.1:${port}/health`); if (r.ok) break; } catch { /* 아직 */ }
        await new Promise((r) => setTimeout(r, 1000));
      }
      toast({ text: "로컬 LLM 시작" });
    } catch (e) { toast({ text: `시작 실패: ${e}` }); }
    finally { setBusy(false); refresh(); }
  };
  return (
    <div className="card pad">
      <div className="flex between">
        <h3 style={{ margin: 0 }}>로컬 LLM <span className="muted small">이 PC에서만 처리 · 외부 전송 없음</span></h3>
        <span className={`chip ${st?.running ? "pass" : "none"}`}>{st?.running ? `실행 중 · ${st.model}` : "꺼짐"}</span>
      </div>
      {!st?.server_path && <div className="note small" style={{ marginTop: 8 }}>llama-server 가 설치되어 있지 않습니다. 릴리스 설치 파일에는 포함되며, 직접 넣으려면 앱 데이터 폴더의 llama/ 에 llama.cpp 의 llama-server.exe 와 DLL 을 두세요.</div>}
      <table className="table" style={{ marginTop: 10 }}>
        <thead><tr><th>모델</th><th style={{ width: 90 }}>크기</th><th style={{ width: 130 }}>라이선스</th><th style={{ width: 200 }} /></tr></thead>
        <tbody>
          {LOCAL_MODELS.map((m) => (
            <tr key={m.file}>
              <td className="small"><b>{m.label}</b><br /><span className="muted mono">{m.file}</span></td>
              <td className="small">{m.size}</td><td className="small">{m.license}</td>
              <td><span className="flex" style={{ justifyContent: "flex-end" }}>
                {has(m.file)
                  ? (st?.running && st.model === m.file ? <button className="btn sm" onClick={() => invoke("llm_stop").then(refresh)}>중지</button> : <button className="btn sm primary" disabled={busy || !st?.server_path} onClick={() => start(m.file)}>{busy ? "시작 중…" : "시작"}</button>)
                  : dl?.file === m.file ? <><span className="small num">{dl.total ? `${Math.round((dl.received / dl.total) * 100)}%` : `${Math.round(dl.received / 1e6)}MB`}</span><button className="btn sm ghost" onClick={() => invoke("llm_cancel")}>취소</button></>
                  : <button className="btn sm" disabled={!!dl} onClick={() => invoke("llm_download", { url: m.url, file: m.file }).then(() => setDl({ file: m.file, received: 0, total: 0, done: false, error: null })).catch((e) => toast({ text: String(e) }))}>내려받기</button>}
              </span></td>
            </tr>
          ))}
          {st?.models.filter((x) => !LOCAL_MODELS.some((m) => m.file === x.file)).map((x) => (
            <tr key={x.file}><td className="small mono">{x.file}</td><td className="small">{(x.size / 1e9).toFixed(1)}GB</td><td className="small muted">직접 넣은 파일</td>
              <td><span className="flex" style={{ justifyContent: "flex-end" }}>{st.running && st.model === x.file ? <button className="btn sm" onClick={() => invoke("llm_stop").then(refresh)}>중지</button> : <button className="btn sm primary" disabled={busy || !st.server_path} onClick={() => start(x.file)}>시작</button>}</span></td></tr>
          ))}
        </tbody>
      </table>
      <div className="muted small" style={{ marginTop: 8 }}>모델 폴더: <span className="mono">{st?.models_dir}</span> · 다른 GGUF 파일을 이 폴더에 넣으면 목록에 나타납니다. 메모리 8GB PC는 4B 모델 하나만 실행하세요. 앱을 닫으면 서버도 꺼집니다.</div>
    </div>
  );
}
