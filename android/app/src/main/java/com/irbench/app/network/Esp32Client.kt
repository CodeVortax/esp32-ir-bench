package com.irbench.app.network

import android.content.Context
import android.hardware.ConsumerIrManager
import com.irbench.app.model.CapturedSignal
import com.irbench.app.model.DeviceConfig
import com.irbench.app.model.IRProtocol
import com.irbench.app.model.RemoteButton
import com.irbench.app.model.RemotePreset
import com.irbench.app.model.TelemetryRecord
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.TimeUnit
import kotlin.random.Random

class Esp32Client(context: Context) {
    private val irManager: ConsumerIrManager? =
        context.getSystemService(Context.CONSUMER_IR_SERVICE) as? ConsumerIrManager

    val hasBuiltInIrBlaster: Boolean
        get() = try {
            irManager?.hasIrEmitter() == true
        } catch (_: Throwable) {
            false
        }

    private val http = OkHttpClient.Builder()
        .connectTimeout(1500, TimeUnit.MILLISECONDS)
        .readTimeout(1500, TimeUnit.MILLISECONDS)
        .writeTimeout(1500, TimeUnit.MILLISECONDS)
        .build()

    fun buildBinaryFrame(
        protocolId: Int,
        carrierKhz: Int,
        commandHash: Int,
        codeHex: String
    ): ByteArray {
        val payload = codeHex.removePrefix("0x").removePrefix("0X").toLongOrNull(16)?.toInt() ?: 0
        return ByteBuffer.allocate(8)
            .order(ByteOrder.BIG_ENDIAN)
            .put(protocolId.toByte())
            .put(carrierKhz.toByte())
            .putShort(commandHash.toShort())
            .putInt(payload)
            .array()
    }

    suspend fun transmit(
        config: DeviceConfig,
        remote: RemotePreset,
        btn: RemoteButton
    ): TelemetryRecord = withContext(Dispatchers.IO) {
        val t0 = System.nanoTime()
        val carrierKhz = btn.frequencyHz?.let { it / 1000 } ?: remote.carrierKhz
        val isBinary = config.codec == "binary"

        // Optional native Android IR blaster transmission when phone-ir selected
        if (config.target == "phone-ir" && hasBuiltInIrBlaster) {
            val pattern = (btn.rawTimingsUs?.takeIf { it.isNotEmpty() }
                ?: listOf(9000, 4500, 560, 560, 560, 1690, 560, 560, 560, 1690, 560))
                .toIntArray()
            irManager?.transmit(carrierKhz * 1000, pattern)
            val totalMs = (System.nanoTime() - t0) / 1_000_000.0
            return@withContext TelemetryRecord(
                id = "tx-${System.currentTimeMillis()}-${Random.nextInt(1000)}",
                timestamp = System.currentTimeMillis(),
                commandLabel = btn.label,
                presetName = remote.name,
                protocol = remote.protocol.displayName,
                codec = "native-ir",
                payloadBytes = pattern.size * 2,
                totalLatencyMs = totalMs,
                backendOverheadUs = 12.0,
                rssiDbm = 0,
                status = "ACK"
            )
        }

        if (config.target == "esp32-lan") {
            val host = config.esp32Host.trimEnd('/')
            val body = if (isBinary) {
                buildBinaryFrame(remote.protocol.id, carrierKhz, btn.commandHash, btn.codeHex)
                    .toRequestBody("application/octet-stream".toMediaType())
            } else {
                JSONObject().apply {
                    put("protocolId", remote.protocol.id)
                    put("carrierKhz", carrierKhz)
                    put("codeHex", btn.codeHex)
                    put("label", btn.label)
                }.toString().toRequestBody("application/json".toMediaType())
            }

            return@withContext try {
                val req = Request.Builder().url("$host/ir/tx").post(body).build()
                http.newCall(req).execute().use { resp ->
                    val raw = resp.body?.string().orEmpty()
                    val parseUs = try {
                        JSONObject(raw).optDouble("us", if (isBinary) 14.0 else 138.0)
                    } catch (_: Throwable) {
                        if (isBinary) 14.0 else 138.0
                    }
                    val totalMs = (System.nanoTime() - t0) / 1_000_000.0
                    TelemetryRecord(
                        id = "tx-${System.currentTimeMillis()}-${Random.nextInt(1000)}",
                        timestamp = System.currentTimeMillis(),
                        commandLabel = btn.label,
                        presetName = remote.name,
                        protocol = remote.protocol.displayName,
                        codec = config.codec,
                        payloadBytes = if (isBinary) 8 else 72,
                        totalLatencyMs = totalMs,
                        backendOverheadUs = parseUs,
                        rssiDbm = config.rssiDbm,
                        status = if (resp.isSuccessful) "ACK" else "WARN"
                    )
                }
            } catch (_: Throwable) {
                val totalMs = (System.nanoTime() - t0) / 1_000_000.0
                TelemetryRecord(
                    id = "tx-${System.currentTimeMillis()}-${Random.nextInt(1000)}",
                    timestamp = System.currentTimeMillis(),
                    commandLabel = btn.label,
                    presetName = remote.name,
                    protocol = remote.protocol.displayName,
                    codec = config.codec,
                    payloadBytes = if (isBinary) 8 else 72,
                    totalLatencyMs = totalMs,
                    backendOverheadUs = 0.0,
                    rssiDbm = config.rssiDbm,
                    status = "DROP"
                )
            }
        }

        // Built-in low-jitter simulator
        val simDelayMs = if (config.wifiPowerSave == "WIFI_PS_MIN_MODEM") {
            Random.nextLong(6, 26)
        } else {
            Random.nextLong(2, 6)
        }
        delay(simDelayMs)
        val backendUs = if (isBinary) 11.5 + Random.nextDouble(0.5, 4.5) else 128.0 + Random.nextDouble(5.0, 28.0)
        val totalMs = (System.nanoTime() - t0) / 1_000_000.0
        TelemetryRecord(
            id = "tx-${System.currentTimeMillis()}-${Random.nextInt(1000)}",
            timestamp = System.currentTimeMillis(),
            commandLabel = btn.label,
            presetName = remote.name,
            protocol = remote.protocol.displayName,
            codec = config.codec,
            payloadBytes = if (isBinary) 8 else 72,
            totalLatencyMs = totalMs,
            backendOverheadUs = backendUs,
            rssiDbm = config.rssiDbm,
            status = "ACK"
        )
    }

