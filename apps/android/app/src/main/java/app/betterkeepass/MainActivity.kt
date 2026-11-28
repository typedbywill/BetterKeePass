package app.betterkeepass

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

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        setContent {
            BkpTheme {
                val session by vaultRepository.session.collectAsStateWithLifecycle()
                val navController = rememberNavController()

                when (val current = session) {
                    VaultSessionState.Locked -> {
                        UnlockScreen()
                    }
                    is VaultSessionState.Unlocked -> {
                        NavHost(navController = navController, startDestination = "list") {
                            composable("list") {
                                VaultListScreen(
                                    vaultName = current.displayName,
                                    onEntryClick = { uuid -> navController.navigate("detail/$uuid") },
                                    onAddEntry = { navController.navigate("editor") },
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
                                route = "editor?uuid={uuid}",
                                arguments = listOf(
                                    navArgument("uuid") {
                                        type = NavType.StringType
                                        nullable = true
                                        defaultValue = null
                                    }
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
