use std::path::{Component, Path, PathBuf};
use std::process::Command;

use ignore::WalkBuilder;
use serde::{Deserialize, Serialize};
use tauri_plugin_dialog::DialogExt;

const DEFAULT_MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;
const HARD_MAX_FILE_BYTES: u64 = 16 * 1024 * 1024;

#[derive(Debug, Serialize)]
pub struct PickedDirectory {
    pub path: String,
    pub name: String,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ListOptions {
    #[serde(default)]
    pub extensions: Vec<String>,
    #[serde(default)]
    pub extra_ignore_globs: Vec<String>,
    #[serde(default)]
    pub follow_symlinks: bool,
    #[serde(default)]
    pub max_files: Option<usize>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ReadOptions {
    #[serde(default)]
    pub max_bytes: Option<u64>,
}

#[tauri::command]
pub async fn pick_directory(app: tauri::AppHandle) -> Result<Option<PickedDirectory>, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog().file().pick_folder(move |folder| {
        let _ = tx.send(folder);
    });
    let folder = tokio::task::spawn_blocking(move || rx.recv().ok().flatten())
        .await
        .map_err(|e| e.to_string())?;

    let Some(folder) = folder else {
        return Ok(None);
    };
    let path: PathBuf = folder
        .into_path()
        .map_err(|e| format!("invalid path: {e}"))?;
    let name = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("project")
        .to_string();
    let path_str = path
        .to_str()
        .ok_or_else(|| "non-utf8 path".to_string())?
        .to_string();
    Ok(Some(PickedDirectory {
        path: path_str,
        name,
    }))
}

#[tauri::command]
pub fn read_project_tree(root: String, options: Option<ListOptions>) -> Result<Vec<String>, String> {
    let opts = options.unwrap_or_default();
    let root_path = PathBuf::from(&root);
    if !root_path.is_dir() {
        return Err(format!("not a directory: {root}"));
    }

    let mut builder = WalkBuilder::new(&root_path);
    builder
        .hidden(false)
        .git_ignore(true)
        .git_exclude(true)
        // Apply .gitignore even when the root isn't a git repo - matches
        // NodeFsFileSource, which has no such gate.
        .require_git(false)
        .parents(true)
        .follow_links(opts.follow_symlinks);

    let extensions: Vec<String> = if opts.extensions.is_empty() {
        vec!["ts", "tsx", "js", "jsx", "vue", "svelte", "mjs", "cjs"]
            .into_iter()
            .map(String::from)
            .collect()
    } else {
        opts.extensions
            .iter()
            .map(|e| e.trim_start_matches('.').to_lowercase())
            .collect()
    };

    if !opts.extra_ignore_globs.is_empty() {
        let mut overrides = ignore::overrides::OverrideBuilder::new(&root_path);
        for pattern in &opts.extra_ignore_globs {
            let trimmed = pattern.trim();
            if trimmed.is_empty() {
                continue;
            }
            let inverted = format!("!{trimmed}");
            overrides
                .add(&inverted)
                .map_err(|e| format!("bad ignore pattern '{trimmed}': {e}"))?;
        }
        builder.overrides(overrides.build().map_err(|e| e.to_string())?);
    }

    let max_files = opts.max_files.unwrap_or(usize::MAX);
    let mut out = Vec::new();
    for entry in builder.build() {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        if !entry.file_type().is_some_and(|t| t.is_file()) {
            continue;
        }
        let path = entry.path();
        let ext = path
            .extension()
            .and_then(|s| s.to_str())
            .map(|s| s.to_lowercase());
        let Some(ext) = ext else { continue };
        if !extensions.iter().any(|e| e == &ext) {
            continue;
        }
        let rel = match path.strip_prefix(&root_path) {
            Ok(r) => r,
            Err(_) => continue,
        };
        let Some(rel_str) = rel.to_str() else { continue };
        out.push(rel_str.replace('\\', "/"));
        if out.len() >= max_files {
            break;
        }
    }
    Ok(out)
}

#[tauri::command]
pub async fn write_text_file(path: String, content: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    if let Some(parent) = target.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            return Err(format!("parent directory does not exist: {}", parent.display()));
        }
    }
    tokio::fs::write(&target, content)
        .await
        .map_err(|e| e.to_string())
}

