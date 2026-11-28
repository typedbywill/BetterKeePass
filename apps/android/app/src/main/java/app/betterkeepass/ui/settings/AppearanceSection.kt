package app.betterkeepass.ui.settings

import android.os.Build
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
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
    Column(
        modifier = Modifier.padding(vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            stringResource(R.string.settings_appearance),
            style = MaterialTheme.typography.labelSmall,
            color = colors.accent,
            modifier = Modifier.padding(horizontal = 16.dp),
        )

        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
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

        Text(
            stringResource(R.string.settings_theme_preset),
            style = MaterialTheme.typography.titleSmall,
            modifier = Modifier.padding(horizontal = 16.dp),
        )
        LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(ThemePreset.entries, key = { it.id }) { preset ->
                PresetCard(
                    name = preset.displayName,
                    preview = preset.colors(colors.isDark),
                    selected = !appearance.dynamicColor && appearance.preset == preset,
                    onClick = { onPresetChange(preset) },
                )
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
    }
}

/** Miniature of a preset drawn with its own colors. */
@Composable
private fun PresetCard(name: String, preview: BkpColors, selected: Boolean, onClick: () -> Unit) {
    val shape = MaterialTheme.shapes.medium
    Column(
        modifier = Modifier
            .width(108.dp)
            .clip(shape)
            .background(preview.bg)
            .border(
                width = if (selected) 2.dp else 1.dp,
                color = if (selected) BkpTheme.colors.accent else BkpTheme.colors.border,
                shape = shape,
            )
            .selectable(selected = selected, role = Role.RadioButton, onClick = onClick)
            .padding(10.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(Modifier.fillMaxWidth().height(28.dp).background(preview.surface, MaterialTheme.shapes.extraSmall))
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(14.dp).background(preview.accent, CircleShape))
            Box(Modifier.size(14.dp).background(preview.fg, CircleShape))
        }
        Text(
            name,
            color = preview.fg,
            style = MaterialTheme.typography.labelMedium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}
