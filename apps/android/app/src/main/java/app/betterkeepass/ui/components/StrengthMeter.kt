package app.betterkeepass.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.betterkeepass.R
import app.betterkeepass.ui.theme.BkpTheme

/** Same heuristic as the desktop StrengthMeter: 0 (empty) to 4 (strong). */
internal fun passwordStrength(password: String): Int {
    if (password.isEmpty()) return 0
    val points = listOf(
        password.length >= 8,
        password.length >= 12,
        password.length >= 16,
        password.any { it in 'a'..'z' } && password.any { it in 'A'..'Z' },
        password.any { it in '0'..'9' },
        password.any { it !in 'a'..'z' && it !in 'A'..'Z' && it !in '0'..'9' },
    ).count { it }
    return when {
        points <= 2 -> 1
        points == 3 -> 2
        points == 4 -> 3
        else -> 4
    }
}

@Composable
fun StrengthMeter(password: String, modifier: Modifier = Modifier) {
    val score = passwordStrength(password)
    if (score == 0) return
    val colors = BkpTheme.colors
    val active = when (score) {
        1 -> colors.danger
        2 -> colors.warning
        else -> colors.accent
    }
    val label = when (score) {
        1 -> R.string.strength_weak
        2 -> R.string.strength_fair
        3 -> R.string.strength_good
        else -> R.string.strength_strong
    }
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        repeat(4) { index ->
            val color by animateColorAsState(if (index < score) active else colors.bgMuted, label = "strength")
            Box(Modifier.weight(1f).height(4.dp).background(color, CircleShape))
        }
        Text(stringResource(label), color = active, style = MaterialTheme.typography.labelMedium)
    }
}
