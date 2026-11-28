package app.betterkeepass.security

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.KeyProperties
import android.util.Base64
import app.betterkeepass.data.BiometricVaultSecret
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class BiometricCryptoManager @Inject constructor() {

    private val keyAlias = "betterkeepass_biometric_master_key"
    private val keystoreProvider = "AndroidKeyStore"
    private val transformation =
        "${KeyProperties.KEY_ALGORITHM_AES}/${KeyProperties.BLOCK_MODE_GCM}/${KeyProperties.ENCRYPTION_PADDING_NONE}"

    fun createEncryptCipher(): Cipher {
        val key = getOrCreateKey()
        return try {
            Cipher.getInstance(transformation).apply {
                init(Cipher.ENCRYPT_MODE, key)
            }
        } catch (e: KeyPermanentlyInvalidatedException) {
            deleteKey()
            val freshKey = getOrCreateKey()
            Cipher.getInstance(transformation).apply {
                init(Cipher.ENCRYPT_MODE, freshKey)
            }
        }
    }

    fun createDecryptCipher(ivBase64: String): Cipher {
        val key = getExistingKey()
            ?: throw KeyPermanentlyInvalidatedException("Chave biométrica ausente")
        val iv = Base64.decode(ivBase64, Base64.NO_WRAP)
        return Cipher.getInstance(transformation).apply {
            init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, iv))
        }
    }

    fun encryptPassword(cipher: Cipher, password: String): BiometricVaultSecret {
        val ciphertext = cipher.doFinal(password.toByteArray(Charsets.UTF_8))
        return BiometricVaultSecret(
            ivBase64 = Base64.encodeToString(cipher.iv, Base64.NO_WRAP),
            ciphertextBase64 = Base64.encodeToString(ciphertext, Base64.NO_WRAP),
        )
    }

    fun decryptPassword(cipher: Cipher, secret: BiometricVaultSecret): String {
        val ciphertext = Base64.decode(secret.ciphertextBase64, Base64.NO_WRAP)
        val plain = cipher.doFinal(ciphertext)
        return String(plain, Charsets.UTF_8)
    }

    fun deleteKey() {
        val keyStore = KeyStore.getInstance(keystoreProvider).apply { load(null) }
        if (keyStore.containsAlias(keyAlias)) {
            keyStore.deleteEntry(keyAlias)
        }
    }

    private fun getExistingKey(): SecretKey? {
        val keyStore = KeyStore.getInstance(keystoreProvider).apply { load(null) }
        return keyStore.getKey(keyAlias, null) as? SecretKey
    }

    private fun getOrCreateKey(): SecretKey {
        getExistingKey()?.let { return it }
        val keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, keystoreProvider)
        val builder = KeyGenParameterSpec.Builder(
            keyAlias,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setUserAuthenticationRequired(true)
            .setInvalidatedByBiometricEnrollment(true)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            builder.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
        } else {
            @Suppress("DEPRECATION")
            builder.setUserAuthenticationValidityDurationSeconds(-1)
        }

        keyGenerator.init(builder.build())
        return keyGenerator.generateKey()
    }
}
