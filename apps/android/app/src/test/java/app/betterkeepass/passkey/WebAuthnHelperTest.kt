package app.betterkeepass.passkey

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test
import uniffi.bkp_ffi.PasskeyAlgorithmDto

class WebAuthnHelperTest {

    @Test
    fun parseCreateRequest_extractsFieldsAndAlgorithm() {
        val json = """
            {
              "rp": { "id": "webauthn.io", "name": "WebAuthn.io" },
              "user": { "id": "dXNlcjE", "name": "alice", "displayName": "Alice" },
              "challenge": "Y2hhbGxlbmdl",
              "pubKeyCredParams": [ { "type": "public-key", "alg": -7 } ]
            }
        """.trimIndent()

        val parsed = WebAuthnHelper.parseCreateRequest(json)
        assertEquals("webauthn.io", parsed.rpId)
        assertEquals("alice", parsed.username)
        assertEquals("dXNlcjE", parsed.userHandleB64)
        assertEquals(PasskeyAlgorithmDto.ES256, parsed.algorithm)
    }

    @Test
    fun buildNativeClientDataJson_includesAndroidOriginAndPackage() {
        val bytes = WebAuthnHelper.buildNativeClientDataJson(
            type = "webauthn.get",
            challengeB64 = "Y2hhbGxlbmdl",
            origin = "android:apk-key-hash:abc123",
            packageName = "com.example.app",
        )
        val obj = JSONObject(String(bytes, Charsets.UTF_8))
        assertEquals("webauthn.get", obj.getString("type"))
        assertEquals("android:apk-key-hash:abc123", obj.getString("origin"))
        assertEquals("com.example.app", obj.getString("androidPackageName"))
    }
}
