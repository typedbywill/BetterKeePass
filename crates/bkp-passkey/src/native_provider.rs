//! Contratos da Fase 6 para provedores nativos de passkeys no sistema operacional:
//! - Linux: `org.freedesktop.portal.Credentials` (`credentialsd`)
//! - Windows: Windows Plugin Authenticator API
//! - macOS: `ASCredentialProviderExtension`

use serde::{Deserialize, Serialize};

use crate::{
    CreateCredentialRequest, CreateCredentialResponse, GetAssertionRequest, GetAssertionResponse,
    PasskeyError,
};

/// Provedor nativo de sistema operacional suportado.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NativeProviderKind {
    LinuxCredentialsd,
    WindowsPluginAuthenticator,
    MacOsCredentialProvider,
}

/// Metadados de registro do autenticador junto ao SO.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeProviderStatus {
    pub kind: NativeProviderKind,
    pub available: bool,
    pub registered: bool,
    pub description: String,
}

/// Interface unificada de provedor de credenciais nativo do SO.
pub trait OsCredentialProvider: Send + Sync {
    fn status(&self) -> NativeProviderStatus;
    fn create_credential(
        &self,
        request: &CreateCredentialRequest,
    ) -> Result<CreateCredentialResponse, PasskeyError>;
    fn get_assertion(
        &self,
        request: &GetAssertionRequest,
    ) -> Result<GetAssertionResponse, PasskeyError>;
}

/// Detecta o provedor nativo esperado para a plataforma em tempo de compilação.
#[must_use]
pub fn detect_native_provider() -> NativeProviderStatus {
    #[cfg(target_os = "linux")]
    {
        NativeProviderStatus {
            kind: NativeProviderKind::LinuxCredentialsd,
            available: false,
            registered: false,
            description: "Portal xdg-credentials / credentialsd (requer sessão desktop compatível)"
                .to_owned(),
        }
    }
    #[cfg(target_os = "windows")]
    {
        NativeProviderStatus {
            kind: NativeProviderKind::WindowsPluginAuthenticator,
            available: false,
            registered: false,
            description: "Windows WebAuthn Plugin Authenticator API".to_owned(),
        }
    }
    #[cfg(target_os = "macos")]
    {
        NativeProviderStatus {
            kind: NativeProviderKind::MacOsCredentialProvider,
            available: false,
            registered: false,
            description: "macOS ASCredentialProviderExtension".to_owned(),
        }
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
    {
        NativeProviderStatus {
            kind: NativeProviderKind::LinuxCredentialsd,
            available: false,
            registered: false,
            description: "Plataforma sem provedor nativo de passkeys".to_owned(),
        }
    }
}
