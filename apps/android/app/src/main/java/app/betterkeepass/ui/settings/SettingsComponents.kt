package app.betterkeepass.ui.settings

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Palette
import androidx.compose.material.icons.outlined.Password
import androidx.compose.material.icons.outlined.Security
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import app.betterkeepass.R
import app.betterkeepass.ui.theme.BkpTheme
import kotlin.math.roundToInt

internal enum class SettingsPage(
    @StringRes val title: Int,
    @StringRes val description: Int,
    val icon: ImageVector,
) {
    Appearance(
        R.string.settings_category_appearance,
        R.string.settings_category_appearance_desc,
        Icons.Outlined.Palette,
    ),
    Security(
        R.string.settings_category_security,
        R.string.settings_category_security_desc,
        Icons.Outlined.Security,
    ),
    Autofill(
        R.string.settings_category_autofill,
        R.string.settings_category_autofill_desc,
        Icons.Outlined.Password,
    ),
}

@Composable
internal fun SectionTitle(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.titleSmall,
        color = BkpTheme.colors.accent,
        modifier = Modifier.padding(start = 16.dp, top = 20.dp, bottom = 4.dp),
    )
}

@Composable
internal fun SliderSetting(
    title: String,
    summary: String,
    value: Int,
    range: ClosedFloatingPointRange<Float>,
    onChange: (Int) -> Unit,
) {
    Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
        Text(title, style = MaterialTheme.typography.bodyLarge)
        Text(summary, style = MaterialTheme.typography.bodyMedium, color = BkpTheme.colors.fgSubtle)
        Slider(value = value.toFloat(), onValueChange = { onChange(it.roundToInt()) }, valueRange = range)
    }
}
