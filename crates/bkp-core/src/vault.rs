//! Gerenciamento do cofre `.kdbx` e modelos de metadados sem exposição acidental de segredos.

use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::Path,
};

use keepass::{
    Database, DatabaseKey,
    db::{EntryId, EntryRef, GroupId, GroupRef, Value, fields},
};
use secrecy::{ExposeSecret, SecretString};
use uuid::Uuid;

use crate::{
    error::{CoreError, Result},
    totp::OtpCode,
};

/// Metadados públicos de uma entrada (não contém senha, seed TOTP nem chaves privadas).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EntrySummary {
    /// Identificador único da entrada.
    pub uuid: Uuid,
    /// Título da entrada.
    pub title: String,
    /// Nome de usuário.
    pub username: String,
    /// URL associada.
    pub url: String,
    /// Tags da entrada.
    pub tags: Vec<String>,
    /// Caminho hierárquico do grupo (vazio quando está na raiz).
    pub group_path: String,
}

/// Visualização de um campo customizado da entrada.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CustomFieldView {
    /// Nome do campo.
    pub name: String,
    /// Valor do campo; `None` quando é protegido e a revelação não foi solicitada.
    pub value: Option<String>,
    /// Indica se o campo é protegido no `.kdbx`.
    pub protected: bool,
}

/// Detalhes completos de uma entrada sob demanda.
#[derive(Debug, Clone)]
pub struct EntryDetails {
    /// Metadados da entrada.
    pub summary: EntrySummary,
    /// Notas em texto livre.
    pub notes: String,
    /// Senha da entrada, preenchida apenas quando `include_protected` é `true`.
    pub password: Option<SecretString>,
    /// Indica se a entrada possui campo `otp`.
    pub has_otp: bool,
    /// Campos adicionais além dos padrões (`Title`, `UserName`, `Password`, `URL`, `Notes`).
    pub custom_fields: Vec<CustomFieldView>,
    /// Nomes dos anexos da entrada.
    pub attachments: Vec<String>,
}

/// Campo customizado a ser gravado em uma nova entrada ou edição.
#[derive(Debug, Clone)]
pub struct CustomFieldInput {
    /// Nome do campo.
    pub name: String,
    /// Valor do campo.
    pub value: SecretString,
    /// Se `true`, o valor será armazenado como protegido no stream interno.
    pub protected: bool,
}

/// Dados para criação de uma nova entrada.
#[derive(Debug, Clone, Default)]
pub struct NewEntry {
    /// Título da entrada.
    pub title: String,
    /// Nome de usuário.
    pub username: Option<String>,
    /// Senha (sempre gravada como campo protegido).
    pub password: Option<SecretString>,
    /// URL.
    pub url: Option<String>,
    /// Notas.
    pub notes: Option<String>,
    /// Tags associadas.
    pub tags: Vec<String>,
    /// Campos customizados adicionais.
    pub custom_fields: Vec<CustomFieldInput>,
}

/// Alterações parciais aplicáveis a uma entrada existente.
#[derive(Debug, Clone, Default)]
pub struct EntryPatch {
    /// Novo título, se fornecido.
    pub title: Option<String>,
    /// Novo usuário, se fornecido.
    pub username: Option<String>,
    /// Nova senha, se fornecida.
    pub password: Option<SecretString>,
    /// Nova URL, se fornecida.
    pub url: Option<String>,
    /// Novas notas, se fornecidas.
    pub notes: Option<String>,
    /// Substitui a lista de tags, se fornecido.
    pub tags: Option<Vec<String>>,
    /// Campos customizados para inserir ou atualizar.
    pub custom_fields: Vec<CustomFieldInput>,
}

/// Cofre KeePass aberto em memória.
pub struct Vault {
    db: Database,
}

impl Vault {
    /// Cria um novo cofre KDBX 4 em memória.
    #[must_use]
    pub fn create(name: Option<&str>) -> Self {
        let mut db = Database::new();
        "Root".clone_into(&mut db.root_mut().name);
        if let Some(db_name) = name {
            db.meta.database_name = Some(db_name.to_owned());
        }
        Self { db }
    }

    /// Abre um arquivo `.kdbx` existente a partir do disco.
    pub fn open(
        path: &Path,
        password: Option<SecretString>,
        keyfile: Option<&Path>,
    ) -> Result<Self> {
        let bytes = fs::read(path)?;
        let keyfile_bytes = keyfile.map(fs::read).transpose()?;
        let vault = Self::open_from_bytes(&bytes, password, keyfile_bytes.as_deref())?;
        Ok(vault)
    }

