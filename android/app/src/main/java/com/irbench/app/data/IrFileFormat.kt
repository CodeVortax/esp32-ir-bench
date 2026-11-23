package com.irbench.app.data

import com.irbench.app.model.*
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

object IrFileFormat {
    private val json = Json {
        prettyPrint = true
        ignoreUnknownKeys = true
    }

    fun hashString16(input: String): Int {
        var hash = 0x811C
        for (ch in input) {
            hash = hash xor ch.code
            hash = (hash * 0x0101) and 0xFFFF
        }
        return if (hash == 0) 0x1001 else hash
    }

    private fun hexToFlipperBytes(codeHex: String): Pair<String, String> {
        val clean = codeHex.removePrefix("0x").removePrefix("0X").padStart(8, '0').takeLast(8).uppercase()
        val addr = "${clean.substring(0, 2)} ${clean.substring(2, 4)} 00 00"
        val cmd = "${clean.substring(4, 6)} ${clean.substring(6, 8)} 00 00"
        return addr to cmd
    }

    private fun flipperBytesToHex(addrStr: String, cmdStr: String): String {
        val a = addrStr.trim().split(Regex("\\s+"))
        val c = cmdStr.trim().split(Regex("\\s+"))
        val a0 = a.getOrNull(0)?.padStart(2, '0') ?: "00"
        val a1 = a.getOrNull(1)?.padStart(2, '0') ?: "00"
        val c0 = c.getOrNull(0)?.padStart(2, '0') ?: "00"
        val c1 = c.getOrNull(1)?.padStart(2, '0') ?: "00"
        return "0x${(a0 + a1 + c0 + c1).uppercase()}"
    }

    fun serializeToIrx(preset: RemotePreset): String {
        val doc = IrxDocument(
            remote = IrxRemoteMeta(
                id = preset.id,
                name = preset.name,
                emoji = preset.emoji,
                mode = preset.mode,
                manufacturer = preset.manufacturer,
                deviceType = preset.deviceType,
                protocol = preset.protocol,
                carrierKhz = preset.carrierKhz,
                photo = preset.photo
            ),
            buttons = preset.buttons.mapIndexed { idx, b ->
                val (addr, cmd) = if (!b.addressBytes.isNullOrBlank() && !b.commandBytes.isNullOrBlank()) {
                    b.addressBytes to b.commandBytes
                } else {
                    hexToFlipperBytes(b.codeHex)
                }
                IrxButtonEntry(
                    id = b.id,
                    label = b.label,
                    emoji = b.emoji,
                    category = b.category,
                    layout = IrxButtonLayout(
                        shape = b.shape,
                        w = b.w,
                        h = b.h,
                        row = b.row,
                        col = b.col,
                        x = b.x,
                        y = b.y,
                        order = idx
                    ),
                    signal = IrxButtonSignal(
                        captured = b.captured,
                        irType = b.irType,
                        codeHex = b.codeHex,
                        addressBytes = addr,
                        commandBytes = cmd,
                        frequencyHz = b.frequencyHz,
                        dutyCycle = b.dutyCycle,
                        rawTimingsUs = b.rawTimingsUs
                    )
                )
            }
        )
        return json.encodeToString(doc)
    }

    fun serializeToIr(preset: RemotePreset): String {
        val protoName = when (preset.protocol) {
            IRProtocol.NEC -> "NEC"
            IRProtocol.SONY_SIRC -> "SIRC"
            IRProtocol.SAMSUNG32 -> "Samsung32"
            IRProtocol.RC5 -> "RC5"
            IRProtocol.DAIKIN_HVAC -> "Daikin"
            IRProtocol.RAW -> "RAW"
        }
        val sb = StringBuilder()
        sb.appendLine("Filetype: IR signals file")
        sb.appendLine("Version: 1")
        sb.appendLine("# Exported from IRBench Android — ${preset.name}")
        preset.buttons.forEach { b ->
            sb.appendLine("#")
            sb.appendLine("name: ${b.label.replace(Regex("\\s+"), "_")}")
            if (b.irType == "raw" && !b.rawTimingsUs.isNullOrEmpty()) {
                sb.appendLine("type: raw")
                sb.appendLine("frequency: ${b.frequencyHz ?: preset.carrierKhz * 1000}")
                sb.appendLine("duty_cycle: ${b.dutyCycle ?: 0.33f}")
                sb.appendLine("data: ${b.rawTimingsUs.joinToString(" ")}")
            } else {
                val (addr, cmd) = if (!b.addressBytes.isNullOrBlank() && !b.commandBytes.isNullOrBlank()) {
                    b.addressBytes to b.commandBytes
                } else {
                    hexToFlipperBytes(b.codeHex)
                }
                sb.appendLine("type: parsed")
                sb.appendLine("protocol: $protoName")
                sb.appendLine("address: $addr")
                sb.appendLine("command: $cmd")
            }
        }
        return sb.toString()
    }

