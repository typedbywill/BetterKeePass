//! Servidor compatível com o protocolo OpenSSH `ssh-agent` para chaves Ed25519 do cofre.

use std::io::{self, Read, Write};

use ed25519_dalek::{Signer as _, SigningKey};
use pkcs8::DecodePrivateKey;
use secrecy::{ExposeSecret, SecretString};
use thiserror::Error;

const SSH_AGENT_FAILURE: u8 = 5;
const SSH_AGENTC_REQUEST_IDENTITIES: u8 = 11;
const SSH_AGENT_IDENTITIES_ANSWER: u8 = 12;
const SSH_AGENTC_SIGN_REQUEST: u8 = 13;
const SSH_AGENT_SIGN_RESPONSE: u8 = 14;

#[derive(Debug, Error)]
pub enum SshAgentError {
    #[error("erro de E/S do ssh-agent: {0}")]
    Io(#[from] io::Error),
    #[error("chave SSH inválida: {0}")]
    InvalidKey(String),
    #[error("mensagem ssh-agent malformada")]
    MalformedMessage,
}

/// Chave SSH carregada do cofre em memória para atendimento via `ssh-agent`.
#[derive(Clone)]
pub struct SshKeyEntry {
    pub comment: String,
    pub private_key_pem: SecretString,
}

/// Interface para gerenciamento do servidor `ssh-agent`.
pub trait SshAgent: Send + Sync {
    fn socket_path(&self) -> Option<&std::path::Path>;
    fn loaded_key_count(&self) -> usize;
}

/// Valida e decodifica uma chave Ed25519 em PKCS#8 PEM.
pub fn parse_ed25519_openssh_or_pem(pem: &SecretString) -> Result<SigningKey, SshAgentError> {
    SigningKey::from_pkcs8_pem(pem.expose_secret())
        .map_err(|e| SshAgentError::InvalidKey(e.to_string()))
}

/// Processa uma única requisição de cliente no stream `ssh-agent`.
pub fn handle_ssh_agent_stream(
    stream: &mut (impl Read + Write),
    keys: &[SshKeyEntry],
) -> Result<(), SshAgentError> {
    while let Some(msg) = read_agent_packet(stream)? {
        if msg.is_empty() {
            write_agent_packet(stream, &[SSH_AGENT_FAILURE])?;
            continue;
        }
        let resp = match msg[0] {
            SSH_AGENTC_REQUEST_IDENTITIES => encode_identities_answer(keys)?,
            SSH_AGENTC_SIGN_REQUEST => handle_sign_request(&msg[1..], keys),
            _ => vec![SSH_AGENT_FAILURE],
        };
        write_agent_packet(stream, &resp)?;
    }
    Ok(())
}

/// Aceita e atende uma conexão em um `UnixListener` (usado pelo serviço systemd/app desktop).
#[cfg(unix)]
pub fn run_ssh_agent_once(
    listener: &std::os::unix::net::UnixListener,
    keys: &[SshKeyEntry],
) -> Result<(), SshAgentError> {
    let (mut stream, _) = listener.accept()?;
    handle_ssh_agent_stream(&mut stream, keys)
}

#[cfg(not(unix))]
pub fn run_ssh_agent_once(_keys: &[SshKeyEntry]) -> Result<(), SshAgentError> {
    Ok(())
}

fn encode_identities_answer(keys: &[SshKeyEntry]) -> Result<Vec<u8>, SshAgentError> {
    let mut parsed = Vec::with_capacity(keys.len());
    for entry in keys {
        let sk = parse_ed25519_openssh_or_pem(&entry.private_key_pem)?;
        parsed.push((encode_ed25519_pub_blob(&sk), entry.comment.as_bytes()));
    }

    let mut body = Vec::new();
    body.push(SSH_AGENT_IDENTITIES_ANSWER);
    let count = u32::try_from(parsed.len()).map_err(|_| SshAgentError::MalformedMessage)?;
    body.extend_from_slice(&count.to_be_bytes());
    for (blob, comment) in parsed {
        push_ssh_string(&mut body, &blob)?;
        push_ssh_string(&mut body, comment)?;
    }
    Ok(body)
}

fn handle_sign_request(payload: &[u8], keys: &[SshKeyEntry]) -> Vec<u8> {
    let Ok((key_blob, rest)) = read_ssh_string(payload) else {
        return vec![SSH_AGENT_FAILURE];
    };
    let Ok((data_to_sign, _rest)) = read_ssh_string(rest) else {
        return vec![SSH_AGENT_FAILURE];
    };

    for entry in keys {
        if let Ok(sk) = parse_ed25519_openssh_or_pem(&entry.private_key_pem)
            && encode_ed25519_pub_blob(&sk) == key_blob
        {
            let sig = sk.sign(data_to_sign);
            let mut sig_blob = Vec::new();
            if push_ssh_string(&mut sig_blob, b"ssh-ed25519").is_err()
                || push_ssh_string(&mut sig_blob, &sig.to_bytes()).is_err()
            {
                return vec![SSH_AGENT_FAILURE];
            }
            let mut answer = vec![SSH_AGENT_SIGN_RESPONSE];
            if push_ssh_string(&mut answer, &sig_blob).is_err() {
                return vec![SSH_AGENT_FAILURE];
            }
            return answer;
        }
    }

    vec![SSH_AGENT_FAILURE]
}

fn encode_ed25519_pub_blob(sk: &SigningKey) -> Vec<u8> {
    let mut blob = Vec::with_capacity(51);
    let _ = push_ssh_string(&mut blob, b"ssh-ed25519");
    let _ = push_ssh_string(&mut blob, &sk.verifying_key().to_bytes());
    blob
}

fn push_ssh_string(buf: &mut Vec<u8>, bytes: &[u8]) -> Result<(), SshAgentError> {
    let len = u32::try_from(bytes.len()).map_err(|_| SshAgentError::MalformedMessage)?;
    buf.extend_from_slice(&len.to_be_bytes());
    buf.extend_from_slice(bytes);
    Ok(())
}

fn read_ssh_string(input: &[u8]) -> Result<(&[u8], &[u8]), SshAgentError> {
    if input.len() < 4 {
        return Err(SshAgentError::MalformedMessage);
    }
    let len = usize::try_from(u32::from_be_bytes([input[0], input[1], input[2], input[3]]))
        .map_err(|_| SshAgentError::MalformedMessage)?;
    let rest = &input[4..];
    if rest.len() < len {
        return Err(SshAgentError::MalformedMessage);
    }
    Ok((&rest[..len], &rest[len..]))
}

fn read_agent_packet(reader: &mut impl Read) -> Result<Option<Vec<u8>>, SshAgentError> {
    let mut len_buf = [0u8; 4];
    match reader.read_exact(&mut len_buf) {
        Ok(()) => {}
        Err(e) if e.kind() == io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(e) => return Err(SshAgentError::Io(e)),
    }
    let len = usize::try_from(u32::from_be_bytes(len_buf))
        .map_err(|_| SshAgentError::MalformedMessage)?;
    let mut buf = vec![0u8; len];
    reader.read_exact(&mut buf)?;
    Ok(Some(buf))
}

fn write_agent_packet(writer: &mut impl Write, payload: &[u8]) -> Result<(), SshAgentError> {
    let len = u32::try_from(payload.len()).map_err(|_| SshAgentError::MalformedMessage)?;
    writer.write_all(&len.to_be_bytes())?;
    writer.write_all(payload)?;
    writer.flush()?;
    Ok(())
}

#[cfg(all(test, unix))]
mod tests {
    use std::os::unix::net::{UnixListener, UnixStream};

