//! Relatórios de saúde das senhas (`zxcvbn` + HIBP k-anonymity).

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use uuid::Uuid;
use zxcvbn::{Score, zxcvbn};

use crate::vault::Vault;

/// Categoria de alerta de saúde para uma entrada.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum HealthIssueKind {
    EmptyPassword,
    WeakPassword,
    ReusedPassword,
}

/// Problema detectado em uma entrada específica.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntryHealthIssue {
    pub uuid: Uuid,
    pub title: String,
    pub group_path: String,
    pub score: u8,
    pub kind: HealthIssueKind,
}

/// Relatório consolidado de saúde do cofre.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthReport {
    pub total_entries: usize,
    pub empty_count: usize,
    pub weak_count: usize,
    pub reused_count: usize,
    pub issues: Vec<EntryHealthIssue>,
}

/// Analisa força e reutilização de senhas do cofre sem expor os segredos em texto claro.
#[must_use]
pub fn analyze_health(vault: &Vault) -> HealthReport {
    let entries = vault.list(None, true).unwrap_or_default();
    let mut report = HealthReport {
        total_entries: entries.len(),
        ..HealthReport::default()
    };

    let mut digest_groups: HashMap<[u8; 20], Vec<usize>> = HashMap::new();
    let mut scores = Vec::with_capacity(entries.len());

    for (idx, summary) in entries.iter().enumerate() {
        let Some(raw_entry) = vault.raw_entry(summary.uuid) else {
            scores.push(0);
            continue;
        };
        let password = raw_entry.get_password().unwrap_or_default();
        if password.is_empty() {
            report.empty_count += 1;
            report.issues.push(EntryHealthIssue {
                uuid: summary.uuid,
                title: summary.title.clone(),
                group_path: summary.group_path.clone(),
                score: 0,
                kind: HealthIssueKind::EmptyPassword,
            });
            scores.push(0);
            continue;
        }

        let user_inputs: Vec<&str> = [summary.title.as_str(), summary.username.as_str()]
            .into_iter()
            .filter(|s| !s.is_empty())
            .collect();
        let estimate = zxcvbn(password, &user_inputs);
        let score = score_to_u8(estimate.score());
        scores.push(score);

        if score <= 2 {
            report.weak_count += 1;
            report.issues.push(EntryHealthIssue {
                uuid: summary.uuid,
                title: summary.title.clone(),
                group_path: summary.group_path.clone(),
                score,
                kind: HealthIssueKind::WeakPassword,
            });
        }

        let hash: [u8; 20] = Sha1::digest(password.as_bytes()).into();
        digest_groups.entry(hash).or_default().push(idx);
    }

    for indices in digest_groups.values() {
        if indices.len() > 1 {
            for &idx in indices {
                report.reused_count += 1;
                let summary = &entries[idx];
                report.issues.push(EntryHealthIssue {
                    uuid: summary.uuid,
                    title: summary.title.clone(),
                    group_path: summary.group_path.clone(),
                    score: scores[idx],
                    kind: HealthIssueKind::ReusedPassword,
                });
            }
        }
    }

    report
}

/// Calcula o prefixo SHA-1 (5 chars hex) e o sufixo (35 chars hex) para consulta k-anonymity no HIBP.
#[must_use]
pub fn hibp_sha1_prefix_and_suffix(password: &str) -> (String, String) {
    let digest = Sha1::digest(password.as_bytes());
    let mut hex = String::with_capacity(40);
    for byte in digest {
        use std::fmt::Write;
        let _ = write!(hex, "{byte:02X}");
    }
    let (prefix, suffix) = hex.split_at(5);
    (prefix.to_owned(), suffix.to_owned())
}

/// Interpreta o corpo da resposta `/range/{prefix}` do HIBP e retorna quantas vezes o sufixo apareceu.
#[must_use]
pub fn parse_hibp_range_response(suffix: &str, body: &str) -> u64 {
    let target = suffix.trim().to_ascii_uppercase();
    for line in body.lines() {
        if let Some((hash_suffix, count_str)) = line.trim().split_once(':')
            && hash_suffix.trim().eq_ignore_ascii_case(&target)
            && let Ok(count) = count_str.trim().parse::<u64>()
        {
            return count;
        }
    }
    0
}

const fn score_to_u8(score: Score) -> u8 {
    match score {
        Score::One => 1,
        Score::Two => 2,
        Score::Three => 3,
        Score::Four => 4,
        _ => 0,
    }
}
