use serde::{Deserialize, Serialize};
use std::fs;

/// The path to the settings.yaml file in the Hermes home directory.
fn get_settings_path() -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir()
        .ok_or_else(|| "Could not find home directory".to_string())?;
    let hermes_home = home.join(".hermes");
    Ok(hermes_home.join("settings.yaml"))
}

/// The structure of the settings.yaml file as it pertains to GuideBot settings.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GuideBotSettings {
    pub appearance: String,
    pub display_mode: String,
    pub personality: String,
}

/// Load the GuideBot settings from the settings.yaml file.
#[tauri::command]
pub fn load_guide_bot_settings() -> Result<GuideBotSettings, String> {
    let path = get_settings_path()?;
    if !path.exists() {
        // If the file doesn't exist, return default values.
        return Ok(GuideBotSettings {
            appearance: "classic".to_string(),
            display_mode: "auto".to_string(),
            personality: "helpful".to_string(),
        });
    }
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read settings file: {}", e))?;
    let settings: GuideBotSettings = serde_yaml::from_str(&content)
        .map_err(|e| format!("Failed to parse settings YAML: {}", e))?;
    Ok(settings)
}

/// Save the GuideBot settings to the settings.yaml file.
#[tauri::command]
pub fn save_guide_bot_settings(appearance: String, display_mode: String, personality: String) -> Result<(), String> {
    let path = get_settings_path()?;
    // Ensure the directory exists.
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create settings directory: {}", e))?;
    }
    let settings = GuideBotSettings {
        appearance,
        display_mode,
        personality,
    };
    let content = serde_yaml::to_string(&settings)
        .map_err(|e| format!("Failed to serialize settings to YAML: {}", e))?;
    fs::write(&path, content)
        .map_err(|e| format!("Failed to write settings file: {}", e))?;
    Ok(())
}
