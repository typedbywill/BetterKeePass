//! Autenticador WebAuthn (`create` / `get`, `authData`, COSE, `signCount`) e
//! armazenamento compatível com o formato KeePassXC 2.7.7+ no `.kdbx`.

pub mod native_provider;

use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use bkp_core::{CustomFieldInput, EntryPatch, NewEntry, Vault};
use coset::{CborSerializable, CoseKeyBuilder, iana};
use ed25519_dalek::{Signer as _, SigningKey as EdSigningKey};
use p256::ecdsa::{Signature as P256Signature, SigningKey as P256SigningKey};
use pkcs8::{DecodePrivateKey, EncodePrivateKey, LineEnding};
use secrecy::{ExposeSecret, SecretString};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;
use uuid::Uuid;

/// Tag atribuída a entradas que armazenam passkeys no `.kdbx`.
pub const PASSKEY_TAG: &str = "Passkey";

/// ID da credencial codificado em Base64URL (atributo protegido).
pub const KPEX_PASSKEY_CREDENTIAL_ID: &str = "KPEX_PASSKEY_CREDENTIAL_ID";

/// Chave privada PKCS#8 em PEM (atributo protegido).
pub const KPEX_PASSKEY_PRIVATE_KEY_PEM: &str = "KPEX_PASSKEY_PRIVATE_KEY_PEM";

/// Relying Party ID (`rp.id`) (atributo protegido).
pub const KPEX_PASSKEY_RELYING_PARTY: &str = "KPEX_PASSKEY_RELYING_PARTY";

/// Nome de usuário da conta (atributo protegido).
pub const KPEX_PASSKEY_USERNAME: &str = "KPEX_PASSKEY_USERNAME";

/// Identificador opaco do usuário (`user.id`) em Base64URL (atributo protegido).
pub const KPEX_PASSKEY_USER_HANDLE: &str = "KPEX_PASSKEY_USER_HANDLE";

/// Contador de assinaturas específico do BetterKeePass (`signCount`).
pub const BKP_PASSKEY_SIGN_COUNT: &str = "BKP_PASSKEY_SIGN_COUNT";

/// Flags de backup (`BE`/`BS`) específicas do BetterKeePass.
pub const BKP_PASSKEY_BACKUP_FLAGS: &str = "BKP_PASSKEY_BACKUP_FLAGS";

/// Algoritmo COSE específico do BetterKeePass (`-7` para ES256, `-8` para EdDSA).
pub const BKP_PASSKEY_ALGORITHM: &str = "BKP_PASSKEY_ALGORITHM";

// AAGUID fixo do autenticador BetterKeePass (`BKP1` em ASCII + UUID v4 determinístico).
const BKP_AAGUID: [u8; 16] = *b"BetterKeePassPK1";

/// Erros do módulo de passkeys.
#[derive(Debug, Error)]
pub enum PasskeyError {
    #[error("erro ao gerar entropia: {0}")]
    Random(#[from] getrandom::Error),
    #[error("erro criptográfico: {0}")]
    Crypto(String),
    #[error("erro de codificação CBOR/COSE: {0}")]
    Cbor(String),
    #[error("Relying Party não corresponde: esperado '{expected}', recebido '{actual}'")]
    RpMismatch { expected: String, actual: String },
    #[error("erro no cofre: {0}")]
    Vault(#[from] bkp_core::CoreError),
    #[error("passkey inválida ou incompleta: {0}")]
    InvalidRecord(String),
}

/// Algoritmo COSE suportado pelo autenticador.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PasskeyAlgorithm {
    /// ECDSA com P-256 e SHA-256 (COSE `-7`).
    Es256 = -7,
    /// Ed25519 EdDSA (COSE `-8`).
    EdDsa = -8,
}

impl PasskeyAlgorithm {
    /// Código numérico COSE correspondente.
    #[must_use]
    pub const fn cose_id(self) -> i64 {
        self as i64
    }

