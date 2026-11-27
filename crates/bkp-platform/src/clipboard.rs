//! Área de transferência segura com limpeza automática temporizada.

use std::{
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};

use secrecy::{ExposeSecret, SecretString};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ClipboardError {
    #[error("erro ao acessar a área de transferência do sistema: {0}")]
    Backend(String),
}

/// Gerenciador de área de transferência que limpa segredos automaticamente após N segundos.
#[derive(Default)]
pub struct ClipboardManager {
    last_secret_marker: Arc<Mutex<Option<String>>>,
}

impl ClipboardManager {
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Copia `secret` para a área de transferência e agenda limpeza após `clear_after_secs`.
    pub fn copy_secret(
        &self,
        secret: &SecretString,
        clear_after_secs: u64,
    ) -> Result<(), ClipboardError> {
        let value = secret.expose_secret().to_owned();
        let mut clipboard =
            arboard::Clipboard::new().map_err(|e| ClipboardError::Backend(e.to_string()))?;
        clipboard
            .set_text(value.clone())
            .map_err(|e| ClipboardError::Backend(e.to_string()))?;

        if let Ok(mut guard) = self.last_secret_marker.lock() {
            *guard = Some(value.clone());
        }

        if clear_after_secs > 0 {
            let marker = Arc::clone(&self.last_secret_marker);
            thread::spawn(move || {
                thread::sleep(Duration::from_secs(clear_after_secs));
                let should_clear = marker
                    .lock()
                    .is_ok_and(|g| g.as_deref() == Some(value.as_str()));
                if should_clear
                    && let Ok(mut cb) = arboard::Clipboard::new()
                    && cb.get_text().ok().as_deref() == Some(value.as_str())
                {
                    let _ = cb.clear();
                }
            });
        }

        Ok(())
    }
}
