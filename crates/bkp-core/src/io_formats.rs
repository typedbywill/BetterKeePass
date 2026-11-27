//! Importação e exportação de cofres (CSV, Bitwarden JSON e 1Password 1PUX).

use keepass::db::fields;
use secrecy::{ExposeSecret, SecretString};
use serde::{Deserialize, Serialize};

use crate::{
    error::Result,
    vault::{NewEntry, Vault},
};

/// Resumo de importação executada.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportReport {
    pub imported: usize,
    pub skipped: usize,
}

#[derive(Debug, Serialize, Deserialize)]
struct CsvRow {
    #[serde(alias = "Group", default)]
    group: String,
    #[serde(alias = "Title", default)]
    title: String,
    #[serde(alias = "Username", alias = "UserName", default)]
    username: String,
    #[serde(alias = "Password", default)]
    password: String,
    #[serde(alias = "URL", default)]
    url: String,
    #[serde(alias = "Notes", default)]
    notes: String,
}

/// Importa entradas de texto CSV (`Group,Title,Username,Password,URL,Notes`).
pub fn import_csv(vault: &mut Vault, csv_data: &str) -> Result<ImportReport> {
    let mut reader = csv::ReaderBuilder::new()
        .flexible(true)
        .from_reader(csv_data.as_bytes());
    let mut report = ImportReport::default();

    for result in reader.deserialize::<CsvRow>() {
        let row = result?;
        if row.title.trim().is_empty() {
            report.skipped += 1;
            continue;
        }
        let group = (!row.group.trim().is_empty()).then_some(row.group.as_str());
        vault.add_entry(
            group,
            NewEntry {
                title: row.title,
                username: (!row.username.is_empty()).then_some(row.username),
                password: (!row.password.is_empty()).then(|| SecretString::from(row.password)),
                url: (!row.url.is_empty()).then_some(row.url),
                notes: (!row.notes.is_empty()).then_some(row.notes),
                ..NewEntry::default()
            },
        )?;
        report.imported += 1;
    }

    Ok(report)
}

/// Exporta todas as entradas do cofre em formato CSV compatível com KeePassXC.
pub fn export_csv(vault: &Vault) -> Result<String> {
    let mut writer = csv::Writer::from_writer(Vec::new());
    for summary in vault.list(None, true)? {
        let details = vault.entry_details(summary.uuid, true)?;
        let password = details
            .password
            .as_ref()
            .map(|p| p.expose_secret().to_owned())
            .unwrap_or_default();
        writer.serialize(CsvRow {
            group: summary.group_path,
            title: summary.title,
            username: summary.username,
            password,
            url: summary.url,
            notes: details.notes,
        })?;
    }
    let bytes = writer
        .into_inner()
        .map_err(|e| crate::error::CoreError::InvalidInput(e.to_string()))?;
    String::from_utf8(bytes).map_err(|e| crate::error::CoreError::InvalidInput(e.to_string()))
}

#[derive(Debug, Deserialize)]
struct BitwardenExport {
    #[serde(default)]
    folders: Vec<BitwardenFolder>,
    #[serde(default)]
    items: Vec<BitwardenItem>,
}

