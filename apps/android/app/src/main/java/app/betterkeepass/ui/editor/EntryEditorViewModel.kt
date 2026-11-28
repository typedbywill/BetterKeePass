package app.betterkeepass.ui.editor

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.betterkeepass.data.SaveResult
import app.betterkeepass.data.VaultRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uniffi.bkp_ffi.CustomFieldInputDto
import uniffi.bkp_ffi.EntryPatchDto
import uniffi.bkp_ffi.NewEntryDto
import uniffi.bkp_ffi.PasswordOptionsDto
import uniffi.bkp_ffi.generatePassphrase
import uniffi.bkp_ffi.generatePassword
import javax.inject.Inject

data class EditableCustomField(
    val name: String,
    val value: String,
    val protected: Boolean,
)

data class EntryEditorUiState(
    val isEditing: Boolean = false,
    val title: String = "",
    val groupPath: String = "",
    val username: String = "",
    val password: String = "",
    val url: String = "",
    val notes: String = "",
    val customFields: List<EditableCustomField> = emptyList(),
    val isSaving: Boolean = false,
    val savedDone: Boolean = false,
    val showConflictDialog: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class EntryEditorViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: VaultRepository,
) : ViewModel() {

    private val entryUuid: String? = savedStateHandle["uuid"]

    private val _uiState = MutableStateFlow(EntryEditorUiState(isEditing = entryUuid != null))
    val uiState: StateFlow<EntryEditorUiState> = _uiState.asStateFlow()

    init {
        if (entryUuid != null) {
            loadExisting(entryUuid)
        }
    }

    private fun loadExisting(uuid: String) {
        viewModelScope.launch {
            runCatching {
                val details = repository.entryDetails(uuid)
                val pw = if (details.summary.hasPassword) {
                    runCatching { repository.revealPassword(uuid) }.getOrDefault("")
                } else {
                    ""
                }
                val fields = details.customFields.map { cf ->
                    val valStr = if (cf.protected) {
                        runCatching { repository.revealField(uuid, cf.name) }.getOrNull().orEmpty()
                    } else {
                        cf.value.orEmpty()
                    }
                    EditableCustomField(cf.name, valStr, cf.protected)
                }
                _uiState.update {
                    it.copy(
                        title = details.summary.title,
                        groupPath = details.summary.groupPath,
                        username = details.summary.username,
                        password = pw,
                        url = details.summary.url,
                        notes = details.notes,
                        customFields = fields,
                    )
                }
            }
        }
    }

    fun updateTitle(v: String) = _uiState.update { it.copy(title = v) }
    fun updateGroupPath(v: String) = _uiState.update { it.copy(groupPath = v) }
    fun updateUsername(v: String) = _uiState.update { it.copy(username = v) }
    fun updatePassword(v: String) = _uiState.update { it.copy(password = v) }
    fun updateUrl(v: String) = _uiState.update { it.copy(url = v) }
    fun updateNotes(v: String) = _uiState.update { it.copy(notes = v) }

    fun generateRandomPassword() {
        runCatching {
            generatePassword(
                PasswordOptionsDto(
                    length = 20u,
                    lowercase = true,
                    uppercase = true,
                    digits = true,
                    symbols = true,
                    excludeAmbiguous = true,
                )
            )
        }.onSuccess { pw ->
            _uiState.update { it.copy(password = pw) }
        }
    }

    fun generateRandomPassphrase() {
        runCatching { generatePassphrase(4u, "-") }
            .onSuccess { phrase -> _uiState.update { it.copy(password = phrase) } }
    }

    fun addCustomField() {
        _uiState.update {
            it.copy(customFields = it.customFields + EditableCustomField("", "", false))
        }
    }

    fun updateCustomField(index: Int, field: EditableCustomField) {
        _uiState.update { state ->
            val list = state.customFields.toMutableList()
            if (index in list.indices) list[index] = field
            state.copy(customFields = list)
        }
    }

    fun removeCustomField(index: Int) {
        _uiState.update { state ->
            val list = state.customFields.toMutableList()
            if (index in list.indices) list.removeAt(index)
            state.copy(customFields = list)
        }
    }

    fun save() {
        val state = _uiState.value
        if (state.title.isBlank()) return

        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true, error = null) }
            runCatching {
                val customInputs = state.customFields
                    .filter { it.name.isNotBlank() }
                    .map { CustomFieldInputDto(it.name.trim(), it.value, it.protected) }

                if (entryUuid == null) {
                    repository.addEntry(
                        NewEntryDto(
                            groupPath = state.groupPath.ifBlank { null },
                            title = state.title.trim(),
                            username = state.username.ifBlank { null },
                            password = state.password.ifEmpty { null },
                            url = state.url.ifBlank { null },
                            notes = state.notes.ifBlank { null },
                            tags = emptyList(),
                            customFields = customInputs,
                        )
                    )
                } else {
                    repository.updateEntry(
                        entryUuid,
                        EntryPatchDto(
                            title = state.title.trim(),
                            username = state.username,
                            password = state.password,
                            url = state.url,
                            notes = state.notes,
                            tags = null,
                            customFields = customInputs,
                            removeCustomFields = emptyList(),
                        )
                    )
                }

                when (repository.saveVault()) {
                    SaveResult.Saved -> _uiState.update { it.copy(savedDone = true, isSaving = false) }
                    SaveResult.Conflict -> _uiState.update {
                        it.copy(showConflictDialog = true, isSaving = false)
                    }
                }
            }.onFailure { e ->
                _uiState.update { it.copy(error = e.localizedMessage, isSaving = false) }
            }
        }
    }

    fun resolveConflictMerge() {
        viewModelScope.launch {
            runCatching {
                repository.mergeAndSave()
                _uiState.update { it.copy(showConflictDialog = false, savedDone = true) }
            }
        }
    }

    fun resolveConflictOverwrite() {
        viewModelScope.launch {
            runCatching {
                repository.saveVault(forceOverwrite = true)
                _uiState.update { it.copy(showConflictDialog = false, savedDone = true) }
            }
        }
    }

    fun dismissConflict() {
        _uiState.update { it.copy(showConflictDialog = false) }
    }
}