/// Write a backup file, creating intermediate directories if needed.
/// Used by the apply-fix flow before mutating the user's source.
#[tauri::command]
pub async fn write_backup_file(path: String, content: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    if let Some(parent) = target.parent() {
        if !parent.as_os_str().is_empty() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| format!("failed to create backup directory: {e}"))?;
        }
    }
    tokio::fs::write(&target, content)
        .await
        .map_err(|e| e.to_string())
}

/// Delete files in `dir` older than `max_age_secs`. No-op if dir does not
/// exist. Returns the number of removed entries.
#[tauri::command]
pub async fn cleanup_old_files(dir: String, max_age_secs: u64) -> Result<u32, String> {
    let path = PathBuf::from(&dir);
    if !path.exists() {
        return Ok(0);
    }
    let mut removed: u32 = 0;
    let mut entries = tokio::fs::read_dir(&path)
        .await
        .map_err(|e| e.to_string())?;
    let cutoff = std::time::SystemTime::now()
        .checked_sub(std::time::Duration::from_secs(max_age_secs))
        .unwrap_or(std::time::UNIX_EPOCH);
    while let Some(entry) = entries.next_entry().await.map_err(|e| e.to_string())? {
        let meta = match entry.metadata().await {
            Ok(m) => m,
            Err(_) => continue,
        };
        if !meta.is_file() {
            continue;
        }
        let modified = match meta.modified() {
            Ok(m) => m,
            Err(_) => continue,
        };
        if modified < cutoff {
            if tokio::fs::remove_file(entry.path()).await.is_ok() {
                removed += 1;
            }
        }
    }
    Ok(removed)
}

