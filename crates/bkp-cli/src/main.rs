//! CLI `bkp` para gerenciamento de cofres `.kdbx` pelo terminal.
//!
//! Nota de segurança: a variável de ambiente `BKP_PASSWORD` é suportada apenas
//! para automação, testes e CI; em uso interativo, prefira o prompt seguro.

use std::{
    fs,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result, bail};
use bkp_core::{
    EntryPatch, NewEntry, PasswordOptions, Vault, analyze_health, export_csv, generate_passphrase,
    generate_password, import_1pux_json, import_bitwarden_json, import_csv,
};
use clap::{Args, Parser, Subcommand, ValueEnum};
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

#[derive(Clone, Copy, ValueEnum)]
enum ImportFormat {
    Csv,
    Bitwarden,
    #[value(name = "1pux")]
    OnePux,
}

#[derive(Subcommand)]
enum Commands {
    /// Cria um novo banco de dados KDBX 4.
    #[command(name = "db-create")]
    DbCreate {
        database: PathBuf,
        #[arg(long)]
        name: Option<String>,
        #[command(flatten)]
        auth: DbAuthArgs,
    },
    /// Lista grupos e entradas do banco de dados.
    Ls {
        database: PathBuf,
        group: Option<String>,
        #[arg(short = 'R', long)]
        recursive: bool,
        #[command(flatten)]
        auth: DbAuthArgs,
    },
    /// Busca entradas usando a sintaxe avançada (`title:`, `tag:`, `-termo`, etc.).
    Search {
        database: PathBuf,
        query: String,
        #[command(flatten)]
        auth: DbAuthArgs,
    },
    /// Mostra detalhes de uma entrada.
    Show {
        database: PathBuf,
        entry: String,
        #[arg(short = 's', long = "show-protected")]
        show_protected: bool,
        #[arg(short = 't', long)]
        totp: bool,
        #[command(flatten)]
        auth: DbAuthArgs,
    },
    /// Adiciona uma nova entrada ao banco de dados.
    Add {
        database: PathBuf,
        entry: String,
        #[arg(short = 'u', long)]
        username: Option<String>,
        #[arg(long)]
        url: Option<String>,
        #[arg(long)]
        notes: Option<String>,
        #[arg(short = 'g', long)]
        generate: bool,
        #[arg(short = 'L', long, default_value_t = 20)]
        length: usize,
        #[arg(short = 'p', long = "password-prompt")]
        password_prompt: bool,
        #[command(flatten)]
        auth: DbAuthArgs,
    },
    /// Edita uma entrada existente.
    Edit {
        database: PathBuf,
        entry: String,
        #[arg(long)]
        title: Option<String>,
        #[arg(short = 'u', long)]
        username: Option<String>,
        #[arg(long)]
        url: Option<String>,
        #[arg(long)]
        notes: Option<String>,
        #[arg(short = 'g', long)]
        generate: bool,
        #[arg(short = 'L', long, default_value_t = 20)]
        length: usize,
        #[arg(short = 'p', long = "password-prompt")]
        password_prompt: bool,
        #[command(flatten)]
        auth: DbAuthArgs,
    },
    /// Remove uma entrada (envia para a lixeira ou exclui definitivamente com `--permanent`).
    Rm {
        database: PathBuf,
        entry: String,
        #[arg(long)]
        permanent: bool,
        #[command(flatten)]
        auth: DbAuthArgs,
    },
    /// Cria um grupo (e subgrupos intermediários).
    Mkdir {
        database: PathBuf,
        group: String,
        #[command(flatten)]
        auth: DbAuthArgs,
    },
    /// Anexa um arquivo a uma entrada.
    #[command(name = "attach-add")]
    AttachAdd {
        database: PathBuf,
        entry: String,
        file: PathBuf,
        #[arg(long)]
        name: Option<String>,
        #[command(flatten)]
        auth: DbAuthArgs,
    },
    /// Extrai um anexo de uma entrada para disco.
    #[command(name = "attach-export")]
    AttachExport {
        database: PathBuf,
        entry: String,
        attachment_name: String,
        output: PathBuf,
        #[command(flatten)]
        auth: DbAuthArgs,
    },
    /// Exibe o histórico de versões de uma entrada.
    History {
        database: PathBuf,
        entry: String,
        #[command(flatten)]
        auth: DbAuthArgs,
    },
    /// Gera uma senha aleatória sem abrir nenhum cofre.
    Generate {
        #[arg(short = 'L', long, default_value_t = 20)]
        length: usize,
        #[arg(long)]
        no_lowercase: bool,
        #[arg(long)]
        no_uppercase: bool,
        #[arg(long)]
        no_digits: bool,
        #[arg(long)]
        no_symbols: bool,
        #[arg(long)]
        exclude_ambiguous: bool,
    },
    /// Gera uma passphrase com wordlist EFF.
    Passphrase {
        #[arg(short = 'w', long, default_value_t = 6)]
        words: usize,
        #[arg(short = 's', long, default_value = "-")]
        separator: String,
    },
    /// Exibe o código TOTP atual de uma entrada.
    Totp {
        database: PathBuf,
        entry: String,
        #[command(flatten)]
        auth: DbAuthArgs,
    },
    /// Analisa a saúde das senhas do cofre (força e reutilização).
    Health {
        database: PathBuf,
        #[command(flatten)]
        auth: DbAuthArgs,
    },
    /// Mescla outro cofre `.kdbx` dentro do cofre principal.
    Merge {
        database: PathBuf,
        other_database: PathBuf,
        #[command(flatten)]
        auth: DbAuthArgs,
    },
    /// Importa entradas de CSV, Bitwarden JSON ou 1Password 1PUX JSON.
    Import {
        database: PathBuf,
        input: PathBuf,
        #[arg(long, value_enum)]
        format: ImportFormat,
        #[command(flatten)]
        auth: DbAuthArgs,
    },
    /// Exporta entradas do cofre para CSV.
    #[command(name = "export-csv")]
    ExportCsv {
        database: PathBuf,
        output: PathBuf,
        #[command(flatten)]
        auth: DbAuthArgs,
    },
    /// Converte/salva um banco KDBX 3.1 para KDBX 4.
    #[command(name = "migrate-kdbx4")]
    MigrateKdbx4 {
        database: PathBuf,
        #[command(flatten)]
        auth: DbAuthArgs,
    },
}

