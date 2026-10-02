mod llm;

/// API 키 보안 저장: Windows 자격 증명 관리자(macOS 키체인)에 둔다. 문서 JSON·백업에는 넣지 않는다.
mod secrets {
  const SERVICE: &str = "kr.nuga.desktop";

  fn entry(name: &str) -> Result<keyring::Entry, String> {
    if name.is_empty() || name.len() > 64 || !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
      return Err("잘못된 키 이름".into());
    }
    keyring::Entry::new(SERVICE, name).map_err(|e| e.to_string())
  }

  #[tauri::command]
  pub fn secret_get(name: String) -> Result<Option<String>, String> {
    match entry(&name)?.get_password() {
      Ok(v) => Ok(Some(v)),
      Err(keyring::Error::NoEntry) => Ok(None),
      Err(e) => Err(e.to_string()),
    }
  }

  #[tauri::command]
  pub fn secret_set(name: String, value: String) -> Result<(), String> {
    let e = entry(&name)?;
    if value.is_empty() {
      return match e.delete_credential() { Ok(_) | Err(keyring::Error::NoEntry) => Ok(()), Err(x) => Err(x.to_string()) };
    }
    e.set_password(&value).map_err(|x| x.to_string())
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_opener::init())
    .manage(llm::LlmState::default())
    .invoke_handler(tauri::generate_handler![
      secrets::secret_get,
      secrets::secret_set,
      llm::llm_status,
      llm::llm_download,
      llm::llm_cancel,
      llm::llm_start,
      llm::llm_stop,
      llm::llm_models_dir
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app, event| {
      if let tauri::RunEvent::Exit = event {
        llm::shutdown(app);
      }
    });
}
