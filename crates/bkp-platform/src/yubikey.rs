//! Contrato de desafio-resposta HMAC-SHA1 para chaves YubiKey e OnlyKey.

use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum YubiKeyError {
    #[error("nenhum dispositivo YubiKey/OnlyKey compatível encontrado")]
    DeviceNotFound,
    #[error("falha na operação HMAC-SHA1: {0}")]
    Transport(String),
}

/// Configuração de slot HMAC-SHA1 (slot 1 ou 2 + número de série opcional).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YubiKeySlotConfig {
    pub slot: u8,
    pub serial: Option<u32>,
}

/// Provedor de desafio-resposta HMAC-SHA1 para composição da chave mestra KDBX.
pub trait ChallengeResponseProvider: Send + Sync {
    fn list_devices(&self) -> Result<Vec<YubiKeySlotConfig>, YubiKeyError>;
    fn challenge_response(
        &self,
        slot: &YubiKeySlotConfig,
        challenge: &[u8],
    ) -> Result<Vec<u8>, YubiKeyError>;
}