#[tauri::command]
pub async fn read_file(
    root: String,
    relative: String,
    options: Option<ReadOptions>,
) -> Result<String, String> {
    let opts = options.unwrap_or_default();
    let max_bytes = opts
        .max_bytes
        .unwrap_or(DEFAULT_MAX_FILE_BYTES)
        .min(HARD_MAX_FILE_BYTES);

    let root_path = PathBuf::from(&root);
    let rel_path = Path::new(&relative);
    if rel_path.is_absolute()
        || rel_path
            .components()
            .any(|c| matches!(c, Component::ParentDir))
    {
        return Err("invalid relative path".to_string());
    }
    let target = root_path.join(rel_path);
    let canonical_root = root_path
        .canonicalize()
        .map_err(|e| format!("cannot resolve root: {e}"))?;
    let canonical_target = target
        .canonicalize()
        .map_err(|e| format!("cannot resolve file: {e}"))?;
    if !canonical_target.starts_with(&canonical_root) {
        return Err("path escapes project root".to_string());
    }
    let metadata = tokio::fs::metadata(&canonical_target)
        .await
        .map_err(|e| e.to_string())?;
    if metadata.len() > max_bytes {
        return Err(format!(
            "file too large: {} bytes (limit {})",
            metadata.len(),
            max_bytes
        ));
    }
    tokio::fs::read_to_string(&canonical_target)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn read_files(
    root: String,
    relatives: Vec<String>,
    options: Option<ReadOptions>,
) -> Result<std::collections::HashMap<String, String>, String> {
    let opts = options.unwrap_or_default();
    let max_bytes = opts
        .max_bytes
        .unwrap_or(DEFAULT_MAX_FILE_BYTES)
        .min(HARD_MAX_FILE_BYTES);
    let root_path = PathBuf::from(&root);
    let canonical_root = root_path
        .canonicalize()
        .map_err(|e| format!("cannot resolve root: {e}"))?;

    let mut out = std::collections::HashMap::with_capacity(relatives.len());
    for relative in relatives {
        match read_file_checked(&canonical_root, &relative, max_bytes).await {
            Ok(content) => {
                out.insert(relative, content);
            }
            Err(_) => {
                // Match the JS snapshot behavior: unreadable/oversized files
                // are skipped so one bad file does not fail a large scan.
            }
        }
    }
    Ok(out)
}

async fn read_file_checked(
    canonical_root: &Path,
    relative: &str,
    max_bytes: u64,
) -> Result<String, String> {
    let rel_path = Path::new(relative);
    if rel_path.is_absolute()
        || rel_path
            .components()
            .any(|c| matches!(c, Component::ParentDir))
    {
        return Err("invalid relative path".to_string());
    }
    let target = canonical_root.join(rel_path);
    let canonical_target = target
        .canonicalize()
        .map_err(|e| format!("cannot resolve file: {e}"))?;
    if !canonical_target.starts_with(canonical_root) {
        return Err("path escapes project root".to_string());
    }
    let metadata = tokio::fs::metadata(&canonical_target)
        .await
        .map_err(|e| e.to_string())?;
    if metadata.len() > max_bytes {
        return Err(format!(
            "file too large: {} bytes (limit {})",
            metadata.len(),
            max_bytes
        ));
    }
    tokio::fs::read_to_string(&canonical_target)
        .await
        .map_err(|e| e.to_string())
}

// exists() probe for config files (tsconfig.json, package.json, etc.)
// that aren't in the extension-filtered listing. Same root-escape
// checks as read_file; not extension-restricted.
#[tauri::command]
pub async fn file_exists(root: String, relative: String) -> Result<bool, String> {
    let root_path = PathBuf::from(&root);
    let rel_path = Path::new(&relative);
    if rel_path.is_absolute()
        || rel_path
            .components()
            .any(|c| matches!(c, Component::ParentDir))
    {
        return Err("invalid relative path".to_string());
    }
    let target = root_path.join(rel_path);
    let canonical_root = match root_path.canonicalize() {
        Ok(p) => p,
        Err(_) => return Ok(false),
    };
    let canonical_target = match target.canonicalize() {
        Ok(p) => p,
        Err(_) => return Ok(false),
    };
    if !canonical_target.starts_with(&canonical_root) {
        return Ok(false);
    }
    Ok(matches!(
        tokio::fs::metadata(&canonical_target).await,
        Ok(m) if m.is_file()
    ))
}

/// Run `git log` in `root` and return the raw stdout as a string.
///
/// Runs exactly:
///   git -C <root> log --no-merges --numstat --date=iso-strict \
///       --pretty=format:__FS_COMMIT__%x01%H%x01%h%x01%aN%x01%aE%x01%aI%x01%s \
///       --max-count=<max_commits>
///
/// The output format is consumed by `parseGitLog` on the JS side.
///
/// Returns `Ok("")` (empty string) when:
/// - git is not installed
/// - the directory is not a git repository
/// - git exits non-zero for any reason
///
/// Only returns `Err` for unexpected failures unrelated to git availability
/// (e.g. the root path cannot be represented as a string). This keeps
/// non-git projects scanning normally without surfacing an error.
#[tauri::command]
pub fn git_log(root: String, max_commits: Option<u32>) -> Result<String, String> {
    let limit = max_commits.unwrap_or(1500).to_string();
    let output = Command::new("git")
        .args([
            "-C",
            &root,
            "log",
            "--no-merges",
            "--numstat",
            "--date=iso-strict",
            "--pretty=format:__FS_COMMIT__%x01%H%x01%h%x01%aN%x01%aE%x01%aI%x01%s",
            &format!("--max-count={limit}"),
        ])
        .output();

    match output {
        Ok(out) if out.status.success() => {
            String::from_utf8(out.stdout).map_err(|e| e.to_string())
        }
        // git not found, not a repo, or any non-zero exit — degrade gracefully.
        Ok(_) | Err(_) => Ok(String::new()),
    }
}

// Spawns the configured editor with the given file path. We deliberately
// don't go through tauri-plugin-shell: that would require an allow-list of
// commands at build time, but the user picks their editor at runtime.
// Security note: the command name comes from a small enum on the JS side
// (or a user-supplied string for the 'custom' option). We treat this as
// trusted input from the user themselves.
#[tauri::command]
pub fn open_in_editor(command: String, path: String, line: Option<u32>) -> Result<(), String> {
    use std::process::Stdio;

    let cmd = command.trim();
    if cmd.is_empty() {
        return Err("editor command is empty".into());
    }
    if path.trim().is_empty() {
        return Err("path is empty".into());
    }

    // shell-split the editor command so users can configure things like
    // "code --wait" via the custom option.
    let parts: Vec<String> = shell_split(cmd);
    let (program, prefix_args) = parts.split_first().ok_or("editor command is empty")?;

    // Per-editor argument shape. Most CLIs accept `path:line:col`, but
    // JetBrains IDEs want `--line N path`.
    let mut args: Vec<String> = prefix_args.to_vec();
    let prog_lower = std::path::Path::new(program)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(program)
        .to_lowercase();
    let is_jetbrains =
        matches!(prog_lower.as_str(), "idea" | "webstorm" | "pycharm" | "rubymine" | "goland");

    match (is_jetbrains, line) {
        (true, Some(n)) => {
            args.push("--line".into());
            args.push(n.to_string());
            args.push(path);
        }
        (false, Some(n)) => {
            // code/cursor/subl all understand the goto syntax
            args.push(format!("{path}:{n}"));
        }
        _ => args.push(path),
    }

    Command::new(program)
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("failed to launch '{program}': {e}"))?;

    Ok(())
}