    /// Converte um código COSE em `PasskeyAlgorithm`, quando suportado.
    #[must_use]
    pub const fn from_cose_id(id: i64) -> Option<Self> {
        match id {
            -7 => Some(Self::Es256),
            -8 => Some(Self::EdDsa),
            _ => None,
        }
    }
}

/// Registro persistível de uma passkey no formato KeePassXC + extensões BKP.
#[derive(Debug, Clone)]
pub struct PasskeyRecord {
    pub credential_id_b64: String,
    pub private_key_pem: SecretString,
    pub rp_id: String,
    pub username: String,
    pub user_handle_b64: String,
    pub sign_count: u32,
    pub backup_eligible: bool,
    pub backup_state: bool,
    pub algorithm: PasskeyAlgorithm,
}

/// Requisição para criação de uma credencial WebAuthn (`navigator.credentials.create`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCredentialRequest {
    pub rp_id: String,
    pub rp_name: String,
    pub username: String,
    pub user_display_name: String,
    pub user_handle_b64: String,
    pub client_data_hash_b64: String,
    pub algorithm: PasskeyAlgorithm,
    pub user_verified: bool,
}

/// Resposta WebAuthn retornada após `create_credential`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCredentialResponse {
    pub credential_id_b64: String,
    pub attestation_object_b64: String,
    pub auth_data_b64: String,
    pub public_key_cose_b64: String,
}

/// Requisição para asserção WebAuthn (`navigator.credentials.get`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetAssertionRequest {
    pub rp_id: String,
    pub client_data_hash_b64: String,
    pub user_verified: bool,
}

/// Resposta WebAuthn retornada após `get_assertion`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetAssertionResponse {
    pub credential_id_b64: String,
    pub authenticator_data_b64: String,
    pub signature_b64: String,
    pub user_handle_b64: String,
    pub sign_count: u32,
}

/// Gera um novo par de chaves e monta `authData` + `attestationObject` (fmt `none`).
pub fn create_credential(
    req: &CreateCredentialRequest,
) -> Result<(PasskeyRecord, CreateCredentialResponse), PasskeyError> {
    if req.rp_id.trim().is_empty() {
        return Err(PasskeyError::InvalidRecord("rp_id vazio".to_owned()));
    }

    let mut cred_id = [0u8; 32];
    getrandom::fill(&mut cred_id)?;
    let credential_id_b64 = URL_SAFE_NO_PAD.encode(cred_id);

    let (private_key_pem, cose_pub_bytes) = match req.algorithm {
        PasskeyAlgorithm::Es256 => generate_es256_keypair()?,
        PasskeyAlgorithm::EdDsa => generate_eddsa_keypair()?,
    };

    let flags = build_flags(req.user_verified, true, true, true, false);
    let rp_id_hash = Sha256::digest(req.rp_id.as_bytes());

    let mut auth_data = Vec::with_capacity(55 + cred_id.len() + cose_pub_bytes.len());
    auth_data.extend_from_slice(&rp_id_hash);
    auth_data.push(flags);
    auth_data.extend_from_slice(&0_u32.to_be_bytes());
    auth_data.extend_from_slice(&BKP_AAGUID);
    let cred_len = u16::try_from(cred_id.len())
        .map_err(|_| PasskeyError::InvalidRecord("cred_id muito longo".to_owned()))?;
    auth_data.extend_from_slice(&cred_len.to_be_bytes());
    auth_data.extend_from_slice(&cred_id);
    auth_data.extend_from_slice(&cose_pub_bytes);

    let attestation_object = build_none_attestation(&auth_data)?;

    let record = PasskeyRecord {
        credential_id_b64: credential_id_b64.clone(),
        private_key_pem,
        rp_id: req.rp_id.clone(),
        username: req.username.clone(),
        user_handle_b64: req.user_handle_b64.clone(),
        sign_count: 0,
        backup_eligible: true,
        backup_state: true,
        algorithm: req.algorithm,
    };

    let response = CreateCredentialResponse {
        credential_id_b64,
        attestation_object_b64: URL_SAFE_NO_PAD.encode(attestation_object),
        auth_data_b64: URL_SAFE_NO_PAD.encode(auth_data),
        public_key_cose_b64: URL_SAFE_NO_PAD.encode(cose_pub_bytes),
    };

    Ok((record, response))
}