    /// Abre um cofre `.kdbx` diretamente a partir de bytes em memória (útil para testes e fuzzing).
    pub fn open_from_bytes(
        bytes: &[u8],
        password: Option<SecretString>,
        keyfile_bytes: Option<&[u8]>,
    ) -> Result<Self> {
        let key = build_database_key(password.as_ref(), keyfile_bytes)?;
        drop(password);
        let db = Database::parse(bytes, key)?;
        Ok(Self { db })
    }

    /// Grava o cofre em disco como KDBX 4 usando escrita atômica (arquivo temporário + `sync_all` + `rename`).
    pub fn save(
        &self,
        path: &Path,
        password: Option<SecretString>,
        keyfile: Option<&Path>,
    ) -> Result<()> {
        let keyfile_bytes = keyfile.map(fs::read).transpose()?;
        let key = build_database_key(password.as_ref(), keyfile_bytes.as_deref())?;
        drop(password);

        let parent = path
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or_else(|| Path::new("."));
        let nonce = getrandom::u64()?;
        let tmp_path = parent.join(format!(".bkp-tmp-{}-{nonce:016x}", std::process::id()));

        let write_result = (|| -> Result<()> {
            let mut opts = OpenOptions::new();
            opts.write(true).create_new(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                opts.mode(0o600);
            }
            let mut file = opts.open(&tmp_path)?;
            self.db.save(&mut file, key)?;
            file.flush()?;
            file.sync_all()?;
            drop(file);
            fs::rename(&tmp_path, path)?;
            Ok(())
        })();

        if write_result.is_err() {
            let _ = fs::remove_file(&tmp_path);
        }

        write_result
    }

    /// Retorna o nome configurado nos metadados do banco, se houver.
    #[must_use]
    pub fn database_name(&self) -> Option<&str> {
        self.db.meta.database_name.as_deref()
    }

    /// Lista os nomes dos subgrupos diretos de `group_path` (ou da raiz quando `None`).
    pub fn list_groups(&self, group_path: Option<&str>) -> Result<Vec<String>> {
        let group = self.resolve_group(group_path)?;
        Ok(group.groups().map(|g| g.name.clone()).collect())
    }

    /// Lista metadados das entradas em `group_path` (ou de todo o cofre quando `recursive` é `true`).
    pub fn list(&self, group_path: Option<&str>, recursive: bool) -> Result<Vec<EntrySummary>> {
        let group = self.resolve_group(group_path)?;
        let base_path = normalize_group_segments(group_path).join("/");
        let mut out = Vec::new();
        collect_entries(&group, &base_path, recursive, &mut out);
        Ok(out)
    }

    /// Localiza uma entrada por caminho (`"Grupo/Sub/Título"`), UUID ou título único.
    pub fn find_by_path(&self, entry_path: &str) -> Result<EntrySummary> {
        let trimmed = entry_path.trim().trim_matches('/');
        if trimmed.is_empty() {
            return Err(CoreError::InvalidInput(
                "caminho da entrada não pode ser vazio".to_owned(),
            ));
        }

        if let Ok(uuid) = Uuid::parse_str(trimmed) {
            let entry_id = EntryId::from_uuid(uuid);
            if let Some(entry) = self.db.entry(entry_id) {
                let path = group_path_of(&self.db, entry.parent().id());
                return Ok(summarize_entry(&entry, &path));
            }
        }

        let segments: Vec<&str> = trimmed.split('/').filter(|s| !s.is_empty()).collect();
        if segments.len() > 1 {
            let group_segments = &segments[..segments.len() - 1];
            let title = segments[segments.len() - 1];
            let group_id = self.resolve_group_id(group_segments)?;
            let group = self
                .db
                .group(group_id)
                .ok_or_else(|| CoreError::GroupNotFound(group_segments.join("/")))?;
            let entry = group
                .entry_by_name(title)
                .ok_or_else(|| CoreError::EntryNotFound(entry_path.to_owned()))?;
            let path = group_segments.join("/");
            return Ok(summarize_entry(&entry, &path));
        }

        let title = segments[0];
        if let Some(entry) = self.db.root().entry_by_name(title) {
            return Ok(summarize_entry(&entry, ""));
        }

        let all = self.list(None, true)?;
        let mut matches: Vec<EntrySummary> = all
            .into_iter()
            .filter(|e| e.title.eq_ignore_ascii_case(title))
            .collect();

        match matches.len() {
            0 => Err(CoreError::EntryNotFound(entry_path.to_owned())),
            1 => Ok(matches.remove(0)),
            _ => Err(CoreError::AmbiguousEntry(entry_path.to_owned())),
        }
    }

