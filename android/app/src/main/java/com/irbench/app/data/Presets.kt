package com.irbench.app.data

import com.irbench.app.model.ButtonShape
import com.irbench.app.model.IRProtocol
import com.irbench.app.model.RemoteButton
import com.irbench.app.model.RemotePreset

object Presets {
    val QUICK_EMOJI = listOf("📺", "❄️", "🔊", "💡", "🌀", "📽️", "🎮", "📻", "🔌", "🛰️")

    fun defaultSize(shape: ButtonShape): Pair<Int, Int> = when (shape) {
        ButtonShape.circle -> 64 to 64
        ButtonShape.square -> 64 to 64
        ButtonShape.pill -> 104 to 46
        ButtonShape.bar -> 92 to 40
    }

    val BUILDER_TEMPLATES: Map<String, List<RemoteButton>> = mapOf(
        "tv" to listOf(
            RemoteButton("t-pwr", "Power", "⏻", "0x20DF10EF", 0x10EF, "power", ButtonShape.circle, 60, 60, 0, 0, captured = false),
            RemoteButton("t-src", "Input", null, "0x20DFD02F", 0xD02F, "mode", ButtonShape.pill, 92, 44, 0, 1, captured = false),
            RemoteButton("t-mute", "Mute", null, "0x20DF906F", 0x906F, "volume", ButtonShape.circle, 60, 60, 0, 2, captured = false),
            RemoteButton("t-volp", "Vol +", null, "0x20DF40BF", 0x40BF, "volume", ButtonShape.bar, 96, 42, 1, 0, captured = false),
            RemoteButton("t-chp", "Ch +", null, "0x20DF00FF", 0x00FF, "channel", ButtonShape.bar, 96, 42, 1, 1, captured = false),
            RemoteButton("t-volm", "Vol -", null, "0x20DFC03F", 0xC03F, "volume", ButtonShape.bar, 96, 42, 2, 0, captured = false),
            RemoteButton("t-chm", "Ch -", null, "0x20DF807F", 0x807F, "channel", ButtonShape.bar, 96, 42, 2, 1, captured = false),
            RemoteButton("t-up", "Up", null, "0x20DF02FD", 0x02FD, "nav", ButtonShape.square, 58, 52, 3, 1, captured = false),
            RemoteButton("t-left", "Left", null, "0x20DFE01F", 0xE01F, "nav", ButtonShape.square, 58, 58, 4, 0, captured = false),
            RemoteButton("t-ok", "OK", null, "0x20DF22DD", 0x22DD, "nav", ButtonShape.circle, 64, 64, 4, 1, captured = false),
            RemoteButton("t-right", "Right", null, "0x20DF609F", 0x609F, "nav", ButtonShape.square, 58, 58, 4, 2, captured = false),
            RemoteButton("t-down", "Down", null, "0x20DF827D", 0x827D, "nav", ButtonShape.square, 58, 52, 5, 1, captured = false)
        ),
        "ac" to listOf(
            RemoteButton("a-pwr", "Power", "⏻", "0x11DA2700", 0x2700, "power", ButtonShape.circle, 64, 64, 0, 0, captured = false),
            RemoteButton("a-eco", "Eco", null, "0x11DA2704", 0x2704, "mode", ButtonShape.pill, 92, 44, 0, 1, captured = false),
            RemoteButton("a-tp", "Temp +", null, "0x11DA272C", 0x272C, "volume", ButtonShape.bar, 96, 44, 1, 0, captured = false),
            RemoteButton("a-tm", "Temp -", null, "0x11DA2728", 0x2728, "volume", ButtonShape.bar, 96, 44, 1, 1, captured = false),
            RemoteButton("a-cool", "Cool", null, "0x11DA2731", 0x2731, "mode", ButtonShape.square, 66, 58, 2, 0, captured = false),
            RemoteButton("a-heat", "Heat", null, "0x11DA2741", 0x2741, "mode", ButtonShape.square, 66, 58, 2, 1, captured = false),
            RemoteButton("a-fan", "Fan", null, "0x11DA27A0", 0x27A0, "channel", ButtonShape.square, 66, 58, 2, 2, captured = false)
        ),
        "audio" to listOf(
            RemoteButton("s-pwr", "Power", "⏻", "0xE0E040BF", 0x40BF, "power", ButtonShape.circle, 60, 60, 0, 0, captured = false),
            RemoteButton("s-src", "Source", null, "0xE0E0807F", 0x807F, "mode", ButtonShape.pill, 94, 44, 0, 1, captured = false),
            RemoteButton("s-mute", "Mute", null, "0xE0E0F00F", 0xF00F, "volume", ButtonShape.circle, 60, 60, 0, 2, captured = false),
            RemoteButton("s-vp", "Vol +", null, "0xE0E0E01F", 0xE01F, "volume", ButtonShape.bar, 108, 44, 1, 0, captured = false),
            RemoteButton("s-vm", "Vol -", null, "0xE0E0D02F", 0xD02F, "volume", ButtonShape.bar, 108, 44, 1, 1, captured = false),
            RemoteButton("s-eq", "Sound", null, "0xE0E01AE5", 0x1AE5, "mode", ButtonShape.pill, 108, 44, 2, 0, captured = false),
            RemoteButton("s-bt", "BT Pair", null, "0xE0E0C43B", 0xC43B, "mode", ButtonShape.pill, 108, 44, 2, 1, captured = false)
        )
    )

