//! Mesclagem determinística de dois cofres `.kdbx` por UUID e timestamp.

use std::collections::HashMap;

use keepass::db::{Entry, EntryId, GroupId};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::vault::{Vault, group_path_of};

/// Resumo das alterações aplicadas durante uma operação de merge.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeReport {
    /// Entradas novas importadas do cofre remoto.
    pub added: usize,
    /// Entradas atualizadas com versão mais recente (versão anterior salva no histórico).
    pub updated: usize,
    /// Entradas que já estavam idênticas ou mais recentes localmente.
    pub unchanged: usize,
}

impl Vault {
    /// Mescla entradas de `other` neste cofre preservando a revisão mais recente por UUID.
    pub fn merge(&mut self, other: &Self) -> MergeReport {
        let mut report = MergeReport::default();
        let other_entries: Vec<(Uuid, String, Entry)> = other
            .db
            .iter_all_entries()
            .map(|entry_ref| {
                let path = group_path_of(&other.db, entry_ref.parent().id());
                let entry: Entry = (*entry_ref).clone();
                (entry_ref.id().uuid(), path, entry)
            })
            .collect();

        let existing_ids: HashMap<Uuid, EntryId> = self
            .db
            .iter_all_entries()
            .map(|e| (e.id().uuid(), e.id()))
            .collect();

        for (uuid, group_path, incoming) in other_entries {
            if let Some(&local_id) = existing_ids.get(&uuid) {
                let local_time = self
                    .db
                    .entry(local_id)
                    .and_then(|e| e.times.last_modification);
                let incoming_time = incoming.times.last_modification;

                let should_replace = match (local_time, incoming_time) {
                    (Some(l), Some(r)) => r > l,
                    (None, Some(_)) => true,
                    _ => false,
                };

                let equal_fields = self.db.entry(local_id).is_some_and(|local| {
                    local.fields == incoming.fields && local.tags == incoming.tags
                });

                if should_replace && !equal_fields {
                    if let Some(mut entry_mut) = self.db.entry_mut(local_id) {
                        entry_mut.edit_tracking(|tracked| {
                            tracked.fields = incoming.fields;
                            tracked.tags = incoming.tags;
                            tracked.override_url = incoming.override_url;
                            tracked.times = incoming.times;
                        });
                    }
                    report.updated += 1;
                } else {
                    report.unchanged += 1;
                }
            } else {
                let target_group: GroupId = if group_path.is_empty() {
                    self.db.root().id()
                } else {
                    self.ensure_group_path(Some(&group_path))
                };
                if let Some(mut group) = self.db.group_mut(target_group)
                    && let Ok(mut created) = group.add_entry_with_id(EntryId::from_uuid(uuid))
                {
                    created.fields = incoming.fields;
                    created.tags = incoming.tags;
                    created.override_url = incoming.override_url;
                    created.times = incoming.times;
                    created.history = incoming.history;
                    report.added += 1;
                }
            }
        }

        report
    }
}
