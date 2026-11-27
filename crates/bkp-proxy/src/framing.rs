//! Framing padrão do protocolo WebExtension Native Messaging (4 bytes `u32` em endianness nativa + JSON).

use std::io::{self, Read, Write};

const MAX_NATIVE_MESSAGE_LEN: usize = 1024 * 1024;

/// Lê uma mensagem Native Messaging; retorna `Ok(None)` em EOF limpo.
pub fn read_native_message(reader: &mut impl Read) -> io::Result<Option<Vec<u8>>> {
    let mut len_bytes = [0u8; 4];
    match reader.read_exact(&mut len_bytes) {
        Ok(()) => {}
        Err(e) if e.kind() == io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(e) => return Err(e),
    }

    let len = usize::try_from(u32::from_ne_bytes(len_bytes))
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "comprimento inválido"))?;
    if len > MAX_NATIVE_MESSAGE_LEN {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "mensagem Native Messaging excede 1 MiB",
        ));
    }

    let mut payload = vec![0u8; len];
    reader.read_exact(&mut payload)?;
    Ok(Some(payload))
}

/// Escreve uma mensagem Native Messaging com prefixo `u32` em endianness nativa.
pub fn write_native_message(writer: &mut impl Write, payload: &[u8]) -> io::Result<()> {
    if payload.len() > MAX_NATIVE_MESSAGE_LEN {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "mensagem Native Messaging excede 1 MiB",
        ));
    }
    let len = u32::try_from(payload.len())
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "comprimento inválido"))?;
    writer.write_all(&len.to_ne_bytes())?;
    writer.write_all(payload)?;
    writer.flush()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::io::Cursor;

    use super::*;

    #[test]
    fn native_messaging_roundtrip_and_eof() {
        let mut buf = Vec::new();
        let msg = br#"{"type":"Ping"}"#;
        write_native_message(&mut buf, msg).unwrap();

        let mut cursor = Cursor::new(buf);
        let decoded = read_native_message(&mut cursor).unwrap().unwrap();
        assert_eq!(decoded, msg);
        assert!(read_native_message(&mut cursor).unwrap().is_none());
    }
}
