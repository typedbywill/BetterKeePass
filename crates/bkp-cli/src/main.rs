//! CLI `bkp` para gerenciamento de cofres `.kdbx` pelo terminal.
//!
//! Nota de segurança: a variável de ambiente `BKP_PASSWORD` é suportada apenas
//! para automação, testes e CI; em uso interativo, prefira o prompt seguro.

use std::path::{Path, PathBuf};

use anyhow::{Context, Result, bail};
use bkp_core::{EntryPatch, NewEntry, PasswordOptions, Vault, generate_password};
use clap::{Args, Parser, Subcommand};
use secrecy::{ExposeSecret, SecretString};

#[derive(Parser)]
#[command(
    name = "bkp",
    version,
    about = "BetterKeePass CLI — gerenciador de cofres KDBX"
)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Args, Clone)]
struct DbAuthArgs {
    /// Caminho do arquivo de arquivo-chave (.keyx / .key).
    #[arg(short = 'k', long = "key-file")]
    key_file: Option<PathBuf>,

    /// Não solicitar senha mestra (útil quando apenas arquivo-chave é usado).
    #[arg(long = "no-password")]
    no_password: bool,
}

#[derive(Subcommand)]
enum Commands {
    /// Cria um novo banco de dados KDBX 4.
    #[command(name = "db-create")]
    DbCreate {
        /// Caminho do novo arquivo `.kdbx`.
        database: PathBuf,
        /// Nome interno opcional do banco de dados.
        #[arg(long)]
        name: Option<String>,
        #[command(flatten)]
        auth: DbAuthArgs,
    },
    /// Lista grupos e entradas do banco de dados.
    Ls {
        /// Caminho do arquivo `.kdbx`.
        database: PathBuf,
        /// Caminho do grupo a listar (padrão: raiz).
        group: Option<String>,
        /// Lista recursivamente todos os subgrupos.
        #[arg(short = 'R', long)]
        recursive: bool,
        #[command(flatten)]
        auth: DbAuthArgs,
    },
    /// Mostra detalhes de uma entrada.
    Show {
        /// Caminho do arquivo `.kdbx`.
        database: PathBuf,
        /// Nome, caminho (`Grupo/Entrada`) ou UUID da entrada.
        entry: String,
        /// Revela atributos protegidos (como senha e campos secretos) em texto claro.
        #[arg(short = 's', long = "show-protected")]
        show_protected: bool,
        /// Exibe também o código TOTP atual, se configurado.
        #[arg(short = 't', long)]
        totp: bool,
        #[command(flatten)]
        auth: DbAuthArgs,
    },
    /// Adiciona uma nova entrada ao banco de dados.
    Add {
        /// Caminho do arquivo `.kdbx`.
        database: PathBuf,
        /// Caminho ou título da nova entrada (ex.: `Email/Pessoal`).
        entry: String,
        /// Nome de usuário da entrada.
        #[arg(short = 'u', long)]
        username: Option<String>,
        /// URL associada à entrada.
        #[arg(long)]
        url: Option<String>,
        /// Notas da entrada.
        #[arg(long)]
        notes: Option<String>,
        /// Gera uma senha aleatória automaticamente.
        #[arg(short = 'g', long)]
        generate: bool,
        /// Comprimento da senha gerada (quando `--generate` estiver ativo).
        #[arg(short = 'L', long, default_value_t = 20)]
        length: usize,
        /// Solicita a senha da entrada em prompt interativo.
        #[arg(short = 'p', long = "password-prompt")]
        password_prompt: bool,
        #[command(flatten)]
        auth: DbAuthArgs,
    },
    /// Edita uma entrada existente.
    Edit {
        /// Caminho do arquivo `.kdbx`.
        database: PathBuf,
        /// Nome, caminho (`Grupo/Entrada`) ou UUID da entrada.
        entry: String,
        /// Novo título.
        #[arg(long)]
        title: Option<String>,
        /// Novo usuário.
        #[arg(short = 'u', long)]
        username: Option<String>,
        /// Nova URL.
        #[arg(long)]
        url: Option<String>,
        /// Novas notas.
        #[arg(long)]
        notes: Option<String>,
        /// Gera e grava uma nova senha aleatória.
        #[arg(short = 'g', long)]
        generate: bool,
        /// Comprimento da senha gerada.
        #[arg(short = 'L', long, default_value_t = 20)]
        length: usize,
        /// Solicita nova senha em prompt interativo.
        #[arg(short = 'p', long = "password-prompt")]
        password_prompt: bool,
        #[command(flatten)]
        auth: DbAuthArgs,
    },
    /// Gera uma senha aleatória sem abrir nenhum cofre.
    Generate {
        /// Comprimento da senha.
        #[arg(short = 'L', long, default_value_t = 20)]
        length: usize,
        /// Exclui letras minúsculas.
        #[arg(long)]
        no_lowercase: bool,
        /// Exclui letras maiúsculas.
        #[arg(long)]
        no_uppercase: bool,
        /// Exclui dígitos.
        #[arg(long)]
        no_digits: bool,
        /// Exclui símbolos especiais.
        #[arg(long)]
        no_symbols: bool,
        /// Exclui caracteres visualmente ambíguos (`0`, `O`, `1`, `l`, `I`).
        #[arg(long)]
        exclude_ambiguous: bool,
    },
    /// Exibe o código TOTP atual de uma entrada.
    Totp {
        /// Caminho do arquivo `.kdbx`.
        database: PathBuf,
        /// Nome, caminho (`Grupo/Entrada`) ou UUID da entrada.
        entry: String,
        #[command(flatten)]
        auth: DbAuthArgs,
    },
}

fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::DbCreate {
            database,
            name,
            auth,
        } => cmd_db_create(&database, name.as_deref(), &auth),
        Commands::Ls {
            database,
            group,
            recursive,
            auth,
        } => cmd_ls(&database, group.as_deref(), recursive, &auth),
        Commands::Show {
            database,
            entry,
            show_protected,
            totp,
            auth,
        } => cmd_show(&database, &entry, show_protected, totp, &auth),
        Commands::Add {
            database,
            entry,
            username,
            url,
            notes,
            generate,
            length,
            password_prompt,
            auth,
        } => cmd_add(
            &database,
            &entry,
            username,
            url,
            notes,
            generate,
            length,
            password_prompt,
            &auth,
        ),
        Commands::Edit {
            database,
            entry,
            title,
            username,
            url,
            notes,
            generate,
            length,
            password_prompt,
            auth,
        } => cmd_edit(
            &database,
            &entry,
            title,
            username,
            url,
            notes,
            generate,
            length,
            password_prompt,
            &auth,
        ),
        Commands::Generate {
            length,
            no_lowercase,
            no_uppercase,
            no_digits,
            no_symbols,
            exclude_ambiguous,
        } => cmd_generate(
            length,
            no_lowercase,
            no_uppercase,
            no_digits,
            no_symbols,
            exclude_ambiguous,
        ),
        Commands::Totp {
            database,
            entry,
            auth,
        } => cmd_totp(&database, &entry, &auth),
    }
}

fn cmd_db_create(database: &Path, name: Option<&str>, auth: &DbAuthArgs) -> Result<()> {
    if database.exists() {
        bail!("arquivo já existe: {}", database.display());
    }
    let password = read_master_password(auth, true)?;
    let vault = Vault::create(name);
    vault
        .save(database, password, auth.key_file.as_deref())
        .with_context(|| format!("não foi possível criar {}", database.display()))?;
    println!("Banco criado com sucesso: {}", database.display());
    Ok(())
}

fn cmd_ls(database: &Path, group: Option<&str>, recursive: bool, auth: &DbAuthArgs) -> Result<()> {
    let password = read_master_password(auth, false)?;
    let vault = Vault::open(database, password, auth.key_file.as_deref())?;

    if !recursive {
        for subgroup in vault.list_groups(group)? {
            println!("{subgroup}/");
        }
    }
    for entry in vault.list(group, recursive)? {
        if recursive && !entry.group_path.is_empty() {
            println!("{}/{}", entry.group_path, entry.title);
        } else {
            println!("{}", entry.title);
        }
    }
    Ok(())
}

