use crate::commands::sessions::hermes_command;
use std::process::Stdio;

/// Create a quick state snapshot via `hermes backup --quick`.
/// Returns the real snapshot ID (e.g. "20260526-022530-my-label").
#[tauri::command]
pub async fn snapshot_create(label: Option<String>) -> Result<String, String> {
    let mut cmd = hermes_command();
    cmd.arg("backup").arg("--quick");
    if let Some(ref l) = label {
        if !l.trim().is_empty() {
            cmd.arg("--label").arg(l.trim());
        }
    }
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

    let output = cmd
        .output()
        .map_err(|e| format!("无法启动 hermes: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);

    // Expected line: "State snapshot created: <id>"
    for line in stdout.lines() {
        if let Some(id) = line.trim().strip_prefix("State snapshot created: ") {
            let id = id.trim().to_string();
            if !id.is_empty() {
                return Ok(id);
            }
        }
    }

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("hermes backup 失败: {stderr}"));
    }

    Err(format!("无法从输出中解析快照 ID: {stdout}"))
}
