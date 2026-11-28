package app.betterkeepass

import android.app.Application
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import app.betterkeepass.data.VaultRepository
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject

@HiltAndroidApp
class BkpApplication : Application() {

    @Inject
    lateinit var vaultRepository: VaultRepository

    override fun onCreate() {
        super.onCreate()
        ProcessLifecycleOwner.get().lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onStop(owner: LifecycleOwner) {
                vaultRepository.onAppBackgrounded()
            }

            override fun onStart(owner: LifecycleOwner) {
                vaultRepository.onAppForegrounded()
            }
        })
    }
}