// Minimal POSIX-ish splitter: handles single/double quotes and backslash
// escapes. Good enough for "code --wait" or "/usr/local/bin/code --new-window".
fn shell_split(input: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut buf = String::new();
    let mut chars = input.chars().peekable();
    let mut quote: Option<char> = None;

    while let Some(c) = chars.next() {
        if let Some(q) = quote {
            if c == q {
                quote = None;
            } else if c == '\\' && q == '"' {
                if let Some(&next) = chars.peek() {
                    buf.push(next);
                    chars.next();
                }
            } else {
                buf.push(c);
            }
            continue;
        }
        match c {
            '\'' | '"' => quote = Some(c),
            '\\' => {
                if let Some(&next) = chars.peek() {
                    buf.push(next);
                    chars.next();
                }
            }
            c if c.is_whitespace() => {
                if !buf.is_empty() {
                    out.push(std::mem::take(&mut buf));
                }
            }
            c => buf.push(c),
        }
    }
    if !buf.is_empty() {
        out.push(buf);
    }
    out
}

#[cfg(test)]
mod tests {
    // `read_project_tree`, `read_file` and `file_exists` are callable as
    // plain functions - the #[tauri::command] attribute only adds IPC
    // wiring. `pick_directory` needs an OS dialog and isn't covered here.

    use super::*;
    use std::fs;
    use std::path::Path;
    use tempfile::TempDir;

    fn write_at(root: &Path, rel: &str, content: &str) {
        let target = root.join(rel);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(target, content).unwrap();
    }

    fn setup_basic_project() -> TempDir {
        let dir = TempDir::new().unwrap();
        let root = dir.path();
        write_at(root, "package.json", "{}");
        write_at(root, "tsconfig.json", "{}");
        write_at(root, "README.md", "ignored by extension whitelist");
        write_at(root, "src/main.ts", "export {};");
        write_at(root, "src/App.vue", "<template/>");
        write_at(root, "src/util.js", "module.exports = {};");
        write_at(root, "src/data.json", "not a source extension");
        write_at(root, "src/nested/deep/Icon.tsx", "export default () => null;");
        dir
    }

