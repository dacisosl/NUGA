//! 로컬 LLM (llama-server) 관리: 실행 파일 찾기, 모델 내려받기, 시작·중지.
//! 실행 파일은 설치 폴더의 llama/ (릴리스 빌드에 포함) 또는 앱 데이터 폴더의 llama/ 에서 찾는다.
//! 모델(GGUF)은 설치 파일에 넣지 않고, 처음 쓸 때 앱 데이터 폴더의 models/ 로 내려받는다.
use serde::Serialize;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Default)]
pub struct LlmState {
  child: Mutex<Option<(Child, u16, String)>>,
  cancel: AtomicBool,
}

#[derive(Serialize)]
pub struct ModelFile {
  file: String,
  size: u64,
}

#[derive(Serialize)]
pub struct LlmStatus {
  server_path: Option<String>,
  models_dir: String,
  models: Vec<ModelFile>,
  running: bool,
  port: u16,
  model: String,
}

#[derive(Serialize, Clone)]
struct Progress {
  file: String,
  received: u64,
  total: u64,
  done: bool,
  error: Option<String>,
}

#[cfg(windows)]
const EXE: &str = "llama-server.exe";
#[cfg(not(windows))]
const EXE: &str = "llama-server";

fn server_path(app: &AppHandle) -> Option<PathBuf> {
  let mut cands = vec![];
  if let Ok(r) = app.path().resource_dir() {
    cands.push(r.join("llama").join(EXE));
  }
  if let Ok(d) = app.path().app_data_dir() {
    cands.push(d.join("llama").join(EXE));
  }
  if let Ok(exe) = std::env::current_exe() {
    if let Some(dir) = exe.parent() {
      cands.push(dir.join("llama").join(EXE));
    }
  }
  cands.into_iter().find(|p| p.exists())
}

fn models_dir(app: &AppHandle) -> Result<PathBuf, String> {
  let d = app.path().app_data_dir().map_err(|e| e.to_string())?.join("models");
  std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
  Ok(d)
}

fn safe_file(name: &str) -> Result<String, String> {
  let bad = name.is_empty() || name.len() > 200 || name.contains('/') || name.contains('\\') || name.contains(':') || name.starts_with('.') || !name.ends_with(".gguf");
  if bad {
    return Err("모델 파일 이름이 올바르지 않음".into());
  }
  Ok(name.to_string())
}

fn is_running(st: &LlmState) -> (bool, u16, String) {
  let mut g = st.child.lock().unwrap();
  if let Some((c, port, model)) = g.as_mut() {
    match c.try_wait() {
      Ok(None) => return (true, *port, model.clone()),
      _ => {
        *g = None;
      }
    }
  }
  (false, 0, String::new())
}

#[tauri::command]
pub fn llm_status(app: AppHandle, st: State<LlmState>) -> Result<LlmStatus, String> {
  let dir = models_dir(&app)?;
  let mut models = vec![];
  if let Ok(rd) = std::fs::read_dir(&dir) {
    for e in rd.flatten() {
      let name = e.file_name().to_string_lossy().to_string();
      if name.ends_with(".gguf") {
        models.push(ModelFile { file: name, size: e.metadata().map(|m| m.len()).unwrap_or(0) });
      }
    }
  }
  let (running, port, model) = is_running(&st);
  Ok(LlmStatus {
    server_path: server_path(&app).map(|p| p.to_string_lossy().to_string()),
    models_dir: dir.to_string_lossy().to_string(),
    models,
    running,
    port,
    model,
  })
}

/// 모델 내려받기 (https 주소). 진행률은 "llm-download" 이벤트로 알린다.
#[tauri::command]
pub fn llm_download(app: AppHandle, st: State<LlmState>, url: String, file: String) -> Result<(), String> {
  let file = safe_file(&file)?;
  if !url.starts_with("https://") {
    return Err("https 주소만 내려받을 수 있음".into());
  }
  let dir = models_dir(&app)?;
  st.cancel.store(false, Ordering::SeqCst);
  let app2 = app.clone();
  std::thread::spawn(move || {
    let part = dir.join(format!("{file}.part"));
    let res = download(&app2, &url, &part, &dir.join(&file), &file);
    if let Err(e) = res {
      let _ = std::fs::remove_file(&part);
      let _ = app2.emit("llm-download", Progress { file: file.clone(), received: 0, total: 0, done: true, error: Some(e) });
    }
  });
  Ok(())
}

