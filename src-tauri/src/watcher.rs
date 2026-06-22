// File-system watcher exposed to JS as Tauri commands.
//
// Architecture: one debouncer per watch session keyed by an opaque watchId
// returned to JS. Each session emits `archora://fs-change` events with
// project-relative paths (filtered by extension whitelist + .gitignore).
//
// Debouncing happens twice: notify-debouncer-full coalesces raw OS events on
// a 200ms window, and the JS layer applies a second 500ms layer to group
// burst events from save-all in IDEs.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use ignore::gitignore::{Gitignore, GitignoreBuilder};
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, FileIdMap};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

const EVENT_NAME: &str = "archora://fs-change";
const DEBOUNCE_MS: u64 = 200;
const SUPPORTED_EXTS: &[&str] = &["ts", "tsx", "js", "jsx", "vue", "svelte", "mjs", "cjs"];

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FsChangePayload {
    pub watch_id: String,
    pub paths: Vec<String>,
    /// Wall-clock ms since UNIX epoch when the debouncer flushed this batch.
    /// JS uses it to drop stale events if a new scan started in the meantime.
    pub at: u64,
}

type Sessions = Mutex<HashMap<String, Debouncer<RecommendedWatcher, FileIdMap>>>;

#[derive(Default)]
pub struct WatcherState {
    sessions: Sessions,
}

#[tauri::command]
pub fn start_watch(
    root: String,
    state: State<'_, WatcherState>,
    app: AppHandle,
) -> Result<String, String> {
    let root_path = PathBuf::from(&root);
    if !root_path.is_dir() {
        return Err(format!("not a directory: {root}"));
    }
    let canonical = root_path
        .canonicalize()
        .map_err(|e| format!("canonicalize {root}: {e}"))?;

    let watch_id = uuid_like();
    let id_for_handler = watch_id.clone();
    let root_for_handler = canonical.clone();
    let app_for_handler = app.clone();

    // Build gitignore matchers from any .gitignore at the root. Nested
    // .gitignore files would require walking the tree on every event - skip
    // for now, matches simple-case behaviour of read_project_tree.
    let gitignore = build_gitignore(&canonical);

    let mut debouncer = new_debouncer(
        Duration::from_millis(DEBOUNCE_MS),
        None,
        move |res: DebounceEventResult| {
            let Ok(events) = res else { return };
            let mut rels: Vec<String> = Vec::new();
            for event in events {
                if !is_relevant_kind(&event.event.kind) {
                    continue;
                }
                for path in &event.event.paths {
                    if let Some(rel) = filter_and_relativize(path, &root_for_handler, &gitignore) {
                        if !rels.contains(&rel) {
                            rels.push(rel);
                        }
                    }
                }
            }
            if rels.is_empty() {
                return;
            }
            let payload = FsChangePayload {
                watch_id: id_for_handler.clone(),
                paths: rels,
                at: now_ms(),
            };
            let _ = app_for_handler.emit(EVENT_NAME, payload);
        },
    )
    .map_err(|e| format!("init watcher: {e}"))?;

    debouncer
        .watcher()
        .watch(&canonical, RecursiveMode::Recursive)
        .map_err(|e| format!("watch {canonical:?}: {e}"))?;

    state
        .sessions
        .lock()
        .map_err(|_| "watcher state poisoned".to_string())?
        .insert(watch_id.clone(), debouncer);

    Ok(watch_id)
}

#[tauri::command]
pub fn stop_watch(watch_id: String, state: State<'_, WatcherState>) -> Result<(), String> {
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| "watcher state poisoned".to_string())?;
    sessions.remove(&watch_id); // Drop runs notify cleanup
    Ok(())
}

/// Initialize the watcher state on the Tauri app. Call from `setup()`.
pub fn install(app: &mut tauri::App) {
    app.manage(WatcherState::default());
}

fn is_relevant_kind(kind: &EventKind) -> bool {
    use notify::event::{CreateKind, ModifyKind, RemoveKind};
    matches!(
        kind,
        EventKind::Create(CreateKind::File)
            | EventKind::Create(CreateKind::Any)
            | EventKind::Modify(ModifyKind::Data(_))
            | EventKind::Modify(ModifyKind::Name(_))
            | EventKind::Modify(ModifyKind::Any)
            | EventKind::Remove(RemoveKind::File)
            | EventKind::Remove(RemoveKind::Any)
    )
}

/// Resolve absolute path to a project-relative posix path, return None if the
/// file is ignored (extension not in whitelist, gitignore match, outside root).
fn filter_and_relativize(path: &Path, root: &Path, gitignore: &Option<Gitignore>) -> Option<String> {
    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_lowercase())?;
    if !SUPPORTED_EXTS.contains(&ext.as_str()) {
        return None;
    }
    let rel = path.strip_prefix(root).ok()?;
    if let Some(gi) = gitignore {
        if gi.matched_path_or_any_parents(rel, false).is_ignore() {
            return None;
        }
    }
    let mut parts = Vec::new();
    for component in rel.components() {
        if let std::path::Component::Normal(s) = component {
            parts.push(s.to_str()?.to_string());
        }
    }
    Some(parts.join("/"))
}

fn build_gitignore(root: &Path) -> Option<Gitignore> {
    let path = root.join(".gitignore");
    if !path.is_file() {
        return None;
    }
    let mut builder = GitignoreBuilder::new(root);
    if builder.add(&path).is_some() {
        return None;
    }
    builder.build().ok()
}

fn now_ms() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Tiny non-cryptographic id generator. Watch ids are scoped to one process
/// lifetime, no cross-machine uniqueness needed.
fn uuid_like() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("watch-{:x}-{:x}", now_ms(), n)
}

/// Pulled into a private module so we can keep an `Arc<Self>` API later if we
/// want a global singleton. Currently unused, retained for symmetry.
#[allow(dead_code)]
type SharedState = Arc<WatcherState>;
