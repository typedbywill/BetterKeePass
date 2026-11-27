//! Binário `bkp-proxy` (Native Messaging host para navegadores WebExtension MV3).
//!
//! Lê mensagens Native Messaging em `stdin`, encaminha pelo canal Noise `XX`
//! para o socket local do aplicativo desktop e devolve respostas em `stdout`.

mod framing;

use std::{
    io::{self, BufReader, BufWriter},
    path::PathBuf,
};

use bkp_protocol::{ErrorCode, HostResponse, NoiseSession, read_frame, write_frame};

use crate::framing::{read_native_message, write_native_message};

fn main() {
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut reader = BufReader::new(stdin.lock());
    let mut writer = BufWriter::new(stdout.lock());

    while let Ok(Some(raw_req)) = read_native_message(&mut reader) {
        let response_bytes = match forward_to_app(&raw_req) {
            Ok(resp) => resp,
            Err(err_msg) => {
                let err_resp = HostResponse::Error {
                    code: ErrorCode::AppOffline,
                    message: err_msg,
                };
                serde_json::to_vec(&err_resp).unwrap_or_else(|_| {
                    br#"{"type":"Error","code":"InternalError","message":"serialization failed"}"#
                        .to_vec()
                })
            }
        };

        if write_native_message(&mut writer, &response_bytes).is_err() {
            break;
        }
    }
}

#[cfg(unix)]
fn forward_to_app(payload: &[u8]) -> Result<Vec<u8>, String> {
    use std::os::unix::net::UnixStream;

    let socket_path = resolve_socket_path();
    let mut stream = UnixStream::connect(&socket_path).map_err(|e| {
        format!(
            "Aplicativo BetterKeePass não está em execução em {}: {e}",
            socket_path.display()
        )
    })?;

    let mut session = NoiseSession::new_initiator().map_err(|e| e.to_string())?;
    let m1 = session.write_handshake(&[]).map_err(|e| e.to_string())?;
    write_frame(&mut stream, &m1).map_err(|e| e.to_string())?;
    let m2 = read_frame(&mut stream).map_err(|e| e.to_string())?;
    session.read_handshake(&m2).map_err(|e| e.to_string())?;
    let m3 = session.write_handshake(&[]).map_err(|e| e.to_string())?;
    write_frame(&mut stream, &m3).map_err(|e| e.to_string())?;

    let encrypted = session.encrypt(payload).map_err(|e| e.to_string())?;
    write_frame(&mut stream, &encrypted).map_err(|e| e.to_string())?;
    let resp_cipher = read_frame(&mut stream).map_err(|e| e.to_string())?;
    session.decrypt(&resp_cipher).map_err(|e| e.to_string())
}

#[cfg(not(unix))]
fn forward_to_app(_payload: &[u8]) -> Result<Vec<u8>, String> {
    let _ = resolve_socket_path();
    Err("Named pipe IPC pendente para plataformas não-Unix".to_owned())
}

fn resolve_socket_path() -> PathBuf {
    if let Ok(explicit) = std::env::var("BKP_SOCKET_PATH")
        && !explicit.trim().is_empty()
    {
        return PathBuf::from(explicit);
    }
    if let Ok(runtime_dir) = std::env::var("XDG_RUNTIME_DIR")
        && !runtime_dir.trim().is_empty()
    {
        return PathBuf::from(runtime_dir).join("betterkeepass.sock");
    }
    std::env::temp_dir().join("betterkeepass.sock")
}
