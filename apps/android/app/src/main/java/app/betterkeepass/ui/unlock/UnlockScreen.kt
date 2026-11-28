package app.betterkeepass.ui.unlock

import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Fingerprint
import androidx.compose.material.icons.filled.FolderOpen
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.LockOpen
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.betterkeepass.R
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UnlockScreen(
    viewModel: UnlockViewModel = hiltViewModel(),
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val recentVaults by viewModel.recentVaults.collectAsStateWithLifecycle()

    var password by remember { mutableStateOf("") }
    var showPassword by remember { mutableStateOf(false) }
    var showCreateDialog by remember { mutableStateOf(false) }
    var pendingCreateName by remember { mutableStateOf("BetterKeePass") }
    var pendingCreatePassword by remember { mutableStateOf("") }

    val openVaultLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument(),
    ) { uri: Uri? ->
        if (uri != null) {
            runCatching {
                context.contentResolver.takePersistableUriPermission(
                    uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
                )
            }
            val name = resolveFileName(context, uri)
            viewModel.selectVault(uri, name)
        }
    }

    val openKeyfileLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument(),
    ) { uri: Uri? ->
        if (uri != null) {
            runCatching {
                context.contentResolver.takePersistableUriPermission(
                    uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION,
                )
            }
            viewModel.selectKeyfile(uri, resolveFileName(context, uri))
        }
    }

    val createVaultLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.CreateDocument("application/x-keepass2"),
    ) { uri: Uri? ->
        if (uri != null) {
            runCatching {
                context.contentResolver.takePersistableUriPermission(
                    uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
                )
            }
            viewModel.createVault(uri, pendingCreateName, pendingCreatePassword)
            pendingCreatePassword = ""
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(title = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Image(
                        painter = painterResource(R.drawable.brand_icon),
                        contentDescription = null,
                        modifier = Modifier.size(40.dp),
                    )
                    Text(stringResource(R.string.unlock_title), modifier = Modifier.padding(start = 8.dp))
                }
            })
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Button(
                    onClick = { openVaultLauncher.launch(arrayOf("*/*")) },
                    modifier = Modifier.weight(1f),
                ) {
                    Icon(Icons.Default.FolderOpen, contentDescription = null)
                    Spacer(Modifier.padding(4.dp))
                    Text(stringResource(R.string.unlock_select_vault))
                }
                OutlinedButton(
                    onClick = { showCreateDialog = true },
                    modifier = Modifier.weight(1f),
                ) {
                    Icon(Icons.Default.Add, contentDescription = null)
                    Spacer(Modifier.padding(4.dp))
                    Text(stringResource(R.string.unlock_create_vault))
                }
            }

            if (uiState.selectedUri != null) {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Text(
                            text = uiState.selectedName ?: "Vault.kdbx",
                            style = MaterialTheme.typography.titleMedium,
                        )
                        OutlinedTextField(
                            value = password,
                            onValueChange = { password = it },
                            label = { Text(stringResource(R.string.unlock_master_password)) },
                            singleLine = true,
                            visualTransformation = if (showPassword) {
                                VisualTransformation.None
                            } else {
                                PasswordVisualTransformation()
                            },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                            trailingIcon = {
                                IconButton(onClick = { showPassword = !showPassword }) {
                                    Icon(
                                        imageVector = if (showPassword) {
                                            Icons.Default.VisibilityOff
                                        } else {
                                            Icons.Default.Visibility
                                        },
                                        contentDescription = null,
                                    )
                                }
                            },
                            modifier = Modifier.fillMaxWidth(),
                        )

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            OutlinedButton(
                                onClick = { openKeyfileLauncher.launch(arrayOf("*/*")) },
                            ) {
                                Icon(Icons.Default.Key, contentDescription = null)
                                Spacer(Modifier.padding(4.dp))
                                Text(
                                    uiState.keyfileName?.let {
                                        stringResource(R.string.unlock_keyfile_selected, it)
                                    } ?: stringResource(R.string.unlock_keyfile_optional),
                                )
                            }
                            if (uiState.keyfileUri != null) {
                                TextButton(onClick = { viewModel.selectKeyfile(null, null) }) {
                                    Text(stringResource(R.string.cancel))
                                }
                            }
                        }

                        uiState.errorResId?.let { resId ->
                            Text(
                                text = stringResource(resId) + (uiState.errorDetail?.let { " ($it)" } ?: ""),
                                color = MaterialTheme.colorScheme.error,
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Button(
                                onClick = {
                                    val pw = password
                                    password = ""
                                    viewModel.unlock(pw)
                                },
                                enabled = !uiState.isLoading,
                                modifier = Modifier.weight(1f),
                            ) {
                                if (uiState.isLoading) {
                                    CircularProgressIndicator(modifier = Modifier.height(20.dp))
                                } else {
                                    Icon(Icons.Default.LockOpen, contentDescription = null)
                                    Spacer(Modifier.padding(4.dp))
                                    Text(stringResource(R.string.unlock_action))
                                }
                            }

                            if (uiState.biometricAvailableForSelected &&
                                context is FragmentActivity &&
                                BiometricManager.from(context).canAuthenticate(
                                    BiometricManager.Authenticators.BIOMETRIC_STRONG,
                                ) == BiometricManager.BIOMETRIC_SUCCESS
                            ) {
                                OutlinedButton(
                                    onClick = {
                                        scope.launch {
                                            val cipher = viewModel.prepareBiometricDecryptCipher() ?: return@launch
                                            val prompt = BiometricPrompt(
                                                context,
                                                ContextCompat.getMainExecutor(context),
                                                object : BiometricPrompt.AuthenticationCallback() {
                                                    override fun onAuthenticationSucceeded(
                                                        result: BiometricPrompt.AuthenticationResult,
                                                    ) {
                                                        result.cryptoObject?.cipher?.let {
                                                            viewModel.unlockWithBiometricCipher(it)
                                                        }
                                                    }
                                                },
                                            )
                                            val info = BiometricPrompt.PromptInfo.Builder()
                                                .setTitle(context.getString(R.string.unlock_biometric_prompt_title))
                                                .setSubtitle(context.getString(R.string.unlock_biometric_prompt_subtitle))
                                                .setNegativeButtonText(context.getString(R.string.cancel))
                                                .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                                                .build()
                                            prompt.authenticate(info, BiometricPrompt.CryptoObject(cipher))
                                        }
                                    },
                                ) {
                                    Icon(Icons.Default.Fingerprint, contentDescription = stringResource(R.string.unlock_biometric))
                                }
                            }
                        }
                    }
                }
            }

            if (recentVaults.isNotEmpty()) {
                Text(
                    text = stringResource(R.string.unlock_recent_vaults),
                    style = MaterialTheme.typography.titleSmall,
                )
                LazyColumn(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    items(recentVaults, key = { it.uri }) { recent ->
                        ListItem(
                            headlineContent = { Text(recent.displayName) },
                            supportingContent = { Text(recent.uri, maxLines = 1) },
                            leadingContent = { Icon(Icons.Default.FolderOpen, contentDescription = null) },
                            modifier = Modifier.clickable {
                                viewModel.selectVault(Uri.parse(recent.uri), recent.displayName)
                            },
                        )
                    }
                }
            }
        }
    }

    if (showCreateDialog) {
        CreateVaultDialog(
            onDismiss = { showCreateDialog = false },
            onConfirm = { name, pw ->
                pendingCreateName = name
                pendingCreatePassword = pw
                showCreateDialog = false
                createVaultLauncher.launch("${name.ifBlank { "vault" }}.kdbx")
            },
        )
    }
}

