use crate::StreamChunk;
use crate::stream::{is_decorative, strip_ansi};
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter};

fn emit(app: &AppHandle, kind: &str, content: &str) {
    app.emit("hermes:chunk", StreamChunk {
        kind: kind.to_string(),
        content: content.to_string(),
    })
    .ok();
}

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
        if let Ok(sessions) = super::sessions::list_sessions().await {
            if let Some(first) = sessions.first() {
                emit(&app, "new_session_id", &first.id);
            }
        }
    }

    emit(&app, "done", "");
    Ok(())
}

#[tauri::command]
pub async fn get_hermes_info() -> Result<serde_json::Value, String> {
    let version_out = Command::new("hermes")
        .args(["version"])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_else(|_| "unknown".into());

    Ok(serde_json::json!({
        "version": version_out,
        "hermes_home": crate::commands::sessions::hermes_home()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default(),
    }))
}
