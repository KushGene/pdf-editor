use std::path::{Path, PathBuf};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    eprintln!("{name}");
    format!("Hello, {}! You've been greeted from Rust!", name)
}

fn is_pdf(path: &Path) -> bool {
    path.is_file()
        && path
            .extension()
            .and_then(|ext| ext.to_str())
            .is_some_and(|ext| ext.eq_ignore_ascii_case("pdf"))
}

/// Path of a PDF handed over on the command line, e.g. when the file manager
/// launches the app through the desktop entry (`Exec=... %f`).
#[tauri::command]
fn startup_file() -> Option<String> {
    std::env::args_os()
        .skip(1)
        .map(PathBuf::from)
        .find(|path| is_pdf(path))
        .map(|path| path.to_string_lossy().into_owned())
}

/// Reads a PDF as raw bytes. Command line arguments are not covered by the fs
/// plugin scope (unlike files the user picks in the dialog), so the startup
/// file is read here instead of through `@tauri-apps/plugin-fs`.
#[tauri::command]
fn read_pdf_bytes(path: String) -> Result<tauri::ipc::Response, String> {
    let path = PathBuf::from(path);
    if !is_pdf(&path) {
        return Err(format!("not a PDF file: {}", path.display()));
    }
    std::fs::read(&path)
        .map(tauri::ipc::Response::new)
        .map_err(|err| format!("failed to read {}: {err}", path.display()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // WebKitGTK's DMA-BUF renderer breaks AppImage builds on several distros
    // (blank window or the app fails to start, e.g. Fedora on Wayland/Nvidia).
    // Native packages (rpm/deb) are unaffected, so only apply this inside an
    // AppImage and let an explicit user setting win.
    #[cfg(target_os = "linux")]
    if std::env::var_os("APPIMAGE").is_some()
        && std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none()
    {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![greet, startup_file, read_pdf_bytes])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
