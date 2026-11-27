//! Provedor D-Bus Secret Service (`org.freedesktop.secrets`) no Linux com exposição por grupos.

use bkp_core::Vault;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Item exposto por uma coleção `org.freedesktop.secrets`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretServiceItem {
    pub entry_uuid: Uuid,
    pub label: String,
    pub username: String,
    pub url: String,
    pub group_path: String,
}

/// Coleção D-Bus associada a grupos configurados do cofre.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretServiceCollection {
    pub label: String,
    pub items: Vec<SecretServiceItem>,
}

/// Trait para o servidor `org.freedesktop.secrets`.
pub trait SecretService: Send + Sync {
    fn bus_name(&self) -> &'static str {
        "org.freedesktop.secrets"
    }
    fn export_collection(
        &self,
        vault: &Vault,
        exposed_groups: &[String],
    ) -> SecretServiceCollection;
}

/// Constrói a coleção padrão filtrada pelos grupos permitidos (vazio = todos os grupos).
#[must_use]
pub fn build_exposed_collection(
    vault: &Vault,
    exposed_groups: &[String],
) -> SecretServiceCollection {
    let entries = vault.list(None, true).unwrap_or_default();
    let items = entries
        .into_iter()
        .filter(|e| {
            exposed_groups.is_empty()
                || exposed_groups.iter().any(|g| {
                    e.group_path.eq_ignore_ascii_case(g)
                        || e.group_path.starts_with(&format!("{g}/"))
                })
        })
        .map(|e| SecretServiceItem {
            entry_uuid: e.uuid,
            label: e.title,
            username: e.username,
            url: e.url,
            group_path: e.group_path,
        })
        .collect();

    SecretServiceCollection {
        label: "BetterKeePass".to_owned(),
        items,
    }
}
