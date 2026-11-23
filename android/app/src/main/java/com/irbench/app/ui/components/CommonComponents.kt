package com.irbench.app.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.irbench.app.model.ButtonShape
import com.irbench.app.model.CapturedSignal
import com.irbench.app.model.RemoteButton
import com.irbench.app.model.RemotePreset
import com.irbench.app.ui.theme.LocalIRBenchColors

@Composable
fun IRBenchTopBar(
    eyebrow: String,
    title: String,
    showBack: Boolean = true,
    onBack: () -> Unit = {},
    ledConnected: Boolean? = null,
    rightActionLabel: String? = null,
    onRightAction: (() -> Unit)? = null
) {
    val c = LocalIRBenchColors.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 14.dp, bottom = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        if (showBack) {
            Box(
                modifier = Modifier
                    .size(38.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(c.panel)
                    .border(1.dp, c.line, RoundedCornerShape(12.dp))
                    .clickable(onClick = onBack),
                contentAlignment = Alignment.Center
            ) {
                Text("←", color = c.muted, fontSize = 16.sp)
            }
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = eyebrow.uppercase(),
                color = c.accent,
                fontFamily = FontFamily.Monospace,
                fontSize = 11.sp,
                letterSpacing = 1.4.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = title,
                color = c.text,
                fontSize = 22.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
        if (ledConnected != null) {
            Box(
                modifier = Modifier
                    .size(9.dp)
                    .clip(CircleShape)
                    .background(if (ledConnected) c.ok else Color(0xFF33443B))
            )
        }
        if (rightActionLabel != null && onRightAction != null) {
            Box(
                modifier = Modifier
                    .height(38.dp)
                    .defaultMinSize(minWidth = 38.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(c.panel)
                    .border(1.dp, c.line, RoundedCornerShape(12.dp))
                    .clickable(onClick = onRightAction)
                    .padding(horizontal = 10.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = rightActionLabel,
                    color = c.muted,
                    fontFamily = FontFamily.Monospace,
                    fontSize = 12.sp
                )
            }
        }
    }
}

@Composable
fun MenuCardItem(
    icon: String,
    title: String,
    subtitle: String,
    countText: String? = null,
    onClick: () -> Unit
) {
    val c = LocalIRBenchColors.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(c.panel)
            .border(1.dp, c.line, RoundedCornerShape(18.dp))
            .clickable(onClick = onClick)
            .padding(18.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Box(
            modifier = Modifier
                .size(46.dp)
                .clip(RoundedCornerShape(13.dp))
                .background(c.bg2)
                .border(1.dp, c.line, RoundedCornerShape(13.dp)),
            contentAlignment = Alignment.Center
        ) {
            Text(icon, color = c.text, fontSize = 18.sp)
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(title, color = c.text, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
            Spacer(modifier = Modifier.height(3.dp))
            Text(subtitle, color = c.muted, fontSize = 12.5.sp, lineHeight = 17.sp)
        }
        if (countText != null) {
            Text(
                text = countText,
                color = c.muted,
                fontFamily = FontFamily.Monospace,
                fontSize = 12.sp
            )
        }
    }
}

@Composable
fun RemoteGridCard(
    remote: RemotePreset,
    isLastOpened: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val c = LocalIRBenchColors.current
    val capCount = remote.buttons.count { it.captured }
    val borderColor = if (isLastOpened) c.accent.copy(alpha = 0.65f) else c.line

    Box(
        modifier = modifier
            .aspectRatio(3f / 4f)
            .clip(RoundedCornerShape(18.dp))
            .background(c.panel)
            .border(1.dp, borderColor, RoundedCornerShape(18.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 14.dp)
    ) {
        // Top IR lens notch centered
        Box(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .width(34.dp)
                .height(5.dp)
                .clip(RoundedCornerShape(3.dp))
                .background(c.bg2)
                .border(1.dp, c.line, RoundedCornerShape(3.dp))
        )

        // 6-dot emitter pattern top-right
        Column(
            modifier = Modifier.align(Alignment.TopEnd).padding(top = 4.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            repeat(2) {
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    repeat(3) {
                        Box(
                            modifier = Modifier
                                .size(4.5.dp)
                                .clip(CircleShape)
                                .background(c.muted.copy(alpha = 0.45f))
                        )
                    }
                }
            }
        }

        Column(
            modifier = Modifier.fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .padding(top = 12.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = remote.emoji.ifBlank { "📡" },
                    fontSize = 48.sp
                )
            }
            Text(
                text = remote.name,
                color = c.text,
                fontSize = 14.5.sp,
                fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = "$capCount/${remote.buttons.size} captured",
                color = c.muted,
                fontFamily = FontFamily.Monospace,
                fontSize = 11.sp,
                textAlign = TextAlign.Center
            )
        }
    }
}

@Composable
fun AddRemoteGridCard(onClick: () -> Unit, modifier: Modifier = Modifier) {
    val c = LocalIRBenchColors.current
    Box(
        modifier = modifier
            .aspectRatio(3f / 4f)
            .clip(RoundedCornerShape(18.dp))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            drawRoundRect(
                color = c.line,
                style = Stroke(
                    width = 3f,
                    pathEffect = PathEffect.dashPathEffect(floatArrayOf(16f, 12f), 0f)
                ),
                cornerRadius = androidx.compose.ui.geometry.CornerRadius(18.dp.toPx())
            )
        }
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(50.dp)
                    .clip(CircleShape)
                    .background(c.accent),
                contentAlignment = Alignment.Center
            ) {
                Text("✎", color = Color(0xFF1A1006), fontSize = 20.sp, fontWeight = FontWeight.Bold)
            }
            Text("New remote", color = c.muted, fontFamily = FontFamily.Monospace, fontSize = 11.5.sp)
        }
    }
}