fn download(app: &AppHandle, url: &str, part: &PathBuf, dest: &PathBuf, file: &str) -> Result<(), String> {
  let client = reqwest::blocking::Client::builder().timeout(None).user_agent("nuga").build().map_err(|e| e.to_string())?;
  let mut resp = client.get(url).send().map_err(|e| e.to_string())?;
  if !resp.status().is_success() {
    return Err(format!("내려받기 실패 ({})", resp.status()));
  }
  let total = resp.content_length().unwrap_or(0);
  let mut out = std::fs::File::create(part).map_err(|e| e.to_string())?;
  let mut buf = vec![0u8; 1 << 20];
  let mut received = 0u64;
  let mut last = 0u64;
  loop {
    let st: State<LlmState> = app.state();
    if st.cancel.load(Ordering::SeqCst) {
      return Err("취소함".into());
    }
    let n = resp.read(&mut buf).map_err(|e| e.to_string())?;
    if n == 0 {
      break;
    }
    out.write_all(&buf[..n]).map_err(|e| e.to_string())?;
    received += n as u64;
    if received - last > (8 << 20) {
      last = received;
      let _ = app.emit("llm-download", Progress { file: file.to_string(), received, total, done: false, error: None });
    }
  }
  out.flush().map_err(|e| e.to_string())?;
  drop(out);
  std::fs::rename(part, dest).map_err(|e| e.to_string())?;
  let _ = app.emit("llm-download", Progress { file: file.to_string(), received, total, done: true, error: None });
  Ok(())
}

#[tauri::command]
pub fn llm_cancel(st: State<LlmState>) {
  st.cancel.store(true, Ordering::SeqCst);
}

fn stop_child(st: &LlmState) {
  if let Some((mut c, _, _)) = st.child.lock().unwrap().take() {
    let _ = c.kill();
    let _ = c.wait();
  }
}

/// llama-server 시작. 127.0.0.1 에서만 듣는다 (밖에서 접속 불가).
#[tauri::command]
pub fn llm_start(app: AppHandle, st: State<LlmState>, file: String, port: u16, ctx: u32, threads: u32) -> Result<(), String> {
  let file = safe_file(&file)?;
  let exe = server_path(&app).ok_or("llama-server 를 찾을 수 없음 (설치 파일에 포함되지 않았거나 앱 데이터 폴더에 없음)")?;
  let model = models_dir(&app)?.join(&file);
  if !model.exists() {
    return Err("모델 파일이 없음".into());
  }
  stop_child(&st);
  let mut cmd = Command::new(&exe);
  cmd.arg("-m").arg(&model)
    .arg("--host").arg("127.0.0.1")
    .arg("--port").arg(port.to_string())
    .arg("-c").arg(ctx.max(2048).to_string())
    .arg("--jinja")
    .stdout(Stdio::null())
    .stderr(Stdio::null());
  if threads > 0 {
    cmd.arg("-t").arg(threads.to_string());
  }
  if let Some(dir) = exe.parent() {
    cmd.current_dir(dir);
  }
  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
  }
  let child = cmd.spawn().map_err(|e| format!("실행 실패: {e}"))?;
  *st.child.lock().unwrap() = Some((child, port, file));
  Ok(())
}

#[tauri::command]
pub fn llm_stop(st: State<LlmState>) {
  stop_child(&st);
}

/// 앱을 닫을 때 서버도 끈다
pub fn shutdown(app: &AppHandle) {
  let st: State<LlmState> = app.state();
  stop_child(&st);
}

/// 모델 폴더 경로 (직접 GGUF 파일을 넣을 때)
#[tauri::command]
pub fn llm_models_dir(app: AppHandle) -> Result<String, String> {
  Ok(models_dir(&app)?.to_string_lossy().to_string())
}
