package app.betterkeepass.data

import android.content.Context
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import uniffi.bkp_ffi.BkpException
import uniffi.bkp_ffi.EntryDetailsDto
import uniffi.bkp_ffi.EntryPatchDto
import uniffi.bkp_ffi.EntrySummaryDto
import uniffi.bkp_ffi.GroupNodeDto
import uniffi.bkp_ffi.HistoryEntrySummaryDto
import uniffi.bkp_ffi.MergeReportDto
import uniffi.bkp_ffi.NewEntryDto
import uniffi.bkp_ffi.OtpCodeDto
import uniffi.bkp_ffi.PasskeyAssertionResultDto
import uniffi.bkp_ffi.PasskeyCreateRequestDto
import uniffi.bkp_ffi.PasskeyCreateResultDto
import uniffi.bkp_ffi.PasskeyInfoDto
import uniffi.bkp_ffi.VaultHandle
import javax.inject.Inject
import javax.inject.Singleton

data class FileSnapshotMeta(
    val lastModifiedMs: Long?,
    val sizeBytes: Long?,
)

sealed interface VaultSessionState {
    data object Locked : VaultSessionState
    data class Unlocked(
        val uri: Uri,
        val displayName: String,
        val handle: VaultHandle,
        val snapshot: FileSnapshotMeta,
    ) : VaultSessionState
}

sealed interface SaveResult {
    data object Saved : SaveResult
    data object Conflict : SaveResult
}

