#![no_main]

use bkp_core::Vault;
use libfuzzer_sys::fuzz_target;
use secrecy::SecretString;

fuzz_target!(|data: &[u8]| {
    let _ = Vault::open_from_bytes(data, Some(SecretString::from("fuzz".to_owned())), None);
});
