use tauri::AppHandle;

/// Called by the frontend to sync streaming state to the system tray tooltip and title
#[tauri::command]
pub fn update_tray_status(app: AppHandle, status: String) -> Result<(), String> {
    let Some(tray) = app.tray_by_id("hermes-tray") else {
        return Ok(());
    };

    let (tooltip, title) = match status.as_str() {
        "running" => ("Hermes Desktop — Running", "●"),
        "error" => ("Hermes Desktop — Error", "⚠"),
        _ => ("Hermes Desktop", ""),
    };

    tray.set_tooltip(Some(tooltip)).map_err(|e| e.to_string())?;

    // macOS supports text next to the tray icon; other platforms ignore it
    #[cfg(target_os = "macos")]
    tray.set_title(Some(title)).map_err(|e| e.to_string())?;
    #[cfg(not(target_os = "macos"))]
    let _ = title;

    Ok(())
}
