use std::{
    fs,
    io::Read,
    net::IpAddr,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use argon2::{Config as Argon2Config, Variant as Argon2Variant, Version as Argon2Version};
use base64::Engine as _;
use bkp_core::{
    AppConfig, BrowserIntegrationConfig, ClipboardConfig, CustomFieldInput, EntryDetails,
    EntryPatch, EntrySummary, GroupNode, HealthReport, HistoryEntrySummary, NewEntry, OtpCode,
    PasswordOptions, SecretServiceConfig, SecurityConfig, SshAgentConfig, UiConfig, Vault,
    analyze_health, generate_passphrase, generate_password,
};
use bkp_platform::ClipboardManager;
use bkp_protocol::PairedBrowser;
use chacha20poly1305::{
    ChaCha20Poly1305, KeyInit, Nonce,
    aead::{Aead, Payload},
};
use secrecy::{ExposeSecret, SecretString};
use serde::{Deserialize, Serialize};
use tauri::{Emitter, State};
use uuid::Uuid;
use zeroize::Zeroizing;

const MAX_FAVICON_BYTES: u64 = 262_144;
/// Tempo até tentar de novo um domínio sem favicon.
const FAVICON_MISS_TTL: Duration = Duration::from_secs(60 * 60 * 24);

struct UnlockedVault {
    vault: Vault,
    path: PathBuf,
    master_password: Option<SecretString>,
    keyfile: Option<PathBuf>,
    last_activity: Instant,
    keep_open: bool,
}

struct AppState {
    session: Arc<Mutex<Option<UnlockedVault>>>,
    config: Arc<Mutex<AppConfig>>,
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
    browser_integration: BrowserIntegrationConfig,
    secret_service: SecretServiceConfig,
    ssh_agent: SshAgentConfig,
    managed_by_nix: bool,
}

impl From<&AppConfig> for AppConfigDto {
    fn from(value: &AppConfig) -> Self {
        Self {
            security: value.security.clone(),
            clipboard: value.clipboard.clone(),
            ui: value.ui.clone(),
            browser_integration: value.browser_integration.clone(),
            secret_service: value.secret_service.clone(),
            ssh_agent: value.ssh_agent.clone(),
            managed_by_nix: value.managed_by_nix,
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppConfigPatch {
    security: Option<SecurityConfig>,
    clipboard: Option<ClipboardConfig>,
    ui: Option<UiConfig>,
    browser_integration: Option<BrowserIntegrationConfig>,
    secret_service: Option<SecretServiceConfig>,
    ssh_agent: Option<SshAgentConfig>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SetUiConfigResult {
    persisted: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CustomFieldPayload {
    name: String,
    value: String,
    protected: bool,
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
    #[serde(default)]
    custom_fields: Vec<CustomFieldPayload>,
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
    custom_fields: Option<Vec<CustomFieldPayload>>,
    remove_custom_fields: Option<Vec<String>>,
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

const MAX_PIN_ATTEMPTS: u32 = 5;
const PIN_KDF_AAD: &[u8] = b"betterkeepass-pin-kdf-v2";
const PIN_SESSION_AAD: &[u8] = b"betterkeepass-pin-session-v2";

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedSessionPayload {
    path: String,
    password: String,
    keyfile: Option<String>,
    keep_open: bool,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PinEncryptedSession {
    v: u8,
    vault_path: String,
    salt: String,
    nonce: String,
    ciphertext: String,
    failed_attempts: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PinSessionStatus {
    has_pin: bool,
    vault_path: Option<String>,
    failed_attempts: u32,
    max_attempts: u32,
}

fn session_data_dir() -> Option<PathBuf> {
    if let Ok(xdg) = std::env::var("XDG_DATA_HOME")
        && !xdg.trim().is_empty()
    {
        return Some(PathBuf::from(xdg).join("betterkeepass"));
    }
    std::env::var("HOME")
        .ok()
        .map(|home| PathBuf::from(home).join(".local/share/betterkeepass"))
}

fn session_file_path() -> Option<PathBuf> {
    session_data_dir().map(|dir| dir.join("session.dat"))
}

fn write_private_file(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(parent, fs::Permissions::from_mode(0o700));
        }
    }
    #[cfg(unix)]
    {
        use std::{io::Write, os::unix::fs::OpenOptionsExt};
        let mut file = fs::OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .mode(0o600)
            .open(path)
            .map_err(|e| e.to_string())?;
        file.write_all(bytes).map_err(|e| e.to_string())?;
    }
    #[cfg(not(unix))]
    {
        fs::write(path, bytes).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn derive_pin_key(pin: &str, salt: &[u8; 16]) -> Result<Zeroizing<[u8; 32]>, String> {
    let config = Argon2Config {
        variant: Argon2Variant::Argon2id,
        version: Argon2Version::Version13,
        mem_cost: 65_536,
        time_cost: 3,
        lanes: 4,
        secret: &[],
        ad: PIN_KDF_AAD,
        hash_length: 32,
        ..Argon2Config::default()
    };
    let raw = Zeroizing::new(
        argon2::hash_raw(pin.as_bytes(), salt, &config).map_err(|e| e.to_string())?,
    );
    let mut key = Zeroizing::new([0u8; 32]);
    if raw.len() != 32 {
        return Err("falha ao derivar chave do PIN".to_owned());
    }
    key.copy_from_slice(&raw);
    Ok(key)
}

fn encrypt_pin_session(payload: &PersistedSessionPayload, pin: &str) -> Result<PinEncryptedSession, String> {
    let mut salt = [0u8; 16];
    getrandom::fill(&mut salt).map_err(|e| e.to_string())?;
    let mut nonce_bytes = [0u8; 12];
    getrandom::fill(&mut nonce_bytes).map_err(|e| e.to_string())?;

    let key = derive_pin_key(pin, &salt)?;
    let cipher = ChaCha20Poly1305::new_from_slice(&*key).map_err(|e| e.to_string())?;
    let plaintext = Zeroizing::new(serde_json::to_vec(payload).map_err(|e| e.to_string())?);
    let ciphertext = cipher
        .encrypt(
            Nonce::from_slice(&nonce_bytes),
            Payload {
                msg: plaintext.as_slice(),
                aad: PIN_SESSION_AAD,
            },
        )
        .map_err(|_| "falha ao criptografar sessão com PIN".to_owned())?;

    Ok(PinEncryptedSession {
        v: 2,
        vault_path: payload.path.clone(),
        salt: base64::engine::general_purpose::STANDARD.encode(salt),
        nonce: base64::engine::general_purpose::STANDARD.encode(nonce_bytes),
        ciphertext: base64::engine::general_purpose::STANDARD.encode(ciphertext),
        failed_attempts: 0,
    })
}

fn decrypt_pin_session(
    stored: &PinEncryptedSession,
    pin: &str,
) -> Result<PersistedSessionPayload, String> {
    if stored.v != 2 {
        return Err("formato de sessão inválido".to_owned());
    }
    let salt_vec = base64::engine::general_purpose::STANDARD
        .decode(&stored.salt)
        .map_err(|_| "salt inválido".to_owned())?;
    let salt: [u8; 16] = salt_vec
        .try_into()
        .map_err(|_| "tamanho de salt inválido".to_owned())?;
    let nonce_vec = base64::engine::general_purpose::STANDARD
        .decode(&stored.nonce)
        .map_err(|_| "nonce inválido".to_owned())?;
    let nonce_bytes: [u8; 12] = nonce_vec
        .try_into()
        .map_err(|_| "tamanho de nonce inválido".to_owned())?;
    let ciphertext = base64::engine::general_purpose::STANDARD
        .decode(&stored.ciphertext)
        .map_err(|_| "dados cifrados inválidos".to_owned())?;

    let key = derive_pin_key(pin, &salt)?;
    let cipher = ChaCha20Poly1305::new_from_slice(&*key).map_err(|e| e.to_string())?;
    let plaintext = Zeroizing::new(
        cipher
            .decrypt(
                Nonce::from_slice(&nonce_bytes),
                Payload {
                    msg: ciphertext.as_slice(),
                    aad: PIN_SESSION_AAD,
                },
            )
            .map_err(|_| "PIN incorreto".to_owned())?,
    );
    serde_json::from_slice(&plaintext).map_err(|e| e.to_string())
}

fn read_pin_session_file() -> Option<PinEncryptedSession> {
    let path = session_file_path()?;
    let bytes = fs::read(&path).ok()?;
    let parsed: PinEncryptedSession = serde_json::from_slice(&bytes).ok()?;
    (parsed.v == 2).then_some(parsed)
}

fn write_pin_session_file(session: &PinEncryptedSession) -> Result<(), String> {
    let Some(path) = session_file_path() else {
        return Err("não foi possível localizar diretório de sessão".to_owned());
    };
    let serialized = serde_json::to_vec(session).map_err(|e| e.to_string())?;
    write_private_file(&path, &serialized)
}

fn clear_persisted_session() {
    if let Some(dir) = session_data_dir() {
        let _ = fs::remove_file(dir.join("session.dat"));
        let _ = fs::remove_file(dir.join("session.key"));
    }
}

#[tauri::command]
async fn open_vault(
    state: State<'_, AppState>,
    path: String,
    password: String,
    keyfile: Option<String>,
    keep_open: Option<bool>,
) -> Result<(), String> {
    let pb = PathBuf::from(&path);
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

    if let Some(existing) = read_pin_session_file()
        && existing.vault_path != path
    {
        clear_persisted_session();
    }

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
        keep_open: keep_open.unwrap_or(false),
    });
    Ok(())
}

#[tauri::command]
async fn create_vault(
    state: State<'_, AppState>,
    path: String,
    password: String,
    name: Option<String>,
    keep_open: Option<bool>,
) -> Result<(), String> {
    let pb = PathBuf::from(&path);
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

    clear_persisted_session();

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
        keep_open: keep_open.unwrap_or(false),
    });
    Ok(())
}

#[tauri::command]
fn get_pin_session_status() -> PinSessionStatus {
    match read_pin_session_file() {
        Some(stored) if stored.failed_attempts < MAX_PIN_ATTEMPTS => PinSessionStatus {
            has_pin: true,
            vault_path: Some(stored.vault_path),
            failed_attempts: stored.failed_attempts,
            max_attempts: MAX_PIN_ATTEMPTS,
        },
        _ => PinSessionStatus {
            has_pin: false,
            vault_path: None,
            failed_attempts: 0,
            max_attempts: MAX_PIN_ATTEMPTS,
        },
    }
}

#[tauri::command]
async fn set_session_pin(state: State<'_, AppState>, pin: String) -> Result<(), String> {
    if pin.trim().len() < 4 {
        return Err("o PIN deve ter pelo menos 4 caracteres".to_owned());
    }

    let payload = {
        let guard = state
            .session
            .lock()
            .map_err(|_| "falha ao acessar sessão do cofre".to_owned())?;
        let Some(unlocked) = guard.as_ref() else {
            return Err("cofre bloqueado".to_owned());
        };
        PersistedSessionPayload {
            path: unlocked.path.to_string_lossy().into_owned(),
            password: unlocked
                .master_password
                .as_ref()
                .map(|s| s.expose_secret().to_owned())
                .unwrap_or_default(),
            keyfile: unlocked
                .keyfile
                .as_ref()
                .map(|p| p.to_string_lossy().into_owned()),
            keep_open: unlocked.keep_open,
        }
    };

    let encrypted = tauri::async_runtime::spawn_blocking(move || encrypt_pin_session(&payload, &pin))
        .await
        .map_err(|e| e.to_string())??;
    write_pin_session_file(&encrypted)?;

    if let Ok(mut cfg) = state.config.lock() {
        cfg.security.remember_session = true;
        if !cfg.managed_by_nix {
            let _ = cfg.save();
        }
    }

    Ok(())
}

#[tauri::command]
async fn unlock_with_pin(state: State<'_, AppState>, pin: String) -> Result<String, String> {
    let mut stored = read_pin_session_file()
        .ok_or_else(|| "nenhuma sessão protegida por PIN encontrada".to_owned())?;

    if stored.failed_attempts >= MAX_PIN_ATTEMPTS {
        clear_persisted_session();
        return Err("limite de tentativas excedido; use a senha mestra".to_owned());
    }

    let decrypted = {
        let stored_clone = PinEncryptedSession {
            v: stored.v,
            vault_path: stored.vault_path.clone(),
            salt: stored.salt.clone(),
            nonce: stored.nonce.clone(),
            ciphertext: stored.ciphertext.clone(),
            failed_attempts: stored.failed_attempts,
        };
        let pin_clone = pin.clone();
        tauri::async_runtime::spawn_blocking(move || decrypt_pin_session(&stored_clone, &pin_clone))
            .await
            .map_err(|e| e.to_string())?
    };

    let payload = match decrypted {
        Ok(p) => p,
        Err(_) => {
            stored.failed_attempts += 1;
            if stored.failed_attempts >= MAX_PIN_ATTEMPTS {
                clear_persisted_session();
                return Err("PIN incorreto. Limite de tentativas atingido; use a senha mestra.".to_owned());
            }
            let _ = write_pin_session_file(&stored);
            let remaining = MAX_PIN_ATTEMPTS - stored.failed_attempts;
            return Err(format!("PIN incorreto. Restam {remaining} tentativa(s)."));
        }
    };

    if stored.failed_attempts > 0 {
        stored.failed_attempts = 0;
        let _ = write_pin_session_file(&stored);
    }

    let pb = PathBuf::from(&payload.path);
    let kf = payload.keyfile.as_deref().map(PathBuf::from);
    let secret = (!payload.password.is_empty()).then(|| SecretString::from(payload.password));
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
        keep_open: payload.keep_open,
    });
    Ok(payload.path)
}

#[tauri::command]
fn clear_session_pin(state: State<'_, AppState>) -> Result<(), String> {
    clear_persisted_session();
    if let Ok(mut cfg) = state.config.lock() {
        cfg.security.remember_session = false;
        if !cfg.managed_by_nix {
            let _ = cfg.save();
        }
    }
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
fn reveal_custom_field(
    state: State<'_, AppState>,
    uuid: String,
    name: String,
) -> Result<String, String> {
    let parsed = Uuid::parse_str(&uuid).map_err(|e| e.to_string())?;
    with_vault_mut(&state, |u| {
        let secret = u
            .vault
            .entry_field_secret(parsed, &name)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "campo não encontrado".to_owned())?;
        Ok(secret.expose_secret().to_owned())
    })
}

#[tauri::command(async)]
fn copy_custom_field(
    state: State<'_, AppState>,
    uuid: String,
    name: String,
) -> Result<(), String> {
    let parsed = Uuid::parse_str(&uuid).map_err(|e| e.to_string())?;
    let clear_secs = state
        .config
        .lock()
        .map_err(|_| "falha ao ler configuração".to_owned())?
        .clipboard
        .clear_after_seconds;
    let secret = with_vault_mut(&state, |u| {
        u.vault
            .entry_field_secret(parsed, &name)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "campo não encontrado".to_owned())
    })?;
    state
        .clipboard
        .copy_secret(&secret, clear_secs)
        .map_err(|e| e.to_string())
}

#[tauri::command(async)]
fn add_entry_attachment(
    state: State<'_, AppState>,
    uuid: String,
    name: String,
    data_base64: String,
) -> Result<(), String> {
    let parsed = Uuid::parse_str(&uuid).map_err(|e| e.to_string())?;
    let raw_b64 = data_base64
        .split_once(";base64,")
        .map_or(data_base64.as_str(), |(_, rest)| rest)
        .trim();
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(raw_b64)
        .map_err(|e| e.to_string())?;
    let clean_name = name.trim().to_owned();
    if clean_name.is_empty() {
        return Err("nome do anexo inválido".to_owned());
    }
    with_vault_mut(&state, |u| {
        u.vault
            .add_attachment(parsed, &clean_name, bytes)
            .map_err(|e| e.to_string())?;
        u.vault
            .save(&u.path, u.master_password.clone(), u.keyfile.as_deref())
            .map_err(|e| e.to_string())
    })
}

#[tauri::command(async)]
fn save_entry_attachment(
    state: State<'_, AppState>,
    uuid: String,
    name: String,
    dest_path: String,
) -> Result<(), String> {
    let parsed = Uuid::parse_str(&uuid).map_err(|e| e.to_string())?;
    let bytes = with_vault_mut(&state, |u| {
        u.vault
            .get_attachment(parsed, &name)
            .map_err(|e| e.to_string())
    })?;
    fs::write(dest_path, bytes).map_err(|e| e.to_string())
}

#[tauri::command(async)]
fn remove_entry_attachment(
    state: State<'_, AppState>,
    uuid: String,
    name: String,
) -> Result<(), String> {
    let parsed = Uuid::parse_str(&uuid).map_err(|e| e.to_string())?;
    with_vault_mut(&state, |u| {
        u.vault
            .remove_attachment(parsed, &name)
            .map_err(|e| e.to_string())?;
        u.vault
            .save(&u.path, u.master_password.clone(), u.keyfile.as_deref())
            .map_err(|e| e.to_string())
    })
}

#[tauri::command(async)]
fn copy_entry_field(state: State<'_, AppState>, uuid: String, field: String) -> Result<(), String> {
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
    with_vault_mut(&state, |u| {
        u.vault.totp_now(parsed).map_err(|e| e.to_string())
    })
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
                    custom_fields: payload
                        .custom_fields
                        .into_iter()
                        .filter(|f| !f.name.trim().is_empty())
                        .map(|f| CustomFieldInput {
                            name: f.name.trim().to_owned(),
                            value: SecretString::from(f.value),
                            protected: f.protected,
                        })
                        .collect(),
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
                    custom_fields: patch
                        .custom_fields
                        .unwrap_or_default()
                        .into_iter()
                        .filter(|f| !f.name.trim().is_empty())
                        .map(|f| CustomFieldInput {
                            name: f.name.trim().to_owned(),
                            value: SecretString::from(f.value),
                            protected: f.protected,
                        })
                        .collect(),
                    remove_custom_fields: patch.remove_custom_fields.unwrap_or_default(),
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
fn delete_entry(state: State<'_, AppState>, uuid: String, permanent: bool) -> Result<(), String> {
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
fn move_entry(state: State<'_, AppState>, uuid: String, group_path: String) -> Result<(), String> {
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

#[tauri::command(async)]
fn set_group_icon(
    state: State<'_, AppState>,
    group_path: String,
    icon_id: usize,
) -> Result<(), String> {
    with_vault_mut(&state, |u| {
        u.vault
            .set_group_icon(&group_path, icon_id)
            .map_err(|e| e.to_string())?;
        u.vault
            .save(&u.path, u.master_password.clone(), u.keyfile.as_deref())
            .map_err(|e| e.to_string())
    })
}

fn extract_domain_from_url(raw_url: &str) -> Option<String> {
    let trimmed = raw_url.trim();
    if trimmed.is_empty() {
        return None;
    }
    let without_scheme = trimmed.split_once("://").map_or(trimmed, |(_, rest)| rest);
    let authority = without_scheme.split(['/', '?', '#']).next()?;
    let host_port = authority.rsplit('@').next()?;
    let host = host_port.split(':').next()?;
    validate_public_domain(host)
}

#[tauri::command]
async fn fetch_favicon_from_url(url: String) -> Result<String, String> {
    let clean_domain = extract_domain_from_url(&url)
        .ok_or_else(|| "URL inválida ou domínio não público".to_owned())?;

    let (bytes, mime) =
        tauri::async_runtime::spawn_blocking(move || fetch_favicon_for_domain(&clean_domain))
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

#[tauri::command]
fn set_app_config(
    state: State<'_, AppState>,
    patch: AppConfigPatch,
) -> Result<SetUiConfigResult, String> {
    let remember_disabled = {
        let mut guard = state
            .config
            .lock()
            .map_err(|_| "falha ao acessar configuração".to_owned())?;
        if guard.managed_by_nix {
            return Ok(SetUiConfigResult { persisted: false });
        }
        let prev_remember = guard.security.remember_session;
        if let Some(security) = patch.security {
            guard.security = security;
        }
        if let Some(clipboard) = patch.clipboard {
            guard.clipboard = clipboard;
        }
        if let Some(ui) = patch.ui {
            guard.ui = ui;
        }
        if let Some(browser_integration) = patch.browser_integration {
            guard.browser_integration = browser_integration;
        }
        if let Some(secret_service) = patch.secret_service {
            guard.secret_service = secret_service;
        }
        if let Some(ssh_agent) = patch.ssh_agent {
            guard.ssh_agent = ssh_agent;
        }
        guard.save().map_err(|e| e.to_string())?;
        prev_remember && !guard.security.remember_session
    };

    if remember_disabled {
        clear_persisted_session();
    }

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
        if trimmed.starts_with("<svg") || (trimmed.starts_with("<?xml") && trimmed.contains("<svg"))
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
        .header(
            "Accept",
            "image/png,image/svg+xml,image/x-icon,image/*;q=0.8",
        )
        .call()
        .ok()?;
    if let Some(ct) = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
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
async fn get_favicon(state: State<'_, AppState>, domain: String) -> Result<Option<String>, String> {
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
    let loaded_config = AppConfig::load().unwrap_or_default();
    let config = Arc::new(Mutex::new(loaded_config));
    let session = Arc::new(Mutex::new(None::<UnlockedVault>));

    let watcher_session = Arc::clone(&session);
    let watcher_config = Arc::clone(&config);

    let state = AppState {
        session,
        config,
        clipboard: ClipboardManager::new(),
        paired_browsers: Mutex::new(Vec::new()),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(state)
        .setup(move |app| {
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                loop {
                    std::thread::sleep(Duration::from_secs(1));
                    let lock_secs = watcher_config
                        .lock()
                        .map(|c| c.security.lock_after_seconds)
                        .unwrap_or(300);
                    if lock_secs == 0 {
                        continue;
                    }
                    let locked_now = if let Ok(mut guard) = watcher_session.lock()
                        && let Some(unlocked) = guard.as_ref()
                        && !unlocked.keep_open
                        && unlocked.last_activity.elapsed() >= Duration::from_secs(lock_secs)
                    {
                        *guard = None;
                        true
                    } else {
                        false
                    };
                    if locked_now {
                        let _ = app_handle.emit("vault-locked", ());
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_vault,
            create_vault,
            get_pin_session_status,
            set_session_pin,
            unlock_with_pin,
            clear_session_pin,
            lock_vault,
            search_entries,
            get_group_tree,
            get_entry_details,
            reveal_entry_password,
            reveal_custom_field,
            copy_custom_field,
            add_entry_attachment,
            save_entry_attachment,
            remove_entry_attachment,
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
            set_group_icon,
            fetch_favicon_from_url,
            generate_password_cmd,
            generate_passphrase_cmd,
            analyze_health_cmd,
            get_app_config,
            set_ui_config,
            set_app_config,
            get_favicon,
            list_paired_browsers,
            revoke_paired_browser,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao executar aplicação BetterKeePass");
}
