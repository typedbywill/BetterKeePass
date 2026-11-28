package app.betterkeepass.ui.settings

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.view.autofill.AutofillManager
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import app.betterkeepass.ui.theme.BkpTheme
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.key
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.activity.compose.BackHandler
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.betterkeepass.R
import kotlin.math.roundToInt

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val context = LocalContext.current
    val appearance by viewModel.appearance.collectAsStateWithLifecycle()
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val autofillManager = remember { context.getSystemService(AutofillManager::class.java) }
    val isAutofillActive = autofillManager?.hasEnabledAutofillServices() == true

    var showEnrollPasswordDialog by remember { mutableStateOf(false) }
    var enrollPassword by remember { mutableStateOf("") }

    // Null shows the category list; back returns to it before leaving settings.
    var page by rememberSaveable { mutableStateOf<SettingsPage?>(null) }
    BackHandler(enabled = page != null) { page = null }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(page?.title ?: R.string.settings_title)) },
                navigationIcon = {
                    IconButton(onClick = { if (page != null) page = null else onBack() }) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.vault_back),
                        )
                    }
                },
            )
        },
    ) { padding ->
        key(page) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .verticalScroll(rememberScrollState()),
            ) {
                when (page) {
                    null -> SettingsPage.entries.forEach { item ->
                        ListItem(
                            headlineContent = { Text(stringResource(item.title)) },
                            supportingContent = { Text(stringResource(item.description)) },
                            leadingContent = {
                                Icon(item.icon, contentDescription = null, tint = BkpTheme.colors.accent)
                            },
                            trailingContent = {
                                Icon(
                                    Icons.AutoMirrored.Filled.KeyboardArrowRight,
                                    contentDescription = null,
                                    tint = BkpTheme.colors.fgSubtle,
                                )
                            },
                            modifier = Modifier.clickable { page = item }.padding(vertical = 4.dp),
                        )
                    }

                    SettingsPage.Appearance -> AppearanceSection(
                        appearance = appearance,
                        onModeChange = viewModel::setThemeMode,
                        onPresetChange = viewModel::setThemePreset,
                        onDynamicColorChange = viewModel::setDynamicColor,
                    )

                    SettingsPage.Security -> {
                        if (uiState.currentVaultUri != null) {
                            ListItem(
                                headlineContent = { Text(stringResource(R.string.settings_biometric)) },
                                supportingContent = { Text(stringResource(R.string.settings_biometric_desc)) },
                                trailingContent = {
                                    Switch(
                                        checked = uiState.biometricEnabled,
                                        onCheckedChange = { enabled ->
                                            if (enabled) {
                                                showEnrollPasswordDialog = true
                                            } else {
                                                viewModel.disableBiometric()
                                            }
                                        },
                                    )
                                },
                            )
                        }
                        SliderSetting(
                            title = stringResource(R.string.settings_lock_timeout),
                            summary = if (uiState.lockTimeoutMinutes == 0) {
                                stringResource(R.string.settings_lock_immediately)
                            } else {
                                stringResource(R.string.settings_lock_after, uiState.lockTimeoutMinutes)
                            },
                            value = uiState.lockTimeoutMinutes,
                            range = 0f..30f,
                            onChange = viewModel::setLockTimeout,
                        )
                        SliderSetting(
                            title = stringResource(R.string.settings_clipboard_timeout),
                            summary = stringResource(
                                R.string.settings_clipboard_after,
                                uiState.clipboardTimeoutSeconds,
                            ),
                            value = uiState.clipboardTimeoutSeconds,
                            range = 5f..120f,
                            onChange = viewModel::setClipboardTimeout,
                        )
                    }

                    SettingsPage.Autofill -> {
                        ListItem(
                            headlineContent = { Text(stringResource(R.string.settings_autofill)) },
                            supportingContent = {
                                Text(
                                    stringResource(
                                        if (isAutofillActive) {
                                            R.string.settings_autofill_active
                                        } else {
                                            R.string.settings_autofill_inactive
                                        },
                                    ),
                                )
                            },
                            modifier = Modifier.clickable {
                                val intent = Intent(Settings.ACTION_REQUEST_SET_AUTOFILL_SERVICE).apply {
                                    data = Uri.parse("package:${context.packageName}")
                                }
                                runCatching { context.startActivity(intent) }
                            },
                        )
                        ListItem(
                            headlineContent = { Text(stringResource(R.string.settings_passkeys)) },
                            supportingContent = { Text(stringResource(R.string.settings_passkeys_desc)) },
                            modifier = Modifier.clickable {
                                val action = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                                    Settings.ACTION_CREDENTIAL_PROVIDER
                                } else {
                                    Settings.ACTION_SYNC_SETTINGS
                                }
                                val intent = Intent(action).apply {
                                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                                        data = Uri.parse("package:${context.packageName}")
                                    }
                                }
                                runCatching { context.startActivity(intent) }
                            },
                        )
                    }
                }
            }
        }
    }

    if (showEnrollPasswordDialog) {
        AlertDialog(
            onDismissRequest = { showEnrollPasswordDialog = false },
            title = { Text(stringResource(R.string.unlock_biometric_enable_title)) },
            text = {
                OutlinedTextField(
                    value = enrollPassword,
                    onValueChange = { enrollPassword = it },
                    label = { Text(stringResource(R.string.unlock_master_password)) },
                    visualTransformation = PasswordVisualTransformation(),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        val pw = enrollPassword
                        enrollPassword = ""
                        showEnrollPasswordDialog = false
                        val activity = context as? FragmentActivity ?: return@Button
                        val cipher = viewModel.prepareBiometricEnrollCipher()
                        val prompt = BiometricPrompt(
                            activity,
                            ContextCompat.getMainExecutor(activity),
                            object : BiometricPrompt.AuthenticationCallback() {
                                override fun onAuthenticationSucceeded(
                                    result: BiometricPrompt.AuthenticationResult,
                                ) {
                                    result.cryptoObject?.cipher?.let {
                                        viewModel.saveBiometricPassword(it, pw)
                                    }
                                }
                            },
                        )
                        val info = BiometricPrompt.PromptInfo.Builder()
                            .setTitle(activity.getString(R.string.unlock_biometric_enable_title))
                            .setSubtitle(activity.getString(R.string.unlock_biometric_enable_subtitle))
                            .setNegativeButtonText(activity.getString(R.string.cancel))
                            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                            .build()
                        prompt.authenticate(info, BiometricPrompt.CryptoObject(cipher))
                    },
                    enabled = enrollPassword.isNotEmpty(),
                ) {
                    Text(stringResource(R.string.editor_save))
                }
            },
            dismissButton = {
                TextButton(onClick = { showEnrollPasswordDialog = false }) {
                    Text(stringResource(R.string.cancel))
                }
            },
        )
    }
}
