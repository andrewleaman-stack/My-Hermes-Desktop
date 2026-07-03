use crate::Session;
use base64::Engine;
use regex::Regex;
use std::process::Command;
use std::sync::OnceLock;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

static IMAGE_MARKER_RE: OnceLock<Regex> = OnceLock::new();

// On Windows: detect the WSL hermes full path once per app lifetime.
// WSL interop doesn't inherit the user's shell PATH, so we use a login
// shell to locate hermes and cache the absolute Linux path.
// Stored as Option<String>: Some(path) = WSL hermes found, None = not found.
#[cfg(target_os = "windows")]
static WSL_HERMES_PATH: OnceLock<Option<String>> = OnceLock::new();

#[cfg(target_os = "windows")]
pub fn hide_command_window(cmd: &mut Command) -> &mut Command {
    cmd.creation_flags(CREATE_NO_WINDOW)
}

#[cfg(not(target_os = "windows"))]
pub fn hide_command_window(cmd: &mut Command) -> &mut Command {
    cmd
}

#[cfg(target_os = "windows")]
pub fn wsl_hermes_path() -> Option<&'static str> {
    WSL_HERMES_PATH
        .get_or_init(|| {
            let mut cmd = std::process::Command::new("wsl.exe");
            hide_command_window(cmd.args(["bash", "-l", "-c", "command -v hermes 2>/dev/null"]));
            let out = cmd.output().ok()?;
            if out.status.success() {
                let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if !path.is_empty() {
                    Some(path)
                } else {
                    None
                }
            } else {
                None
            }
        })
        .as_deref()
}

#[cfg(target_os = "windows")]
fn use_wsl_hermes() -> bool {
    wsl_hermes_path().is_some()
}

/// Get the hermes home directory accessible from the Windows filesystem when
/// running WSL hermes. Uses `wslpath -m` to convert the Linux path to a UNC
/// path (e.g. \\wsl.localhost\Ubuntu\home\user\.hermes).
#[cfg(target_os = "windows")]
fn wsl_hermes_home() -> Option<std::path::PathBuf> {
    let mut cmd = std::process::Command::new("wsl.exe");
    hide_command_window(cmd.args(["wslpath", "-m", "~/.hermes"]));
    let out = cmd.output().ok()?;
    if out.status.success() {
        let path_str = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if !path_str.is_empty() {
            return Some(std::path::PathBuf::from(path_str));
        }
    }
    None
}

/// Returns a `Command` already pointing at the hermes executable (with any
/// necessary prefix args set).  Callers just chain `.args(["chat", "-q", ...])`.
pub fn hermes_command() -> Command {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new("wsl.exe");
        hide_command_window(&mut cmd);
        if let Some(wsl_path) = wsl_hermes_path() {
            cmd.arg(wsl_path);
        } else {
            cmd.arg("hermes");
        }
        cmd
    }
    #[cfg(not(target_os = "windows"))]
    {
        let mut cmd = Command::new(hermes_binary());
        if let Some(home) = hermes_home() {
            cmd.env("HERMES_HOME", &home);
        }
        cmd
    }
}

fn image_marker_re() -> &'static Regex {
    IMAGE_MARKER_RE.get_or_init(|| Regex::new(r"\[Image attached at:\s*([^\]]+)\]").unwrap())
}

fn mime_for_path(path: &str) -> Option<&'static str> {
    let lower = path.to_ascii_lowercase();
    if lower.ends_with(".png") {
        Some("image/png")
    } else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        Some("image/jpeg")
    } else if lower.ends_with(".gif") {
        Some("image/gif")
    } else if lower.ends_with(".webp") {
        Some("image/webp")
    } else if lower.ends_with(".bmp") {
        Some("image/bmp")
    } else {
        None
    }
}

fn read_image_as_data_url(path: &str) -> Option<String> {
    let mime = mime_for_path(path)?;
    let bytes = std::fs::read(path).ok()?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Some(format!("data:{mime};base64,{b64}"))
}

