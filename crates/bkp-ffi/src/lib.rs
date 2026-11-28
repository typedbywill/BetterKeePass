//! Fachada UniFFI sobre `bkp-core` e `bkp-passkey` para clientes nativos (Android/Kotlin).

pub mod dto;
pub mod error;

use std::sync::{Arc, Mutex};

use bkp_core::{
    EntrySummary, Vault, analyze_health, generate_passphrase as core_generate_passphrase,
    generate_password as core_generate_password,
};
use bkp_passkey::{
    GetAssertionRequest, PASSKEY_TAG, create_credential, find_in_vault, get_assertion,
    store_in_vault, update_sign_count_in_vault,
};
use secrecy::{ExposeSecret, SecretString};
use uuid::Uuid;
use zeroize::Zeroizing;

pub use dto::*;
pub use error::BkpError;

uniffi::setup_scaffolding!();

struct VaultSession {
    vault: Vault,
    password: Option<SecretString>,
    keyfile_bytes: Option<Zeroizing<Vec<u8>>>,
}

/// Handle thread-safe para um cofre `.kdbx` aberto em memória.
#[derive(uniffi::Object)]
pub struct VaultHandle {
    session: Mutex<Option<VaultSession>>,
}

#[uniffi::export]
impl VaultHandle {
    /// Abre um cofre `.kdbx` a partir dos bytes crus, senha opcional e arquivo-chave opcional.
    #[uniffi::constructor]
    pub fn open(
        bytes: Vec<u8>,
        password: Option<String>,
        keyfile_bytes: Option<Vec<u8>>,
    ) -> Result<Arc<Self>, BkpError> {
        let secret_pw = password.filter(|p| !p.is_empty()).map(SecretString::from);
        let kf = keyfile_bytes.filter(|b| !b.is_empty()).map(Zeroizing::new);
        let vault =
            Vault::open_from_bytes(&bytes, secret_pw.clone(), kf.as_deref().map(Vec::as_slice))?;
        Ok(Arc::new(Self {
            session: Mutex::new(Some(VaultSession {
                vault,
                password: secret_pw,
                keyfile_bytes: kf,
            })),
        }))
    }

    /// Cria um novo cofre KDBX 4 em memória com as credenciais informadas.
    #[uniffi::constructor]
    pub fn create(
        name: Option<String>,
        password: Option<String>,
        keyfile_bytes: Option<Vec<u8>>,
    ) -> Result<Arc<Self>, BkpError> {
        let secret_pw = password.filter(|p| !p.is_empty()).map(SecretString::from);
        let kf = keyfile_bytes.filter(|b| !b.is_empty()).map(Zeroizing::new);
        if secret_pw.is_none() && kf.is_none() {
            return Err(BkpError::WrongKey);
        }
        let vault = Vault::create(name.as_deref());
        Ok(Arc::new(Self {
            session: Mutex::new(Some(VaultSession {
                vault,
                password: secret_pw,
                keyfile_bytes: kf,
            })),
        }))
    }

    /// Serializa e criptografa o cofre atual para gravação via Storage Access Framework.
    pub fn save(&self) -> Result<Vec<u8>, BkpError> {
        self.with_session(|s| {
            s.vault
                .save_to_bytes(
                    s.password.clone(),
                    s.keyfile_bytes.as_deref().map(Vec::as_slice),
                )
                .map_err(BkpError::from)
        })
    }

    /// Bloqueia o cofre descartando e zeroizando credenciais e banco em memória.
    pub fn lock(&self) {
        if let Ok(mut guard) = self.session.lock() {
            *guard = None;
        }
    }

    /// Indica se o cofre já foi bloqueado nesta instância.
    #[must_use]
    pub fn is_locked(&self) -> bool {
        self.session.lock().map_or(true, |guard| guard.is_none())
    }

    /// Retorna o nome configurado nos metadados do cofre.
    pub fn database_name(&self) -> Result<Option<String>, BkpError> {
        self.with_session(|s| Ok(s.vault.database_name().map(str::to_owned)))
    }

    /// Busca entradas usando a sintaxe KeePassXC.
    pub fn search(&self, query: String) -> Result<Vec<EntrySummaryDto>, BkpError> {
        self.with_session(|s| {
            Ok(s.vault
                .search(&query)
                .into_iter()
                .map(EntrySummaryDto::from)
                .collect())
        })
    }

    /// Lista metadados das entradas de um grupo (ou de todo o cofre quando `recursive` é `true`).
    pub fn list_entries(
        &self,
        group_path: Option<String>,
        recursive: bool,
    ) -> Result<Vec<EntrySummaryDto>, BkpError> {
        self.with_session(|s| {
            let entries = s.vault.list(group_path.as_deref(), recursive)?;
            Ok(entries.into_iter().map(EntrySummaryDto::from).collect())
        })
    }

