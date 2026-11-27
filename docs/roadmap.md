# Roadmap do BetterKeePass

| Fase | Entrega | Status |
|---|---|---|
| **0 — Fundação** | Repositório Git, flake Nix (`devShell`, `checks`), workspace Cargo, CI (GitHub Actions + `nix flake check`), `LICENSE`, `README`, `CONTRIBUTING`, `SECURITY`, modelo de ameaças | Concluída |
| **1 — Core** | `bkp-core` abre e salva KDBX4, testes de *round-trip* e interoperabilidade com `keepassxc-cli`, fuzzing do parser, `bkp-cli` (`ls`, `show`, `add`, `edit`, `generate`, `totp`, `db-create`) | Em andamento |
| **2 — Desktop MVP** | Tauri v2, React 19 e HeroUI: desbloqueio, árvore de grupos, lista e detalhe de entradas, edição, gerador, cópia com auto-clear, auto-lock, TOTP, temas | Planejada |
| **3 — Extensão + Passkeys** | `bkp-protocol`, `bkp-proxy`, pareamento Noise, autofill, criação/uso de passkeys, módulo NixOS com `browserIntegration` | Planejada |
| **4 — Integrações** | SSH agent, Secret Service, auto-type (X11, Wayland, Windows, macOS), YubiKey HMAC-SHA1, quick unlock | Planejada |
| **5 — Paridade e polimento** | Import/export, merge/sync, relatórios de saúde (`zxcvbn`/HIBP), i18n (`pt-BR`, `en`), acessibilidade WCAG 2.2 AA, instaladores, nixpkgs | Planejada |
| **6 — Além** | Provedores nativos de passkey do SO (`credentialsd`, Windows Plugin Authenticator, `ASCredentialProviderExtension`), app mobile, sync opcional | Planejada |