    fn root_as_string(dir: &TempDir) -> String {
        dir.path().to_str().unwrap().to_string()
    }

    // ---------- read_project_tree -----------------------------------------

    #[test]
    fn read_project_tree_returns_only_whitelisted_extensions() {
        let dir = setup_basic_project();
        let mut out = read_project_tree(root_as_string(&dir), None).unwrap();
        out.sort();
        assert_eq!(
            out,
            vec![
                "src/App.vue",
                "src/main.ts",
                "src/nested/deep/Icon.tsx",
                "src/util.js",
            ]
        );
    }

    #[test]
    fn read_project_tree_honors_gitignore() {
        let dir = setup_basic_project();
        write_at(dir.path(), ".gitignore", "src/nested/\n");
        let out = read_project_tree(root_as_string(&dir), None).unwrap();
        assert!(!out.iter().any(|p| p.starts_with("src/nested/")));
        assert!(out.iter().any(|p| p == "src/main.ts"));
    }

    #[test]
    fn read_project_tree_applies_extra_ignore_globs() {
        let dir = setup_basic_project();
        let opts = ListOptions {
            extensions: vec![],
            extra_ignore_globs: vec!["**/*.vue".into()],
            follow_symlinks: false,
            max_files: None,
        };
        let out = read_project_tree(root_as_string(&dir), Some(opts)).unwrap();
        assert!(!out.iter().any(|p| p.ends_with(".vue")));
        assert!(out.iter().any(|p| p.ends_with(".ts")));
    }

    #[test]
    fn read_project_tree_respects_max_files() {
        let dir = setup_basic_project();
        let opts = ListOptions {
            extensions: vec![],
            extra_ignore_globs: vec![],
            follow_symlinks: false,
            max_files: Some(2),
        };
        let out = read_project_tree(root_as_string(&dir), Some(opts)).unwrap();
        assert_eq!(out.len(), 2);
    }

    #[test]
    fn read_project_tree_rejects_non_directory() {
        let dir = TempDir::new().unwrap();
        let file_path = dir.path().join("not-a-dir.txt");
        fs::write(&file_path, "x").unwrap();
        let err = read_project_tree(file_path.to_str().unwrap().to_string(), None).unwrap_err();
        assert!(err.contains("not a directory"), "got: {err}");
    }

    #[test]
    fn read_project_tree_accepts_custom_extensions() {
        let dir = TempDir::new().unwrap();
        write_at(dir.path(), "a.md", "hello");
        write_at(dir.path(), "b.ts", "export {};");
        let opts = ListOptions {
            extensions: vec!["md".into()],
            extra_ignore_globs: vec![],
            follow_symlinks: false,
            max_files: None,
        };
        let out = read_project_tree(root_as_string(&dir), Some(opts)).unwrap();
        assert_eq!(out, vec!["a.md"]);
    }

    // ---------- read_file -------------------------------------------------

    #[tokio::test]
    async fn read_file_returns_contents() {
        let dir = setup_basic_project();
        let content = read_file(root_as_string(&dir), "src/main.ts".into(), None)
            .await
            .unwrap();
        assert_eq!(content, "export {};");
    }

    #[tokio::test]
    async fn read_file_reads_non_whitelisted_extensions() {
        // Config files are outside the listing whitelist; read_file must
        // still return them so tsconfig paths can resolve.
        let dir = setup_basic_project();
        let content = read_file(root_as_string(&dir), "tsconfig.json".into(), None)
            .await
            .unwrap();
        assert_eq!(content, "{}");
    }

    #[tokio::test]
    async fn read_file_rejects_absolute_path() {
        let dir = setup_basic_project();
        let abs = dir.path().join("src/main.ts").to_str().unwrap().to_string();
        let err = read_file(root_as_string(&dir), abs, None).await.unwrap_err();
        assert!(err.contains("invalid relative path"), "got: {err}");
    }

