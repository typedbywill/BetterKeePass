{
  description = "BetterKeePass — sucessor open source do KeePassXC com passkeys e integração NixOS";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    crane.url = "github:ipetkov/crane";
  };

  outputs =
    {
      self,
      nixpkgs,
      crane,
    }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      packages = forAllSystems (
        pkgs:
        let
          built = import ./nix/package.nix {
            inherit pkgs crane;
            srcRoot = ./.;
          };
        in
        {
          default = built.package;
          betterkeepass = built.package;
        }
      );

      apps = forAllSystems (pkgs: {
        default = {
          type = "app";
          program = "${self.packages.${pkgs.stdenv.hostPlatform.system}.default}/bin/bkp";
        };
      });

      overlays.default = final: _prev: {
        betterkeepass = self.packages.${final.stdenv.hostPlatform.system}.default;
      };

      checks = forAllSystems (
        pkgs:
        let
          built = import ./nix/package.nix {
            inherit pkgs crane;
            srcRoot = ./.;
          };
        in
        built.checks
      );

      devShells = forAllSystems (
        pkgs:
        let
          craneLib = crane.mkLib pkgs;
          tauriLinuxDeps = pkgs.lib.optionals pkgs.stdenv.hostPlatform.isLinux (
            with pkgs;
            [
              webkitgtk_4_1
              gtk3
              libsoup_3
              openssl
              glib
              librsvg
            ]
          );
        in
        {
          default = craneLib.devShell {
            packages =
              with pkgs;
              [
                rust-analyzer
                cargo-deny
                cargo-audit
                pnpm
                nodejs
                keepassxc
                pkg-config
              ]
              ++ tauriLinuxDeps;
          };
        }
      );

      nixosModules.default = import ./nix/nixos-module.nix;
      homeManagerModules.default = import ./nix/hm-module.nix;
    };
}
