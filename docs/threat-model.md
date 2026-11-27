# Modelo de Ameaças (Threat Model)

## Ativos protegidos

1. **Chave mestra e material de derivação** (senha mestra, keyfile, resposta HMAC-SHA1).
2. **Segredos armazenados no cofre `.kdbx`** (senhas, sementes TOTP, chaves privadas de passkeys `KPEX_PASSKEY_PRIVATE_KEY_PEM`, chaves SSH, anexos).
3. **Integridade do cofre** contra corrupção acidental ou adulteração silenciosa.
4. **Sessões de autenticação** entre navegador/extensão e o aplicativo desktop.

## Adversários considerados

- **Atacante com acesso ao disco em repouso:** lê `.kdbx` e configurações locais. Mitigado por KDBX 4.x (Argon2id/Argon2d + AES-256 ou ChaCha20 + HMAC-SHA256) e escrita atômica.
- **Conteúdo web malicioso / XSS na UI ou página visitada:** tenta extrair segredos via WebView ou APIs de navegador.
- **Processo local não privilegiado (mesmo usuário ou outro usuário):** tenta inspecionar memória, dumps de processo, área de transferência ou socket IPC local.
- **Extensão comprometida ou página falsificando origem (RP ID):** tenta obter credenciais ou assinar desafios WebAuthn sem consentimento.

## Fronteiras de confiança e mitigações

1. **Segredos permanecem no processo Rust (`bkp-core`):**
   A interface web (WebView Tauri) recebe apenas metadados (`EntrySummary`: UUID, título, usuário, URL, tags, caminho de grupo). Senhas, TOTP e chaves privadas de passkey não são serializados para o JS, exceto sob comando explícito de revelação temporária. A cópia para a área de transferência acontece inteiramente no backend Rust.
2. **Endurecimento do WebView (Tauri v2):**
   Uso do *isolation pattern*, CSP estrita (`default-src 'self'`), ausência de conteúdo remoto, sem permissões de `shell` ou `fs` expostas ao frontend, e *capabilities* mínimas por janela.
3. **Proteção de memória:**
   Tipos sensíveis envolvidos com `secrecy::SecretString` / `SecretBox` e `zeroize::ZeroizeOnDrop`. Buffers de chave mestra recebem `mlock` (`memsec`) e *core dumps* são desativados (`PR_SET_DUMPABLE=0` no Linux / `SetProcessMitigationPolicy` no Windows).
4. **Bloqueio automático e área de transferência:**
   Auto-lock por inatividade, suspensão do sistema e bloqueio de tela (via D-Bus `logind` e eventos nativos do SO). Área de transferência recebe hints de exclusão de histórico (`x-kde-passwordManagerHint`, `ExcludeClipboardContentFromMonitorProcessing`, `org.nspasteboard.ConcealedType`) e é limpa após N segundos.
5. **IPC extensão ↔ aplicativo (`bkp-proxy` + Noise):**
   Comunicação via Native Messaging até `bkp-proxy` e socket local (Unix socket com permissões `0600` / named pipe com ACL do usuário), cifrada com Noise `XX` (`snow`). Pareamento exige confirmação explícita por código exibido no app desktop e pode ser revogado por navegador em Configurações.
6. **Validação de origem WebAuthn / Passkeys:**
   O app exibe o RP ID e exige verificação do usuário antes de criar ou assinar uma credencial, validando correspondência de origem antes de liberar asserções.
7. **Fuzzing e cadeia de suprimentos:**
   Fuzzing contínuo (`cargo-fuzz`) sobre o parser KDBX, auditoria de dependências com `cargo-deny` e `cargo-audit`, builds reprodutíveis via Nix e releases assinadas com SBOM.

## Fora de escopo

- Atacante com privilégios de `root`/administrador ou controle físico do kernel enquanto o cofre está desbloqueado na memória.
- Keyloggers de hardware ou firmware comprometido fora do controle do SO.
