//! Sessão criptografada usando Noise `XX` (`Noise_XX_25519_ChaChaPoly_SHA256`) e código de pareamento.

use std::io::{Read, Write};

use snow::{Builder, HandshakeState, TransportState};
use thiserror::Error;

const NOISE_PATTERN: &str = "Noise_XX_25519_ChaChaPoly_SHA256";
const MAX_FRAME_SIZE: usize = 1024 * 1024;

#[derive(Debug, Error)]
pub enum ProtocolError {
    #[error("erro no protocolo Noise: {0}")]
    Noise(#[from] snow::Error),
    #[error("erro de E/S no transporte: {0}")]
    Io(#[from] std::io::Error),
    #[error("frame excede o tamanho máximo permitido")]
    FrameTooLarge,
    #[error("estado inválido do handshake Noise")]
    InvalidState,
}

enum SessionState {
    Handshake(Box<HandshakeState>),
    Transport(Box<TransportState>),
}

/// Sessão Noise `XX` capaz de realizar handshake, derivar código de pareamento e cifrar frames.
pub struct NoiseSession {
    state: Option<SessionState>,
    static_public: Vec<u8>,
    handshake_hash: Vec<u8>,
}

impl NoiseSession {
    /// Cria um iniciador Noise `XX` (usado pelo `bkp-proxy` / extensão).
    pub fn new_initiator() -> Result<Self, ProtocolError> {
        let builder = Builder::new(NOISE_PATTERN.parse()?);
        let keypair = builder.generate_keypair()?;
        let static_public = keypair.public.clone();
        let hs = builder
            .local_private_key(&keypair.private)?
            .build_initiator()?;
        Ok(Self {
            state: Some(SessionState::Handshake(Box::new(hs))),
            static_public,
            handshake_hash: Vec::new(),
        })
    }

    /// Cria um respondedor Noise `XX` (usado pelo aplicativo desktop).
    pub fn new_responder() -> Result<Self, ProtocolError> {
        let builder = Builder::new(NOISE_PATTERN.parse()?);
        let keypair = builder.generate_keypair()?;
        let static_public = keypair.public.clone();
        let hs = builder
            .local_private_key(&keypair.private)?
            .build_responder()?;
        Ok(Self {
            state: Some(SessionState::Handshake(Box::new(hs))),
            static_public,
            handshake_hash: Vec::new(),
        })
    }

    /// Chave pública estática local da sessão.
    #[must_use]
    pub fn local_static_public_key(&self) -> &[u8] {
        &self.static_public
    }

    /// Escreve a próxima mensagem do handshake Noise.
    pub fn write_handshake(&mut self, payload: &[u8]) -> Result<Vec<u8>, ProtocolError> {
        let Some(SessionState::Handshake(hs)) = &mut self.state else {
            return Err(ProtocolError::InvalidState);
        };
        let mut buf = vec![0u8; 65535];
        let len = hs.write_message(payload, &mut buf)?;
        buf.truncate(len);
        if hs.is_handshake_finished() {
            self.finish_handshake()?;
        }
        Ok(buf)
    }

    /// Processa uma mensagem recebida durante o handshake Noise.
    pub fn read_handshake(&mut self, message: &[u8]) -> Result<Vec<u8>, ProtocolError> {
        let Some(SessionState::Handshake(hs)) = &mut self.state else {
            return Err(ProtocolError::InvalidState);
        };
        let mut buf = vec![0u8; 65535];
        let len = hs.read_message(message, &mut buf)?;
        buf.truncate(len);
        if hs.is_handshake_finished() {
            self.finish_handshake()?;
        }
        Ok(buf)
    }

    /// Retorna `true` quando o handshake Noise `XX` terminou e o canal está cifrado.
    #[must_use]
    pub fn is_transport_ready(&self) -> bool {
        matches!(self.state, Some(SessionState::Transport(_)))
    }

    /// Código numérico de confirmação de 6 dígitos derivado do hash do handshake Noise.
    pub fn pairing_code(&self) -> Result<String, ProtocolError> {
        let hash = match &self.state {
            Some(SessionState::Handshake(hs)) => hs.get_handshake_hash(),
            Some(SessionState::Transport(_)) => self.handshake_hash.as_slice(),
            None => return Err(ProtocolError::InvalidState),
        };
        if hash.len() < 4 {
            return Err(ProtocolError::InvalidState);
        }
        let num = u32::from_be_bytes([hash[0], hash[1], hash[2], hash[3]]) % 1_000_000;
        Ok(format!("{num:06}"))
    }

    /// Cifra um payload após o término do handshake.
    pub fn encrypt(&mut self, plaintext: &[u8]) -> Result<Vec<u8>, ProtocolError> {
        let Some(SessionState::Transport(ts)) = &mut self.state else {
            return Err(ProtocolError::InvalidState);
        };
        let mut out = vec![0u8; plaintext.len() + 64];
        let len = ts.write_message(plaintext, &mut out)?;
        out.truncate(len);
        Ok(out)
    }

    /// Decifra um payload recebido após o término do handshake.
    pub fn decrypt(&mut self, ciphertext: &[u8]) -> Result<Vec<u8>, ProtocolError> {
        let Some(SessionState::Transport(ts)) = &mut self.state else {
            return Err(ProtocolError::InvalidState);
        };
        let mut out = vec![0u8; ciphertext.len() + 64];
        let len = ts.read_message(ciphertext, &mut out)?;
        out.truncate(len);
        Ok(out)
    }

    fn finish_handshake(&mut self) -> Result<(), ProtocolError> {
        let Some(SessionState::Handshake(hs)) = self.state.take() else {
            return Err(ProtocolError::InvalidState);
        };
        self.handshake_hash = hs.get_handshake_hash().to_vec();
        let transport = hs.into_transport_mode()?;
        self.state = Some(SessionState::Transport(Box::new(transport)));
        Ok(())
    }
}

/// Escreve um frame com prefixo de tamanho de 4 bytes big-endian.
pub fn write_frame(writer: &mut impl Write, payload: &[u8]) -> Result<(), ProtocolError> {
    if payload.len() > MAX_FRAME_SIZE {
        return Err(ProtocolError::FrameTooLarge);
    }
    let len = u32::try_from(payload.len()).map_err(|_| ProtocolError::FrameTooLarge)?;
    writer.write_all(&len.to_be_bytes())?;
    writer.write_all(payload)?;
    writer.flush()?;
    Ok(())
}

/// Lê um frame com prefixo de tamanho de 4 bytes big-endian.
pub fn read_frame(reader: &mut impl Read) -> Result<Vec<u8>, ProtocolError> {
    let mut len_buf = [0u8; 4];
    reader.read_exact(&mut len_buf)?;
    let len =
        usize::try_from(u32::from_be_bytes(len_buf)).map_err(|_| ProtocolError::FrameTooLarge)?;
    if len > MAX_FRAME_SIZE {
        return Err(ProtocolError::FrameTooLarge);
    }
    let mut buf = vec![0u8; len];
    reader.read_exact(&mut buf)?;
    Ok(buf)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::messages::{ClientRequest, HostResponse};

    #[test]
    fn noise_xx_handshake_pairing_and_transport() {
        let mut client = NoiseSession::new_initiator().unwrap();
        let mut server = NoiseSession::new_responder().unwrap();

        let m1 = client.write_handshake(&[]).unwrap();
        server.read_handshake(&m1).unwrap();
        let m2 = server.write_handshake(&[]).unwrap();
        client.read_handshake(&m2).unwrap();
        let m3 = client.write_handshake(&[]).unwrap();
        server.read_handshake(&m3).unwrap();

        assert!(client.is_transport_ready());
        assert!(server.is_transport_ready());
        assert_eq!(
            client.pairing_code().unwrap(),
            server.pairing_code().unwrap()
        );

        let req_bytes = serde_json::to_vec(&ClientRequest::Ping).unwrap();
        let cipher = client.encrypt(&req_bytes).unwrap();
        let plain = server.decrypt(&cipher).unwrap();
        let decoded: ClientRequest = serde_json::from_slice(&plain).unwrap();
        assert!(matches!(decoded, ClientRequest::Ping));

        let resp_bytes = serde_json::to_vec(&HostResponse::Pong {
            version: "0.1.0".to_owned(),
            vault_unlocked: true,
        })
        .unwrap();
        let cipher_resp = server.encrypt(&resp_bytes).unwrap();
        let plain_resp = client.decrypt(&cipher_resp).unwrap();
        assert!(matches!(
            serde_json::from_slice::<HostResponse>(&plain_resp).unwrap(),
            HostResponse::Pong {
                vault_unlocked: true,
                ..
            }
        ));
    }
}
