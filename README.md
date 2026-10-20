# B&G performance plugin

Sends B&G proprietary **PGN 130824** so Vulcan, Zeus and Triton2 can show performance data. Each enabled value is one key/value pair inside that PGN. With multiple sources on a path, set the source per value.

Target TWA (`performance.targetAngle`) and target boat speed (`performance.targetSpeed`) are sent by default. Turn either off in the plugin settings to stop it. Every other value stays off until enabled.

To change the display name of User 1–32 and Remote 0–9 see [the rename plugin](https://www.npmjs.com/package/signalk-bandg-user-remote-rename).

130824 is not the polar curve. Chart / instrument laylines still need true wind on PGN 130306. Enable **True Wind Angle** and **True Wind Speed** in this plugin (defaults off; paths `environment.wind.angleTrueWater` / `environment.wind.speedTrue`) to emit 130306 with Reference = True (boat). Enable **True Wind Direction** (`environment.wind.directionTrue`) for 130824 key 89 and a second 130306 with Reference = True (ground referenced to North) — that is what Navico TWD instruments use. With emulate on, those frames are sent from the H5000 address. Zeus Polar-mode laylines also need the stored B&G polar calibration table when no live target TWA has arrived yet.

## PGN 130824

Fast packet, priority 3, destination 255. The plugin transmits a **full** key set every 200 ms. Do not send a partial 130824 (e.g. only Optimum Wind Angle) from the same source address — Navico replaces the previous sample, so omitted keys go Invalid/`---`. H5000 captures use the same priority and the same header.

Actisense line:

```text
<time>,3,130824,<src>,255,<len>,7d,99,<key>,<value>,...
```

`<len>` is the number of data bytes, including `7d,99`. It is not padded. `ff` bytes appear only in the unused bytes of the last CAN frame, and they are not part of `<len>`.

In H5000-emulation mode the plugin always emits 130824 as a fast packet, including when the payload is 8 bytes or fewer. A short single frame is not reassembled as this PGN.

### Header

| Bytes | Meaning |
|---|---|
| `7d,99` | Little-endian `0x997D`. Low 11 bits are manufacturer 381 (B&G). The next 2 bits are the reserved field, set to `11` on real H5000 traffic (canboat’s theoretical “reserved = 0” form would be `7d,81`, which H5000 does not send). Top 3 bits are industry 4 (marine). |

### Key and value

Pairs follow the header. Each pair is:

| Field | Width | Meaning |
|---|---|---|
| Key | 12 bits | B&G data id. Little-endian, in the low 12 bits of the first two bytes. |
| Length | 4 bits | Value length in bytes. High nibble of the second byte. `2` = 16-bit value, `4` = 32-bit value. |
| Value | 2 or 4 bytes | Little-endian integer. Signed fields are two’s complement. |

`7e,20` is key 126 (`0x07E`) and a 2-byte value. `38,40` is key 56 (`0x038`) and a 4-byte value. The length nibble is how many bytes the receiver must consume. A 32-bit value written as 16 bits shifts every later pair in the same packet.

### Scales

Signal K values are converted with `Math.trunc` (toward zero), then written little-endian.

| Plugin unit | Wire integer | Resolution on the bus |
|---|---|---|
| `rad`, `signedRad` | radians × 10000 | 0.0001 rad |
| `m/s` | m/s × 100 | 0.01 m/s |
| `m` | metres × 100 | 0.01 m |
| `percent` | ratio × 1000 | 0.1% (ratio 1.0 → 1000 → 100.0%) |
| empty (loads) | number × 1000 | 0.001 |
| `celcius` | number × 100 | see temperatures below |

Negative angles are **not** wrapped through 2π. Adding 2π produces a count around 60000, which does not fit in a signed 16-bit field, so −30° would be decoded as about −45°. The wire value for −30° is `8d,eb` (−5236 × 0.0001 rad). A positive 180° target is `b7,7a` (31415), which is what an H5000 sends.

Signed 16-bit angles cover about −180° to +180°. 180° itself still fits (31415 < 32767).

### What Zeus does with the performance keys

From MFDApp 66.1.9. These five keys are fields of 130824 and nothing else:

| Value | Key | Zeus data id | How Zeus uses it |
|---|---|---|---|
| Target TWA | 83 | `0xe3` | Target TWA readout while the sample is under 20 s old |
| Target boat speed | 125 | `0xe9` | Same 20 s rule, paired with target TWA |
| Polar performance | 124 | `0xf0` | Instrument value as soon as the PGN arrives |
| Polar speed | 126 | `0xef` | Instrument value as soon as the PGN arrives |
| VMG to wind | 127 | `0xea` | Instrument value as soon as the PGN arrives |

The 20 s check is `received_at + 20000` against the display’s millisecond clock (`0x4E20`). A sample older than that is dropped. It is not replaced from the polar table. After either target has been seen once, a stale sample stays invalid rather than falling back to the table. If target TWA has never arrived, Zeus will calculate it from the calibration table only for layline target-angle option 3.

**Chart → Laylines → Targets → True wind angle → Actual** tells the MFD to use the live Target TWA from the network (this plugin’s 130824 key 83 / data id `0xe3`), together with true wind on 130306 and target boat speed key 125. That is the mode that matches Signal K → this plugin. The alternatives are fixed upwind/downwind angles (`LaylineUpwindAngle` / `LaylineDownwindAngle` in settings) or a polar / targets table under `NOS/userdata/Polars` (“Edit Targets Table”). Actual does **not** read polar performance, polar speed, or VMG for geometry.

Also turn **Boat laylines** on. On the chart page, enable the **SailSteer overlay** (`SailSteerOverlay`) or the lines stay off even when the bus data is valid. If **Tidal flow correction** is on, Zeus also needs current set/drift on PGN 130577.

VMG, polar percentage and polar speed are not read by the layline or polar-table code. Sending them does not draw Polar laylines and does not load the polar.

### What Triton2 needs for Laylines

From InstrumentApp 57.3.163 (`~/tmp/Triton2`). Drawing uses the same 130824 keys as Zeus (83 and 125, 20 s freshness) plus true wind on PGN 130306 (data id 140). The sail-steer / Laylines widget will not switch the layline view on until both target TWA and true wind are valid. Target boat speed must be a positive value — a missing/`null` Signal K `performance.targetSpeed` must not be sent as 0 m/s on key 125 (that keeps laylines off). The plugin derives target speed from `targetVelocityMadeGood / cos(targetAngle)` when the polar path is null.

The Laylines **menu page** is a separate gate. `OnCheckModesTimer` keeps `eSystemType` in {1, 2, 3} only while PGN **65305** from the selected performance source refreshes within 3 s:

| Payload check | Required |
|---|---|
| Bytes 0–1 | Navico manufacturer 1857 (`41,9f`) |
| Byte 3 | `0x17` |
| Bytes 4–7 | Mode word with bit 4 set and bit 9 clear (system type 2) |
| Sender ISO NAME | Must match `SelectedDevice` slot 14 (high dword masked with `0xF0FFFF00`) |

The keepalive payload is **not** the device NAME. Slot 14 is filled when this device is chosen as the source for Target TWA (data id 227) or target boat speed (233). On a blank Triton2, open the data-source UI once and pick the emulated H5000 for Target TWA; after that the 1 Hz keepalive keeps the menu open.

Emulate mode already claims product code 246 / `H5000 CPU`, sends 65305 every second, and rebroadcasts 130306 (and related PGNs) from the emulated address. Enable emulate on canbus for the Laylines screen; enable Target TWA + Target boat Speed (defaults) so the geometry has data.

Triton field code 2 for target TWA is an unsigned 16-bit × 0.0001 rad conversion. Prefer a positive target angle (0–π). A negative two’s-complement count is read as a large positive angle on Triton2 even though Zeus treats the same bytes as signed. Optimum Wind Angle (key 53) uses the same unsigned decode on Triton2: a negative count falls outside the gauge range and shows Invalid/`---`, so the plugin sends `abs(optimumWindAngle)` (and never wire 0).

Worked bytes, H5000 scale:

| Signal K | Key bytes | Example | On the wire |
|---|---|---|---|
| `performance.targetAngle` = π rad | `53,20` | 180° | `b7,7a` |
| `performance.targetAngle` = −30° | `53,20` | −0.5236 rad | `8d,eb` |
| `performance.targetSpeed` = 3.72 m/s | `7d,20` | 372 | `74,01` |
| `performance.polarSpeedRatio` = 1.033 | `7c,20` | 1033 | `09,04` (103.3%) |
| `performance.polarSpeed` = 3.91 m/s | `7e,20` | 391 | `87,01` |
| `performance.velocityMadeGood` = 3.77 m/s | `7f,20` | 377 | `79,01` |

One target-TWA value is six data bytes: `7d,99,53,20,b7,7a`. The fast-packet length byte is 6. The CAN frame is `40,06,7d,99,53,20,b7,7a` (sequence `0x40`, then the six payload bytes).

## Keys this plugin sends

“Canboat” is the `BANDG_KEY_VALUE` name in canboat. Where it differs from the plugin label, the bus id is still the number in the Key column.

| Plugin value | Signal K path | Key | Bytes | Encoding | Canboat name |
|---|---|---:|---:|---|---|
| Target TWA | `performance.targetAngle` | 83 | 2 | signed, 0.0001 rad | Target TWA |
| Target boat speed | `performance.targetSpeed` | 125 | 2 | 0.01 m/s | Target Boat Speed |
| Polar performance | `performance.polarSpeedRatio` | 124 | 2 | signed, 0.1% | Polar Performance |
| Polar boat speed | `performance.polarSpeed` | 126 | 2 | 0.01 m/s | Polar Speed |
| Velocity made good | `performance.velocityMadeGood` | 127 | 2 | 0.01 m/s | VMG to Wind |
| VMG performance | `performance.velocityMadeGoodRatio` | 285 | 2 | signed, 0.1% | VMG Performance |
| Optimum wind angle | `performance.optimumWindAngle` | 53 | 2 | magnitude, 0.0001 rad (Triton unsigned; negatives → Invalid) | Optimum Wind Angle |
| Tacking performance | | 50 | 2 | signed, 0.1% | Tacking Performance |
| Heading on opposite tack | `performance.tackTrue` | 154 | 2 | signed, 0.0001 rad | Heading on Opposite Tack |
| Opposite tack target heading | `performance.tackTrue` | 307 | 2 | signed, 0.0001 rad | Opposite Tack Target Heading |
| Opposite tack COG | | 306 | 2 | signed, 0.0001 rad | Opposite Tack COG |
| Course | `navigation.courseOverGroundTrue` | 105 | 2 | signed, 0.0001 rad | Course |
| Leeway | `navigation.leewayAngle` | 130 | 2 | signed, 0.0001 rad | Leeway Angle |
| True wind direction | `environment.wind.directionTrue` | 89 | 2 | signed, 0.0001 rad | True Wind Direction |
| Average true wind direction | `environment.wind.directionTrue` | 336 | 2 | signed, 0.0001 rad | Average True Wind Direction |
| Wind angle to mast | `environment.wind.angleApparent` | 157 | 2 | signed, 0.0001 rad | Wind Angle to Mast (0° mast rotation = AWA) |
| Wind phase | | 337 | 2 | signed, 0.0001 rad | Wind Phase |
| Wind lift | | 338 | 2 | signed, 0.0001 rad | Wind Lift |
| Ground wind direction | `environment.wind.directionGround` | 311 | 2 | signed, 0.0001 rad | Ground Wind Direction |
| Ground wind speed | `environment.wind.speedOverGround` | 312 | 2 | 0.01 m/s | Ground Wind Speed |
| Next leg bearing | | 309 | 2 | signed, 0.0001 rad | Next Leg Bearing |
| Next leg target speed | | 310 | 2 | 0.01 m/s | Next Leg Target Speed |
| Mast rake | | 308 | 2 | signed, 0.0001 rad | Mast Rake |
| Plow angle | | 291 | 2 | signed, 0.0001 rad | Plow Angle |
| Tide rate | | 131 | 2 | 0.01 m/s | Current Drift |
| Tide set | | 132 | 2 | signed, 0.0001 rad | Current Set |
| Dead reckoning bearing | | 211 | 2 | signed, 0.0001 rad | DR Bearing |
| Dead reckoning distance | | 129 | 4 | 0.01 m | DR Distance |
| Bias advantage | | 305 | 4 | 0.01 m | Bias Advantage (canboat marks this unsigned) |
| Chain length | | 284 | 4 | 0.01 m | Chain Length |
| Code zero load | | 298 | 4 | 0.001 | Code Zero Load |
| Cunningham | | 292 | 4 | 0.001 | Cunningham |
| Outhaul load | | 290 | 4 | 0.001 | Outhaul Load |
| Heel angle | `navigation.attitude` roll | 52 | 2 | 0.0001 rad | Magnetic Variation |
| Trim angle | `navigation.attitude` pitch | 155 | 2 | 0.0001 rad | Attitude Roll |
| Jacuzzi temperature | `environment.jacuzzi.temperature` | 293 | 2 | value × 100 | Jacuzzi Temperature, 0.01 K |
| Pool temperature | `environment.pool.temperature` | 294 | 2 | value × 100 | Pool Temperature, 0.01 K |
| User 1–4 | | 56–59 | 4 | signed, 0.01 | User 1–4 |
| User 5–16 | | 16–27 | 4 | signed, 0.01 | User 5–16 |
| User 17–32 | | 317–332 | 4 | signed, 0.01 | User 17–32 |
| Remote 0 | | 223 | 2 | value × 100 | not in canboat |
| Remote 1–6 | | 239–244 | 2 | value × 100 | canboat Remote 0–5, resolution 0.001 |
| Remote 8–9 | | 246–247 | 2 | value × 100 | canboat Remote 7–8. There is no Remote 7 in this plugin. |

Heel is sent on key 52, which canboat calls magnetic variation. Trim (pitch) is sent on key 155, which canboat calls attitude roll. Jacuzzi and pool are multiplied by 100 and not converted from Celsius to kelvin. Remote 1 is canboat’s Remote 0; the plugin’s Remote 0 (key 223) is not in the canboat list.
