use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};

pub mod commands;
pub mod stream;


// ─── Shared Data Types ────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Session {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub message_count: Option<u32>,
    pub cost: Option<f64>,
    pub model: Option<String>,
    /// Content of the most recent user message, used as the sidebar subtitle.
    /// None when the session has a single user turn (subtitle would duplicate the title).
    pub last_message: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct StreamChunk {
    /// "text" | "think" | "think_start" | "think_end"
    /// "tool_name" | "tool_input" | "tool_output" | "tool_output_end"
    /// "status" | "status_json" | "gateway_status" | "session_stat"
    /// "new_session_id" | "done" | "error"
    pub kind: String,
    pub content: String,
    pub session_id: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct StatusInfo {
    pub model: String,
    pub tokens_used: String,
    pub tokens_max: String,
    pub cost: String,
    pub duration: String,
}

// ─── Shared App State ─────────────────────────────────────────────────────────

pub struct AppState {
    pub pty_writers:
        std::sync::Mutex<std::collections::HashMap<String, Box<dyn std::io::Write + Send>>>,
    pub pty_masters: std::sync::Mutex<
        std::collections::HashMap<String, Box<dyn portable_pty::MasterPty + Send>>,
    >,
    pub pty_children: std::sync::Mutex<
        std::collections::HashMap<String, Box<dyn portable_pty::Child + Send + Sync>>,
    >,
    pub dashboard_child: std::sync::Mutex<Option<std::process::Child>>,
    pub background_tasks:
        Arc<Mutex<std::collections::HashMap<String, commands::background::BackgroundTask>>>,
    pub say_process: std::sync::Mutex<Option<std::process::Child>>,
    pub chat_processes: std::sync::Mutex<std::collections::HashMap<String, std::process::Child>>,
}

impl AppState {
    pub fn new() -> Self {
        AppState {
            pty_writers: std::sync::Mutex::new(std::collections::HashMap::new()),
            pty_masters: std::sync::Mutex::new(std::collections::HashMap::new()),
            pty_children: std::sync::Mutex::new(std::collections::HashMap::new()),
            dashboard_child: std::sync::Mutex::new(None),
            background_tasks: Arc::new(Mutex::new(std::collections::HashMap::new())),
            say_process: std::sync::Mutex::new(None),
            chat_processes: std::sync::Mutex::new(std::collections::HashMap::new()),
        }
    }
}

fn shutdown_children(app: &AppHandle) {
    commands::chat::shutdown_gateway();
    let state = app.state::<AppState>();
    if let Some(mut child) = state.dashboard_child.lock().unwrap().take() {
        child.kill().ok();
    }
    let mut procs = state.chat_processes.lock().unwrap();
    for (_, mut child) in procs.drain() {
        child.kill().ok();
    }
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    shutdown_children(&app);
    app.exit(0);
}

// ─── Shortcuts Setup ─────────────────────────────────────────────────────────

fn setup_shortcuts(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri_plugin_global_shortcut::{
        Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
    };

    #[cfg(target_os = "macos")]
    let modifiers = Modifiers::SUPER | Modifiers::SHIFT;
    #[cfg(not(target_os = "macos"))]
    let modifiers = Modifiers::CONTROL | Modifiers::SHIFT;

    let shortcut = Shortcut::new(Some(modifiers), Code::KeyH);
    app.global_shortcut()
        .on_shortcut(shortcut, |app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                if let Some(win) = app.get_webview_window("main") {
                    if win.is_visible().unwrap_or(false) {
                        win.hide().unwrap();
                    } else {
                        win.show().unwrap();
                        win.set_focus().unwrap();
                    }
                }
            }
        })?;

    Ok(())
}

// ─── Tray Setup ───────────────────────────────────────────────────────────────