/// Assina um desafio WebAuthn incrementando `sign_count` e construindo `authenticatorData`.
pub fn get_assertion(
    record: &mut PasskeyRecord,
    req: &GetAssertionRequest,
) -> Result<GetAssertionResponse, PasskeyError> {
    if record.rp_id != req.rp_id {
        return Err(PasskeyError::RpMismatch {
            expected: record.rp_id.clone(),
            actual: req.rp_id.clone(),
        });
    }

    let client_data_hash = URL_SAFE_NO_PAD
        .decode(&req.client_data_hash_b64)
        .map_err(|e| PasskeyError::InvalidRecord(format!("client_data_hash inválido: {e}")))?;

    record.sign_count = record.sign_count.saturating_add(1);
    let flags = build_flags(
        req.user_verified,
        false,
        record.backup_eligible,
        record.backup_state,
        false,
    );
    let rp_id_hash = Sha256::digest(req.rp_id.as_bytes());

    let mut auth_data = Vec::with_capacity(37);
    auth_data.extend_from_slice(&rp_id_hash);
    auth_data.push(flags);
    auth_data.extend_from_slice(&record.sign_count.to_be_bytes());

    let mut to_sign = Vec::with_capacity(auth_data.len() + client_data_hash.len());
    to_sign.extend_from_slice(&auth_data);
    to_sign.extend_from_slice(&client_data_hash);

    let signature = match record.algorithm {
        PasskeyAlgorithm::Es256 => {
            let signing_key =
                P256SigningKey::from_pkcs8_pem(record.private_key_pem.expose_secret())
                    .map_err(|e| PasskeyError::Crypto(e.to_string()))?;
            let sig: P256Signature = signing_key.sign(&to_sign);
            sig.to_der().as_bytes().to_vec()
        }
        PasskeyAlgorithm::EdDsa => {
            let signing_key = EdSigningKey::from_pkcs8_pem(record.private_key_pem.expose_secret())
                .map_err(|e| PasskeyError::Crypto(e.to_string()))?;
            signing_key.sign(&to_sign).to_bytes().to_vec()
        }
    };

    Ok(GetAssertionResponse {
        credential_id_b64: record.credential_id_b64.clone(),
        authenticator_data_b64: URL_SAFE_NO_PAD.encode(auth_data),
        signature_b64: URL_SAFE_NO_PAD.encode(signature),
        user_handle_b64: record.user_handle_b64.clone(),
        sign_count: record.sign_count,
    })
}

/// Salva uma nova passkey no cofre como atributos protegidos compatíveis com KeePassXC.
pub fn store_in_vault(
    vault: &mut Vault,
    group_path: Option<&str>,
    record: &PasskeyRecord,
) -> Result<Uuid, PasskeyError> {
    let custom_fields = build_passkey_fields(record);
    let title = format!("{} ({})", record.rp_id, record.username);
    let uuid = vault.add_entry(
        group_path,
        NewEntry {
            title,
            username: Some(record.username.clone()),
            url: Some(format!("https://{}", record.rp_id)),
            tags: vec![PASSKEY_TAG.to_owned()],
            custom_fields,
            ..NewEntry::default()
        },
    )?;
    Ok(uuid)
}

/// Atualiza `sign_count` e flags de backup de uma passkey já existente no cofre.
pub fn update_sign_count_in_vault(
    vault: &mut Vault,
    entry_uuid: Uuid,
    record: &PasskeyRecord,
) -> Result<(), PasskeyError> {
    vault.edit_entry(
        entry_uuid,
        EntryPatch {
            custom_fields: vec![CustomFieldInput {
                name: BKP_PASSKEY_SIGN_COUNT.to_owned(),
                value: SecretString::from(record.sign_count.to_string()),
                protected: false,
            }],
            ..EntryPatch::default()
        },
    )?;
    Ok(())
}

