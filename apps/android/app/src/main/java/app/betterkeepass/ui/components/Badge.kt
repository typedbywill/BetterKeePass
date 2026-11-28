package app.betterkeepass.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import app.betterkeepass.ui.theme.BkpTheme

enum class BadgeTone { Neutral, Accent, Warning, Danger }

@Composable
fun Badge(
    text: String,
    modifier: Modifier = Modifier,
    tone: BadgeTone = BadgeTone.Neutral,
    icon: ImageVector? = null,
) {
    val colors = BkpTheme.colors
    val (container, content) = when (tone) {
        BadgeTone.Neutral -> colors.bgMuted to colors.fgMuted
        BadgeTone.Accent -> colors.accentSubtle to colors.accent
        BadgeTone.Warning -> colors.warningSubtle to colors.warning
        BadgeTone.Danger -> colors.dangerSubtle to colors.danger
    }
    Row(
        modifier = modifier.background(container, CircleShape).padding(horizontal = 8.dp, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        if (icon != null) Icon(icon, contentDescription = null, tint = content, modifier = Modifier.size(12.dp))
        Text(text, color = content, style = MaterialTheme.typography.labelMedium)
    }
}