    #[tokio::test]
    async fn read_file_rejects_parent_dir_traversal() {
        let dir = setup_basic_project();
        let err = read_file(root_as_string(&dir), "../outside".into(), None)
            .await
            .unwrap_err();
        assert!(err.contains("invalid relative path"), "got: {err}");
    }

    #[tokio::test]
    async fn read_file_rejects_nested_parent_dir_traversal() {
        let dir = setup_basic_project();
        let err = read_file(root_as_string(&dir), "src/../../etc/passwd".into(), None)
            .await
            .unwrap_err();
        assert!(err.contains("invalid relative path"), "got: {err}");
    }

    #[tokio::test]
    async fn read_file_enforces_max_bytes() {
        let dir = TempDir::new().unwrap();
        write_at(dir.path(), "big.ts", &"x".repeat(1024));
        let opts = ReadOptions {
            max_bytes: Some(16),
        };
        let err = read_file(root_as_string(&dir), "big.ts".into(), Some(opts))
            .await
            .unwrap_err();
        assert!(err.contains("file too large"), "got: {err}");
    }

    #[tokio::test]
    async fn read_file_missing_file_returns_err() {
        let dir = setup_basic_project();
        // canonicalize() message is OS-dependent; only assert failure.
        let err = read_file(root_as_string(&dir), "src/nope.ts".into(), None)
            .await
            .unwrap_err();
        assert!(!err.is_empty());
    }

    // ---------- file_exists -----------------------------------------------

    #[tokio::test]
    async fn file_exists_returns_true_for_present_file() {
        let dir = setup_basic_project();
        assert!(file_exists(root_as_string(&dir), "tsconfig.json".into())
            .await
            .unwrap());
        assert!(file_exists(root_as_string(&dir), "src/main.ts".into())
            .await
            .unwrap());
    }

    #[tokio::test]
    async fn file_exists_returns_false_for_missing() {
        let dir = setup_basic_project();
        assert!(!file_exists(root_as_string(&dir), "missing.json".into())
            .await
            .unwrap());
    }

    #[tokio::test]
    async fn file_exists_returns_false_for_directory() {
        let dir = setup_basic_project();
        assert!(!file_exists(root_as_string(&dir), "src".into())
            .await
            .unwrap());
    }

    #[tokio::test]
    async fn file_exists_rejects_absolute_path() {
        let dir = setup_basic_project();
        let abs = dir.path().join("tsconfig.json").to_str().unwrap().to_string();
        let err = file_exists(root_as_string(&dir), abs).await.unwrap_err();
        assert!(err.contains("invalid relative path"), "got: {err}");
    }

    #[tokio::test]
    async fn file_exists_rejects_parent_dir_traversal() {
        let dir = setup_basic_project();
        let err = file_exists(root_as_string(&dir), "../outside".into())
            .await
            .unwrap_err();
        assert!(err.contains("invalid relative path"), "got: {err}");
    }

    // ---------- shell_split ----------------------------------------------

    #[test]
    fn shell_split_handles_simple_words() {
        assert_eq!(shell_split("code --wait"), vec!["code", "--wait"]);
    }

    #[test]
    fn shell_split_handles_quoted_paths() {
        assert_eq!(
            shell_split("\"/Applications/Visual Studio Code.app/code\" --new-window"),
            vec!["/Applications/Visual Studio Code.app/code", "--new-window"]
        );
    }

    #[test]
    fn shell_split_collapses_whitespace_runs() {
        assert_eq!(shell_split("  code   -n  "), vec!["code", "-n"]);
    }

    #[test]
    fn shell_split_supports_single_quotes() {
        assert_eq!(shell_split("idea '--line 42'"), vec!["idea", "--line 42"]);
    }

    #[tokio::test]
    async fn file_exists_nonexistent_root_returns_false() {
        // Root that can't be canonicalized → Ok(false), not Err.
        let result = file_exists(
            "/nonexistent-root-path-for-archora-test".into(),
            "anything.json".into(),
        )
        .await
        .unwrap();
        assert!(!result);
    }
}