/// Procura passkeys registradas no cofre para um `rp_id` (opcionalmente filtrando por `allow_ids`).
#[must_use]
pub fn find_in_vault(
    vault: &Vault,
    rp_id: &str,
    allow_credential_ids: &[String],
) -> Vec<(Uuid, PasskeyRecord)> {
    let Ok(entries) = vault.list(None, true) else {
        return Vec::new();
    };
    let mut matches = Vec::new();

    for summary in entries {
        if !summary.tags.iter().any(|t| t == PASSKEY_TAG) {
            continue;
        }
        let Ok(Some(entry_rp)) = vault.entry_field_secret(summary.uuid, KPEX_PASSKEY_RELYING_PARTY)
        else {
            continue;
        };
        if entry_rp.expose_secret() != rp_id {
            continue;
        }
        let Ok(Some(cred_id)) = vault.entry_field_secret(summary.uuid, KPEX_PASSKEY_CREDENTIAL_ID)
        else {
            continue;
        };
        if !allow_credential_ids.is_empty()
            && !allow_credential_ids
                .iter()
                .any(|allowed| allowed == cred_id.expose_secret())
        {
            continue;
        }
        let Ok(Some(pem)) = vault.entry_field_secret(summary.uuid, KPEX_PASSKEY_PRIVATE_KEY_PEM)
        else {
            continue;
        };
        let username = vault
            .entry_field_secret(summary.uuid, KPEX_PASSKEY_USERNAME)
            .ok()
            .flatten()
            .map_or_else(
                || summary.username.clone(),
                |s| s.expose_secret().to_owned(),
            );
        let user_handle = vault
            .entry_field_secret(summary.uuid, KPEX_PASSKEY_USER_HANDLE)
            .ok()
            .flatten()
            .map(|s| s.expose_secret().to_owned())
            .unwrap_or_default();
        let sign_count = vault
            .entry_field_secret(summary.uuid, BKP_PASSKEY_SIGN_COUNT)
            .ok()
            .flatten()
            .and_then(|s| s.expose_secret().parse::<u32>().ok())
            .unwrap_or(0);
        let algorithm = vault
            .entry_field_secret(summary.uuid, BKP_PASSKEY_ALGORITHM)
            .ok()
            .flatten()
            .and_then(|s| s.expose_secret().parse::<i64>().ok())
            .and_then(PasskeyAlgorithm::from_cose_id)
            .unwrap_or(PasskeyAlgorithm::Es256);

        matches.push((
            summary.uuid,
            PasskeyRecord {
                credential_id_b64: cred_id.expose_secret().to_owned(),
                private_key_pem: pem,
                rp_id: rp_id.to_owned(),
                username,
                user_handle_b64: user_handle,
                sign_count,
                backup_eligible: true,
                backup_state: true,
                algorithm,
            },
        ));
    }

    matches
}

fn build_passkey_fields(record: &PasskeyRecord) -> Vec<CustomFieldInput> {
    let backup_flags = format!(
        "BE={},BS={}",
        u8::from(record.backup_eligible),
        u8::from(record.backup_state)
    );
    vec![
        CustomFieldInput {
            name: KPEX_PASSKEY_CREDENTIAL_ID.to_owned(),
            value: SecretString::from(record.credential_id_b64.clone()),
            protected: true,
        },
        CustomFieldInput {
            name: KPEX_PASSKEY_PRIVATE_KEY_PEM.to_owned(),
            value: record.private_key_pem.clone(),
            protected: true,
        },
        CustomFieldInput {
            name: KPEX_PASSKEY_RELYING_PARTY.to_owned(),
            value: SecretString::from(record.rp_id.clone()),
            protected: true,
        },
        CustomFieldInput {
            name: KPEX_PASSKEY_USERNAME.to_owned(),
            value: SecretString::from(record.username.clone()),
            protected: true,
        },
        CustomFieldInput {
            name: KPEX_PASSKEY_USER_HANDLE.to_owned(),
            value: SecretString::from(record.user_handle_b64.clone()),
            protected: true,
        },
        CustomFieldInput {
            name: BKP_PASSKEY_SIGN_COUNT.to_owned(),
            value: SecretString::from(record.sign_count.to_string()),
            protected: false,
        },
        CustomFieldInput {
            name: BKP_PASSKEY_BACKUP_FLAGS.to_owned(),
            value: SecretString::from(backup_flags),
            protected: false,
        },
        CustomFieldInput {
            name: BKP_PASSKEY_ALGORITHM.to_owned(),
            value: SecretString::from(record.algorithm.cose_id().to_string()),
            protected: false,
        },
    ]
}

