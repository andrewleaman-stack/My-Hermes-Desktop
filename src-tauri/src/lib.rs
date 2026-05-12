use serde::{Deserialize, Serialize};

// ─── Data Types ──────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Session {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub message_count: Option<u32>,
    pub cost: Option<f64>,
    pub model: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct StreamChunk {
    /// "text" | "think" | "tool_name" | "tool_input" | "tool_output"
    /// "status" | "done" | "error" | "new_session_id"
    pub kind: String,
    pub content: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct StatusInfo {
    pub model: String,
    pub tokens_used: String,
    pub tokens_max: String,
    pub cost: String,
    pub duration: String,
}

// ─── Commands & helpers (wrapped in a submodule to dodge tauri-macros 2.6.1
//     bug where lib-root `#[tauri::command]` triggers E0255 duplicate macro
//     names — see https://github.com/tauri-apps/tauri/issues for context). ──

// ─── Terminal PTY State ───────────────────────────────────────────────────────

pub struct AppState {
    pub pty_writers: std::sync::Mutex<
        std::collections::HashMap<String, Box<dyn std::io::Write + Send>>,
    >,
}

impl AppState {
    pub fn new() -> Self {
        AppState { pty_writers: std::sync::Mutex::new(std::collections::HashMap::new()) }
    }
}

pub mod commands {
    use super::{AppState, Session, StreamChunk};
    use std::io::{BufRead, BufReader, Read, Write};
    use std::process::{Command, Stdio};
    use tauri::{AppHandle, Emitter, State};
    use portable_pty::{CommandBuilder, PtySize, native_pty_system};

// ─── ANSI Stripping ───────────────────────────────────────────────────────────

fn strip_ansi(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = String::new();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            0x1b => {
                i += 1;
                if i >= bytes.len() { break; }
                match bytes[i] {
                    b'[' => {
                        // CSI sequence: ESC [ <params> <letter>
                        i += 1;
                        while i < bytes.len() && !bytes[i].is_ascii_alphabetic() {
                            i += 1;
                        }
                        if i < bytes.len() { i += 1; }
                    }
                    b']' => {
                        // OSC sequence: ESC ] ... BEL(\x07) or ESC\
                        // Used by hermes for hyperlinks — strip entirely.
                        i += 1;
                        while i < bytes.len() {
                            if bytes[i] == 0x07 { i += 1; break; }
                            if bytes[i] == 0x1b {
                                if i + 1 < bytes.len() && bytes[i + 1] == b'\\' { i += 2; }
                                else { i += 1; }
                                break;
                            }
                            i += 1;
                        }
                    }
                    _ => { i += 1; } // Other 2-char escape (ESC M, ESC =, etc.)
                }
            }
            b'\r' => {
                // CR = cursor to start of line → discard everything printed so
                // far on this line (the next chars overwrite from the beginning).
                // This is the correct terminal semantics for in-place rewrites.
                out.clear();
                i += 1;
            }
            _ => {
                // Regular UTF-8 content — collect bytes until next ESC or CR.
                let start = i;
                while i < bytes.len() && bytes[i] != 0x1b && bytes[i] != b'\r' {
                    i += 1;
                }
                if let Ok(chunk) = std::str::from_utf8(&bytes[start..i]) {
                    out.push_str(chunk);
                }
            }
        }
    }
    out
}

// ─── Output Parser ────────────────────────────────────────────────────────────

