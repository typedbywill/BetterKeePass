package app.betterkeepass.passkey

import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.os.CancellationSignal
import android.os.OutcomeReceiver
import androidx.annotation.RequiresApi
import androidx.credentials.PasswordCredential
import androidx.credentials.PublicKeyCredential
import androidx.credentials.exceptions.ClearCredentialException
import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.CreateCredentialUnknownException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.GetCredentialUnknownException
import androidx.credentials.provider.AuthenticationAction
import androidx.credentials.provider.BeginCreateCredentialRequest
import androidx.credentials.provider.BeginCreateCredentialResponse
import androidx.credentials.provider.BeginCreatePasswordCredentialRequest
import androidx.credentials.provider.BeginCreatePublicKeyCredentialRequest
import androidx.credentials.provider.BeginGetCredentialRequest
import androidx.credentials.provider.BeginGetCredentialResponse
import androidx.credentials.provider.BeginGetPasswordOption
import androidx.credentials.provider.BeginGetPublicKeyCredentialOption
import androidx.credentials.provider.CreateEntry
import androidx.credentials.provider.CredentialProviderService
import androidx.credentials.provider.PasswordCredentialEntry
import androidx.credentials.provider.ProviderClearCredentialStateRequest
import androidx.credentials.provider.PublicKeyCredentialEntry
import app.betterkeepass.R
import app.betterkeepass.data.VaultRepository
import app.betterkeepass.data.VaultSessionState
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import javax.inject.Inject

@RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
@AndroidEntryPoint
class BkpCredentialProviderService : CredentialProviderService() {

    @Inject
    lateinit var vaultRepository: VaultRepository

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onBeginCreateCredentialRequest(
        request: BeginCreateCredentialRequest,
        cancellationSignal: CancellationSignal,
        callback: OutcomeReceiver<BeginCreateCredentialResponse, CreateCredentialException>,
    ) {
        val intent = Intent(this, PasskeyActivity::class.java).apply {
            action = PasskeyActivity.ACTION_CREATE
        }
        val pi = PendingIntent.getActivity(
            this,
            2001,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
        )

        val response = when (request) {
            is BeginCreatePublicKeyCredentialRequest,
            is BeginCreatePasswordCredentialRequest -> {
                BeginCreateCredentialResponse.Builder()
                    .setCreateEntries(
                        listOf(
                            CreateEntry.Builder(
                                accountName = getString(R.string.app_name),
                                pendingIntent = pi,
                            )
                                .setDescription(getString(R.string.passkey_create_title))
                                .build()
                        )
                    )
                    .build()
            }
            else -> {
                callback.onError(CreateCredentialUnknownException("Tipo de credencial não suportado"))
                return
            }
        }
        callback.onResult(response)
    }

    override fun onBeginGetCredentialRequest(
        request: BeginGetCredentialRequest,
        cancellationSignal: CancellationSignal,
        callback: OutcomeReceiver<BeginGetCredentialResponse, GetCredentialException>,
    ) {
        val job = scope.launch {
            val builder = BeginGetCredentialResponse.Builder()
            val session = vaultRepository.session.value

            if (session !is VaultSessionState.Unlocked) {
                val unlockIntent = Intent(this@BkpCredentialProviderService, PasskeyActivity::class.java).apply {
                    action = PasskeyActivity.ACTION_UNLOCK
                }
                val pi = PendingIntent.getActivity(
                    this@BkpCredentialProviderService,
                    2002,
                    unlockIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
                )
                builder.addAuthenticationAction(
                    AuthenticationAction(
                        title = getString(R.string.unlock_title),
                        pendingIntent = pi,
                    )
                )
                callback.onResult(builder.build())
                return@launch
            }

            request.beginGetCredentialOptions.forEachIndexed { idx, option ->
                when (option) {
                    is BeginGetPublicKeyCredentialOption -> {
                        val parsed = runCatching {
                            WebAuthnHelper.parseGetRequest(option.requestJson)
                        }.getOrNull() ?: return@forEachIndexed

                        val passkeys = runCatching {
                            vaultRepository.passkeyList(parsed.rpId)
                        }.getOrDefault(emptyList())

                        passkeys.forEachIndexed { pkIdx, pk ->
                            val intent = Intent(this@BkpCredentialProviderService, PasskeyActivity::class.java).apply {
                                action = PasskeyActivity.ACTION_GET_PASSKEY
                                putExtra(PasskeyActivity.EXTRA_ENTRY_UUID, pk.entryUuid)
                                putExtra(PasskeyActivity.EXTRA_CREDENTIAL_ID, pk.credentialIdB64)
                            }
                            val pi = PendingIntent.getActivity(
                                this@BkpCredentialProviderService,
                                3000 + idx * 100 + pkIdx,
                                intent,
                                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
                            )
                            builder.addCredentialEntry(
                                PublicKeyCredentialEntry.Builder(
                                    context = this@BkpCredentialProviderService,
                                    username = pk.username,
                                    pendingIntent = pi,
                                    beginGetPublicKeyCredentialOption = option,
                                )
                                    .setDisplayName(pk.rpId)
                                    .build()
                            )
                        }
                    }

                    is BeginGetPasswordOption -> {
                        val pkg = request.callingAppInfo?.packageName
                        val entries = runCatching {
                            vaultRepository.findByUrlOrPackage(null, pkg)
                        }.getOrDefault(emptyList())

                        entries.forEachIndexed { eIdx, entry ->
                            val intent = Intent(this@BkpCredentialProviderService, PasskeyActivity::class.java).apply {
                                action = PasskeyActivity.ACTION_GET_PASSWORD
                                putExtra(PasskeyActivity.EXTRA_ENTRY_UUID, entry.uuid)
                            }
                            val pi = PendingIntent.getActivity(
                                this@BkpCredentialProviderService,
                                4000 + idx * 100 + eIdx,
                                intent,
                                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
                            )
                            builder.addCredentialEntry(
                                PasswordCredentialEntry.Builder(
                                    context = this@BkpCredentialProviderService,
                                    username = entry.username.ifBlank { entry.title },
                                    pendingIntent = pi,
                                    beginGetPasswordOption = option,
                                )
                                    .setDisplayName(entry.title)
                                    .build()
                            )
                        }
                    }
                }
            }

            callback.onResult(builder.build())
        }

        cancellationSignal.setOnCancelListener { job.cancel() }
    }

    override fun onClearCredentialStateRequest(
        request: ProviderClearCredentialStateRequest,
        cancellationSignal: CancellationSignal,
        callback: OutcomeReceiver<Void?, ClearCredentialException>,
    ) {
        callback.onResult(null)
    }
}
