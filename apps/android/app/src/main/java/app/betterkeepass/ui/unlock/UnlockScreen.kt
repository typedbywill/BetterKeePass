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
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.MutableTransitionState
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.Fingerprint
import androidx.compose.material.icons.outlined.FolderOpen
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.LockOpen
import androidx.compose.material.icons.outlined.VerifiedUser
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.betterkeepass.R
import app.betterkeepass.data.RecentVault
import app.betterkeepass.ui.components.BrandIcon
import app.betterkeepass.ui.components.EmptyState
import app.betterkeepass.ui.components.PasswordField
import app.betterkeepass.ui.components.StrengthMeter
import app.betterkeepass.ui.theme.BkpTheme
import kotlinx.coroutines.launch

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

    val entrance = remember { MutableTransitionState(false).apply { targetState = true } }
    val colors = BkpTheme.colors

    Scaffold { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .imePadding()
                .verticalScroll(rememberScrollState()),
            contentAlignment = Alignment.TopCenter,
        ) {
            AnimatedVisibility(
                visibleState = entrance,
                enter = fadeIn(tween(250)) + slideInVertically(tween(250)) { it / 24 },
            ) {
                Column(
                    modifier = Modifier
                        .widthIn(max = 520.dp)
                        .fillMaxWidth()
                        .padding(horizontal = 24.dp, vertical = 20.dp),
                    verticalArrangement = Arrangement.spacedBy(20.dp),
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        BrandIcon(Modifier.size(36.dp))
                        Text(stringResource(R.string.app_name), style = MaterialTheme.typography.titleMedium)
                    }

                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(
                            stringResource(R.string.unlock_overline),
                            style = MaterialTheme.typography.labelSmall,
                            color = colors.accent,
                        )
                        Text(
                            stringResource(R.string.unlock_welcome_title),
                            style = MaterialTheme.typography.headlineMedium,
                        )
                        if (uiState.selectedUri == null) {
                            Text(
                                stringResource(R.string.unlock_welcome_desc),
                                style = MaterialTheme.typography.bodyMedium,
                                color = colors.fgMuted,
                            )
                        }
                    }

                    if (uiState.selectedUri != null) {
                        UnlockCard(
                            modifier = Modifier.offset(x = shake.value.dp),
                            vaultName = uiState.selectedName ?: "Vault.kdbx",
                        ) {
                            if (canUseBiometric) {
                                PrimaryButton(
                                    text = stringResource(R.string.unlock_biometric),
                                    icon = { Icon(Icons.Outlined.Fingerprint, contentDescription = null) },
                                    enabled = !uiState.isLoading,
                                    onClick = promptBiometric,
                                )
                                OrDivider(stringResource(R.string.unlock_or_password))
                            }

                            PasswordField(
                                value = password,
                                onValueChange = { password = it },
                                label = stringResource(R.string.unlock_master_password),
                                modifier = Modifier.fillMaxWidth(),
                                isError = uiState.errorResId != null,
                                onDone = submit,
                            )

                            KeyfileRow(
                                name = uiState.keyfileName,
                                onPick = { openKeyfileLauncher.launch(arrayOf("*/*")) },
                                onClear = { viewModel.selectKeyfile(null, null) },
                            )

                            uiState.errorResId?.let { resId ->
                                ErrorBanner(
                                    stringResource(resId) + (uiState.errorDetail?.let { " ($it)" } ?: ""),
                                )
                            }

                            if (canUseBiometric) {
                                OutlinedButton(
                                    onClick = submit,
                                    enabled = !uiState.isLoading,
                                    shape = MaterialTheme.shapes.medium,
                                    modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
                                ) {
                                    ButtonContent(uiState.isLoading, stringResource(R.string.unlock_action)) {
                                        Icon(Icons.Outlined.LockOpen, contentDescription = null)
                                    }
                                }
                            } else {
                                PrimaryButton(
                                    text = stringResource(R.string.unlock_action),
                                    icon = { Icon(Icons.Outlined.LockOpen, contentDescription = null) },
                                    enabled = !uiState.isLoading,
                                    loading = uiState.isLoading,
                                    onClick = submit,
                                )
                            }
                        }
                    }

                    // With no vault selected the error has no card to live in.
                    if (uiState.selectedUri == null) {
                        uiState.errorResId?.let { ErrorBanner(stringResource(it)) }
                    }

                    VaultList(
                        vaults = recentVaults,
                        selectedUri = uiState.selectedUri?.toString(),
                        onSelect = { viewModel.selectVault(Uri.parse(it.uri), it.displayName) },
                        onBrowse = { openVaultLauncher.launch(arrayOf("*/*")) },
                        onCreate = { showCreateSheet = true },
                    )

                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Icon(
                            Icons.Outlined.VerifiedUser,
                            contentDescription = null,
                            tint = colors.accent,
                            modifier = Modifier.size(18.dp),
                        )
                        Text(
                            stringResource(R.string.unlock_tip),
                            style = MaterialTheme.typography.bodySmall,
                            color = colors.fgSubtle,
                        )
                    }
                }
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
private fun UnlockCard(
    vaultName: String,
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    val colors = BkpTheme.colors
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.large,
        color = colors.surface,
        border = BorderStroke(1.dp, colors.border),
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                IconTile { Icon(Icons.Outlined.Lock, contentDescription = null, tint = colors.accent) }
                Column {
                    Text(
                        vaultName,
                        style = MaterialTheme.typography.titleMedium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        stringResource(R.string.unlock_selected_vault),
                        style = MaterialTheme.typography.bodySmall,
                        color = colors.fgSubtle,
                    )
                }
            }
            content()
        }
    }
}

