package app.betterkeepass.ui.detail

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Restore
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.betterkeepass.R
import app.betterkeepass.ui.common.FlagSecureEffect
import app.betterkeepass.ui.components.Avatar
import app.betterkeepass.ui.components.CopyField
import app.betterkeepass.ui.components.ProgressRing

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun EntryDetailScreen(
    onBack: () -> Unit,
    onEdit: (String) -> Unit,
    viewModel: EntryDetailViewModel = hiltViewModel(),
) {
    FlagSecureEffect()

    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    LaunchedEffect(uiState.isDeleted) {
        if (uiState.isDeleted) onBack()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {},
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null)
                    }
                },
                actions = {
                    uiState.details?.summary?.uuid?.let { uuid ->
                        IconButton(onClick = { onEdit(uuid) }) {
                            Icon(Icons.Default.Edit, contentDescription = stringResource(R.string.detail_edit))
                        }
                        IconButton(onClick = { viewModel.deleteEntry() }) {
                            Icon(Icons.Default.Delete, contentDescription = stringResource(R.string.detail_delete))
                        }
                    }
                },
            )
        },
    ) { padding ->
        val details = uiState.details ?: return@Scaffold
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Avatar(details.summary.title, iconId = details.summary.iconId?.toInt(), size = 72.dp)
                Text(
                    details.summary.title,
                    style = MaterialTheme.typography.headlineSmall,
                    textAlign = TextAlign.Center,
                )
            }

            if (details.summary.username.isNotBlank()) {
                CopyField(
                    label = stringResource(R.string.detail_username),
                    value = details.summary.username,
                    onCopy = {
                        viewModel.copyUsername()
                    },
                )
            }

            if (details.summary.hasPassword) {
                CopyField(
                    label = stringResource(R.string.detail_password),
                    value = uiState.revealedPassword ?: "••••••••••••",
                    monospace = uiState.revealedPassword != null,
                    onRevealToggle = { viewModel.toggleRevealPassword() },
                    isRevealed = uiState.revealedPassword != null,
                    onCopy = {
                        viewModel.copyPassword()
                    },
                )
            }

            uiState.otp?.let { otp ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    CopyField(
                        label = stringResource(R.string.detail_totp),
                        value = otp.code.chunked(3).joinToString(" "),
                        monospace = true,
                        modifier = Modifier.weight(1f),
                        onCopy = viewModel::copyTotp,
                        copyOnValueClick = true,
                    )
                    ProgressRing(otp.validForSecs.toInt(), otp.periodSecs.toInt())
                    Text(
                        "${otp.validForSecs}s",
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(start = 8.dp, end = 20.dp),
                    )
                }
            }

            if (details.summary.url.isNotBlank()) {
                CopyField(
                    label = stringResource(R.string.detail_url),
                    value = details.summary.url,
                )
            }

            if (details.notes.isNotBlank()) {
                CopyField(
                    label = stringResource(R.string.detail_notes),
                    value = details.notes,
                )
            }

            if (details.summary.tags.isNotEmpty()) {
                Text(stringResource(R.string.detail_tags), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(start = 20.dp, top = 16.dp))
                FlowRow(modifier = Modifier.padding(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    details.summary.tags.forEach { tag ->
                        AssistChip(onClick = {}, label = { Text(tag) })
                    }
                }
            }

            if (details.customFields.isNotEmpty()) {
                Text(
                    stringResource(R.string.detail_custom_fields),
                    style = MaterialTheme.typography.titleSmall,
                    modifier = Modifier.padding(start = 20.dp, top = 16.dp),
                )
                details.customFields.forEach { field ->
                    val display = if (field.protected) {
                        uiState.revealedFields[field.name] ?: "••••••••"
                    } else {
                        field.value ?: ""
                    }
                    CopyField(
                        label = field.name,
                        value = display,
                        monospace = !field.protected || uiState.revealedFields.containsKey(field.name),
                        onRevealToggle = if (field.protected) {
                            { viewModel.toggleRevealField(field.name) }
                        } else {
                            null
                        },
                        isRevealed = uiState.revealedFields.containsKey(field.name),
                        onCopy = {
                            viewModel.copyCustomField(field.name)
                        },
                    )
                }
            }

            if (uiState.history.isNotEmpty()) {
                Text(stringResource(R.string.detail_history), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(start = 20.dp, top = 16.dp))
                uiState.history.forEach { item ->
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(item.title, style = MaterialTheme.typography.bodyMedium)
                                Text(
                                    listOfNotNull(item.username.takeIf { it.isNotBlank() }, item.lastModified)
                                        .joinToString(" • "),
                                    style = MaterialTheme.typography.bodySmall,
                                )
                            }
                            TextButton(onClick = { viewModel.restoreHistory(item.index) }) {
                                Icon(Icons.Default.Restore, contentDescription = null)
                                Text(stringResource(R.string.detail_restore))
                            }
                    }
                }
            }
        }
    }

    if (uiState.showConflictDialog) {
        AlertDialog(
            onDismissRequest = viewModel::dismissConflict,
            title = { Text(stringResource(R.string.vault_conflict_title)) },
            text = { Text(stringResource(R.string.vault_conflict_message)) },
            confirmButton = {
                Button(onClick = viewModel::resolveConflictMerge) {
                    Text(stringResource(R.string.vault_conflict_merge))
                }
            },
            dismissButton = {
                OutlinedButton(onClick = viewModel::resolveConflictOverwrite) {
                    Text(stringResource(R.string.vault_conflict_overwrite))
                }
            },
        )
    }
}
