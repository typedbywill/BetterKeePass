//! Autenticador WebAuthn (`create` / `get`, `authData`, COSE, `signCount`).
//!
//! A implementação completa do autenticador chega na Fase 3. Nesta fase, o crate
//! expõe as constantes de atributos compatíveis com o formato KeePassXC 2.7.7+.

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
