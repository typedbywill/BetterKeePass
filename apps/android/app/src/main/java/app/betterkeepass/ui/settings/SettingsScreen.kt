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
import androidx.compose.material3.HorizontalDivider
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

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.settings_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null)
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState()),
        ) {
            AppearanceSection(
                appearance = appearance,
                onModeChange = viewModel::setThemeMode,
                onPresetChange = viewModel::setThemePreset,
                onDynamicColorChange = viewModel::setDynamicColor,
            )
            HorizontalDivider()

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
                HorizontalDivider()
            }

            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("${stringResource(R.string.settings_lock_timeout)}: ${uiState.lockTimeoutMinutes} min")
                Slider(
                    value = uiState.lockTimeoutMinutes.toFloat(),
                    onValueChange = { viewModel.setLockTimeout(it.roundToInt()) },
                    valueRange = 0f..30f,
                )

                Text("${stringResource(R.string.settings_clipboard_timeout)}: ${uiState.clipboardTimeoutSeconds}s")
                Slider(
                    value = uiState.clipboardTimeoutSeconds.toFloat(),
                    onValueChange = { viewModel.setClipboardTimeout(it.roundToInt()) },
                    valueRange = 5f..120f,
                )
            }
            HorizontalDivider()

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
                        )
                    )
                },
                modifier = Modifier.clickable {
                    val intent = Intent(Settings.ACTION_REQUEST_SET_AUTOFILL_SERVICE).apply {
                        data = Uri.parse("package:${context.packageName}")
                    }
                    runCatching { context.startActivity(intent) }
                },
            )
            HorizontalDivider()

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