    /// Retorna a árvore completa de grupos do cofre.
    pub fn group_tree(&self) -> Result<GroupNodeDto, BkpError> {
        self.with_session(|s| Ok(GroupNodeDto::from(s.vault.group_tree())))
    }

    /// Retorna detalhes completos de uma entrada sem expor senha nem campos protegidos.
    pub fn entry_details(&self, uuid: String) -> Result<EntryDetailsDto, BkpError> {
        let parsed = parse_uuid(&uuid)?;
        self.with_session(|s| {
            let details = s.vault.entry_details(parsed, false)?;
            Ok(EntryDetailsDto::from(details))
        })
    }

    /// Revela explicitamente a senha de uma entrada.
    pub fn reveal_password(&self, uuid: String) -> Result<String, BkpError> {
        let parsed = parse_uuid(&uuid)?;
        self.with_session(|s| {
            let secret = s.vault.entry_secret(parsed)?;
            Ok(secret.expose_secret().to_owned())
        })
    }

    /// Revela explicitamente o valor de um campo (protegido ou não) de uma entrada.
    pub fn reveal_field(&self, uuid: String, name: String) -> Result<Option<String>, BkpError> {
        let parsed = parse_uuid(&uuid)?;
        self.with_session(|s| {
            let secret = s.vault.entry_field_secret(parsed, &name)?;
            Ok(secret.map(|v| v.expose_secret().to_owned()))
        })
    }

    /// Calcula o código TOTP atual de uma entrada.
    pub fn totp(&self, uuid: String) -> Result<OtpCodeDto, BkpError> {
        let parsed = parse_uuid(&uuid)?;
        self.with_session(|s| Ok(OtpCodeDto::from(s.vault.totp_now(parsed)?)))
    }

    /// Lista o histórico de revisões de uma entrada.
    pub fn history(&self, uuid: String) -> Result<Vec<HistoryEntrySummaryDto>, BkpError> {
        let parsed = parse_uuid(&uuid)?;
        self.with_session(|s| {
            let list = s.vault.entry_history(parsed)?;
            Ok(list.into_iter().map(HistoryEntrySummaryDto::from).collect())
        })
    }

    /// Restaura uma revisão do histórico de uma entrada.
    pub fn restore_history(&self, uuid: String, index: u32) -> Result<(), BkpError> {
        let parsed = parse_uuid(&uuid)?;
        self.with_session_mut(|s| {
            s.vault.restore_history(parsed, index as usize)?;
            Ok(())
        })
    }

    /// Adiciona uma nova entrada e retorna seu UUID.
    pub fn add_entry(&self, input: NewEntryDto) -> Result<String, BkpError> {
        self.with_session_mut(|s| {
            let group_path = input.group_path.clone();
            let uuid = s.vault.add_entry(group_path.as_deref(), input.into())?;
            Ok(uuid.to_string())
        })
    }

    /// Atualiza uma entrada existente preservando a revisão anterior no histórico.
    pub fn update_entry(&self, uuid: String, patch: EntryPatchDto) -> Result<(), BkpError> {
        let parsed = parse_uuid(&uuid)?;
        self.with_session_mut(|s| {
            s.vault.edit_entry(parsed, patch.into())?;
            Ok(())
        })
    }

    /// Move uma entrada para a lixeira (`permanent = false`) ou exclui definitivamente.
    pub fn delete_entry(&self, uuid: String, permanent: bool) -> Result<(), BkpError> {
        let parsed = parse_uuid(&uuid)?;
        self.with_session_mut(|s| {
            s.vault.delete_entry(parsed, permanent)?;
            Ok(())
        })
    }

    /// Move uma entrada para outro grupo (ou raiz quando `None`).
    pub fn move_entry(
        &self,
        uuid: String,
        target_group_path: Option<String>,
    ) -> Result<(), BkpError> {
        let parsed = parse_uuid(&uuid)?;
        self.with_session_mut(|s| {
            s.vault.move_entry(parsed, target_group_path.as_deref())?;
            Ok(())
        })
    }

    /// Cria um grupo (e intermediários ausentes) no caminho informado.
    pub fn create_group(&self, group_path: String) -> Result<String, BkpError> {
        self.with_session_mut(|s| {
            let uuid = s.vault.create_group(&group_path)?;
            Ok(uuid.to_string())
        })
    }

    /// Anexa um arquivo binário protegido a uma entrada.
    pub fn add_attachment(
        &self,
        uuid: String,
        name: String,
        data: Vec<u8>,
    ) -> Result<(), BkpError> {
        let parsed = parse_uuid(&uuid)?;
        self.with_session_mut(|s| {
            s.vault.add_attachment(parsed, &name, data)?;
            Ok(())
        })
    }

