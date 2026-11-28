package app.betterkeepass.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.betterkeepass.ui.theme.BkpTheme

/** Countdown ring; turns to the warning color in the last 5 units. */
@Composable
fun ProgressRing(value: Int, max: Int, modifier: Modifier = Modifier, size: Dp = 28.dp, stroke: Dp = 2.5.dp) {
    val colors = BkpTheme.colors
    val ratio by animateFloatAsState(
        targetValue = if (max > 0) (value.toFloat() / max).coerceIn(0f, 1f) else 0f,
        animationSpec = tween(300, easing = LinearEasing),
        label = "ring",
    )
    val color = if (value <= 5) colors.warning else colors.accent
    Canvas(modifier.size(size)) {
        val width = stroke.toPx()
        val topLeft = Offset(width / 2, width / 2)
        val arcSize = Size(this.size.width - width, this.size.height - width)
        drawArc(colors.border, 0f, 360f, false, topLeft, arcSize, style = Stroke(width))
        drawArc(color, -90f, 360f * ratio, false, topLeft, arcSize, style = Stroke(width, cap = StrokeCap.Round))
    }
}
