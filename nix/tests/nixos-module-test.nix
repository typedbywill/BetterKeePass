{
  pkgs,
  nixosModule,
  package,
}:
pkgs.testers.runNixOSTest {
  name = "betterkeepass-nixos-module";

  nodes.machine = {
    imports = [ nixosModule ];

    programs.betterkeepass = {
      enable = true;
      inherit package;
      browserIntegration = {
        firefox = true;
        chromium = true;
        brave = true;
      };
      secretService.enable = true;
      sshAgent.enable = true;
      autostart = true;
      settings = {
        security.lockAfterSeconds = 300;
        clipboard.clearAfterSeconds = 15;
      };
    };
  };

  testScript = ''
    machine.wait_for_unit("multi-user.target")
    machine.succeed("which bkp")
    machine.succeed("which bkp-proxy")
    machine.succeed("test -f /etc/xdg/betterkeepass/config.toml")
    machine.succeed("grep -q 'lockAfterSeconds = 300' /etc/xdg/betterkeepass/config.toml")
    machine.succeed("grep -q 'bkp-proxy' /etc/mozilla/native-messaging-hosts/org.betterkeepass.proxy.json")
    machine.succeed("grep -q 'bkp-proxy' /etc/chromium/native-messaging-hosts/org.betterkeepass.proxy.json")
    machine.succeed("grep -q 'bkp-proxy' /etc/brave/native-messaging-hosts/org.betterkeepass.proxy.json")
    machine.succeed("grep -q 'org.freedesktop.secrets.service' /etc/dbus-1/session.conf")
    machine.succeed("test -f /etc/xdg/autostart/betterkeepass.desktop")
  '';
}