@Composable
private fun IconTile(content: @Composable () -> Unit) {
    Box(
        modifier = Modifier
            .size(44.dp)
            .background(BkpTheme.colors.accentSubtle, MaterialTheme.shapes.small),
        contentAlignment = Alignment.Center,
    ) { content() }
}

@Composable
private fun PrimaryButton(
    text: String,
    icon: @Composable () -> Unit,
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
        ButtonContent(loading, text, icon)
    }
}

@Composable
private fun ButtonContent(loading: Boolean, text: String, icon: @Composable () -> Unit) {
    if (loading) {
        CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
    } else {
        icon()
        Spacer(Modifier.width(8.dp))
        Text(text)
    }
}

@Composable
private fun OrDivider(text: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        HorizontalDivider(Modifier.weight(1f))
        Text(text, style = MaterialTheme.typography.bodySmall, color = BkpTheme.colors.fgSubtle)
        HorizontalDivider(Modifier.weight(1f))
    }
}

@Composable
private fun KeyfileRow(name: String?, onPick: () -> Unit, onClear: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        TextButton(onClick = onPick, modifier = Modifier.weight(1f, fill = false)) {
            Icon(Icons.Outlined.Key, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            Text(
                name?.let { stringResource(R.string.unlock_keyfile_selected, it) }
                    ?: stringResource(R.string.unlock_keyfile_optional),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (name != null) {
            IconButton(onClick = onClear) {
                Icon(Icons.Outlined.Close, contentDescription = stringResource(R.string.unlock_keyfile_remove))
            }
        }
    }
}

@Composable
private fun ErrorBanner(message: String) {
    val colors = BkpTheme.colors
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(colors.dangerSubtle, MaterialTheme.shapes.small)
            .padding(12.dp)
            .semantics { liveRegion = LiveRegionMode.Polite },
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            Icons.Outlined.ErrorOutline,
            contentDescription = null,
            tint = colors.danger,
            modifier = Modifier.size(18.dp),
        )
        Text(message, color = colors.danger, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun VaultList(
    vaults: List<RecentVault>,
    selectedUri: String?,
    onSelect: (RecentVault) -> Unit,
    onBrowse: () -> Unit,
    onCreate: () -> Unit,
) {
    val colors = BkpTheme.colors
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            stringResource(R.string.unlock_your_vaults),
            style = MaterialTheme.typography.labelSmall,
            color = colors.fgSubtle,
        )
        HorizontalDivider()

        if (vaults.isEmpty() && selectedUri == null) {
            EmptyState(
                icon = Icons.Outlined.Lock,
                title = stringResource(R.string.unlock_no_recent_title),
                description = stringResource(R.string.unlock_no_recent_desc),
            )
        }

        vaults.forEach { vault ->
            val selected = vault.uri == selectedUri
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(MaterialTheme.shapes.medium)
                    .background(if (selected) colors.accentSubtle else colors.bg)
                    .clickable { onSelect(vault) }
                    .padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                IconTile { Icon(Icons.Outlined.Lock, contentDescription = null, tint = colors.accent) }
                Column(Modifier.weight(1f)) {
                    Text(
                        vault.displayName,
                        style = MaterialTheme.typography.titleSmall,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    // SAF URIs are opaque, so show when it was last used instead of a path.
                    Text(
                        DateUtils.getRelativeTimeSpanString(vault.lastOpenedMs).toString(),
                        style = MaterialTheme.typography.bodySmall,
                        color = colors.fgSubtle,
                    )
                }
                if (selected) {
                    Icon(Icons.Outlined.CheckCircle, contentDescription = null, tint = colors.accent)
                }
            }
        }

        OutlinedButton(
            onClick = onBrowse,
            shape = MaterialTheme.shapes.medium,
            modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
        ) {
            Icon(Icons.Outlined.FolderOpen, contentDescription = null)
            Spacer(Modifier.width(8.dp))
            Text(stringResource(R.string.unlock_select_vault))
        }
        TextButton(onClick = onCreate, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Outlined.Add, contentDescription = null)
            Spacer(Modifier.width(8.dp))
            Text(stringResource(R.string.unlock_create_vault))
        }
    }
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
                icon = { Icon(Icons.Outlined.Add, contentDescription = null) },
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
