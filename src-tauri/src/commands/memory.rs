use crate::commands::sessions::hermes_home;

fn memories_dir() -> Result<std::path::PathBuf, String> {
    hermes_home()
        .map(|h| h.join("memories"))
        .ok_or_else(|| "Cannot find home directory".to_string())
}

#[tauri::command]
pub async fn read_memory(filename: String) -> Result<String, String> {
    // Only allow known filenames to prevent path traversal
    if filename != "MEMORY.md" && filename != "USER.md" {
        return Err(format!("Unknown memory file: {filename}"));
    }
    let path = memories_dir()?.join(&filename);
    if !path.exists() {
        return Ok(String::new());
    }
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read {filename}: {e}"))
}

#[tauri::command]
pub async fn save_memory(filename: String, content: String) -> Result<(), String> {
    if filename != "MEMORY.md" && filename != "USER.md" {
        return Err(format!("Unknown memory file: {filename}"));
    }
    let dir = memories_dir()?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create memories dir: {e}"))?;
    let path = dir.join(&filename);
    std::fs::write(&path, content).map_err(|e| format!("Failed to write {filename}: {e}"))
}