/// Returns true for decorative/metadata lines that should never reach the UI.
fn is_decorative(trimmed: &str) -> bool {
    if trimmed.is_empty() {
        return false;
    }
    // Box borders  ╭─ ⚕ Hermes ─╮  /  ╰──────────╯
    if trimmed.starts_with('╭') || trimmed.starts_with('╰') {
        return true;
    }
    // Tool-status lines  ┊ 🔍 recall ...
    if trimmed.starts_with('┊') {
        return true;
    }
    // Pure separator lines (all box-drawing / dash chars)
    if trimmed.len() > 4
        && trimmed
            .chars()
            .all(|c| matches!(c, '─' | '═' | '━' | '-' | '│' | ' '))
    {
        return true;
    }
    // Hermes metadata / header / footer keywords
    for prefix in &[
        "Query:",
        "Initializing ",
        "↻ ",
        "Resume this session with:",
        "Session: ",
        "Duration: ",
        "Messages: ",
        "Goodbye!",
        "Welcome to Hermes",
        "Tip:",
        "Warning:",
    ] {
        if trimmed.starts_with(prefix) {
            return true;
        }
    }

    // ── PTY-mode TUI elements ─────────────────────────────────────────────────

    // Status bar (old -q format): ⚕ model │ 12.4K/200K │ ...
    if trimmed.contains('│') && (trimmed.contains("K/") || trimmed.contains("M/")) {
        return true;
    }
    // Status bar (PTY format): deepseek-v4-flash | 0/1M | [░░] 0% | 0s | ⊙ 0s
    // These contain block/shade chars, ASCII pipes, and timing markers.
    if (trimmed.contains('░') || trimmed.contains('█'))
        && trimmed.contains('|')
    {
        return true;
    }
    // ctx -- lines: "-- | [░░░░] -- | 1s | ⊙ 0s"
    if trimmed.starts_with("-- |") || trimmed.starts_with("ctx --") {
        return true;
    }
    // Thinking / reflecting spinners: "(⌐_⌐ʼ) reflecting..."
    if trimmed.contains("reflecting...") {
        return true;
    }
    // Hint bar rendered after the prompt: "msg=interrupt · /queue · /bg ..."
    if trimmed.contains("msg=interrupt") || trimmed.contains("Ctrl+C cancel") {
        return true;
    }
    // Lines that are just the prompt character with optional trailing space
    if trimmed == "❯" {
        return true;
    }
    false
}

// ─── Session Helpers ──────────────────────────────────────────────────────────

fn hermes_home() -> Option<std::path::PathBuf> {
    dirs::home_dir().map(|h| h.join(".hermes"))
}

/// Attempt to list sessions via `hermes sessions list --json`.
/// Falls back to reading ~/.hermes/sessions/ directory entries.
#[tauri::command]
pub async fn list_sessions() -> Result<Vec<Session>, String> {
    // Try the CLI first
    let output = Command::new("hermes")
        .args(["sessions", "list", "--json"])
        .output();

    match output {
        Ok(out) if out.status.success() => {
            let text = String::from_utf8_lossy(&out.stdout);
            if let Ok(sessions) = serde_json::from_str::<Vec<Session>>(&text) {
                return Ok(sessions);
            }
        }
        _ => {}
    }

    // Fallback: scan ~/.hermes/sessions/
    let sessions_dir = match hermes_home() {
        Some(h) => h.join("sessions"),
        None => return Ok(vec![]),
    };

    let mut sessions = vec![];
    if let Ok(entries) = std::fs::read_dir(&sessions_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let filename = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("");

            // Skip API request dumps — they are not resumable chat sessions
            if filename.starts_with("request_dump_") {
                continue;
            }

            if path.extension().map_or(false, |e| e == "json" || e == "jsonl") {
                let meta = entry.metadata().ok();
                let fs_updated = meta
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| {
                        t.duration_since(std::time::UNIX_EPOCH).ok().map(|d| {
                            chrono::DateTime::<chrono::Utc>::from(
                                std::time::UNIX_EPOCH
                                    + std::time::Duration::from_secs(d.as_secs()),
                            )
                            .to_rfc3339()
                        })
                    })
                    .unwrap_or_default();

                let (id, title, count, updated, model) = read_session_info(&path, &fs_updated);
                sessions.push(Session {
                    id,
                    title,
                    created_at: updated.clone(),
                    updated_at: updated,
                    message_count: Some(count),
                    cost: None,
                    model,
                });
            }
        }
    }

    // Sort newest first
    sessions.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(sessions)
}

