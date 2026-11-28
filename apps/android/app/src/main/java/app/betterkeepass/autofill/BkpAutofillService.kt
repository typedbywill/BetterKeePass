package app.betterkeepass.autofill

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.os.CancellationSignal
import android.service.autofill.AutofillService
import android.service.autofill.Dataset
import android.service.autofill.FillCallback
import android.service.autofill.FillRequest
import android.service.autofill.FillResponse
import android.service.autofill.InlinePresentation
import android.service.autofill.Presentations
import android.service.autofill.SaveCallback
import android.service.autofill.SaveInfo
import android.service.autofill.SaveRequest
import android.view.autofill.AutofillValue
import android.widget.RemoteViews
import androidx.autofill.inline.v1.InlineSuggestionUi
import app.betterkeepass.R
import app.betterkeepass.data.VaultRepository
import app.betterkeepass.data.VaultSessionState
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import uniffi.bkp_ffi.CustomFieldInputDto
import uniffi.bkp_ffi.NewEntryDto
import javax.inject.Inject

@AndroidEntryPoint
class BkpAutofillService : AutofillService() {

    @Inject
    lateinit var vaultRepository: VaultRepository

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onFillRequest(
        request: FillRequest,
        cancellationSignal: CancellationSignal,
        callback: FillCallback,
    ) {
        val structure = request.fillContexts.lastOrNull()?.structure ?: run {
            callback.onSuccess(null)
            return
        }
        val parsed = AssistStructureParser.parse(structure)
        if (parsed.usernameId == null && parsed.passwordId == null) {
            callback.onSuccess(null)
            return
        }

        val job = serviceScope.launch {
            val responseBuilder = FillResponse.Builder()
            val session = vaultRepository.session.value

            if (session !is VaultSessionState.Unlocked) {
                val unlockIntent = Intent(this@BkpAutofillService, AutofillUnlockActivity::class.java).apply {
                    putExtra(AutofillUnlockActivity.EXTRA_DOMAIN, parsed.webDomain)
                    putExtra(AutofillUnlockActivity.EXTRA_PACKAGE, parsed.packageName)
                    putExtra(AutofillUnlockActivity.EXTRA_USERNAME_ID, parsed.usernameId)
                    putExtra(AutofillUnlockActivity.EXTRA_PASSWORD_ID, parsed.passwordId)
                }
                val pi = PendingIntent.getActivity(
                    this@BkpAutofillService,
                    1001,
                    unlockIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
                )
                val presentation = RemoteViews(packageName, android.R.layout.simple_list_item_1).apply {
                    setTextViewText(android.R.id.text1, getString(R.string.autofill_unlock_title))
                }
                val inlinePres = buildInlinePresentation(
                    request,
                    getString(R.string.autofill_unlock_title),
                    pi,
                    0,
                )
                val datasetBuilder = newDatasetBuilder(presentation, inlinePres)
                    .setAuthentication(pi.intentSender)
                parsed.usernameId?.let { datasetBuilder.setValue(it, null) }
                parsed.passwordId?.let { datasetBuilder.setValue(it, null) }
                responseBuilder.addDataset(datasetBuilder.build())
                callback.onSuccess(responseBuilder.build())
                return@launch
            }

            val matches = runCatching {
                vaultRepository.findByUrlOrPackage(parsed.webDomain, parsed.packageName)
            }.getOrDefault(emptyList())

            matches.forEachIndexed { idx, entry ->
                val pw = if (parsed.passwordId != null && entry.hasPassword) {
                    runCatching { vaultRepository.revealPassword(entry.uuid) }.getOrNull()
                } else {
                    null
                }
                val title = entry.title.ifBlank { entry.username.ifBlank { "BetterKeePass" } }
                val sub = entry.username.takeIf { it.isNotBlank() }
                val presentation = RemoteViews(packageName, android.R.layout.simple_list_item_2).apply {
                    setTextViewText(android.R.id.text1, title)
                    setTextViewText(android.R.id.text2, sub ?: "")
                }
                val datasetBuilder = newDatasetBuilder(presentation, null)
                parsed.usernameId?.let {
                    datasetBuilder.setValue(it, AutofillValue.forText(entry.username))
                }
                parsed.passwordId?.let {
                    if (pw != null) {
                        datasetBuilder.setValue(it, AutofillValue.forText(pw))
                    }
                }
                responseBuilder.addDataset(datasetBuilder.build())
            }

            val saveIds = listOfNotNull(parsed.usernameId, parsed.passwordId).toTypedArray()
            if (saveIds.isNotEmpty()) {
                val saveType = when {
                    parsed.passwordId != null && parsed.usernameId != null ->
                        SaveInfo.SAVE_DATA_TYPE_USERNAME or SaveInfo.SAVE_DATA_TYPE_PASSWORD
                    parsed.passwordId != null -> SaveInfo.SAVE_DATA_TYPE_PASSWORD
                    else -> SaveInfo.SAVE_DATA_TYPE_USERNAME
                }
                responseBuilder.setSaveInfo(SaveInfo.Builder(saveType, saveIds).build())
            }

            callback.onSuccess(responseBuilder.build())
        }

        cancellationSignal.setOnCancelListener { job.cancel() }
    }