fn cmd_show(
    database: &Path,
    entry: &str,
    show_protected: bool,
    totp: bool,
    auth: &DbAuthArgs,
) -> Result<()> {
    let password = read_master_password(auth, false)?;
    let vault = Vault::open(database, password, auth.key_file.as_deref())?;
    let summary = vault.find_by_path(entry)?;
    let details = vault.entry_details(summary.uuid, show_protected)?;

    println!("Title: {}", details.summary.title);
    println!("UserName: {}", details.summary.username);
    if let Some(pw) = &details.password {
        println!("Password: {}", pw.expose_secret());
    } else {
        println!("Password: [protegido]");
    }
    println!("URL: {}", details.summary.url);
    println!("Notes: {}", details.notes);
    println!("Uuid: {{{}}}", details.summary.uuid);
    if !details.summary.tags.is_empty() {
        println!("Tags: {}", details.summary.tags.join(", "));
    }
    for field in &details.custom_fields {
        match &field.value {
            Some(v) => println!("{}: {v}", field.name),
            None => println!("{}: [protegido]", field.name),
        }
    }
    if totp && details.has_otp {
        let otp = vault.totp_now(details.summary.uuid)?;
        println!("TOTP: {} ({}s)", otp.code, otp.valid_for_secs);
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn cmd_add(
    database: &Path,
    entry: &str,
    username: Option<String>,
    url: Option<String>,
    notes: Option<String>,
    generate: bool,
    length: usize,
    password_prompt: bool,
    auth: &DbAuthArgs,
) -> Result<()> {
    if generate && password_prompt {
        bail!("use apenas uma das opções: --generate ou --password-prompt");
    }
    let master_pw = read_master_password(auth, false)?;
    let mut vault = Vault::open(database, master_pw.clone(), auth.key_file.as_deref())?;

    let (group_path, title) = split_entry_path(entry)?;
    let entry_password = resolve_entry_password(generate, password_prompt, length)?;

    let uuid = vault.add_entry(
        group_path.as_deref(),
        NewEntry {
            title: title.clone(),
            username,
            password: entry_password,
            url,
            notes,
            ..NewEntry::default()
        },
    )?;
    vault.save(database, master_pw, auth.key_file.as_deref())?;
    println!("Entrada adicionada: {title} ({uuid})");
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn cmd_edit(
    database: &Path,
    entry: &str,
    title: Option<String>,
    username: Option<String>,
    url: Option<String>,
    notes: Option<String>,
    generate: bool,
    length: usize,
    password_prompt: bool,
    auth: &DbAuthArgs,
) -> Result<()> {
    if generate && password_prompt {
        bail!("use apenas uma das opções: --generate ou --password-prompt");
    }
    let master_pw = read_master_password(auth, false)?;
    let mut vault = Vault::open(database, master_pw.clone(), auth.key_file.as_deref())?;

    let summary = vault.find_by_path(entry)?;
    let new_password = resolve_entry_password(generate, password_prompt, length)?;

    vault.edit_entry(
        summary.uuid,
        EntryPatch {
            title,
            username,
            password: new_password,
            url,
            notes,
            ..EntryPatch::default()
        },
    )?;
    vault.save(database, master_pw, auth.key_file.as_deref())?;
    println!("Entrada atualizada: {}", summary.uuid);
    Ok(())
}

#[allow(clippy::fn_params_excessive_bools)]
fn cmd_generate(
    length: usize,
    no_lowercase: bool,
    no_uppercase: bool,
    no_digits: bool,
    no_symbols: bool,
    exclude_ambiguous: bool,
) -> Result<()> {
    let pw = generate_password(&PasswordOptions {
        length,
        lowercase: !no_lowercase,
        uppercase: !no_uppercase,
        digits: !no_digits,
        symbols: !no_symbols,
        exclude_ambiguous,
    })?;
    println!("{}", pw.expose_secret());
    Ok(())
}

fn cmd_totp(database: &Path, entry: &str, auth: &DbAuthArgs) -> Result<()> {
    let password = read_master_password(auth, false)?;
    let vault = Vault::open(database, password, auth.key_file.as_deref())?;
    let summary = vault.find_by_path(entry)?;
    let otp = vault.totp_now(summary.uuid)?;
    println!("{}", otp.code);
    Ok(())
}

fn read_master_password(auth: &DbAuthArgs, confirm: bool) -> Result<Option<SecretString>> {
    if auth.no_password {
        return Ok(None);
    }
    if let Ok(env_pw) = std::env::var("BKP_PASSWORD") {
        return Ok(Some(SecretString::from(env_pw)));
    }
    let pw = rpassword::prompt_password("Senha mestra: ")?;
    if confirm {
        let pw2 = rpassword::prompt_password("Confirmar senha mestra: ")?;
        if pw != pw2 {
            bail!("as senhas não coincidem");
        }
    }
    Ok(Some(SecretString::from(pw)))
}

fn resolve_entry_password(
    generate: bool,
    password_prompt: bool,
    length: usize,
) -> Result<Option<SecretString>> {
    if generate {
        let pw = generate_password(&PasswordOptions {
            length,
            ..PasswordOptions::default()
        })?;
        Ok(Some(pw))
    } else if password_prompt {
        let pw = rpassword::prompt_password("Senha da entrada: ")?;
        Ok(Some(SecretString::from(pw)))
    } else {
        Ok(None)
    }
}

fn split_entry_path(raw: &str) -> Result<(Option<String>, String)> {
    let trimmed = raw.trim().trim_matches('/');
    if trimmed.is_empty() {
        bail!("o nome da entrada não pode ser vazio");
    }
    match trimmed.rsplit_once('/') {
        Some((group, title)) if !title.trim().is_empty() => {
            Ok((Some(group.to_owned()), title.trim().to_owned()))
        }
        _ => Ok((None, trimmed.to_owned())),
    }
}
