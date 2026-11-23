package com.irbench.app

import android.content.Context
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.irbench.app.data.IrFileFormat
import com.irbench.app.data.Presets
import com.irbench.app.model.*
import com.irbench.app.network.Esp32Client
import com.irbench.app.ui.components.*
import com.irbench.app.ui.screens.IrxStudioScreen
import com.irbench.app.ui.screens.TimingLogsScreen
import com.irbench.app.ui.screens.WifiConfigScreen
import com.irbench.app.ui.theme.IRBenchTheme
import com.irbench.app.ui.theme.LocalIRBenchColors
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.math.pow
import kotlin.math.sqrt

enum class Screen {
    HOME, REMOTES, EDIT_LIST, RUN, BUILD, WIFI, LOGS, IRX_STUDIO
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val client = Esp32Client(applicationContext)
        val prefs = getSharedPreferences("irbench_prefs", Context.MODE_PRIVATE)
        setContent {
            IRBenchApp(client = client, prefs = prefs)
        }
    }
}

@Composable
fun IRBenchApp(
    client: Esp32Client,
    prefs: android.content.SharedPreferences
) {
    val jsonCodec = remember { Json { ignoreUnknownKeys = true } }
    val scope = rememberCoroutineScope()
    var darkTheme by remember { mutableStateOf(prefs.getBoolean("dark_theme", true)) }
    var screen by remember { mutableStateOf(Screen.HOME) }

    // Per-screen ScrollState so returning back from a remote preserves exact scroll position!
    val scrollStates = remember { Screen.entries.associateWith { ScrollState(0) } }
    var pendingScrollRestore by remember { mutableStateOf<Pair<Screen, Int>?>(null) }

    val customRemotes = remember {
        mutableStateListOf<RemotePreset>().apply {
            val raw = prefs.getString("custom_remotes_json", null)
            if (!raw.isNullOrBlank()) {
                runCatching { addAll(jsonCodec.decodeFromString<List<RemotePreset>>(raw)) }
            }
        }
    }

    fun persistCustomRemotes() {
        prefs.edit().putString("custom_remotes_json", jsonCodec.encodeToString(customRemotes.toList())).apply()
    }

    val allRemotes = Presets.REMOTE_PRESETS + customRemotes
    var activeRunId by remember { mutableStateOf(Presets.REMOTE_PRESETS.first().id) }
    val activeRunRemote = allRemotes.find { it.id == activeRunId } ?: allRemotes.first()

    var config by remember {
        mutableStateOf(
            DeviceConfig(
                esp32Host = prefs.getString("esp_host", "http://192.168.4.1") ?: "http://192.168.4.1",
                phoneHasIrBlaster = client.hasBuiltInIrBlaster
            )
        )
    }

    val logs = remember { mutableStateListOf<TelemetryRecord>() }
    var flashingBtnId by remember { mutableStateOf<String?>(null) }
    var lastTxInfo by remember { mutableStateOf<String?>(null) }

    // Builder state
    var draft by remember { mutableStateOf<RemotePreset?>(null) }
    var isEditingExisting by remember { mutableStateOf(false) }
    var showAddBtnForm by remember { mutableStateOf(false) }
    var newBtnName by remember { mutableStateOf("") }
    var newBtnRow by remember { mutableIntStateOf(0) }
    var pendingShape by remember { mutableStateOf(ButtonShape.circle) }
    var editingBtnId by remember { mutableStateOf<String?>(null) }
    var editBtnName by remember { mutableStateOf("") }
    var editBtnRow by remember { mutableIntStateOf(0) }
    var editBtnShape by remember { mutableStateOf(ButtonShape.circle) }

    // Modals & Capture
    var showModeSheet by remember { mutableStateOf(false) }
    var captureTargetBtnId by remember { mutableStateOf<String?>(null) }
    var captureListening by remember { mutableStateOf(true) }
    var capturedSignal by remember { mutableStateOf<CapturedSignal?>(null) }

    // Soak burst
    var soakRunning by remember { mutableStateOf(false) }
    var soakProgress by remember { mutableIntStateOf(0) }
    val soakCount = 25

    var toastMsg by remember { mutableStateOf<String?>(null) }
    fun showToast(msg: String) {
        toastMsg = msg
        scope.launch {
            delay(2200)
            if (toastMsg == msg) toastMsg = null
        }
    }

    fun navigateTo(next: Screen, back: Boolean = false) {
        if (!back) {
            pendingScrollRestore = next to 0
        }
        screen = next
    }

    LaunchedEffect(pendingScrollRestore) {
        pendingScrollRestore?.let { (targetScreen, pos) ->
            scrollStates[targetScreen]?.scrollTo(pos)
            pendingScrollRestore = null
        }
    }

    LaunchedEffect(captureTargetBtnId, captureListening, config.target) {
        if (captureTargetBtnId != null && captureListening && config.target == "esp32-lan") {
            while (captureListening && captureTargetBtnId != null) {
                val sig = client.pollOrSimulateCapture(
                    config,
                    draft?.protocol ?: IRProtocol.NEC,
                    draft?.carrierKhz ?: 38
                )
                if (sig != null) {
                    capturedSignal = sig
                    captureListening = false
                    break
                }
                delay(800)
            }
        }
    }

    // Export file launcher
    var pendingExportContent by remember { mutableStateOf("") }
    val context = androidx.compose.ui.platform.LocalContext.current
    val createDocLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.CreateDocument("*/*")
    ) { uri ->
        if (uri != null) {
            runCatching {
                context.contentResolver.openOutputStream(uri)?.use { os ->
                    os.write(pendingExportContent.toByteArray(Charsets.UTF_8))
                }
                showToast("File exported")
            }.onFailure { showToast("Export failed") }
        }
    }

    // Import .irx / .ir file launcher
    val openDocLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument()
    ) { uri ->
        if (uri != null) {
            runCatching {
                val text = context.contentResolver.openInputStream(uri)?.bufferedReader()?.readText().orEmpty()
                val parsed = IrFileFormat.parseAny(text, "Imported.irx")
                customRemotes.add(parsed)
                persistCustomRemotes()
                showModeSheet = false
                draft = parsed
                isEditingExisting = true
                navigateTo(Screen.BUILD)
                showToast("Imported ${parsed.buttons.size} keys")
            }.onFailure { showToast("Invalid .irx / .ir file") }
        }
    }

    fun saveOrUpdateCustom(remote: RemotePreset) {
        val saved = remote.copy(isCustom = true)
        val idx = customRemotes.indexOfFirst { it.id == saved.id }
        if (idx >= 0) customRemotes[idx] = saved else customRemotes.add(saved)
        persistCustomRemotes()
    }

    fun fireButton(remote: RemotePreset, btn: RemoteButton) {
        flashingBtnId = btn.id
        scope.launch {
            val rec = client.transmit(config, remote, btn)
            logs.add(rec)
            if (logs.size > 3000) logs.removeAt(0)
            lastTxInfo = "${btn.label} · ${String.format("%.2f", rec.totalLatencyMs)} ms · ${String.format("%.1f", rec.backendOverheadUs)} us"
            delay(220)
            if (flashingBtnId == btn.id) flashingBtnId = null
        }
    }

    // Hardware back gesture support (Android 13-15 predictive back)
    BackHandler(enabled = screen != Screen.HOME) {
        when (screen) {
            Screen.RUN -> navigateTo(Screen.REMOTES, back = true)
            Screen.BUILD -> {
                draft = null
                navigateTo(if (isEditingExisting) Screen.EDIT_LIST else Screen.HOME, back = true)
            }
            else -> navigateTo(Screen.HOME, back = true)
        }
    }

    val stats = remember(logs.size) { computeStats(logs) }

    IRBenchTheme(darkTheme = darkTheme) {
        val c = LocalIRBenchColors.current
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(c.bg)
                .windowInsetsPadding(WindowInsets.safeDrawing)
        ) {
            Column(
                modifier = Modifier
                    .widthIn(max = 520.dp)
                    .fillMaxWidth()
                    .align(Alignment.TopCenter)
                    .verticalScroll(scrollStates[screen]!!)
                    .padding(horizontal = 18.dp)
                    .padding(bottom = 96.dp)
            ) {
                when (screen) {
                    Screen.HOME -> {
                        IRBenchTopBar(
                            eyebrow = "IR Bench · ESP32",
                            title = "Remote lab",
                            showBack = false,
                            ledConnected = config.connected,
                            rightActionLabel = if (darkTheme) "☀" else "☾",
                            onRightAction = {
                                darkTheme = !darkTheme
                                prefs.edit().putBoolean("dark_theme", darkTheme).apply()
                            }
                        )
                        Text(
                            text = "Build virtual remotes, capture IR codes off your old TV clicker, then fire them back out through the ESP32 LED.",
                            color = c.muted,
                            fontSize = 14.5.sp,
                            lineHeight = 21.sp,
                            modifier = Modifier.padding(bottom = 18.dp)
                        )
                        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            MenuCardItem("▶", "Remotes", "Run a saved remote and send signals", "${allRemotes.size}") {
                                navigateTo(Screen.REMOTES)
                            }
                            MenuCardItem("＋", "New remote", "From scratch, template, or .irx / .ir file") {
                                showModeSheet = true
                            }
                            MenuCardItem("✎", "Edit", "Rename, resize, re-capture, or delete") {
                                navigateTo(Screen.EDIT_LIST)
                            }
                            MenuCardItem(
                                "◎",
                                "WiFi",
                                "${if (config.target == "simulator") "Simulator" else config.esp32Host} · ${if (config.codec == "binary") "8B Bin" else "JSON"} · ${config.rssiDbm} dBm"
                            ) {
                                navigateTo(Screen.WIFI)
                            }
                            MenuCardItem("⚡", "Timing & Logs", "Real-time RTT, soak tests & CSV/JSON export", "${stats.count}") {
                                navigateTo(Screen.LOGS)
                            }
                            MenuCardItem("⤓", ".irx Studio", "Export & import layouts with button positions") {
                                navigateTo(Screen.IRX_STUDIO)
                            }
                        }
                    }

                    Screen.REMOTES -> {
                        IRBenchTopBar(
                            eyebrow = "Run",
                            title = "Remotes",
                            onBack = { navigateTo(Screen.HOME, back = true) }
                        )
                        val rows = allRemotes.chunked(2)
                        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                            rows.forEach { pair ->
                                Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                                    pair.forEach { r ->
                                        RemoteGridCard(
                                            remote = r,
                                            isLastOpened = r.id == activeRunId,
                                            onClick = {
                                                activeRunId = r.id
                                                lastTxInfo = null
                                                navigateTo(Screen.RUN)
                                            },
                                            modifier = Modifier.weight(1f)
                                        )
                                    }
                                    if (pair.size == 1) {
                                        AddRemoteGridCard(
                                            onClick = { showModeSheet = true },
                                            modifier = Modifier.weight(1f)
                                        )
                                    }
                                }
                            }
                            if (allRemotes.size % 2 == 0) {
                                Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                                    AddRemoteGridCard(
                                        onClick = { showModeSheet = true },
                                        modifier = Modifier.weight(1f)
                                    )
                                    Spacer(modifier = Modifier.weight(1f))
                                }
                            }
                        }
                    }

                    Screen.EDIT_LIST -> {
                        IRBenchTopBar(
                            eyebrow = "Edit",
                            title = "Pick a remote",
                            onBack = { navigateTo(Screen.HOME, back = true) }
                        )
                        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                            allRemotes.chunked(2).forEach { pair ->
                                Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                                    pair.forEach { r ->
                                        RemoteGridCard(
                                            remote = r,
                                            isLastOpened = false,
                                            onClick = {
                                                val copy = if (r.isCustom) r else r.copy(
                                                    id = "custom-${r.id}-${System.currentTimeMillis() % 10000}",
                                                    name = "${r.name} (Copy)",
                                                    isCustom = true
                                                )
                                                draft = copy
                                                isEditingExisting = r.isCustom
                                                editingBtnId = null
                                                showAddBtnForm = false
                                                navigateTo(Screen.BUILD)
                                            },
                                            modifier = Modifier.weight(1f)
                                        )
                                    }
                                    if (pair.size == 1) Spacer(modifier = Modifier.weight(1f))
                                }
                            }
                        }
                    }

                    Screen.RUN -> {
                        IRBenchTopBar(
                            eyebrow = "Sending · ${activeRunRemote.protocol.displayName}",
                            title = "${activeRunRemote.emoji} ${activeRunRemote.name}",
                            onBack = { navigateTo(Screen.REMOTES, back = true) },
                            rightActionLabel = ".irx",
                            onRightAction = {
                                pendingExportContent = IrFileFormat.serializeToIrx(activeRunRemote)
                                createDocLauncher.launch("${activeRunRemote.name.lowercase().replace(' ', '_')}.irx")
                            }
                        )
                        if (lastTxInfo != null) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(bottom = 12.dp)
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(c.panel)
                                    .border(1.dp, c.line, RoundedCornerShape(12.dp))
                                    .padding(horizontal = 12.dp, vertical = 8.dp)
                            ) {
                                Text(
                                    "● TX $lastTxInfo",
                                    color = c.ok,
                                    fontFamily = FontFamily.Monospace,
                                    fontSize = 11.5.sp
                                )
                            }
                        }

                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(26.dp))
                                .background(c.bg2)
                                .border(1.dp, c.line, RoundedCornerShape(26.dp))
                                .padding(horizontal = 14.dp, vertical = 20.dp)
                        ) {
                            Column(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                IrFileFormat.groupButtonsByRow(activeRunRemote.buttons).forEach { rowBtns ->
                                    Row(
                                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        rowBtns.forEach { btn ->
                                            RunShapeButton(
                                                btn = btn,
                                                isFlashing = flashingBtnId == btn.id,
                                                onClick = { fireButton(activeRunRemote, btn) }
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }

                    Screen.BUILD -> {
                        val currDraft = draft
                        if (currDraft != null) {
                            IRBenchTopBar(
                                eyebrow = if (isEditingExisting) "Edit remote" else "New remote",
                                title = "${currDraft.emoji} ${currDraft.name.ifBlank { "Untitled" }}",
                                onBack = {
                                    draft = null
                                    navigateTo(if (isEditingExisting) Screen.EDIT_LIST else Screen.HOME, back = true)
                                },
                                rightActionLabel = ".irx",
                                onRightAction = {
                                    pendingExportContent = IrFileFormat.serializeToIrx(currDraft)
                                    createDocLauncher.launch("${currDraft.name.ifBlank { "remote" }.lowercase().replace(' ', '_')}.irx")
                                }
                            )

                            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                BenchTextField(
                                    label = "Remote name",
                                    value = currDraft.name,
                                    onValueChange = { draft = currDraft.copy(name = it) },
                                    placeholder = "e.g. Living room TV",
                                    modifier = Modifier.weight(1f)
                                )
                                BenchTextField(
                                    label = "Icon",
                                    value = currDraft.emoji,
                                    onValueChange = { draft = currDraft.copy(emoji = it.take(4)) },
                                    modifier = Modifier.width(74.dp)
                                )
                            }

                            Spacer(modifier = Modifier.height(10.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                Presets.QUICK_EMOJI.take(8).forEach { em ->
                                    Box(
                                        modifier = Modifier
                                            .size(34.dp)
                                            .clip(RoundedCornerShape(9.dp))
                                            .background(c.panel)
                                            .border(1.dp, c.line, RoundedCornerShape(9.dp))
                                            .clickable { draft = currDraft.copy(emoji = em) },
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Text(em, fontSize = 15.sp)
                                    }
                                }
                            }

                            Spacer(modifier = Modifier.height(16.dp))
                            Text("LAYOUT STARTER TEMPLATE", color = c.muted, fontFamily = FontFamily.Monospace, fontSize = 10.5.sp)
                            Spacer(modifier = Modifier.height(8.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                listOf("tv" to "📺 TV", "ac" to "❄️ AC", "audio" to "🔊 Audio", "blank" to "Clear").forEach { (id, lbl) ->
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(10.dp))
                                            .background(c.panel)
                                            .border(1.dp, c.line, RoundedCornerShape(10.dp))
                                            .clickable {
                                                val tplBtns = Presets.BUILDER_TEMPLATES[id]?.mapIndexed { idx, b ->
                                                    b.copy(id = "b_${System.currentTimeMillis()}_$idx", captured = false)
                                                } ?: emptyList()
                                                draft = currDraft.copy(buttons = tplBtns)
                                                editingBtnId = null
                                            }
                                            .padding(horizontal = 11.dp, vertical = 7.dp)
                                    ) {
                                        Text(lbl, color = c.muted, fontFamily = FontFamily.Monospace, fontSize = 11.sp)
                                    }
                                }
                            }

                            Spacer(modifier = Modifier.height(14.dp))
                            Text("BUTTONS — TAP TO EDIT, HOLD TO CAPTURE", color = c.muted, fontFamily = FontFamily.Monospace, fontSize = 10.5.sp)
                            Spacer(modifier = Modifier.height(8.dp))
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(16.dp))
                                    .border(1.5.dp, c.line, RoundedCornerShape(16.dp))
                                    .padding(14.dp)
                            ) {
                                Column(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.spacedBy(12.dp)
                                ) {
                                    IrFileFormat.groupButtonsByRow(currDraft.buttons).forEach { rowBtns ->
                                        Row(
                                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            rowBtns.forEach { btn ->
                                                BuilderShapeButton(
                                                    btn = btn,
                                                    isSelected = editingBtnId == btn.id,
                                                    onTap = {
                                                        editingBtnId = btn.id
                                                        editBtnName = btn.label
                                                        editBtnRow = btn.row ?: 0
                                                        editBtnShape = btn.shape
                                                        showAddBtnForm = false
                                                    },
                                                    onHoldCapture = {
                                                        captureTargetBtnId = btn.id
                                                        captureListening = true
                                                        capturedSignal = null
                                                    }
                                                )
                                            }
                                        }
                                    }
                                    Box(
                                        modifier = Modifier
                                            .size(52.dp)
                                            .clip(RoundedCornerShape(14.dp))
                                            .border(1.5.dp, c.line, RoundedCornerShape(14.dp))
                                            .clickable {
                                                val maxRow = currDraft.buttons.maxOfOrNull { it.row ?: 0 } ?: -1
                                                newBtnRow = if (maxRow < 0) 0 else maxRow
                                                editingBtnId = null
                                                showAddBtnForm = true
                                            },
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Text("＋", color = c.muted, fontSize = 20.sp)
                                    }
                                }
                            }

                            if (showAddBtnForm) {
                                Spacer(modifier = Modifier.height(14.dp))
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(16.dp))
                                        .background(c.panel)
                                        .border(1.dp, c.line, RoundedCornerShape(16.dp))
                                        .padding(14.dp)
                                ) {
                                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                            BenchTextField(
                                                label = "Button name",
                                                value = newBtnName,
                                                onValueChange = { newBtnName = it },
                                                placeholder = "Power, Vol+",
                                                modifier = Modifier.weight(1f)
                                            )
                                            BenchTextField(
                                                label = "Row",
                                                value = newBtnRow.toString(),
                                                onValueChange = { newBtnRow = it.toIntOrNull()?.coerceIn(0, 20) ?: 0 },
                                                modifier = Modifier.width(72.dp)
                                            )
                                        }
                                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                            ButtonShape.entries.forEach { sh ->
                                                val sel = pendingShape == sh
                                                Box(
                                                    modifier = Modifier
                                                        .weight(1f)
                                                        .clip(RoundedCornerShape(10.dp))
                                                        .background(if (sel) c.accent.copy(alpha = 0.1f) else c.bg2)
                                                        .border(1.dp, if (sel) c.accent else c.line, RoundedCornerShape(10.dp))
                                                        .clickable { pendingShape = sh }
                                                        .padding(vertical = 8.dp),
                                                    contentAlignment = Alignment.Center
                                                ) {
                                                    Text(sh.label, color = if (sel) c.text else c.muted, fontSize = 11.5.sp)
                                                }
                                            }
                                        }
                                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                            BenchGhostButton("Cancel", onClick = { showAddBtnForm = false }, modifier = Modifier.weight(1f))
                                            BenchPrimaryButton(
                                                text = "Add button",
                                                enabled = newBtnName.isNotBlank(),
                                                onClick = {
                                                    val (w, h) = Presets.defaultSize(pendingShape)
                                                    val col = currDraft.buttons.count { (it.row ?: 0) == newBtnRow }
                                                    val newBtn = RemoteButton(
                                                        id = "b_${System.currentTimeMillis()}",
                                                        label = newBtnName.trim(),
                                                        commandHash = IrFileFormat.hashString16(newBtnName.trim()),
                                                        shape = pendingShape,
                                                        w = w,
                                                        h = h,
                                                        row = newBtnRow,
                                                        col = col,
                                                        captured = false
                                                    )
                                                    draft = currDraft.copy(buttons = currDraft.buttons + newBtn)
                                                    newBtnName = ""
                                                    showAddBtnForm = false
                                                },
                                                modifier = Modifier.weight(1f)
                                            )
                                        }
                                    }
                                }
                            }

                            val editingBtn = currDraft.buttons.find { it.id == editingBtnId }
                            if (editingBtn != null) {
                                Spacer(modifier = Modifier.height(14.dp))
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(16.dp))
                                        .background(c.panel)
                                        .border(1.dp, c.line, RoundedCornerShape(16.dp))
                                        .padding(14.dp)
                                ) {
                                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                            BenchTextField(
                                                label = "Edit button",
                                                value = editBtnName,
                                                onValueChange = { editBtnName = it },
                                                modifier = Modifier.weight(1f)
                                            )
                                            BenchTextField(
                                                label = "Row",
                                                value = editBtnRow.toString(),
                                                onValueChange = { editBtnRow = it.toIntOrNull()?.coerceIn(0, 20) ?: 0 },
                                                modifier = Modifier.width(72.dp)
                                            )
                                        }
                                        Text("Width: ${editingBtn.w} dp", color = c.muted, fontFamily = FontFamily.Monospace, fontSize = 10.5.sp)
                                        Slider(
                                            value = editingBtn.w.toFloat(),
                                            onValueChange = { nextW ->
                                                val wInt = nextW.toInt()
                                                draft = currDraft.copy(
                                                    buttons = currDraft.buttons.map {
                                                        if (it.id == editingBtn.id) it.copy(w = wInt) else it
                                                    }
                                                )
                                            },
                                            valueRange = 42f..180f,
                                            colors = SliderDefaults.colors(thumbColor = c.accent, activeTrackColor = c.accent)
                                        )
                                        BenchGhostButton(
                                            text = "● Capture IR Code for Button",
                                            accentText = true,
                                            onClick = {
                                                captureTargetBtnId = editingBtn.id
                                                captureListening = true
                                                capturedSignal = null
                                            },
                                            modifier = Modifier.fillMaxWidth()
                                        )
                                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                            BenchGhostButton(
                                                text = "Delete",
                                                dangerText = true,
                                                onClick = {
                                                    draft = currDraft.copy(buttons = currDraft.buttons.filterNot { it.id == editingBtn.id })
                                                    editingBtnId = null
                                                },
                                                modifier = Modifier.weight(1f)
                                            )
                                            BenchPrimaryButton(
                                                text = "Done",
                                                onClick = {
                                                    draft = currDraft.copy(
                                                        buttons = currDraft.buttons.map {
                                                            if (it.id == editingBtn.id) it.copy(label = editBtnName.ifBlank { it.label }, row = editBtnRow) else it
                                                        }
                                                    )
                                                    editingBtnId = null
                                                },
                                                modifier = Modifier.weight(1f)
                                            )
                                        }
                                    }
                                }
                            }

                            Spacer(modifier = Modifier.height(16.dp))
                            BenchPrimaryButton(
                                text = "Save remote",
                                enabled = currDraft.name.isNotBlank() && currDraft.buttons.isNotEmpty(),
                                onClick = {
                                    saveOrUpdateCustom(currDraft)
                                    draft = null
                                    showToast("Remote saved")
                                    navigateTo(Screen.REMOTES, back = true)
                                },
                                modifier = Modifier.fillMaxWidth()
                            )
                            if (isEditingExisting) {
                                Spacer(modifier = Modifier.height(10.dp))
                                BenchGhostButton(
                                    text = "Delete this remote",
                                    dangerText = true,
                                    onClick = {
                                        customRemotes.removeAll { it.id == currDraft.id }
                                        persistCustomRemotes()
                                        draft = null
                                        navigateTo(Screen.EDIT_LIST, back = true)
                                    },
                                    modifier = Modifier.fillMaxWidth()
                                )
                            }
                        }
                    }

                    Screen.WIFI -> {
                        IRBenchTopBar(
                            eyebrow = "Setup",
                            title = "WiFi & Device",
                            onBack = { navigateTo(Screen.HOME, back = true) }
                        )
                        WifiConfigScreen(
                            config = config,
                            onUpdateConfig = { next ->
                                config = next
                                scope.launch { client.syncConfig(next) }
                            },
                            onApplyAndProbe = { host ->
                                config = config.copy(esp32Host = host)
                                prefs.edit().putString("esp_host", host).apply()
                                showToast("WiFi target updated")
                            }
                        )
                    }

                    Screen.LOGS -> {
                        IRBenchTopBar(
                            eyebrow = "Telemetry",
                            title = "Timing & Logs",
                            onBack = { navigateTo(Screen.HOME, back = true) }
                        )
                        TimingLogsScreen(
                            logs = logs,
                            stats = stats,
                            soakRunning = soakRunning,
                            soakProgress = soakProgress,
                            soakCount = soakCount,
                            onRunSoak = {
                                if (soakRunning) {
                                    soakRunning = false
                                } else {
                                    soakRunning = true
                                    soakProgress = 0
                                    scope.launch {
                                        val btns = activeRunRemote.buttons
                                        for (i in 0 until soakCount) {
                                            if (!soakRunning) break
                                            val rec = client.transmit(config, activeRunRemote, btns[i % btns.size])
                                            logs.add(rec)
                                            soakProgress = i + 1
                                            delay(90)
                                        }
                                        soakRunning = false
                                    }
                                }
                            },
                            onClearLogs = { logs.clear() },
                            onExportCsv = {
                                val header = "id,timestamp,command,preset,protocol,codec,bytes,totalMs,backendUs,status\n"
                                val rows = logs.joinToString("\n") {
                                    "${it.id},${it.timestamp},${it.commandLabel},${it.presetName},${it.protocol},${it.codec},${it.payloadBytes},${it.totalLatencyMs},${it.backendOverheadUs},${it.status}"
                                }
                                pendingExportContent = header + rows
                                createDocLauncher.launch("irbench_telemetry.csv")
                            },
                            onExportJson = {
                                pendingExportContent = jsonCodec.encodeToString(logs.toList())
                                createDocLauncher.launch("irbench_telemetry.json")
                            }
                        )
                    }

                    Screen.IRX_STUDIO -> {
                        IRBenchTopBar(
                            eyebrow = "Layouts & Signals",
                            title = ".irx Studio",
                            onBack = { navigateTo(Screen.HOME, back = true) }
                        )
                        IrxStudioScreen(
                            allRemotes = allRemotes,
                            onPickFile = { openDocLauncher.launch(arrayOf("*/*")) },
                            onImportParsed = { rem ->
                                saveOrUpdateCustom(rem)
                                showToast("Added ${rem.name}")
                            },
                            onOpenRemote = { id ->
                                activeRunId = id
                                navigateTo(Screen.RUN)
                            },
                            onExportIrx = { rem ->
                                pendingExportContent = IrFileFormat.serializeToIrx(rem)
                                createDocLauncher.launch("${rem.name.lowercase().replace(' ', '_')}.irx")
                            },
                            onExportIr = { rem ->
                                pendingExportContent = IrFileFormat.serializeToIr(rem)
                                createDocLauncher.launch("${rem.name.lowercase().replace(' ', '_')}.ir")
                            }
                        )
                    }
                }
            }

            // Mode Chooser Dialog
            if (showModeSheet) {
                Dialog(onDismissRequest = { showModeSheet = false }) {
                    Surface(
                        shape = RoundedCornerShape(22.dp),
                        color = c.panel,
                        border = BorderStroke(1.dp, c.line)
                    ) {
                        Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            Text("New remote", color = c.text, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
                            MenuCardItem("⬡", "Build with buttons", "Pick a starter layout or add shapes") {
                                showModeSheet = false
                                draft = RemotePreset(
                                    id = "r_${System.currentTimeMillis()}",
                                    name = "",
                                    emoji = "📺",
                                    isCustom = true
                                )
                                isEditingExisting = false
                                navigateTo(Screen.BUILD)
                            }
                            MenuCardItem("⤓", "Import .irx / .ir file", "Load full layout or Flipper signals") {
                                openDocLauncher.launch(arrayOf("*/*"))
                            }
                            BenchGhostButton("Cancel", onClick = { showModeSheet = false }, modifier = Modifier.fillMaxWidth())
                        }
                    }
                }
            }

            // Capture Overlay Dialog
            val targetId = captureTargetBtnId
            if (targetId != null) {
                val targetBtn = draft?.buttons?.find { it.id == targetId }
                CaptureModalDialog(
                    buttonLabel = targetBtn?.label ?: "Capture IR",
                    isListening = captureListening,
                    captured = capturedSignal,
                    isSimulator = config.target != "esp32-lan",
                    onSimulateBurst = {
                        scope.launch {
                            val sig = client.pollOrSimulateCapture(config, draft?.protocol ?: IRProtocol.NEC, draft?.carrierKhz ?: 38)
                            if (sig != null) {
                                capturedSignal = sig
                                captureListening = false
                            }
                        }
                    },
                    onClose = { captureTargetBtnId = null },
                    onDone = {
                        val curr = draft
                        val sig = capturedSignal
                        if (curr != null && sig != null) {
                            draft = curr.copy(
                                protocol = sig.protocol,
                                carrierKhz = sig.carrierKhz,
                                buttons = curr.buttons.map { b ->
                                    if (b.id == targetId) b.copy(captured = true, codeHex = sig.codeHex, rawTimingsUs = sig.rawTimingsUs) else b
                                }
                            )
                            showToast("Captured ${sig.codeHex}")
                        }
                        captureTargetBtnId = null
                    }
                )
            }

            // Toast notification pill at bottom
            if (toastMsg != null) {
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(bottom = 26.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(c.panelHi)
                        .border(1.dp, c.line, RoundedCornerShape(12.dp))
                        .padding(horizontal = 16.dp, vertical = 10.dp)
                ) {
                    Text(toastMsg!!, color = c.text, fontFamily = FontFamily.Monospace, fontSize = 12.sp)
                }
            }
        }
    }
}

