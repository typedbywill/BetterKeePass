# Fase 6 — Além (Provedores Nativos, Mobile e Sincronização)

## 1. Provedores nativos de passkey do sistema operacional

Para permitir o uso de passkeys fora dos navegadores (aplicativos nativos, terminais, SSH e diálogos do SO), o crate `bkp-passkey` define em `src/native_provider.rs` o contrato unificado `OsCredentialProvider`:

- **Linux (`credentialsd` / `xdg-credentials-portal`):** registro no portal `org.freedesktop.portal.Credentials` via D-Bus.
- **Windows:** implementação da *Windows Plugin Authenticator API* (WebAuthn 2024+).
- **macOS:** extensão `ASCredentialProviderExtension` via `objc2` compartilhando acesso ao cofre.

## 2. Aplicativo Mobile (Kotlin nativo + UniFFI)

A separação em crates (`bkp-core`, `bkp-passkey`) permite reutilizar todo o núcleo Rust no Android via fachada UniFFI (`bkp-ffi`), com interface nativa em Kotlin + Jetpack Compose, Storage Access Framework (SAF) para `.kdbx`, desbloqueio biométrico via Android Keystore, `AutofillService` e provedor de passkeys no `CredentialProviderService` (Android 14+).

## 3. Sincronização opcional baseada em merge

Em `bkp-core::merge` e `bkp-core::sync`, o cofre implementa mesclagem determinística por UUID e timestamp (`last_modification`), gravando revisões anteriores no histórico para evitar perda de dados em sincronização multi-dispositivo (Nextcloud, Syncthing, WebDAV ou S3).
