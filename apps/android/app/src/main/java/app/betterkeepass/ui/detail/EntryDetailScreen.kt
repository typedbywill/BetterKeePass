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
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Restore
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.betterkeepass.R
import app.betterkeepass.ui.common.FlagSecureEffect
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun EntryDetailScreen(
    onBack: () -> Unit,
    onEdit: (String) -> Unit,
    viewModel: EntryDetailViewModel = hiltViewModel(),
) {
    FlagSecureEffect()

    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val copiedMsg = stringResource(R.string.detail_copied)

    LaunchedEffect(uiState.isDeleted) {
        if (uiState.isDeleted) onBack()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(uiState.details?.summary?.title ?: "") },
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
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        val details = uiState.details ?: return@Scaffold
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (details.summary.username.isNotBlank()) {
                FieldCard(
                    label = stringResource(R.string.detail_username),
                    value = details.summary.username,
                    onCopy = {
                        viewModel.copyUsername()
                        scope.launch { snackbarHostState.showSnackbar(copiedMsg) }
                    },
                )
            }

            if (details.summary.hasPassword) {
                FieldCard(
                    label = stringResource(R.string.detail_password),
                    value = uiState.revealedPassword ?: "••••••••••••",
                    monospace = uiState.revealedPassword != null,
                    onRevealToggle = { viewModel.toggleRevealPassword() },
                    isRevealed = uiState.revealedPassword != null,
                    onCopy = {
                        viewModel.copyPassword()
                        scope.launch { snackbarHostState.showSnackbar(copiedMsg) }
                    },
                )
            }

            uiState.otp?.let { otp ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Column {
                            Text(
                                text = stringResource(R.string.detail_totp),
                                style = MaterialTheme.typography.labelMedium,
                            )
                            Text(
                                text = otp.code,
                                style = MaterialTheme.typography.headlineMedium,
                                fontFamily = FontFamily.Monospace,
                            )
                        }
                        val progress = if (otp.periodSecs > 0uL) {
                            otp.validForSecs.toFloat() / otp.periodSecs.toFloat()
                        } else {
                            0f
                        }
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            CircularProgressIndicator(
                                progress = { progress },
                                modifier = Modifier.size(32.dp),
                            )
                            Text("${otp.validForSecs}s")
                        }
                    }
                }
            }

            if (details.summary.url.isNotBlank()) {
                FieldCard(
                    label = stringResource(R.string.detail_url),
                    value = details.summary.url,
                )
            }

            if (details.notes.isNotBlank()) {
                FieldCard(
                    label = stringResource(R.string.detail_notes),
                    value = details.notes,
                )
            }

            if (details.summary.tags.isNotEmpty()) {
                Text(stringResource(R.string.detail_tags), style = MaterialTheme.typography.titleSmall)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    details.summary.tags.forEach { tag ->
                        AssistChip(onClick = {}, label = { Text(tag) })
                    }
                }
            }

            if (details.customFields.isNotEmpty()) {
                Text(
                    stringResource(R.string.detail_custom_fields),
                    style = MaterialTheme.typography.titleSmall,
                )
                details.customFields.forEach { field ->
                    val display = if (field.protected) {
                        uiState.revealedFields[field.name] ?: "••••••••"
                    } else {
                        field.value ?: ""
                    }
                    FieldCard(
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
                            scope.launch { snackbarHostState.showSnackbar(copiedMsg) }
                        },
                    )
                }
            }

            if (uiState.history.isNotEmpty()) {
                Text(stringResource(R.string.detail_history), style = MaterialTheme.typography.titleSmall)
                uiState.history.forEach { item ->
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(12.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
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

@Composable
private fun FieldCard(
    label: String,
    value: String,
    monospace: Boolean = false,
    isRevealed: Boolean = false,
    onRevealToggle: (() -> Unit)? = null,
    onCopy: (() -> Unit)? = null,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(label, style = MaterialTheme.typography.labelMedium)
                Text(
                    text = value,
                    style = MaterialTheme.typography.bodyLarge,
                    fontFamily = if (monospace) FontFamily.Monospace else FontFamily.Default,
                )
            }
            if (onRevealToggle != null) {
                IconButton(onClick = onRevealToggle) {
                    Icon(
                        imageVector = if (isRevealed) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                        contentDescription = stringResource(if (isRevealed) R.string.detail_hide else R.string.detail_reveal),
                    )
                }
            }
            if (onCopy != null) {
                IconButton(onClick = onCopy) {
                    Icon(Icons.Default.ContentCopy, contentDescription = stringResource(R.string.detail_copy))
                }
            }
        }
    }
}