// Walk a message JSON value, collect & strip "[Image attached at: <path>]" markers
// from text content. Returns the list of data URLs that should be attached as
// image blocks on the client side.
fn extract_image_attachments(msg: &mut serde_json::Value) -> Vec<String> {
    let re = image_marker_re();
    let mut paths: Vec<String> = Vec::new();

    let strip = |text: &str, paths: &mut Vec<String>| -> String {
        for cap in re.captures_iter(text) {
            if let Some(p) = cap.get(1) {
                paths.push(p.as_str().trim().to_string());
            }
        }
        re.replace_all(text, "").trim().to_string()
    };

    if let Some(content) = msg.get_mut("content") {
        match content {
            serde_json::Value::String(s) => {
                let cleaned = strip(s, &mut paths);
                *s = cleaned;
            }
            serde_json::Value::Array(arr) => {
                for block in arr.iter_mut() {
                    if block.get("type").and_then(|v| v.as_str()) == Some("text") {
                        if let Some(text_val) = block.get_mut("text") {
                            if let Some(s) = text_val.as_str() {
                                let cleaned = strip(s, &mut paths);
                                *text_val = serde_json::Value::String(cleaned);
                            }
                        }
                    }
                }
            }
            _ => {}
        }
    }

    paths
        .into_iter()
        .filter_map(|p| read_image_as_data_url(&p))
        .collect()
}

fn enrich_history_with_images(value: &mut serde_json::Value) {
    let messages: Option<&mut Vec<serde_json::Value>> = match value {
        serde_json::Value::Array(arr) => Some(arr),
        serde_json::Value::Object(obj) => obj.get_mut("messages").and_then(|m| m.as_array_mut()),
        _ => None,
    };
    if let Some(messages) = messages {
        for msg in messages.iter_mut() {
            let urls = extract_image_attachments(msg);
            if !urls.is_empty() {
                if let serde_json::Value::Object(map) = msg {
                    map.insert(
                        "image_attachments".into(),
                        serde_json::Value::Array(
                            urls.into_iter().map(serde_json::Value::String).collect(),
                        ),
                    );
                }
            }
        }
    }
}

/// Marker file (in the BASE ~/.hermes, never a profile dir) holding the
/// desktop-selected profile name. Absent/"default" = base home.
fn profile_marker_path() -> Option<std::path::PathBuf> {
    dirs::home_dir().map(|h| h.join(".hermes").join(".desktop_profile"))
}

/// Profile the desktop is pinned to, if any (None = default ~/.hermes).
pub fn selected_profile() -> Option<String> {
    let name = std::fs::read_to_string(profile_marker_path()?).ok()?;
    let name = name.trim().to_string();
    if name.is_empty() || name == "default" {
        None
    } else {
        Some(name)
    }
}

pub fn hermes_home() -> Option<std::path::PathBuf> {
    #[cfg(target_os = "windows")]
    if use_wsl_hermes() {
        if let Some(wsl_home) = wsl_hermes_home() {
            if wsl_home.exists() {
                return Some(wsl_home);
            }
        }
    }
    let base = dirs::home_dir().map(|h| h.join(".hermes"))?;
    if let Some(name) = selected_profile() {
        let profile_home = base.join("profiles").join(&name);
        if profile_home.is_dir() {
            return Some(profile_home);
        }
    }
    Some(base)
}

#[tauri::command]
pub async fn list_hermes_profiles() -> Result<Vec<String>, String> {
    let mut out = vec!["default".to_string()];
    if let Some(home) = dirs::home_dir() {
        if let Ok(entries) = std::fs::read_dir(home.join(".hermes").join("profiles")) {
            let mut names: Vec<String> = entries
                .flatten()
                .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
                .filter_map(|e| e.file_name().into_string().ok())
                .filter(|n| !n.starts_with('_') && !n.starts_with('.'))
                .collect();
            names.sort();
            out.extend(names);
        }
    }
    Ok(out)
}

#[tauri::command]
pub async fn get_hermes_profile() -> Result<String, String> {
    Ok(selected_profile().unwrap_or_else(|| "default".to_string()))
}

