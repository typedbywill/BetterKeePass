package app.betterkeepass.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.betterkeepass.data.SettingsDataStore
import app.betterkeepass.data.VaultRepository
import app.betterkeepass.data.VaultSessionState
import app.betterkeepass.security.BiometricCryptoManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.crypto.Cipher
import javax.inject.Inject

data class SettingsUiState(
    val lockTimeoutMinutes: Int = 5,
    val clipboardTimeoutSeconds: Int = 30,
    val biometricEnabled: Boolean = false,
    val currentVaultUri: String? = null,
)

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val settings: SettingsDataStore,
    private val repository: VaultRepository,
    private val biometricCrypto: BiometricCryptoManager,
) : ViewModel() {

    val uiState: StateFlow<SettingsUiState> = combine(
        settings.lockTimeoutMinutes,
        settings.clipboardTimeoutSeconds,
        settings.biometricEnabledUris,
        repository.session,
    ) { lockMin, clipSec, bioUris, session ->
        val uri = (session as? VaultSessionState.Unlocked)?.uri?.toString()
        SettingsUiState(
            lockTimeoutMinutes = lockMin,
            clipboardTimeoutSeconds = clipSec,
            biometricEnabled = uri != null && bioUris.contains(uri),
            currentVaultUri = uri,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), SettingsUiState())

    fun setLockTimeout(minutes: Int) {
        viewModelScope.launch { settings.setLockTimeoutMinutes(minutes) }
    }

    fun setClipboardTimeout(seconds: Int) {
        viewModelScope.launch { settings.setClipboardTimeoutSeconds(seconds) }
    }

    fun prepareBiometricEnrollCipher(): Cipher = biometricCrypto.createEncryptCipher()

    fun saveBiometricPassword(cipher: Cipher, masterPassword: String) {
        val uri = uiState.value.currentVaultUri ?: return
        viewModelScope.launch {
            val secret = biometricCrypto.encryptPassword(cipher, masterPassword)
            settings.saveBiometricSecret(uri, secret)
        }
    }

    fun disableBiometric() {
        val uri = uiState.value.currentVaultUri ?: return
        viewModelScope.launch {
            settings.clearBiometricSecret(uri)
        }
    }
}
