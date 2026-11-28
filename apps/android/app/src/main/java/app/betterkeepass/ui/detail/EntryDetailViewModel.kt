package app.betterkeepass.ui.detail

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.betterkeepass.data.SaveResult
import app.betterkeepass.data.SettingsDataStore
import app.betterkeepass.data.VaultRepository
import app.betterkeepass.security.ClipboardHelper
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import uniffi.bkp_ffi.EntryDetailsDto
import uniffi.bkp_ffi.HistoryEntrySummaryDto
import uniffi.bkp_ffi.OtpCodeDto
import javax.inject.Inject

data class EntryDetailUiState(
    val details: EntryDetailsDto? = null,
    val revealedPassword: String? = null,
    val revealedFields: Map<String, String> = emptyMap(),
    val otp: OtpCodeDto? = null,
    val history: List<HistoryEntrySummaryDto> = emptyList(),
    val showConflictDialog: Boolean = false,
    val isDeleted: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class EntryDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: VaultRepository,
    private val settings: SettingsDataStore,
    private val clipboard: ClipboardHelper,
) : ViewModel() {

    private val entryUuid: String = checkNotNull(savedStateHandle["uuid"])

    private val _uiState = MutableStateFlow(EntryDetailUiState())
    val uiState: StateFlow<EntryDetailUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            runCatching {
                val details = repository.entryDetails(entryUuid)
                val history = repository.history(entryUuid)
                _uiState.update {
                    it.copy(details = details, history = history, error = null)
                }
                if (details.hasOtp) {
                    startTotpLoop()
                }
            }.onFailure { e ->
                _uiState.update { it.copy(error = e.localizedMessage) }
            }
        }
    }

    private fun startTotpLoop() {
        viewModelScope.launch {
            while (isActive) {
                runCatching { repository.totp(entryUuid) }
                    .onSuccess { otp -> _uiState.update { it.copy(otp = otp) } }
                delay(1_000L)
            }
        }
    }

    fun toggleRevealPassword() {
        val current = _uiState.value.revealedPassword
        if (current != null) {
            _uiState.update { it.copy(revealedPassword = null) }
            return
        }
        viewModelScope.launch {
            runCatching { repository.revealPassword(entryUuid) }
                .onSuccess { pw -> _uiState.update { it.copy(revealedPassword = pw) } }
        }
    }

    fun toggleRevealField(name: String) {
        val current = _uiState.value.revealedFields
        if (current.containsKey(name)) {
            _uiState.update { it.copy(revealedFields = current - name) }
            return
        }
        viewModelScope.launch {
            runCatching { repository.revealField(entryUuid, name) }
                .onSuccess { value ->
                    if (value != null) {
                        _uiState.update { it.copy(revealedFields = it.revealedFields + (name to value)) }
                    }
                }
        }
    }

    fun copyUsername() {
        val username = _uiState.value.details?.summary?.username ?: return
        viewModelScope.launch {
            val timeout = settings.clipboardTimeoutSeconds.first()
            clipboard.copySensitive("username", username, timeout)
        }
    }

    fun copyPassword() {
        viewModelScope.launch {
            val pw = _uiState.value.revealedPassword
                ?: runCatching { repository.revealPassword(entryUuid) }.getOrNull()
                ?: return@launch
            val timeout = settings.clipboardTimeoutSeconds.first()
            clipboard.copySensitive("password", pw, timeout)
        }
    }

    fun copyCustomField(name: String) {
        viewModelScope.launch {
            val value = _uiState.value.revealedFields[name]
                ?: runCatching { repository.revealField(entryUuid, name) }.getOrNull()
                ?: return@launch
            val timeout = settings.clipboardTimeoutSeconds.first()
            clipboard.copySensitive(name, value, timeout)
        }
    }

    fun restoreHistory(index: UInt) {
        viewModelScope.launch {
            runCatching {
                repository.restoreHistory(entryUuid, index)
                when (repository.saveVault()) {
                    SaveResult.Saved -> load()
                    SaveResult.Conflict -> _uiState.update { it.copy(showConflictDialog = true) }
                }
            }.onFailure { e ->
                _uiState.update { it.copy(error = e.localizedMessage) }
            }
        }
    }

    fun deleteEntry() {
        viewModelScope.launch {
            runCatching {
                repository.deleteEntry(entryUuid, permanent = false)
                when (repository.saveVault()) {
                    SaveResult.Saved -> _uiState.update { it.copy(isDeleted = true) }
                    SaveResult.Conflict -> _uiState.update { it.copy(showConflictDialog = true) }
                }
            }.onFailure { e ->
                _uiState.update { it.copy(error = e.localizedMessage) }
            }
        }
    }

    fun resolveConflictMerge() {
        viewModelScope.launch {
            runCatching {
                repository.mergeAndSave()
                _uiState.update { it.copy(showConflictDialog = false) }
                load()
            }
        }
    }

    fun resolveConflictOverwrite() {
        viewModelScope.launch {
            runCatching {
                repository.saveVault(forceOverwrite = true)
                _uiState.update { it.copy(showConflictDialog = false) }
                load()
            }
        }
    }

    fun dismissConflict() {
        _uiState.update { it.copy(showConflictDialog = false) }
    }
}