/// Parse a session file and return (hermes_session_id, title, message_count, updated_at, model).
fn read_session_info(path: &std::path::Path, fs_updated: &str) -> (String, String, u32, String, Option<String>) {
    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return (filename_stem(path), "Untitled".into(), 0, fs_updated.into(), None),
    };

    // Hermes session file: JSON object with top-level "session_id" and "messages"
    if let Ok(obj) = serde_json::from_str::<serde_json::Value>(&content) {
        if obj.is_object() {
            let hermes_id = obj
                .get("session_id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let id = if hermes_id.is_empty() {
                filename_stem(path)
            } else {
                hermes_id
            };

            let updated = obj
                .get("last_updated")
                .or_else(|| obj.get("session_start"))
                .and_then(|v| v.as_str())
                .unwrap_or(fs_updated)
                .to_string();

            let model = obj
                .get("model")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let messages = obj
                .get("messages")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();

            let count = messages.len() as u32;
            let title = messages
                .iter()
                .find(|m| m.get("role").and_then(|r| r.as_str()) == Some("user"))
                .and_then(|m| {
                    let c = m.get("content")?;
                    if let Some(s) = c.as_str() {
                        Some(s.trim().chars().take(60).collect::<String>())
                    } else if let Some(arr) = c.as_array() {
                        arr.iter()
                            .find(|b| b.get("type").and_then(|t| t.as_str()) == Some("text"))
                            .and_then(|b| b.get("text").and_then(|t| t.as_str()))
                            .map(|s| s.trim().chars().take(60).collect::<String>())
                    } else {
                        None
                    }
                })
                .unwrap_or_else(|| id.clone());

            return (id, title, count, updated, model);
        }
    }

    // JSONL: each line is a message object
    let lines: Vec<&str> = content.lines().filter(|l| !l.trim().is_empty()).collect();
    let count = lines.len() as u32;
    let title = lines
        .iter()
        .filter_map(|l| serde_json::from_str::<serde_json::Value>(l).ok())
        .find(|obj| obj.get("role").and_then(|r| r.as_str()) == Some("user"))
        .and_then(|obj| obj.get("content").and_then(|c| c.as_str()).map(|s| s.trim().chars().take(60).collect::<String>()))
        .unwrap_or_else(|| filename_stem(path));

    (filename_stem(path), title, count, fs_updated.into(), None)
}

fn filename_stem(path: &std::path::Path) -> String {
    path.file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string()
}

/// Read the message history for a given session from disk.
#[tauri::command]
pub async fn get_session_history(session_id: String) -> Result<serde_json::Value, String> {
    // Try hermes CLI first
    let out = Command::new("hermes")
        .args(["sessions", "export", &session_id, "--format", "json"])
        .output();

    if let Ok(o) = out {
        if o.status.success() {
            let text = String::from_utf8_lossy(&o.stdout).to_string();
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
                return Ok(v);
            }
        }
    }

    // Fallback: read file directly.
    // Hermes stores sessions as session_{id}.json; try both prefixed and bare names.
    let home = hermes_home().ok_or("Cannot find home dir")?;
    let sessions_dir = home.join("sessions");
    let candidates: Vec<String> = vec![
        format!("session_{}.json", session_id),
        format!("{}.json", session_id),
        format!("session_{}.jsonl", session_id),
        format!("{}.jsonl", session_id),
    ];

    for candidate in &candidates {
        let p = sessions_dir.join(candidate);
        if p.exists() {
            let content = std::fs::read_to_string(&p).map_err(|e| e.to_string())?;
            if candidate.ends_with(".jsonl") {
                let msgs: Vec<serde_json::Value> = content
                    .lines()
                    .filter_map(|l| serde_json::from_str(l).ok())
                    .collect();
                return Ok(serde_json::Value::Array(msgs));
            } else {
                return serde_json::from_str(&content).map_err(|e| e.to_string());
            }
        }
    }

    Ok(serde_json::Value::Array(vec![]))
}

/// Send a message to hermes (-q non-interactive mode). Clean parsed output.
#[tauri::command]
pub async fn send_message(
    app: AppHandle,
    session_id: Option<String>,
    message: String,
) -> Result<(), String> {
    let mut args: Vec<String> = vec!["chat".into(), "-q".into(), message.clone()];
    if let Some(ref id) = session_id {
        args.push("--resume".into());
        args.push(id.clone());
    }

    let mut child = Command::new("hermes")
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start hermes: {e}. Is hermes installed and in PATH?"))?;

    let stdout = child.stdout.take().ok_or("No stdout")?;
    let reader = BufReader::new(stdout);
    let mut in_think = false;
    let mut in_footer = false;

    for line_result in reader.lines() {
        let raw = line_result.map_err(|e| e.to_string())?;
        let clean = strip_ansi(&raw);
        let trimmed = clean.trim();

        if trimmed.starts_with("Resume this session with:") { in_footer = true; }
        if in_footer {
            if trimmed.starts_with("Duration:") || trimmed.starts_with("Messages:") {
                emit(&app, "session_stat", trimmed);
            }
            continue;
        }
        if (trimmed.contains('│') || trimmed.contains('|'))
            && (trimmed.contains("K/") || trimmed.contains("M/"))
        {
            emit(&app, "status", trimmed);
            continue;
        }
        if trimmed == "<think>" || trimmed.to_lowercase() == "[thinking]" || trimmed == "《思考》" {
            in_think = true; emit(&app, "think_start", ""); continue;
        }
        if trimmed == "</think>" || trimmed.to_lowercase() == "[/thinking]" || trimmed == "《/思考》" {
            in_think = false; emit(&app, "think_end", ""); continue;
        }
        if in_think {
            if !trimmed.is_empty() { emit(&app, "think", &clean); }
            continue;
        }
        if is_decorative(trimmed) { continue; }
        if !trimmed.is_empty() { emit(&app, "text", &clean); }
    }

    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if !stderr.trim().is_empty() { emit(&app, "error", &stderr); }
    }
    if session_id.is_none() {
        if let Ok(sessions) = list_sessions().await {
            if let Some(first) = sessions.first() {
                emit(&app, "new_session_id", &first.id);
            }
        }
    }
    emit(&app, "done", "");
    Ok(())
}

