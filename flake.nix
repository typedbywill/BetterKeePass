{
  description = "BetterKeePass — sucessor open source do KeePassXC com passkeys e integração NixOS";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    crane.url = "github:ipetkov/crane";
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
      self,
      nixpkgs,
      crane,
      rust-overlay,
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
        // pkgs.lib.optionalAttrs pkgs.stdenv.hostPlatform.isLinux {
          nixos-test = import ./nix/tests/nixos-module-test.nix {
            inherit pkgs;
            nixosModule = self.nixosModules.default;
            package = built.package;
          };
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
          system = pkgs.stdenv.hostPlatform.system;
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
          androidShell =
            if pkgs.stdenv.hostPlatform.isLinux then
              let
                pkgsAndroid = import nixpkgs {
                  inherit system;
                  overlays = [ rust-overlay.overlays.default ];
                  config = {
                    allowUnfree = true;
                    android_sdk.accept_license = true;
                  };
                };
                androidComposition = pkgsAndroid.androidenv.composeAndroidPackages {
                  buildToolsVersions = [ "35.0.0" ];
                  platformVersions = [ "35" ];
                  includeNDK = true;
                  ndkVersions = [ "27.2.12479018" ];
                  includeEmulator = false;
                  includeSystemImages = false;
                };
                rustAndroidToolchain = pkgsAndroid.rust-bin.stable.latest.default.override {
                  extensions = [
                    "rust-src"
                    "rust-analyzer"
                  ];
                  targets = [
                    "aarch64-linux-android"
                    "armv7-linux-androideabi"
                    "x86_64-linux-android"
                  ];
                };
              in
              pkgsAndroid.mkShell {
                packages = [
                  rustAndroidToolchain
                  pkgsAndroid.cargo-ndk
                  pkgsAndroid.gradle
                  pkgsAndroid.jdk17
                  androidComposition.androidsdk
                ];
                ANDROID_HOME = "${androidComposition.androidsdk}/libexec/android-sdk";
                ANDROID_SDK_ROOT = "${androidComposition.androidsdk}/libexec/android-sdk";
                ANDROID_NDK_HOME = "${androidComposition.androidsdk}/libexec/android-sdk/ndk-bundle";
                JAVA_HOME = "${pkgsAndroid.jdk17}";
                GRADLE_OPTS = "-Dorg.gradle.project.android.aapt2FromMavenOverride=${androidComposition.androidsdk}/libexec/android-sdk/build-tools/35.0.0/aapt2";
              }
            else
              craneLib.devShell { };
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
          android = androidShell;
        }
      );

      nixosModules.default = import ./nix/nixos-module.nix;
      homeManagerModules.default = import ./nix/hm-module.nix;
    };
}
