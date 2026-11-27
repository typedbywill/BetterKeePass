use std::{
    fs,
    io::Read,
    net::IpAddr,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use base64::Engine as _;
use bkp_core::{
    AppConfig, ClipboardConfig, EntryDetails, EntryPatch, EntrySummary, GroupNode, HealthReport,
    HistoryEntrySummary, NewEntry, OtpCode, PasswordOptions, SecurityConfig, UiConfig, Vault,
    analyze_health, generate_passphrase, generate_password,
};
use bkp_platform::ClipboardManager;
use bkp_protocol::PairedBrowser;
use secrecy::{ExposeSecret, SecretString};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

const MAX_FAVICON_BYTES: u64 = 262_144;

struct UnlockedVault {
    vault: Vault,
    path: PathBuf,
    master_password: Option<SecretString>,
    keyfile: Option<PathBuf>,
    last_activity: Instant,
}

struct AppState {
    session: Arc<Mutex<Option<UnlockedVault>>>,
    config: Mutex<AppConfig>,
    clipboard: ClipboardManager,
    paired_browsers: Mutex<Vec<PairedBrowser>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EntryDetailsDto {
    summary: EntrySummary,
    notes: String,
    has_otp: bool,
    custom_fields: Vec<bkp_core::CustomFieldView>,
    attachments: Vec<String>,
}

impl From<EntryDetails> for EntryDetailsDto {
    fn from(value: EntryDetails) -> Self {
        Self {
            summary: value.summary,
            notes: value.notes,
            has_otp: value.has_otp,
            custom_fields: value.custom_fields,
            attachments: value.attachments,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppConfigDto {
    security: SecurityConfig,
    clipboard: ClipboardConfig,
    ui: UiConfig,
    managed_by_nix: bool,
}

impl From<&AppConfig> for AppConfigDto {
    fn from(value: &AppConfig) -> Self {
        Self {
            security: value.security.clone(),
            clipboard: value.clipboard.clone(),
            ui: value.ui.clone(),
            managed_by_nix: value.managed_by_nix,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SetUiConfigResult {
    persisted: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NewEntryPayload {
    group_path: Option<String>,
    title: String,
    username: Option<String>,
    password: Option<String>,
    url: Option<String>,
    notes: Option<String>,
    #[serde(default)]
    tags: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EntryPatchPayload {
    title: Option<String>,
    username: Option<String>,
    password: Option<String>,
    url: Option<String>,
    notes: Option<String>,
    tags: Option<Vec<String>>,
}

fn with_vault_mut<T>(
    state: &State<'_, AppState>,
    f: impl FnOnce(&mut UnlockedVault) -> Result<T, String>,
) -> Result<T, String> {
    let mut guard = state
        .session
        .lock()
        .map_err(|_| "falha ao acessar estado do cofre".to_owned())?;
    let Some(unlocked) = guard.as_mut() else {
        return Err("cofre bloqueado".to_owned());
    };
    unlocked.last_activity = Instant::now();
    f(unlocked)
}

#[tauri::command]
fn open_vault(
    state: State<'_, AppState>,
    path: String,
    password: String,
    keyfile: Option<String>,
) -> Result<(), String> {
    let pb = PathBuf::from(path);
    let kf = keyfile.map(PathBuf::from);
    let secret = (!password.is_empty()).then(|| SecretString::from(password));
    let vault = Vault::open(&pb, secret.clone(), kf.as_deref()).map_err(|e| e.to_string())?;
    let mut guard = state
        .session
        .lock()
        .map_err(|_| "falha ao armazenar cofre".to_owned())?;
    *guard = Some(UnlockedVault {
        vault,
        path: pb,
        master_password: secret,
        keyfile: kf,
        last_activity: Instant::now(),
    });
    Ok(())
}

#[tauri::command]
fn create_vault(
    state: State<'_, AppState>,
    path: String,
    password: String,
    name: Option<String>,
) -> Result<(), String> {
    let pb = PathBuf::from(path);
    let secret = Some(SecretString::from(password));
    let vault = Vault::create(name.as_deref());
    vault
        .save(&pb, secret.clone(), None)
        .map_err(|e| e.to_string())?;
    let mut guard = state
        .session
        .lock()
        .map_err(|_| "falha ao armazenar cofre".to_owned())?;
    *guard = Some(UnlockedVault {
        vault,
        path: pb,
        master_password: secret,
        keyfile: None,
        last_activity: Instant::now(),
    });
    Ok(())
}

#[tauri::command]
fn lock_vault(state: State<'_, AppState>) -> Result<(), String> {
    let mut guard = state
        .session
        .lock()
        .map_err(|_| "falha ao bloquear cofre".to_owned())?;
    *guard = None;
    Ok(())
}

#[tauri::command]
fn search_entries(state: State<'_, AppState>, query: String) -> Result<Vec<EntrySummary>, String> {
    with_vault_mut(&state, |u| Ok(u.vault.search(&query)))
}

#[tauri::command]
fn get_group_tree(state: State<'_, AppState>) -> Result<GroupNode, String> {
    with_vault_mut(&state, |u| Ok(u.vault.group_tree()))
}

#[tauri::command]
fn get_entry_details(state: State<'_, AppState>, uuid: String) -> Result<EntryDetailsDto, String> {
    let parsed = Uuid::parse_str(&uuid).map_err(|e| e.to_string())?;
    with_vault_mut(&state, |u| {
        u.vault
            .entry_details(parsed, false)
            .map(EntryDetailsDto::from)
            .map_err(|e| e.to_string())
    })
}

#[tauri::command]
fn reveal_entry_password(state: State<'_, AppState>, uuid: String) -> Result<String, String> {
    let parsed = Uuid::parse_str(&uuid).map_err(|e| e.to_string())?;
    with_vault_mut(&state, |u| {
        let secret = u.vault.entry_secret(parsed).map_err(|e| e.to_string())?;
        Ok(secret.expose_secret().to_owned())
    })
}

#[tauri::command]
fn copy_entry_field(
    state: State<'_, AppState>,
    uuid: String,
    field: String,
) -> Result<(), String> {
    let parsed = Uuid::parse_str(&uuid).map_err(|e| e.to_string())?;
    let clear_secs = state
        .config
        .lock()
        .map_err(|_| "falha ao ler configuração".to_owned())?
        .clipboard
        .clear_after_seconds;
    let secret = with_vault_mut(&state, |u| match field.as_str() {
        "password" => u.vault.entry_secret(parsed).map_err(|e| e.to_string()),
        "username" => {
            let details = u
                .vault
                .entry_details(parsed, false)
                .map_err(|e| e.to_string())?;
            Ok(SecretString::from(details.summary.username))
        }
        "totp" => {
            let otp = u.vault.totp_now(parsed).map_err(|e| e.to_string())?;
            Ok(SecretString::from(otp.code))
        }
        _ => Err("campo não suportado".to_owned()),
    })?;
    state
        .clipboard
        .copy_secret(&secret, clear_secs)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_entry_totp(state: State<'_, AppState>, uuid: String) -> Result<OtpCode, String> {
    let parsed = Uuid::parse_str(&uuid).map_err(|e| e.to_string())?;
    with_vault_mut(&state, |u| u.vault.totp_now(parsed).map_err(|e| e.to_string()))
}

#[tauri::command]
fn get_entry_history(
    state: State<'_, AppState>,
    uuid: String,
) -> Result<Vec<HistoryEntrySummary>, String> {
    let parsed = Uuid::parse_str(&uuid).map_err(|e| e.to_string())?;
    with_vault_mut(&state, |u| {
        u.vault.entry_history(parsed).map_err(|e| e.to_string())
    })
}

#[tauri::command]
fn add_entry(state: State<'_, AppState>, payload: NewEntryPayload) -> Result<String, String> {
    with_vault_mut(&state, |u| {
        let uuid = u
            .vault
            .add_entry(
                payload.group_path.as_deref(),
                NewEntry {
                    title: payload.title,
                    username: payload.username,
                    password: payload.password.map(SecretString::from),
                    url: payload.url,
                    notes: payload.notes,
                    tags: payload.tags,
                    ..NewEntry::default()
                },
            )
            .map_err(|e| e.to_string())?;
        u.vault
            .save(&u.path, u.master_password.clone(), u.keyfile.as_deref())
            .map_err(|e| e.to_string())?;
        Ok(uuid.to_string())
    })
}

#[tauri::command]
fn update_entry(
    state: State<'_, AppState>,
    uuid: String,
    patch: EntryPatchPayload,
) -> Result<(), String> {
    let parsed = Uuid::parse_str(&uuid).map_err(|e| e.to_string())?;
    with_vault_mut(&state, |u| {
        u.vault
            .edit_entry(
                parsed,
                EntryPatch {
                    title: patch.title,
                    username: patch.username,
                    password: patch.password.map(SecretString::from),
                    url: patch.url,
                    notes: patch.notes,
                    tags: patch.tags,
                    custom_fields: Vec::new(),
                },
            )
            .map_err(|e| e.to_string())?;
        u.vault
            .save(&u.path, u.master_password.clone(), u.keyfile.as_deref())
            .map_err(|e| e.to_string())
    })
}

#[tauri::command]
fn restore_history(state: State<'_, AppState>, uuid: String, index: usize) -> Result<(), String> {
    let parsed = Uuid::parse_str(&uuid).map_err(|e| e.to_string())?;
    with_vault_mut(&state, |u| {
        u.vault
            .restore_history(parsed, index)
            .map_err(|e| e.to_string())?;
        u.vault
            .save(&u.path, u.master_password.clone(), u.keyfile.as_deref())
            .map_err(|e| e.to_string())
    })
}

#[tauri::command]
fn delete_entry(
    state: State<'_, AppState>,
    uuid: String,
    permanent: bool,
) -> Result<(), String> {
    let parsed = Uuid::parse_str(&uuid).map_err(|e| e.to_string())?;
    with_vault_mut(&state, |u| {
        u.vault
            .delete_entry(parsed, permanent)
            .map_err(|e| e.to_string())?;
        u.vault
            .save(&u.path, u.master_password.clone(), u.keyfile.as_deref())
            .map_err(|e| e.to_string())
    })
}

#[tauri::command]
fn generate_password_cmd(length: usize) -> Result<String, String> {
    let pw = generate_password(&PasswordOptions {
        length,
        ..PasswordOptions::default()
    })
    .map_err(|e| e.to_string())?;
    Ok(pw.expose_secret().to_owned())
}

#[tauri::command]
fn generate_passphrase_cmd(words: usize) -> Result<String, String> {
    let phrase = generate_passphrase(words, "-").map_err(|e| e.to_string())?;
    Ok(phrase.expose_secret().to_owned())
}

#[tauri::command]
fn analyze_health_cmd(state: State<'_, AppState>) -> Result<HealthReport, String> {
    with_vault_mut(&state, |u| Ok(analyze_health(&u.vault)))
}

#[tauri::command]
fn get_app_config(state: State<'_, AppState>) -> Result<AppConfigDto, String> {
    let guard = state
        .config
        .lock()
        .map_err(|_| "falha ao acessar configuração".to_owned())?;
    Ok(AppConfigDto::from(&*guard))
}

#[tauri::command]
fn set_ui_config(state: State<'_, AppState>, ui: UiConfig) -> Result<SetUiConfigResult, String> {
    let mut guard = state
        .config
        .lock()
        .map_err(|_| "falha ao acessar configuração".to_owned())?;
    guard.ui = ui;
    if guard.managed_by_nix {
        return Ok(SetUiConfigResult { persisted: false });
    }
    guard.save().map_err(|e| e.to_string())?;
    Ok(SetUiConfigResult { persisted: true })
}

fn validate_public_domain(raw: &str) -> Option<String> {
    let domain = raw.trim().trim_end_matches('.').to_ascii_lowercase();
    if domain.is_empty() || domain.len() > 253 || !domain.contains('.') {
        return None;
    }
    if domain == "localhost"
        || domain.ends_with(".localhost")
        || domain.ends_with(".local")
        || domain.ends_with(".internal")
    {
        return None;
    }
    if domain.parse::<IpAddr>().is_ok() {
        return None;
    }
    let valid_chars = domain
        .bytes()
        .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-' || b == b'.');
    if !valid_chars || domain.starts_with('.') || domain.contains("..") {
        return None;
    }
    Some(domain)
}

fn favicon_cache_dir() -> Option<PathBuf> {
    if let Ok(xdg) = std::env::var("XDG_CACHE_HOME")
        && !xdg.trim().is_empty()
    {
        return Some(PathBuf::from(xdg).join("betterkeepass/favicons"));
    }
    std::env::var("HOME")
        .ok()
        .map(|home| PathBuf::from(home).join(".cache/betterkeepass/favicons"))
}

fn detect_icon_mime(bytes: &[u8]) -> &'static str {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        "image/png"
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        "image/gif"
    } else if bytes.starts_with(b"<svg") || bytes.starts_with(b"<?xml") {
        "image/svg+xml"
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        "image/webp"
    } else {
        "image/x-icon"
    }
}

fn fetch_icon_bytes(agent: &ureq::Agent, url: &str) -> Option<Vec<u8>> {
    let response = agent.get(url).call().ok()?;
    let mut reader = response.into_body().into_reader().take(MAX_FAVICON_BYTES);
    let mut buf = Vec::new();
    reader.read_to_end(&mut buf).ok()?;
    if buf.is_empty() || buf.len() as u64 >= MAX_FAVICON_BYTES {
        return None;
    }
    Some(buf)
}

#[tauri::command]
fn get_favicon(state: State<'_, AppState>, domain: String) -> Result<Option<String>, String> {
    let enabled = state
        .config
        .lock()
        .map_err(|_| "falha ao acessar configuração".to_owned())?
        .ui
        .fetch_favicons;
    if !enabled {
        return Ok(None);
    }

    let Some(clean_domain) = validate_public_domain(&domain) else {
        return Ok(None);
    };

    let cache_path = favicon_cache_dir().map(|dir| dir.join(format!("{clean_domain}.b64")));
    if let Some(ref path) = cache_path
        && path.exists()
        && let Ok(cached) = fs::read_to_string(path)
        && cached.starts_with("data:image/")
    {
        return Ok(Some(cached));
    }

    let agent_config = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(3)))
        .build();
    let agent: ureq::Agent = agent_config.into();

    let primary = format!("https://{clean_domain}/favicon.ico");
    let fallback = format!("https://{clean_domain}/apple-touch-icon.png");
    let Some(bytes) =
        fetch_icon_bytes(&agent, &primary).or_else(|| fetch_icon_bytes(&agent, &fallback))
    else {
        return Ok(None);
    };

    let mime = detect_icon_mime(&bytes);
    let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
    let data_url = format!("data:{mime};base64,{encoded}");

    if let Some(path) = cache_path {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let _ = fs::write(path, &data_url);
    }

    Ok(Some(data_url))
}

#[tauri::command]
fn list_paired_browsers(state: State<'_, AppState>) -> Vec<PairedBrowser> {
    state
        .paired_browsers
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default()
}

#[tauri::command]
fn revoke_paired_browser(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let mut guard = state
        .paired_browsers
        .lock()
        .map_err(|_| "falha ao acessar lista de navegadores".to_owned())?;
    guard.retain(|b| b.id.to_string() != id);
    Ok(())
}

/// Ponto de entrada da aplicação Tauri.
pub fn run() {
    let config = AppConfig::load().unwrap_or_default();
    let lock_secs = config.security.lock_after_seconds;
    let session = Arc::new(Mutex::new(None::<UnlockedVault>));

    if lock_secs > 0 {
        let watcher_session = Arc::clone(&session);
        std::thread::spawn(move || loop {
            std::thread::sleep(Duration::from_secs(5));
            if let Ok(mut guard) = watcher_session.lock()
                && let Some(unlocked) = guard.as_ref()
                && unlocked.last_activity.elapsed() >= Duration::from_secs(lock_secs)
            {
                *guard = None;
            }
        });
    }

    let state = AppState {
        session,
        config: Mutex::new(config),
        clipboard: ClipboardManager::new(),
        paired_browsers: Mutex::new(Vec::new()),
    };

    tauri::Builder::default()
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            open_vault,
            create_vault,
            lock_vault,
            search_entries,
            get_group_tree,
            get_entry_details,
            reveal_entry_password,
            copy_entry_field,
            get_entry_totp,
            get_entry_history,
            add_entry,
            update_entry,
            restore_history,
            delete_entry,
            generate_password_cmd,
            generate_passphrase_cmd,
            analyze_health_cmd,
            get_app_config,
            set_ui_config,
            get_favicon,
            list_paired_browsers,
            revoke_paired_browser,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao executar aplicação BetterKeePass");
}
