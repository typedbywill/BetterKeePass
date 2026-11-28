package app.betterkeepass.ui.unlock

import android.net.Uri
import android.security.keystore.KeyPermanentlyInvalidatedException
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.betterkeepass.R
import app.betterkeepass.data.RecentVault
import app.betterkeepass.data.SettingsDataStore
import app.betterkeepass.data.VaultRepository
import app.betterkeepass.security.BiometricCryptoManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uniffi.bkp_ffi.BkpException
import javax.crypto.Cipher
import javax.inject.Inject

data class UnlockUiState(
    val selectedUri: Uri? = null,
    val selectedName: String? = null,
    val keyfileUri: Uri? = null,
    val keyfileName: String? = null,
    val isLoading: Boolean = false,
    val errorResId: Int? = null,
    val errorDetail: String? = null,
    val biometricAvailableForSelected: Boolean = false,
)

@HiltViewModel
class UnlockViewModel @Inject constructor(
    private val repository: VaultRepository,
    private val settings: SettingsDataStore,
    private val biometricCrypto: BiometricCryptoManager,
) : ViewModel() {

    private val _uiState = MutableStateFlow(UnlockUiState())
    val uiState: StateFlow<UnlockUiState> = _uiState.asStateFlow()

    val recentVaults: StateFlow<List<RecentVault>> = settings.recentVaults
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun selectVault(uri: Uri, displayName: String) {
        viewModelScope.launch {
            val hasBiometric = settings.getBiometricSecret(uri.toString()) != null
            _uiState.update {
                it.copy(
                    selectedUri = uri,
                    selectedName = displayName,
                    errorResId = null,
                    errorDetail = null,
                    biometricAvailableForSelected = hasBiometric,
                )
            }
        }
    }

    fun selectKeyfile(uri: Uri?, displayName: String?) {
        _uiState.update {
            it.copy(keyfileUri = uri, keyfileName = displayName, errorResId = null)
        }
    }

    fun unlock(password: String) {
        val uri = _uiState.value.selectedUri ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorResId = null, errorDetail = null) }
            try {
                val keyfileBytes = _uiState.value.keyfileUri?.let { repository.readBytesFromUri(it) }
                repository.openVault(uri, password.ifEmpty { null }, keyfileBytes)
            } catch (_: BkpException.WrongKey) {
                _uiState.update { it.copy(errorResId = R.string.unlock_error_wrong_key) }
            } catch (_: BkpException.Corrupt) {
                _uiState.update { it.copy(errorResId = R.string.unlock_error_corrupt) }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(errorResId = R.string.unlock_error_io, errorDetail = e.localizedMessage)
                }
            } finally {
                _uiState.update { it.copy(isLoading = false) }
            }
        }
    }

    fun createVault(uri: Uri, name: String, password: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorResId = null, errorDetail = null) }
            try {
                val keyfileBytes = _uiState.value.keyfileUri?.let { repository.readBytesFromUri(it) }
                repository.createVault(uri, name.ifBlank { null }, password, keyfileBytes)
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(errorResId = R.string.unlock_error_io, errorDetail = e.localizedMessage)
                }
            } finally {
                _uiState.update { it.copy(isLoading = false) }
            }
        }
    }

    suspend fun prepareBiometricDecryptCipher(): Cipher? {
        val uri = _uiState.value.selectedUri ?: return null
        val secret = settings.getBiometricSecret(uri.toString()) ?: return null
        return try {
            biometricCrypto.createDecryptCipher(secret.ivBase64)
        } catch (_: KeyPermanentlyInvalidatedException) {
            settings.clearBiometricSecret(uri.toString())
            _uiState.update {
                it.copy(
                    biometricAvailableForSelected = false,
                    errorResId = R.string.unlock_biometric_invalidated,
                )
            }
            null
        }
    }

    fun unlockWithBiometricCipher(cipher: Cipher) {
        val uri = _uiState.value.selectedUri ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorResId = null) }
            try {
                val secret = settings.getBiometricSecret(uri.toString()) ?: return@launch
                val password = biometricCrypto.decryptPassword(cipher, secret)
                val keyfileBytes = _uiState.value.keyfileUri?.let { repository.readBytesFromUri(it) }
                repository.openVault(uri, password, keyfileBytes)
            } catch (_: BkpException.WrongKey) {
                settings.clearBiometricSecret(uri.toString())
                _uiState.update {
                    it.copy(
                        biometricAvailableForSelected = false,
                        errorResId = R.string.unlock_error_wrong_key,
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(errorResId = R.string.unlock_error_io, errorDetail = e.localizedMessage)
                }
            } finally {
                _uiState.update { it.copy(isLoading = false) }
            }
        }
    }
}
