use crate::Session;
use std::process::Command;

pub fn hermes_home() -> Option<std::path::PathBuf> {
    dirs::home_dir().map(|h| h.join(".hermes"))
}

fn filename_stem(path: &std::path::Path) -> String {
    path.file_stem().unwrap_or_default().to_string_lossy().to_string()
}

fn read_session_info(
    path: &std::path::Path,
    fs_updated: &str,
) -> (String, String, u32, String, Option<String>) {
    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return (filename_stem(path), "Untitled".into(), 0, fs_updated.into(), None),
    };

    if let Ok(obj) = serde_json::from_str::<serde_json::Value>(&content) {
        if obj.is_object() {
            let hermes_id = obj
                .get("session_id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let id = if hermes_id.is_empty() { filename_stem(path) } else { hermes_id };

            let updated = obj
                .get("last_updated")
                .or_else(|| obj.get("session_start"))
                .and_then(|v| v.as_str())
                .unwrap_or(fs_updated)
                .to_string();

            let model = obj.get("model").and_then(|v| v.as_str()).map(|s| s.to_string());

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

    // JSONL fallback
    let lines: Vec<&str> = content.lines().filter(|l| !l.trim().is_empty()).collect();
    let count = lines.len() as u32;
    let title = lines
        .iter()
        .filter_map(|l| serde_json::from_str::<serde_json::Value>(l).ok())
        .find(|obj| obj.get("role").and_then(|r| r.as_str()) == Some("user"))
        .and_then(|obj| {
            obj.get("content")
                .and_then(|c| c.as_str())
                .map(|s| s.trim().chars().take(60).collect::<String>())
        })
        .unwrap_or_else(|| filename_stem(path));

    (filename_stem(path), title, count, fs_updated.into(), None)
}

#[tauri::command]
pub async fn list_sessions() -> Result<Vec<Session>, String> {
    let output = Command::new("hermes").args(["sessions", "list", "--json"]).output();

    if let Ok(out) = output {
        if out.status.success() {
            let text = String::from_utf8_lossy(&out.stdout);
            if let Ok(sessions) = serde_json::from_str::<Vec<Session>>(&text) {
                return Ok(sessions);
            }
        }
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
            let filename = path.file_name().and_then(|n| n.to_str()).unwrap_or("");

            if filename.starts_with("request_dump_") { continue; }

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

    sessions.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(sessions)
}

#[tauri::command]
pub async fn get_session_history(session_id: String) -> Result<serde_json::Value, String> {
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

    let home = hermes_home().ok_or("Cannot find home dir")?;
    let sessions_dir = home.join("sessions");
    let candidates = vec![
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
                let msgs: Vec<serde_json::Value> =
                    content.lines().filter_map(|l| serde_json::from_str(l).ok()).collect();
                return Ok(serde_json::Value::Array(msgs));
            } else {
                return serde_json::from_str(&content).map_err(|e| e.to_string());
            }
        }
    }

    Ok(serde_json::Value::Array(vec![]))
}

#[tauri::command]
pub async fn delete_session(session_id: String) -> Result<(), String> {
    Command::new("hermes")
        .args(["sessions", "delete", &session_id])
        .output()
        .map_err(|e| e.to_string())?;
    Ok(())
}