private fun computeStats(logs: List<TelemetryRecord>): TelemetryStats {
    if (logs.isEmpty()) return TelemetryStats()
    val acks = logs.filter { it.status != "DROP" }
    val lats = acks.map { it.totalLatencyMs }.sorted()
    val mean = if (lats.isEmpty()) 0.0 else lats.average()
    val p95 = if (lats.isEmpty()) 0.0 else lats[(lats.size * 0.95).toInt().coerceAtMost(lats.lastIndex)]
    val p99 = if (lats.isEmpty()) 0.0 else lats[(lats.size * 0.99).toInt().coerceAtMost(lats.lastIndex)]
    val variance = if (lats.isEmpty()) 0.0 else lats.sumOf { (it - mean).pow(2) } / lats.size
    val bin = acks.filter { it.codec == "binary" }.map { it.backendOverheadUs }
    val js = acks.filter { it.codec == "json" }.map { it.backendOverheadUs }
    return TelemetryStats(
        count = logs.size,
        ackCount = acks.size,
        dropCount = logs.size - acks.size,
        packetLossPct = (logs.size - acks.size) * 100.0 / logs.size,
        meanMs = mean,
        p95Ms = p95,
        p99Ms = p99,
        stdDevMs = sqrt(variance),
        binaryAvgUs = if (bin.isEmpty()) 0.0 else bin.average(),
        jsonAvgUs = if (js.isEmpty()) 0.0 else js.average()
    )
}