@Singleton
class VaultRepository @Inject constructor(
    @ApplicationContext private val context: Context,
    private val settings: SettingsDataStore,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val _session = MutableStateFlow<VaultSessionState>(VaultSessionState.Locked)
    val session: StateFlow<VaultSessionState> = _session.asStateFlow()

    @Volatile
    private var lastBackgroundMs: Long = 0L

    @Volatile
    private var cachedPasswordForMerge: String? = null

    @Volatile
    private var cachedKeyfileForMerge: ByteArray? = null

    suspend fun openVault(
        uri: Uri,
        password: String?,
        keyfileBytes: ByteArray?,
    ): VaultSessionState.Unlocked {
        val bytes = withContext(Dispatchers.IO) { readUriBytes(uri) }
        val meta = withContext(Dispatchers.IO) { readFileMeta(uri) }
        val displayName = withContext(Dispatchers.IO) { readDisplayName(uri) }

        val handle = withContext(Dispatchers.Default) {
            VaultHandle.open(bytes, password, keyfileBytes)
        }

        cachedPasswordForMerge = password
        cachedKeyfileForMerge = keyfileBytes?.copyOf()

        val unlocked = VaultSessionState.Unlocked(
            uri = uri,
            displayName = displayName,
            handle = handle,
            snapshot = meta,
        )
        _session.value = unlocked
        settings.addRecentVault(uri.toString(), displayName)
        return unlocked
    }

    suspend fun createVault(
        uri: Uri,
        vaultName: String?,
        password: String,
        keyfileBytes: ByteArray?,
    ): VaultSessionState.Unlocked {
        val handle = withContext(Dispatchers.Default) {
            VaultHandle.create(vaultName, password, keyfileBytes)
        }
        val bytes = withContext(Dispatchers.Default) { handle.save() }
        withContext(Dispatchers.IO) { writeUriBytes(uri, bytes) }
        val meta = withContext(Dispatchers.IO) { readFileMeta(uri) }
        val displayName = withContext(Dispatchers.IO) { readDisplayName(uri) }

        cachedPasswordForMerge = password
        cachedKeyfileForMerge = keyfileBytes?.copyOf()

        val unlocked = VaultSessionState.Unlocked(
            uri = uri,
            displayName = displayName,
            handle = handle,
            snapshot = meta,
        )
        _session.value = unlocked
        settings.addRecentVault(uri.toString(), displayName)
        return unlocked
    }

    suspend fun saveVault(forceOverwrite: Boolean = false): SaveResult {
        val current = _session.value as? VaultSessionState.Unlocked
            ?: throw BkpException.Locked()

        if (!forceOverwrite) {
            val remoteMeta = withContext(Dispatchers.IO) { readFileMeta(current.uri) }
            if (hasConflict(current.snapshot, remoteMeta)) {
                return SaveResult.Conflict
            }
        }

        val bytes = withContext(Dispatchers.Default) { current.handle.save() }
        withContext(Dispatchers.IO) { writeUriBytes(current.uri, bytes) }
        val updatedMeta = withContext(Dispatchers.IO) { readFileMeta(current.uri) }
        _session.value = current.copy(snapshot = updatedMeta)
        return SaveResult.Saved
    }

    suspend fun mergeAndSave(): MergeReportDto {
        val current = _session.value as? VaultSessionState.Unlocked
            ?: throw BkpException.Locked()

        val remoteBytes = withContext(Dispatchers.IO) { readUriBytes(current.uri) }
        val report = withContext(Dispatchers.Default) {
            current.handle.mergeFromBytes(
                remoteBytes,
                cachedPasswordForMerge,
                cachedKeyfileForMerge,
            )
        }
        val mergedBytes = withContext(Dispatchers.Default) { current.handle.save() }
        withContext(Dispatchers.IO) { writeUriBytes(current.uri, mergedBytes) }
        val updatedMeta = withContext(Dispatchers.IO) { readFileMeta(current.uri) }
        _session.value = current.copy(snapshot = updatedMeta)
        return report
    }

    fun lock() {
        val current = _session.value
        if (current is VaultSessionState.Unlocked) {
            current.handle.lock()
        }
        cachedPasswordForMerge = null
        cachedKeyfileForMerge?.fill(0)
        cachedKeyfileForMerge = null
        _session.value = VaultSessionState.Locked
    }

    fun onAppBackgrounded() {
        lastBackgroundMs = System.currentTimeMillis()
        scope.launch {
            val timeoutMinutes = settings.lockTimeoutMinutes.first()
            if (timeoutMinutes == 0) {
                lock()
            }
        }
    }

    fun onAppForegrounded() {
        if (lastBackgroundMs == 0L) return
        val elapsedMs = System.currentTimeMillis() - lastBackgroundMs
        scope.launch {
            val timeoutMinutes = settings.lockTimeoutMinutes.first()
            if (timeoutMinutes >= 0 && elapsedMs >= timeoutMinutes * 60_000L) {
                lock()
            }
        }
    }

    suspend fun readBytesFromUri(uri: Uri): ByteArray = withContext(Dispatchers.IO) {
        readUriBytes(uri)
    }

    suspend fun search(query: String): List<EntrySummaryDto> = withHandle { it.search(query) }

    suspend fun groupTree(): GroupNodeDto = withHandle { it.groupTree() }

    suspend fun entryDetails(uuid: String): EntryDetailsDto = withHandle { it.entryDetails(uuid) }

    suspend fun revealPassword(uuid: String): String = withHandle { it.revealPassword(uuid) }

    suspend fun revealField(uuid: String, name: String): String? =
        withHandle { it.revealField(uuid, name) }

    suspend fun totp(uuid: String): OtpCodeDto = withHandle { it.totp(uuid) }

    suspend fun history(uuid: String): List<HistoryEntrySummaryDto> =
        withHandle { it.history(uuid) }

    suspend fun restoreHistory(uuid: String, index: UInt) =
        withHandle { it.restoreHistory(uuid, index) }

    suspend fun addEntry(input: NewEntryDto): String = withHandle { it.addEntry(input) }

    suspend fun updateEntry(uuid: String, patch: EntryPatchDto) =
        withHandle { it.updateEntry(uuid, patch) }

    suspend fun deleteEntry(uuid: String, permanent: Boolean) =
        withHandle { it.deleteEntry(uuid, permanent) }

    suspend fun findByUrlOrPackage(domain: String?, packageName: String?): List<EntrySummaryDto> =
        withHandle { it.findByUrlOrPackage(domain, packageName) }

    suspend fun passkeyCreate(req: PasskeyCreateRequestDto): PasskeyCreateResultDto =
        withHandle { it.passkeyCreate(req) }

    suspend fun passkeyGetAssertion(
        rpId: String,
        allowIds: List<String>,
        clientDataHashB64: String,
        userVerified: Boolean,
    ): PasskeyAssertionResultDto =
        withHandle { it.passkeyGetAssertion(rpId, allowIds, clientDataHashB64, userVerified) }

    suspend fun passkeyList(rpId: String?): List<PasskeyInfoDto> =
        withHandle { it.passkeyList(rpId) }

    private suspend fun <T> withHandle(block: (VaultHandle) -> T): T {
        val current = _session.value as? VaultSessionState.Unlocked
            ?: throw BkpException.Locked()
        return withContext(Dispatchers.Default) {
            block(current.handle)
        }
    }

    private fun readUriBytes(uri: Uri): ByteArray {
        return context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
            ?: throw IllegalStateException("Não foi possível abrir o arquivo: $uri")
    }

    private fun writeUriBytes(uri: Uri, bytes: ByteArray) {
        context.contentResolver.openOutputStream(uri, "wt")?.use { out ->
            out.write(bytes)
            out.flush()
        } ?: throw IllegalStateException("Não foi possível gravar o arquivo: $uri")
    }

    private fun readDisplayName(uri: Uri): String {
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
            ?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    if (idx >= 0) {
                        return cursor.getString(idx) ?: "Vault.kdbx"
                    }
                }
            }
        return uri.lastPathSegment?.substringAfterLast('/') ?: "Vault.kdbx"
    }

    private fun readFileMeta(uri: Uri): FileSnapshotMeta {
        val cols = arrayOf(
            DocumentsContract.Document.COLUMN_LAST_MODIFIED,
            OpenableColumns.SIZE,
        )
        return runCatching {
            context.contentResolver.query(uri, cols, null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val modIdx = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_LAST_MODIFIED)
                    val sizeIdx = cursor.getColumnIndex(OpenableColumns.SIZE)
                    val modified = if (modIdx >= 0 && !cursor.isNull(modIdx)) cursor.getLong(modIdx) else null
                    val size = if (sizeIdx >= 0 && !cursor.isNull(sizeIdx)) cursor.getLong(sizeIdx) else null
                    FileSnapshotMeta(modified, size)
                } else {
                    FileSnapshotMeta(null, null)
                }
            } ?: FileSnapshotMeta(null, null)
        }.getOrDefault(FileSnapshotMeta(null, null))
    }

    private fun hasConflict(local: FileSnapshotMeta, remote: FileSnapshotMeta): Boolean {
        val mtimeChanged = local.lastModifiedMs != null &&
            remote.lastModifiedMs != null &&
            local.lastModifiedMs != remote.lastModifiedMs
        val sizeChanged = local.sizeBytes != null &&
            remote.sizeBytes != null &&
            local.sizeBytes != remote.sizeBytes
        return mtimeChanged || sizeChanged
    }
}
