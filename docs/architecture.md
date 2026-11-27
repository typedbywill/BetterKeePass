# Arquitetura do BetterKeePass

## Visão geral

O BetterKeePass separa estritamente o núcleo criptográfico e o gerenciamento de segredos (em Rust) da interface de usuário (Tauri v2 + React/HeroUI) e da extensão de navegador (WebExtension MV3).

## Stack

| Camada | Tecnologia |
|---|---|
| Core | Rust (edition 2024), workspace Cargo |
| KDBX | Crate `keepass` (`save_kdbx4`, `totp`, `challenge_response`) |
| Criptografia | RustCrypto (`aes`, `chacha20`, `argon2`, `sha2`, `hmac`, `p256`, `ed25519-dalek`), `zeroize`, `secrecy`, `memsec` |
| WebAuthn | `p256` (ES256) e `ed25519` (EdDSA), `coset` e `ciborium` |
| Desktop | Tauri v2 com isolation pattern e capabilities restritas |
| Frontend | React 19 + TypeScript + Vite, Tailwind CSS v4, HeroUI, Framer Motion, Lucide, TanStack Router/Query, Zustand |
| Extensão | WebExtension MV3 em TypeScript (WXT) |
| IPC extensão↔app | Native Messaging → `bkp-proxy` → socket local cifrado com Noise `XX` (`snow`) |
| Integrações de SO | Linux (`zbus`, `ashpd`, RemoteDesktop/libei, XTest), Windows (`windows`), macOS (`objc2`) |
| Build / QA | Nix flake (`crane`, `nixosModules`, `homeManagerModules`), `cargo-deny`, `cargo-audit`, `cargo-fuzz`, Vitest, Playwright |

## Estrutura do repositório

```text
BetterKeePass/
├─ flake.nix / flake.lock
├─ nix/                    # Derivação, módulos NixOS / Home Manager e testes em VM
├─ crates/
│  ├─ bkp-core/            # Modelo, abrir/salvar KDBX, busca, histórico, merge, gerador, TOTP
│  ├─ bkp-passkey/         # Autenticador WebAuthn (create/get, authData, COSE, signCount)
│  ├─ bkp-protocol/        # Mensagens extensão↔app (serde) + Noise
│  ├─ bkp-platform/        # Traits de plataforma (AutoType, QuickUnlock, SecretService, SshAgent)
│  ├─ bkp-proxy/           # Native messaging host
│  └─ bkp-cli/             # CLI (`bkp`, paridade com keepassxc-cli)
├─ apps/desktop/           # App Tauri v2 + React (Fase 2)
├─ extension/              # WebExtension MV3 (Fase 3)
├─ fuzz/                   # Alvos cargo-fuzz para o parser KDBX
└─ docs/                   # Arquitetura, modelo de ameaças, formato de passkeys, roadmap
```
