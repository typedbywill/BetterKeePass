{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.betterkeepass;
  tomlFormat = pkgs.formats.toml { };

  firefoxManifest = pkgs.writeText "org.betterkeepass.proxy-firefox.json" (
    builtins.toJSON {
      name = "org.betterkeepass.proxy";
      description = "BetterKeePass Native Messaging host";
      path = "${cfg.package}/bin/bkp-proxy";
      type = "stdio";
      allowed_extensions = [ "betterkeepass@betterkeepass.org" ];
    }
  );

  chromiumManifest = pkgs.writeText "org.betterkeepass.proxy-chromium.json" (
    builtins.toJSON {
      name = "org.betterkeepass.proxy";
      description = "BetterKeePass Native Messaging host";
      path = "${cfg.package}/bin/bkp-proxy";
      type = "stdio";
      allowed_origins = [ "chrome-extension://betterkeepass/" ];
    }
  );

  secretServicePkg = pkgs.writeTextDir "share/dbus-1/services/org.freedesktop.secrets.service" ''
    [D-BUS Service]
    Name=org.freedesktop.secrets
    Exec=${cfg.package}/bin/bkp
  '';

  autostartDesktop = pkgs.writeText "betterkeepass.desktop" ''
    [Desktop Entry]
    Type=Application
    Name=BetterKeePass
    Comment=Gerenciador de senhas e passkeys compatível com KeePassXC
    Exec=${cfg.package}/bin/bkp
    Terminal=false
    Categories=Utility;Security;
  '';
in
{
  options.programs.betterkeepass = {
    enable = lib.mkEnableOption "BetterKeePass password manager";

    package = lib.mkPackageOption pkgs "betterkeepass" { };

    browserIntegration = {
      firefox = lib.mkEnableOption "Firefox native messaging manifest";
      chromium = lib.mkEnableOption "Chromium native messaging manifest";
      brave = lib.mkEnableOption "Brave native messaging manifest";
    };

    secretService.enable = lib.mkEnableOption "org.freedesktop.secrets D-Bus provider";
    sshAgent.enable = lib.mkEnableOption "systemd user ssh-agent socket";
    autostart = lib.mkEnableOption "autostart do aplicativo desktop";

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

    environment.etc = lib.mkMerge [
      (lib.mkIf (cfg.settings != { }) {
        "xdg/betterkeepass/config.toml".source =
          tomlFormat.generate "betterkeepass-config.toml" cfg.settings;
      })
      (lib.mkIf cfg.browserIntegration.firefox {
        "firefox/native-messaging-hosts/org.betterkeepass.proxy.json".source = firefoxManifest;
        "mozilla/native-messaging-hosts/org.betterkeepass.proxy.json".source = firefoxManifest;
      })
      (lib.mkIf cfg.browserIntegration.chromium {
        "chromium/native-messaging-hosts/org.betterkeepass.proxy.json".source = chromiumManifest;
      })
      (lib.mkIf cfg.browserIntegration.brave {
        "brave/native-messaging-hosts/org.betterkeepass.proxy.json".source = chromiumManifest;
      })
      (lib.mkIf cfg.autostart {
        "xdg/autostart/betterkeepass.desktop".source = autostartDesktop;
      })
    ];

    services.dbus.packages = lib.mkIf cfg.secretService.enable [ secretServicePkg ];

    systemd.user.services.betterkeepass-ssh-agent = lib.mkIf cfg.sshAgent.enable {
      description = "BetterKeePass SSH Agent";
      wantedBy = [ "default.target" ];
      serviceConfig = {
        Type = "simple";
        ExecStart = "${cfg.package}/bin/bkp --help";
        Restart = "on-failure";
      };
    };

    environment.sessionVariables = lib.mkIf cfg.sshAgent.enable {
      SSH_AUTH_SOCK = "\${XDG_RUNTIME_DIR}/betterkeepass-ssh-agent.sock";
    };
  };
}
