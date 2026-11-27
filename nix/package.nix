{
  pkgs,
  crane,
  srcRoot,
}:
let
  inherit (pkgs) lib;
  craneLib = crane.mkLib pkgs;

  src = lib.fileset.toSource {
    root = srcRoot;
    fileset = lib.fileset.unions [
      (craneLib.fileset.commonCargoSources srcRoot)
      (srcRoot + "/crates/bkp-core/tests/fixtures")
      (srcRoot + "/deny.toml")
    ];
  };

  commonArgs = {
    inherit src;
    strictDeps = true;
    pname = "betterkeepass";
    version = "0.1.0";
  };

  cargoArtifacts = craneLib.buildDepsOnly commonArgs;

  package = craneLib.buildPackage (
    commonArgs
    // {
      inherit cargoArtifacts;
      cargoExtraArgs = "-p bkp-cli";
      doCheck = false;
      meta = {
        description = "Gerenciador de senhas compatível com KDBX, passkeys WebAuthn e integração NixOS";
        homepage = "https://github.com/betterkeepass/BetterKeePass";
        license = lib.licenses.gpl3Plus;
        mainProgram = "bkp";
        platforms = lib.platforms.unix;
      };
    }
  );

  interop =
    pkgs.runCommand "bkp-keepassxc-interop"
      {
        nativeBuildInputs = [
          package
          pkgs.keepassxc
        ];
      }
      ''
        export HOME="$TMPDIR"
        export BKP_PASSWORD="interop-secret"

        bkp db-create bkp.kdbx --name InteropTest
        bkp add bkp.kdbx "Contas/Email" --username "alice@example.org" --generate

        printf 'interop-secret\n' | keepassxc-cli show -s bkp.kdbx "Contas/Email" > from_bkp.txt
        grep -q "UserName: alice@example.org" from_bkp.txt

        printf 'interop-secret\ninterop-secret\n' | keepassxc-cli db-create -p -t 100 kpxc.kdbx
        printf 'interop-secret\nfrom-kpxc-pass\n' | keepassxc-cli add -u bob --url https://nixos.org -p kpxc.kdbx "NixOS"

        bkp show kpxc.kdbx "NixOS" --show-protected > from_kpxc.txt
        grep -q "UserName: bob" from_kpxc.txt
        grep -q "Password: from-kpxc-pass" from_kpxc.txt

        touch "$out"
      '';
in
{
  inherit package;
  checks = {
    inherit package interop;
    clippy = craneLib.cargoClippy (
      commonArgs
      // {
        inherit cargoArtifacts;
        cargoClippyExtraArgs = "--workspace --all-targets -- -D warnings";
      }
    );
    fmt = craneLib.cargoFmt {
      inherit src;
    };
    test = craneLib.cargoTest (
      commonArgs
      // {
        inherit cargoArtifacts;
      }
    );
    # `advisories` exige rede para baixar o advisory-db e não roda no sandbox Nix;
    # a auditoria de vulnerabilidades roda fora do sandbox via `cargo audit` / CI.
    deny = craneLib.cargoDeny {
      inherit src;
      cargoDenyExtraArgs = "licenses bans sources";
    };
  };
}
