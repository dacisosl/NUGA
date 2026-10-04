package kr.nuga.app.ui.theme

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin

/*
 * 유리 효과 (blur 없이): 랜딩 히어로의 빛나는 유리 카드를 옮긴다.
 * 빛은 오른쪽 위 한 방향에서만 들어온다 — 테두리는 오른쪽 위가 가장 밝고, 아래로 푸른 빛이 번진다.
 * 번짐은 화면마다 하나(지금 수업 카드·켜진 탭·선택한 번호)에만 세게 준다.
 */

private val Clear = Color.Transparent

/** 원형 그라데이션을 세로로 눌러 타원으로 그린다 (CSS radial-gradient(rx ry at …)) */
private fun DrawScope.ellipse(brush: Brush, center: Offset, rx: Float, ry: Float) {
    if (rx <= 0f || ry <= 0f) return
    scale(scaleX = 1f, scaleY = ry / rx, pivot = center) {
        drawCircle(brush = brush, radius = rx, center = center)
    }
}

/** CSS linear-gradient(각도) 와 같은 시작·끝점 */
private fun angled(deg: Float, w: Float, h: Float): Pair<Offset, Offset> {
    val a = Math.toRadians(deg.toDouble())
    val dx = sin(a).toFloat()
    val dy = -cos(a).toFloat()
    val half = (abs(w * dx) + abs(h * dy)) / 2f
    val c = Offset(w / 2f, h / 2f)
    return Offset(c.x - dx * half, c.y - dy * half) to Offset(c.x + dx * half, c.y + dy * half)
}

/** 밤 장면 (웹 --shell-bg): 깊은 남색 + 오른쪽 아래 빛웅덩이 + 118° 빛줄기 + 오른쪽 위 바깥의 번짐 */
fun Modifier.nightScene(): Modifier = drawWithCache {
    val w = size.width
    val h = size.height
    val poolC = Offset(w * .72f, h * .80f)
    val poolRx = w * .72f * 1.414f
    val pool = Brush.radialGradient(0f to NugaColors.Pool, .58f to NugaColors.Navy1, center = poolC, radius = poolRx.coerceAtLeast(1f))
    val (bs, be) = angled(118f, w, h)
    val beam = Brush.linearGradient(.56f to Clear, .65f to NugaColors.Sky.copy(alpha = .05f), .74f to Clear, start = bs, end = be)
    val bloomC = Offset(w * .92f, -h * .12f)
    val bloomRx = w * .70f
    val bloom = Brush.radialGradient(
        0f to NugaColors.Bloom.copy(alpha = .32f),
        .36f to NugaColors.Bloom.copy(alpha = .12f),
        .56f to NugaColors.Bloom.copy(alpha = .03f),
        .70f to NugaColors.Bloom.copy(alpha = 0f),
        center = bloomC, radius = bloomRx.coerceAtLeast(1f),
    )
    onDrawBehind {
        drawRect(NugaColors.Navy1)
        ellipse(pool, poolC, poolRx, h * .80f * 1.414f)
        drawRect(beam)
        ellipse(bloom, bloomC, bloomRx, h * .55f)
    }
}

/** 빛 테두리 (웹 --edge-light): 오른쪽 위 흰빛 → 왼쪽 아래 옅은 하늘빛 */
private val EdgeLight = Brush.linearGradient(
    0f to Color.White.copy(alpha = .75f),
    .22f to NugaColors.Sky.copy(alpha = .26f),
    .56f to NugaColors.Sky.copy(alpha = .07f),
    1f to NugaColors.Sky.copy(alpha = .16f),
    start = Offset(Float.POSITIVE_INFINITY, 0f), end = Offset(0f, Float.POSITIVE_INFINITY),
)

/** 지금 수업 테두리 (웹 --edge-now): 하늘빛 → 파랑 → 사라짐 */
private val EdgeNow = Brush.linearGradient(
    0f to NugaColors.Sky,
    .32f to Color(0xFF4B7FD0),
    .72f to Color(0xFF4B7FD0).copy(alpha = .20f),
    1f to Color(0xFF4B7FD0).copy(alpha = .12f),
    start = Offset(Float.POSITIVE_INFINITY, 0f), end = Offset(0f, Float.POSITIVE_INFINITY),
)

/**
 * 빛나는 종이 카드: 1dp 빛 테두리(lit이면 1.5dp 하늘빛) + 우윳빛 면 + 오른쪽 위 흰 빛웅덩이 + 아래로 번지는 푸른 빛.
 * 밤 바탕 위에서만 쓴다. 안의 글자는 Text/Text2.
 */
