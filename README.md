# BetterKeePass

Sucessor open source do KeePassXC: um gerenciador de senhas moderno, focado em segurança, usabilidade e integração de primeira classe ao NixOS, com compatibilidade total de arquivos `.kdbx` e suporte a **passkeys** (WebAuthn) gravados diretamente no cofre.

## Componentes implementados

- **Núcleo (`crates/bkp-core`):** leitura/escrita KDBX4 (e leitura KDBX3.1 com migração), busca avançada (`title:`, `tag:`, `group:`, `-termo`), histórico, lixeira, anexos, gerador de senhas e passphrases, TOTP RFC 6238, merge/sync, análise de saúde (`zxcvbn` + HIBP k-anonymity), import/export (CSV, Bitwarden JSON, 1PUX) e configuração declarativa TOML/Nix.
- **Passkeys (`crates/bkp-passkey`):** autenticador WebAuthn (ES256 e EdDSA, CBOR/COSE, `signCount`) gravado como atributos protegidos `KPEX_PASSKEY_*` + `BKP_PASSKEY_*`, além dos contratos de provedores nativos de SO ([docs/phase6-beyond.md](docs/phase6-beyond.md)).
- **Protocolo e Proxy (`crates/bkp-protocol`, `crates/bkp-proxy`):** canal cifrado Noise `XX` com código de confirmação de 6 dígitos e host Native Messaging.
- **Integrações (`crates/bkp-platform`):** clipboard com auto-clear, parser/trait Auto-Type, servidor `ssh-agent` Ed25519 em socket Unix, modelo Secret Service, Quick Unlock e YubiKey challenge-response.
- **CLI (`crates/bkp-cli`):** binário `bkp` (`db-create`, `ls`, `search`, `show`, `add`, `edit`, `rm`, `mkdir`, `attach-add`, `attach-export`, `history`, `generate`, `passphrase`, `totp`, `health`, `merge`, `import`, `export-csv`, `migrate-kdbx4`).
- **Desktop (`apps/desktop`):** Tauri v2 + React 19 + Tailwind CSS v4 + HeroUI + TanStack Query + Zustand + i18n (`pt-BR` e `en`), Command Palette (`Ctrl+K`), modo apresentação e aviso de configuração gerenciada pelo Nix.
- **Extensão (`extension/`):** WebExtension MV3 (WXT + TypeScript) com interceptação WebAuthn no *MAIN world*, autofill e fallback para autenticador nativo.
- **NixOS (`nix/`):** `flake.nix` com pacote (`bkp` e `bkp-proxy`), módulos NixOS e Home Manager (`browserIntegration`, `secretService`, `sshAgent`, `autostart`, `settings`) e teste de VM em [nix/tests/nixos-module-test.nix](nix/tests/nixos-module-test.nix).

## Compilar e testar com Nix

```bash
# Entrar no ambiente de desenvolvimento
nix develop

# Compilar os binários CLI e Native Messaging (`bkp` e `bkp-proxy`)
nix build
./result/bin/bkp --help

# Rodar todas as verificações Nix (package, fmt, clippy, test, cargo-deny e interop com keepassxc-cli)
nix flake check -L
```

## Frontend e Extensão

```bash
cd extension && pnpm install && pnpm typecheck && pnpm test && pnpm build
cd apps/desktop && pnpm install && pnpm typecheck && pnpm test && pnpm build
```

## Documentação

- [Arquitetura](docs/architecture.md)
- [Modelo de Ameaças](docs/threat-model.md)
- [Formato de Passkeys no KDBX](docs/passkey-format.md)
- [Fase 6 — Além](docs/phase6-beyond.md)
- [Roadmap](docs/roadmap.md)

## Licença

Distribuído sob a licença **GPL-3.0-or-later**. Veja [LICENSE](LICENSE).