fun buttonCornerRadius(shape: ButtonShape, w: Int, h: Int): Dp = when (shape) {
    ButtonShape.circle -> (maxOf(w, h) / 2).dp
    ButtonShape.pill -> 999.dp
    ButtonShape.bar -> 9.dp
    ButtonShape.square -> maxOf(10f, minOf(w, h) * 0.18f).dp
}

@Composable
fun RunShapeButton(
    btn: RemoteButton,
    isFlashing: Boolean,
    onClick: () -> Unit
) {
    val c = LocalIRBenchColors.current
    val radius = buttonCornerRadius(btn.shape, btn.w, btn.h)
    val borderCol = if (isFlashing) c.accent else c.line
    val alpha = if (btn.captured) 1f else 0.4f

    Box(
        modifier = Modifier
            .width(btn.w.dp)
            .height(btn.h.dp)
            .clip(RoundedCornerShape(radius))
            .background(if (isFlashing) c.panelHi else c.panel)
            .border(1.5.dp, borderCol, RoundedCornerShape(radius))
            .clickable(onClick = onClick)
            .padding(4.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            if (!btn.emoji.isNullOrBlank()) {
                Text(btn.emoji, fontSize = 13.sp, color = c.text.copy(alpha = alpha))
            }
            Text(
                text = btn.label,
                color = c.text.copy(alpha = alpha),
                fontSize = 10.5.sp,
                fontWeight = FontWeight.Medium,
                textAlign = TextAlign.Center,
                maxLines = 2,
                lineHeight = 12.sp
            )
        }
    }
}

@Composable
fun BuilderShapeButton(
    btn: RemoteButton,
    isSelected: Boolean,
    onTap: () -> Unit,
    onHoldCapture: () -> Unit
) {
    val c = LocalIRBenchColors.current
    val radius = buttonCornerRadius(btn.shape, btn.w, btn.h)
    val borderCol = when {
        isSelected -> c.accent
        btn.captured -> c.ok
        else -> c.line
    }

    Box(
        modifier = Modifier
            .width(btn.w.dp)
            .height(btn.h.dp)
            .clip(RoundedCornerShape(radius))
            .background(c.panel)
            .border(if (isSelected) 2.dp else 1.5.dp, borderCol, RoundedCornerShape(radius))
            .pointerInput(btn.id) {
                detectTapGestures(
                    onTap = { onTap() },
                    onLongPress = { onHoldCapture() }
                )
            }
            .padding(4.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = btn.label,
                color = c.text,
                fontSize = 10.5.sp,
                fontWeight = FontWeight.Medium,
                textAlign = TextAlign.Center,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = if (btn.captured) "● cap" else "○ hold",
                color = if (btn.captured) c.ok else c.muted,
                fontFamily = FontFamily.Monospace,
                fontSize = 8.5.sp
            )
        }
    }
}

@Composable
fun BenchTextField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String = "",
    monospace: Boolean = false,
    singleLine: Boolean = true,
    minLines: Int = 1,
    modifier: Modifier = Modifier
) {
    val c = LocalIRBenchColors.current
    Column(modifier = modifier) {
        Text(
            text = label.uppercase(),
            color = c.muted,
            fontFamily = FontFamily.Monospace,
            fontSize = 10.5.sp,
            letterSpacing = 0.8.sp
        )
        Spacer(modifier = Modifier.height(6.dp))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(c.panel)
                .border(1.dp, c.line, RoundedCornerShape(12.dp))
                .padding(horizontal = 14.dp, vertical = 12.dp)
        ) {
            if (value.isEmpty() && placeholder.isNotEmpty()) {
                Text(
                    text = placeholder,
                    color = c.muted.copy(alpha = 0.6f),
                    fontFamily = if (monospace) FontFamily.Monospace else FontFamily.Default,
                    fontSize = 14.sp
                )
            }
            BasicTextField(
                value = value,
                onValueChange = onValueChange,
                singleLine = singleLine,
                minLines = minLines,
                cursorBrush = SolidColor(c.accent),
                textStyle = TextStyle(
                    color = c.text,
                    fontSize = if (monospace) 12.5.sp else 14.5.sp,
                    fontFamily = if (monospace) FontFamily.Monospace else FontFamily.Default
                ),
                modifier = Modifier.fillMaxWidth()
            )
        }
    }
}

