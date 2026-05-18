use serde::Serialize;
use std::path::Path;

#[derive(Serialize, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
}

#[tauri::command]
pub async fn list_dir(path: String) -> Result<Vec<FileEntry>, String> {
    let dir = Path::new(&path);
    if !dir.is_dir() {
        return Err(format!("Not a directory: {path}"));
    }

    let mut entries: Vec<FileEntry> = std::fs::read_dir(dir)
        .map_err(|e| format!("Cannot read directory: {e}"))?
        .filter_map(|res| res.ok())
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().to_string();
            // skip hidden files (starting with .)
            if name.starts_with('.') {
                return None;
            }
            let meta = entry.metadata().ok()?;
            Some(FileEntry {
                path: entry.path().to_string_lossy().to_string(),
                name,
                is_dir: meta.is_dir(),
                size: meta.len(),
            })
        })
        .collect();

    // directories first, then files, both sorted alphabetically
    entries.sort_by(|a, b| {
        b.is_dir.cmp(&a.is_dir).then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

#[tauri::command]
pub async fn get_home_dir() -> String {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "/".to_string())
}

const MAX_PREVIEW_BYTES: u64 = 512 * 1024; // 512 KB

#[tauri::command]
pub async fn read_text_file(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    let size = p.metadata().map(|m| m.len()).unwrap_or(0);
    if size > MAX_PREVIEW_BYTES {
        return Err(format!("File too large to preview ({} KB)", size / 1024));
    }
    std::fs::read_to_string(p).map_err(|e| format!("Cannot read file: {e}"))
}
