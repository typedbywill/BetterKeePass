use std::path::Path;

use bkp_core::{
    AppConfig, CustomFieldInput, EntryPatch, HealthIssueKind, NewEntry, PasswordOptions, Vault,
    analyze_health, export_csv, generate_passphrase, generate_password,
    hibp_sha1_prefix_and_suffix, import_1pux_json, import_bitwarden_json, import_csv,
    parse_hibp_range_response, totp_from_uri_at,
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

    vault
        .add_attachment(uuid, "recovery.txt", b"backup-code-123".to_vec())
        .unwrap();

    let master_pw = SecretString::from("master-pass-123".to_owned());
    vault.set_group_icon("Contas/GitHub", 42).unwrap();
    assert!(vault.set_group_icon("Contas/GitHub", 69).is_err());
    vault.save(&db_path, Some(master_pw.clone()), None).unwrap();

    let mut reopened = Vault::open(&db_path, Some(master_pw), None).unwrap();
    assert_eq!(reopened.database_name(), Some("BetterKeePass Test"));
    let tree = reopened.group_tree();
    let contas = tree.children.iter().find(|g| g.name == "Contas").unwrap();
    assert_eq!(
        contas
            .children
            .iter()
            .find(|g| g.name == "GitHub")
            .unwrap()
            .icon_id,
        Some(42)
    );

    let found = reopened.find_by_path("Contas/GitHub/GitHub").unwrap();
    assert_eq!(found.uuid, uuid);
    assert_eq!(found.username, "octocat");
    assert_eq!(found.tags, vec!["Passkey", "Dev"]);
    assert!(found.has_password);
    assert!(found.has_otp);
    assert!(found.has_passkey);
    assert!(found.has_notes);

    let history = reopened.entry_history(uuid).unwrap();
    assert_eq!(history.len(), 1);

    let att = reopened.get_attachment(uuid, "recovery.txt").unwrap();
    assert_eq!(att, b"backup-code-123");

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
    assert_eq!(revealed.attachments, vec!["recovery.txt"]);

    let otp = reopened.totp_now(uuid).unwrap();
    assert_eq!(otp.code.len(), 6);

    // Lixeira e restauração de histórico
    reopened.restore_history(uuid, 0).unwrap();
    assert_eq!(
        reopened.entry_details(uuid, false).unwrap().notes,
        "Passkey de teste"
    );

    reopened.delete_entry(uuid, false).unwrap();
    let tree = reopened.group_tree();
    assert!(tree.children.iter().any(|g| g.is_recycle_bin));
    assert_eq!(reopened.empty_recycle_bin(), 1);

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
fn roundtrip_save_to_bytes_and_open_from_bytes() {
    let mut vault = Vault::create(Some("In-Memory Vault"));
    let uuid = vault
        .add_entry(
            Some("Android/Contas"),
            NewEntry {
                title: "Proton".to_owned(),
                username: Some("alice@proton.me".to_owned()),
                password: Some(SecretString::from("p@ss-in-memory-42".to_owned())),
                url: Some("https://proton.me".to_owned()),
                notes: Some("Nota em memória".to_owned()),
                tags: vec!["Email".to_owned()],
                custom_fields: vec![CustomFieldInput {
                    name: "AndroidApp".to_owned(),
                    value: SecretString::from("ch.protonmail.android".to_owned()),
                    protected: false,
                }],
            },
        )
        .unwrap();

    let pw = SecretString::from("bytes-master-key".to_owned());
    let keyfile = b"arbitrary-keyfile-bytes-0123456789";
    let kdbx_bytes = vault
        .save_to_bytes(Some(pw.clone()), Some(keyfile))
        .unwrap();
    assert!(!kdbx_bytes.is_empty());

    assert!(
        Vault::open_from_bytes(
            &kdbx_bytes,
            Some(SecretString::from("wrong".to_owned())),
            Some(keyfile)
        )
        .is_err()
    );
    assert!(Vault::open_from_bytes(&kdbx_bytes, Some(pw.clone()), None).is_err());

    let reopened = Vault::open_from_bytes(&kdbx_bytes, Some(pw), Some(keyfile)).unwrap();
    assert_eq!(reopened.database_name(), Some("In-Memory Vault"));
    let details = reopened.entry_details(uuid, true).unwrap();
    assert_eq!(details.summary.title, "Proton");
    assert_eq!(
        details.password.as_ref().map(ExposeSecret::expose_secret),
        Some("p@ss-in-memory-42")
    );
    assert_eq!(details.custom_fields.len(), 1);
    assert_eq!(details.custom_fields[0].name, "AndroidApp");
    assert_eq!(
        details.custom_fields[0].value.as_deref(),
        Some("ch.protonmail.android")
    );
}

#[test]
fn totp_rfc6238_sha1_vector() {
    let uri = "otpauth://totp/RFC6238:test?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&period=30&digits=8&algorithm=SHA1";
    let code = totp_from_uri_at(uri, 59).unwrap();
    assert_eq!(code.code, "94287082");
    assert_eq!(code.valid_for_secs, 1);
    assert_eq!(code.period_secs, 30);
}

#[test]
fn password_and_passphrase_generators() {
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

    let phrase = generate_passphrase(5, "-").unwrap();
    assert_eq!(phrase.expose_secret().split('-').count(), 5);
}

#[test]
fn advanced_search_supports_qualifiers_and_negation() {
    let mut vault = Vault::create(None);
    vault
        .add_entry(
            Some("Trabalho"),
            NewEntry {
                title: "GitLab Corporativo".to_owned(),
                username: Some("dev@empresa.com".to_owned()),
                url: Some("https://gitlab.empresa.com".to_owned()),
                tags: vec!["Corp".to_owned()],
                ..NewEntry::default()
            },
        )
        .unwrap();
    vault
        .add_entry(
            Some("Pessoal"),
            NewEntry {
                title: "GitHub Pessoal".to_owned(),
                username: Some("will".to_owned()),
                url: Some("https://github.com".to_owned()),
                tags: vec!["Passkey".to_owned()],
                ..NewEntry::default()
            },
        )
        .unwrap();

    assert_eq!(vault.search("tag:passkey").len(), 1);
    assert_eq!(vault.search("group:Trabalho -github").len(), 1);
    assert_eq!(vault.search("url:gitlab.empresa.com").len(), 1);
    assert_eq!(vault.search("-tag:corp").len(), 1);
}

#[test]
fn health_merge_and_import_export_work() {
    let mut v1 = Vault::create(Some("V1"));
    v1.add_entry(
        None,
        NewEntry {
            title: "Fraca 1".to_owned(),
            password: Some(SecretString::from("123456".to_owned())),
            ..NewEntry::default()
        },
    )
    .unwrap();
    v1.add_entry(
        None,
        NewEntry {
            title: "Fraca 2".to_owned(),
            password: Some(SecretString::from("123456".to_owned())),
            ..NewEntry::default()
        },
    )
    .unwrap();
    v1.add_entry(
        None,
        NewEntry {
            title: "Vazia".to_owned(),
            ..NewEntry::default()
        },
    )
    .unwrap();

    let health = analyze_health(&v1);
    assert_eq!(health.total_entries, 3);
    assert_eq!(health.empty_count, 1);
    assert_eq!(health.weak_count, 2);
    assert_eq!(health.reused_count, 2);
    assert!(
        health
            .issues
            .iter()
            .any(|i| i.kind == HealthIssueKind::ReusedPassword)
    );

    let (prefix, suffix) = hibp_sha1_prefix_and_suffix("password");
    assert_eq!(prefix, "5BAA6");
    let body = format!("{suffix}:9999\n00000000000000000000000000000000000:1\n");
    assert_eq!(parse_hibp_range_response(&suffix, &body), 9999);

    let mut v2 = Vault::create(Some("V2"));
    let csv_in = "Group,Title,Username,Password,URL,Notes\nEmail,Proton,alice,segredo-unico,https://proton.me,nota\n";
    let csv_rep = import_csv(&mut v2, csv_in).unwrap();
    assert_eq!(csv_rep.imported, 1);
    let bw = r#"{"folders":[{"id":"f1","name":"Social"}],"items":[{"name":"Mastodon","folderId":"f1","login":{"username":"@alice","password":"pw","uris":[{"uri":"https://mastodon.social"}]}}]}"#;
    assert_eq!(import_bitwarden_json(&mut v2, bw).unwrap().imported, 1);
    let onepux = r#"{"accounts":[{"vaults":[{"attrs":{"name":"1P"},"items":[{"overview":{"title":"AWS","url":"https://aws.amazon.com","tags":["cloud"]},"details":{"loginFields":[{"designation":"username","value":"root"},{"designation":"password","value":"pw2"}]}}]}]}]}"#;
    assert_eq!(import_1pux_json(&mut v2, onepux).unwrap().imported, 1);

    let merge_rep = v1.merge(&v2);
    assert_eq!(merge_rep.added, 3);
    let exported = export_csv(&v1).unwrap();
    assert!(exported.contains("Proton"));
    assert!(exported.contains("Mastodon"));
    assert!(exported.contains("AWS"));
}

#[test]
fn config_toml_parses_declaratively() {
    let dir = std::env::temp_dir().join(format!("bkp-cfg-test-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("config.toml");
    std::fs::write(
        &path,
        "[security]\nlockAfterSeconds = 120\n[clipboard]\nclearAfterSeconds = 10\n[ui]\ntheme = \"dark\"\nlanguage = \"en\"\n",
    )
    .unwrap();
    let cfg = AppConfig::load_from_path(&path).unwrap();
    assert_eq!(cfg.security.lock_after_seconds, 120);
    assert_eq!(cfg.clipboard.clear_after_seconds, 10);
    assert_eq!(cfg.ui.theme, "dark");
    assert_eq!(cfg.ui.language, "en");
    assert!(!cfg.ui.sidebar_collapsed);
    assert_eq!(cfg.ui.list_width, 320);
    assert!(!cfg.ui.fetch_favicons);
    assert_eq!(cfg.ui.sort_by, "title");

    // Roundtrip com novos campos de UiConfig
    let roundtrip_path = dir.join("roundtrip.toml");
    let mut updated = cfg.clone();
    updated.ui.sidebar_collapsed = true;
    updated.ui.list_width = 360;
    updated.ui.fetch_favicons = true;
    updated.ui.sort_by = "recent".to_owned();
    updated.source_path = Some(roundtrip_path.clone());
    updated.managed_by_nix = false;
    updated.save().unwrap();

    let reloaded = AppConfig::load_from_path(&roundtrip_path).unwrap();
    assert!(reloaded.ui.sidebar_collapsed);
    assert_eq!(reloaded.ui.list_width, 360);
    assert!(reloaded.ui.fetch_favicons);
    assert_eq!(reloaded.ui.sort_by, "recent");

    // Bloqueia gravação quando gerenciada pelo Nix
    let mut nix_cfg = reloaded;
    nix_cfg.managed_by_nix = true;
    assert!(nix_cfg.save().is_err());

    let _ = std::fs::remove_dir_all(&dir);
}
