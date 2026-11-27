//! Metadados e garantias de endurecimento de memória e processo.

use serde::{Deserialize, Serialize};

/// Estado das proteções de processo ativas.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HardeningStatus {
    /// Uso de `secrecy` e `zeroize` em todos os buffers de senha e chaves.
    pub zeroize_enabled: bool,
    /// `unsafe_code = "forbid"` ativo no workspace Rust.
    pub unsafe_forbidden: bool,
    /// Política recomendada para desabilitar core dumps (`PR_SET_DUMPABLE=0`).
    pub core_dumps_policy: &'static str,
}

/// Retorna o resumo atual das proteções de processo e memória.
#[must_use]
pub const fn current_hardening_status() -> HardeningStatus {
    HardeningStatus {
        zeroize_enabled: true,
        unsafe_forbidden: true,
        core_dumps_policy: "secrecy+zeroize; PR_SET_DUMPABLE=0 / SetProcessMitigationPolicy na camada nativa",
    }
}
