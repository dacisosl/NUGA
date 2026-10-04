package kr.nuga.wear.ui

import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.isSpecified
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Colors
import androidx.wear.compose.material.LocalContentAlpha
import androidx.wear.compose.material.LocalContentColor
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.TimeText
import androidx.wear.compose.material.TimeTextDefaults
import kotlin.math.max

/*
 * Watch theme — the approved redesign "밤의 틀 · 빛나는 종이 · 밤의 계단" (Night Shell · Luminous Paper · Night Stairs).
 *
 * A watch is always night, so it uses only the NIGHT half of the spec: the landing hero's deep navy, a single light
 * source at the upper right (blue bloom), luminous glass slabs whose hairline rim is brightest at the top-right where
 * the light hits, sky accent, tight bold Korean headlines, small radii, and one warm amber that is reserved for
 * warnings and backlog (대기). Hex values are the spec's :root tokens; keep them identical to the phone and web.
 */

/** Spec tokens (night). */
object WatchColors {
    // Night ground (--navy-*, --pool)
    val Navy0 = Color(0xFF060F1A)
    val Navy1 = Color(0xFF081422)          // window
    val Navy2 = Color(0xFF0D1C2E)
    val Navy3 = Color(0xFF112338)          // --glass-dk-solid
    val Pool = Color(0xFF142C49)           // light pool, lower right

    // Ink on night: never pure white for text
    val Ink = Color(0xFFEAF2FF)            // 16.45:1 on Navy1
    val InkDisplay = Color(0xFFDCE9FC)     // headlines
    val InkNum = Color(0xFFD6E6FD)         // big numerals (KPI)
    val Ink2 = Color(0xFFA3B7D2)           // 9.05:1
    val Ink3 = Color(0xFF7F95B2)           // 6.04:1, smallest readable dark text (>=12sp, >=Medium)
    val Ink4 = Color(0xFF5B6E86)           // non-text only

    // Light
    val Sky = Color(0xFFACCDFF)            // accent
    val Glow = Color(0xFF7DA6DF)           // --glow-rgb
    val Bloom = Color(0xFF5495FD)          // --bloom-rgb, hero electric edge
    val SpecWarm = Color(0xFFFFF5DB)       // warm specular at the nosing end
    val Hair = Color(0xFFABC9F1)           // --dline base: use at .12 / .22 / .34
    val Btn2Line = Color(0xFF52719A)       // secondary button line on night
    val Btn2LineHover = Color(0xFF6F8DB3)
    val Btn2Ink = Color(0xFFC6DCFC)        // secondary button text, 13.27:1

    // The only warm hue on night: warnings and backlog
    val Amber = Color(0xFFFFB27A)
    val AmberInk = Color(0xFFFFC9A8)       // 12.5:1
    val Warm = Color(0xFFFFB280)           // --warm-rgb
    val OkLed = Color(0xFF6FD3A8)

    // Category marks 질문·발표·협동·기타 = spec c1–c4 lifted for a dark ground (the stair hover-card swatches)
    val Cat1 = Color(0xFF86B2F2)           // c1 #2F63B8 lifted, 8.5:1 on Navy1
    val Cat2 = Color(0xFF4FB8A6)           // c2 #16756C lifted, 7.7:1
    val Cat3 = Color(0xFFA58BEA)           // c3 #6A48B0 lifted, 6.6:1
    val Cat4 = Color(0xFFA3B7D2)           // c4 #56708D lifted (= Ink2)

    fun category(key: Int): Color = when (key) {
        1 -> Cat1
        2 -> Cat2
        3 -> Cat3
        else -> Cat4
    }
}

/** Small, architectural radii (--r-paper / --r-stage 12px). Discs stay round. */
object WatchShapes {
    val Slab = RoundedCornerShape(12.dp)
    val Swatch = RoundedCornerShape(2.dp)
}

/** Type: tight bold Korean headlines, tabular numerals, >=12sp/Medium for any text on night. */
object WatchType {
    private const val TNUM = "tnum"

    /** Lesson / status headline. */
    val Headline = TextStyle(
        color = WatchColors.InkDisplay, fontSize = 17.sp, lineHeight = 21.sp,
        fontWeight = FontWeight.Bold, letterSpacing = (-0.02).em,
    )

    /** Saved-record headline ("2-5 · 7번"). */
    val Title = TextStyle(
        color = WatchColors.InkDisplay, fontSize = 22.sp, lineHeight = 26.sp,
        fontWeight = FontWeight.Bold, letterSpacing = (-0.03).em, fontFeatureSettings = TNUM,
    )

    /** Secondary line on night. */
    val Meta = TextStyle(
        color = WatchColors.Ink2, fontSize = 12.sp, lineHeight = 16.sp,
        fontWeight = FontWeight.Medium, fontFeatureSettings = TNUM,
    )

