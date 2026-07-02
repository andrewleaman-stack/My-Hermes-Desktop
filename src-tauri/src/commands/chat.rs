use crate::StreamChunk;
use base64::Engine;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{mpsc, Arc, Mutex, OnceLock};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

fn decode_image_data_url(data_url: &str) -> Result<(Vec<u8>, &'static str), String> {
    let body = data_url
        .strip_prefix("data:")
        .ok_or("image is not a data URL")?;
    let (header, payload) = body.split_once(',').ok_or("image data URL missing comma")?;
    let (mime, encoding) = header.split_once(';').unwrap_or((header, ""));
    if !encoding.eq_ignore_ascii_case("base64") {
        return Err("image data URL must be base64-encoded".into());
    }
    let ext = match mime.to_ascii_lowercase().as_str() {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/jpg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        "image/bmp" => "bmp",
        other => return Err(format!("unsupported image mime: {other}")),
    };
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(payload.trim())
        .map_err(|e| format!("base64 decode failed: {e}"))?;
    Ok((bytes, ext))
}

// Persistent storage for attached images so that reloading a session can still
// recover them. macOS: ~/Library/Caches/hermes-desktop/images/
pub fn image_store_dir() -> Option<PathBuf> {
    let mut dir = dirs::cache_dir()?;
    dir.push("hermes-desktop");
    dir.push("images");
    Some(dir)
}

fn write_image_persistent(data_url: &str) -> Result<PathBuf, String> {
    let (bytes, ext) = decode_image_data_url(data_url)?;
    let dir = image_store_dir().ok_or("cannot locate cache dir")?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("cannot create image dir: {e}"))?;
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let path = dir.join(format!("img-{nanos}-{:x}.{ext}", std::process::id()));
    let mut f =
        std::fs::File::create(&path).map_err(|e| format!("cannot create image file: {e}"))?;
    f.write_all(&bytes)
        .map_err(|e| format!("cannot write image file: {e}"))?;
    Ok(path)
}

fn emit(app: &AppHandle, session_id: &str, kind: &str, content: &str) {
    app.emit(
        "hermes:chunk",
        StreamChunk {
            kind: kind.to_string(),
            content: content.to_string(),
            session_id: session_id.to_string(),
        },
    )
    .ok();
}

/// Emit a lifecycle event with elapsed time and optional detail.
fn emit_lifecycle(app: &AppHandle, session_tag: &str, phase: &str, start: &Instant, detail: Option<&str>) {
    let elapsed = start.elapsed().as_millis() as u64;
    let event = if let Some(d) = detail {
        serde_json::json!({
            "phase": phase,
            "elapsed_ms": elapsed,
            "detail": d
        })
    } else {
        serde_json::json!({
            "phase": phase,
            "elapsed_ms": elapsed
        })
    };
    let payload = serde_json::to_string(&event).unwrap_or_default();
    emit(app, session_tag, "lifecycle", &payload);
}


struct GatewayState {
    child: Mutex<Option<Child>>,
    stdin: Mutex<Option<ChildStdin>>,
    pending: Mutex<std::collections::HashMap<u64, mpsc::Sender<serde_json::Value>>>,
    sessions: Mutex<std::collections::HashMap<String, String>>,
    runtime_to_public: Mutex<std::collections::HashMap<String, String>>,
    /// Runtime session id → last event time, for turns awaiting message.complete.
    /// Watchdog threads abandon a turn after prolonged silence.
    active_turns: Mutex<std::collections::HashMap<String, Instant>>,
    /// Last lines of gateway stderr, appended to errors for diagnosability.
    stderr_tail: Mutex<std::collections::VecDeque<String>>,
    next_id: AtomicU64,
}

const STDERR_TAIL_LINES: usize = 20;
/// A turn with no gateway events for this long is considered hung.
const TURN_SILENCE_TIMEOUT: Duration = Duration::from_secs(300);

impl GatewayState {
    fn new() -> Self {
        Self {
            child: Mutex::new(None),
            stdin: Mutex::new(None),
            pending: Mutex::new(std::collections::HashMap::new()),
            sessions: Mutex::new(std::collections::HashMap::new()),
            runtime_to_public: Mutex::new(std::collections::HashMap::new()),
            active_turns: Mutex::new(std::collections::HashMap::new()),
            stderr_tail: Mutex::new(std::collections::VecDeque::new()),
            next_id: AtomicU64::new(1),
        }
    }

