package app.betterkeepass.ui.components

import android.view.HapticFeedbackConstants
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.betterkeepass.R
import app.betterkeepass.ui.theme.BkpTheme
import app.betterkeepass.ui.theme.GeistMono
import kotlinx.coroutines.delay

/** Labelled value with optional reveal and copy actions; copy confirms with a check and a haptic tick. */
@Composable
fun CopyField(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    monospace: Boolean = false,
    isRevealed: Boolean = false,
    onRevealToggle: (() -> Unit)? = null,
    onCopy: (() -> Unit)? = null,
) {
    val colors = BkpTheme.colors
    val view = LocalView.current
    var copies by remember { mutableIntStateOf(0) }
    var showCheck by remember { mutableStateOf(false) }
    LaunchedEffect(copies) {
        if (copies > 0) {
            showCheck = true
            delay(1_500)
            showCheck = false
        }
    }
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium,
        color = colors.surface,
        border = BorderStroke(1.dp, colors.border),
    ) {
        Row(
            modifier = Modifier.padding(start = 16.dp, end = 4.dp, top = 12.dp, bottom = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(label, style = MaterialTheme.typography.labelMedium, color = colors.fgSubtle)
                Text(
                    value,
                    style = MaterialTheme.typography.bodyLarge,
                    fontFamily = if (monospace) GeistMono else null,
                )
            }
            if (onRevealToggle != null) {
                IconButton(onClick = onRevealToggle) {
                    Icon(
                        imageVector = if (isRevealed) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility,
                        contentDescription = stringResource(if (isRevealed) R.string.detail_hide else R.string.detail_reveal),
                    )
                }
            }
            if (onCopy != null) {
                IconButton(
                    onClick = {
                        view.performHapticFeedback(HapticFeedbackConstants.CONTEXT_CLICK)
                        onCopy()
                        copies++
                    },
                ) {
                    Icon(
                        imageVector = if (showCheck) Icons.Outlined.Check else Icons.Outlined.ContentCopy,
                        contentDescription = stringResource(R.string.detail_copy),
                        tint = if (showCheck) colors.accent else colors.fgMuted,
                    )
                }
            }
        }
    }
}