    /** Category tile label; colour comes from the glass. */
    val Tile = TextStyle(fontSize = 17.sp, lineHeight = 20.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.02).em)

    /** Button label; colour comes from the glass. */
    val Button = TextStyle(
        fontSize = 14.sp, lineHeight = 18.sp, fontWeight = FontWeight.SemiBold,
        letterSpacing = (-0.012).em, fontFeatureSettings = TNUM,
    )

    /** Reel numeral, KPI scale and tracking. */
    val Numeral = TextStyle(
        color = WatchColors.InkNum, fontSize = 64.sp, fontWeight = FontWeight.Bold,
        letterSpacing = (-0.045).em, fontFeatureSettings = TNUM,
    )
}

/**
 * --edge-light: one light source at the upper right, so a hairline rim is brightest at the top-right corner,
 * dims across the middle and picks up a little again at the bottom-left.
 */
fun rimBrush(
    hue: Color,
    light: Color = Color.White.copy(alpha = 0.72f),
    mid: Float = 0.60f,
    low: Float = 0.16f,
    end: Float = 0.34f,
): Brush = Brush.linearGradient(
    0f to light,
    0.22f to hue.copy(alpha = mid),
    0.56f to hue.copy(alpha = low),
    1f to hue.copy(alpha = end),
    start = Offset(Float.POSITIVE_INFINITY, 0f),
    end = Offset(0f, Float.POSITIVE_INFINITY),
)

/**
 * Luminous glass (Compose has no backdrop blur, so glass is emulated): an OPAQUE vertical gradient pre-composited on
 * the night (so the shadow never shows through the face), a lit top sheen, a 1dp inset top highlight, a 1dp rim
 * brightest at the top-right, and an optional coloured glow from Modifier.shadow(ambientColor, spotColor).
 */
@Immutable
class Glass(
    top: Color,
    bottom: Color,
    val rim: Brush,
    /** Glow colour under the slab; Color.Unspecified = no glow. */
    val glow: Color,
    /** Text and icon colour on the face. */
    val content: Color,
    sheenAlpha: Float,
) {
    val body: Brush = Brush.verticalGradient(listOf(top, bottom))
    val sheen: Brush = Brush.verticalGradient(
        0f to Color.White.copy(alpha = sheenAlpha),
        0.45f to Color.White.copy(alpha = 0f),
    )
}

object Glasses {
    // Category glass: top ≈ spec cN lifted one step, bottom ≈ cN sunk into the navy. Ink text >= 4:1 at the very top,
    // >= 5:1 at mid-height where the label sits; the rim and glow use the lifted mark colour.
    private fun categoryGlass(top: Long, bottom: Long, mark: Color) = Glass(
        top = Color(top),
        bottom = Color(bottom),
        rim = rimBrush(mark),
        glow = mark,
        content = WatchColors.Ink,
        sheenAlpha = 0.16f,
    )

    private val C1 = categoryGlass(0xFF3A6FC6, 0xFF1E427E, WatchColors.Cat1)
    private val C2 = categoryGlass(0xFF1C8378, 0xFF0E4E48, WatchColors.Cat2)
    private val C3 = categoryGlass(0xFF7654C0, 0xFF432D78, WatchColors.Cat3)
    private val C4 = categoryGlass(0xFF56708D, 0xFF33455C, WatchColors.Cat4)

    fun category(key: Int): Glass = when (key) {
        1 -> C1
        2 -> C2
        3 -> C3
        else -> C4
    }

    /** Landing secondary on night: sky tint .10 → .04 over navy, #52719A-family rim, #C6DCFC text. No glow. */
    val Secondary = Glass(
        top = Color(0xFF1D2E43),
        bottom = Color(0xFF122236),
        rim = rimBrush(WatchColors.Btn2LineHover, light = WatchColors.Ink.copy(alpha = 0.62f), mid = 0.95f, low = 0.55f, end = 0.75f),
        glow = Color.Unspecified,
        content = WatchColors.Btn2Ink,
        sheenAlpha = 0.07f,
    )

    /** Warning / backlog: warm tint .10 → .05 over navy, amber rim with a warm specular, amber-ink text. No glow. */
    val Warn = Glass(
        top = Color(0xFF262B35),
        bottom = Color(0xFF1A2433),
        rim = rimBrush(WatchColors.Warm, light = WatchColors.SpecWarm.copy(alpha = 0.75f), mid = 0.62f, low = 0.34f, end = 0.48f),
        glow = Color.Unspecified,
        content = WatchColors.AmberInk,
        sheenAlpha = 0.06f,
    )

    /** Rim for a lit (checked) sky surface. */
    val SkyRim: Brush = rimBrush(WatchColors.Sky, mid = 0.55f, low = 0.16f, end = 0.30f)
}

/** Paints a glass face. Put it before clickable so the ripple is clipped to the shape. */
fun Modifier.glass(glass: Glass, shape: Shape, glow: Dp = 0.dp, pressed: Boolean = false): Modifier {
    val lifted = if (glow > 0.dp && glass.glow.isSpecified) {
        this.shadow(elevation = glow, shape = shape, clip = false, ambientColor = glass.glow, spotColor = glass.glow)
    } else {
        this
    }
    return lifted
        .clip(shape)
        .background(glass.body)
        .drawBehind {
            drawRect(glass.sheen)                                                              // lit top face
            drawRect(Color.White.copy(alpha = 0.34f), size = Size(size.width, 1.dp.toPx()))   // inset top highlight
            if (pressed) drawRect(Color.White.copy(alpha = 0.10f))
        }
        .border(1.dp, glass.rim, shape)
}