#[tauri::command]
pub async fn set_hermes_profile(name: String) -> Result<(), String> {
    let path = profile_marker_path().ok_or("Cannot find home dir")?;
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::write(&path, name.trim()).map_err(|e| e.to_string())?;
    // Kill the running gateway so the next message spawns one under the new
    // profile's HERMES_HOME (sessions/config/memory all follow hermes_home()).
    crate::commands::chat::shutdown_gateway();
    Ok(())
}

fn hermes_config_file(command: &str, fallback_name: &str) -> Option<std::path::PathBuf> {
    let out = hermes_command().args(["config", command]).output().ok()?;
    if out.status.success() {
        let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if !path.is_empty() {
            return Some(std::path::PathBuf::from(path));
        }
    }
    hermes_home().map(|home| home.join(fallback_name))
}

/// Active Hermes config file. Uses the Hermes CLI as the source of truth so
/// profile-scoped installs resolve to ~/.hermes/profiles/<name>/config.yaml.
pub fn hermes_config_path() -> Option<std::path::PathBuf> {
    hermes_config_file("path", "config.yaml")
}

/// Active Hermes env file. Uses the Hermes CLI as the source of truth so
/// profile-scoped installs resolve to ~/.hermes/profiles/<name>/.env.
pub fn hermes_env_path() -> Option<std::path::PathBuf> {
    hermes_config_file("env-path", ".env")
}

pub fn active_hermes_home() -> Option<std::path::PathBuf> {
    hermes_config_path()
        .and_then(|path| path.parent().map(|parent| parent.to_path_buf()))
        .or_else(hermes_home)
}

