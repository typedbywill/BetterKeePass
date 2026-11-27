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
/// Tempo até tentar de novo um domínio sem favicon.
const FAVICON_MISS_TTL: Duration = Duration::from_secs(60 * 60 * 24);

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
    icon_id: Option<usize>,
    custom_icon_base64: Option<String>,
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
    icon_id: Option<usize>,
    custom_icon_base64: Option<String>,
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
async fn open_vault(
    state: State<'_, AppState>,
    path: String,
    password: String,
    keyfile: Option<String>,
) -> Result<(), String> {
    let pb = PathBuf::from(path);
    let kf = keyfile.map(PathBuf::from);
    let secret = (!password.is_empty()).then(|| SecretString::from(password));
    let vault = {
        let pb_clone = pb.clone();
        let kf_clone = kf.clone();
        let secret_clone = secret.clone();
        tauri::async_runtime::spawn_blocking(move || {
            Vault::open(&pb_clone, secret_clone, kf_clone.as_deref())
        })
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?
    };
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
async fn create_vault(
    state: State<'_, AppState>,
    path: String,
    password: String,
    name: Option<String>,
) -> Result<(), String> {
    let pb = PathBuf::from(path);
    let secret = Some(SecretString::from(password));
    let vault = {
        let pb_clone = pb.clone();
        let secret_clone = secret.clone();
        tauri::async_runtime::spawn_blocking(move || -> Result<Vault, String> {
            let vault = Vault::create(name.as_deref());
            vault
                .save(&pb_clone, secret_clone, None)
                .map_err(|e| e.to_string())?;
            Ok(vault)
        })
        .await
        .map_err(|e| e.to_string())??
    };
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

#[tauri::command(async)]
fn lock_vault(state: State<'_, AppState>) -> Result<(), String> {
    let mut guard = state
        .session
        .lock()
        .map_err(|_| "falha ao bloquear cofre".to_owned())?;
    *guard = None;
    Ok(())
}

#[tauri::command(async)]
fn search_entries(state: State<'_, AppState>, query: String) -> Result<Vec<EntrySummary>, String> {
    with_vault_mut(&state, |u| Ok(u.vault.search(&query)))
}

#[tauri::command(async)]
fn get_group_tree(state: State<'_, AppState>) -> Result<GroupNode, String> {
    with_vault_mut(&state, |u| Ok(u.vault.group_tree()))
}

#[tauri::command(async)]
fn get_entry_details(state: State<'_, AppState>, uuid: String) -> Result<EntryDetailsDto, String> {
    let parsed = Uuid::parse_str(&uuid).map_err(|e| e.to_string())?;
    with_vault_mut(&state, |u| {
        u.vault
            .entry_details(parsed, false)
            .map(EntryDetailsDto::from)
            .map_err(|e| e.to_string())
    })
}

#[tauri::command(async)]
fn reveal_entry_password(state: State<'_, AppState>, uuid: String) -> Result<String, String> {
    let parsed = Uuid::parse_str(&uuid).map_err(|e| e.to_string())?;
    with_vault_mut(&state, |u| {
        let secret = u.vault.entry_secret(parsed).map_err(|e| e.to_string())?;
        Ok(secret.expose_secret().to_owned())
    })
}

#[tauri::command(async)]
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

#[tauri::command(async)]
fn get_entry_totp(state: State<'_, AppState>, uuid: String) -> Result<OtpCode, String> {
    let parsed = Uuid::parse_str(&uuid).map_err(|e| e.to_string())?;
    with_vault_mut(&state, |u| u.vault.totp_now(parsed).map_err(|e| e.to_string()))
}

#[tauri::command(async)]
fn get_entry_history(
    state: State<'_, AppState>,
    uuid: String,
) -> Result<Vec<HistoryEntrySummary>, String> {
    let parsed = Uuid::parse_str(&uuid).map_err(|e| e.to_string())?;
    with_vault_mut(&state, |u| {
        u.vault.entry_history(parsed).map_err(|e| e.to_string())
    })
}

fn decode_custom_icon_b64(data_base64: &str) -> Result<Vec<u8>, String> {
    let raw_b64 = data_base64
        .split_once(";base64,")
        .map_or(data_base64, |(_, rest)| rest)
        .trim();
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(raw_b64)
        .map_err(|e| e.to_string())?;
    if bytes.is_empty() || bytes.len() as u64 > MAX_FAVICON_BYTES * 2 {
        return Err("imagem inválida ou muito grande".to_owned());
    }
    if detect_icon_mime(&bytes).is_none() {
        return Err("formato de imagem não suportado".to_owned());
    }
    Ok(bytes)
}

#[tauri::command(async)]
fn add_entry(state: State<'_, AppState>, payload: NewEntryPayload) -> Result<String, String> {
    let custom_icon_bytes = payload
        .custom_icon_base64
        .as_deref()
        .map(decode_custom_icon_b64)
        .transpose()?;
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
        if let Some(bytes) = custom_icon_bytes {
            u.vault
                .set_entry_custom_icon(uuid, bytes)
                .map_err(|e| e.to_string())?;
        } else if let Some(icon_id) = payload.icon_id {
            u.vault
                .set_entry_builtin_icon(uuid, icon_id)
                .map_err(|e| e.to_string())?;
        }
        u.vault
            .save(&u.path, u.master_password.clone(), u.keyfile.as_deref())
            .map_err(|e| e.to_string())?;
        Ok(uuid.to_string())
    })
}

