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

    secretService.enable = lib.mkEnableOption "org.freedesktop.secrets provider";
    sshAgent.enable = lib.mkEnableOption "systemd user ssh-agent socket";
    autostart = lib.mkEnableOption "autostart do aplicativo desktop";

    settings = lib.mkOption {
      type = tomlFormat.type;
      default = { };
      description = "Configuração declarativa gravada em XDG_CONFIG_HOME/betterkeepass/config.toml.";
    };
  };

  config = lib.mkIf cfg.enable {
    home.packages = [ cfg.package ];

    xdg.configFile = lib.mkMerge [
      (lib.mkIf (cfg.settings != { }) {
        "betterkeepass/config.toml".source =
          tomlFormat.generate "betterkeepass-config.toml" cfg.settings;
      })
      (lib.mkIf cfg.browserIntegration.chromium {
        "chromium/NativeMessagingHosts/org.betterkeepass.proxy.json".source = chromiumManifest;
      })
      (lib.mkIf cfg.browserIntegration.brave {
        "BraveSoftware/Brave-Browser/NativeMessagingHosts/org.betterkeepass.proxy.json".source =
          chromiumManifest;
      })
      (lib.mkIf cfg.autostart {
        "autostart/betterkeepass.desktop".text = ''
          [Desktop Entry]
          Type=Application
          Name=BetterKeePass
          Exec=${cfg.package}/bin/bkp
          Terminal=false
        '';
      })
    ];

    home.file.".mozilla/native-messaging-hosts/org.betterkeepass.proxy.json" =
      lib.mkIf cfg.browserIntegration.firefox {
        source = firefoxManifest;
      };

    xdg.dataFile."dbus-1/services/org.freedesktop.secrets.service" = lib.mkIf cfg.secretService.enable {
      text = ''
        [D-BUS Service]
        Name=org.freedesktop.secrets
        Exec=${cfg.package}/bin/bkp
      '';
    };

    systemd.user.services.betterkeepass-ssh-agent = lib.mkIf cfg.sshAgent.enable {
      Unit.Description = "BetterKeePass SSH Agent";
      Install.WantedBy = [ "default.target" ];
      Service = {
        ExecStart = "${cfg.package}/bin/bkp --help";
        Restart = "on-failure";
      };
    };

    home.sessionVariables = lib.mkIf cfg.sshAgent.enable {
      SSH_AUTH_SOCK = "\${XDG_RUNTIME_DIR}/betterkeepass-ssh-agent.sock";
    };
  };
}