/// Resolve the hermes binary path.
/// macOS .app bundles only get a minimal PATH (/usr/bin:/bin:/usr/sbin:/sbin),
/// so we check known install locations first, then fall back to the login shell.
pub fn hermes_binary() -> String {
    // 1. User-specified path (saved via set_hermes_path)
    if let Some(home) = dirs::home_dir() {
        let custom = home.join(".hermes").join(".desktop_binary_path");
        if let Ok(path) = std::fs::read_to_string(&custom) {
            let path = path.trim().to_string();
            if !path.is_empty() && std::path::Path::new(&path).exists() {
                return path;
            }
        }
    }

    // 2. Known install locations
    let mut candidates: Vec<std::path::PathBuf> = Vec::new();
    if let Some(home) = dirs::home_dir() {
        candidates.push(home.join(".hermes").join("bin").join("hermes"));
        candidates.push(home.join(".local").join("bin").join("hermes"));
        candidates.push(home.join("bin").join("hermes"));

        #[cfg(target_os = "windows")]
        {
            // hermes installed via pip / pipx under Windows Python
            candidates.push(
                home.join("AppData")
                    .join("Local")
                    .join("hermes")
                    .join("hermes-agent")
                    .join("Scripts")
                    .join("hermes.exe"),
            );
            candidates.push(
                home.join("AppData")
                    .join("Roaming")
                    .join("Python")
                    .join("Scripts")
                    .join("hermes.exe"),
            );
            candidates.push(
                home.join("AppData")
                    .join("Local")
                    .join("pipx")
                    .join("venvs")
                    .join("hermes")
                    .join("Scripts")
                    .join("hermes.exe"),
            );
            candidates.push(
                home.join("AppData")
                    .join("Local")
                    .join("Programs")
                    .join("hermes")
                    .join("hermes.exe"),
            );
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        candidates.push(std::path::PathBuf::from("/usr/local/bin/hermes"));
        candidates.push(std::path::PathBuf::from("/opt/homebrew/bin/hermes"));
        candidates.push(std::path::PathBuf::from("/usr/bin/hermes"));
    }

    for path in &candidates {
        if path.exists() {
            return path.to_string_lossy().to_string();
        }
    }

    // 3. Fallback: ask the shell (slower, but handles any custom PATH)
    #[cfg(not(target_os = "windows"))]
    for shell in &["/bin/zsh", "/bin/bash"] {
        if let Ok(out) = std::process::Command::new(shell)
            .args(["-l", "-c", "command -v hermes 2>/dev/null"])
            .output()
        {
            if out.status.success() {
                let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if !path.is_empty() {
                    return path;
                }
            }
        }
    }

    // Windows: use `where` to locate hermes in PATH
    #[cfg(target_os = "windows")]
    {
        let mut cmd = std::process::Command::new("where");
        hide_command_window(cmd.arg("hermes"));
        if let Ok(out) = cmd.output() {
            if out.status.success() {
                let first_line = String::from_utf8_lossy(&out.stdout)
                    .lines()
                    .next()
                    .unwrap_or("")
                    .trim()
                    .to_string();
                if !first_line.is_empty() {
                    return first_line;
                }
            }
        }
    }

    "hermes".to_string()
}

#[tauri::command]
pub async fn set_hermes_path(path: String) -> Result<String, String> {
    let path = path.trim().to_string();
    // Expand leading ~
    let expanded = if path.starts_with("~/") {
        dirs::home_dir()
            .map(|h| h.join(&path[2..]).to_string_lossy().to_string())
            .unwrap_or_else(|| path.clone())
    } else {
        path.clone()
    };

    if !std::path::Path::new(&expanded).exists() {
        return Err(format!("Path does not exist：{expanded}"));
    }

    // Quick smoke-test: hermes version
    let mut cmd = std::process::Command::new(&expanded);
    hide_command_window(cmd.arg("version"));
    let out = cmd.output().map_err(|e| format!("Unable to execute：{e}"))?;
    if !out.status.success() {
        return Err("The path exists, but `hermes version` failed. Confirm this is the correct Hermes binary".to_string());
    }

    // Persist
    if let Some(home) = dirs::home_dir() {
        let dir = home.join(".hermes");
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        std::fs::write(dir.join(".desktop_binary_path"), &expanded).map_err(|e| e.to_string())?;
    }

    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

fn filename_stem(path: &std::path::Path) -> String {
    path.file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string()
}

fn title_map_path() -> Option<std::path::PathBuf> {
    hermes_home().map(|h| h.join("session_titles.json"))
}

fn read_title_map() -> std::collections::HashMap<String, String> {
    let Some(path) = title_map_path() else {
        return std::collections::HashMap::new();
    };
    let Ok(text) = std::fs::read_to_string(path) else {
        return std::collections::HashMap::new();
    };
    serde_json::from_str(&text).unwrap_or_default()
}

fn write_title_map(map: &std::collections::HashMap<String, String>) -> Result<(), String> {
    let path = title_map_path().ok_or_else(|| "Cannot find home dir".to_string())?;
    let text = serde_json::to_string_pretty(map).map_err(|e| e.to_string())?;
    std::fs::write(path, format!("{text}\n")).map_err(|e| e.to_string())
}

fn session_file_candidates(session_id: &str) -> Result<Vec<std::path::PathBuf>, String> {
    let home = hermes_home().ok_or("Cannot find home dir")?;
    let sessions_dir = home.join("sessions");
    Ok(vec![
        sessions_dir.join(format!("session_{}.json", session_id)),
        sessions_dir.join(format!("{}.json", session_id)),
        sessions_dir.join(format!("session_{}.jsonl", session_id)),
        sessions_dir.join(format!("{}.jsonl", session_id)),
    ])
}

fn remove_last_turn_from_session_value(session: &mut serde_json::Value) -> Result<(), String> {
    let messages = session
        .get_mut("messages")
        .and_then(|value| value.as_array_mut())
        .ok_or_else(|| "Session has no messages array".to_string())?;

    let Some(last_user_index) = messages
        .iter()
        .rposition(|message| message.get("role").and_then(|role| role.as_str()) == Some("user"))
    else {
        return Ok(());
    };

    messages.truncate(last_user_index);
    let next_count = messages.len() as u64;

    if let Some(count) = session.get_mut("message_count") {
        *count = serde_json::Value::Number(next_count.into());
    }
    if let Some(updated) = session.get_mut("last_updated") {
        *updated = serde_json::Value::String(chrono::Local::now().naive_local().to_string());
    }

    Ok(())
}

fn remove_last_turn_from_jsonl(content: &str) -> Result<String, String> {
    let mut messages: Vec<serde_json::Value> = content
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| serde_json::from_str(line).map_err(|e| e.to_string()))
        .collect::<Result<_, _>>()?;

    let Some(last_user_index) = messages
        .iter()
        .rposition(|message| message.get("role").and_then(|role| role.as_str()) == Some("user"))
    else {
        return Ok(content.to_string());
    };

    messages.truncate(last_user_index);
    let lines = messages
        .into_iter()
        .map(|message| serde_json::to_string(&message).map_err(|e| e.to_string()))
        .collect::<Result<Vec<_>, _>>()?;
    Ok(if lines.is_empty() {
        String::new()
    } else {
        format!("{}\n", lines.join("\n"))
    })
}

/// Extract the plain-text content of a message, handling both string content
/// and the array-of-blocks form (picks the first `text` block). Capped to a
/// short preview length since the sidebar only needs title/subtitle previews.
fn message_text(m: &serde_json::Value) -> Option<String> {
    let raw = m.get("content").and_then(|c| {
        if let Some(s) = c.as_str() {
            Some(s.trim().to_string())
        } else if let Some(arr) = c.as_array() {
            arr.iter()
                .find(|b| b.get("type").and_then(|t| t.as_str()) == Some("text"))
                .and_then(|b| b.get("text").and_then(|t| t.as_str()))
                .map(|s| s.trim().to_string())
        } else {
            None
        }
    })?;
    (!raw.is_empty()).then(|| raw.chars().take(80).collect::<String>())
}

fn read_session_info(
    path: &std::path::Path,
    fs_updated: &str,
) -> (String, String, u32, String, Option<String>, Option<String>) {
    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => {
            return (
                filename_stem(path),
                "Untitled".into(),
                0,
                fs_updated.into(),
                None,
                None,
            )
        }
    };

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
            let user_msgs: Vec<&serde_json::Value> = messages
                .iter()
                .filter(|m| m.get("role").and_then(|r| r.as_str()) == Some("user"))
                .collect();

            let title = obj
                .get("title")
                .and_then(|v| v.as_str())
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .or_else(|| user_msgs.first().and_then(|m| message_text(m)))
                .unwrap_or_else(|| id.clone());

            // Subtitle: the latest user message, only when there is more than one
            // user turn (otherwise it would just repeat the title).
            let last_message = (user_msgs.len() >= 2)
                .then(|| user_msgs.last().and_then(|m| message_text(m)))
                .flatten();

            return (id, title, count, updated, model, last_message);
        }
    }

    // JSONL fallback
    let parsed: Vec<serde_json::Value> = content
        .lines()
        .filter(|l| !l.trim().is_empty())
        .filter_map(|l| serde_json::from_str::<serde_json::Value>(l).ok())
        .collect();
    let count = parsed.len() as u32;
    let user_msgs: Vec<&serde_json::Value> = parsed
        .iter()
        .filter(|obj| obj.get("role").and_then(|r| r.as_str()) == Some("user"))
        .collect();
    let title = user_msgs
        .first()
        .and_then(|m| message_text(m))
        .unwrap_or_else(|| filename_stem(path));
    let last_message = (user_msgs.len() >= 2)
        .then(|| user_msgs.last().and_then(|m| message_text(m)))
        .flatten();

    (
        filename_stem(path),
        title,
        count,
        fs_updated.into(),
        None,
        last_message,
    )
}

