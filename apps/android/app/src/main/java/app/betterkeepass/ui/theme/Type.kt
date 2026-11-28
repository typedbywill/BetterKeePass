package app.betterkeepass.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import app.betterkeepass.R

val Geist = FontFamily(
    Font(R.font.geist_regular, FontWeight.Normal),
    Font(R.font.geist_medium, FontWeight.Medium),
    Font(R.font.geist_semibold, FontWeight.SemiBold),
)

/** Used for secrets and codes, where l/1/I and 0/O must be distinguishable. */
val GeistMono = FontFamily(
    Font(R.font.geist_mono_regular, FontWeight.Normal),
    Font(R.font.geist_mono_medium, FontWeight.Medium),
)

private fun style(size: Int, line: Int, weight: FontWeight, tracking: Double = 0.0) = TextStyle(
    fontFamily = Geist,
    fontWeight = weight,
    fontSize = size.sp,
    lineHeight = line.sp,
    letterSpacing = tracking.sp,
)

internal val BkpTypography = Typography(
    displayLarge = style(48, 56, FontWeight.SemiBold, -1.0),
    displayMedium = style(40, 48, FontWeight.SemiBold, -0.8),
    displaySmall = style(34, 42, FontWeight.SemiBold, -0.6),
    headlineLarge = style(30, 38, FontWeight.SemiBold, -0.5),
    headlineMedium = style(26, 34, FontWeight.SemiBold, -0.4),
    headlineSmall = style(22, 30, FontWeight.SemiBold, -0.3),
    titleLarge = style(20, 28, FontWeight.SemiBold, -0.2),
    titleMedium = style(16, 22, FontWeight.SemiBold),
    titleSmall = style(14, 20, FontWeight.Medium),
    bodyLarge = style(16, 24, FontWeight.Normal),
    bodyMedium = style(14, 21, FontWeight.Normal),
    bodySmall = style(12, 18, FontWeight.Normal),
    labelLarge = style(14, 20, FontWeight.Medium),
    labelMedium = style(12, 16, FontWeight.Medium),
    labelSmall = style(11, 16, FontWeight.SemiBold, 1.2),
)
