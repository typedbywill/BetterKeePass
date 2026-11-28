package app.betterkeepass.ui.vault

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.betterkeepass.data.VaultRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uniffi.bkp_ffi.EntrySummaryDto
import uniffi.bkp_ffi.GroupNodeDto
import javax.inject.Inject
import kotlin.coroutines.coroutineContext

enum class SearchFilter { All, Totp, Passkey }

data class VaultListUiState(
    val query: String = "",
    val filter: SearchFilter = SearchFilter.All,
    /** Current folder; empty is the root. */
    val path: String = "",
    val folders: List<GroupNodeDto> = emptyList(),
    /** Direct entries of the folder, or the matches while searching. */
    val entries: List<EntrySummaryDto> = emptyList(),
    val isLoading: Boolean = true,
    val inRecycleBin: Boolean = false,
) {
    val isSearching: Boolean get() = query.isNotBlank()
}

@HiltViewModel
class VaultListViewModel @Inject constructor(
    private val repository: VaultRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(VaultListUiState())
    val uiState: StateFlow<VaultListUiState> = _uiState.asStateFlow()

    private var loadJob: Job? = null

    fun refresh() {
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            runCatching {
                val state = _uiState.value
                val tree = repository.groupTree()
                val node = findGroup(tree, state.path)
                val path = node?.path.orEmpty()
                val recycled = findRecycleBin(tree)?.path
                val entries = if (state.isSearching) {
                    repository.search(state.query.trim()).filter { entry ->
                        (recycled.isNullOrEmpty() || !isInside(entry.groupPath, recycled)) &&
                            when (state.filter) {
                                SearchFilter.All -> true
                                SearchFilter.Totp -> entry.hasOtp
                                SearchFilter.Passkey -> entry.hasPasskey
                            }
                    }
                } else {
                    repository.listEntries(path.ifEmpty { null })
                }
                // A newer query or folder may have replaced this load while it ran.
                coroutineContext.ensureActive()
                _uiState.update {
                    it.copy(
                        path = path,
                        folders = (node ?: tree).children.sortedWith(
                            compareBy<GroupNodeDto> { g -> g.isRecycleBin }.thenBy { g -> g.name.lowercase() },
                        ),
                        entries = entries.sortedBy { e -> e.title.lowercase() },
                        isLoading = false,
                        inRecycleBin = !recycled.isNullOrEmpty() && isInside(path, recycled),
                    )
                }
            }.onFailure {
                _uiState.update { it.copy(isLoading = false) }
            }
        }
    }

    fun onQueryChange(query: String) {
        _uiState.update {
            it.copy(query = query, filter = if (query.isBlank()) SearchFilter.All else it.filter)
        }
        refresh()
    }

    fun onFilterSelected(filter: SearchFilter) {
        _uiState.update { it.copy(filter = filter) }
        refresh()
    }

    fun openFolder(path: String) {
        _uiState.update { it.copy(path = path) }
        refresh()
    }

    fun navigateUp() = openFolder(_uiState.value.path.substringBeforeLast('/', ""))

    fun lockVault() {
        repository.lock()
    }

    private fun findGroup(node: GroupNodeDto, path: String): GroupNodeDto? =
        if (node.path == path) node else node.children.firstNotNullOfOrNull { findGroup(it, path) }

    private fun findRecycleBin(node: GroupNodeDto): GroupNodeDto? =
        if (node.isRecycleBin) node else node.children.firstNotNullOfOrNull(::findRecycleBin)

    private fun isInside(path: String, parent: String) = path == parent || path.startsWith("$parent/")
}

/** Entries in the folder and all of its subfolders. */
internal fun GroupNodeDto.totalEntries(): Int = entryCount.toInt() + children.sumOf { it.totalEntries() }
