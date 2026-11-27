# BetterKeePass

Sucessor open source do KeePassXC: um gerenciador de senhas moderno, focado em segurança, usabilidade e integração de primeira classe ao NixOS, com compatibilidade total de arquivos `.kdbx` e suporte a **passkeys** (WebAuthn) gravados diretamente no cofre.

> **Status:** Pré-alpha (Fase 0 concluída, Fase 1 em andamento — biblioteca `bkp-core` e CLI `bkp`).

## Compilar e testar com Nix

```bash
# Entrar no ambiente de desenvolvimento
nix develop

# Compilar o binário CLI (`bkp`)
nix build
./result/bin/bkp --help

# Rodar todas as verificações (fmt, clippy, testes, cargo-deny e interoperabilidade com keepassxc-cli)
nix flake check -L
```

## Uso básico da CLI (`bkp`)

```bash
cargo run -p bkp-cli -- db-create cofre.kdbx
cargo run -p bkp-cli -- add cofre.kdbx "Email/Pessoal" --username alice@exemplo.org --generate
cargo run -p bkp-cli -- ls cofre.kdbx
cargo run -p bkp-cli -- show cofre.kdbx "Email/Pessoal" --show-protected
cargo run -p bkp-cli -- totp cofre.kdbx "Email/Pessoal"
```

## Documentação

- [Arquitetura](docs/architecture.md)
- [Modelo de Ameaças](docs/threat-model.md)
- [Formato de Passkeys no KDBX](docs/passkey-format.md)
- [Roadmap](docs/roadmap.md)

## Licença

Distribuído sob a licença **GPL-3.0-or-later**. Veja [LICENSE](LICENSE).