fn setup_tray(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::{
        menu::{Menu, MenuItem, PredefinedMenuItem},
        tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    };

    let open = MenuItem::with_id(app, "open", "Open Hermes Desktop", true, None::<&str>)?;
    let new_session = MenuItem::with_id(app, "new_session", "New Session", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&open, &new_session, &sep, &quit])?;

    TrayIconBuilder::with_id("hermes-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("Hermes Desktop")
        .menu(&menu)
        // Left-click to toggle the window visibility
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(win) = app.get_webview_window("main") {
                    if win.is_visible().unwrap_or(false) {
                        win.hide().unwrap();
                    } else {
                        win.show().unwrap();
                        win.set_focus().unwrap();
                    }
                }
            }
        })
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => {
                if let Some(win) = app.get_webview_window("main") {
                    win.show().unwrap();
                    win.set_focus().unwrap();
                }
            }
            "new_session" => {
                if let Some(win) = app.get_webview_window("main") {
                    win.show().unwrap();
                    win.set_focus().unwrap();
                    let _ = win.emit("new-session-from-tray", ());
                }
            }
            "quit" => {
                // Kill background processes before quitting
                shutdown_children(app);
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}

fn setup_app_menu(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};

    let new_session = MenuItem::with_id(app, "new-session", "New Session", true, Some("CmdOrCtrl+N"))?;
    let snapshot = MenuItem::with_id(app, "toggle-snapshot", "Save Snapshot / Snapshot Timeline", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Hermes Desktop", true, Some("CmdOrCtrl+Q"))?;
    let file_sep = PredefinedMenuItem::separator(app)?;
    let file = Submenu::with_items(app, "Files", true, &[&new_session, &snapshot, &file_sep, &quit])?;

    // Standard edit items — these register the native ⌘C/⌘V/⌘X/⌘A/⌘Z/⌘⇧Z
    // accelerators. Without them in a custom menu, copy/paste/etc. stop working
    // in the webview on macOS.
    let undo = PredefinedMenuItem::undo(app, Some("Undo"))?;
    let redo = PredefinedMenuItem::redo(app, Some("Redo"))?;
    let edit_sep1 = PredefinedMenuItem::separator(app)?;
    let cut = PredefinedMenuItem::cut(app, Some("Cut"))?;
    let copy = PredefinedMenuItem::copy(app, Some("Copy"))?;
    let paste = PredefinedMenuItem::paste(app, Some("Paste"))?;
    let select_all = PredefinedMenuItem::select_all(app, Some("Select All"))?;
    let edit_sep2 = PredefinedMenuItem::separator(app)?;
    let stop_agent = MenuItem::with_id(app, "stop-agent", "Stop Running", true, None::<&str>)?;
    let shortcuts = MenuItem::with_id(app, "show-shortcuts", "Shortcuts", true, Some("CmdOrCtrl+/"))?;
    let edit = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &undo,
            &redo,
            &edit_sep1,
            &cut,
            &copy,
            &paste,
            &select_all,
            &edit_sep2,
            &stop_agent,
            &shortcuts,
        ],
    )?;

    let chat = MenuItem::with_id(app, "open-chat", "Chat", true, None::<&str>)?;
    let memory = MenuItem::with_id(app, "open-memory", "Memory", true, None::<&str>)?;
    let files = MenuItem::with_id(app, "open-files", "File Tree", true, None::<&str>)?;
    let dashboard = MenuItem::with_id(app, "open-dashboard", "Dashboard", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "open-settings", "Settings", true, None::<&str>)?;
    let terminal = MenuItem::with_id(app, "toggle-terminal", "Terminal", true, None::<&str>)?;
    let view = Submenu::with_items(
        app,
        "View",
        true,
        &[&chat, &memory, &files, &dashboard, &settings, &terminal],
    )?;

    let compress = MenuItem::with_id(app, "agent-compress", "Compress Context", true, None::<&str>)?;
    let background = MenuItem::with_id(app, "agent-background", "Background Tasks", true, None::<&str>)?;
    let agent = Submenu::with_items(app, "Agent", true, &[&compress, &background])?;

    let hide = MenuItem::with_id(app, "hide-window", "Hide to Tray", true, None::<&str>)?;
    let window_snapshot = MenuItem::with_id(app, "window-snapshot", "Snapshot Timeline", true, None::<&str>)?;
    let window = Submenu::with_items(app, "Window", true, &[&hide, &window_snapshot])?;

    let setup = MenuItem::with_id(app, "help-setup", "Setup & Configuration", true, None::<&str>)?;
    let about = MenuItem::with_id(app, "help-about", "About Hermes Desktop", true, None::<&str>)?;
    let help = Submenu::with_items(app, "Help", true, &[&setup, &about])?;

    let menu = Menu::with_items(app, &[&file, &edit, &view, &agent, &window, &help])?;
    app.set_menu(menu)?;
    Ok(())
}

