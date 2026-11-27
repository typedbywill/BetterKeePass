//! Protocolo extensão ↔ aplicativo e transporte cifrado com Noise `XX`.

pub mod messages;
pub mod noise;

pub use messages::{
    ClientRequest, ErrorCode, HostResponse, LoginCandidate, PairedBrowser, PairingChallenge,
};
pub use noise::{NoiseSession, ProtocolError, read_frame, write_frame};
