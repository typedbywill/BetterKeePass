//! Mensagens JSON trocadas entre a extensão de navegador, `bkp-proxy` e o aplicativo desktop.

use bkp_passkey::{
    CreateCredentialRequest, CreateCredentialResponse, GetAssertionRequest, GetAssertionResponse,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Navegador pareado armazenado nas configurações do aplicativo.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairedBrowser {
    pub id: Uuid,
    pub name: String,
    pub public_key_b64: String,
    pub paired_at: String,
}

/// Desafio de confirmação de pareamento exibido ao usuário.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingChallenge {
    pub browser_id: Uuid,
    pub confirmation_code: String,
}

/// Candidato a preenchimento automático (sem expor outros registros do cofre).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginCandidate {
    pub entry_uuid: Uuid,
    pub title: String,
    pub username: String,
    pub password: String,
    pub totp: Option<String>,
}

/// Códigos de erro estruturados do protocolo.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub enum ErrorCode {
    AppOffline,
    VaultLocked,
    UserCancelled,
    PairingRequired,
    InvalidRequest,
    InternalError,
}

/// Requisições enviadas pela extensão / `bkp-proxy` ao aplicativo desktop.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "PascalCase")]
pub enum ClientRequest {
    Ping,
    PairInit {
        browser_name: String,
        client_public_key_b64: String,
    },
    PairConfirm {
        browser_id: Uuid,
        confirmation_code: String,
    },
    GetLogins {
        origin: String,
    },
    SaveLogin {
        origin: String,
        title: String,
        username: String,
        password: String,
    },
    GetTotp {
        entry_uuid: Uuid,
    },
    PasskeyCreate {
        request: CreateCredentialRequest,
    },
    PasskeyGet {
        request: GetAssertionRequest,
        allow_credential_ids: Vec<String>,
    },
}

/// Respostas retornadas pelo aplicativo desktop.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "PascalCase")]
pub enum HostResponse {
    Pong {
        version: String,
        vault_unlocked: bool,
    },
    PairChallenge {
        challenge: PairingChallenge,
    },
    Paired {
        browser: PairedBrowser,
    },
    Logins {
        candidates: Vec<LoginCandidate>,
    },
    LoginSaved {
        entry_uuid: Uuid,
    },
    Totp {
        code: String,
        valid_for_secs: u64,
    },
    PasskeyCreated {
        response: CreateCredentialResponse,
    },
    PasskeyAssertion {
        response: GetAssertionResponse,
    },
    Error {
        code: ErrorCode,
        message: String,
    },
}
