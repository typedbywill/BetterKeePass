//! Mapeamento de erros de `bkp-core` e `bkp-passkey` para o contrato UniFFI.

use bkp_core::CoreError;
use bkp_passkey::PasskeyError;
use keepass::db::DatabaseOpenError;
use thiserror::Error;

/// Erro exposto pela camada FFI para Kotlin/Swift.
#[derive(Debug, Error, uniffi::Error)]
pub enum BkpError {
    /// Chave mestra (senha e/ou arquivo-chave) incorreta ou ausente.
    #[error("chave mestra incorreta")]
    WrongKey,
    /// Arquivo `.kdbx` corrompido ou inválido.
    #[error("cofre corrompido: {msg}")]
    Corrupt { msg: String },
    /// Entrada, grupo, anexo ou histórico não encontrado.
    #[error("não encontrado: {msg}")]
    NotFound { msg: String },
    /// Erro de leitura ou escrita.
    #[error("erro de E/S: {msg}")]
    Io { msg: String },
    /// Erro durante operação WebAuthn / passkey.
    #[error("erro de passkey: {msg}")]
    Passkey { msg: String },
    /// Parâmetro inválido.
    #[error("entrada inválida: {msg}")]
    InvalidInput { msg: String },
    /// Cofre já bloqueado na sessão atual.
    #[error("cofre bloqueado")]
    Locked,
}

impl From<CoreError> for BkpError {
    fn from(err: CoreError) -> Self {
        match err {
            CoreError::EmptyKey => Self::WrongKey,
            CoreError::DatabaseOpen(open_err) => match open_err {
                DatabaseOpenError::Key(_) | DatabaseOpenError::Cryptography(_) => Self::WrongKey,
                other => Self::Corrupt {
                    msg: other.to_string(),
                },
            },
            CoreError::DatabaseSave(e) => Self::Io { msg: e.to_string() },
            CoreError::Io(e) => Self::Io { msg: e.to_string() },
            CoreError::EntryNotFound(msg)
            | CoreError::GroupNotFound(msg)
            | CoreError::AttachmentNotFound(msg) => Self::NotFound { msg },
            CoreError::HistoryNotFound(idx) => Self::NotFound {
                msg: format!("revisão {idx}"),
            },
            CoreError::AmbiguousEntry(msg) | CoreError::InvalidInput(msg) => {
                Self::InvalidInput { msg }
            }
            CoreError::Totp(e) => Self::InvalidInput { msg: e.to_string() },
            CoreError::Random(e) => Self::Io { msg: e.to_string() },
            CoreError::Csv(e) => Self::Corrupt { msg: e.to_string() },
            CoreError::Json(e) => Self::Corrupt { msg: e.to_string() },
            CoreError::Toml(e) => Self::Corrupt { msg: e.to_string() },
        }
    }
}

impl From<PasskeyError> for BkpError {
    fn from(err: PasskeyError) -> Self {
        match err {
            PasskeyError::Vault(core_err) => Self::from(core_err),
            other => Self::Passkey {
                msg: other.to_string(),
            },
        }
    }
}