    fun parseAny(content: String, filename: String = "Imported_Remote.irx"): RemotePreset {
        val trimmed = content.trim()
        if (trimmed.startsWith("{")) {
            val doc = json.decodeFromString<IrxDocument>(trimmed)
            return RemotePreset(
                id = "irx-${System.currentTimeMillis()}",
                name = doc.remote.name.ifBlank { "Imported .irx" },
                emoji = doc.remote.emoji.ifBlank { "📡" },
                mode = doc.remote.mode,
                photo = doc.remote.photo,
                manufacturer = doc.remote.manufacturer,
                deviceType = doc.remote.deviceType,
                protocol = doc.remote.protocol,
                carrierKhz = doc.remote.carrierKhz,
                isCustom = true,
                buttons = doc.buttons.sortedBy { it.layout.order }.mapIndexed { idx, entry ->
                    RemoteButton(
                        id = entry.id.ifBlank { "irx-$idx" },
                        label = entry.label,
                        emoji = entry.emoji,
                        codeHex = entry.signal.codeHex,
                        commandHash = hashString16("${entry.label}-${entry.signal.codeHex}"),
                        category = entry.category,
                        shape = entry.layout.shape,
                        w = entry.layout.w,
                        h = entry.layout.h,
                        row = entry.layout.row,
                        col = entry.layout.col,
                        x = entry.layout.x,
                        y = entry.layout.y,
                        captured = entry.signal.captured,
                        irType = entry.signal.irType,
                        addressBytes = entry.signal.addressBytes,
                        commandBytes = entry.signal.commandBytes,
                        frequencyHz = entry.signal.frequencyHz,
                        dutyCycle = entry.signal.dutyCycle,
                        rawTimingsUs = entry.signal.rawTimingsUs
                    )
                }
            )
        }

        val blocks = mutableListOf<Map<String, String>>()
        var current = mutableMapOf<String, String>()
        trimmed.lines().forEach { raw ->
            val line = raw.trim()
            if (line.isEmpty() || line.startsWith("#")) {
                if (current.containsKey("name")) {
                    blocks.add(current)
                    current = mutableMapOf()
                }
            } else {
                val idx = line.indexOf(':')
                if (idx > 0) {
                    val key = line.substring(0, idx).trim().lowercase()
                    val value = line.substring(idx + 1).trim()
                    if (key != "filetype" && key != "version") {
                        current[key] = value
                    }
                }
            }
        }
        if (current.containsKey("name")) blocks.add(current)

        val buttons = blocks.mapIndexed { idx, blk ->
            val label = (blk["name"] ?: "Key_${idx + 1}").replace('_', ' ')
            val row = idx / 3
            val col = idx % 3
            if (blk["type"] == "raw") {
                val timings = (blk["data"] ?: "").split(Regex("\\s+")).mapNotNull { it.toIntOrNull() }
                val freq = blk["frequency"]?.toIntOrNull() ?: 38000
                RemoteButton(
                    id = "ir-$idx-${System.currentTimeMillis()}",
                    label = label,
                    codeHex = "0x${hashString16(label).toString(16).uppercase().padStart(8, '0')}",
                    commandHash = hashString16(label),
                    category = "lab",
                    shape = ButtonShape.pill,
                    w = 96,
                    h = 46,
                    row = row,
                    col = col,
                    captured = true,
                    irType = "raw",
                    frequencyHz = freq,
                    dutyCycle = blk["duty_cycle"]?.toFloatOrNull() ?: 0.33f,
                    rawTimingsUs = timings
                )
            } else {
                val addr = blk["address"] ?: "00 00 00 00"
                val cmd = blk["command"] ?: "00 00 00 00"
                val hex = flipperBytesToHex(addr, cmd)
                val isPwr = label.contains("power", ignoreCase = true)
                RemoteButton(
                    id = "ir-$idx-${System.currentTimeMillis()}",
                    label = label,
                    codeHex = hex,
                    commandHash = hashString16(label),
                    category = if (isPwr) "power" else "mode",
                    shape = if (isPwr) ButtonShape.circle else ButtonShape.pill,
                    w = if (isPwr) 64 else 96,
                    h = if (isPwr) 64 else 46,
                    row = row,
                    col = col,
                    captured = true,
                    irType = "parsed",
                    addressBytes = addr,
                    commandBytes = cmd
                )
            }
        }

        val protoRaw = blocks.firstOrNull { it["protocol"] != null }?.get("protocol")?.uppercase() ?: "NEC"
        val proto = when {
            protoRaw.startsWith("NEC") -> IRProtocol.NEC
            protoRaw.contains("SIRC") -> IRProtocol.SONY_SIRC
            protoRaw.contains("SAMSUNG") -> IRProtocol.SAMSUNG32
            protoRaw.contains("RC5") -> IRProtocol.RC5
            protoRaw.contains("DAIKIN") -> IRProtocol.DAIKIN_HVAC
            else -> IRProtocol.RAW
        }

        val cleanName = filename.replace(Regex("\\.(irx|ir|txt)$", RegexOption.IGNORE_CASE), "")
            .replace(Regex("[_-]+"), " ").trim().ifBlank { "Imported Remote" }

        return RemotePreset(
            id = "custom-ir-${System.currentTimeMillis()}",
            name = cleanName,
            emoji = "📡",
            manufacturer = ".ir File Import",
            deviceType = "Imported",
            protocol = proto,
            carrierKhz = if (proto == IRProtocol.SONY_SIRC) 40 else 38,
            isCustom = true,
            buttons = buttons
        )
    }

    fun groupButtonsByRow(buttons: List<RemoteButton>): List<List<RemoteButton>> {
        if (buttons.isEmpty()) return emptyList()
        val hasRows = buttons.any { it.row != null }
        if (!hasRows) return buttons.chunked(3)
        return buttons.mapIndexed { idx, b -> (b.row ?: (idx / 3)) to b }
            .groupBy({ it.first }, { it.second })
            .toSortedMap()
            .values
            .map { rowList -> rowList.sortedBy { it.col ?: 0 } }
    }
}