    fn stderr_tail_string(&self) -> String {
        let tail = self.stderr_tail.lock().unwrap();
        if tail.is_empty() {
            String::new()
        } else {
            format!("Gateway stderr:\n{}", tail.iter().cloned().collect::<Vec<_>>().join("\n"))
        }
    }
}

static GATEWAY: OnceLock<Arc<GatewayState>> = OnceLock::new();

fn gateway_state() -> Arc<GatewayState> {
    GATEWAY.get_or_init(|| Arc::new(GatewayState::new())).clone()
}

fn gateway_python() -> String {
    if let Some(home) = dirs::home_dir() {
        let bundled = home
            .join(".hermes")
            .join("hermes-agent")
            .join("venv")
            .join("bin")
            .join("python");
        if bundled.exists() {
            return bundled.to_string_lossy().to_string();
        }
    }
    "python3".to_string()
}

fn gateway_cwd() -> Option<PathBuf> {
    dirs::home_dir()
        .map(|h| h.join(".hermes").join("hermes-agent"))
        .filter(|p| p.is_dir())
}

/// Forward model/context/token stats as a "status_json" chunk. `usage` is the
/// gateway's _get_usage() dict; `model` falls back to usage.model when the
/// caller has no better source.
fn emit_usage_status(
    app: &AppHandle,
    public_sid: &str,
    model: Option<&str>,
    usage: &serde_json::Value,
) {
    let model = model
        .filter(|m| !m.is_empty())
        .or_else(|| usage.get("model").and_then(|v| v.as_str()))
        .unwrap_or("");
    let status = serde_json::json!({
        "model": model,
        "context_used": usage.get("context_used").and_then(|v| v.as_u64()),
        "context_max": usage.get("context_max").and_then(|v| v.as_u64()),
        "context_percent": usage.get("context_percent").and_then(|v| v.as_u64()),
        "input": usage.get("input").and_then(|v| v.as_u64()),
        "output": usage.get("output").and_then(|v| v.as_u64()),
        "total": usage.get("total").and_then(|v| v.as_u64()),
    });
    emit(app, public_sid, "status_json", &status.to_string());
}

fn emit_gateway_event(app: &AppHandle, gateway: &Arc<GatewayState>, frame: serde_json::Value) {
    let params = match frame.get("params") {
        Some(v) => v,
        None => return,
    };
    let event_type = params.get("type").and_then(|v| v.as_str()).unwrap_or("");
    if event_type == "gateway.ready" {
        return;
    }
    let runtime_sid = params.get("session_id").and_then(|v| v.as_str()).unwrap_or("");
    if runtime_sid.is_empty() {
        return;
    }
    // Any event for the session counts as turn liveness for the watchdog.
    if let Some(t) = gateway.active_turns.lock().unwrap().get_mut(runtime_sid) {
        *t = Instant::now();
    }
    let public_sid = gateway
        .runtime_to_public
        .lock()
        .unwrap()
        .get(runtime_sid)
        .cloned()
        .unwrap_or_else(|| runtime_sid.to_string());
    let payload = params.get("payload").cloned().unwrap_or(serde_json::Value::Null);
    match event_type {
        "session.info" => {
            // Token/context stats live in payload.usage — forward the subset the
            // UI needs (token counter, context meter, model name) as one chunk.
            let usage = payload.get("usage").cloned().unwrap_or(serde_json::Value::Null);
            let model = payload.get("model").and_then(|v| v.as_str());
            emit_usage_status(app, &public_sid, model, &usage);
        }
        "status.update" => {
            let kind = payload.get("kind").and_then(|v| v.as_str()).unwrap_or("status");
            let text = payload.get("text").and_then(|v| v.as_str()).unwrap_or("");
            let status = serde_json::json!({ "kind": kind, "text": text });
            emit(app, &public_sid, "gateway_status", &status.to_string());
        }
        "message.delta" => {
            if let Some(text) = payload.get("text").and_then(|v| v.as_str()) {
                if !text.is_empty() {
                    emit(app, &public_sid, "text", text);
                }
            }
        }
        "message.complete" => {
            gateway.active_turns.lock().unwrap().remove(runtime_sid);
            // Turn completion carries a fresh _get_usage() snapshot — forward it
            // so token/context stats update even when no session.info follows.
            if let Some(usage) = payload.get("usage") {
                emit_usage_status(app, &public_sid, None, usage);
            }
            if let Some(duration) = payload.get("duration").and_then(|v| v.as_f64()) {
                emit(app, &public_sid, "session_stat", &format!("Duration: {:.1}s", duration));
            }
            emit(app, &public_sid, "done", "");
        }
        "error" => {
            gateway.active_turns.lock().unwrap().remove(runtime_sid);
            let message = payload
                .get("message")
                .and_then(|v| v.as_str())
                .unwrap_or("Hermes gateway error");
            emit(app, &public_sid, "error", message);
            emit(app, &public_sid, "done", "");
        }
        "tool.start" => {
            let name = payload
                .get("name")
                .or_else(|| payload.get("tool"))
                .and_then(|v| v.as_str())
                .unwrap_or("tool");
            emit(app, &public_sid, "tool_name", name);
            if let Some(args) = payload.get("args").or_else(|| payload.get("input")) {
                if !args.is_null() {
                    emit(app, &public_sid, "tool_input", &args.to_string());
                }
            }
        }
        "tool.output" | "tool.delta" => {
            if let Some(text) = payload.get("text").or_else(|| payload.get("output")).and_then(|v| v.as_str()) {
                emit(app, &public_sid, "tool_output", text);
            }
        }
        "tool.complete" => {
            if let Some(text) = payload.get("text").or_else(|| payload.get("output")).and_then(|v| v.as_str()) {
                if !text.is_empty() {
                    emit(app, &public_sid, "tool_output", text);
                }
            }
            emit(app, &public_sid, "tool_output_end", "");
        }
        _ => {}
    }
}