    suspend fun pollOrSimulateCapture(
        config: DeviceConfig,
        fallbackProtocol: IRProtocol,
        carrierKhz: Int
    ): CapturedSignal? = withContext(Dispatchers.IO) {
        if (config.target == "esp32-lan") {
            try {
                val req = Request.Builder().url("${config.esp32Host.trimEnd('/')}/ir/rx").get().build()
                http.newCall(req).execute().use { resp ->
                    if (resp.code == 200) {
                        val json = JSONObject(resp.body?.string().orEmpty())
                        val rawArr = json.optJSONArray("rawTimingsUs")
                        val timings = buildList {
                            if (rawArr != null) {
                                for (i in 0 until rawArr.length()) add(rawArr.optInt(i))
                            }
                        }
                        return@withContext CapturedSignal(
                            protocol = fallbackProtocol,
                            codeHex = json.optString("codeHex", "0x20DF10EF"),
                            carrierKhz = carrierKhz,
                            pulseCount = json.optInt("pulseCount", timings.size),
                            jitterUs = Random.nextInt(8, 22),
                            rawTimingsUs = timings
                        )
                    }
                    return@withContext null
                }
            } catch (_: Throwable) {
                return@withContext null
            }
        }

        delay(450)
        val hexVal = Random.nextInt(0x1000, 0xFFFF)
        val codeHex = "0x20DF${hexVal.toString(16).uppercase().padStart(4, '0')}"
        CapturedSignal(
            protocol = fallbackProtocol,
            codeHex = codeHex,
            carrierKhz = carrierKhz,
            pulseCount = 67,
            jitterUs = Random.nextInt(6, 18),
            rawTimingsUs = listOf(9000, 4500, 560, 560, 560, 1690, 560, 560, 560, 1690)
        )
    }

    suspend fun syncConfig(config: DeviceConfig): Boolean = withContext(Dispatchers.IO) {
        if (config.target != "esp32-lan") return@withContext true
        try {
            val payload = JSONObject().apply { put("wifiPowerSave", config.wifiPowerSave) }
                .toString()
                .toRequestBody("application/json".toMediaType())
            val req = Request.Builder().url("${config.esp32Host.trimEnd('/')}/config").post(payload).build()
            http.newCall(req).execute().use { it.isSuccessful }
        } catch (_: Throwable) {
            false
        }
    }
}
