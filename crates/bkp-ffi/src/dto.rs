//! Tipos de transferência (DTOs) expostos via UniFFI.

use bkp_core::{
    CustomFieldInput, CustomFieldView, EntryDetails, EntryHealthIssue, EntryPatch, EntrySummary,
    GroupNode, HealthIssueKind, HealthReport, HistoryEntrySummary, MergeReport, NewEntry, OtpCode,
    PasswordOptions,
};
use bkp_passkey::{
    CreateCredentialRequest, CreateCredentialResponse, GetAssertionResponse, PasskeyAlgorithm,
    PasskeyRecord,
};
use secrecy::SecretString;

/// Metadados públicos de uma entrada (sem segredos).
#[derive(Debug, Clone, uniffi::Record)]
#[allow(clippy::struct_excessive_bools)]
pub struct EntrySummaryDto {
    pub uuid: String,
    pub title: String,
    pub username: String,
    pub url: String,
    pub tags: Vec<String>,
    pub group_path: String,
    pub icon_id: Option<u32>,
    pub custom_icon_uuid: Option<String>,
    pub has_password: bool,
    pub has_otp: bool,
    pub has_passkey: bool,
    pub has_notes: bool,
}

impl From<EntrySummary> for EntrySummaryDto {
    fn from(value: EntrySummary) -> Self {
        Self {
            uuid: value.uuid.to_string(),
            title: value.title,
            username: value.username,
            url: value.url,
            tags: value.tags,
            group_path: value.group_path,
            icon_id: value.icon_id.and_then(|id| u32::try_from(id).ok()),
            custom_icon_uuid: value.custom_icon_uuid.map(|u| u.to_string()),
            has_password: value.has_password,
            has_otp: value.has_otp,
            has_passkey: value.has_passkey,
            has_notes: value.has_notes,
        }
    }
}

/// Nó da árvore de grupos do cofre.
#[derive(Debug, Clone, uniffi::Record)]
pub struct GroupNodeDto {
    pub uuid: String,
    pub name: String,
    pub path: String,
    pub entry_count: u32,
    pub is_recycle_bin: bool,
    pub icon_id: Option<u32>,
    pub custom_icon_uuid: Option<String>,
    pub children: Vec<GroupNodeDto>,
}

impl From<GroupNode> for GroupNodeDto {
    fn from(value: GroupNode) -> Self {
        Self {
            uuid: value.uuid.to_string(),
            name: value.name,
            path: value.path,
            entry_count: u32::try_from(value.entry_count).unwrap_or(u32::MAX),
            is_recycle_bin: value.is_recycle_bin,
            icon_id: value.icon_id.and_then(|id| u32::try_from(id).ok()),
            custom_icon_uuid: value.custom_icon_uuid.map(|u| u.to_string()),
            children: value.children.into_iter().map(Self::from).collect(),
        }
    }
}

/// Visualização de um campo customizado (valor `None` quando protegido).
#[derive(Debug, Clone, uniffi::Record)]
pub struct CustomFieldViewDto {
    pub name: String,
    pub value: Option<String>,
    pub protected: bool,
}

impl From<CustomFieldView> for CustomFieldViewDto {
    fn from(value: CustomFieldView) -> Self {
        Self {
            name: value.name,
            value: value.value,
            protected: value.protected,
        }
    }
}

/// Detalhes completos de uma entrada sem expor segredos protegidos.
#[derive(Debug, Clone, uniffi::Record)]
pub struct EntryDetailsDto {
    pub summary: EntrySummaryDto,
    pub notes: String,
    pub has_otp: bool,
    pub custom_fields: Vec<CustomFieldViewDto>,
    pub attachments: Vec<String>,
}

impl From<EntryDetails> for EntryDetailsDto {
    fn from(value: EntryDetails) -> Self {
        Self {
            summary: value.summary.into(),
            notes: value.notes,
            has_otp: value.has_otp,
            custom_fields: value.custom_fields.into_iter().map(Into::into).collect(),
            attachments: value.attachments,
        }
    }
}

/// Entrada de campo customizado para criação ou edição.
#[derive(Debug, Clone, uniffi::Record)]
pub struct CustomFieldInputDto {
    pub name: String,
    pub value: String,
    pub protected: bool,
}

impl From<CustomFieldInputDto> for CustomFieldInput {
    fn from(value: CustomFieldInputDto) -> Self {
        Self {
            name: value.name,
            value: SecretString::from(value.value),
            protected: value.protected,
        }
    }
}

/// Dados para criação de uma nova entrada.
#[derive(Debug, Clone, uniffi::Record)]
pub struct NewEntryDto {
    pub group_path: Option<String>,
    pub title: String,
    pub username: Option<String>,
    pub password: Option<String>,
    pub url: Option<String>,
    pub notes: Option<String>,
    pub tags: Vec<String>,
    pub custom_fields: Vec<CustomFieldInputDto>,
}

