use std::path::Path;

use bkp_core::{
    CustomFieldInput, EntryPatch, NewEntry, PasswordOptions, Vault, generate_password,
    totp_from_uri_at,
};
use secrecy::{ExposeSecret, SecretString};

#[test]
fn roundtrip_kdbx4_with_passkey_attributes_and_totp() {
    let dir = std::env::temp_dir().join(format!("bkp-core-test-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let db_path = dir.join("roundtrip.kdbx");

    let mut vault = Vault::create(Some("BetterKeePass Test"));
    let uuid = vault
        .add_entry(
            Some("Contas/GitHub"),
            NewEntry {
                title: "GitHub".to_owned(),
                username: Some("octocat".to_owned()),
                password: Some(SecretString::from("sup3r-s3cr3t!".to_owned())),
                url: Some("https://github.com".to_owned()),
                notes: Some("Passkey de teste".to_owned()),
                tags: vec!["Passkey".to_owned(), "Dev".to_owned()],
                custom_fields: vec![
                    CustomFieldInput {
                        name: "KPEX_PASSKEY_CREDENTIAL_ID".to_owned(),
                        value: SecretString::from("Y3JlZC1pZC0xMjM".to_owned()),
                        protected: true,
                    },
                    CustomFieldInput {
                        name: "otp".to_owned(),
                        value: SecretString::from(
                            "otpauth://totp/GitHub:octocat?secret=JBSWY3DPEHPK3PXP&period=30&digits=6"
                                .to_owned(),
                        ),
                        protected: true,
                    },
                ],
            },
        )
        .unwrap();

    vault
        .edit_entry(
            uuid,
            EntryPatch {
                notes: Some("Atualizada".to_owned()),
                ..EntryPatch::default()
            },
        )
        .unwrap();

    let master_pw = SecretString::from("master-pass-123".to_owned());
    vault.save(&db_path, Some(master_pw.clone()), None).unwrap();

    let reopened = Vault::open(&db_path, Some(master_pw), None).unwrap();
    assert_eq!(reopened.database_name(), Some("BetterKeePass Test"));

    let found = reopened.find_by_path("Contas/GitHub/GitHub").unwrap();
    assert_eq!(found.uuid, uuid);
    assert_eq!(found.username, "octocat");
    assert_eq!(found.tags, vec!["Passkey", "Dev"]);

    let masked = reopened.entry_details(uuid, false).unwrap();
    assert!(masked.password.is_none());
    let cred_masked = masked
        .custom_fields
        .iter()
        .find(|f| f.name == "KPEX_PASSKEY_CREDENTIAL_ID")
        .unwrap();
    assert!(cred_masked.protected);
    assert!(cred_masked.value.is_none());

    let revealed = reopened.entry_details(uuid, true).unwrap();
    assert_eq!(revealed.password.unwrap().expose_secret(), "sup3r-s3cr3t!");
    assert_eq!(revealed.notes, "Atualizada");
    assert!(revealed.has_otp);
    let cred_revealed = revealed
        .custom_fields
        .iter()
        .find(|f| f.name == "KPEX_PASSKEY_CREDENTIAL_ID")
        .unwrap();
    assert_eq!(cred_revealed.value.as_deref(), Some("Y3JlZC1pZC0xMjM"));

    let otp = reopened.totp_now(uuid).unwrap();
    assert_eq!(otp.code.len(), 6);

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn open_keepassxc_fixture() {
    let fixture = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/keepassxc.kdbx");
    let vault = Vault::open(&fixture, Some(SecretString::from("test".to_owned())), None).unwrap();

    let entries = vault.list(None, true).unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].title, "SampleEntry");
    assert_eq!(entries[0].username, "alice");
    assert_eq!(entries[0].url, "https://example.com");

    let secret = vault.entry_secret(entries[0].uuid).unwrap();
    assert_eq!(secret.expose_secret(), "fixture-pass-123");
}

#[test]
fn totp_rfc6238_sha1_vector() {
    // Segredo "12345678901234567890" em Base32: GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ
    let uri = "otpauth://totp/RFC6238:test?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&period=30&digits=8&algorithm=SHA1";
    let code = totp_from_uri_at(uri, 59).unwrap();
    assert_eq!(code.code, "94287082");
    assert_eq!(code.valid_for_secs, 1);
    assert_eq!(code.period_secs, 30);
}

#[test]
fn password_generator_respects_options() {
    let opts = PasswordOptions {
        length: 24,
        lowercase: true,
        uppercase: true,
        digits: true,
        symbols: false,
        exclude_ambiguous: true,
    };
    let pw = generate_password(&opts).unwrap();
    let s = pw.expose_secret();
    assert_eq!(s.len(), 24);
    assert!(s.chars().all(|c| c.is_ascii_alphanumeric()));
    assert!(!s.chars().any(|c| "0O1lI".contains(c)));
}
