package app.betterkeepass

import android.net.Uri
import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import app.betterkeepass.data.SettingsDataStore
import app.betterkeepass.data.VaultRepository
import app.betterkeepass.data.VaultSessionState
import app.betterkeepass.ui.detail.EntryDetailScreen
import app.betterkeepass.ui.editor.EntryEditorScreen
import app.betterkeepass.ui.settings.SettingsScreen
import app.betterkeepass.ui.theme.BkpTheme
import app.betterkeepass.ui.unlock.UnlockScreen
import app.betterkeepass.ui.vault.VaultListScreen
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : FragmentActivity() {

    @Inject
    lateinit var vaultRepository: VaultRepository

    @Inject
    lateinit var settings: SettingsDataStore

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        setContent {
            BkpTheme(settings) {
                val session by vaultRepository.session.collectAsStateWithLifecycle()
                when (val current = session) {
                    VaultSessionState.Locked -> {
                        UnlockScreen()
                    }
                    is VaultSessionState.Unlocked -> {
                        // Created per session, so another vault never inherits screens or folders.
                        val navController = rememberNavController()
                        NavHost(navController = navController, startDestination = "list") {
                            composable("list") {
                                VaultListScreen(
                                    vaultName = current.displayName,
                                    onEntryClick = { uuid -> navController.navigate("detail/$uuid") },
                                    onAddEntry = { group -> navController.navigate("editor?group=${Uri.encode(group)}") },
                                    onOpenSettings = { navController.navigate("settings") },
                                )
                            }
                            composable(
                                route = "detail/{uuid}",
                                arguments = listOf(navArgument("uuid") { type = NavType.StringType }),
                            ) {
                                EntryDetailScreen(
                                    onBack = { navController.popBackStack() },
                                    onEdit = { uuid -> navController.navigate("editor?uuid=$uuid") },
                                )
                            }
                            composable(
                                route = "editor?uuid={uuid}&group={group}",
                                arguments = listOf(
                                    navArgument("uuid") {
                                        type = NavType.StringType
                                        nullable = true
                                        defaultValue = null
                                    },
                                    navArgument("group") {
                                        type = NavType.StringType
                                        defaultValue = ""
                                    },
                                ),
                            ) {
                                EntryEditorScreen(onBack = { navController.popBackStack() })
                            }
                            composable("settings") {
                                SettingsScreen(onBack = { navController.popBackStack() })
                            }
                        }
                    }
                }
            }
        }
    }
}
