package app.betterkeepass.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import org.json.JSONArray
import org.json.JSONObject
import javax.inject.Inject
import javax.inject.Singleton

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "bkp_settings")

data class RecentVault(
    val uri: String,
    val displayName: String,
    val lastOpenedMs: Long,
)

data class BiometricVaultSecret(
    val ivBase64: String,
    val ciphertextBase64: String,
)

@Singleton
class SettingsDataStore @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private object Keys {
        val RECENT_VAULTS = stringPreferencesKey("recent_vaults_json")
        val LOCK_TIMEOUT_MINUTES = intPreferencesKey("lock_timeout_minutes")
        val CLIPBOARD_TIMEOUT_SECONDS = intPreferencesKey("clipboard_timeout_seconds")
        val BIOMETRIC_SECRETS = stringPreferencesKey("biometric_secrets_json")
    }

    val recentVaults: Flow<List<RecentVault>> = context.dataStore.data.map { prefs ->
        parseRecentVaults(prefs[Keys.RECENT_VAULTS])
    }

    val lockTimeoutMinutes: Flow<Int> = context.dataStore.data.map { prefs ->
        prefs[Keys.LOCK_TIMEOUT_MINUTES] ?: 5
    }

    val clipboardTimeoutSeconds: Flow<Int> = context.dataStore.data.map { prefs ->
        prefs[Keys.CLIPBOARD_TIMEOUT_SECONDS] ?: 30
    }

    val biometricEnabledUris: Flow<Set<String>> = context.dataStore.data.map { prefs ->
        parseBiometricMap(prefs[Keys.BIOMETRIC_SECRETS]).keys
    }

    suspend fun addRecentVault(uri: String, displayName: String) {
        context.dataStore.edit { prefs ->
            val current = parseRecentVaults(prefs[Keys.RECENT_VAULTS])
                .filterNot { it.uri == uri }
            val updated = listOf(RecentVault(uri, displayName, System.currentTimeMillis())) +
                current.take(9)
            prefs[Keys.RECENT_VAULTS] = serializeRecentVaults(updated)
        }
    }

    suspend fun removeRecentVault(uri: String) {
        context.dataStore.edit { prefs ->
            val updated = parseRecentVaults(prefs[Keys.RECENT_VAULTS]).filterNot { it.uri == uri }
            prefs[Keys.RECENT_VAULTS] = serializeRecentVaults(updated)
        }
    }

    suspend fun setLockTimeoutMinutes(minutes: Int) {
        context.dataStore.edit { prefs ->
            prefs[Keys.LOCK_TIMEOUT_MINUTES] = minutes.coerceIn(0, 120)
        }
    }

    suspend fun setClipboardTimeoutSeconds(seconds: Int) {
        context.dataStore.edit { prefs ->
            prefs[Keys.CLIPBOARD_TIMEOUT_SECONDS] = seconds.coerceIn(5, 300)
        }
    }

    suspend fun getBiometricSecret(uri: String): BiometricVaultSecret? {
        val prefs = context.dataStore.data.first()
        return parseBiometricMap(prefs[Keys.BIOMETRIC_SECRETS])[uri]
    }

    suspend fun saveBiometricSecret(uri: String, secret: BiometricVaultSecret) {
        context.dataStore.edit { prefs ->
            val map = parseBiometricMap(prefs[Keys.BIOMETRIC_SECRETS]).toMutableMap()
            map[uri] = secret
            prefs[Keys.BIOMETRIC_SECRETS] = serializeBiometricMap(map)
        }
    }

    suspend fun clearBiometricSecret(uri: String) {
        context.dataStore.edit { prefs ->
            val map = parseBiometricMap(prefs[Keys.BIOMETRIC_SECRETS]).toMutableMap()
            map.remove(uri)
            prefs[Keys.BIOMETRIC_SECRETS] = serializeBiometricMap(map)
        }
    }

    private fun parseRecentVaults(raw: String?): List<RecentVault> {
        if (raw.isNullOrBlank()) return emptyList()
        return runCatching {
            val array = JSONArray(raw)
            buildList {
                for (i in 0 until array.length()) {
                    val obj = array.getJSONObject(i)
                    add(
                        RecentVault(
                            uri = obj.getString("uri"),
                            displayName = obj.optString("displayName", "Vault.kdbx"),
                            lastOpenedMs = obj.optLong("lastOpenedMs", 0L),
                        )
                    )
                }
            }
        }.getOrDefault(emptyList())
    }

    private fun serializeRecentVaults(items: List<RecentVault>): String {
        val array = JSONArray()
        items.forEach { item ->
            array.put(
                JSONObject().apply {
                    put("uri", item.uri)
                    put("displayName", item.displayName)
                    put("lastOpenedMs", item.lastOpenedMs)
                }
            )
        }
        return array.toString()
    }

    private fun parseBiometricMap(raw: String?): Map<String, BiometricVaultSecret> {
        if (raw.isNullOrBlank()) return emptyMap()
        return runCatching {
            val obj = JSONObject(raw)
            buildMap {
                obj.keys().forEach { key ->
                    val entry = obj.getJSONObject(key)
                    put(
                        key,
                        BiometricVaultSecret(
                            ivBase64 = entry.getString("iv"),
                            ciphertextBase64 = entry.getString("ct"),
                        )
                    )
                }
            }
        }.getOrDefault(emptyMap())
    }

    private fun serializeBiometricMap(map: Map<String, BiometricVaultSecret>): String {
        val obj = JSONObject()
        map.forEach { (uri, secret) ->
            obj.put(
                uri,
                JSONObject().apply {
                    put("iv", secret.ivBase64)
                    put("ct", secret.ciphertextBase64)
                }
            )
        }
        return obj.toString()
    }
}
