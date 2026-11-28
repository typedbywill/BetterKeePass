package app.betterkeepass.ui.vault

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridScope
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.SearchOff
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Timer
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.betterkeepass.R
import app.betterkeepass.ui.components.Avatar
import app.betterkeepass.ui.components.EmptyState
import app.betterkeepass.ui.components.keepassIcon
import app.betterkeepass.ui.theme.BkpTheme
import uniffi.bkp_ffi.EntrySummaryDto
import uniffi.bkp_ffi.GroupNodeDto

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VaultListScreen(
    vaultName: String,
    onEntryClick: (String) -> Unit,
    onAddEntry: (groupPath: String) -> Unit,
    onOpenSettings: () -> Unit,
    viewModel: VaultListViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val focus = LocalFocusManager.current
    val inFolder = uiState.path.isNotEmpty()

    LaunchedEffect(Unit) {
        viewModel.refresh()
    }

    // Back leaves the search first, then walks up the folders.
    BackHandler(enabled = uiState.isSearching || inFolder) {
        if (uiState.isSearching) {
            focus.clearFocus()
            viewModel.onQueryChange("")
        } else {
            viewModel.navigateUp()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        if (inFolder) uiState.path.substringAfterLast('/') else vaultName.removeSuffix(".kdbx"),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                },
                navigationIcon = {
                    if (inFolder) {
                        IconButton(onClick = viewModel::navigateUp) {
                            Icon(
                                Icons.AutoMirrored.Outlined.ArrowBack,
                                contentDescription = stringResource(R.string.vault_back),
                            )
                        }
                    }
                },
                actions = {
                    IconButton(onClick = onOpenSettings) {
                        Icon(Icons.Outlined.Settings, contentDescription = stringResource(R.string.vault_settings))
                    }
                    IconButton(onClick = { viewModel.lockVault() }) {
                        Icon(Icons.Outlined.Lock, contentDescription = stringResource(R.string.vault_lock))
                    }
                },
            )
        },
        floatingActionButton = {
            // New entries never start life in the recycle bin.
            if (!uiState.inRecycleBin) {
                FloatingActionButton(onClick = { onAddEntry(uiState.path) }) {
                    Icon(Icons.Outlined.Add, contentDescription = stringResource(R.string.vault_add_entry))
                }
            }
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            SearchBar(
                query = uiState.query,
                onQueryChange = viewModel::onQueryChange,
                onSearch = { focus.clearFocus() },
            )

            if (uiState.isSearching) {
                Row(
                    modifier = Modifier.padding(horizontal = 20.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    SearchFilter.entries.forEach { filter ->
                        FilterChip(
                            selected = uiState.filter == filter,
                            onClick = { viewModel.onFilterSelected(filter) },
                            shape = CircleShape,
                            label = {
                                Text(
                                    stringResource(
                                        when (filter) {
                                            SearchFilter.All -> R.string.vault_filter_all
                                            SearchFilter.Totp -> R.string.vault_filter_totp
                                            SearchFilter.Passkey -> R.string.vault_filter_passkey
                                        },
                                    ),
                                )
                            },
                        )
                    }
                }
            }

            val folders = if (uiState.isSearching) emptyList() else uiState.folders
            when {
                uiState.isLoading -> Unit
                folders.isEmpty() && uiState.entries.isEmpty() -> EmptyState(
                    icon = if (uiState.isSearching) Icons.Outlined.SearchOff else Icons.Outlined.Folder,
                    title = stringResource(
                        if (uiState.isSearching) R.string.vault_no_results else R.string.vault_empty_folder,
                    ),
                    modifier = Modifier.padding(top = 48.dp),
                )
                // A fresh scroll position for each folder and for search results.
                else -> key(uiState.path, uiState.isSearching) {
                    LazyVerticalGrid(
                        columns = GridCells.Adaptive(96.dp),
                        state = rememberLazyGridState(),
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(start = 8.dp, end = 8.dp, bottom = 96.dp),
                    ) {
                        if (folders.isNotEmpty()) {
                            sectionTitle("folders", R.string.vault_folders)
                            items(folders, key = { it.uuid }) { folder ->
                                FolderTile(folder, onClick = { viewModel.openFolder(folder.path) })
                            }
                        }
                        if (uiState.entries.isNotEmpty()) {
                            if (folders.isNotEmpty()) sectionTitle("entries", R.string.vault_entries)
                            items(
                                uiState.entries,
                                key = { it.uuid },
                                span = { GridItemSpan(maxLineSpan) },
                            ) { entry ->
                                EntryRow(
                                    entry = entry,
                                    showFolder = uiState.isSearching,
                                    onClick = { onEntryClick(entry.uuid) },
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SearchBar(query: String, onQueryChange: (String) -> Unit, onSearch: () -> Unit) {
    val colors = BkpTheme.colors
    TextField(
        value = query,
        onValueChange = onQueryChange,
        placeholder = { Text(stringResource(R.string.vault_search_placeholder)) },
        leadingIcon = { Icon(Icons.Outlined.Search, contentDescription = null) },
        trailingIcon = if (query.isNotEmpty()) {
            {
                IconButton(onClick = { onQueryChange("") }) {
                    Icon(Icons.Outlined.Close, contentDescription = stringResource(R.string.vault_search_clear))
                }
            }
        } else {
            null
        },
        singleLine = true,
        shape = CircleShape,
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search, autoCorrectEnabled = false),
        keyboardActions = KeyboardActions(onSearch = { onSearch() }),
        colors = TextFieldDefaults.colors(
            focusedContainerColor = colors.bgMuted,
            unfocusedContainerColor = colors.bgMuted,
            focusedIndicatorColor = Color.Transparent,
            unfocusedIndicatorColor = Color.Transparent,
        ),
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp),
    )
}

private fun LazyGridScope.sectionTitle(key: String, title: Int) {
    item(key = key, span = { GridItemSpan(maxLineSpan) }) {
        Text(
            stringResource(title),
            style = MaterialTheme.typography.labelSmall,
            color = BkpTheme.colors.fgSubtle,
            modifier = Modifier.padding(start = 12.dp, top = 20.dp, bottom = 8.dp),
        )
    }
}

@Composable
private fun FolderTile(folder: GroupNodeDto, onClick: () -> Unit) {
    val colors = BkpTheme.colors
    // Icon 48 is the KeePass default folder, so the generic one is used for it too.
    val icon = when {
        folder.isRecycleBin -> Icons.Outlined.Delete
        else -> folder.iconId?.toInt()?.takeIf { it != 48 }?.let(::keepassIcon) ?: Icons.Outlined.Folder
    }
    val tint = if (folder.isRecycleBin) colors.fgSubtle else colors.accent
    Column(
        modifier = Modifier
            .clip(MaterialTheme.shapes.medium)
            .clickable(onClick = onClick)
            .padding(horizontal = 4.dp, vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier
                .size(60.dp)
                .background(
                    if (folder.isRecycleBin) colors.bgMuted else colors.accentSubtle,
                    RoundedCornerShape(20.dp),
                ),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(28.dp))
        }
        Text(
            if (folder.isRecycleBin) stringResource(R.string.vault_recycle_bin) else folder.name,
            style = MaterialTheme.typography.labelLarge,
            textAlign = TextAlign.Center,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 6.dp),
        )
        Text(
            folder.totalEntries().toString(),
            style = MaterialTheme.typography.bodySmall,
            color = colors.fgSubtle,
        )
    }
}

@Composable
private fun EntryRow(entry: EntrySummaryDto, showFolder: Boolean, onClick: () -> Unit) {
    val colors = BkpTheme.colors
    val subtitle = listOfNotNull(
        entry.groupPath.takeIf { showFolder && it.isNotEmpty() },
        entry.username.ifBlank { entry.url }.takeIf { it.isNotBlank() },
    ).joinToString(" · ")
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(MaterialTheme.shapes.medium)
            .clickable(onClick = onClick)
            .heightIn(min = 64.dp)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Avatar(entry.title, iconId = entry.iconId?.toInt(), size = 44.dp)
        Column(Modifier.weight(1f)) {
            Text(
                entry.title,
                style = MaterialTheme.typography.titleMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (subtitle.isNotEmpty()) {
                Text(
                    subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.fgSubtle,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        if (entry.hasOtp) {
            Icon(Icons.Outlined.Timer, "TOTP", tint = colors.fgSubtle, modifier = Modifier.size(18.dp))
        }
        if (entry.hasPasskey) {
            Icon(
                Icons.Outlined.Key,
                stringResource(R.string.detail_passkey_badge),
                tint = colors.accent,
                modifier = Modifier.size(18.dp),
            )
        }
    }
}
