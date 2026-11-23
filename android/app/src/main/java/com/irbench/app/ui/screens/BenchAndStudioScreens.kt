package com.irbench.app.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.irbench.app.data.IrFileFormat
import com.irbench.app.data.Presets
import com.irbench.app.model.DeviceConfig
import com.irbench.app.model.RemotePreset
import com.irbench.app.model.TelemetryRecord
import com.irbench.app.model.TelemetryStats
import com.irbench.app.ui.components.BenchGhostButton
import com.irbench.app.ui.components.BenchPrimaryButton
import com.irbench.app.ui.components.BenchTextField
import com.irbench.app.ui.theme.LocalIRBenchColors

@Composable
fun WifiConfigScreen(
    config: DeviceConfig,
    onUpdateConfig: (DeviceConfig) -> Unit,
    onApplyAndProbe: (String) -> Unit
) {
    val c = LocalIRBenchColors.current
    var ipInput by remember(config.esp32Host) { mutableStateOf(config.esp32Host) }

    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(c.panel)
                .border(1.dp, c.line, RoundedCornerShape(16.dp))
                .padding(14.dp)
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    "CONNECTION TARGET",
                    color = c.muted,
                    fontFamily = FontFamily.Monospace,
                    fontSize = 10.5.sp
                )
                val targets = buildList {
                    add("simulator" to "Simulator")
                    add("esp32-lan" to "ESP32 Wi-Fi")
                    if (config.phoneHasIrBlaster) add("phone-ir" to "Phone IR")
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    targets.forEach { (id, label) ->
                        val selected = config.target == id
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(12.dp))
                                .background(if (selected) c.accent.copy(alpha = 0.1f) else c.bg2)
                                .border(1.dp, if (selected) c.accent else c.line, RoundedCornerShape(12.dp))
                                .clickable { onUpdateConfig(config.copy(target = id)) }
                                .padding(vertical = 11.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = label,
                                color = if (selected) c.text else c.muted,
                                fontSize = 12.5.sp,
                                fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal
                            )
                        }
                    }
                }

                BenchTextField(
                    label = "ESP32 IP / Hostname",
                    value = ipInput,
                    onValueChange = { ipInput = it },
                    placeholder = "http://192.168.4.1",
                    monospace = true
                )

                BenchPrimaryButton(
                    text = "Apply & Probe",
                    onClick = { onApplyAndProbe(ipInput) },
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(c.panel)
                .border(1.dp, c.line, RoundedCornerShape(16.dp))
                .padding(14.dp)
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    "COMMAND TRANSPORT CODEC",
                    color = c.muted,
                    fontFamily = FontFamily.Monospace,
                    fontSize = 10.5.sp
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("binary" to "8B Binary", "json" to "Legacy JSON").forEach { (id, label) ->
                        val selected = config.codec == id
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(12.dp))
                                .background(if (selected) c.accent.copy(alpha = 0.1f) else c.bg2)
                                .border(1.dp, if (selected) c.accent else c.line, RoundedCornerShape(12.dp))
                                .clickable { onUpdateConfig(config.copy(codec = id)) }
                                .padding(vertical = 11.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(label, color = if (selected) c.text else c.muted, fontSize = 12.5.sp)
                        }
                    }
                }

                Text(
                    "ESP32 WI-FI POWER SAVE",
                    color = c.muted,
                    fontFamily = FontFamily.Monospace,
                    fontSize = 10.5.sp
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("WIFI_PS_NONE" to "WIFI_PS_NONE", "WIFI_PS_MIN_MODEM" to "PS_MIN_MODEM").forEach { (id, label) ->
                        val selected = config.wifiPowerSave == id
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(12.dp))
                                .background(if (selected) c.accent.copy(alpha = 0.1f) else c.bg2)
                                .border(1.dp, if (selected) c.accent else c.line, RoundedCornerShape(12.dp))
                                .clickable { onUpdateConfig(config.copy(wifiPowerSave = id)) }
                                .padding(vertical = 11.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(label, color = if (selected) c.text else c.muted, fontSize = 12.sp)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun TimingLogsScreen(
    logs: List<TelemetryRecord>,
    stats: TelemetryStats,
    soakRunning: Boolean,
    soakProgress: Int,
    soakCount: Int,
    onRunSoak: () -> Unit,
    onClearLogs: () -> Unit,
    onExportCsv: () -> Unit,
    onExportJson: () -> Unit
) {
    val c = LocalIRBenchColors.current
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(c.panel)
                .border(1.dp, c.line, RoundedCornerShape(16.dp))
                .padding(14.dp)
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    "LATENCY & PACKET BENCHMARK",
                    color = c.muted,
                    fontFamily = FontFamily.Monospace,
                    fontSize = 10.5.sp
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    StatCell("MEAN RTT", String.format("%.2f ms", stats.meanMs), c.text, Modifier.weight(1f))
                    StatCell("P95 / P99", String.format("%.1f / %.1f", stats.p95Ms, stats.p99Ms), c.accent, Modifier.weight(1f))
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    StatCell("8B BINARY", String.format("%.1f us", stats.binaryAvgUs), c.ok, Modifier.weight(1f))
                    StatCell("LEGACY JSON", String.format("%.1f us", stats.jsonAvgUs), c.muted, Modifier.weight(1f))
                }

                // Compact bar chart of last 36 transmissions
                val recent = logs.takeLast(36)
                if (recent.isNotEmpty()) {
                    val maxLat = maxOf(10.0, recent.maxOf { it.totalLatencyMs })
                    Canvas(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(54.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .background(c.bg2)
                            .padding(6.dp)
                    ) {
                        val barW = size.width / recent.size.coerceAtLeast(1)
                        recent.forEachIndexed { idx, rec ->
                            val hRatio = (rec.totalLatencyMs / maxLat).toFloat().coerceIn(0.08f, 1f)
                            val barH = size.height * hRatio
                            val col = when {
                                rec.status == "DROP" -> c.danger
                                rec.totalLatencyMs > 12.0 -> c.accent
                                else -> c.ok
                            }
                            drawRect(
                                color = col,
                                topLeft = Offset(idx * barW + 1f, size.height - barH),
                                size = Size((barW - 2f).coerceAtLeast(2f), barH)
                            )
                        }
                    }
                }

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    BenchPrimaryButton(
                        text = if (soakRunning) "Stop ($soakProgress/$soakCount)" else "Run ${soakCount}x Soak",
                        onClick = onRunSoak,
                        modifier = Modifier.weight(1f)
                    )
                    BenchGhostButton(
                        text = "Clear",
                        dangerText = true,
                        onClick = onClearLogs
                    )
                }

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    BenchGhostButton(text = "Export CSV", accentText = true, onClick = onExportCsv, modifier = Modifier.weight(1f))
                    BenchGhostButton(text = "Export JSON", onClick = onExportJson, modifier = Modifier.weight(1f))
                }
            }
        }

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(c.panel)
                .border(1.dp, c.line, RoundedCornerShape(16.dp))
                .padding(14.dp)
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    "RECENT FRAMES (${logs.size})",
                    color = c.muted,
                    fontFamily = FontFamily.Monospace,
                    fontSize = 10.5.sp
                )
                logs.takeLast(18).reversed().forEach { rec ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(10.dp))
                            .background(c.bg2)
                            .border(1.dp, c.line, RoundedCornerShape(10.dp))
                            .padding(horizontal = 10.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("${rec.commandLabel} · ${rec.presetName}", color = c.text, fontSize = 12.5.sp, fontWeight = FontWeight.Medium)
                            Text(
                                "${rec.protocol} · ${rec.codec} (${rec.payloadBytes}B) · ${String.format("%.1f", rec.backendOverheadUs)} us",
                                color = c.muted,
                                fontFamily = FontFamily.Monospace,
                                fontSize = 10.sp
                            )
                        }
                        Text(
                            text = if (rec.status == "DROP") "DROP" else String.format("%.2f ms", rec.totalLatencyMs),
                            color = if (rec.status == "DROP") c.danger else c.ok,
                            fontFamily = FontFamily.Monospace,
                            fontSize = 11.5.sp
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun StatCell(label: String, value: String, valueColor: Color, modifier: Modifier) {
    val c = LocalIRBenchColors.current
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .background(c.bg2)
            .border(1.dp, c.line, RoundedCornerShape(12.dp))
            .padding(10.dp)
    ) {
        Text(label, color = c.muted, fontFamily = FontFamily.Monospace, fontSize = 9.5.sp)
        Spacer(modifier = Modifier.height(3.dp))
        Text(value, color = valueColor, fontFamily = FontFamily.Monospace, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
fun IrxStudioScreen(
    allRemotes: List<RemotePreset>,
    onPickFile: () -> Unit,
    onImportParsed: (RemotePreset) -> Unit,
    onOpenRemote: (String) -> Unit,
    onExportIrx: (RemotePreset) -> Unit,
    onExportIr: (RemotePreset) -> Unit
) {
    val c = LocalIRBenchColors.current
    var pasteText by remember { mutableStateOf("") }
    var nameInput by remember { mutableStateOf("Custom_TV") }
    var errorMsg by remember { mutableStateOf<String?>(null) }

    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(c.panel)
                .border(1.dp, c.line, RoundedCornerShape(16.dp))
                .padding(14.dp)
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Import .irx / .ir File", color = c.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                Text(
                    "Load .irx remote layouts (full button shapes, sizes, rows & positions) or Flipper .ir signal files.",
                    color = c.muted,
                    fontSize = 12.5.sp
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    BenchPrimaryButton(text = "Choose File", onClick = onPickFile, modifier = Modifier.weight(1f))
                    BenchGhostButton(
                        text = "Sample .irx",
                        onClick = { pasteText = IrFileFormat.serializeToIrx(Presets.REMOTE_PRESETS.first()) }
                    )
                    BenchGhostButton(
                        text = "Sample .ir",
                        onClick = { pasteText = Presets.SAMPLE_IR_FILE }
                    )
                }

                if (errorMsg != null) {
                    Text(errorMsg!!, color = c.danger, fontFamily = FontFamily.Monospace, fontSize = 11.sp)
                }

                BenchTextField(
                    label = "Remote Name (for .ir)",
                    value = nameInput,
                    onValueChange = { nameInput = it }
                )

                BenchTextField(
                    label = "Or Paste .irx / .ir Contents",
                    value = pasteText,
                    onValueChange = { pasteText = it },
                    placeholder = "{ \"filetype\": \"IRX remote layout\", ... }",
                    monospace = true,
                    singleLine = false,
                    minLines = 5
                )

                BenchPrimaryButton(
                    text = "Parse & Add Remote",
                    enabled = pasteText.isNotBlank(),
                    onClick = {
                        try {
                            val ext = if (pasteText.trim().startsWith("{")) "irx" else "ir"
                            val parsed = IrFileFormat.parseAny(pasteText, "${nameInput.ifBlank { "Imported" }}.$ext")
                            onImportParsed(parsed)
                            pasteText = ""
                            errorMsg = null
                        } catch (_: Throwable) {
                            errorMsg = "Invalid .irx or .ir format"
                        }
                    },
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(c.panel)
                .border(1.dp, c.line, RoundedCornerShape(16.dp))
                .padding(14.dp)
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    "EXPORT REMOTES · .IRX KEEPS POSITIONS (${allRemotes.size})",
                    color = c.muted,
                    fontFamily = FontFamily.Monospace,
                    fontSize = 10.5.sp
                )
                allRemotes.forEach { rem ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(c.bg2)
                            .border(1.dp, c.line, RoundedCornerShape(12.dp))
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(
                            modifier = Modifier
                                .weight(1f)
                                .clickable { onOpenRemote(rem.id) }
                        ) {
                            Text("${rem.emoji} ${rem.name}", color = c.text, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold)
                            Text(
                                "${rem.protocol.displayName} · ${rem.carrierKhz} kHz · ${rem.buttons.size} keys",
                                color = c.muted,
                                fontFamily = FontFamily.Monospace,
                                fontSize = 10.5.sp
                            )
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(9.dp))
                                    .background(c.accent)
                                    .clickable { onExportIrx(rem) }
                                    .padding(horizontal = 10.dp, vertical = 7.dp)
                            ) {
                                Text(".irx", color = Color(0xFF1A1006), fontFamily = FontFamily.Monospace, fontSize = 11.5.sp, fontWeight = FontWeight.Bold)
                            }
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(9.dp))
                                    .background(c.panel)
                                    .border(1.dp, c.line, RoundedCornerShape(9.dp))
                                    .clickable { onExportIr(rem) }
                                    .padding(horizontal = 10.dp, vertical = 7.dp)
                            ) {
                                Text(".ir", color = c.muted, fontFamily = FontFamily.Monospace, fontSize = 11.5.sp)
                            }
                        }
                    }
                }
            }
        }
    }
}
