//! Desbloqueio rápido nativo (Linux `fprintd`/TPM2, Windows Hello, macOS Touch ID).

use serde::{Deserialize, Serialize};

/// Backends suportados para desbloqueio rápido do cofre já aberto.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum QuickUnlockBackend {
    LinuxFprintd,
    LinuxTpm2,
    WindowsHello,
    MacOsTouchId,
    Unavailable,
}

/// Contrato de desbloqueio rápido por biometria ou enclave do SO.
pub trait QuickUnlock: Send + Sync {
    fn backend(&self) -> QuickUnlockBackend;
    fn is_configured(&self) -> bool;
}

/// Detecta o backend de desbloqueio rápido esperado na plataforma atual.
#[must_use]
pub fn detect_quick_unlock_backend() -> QuickUnlockBackend {
    #[cfg(target_os = "linux")]
    {
        if std::path::Path::new("/dev/tpmrm0").exists() {
            QuickUnlockBackend::LinuxTpm2
        } else {
            QuickUnlockBackend::LinuxFprintd
        }
    }
    #[cfg(target_os = "windows")]
    {
        QuickUnlockBackend::WindowsHello
    }
    #[cfg(target_os = "macos")]
    {
        QuickUnlockBackend::MacOsTouchId
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
    {
        QuickUnlockBackend::Unavailable
    }
}