fn start_gateway_if_needed(app: &AppHandle, gateway: &Arc<GatewayState>) -> Result<(), String> {
    if gateway.stdin.lock().unwrap().is_some() {
        return Ok(());
    }

    // Fresh spawn: drop diagnostics from any previous gateway instance.
    gateway.stderr_tail.lock().unwrap().clear();

    let mut cmd = Command::new(gateway_python());
    cmd.args(["-u", "-m", "tui_gateway.entry"])
        .env("PYTHONUNBUFFERED", "1")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(cwd) = gateway_cwd() {
        cmd.current_dir(cwd);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to start persistent Hermes gateway: {e}"))?;
    let stdin = child.stdin.take().ok_or("persistent gateway stdin unavailable")?;
    let stdout = child.stdout.take().ok_or("persistent gateway stdout unavailable")?;
    let stderr = child.stderr.take();

    let gateway_for_reader = gateway.clone();
    let app_for_reader = app.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines().map_while(Result::ok) {
            let parsed: serde_json::Value = match serde_json::from_str(&line) {
                Ok(v) => v,
                Err(_) => continue,
            };
            if let Some(id) = parsed.get("id").and_then(|v| v.as_u64()) {
                if let Some(tx) = gateway_for_reader.pending.lock().unwrap().remove(&id) {
                    let _ = tx.send(parsed);
                }
                continue;
            }
            if parsed.get("method").and_then(|v| v.as_str()) == Some("event") {
                emit_gateway_event(&app_for_reader, &gateway_for_reader, parsed);
            }
        }

        // Gateway exited (crash or shutdown). Fail in-flight turns visibly,
        // then reset all state so the next send starts a fresh gateway with
        // no stale runtime session ids.
        let gw = &gateway_for_reader;
        let dead_turns: Vec<String> = {
            let mapping = gw.runtime_to_public.lock().unwrap();
            gw.active_turns
                .lock()
                .unwrap()
                .drain()
                .map(|(runtime_sid, _)| {
                    mapping.get(&runtime_sid).cloned().unwrap_or(runtime_sid)
                })
                .collect()
        };
        if !dead_turns.is_empty() {
            let tail = gw.stderr_tail_string();
            let message = if tail.is_empty() {
                "Hermes gateway exited unexpectedly.".to_string()
            } else {
                format!("Hermes gateway exited unexpectedly.\n{tail}")
            };
            for public_sid in dead_turns {
                emit(&app_for_reader, &public_sid, "error", &message);
                emit(&app_for_reader, &public_sid, "done", "");
            }
        }
        *gw.stdin.lock().unwrap() = None;
        gw.sessions.lock().unwrap().clear();
        gw.runtime_to_public.lock().unwrap().clear();
        // Dropping pending senders wakes blocked gateway_rpc calls immediately.
        gw.pending.lock().unwrap().clear();
        if let Some(mut child) = gw.child.lock().unwrap().take() {
            let _ = child.wait();
        }
    });

    if let Some(stderr) = stderr {
        let gateway_for_stderr = gateway.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                // Keep a short tail for error reporting; normal gateway noise
                // stays out of the UI unless something actually fails.
                let mut tail = gateway_for_stderr.stderr_tail.lock().unwrap();
                if tail.len() >= STDERR_TAIL_LINES {
                    tail.pop_front();
                }
                tail.push_back(line);
            }
        });
    }

    *gateway.stdin.lock().unwrap() = Some(stdin);
    *gateway.child.lock().unwrap() = Some(child);
    Ok(())
}