    /// Lê os bytes de um anexo pelo nome.
    pub fn get_attachment(&self, uuid: String, name: String) -> Result<Vec<u8>, BkpError> {
        let parsed = parse_uuid(&uuid)?;
        self.with_session(|s| Ok(s.vault.get_attachment(parsed, &name)?))
    }

    /// Remove um anexo pelo nome.
    pub fn remove_attachment(&self, uuid: String, name: String) -> Result<(), BkpError> {
        let parsed = parse_uuid(&uuid)?;
        self.with_session_mut(|s| {
            s.vault.remove_attachment(parsed, &name)?;
            Ok(())
        })
    }

    /// Mescla alterações de outro arquivo `.kdbx` (em bytes) neste cofre usando resolução por UUID/timestamp.
    pub fn merge_from_bytes(
        &self,
        other_bytes: Vec<u8>,
        password: Option<String>,
        keyfile_bytes: Option<Vec<u8>>,
    ) -> Result<MergeReportDto, BkpError> {
        let secret_pw = password.filter(|p| !p.is_empty()).map(SecretString::from);
        let kf = keyfile_bytes.filter(|b| !b.is_empty());
        let other = Vault::open_from_bytes(&other_bytes, secret_pw, kf.as_deref())?;
        self.with_session_mut(|s| Ok(MergeReportDto::from(s.vault.merge(&other))))
    }

    /// Busca entradas compatíveis com um domínio web ou nome de pacote Android (para Autofill).
    pub fn find_by_url_or_package(
        &self,
        domain: Option<String>,
        package_name: Option<String>,
    ) -> Result<Vec<EntrySummaryDto>, BkpError> {
        let clean_domain = domain
            .as_deref()
            .map(str::trim)
            .filter(|d| !d.is_empty())
            .map(str::to_ascii_lowercase);
        let clean_pkg = package_name
            .as_deref()
            .map(str::trim)
            .filter(|p| !p.is_empty())
            .map(str::to_ascii_lowercase);

        self.with_session(|s| {
            let entries = s.vault.list(None, true)?;
            let mut matched = Vec::new();

            for summary in entries {
                if is_in_recycle_bin(&s.vault, &summary) {
                    continue;
                }
                let pkg_hit = clean_pkg
                    .as_deref()
                    .is_some_and(|pkg| entry_matches_package(&s.vault, &summary, pkg));
                let domain_hit = clean_domain
                    .as_deref()
                    .is_some_and(|dom| entry_matches_domain(&summary.url, dom));

                if pkg_hit || domain_hit {
                    matched.push(EntrySummaryDto::from(summary));
                }
            }

            Ok(matched)
        })
    }

    /// Cria uma nova passkey WebAuthn e armazena no cofre no formato KeePassXC (`KPEX_PASSKEY_*`).
    pub fn passkey_create(
        &self,
        req: PasskeyCreateRequestDto,
    ) -> Result<PasskeyCreateResultDto, BkpError> {
        let create_req = (&req).into();
        let (record, response) = create_credential(&create_req)?;
        self.with_session_mut(|s| {
            let entry_uuid = store_in_vault(&mut s.vault, req.group_path.as_deref(), &record)?;
            Ok(PasskeyCreateResultDto::from_parts(entry_uuid, response))
        })
    }

    /// Assina uma asserção WebAuthn para o `rp_id` informado e incrementa o `sign_count` no cofre.
    pub fn passkey_get_assertion(
        &self,
        rp_id: String,
        allow_ids: Vec<String>,
        client_data_hash_b64: String,
        user_verified: bool,
    ) -> Result<PasskeyAssertionResultDto, BkpError> {
        self.with_session_mut(|s| {
            let mut matches = find_in_vault(&s.vault, &rp_id, &allow_ids);
            let Some((entry_uuid, mut record)) = matches.drain(..).next() else {
                return Err(BkpError::NotFound {
                    msg: format!("nenhuma passkey para '{rp_id}'"),
                });
            };
            let req = GetAssertionRequest {
                rp_id,
                client_data_hash_b64,
                user_verified,
            };
            let res = get_assertion(&mut record, &req)?;
            update_sign_count_in_vault(&mut s.vault, entry_uuid, &record)?;
            Ok(PasskeyAssertionResultDto::from_parts(entry_uuid, res))
        })
    }