/// Load sessions from the SQLite database used by hermes ≥ v0.15.
/// Returns an empty vec if the database doesn't exist or can't be opened.
fn sessions_from_state_db(db_path: &std::path::Path) -> Vec<Session> {
    let conn = match rusqlite::Connection::open_with_flags(
        db_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    ) {
        Ok(c) => c,
        Err(_) => return vec![],
    };

    let sql = "
        SELECT
            s.id,
            s.title,
            s.model,
            s.started_at,
            COALESCE(s.ended_at, s.started_at) AS updated_at,
            s.message_count,
            s.estimated_cost_usd,
            (SELECT content FROM messages
             WHERE session_id = s.id AND role = 'user'
             ORDER BY timestamp ASC LIMIT 1) AS first_user_msg,
            (SELECT content FROM messages
             WHERE session_id = s.id AND role = 'user'
             ORDER BY timestamp DESC LIMIT 1) AS last_user_msg,
            (SELECT COUNT(*) FROM messages
             WHERE session_id = s.id AND role = 'user') AS user_msg_count
        FROM sessions s
        WHERE s.archived = 0
        ORDER BY s.started_at DESC
        LIMIT 500
    ";

    let mut stmt = match conn.prepare(sql) {
        Ok(s) => s,
        Err(_) => return vec![],
    };

    let unix_to_rfc3339 = |ts: f64| -> String {
        chrono::DateTime::from_timestamp(ts as i64, 0)
            .map(|dt: chrono::DateTime<chrono::Utc>| dt.to_rfc3339())
            .unwrap_or_default()
    };

    let truncate80 = |s: String| -> String { s.chars().take(80).collect() };

    let rows = stmt.query_map([], |row| {
        let id: String = row.get(0)?;
        let title: Option<String> = row.get(1)?;
        let model: Option<String> = row.get(2)?;
        let started_at: f64 = row.get(3)?;
        let updated_at: f64 = row.get(4)?;
        let message_count: Option<i64> = row.get(5)?;
        let cost: Option<f64> = row.get(6)?;
        let first_user_msg: Option<String> = row.get(7)?;
        let last_user_msg: Option<String> = row.get(8)?;
        let user_msg_count: i64 = row.get(9).unwrap_or(0);
        Ok((
            id,
            title,
            model,
            started_at,
            updated_at,
            message_count,
            cost,
            first_user_msg,
            last_user_msg,
            user_msg_count,
        ))
    });

    let rows = match rows {
        Ok(r) => r,
        Err(_) => return vec![],
    };

    rows.filter_map(|r| r.ok())
        .map(
            |(
                id,
                title,
                model,
                started_at,
                updated_at,
                message_count,
                cost,
                first_user_msg,
                last_user_msg,
                user_msg_count,
            )| {
                let display_title = title
                    .filter(|t| !t.is_empty())
                    .or_else(|| first_user_msg.clone().map(&truncate80))
                    .unwrap_or_else(|| id.clone());

                let last_message = if user_msg_count >= 2 {
                    last_user_msg.map(&truncate80)
                } else {
                    None
                };

                Session {
                    id,
                    title: display_title,
                    created_at: unix_to_rfc3339(started_at),
                    updated_at: unix_to_rfc3339(updated_at),
                    message_count: message_count.map(|c| c as u32),
                    cost,
                    model,
                    last_message,
                }
            },
        )
        .collect()
}

