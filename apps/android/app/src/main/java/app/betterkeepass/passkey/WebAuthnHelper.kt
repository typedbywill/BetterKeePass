package app.betterkeepass.passkey

import android.content.pm.SigningInfo
import android.os.Build
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import uniffi.bkp_ffi.PasskeyAlgorithmDto
import uniffi.bkp_ffi.PasskeyAssertionResultDto
import uniffi.bkp_ffi.PasskeyCreateResultDto
import java.security.MessageDigest

data class ParsedCreatePasskeyJson(
    val rpId: String,
    val rpName: String,
    val username: String,
    val displayName: String,
    val userHandleB64: String,
    val challengeB64: String,
    val algorithm: PasskeyAlgorithmDto,
)

data class ParsedGetPasskeyJson(
    val rpId: String,
    val challengeB64: String,
    val allowCredentialIds: List<String>,
)

object WebAuthnHelper {

    fun parseCreateRequest(requestJson: String): ParsedCreatePasskeyJson {
        val root = JSONObject(requestJson)
        val rp = root.getJSONObject("rp")
        val user = root.getJSONObject("user")
        val pubKeyParams = root.optJSONArray("pubKeyCredParams") ?: JSONArray()

        var algorithm = PasskeyAlgorithmDto.ES256
        for (i in 0 until pubKeyParams.length()) {
            val alg = pubKeyParams.getJSONObject(i).optInt("alg", 0)
            if (alg == -7) {
                algorithm = PasskeyAlgorithmDto.ES256
                break
            } else if (alg == -8) {
                algorithm = PasskeyAlgorithmDto.ED_DSA
                break
            }
        }

        return ParsedCreatePasskeyJson(
            rpId = rp.getString("id"),
            rpName = rp.optString("name", rp.getString("id")),
            username = user.getString("name"),
            displayName = user.optString("displayName", user.getString("name")),
            userHandleB64 = user.getString("id"),
            challengeB64 = root.getString("challenge"),
            algorithm = algorithm,
        )
    }

    fun parseGetRequest(requestJson: String): ParsedGetPasskeyJson {
        val root = JSONObject(requestJson)
        val allowList = root.optJSONArray("allowCredentials")
        val allowIds = buildList {
            if (allowList != null) {
                for (i in 0 until allowList.length()) {
                    val id = allowList.getJSONObject(i).optString("id")
                    if (id.isNotEmpty()) add(id)
                }
            }
        }
        return ParsedGetPasskeyJson(
            rpId = root.getString("rpId"),
            challengeB64 = root.getString("challenge"),
            allowCredentialIds = allowIds,
        )
    }

    fun buildNativeClientDataJson(
        type: String,
        challengeB64: String,
        origin: String,
        packageName: String,
    ): ByteArray {
        val json = JSONObject().apply {
            put("type", type)
            put("challenge", challengeB64)
            put("origin", origin)
            put("androidPackageName", packageName)
        }
        return json.toString().toByteArray(Charsets.UTF_8)
    }

    fun computeApkOrigin(signingInfo: SigningInfo): String? {
        val cert = if (signingInfo.hasMultipleSigners()) {
            signingInfo.apkContentsSigners.firstOrNull()
        } else {
            signingInfo.signingCertificateHistory.firstOrNull()
        } ?: return null

        val digest = MessageDigest.getInstance("SHA-256").digest(cert.toByteArray())
        val hashB64 = Base64.encodeToString(
            digest,
            Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING,
        )
        return "android:apk-key-hash:$hashB64"
    }

    fun sha256B64Url(bytes: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(bytes)
        return Base64.encodeToString(
            digest,
            Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING,
        )
    }

    fun buildCreateResponseJson(
        result: PasskeyCreateResultDto,
        clientDataJsonBytes: ByteArray?,
    ): String {
        val clientDataB64 = clientDataJsonBytes?.let {
            Base64.encodeToString(it, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
        } ?: ""
        return JSONObject().apply {
            put("id", result.credentialIdB64)
            put("rawId", result.credentialIdB64)
            put("type", "public-key")
            put("authenticatorAttachment", "platform")
            put(
                "response",
                JSONObject().apply {
                    put("attestationObject", result.attestationObjectB64)
                    put("authenticatorData", result.authDataB64)
                    put("publicKey", result.publicKeyCoseB64)
                    if (clientDataB64.isNotEmpty()) {
                        put("clientDataJSON", clientDataB64)
                    }
                    put("transports", JSONArray(listOf("internal")))
                },
            )
        }.toString()
    }

    fun buildAssertionResponseJson(
        result: PasskeyAssertionResultDto,
        clientDataJsonBytes: ByteArray?,
    ): String {
        val clientDataB64 = clientDataJsonBytes?.let {
            Base64.encodeToString(it, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
        } ?: ""
        return JSONObject().apply {
            put("id", result.credentialIdB64)
            put("rawId", result.credentialIdB64)
            put("type", "public-key")
            put("authenticatorAttachment", "platform")
            put(
                "response",
                JSONObject().apply {
                    put("authenticatorData", result.authenticatorDataB64)
                    put("signature", result.signatureB64)
                    put("userHandle", result.userHandleB64)
                    if (clientDataB64.isNotEmpty()) {
                        put("clientDataJSON", clientDataB64)
                    }
                },
            )
        }.toString()
    }
}
