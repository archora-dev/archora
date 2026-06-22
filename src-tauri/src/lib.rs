mod commands;
mod watcher;

use tauri::webview::PageLoadEvent;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let started_at = std::time::Instant::now();
    println!("[startup] tauri runtime start +0ms");
    println!("[startup] tauri builder created +{}ms", started_at.elapsed().as_millis());
    tauri::Builder::default()
        .on_page_load(move |webview, payload| {
            match payload.event() {
                PageLoadEvent::Started => {
                    println!(
                        "[startup] page load started {} +{}ms",
                        payload.url(),
                        started_at.elapsed().as_millis()
                    );
                    if let Err(err) = webview.window().show() {
                        eprintln!("[startup] failed to show main window: {err}");
                    }
                }
                PageLoadEvent::Finished => {
                    println!(
                        "[startup] page load finished {} +{}ms",
                        payload.url(),
                        started_at.elapsed().as_millis()
                    );
                }
            }
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(move |app| {
            println!("[startup] tauri setup started +{}ms", started_at.elapsed().as_millis());
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            watcher::install(app);
            println!("[startup] tauri setup finished +{}ms", started_at.elapsed().as_millis());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::pick_directory,
            commands::read_project_tree,
            commands::read_file,
            commands::read_files,
            commands::file_exists,
            commands::write_text_file,
            commands::write_backup_file,
            commands::cleanup_old_files,
            commands::open_in_editor,
            commands::git_log,
            watcher::start_watch,
            watcher::stop_watch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