    override fun onSaveRequest(request: SaveRequest, callback: SaveCallback) {
        val structure = request.fillContexts.lastOrNull()?.structure ?: run {
            callback.onFailure("Estrutura ausente")
            return
        }
        val parsed = AssistStructureParser.parse(structure)
        val password = parsed.passwordValue
        val username = parsed.usernameValue
        if (password.isNullOrBlank() && username.isNullOrBlank()) {
            callback.onFailure("Nenhuma credencial para salvar")
            return
        }

        serviceScope.launch {
            if (vaultRepository.session.value !is VaultSessionState.Unlocked) {
                callback.onFailure("Cofre bloqueado")
                return@launch
            }
            runCatching {
                val title = parsed.webDomain ?: parsed.packageName ?: "Android Login"
                val customFields = parsed.packageName?.let { pkg ->
                    listOf(CustomFieldInputDto("AndroidApp", pkg, protected = false))
                }.orEmpty()

                vaultRepository.addEntry(
                    NewEntryDto(
                        groupPath = null,
                        title = title,
                        username = username,
                        password = password,
                        url = parsed.webDomain?.let { "https://$it" },
                        notes = null,
                        tags = emptyList(),
                        customFields = customFields,
                    )
                )
                vaultRepository.saveVault(forceOverwrite = false)
            }.onSuccess {
                callback.onSuccess()
            }.onFailure { e ->
                callback.onFailure(e.localizedMessage ?: "Erro ao salvar")
            }
        }
    }

    @SuppressLint("RestrictedApi")
    private fun buildInlinePresentation(
        request: FillRequest,
        inlineTitle: String,
        pendingIntent: PendingIntent?,
        index: Int,
    ): InlinePresentation? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R || pendingIntent == null) return null
        val specs = request.inlineSuggestionsRequest?.inlinePresentationSpecs ?: return null
        if (specs.isEmpty()) return null
        val inlineSpec = specs[index.coerceAtMost(specs.size - 1)]
        val slice = InlineSuggestionUi.newContentBuilder(pendingIntent)
            .setTitle(inlineTitle)
            .build()
            .slice
        return InlinePresentation(slice, inlineSpec, false)
    }

    @Suppress("DEPRECATION")
    private fun newDatasetBuilder(
        menuView: RemoteViews,
        inlinePresentation: InlinePresentation?,
    ): Dataset.Builder {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val presBuilder = Presentations.Builder().setMenuPresentation(menuView)
            inlinePresentation?.let { presBuilder.setInlinePresentation(it) }
            Dataset.Builder(presBuilder.build())
        } else {
            Dataset.Builder(menuView)
        }
    }
}