impl From<NewEntryDto> for NewEntry {
    fn from(value: NewEntryDto) -> Self {
        Self {
            title: value.title,
            username: value.username,
            password: value.password.map(SecretString::from),
            url: value.url,
            notes: value.notes,
            tags: value.tags,
            custom_fields: value.custom_fields.into_iter().map(Into::into).collect(),
        }
    }
}

/// Alterações parciais aplicáveis a uma entrada existente.
#[derive(Debug, Clone, uniffi::Record)]
pub struct EntryPatchDto {
    pub title: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub url: Option<String>,
    pub notes: Option<String>,
    pub tags: Option<Vec<String>>,
    pub custom_fields: Vec<CustomFieldInputDto>,
    pub remove_custom_fields: Vec<String>,
}

impl From<EntryPatchDto> for EntryPatch {
    fn from(value: EntryPatchDto) -> Self {
        Self {
            title: value.title,
            username: value.username,
            password: value.password.map(SecretString::from),
            url: value.url,
            notes: value.notes,
            tags: value.tags,
            custom_fields: value.custom_fields.into_iter().map(Into::into).collect(),
            remove_custom_fields: value.remove_custom_fields,
        }
    }
}

/// Código TOTP atual e janela restante.
#[derive(Debug, Clone, uniffi::Record)]
pub struct OtpCodeDto {
    pub code: String,
    pub valid_for_secs: u64,
    pub period_secs: u64,
}

impl From<OtpCode> for OtpCodeDto {
    fn from(value: OtpCode) -> Self {
        Self {
            code: value.code,
            valid_for_secs: value.valid_for_secs,
            period_secs: value.period_secs,
        }
    }
}

/// Revisão no histórico de uma entrada.
#[derive(Debug, Clone, uniffi::Record)]
pub struct HistoryEntrySummaryDto {
    pub index: u32,
    pub title: String,
    pub username: String,
    pub last_modified: Option<String>,
}

impl From<HistoryEntrySummary> for HistoryEntrySummaryDto {
    fn from(value: HistoryEntrySummary) -> Self {
        Self {
            index: u32::try_from(value.index).unwrap_or(u32::MAX),
            title: value.title,
            username: value.username,
            last_modified: value.last_modified,
        }
    }
}

/// Resumo de operação de merge entre dois cofres.
#[derive(Debug, Clone, uniffi::Record)]
pub struct MergeReportDto {
    pub added: u32,
    pub updated: u32,
    pub unchanged: u32,
}

impl From<MergeReport> for MergeReportDto {
    fn from(value: MergeReport) -> Self {
        Self {
            added: u32::try_from(value.added).unwrap_or(u32::MAX),
            updated: u32::try_from(value.updated).unwrap_or(u32::MAX),
            unchanged: u32::try_from(value.unchanged).unwrap_or(u32::MAX),
        }
    }
}

/// Opções para geração de senha aleatória.
#[derive(Debug, Clone, uniffi::Record)]
#[allow(clippy::struct_excessive_bools)]
pub struct PasswordOptionsDto {
    pub length: u32,
    pub lowercase: bool,
    pub uppercase: bool,
    pub digits: bool,
    pub symbols: bool,
    pub exclude_ambiguous: bool,
}

impl From<PasswordOptionsDto> for PasswordOptions {
    fn from(value: PasswordOptionsDto) -> Self {
        Self {
            length: value.length as usize,
            lowercase: value.lowercase,
            uppercase: value.uppercase,
            digits: value.digits,
            symbols: value.symbols,
            exclude_ambiguous: value.exclude_ambiguous,
        }
    }
}

/// Categoria de alerta de saúde de senha.
#[derive(Debug, Clone, Copy, uniffi::Enum)]
pub enum HealthIssueKindDto {
    EmptyPassword,
    WeakPassword,
    ReusedPassword,
}

impl From<HealthIssueKind> for HealthIssueKindDto {
    fn from(value: HealthIssueKind) -> Self {
        match value {
            HealthIssueKind::EmptyPassword => Self::EmptyPassword,
            HealthIssueKind::WeakPassword => Self::WeakPassword,
            HealthIssueKind::ReusedPassword => Self::ReusedPassword,
        }
    }
}

/// Problema detectado em uma entrada.
#[derive(Debug, Clone, uniffi::Record)]
pub struct EntryHealthIssueDto {
    pub uuid: String,
    pub title: String,
    pub group_path: String,
    pub score: u8,
    pub kind: HealthIssueKindDto,
}

impl From<EntryHealthIssue> for EntryHealthIssueDto {
    fn from(value: EntryHealthIssue) -> Self {
        Self {
            uuid: value.uuid.to_string(),
            title: value.title,
            group_path: value.group_path,
            score: value.score,
            kind: value.kind.into(),
        }
    }
}

/// Relatório consolidado de saúde do cofre.
#[derive(Debug, Clone, uniffi::Record)]
pub struct HealthReportDto {
    pub total_entries: u32,
    pub empty_count: u32,
    pub weak_count: u32,
    pub reused_count: u32,
    pub issues: Vec<EntryHealthIssueDto>,
}

