//! Núcleo do BetterKeePass: gerenciamento de cofres `.kdbx`, busca, geração de senhas e TOTP.

pub mod error;
pub mod generator;
pub mod totp;
pub mod vault;

pub use error::{CoreError, Result};
pub use generator::{PasswordOptions, generate_password};
pub use totp::{OtpCode, totp_from_uri_at};
pub use vault::{
    CustomFieldInput, CustomFieldView, EntryDetails, EntryPatch, EntrySummary, NewEntry, Vault,
};
