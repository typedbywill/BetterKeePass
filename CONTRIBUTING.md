# Contribuindo para o BetterKeePass

Obrigado pelo interesse em contribuir!

## Pré-requisitos

Recomendamos usar o Nix com flakes habilitados (`nix develop` ou `direnv allow`). Sem Nix, será necessário ter `rustc` (>= 1.89, edition 2024), `cargo`, `clippy`, `rustfmt`, `cargo-deny` e `keepassxc-cli` (para os testes de interoperabilidade).

## Fluxo de desenvolvimento

1. Verifique formatação, lints e testes antes de abrir um PR:
   ```bash
   cargo fmt --check
   cargo clippy --workspace --all-targets -- -D warnings
   cargo test --workspace
   cargo deny check licenses bans sources
   ```
2. Caso tenha Nix disponível, valide também o flake completo:
   ```bash
   nix flake check -L
   ```

## Diretrizes de código

- Mantenha segredos fora de logs, erros e saídas padrão não explícitas; use `secrecy` e `zeroize`.
- `unsafe_code` é proibido no workspace (`forbid`), exceto em módulos de plataforma que exijam FFI com justificativa documentada.
- Qualquer alteração no formato de persistência `.kdbx` deve incluir testes de *round-trip* e interoperabilidade com `keepassxc-cli`.

## Licença das contribuições

Ao contribuir, você concorda que suas contribuições serão licenciadas sob **GPL-3.0-or-later**.