#[tauri::command(async)]
fn update_entry(
    state: State<'_, AppState>,
    uuid: String,
    patch: EntryPatchPayload,
) -> Result<(), String> {
    let parsed = Uuid::parse_str(&uuid).map_err(|e| e.to_string())?;
    let custom_icon_bytes = patch
        .custom_icon_base64
        .as_deref()
        .map(decode_custom_icon_b64)
        .transpose()?;
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
        if let Some(bytes) = custom_icon_bytes {
            u.vault
                .set_entry_custom_icon(parsed, bytes)
                .map_err(|e| e.to_string())?;
        } else if let Some(icon_id) = patch.icon_id {
            u.vault
                .set_entry_builtin_icon(parsed, icon_id)
                .map_err(|e| e.to_string())?;
        }
        u.vault
            .save(&u.path, u.master_password.clone(), u.keyfile.as_deref())
            .map_err(|e| e.to_string())
    })
}

#[tauri::command(async)]
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

#[tauri::command(async)]
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

#[tauri::command(async)]
fn move_entry(
    state: State<'_, AppState>,
    uuid: String,
    group_path: String,
) -> Result<(), String> {
    let parsed = Uuid::parse_str(&uuid).map_err(|e| e.to_string())?;
    with_vault_mut(&state, |u| {
        u.vault
            .move_entry(parsed, Some(&group_path))
            .map_err(|e| e.to_string())?;
        u.vault
            .save(&u.path, u.master_password.clone(), u.keyfile.as_deref())
            .map_err(|e| e.to_string())
    })
}

#[tauri::command(async)]
fn get_custom_icon(state: State<'_, AppState>, uuid: String) -> Result<Option<String>, String> {
    let parsed = Uuid::parse_str(&uuid).map_err(|e| e.to_string())?;
    with_vault_mut(&state, |u| {
        let Some(bytes) = u.vault.custom_icon_data(parsed) else {
            return Ok(None);
        };
        let Some(mime) = detect_icon_mime(&bytes) else {
            return Ok(None);
        };
        let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
        Ok(Some(format!("data:{mime};base64,{encoded}")))
    })
}

#[tauri::command(async)]
fn create_group(state: State<'_, AppState>, group_path: String) -> Result<String, String> {
    with_vault_mut(&state, |u| {
        let uuid = u
            .vault
            .create_group(&group_path)
            .map_err(|e| e.to_string())?;
        u.vault
            .save(&u.path, u.master_password.clone(), u.keyfile.as_deref())
            .map_err(|e| e.to_string())?;
        Ok(uuid.to_string())
    })
}

fn extract_domain_from_url(raw_url: &str) -> Option<String> {
    let trimmed = raw_url.trim();
    if trimmed.is_empty() {
        return None;
    }
    let without_scheme = trimmed
        .split_once("://")
        .map_or(trimmed, |(_, rest)| rest);
    let authority = without_scheme.split(['/', '?', '#']).next()?;
    let host_port = authority.rsplit('@').next()?;
    let host = host_port.split(':').next()?;
    validate_public_domain(host)
}

#[tauri::command]
async fn fetch_favicon_from_url(url: String) -> Result<String, String> {
    let clean_domain = extract_domain_from_url(&url)
        .ok_or_else(|| "URL inválida ou domínio não público".to_owned())?;

    let (bytes, mime) = tauri::async_runtime::spawn_blocking(move || {
        fetch_favicon_for_domain(&clean_domain)
    })
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "não foi possível baixar o ícone desta URL".to_owned())?;

    let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{mime};base64,{encoded}"))
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

