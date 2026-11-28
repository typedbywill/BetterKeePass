package app.betterkeepass.passkey

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.util.Base64
import androidx.activity.compose.setContent
import androidx.annotation.RequiresApi
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.core.content.ContextCompat
import androidx.credentials.CreatePasswordRequest
import androidx.credentials.CreatePasswordResponse
import androidx.credentials.CreatePublicKeyCredentialRequest
import androidx.credentials.CreatePublicKeyCredentialResponse
import androidx.credentials.GetCredentialResponse
import androidx.credentials.GetPasswordOption
import androidx.credentials.GetPublicKeyCredentialOption
import androidx.credentials.PasswordCredential
import androidx.credentials.PublicKeyCredential
import androidx.credentials.exceptions.CreateCredentialCancellationException
import androidx.credentials.exceptions.CreateCredentialUnknownException
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialUnknownException
import androidx.credentials.provider.BeginGetCredentialResponse
import androidx.credentials.provider.PendingIntentHandler
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.betterkeepass.R
import app.betterkeepass.data.VaultRepository
import app.betterkeepass.data.VaultSessionState
import app.betterkeepass.ui.theme.BkpTheme
import app.betterkeepass.ui.unlock.UnlockScreen
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import uniffi.bkp_ffi.CustomFieldInputDto
import uniffi.bkp_ffi.NewEntryDto
import uniffi.bkp_ffi.PasskeyCreateRequestDto
import javax.inject.Inject

@RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
@AndroidEntryPoint
class PasskeyActivity : FragmentActivity() {