#[tauri::command]
pub async fn list_sessions() -> Result<Vec<Session>, String> {
    let home = hermes_home();
    let mut by_id: std::collections::HashMap<String, Session> = std::collections::HashMap::new();
    let title_map = read_title_map();

    // ── hermes ≥ v0.15: sessions live in state.db ──────────────────────────────
    if let Some(ref h) = home {
        let db_path = h.join("state.db");
        if db_path.exists() {
            for session in sessions_from_state_db(&db_path) {
                let title = title_map.get(&session.id).cloned().unwrap_or(session.title.clone());
                by_id.insert(session.id.clone(), Session { title, ..session });
            }
        }
    }

    // ── hermes < v0.15: sessions live as JSON/JSONL files ──────────────────────
    // session files are named either `<id>.jsonl` or `session_<id>.json`
    // files to skip: request_dump_*, sessions.json (platform metadata)
    let sessions_dir = home.map(|h| h.join("sessions"));
    if let Some(ref dir) = sessions_dir {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                let filename = path.file_name().and_then(|n| n.to_str()).unwrap_or("");

                if filename.starts_with("request_dump_") {
                    continue;
                }
                if filename == "sessions.json" {
                    continue;
                }
                if !path
                    .extension()
                    .map_or(false, |e| e == "json" || e == "jsonl")
                {
                    continue;
                }

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

                let (id, title, count, updated, model, last_message) =
                    read_session_info(&path, &fs_updated);
                if id.is_empty() {
                    continue;
                }

                // Skip if already loaded from state.db (database is authoritative)
                if by_id.contains_key(&id) {
                    continue;
                }

                let title = title_map.get(&id).cloned().unwrap_or(title);
                by_id.insert(
                    id.clone(),
                    Session {
                        id,
                        title,
                        created_at: updated.clone(),
                        updated_at: updated,
                        message_count: Some(count),
                        cost: None,
                        model,
                        last_message,
                    },
                );
            }
        }
    }

    let mut sessions: Vec<Session> = by_id.into_values().collect();
    sessions.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(sessions)
}

