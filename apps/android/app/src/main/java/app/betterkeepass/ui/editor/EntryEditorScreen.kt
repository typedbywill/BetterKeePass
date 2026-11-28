package app.betterkeepass.ui.editor

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.betterkeepass.R
import app.betterkeepass.ui.common.FlagSecureEffect

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EntryEditorScreen(
    onBack: () -> Unit,
    viewModel: EntryEditorViewModel = hiltViewModel(),
) {
    FlagSecureEffect()

    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    LaunchedEffect(uiState.savedDone) {
        if (uiState.savedDone) onBack()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        stringResource(
                            if (uiState.isEditing) R.string.editor_edit_title else R.string.editor_new_title,
                        )
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null)
                    }
                },
                actions = {
                    TextButton(
                        onClick = viewModel::save,
                        enabled = uiState.title.isNotBlank() && !uiState.isSaving,
                    ) {
                        Text(stringResource(R.string.editor_save))
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedTextField(
                value = uiState.title,
                onValueChange = viewModel::updateTitle,
                label = { Text(stringResource(R.string.editor_title_label)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )

            if (!uiState.isEditing) {
                OutlinedTextField(
                    value = uiState.groupPath,
                    onValueChange = viewModel::updateGroupPath,
                    label = { Text(stringResource(R.string.editor_group_label)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            OutlinedTextField(
                value = uiState.username,
                onValueChange = viewModel::updateUsername,
                label = { Text(stringResource(R.string.detail_username)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )

            OutlinedTextField(
                value = uiState.password,
                onValueChange = viewModel::updatePassword,
                label = { Text(stringResource(R.string.detail_password)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = viewModel::generateRandomPassword) {
                    Text(stringResource(R.string.editor_generate_password))
                }
                OutlinedButton(onClick = viewModel::generateRandomPassphrase) {
                    Text(stringResource(R.string.editor_generate_passphrase))
                }
            }

            OutlinedTextField(
                value = uiState.url,
                onValueChange = viewModel::updateUrl,
                label = { Text(stringResource(R.string.detail_url)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )

            OutlinedTextField(
                value = uiState.notes,
                onValueChange = viewModel::updateNotes,
                label = { Text(stringResource(R.string.detail_notes)) },
                minLines = 3,
                modifier = Modifier.fillMaxWidth(),
            )

            uiState.customFields.forEachIndexed { idx, field ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    OutlinedTextField(
                        value = field.name,
                        onValueChange = { viewModel.updateCustomField(idx, field.copy(name = it)) },
                        label = { Text(stringResource(R.string.editor_field_name)) },
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                    )
                    OutlinedTextField(
                        value = field.value,
                        onValueChange = { viewModel.updateCustomField(idx, field.copy(value = it)) },
                        label = { Text(stringResource(R.string.editor_field_value)) },
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                    )
                    Checkbox(
                        checked = field.protected,
                        onCheckedChange = {
                            viewModel.updateCustomField(idx, field.copy(protected = it))
                        },
                    )
                    IconButton(onClick = { viewModel.removeCustomField(idx) }) {
                        Icon(Icons.Default.Delete, contentDescription = null)
                    }
                }
            }

            OutlinedButton(onClick = viewModel::addCustomField) {
                Icon(Icons.Default.Add, contentDescription = null)
                Text(stringResource(R.string.editor_add_field))
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