#[allow(clippy::too_many_lines)]
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
        Commands::Search {
            database,
            query,
            auth,
        } => cmd_search(&database, &query, &auth),
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
        Commands::Rm {
            database,
            entry,
            permanent,
            auth,
        } => cmd_rm(&database, &entry, permanent, &auth),
        Commands::Mkdir {
            database,
            group,
            auth,
        } => cmd_mkdir(&database, &group, &auth),
        Commands::AttachAdd {
            database,
            entry,
            file,
            name,
            auth,
        } => cmd_attach_add(&database, &entry, &file, name.as_deref(), &auth),
        Commands::AttachExport {
            database,
            entry,
            attachment_name,
            output,
            auth,
        } => cmd_attach_export(&database, &entry, &attachment_name, &output, &auth),
        Commands::History {
            database,
            entry,
            auth,
        } => cmd_history(&database, &entry, &auth),
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
        Commands::Passphrase { words, separator } => {
            let phrase = generate_passphrase(words, &separator)?;
            println!("{}", phrase.expose_secret());
            Ok(())
        }
        Commands::Totp {
            database,
            entry,
            auth,
        } => cmd_totp(&database, &entry, &auth),
        Commands::Health { database, auth } => cmd_health(&database, &auth),
        Commands::Merge {
            database,
            other_database,
            auth,
        } => cmd_merge(&database, &other_database, &auth),
        Commands::Import {
            database,
            input,
            format,
            auth,
        } => cmd_import(&database, &input, format, &auth),
        Commands::ExportCsv {
            database,
            output,
            auth,
        } => cmd_export_csv(&database, &output, &auth),
        Commands::MigrateKdbx4 { database, auth } => cmd_migrate_kdbx4(&database, &auth),
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

