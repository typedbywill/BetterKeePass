//! Carregamento da configuração declarativa (NixOS / XDG) do BetterKeePass.

use std::{
    fs,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};

use crate::error::Result;

/// Configurações de segurança e bloqueio automático.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct SecurityConfig {
    /// Tempo de inatividade em segundos para bloquear o cofre automaticamente (0 = desativado).
    pub lock_after_seconds: u64,
    /// Bloquear ao suspender ou bloquear a sessão do sistema operacional.
    pub lock_on_session_lock: bool,
    /// Manter a sessão salva localmente para reabrir o aplicativo já desbloqueado.
    pub remember_session: bool,
}

impl Default for SecurityConfig {
    fn default() -> Self {
        Self {
            lock_after_seconds: 300,
            lock_on_session_lock: true,
            remember_session: false,
        }
    }
}

/// Configurações da área de transferência.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ClipboardConfig {
    /// Segundos antes de limpar segredos copiados.
    pub clear_after_seconds: u64,
}

impl Default for ClipboardConfig {
    fn default() -> Self {
        Self {
            clear_after_seconds: 15,
        }
    }
}

/// Configurações da interface gráfica.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct UiConfig {
    /// Tema inicial (`system`, `light` ou `dark`).
    pub theme: String,
    /// Paleta de cores selecionada (`default`, `tokyo`, `catppuccin`, etc.).
    pub theme_preset: String,
    /// Idioma inicial (`pt-BR` ou `en`).
    pub language: String,
    /// Iniciar em modo apresentação.
    pub presentation_mode: bool,
    /// Sidebar recolhida para ícones apenas.
    pub sidebar_collapsed: bool,
    /// Largura da lista de entradas em pixels.
    pub list_width: u32,
    /// Buscar favicons remotos via HTTPS (opt-in; desativado por padrão).
    pub fetch_favicons: bool,
    /// Ordenação padrão da lista (`title` ou `recent`).
    pub sort_by: String,
    /// UUIDs dos grupos expandidos na barra lateral (colapsados por padrão).
    pub expanded_groups: Vec<String>,
}

impl Default for UiConfig {
    fn default() -> Self {
        Self {
            theme: "system".to_owned(),
            theme_preset: "default".to_owned(),
            language: "pt-BR".to_owned(),
            presentation_mode: false,
            sidebar_collapsed: false,
            list_width: 320,
            fetch_favicons: false,
            sort_by: "title".to_owned(),
            expanded_groups: Vec::new(),
        }
    }
}

/// Configurações de integração com navegadores.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct BrowserIntegrationConfig {
    pub firefox: bool,
    pub chromium: bool,
    pub brave: bool,
}

/// Configurações do provedor Secret Service.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct SecretServiceConfig {
    pub enable: bool,
    pub exposed_groups: Vec<String>,
}

/// Configurações do agente SSH.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct SshAgentConfig {
    pub enable: bool,
}

/// Configuração global do aplicativo carregada de arquivos TOML.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AppConfig {
    pub security: SecurityConfig,
    pub clipboard: ClipboardConfig,
    pub ui: UiConfig,
    pub browser_integration: BrowserIntegrationConfig,
    pub secret_service: SecretServiceConfig,
    pub ssh_agent: SshAgentConfig,
    /// Indica se a configuração está bloqueada por ser gerenciada declarativamente pelo Nix.
    #[serde(skip)]
    pub managed_by_nix: bool,
    /// Caminho do arquivo de configuração ativo, se existir.
    #[serde(skip)]
    pub source_path: Option<PathBuf>,
}

impl AppConfig {
    /// Carrega a configuração considerando `/etc/xdg/betterkeepass/config.toml` e XDG do usuário.
    pub fn load() -> Result<Self> {
        let system_path = Path::new("/etc/xdg/betterkeepass/config.toml");
        if system_path.exists() {
            return Self::load_from_path(system_path);
        }

        if let Some(user_path) = user_config_path()
            && user_path.exists()
        {
            return Self::load_from_path(&user_path);
        }

        Ok(Self::default())
    }

    /// Carrega a configuração de um arquivo TOML específico e detecta gerenciamento pelo Nix.
    pub fn load_from_path(path: &Path) -> Result<Self> {
        let content = fs::read_to_string(path)?;
        let mut config: Self = toml::from_str(&content)?;
        config.managed_by_nix = detect_managed_by_nix(path);
        config.source_path = Some(path.to_path_buf());
        Ok(config)
    }

    /// Salva a configuração no caminho de origem ou no caminho padrão XDG do usuário.
    pub fn save(&self) -> Result<()> {
        if self.managed_by_nix {
            return Err(crate::error::CoreError::InvalidInput(
                "configuração gerenciada declarativamente pelo Nix".to_owned(),
            ));
        }
        let target = self
            .source_path
            .clone()
            .or_else(user_config_path)
            .ok_or_else(|| {
                crate::error::CoreError::InvalidInput(
                    "não foi possível determinar o caminho da configuração do usuário".to_owned(),
                )
            })?;
        self.save_to_path(&target)
    }

    /// Salva a configuração em um arquivo TOML (quando não gerenciada pelo Nix).
    pub fn save_to_path(&self, path: &Path) -> Result<()> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let serialized = toml::to_string_pretty(self)
            .map_err(|e| crate::error::CoreError::InvalidInput(e.to_string()))?;
        fs::write(path, serialized)?;
        Ok(())
    }
}

fn user_config_path() -> Option<PathBuf> {
    if let Ok(xdg) = std::env::var("XDG_CONFIG_HOME")
        && !xdg.trim().is_empty()
    {
        return Some(PathBuf::from(xdg).join("betterkeepass/config.toml"));
    }
    std::env::var("HOME")
        .ok()
        .map(|home| PathBuf::from(home).join(".config/betterkeepass/config.toml"))
}

fn detect_managed_by_nix(path: &Path) -> bool {
    if path.starts_with("/etc/xdg/betterkeepass") {
        return true;
    }
    if let Ok(target) = fs::read_link(path)
        && target.starts_with("/nix/store")
    {
        return true;
    }
    fs::metadata(path).is_ok_and(|m| m.permissions().readonly())
}