#[tauri::command(async)]
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

fn detect_icon_mime(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some("image/gif")
    } else if bytes.starts_with(b"\xFF\xD8\xFF") {
        Some("image/jpeg")
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        Some("image/webp")
    } else if bytes.starts_with(b"\x00\x00\x01\x00") || bytes.starts_with(b"\x00\x00\x02\x00") {
        Some("image/x-icon")
    } else {
        let trimmed = std::str::from_utf8(bytes).ok()?.trim_start();
        if trimmed.starts_with("<svg")
            || (trimmed.starts_with("<?xml") && trimmed.contains("<svg"))
        {
            Some("image/svg+xml")
        } else {
            None
        }
    }
}

fn fetch_icon_bytes(agent: &ureq::Agent, url: &str) -> Option<(Vec<u8>, &'static str)> {
    let response = agent
        .get(url)
        .header("User-Agent", "Mozilla/5.0 (compatible; BetterKeePass/0.1)")
        .header("Accept", "image/png,image/svg+xml,image/x-icon,image/*;q=0.8")
        .call()
        .ok()?;
    if let Some(ct) = response.headers().get("content-type").and_then(|v| v.to_str().ok())
        && ct.to_ascii_lowercase().starts_with("text/html")
    {
        return None;
    }
    let mut reader = response.into_body().into_reader().take(MAX_FAVICON_BYTES);
    let mut buf = Vec::new();
    reader.read_to_end(&mut buf).ok()?;
    if buf.is_empty() || buf.len() as u64 >= MAX_FAVICON_BYTES {
        return None;
    }
    let mime = detect_icon_mime(&buf)?;
    Some((buf, mime))
}

fn fetch_favicon_for_domain_with(
    agent: &ureq::Agent,
    clean_domain: &str,
) -> Option<(Vec<u8>, &'static str)> {
    let candidates = [
        format!("https://{clean_domain}/favicon.ico"),
        format!("https://{clean_domain}/apple-touch-icon.png"),
        format!("https://{clean_domain}/favicon.png"),
    ];
    candidates
        .iter()
        .find_map(|url| fetch_icon_bytes(agent, url))
}

fn fetch_favicon_for_domain(clean_domain: &str) -> Option<(Vec<u8>, &'static str)> {
    let agent_config = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(4)))
        .build();
    let agent: ureq::Agent = agent_config.into();
    fetch_favicon_for_domain_with(&agent, clean_domain)
}

#[tauri::command]
async fn get_favicon(
    state: State<'_, AppState>,
    domain: String,
) -> Result<Option<String>, String> {
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

    // Rede e disco em uma thread de bloqueio, para nunca travar a interface.
    tauri::async_runtime::spawn_blocking(move || load_favicon(&clean_domain))
        .await
        .map_err(|e| e.to_string())
}

fn load_favicon(clean_domain: &str) -> Option<String> {
    let cache_path = favicon_cache_dir().map(|dir| dir.join(format!("{clean_domain}.b64")));
    if let Some(ref path) = cache_path
        && path.exists()
        && let Ok(cached) = fs::read_to_string(path)
        && cached.starts_with("data:image/")
        && let Some((_, b64)) = cached.split_once(";base64,")
        && let Ok(decoded) = base64::engine::general_purpose::STANDARD.decode(b64.trim())
        && detect_icon_mime(&decoded).is_some()
    {
        return Some(cached);
    }

    let miss_path = cache_path.as_ref().map(|path| path.with_extension("miss"));
    if let Some(ref path) = miss_path
        && let Ok(modified) = fs::metadata(path).and_then(|m| m.modified())
        && modified.elapsed().is_ok_and(|age| age < FAVICON_MISS_TTL)
    {
        return None;
    }

    let agent_config = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(4)))
        .build();
    let agent: ureq::Agent = agent_config.into();

    let Some((bytes, mime)) = fetch_favicon_for_domain_with(&agent, clean_domain) else {
        if let Some(path) = miss_path {
            if let Some(parent) = path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let _ = fs::write(path, b"");
        }
        return None;
    };

    let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
    let data_url = format!("data:{mime};base64,{encoded}");

    if let Some(path) = cache_path {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let _ = fs::write(path, &data_url);
    }

    Some(data_url)
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
            move_entry,
            get_custom_icon,
            create_group,
            fetch_favicon_from_url,
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
