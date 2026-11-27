//! Sincronização bidirecional baseada em merge entre o cofre local e um arquivo remoto/compartilhado.

use std::path::Path;

use secrecy::SecretString;
use serde::{Deserialize, Serialize};

use crate::{error::Result, merge::MergeReport, vault::Vault};

/// Plano de sincronização selecionado.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SyncPlan {
    /// Apenas incorpora novidades do remoto no cofre local.
    PullOnly,
    /// Faz merge bidirecional e grava o resultado de volta nos dois arquivos.
    Bidirectional,
}

/// Resultado de uma operação de sincronização.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncOutcome {
    /// Relatório das entradas mescladas no cofre local.
    pub report: MergeReport,
    /// Indica se o arquivo remoto foi atualizado.
    pub remote_updated: bool,
}

/// Sincroniza `local` com um arquivo `.kdbx` externo (`remote_path`).
pub fn sync_with_file(
    local: &mut Vault,
    remote_path: &Path,
    password: Option<SecretString>,
    keyfile: Option<&Path>,
    plan: SyncPlan,
) -> Result<SyncOutcome> {
    let remote = Vault::open(remote_path, password.clone(), keyfile)?;
    let report = local.merge(&remote);

    let remote_updated = if matches!(plan, SyncPlan::Bidirectional) {
        local.save(remote_path, password, keyfile)?;
        true
    } else {
        false
    };

    Ok(SyncOutcome {
        report,
        remote_updated,
    })
}
