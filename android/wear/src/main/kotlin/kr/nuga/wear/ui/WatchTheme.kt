package kr.nuga.wear.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.wear.compose.material.Colors
import androidx.wear.compose.material.MaterialTheme

/** Watch (dark) tokens from docs/DESIGN.md. */
object WatchColors {
    val Bg = Color(0xFF0B0C0F)
    val Surface = Color(0xFF16181D)
    val Text = Color(0xFFF4F3EF)
    val Text2 = Color(0xFF9A9EAA)
    val Cat1 = Color(0xFF4C7BFF)
    val Cat2 = Color(0xFF1FA89E)
    val Cat3 = Color(0xFF9B6BD6)
    val Cat4 = Color(0xFF5C606B)
    val Warn = Color(0xFFFF8A3D)

    fun category(key: Int): Color = when (key) {
        1 -> Cat1
        2 -> Cat2
        3 -> Cat3
        else -> Cat4
    }
}

private val WatchPalette = Colors(
    primary = WatchColors.Cat1,
    primaryVariant = WatchColors.Cat1,
    secondary = WatchColors.Cat2,
    secondaryVariant = WatchColors.Cat2,
    background = WatchColors.Bg,
    surface = WatchColors.Surface,
    error = WatchColors.Warn,
    onPrimary = Color.White,
    onSecondary = Color.White,
    onBackground = WatchColors.Text,
    onSurface = WatchColors.Text,
    onSurfaceVariant = WatchColors.Text2,
    onError = Color.Black,
)

@Composable
fun WatchTheme(content: @Composable () -> Unit) {
    MaterialTheme(colors = WatchPalette, content = content)
}