fn generate_es256_keypair() -> Result<(SecretString, Vec<u8>), PasskeyError> {
    let mut seed = [0u8; 32];
    let signing_key = loop {
        getrandom::fill(&mut seed)?;
        if let Ok(key) = P256SigningKey::from_slice(&seed) {
            break key;
        }
    };
    let pem = signing_key
        .to_pkcs8_pem(LineEnding::LF)
        .map_err(|e| PasskeyError::Crypto(e.to_string()))?;
    let verifying_key = signing_key.verifying_key();
    let encoded_point = verifying_key.to_encoded_point(false);
    let x = encoded_point
        .x()
        .ok_or_else(|| PasskeyError::Crypto("coordenada X ausente".to_owned()))?
        .to_vec();
    let y = encoded_point
        .y()
        .ok_or_else(|| PasskeyError::Crypto("coordenada Y ausente".to_owned()))?
        .to_vec();

    let cose_key = CoseKeyBuilder::new_ec2_pub_key(iana::EllipticCurve::P_256, x, y)
        .algorithm(iana::Algorithm::ES256)
        .build()
        .to_vec()
        .map_err(|e| PasskeyError::Cbor(e.to_string()))?;

    Ok((SecretString::from(pem.to_string()), cose_key))
}

fn generate_eddsa_keypair() -> Result<(SecretString, Vec<u8>), PasskeyError> {
    let mut seed = [0u8; 32];
    getrandom::fill(&mut seed)?;
    let signing_key = EdSigningKey::from_bytes(&seed);
    let pem = signing_key
        .to_pkcs8_pem(LineEnding::LF)
        .map_err(|e| PasskeyError::Crypto(e.to_string()))?;
    let pub_bytes = signing_key.verifying_key().to_bytes().to_vec();

    let cose_key = CoseKeyBuilder::new_okp_key()
        .param(
            iana::OkpKeyParameter::Crv as i64,
            ciborium::Value::Integer((iana::EllipticCurve::Ed25519 as i64).into()),
        )
        .param(
            iana::OkpKeyParameter::X as i64,
            ciborium::Value::Bytes(pub_bytes),
        )
        .algorithm(iana::Algorithm::EdDSA)
        .build()
        .to_vec()
        .map_err(|e| PasskeyError::Cbor(e.to_string()))?;

    Ok((SecretString::from(pem.to_string()), cose_key))
}

fn build_none_attestation(auth_data: &[u8]) -> Result<Vec<u8>, PasskeyError> {
    let map = vec![
        (
            ciborium::Value::Text("fmt".to_owned()),
            ciborium::Value::Text("none".to_owned()),
        ),
        (
            ciborium::Value::Text("attStmt".to_owned()),
            ciborium::Value::Map(Vec::new()),
        ),
        (
            ciborium::Value::Text("authData".to_owned()),
            ciborium::Value::Bytes(auth_data.to_vec()),
        ),
    ];

    let mut out = Vec::new();
    ciborium::into_writer(&ciborium::Value::Map(map), &mut out)
        .map_err(|e| PasskeyError::Cbor(e.to_string()))?;
    Ok(out)
}

