//! Cálculo de códigos TOTP (RFC 6238) a partir de entradas `.kdbx` e URIs `otpauth://`.

use std::time::{SystemTime, UNIX_EPOCH};

use keepass::db::{Entry, TOTP};
use serde::{Deserialize, Serialize};

use crate::error::{CoreError, Result};

/// Código TOTP gerado com sua janela de validade.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OtpCode {
    /// Código numérico formatado (com zeros à esquerda).
    pub code: String,
    /// Segundos restantes de validade no intervalo atual.
    pub valid_for_secs: u64,
    /// Período configurado em segundos.
    pub period_secs: u64,
}

/// Gera o código TOTP atual para uma entrada que possua o campo `otp`.
pub fn totp_from_entry(entry: &Entry) -> Result<OtpCode> {
    let otp = entry.get_otp()?;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| {
            CoreError::InvalidInput("relógio do sistema anterior à época Unix".to_owned())
        })?
        .as_secs();
    Ok(from_keepass_otp(&otp, now))
}

/// Gera um código TOTP a partir de uma URI `otpauth://` em um instante Unix específico.
pub fn totp_from_uri_at(uri: &str, unix_secs: u64) -> Result<OtpCode> {
    let otp: TOTP = uri.parse()?;
    Ok(from_keepass_otp(&otp, unix_secs))
}

fn from_keepass_otp(otp: &TOTP, unix_secs: u64) -> OtpCode {
    let generated = otp.value_at(unix_secs);
    OtpCode {
        code: generated.code,
        valid_for_secs: generated.valid_for.as_secs(),
        period_secs: generated.period.as_secs(),
    }
}
