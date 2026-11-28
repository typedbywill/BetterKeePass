package app.betterkeepass.ui.vault

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material3.AssistChip
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.betterkeepass.R

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VaultListScreen(
    vaultName: String,
    onEntryClick: (String) -> Unit,
    onAddEntry: () -> Unit,
    onOpenSettings: () -> Unit,
    viewModel: VaultListViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    LaunchedEffect(Unit) {
        viewModel.refresh()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(vaultName) },
                actions = {
                    IconButton(onClick = onOpenSettings) {
                        Icon(
                            Icons.Default.Settings,
                            contentDescription = stringResource(R.string.vault_settings),
                        )
                    }
                    IconButton(onClick = { viewModel.lockVault() }) {
                        Icon(
                            Icons.Default.Lock,
                            contentDescription = stringResource(R.string.vault_lock),
                        )
                    }
                },
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = onAddEntry) {
                Icon(
                    Icons.Default.Add,
                    contentDescription = stringResource(R.string.vault_add_entry),
                )
            }
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            OutlinedTextField(
                value = uiState.query,
                onValueChange = viewModel::onQueryChange,
                placeholder = { Text(stringResource(R.string.vault_search_placeholder)) },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                singleLine = true,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
            )

            if (uiState.groups.isNotEmpty()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState())
                        .padding(horizontal = 16.dp, vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    FilterChip(
                        selected = uiState.selectedGroupPath == null,
                        onClick = { viewModel.onGroupSelected(null) },
                        label = { Text(stringResource(R.string.vault_all_groups)) },
                    )
                    uiState.groups.forEach { group ->
                        FilterChip(
                            selected = uiState.selectedGroupPath == group,
                            onClick = { viewModel.onGroupSelected(group) },
                            label = { Text(group) },
                        )
                    }
                }
            }

            if (uiState.entries.isEmpty() && !uiState.isLoading) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = stringResource(R.string.vault_empty),
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            } else {
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    items(uiState.entries, key = { it.uuid }) { entry ->
                        ListItem(
                            headlineContent = { Text(entry.title) },
                            supportingContent = {
                                val subtitle = listOfNotNull(
                                    entry.username.takeIf { it.isNotBlank() },
                                    entry.url.takeIf { it.isNotBlank() },
                                ).joinToString(" • ")
                                if (subtitle.isNotEmpty()) {
                                    Text(subtitle, maxLines = 1)
                                }
                            },
                            trailingContent = {
                                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                    if (entry.hasOtp) {
                                        Icon(
                                            Icons.Default.Timer,
                                            contentDescription = "TOTP",
                                            tint = MaterialTheme.colorScheme.primary,
                                        )
                                    }
                                    if (entry.hasPasskey) {
                                        AssistChip(
                                            onClick = {},
                                            label = { Text(stringResource(R.string.detail_passkey_badge)) },
                                            leadingIcon = {
                                                Icon(Icons.Default.Key, contentDescription = null)
                                            },
                                        )
                                    }
                                }
                            },
                            modifier = Modifier.clickable { onEntryClick(entry.uuid) },
                        )
                        HorizontalDivider()
                    }
                }
            }
        }
    }
}
