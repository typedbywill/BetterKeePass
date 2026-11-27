//! Parser e trait de Auto-Type compatível com sequências do KeePassXC.

use std::time::Duration;

use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AutoTypeError {
    #[error("sequência de Auto-Type inválida: {0}")]
    InvalidSequence(String),
    #[error("backend de Auto-Type indisponível: {0}")]
    Unavailable(String),
}

/// Ações atômicas produzidas pelo parser de sequências Auto-Type.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AutoTypeAction {
    Text { value: String },
    Username,
    Password,
    Totp,
    Tab,
    Enter,
    Space,
    Backspace,
    ClearField,
    Delay { millis: u64 },
}

/// Execução de sequências de digitação automática (RemoteDesktop/libei no Wayland, XTest no X11,
/// `SendInput` no Windows, `CGEvent` no macOS).
pub trait AutoType: Send + Sync {
    fn backend_name(&self) -> &'static str;
    fn perform(&self, actions: &[AutoTypeAction]) -> Result<(), AutoTypeError>;
}

/// Implementação inócua usada em testes ou ambientes headless.
#[derive(Debug, Default)]
pub struct NoopAutoType;

impl AutoType for NoopAutoType {
    fn backend_name(&self) -> &'static str {
        #[cfg(target_os = "linux")]
        {
            "linux-portal-or-xtest (headless noop)"
        }
        #[cfg(target_os = "windows")]
        {
            "windows-sendinput"
        }
        #[cfg(target_os = "macos")]
        {
            "macos-cgevent"
        }
        #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
        {
            "noop"
        }
    }

    fn perform(&self, actions: &[AutoTypeAction]) -> Result<(), AutoTypeError> {
        let _ = Duration::from_millis(0);
        if actions.is_empty() {
            return Err(AutoTypeError::InvalidSequence(
                "nenhuma ação para executar".to_owned(),
            ));
        }
        Ok(())
    }
}

/// Converte uma sequência KeePassXC (ex.: `{USERNAME}{TAB}{PASSWORD}{ENTER}`) em ações.
pub fn parse_autotype_sequence(input: &str) -> Result<Vec<AutoTypeAction>, AutoTypeError> {
    let mut actions = Vec::new();
    let mut literal = String::new();
    let chars: Vec<char> = input.chars().collect();
    let mut i = 0;

    while i < chars.len() {
        if chars[i] == '{' {
            if i + 1 < chars.len() && chars[i + 1] == '{' {
                literal.push('{');
                i += 2;
                continue;
            }
            if !literal.is_empty() {
                actions.push(AutoTypeAction::Text {
                    value: std::mem::take(&mut literal),
                });
            }
            let Some(end_rel) = chars[i + 1..].iter().position(|&c| c == '}') else {
                return Err(AutoTypeError::InvalidSequence(
                    "chave '{' sem fechamento".to_owned(),
                ));
            };
            let token: String = chars[i + 1..i + 1 + end_rel].iter().collect();
            actions.push(parse_token(&token)?);
            i = i + 1 + end_rel + 1;
        } else if chars[i] == '}' && i + 1 < chars.len() && chars[i + 1] == '}' {
            literal.push('}');
            i += 2;
        } else {
            literal.push(chars[i]);
            i += 1;
        }
    }

    if !literal.is_empty() {
        actions.push(AutoTypeAction::Text { value: literal });
    }
    Ok(actions)
}

fn parse_token(token: &str) -> Result<AutoTypeAction, AutoTypeError> {
    let upper = token.trim().to_ascii_uppercase();
    match upper.as_str() {
        "USERNAME" => Ok(AutoTypeAction::Username),
        "PASSWORD" => Ok(AutoTypeAction::Password),
        "TOTP" => Ok(AutoTypeAction::Totp),
        "TAB" => Ok(AutoTypeAction::Tab),
        "ENTER" => Ok(AutoTypeAction::Enter),
        "SPACE" => Ok(AutoTypeAction::Space),
        "BACKSPACE" | "BS" => Ok(AutoTypeAction::Backspace),
        "CLEARFIELD" => Ok(AutoTypeAction::ClearField),
        _ if upper.starts_with("DELAY ") => {
            let ms_str = upper.trim_start_matches("DELAY ").trim();
            let millis = ms_str
                .parse::<u64>()
                .map_err(|_| AutoTypeError::InvalidSequence(format!("DELAY inválido: {token}")))?;
            Ok(AutoTypeAction::Delay { millis })
        }
        _ => Err(AutoTypeError::InvalidSequence(format!(
            "marcador desconhecido: {{{token}}}"
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_standard_kee_sequence() {
        let parsed =
            parse_autotype_sequence("{USERNAME}{TAB}{PASSWORD}{DELAY 250}{ENTER}").unwrap();
        assert_eq!(
            parsed,
            vec![
                AutoTypeAction::Username,
                AutoTypeAction::Tab,
                AutoTypeAction::Password,
                AutoTypeAction::Delay { millis: 250 },
                AutoTypeAction::Enter,
            ]
        );
    }
}
