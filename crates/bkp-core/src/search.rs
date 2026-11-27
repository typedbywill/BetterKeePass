//! Motor de busca avançada com sintaxe compatível com o KeePassXC.

use keepass::db::{EntryRef, fields};

use crate::vault::{EntrySummary, Vault};

#[derive(Debug, Clone, PartialEq, Eq)]
enum SearchField {
    Any,
    Title,
    Username,
    Url,
    Tag,
    Group,
    Notes,
}

#[derive(Debug, Clone)]
struct SearchTerm {
    field: SearchField,
    value: String,
    negated: bool,
}

impl Vault {
    /// Busca entradas no cofre usando termos livres e qualificadores (`title:`, `user:`, `url:`,
    /// `tag:`, `group:`, `notes:`, além de negação com `-termo`).
    #[must_use]
    pub fn search(&self, query: &str) -> Vec<EntrySummary> {
        let terms = parse_query(query);
        let Ok(all) = self.list(None, true) else {
            return Vec::new();
        };
        if terms.is_empty() {
            return all;
        }

        all.into_iter()
            .filter(|summary| {
                let entry_ref = self.raw_entry(summary.uuid);
                let notes = entry_ref
                    .as_ref()
                    .and_then(|e| e.get(fields::NOTES))
                    .unwrap_or_default();
                terms
                    .iter()
                    .all(|term| matches_term(summary, notes, entry_ref.as_ref(), term))
            })
            .collect()
    }
}

fn parse_query(query: &str) -> Vec<SearchTerm> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;

    for ch in query.chars() {
        match ch {
            '"' => in_quotes = !in_quotes,
            c if c.is_whitespace() && !in_quotes => {
                if !current.is_empty() {
                    tokens.push(std::mem::take(&mut current));
                }
            }
            c => current.push(c),
        }
    }
    if !current.is_empty() {
        tokens.push(current);
    }

    tokens
        .into_iter()
        .filter_map(|raw| {
            let (negated, rest) = if let Some(stripped) = raw.strip_prefix('-') {
                (true, stripped)
            } else {
                (false, raw.as_str())
            };
            if rest.is_empty() {
                return None;
            }
            let (field, val) = if let Some((prefix, v)) = rest.split_once(':') {
                let f = match prefix.to_ascii_lowercase().as_str() {
                    "title" | "t" => Some(SearchField::Title),
                    "user" | "username" | "u" => Some(SearchField::Username),
                    "url" => Some(SearchField::Url),
                    "tag" | "tags" => Some(SearchField::Tag),
                    "group" | "g" => Some(SearchField::Group),
                    "notes" | "note" | "n" => Some(SearchField::Notes),
                    _ => None,
                };
                if let Some(matched_field) = f {
                    (matched_field, v)
                } else {
                    (SearchField::Any, rest)
                }
            } else {
                (SearchField::Any, rest)
            };
            if val.is_empty() {
                return None;
            }
            Some(SearchTerm {
                field,
                value: val.to_ascii_lowercase(),
                negated,
            })
        })
        .collect()
}

fn matches_term(
    summary: &EntrySummary,
    notes: &str,
    entry: Option<&EntryRef<'_>>,
    term: &SearchTerm,
) -> bool {
    let needle = &term.value;
    let found = match term.field {
        SearchField::Title => summary.title.to_ascii_lowercase().contains(needle),
        SearchField::Username => summary.username.to_ascii_lowercase().contains(needle),
        SearchField::Url => summary.url.to_ascii_lowercase().contains(needle),
        SearchField::Tag => summary
            .tags
            .iter()
            .any(|t| t.to_ascii_lowercase().contains(needle)),
        SearchField::Group => summary.group_path.to_ascii_lowercase().contains(needle),
        SearchField::Notes => notes.to_ascii_lowercase().contains(needle),
        SearchField::Any => {
            summary.title.to_ascii_lowercase().contains(needle)
                || summary.username.to_ascii_lowercase().contains(needle)
                || summary.url.to_ascii_lowercase().contains(needle)
                || summary.group_path.to_ascii_lowercase().contains(needle)
                || summary
                    .tags
                    .iter()
                    .any(|t| t.to_ascii_lowercase().contains(needle))
                || notes.to_ascii_lowercase().contains(needle)
                || entry.is_some_and(|e| {
                    e.fields.iter().any(|(k, v)| {
                        !v.is_protected()
                            && (k.to_ascii_lowercase().contains(needle)
                                || v.get().to_ascii_lowercase().contains(needle))
                    })
                })
        }
    };
    if term.negated { !found } else { found }
}