#[tauri::command]
pub async fn rename_session(session_id: String, title: String) -> Result<(), String> {
    let clean_title = title.trim();
    if clean_title.is_empty() {
        return Err("Title cannot be empty".into());
    }

    let out = hermes_command()
        .args(["sessions", "rename", &session_id, clean_title])
        .output()
        .map_err(|e| format!("Failed to start hermes: {e}. Is hermes installed and in PATH?"))?;

    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
        let message = if !stderr.is_empty() { stderr } else { stdout };
        return Err(if message.is_empty() {
            "Failed to rename session".into()
        } else {
            message
        });
    }

    let mut map = read_title_map();
    map.insert(session_id.clone(), clean_title.to_string());
    write_title_map(&map)?;

    Ok(())
}

#[tauri::command]
pub async fn get_session_history(session_id: String) -> Result<serde_json::Value, String> {
    let out = hermes_command()
        .args(["sessions", "export", "-", "--session-id", &session_id])
        .output();

    if let Ok(o) = out {
        if o.status.success() {
            let text = String::from_utf8_lossy(&o.stdout).to_string();
            if let Ok(mut v) = serde_json::from_str::<serde_json::Value>(&text) {
                enrich_history_with_images(&mut v);
                return Ok(v);
            }
            let exported: Vec<serde_json::Value> = text
                .lines()
                .filter(|line| !line.trim().is_empty())
                .filter_map(|line| serde_json::from_str::<serde_json::Value>(line).ok())
                .collect();
            if exported.len() == 1 {
                let mut v = exported.into_iter().next().unwrap();
                enrich_history_with_images(&mut v);
                return Ok(v);
            }
            if !exported.is_empty() {
                let mut v = serde_json::Value::Array(exported);
                enrich_history_with_images(&mut v);
                return Ok(v);
            }
        }
    }

    for p in session_file_candidates(&session_id)? {
        let candidate = p.file_name().and_then(|name| name.to_str()).unwrap_or("");
        if p.exists() {
            let content = std::fs::read_to_string(&p).map_err(|e| e.to_string())?;
            if candidate.ends_with(".jsonl") {
                let msgs: Vec<serde_json::Value> = content
                    .lines()
                    .filter_map(|l| serde_json::from_str(l).ok())
                    .collect();
                let mut v = serde_json::Value::Array(msgs);
                enrich_history_with_images(&mut v);
                return Ok(v);
            } else {
                let mut v: serde_json::Value =
                    serde_json::from_str(&content).map_err(|e| e.to_string())?;
                enrich_history_with_images(&mut v);
                return Ok(v);
            }
        }
    }

    Ok(serde_json::Value::Array(vec![]))
}

#[tauri::command]
pub async fn undo_last_turn(session_id: String) -> Result<(), String> {
    for path in session_file_candidates(&session_id)? {
        if !path.exists() {
            continue;
        }

        let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let updated = if path.extension().map_or(false, |ext| ext == "jsonl") {
            remove_last_turn_from_jsonl(&content)?
        } else {
            let mut session: serde_json::Value =
                serde_json::from_str(&content).map_err(|e| e.to_string())?;
            remove_last_turn_from_session_value(&mut session)?;
            format!(
                "{}\n",
                serde_json::to_string_pretty(&session).map_err(|e| e.to_string())?
            )
        };

        std::fs::write(&path, updated).map_err(|e| e.to_string())?;
        return Ok(());
    }

    Err("Session file not found".into())
}

