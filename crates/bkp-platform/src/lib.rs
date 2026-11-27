//! Integrações de plataforma do BetterKeePass (Clipboard seguro, Auto-Type, SSH Agent,
//! Secret Service D-Bus, Quick Unlock, YubiKey e hardening de processo).

pub mod autotype;
pub mod clipboard;
pub mod hardening;
pub mod quick_unlock;
pub mod secret_service;
pub mod ssh_agent;
pub mod yubikey;

pub use autotype::{AutoType, AutoTypeAction, NoopAutoType, parse_autotype_sequence};
pub use clipboard::ClipboardManager;
pub use hardening::{HardeningStatus, current_hardening_status};
pub use quick_unlock::{QuickUnlock, QuickUnlockBackend, detect_quick_unlock_backend};
pub use secret_service::{SecretService, SecretServiceCollection, SecretServiceItem};
pub use ssh_agent::{SshAgent, SshKeyEntry, parse_ed25519_openssh_or_pem, run_ssh_agent_once};
pub use yubikey::{ChallengeResponseProvider, YubiKeySlotConfig};
