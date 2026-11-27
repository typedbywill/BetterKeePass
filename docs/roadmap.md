# Roadmap do BetterKeePass

| Fase | Entrega | Status |
|---|---|---|
| **0 — Fundação** | Repositório Git, flake Nix (`devShell`, `checks`), workspace Cargo, CI (GitHub Actions + `nix flake check`), `LICENSE`, `README`, `CONTRIBUTING`, `SECURITY`, modelo de ameaças | Concluída |
| **1 — Core** | `bkp-core` abre/salva KDBX4 e lê KDBX3.1 (com migração), busca avançada, lixeira, histórico, anexos, passphrase EFF, round-trip e interoperabilidade com `keepassxc-cli`, alvo `cargo-fuzz`, `bkp-cli` completo | Concluída |
| **2 — Desktop MVP** | Tauri v2, React 19 e HeroUI: desbloqueio, árvore de grupos, lista e detalhe de entradas, criação/edição, gerador, cópia via Rust com auto-clear, auto-lock, TOTP, temas, Command Palette (`Ctrl+K`), modo apresentação | Concluída |
| **3 — Extensão + Passkeys** | `bkp-passkey` (ES256/EdDSA, CBOR/COSE, `KPEX_PASSKEY_*`), `bkp-protocol` (Noise `XX`), `bkp-proxy` (Native Messaging), extensão MV3 WXT (`MAIN` world WebAuthn + autofill + popup), módulo NixOS/HM com `browserIntegration` | Concluída |
| **4 — Integrações** | `bkp-platform`: SSH agent (`ssh-agent` Unix socket), Secret Service (`org.freedesktop.secrets`), parser/trait Auto-Type, YubiKey challenge-response, Quick Unlock | Concluída (núcleo e módulos) |
| **5 — Paridade e polimento** | Import/export (CSV, Bitwarden JSON, 1PUX), merge, análise de saúde (`zxcvbn` + HIBP k-anonymity), i18n (`pt-BR`, `en`), configuração declarativa NixOS + `nixosTest` | Concluída |
| **6 — Além** | Contrato `OsCredentialProvider` (`credentialsd` / Windows Plugin / `ASCredentialProviderExtension`), sync por merge (`bkp-core::sync`), arquitetura Tauri Mobile | Concluída (arquitetura e núcleo) |
