package kr.nuga.app.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Design tokens from docs/DESIGN.md (light theme). */
object NugaColors {
    val Bg = Color(0xFFF4F3EF)
    val Surface = Color(0xFFFFFFFF)
    val Line = Color(0xFFE3E1DA)
    val Text = Color(0xFF1A1C21)
    val Text2 = Color(0xFF5E6270)
    val Accent = Color(0xFF2448C9)
    val AccentSoft = Color(0xFFE8EDFB)
    val Warn = Color(0xFFB4470B)
    val WarnSoft = Color(0xFFFDEEE3)

    val Cat1 = Color(0xFF2448C9)
    val Cat1Bg = Color(0xFFE8EDFB)
    val Cat2 = Color(0xFF0D6660)
    val Cat2Bg = Color(0xFFDDF1EF)
    val Cat3 = Color(0xFF6C33A3)
    val Cat3Bg = Color(0xFFF0E7FA)
    val Cat4 = Color(0xFF4A4E5A)
    val Cat4Bg = Color(0xFFECECEE)

    fun category(key: Int): Color = when (key) {
        1 -> Cat1
        2 -> Cat2
        3 -> Cat3
        else -> Cat4
    }

    fun categoryBg(key: Int): Color = when (key) {
        1 -> Cat1Bg
        2 -> Cat2Bg
        3 -> Cat3Bg
        else -> Cat4Bg
    }
}

private val LightColors = lightColorScheme(
    primary = NugaColors.Accent,
    onPrimary = Color.White,
    primaryContainer = NugaColors.AccentSoft,
    onPrimaryContainer = NugaColors.Accent,
    secondary = NugaColors.Text2,
    onSecondary = Color.White,
    secondaryContainer = NugaColors.Cat4Bg,
    onSecondaryContainer = NugaColors.Text,
    tertiary = NugaColors.Warn,
    tertiaryContainer = NugaColors.WarnSoft,
    onTertiaryContainer = NugaColors.Warn,
    background = NugaColors.Bg,
    onBackground = NugaColors.Text,
    surface = NugaColors.Surface,
    onSurface = NugaColors.Text,
    surfaceVariant = NugaColors.Bg,
    onSurfaceVariant = NugaColors.Text2,
    surfaceContainer = NugaColors.Surface,
    surfaceContainerLow = NugaColors.Surface,
    surfaceContainerHigh = NugaColors.Surface,
    surfaceContainerHighest = NugaColors.Bg,
    outline = NugaColors.Line,
    outlineVariant = NugaColors.Line,
    error = NugaColors.Warn,
    errorContainer = NugaColors.WarnSoft,
    onErrorContainer = NugaColors.Warn,
)

private val NugaTypography = Typography(
    headlineSmall = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 20.sp, lineHeight = 26.sp),
    titleLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 20.sp, lineHeight = 26.sp),
    titleMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, lineHeight = 22.sp),
    titleSmall = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, lineHeight = 20.sp),
    bodyLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 16.sp, lineHeight = 22.sp),
    bodyMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 14.sp, lineHeight = 20.sp),
    bodySmall = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 12.sp, lineHeight = 16.sp),
    labelLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Medium, fontSize = 14.sp, lineHeight = 20.sp),
    labelMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Medium, fontSize = 12.sp, lineHeight = 16.sp),
    labelSmall = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Medium, fontSize = 11.sp, lineHeight = 16.sp),
)

private val NugaShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(8.dp),
    medium = RoundedCornerShape(12.dp),
    large = RoundedCornerShape(16.dp),
    extraLarge = RoundedCornerShape(24.dp),
)

@Composable
fun NugaTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = LightColors,
        typography = NugaTypography,
        shapes = NugaShapes,
        content = content,
    )
}
