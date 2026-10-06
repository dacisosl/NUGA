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
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

/**
 * 디자인 토큰 — 웹 styles.css :root와 같은 값 (밤의 틀 · 빛나는 종이).
 * 밤(Navy·Ink)은 틀에만 쓴다: 머리 띠, 하단 탭, 번호 시트, 위젯.
 * 읽고 쓰는 일(기록 목록·시간표·설정·대화상자)은 모두 종이(Paper·Text) 카드 위에서 한다.
 */
object NugaColors {
    // ── 밤: 화면 틀 ──
    val Navy0 = Color(0xFF060F1A)
    val Navy1 = Color(0xFF081422)        // 바탕
    val Navy2 = Color(0xFF0D1C2E)
    val Navy3 = Color(0xFF112338)        // 불투명 유리 (알림 띠·날짜 꼬리표)
    val Pool = Color(0xFF142C49)         // 오른쪽 아래 빛웅덩이
    val Ink = Color(0xFFEAF2FF)          // 밤 위 글자 16.45:1. 순백은 쓰지 않는다
    val InkDisplay = Color(0xFFDCE9FC)   // 큰 제목
    val InkNum = Color(0xFFD6E6FD)       // 큰 숫자
    val Ink2 = Color(0xFFA3B7D2)         // 9.05:1
    val Ink3 = Color(0xFF7F95B2)         // 6.04:1 — 12sp·500 이상에서만 글자로
    val Ink4 = Color(0xFF5B6E86)         // 글자 아님
    val DLine = Color(0x1FABC9F1)        // rgba(171,201,241,.12)
    val DLine2 = Color(0x38ABC9F1)       // .22
    val DLine3 = Color(0x57ABC9F1)       // .34
    val Btn2Line = Color(0xFF52719A)     // 밤 위 보조 버튼 테두리
    val Btn2Ink = Color(0xFFC6DCFC)
    val BtnLt = Color(0xFFDEEBFF)        // 밤 위 켜진 것 하나 (랜딩 주 버튼)
    val BtnLtInk = Color(0xFF122A47)     // 12.04:1
    val Sky = Color(0xFFACCDFF)
    val Bloom = Color(0xFF5495FD)        // 히어로 유리 계단의 푸른 번짐
    val Amber = Color(0xFFFFB27A)        // 밤 위 유일한 따뜻한 색 (경고)
    val AmberInk = Color(0xFFFFC9A8)
    val SpecWarm = Color(0xFFFFF5DB)     // 빛이 닿는 모서리 끝

    // ── 빛나는 종이: 카드·대화상자 ──
    val Paper = Color(0xFFF2F6FC)
    val PaperTop = Color(0xFFF6F9FD)
    val PaperBottom = Color(0xFFEDF2F9)
    val Surface = Color(0xFFFFFFFF)
    val Text = Color(0xFF152D4A)         // 12.40:1 (종이 아래쪽)
    val Text2 = Color(0xFF4E6886)        // 5.12:1
    val Text3 = Color(0xFF7D93AE)        // 아이콘·구분선·비활성만, 글자 금지
    val Hair = Color(0x14152D4A)         // rgba(21,45,74,.08)
    val Hair2 = Color(0x24152D4A)        // .14
    val Hair3 = Color(0x38152D4A)        // .22
    val Field = Color(0xFFC5D1E0)        // 입력칸 테두리 (Hair3를 흰 바탕에 합성한 값)
    val Mute = Color(0xFFE9EEF5)         // 조용한 칩 바탕
    val Accent = Color(0xFF245AA7)       // 행동 파랑 6.78:1
    val AccentTop = Color(0xFF2F66B8)
    val AccentEdge = Color(0xFF1F4F95)
    val AccentSoft = Color(0xFFE2EDFF)
    val AccentTint = Color(0x0F245AA7)   // 지금 수업 줄
    val Warn = Color(0xFF9E4512)         // 글자 6.34:1
    val WarnDot = Color(0xFFC8661F)      // 점·막대
    val WarnSoft = Color(0xFFFCEDE2)
    val Switch = Color(0xFFC3D0E1)       // 꺼진 스위치

    // ── 녹음 빨강: 녹음 상태에만 ──
    val Rec = Color(0xFFC62828)
    val RecTop = Color(0xFFD0352B)
    val RecSoft = Color(0xFFFDE7E7)
    val RecOnDark = Color(0xFFFF8A80)    // 밤 위 (위젯) 8.12:1

    // ── 카테고리: 웹 --c1~c4와 같은 색 ──
    val Cat1 = Color(0xFF2F63B8)
    val Cat1Bg = Color(0xFFE2EDFF)
    val Cat2 = Color(0xFF16756C)
    val Cat2Bg = Color(0xFFDCF0EC)
    val Cat3 = Color(0xFF6A48B0)
    val Cat3Bg = Color(0xFFECE6FA)
    val Cat4 = Color(0xFF56708D)
    val Cat4Bg = Color(0xFFE6ECF4)

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

    /** 카테고리 버튼 윗면 (빛 받는 쪽). 흰 글자 4.5:1 이상 */
    fun categoryTop(key: Int): Color = when (key) {
        1 -> Color(0xFF3A70C4)
        2 -> Color(0xFF1C8378)
        3 -> Color(0xFF7654BC)
        else -> Color(0xFF5E7895)
    }