    /// Lista passkeys armazenadas no cofre (filtradas por `rp_id` quando fornecido).
    pub fn passkey_list(&self, rp_id: Option<String>) -> Result<Vec<PasskeyInfoDto>, BkpError> {
        self.with_session(|s| {
            if let Some(rp) = rp_id.as_deref().map(str::trim).filter(|r| !r.is_empty()) {
                return Ok(find_in_vault(&s.vault, rp, &[])
                    .into_iter()
                    .map(|(uuid, rec)| PasskeyInfoDto::from_parts(uuid, rec))
                    .collect());
            }

            let entries = s.vault.list(None, true)?;
            let mut out = Vec::new();
            let mut seen_rps = Vec::new();
            for summary in entries {
                if !summary.tags.iter().any(|t| t == PASSKEY_TAG) {
                    continue;
                }
                if let Ok(Some(rp_secret)) = s
                    .vault
                    .entry_field_secret(summary.uuid, "KPEX_PASSKEY_RELYING_PARTY")
                {
                    let rp = rp_secret.expose_secret().to_owned();
                    if !seen_rps.contains(&rp) {
                        seen_rps.push(rp.clone());
                        for (uuid, rec) in find_in_vault(&s.vault, &rp, &[]) {
                            out.push(PasskeyInfoDto::from_parts(uuid, rec));
                        }
                    }
                }
            }
            Ok(out)
        })
    }

    /// Executa análise de saúde das senhas do cofre (`zxcvbn` + reutilização).
    pub fn analyze_health(&self) -> Result<HealthReportDto, BkpError> {
        self.with_session(|s| Ok(HealthReportDto::from(analyze_health(&s.vault))))
    }
}

impl VaultHandle {
    fn with_session<T>(
        &self,
        f: impl FnOnce(&VaultSession) -> Result<T, BkpError>,
    ) -> Result<T, BkpError> {
        let guard = self.session.lock().map_err(|_| BkpError::Locked)?;
        let session = guard.as_ref().ok_or(BkpError::Locked)?;
        f(session)
    }

    fn with_session_mut<T>(
        &self,
        f: impl FnOnce(&mut VaultSession) -> Result<T, BkpError>,
    ) -> Result<T, BkpError> {
        let mut guard = self.session.lock().map_err(|_| BkpError::Locked)?;
        let session = guard.as_mut().ok_or(BkpError::Locked)?;
        f(session)
    }
}

/// Gera uma senha aleatória usando o CSPRNG do sistema operacional.
#[uniffi::export]
pub fn generate_password(opts: PasswordOptionsDto) -> Result<String, BkpError> {
    let pw = core_generate_password(&opts.into())?;
    Ok(pw.expose_secret().to_owned())
}

/// Gera uma passphrase aleatória usando a wordlist EFF embutida.
#[uniffi::export]
pub fn generate_passphrase(words: u32, separator: String) -> Result<String, BkpError> {
    let phrase = core_generate_passphrase(words as usize, &separator)?;
    Ok(phrase.expose_secret().to_owned())
}

fn parse_uuid(raw: &str) -> Result<Uuid, BkpError> {
    Uuid::parse_str(raw.trim()).map_err(|e| BkpError::InvalidInput {
        msg: format!("UUID inválido '{raw}': {e}"),
    })
}

fn is_in_recycle_bin(vault: &Vault, summary: &EntrySummary) -> bool {
    fn find_recycle_path(node: &bkp_core::GroupNode) -> Option<String> {
        if node.is_recycle_bin {
            return Some(node.path.clone());
        }
        node.children.iter().find_map(find_recycle_path)
    }
    let tree = vault.group_tree();
    find_recycle_path(&tree).is_some_and(|recycle_path| {
        !recycle_path.is_empty()
            && (summary.group_path == recycle_path
                || summary.group_path.starts_with(&format!("{recycle_path}/")))
    })
}

fn entry_matches_package(vault: &Vault, summary: &EntrySummary, target_pkg: &str) -> bool {
    if let Some(rest) = summary.url.trim().strip_prefix("androidapp://")
        && rest.trim().eq_ignore_ascii_case(target_pkg)
    {
        return true;
    }

    if let Ok(Some(field)) = vault.entry_field_secret(summary.uuid, "AndroidApp") {
        return field
            .expose_secret()
            .split([',', ';', '\n'])
            .map(str::trim)
            .any(|pkg| pkg.eq_ignore_ascii_case(target_pkg));
    }

    false
}

fn entry_matches_domain(raw_url: &str, target_domain: &str) -> bool {
    let Some(entry_host) = extract_host(raw_url) else {
        return false;
    };
    entry_host == target_domain
        || entry_host.ends_with(&format!(".{target_domain}"))
        || target_domain.ends_with(&format!(".{entry_host}"))
}

fn extract_host(raw_url: &str) -> Option<String> {
    let trimmed = raw_url.trim();
    if trimmed.is_empty() || trimmed.starts_with("androidapp://") {
        return None;
    }
    let without_scheme = trimmed.split_once("://").map_or(trimmed, |(_, rest)| rest);
    let authority = without_scheme.split(['/', '?', '#']).next()?;
    let host_port = authority.rsplit('@').next()?;
    let host = host_port.split(':').next()?.trim().to_ascii_lowercase();
    if host.is_empty() { None } else { Some(host) }
}
