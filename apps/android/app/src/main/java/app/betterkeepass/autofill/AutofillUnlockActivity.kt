package app.betterkeepass.autofill

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.service.autofill.Dataset
import android.service.autofill.FillResponse
import android.view.autofill.AutofillId
import android.view.autofill.AutofillManager
import android.view.autofill.AutofillValue
import android.widget.RemoteViews
import androidx.activity.compose.setContent
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.betterkeepass.data.SettingsDataStore
import app.betterkeepass.data.VaultRepository
import app.betterkeepass.data.VaultSessionState
import app.betterkeepass.ui.theme.BkpTheme
import app.betterkeepass.ui.unlock.UnlockScreen
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class AutofillUnlockActivity : FragmentActivity() {

    @Inject
    lateinit var vaultRepository: VaultRepository

    @Inject
    lateinit var settings: SettingsDataStore

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val domain = intent.getStringExtra(EXTRA_DOMAIN)
        val pkg = intent.getStringExtra(EXTRA_PACKAGE)
        val usernameId = parcelableExtra<AutofillId>(EXTRA_USERNAME_ID)
        val passwordId = parcelableExtra<AutofillId>(EXTRA_PASSWORD_ID)

        setContent {
            BkpTheme(settings) {
                val session by vaultRepository.session.collectAsStateWithLifecycle()

                LaunchedEffect(session) {
                    if (session is VaultSessionState.Unlocked) {
                        val matches = runCatching {
                            vaultRepository.findByUrlOrPackage(domain, pkg)
                        }.getOrDefault(emptyList())

                        val responseBuilder = FillResponse.Builder()
                        matches.forEach { entry ->
                            val pw = if (passwordId != null && entry.hasPassword) {
                                runCatching { vaultRepository.revealPassword(entry.uuid) }.getOrNull()
                            } else {
                                null
                            }
                            val title = entry.title.ifBlank { entry.username.ifBlank { "BetterKeePass" } }
                            val view = RemoteViews(packageName, android.R.layout.simple_list_item_2).apply {
                                setTextViewText(android.R.id.text1, title)
                                setTextViewText(android.R.id.text2, entry.username)
                            }
                            val datasetBuilder = Dataset.Builder(view)
                            usernameId?.let { datasetBuilder.setValue(it, AutofillValue.forText(entry.username)) }
                            passwordId?.let {
                                if (pw != null) datasetBuilder.setValue(it, AutofillValue.forText(pw))
                            }
                            responseBuilder.addDataset(datasetBuilder.build())
                        }

                        val reply = Intent().apply {
                            putExtra(AutofillManager.EXTRA_AUTHENTICATION_RESULT, responseBuilder.build())
                        }
                        setResult(Activity.RESULT_OK, reply)
                        finish()
                    }
                }

                UnlockScreen()
            }
        }
    }

    @Suppress("DEPRECATION")
    private inline fun <reified T> parcelableExtra(key: String): T? {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableExtra(key, T::class.java)
        } else {
            intent.getParcelableExtra(key)
        }
    }

    companion object {
        const val EXTRA_DOMAIN = "extra_domain"
        const val EXTRA_PACKAGE = "extra_package"
        const val EXTRA_USERNAME_ID = "extra_username_id"
        const val EXTRA_PASSWORD_ID = "extra_password_id"
    }
}
