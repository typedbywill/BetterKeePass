//! Gerador criptograficamente seguro de senhas e passphrases.

use secrecy::SecretString;

use crate::{
    eff_wordlist,
    error::{CoreError, Result},
};

const LOWERCASE: &[u8] = b"abcdefghijklmnopqrstuvwxyz";
const LOWERCASE_UNAMBIGUOUS: &[u8] = b"abcdefghjkmnpqrstuvwxyz";
const UPPERCASE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const UPPERCASE_UNAMBIGUOUS: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS: &[u8] = b"0123456789";
const DIGITS_UNAMBIGUOUS: &[u8] = b"23456789";
const SYMBOLS: &[u8] = b"!@#$%^&*()-_=+[]{};:,.?/";

/// Opções de geração de senha.
#[derive(Debug, Clone)]
#[allow(clippy::struct_excessive_bools)]
pub struct PasswordOptions {
    /// Comprimento total da senha.
    pub length: usize,
    /// Incluir letras minúsculas (`a-z`).
    pub lowercase: bool,
    /// Incluir letras maiúsculas (`A-Z`).
    pub uppercase: bool,
    /// Incluir dígitos (`0-9`).
    pub digits: bool,
    /// Incluir símbolos especiais.
    pub symbols: bool,
    /// Excluir caracteres visualmente ambíguos (`0`, `O`, `1`, `l`, `I`).
    pub exclude_ambiguous: bool,
}

impl Default for PasswordOptions {
    fn default() -> Self {
        Self {
            length: 20,
            lowercase: true,
            uppercase: true,
            digits: true,
            symbols: true,
            exclude_ambiguous: false,
        }
    }
}

/// Gera uma senha aleatória usando o CSPRNG do sistema operacional sem viés de módulo.
pub fn generate_password(options: &PasswordOptions) -> Result<SecretString> {
    if options.length == 0 {
        return Err(CoreError::InvalidInput(
            "o comprimento da senha deve ser maior que zero".to_owned(),
        ));
    }

    let mut classes: Vec<&[u8]> = Vec::new();
    if options.lowercase {
        classes.push(if options.exclude_ambiguous {
            LOWERCASE_UNAMBIGUOUS
        } else {
            LOWERCASE
        });
    }
    if options.uppercase {
        classes.push(if options.exclude_ambiguous {
            UPPERCASE_UNAMBIGUOUS
        } else {
            UPPERCASE
        });
    }
    if options.digits {
        classes.push(if options.exclude_ambiguous {
            DIGITS_UNAMBIGUOUS
        } else {
            DIGITS
        });
    }
    if options.symbols {
        classes.push(SYMBOLS);
    }

    if classes.is_empty() {
        return Err(CoreError::InvalidInput(
            "ao menos uma classe de caracteres deve estar habilitada".to_owned(),
        ));
    }

    let mut alphabet: Vec<u8> = Vec::new();
    for class in &classes {
        alphabet.extend_from_slice(class);
    }

    let mut chars: Vec<u8> = Vec::with_capacity(options.length);
    if options.length >= classes.len() {
        for class in &classes {
            let idx = random_index(class.len())?;
            chars.push(class[idx]);
        }
    }

    while chars.len() < options.length {
        let idx = random_index(alphabet.len())?;
        chars.push(alphabet[idx]);
    }

    for i in (1..chars.len()).rev() {
        let j = random_index(i + 1)?;
        chars.swap(i, j);
    }

    let password = String::from_utf8(chars).map_err(|_| {
        CoreError::InvalidInput("falha interna ao codificar senha UTF-8".to_owned())
    })?;
    Ok(SecretString::from(password))
}

/// Gera uma passphrase aleatória usando a wordlist embutida.
pub fn generate_passphrase(words: usize, separator: &str) -> Result<SecretString> {
    if words == 0 {
        return Err(CoreError::InvalidInput(
            "a passphrase deve conter ao menos uma palavra".to_owned(),
        ));
    }
    let mut chosen = Vec::with_capacity(words);
    for _ in 0..words {
        let idx = random_index(eff_wordlist::WORDS.len())?;
        chosen.push(eff_wordlist::WORDS[idx]);
    }
    Ok(SecretString::from(chosen.join(separator)))
}

fn random_index(upper: usize) -> Result<usize> {
    debug_assert!(upper > 0);
    let upper_u64 = u64::try_from(upper)
        .map_err(|_| CoreError::InvalidInput("limite de alfabeto excede u64".to_owned()))?;
    let zone = u64::MAX - (u64::MAX % upper_u64);
    loop {
        let candidate = getrandom::u64()?;
        if candidate < zone {
            let idx = usize::try_from(candidate % upper_u64).map_err(|_| {
                CoreError::InvalidInput("índice fora do intervalo usize".to_owned())
            })?;
            return Ok(idx);
        }
    }
}