    @Inject
    lateinit var vaultRepository: VaultRepository

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContent {
            BkpTheme {
                val session by vaultRepository.session.collectAsStateWithLifecycle()

                LaunchedEffect(session) {
                    if (session is VaultSessionState.Unlocked) {
                        handleUnlockedAction()
                    }
                }

                UnlockScreen()
            }
        }
    }

    private fun handleUnlockedAction() {
        if (intent.action == ACTION_UNLOCK) {
            val result = Intent()
            PendingIntentHandler.setBeginGetCredentialResponse(
                result,
                BeginGetCredentialResponse.Builder().build(),
            )
            setResult(Activity.RESULT_OK, result)
            finish()
            return
        }

        val createReq = PendingIntentHandler.retrieveProviderCreateCredentialRequest(intent)
        if (createReq != null) {
            when (val req = createReq.callingRequest) {
                is CreatePublicKeyCredentialRequest -> {
                    authenticateBiometric {
                        scope.launch {
                            runCatching {
                                val parsed = WebAuthnHelper.parseCreateRequest(req.requestJson)
                                val receivedHash = req.clientDataHash
                                val clientDataBytes: ByteArray?
                                val clientDataHashB64: String

                                if (receivedHash != null) {
                                    clientDataBytes = null
                                    clientDataHashB64 = Base64.encodeToString(
                                        receivedHash,
                                        Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING,
                                    )
                                } else {
                                    val appInfo = createReq.callingAppInfo
                                    val origin = WebAuthnHelper.computeApkOrigin(appInfo.signingInfo)
                                        ?: "https://${parsed.rpId}"
                                    clientDataBytes = WebAuthnHelper.buildNativeClientDataJson(
                                        type = "webauthn.create",
                                        challengeB64 = parsed.challengeB64,
                                        origin = origin,
                                        packageName = appInfo.packageName,
                                    )
                                    clientDataHashB64 = WebAuthnHelper.sha256B64Url(clientDataBytes)
                                }

                                val created = vaultRepository.passkeyCreate(
                                    PasskeyCreateRequestDto(
                                        rpId = parsed.rpId,
                                        rpName = parsed.rpName,
                                        username = parsed.username,
                                        userDisplayName = parsed.displayName,
                                        userHandleB64 = parsed.userHandleB64,
                                        clientDataHashB64 = clientDataHashB64,
                                        algorithm = parsed.algorithm,
                                        userVerified = true,
                                        groupPath = "Passkeys",
                                    )
                                )
                                vaultRepository.saveVault(forceOverwrite = false)
                                val json = WebAuthnHelper.buildCreateResponseJson(created, clientDataBytes)
                                val result = Intent()
                                PendingIntentHandler.setCreateCredentialResponse(
                                    result,
                                    CreatePublicKeyCredentialResponse(json),
                                )
                                setResult(Activity.RESULT_OK, result)
                                finish()
                            }.onFailure { e ->
                                val result = Intent()
                                PendingIntentHandler.setCreateCredentialException(
                                    result,
                                    CreateCredentialUnknownException(e.localizedMessage),
                                )
                                setResult(Activity.RESULT_OK, result)
                                finish()
                            }
                        }
                    }
                }

                is CreatePasswordRequest -> {
                    scope.launch {
                        runCatching {
                            val pkg = createReq.callingAppInfo.packageName
                            vaultRepository.addEntry(
                                NewEntryDto(
                                    groupPath = null,
                                    title = pkg,
                                    username = req.id,
                                    password = req.password,
                                    url = null,
                                    notes = null,
                                    tags = emptyList(),
                                    customFields = listOf(
                                        CustomFieldInputDto("AndroidApp", pkg, protected = false)
                                    ),
                                )
                            )
                            vaultRepository.saveVault(forceOverwrite = false)
                            val result = Intent()
                            PendingIntentHandler.setCreateCredentialResponse(
                                result,
                                CreatePasswordResponse(),
                            )
                            setResult(Activity.RESULT_OK, result)
                            finish()
                        }.onFailure { e ->
                            val result = Intent()
                            PendingIntentHandler.setCreateCredentialException(
                                result,
                                CreateCredentialUnknownException(e.localizedMessage),
                            )
                            setResult(Activity.RESULT_OK, result)
                            finish()
                        }
                    }
                }

                else -> finish()
            }
            return
        }

        val getReq = PendingIntentHandler.retrieveProviderGetCredentialRequest(intent)
        if (getReq != null) {
            val option = getReq.credentialOptions.firstOrNull()
            when (option) {
                is GetPublicKeyCredentialOption -> {
                    authenticateBiometric {
                        scope.launch {
                            runCatching {
                                val parsed = WebAuthnHelper.parseGetRequest(option.requestJson)
                                val credId = intent.getStringExtra(EXTRA_CREDENTIAL_ID)
                                val allowIds = credId?.let { listOf(it) } ?: parsed.allowCredentialIds

                                val receivedHash = option.clientDataHash
                                val clientDataBytes: ByteArray?
                                val clientDataHashB64: String
                                if (receivedHash != null) {
                                    clientDataBytes = null
                                    clientDataHashB64 = Base64.encodeToString(
                                        receivedHash,
                                        Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING,
                                    )
                                } else {
                                    val appInfo = getReq.callingAppInfo
                                    val origin = WebAuthnHelper.computeApkOrigin(appInfo.signingInfo)
                                        ?: "https://${parsed.rpId}"
                                    clientDataBytes = WebAuthnHelper.buildNativeClientDataJson(
                                        type = "webauthn.get",
                                        challengeB64 = parsed.challengeB64,
                                        origin = origin,
                                        packageName = appInfo.packageName,
                                    )
                                    clientDataHashB64 = WebAuthnHelper.sha256B64Url(clientDataBytes)
                                }

                                val assertion = vaultRepository.passkeyGetAssertion(
                                    rpId = parsed.rpId,
                                    allowIds = allowIds,
                                    clientDataHashB64 = clientDataHashB64,
                                    userVerified = true,
                                )
                                vaultRepository.saveVault(forceOverwrite = false)
                                val json = WebAuthnHelper.buildAssertionResponseJson(
                                    assertion,
                                    clientDataBytes,
                                )
                                val result = Intent()
                                PendingIntentHandler.setGetCredentialResponse(
                                    result,
                                    GetCredentialResponse(PublicKeyCredential(json)),
                                )
                                setResult(Activity.RESULT_OK, result)
                                finish()
                            }.onFailure { e ->
                                val result = Intent()
                                PendingIntentHandler.setGetCredentialException(
                                    result,
                                    GetCredentialUnknownException(e.localizedMessage),
                                )
                                setResult(Activity.RESULT_OK, result)
                                finish()
                            }
                        }
                    }
                }

                is GetPasswordOption -> {
                    scope.launch {
                        runCatching {
                            val entryUuid = intent.getStringExtra(EXTRA_ENTRY_UUID)
                                ?: error("UUID ausente")
                            val details = vaultRepository.entryDetails(entryUuid)
                            val pw = vaultRepository.revealPassword(entryUuid)
                            val result = Intent()
                            PendingIntentHandler.setGetCredentialResponse(
                                result,
                                GetCredentialResponse(PasswordCredential(details.summary.username, pw)),
                            )
                            setResult(Activity.RESULT_OK, result)
                            finish()
                        }.onFailure { e ->
                            val result = Intent()
                            PendingIntentHandler.setGetCredentialException(
                                result,
                                GetCredentialUnknownException(e.localizedMessage),
                            )
                            setResult(Activity.RESULT_OK, result)
                            finish()
                        }
                    }
                }

                else -> finish()
            }
        }
    }

    private fun authenticateBiometric(onSuccess: () -> Unit) {
        val manager = BiometricManager.from(this)
        if (manager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG) != BiometricManager.BIOMETRIC_SUCCESS) {
            onSuccess()
            return
        }
        val prompt = BiometricPrompt(
            this,
            ContextCompat.getMainExecutor(this),
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    onSuccess()
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    val result = Intent()
                    PendingIntentHandler.setGetCredentialException(
                        result,
                        GetCredentialCancellationException(errString.toString()),
                    )
                    PendingIntentHandler.setCreateCredentialException(
                        result,
                        CreateCredentialCancellationException(errString.toString()),
                    )
                    setResult(Activity.RESULT_OK, result)
                    finish()
                }
            },
        )
        val info = BiometricPrompt.PromptInfo.Builder()
            .setTitle(getString(R.string.unlock_biometric_prompt_title))
            .setSubtitle(getString(R.string.unlock_biometric_prompt_subtitle))
            .setNegativeButtonText(getString(R.string.cancel))
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
            .build()
        prompt.authenticate(info)
    }

    companion object {
        const val ACTION_UNLOCK = "app.betterkeepass.passkey.ACTION_UNLOCK"
        const val ACTION_CREATE = "app.betterkeepass.passkey.ACTION_CREATE"
        const val ACTION_GET_PASSKEY = "app.betterkeepass.passkey.ACTION_GET_PASSKEY"
        const val ACTION_GET_PASSWORD = "app.betterkeepass.passkey.ACTION_GET_PASSWORD"
        const val EXTRA_ENTRY_UUID = "extra_entry_uuid"
        const val EXTRA_CREDENTIAL_ID = "extra_credential_id"
    }
}
