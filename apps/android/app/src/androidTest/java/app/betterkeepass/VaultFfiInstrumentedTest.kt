package app.betterkeepass

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import uniffi.bkp_ffi.NewEntryDto
import uniffi.bkp_ffi.PasskeyAlgorithmDto
import uniffi.bkp_ffi.PasskeyCreateRequestDto
import uniffi.bkp_ffi.PasswordOptionsDto
import uniffi.bkp_ffi.VaultHandle
import uniffi.bkp_ffi.generatePassword

@RunWith(AndroidJUnit4::class)
class VaultFfiInstrumentedTest {

    @Test
    fun nativeRustRoundtripAndPasskeysWorkOnDevice() {
        val pw = generatePassword(
            PasswordOptionsDto(
                length = 20u,
                lowercase = true,
                uppercase = true,
                digits = true,
                symbols = true,
                excludeAmbiguous = true,
            )
        )
        assertEquals(20, pw.length)

        val handle = VaultHandle.create("DeviceTest", "master-android", null)
        val uuid = handle.addEntry(
            NewEntryDto(
                groupPath = "Android/Contas",
                title = "GitHub",
                username = "octocat",
                password = pw,
                url = "https://github.com",
                notes = "Rodando no ARM64",
                tags = listOf("Dev"),
                customFields = emptyList(),
            )
        )
        assertEquals(pw, handle.revealPassword(uuid))

        val pk = handle.passkeyCreate(
            PasskeyCreateRequestDto(
                rpId = "webauthn.io",
                rpName = "WebAuthn.io",
                username = "octocat",
                userDisplayName = "Octocat",
                userHandleB64 = "dXNlcjE",
                clientDataHashB64 = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
                algorithm = PasskeyAlgorithmDto.ES256,
                userVerified = true,
                groupPath = "Passkeys",
            )
        )
        assertTrue(pk.credentialIdB64.isNotEmpty())

        val bytes = handle.save()
        handle.lock()
        assertTrue(handle.isLocked())

        val reopened = VaultHandle.open(bytes, "master-android", null)
        assertEquals("DeviceTest", reopened.databaseName())
        assertEquals(2, reopened.search("").size)
        assertEquals(1, reopened.passkeyList("webauthn.io").size)
    }
}
