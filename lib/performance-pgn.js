'use strict'

function padd (n, p, c) {
  var pad_char = typeof c !== 'undefined' ? c : '0'
  var pad = new Array(1 + p).join(pad_char)
  return (pad + n).slice(-pad.length)
}

function intToHex (integer) {
  return padd((integer & 0xff).toString(16), 2) + ',' + padd(((integer >> 8) & 0xff).toString(16), 2)
}

function intTo4BHex (integer) {
  return padd((integer & 0xff).toString(16), 2) + ',' +
    padd(((integer >> 8) & 0xff).toString(16), 2) + ',' +
    padd(((integer >> 16) & 0xff).toString(16), 2) + ',' +
    padd(((integer >> 24) & 0xff).toString(16), 2)
}

// Key byte 2 high nibble is the value length in bytes (B&G 130824).
function valueBytes (key) {
  return (parseInt(key.split(',')[1], 16) >> 4)
}

function pack (key, integer) {
  return valueBytes(key) === 4 ? intTo4BHex(integer) : intToHex(integer)
}

// Negative radians are two's complement (rad × 10000). Do not add 2π:
// a wrapped angle does not fit in the signed 16-bit field, so −30°
// would be stored as about −45°.
function encodeValue (unit, value, key) {
  // null/undefined become 0 under Math.trunc — that made target boat speed
  // wire as 0 m/s and blocked Zeus/Triton laylines (need keys 83 + 125).
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  switch (unit) {
    case 'rad':
    case 'signedRad':
      return pack(key, Math.trunc(value * 10000))
    case 'percent':
    case '':
      return pack(key, Math.trunc(value * 1000))
    case 'm':
    case 'celcius':
    case 'm/s':
      return pack(key, Math.trunc(value * 100))
    default:
      return null
  }
}

// Optimum Wind Angle (key 53). Signal K is signed (head up / bear away), but
// Triton2 field code 2 reads the key as unsigned ×0.0001 rad — a negative
// two's-complement count becomes ~6 rad and fails the gauge range check
// (Invalid/---). Send the magnitude. Wire 0 is also Invalid on several
// Navico gauges; bump a truncated 0 to 1 LSB (0.0001 rad ≈ 0.006°).
function encodeOptimumWindAngle (value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  let n = Math.trunc(Math.abs(value) * 10000)
  if (n === 0) n = 1
  return pack('35,20', n)
}

// Actisense data-byte count: 2-byte 7d,99 header plus the hex tail.
// Target TWA and target boat speed are on unless a saved setting turns them off.
// Both are required for Triton2/Zeus layline geometry (130824 keys 83 and 125).
// A missing or blank path uses the spec default.
// On by default: layline targets, TWD/avg TWD, and wind-angle-to-mast
// (AWA when mast rotation is 0 / no mast-angle path).
const DEFAULT_ENABLED = new Set([
  'targetBoatSpeed',
  'targetTWA',
  'trueWindDirection',
  'avgTrueWindDirection',
  'windAngleMast',
  'oppWindAngle'
])

function valueConfig (type, spec, saved) {
  const hasEnabled = saved && typeof saved.enabled === 'boolean'
  const enabled = hasEnabled ? saved.enabled : DEFAULT_ENABLED.has(type)
  let path = saved && typeof saved.path === 'string' ? saved.path : ''
  if (!path || path === 'n/a') path = spec.defaultPath || ''
  return {
    enabled: enabled,
    path: path,
    source: saved ? saved.source : undefined
  }
}

// Signal K true wind angle is signed (negative to port). PGN 130306
// Wind Angle is unsigned radians 0..2π.
function trueWindAngleForPgn (angle) {
  if (typeof angle !== 'number' || !Number.isFinite(angle)) return null
  return angle < 0 ? angle + Math.PI * 2 : angle
}

function actisenseWithSrc (msg, src) {
  if (!msg) return null
  // canboatjs may leave src as 0; force the requested source address.
  const parts = msg.split(',')
  if (parts.length < 6) return msg
  parts[3] = String(src)
  return parts.join(',')
}

// Actisense line for 130306 True (boat referenced). src is rewritten by
// the caller for H5000 emulation.
function encodeTrueWind130306 (angle, speed, src) {
  const wireAngle = trueWindAngleForPgn(angle)
  if (wireAngle == null || typeof speed !== 'number' || !Number.isFinite(speed)) {
    return null
  }
  const { pgnToActisenseSerialFormat } = require('@canboat/canboatjs')
  return actisenseWithSrc(pgnToActisenseSerialFormat({
    pgn: 130306,
    prio: 2,
    dst: 255,
    src: src,
    fields: {
      'Wind Speed': speed,
      'Wind Angle': wireAngle,
      'Reference': 'True (boat referenced)'
    }
  }), src)
}

// Direction from North: 130306 Reference = True (ground referenced to North).
// Navico "True Wind Direction" instruments use this; B&G key 89 alone is not enough
// when the plotter calculates TWD from heading+TWA and variation on 127250 is void.
function encodeTrueWindDirection130306 (direction, speed, src) {
  if (typeof direction !== 'number' || !Number.isFinite(direction)) return null
  if (typeof speed !== 'number' || !Number.isFinite(speed)) return null
  let wire = direction % (Math.PI * 2)
  if (wire < 0) wire += Math.PI * 2
  const { pgnToActisenseSerialFormat } = require('@canboat/canboatjs')
  return actisenseWithSrc(pgnToActisenseSerialFormat({
    pgn: 130306,
    prio: 2,
    dst: 255,
    src: src,
    fields: {
      'Wind Speed': speed,
      'Wind Angle': wire,
      'Reference': 'True (ground referenced to North)'
    }
  }), src)
}

function payloadLength (dataHex) {
  if (!dataHex) return 2
  return dataHex.split(',').length + 1
}

// ISO 11783 29-bit id. 130824 is PDU2, so dst is not in the id.
function canIdForPgn (prio, pgn, src) {
  return ((prio & 7) << 26) | ((pgn & 0x1ffff) << 8) | (src & 0xff)
}

// Fast-packet frames. 0xff fills only the unused CAN bytes, not the PGN payload.
function fastPacketFrames (payload) {
  const frames = []
  let bucket = 0x40
  const first = Buffer.alloc(8, 0xff)
  first[0] = bucket++
  first[1] = payload.length
  payload.copy(first, 2, 0, Math.min(6, payload.length))
  frames.push(first)
  for (let index = 6; index < payload.length; index += 7) {
    const next = Buffer.alloc(8, 0xff)
    next[0] = bucket++
    const end = Math.min(index + 7, payload.length)
    payload.copy(next, 1, index, end)
    frames.push(next)
  }
  return frames
}

module.exports = {
  encodeValue,
  valueConfig,
  trueWindAngleForPgn,
  encodeTrueWind130306,
  encodeTrueWindDirection130306,
  encodeOptimumWindAngle,
  payloadLength,
  canIdForPgn,
  fastPacketFrames,
  valueBytes
}
