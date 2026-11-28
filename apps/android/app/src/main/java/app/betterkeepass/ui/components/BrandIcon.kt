package app.betterkeepass.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.vector.PathParser
import app.betterkeepass.ui.theme.BkpTheme

/** The BetterKeePass shield, colored by the active theme. */
@Composable
fun BrandIcon(modifier: Modifier = Modifier) {
    val accent = BkpTheme.colors.accent
    val shield = remember {
        PathParser()
            .parsePathString("M32 10 49 17v13c0 11-6.8 19.2-17 24C21.8 49.2 15 41 15 30V17l17-7Z")
            .toPath()
    }
    Canvas(modifier) {
        // The shield only fills part of the 64x64 source box, so crop to a 48x48 window.
        scale(size.minDimension / 48f, pivot = Offset.Zero) {
            drawContext.transform.translate(-8f, -8f)
            drawPath(shield, accent, style = Stroke(width = 4f, join = StrokeJoin.Round))
            drawCircle(accent, radius = 4f, center = Offset(32f, 29f))
            drawLine(accent, Offset(32f, 33f), Offset(32f, 40f), strokeWidth = 4f, cap = StrokeCap.Round)
            drawContext.transform.translate(8f, 8f)
        }
    }
}