    /** 밤 바탕 위의 카테고리 표시 (작은 색 조각). 8:1 이상 */
    fun categoryOnDark(key: Int): Color = when (key) {
        1 -> Color(0xFF8DB4F5)
        2 -> Color(0xFF6FCFBF)
        3 -> Color(0xFFB9A0EC)
        else -> Color(0xFFA3B7D2)
    }

    /** 도달 정도 이름표: 남색 계열이 아닌 슬레이트→흑연 5단계 (웹 ACH_COLORS와 같음) */
    val Achievement = listOf(Color(0xFFEEF2F7), Color(0xFFCBD5E1), Color(0xFF8E9DB0), Color(0xFF475569), Color(0xFF161B22))
}

private val LightColors = lightColorScheme(
    primary = NugaColors.Accent,
    onPrimary = Color.White,
    primaryContainer = NugaColors.AccentSoft,
    onPrimaryContainer = NugaColors.Accent,
    secondary = NugaColors.Text2,
    onSecondary = Color.White,
    secondaryContainer = NugaColors.Mute,
    onSecondaryContainer = NugaColors.Text,
    tertiary = NugaColors.Warn,
    tertiaryContainer = NugaColors.WarnSoft,
    onTertiaryContainer = NugaColors.Warn,
    // 틀은 밤, 그 위의 대화상자·입력칸은 종이
    background = NugaColors.Navy1,
    onBackground = NugaColors.Ink,
    surface = NugaColors.Surface,
    onSurface = NugaColors.Text,
    surfaceVariant = NugaColors.Paper,
    onSurfaceVariant = NugaColors.Text2,
    surfaceContainerLowest = NugaColors.Surface,
    surfaceContainerLow = NugaColors.Surface,
    surfaceContainer = NugaColors.Surface,
    surfaceContainerHigh = NugaColors.Surface,
    surfaceContainerHighest = NugaColors.Paper,
    inverseSurface = NugaColors.Navy3,
    inverseOnSurface = NugaColors.Ink,
    inversePrimary = NugaColors.Sky,
    outline = NugaColors.Field,
    outlineVariant = NugaColors.Hair2,
    scrim = NugaColors.Navy0,
    error = NugaColors.Warn,
    errorContainer = NugaColors.WarnSoft,
    onErrorContainer = NugaColors.Warn,
)

private val Sans = FontFamily.SansSerif

/** 시각·개수·번호: 자릿수가 맞는 숫자 */
fun TextStyle.tnum(): TextStyle = copy(fontFeatureSettings = "tnum")

/** 제목은 크고 촘촘하게(-0.03em 안팎), 본문은 거의 그대로. 300·800은 쓰지 않는다 */
private val NugaTypography = Typography(
    displaySmall = TextStyle(fontFamily = Sans, fontWeight = FontWeight(650), fontSize = 26.sp, lineHeight = 32.sp, letterSpacing = (-0.036).em),
    headlineSmall = TextStyle(fontFamily = Sans, fontWeight = FontWeight(650), fontSize = 19.sp, lineHeight = 26.sp, letterSpacing = (-0.028).em),
    titleLarge = TextStyle(fontFamily = Sans, fontWeight = FontWeight.Bold, fontSize = 21.sp, lineHeight = 28.sp, letterSpacing = (-0.03).em),
    titleMedium = TextStyle(fontFamily = Sans, fontWeight = FontWeight(650), fontSize = 16.sp, lineHeight = 22.sp, letterSpacing = (-0.02).em),
    titleSmall = TextStyle(fontFamily = Sans, fontWeight = FontWeight(650), fontSize = 14.5.sp, lineHeight = 20.sp, letterSpacing = (-0.02).em),
    bodyLarge = TextStyle(fontFamily = Sans, fontSize = 16.sp, lineHeight = 24.sp, letterSpacing = (-0.006).em),
    bodyMedium = TextStyle(fontFamily = Sans, fontSize = 14.sp, lineHeight = 21.sp, letterSpacing = (-0.006).em),
    bodySmall = TextStyle(fontFamily = Sans, fontWeight = FontWeight.Medium, fontSize = 12.5.sp, lineHeight = 18.sp, letterSpacing = (-0.006).em),
    labelLarge = TextStyle(fontFamily = Sans, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, lineHeight = 20.sp, letterSpacing = (-0.012).em),
    labelMedium = TextStyle(fontFamily = Sans, fontWeight = FontWeight.SemiBold, fontSize = 12.sp, lineHeight = 16.sp, letterSpacing = (-0.01).em),
    labelSmall = TextStyle(fontFamily = Sans, fontWeight = FontWeight.SemiBold, fontSize = 11.sp, lineHeight = 16.sp),
)

/** 건축적인 작은 둥글기: 입력칸 6 · 카드 12 · 대화상자 14 */
private val NugaShapes = Shapes(
    extraSmall = RoundedCornerShape(6.dp),
    small = RoundedCornerShape(6.dp),
    medium = RoundedCornerShape(10.dp),
    large = RoundedCornerShape(12.dp),
    extraLarge = RoundedCornerShape(14.dp),
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
