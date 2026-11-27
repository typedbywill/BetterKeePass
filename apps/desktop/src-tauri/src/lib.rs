use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use bkp_core::{
    AppConfig, EntryDetails, EntrySummary, GroupNode, HealthReport, HistoryEntrySummary, NewEntry,
    OtpCode, PasswordOptions, Vault, analyze_health, generate_passphrase, generate_password,
};
use bkp_platform::ClipboardManager;
use bkp_protocol::PairedBrowser;
use secrecy::{ExposeSecret, SecretString};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

struct UnlockedVault {
    vault: Vault,
    path: PathBuf,
    master_password: Option<SecretString>,
    keyfile: Option<PathBuf>,
    last_activity: Instant,
}

struct AppState {
    session: Arc<Mutex<Option<UnlockedVault>>>,
    config: AppConfig,
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
    let clear_secs = state.config.clipboard.clear_after_seconds;
    let secret = with_vault_mut(&state, |u| match field.as_str() {
        "password" => u.vault.entry_secret(parsed).map_err(|e| e.to_string()),
        "username" => {
            let details = u
                .vault
                .entry_details(parsed, false)
                .map_err(|e| e.to_string())?;
            Ok(SecretString::from(details.summary.username))
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
fn get_app_config(state: State<'_, AppState>) -> AppConfig {
    state.config.clone()
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
        config,
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
            delete_entry,
            generate_password_cmd,
            generate_passphrase_cmd,
            analyze_health_cmd,
            get_app_config,
            list_paired_browsers,
            revoke_paired_browser,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao executar aplicação BetterKeePass");
}
