package com.irbench.app.model

import kotlinx.serialization.Serializable

@Serializable
enum class IRProtocol(val id: Int, val displayName: String) {
    NEC(1, "NEC"),
    SONY_SIRC(2, "SONY_SIRC"),
    SAMSUNG32(3, "SAMSUNG32"),
    RC5(4, "RC5"),
    DAIKIN_HVAC(5, "DAIKIN_HVAC"),
    RAW(6, "RAW")
}

@Serializable
enum class ButtonShape(val label: String) {
    circle("Circle"),
    square("Square"),
    pill("Pill"),
    bar("Bar")
}

@Serializable
data class RemoteButton(
    val id: String,
    val label: String,
    val emoji: String? = null,
    val codeHex: String = "0x20DF10EF",
    val commandHash: Int = 0x10EF,
    val category: String = "mode",
    val shape: ButtonShape = ButtonShape.pill,
    val w: Int = 64,
    val h: Int = 64,
    val row: Int? = null,
    val col: Int? = null,
    val x: Float? = null,
    val y: Float? = null,
    val captured: Boolean = true,
    val irType: String = "parsed",
    val addressBytes: String? = null,
    val commandBytes: String? = null,
    val frequencyHz: Int? = null,
    val dutyCycle: Float? = null,
    val rawTimingsUs: List<Int>? = null
)

@Serializable
data class RemotePreset(
    val id: String,
    val name: String,
    val emoji: String = "📡",
    val mode: String = "shapes",
    val photo: String? = null,
    val manufacturer: String = "Custom",
    val deviceType: String = "IR Remote",
    val protocol: IRProtocol = IRProtocol.NEC,
    val carrierKhz: Int = 38,
    val isCustom: Boolean = false,
    val buttons: List<RemoteButton> = emptyList()
)

@Serializable
data class TelemetryRecord(
    val id: String,
    val timestamp: Long,
    val commandLabel: String,
    val presetName: String,
    val protocol: String,
    val codec: String,
    val payloadBytes: Int,
    val totalLatencyMs: Double,
    val backendOverheadUs: Double,
    val rssiDbm: Int,
    val status: String
)

data class TelemetryStats(
    val count: Int = 0,
    val ackCount: Int = 0,
    val dropCount: Int = 0,
    val packetLossPct: Double = 0.0,
    val meanMs: Double = 0.0,
    val p95Ms: Double = 0.0,
    val p99Ms: Double = 0.0,
    val stdDevMs: Double = 0.0,
    val binaryAvgUs: Double = 0.0,
    val jsonAvgUs: Double = 0.0
)

data class DeviceConfig(
    val target: String = "simulator", // "simulator" | "esp32-lan" | "phone-ir"
    val esp32Host: String = "http://192.168.4.1",
    val codec: String = "binary",        // "binary" | "json"
    val wifiPowerSave: String = "WIFI_PS_NONE",
    val rssiDbm: Int = -51,
    val connected: Boolean = true,
    val phoneHasIrBlaster: Boolean = false
)

data class CapturedSignal(
    val protocol: IRProtocol,
    val codeHex: String,
    val carrierKhz: Int,
    val pulseCount: Int,
    val jitterUs: Int,
    val irType: String = "parsed",
    val addressBytes: String? = null,
    val commandBytes: String? = null,
    val rawTimingsUs: List<Int> = emptyList()
)

@Serializable
data class IrxRemoteMeta(
    val id: String,
    val name: String,
    val emoji: String = "📡",
    val mode: String = "shapes",
    val manufacturer: String = "Custom",
    val deviceType: String = "IR Remote",
    val protocol: IRProtocol = IRProtocol.NEC,
    val carrierKhz: Int = 38,
    val photo: String? = null
)

@Serializable
data class IrxButtonLayout(
    val shape: ButtonShape = ButtonShape.pill,
    val w: Int = 64,
    val h: Int = 64,
    val row: Int? = null,
    val col: Int? = null,
    val x: Float? = null,
    val y: Float? = null,
    val order: Int = 0
)

@Serializable
data class IrxButtonSignal(
    val captured: Boolean = true,
    val irType: String = "parsed",
    val codeHex: String = "0x20DF10EF",
    val addressBytes: String? = null,
    val commandBytes: String? = null,
    val frequencyHz: Int? = null,
    val dutyCycle: Float? = null,
    val rawTimingsUs: List<Int>? = null
)

@Serializable
data class IrxButtonEntry(
    val id: String,
    val label: String,
    val emoji: String? = null,
    val category: String = "mode",
    val layout: IrxButtonLayout,
    val signal: IrxButtonSignal
)

@Serializable
data class IrxDocument(
    val filetype: String = "IRX remote layout",
    val version: Int = 1,
    val remote: IrxRemoteMeta,
    val buttons: List<IrxButtonEntry>
)
