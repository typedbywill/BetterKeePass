package app.betterkeepass.ui.vault

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.betterkeepass.data.VaultRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uniffi.bkp_ffi.EntrySummaryDto
import uniffi.bkp_ffi.GroupNodeDto
import javax.inject.Inject

data class VaultListUiState(
    val query: String = "",
    val selectedGroupPath: String? = null,
    val entries: List<EntrySummaryDto> = emptyList(),
    val groups: List<String> = emptyList(),
    val isLoading: Boolean = false,
)

@HiltViewModel
class VaultListViewModel @Inject constructor(
    private val repository: VaultRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(VaultListUiState())
    val uiState: StateFlow<VaultListUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            runCatching {
                val tree = repository.groupTree()
                val groups = flattenGroupPaths(tree)
                val entries = fetchEntries(_uiState.value.query, _uiState.value.selectedGroupPath)
                _uiState.update {
                    it.copy(groups = groups, entries = entries, isLoading = false)
                }
            }.onFailure {
                _uiState.update { it.copy(isLoading = false) }
            }
        }
    }

    fun onQueryChange(query: String) {
        _uiState.update { it.copy(query = query) }
        viewModelScope.launch {
            runCatching {
                val entries = fetchEntries(query, _uiState.value.selectedGroupPath)
                _uiState.update { it.copy(entries = entries) }
            }
        }
    }

    fun onGroupSelected(groupPath: String?) {
        _uiState.update { it.copy(selectedGroupPath = groupPath) }
        viewModelScope.launch {
            runCatching {
                val entries = fetchEntries(_uiState.value.query, groupPath)
                _uiState.update { it.copy(entries = entries) }
            }
        }
    }

    fun lockVault() {
        repository.lock()
    }

    private suspend fun fetchEntries(query: String, groupPath: String?): List<EntrySummaryDto> {
        val trimmed = query.trim()
        val effectiveQuery = when {
            groupPath.isNullOrBlank() -> trimmed
            trimmed.isEmpty() -> "group:\"$groupPath\""
            else -> "group:\"$groupPath\" $trimmed"
        }
        return repository.search(effectiveQuery)
    }

    private fun flattenGroupPaths(root: GroupNodeDto): List<String> {
        val out = mutableListOf<String>()
        fun visit(node: GroupNodeDto) {
            if (node.path.isNotEmpty() && !node.isRecycleBin) {
                out.add(node.path)
            }
            node.children.forEach(::visit)
        }
        visit(root)
        return out
    }
}