impl From<HealthReport> for HealthReportDto {
    fn from(value: HealthReport) -> Self {
        Self {
            total_entries: u32::try_from(value.total_entries).unwrap_or(u32::MAX),
            empty_count: u32::try_from(value.empty_count).unwrap_or(u32::MAX),
            weak_count: u32::try_from(value.weak_count).unwrap_or(u32::MAX),
            reused_count: u32::try_from(value.reused_count).unwrap_or(u32::MAX),
            issues: value.issues.into_iter().map(Into::into).collect(),
        }
    }
}

/// Algoritmo COSE suportado para passkeys.
#[derive(Debug, Clone, Copy, uniffi::Enum)]
pub enum PasskeyAlgorithmDto {
    Es256,
    EdDsa,
}

impl From<PasskeyAlgorithmDto> for PasskeyAlgorithm {
    fn from(value: PasskeyAlgorithmDto) -> Self {
        match value {
            PasskeyAlgorithmDto::Es256 => Self::Es256,
            PasskeyAlgorithmDto::EdDsa => Self::EdDsa,
        }
    }
}

impl From<PasskeyAlgorithm> for PasskeyAlgorithmDto {
    fn from(value: PasskeyAlgorithm) -> Self {
        match value {
            PasskeyAlgorithm::Es256 => Self::Es256,
            PasskeyAlgorithm::EdDsa => Self::EdDsa,
        }
    }
}

/// Requisição para criação de passkey via FFI.
#[derive(Debug, Clone, uniffi::Record)]
pub struct PasskeyCreateRequestDto {
    pub rp_id: String,
    pub rp_name: String,
    pub username: String,
    pub user_display_name: String,
    pub user_handle_b64: String,
    pub client_data_hash_b64: String,
    pub algorithm: PasskeyAlgorithmDto,
    pub user_verified: bool,
    pub group_path: Option<String>,
}

impl From<&PasskeyCreateRequestDto> for CreateCredentialRequest {
    fn from(value: &PasskeyCreateRequestDto) -> Self {
        Self {
            rp_id: value.rp_id.clone(),
            rp_name: value.rp_name.clone(),
            username: value.username.clone(),
            user_display_name: value.user_display_name.clone(),
            user_handle_b64: value.user_handle_b64.clone(),
            client_data_hash_b64: value.client_data_hash_b64.clone(),
            algorithm: value.algorithm.into(),
            user_verified: value.user_verified,
        }
    }
}

/// Resposta de criação de passkey.
#[derive(Debug, Clone, uniffi::Record)]
pub struct PasskeyCreateResultDto {
    pub entry_uuid: String,
    pub credential_id_b64: String,
    pub attestation_object_b64: String,
    pub auth_data_b64: String,
    pub public_key_cose_b64: String,
}

impl PasskeyCreateResultDto {
    pub(crate) fn from_parts(entry_uuid: uuid::Uuid, res: CreateCredentialResponse) -> Self {
        Self {
            entry_uuid: entry_uuid.to_string(),
            credential_id_b64: res.credential_id_b64,
            attestation_object_b64: res.attestation_object_b64,
            auth_data_b64: res.auth_data_b64,
            public_key_cose_b64: res.public_key_cose_b64,
        }
    }
}

/// Resposta de asserção WebAuthn.
#[derive(Debug, Clone, uniffi::Record)]
pub struct PasskeyAssertionResultDto {
    pub entry_uuid: String,
    pub credential_id_b64: String,
    pub authenticator_data_b64: String,
    pub signature_b64: String,
    pub user_handle_b64: String,
    pub sign_count: u32,
}

impl PasskeyAssertionResultDto {
    pub(crate) fn from_parts(entry_uuid: uuid::Uuid, res: GetAssertionResponse) -> Self {
        Self {
            entry_uuid: entry_uuid.to_string(),
            credential_id_b64: res.credential_id_b64,
            authenticator_data_b64: res.authenticator_data_b64,
            signature_b64: res.signature_b64,
            user_handle_b64: res.user_handle_b64,
            sign_count: res.sign_count,
        }
    }
}

/// Metadados públicos de uma passkey armazenada no cofre.
#[derive(Debug, Clone, uniffi::Record)]
pub struct PasskeyInfoDto {
    pub entry_uuid: String,
    pub credential_id_b64: String,
    pub rp_id: String,
    pub username: String,
    pub user_handle_b64: String,
    pub sign_count: u32,
    pub algorithm: PasskeyAlgorithmDto,
}

impl PasskeyInfoDto {
    pub(crate) fn from_parts(entry_uuid: uuid::Uuid, record: PasskeyRecord) -> Self {
        Self {
            entry_uuid: entry_uuid.to_string(),
            credential_id_b64: record.credential_id_b64,
            rp_id: record.rp_id,
            username: record.username,
            user_handle_b64: record.user_handle_b64,
            sign_count: record.sign_count,
            algorithm: record.algorithm.into(),
        }
    }
}
