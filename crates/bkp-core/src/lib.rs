//! Núcleo do BetterKeePass: gerenciamento de cofres `.kdbx`, busca, geração de senhas/passphrases,
//! TOTP, histórico, merge/sync, análise de saúde e importação/exportação.

pub mod config;
pub mod eff_wordlist;
pub mod error;
pub mod generator;
pub mod health;
pub mod io_formats;
pub mod merge;
pub mod search;
pub mod sync;
pub mod totp;
pub mod vault;

pub use config::{
    AppConfig, BrowserIntegrationConfig, ClipboardConfig, SecretServiceConfig, SecurityConfig,
    SshAgentConfig, UiConfig,
};
pub use error::{CoreError, Result};
pub use generator::{PasswordOptions, generate_passphrase, generate_password};
pub use health::{
    EntryHealthIssue, HealthIssueKind, HealthReport, analyze_health, hibp_sha1_prefix_and_suffix,
    parse_hibp_range_response,
};
pub use io_formats::{
    ImportReport, export_csv, import_1pux_json, import_bitwarden_json, import_csv,
};
pub use merge::MergeReport;
pub use sync::{SyncOutcome, SyncPlan, sync_with_file};
pub use totp::{OtpCode, totp_from_uri_at};
pub use vault::{
    CustomFieldInput, CustomFieldView, EntryDetails, EntryPatch, EntrySummary, GroupNode,
    HistoryEntrySummary, NewEntry, Vault,
};
