package app.betterkeepass.ui.theme

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.betterkeepass.data.SettingsDataStore

private val LocalBkpColors = staticCompositionLocalOf { ThemePreset.Default.light }

/** Access to the tokens that Material's color scheme has no slot for. */
object BkpTheme {
    val colors: BkpColors
        @Composable get() = LocalBkpColors.current
}

private val BkpShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(10.dp),
    medium = RoundedCornerShape(14.dp),
    large = RoundedCornerShape(18.dp),
    extraLarge = RoundedCornerShape(24.dp),
)

/** Theme following the appearance saved in settings; draws nothing until it has loaded. */
@Composable
fun BkpTheme(settings: SettingsDataStore, content: @Composable () -> Unit) {
    val appearance by settings.appearance.collectAsStateWithLifecycle(initialValue = null)
    appearance?.let { BkpTheme(it, content) }
}

@Composable
fun BkpTheme(
    appearance: Appearance = Appearance(),
    content: @Composable () -> Unit,
) {
    val isDark = when (appearance.mode) {
        ThemeMode.System -> isSystemInDarkTheme()
        ThemeMode.Light -> false
        ThemeMode.Dark -> true
    }
    val context = LocalContext.current
    val dynamic = if (appearance.dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        if (isDark) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
    } else {
        null
    }
    val colors = dynamic?.toBkpColors(isDark) ?: appearance.preset.colors(isDark)

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as? Activity)?.window ?: return@SideEffect
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = !isDark
                isAppearanceLightNavigationBars = !isDark
            }
        }
    }

    CompositionLocalProvider(LocalBkpColors provides colors) {
        MaterialTheme(
            colorScheme = dynamic ?: colors.toColorScheme(),
            typography = BkpTypography,
            shapes = BkpShapes,
            content = content,
        )
    }
}

private fun BkpColors.toColorScheme(): ColorScheme {
    val accentContainer = accentSubtle.compositeOver(surface)
    val base = if (isDark) darkColorScheme() else lightColorScheme()
    return base.copy(
        primary = accent,
        onPrimary = accentFg,
        primaryContainer = accentContainer,
        onPrimaryContainer = fg,
        inversePrimary = accent,
        secondary = accent,
        onSecondary = accentFg,
        secondaryContainer = accentContainer,
        onSecondaryContainer = fg,
        tertiary = accent,
        onTertiary = accentFg,
        tertiaryContainer = accentContainer,
        onTertiaryContainer = fg,
        background = bg,
        onBackground = fg,
        surface = bg,
        onSurface = fg,
        surfaceVariant = bgMuted,
        onSurfaceVariant = fgMuted,
        surfaceTint = accent,
        inverseSurface = fg,
        inverseOnSurface = bg,
        error = danger,
        onError = bg,
        errorContainer = dangerSubtle.compositeOver(surface),
        onErrorContainer = fg,
        outline = borderStrong,
        outlineVariant = border,
        surfaceBright = surface,
        surfaceDim = bgSubtle,
        surfaceContainerLowest = bg,
        surfaceContainerLow = surface,
        surfaceContainer = surface,
        surfaceContainerHigh = surface,
        surfaceContainerHighest = surface,
    )
}

private fun ColorScheme.toBkpColors(isDark: Boolean) = BkpColors(
    isDark = isDark,
    bg = surface,
    bgSubtle = surfaceContainerLow,
    bgMuted = surfaceContainerHighest,
    surface = surfaceContainer,
    surfaceHover = surfaceContainerHigh,
    border = outlineVariant,
    borderStrong = outline,
    fg = onSurface,
    fgMuted = onSurfaceVariant,
    fgSubtle = onSurfaceVariant,
    accent = primary,
    accentSubtle = primary.copy(alpha = 0.14f),
    accentFg = onPrimary,
    danger = error,
    dangerSubtle = error.copy(alpha = 0.12f),
    warning = tertiary,
    warningSubtle = tertiary.copy(alpha = 0.14f),
)