fn gateway_rpc(
    app: &AppHandle,
    gateway: &Arc<GatewayState>,
    method: &str,
    params: serde_json::Value,
    timeout: Duration,
) -> Result<serde_json::Value, String> {
    start_gateway_if_needed(app, gateway)?;
    let id = gateway.next_id.fetch_add(1, Ordering::SeqCst);
    let (tx, rx) = mpsc::channel();
    gateway.pending.lock().unwrap().insert(id, tx);
    let request = serde_json::json!({
        "jsonrpc": "2.0",
        "id": id,
        "method": method,
        "params": params,
    });
    let line = serde_json::to_string(&request).map_err(|e| e.to_string())? + "\n";
    {
        let mut stdin_lock = gateway.stdin.lock().unwrap();
        let stdin = stdin_lock.as_mut().ok_or("persistent gateway is not running")?;
        if let Err(e) = stdin.write_all(line.as_bytes()).and_then(|_| stdin.flush()) {
            *stdin_lock = None;
            gateway.pending.lock().unwrap().remove(&id);
            return Err(format!("persistent gateway write failed: {e}"));
        }
    }
    let frame = match rx.recv_timeout(timeout) {
        Ok(frame) => frame,
        Err(e) => {
            gateway.pending.lock().unwrap().remove(&id);
            let base = match e {
                mpsc::RecvTimeoutError::Timeout => format!("persistent gateway timed out: {method}"),
                mpsc::RecvTimeoutError::Disconnected => {
                    format!("persistent gateway exited during: {method}")
                }
            };
            let tail = gateway.stderr_tail_string();
            return Err(if tail.is_empty() { base } else { format!("{base}\n{tail}") });
        }
    };
    if let Some(error) = frame.get("error") {
        let message = error.get("message").and_then(|v| v.as_str()).unwrap_or("Hermes RPC failed");
        return Err(message.to_string());
    }
    Ok(frame.get("result").cloned().unwrap_or(serde_json::Value::Null))
}

#[tauri::command]
pub async fn kill_session(
    app: AppHandle,
    _state: tauri::State<'_, crate::AppState>,
    session_tag: String,
) -> Result<(), String> {
    let gateway = gateway_state();
    let runtime_sid = gateway.sessions.lock().unwrap().get(&session_tag).cloned();
    if let Some(runtime_sid) = runtime_sid {
        let _ = gateway_rpc(
            &app,
            &gateway,
            "session.interrupt",
            serde_json::json!({ "session_id": runtime_sid }),
            Duration::from_secs(5),
        );
    }
    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct SkillInfo {
    pub name: String,
    pub category: String,
    pub description: String,
}

fn extract_frontmatter_description(content: &str) -> Option<String> {
    let mut in_front = false;
    for (i, line) in content.lines().enumerate() {
        if i == 0 && line.trim() == "---" {
            in_front = true;
            continue;
        }
        if in_front && line.trim() == "---" {
            break;
        }
        if in_front {
            let trimmed = line.trim();
            if let Some(rest) = trimmed.strip_prefix("description:") {
                let value = rest.trim().trim_matches('"').trim_matches('\'');
                if !value.is_empty() && !value.starts_with('|') && !value.starts_with('>') {
                    return Some(value.to_string());
                }
            }
        }
    }
    None
}

fn collect_skill_descriptions(
    dir: &std::path::Path,
    map: &mut std::collections::HashMap<String, String>,
    depth: usize,
) {
    if depth > 3 {
        return;
    }
    let skill_md = dir.join("SKILL.md");
    if skill_md.exists() {
        if let Ok(content) = std::fs::read_to_string(&skill_md) {
            if let Some(desc) = extract_frontmatter_description(&content) {
                if let Some(name) = dir.file_name().and_then(|n| n.to_str()) {
                    map.insert(name.to_string(), desc);
                }
            }
        }
        return;
    }
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                collect_skill_descriptions(&entry.path(), map, depth + 1);
            }
        }
    }
}

