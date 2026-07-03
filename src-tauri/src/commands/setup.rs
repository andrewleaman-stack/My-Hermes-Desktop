use serde::Serialize;
use std::process::Command;

const INSTALL_CMD: &str = "curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash";
const SETUP_CMD: &str = "hermes setup";
const API_KEY_NAMES: &[&str] = &[
    "ANTHROPIC_API_KEY",
    "OPENROUTER_API_KEY",
    "OPENAI_API_KEY",
    "OPENCODE_GO_API_KEY",
    "GEMINI_API_KEY",
    "HERMES_GATEWAY_TOKEN",
];

#[derive(Serialize)]
pub struct HermesSetupStatus {
    pub installed: bool,
    pub version: String,
    pub hermes_home: String,
    pub config_exists: bool,
    pub api_key_configured: bool,
    pub configured_providers: Vec<String>,
    pub error: String,
}

fn configured_providers_from_env(env: &str) -> Vec<String> {
    let key_map = [
        ("ANTHROPIC_API_KEY", "Anthropic"),
        ("OPENROUTER_API_KEY", "OpenRouter"),
        ("OPENAI_API_KEY", "OpenAI"),
        ("OPENCODE_GO_API_KEY", "OpenCode Go"),
        ("GEMINI_API_KEY", "Gemini"),
        ("HERMES_GATEWAY_TOKEN", "Hermes Gateway"),
    ];
    let mut providers = Vec::new();

    for line in env.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        for (key, provider) in key_map {
            if let Some(value) = trimmed.strip_prefix(&format!("{key}=")) {
                if !value.trim().trim_matches('"').trim_matches('\'').is_empty()
                    && !providers.iter().any(|p| p == provider)
                {
                    providers.push(provider.to_string());
                }
            }
        }
    }

    providers
}

fn hermes_version() -> Result<String, String> {
    let output = super::sessions::hermes_command()
        .arg("version")
        .output()
        .map_err(|e| format!("Hermes CLI is not installed or is not in PATH：{e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let message = if stderr.is_empty() { stdout } else { stderr };
        return Err(if message.is_empty() {
            "Hermes CLI is not running correctly".to_string()
        } else {
            message
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    Ok(if stdout.is_empty() { stderr } else { stdout })
}

#[tauri::command]
pub async fn check_hermes_setup() -> Result<HermesSetupStatus, String> {
    let config_path = crate::commands::sessions::hermes_config_path();
    let env_path = crate::commands::sessions::hermes_env_path();
    let home = crate::commands::sessions::active_hermes_home();
    let hermes_home = home
        .as_ref()
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_default();

    let config_exists = config_path
        .as_ref()
        .map(|path| path.exists())
        .unwrap_or(false);

    let env_text = env_path
        .as_ref()
        .and_then(|path| std::fs::read_to_string(path).ok())
        .unwrap_or_default();
    let configured_providers = configured_providers_from_env(&env_text);
    let api_key_configured = !configured_providers.is_empty()
        || API_KEY_NAMES.iter().any(|key| {
            std::env::var(key)
                .map(|v| !v.trim().is_empty())
                .unwrap_or(false)
        });

    match hermes_version() {
        Ok(version) => Ok(HermesSetupStatus {
            installed: true,
            version,
            hermes_home,
            config_exists,
            api_key_configured,
            configured_providers,
            error: String::new(),
        }),
        Err(error) => Ok(HermesSetupStatus {
            installed: false,
            version: String::new(),
            hermes_home,
            config_exists,
            api_key_configured,
            configured_providers,
            error,
        }),
    }
}

fn open_terminal_with_command(command: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let escaped = command.replace('\\', "\\\\").replace('"', "\\\"");
        let script = format!(
            "tell application \"Terminal\"\nactivate\ndo script \"{}\"\nend tell",
            escaped
        );
        let output = Command::new("osascript")
            .arg("-e")
            .arg(script)
            .output()
            .map_err(|e| format!("Unable to open terminal：{e}"))?;

        if output.status.success() {
            return Ok(());
        }

        let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if message.is_empty() {
            "Unable to open terminal".to_string()
        } else {
            message
        });
    }

    #[cfg(target_os = "windows")]
    {
        // Keep the terminal open after the command finishes with `exec bash -l`
        let wsl_cmd = format!("{command}; exec bash -l");

        // Prefer Windows Terminal (wt.exe) → plain wsl.exe → cmd fallback
        let wt = Command::new("wt.exe")
            .args(["wsl.exe", "bash", "-l", "-c", &wsl_cmd])
            .spawn();
        if wt.is_ok() {
            return Ok(());
        }

        let wsl = Command::new("wsl.exe")
            .args(["bash", "-l", "-c", &wsl_cmd])
            .spawn();
        if wsl.is_ok() {
            return Ok(());
        }

        // Last resort: open a plain cmd window (works for native `hermes setup`)
        Command::new("cmd")
            .args(["/c", "start", "cmd", "/k", command])
            .spawn()
            .map_err(|e| format!("Unable to open terminal：{e}"))?;
        return Ok(());
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Err("This platform does not support opening a terminal automatically. Copy the install command and run it manually.".to_string())
    }
}

#[tauri::command]
pub async fn open_install_terminal() -> Result<(), String> {
    open_terminal_with_command(INSTALL_CMD)
}

#[tauri::command]
pub async fn open_setup_terminal() -> Result<(), String> {
    open_terminal_with_command(SETUP_CMD)
}