    /// Obtém os detalhes de uma entrada por UUID; segredos protegidos só são incluídos quando `include_protected` é `true`.
    pub fn entry_details(&self, uuid: Uuid, include_protected: bool) -> Result<EntryDetails> {
        let entry = self
            .db
            .entry(EntryId::from_uuid(uuid))
            .ok_or_else(|| CoreError::EntryNotFound(uuid.to_string()))?;

        let group_path = group_path_of(&self.db, entry.parent().id());
        let summary = summarize_entry(&entry, &group_path);
        let notes = entry.get(fields::NOTES).unwrap_or_default().to_owned();
        let has_otp = entry.get_raw_otp_value().is_some();

        let password = if include_protected {
            entry
                .get_password()
                .map(|p| SecretString::from(p.to_owned()))
        } else {
            None
        };

        let mut custom_fields: Vec<CustomFieldView> = entry
            .fields
            .iter()
            .filter(|(k, _)| !fields::KNOWN_FIELDS.contains(&k.as_str()))
            .map(|(name, value)| {
                let protected = value.is_protected();
                let exposed = if !protected || include_protected {
                    Some(value.get().clone())
                } else {
                    None
                };
                CustomFieldView {
                    name: name.clone(),
                    value: exposed,
                    protected,
                }
            })
            .collect();
        custom_fields.sort_by(|a, b| a.name.cmp(&b.name));

        let mut attachments: Vec<String> = entry
            .attachments_named()
            .map(|(name, _)| name.to_owned())
            .collect();
        attachments.sort();

        Ok(EntryDetails {
            summary,
            notes,
            password,
            has_otp,
            custom_fields,
            attachments,
        })
    }

    /// Retorna explicitamente a senha protegida de uma entrada.
    pub fn entry_secret(&self, uuid: Uuid) -> Result<SecretString> {
        let entry = self
            .db
            .entry(EntryId::from_uuid(uuid))
            .ok_or_else(|| CoreError::EntryNotFound(uuid.to_string()))?;
        let password = entry.get_password().unwrap_or_default().to_owned();
        Ok(SecretString::from(password))
    }

    /// Adiciona uma entrada em `group_path` (criando subgrupos inexistentes quando necessário).
    pub fn add_entry(&mut self, group_path: Option<&str>, new_entry: NewEntry) -> Result<Uuid> {
        if new_entry.title.trim().is_empty() {
            return Err(CoreError::InvalidInput(
                "o título da entrada não pode ser vazio".to_owned(),
            ));
        }

        let target_group_id = self.ensure_group_path(group_path);
        let mut group = self
            .db
            .group_mut(target_group_id)
            .ok_or_else(|| CoreError::GroupNotFound(group_path.unwrap_or_default().to_owned()))?;

        let mut entry = group.add_entry();
        entry.set_unprotected(fields::TITLE, new_entry.title);
        if let Some(username) = new_entry.username {
            entry.set_unprotected(fields::USERNAME, username);
        }
        if let Some(password) = new_entry.password {
            entry.set_protected(fields::PASSWORD, password.expose_secret());
        }
        if let Some(url) = new_entry.url {
            entry.set_unprotected(fields::URL, url);
        }
        if let Some(notes) = new_entry.notes {
            entry.set_unprotected(fields::NOTES, notes);
        }
        entry.tags = new_entry.tags;
        for field in new_entry.custom_fields {
            if field.protected {
                entry.set_protected(field.name, field.value.expose_secret());
            } else {
                entry.set_unprotected(field.name, field.value.expose_secret());
            }
        }

        Ok(entry.id().uuid())
    }

    /// Atualiza campos de uma entrada existente preservando a versão anterior no histórico.
    pub fn edit_entry(&mut self, uuid: Uuid, patch: EntryPatch) -> Result<()> {
        let mut entry = self
            .db
            .entry_mut(EntryId::from_uuid(uuid))
            .ok_or_else(|| CoreError::EntryNotFound(uuid.to_string()))?;

        entry.edit_tracking(|tracked| {
            if let Some(title) = patch.title {
                tracked.set_unprotected(fields::TITLE, title);
            }
            if let Some(username) = patch.username {
                tracked.set_unprotected(fields::USERNAME, username);
            }
            if let Some(password) = patch.password {
                tracked.set_protected(fields::PASSWORD, password.expose_secret());
            }
            if let Some(url) = patch.url {
                tracked.set_unprotected(fields::URL, url);
            }
            if let Some(notes) = patch.notes {
                tracked.set_unprotected(fields::NOTES, notes);
            }
            if let Some(tags) = patch.tags {
                tracked.tags = tags;
            }
            for field in patch.custom_fields {
                if field.protected {
                    tracked.set_protected(field.name, field.value.expose_secret());
                } else {
                    tracked.set_unprotected(field.name, field.value.expose_secret());
                }
            }
        });

        Ok(())
    }