@Composable
private fun CreateVaultDialog(
    onDismiss: () -> Unit,
    onConfirm: (name: String, password: String) -> Unit,
) {
    var name by remember { mutableStateOf("BetterKeePass") }
    var password by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    val mismatch = confirm.isNotEmpty() && password != confirm

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.create_vault_title)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text(stringResource(R.string.create_vault_name)) },
                    singleLine = true,
                )
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = { Text(stringResource(R.string.unlock_master_password)) },
                    visualTransformation = PasswordVisualTransformation(),
                    singleLine = true,
                )
                OutlinedTextField(
                    value = confirm,
                    onValueChange = { confirm = it },
                    label = { Text(stringResource(R.string.create_vault_confirm_password)) },
                    visualTransformation = PasswordVisualTransformation(),
                    isError = mismatch,
                    supportingText = if (mismatch) {
                        { Text(stringResource(R.string.create_vault_password_mismatch)) }
                    } else {
                        null
                    },
                    singleLine = true,
                )
            }
        },
        confirmButton = {
            Button(
                onClick = { onConfirm(name, password) },
                enabled = password.isNotEmpty() && password == confirm,
            ) {
                Text(stringResource(R.string.create_vault_save))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.cancel))
            }
        },
    )
}

private fun resolveFileName(context: android.content.Context, uri: Uri): String {
    context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
        ?.use { cursor ->
            if (cursor.moveToFirst()) {
                val idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (idx >= 0) return cursor.getString(idx) ?: "Vault.kdbx"
            }
        }
    return uri.lastPathSegment?.substringAfterLast('/') ?: "Vault.kdbx"
}