#[derive(Debug, Deserialize)]
struct BitwardenFolder {
    id: Option<String>,
    name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BitwardenItem {
    name: String,
    #[serde(default)]
    folder_id: Option<String>,
    #[serde(default)]
    notes: Option<String>,
    #[serde(default)]
    login: Option<BitwardenLogin>,
}

#[derive(Debug, Deserialize)]
struct BitwardenLogin {
    #[serde(default)]
    username: Option<String>,
    #[serde(default)]
    password: Option<String>,
    #[serde(default)]
    totp: Option<String>,
    #[serde(default)]
    uris: Vec<BitwardenUri>,
}

#[derive(Debug, Deserialize)]
struct BitwardenUri {
    uri: Option<String>,
}

/// Importa um arquivo JSON exportado do Bitwarden.
pub fn import_bitwarden_json(vault: &mut Vault, json_data: &str) -> Result<ImportReport> {
    let parsed: BitwardenExport = serde_json::from_str(json_data)?;
    let mut report = ImportReport::default();

    for item in parsed.items {
        if item.name.trim().is_empty() {
            report.skipped += 1;
            continue;
        }
        let folder_name = item.folder_id.as_ref().and_then(|fid| {
            parsed
                .folders
                .iter()
                .find(|f| f.id.as_deref() == Some(fid.as_str()))
                .map(|f| f.name.as_str())
        });

        let mut new_entry = NewEntry {
            title: item.name,
            notes: item.notes,
            ..NewEntry::default()
        };

        if let Some(login) = item.login {
            new_entry.username = login.username;
            new_entry.password = login.password.map(SecretString::from);
            new_entry.url = login.uris.into_iter().find_map(|u| u.uri);
            if let Some(totp) = login.totp
                && !totp.is_empty()
            {
                let otp_value = if totp.starts_with("otpauth://") {
                    totp
                } else {
                    format!("otpauth://totp/Bitwarden:imported?secret={totp}")
                };
                new_entry
                    .custom_fields
                    .push(crate::vault::CustomFieldInput {
                        name: fields::OTP.to_owned(),
                        value: SecretString::from(otp_value),
                        protected: true,
                    });
            }
        }

        vault.add_entry(folder_name, new_entry)?;
        report.imported += 1;
    }

    Ok(report)
}

#[derive(Debug, Deserialize)]
struct OnePasswordExport {
    #[serde(default)]
    accounts: Vec<OnePasswordAccount>,
}

#[derive(Debug, Deserialize)]
struct OnePasswordAccount {
    #[serde(default)]
    vaults: Vec<OnePasswordVault>,
}

#[derive(Debug, Deserialize)]
struct OnePasswordVault {
    attrs: OnePasswordVaultAttrs,
    #[serde(default)]
    items: Vec<OnePasswordItem>,
}

#[derive(Debug, Deserialize)]
struct OnePasswordVaultAttrs {
    name: String,
}

#[derive(Debug, Deserialize)]
struct OnePasswordItem {
    overview: OnePasswordOverview,
    #[serde(default)]
    details: OnePasswordDetails,
}

#[derive(Debug, Deserialize)]
struct OnePasswordOverview {
    title: String,
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    tags: Vec<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OnePasswordDetails {
    #[serde(default)]
    notes_plain: Option<String>,
    #[serde(default)]
    login_fields: Vec<OnePasswordLoginField>,
}

#[derive(Debug, Deserialize)]
struct OnePasswordLoginField {
    #[serde(default)]
    designation: Option<String>,
    #[serde(default)]
    value: Option<String>,
}

/// Importa dados JSON no formato 1Password `.1pux` (`export.data`).
pub fn import_1pux_json(vault: &mut Vault, json_data: &str) -> Result<ImportReport> {
    let parsed: OnePasswordExport = serde_json::from_str(json_data)?;
    let mut report = ImportReport::default();

    for account in parsed.accounts {
        for op_vault in account.vaults {
            let group_name = op_vault.attrs.name;
            for item in op_vault.items {
                if item.overview.title.trim().is_empty() {
                    report.skipped += 1;
                    continue;
                }
                let mut username = None;
                let mut password = None;
                for field in item.details.login_fields {
                    match field.designation.as_deref() {
                        Some("username") => username = field.value,
                        Some("password") => password = field.value.map(SecretString::from),
                        _ => {}
                    }
                }
                vault.add_entry(
                    (!group_name.is_empty()).then_some(group_name.as_str()),
                    NewEntry {
                        title: item.overview.title,
                        username,
                        password,
                        url: item.overview.url,
                        notes: item.details.notes_plain,
                        tags: item.overview.tags,
                        ..NewEntry::default()
                    },
                )?;
                report.imported += 1;
            }
        }
    }

    Ok(report)
}