fun Modifier.paperCard(lit: Boolean = false): Modifier {
    val rim = if (lit) 1.5.dp else 1.dp
    return this
        .drawWithCache {
            val w = size.width
            val h = size.height
            val c = Offset(w * .58f, h - 4.dp.toPx())
            val rx = w * .62f
            val ry = (if (lit) 34.dp else 20.dp).toPx()
            val under = Brush.radialGradient(
                0f to NugaColors.Bloom.copy(alpha = if (lit) .36f else .15f),
                .45f to NugaColors.Bloom.copy(alpha = if (lit) .13f else .05f),
                1f to Clear,
                center = c, radius = rx.coerceAtLeast(1f),
            )
            // lit: 빛이 닿는 오른쪽 위 모서리 바깥의 하늘빛 후광
            val haloC = Offset(w * .86f, 0f)
            val haloRx = w * .42f
            val halo = Brush.radialGradient(0f to NugaColors.Sky.copy(alpha = .20f), 1f to Clear, center = haloC, radius = haloRx.coerceAtLeast(1f))
            onDrawBehind {
                ellipse(under, c, rx, ry)
                if (lit) ellipse(halo, haloC, haloRx, 22.dp.toPx())
            }
        }
        .background(if (lit) EdgeNow else EdgeLight, RoundedCornerShape(12.dp))
        .padding(rim)
        .clip(RoundedCornerShape(12.dp - rim))
        .drawWithCache {
            val face = Brush.verticalGradient(listOf(NugaColors.PaperTop, NugaColors.PaperBottom))
            val pool = Brush.radialGradient(
                0f to Color.White.copy(alpha = .95f), 1f to Color.White.copy(alpha = 0f),
                center = Offset(size.width, 0f), radius = (size.width * .62f).coerceAtLeast(1f),
            )
            onDrawBehind {
                drawRect(face)
                drawRect(pool)
            }
        }
}

/** 버튼 한 벌: 윗면 → 아랫면 그라데이션, 1dp 테두리, 위쪽 반사광, 아래 번짐 */
@Immutable
class ButtonTone(
    val top: Color,
    val bottom: Color,
    val edge: Color,
    val content: Color,
    val glow: Color? = null,
    val sheen: Float = .22f,
    /** 꺼졌을 때 밤 바탕용 모양 */
    val onDark: Boolean = false,
) {
    companion object {
        /** 종이 위 주 버튼: 행동 파랑 (화면마다 하나) */
        val Primary = ButtonTone(NugaColors.AccentTop, NugaColors.Accent, NugaColors.AccentEdge, Color.White, glow = NugaColors.Accent)
        /** 종이 위 보조 버튼: 흰 바탕 + 잉크 테두리 */
        val Secondary = ButtonTone(Color.White, Color(0xFFF7FAFE), NugaColors.Hair3, NugaColors.Text, sheen = 0f)
        /** 녹음 시작·중단 */
        val Record = ButtonTone(NugaColors.RecTop, NugaColors.Rec, Color(0xFFA82020), Color.White, glow = NugaColors.Rec)

        /** 카테고리 색 버튼 (흰 글자) */
        fun category(key: Int, onDark: Boolean = false) = ButtonTone(
            NugaColors.categoryTop(key), NugaColors.category(key),
            if (onDark) Color.White.copy(alpha = .30f) else NugaColors.category(key),
            Color.White, glow = NugaColors.category(key), sheen = .26f, onDark = onDark,
        )
    }
}

/** 공통 버튼. 보이는 높이 44dp 이상, 누르는 영역 48dp 이상 */
@Composable
fun NugaButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    tone: ButtonTone = ButtonTone.Primary,
    enabled: Boolean = true,
    height: Dp = 44.dp,
    radius: Dp = 6.dp,
    fontSize: TextUnit = 14.5.sp,
    content: @Composable RowScope.() -> Unit,
) {
    val shape = RoundedCornerShape(radius)
    val fill = when {
        enabled -> Brush.verticalGradient(listOf(tone.top, tone.bottom))
        tone.onDark -> Brush.verticalGradient(listOf(NugaColors.Sky.copy(alpha = .09f), NugaColors.Sky.copy(alpha = .04f)))
        else -> Brush.verticalGradient(listOf(Color(0xFFE9EEF5), Color(0xFFE2E8F0)))
    }
    val edge = when {
        enabled -> tone.edge
        tone.onDark -> NugaColors.DLine2
        else -> NugaColors.Hair2
    }
    val fg = when {
        enabled -> tone.content
        tone.onDark -> NugaColors.Ink3
        else -> NugaColors.Text3
    }
    val glow = tone.glow.takeIf { enabled }
    Row(
        modifier = modifier
            .minimumInteractiveComponentSize()
            .heightIn(min = height)
            .drawWithCache {
                val c = Offset(size.width / 2f, size.height)
                val rx = size.width * .5f
                val brush = glow?.let { Brush.radialGradient(0f to it.copy(alpha = .38f), 1f to Clear, center = c, radius = rx.coerceAtLeast(1f)) }
                onDrawBehind { if (brush != null) ellipse(brush, c, rx, 9.dp.toPx()) }
            }
            .clip(shape)
            .background(fill)
            .border(1.dp, edge, shape)
            .drawWithCache {
                // 윗면 반사광: 오른쪽이 더 밝다
                val line = Brush.horizontalGradient(0f to Clear, .55f to Color.White.copy(alpha = tone.sheen * .6f), .9f to Color.White.copy(alpha = tone.sheen), 1f to Clear)
                onDrawBehind {
                    if (enabled && tone.sheen > 0f) drawRect(line, topLeft = Offset(0f, 1.dp.toPx()), size = Size(size.width, 1.dp.toPx()))
                }
            }
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CompositionLocalProvider(
            LocalContentColor provides fg,
            LocalTextStyle provides LocalTextStyle.current.copy(fontSize = fontSize, fontWeight = FontWeight(650), letterSpacing = (-0.015).em),
        ) { content() }
    }
}

