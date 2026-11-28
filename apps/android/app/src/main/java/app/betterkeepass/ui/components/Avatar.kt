package app.betterkeepass.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.betterkeepass.ui.theme.BkpTheme
import app.betterkeepass.ui.theme.Geist
import androidx.compose.ui.text.font.FontWeight

/**
 * Entry avatar: the KeePass icon when it carries meaning, otherwise the title initials.
 * Icon 0 (key) is the KeePass default, so it falls through to initials.
 * Favicons are deliberately not fetched: that would leak vault domains over the network.
 */
@Composable
fun Avatar(title: String, modifier: Modifier = Modifier, iconId: Int? = null, size: Dp = 40.dp) {
    val colors = BkpTheme.colors
    val shape = RoundedCornerShape(size * 0.28f)
    Box(
        modifier = modifier
            .size(size)
            .background(colors.accentSubtle, shape)
            .border(1.dp, colors.border, shape),
        contentAlignment = Alignment.Center,
    ) {
        val icon = iconId?.takeIf { it != 0 }?.let(::keepassIcon)
        if (icon != null) {
            Icon(icon, contentDescription = null, tint = colors.accent, modifier = Modifier.size(size * 0.5f))
        } else {
            Text(
                text = initialsFrom(title),
                color = colors.accent,
                fontFamily = Geist,
                fontWeight = FontWeight.SemiBold,
                fontSize = (size.value * 0.34f).sp,
            )
        }
    }
}

internal fun initialsFrom(title: String): String {
    val words = title.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
    return when (words.size) {
        0 -> "?"
        1 -> words[0].take(2).uppercase()
        else -> "${words[0].first()}${words[1].first()}".uppercase()
    }
}