    val REMOTE_PRESETS: List<RemotePreset> = listOf(
        RemotePreset(
            id = "lg-oled-c3",
            name = "LG OLED C3",
            emoji = "📺",
            manufacturer = "LG Electronics",
            deviceType = "Display",
            protocol = IRProtocol.NEC,
            carrierKhz = 38,
            buttons = listOf(
                RemoteButton("power", "Power", "⏻", "0x20DF10EF", 0x10EF, "power", ButtonShape.circle, 60, 60, 0, 0),
                RemoteButton("input", "HDMI", null, "0x20DFD02F", 0xD02F, "mode", ButtonShape.pill, 96, 44, 0, 1),
                RemoteButton("mute", "Mute", null, "0x20DF906F", 0x906F, "volume", ButtonShape.circle, 60, 60, 0, 2),
                RemoteButton("vol-up", "Vol +", null, "0x20DF40BF", 0x40BF, "volume", ButtonShape.bar, 102, 42, 1, 0),
                RemoteButton("ch-up", "Ch +", null, "0x20DF00FF", 0x00FF, "channel", ButtonShape.bar, 102, 42, 1, 1),
                RemoteButton("vol-dn", "Vol -", null, "0x20DFC03F", 0xC03F, "volume", ButtonShape.bar, 102, 42, 2, 0),
                RemoteButton("ch-dn", "Ch -", null, "0x20DF807F", 0x807F, "channel", ButtonShape.bar, 102, 42, 2, 1),
                RemoteButton("up", "Up", null, "0x20DF02FD", 0x02FD, "nav", ButtonShape.square, 60, 52, 3, 1),
                RemoteButton("left", "Left", null, "0x20DFE01F", 0xE01F, "nav", ButtonShape.square, 60, 60, 4, 0),
                RemoteButton("ok", "OK", null, "0x20DF22DD", 0x22DD, "nav", ButtonShape.circle, 64, 64, 4, 1),
                RemoteButton("right", "Right", null, "0x20DF609F", 0x609F, "nav", ButtonShape.square, 60, 60, 4, 2),
                RemoteButton("down", "Down", null, "0x20DF827D", 0x827D, "nav", ButtonShape.square, 60, 52, 5, 1),
                RemoteButton("home", "Home", null, "0x20DF3EC1", 0x3EC1, "mode", ButtonShape.pill, 102, 44, 6, 0),
                RemoteButton("back", "Back", null, "0x20DF14EB", 0x14EB, "nav", ButtonShape.pill, 102, 44, 6, 1)
            )
        ),
        RemotePreset(
            id = "sony-bravia-xr",
            name = "Sony Bravia",
            emoji = "📽️",
            manufacturer = "Sony",
            deviceType = "Display",
            protocol = IRProtocol.SONY_SIRC,
            carrierKhz = 40,
            buttons = listOf(
                RemoteButton("power", "Power", "⏻", "0x00000A90", 0x0A90, "power", ButtonShape.circle, 60, 60, 0, 0),
                RemoteButton("input", "Source", null, "0x00000A50", 0x0A50, "mode", ButtonShape.pill, 96, 44, 0, 1),
                RemoteButton("mute", "Mute", null, "0x00000290", 0x0290, "volume", ButtonShape.circle, 60, 60, 0, 2),
                RemoteButton("vol-up", "Vol +", null, "0x00000490", 0x0490, "volume", ButtonShape.bar, 102, 42, 1, 0),
                RemoteButton("vol-dn", "Vol -", null, "0x00000C90", 0x0C90, "volume", ButtonShape.bar, 102, 42, 1, 1),
                RemoteButton("home", "Home", null, "0x00000070", 0x0070, "mode", ButtonShape.pill, 96, 44, 2, 0),
                RemoteButton("ok", "Select", null, "0x00000A70", 0x0A70, "nav", ButtonShape.circle, 64, 64, 2, 1),
                RemoteButton("play", "Play", null, "0x00002CE9", 0x2CE9, "media", ButtonShape.pill, 96, 44, 2, 2)
            )
        ),
        RemotePreset(
            id = "samsung-q990c",
            name = "Samsung Q990C",
            emoji = "🔊",
            manufacturer = "Samsung",
            deviceType = "Audio",
            protocol = IRProtocol.SAMSUNG32,
            carrierKhz = 38,
            buttons = listOf(
                RemoteButton("power", "Power", "⏻", "0xE0E040BF", 0x40BF, "power", ButtonShape.circle, 60, 60, 0, 0),
                RemoteButton("source", "eARC", null, "0xE0E0807F", 0x807F, "mode", ButtonShape.pill, 96, 44, 0, 1),
                RemoteButton("mute", "Mute", null, "0xE0E0F00F", 0xF00F, "volume", ButtonShape.circle, 60, 60, 0, 2),
                RemoteButton("vol-up", "Vol +", null, "0xE0E0E01F", 0xE01F, "volume", ButtonShape.bar, 106, 44, 1, 0),
                RemoteButton("vol-dn", "Vol -", null, "0xE0E0D02F", 0xD02F, "volume", ButtonShape.bar, 106, 44, 1, 1),
                RemoteButton("sound-mode", "Adaptive", null, "0xE0E01AE5", 0x1AE5, "mode", ButtonShape.pill, 106, 44, 2, 0),
                RemoteButton("bt-pair", "BT Pair", null, "0xE0E0C43B", 0xC43B, "mode", ButtonShape.pill, 106, 44, 2, 1)
            )
        ),
        RemotePreset(
            id = "daikin-arc480",
            name = "Daikin HVAC",
            emoji = "❄️",
            manufacturer = "Daikin",
            deviceType = "Climate",
            protocol = IRProtocol.DAIKIN_HVAC,
            carrierKhz = 38,
            buttons = listOf(
                RemoteButton("power", "Power", "⏻", "0x11DA2700", 0x2700, "power", ButtonShape.circle, 64, 64, 0, 0),
                RemoteButton("eco", "Eco", null, "0x11DA2704", 0x2704, "mode", ButtonShape.pill, 96, 44, 0, 1),
                RemoteButton("temp-up", "Temp +", null, "0x11DA272C", 0x272C, "volume", ButtonShape.bar, 106, 44, 1, 0),
                RemoteButton("temp-dn", "Temp -", null, "0x11DA2728", 0x2728, "volume", ButtonShape.bar, 106, 44, 1, 1),
                RemoteButton("cool", "Cool", null, "0x11DA2731", 0x2731, "mode", ButtonShape.square, 68, 58, 2, 0),
                RemoteButton("heat", "Heat", null, "0x11DA2741", 0x2741, "mode", ButtonShape.square, 68, 58, 2, 1),
                RemoteButton("fan", "Fan", null, "0x11DA27A0", 0x27A0, "channel", ButtonShape.square, 68, 58, 2, 2)
            )
        ),
        RemotePreset(
            id = "apple-tv-4k",
            name = "Apple TV 4K",
            emoji = "🎮",
            manufacturer = "Apple",
            deviceType = "Streamer",
            protocol = IRProtocol.NEC,
            carrierKhz = 38,
            buttons = listOf(
                RemoteButton("menu", "Menu", null, "0x77E1C060", 0xC060, "nav", ButtonShape.pill, 96, 44, 0, 0),
                RemoteButton("home", "TV", null, "0x77E14060", 0x4060, "mode", ButtonShape.circle, 60, 60, 0, 1),
                RemoteButton("play", "Play", null, "0x77E1FA60", 0xFA60, "media", ButtonShape.pill, 96, 44, 0, 2),
                RemoteButton("up", "Up", null, "0x77E15060", 0x5060, "nav", ButtonShape.square, 60, 52, 1, 1),
                RemoteButton("ok", "Select", null, "0x77E13A60", 0x3A60, "nav", ButtonShape.circle, 66, 66, 2, 1),
                RemoteButton("down", "Down", null, "0x77E13060", 0x3060, "nav", ButtonShape.square, 60, 52, 3, 1)
            )
        ),
        RemotePreset(
            id = "lab-calibration",
            name = "IR Lab Probe",
            emoji = "📡",
            manufacturer = "Bench Suite",
            deviceType = "Diagnostics",
            protocol = IRProtocol.RC5,
            carrierKhz = 56,
            buttons = listOf(
                RemoteButton("cal-36", "36kHz Ping", null, "0x0000180C", 0x180C, "lab", ButtonShape.pill, 106, 46, 0, 0),
                RemoteButton("cal-56", "56kHz Burst", null, "0x0000183F", 0x183F, "lab", ButtonShape.pill, 106, 46, 0, 1),
                RemoteButton("cal-aa", "0xAAAA", null, "0xAAAAAAAA", 0xAAAA, "lab", ButtonShape.square, 66, 60, 1, 0),
                RemoteButton("cal-sync", "RTT Echo", null, "0x00000001", 0x0001, "lab", ButtonShape.circle, 66, 66, 1, 1),
                RemoteButton("cal-ff", "0xFFFF", null, "0xFFFFFFFF", 0xFFFF, "lab", ButtonShape.square, 66, 60, 1, 2)
            )
        )
    )

    val SAMPLE_IR_FILE = """
        Filetype: IR signals file
        Version: 1
        # Sample Bench TV Capture
        name: Power
        type: parsed
        protocol: NEC
        address: 04 00 00 00
        command: 08 00 00 00
        #
        name: Vol_Up
        type: parsed
        protocol: NEC
        address: 04 00 00 00
        command: 02 00 00 00
        #
        name: Custom_Raw_Burst
        type: raw
        frequency: 38000
        duty_cycle: 0.330000
        data: 9024 4512 564 564 564 1692 564 564 564 1692 564 564 564 564 564 1692 564 564 564
    """.trimIndent()
}
