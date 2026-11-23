package com.irbench.app.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

@Immutable
data class IRBenchColors(
    val bg: Color,
    val bg2: Color,
    val panel: Color,
    val panelHi: Color,
    val line: Color,
    val text: Color,
    val muted: Color,
    val accent: Color,
    val accentDim: Color,
    val ok: Color,
    val okDim: Color,
    val danger: Color
)

val DarkIRBenchColors = IRBenchColors(
    bg = Color(0xFF0A0F0C),
    bg2 = Color(0xFF0E1512),
    panel = Color(0xFF121A16),
    panelHi = Color(0xFF182119),
    line = Color(0xFF22302A),
    text = Color(0xFFE9F1EC),
    muted = Color(0xFF7C9086),
    accent = Color(0xFFFF8A3D),
    accentDim = Color(0xFF5A3B23),
    ok = Color(0xFF57E39A),
    okDim = Color(0xFF1F4C39),
    danger = Color(0xFFFF5D6C)
)

val LightIRBenchColors = IRBenchColors(
    bg = Color(0xFFF3F6F4),
    bg2 = Color(0xFFE9EFEB),
    panel = Color(0xFFFFFFFF),
    panelHi = Color(0xFFF0F5F2),
    line = Color(0xFFD4DFD9),
    text = Color(0xFF111C16),
    muted = Color(0xFF5A7064),
    accent = Color(0xFFE86B1A),
    accentDim = Color(0xFFF5CDB2),
    ok = Color(0xFF129B58),
    okDim = Color(0xFFCCEEE0),
    danger = Color(0xFFD93648)
)

val LocalIRBenchColors = staticCompositionLocalOf { DarkIRBenchColors }

@Composable
fun IRBenchTheme(
    darkTheme: Boolean = true,
    content: @Composable () -> Unit
) {
    val palette = if (darkTheme) DarkIRBenchColors else LightIRBenchColors
    CompositionLocalProvider(LocalIRBenchColors provides palette) {
        content()
    }
}
