//! Traits de integração por sistema operacional.
//!
//! As implementações concretas para Linux, Windows e macOS serão adicionadas na Fase 4.

/// Execução de sequências de digitação automática (Auto-Type).
pub trait AutoType {}

/// Desbloqueio rápido via biometria, TPM ou provedor nativo do SO.
pub trait QuickUnlock {}

/// Provedor D-Bus Secret Service (`org.freedesktop.secrets`) no Linux.
pub trait SecretService {}

/// Integração com agente SSH (`ssh-agent` / Pageant / OpenSSH).
pub trait SshAgent {}
