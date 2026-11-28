package app.betterkeepass.ui.settings

import android.os.Build
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import app.betterkeepass.R
import app.betterkeepass.ui.theme.Appearance
import app.betterkeepass.ui.theme.BkpColors
import app.betterkeepass.ui.theme.BkpTheme
import app.betterkeepass.ui.theme.ThemeMode
import app.betterkeepass.ui.theme.ThemePreset

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun AppearanceSection(
    appearance: Appearance,
    onModeChange: (ThemeMode) -> Unit,
    onPresetChange: (ThemePreset) -> Unit,
    onDynamicColorChange: (Boolean) -> Unit,
) {
    val colors = BkpTheme.colors

    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
        ThemeMode.entries.forEachIndexed { index, mode ->
            SegmentedButton(
                selected = appearance.mode == mode,
                onClick = { onModeChange(mode) },
                shape = SegmentedButtonDefaults.itemShape(index, ThemeMode.entries.size),
            ) {
                Text(
                    stringResource(
                        when (mode) {
                            ThemeMode.System -> R.string.settings_theme_system
                            ThemeMode.Light -> R.string.settings_theme_light
                            ThemeMode.Dark -> R.string.settings_theme_dark
                        },
                    ),
                )
            }
        }
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        ListItem(
            headlineContent = { Text(stringResource(R.string.settings_dynamic_color)) },
            supportingContent = { Text(stringResource(R.string.settings_dynamic_color_desc)) },
            trailingContent = { Switch(checked = appearance.dynamicColor, onCheckedChange = null) },
            modifier = Modifier.toggleable(
                value = appearance.dynamicColor,
                role = Role.Switch,
                onValueChange = onDynamicColorChange,
            ),
        )
    }

    SectionTitle(stringResource(R.string.settings_theme_preset))
    ThemePreset.entries.forEach { preset ->
        val selected = !appearance.dynamicColor && appearance.preset == preset
        ListItem(
            headlineContent = { Text(preset.displayName) },
            leadingContent = { Swatch(preset.colors(colors.isDark)) },
            trailingContent = {
                // Keeps the row height stable whether or not it is selected.
                Box(Modifier.size(24.dp)) {
                    if (selected) Icon(Icons.Outlined.Check, contentDescription = null, tint = colors.accent)
                }
            },
            modifier = Modifier.selectable(
                selected = selected,
                role = Role.RadioButton,
                onClick = { onPresetChange(preset) },
            ),
        )
    }
}

/** A preset drawn with its own background, accent and text colors. */
@Composable
private fun Swatch(preview: BkpColors) {
    Row(
        modifier = Modifier
            .background(preview.bg, CircleShape)
            .border(1.dp, BkpTheme.colors.border, CircleShape)
            .padding(6.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(16.dp).background(preview.accent, CircleShape))
        Box(Modifier.size(16.dp).background(preview.fg, CircleShape))
    }
}