fn setup_platform_window(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    if let Some(_win) = app.get_webview_window("main") {
        #[cfg(not(target_os = "macos"))]
        _win.set_decorations(false)?;
    }
    Ok(())
}

// ─── App Entry Point ──────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .manage(AppState::new())
        .setup(|app| {
            setup_platform_window(app)?;
            setup_app_menu(app)?;
            setup_tray(app)?;
            setup_shortcuts(app)?;
            Ok(())
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            "quit" => {
                shutdown_children(app);
                app.exit(0);
            }
            "hide-window" => {
                if let Some(win) = app.get_webview_window("main") {
                    win.hide().ok();
                }
            }
            "agent-compress" => {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.emit("app-menu-action", "show-shortcuts");
                }
            }
            "agent-background" | "window-snapshot" => {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.emit("app-menu-action", "toggle-snapshot");
                }
            }
            "help-setup" => {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.emit("app-menu-action", "open-dashboard");
                }
            }
            "help-about" => {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.emit("app-menu-action", "open-settings");
                }
            }
            id => {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.emit("app-menu-action", id.to_string());
                }
            }
        })
        .on_window_event(|window, event| match event {
            // Close button hides to tray instead of exiting
            tauri::WindowEvent::CloseRequested { api, .. } => {
                window.hide().unwrap();
                api.prevent_close();
            }
            // When the process actually exits (triggered by app.exit()), kill the dashboard
            tauri::WindowEvent::Destroyed => {
                let state = tauri::Manager::state::<AppState>(window);
                let child = state.dashboard_child.lock().unwrap().take();
                drop(state);
                if let Some(mut c) = child {
                    c.kill().ok();
                }
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            commands::sessions::list_sessions,
            commands::sessions::get_session_history,
            commands::sessions::delete_session,
            commands::sessions::rename_session,
            commands::sessions::undo_last_turn,
            commands::sessions::set_hermes_path,
            commands::sessions::branch_session,
            commands::chat::send_message,
            commands::chat::list_skills,
            commands::chat::kill_session,
            commands::chat::get_hermes_info,
            commands::chat::get_hermes_model_config,
            commands::chat::set_hermes_model,
            commands::chat::get_reasoning_effort,
            commands::chat::set_reasoning_effort,
            commands::setup::check_hermes_setup,
            commands::setup::open_install_terminal,
            commands::setup::open_setup_terminal,
            commands::memory::read_memory,
            commands::memory::save_memory,
            commands::dashboard::dashboard_start,
            commands::dashboard::dashboard_stop,
            commands::dashboard::dashboard_status,
            commands::dashboard::install_dashboard_themes,
            commands::dashboard::get_dashboard_theme_install_status,
            commands::terminal::pty_open,
            commands::terminal::pty_write,
            commands::terminal::pty_resize,
            commands::terminal::pty_close,
            commands::background::bg_start,
            commands::background::bg_list,
            commands::background::bg_get_output,
            commands::background::bg_stop,
            commands::background::bg_stop_all,
            commands::background::bg_clear_finished,
            commands::background::bg_running_count,
            commands::files::list_dir,
            commands::files::read_text_file,
            commands::files::save_upload,
            commands::files::get_home_dir,
            commands::files::open_path,
            commands::files::open_with_editor,
            commands::files::speak_text,
            commands::files::stop_speak,
            commands::files::check_memory_loaded,
            commands::snapshot::snapshot_create,
            commands::tray::update_tray_status,
            quit_app,
            commands::settings::load_guide_bot_settings,
            commands::settings::save_guide_bot_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