#[tauri::command]
pub async fn list_skills() -> Result<Vec<SkillInfo>, String> {
    let output = super::sessions::hermes_command()
        .args(["skills", "list"])
        .output()
        .map_err(|e| format!("Failed to run hermes skills list: {e}"))?;

    // Build description map from ~/.hermes/skills/
    let mut desc_map = std::collections::HashMap::new();
    if let Some(home) = dirs::home_dir() {
        let skills_dir = home.join(".hermes").join("skills");
        if skills_dir.is_dir() {
            collect_skill_descriptions(&skills_dir, &mut desc_map, 0);
        }
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut skills = Vec::new();

    for line in stdout.lines() {
        if !line.starts_with('│') {
            continue;
        }
        let cols: Vec<&str> = line.split('│').collect();
        if cols.len() < 3 {
            continue;
        }
        let name = cols[1].trim();
        let category = cols[2].trim();
        if name.is_empty() || name == "Name" || name.starts_with('─') || name.starts_with('━') {
            continue;
        }
        let description = desc_map.get(name).cloned().unwrap_or_default();
        skills.push(SkillInfo {
            name: name.to_string(),
            category: category.to_string(),
            description,
        });
    }

    Ok(skills)
}

#[tauri::command]
pub async fn send_message(
    app: AppHandle,
    _state: tauri::State<'_, crate::AppState>,
    session_id: Option<String>,
    message: String,
    session_tag: String,
    image: Option<String>,
    working_dir: Option<String>,
    skills: Option<Vec<String>>,
) -> Result<(), String> {
    let start = Instant::now();
    let gateway = gateway_state();
    start_gateway_if_needed(&app, &gateway)?;
    emit_lifecycle(&app, &session_tag, "gateway_ready", &start, Some("persistent"));

    let runtime_sid = if let Some(existing) = gateway.sessions.lock().unwrap().get(&session_tag).cloned() {
        existing
    } else if let Some(real_id) = session_id.as_ref().filter(|id| !id.starts_with("new_")) {
        let result = gateway_rpc(
            &app,
            &gateway,
            "session.resume",
            serde_json::json!({
                "session_id": real_id,
                "cols": 100,
                "source": "desktop",
                "cwd": working_dir.clone().unwrap_or_default(),
            }),
            Duration::from_secs(30),
        )?;
        let runtime = result
            .get("session_id")
            .and_then(|v| v.as_str())
            .ok_or("session.resume did not return a runtime session id")?
            .to_string();
        gateway.sessions.lock().unwrap().insert(session_tag.clone(), runtime.clone());
        gateway.sessions.lock().unwrap().insert(real_id.clone(), runtime.clone());
        gateway.runtime_to_public.lock().unwrap().insert(runtime.clone(), real_id.clone());
        runtime
    } else {
        let mut params = serde_json::json!({
            "cols": 100,
            "source": "desktop",
            "close_on_disconnect": false,
        });
        if let Some(dir) = working_dir.as_ref().filter(|d| !d.trim().is_empty()) {
            params["cwd"] = serde_json::Value::String(dir.clone());
        }
        if let Some(skill_list) = skills.as_ref() {
            let selected: Vec<String> = skill_list
                .iter()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();
            if !selected.is_empty() {
                // The gateway does not have a dedicated preload-skills field on
                // session.create. Preserve user intent by prepending a compact
                // instruction to the first prompt below.
            }
        }
        let result = gateway_rpc(
            &app,
            &gateway,
            "session.create",
            params,
            Duration::from_secs(30),
        )?;
        let runtime = result
            .get("session_id")
            .and_then(|v| v.as_str())
            .ok_or("session.create did not return a runtime session id")?
            .to_string();
        let public_id = result
            .get("stored_session_id")
            .and_then(|v| v.as_str())
            .unwrap_or(&runtime)
            .to_string();
        gateway.sessions.lock().unwrap().insert(session_tag.clone(), runtime.clone());
        gateway.sessions.lock().unwrap().insert(public_id.clone(), runtime.clone());
        gateway.runtime_to_public.lock().unwrap().insert(runtime.clone(), public_id.clone());
        if public_id != session_tag {
            emit(&app, &session_tag, "new_session_id", &public_id);
        }
        runtime
    };

    if let Some(ref data_url) = image {
        let path = write_image_persistent(data_url)?;
        let _ = gateway_rpc(
            &app,
            &gateway,
            "image.attach",
            serde_json::json!({ "session_id": runtime_sid, "path": path.to_string_lossy() }),
            Duration::from_secs(30),
        )?;
    }

    let mut prompt = message;
    if let Some(skill_list) = skills {
        let selected: Vec<String> = skill_list
            .iter()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        if !selected.is_empty() {
            prompt = format!("Load and follow these skills for this turn: {}.\n\n{}", selected.join(", "), prompt);
        }
    }

    gateway_rpc(
        &app,
        &gateway,
        "prompt.submit",
        serde_json::json!({ "session_id": runtime_sid, "text": prompt }),
        Duration::from_secs(20),
    )?;
    emit_lifecycle(&app, &session_tag, "submitted", &start, Some("persistent_gateway"));

    // Watchdog: if the gateway goes silent mid-turn (no events at all for
    // TURN_SILENCE_TIMEOUT), abandon the turn so the UI doesn't stay in
    // "streaming" forever. Every gateway event for this session bumps the
    // timestamp, so long tool runs and slow models don't trip it.
    gateway
        .active_turns
        .lock()
        .unwrap()
        .insert(runtime_sid.clone(), Instant::now());
    let watchdog_gateway = gateway.clone();
    let watchdog_app = app.clone();
    let watchdog_sid = runtime_sid.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(15));
        let last = watchdog_gateway
            .active_turns
            .lock()
            .unwrap()
            .get(&watchdog_sid)
            .copied();
        match last {
            // Turn completed (or gateway died — the reader thread already
            // reported that); nothing left to watch.
            None => break,
            Some(t) if t.elapsed() > TURN_SILENCE_TIMEOUT => {
                // remove() guards against a racing watchdog double-reporting.
                if watchdog_gateway
                    .active_turns
                    .lock()
                    .unwrap()
                    .remove(&watchdog_sid)
                    .is_none()
                {
                    break;
                }
                let public_sid = watchdog_gateway
                    .runtime_to_public
                    .lock()
                    .unwrap()
                    .get(&watchdog_sid)
                    .cloned()
                    .unwrap_or_else(|| watchdog_sid.clone());
                let minutes = TURN_SILENCE_TIMEOUT.as_secs() / 60;
                emit(
                    &watchdog_app,
                    &public_sid,
                    "error",
                    &format!("No response from Hermes for {minutes} minutes — the turn was abandoned. Retry to continue."),
                );
                emit(&watchdog_app, &public_sid, "done", "");
                break;
            }
            Some(_) => {}
        }
    });
    Ok(())
}