    use ed25519_dalek::{Signature, Verifier as _};
    use pkcs8::{EncodePrivateKey, LineEnding};

    use super::*;

    #[test]
    fn ssh_agent_lists_and_signs_over_unix_socket() {
        let dir = std::env::temp_dir().join(format!("bkp-ssh-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let sock_path = dir.join("agent.sock");
        let _ = std::fs::remove_file(&sock_path);

        let sk = SigningKey::from_bytes(&[42u8; 32]);
        let pem = sk.to_pkcs8_pem(LineEnding::LF).unwrap();
        let keys = vec![SshKeyEntry {
            comment: "bkp-test-key".to_owned(),
            private_key_pem: SecretString::from(pem.to_string()),
        }];

        let listener = UnixListener::bind(&sock_path).unwrap();
        let handle = std::thread::spawn(move || {
            run_ssh_agent_once(&listener, &keys).unwrap();
        });

        let mut client = UnixStream::connect(&sock_path).unwrap();
        write_agent_packet(&mut client, &[SSH_AGENTC_REQUEST_IDENTITIES]).unwrap();
        let list_resp = read_agent_packet(&mut client).unwrap().unwrap();
        assert_eq!(list_resp[0], SSH_AGENT_IDENTITIES_ANSWER);
        let count = u32::from_be_bytes([list_resp[1], list_resp[2], list_resp[3], list_resp[4]]);
        assert_eq!(count, 1);
        let (pub_blob, _) = read_ssh_string(&list_resp[5..]).unwrap();

        let mut sign_req = vec![SSH_AGENTC_SIGN_REQUEST];
        push_ssh_string(&mut sign_req, pub_blob).unwrap();
        push_ssh_string(&mut sign_req, b"challenge-payload").unwrap();
        sign_req.extend_from_slice(&0_u32.to_be_bytes());
        write_agent_packet(&mut client, &sign_req).unwrap();

        let sign_resp = read_agent_packet(&mut client).unwrap().unwrap();
        assert_eq!(sign_resp[0], SSH_AGENT_SIGN_RESPONSE);
        let (sig_blob, _) = read_ssh_string(&sign_resp[1..]).unwrap();
        let (algo, rest) = read_ssh_string(sig_blob).unwrap();
        assert_eq!(algo, b"ssh-ed25519");
        let (raw_sig, _) = read_ssh_string(rest).unwrap();
        let sig = Signature::from_slice(raw_sig).unwrap();
        sk.verifying_key()
            .verify(b"challenge-payload", &sig)
            .unwrap();

        drop(client);
        handle.join().unwrap();
        let _ = std::fs::remove_dir_all(&dir);
    }
}
