package app.betterkeepass.ui.unlock

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import android.text.format.DateUtils
import android.view.HapticFeedbackConstants
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.keyframes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.Fingerprint
import androidx.compose.material.icons.outlined.FolderOpen
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.InputChip
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.betterkeepass.R
import app.betterkeepass.ui.components.BrandIcon
import app.betterkeepass.ui.components.PasswordField
import app.betterkeepass.ui.components.StrengthMeter
import app.betterkeepass.ui.theme.BkpTheme
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

    // Keyed on the vault so a typed password never carries over to another file.
    var password by remember(uiState.selectedUri) { mutableStateOf("") }
    var showCreateSheet by remember { mutableStateOf(false) }
    var showVaultSheet by remember { mutableStateOf(false) }
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

    val canUseBiometric = uiState.biometricAvailableForSelected &&
        context is FragmentActivity &&
        BiometricManager.from(context).canAuthenticate(
            BiometricManager.Authenticators.BIOMETRIC_STRONG,
        ) == BiometricManager.BIOMETRIC_SUCCESS

    val promptBiometric: () -> Unit = {
        scope.launch {
            val activity = context as? FragmentActivity ?: return@launch
            val cipher = viewModel.prepareBiometricDecryptCipher() ?: return@launch
            val prompt = BiometricPrompt(
                activity,
                ContextCompat.getMainExecutor(activity),
                object : BiometricPrompt.AuthenticationCallback() {
                    override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                        result.cryptoObject?.cipher?.let { viewModel.unlockWithBiometricCipher(it) }
                    }
                },
            )
            val info = BiometricPrompt.PromptInfo.Builder()
                .setTitle(activity.getString(R.string.unlock_biometric_prompt_title))
                .setSubtitle(activity.getString(R.string.unlock_biometric_prompt_subtitle))
                .setNegativeButtonText(activity.getString(R.string.cancel))
                .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                .build()
            prompt.authenticate(info, BiometricPrompt.CryptoObject(cipher))
        }
    }

    val submit: () -> Unit = {
        if (!uiState.isLoading) {
            val typed = password
            password = ""
            viewModel.unlock(typed)
        }
    }

    // Shake and vibrate when an unlock attempt fails.
    val view = LocalView.current
    val shake = remember { Animatable(0f) }
    LaunchedEffect(uiState.errorResId) {
        if (uiState.errorResId != null) {
            view.performHapticFeedback(
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    HapticFeedbackConstants.REJECT
                } else {
                    HapticFeedbackConstants.LONG_PRESS
                },
            )
            shake.animateTo(
                targetValue = 0f,
                animationSpec = keyframes {
                    durationMillis = 360
                    -12f at 60
                    10f at 120
                    -7f at 180
                    4f at 240
                    -2f at 300
                },
            )
        }
    }

    val colors = BkpTheme.colors
    val hasVault = uiState.selectedUri != null
    val errorText = uiState.errorResId?.let { resId ->
        stringResource(resId) + (uiState.errorDetail?.let { " ($it)" } ?: "")
    }
    val openVault = { openVaultLauncher.launch(arrayOf("*/*")) }

    Scaffold { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .imePadding(),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                modifier = Modifier
                    .verticalScroll(rememberScrollState())
                    .widthIn(max = 420.dp)
                    .fillMaxWidth()
                    .padding(horizontal = 32.dp, vertical = 24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                BrandIcon(Modifier.size(72.dp))

                if (hasVault) {
                    // The vault name doubles as the switcher; everything secondary lives in its sheet.
                    TextButton(onClick = { showVaultSheet = true }) {
                        Text(
                            uiState.selectedName ?: "Vault.kdbx",
                            style = MaterialTheme.typography.titleLarge,
                            color = colors.fg,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f, fill = false),
                        )
                        Icon(
                            Icons.Outlined.ExpandMore,
                            contentDescription = stringResource(R.string.unlock_switch_vault),
                            tint = colors.fgSubtle,
                        )
                    }
                    Spacer(Modifier.height(8.dp))

                    PasswordField(
                        value = password,
                        onValueChange = { password = it },
                        label = stringResource(R.string.unlock_master_password),
                        modifier = Modifier
                            .fillMaxWidth()
                            .offset(x = shake.value.dp),
                        isError = errorText != null,
                        supportingText = errorText,
                        onDone = submit,
                    )

                    uiState.keyfileName?.let { name ->
                        InputChip(
                            selected = false,
                            onClick = { viewModel.selectKeyfile(null, null) },
                            label = { Text(name, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                            leadingIcon = {
                                Icon(Icons.Outlined.Key, contentDescription = null, modifier = Modifier.size(18.dp))
                            },
                            trailingIcon = {
                                Icon(
                                    Icons.Outlined.Close,
                                    contentDescription = stringResource(R.string.unlock_keyfile_remove),
                                    modifier = Modifier.size(18.dp),
                                )
                            },
                        )
                    }

                    PrimaryButton(
                        text = stringResource(R.string.unlock_action),
                        enabled = !uiState.isLoading,
                        loading = uiState.isLoading,
                        onClick = submit,
                    )

                    if (canUseBiometric) {
                        FilledTonalIconButton(
                            onClick = promptBiometric,
                            enabled = !uiState.isLoading,
                            modifier = Modifier.padding(top = 8.dp).size(64.dp),
                        ) {
                            Icon(
                                Icons.Outlined.Fingerprint,
                                contentDescription = stringResource(R.string.unlock_biometric),
                                modifier = Modifier.size(32.dp),
                            )
                        }
                    }
                } else {
                    Text(stringResource(R.string.app_name), style = MaterialTheme.typography.headlineSmall)
                    Spacer(Modifier.height(16.dp))
                    errorText?.let {
                        Text(it, color = colors.danger, style = MaterialTheme.typography.bodySmall)
                    }
                    PrimaryButton(
                        text = stringResource(R.string.unlock_open_vault),
                        enabled = !uiState.isLoading,
                        loading = uiState.isLoading,
                        onClick = openVault,
                    )
                    TextButton(onClick = { showCreateSheet = true }) {
                        Text(stringResource(R.string.unlock_create_vault))
                    }
                }
            }
        }
    }

    if (showVaultSheet) {
        ModalBottomSheet(onDismissRequest = { showVaultSheet = false }) {
            // Every action closes the sheet before running.
            fun pick(action: () -> Unit) {
                showVaultSheet = false
                action()
            }
            Column(Modifier.verticalScroll(rememberScrollState()).padding(bottom = 16.dp)) {
                recentVaults.forEach { vault ->
                    SheetRow(
                        icon = Icons.Outlined.Lock,
                        title = vault.displayName,
                        // SAF URIs are opaque, so show when it was last used instead of a path.
                        subtitle = DateUtils.getRelativeTimeSpanString(vault.lastOpenedMs).toString(),
                        selected = vault.uri == uiState.selectedUri?.toString(),
                        onClick = { pick { viewModel.selectVault(Uri.parse(vault.uri), vault.displayName) } },
                    )
                }
                HorizontalDivider(Modifier.padding(vertical = 8.dp))
                SheetRow(
                    icon = Icons.Outlined.FolderOpen,
                    title = stringResource(R.string.unlock_open_vault),
                    onClick = { pick(openVault) },
                )
                SheetRow(
                    icon = Icons.Outlined.Add,
                    title = stringResource(R.string.unlock_create_vault),
                    onClick = { pick { showCreateSheet = true } },
                )
                SheetRow(
                    icon = Icons.Outlined.Key,
                    title = stringResource(R.string.unlock_keyfile_optional),
                    onClick = { pick { openKeyfileLauncher.launch(arrayOf("*/*")) } },
                )
            }
        }
    }

    if (showCreateSheet) {
        CreateVaultSheet(
            onDismiss = { showCreateSheet = false },
            onConfirm = { name, pw ->
                pendingCreateName = name
                pendingCreatePassword = pw
                showCreateSheet = false
                createVaultLauncher.launch("${name.ifBlank { "vault" }}.kdbx")
            },
        )
    }
}

