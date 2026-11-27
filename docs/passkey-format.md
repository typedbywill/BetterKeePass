# Formato de Passkeys no `.kdbx`

O BetterKeePass armazena passkeys (WebAuthn) como entradas comuns no arquivo `.kdbx`, seguindo exatamente a convenção introduzida pelo **KeePassXC 2.7.7+** para garantir interoperabilidade bidirecional.

## Atributos compatíveis com KeePassXC

Cada passkey é uma entrada contendo a tag `Passkey` e os seguintes atributos **protegidos** (criptografados no stream interno do KDBX):

| Atributo | Descrição |
|---|---|
| `KPEX_PASSKEY_CREDENTIAL_ID` | ID da credencial codificado em Base64URL |
| `KPEX_PASSKEY_PRIVATE_KEY_PEM` | Chave privada (ex.: P-256 / ES256) em formato PEM PKCS#8 |
| `KPEX_PASSKEY_RELYING_PARTY` | Identificador da Relying Party (`rp.id`, ex.: `github.com`) |
| `KPEX_PASSKEY_USERNAME` | Nome de exibição/usuário da conta (`user.name`) |
| `KPEX_PASSKEY_USER_HANDLE` | Identificador opaco do usuário (`user.id`) codificado em Base64URL |

## Extensões específicas do BetterKeePass

Metadados adicionais não cobertos pelo conjunto mínimo do KeePassXC usam o prefixo `BKP_PASSKEY_*` (como atributos protegidos ou campos adicionais), que são preservados e ignorados de forma segura pelo KeePassXC:

- `BKP_PASSKEY_SIGN_COUNT`: contador monotônico de assinaturas (`signCount`)
- `BKP_PASSKEY_BACKUP_FLAGS`: flags de elegibilidade e estado de backup (`BE`/`BS`)
- `BKP_PASSKEY_ALGORITHM`: algoritmo COSE (ex.: `-7` para ES256, `-8` para EdDSA)
