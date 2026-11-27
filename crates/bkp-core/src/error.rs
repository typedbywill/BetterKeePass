//! Tipos de erro do `bkp-core`.

use thiserror::Error;

/// Tipo de resultado padrão do `bkp-core`.
pub type Result<T> = std::result::Result<T, CoreError>;

/// Erros retornados pelas operações no cofre e utilitários criptográficos.
#[derive(Debug, Error)]
pub enum CoreError {
    /// Erro de E/S ao ler ou gravar arquivos.
    #[error("erro de E/S: {0}")]
    Io(#[from] std::io::Error),

    /// Falha ao abrir ou descriptografar o arquivo `.kdbx`.
    #[error("falha ao abrir o cofre KDBX: {0}")]
    DatabaseOpen(#[from] keepass::db::DatabaseOpenError),

    /// Falha ao serializar ou criptografar o arquivo `.kdbx`.
    #[error("falha ao salvar o cofre KDBX: {0}")]
    DatabaseSave(#[from] keepass::db::DatabaseSaveError),

    /// Erro ao processar ou gerar código TOTP.
    #[error("erro de TOTP: {0}")]
    Totp(#[from] keepass::db::TOTPError),

    /// Falha no gerador de entropia do sistema operacional.
    #[error("falha ao obter entropia do sistema: {0}")]
    Random(#[from] getrandom::Error),

    /// Erro de parsing CSV.
    #[error("erro de CSV: {0}")]
    Csv(#[from] csv::Error),

    /// Erro de parsing JSON.
    #[error("erro de JSON: {0}")]
    Json(#[from] serde_json::Error),

    /// Erro de parsing TOML.
    #[error("erro de TOML: {0}")]
    Toml(#[from] toml::de::Error),

    /// Nenhuma senha ou arquivo-chave foi informado.
    #[error("nenhuma credencial fornecida: informe senha e/ou arquivo-chave")]
    EmptyKey,

    /// Entrada solicitada não foi encontrada.
    #[error("entrada não encontrada: {0}")]
    EntryNotFound(String),

    /// Grupo solicitado não foi encontrado.
    #[error("grupo não encontrado: {0}")]
    GroupNotFound(String),

    /// Mais de uma entrada corresponde ao identificador informado.
    #[error("múltiplas entradas encontradas para '{0}'; informe o caminho completo")]
    AmbiguousEntry(String),

    /// Anexo não encontrado.
    #[error("anexo não encontrado: {0}")]
    AttachmentNotFound(String),

    /// Índice de histórico inválido.
    #[error("versão de histórico não encontrada: {0}")]
    HistoryNotFound(usize),

    /// Parâmetro ou entrada inválida.
    #[error("entrada inválida: {0}")]
    InvalidInput(String),
}