/** A luminous glass button. Text and icons inside take the glass content colour. */
@Composable
fun GlassButton(
    onClick: () -> Unit,
    glass: Glass,
    modifier: Modifier = Modifier,
    shape: Shape = WatchShapes.Slab,
    glow: Dp = 0.dp,
    content: @Composable BoxScope.() -> Unit,
) {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    Box(
        modifier = modifier
            .glass(glass, shape, glow, pressed)
            .clickable(interactionSource = source, indication = LocalIndication.current, role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        val scope = this
        CompositionLocalProvider(LocalContentColor provides glass.content, LocalContentAlpha provides 1f) {
            scope.content()
        }
    }
}

/**
 * The hero's night, painted once behind a screen (it does not scroll): navy #081422 with the #142C49 light pool at the
 * lower right, a faint 118° light beam crossing the face, and the blue bloom from the upper right (--stage-bg).
 */
fun Modifier.nightSky(): Modifier = drawWithCache {
    val w = size.width
    val h = size.height
    val d = max(max(w, h), 1f)
    val pool = Brush.radialGradient(
        0f to WatchColors.Pool,
        0.58f to WatchColors.Navy1,
        center = Offset(w * 0.72f, h * 0.80f),
        radius = d * 1.07f,
    )
    val dir = Offset(0.883f, 0.469f)                    // CSS 118deg
    val half = (w * 0.883f + h * 0.469f) / 2f
    val mid = Offset(w / 2f, h / 2f)
    val clear = WatchColors.Sky.copy(alpha = 0f)
    val beam = Brush.linearGradient(
        0.52f to clear,
        0.60f to WatchColors.Sky.copy(alpha = 0.05f),
        0.68f to clear,
        start = mid - dir * half,
        end = mid + dir * half,
    )
    val bloom = Brush.radialGradient(
        0f to WatchColors.Bloom.copy(alpha = 0.28f),
        0.34f to WatchColors.Bloom.copy(alpha = 0.11f),
        0.58f to WatchColors.Bloom.copy(alpha = 0.03f),
        0.70f to WatchColors.Bloom.copy(alpha = 0f),
        center = Offset(w * 0.90f, h * -0.04f),
        radius = d * 0.62f,
    )
    onDrawBehind {
        drawRect(pool)
        drawRect(beam)
        drawRect(bloom)
    }
}

/** A small LED with a soft halo (sync LED, live lesson dot). */
@Composable
fun StatusDot(color: Color, modifier: Modifier = Modifier) {
    Box(
        modifier.size(14.dp).drawBehind {
            drawCircle(color.copy(alpha = 0.18f))
            drawCircle(color, radius = 3.5.dp.toPx())
        },
    )
}

/** 1dp night hairline that fades at both ends (--dline-2). */
@Composable
fun NightRule(modifier: Modifier = Modifier) {
    Box(
        modifier.height(1.dp).background(
            Brush.horizontalGradient(
                0f to WatchColors.Hair.copy(alpha = 0f),
                0.15f to WatchColors.Hair.copy(alpha = 0.22f),
                0.85f to WatchColors.Hair.copy(alpha = 0.22f),
                1f to WatchColors.Hair.copy(alpha = 0f),
            ),
        ),
    )
}

/** Time at the top in quiet ink, tabular figures. */
@Composable
fun NightTimeText() {
    TimeText(
        timeTextStyle = TimeTextDefaults.timeTextStyle(color = WatchColors.Ink2)
            .copy(fontWeight = FontWeight.Medium, fontFeatureSettings = "tnum"),
    )
}

/** Round-screen safe inset: a share of the display, not fixed dp, so slab corners clear the bezel on 192–240dp faces. */
@Composable
fun roundInset(fraction: Float, square: Dp): Dp {
    val config = LocalConfiguration.current
    return if (config.isScreenRound) (config.screenWidthDp * fraction).dp else square
}

private val WatchPalette = Colors(
    primary = WatchColors.Sky,
    primaryVariant = WatchColors.Glow,
    secondary = WatchColors.Sky,
    secondaryVariant = WatchColors.Glow,
    background = WatchColors.Navy1,
    surface = WatchColors.Navy3,
    error = WatchColors.Amber,
    onPrimary = WatchColors.Navy1,
    onSecondary = WatchColors.Navy1,
    onBackground = WatchColors.Ink,
    onSurface = WatchColors.Ink,
    onSurfaceVariant = WatchColors.Ink2,
    onError = WatchColors.Navy1,
)

@Composable
fun WatchTheme(content: @Composable () -> Unit) {
    MaterialTheme(colors = WatchPalette, content = content)
}