#[tauri::command]
pub async fn delete_session(session_id: String) -> Result<(), String> {
    // Tell hermes to deregister the session from its internal state
    let _ = hermes_command()
        .args(["sessions", "delete", "--yes", &session_id])
        .output();

    // Always delete the session files — hermes CLI only removes its internal
    // tracking record but leaves the .json/.jsonl files on disk
    if let Some(home) = hermes_home() {
        let sessions_dir = home.join("sessions");
        for name in [
            format!("session_{}.json", session_id),
            format!("{}.json", session_id),
            format!("session_{}.jsonl", session_id),
            format!("{}.jsonl", session_id),
        ] {
            let p = sessions_dir.join(&name);
            if p.exists() {
                let _ = std::fs::remove_file(&p);
            }
        }
    }

    let mut map = read_title_map();
    if map.remove(&session_id).is_some() {
        let _ = write_title_map(&map);
    }

    Ok(())
}

/// Fork the current session by passing `/branch [name]` to hermes itself,
/// then discover the newly created session by diffing the sessions directory.
/// This avoids touching hermes's internal SQLite — hermes registers the branch
/// in its own database during the chat call.
#[tauri::command]
pub async fn branch_session(
    session_id: String,
    branch_name: Option<String>,
) -> Result<String, String> {
    let home = hermes_home().ok_or("Cannot find home dir")?;
    let sessions_dir = home.join("sessions");

    // Snapshot existing session files before branching
    let before: std::collections::HashSet<String> = std::fs::read_dir(&sessions_dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| e.file_name().into_string().ok())
        .collect();

    // Build the slash command string
    let slash_cmd = match branch_name.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        Some(name) => format!("/branch {name}"),
        None => "/branch".to_string(),
    };

    // Delegate to hermes — it creates the branch and registers it in its own DB
    let out = hermes_command()
        .args(["chat", "-q", &slash_cmd, "--resume", &session_id])
        .output()
        .map_err(|e| format!("Failed to start hermes: {e}"))?;

    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
        return Err(if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            "hermes /branch failed".into()
        });
    }

    // Discover which session file(s) appeared after the command ran
    let after: std::collections::HashSet<String> = std::fs::read_dir(&sessions_dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| e.file_name().into_string().ok())
        .collect();

    let new_id = after
        .difference(&before)
        .filter(|f| {
            (f.ends_with(".json") || f.ends_with(".jsonl"))
                && !f.starts_with("request_dump_")
                && *f != "sessions.json"
        })
        .filter_map(|f| {
            let stem = f.trim_end_matches(".jsonl").trim_end_matches(".json");
            let id = stem.trim_start_matches("session_");
            if id.is_empty() { None } else { Some(id.to_string()) }
        })
        .next()
        .ok_or_else(|| {
            let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if stdout.is_empty() {
                "hermes /branch ran successfully but no new session file was found".into()
            } else {
                format!("hermes /branch ran successfully but no new session file was found。Output：{stdout}")
            }
        })?;

    // Optionally set a display title in our title_map
    if let Some(name) = branch_name.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        let mut map = read_title_map();
        map.insert(new_id.clone(), name.to_string());
        let _ = write_title_map(&map);
    }

    Ok(new_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn remove_last_turn_truncates_from_last_user_message() {
        let mut session = json!({
            "message_count": 5,
            "messages": [
                { "role": "user", "content": "first" },
                { "role": "assistant", "content": "first reply" },
                { "role": "user", "content": "second" },
                { "role": "assistant", "content": "", "tool_calls": [] },
                { "role": "tool", "content": "{}" }
            ]
        });

        remove_last_turn_from_session_value(&mut session).unwrap();

        let messages = session["messages"].as_array().unwrap();
        assert_eq!(messages.len(), 2);
        assert_eq!(session["message_count"], 2);
        assert_eq!(messages[0]["content"], "first");
        assert_eq!(messages[1]["content"], "first reply");
    }
}
