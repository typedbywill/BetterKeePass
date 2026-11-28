use std::path::Path;

use bkp_ffi::{
    BkpError, CustomFieldInputDto, EntryPatchDto, NewEntryDto, PasskeyAlgorithmDto,
    PasskeyCreateRequestDto, PasswordOptionsDto, VaultHandle, generate_passphrase,
    generate_password,
};

#[test]
fn open_fixture_and_inspect_entries() {
    let fixture =
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../bkp-core/tests/fixtures/keepassxc.kdbx");
    let bytes = std::fs::read(fixture).unwrap();

    // Senha errada -> WrongKey
    assert!(matches!(
        VaultHandle::open(bytes.clone(), Some("wrong".to_owned()), None),
        Err(BkpError::WrongKey)
    ));

    // Bytes inválidos -> Corrupt
    assert!(matches!(
        VaultHandle::open(b"not-a-kdbx-file".to_vec(), Some("test".to_owned()), None),
        Err(BkpError::Corrupt { .. })
    ));

    let handle = VaultHandle::open(bytes, Some("test".to_owned()), None).unwrap();
    let entries = handle.search(String::new()).unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].title, "SampleEntry");

    let details = handle.entry_details(entries[0].uuid.clone()).unwrap();
    assert_eq!(details.summary.username, "alice");
    assert_eq!(
        handle.reveal_password(entries[0].uuid.clone()).unwrap(),
        "fixture-pass-123"
    );

    handle.lock();
    assert!(handle.is_locked());
    assert!(matches!(
        handle.search(String::new()),
        Err(BkpError::Locked)
    ));
}

#[test]
fn crud_autofill_passkey_and_generators() {
    let handle = VaultHandle::create(
        Some("Android FFI".to_owned()),
        Some("master-123".to_owned()),
        None,
    )
    .unwrap();

    let pw = generate_password(PasswordOptionsDto {
        length: 24,
        lowercase: true,
        uppercase: true,
        digits: true,
        symbols: true,
        exclude_ambiguous: true,
    })
    .unwrap();
    assert_eq!(pw.len(), 24);

    let phrase = generate_passphrase(4, "-".to_owned()).unwrap();
    assert_eq!(phrase.split('-').count(), 4);

    let uuid = handle
        .add_entry(NewEntryDto {
            group_path: Some("Redes".to_owned()),
            title: "GitHub".to_owned(),
            username: Some("octocat".to_owned()),
            password: Some(pw),
            url: Some("https://github.com/login".to_owned()),
            notes: Some("Nota".to_owned()),
            tags: vec!["Dev".to_owned()],
            custom_fields: vec![CustomFieldInputDto {
                name: "AndroidApp".to_owned(),
                value: "com.github.android".to_owned(),
                protected: false,
            }],
        })
        .unwrap();

    let by_domain = handle
        .find_by_url_or_package(Some("github.com".to_owned()), None)
        .unwrap();
    assert_eq!(by_domain.len(), 1);
    assert_eq!(by_domain[0].uuid, uuid);

    let by_pkg = handle
        .find_by_url_or_package(None, Some("com.github.android".to_owned()))
        .unwrap();
    assert_eq!(by_pkg.len(), 1);

    handle
        .update_entry(
            uuid.clone(),
            EntryPatchDto {
                title: Some("GitHub Corp".to_owned()),
                username: None,
                password: None,
                url: None,
                notes: None,
                tags: None,
                custom_fields: vec![],
                remove_custom_fields: vec![],
            },
        )
        .unwrap();
    assert_eq!(handle.history(uuid.clone()).unwrap().len(), 1);

    // Passkey create + assertion
    let created = handle
        .passkey_create(PasskeyCreateRequestDto {
            rp_id: "webauthn.io".to_owned(),
            rp_name: "WebAuthn.io".to_owned(),
            username: "octocat".to_owned(),
            user_display_name: "Octocat".to_owned(),
            user_handle_b64: "dXNlcjE".to_owned(),
            client_data_hash_b64: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA".to_owned(),
            algorithm: PasskeyAlgorithmDto::Es256,
            user_verified: true,
            group_path: Some("Passkeys".to_owned()),
        })
        .unwrap();
    assert_ne!(created.credential_id_b64, "");

    let listed = handle.passkey_list(Some("webauthn.io".to_owned())).unwrap();
    assert_eq!(listed.len(), 1);

    let assertion = handle
        .passkey_get_assertion(
            "webauthn.io".to_owned(),
            vec![created.credential_id_b64],
            "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA".to_owned(),
            true,
        )
        .unwrap();
    assert_eq!(assertion.sign_count, 1);

    // Save + reopen round-trip
    let saved_bytes = handle.save().unwrap();
    let reopened = VaultHandle::open(saved_bytes, Some("master-123".to_owned()), None).unwrap();
    let tree = reopened.group_tree().unwrap();
    assert!(tree.children.iter().any(|g| g.name == "Redes"));
    assert!(tree.children.iter().any(|g| g.name == "Passkeys"));
}