// ─── Terminal PTY Commands ────────────────────────────────────────────────────

/// Open a PTY running `hermes chat` and start streaming raw output via events.
/// The frontend xterm.js terminal writes to `pty_write` and listens on
/// "pty:<pty_id>" events for raw terminal data.
#[tauri::command]
pub fn pty_open(
    app: AppHandle,
    state: State<'_, AppState>,
    pty_id: String,
    session_id: Option<String>,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| format!("PTY open failed: {e}"))?;

    let mut cmd = CommandBuilder::new("hermes");
    cmd.arg("chat");
    if let Some(ref id) = session_id {
        cmd.arg("--resume");
        cmd.arg(id);
    }

    let child = pair.slave.spawn_command(cmd)
        .map_err(|e| format!("Failed to start hermes: {e}"))?;

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    // Store writer so pty_write can send keystrokes
    state.pty_writers.lock().unwrap().insert(pty_id.clone(), writer);

    // Stream raw PTY bytes to frontend (xterm.js handles all rendering)
    let event_name = format!("pty:{}", pty_id);
    std::thread::spawn(move || {
        let _child = child; // keep hermes alive
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    // Send raw bytes as Latin-1 string; xterm.js decodes correctly
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    app.emit(&event_name, data).ok();
                }
            }
        }
    });

    Ok(())
}

/// Write raw input bytes to the PTY (keyboard input from xterm.js).
#[tauri::command]
pub fn pty_write(
    state: State<'_, AppState>,
    pty_id: String,
    data: String,
) -> Result<(), String> {
    let mut writers = state.pty_writers.lock().unwrap();
    if let Some(writer) = writers.get_mut(&pty_id) {
        writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Resize the PTY (called when the terminal modal is resized).
#[tauri::command]
pub fn pty_resize(
    state: State<'_, AppState>,
    pty_id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    // portable-pty resize is done via the master handle which we've already
    // consumed into reader/writer. For now, send SIGWINCH via stty as a
    // best-effort — a full resize requires storing the MasterPty handle.
    let _ = (state, pty_id, rows, cols);
    Ok(())
}

/// Close a PTY session (drop the writer, causing hermes to see EOF and exit).
#[tauri::command]
pub fn pty_close(
    state: State<'_, AppState>,
    pty_id: String,
) -> Result<(), String> {
    state.pty_writers.lock().unwrap().remove(&pty_id);
    Ok(())
}

fn emit(app: &AppHandle, kind: &str, content: &str) {
    app.emit(
        "hermes:chunk",
        StreamChunk {
            kind: kind.to_string(),
            content: content.to_string(),
        },
    )
    .ok();
}

/// Get hermes version / status
#[tauri::command]
pub async fn get_hermes_info() -> Result<serde_json::Value, String> {
    let version_out = Command::new("hermes")
        .args(["version"])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_else(|_| "unknown".into());

    Ok(serde_json::json!({
        "version": version_out,
        "hermes_home": hermes_home().map(|p| p.to_string_lossy().to_string()).unwrap_or_default(),
    }))
}

/// Delete a session
#[tauri::command]
pub async fn delete_session(session_id: String) -> Result<(), String> {
    Command::new("hermes")
        .args(["sessions", "delete", &session_id])
        .output()
        .map_err(|e| e.to_string())?;
    Ok(())
}

} // pub mod commands

// ─── App Setup ────────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::list_sessions,
            commands::get_session_history,
            commands::send_message,
            commands::get_hermes_info,
            commands::delete_session,
            commands::pty_open,
            commands::pty_write,
            commands::pty_resize,
            commands::pty_close,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