fn cmd_search(database: &Path, query: &str, auth: &DbAuthArgs) -> Result<()> {
    let password = read_master_password(auth, false)?;
    let vault = Vault::open(database, password, auth.key_file.as_deref())?;
    for item in vault.search(query) {
        if item.group_path.is_empty() {
            println!("{} ({})", item.title, item.uuid);
        } else {
            println!("{}/{} ({})", item.group_path, item.title, item.uuid);
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
    if !details.attachments.is_empty() {
        println!("Attachments: {}", details.attachments.join(", "));
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

fn cmd_rm(database: &Path, entry: &str, permanent: bool, auth: &DbAuthArgs) -> Result<()> {
    let master_pw = read_master_password(auth, false)?;
    let mut vault = Vault::open(database, master_pw.clone(), auth.key_file.as_deref())?;
    let summary = vault.find_by_path(entry)?;
    vault.delete_entry(summary.uuid, permanent)?;
    vault.save(database, master_pw, auth.key_file.as_deref())?;
    println!("Entrada removida: {}", summary.uuid);
    Ok(())
}

fn cmd_mkdir(database: &Path, group: &str, auth: &DbAuthArgs) -> Result<()> {
    let master_pw = read_master_password(auth, false)?;
    let mut vault = Vault::open(database, master_pw.clone(), auth.key_file.as_deref())?;
    let uuid = vault.create_group(group)?;
    vault.save(database, master_pw, auth.key_file.as_deref())?;
    println!("Grupo criado: {group} ({uuid})");
    Ok(())
}

fn cmd_attach_add(
    database: &Path,
    entry: &str,
    file: &Path,
    name: Option<&str>,
    auth: &DbAuthArgs,
) -> Result<()> {
    let master_pw = read_master_password(auth, false)?;
    let mut vault = Vault::open(database, master_pw.clone(), auth.key_file.as_deref())?;
    let summary = vault.find_by_path(entry)?;
    let data = fs::read(file)?;
    let att_name = name
        .map(ToOwned::to_owned)
        .or_else(|| file.file_name().map(|n| n.to_string_lossy().into_owned()))
        .context("não foi possível determinar o nome do anexo")?;
    vault.add_attachment(summary.uuid, &att_name, data)?;
    vault.save(database, master_pw, auth.key_file.as_deref())?;
    println!("Anexo '{att_name}' gravado em {}", summary.uuid);
    Ok(())
}

fn cmd_attach_export(
    database: &Path,
    entry: &str,
    attachment_name: &str,
    output: &Path,
    auth: &DbAuthArgs,
) -> Result<()> {
    let master_pw = read_master_password(auth, false)?;
    let vault = Vault::open(database, master_pw, auth.key_file.as_deref())?;
    let summary = vault.find_by_path(entry)?;
    let bytes = vault.get_attachment(summary.uuid, attachment_name)?;
    fs::write(output, bytes)?;
    println!("Anexo exportado para {}", output.display());
    Ok(())
}

fn cmd_history(database: &Path, entry: &str, auth: &DbAuthArgs) -> Result<()> {
    let master_pw = read_master_password(auth, false)?;
    let vault = Vault::open(database, master_pw, auth.key_file.as_deref())?;
    let summary = vault.find_by_path(entry)?;
    for item in vault.entry_history(summary.uuid)? {
        println!(
            "#{} | {} | {} | {}",
            item.index,
            item.title,
            item.username,
            item.last_modified.as_deref().unwrap_or("-")
        );
    }
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

fn cmd_health(database: &Path, auth: &DbAuthArgs) -> Result<()> {
    let password = read_master_password(auth, false)?;
    let vault = Vault::open(database, password, auth.key_file.as_deref())?;
    let report = analyze_health(&vault);
    println!(
        "Total: {} | Vazias: {} | Fracas: {} | Reutilizadas: {}",
        report.total_entries, report.empty_count, report.weak_count, report.reused_count
    );
    for issue in report.issues {
        println!(
            "- {:?} | {} (score {})",
            issue.kind, issue.title, issue.score
        );
    }
    Ok(())
}

fn cmd_merge(database: &Path, other_database: &Path, auth: &DbAuthArgs) -> Result<()> {
    let password = read_master_password(auth, false)?;
    let mut vault = Vault::open(database, password.clone(), auth.key_file.as_deref())?;
    let other = Vault::open(other_database, password.clone(), auth.key_file.as_deref())?;
    let report = vault.merge(&other);
    vault.save(database, password, auth.key_file.as_deref())?;
    println!(
        "Merge concluído: {} adicionadas, {} atualizadas, {} inalteradas",
        report.added, report.updated, report.unchanged
    );
    Ok(())
}

fn cmd_import(
    database: &Path,
    input: &Path,
    format: ImportFormat,
    auth: &DbAuthArgs,
) -> Result<()> {
    let password = read_master_password(auth, false)?;
    let mut vault = Vault::open(database, password.clone(), auth.key_file.as_deref())?;
    let content = fs::read_to_string(input)?;
    let report = match format {
        ImportFormat::Csv => import_csv(&mut vault, &content)?,
        ImportFormat::Bitwarden => import_bitwarden_json(&mut vault, &content)?,
        ImportFormat::OnePux => import_1pux_json(&mut vault, &content)?,
    };
    vault.save(database, password, auth.key_file.as_deref())?;
    println!(
        "Importação concluída: {} importadas, {} ignoradas",
        report.imported, report.skipped
    );
    Ok(())
}

fn cmd_export_csv(database: &Path, output: &Path, auth: &DbAuthArgs) -> Result<()> {
    let password = read_master_password(auth, false)?;
    let vault = Vault::open(database, password, auth.key_file.as_deref())?;
    let csv_text = export_csv(&vault)?;
    fs::write(output, csv_text)?;
    println!("CSV exportado para {}", output.display());
    Ok(())
}

fn cmd_migrate_kdbx4(database: &Path, auth: &DbAuthArgs) -> Result<()> {
    let password = read_master_password(auth, false)?;
    let mut vault = Vault::open(database, password.clone(), auth.key_file.as_deref())?;
    vault.upgrade_to_kdbx4();
    vault.save(database, password, auth.key_file.as_deref())?;
    println!("Banco migrado e salvo em KDBX 4: {}", database.display());
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