    /// Calcula o código TOTP atual de uma entrada com campo `otp`.
    pub fn totp_now(&self, uuid: Uuid) -> Result<OtpCode> {
        let entry = self
            .db
            .entry(EntryId::from_uuid(uuid))
            .ok_or_else(|| CoreError::EntryNotFound(uuid.to_string()))?;
        crate::totp::totp_from_entry(&entry)
    }

    fn resolve_group(&self, group_path: Option<&str>) -> Result<GroupRef<'_>> {
        let segments = normalize_group_segments(group_path);
        let group_id = self.resolve_group_id(&segments)?;
        self.db
            .group(group_id)
            .ok_or_else(|| CoreError::GroupNotFound(segments.join("/")))
    }

    fn resolve_group_id(&self, segments: &[&str]) -> Result<GroupId> {
        let mut current_id = self.db.root().id();
        for segment in segments {
            let group = self
                .db
                .group(current_id)
                .ok_or_else(|| CoreError::GroupNotFound(segments.join("/")))?;
            current_id = group
                .group_by_name(segment)
                .map(|g| g.id())
                .ok_or_else(|| CoreError::GroupNotFound(segments.join("/")))?;
        }
        Ok(current_id)
    }

    fn ensure_group_path(&mut self, group_path: Option<&str>) -> GroupId {
        let segments = normalize_group_segments(group_path);
        let mut current_id = self.db.root().id();

        for segment in segments {
            let next_id = {
                let Some(mut current) = self.db.group_mut(current_id) else {
                    break;
                };
                if let Some(existing) = current.group_by_name_mut(segment) {
                    existing.id()
                } else {
                    let mut created = current.add_group();
                    segment.clone_into(&mut created.name);
                    created.id()
                }
            };
            current_id = next_id;
        }

        current_id
    }
}

fn build_database_key(
    password: Option<&SecretString>,
    keyfile_bytes: Option<&[u8]>,
) -> Result<DatabaseKey> {
    let mut key = DatabaseKey::new();
    if let Some(pw) = password {
        key = key.with_password(pw.expose_secret());
    }
    if let Some(bytes) = keyfile_bytes {
        let mut cursor = std::io::Cursor::new(bytes);
        key = key.with_keyfile(&mut cursor)?;
    }
    if key.is_empty() {
        return Err(CoreError::EmptyKey);
    }
    Ok(key)
}

fn normalize_group_segments(group_path: Option<&str>) -> Vec<&str> {
    group_path
        .unwrap_or_default()
        .split('/')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .collect()
}

fn group_path_of(db: &Database, group_id: GroupId) -> String {
    let mut parts = Vec::new();
    let mut current = Some(group_id);
    while let Some(id) = current {
        let Some(g) = db.group(id) else {
            break;
        };
        let parent_id = g.parent().map(|p| p.id());
        if parent_id.is_some() {
            parts.push(g.name.clone());
        }
        current = parent_id;
    }
    parts.reverse();
    parts.join("/")
}

fn summarize_entry(entry: &EntryRef<'_>, group_path: &str) -> EntrySummary {
    EntrySummary {
        uuid: entry.id().uuid(),
        title: entry.get_title().unwrap_or_default().to_owned(),
        username: entry.get_username().unwrap_or_default().to_owned(),
        url: entry.get_url().unwrap_or_default().to_owned(),
        tags: entry.tags.clone(),
        group_path: group_path.to_owned(),
    }
}

fn collect_entries(
    group: &GroupRef<'_>,
    current_path: &str,
    recursive: bool,
    out: &mut Vec<EntrySummary>,
) {
    for entry in group.entries() {
        out.push(summarize_entry(&entry, current_path));
    }

    if recursive {
        for subgroup in group.groups() {
            let next_path = if current_path.is_empty() {
                subgroup.name.clone()
            } else {
                format!("{current_path}/{}", subgroup.name)
            };
            collect_entries(&subgroup, &next_path, true, out);
        }
    }
}

#[must_use]
pub fn format_value_mask(value: &Value<String>, reveal: bool) -> String {
    if value.is_protected() && !reveal {
        "[protegido]".to_owned()
    } else {
        value.get().clone()
    }
}