@Composable
private fun PrimaryButton(
    text: String,
    enabled: Boolean,
    onClick: () -> Unit,
    loading: Boolean = false,
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        shape = MaterialTheme.shapes.medium,
        modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
    ) {
        if (loading) {
            CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
        } else {
            Text(text)
        }
    }
}

@Composable
private fun SheetRow(
    icon: ImageVector,
    title: String,
    onClick: () -> Unit,
    subtitle: String? = null,
    selected: Boolean = false,
) {
    val colors = BkpTheme.colors
    ListItem(
        headlineContent = { Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        supportingContent = subtitle?.let { { Text(it) } },
        leadingContent = { Icon(icon, contentDescription = null, tint = colors.accent) },
        trailingContent = if (selected) {
            { Icon(Icons.Outlined.Check, contentDescription = null, tint = colors.accent) }
        } else {
            null
        },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.selectable(selected = selected, onClick = onClick),
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CreateVaultSheet(
    onDismiss: () -> Unit,
    onConfirm: (name: String, password: String) -> Unit,
) {
    var name by remember { mutableStateOf("BetterKeePass") }
    var password by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    val mismatch = confirm.isNotEmpty() && password != confirm
    val valid = password.isNotEmpty() && password == confirm

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(start = 24.dp, end = 24.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(stringResource(R.string.create_vault_title), style = MaterialTheme.typography.titleLarge)
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                label = { Text(stringResource(R.string.create_vault_name)) },
                singleLine = true,
                shape = MaterialTheme.shapes.medium,
                modifier = Modifier.fillMaxWidth(),
            )
            PasswordField(
                value = password,
                onValueChange = { password = it },
                label = stringResource(R.string.unlock_master_password),
                imeAction = ImeAction.Next,
                modifier = Modifier.fillMaxWidth(),
            )
            StrengthMeter(password, Modifier.fillMaxWidth())
            PasswordField(
                value = confirm,
                onValueChange = { confirm = it },
                label = stringResource(R.string.create_vault_confirm_password),
                isError = mismatch,
                supportingText = if (mismatch) {
                    stringResource(R.string.create_vault_password_mismatch)
                } else {
                    null
                },
                onDone = { if (valid) onConfirm(name, password) },
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(4.dp))
            PrimaryButton(
                text = stringResource(R.string.create_vault_save),
                enabled = valid,
                onClick = { onConfirm(name, password) },
            )
        }
    }
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
