{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.betterkeepass;
  tomlFormat = pkgs.formats.toml { };
in
{
  options.programs.betterkeepass = {
    enable = lib.mkEnableOption "BetterKeePass password manager";

    package = lib.mkPackageOption pkgs "betterkeepass" { };

    browserIntegration = {
      firefox = lib.mkEnableOption "Firefox native messaging manifest (implementado na Fase 3)";
      chromium = lib.mkEnableOption "Chromium native messaging manifest (implementado na Fase 3)";
      brave = lib.mkEnableOption "Brave native messaging manifest (implementado na Fase 3)";
    };

    secretService.enable = lib.mkEnableOption "org.freedesktop.secrets provider (implementado na Fase 4)";
    sshAgent.enable = lib.mkEnableOption "systemd user ssh-agent socket (implementado na Fase 4)";
    autostart = lib.mkEnableOption "autostart do aplicativo desktop (implementado na Fase 2/4)";

    settings = lib.mkOption {
      type = tomlFormat.type;
      default = { };
      description = "Configuração declarativa gravada em /etc/xdg/betterkeepass/config.toml.";
      example = {
        security.lockAfterSeconds = 300;
        clipboard.clearAfterSeconds = 15;
      };
    };
  };

  config = lib.mkIf cfg.enable {
    environment.systemPackages = [ cfg.package ];

    environment.etc."xdg/betterkeepass/config.toml" = lib.mkIf (cfg.settings != { }) {
      source = tomlFormat.generate "betterkeepass-config.toml" cfg.settings;
    };

    warnings =
      lib.optional (
        cfg.browserIntegration.firefox || cfg.browserIntegration.chromium || cfg.browserIntegration.brave
      ) "programs.betterkeepass.browserIntegration ainda é um esqueleto e será ativado na Fase 3."
      ++ lib.optional cfg.secretService.enable "programs.betterkeepass.secretService.enable ainda é um esqueleto e será ativado na Fase 4."
      ++ lib.optional cfg.sshAgent.enable "programs.betterkeepass.sshAgent.enable ainda é um esqueleto e será ativado na Fase 4."
      ++ lib.optional cfg.autostart "programs.betterkeepass.autostart ainda é um esqueleto e será ativado na Fase 2/4.";
  };
}