@Composable
fun BenchPrimaryButton(
    text: String,
    enabled: Boolean = true,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val c = LocalIRBenchColors.current
    Button(
        onClick = onClick,
        enabled = enabled,
        shape = RoundedCornerShape(12.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = c.accent,
            contentColor = Color(0xFF1A1006),
            disabledContainerColor = c.accent.copy(alpha = 0.35f)
        ),
        modifier = modifier.height(44.dp)
    ) {
        Text(text, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp)
    }
}

@Composable
fun BenchGhostButton(
    text: String,
    accentText: Boolean = false,
    dangerText: Boolean = false,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val c = LocalIRBenchColors.current
    val col = when {
        dangerText -> c.danger
        accentText -> c.accent
        else -> c.muted
    }
    OutlinedButton(
        onClick = onClick,
        shape = RoundedCornerShape(12.dp),
        border = BorderStroke(1.dp, if (dangerText) c.danger.copy(alpha = 0.4f) else c.line),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = col),
        modifier = modifier.height(44.dp)
    ) {
        Text(text, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
fun CaptureModalDialog(
    buttonLabel: String,
    isListening: Boolean,
    captured: CapturedSignal?,
    isSimulator: Boolean,
    onSimulateBurst: () -> Unit,
    onClose: () -> Unit,
    onDone: () -> Unit
) {
    val c = LocalIRBenchColors.current
    val transition = rememberInfiniteTransition(label = "pulse")
    val pulseScale by transition.animateFloat(
        initialValue = 0.75f,
        targetValue = 1.35f,
        animationSpec = infiniteRepeatable(
            animation = tween(1300, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "scale"
    )

    Dialog(onDismissRequest = onClose) {
        Surface(
            shape = RoundedCornerShape(22.dp),
            color = c.panel,
            border = BorderStroke(1.dp, c.line)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Box(modifier = Modifier.size(96.dp), contentAlignment = Alignment.Center) {
                    Canvas(modifier = Modifier.fillMaxSize()) {
                        drawCircle(color = c.line, style = Stroke(width = 4f))
                        if (isListening) {
                            drawCircle(
                                color = c.accent.copy(alpha = (1.4f - pulseScale).coerceIn(0f, 0.9f)),
                                radius = (size.minDimension / 2f) * pulseScale,
                                style = Stroke(width = 4f)
                            )
                        } else {
                            drawCircle(color = c.ok, style = Stroke(width = 5f))
                        }
                    }
                    Box(
                        modifier = Modifier
                            .size(14.dp)
                            .clip(CircleShape)
                            .background(if (isListening) c.accent else c.ok)
                    )
                }

                Spacer(modifier = Modifier.height(16.dp))
                Text(buttonLabel, color = c.text, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = if (isListening || captured == null) {
                        "Point the remote at the ESP32 IR receiver and press the button now."
                    } else {
                        "${captured.protocol.displayName} · ${captured.codeHex} · ${captured.pulseCount} pulses (${captured.jitterUs} us)"
                    },
                    color = c.muted,
                    fontSize = 13.sp,
                    textAlign = TextAlign.Center
                )
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = if (isListening) "LISTENING…" else "CAPTURED",
                    color = if (isListening) c.accent else c.ok,
                    fontFamily = FontFamily.Monospace,
                    fontSize = 11.5.sp,
                    letterSpacing = 1.1.sp
                )

                if (isListening && isSimulator) {
                    Spacer(modifier = Modifier.height(14.dp))
                    BenchGhostButton(
                        text = "Simulate Remote Press",
                        accentText = true,
                        onClick = onSimulateBurst,
                        modifier = Modifier.fillMaxWidth()
                    )
                }

                Spacer(modifier = Modifier.height(14.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    BenchGhostButton(
                        text = "Close",
                        onClick = onClose,
                        modifier = Modifier.weight(1f)
                    )
                    if (!isListening && captured != null) {
                        BenchPrimaryButton(
                            text = "Done",
                            onClick = onDone,
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
            }
        }
    }
}