/// Kill the persistent gateway (if running). Called on app shutdown so the
/// Python process doesn't outlive the app; the reader thread then resets all
/// gateway state via its normal exit path.
pub fn shutdown_gateway() {
    if let Some(gateway) = GATEWAY.get() {
        *gateway.stdin.lock().unwrap() = None;
        if let Some(mut child) = gateway.child.lock().unwrap().take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

// ─── set_hermes_model: directly edit config.yaml ────────────────────────────

fn normalize_model_id(provider: &str, model: &str) -> String {
    let prefix = format!("{provider}:");
    model.strip_prefix(&prefix).unwrap_or(model).to_string()
}

fn rewrite_model_section(yaml: &str, new_provider: &str, new_model: &str) -> String {
    let mut lines: Vec<String> = Vec::new();
    let mut in_model = false;

    for line in yaml.lines() {
        if line == "model:" {
            in_model = true;
            lines.push(line.to_string());
            continue;
        }
        if in_model {
            if !line.starts_with(' ') && !line.is_empty() {
                in_model = false;
            } else {
                let t = line.trim();
                if t.starts_with("provider:") {
                    lines.push(format!("  provider: {}", new_provider));
                    continue;
                } else if t.starts_with("default:") {
                    lines.push(format!("  default: {}", new_model));
                    continue;
                }
            }
        }
        lines.push(line.to_string());
    }
    lines.join("\n")
}

#[tauri::command]
pub async fn set_hermes_model(provider: String, model: String) -> Result<(), String> {
    let home = crate::commands::sessions::hermes_home()
        .ok_or_else(|| "Cannot locate hermes home".to_string())?;
    let path = home.join("config.yaml");
    let text =
        std::fs::read_to_string(&path).map_err(|e| format!("Cannot read config.yaml: {e}"))?;
    let model = normalize_model_id(&provider, &model);
    let updated = rewrite_model_section(&text, &provider, &model);
    std::fs::write(&path, updated).map_err(|e| format!("Cannot write config.yaml: {e}"))
}

// ─── Reasoning Effort ────────────────────────────────────────────────────────

fn parse_reasoning_effort(yaml: &str) -> String {
    let mut in_agent = false;
    for line in yaml.lines() {
        if line.trim() == "agent:" {
            in_agent = true;
            continue;
        }
        if in_agent {
            // A non-indented, non-empty line means we've left the agent section
            if !line.starts_with(' ') && !line.is_empty() {
                break;
            }
            let t = line.trim();
            if let Some(v) = t.strip_prefix("reasoning_effort:") {
                return v.trim().trim_matches('\'').trim_matches('"').to_string();
            }
        }
    }
    "medium".to_string()
}

fn rewrite_reasoning_effort(yaml: &str, new_level: &str) -> String {
    let mut lines: Vec<String> = Vec::new();
    let mut in_agent = false;
    let mut found = false;
    let mut agent_end_idx: Option<usize> = None;

    let raw_lines: Vec<&str> = yaml.lines().collect();
    for (i, line) in raw_lines.iter().enumerate() {
        if *line == "agent:" {
            in_agent = true;
            lines.push((*line).to_string());
            continue;
        }
        if in_agent {
            if !line.starts_with(' ') && !line.is_empty() {
                in_agent = false;
                agent_end_idx = Some(i);
            } else {
                let t = line.trim();
                if t.starts_with("reasoning_effort:") {
                    lines.push(format!("  reasoning_effort: {}", new_level));
                    found = true;
                    continue;
                }
            }
        }
        lines.push((*line).to_string());
    }

    if !found {
        if let Some(idx) = agent_end_idx {
            lines.insert(idx, format!("  reasoning_effort: {}", new_level));
        } else {
            lines.push(format!("  reasoning_effort: {}", new_level));
        }
    }

    lines.join("\n")
}

#[tauri::command]
pub async fn get_reasoning_effort() -> Result<String, String> {
    let home = crate::commands::sessions::hermes_home()
        .ok_or_else(|| "Cannot locate hermes home".to_string())?;
    let path = home.join("config.yaml");
    let text = std::fs::read_to_string(&path).map_err(|e| format!("Cannot read config.yaml: {e}"))?;
    Ok(parse_reasoning_effort(&text))
}

#[tauri::command]
pub async fn set_reasoning_effort(level: String) -> Result<(), String> {
    let valid = ["none", "minimal", "low", "medium", "high", "xhigh"];
    if !valid.contains(&level.as_str()) {
        return Err(format!(
            "Invalid reasoning effort level: {}. Valid: none, minimal, low, medium, high, xhigh",
            level
        ));
    }
    let home = crate::commands::sessions::hermes_home()
        .ok_or_else(|| "Cannot locate hermes home".to_string())?;
    let path = home.join("config.yaml");
    let text = std::fs::read_to_string(&path).map_err(|e| format!("Cannot read config.yaml: {e}"))?;
    let updated = rewrite_reasoning_effort(&text, &level);
    std::fs::write(&path, updated).map_err(|e| format!("Cannot write config.yaml: {e}"))
}

// ─── Helpers for get_hermes_model_config ─────────────────────────────────────

fn parse_model_section(yaml: &str) -> (String, String) {
    let mut provider = String::new();
    let mut default_model = String::new();
    let mut in_model = false;

    for line in yaml.lines() {
        if line == "model:" {
            in_model = true;
            continue;
        }
        if in_model {
            // A non-indented, non-empty line means we've left the model section
            if !line.starts_with(' ') && !line.is_empty() {
                break;
            }
            let t = line.trim();
            if let Some(v) = t.strip_prefix("provider:") {
                provider = v.trim().trim_matches('\'').trim_matches('"').to_string();
            } else if let Some(v) = t.strip_prefix("default:") {
                default_model = v.trim().trim_matches('\'').trim_matches('"').to_string();
            }
        }
    }
    (provider, default_model)
}

fn configured_providers_from_env(env: &str) -> Vec<String> {
    const KEY_MAP: &[(&str, &str)] = &[
        ("ANTHROPIC_API_KEY", "anthropic"),
        ("OPENROUTER_API_KEY", "openrouter"),
        ("OPENAI_API_KEY", "openai"),
        ("OPENCODE_GO_API_KEY", "opencode-go"),
        ("GEMINI_API_KEY", "gemini"),
        ("HERMES_GATEWAY_TOKEN", "nous"),
    ];
    let mut providers = Vec::new();
    for line in env.lines() {
        let t = line.trim();
        if t.starts_with('#') || t.is_empty() {
            continue;
        }
        for (key, prov) in KEY_MAP {
            if let Some(val) = t.strip_prefix(&format!("{}=", key)) {
                let v = val.trim();
                if !v.is_empty() && !providers.iter().any(|p: &String| p == prov) {
                    providers.push(prov.to_string());
                }
            }
        }
    }
    providers
}

#[tauri::command]
pub async fn get_hermes_model_config() -> Result<serde_json::Value, String> {
    let home = crate::commands::sessions::active_hermes_home()
        .ok_or_else(|| "Cannot locate hermes home".to_string())?;
    let config_path = crate::commands::sessions::hermes_config_path()
        .unwrap_or_else(|| home.join("config.yaml"));
    let env_path = crate::commands::sessions::hermes_env_path()
        .unwrap_or_else(|| home.join(".env"));

    let config_text = std::fs::read_to_string(config_path).unwrap_or_default();
    let env_text = std::fs::read_to_string(env_path).unwrap_or_default();

    let (current_provider, current_model) = parse_model_section(&config_text);
    let mut configured = configured_providers_from_env(&env_text);

    // Also detect OAuth-authenticated providers from auth.json credential_pool
    let auth_text = std::fs::read_to_string(home.join("auth.json")).unwrap_or_default();
    if let Ok(auth) = serde_json::from_str::<serde_json::Value>(&auth_text) {
        if let Some(pool) = auth["credential_pool"].as_object() {
            for (prov, creds) in pool {
                if let Some(arr) = creds.as_array() {
                    if !arr.is_empty() && !configured.contains(prov) {
                        configured.push(prov.clone());
                    }
                }
            }
        }
    }

    // Always include the active provider even if its key isn't in .env
    if !current_provider.is_empty() && !configured.contains(&current_provider) {
        configured.insert(0, current_provider.clone());
    }

    // Hardcoded model fallbacks for providers not covered by models_dev_cache.json
    const PROVIDER_MODEL_FALLBACKS: &[(&str, &[&str])] = &[
        (
            "openai-codex",
            &[
                "gpt-5.5",
                "gpt-5.4-mini",
                "gpt-5.4",
                "gpt-5.3-codex",
                "gpt-5.2-codex",
                "gpt-5.1-codex-max",
                "gpt-5.1-codex-mini",
            ],
        ),
        (
            "nous",
            &["hermes-3-llama-3.1-405b", "hermes-3-llama-3.1-70b"],
        ),
    ];

    // Read models_dev_cache.json and extract model IDs per configured provider
    let cache_text =
        std::fs::read_to_string(home.join("models_dev_cache.json")).unwrap_or_default();
    let cache: serde_json::Value =
        serde_json::from_str(&cache_text).unwrap_or(serde_json::Value::Null);

    let mut model_groups: Vec<serde_json::Value> = Vec::new();
    for prov in &configured {
        if let Some(entry) = cache.get(prov) {
            if let Some(models_map) = entry.get("models").and_then(|m| m.as_object()) {
                let mut ids: Vec<String> = models_map.keys().cloned().collect();
                ids.sort();
                model_groups.push(serde_json::json!({
                    "provider": prov,
                    "models": ids,
                }));
                continue;
            }
        }
        // Provider not in cache — use hardcoded fallback if available
        for (fb_prov, fb_models) in PROVIDER_MODEL_FALLBACKS {
            if prov == fb_prov {
                model_groups.push(serde_json::json!({
                    "provider": prov,
                    "models": fb_models,
                }));
                break;
            }
        }
    }

    Ok(serde_json::json!({
        "current_provider":     current_provider,
        "current_model":        current_model,
        "configured_providers": configured,
        "model_groups":         model_groups,
    }))
}

#[tauri::command]
pub async fn get_hermes_info() -> Result<serde_json::Value, String> {
    let version_out = super::sessions::hermes_command()
        .args(["version"])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_else(|_| "unknown".into());

    Ok(serde_json::json!({
        "version": version_out,
        "hermes_home": crate::commands::sessions::active_hermes_home()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default(),
    }))
}