/**
 * 밤 바탕 위의 고르기 칩 (필터·반·카테고리).
 * 꺼짐: 옅은 유리 + 1dp 하늘빛 선. 켜짐: 채움 (기본은 랜딩 주 버튼 #DEEBFF, 카테고리는 그 색).
 */
@Composable
fun NightChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    swatch: Color? = null,
    selectedTone: ButtonTone? = null,
    height: Dp = 36.dp,
    fontSize: TextUnit = 13.5.sp,
    role: Role = Role.Checkbox,
) {
    val shape = RoundedCornerShape(6.dp)
    val tone = selectedTone ?: ButtonTone(NugaColors.BtnLt, Color(0xFFD3E3FC), NugaColors.BtnLt, NugaColors.BtnLtInk, glow = NugaColors.Bloom, sheen = .9f)
    Row(
        modifier = modifier
            .minimumInteractiveComponentSize()
            .heightIn(min = height)
            .drawWithCache {
                val c = Offset(size.width / 2f, size.height)
                val rx = size.width * .55f
                val brush = tone.glow?.let { Brush.radialGradient(0f to it.copy(alpha = .40f), 1f to Clear, center = c, radius = rx.coerceAtLeast(1f)) }
                onDrawBehind { if (selected && brush != null) ellipse(brush, c, rx, 10.dp.toPx()) }
            }
            .clip(shape)
            .background(
                if (selected) Brush.verticalGradient(listOf(tone.top, tone.bottom))
                else Brush.verticalGradient(listOf(NugaColors.Sky.copy(alpha = .09f), NugaColors.Sky.copy(alpha = .035f))),
            )
            .border(1.dp, if (selected) Color.White.copy(alpha = .32f) else NugaColors.DLine2, shape)
            .selectable(selected = selected, role = role, onClick = onClick)
            .padding(horizontal = 13.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (swatch != null) {
            Box(
                Modifier
                    .size(7.dp)
                    .background(if (selected) tone.content.copy(alpha = .92f) else swatch, RoundedCornerShape(2.dp)),
            )
            Spacer(Modifier.width(7.dp))
        }
        Text(
            text = label,
            color = if (selected) tone.content else NugaColors.Ink2,
            fontSize = fontSize,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.SemiBold,
            letterSpacing = (-0.015).em,
            maxLines = 1,
        )
    }
}

/** 머리 띠: 랜딩의 '01 ——' 쪽 번호 + 크고 촘촘한 하늘빛 제목. 오른쪽에 숫자 하나 */
@Composable
fun ScreenHeader(
    index: String,
    title: String,
    modifier: Modifier = Modifier,
    trailing: (@Composable RowScope.() -> Unit)? = null,
) {
    Column(modifier.fillMaxWidth().padding(top = 14.dp, bottom = 4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(index, color = NugaColors.Ink3, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, letterSpacing = .12.em)
            Spacer(Modifier.width(10.dp))
            Box(Modifier.width(22.dp).height(1.dp).background(NugaColors.DLine3))
        }
        Spacer(Modifier.height(6.dp))
        Row(verticalAlignment = Alignment.Bottom) {
            Text(
                title,
                style = MaterialTheme.typography.displaySmall,
                color = NugaColors.InkDisplay,
                maxLines = 1,
                modifier = Modifier.weight(1f),
            )
            trailing?.invoke(this)
        }
    }
}

/** 밤 위 구역 제목: 랜딩 eyebrow (짧은 선 + 글자) */
@Composable
fun Eyebrow(text: String, modifier: Modifier = Modifier) {
    Row(modifier.padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.width(18.dp).height(1.dp).background(NugaColors.Ink2.copy(alpha = .7f)))
        Spacer(Modifier.width(10.dp))
        Text(text, color = NugaColors.Ink2, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold, letterSpacing = .02.em)
    }
}
