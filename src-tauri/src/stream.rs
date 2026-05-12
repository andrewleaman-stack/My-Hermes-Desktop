/// Strip ANSI escape codes and carriage-return rewrites from a raw terminal line.
pub fn strip_ansi(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = String::new();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            0x1b => {
                i += 1;
                if i >= bytes.len() { break; }
                match bytes[i] {
                    b'[' => {
                        i += 1;
                        while i < bytes.len() && !bytes[i].is_ascii_alphabetic() { i += 1; }
                        if i < bytes.len() { i += 1; }
                    }
                    b']' => {
                        // OSC sequence: ESC ] ... BEL(\x07) or ESC\
                        i += 1;
                        while i < bytes.len() {
                            if bytes[i] == 0x07 { i += 1; break; }
                            if bytes[i] == 0x1b {
                                if i + 1 < bytes.len() && bytes[i + 1] == b'\\' { i += 2; }
                                else { i += 1; }
                                break;
                            }
                            i += 1;
                        }
                    }
                    _ => { i += 1; }
                }
            }
            b'\r' => {
                // CR = cursor to start of line — discard everything on this line
                out.clear();
                i += 1;
            }
            _ => {
                let start = i;
                while i < bytes.len() && bytes[i] != 0x1b && bytes[i] != b'\r' { i += 1; }
                if let Ok(chunk) = std::str::from_utf8(&bytes[start..i]) {
                    out.push_str(chunk);
                }
            }
        }
    }
    out
}

/// Returns true for decorative/metadata lines that should never reach the UI.
pub fn is_decorative(trimmed: &str) -> bool {
    if trimmed.is_empty() { return false; }

    if trimmed.starts_with('╭') || trimmed.starts_with('╰') { return true; }
    if trimmed.starts_with('┊') { return true; }

    if trimmed.len() > 4
        && trimmed.chars().all(|c| matches!(c, '─' | '═' | '━' | '-' | '│' | ' '))
    {
        return true;
    }

    for prefix in &[
        "Query:", "Initializing ", "↻ ", "Resume this session with:",
        "Session: ", "Duration: ", "Messages: ", "Goodbye!",
        "Welcome to Hermes", "Tip:", "Warning:",
    ] {
        if trimmed.starts_with(prefix) { return true; }
    }

    // Status bar: ⚕ model │ 12.4K/200K │ ...
    if trimmed.contains('│') && (trimmed.contains("K/") || trimmed.contains("M/")) {
        return true;
    }
    // PTY status bar with block chars
    if (trimmed.contains('░') || trimmed.contains('█')) && trimmed.contains('|') {
        return true;
    }
    if trimmed.starts_with("-- |") || trimmed.starts_with("ctx --") { return true; }
    if trimmed.contains("reflecting...") { return true; }
    if trimmed.contains("msg=interrupt") || trimmed.contains("Ctrl+C cancel") { return true; }
    if trimmed == "❯" { return true; }

    false
}