#[allow(clippy::fn_params_excessive_bools)]
const fn build_flags(
    user_verified: bool,
    attested_credential_data: bool,
    backup_eligible: bool,
    backup_state: bool,
    extensions: bool,
) -> u8 {
    let mut flags = 0x01; // UP (User Present)
    if user_verified {
        flags |= 0x04;
    }
    if backup_eligible {
        flags |= 0x08;
    }
    if backup_state {
        flags |= 0x10;
    }
    if attested_credential_data {
        flags |= 0x40;
    }
    if extensions {
        flags |= 0x80;
    }
    flags
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signature as EdSignature, Verifier as _};
    use p256::ecdsa::VerifyingKey as P256VerifyingKey;

    #[test]
    fn webauthn_es256_create_assert_and_vault_roundtrip() {
        let client_hash = Sha256::digest(br#"{"type":"webauthn.create","challenge":"abc"}"#);
        let req = CreateCredentialRequest {
            rp_id: "github.com".to_owned(),
            rp_name: "GitHub".to_owned(),
            username: "octocat".to_owned(),
            user_display_name: "Octocat".to_owned(),
            user_handle_b64: URL_SAFE_NO_PAD.encode(b"user-42"),
            client_data_hash_b64: URL_SAFE_NO_PAD.encode(client_hash),
            algorithm: PasskeyAlgorithm::Es256,
            user_verified: true,
        };

        let (mut record, created) = create_credential(&req).unwrap();
        let auth_data = URL_SAFE_NO_PAD.decode(&created.auth_data_b64).unwrap();
        assert_eq!(&auth_data[..32], Sha256::digest(b"github.com").as_slice());
        assert_ne!(auth_data[32] & 0x45, 0); // UP + UV + AT

        let get_hash = Sha256::digest(br#"{"type":"webauthn.get","challenge":"xyz"}"#);
        let assertion = get_assertion(
            &mut record,
            &GetAssertionRequest {
                rp_id: "github.com".to_owned(),
                client_data_hash_b64: URL_SAFE_NO_PAD.encode(get_hash),
                user_verified: true,
            },
        )
        .unwrap();
        assert_eq!(assertion.sign_count, 1);

        // Verifica assinatura real com chave pública extraída do PEM
        let sk = P256SigningKey::from_pkcs8_pem(record.private_key_pem.expose_secret()).unwrap();
        let vk = P256VerifyingKey::from(&sk);
        let mut signed_msg = URL_SAFE_NO_PAD
            .decode(&assertion.authenticator_data_b64)
            .unwrap();
        signed_msg.extend_from_slice(&get_hash);
        let der_sig = URL_SAFE_NO_PAD.decode(&assertion.signature_b64).unwrap();
        let sig = P256Signature::from_der(&der_sig).unwrap();
        vk.verify(&signed_msg, &sig).unwrap();

        let mut vault = Vault::create(None);
        let uuid = store_in_vault(&mut vault, Some("Passkeys"), &record).unwrap();
        update_sign_count_in_vault(&mut vault, uuid, &record).unwrap();
        let found = find_in_vault(&vault, "github.com", &[]);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].1.sign_count, 1);
    }

    #[test]
    fn webauthn_eddsa_create_and_verify() {
        let client_hash = Sha256::digest(b"create");
        let req = CreateCredentialRequest {
            rp_id: "passkeys.io".to_owned(),
            rp_name: "Passkeys.io".to_owned(),
            username: "alice".to_owned(),
            user_display_name: "Alice".to_owned(),
            user_handle_b64: URL_SAFE_NO_PAD.encode(b"alice-id"),
            client_data_hash_b64: URL_SAFE_NO_PAD.encode(client_hash),
            algorithm: PasskeyAlgorithm::EdDsa,
            user_verified: true,
        };
        let (mut record, _created) = create_credential(&req).unwrap();
        let get_hash = Sha256::digest(b"get");
        let assertion = get_assertion(
            &mut record,
            &GetAssertionRequest {
                rp_id: "passkeys.io".to_owned(),
                client_data_hash_b64: URL_SAFE_NO_PAD.encode(get_hash),
                user_verified: true,
            },
        )
        .unwrap();

        let sk = EdSigningKey::from_pkcs8_pem(record.private_key_pem.expose_secret()).unwrap();
        let vk = sk.verifying_key();
        let mut signed_msg = URL_SAFE_NO_PAD
            .decode(&assertion.authenticator_data_b64)
            .unwrap();
        signed_msg.extend_from_slice(&get_hash);
        let sig_bytes = URL_SAFE_NO_PAD.decode(&assertion.signature_b64).unwrap();
        let sig = EdSignature::from_slice(&sig_bytes).unwrap();
        vk.verify(&signed_msg, &sig).unwrap();
    }
}
