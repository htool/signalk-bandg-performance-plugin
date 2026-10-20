'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
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
} = require('../lib/performance-pgn')

test('target TWA and target boat speed are sent unless turned off', () => {
  assert.deepEqual(valueConfig('targetBoatSpeed', { defaultPath: 'performance.targetSpeed' }, undefined), {
    enabled: true,
    path: 'performance.targetSpeed',
    source: undefined
  })
  assert.deepEqual(valueConfig('targetTWA', { defaultPath: 'performance.targetAngle' }, undefined), {
    enabled: true,
    path: 'performance.targetAngle',
    source: undefined
  })
  assert.equal(valueConfig('targetBoatSpeed', { defaultPath: 'performance.targetSpeed' }, { enabled: false, path: 'performance.targetSpeed' }).enabled, false)
  assert.equal(valueConfig('targetTWA', { defaultPath: 'performance.targetAngle' }, { enabled: false }).enabled, false)
  assert.equal(valueConfig('vmg', { defaultPath: 'performance.velocityMadeGood' }, undefined).enabled, false)
  assert.equal(valueConfig('avgTrueWindDirection', { defaultPath: 'environment.wind.directionTrue' }, undefined).enabled, true)
  assert.equal(valueConfig('windAngleMast', { defaultPath: 'environment.wind.angleApparent' }, undefined).enabled, true)
  assert.equal(valueConfig('oppWindAngle', { defaultPath: 'performance.optimumWindAngle' }, undefined).enabled, true)
})

test('wind angle to mast uses signed AWA scale', () => {
  const rad = -30 * Math.PI / 180
  assert.equal(encodeValue('signedRad', rad, '9d,20'), '8d,eb')
})

test('optimum wind angle never encodes wire zero (Navico Invalid)', () => {
  assert.equal(encodeOptimumWindAngle(0), '01,00')
  assert.equal(encodeOptimumWindAngle(-0.00001), '01,00')
  assert.equal(encodeOptimumWindAngle(0.00001), '01,00')
})

test('optimum wind angle is magnitude only (Triton unsigned field code 2)', () => {
  const rad = -30 * Math.PI / 180
  // Negative SK error must not go out as two's complement (Triton → Invalid).
  assert.equal(encodeOptimumWindAngle(rad), '73,14')
  assert.equal(encodeOptimumWindAngle(-rad), '73,14')
  assert.equal(encodeOptimumWindAngle(-0.1234), encodeOptimumWindAngle(0.1234))
})

test('encodeValue ignores null so layline target speed is not sent as 0', () => {
  assert.equal(encodeValue('m/s', null, '7d,20'), null)
  assert.equal(encodeValue('m/s', undefined, '7d,20'), null)
  assert.equal(encodeValue('m/s', NaN, '7d,20'), null)
  assert.equal(encodeValue('m/s', 3.72, '7d,20'), '74,01')
})

test('negative target TWA stays a signed 16-bit radian count', () => {
  const rad = -30 * Math.PI / 180
  const hex = encodeValue('signedRad', rad, '53,20')
  assert.equal(hex, '8d,eb')
  const [lo, hi] = hex.split(',').map((s) => parseInt(s, 16))
  const raw = ((hi << 8) | lo) > 0x7fff ? ((hi << 8) | lo) - 0x10000 : ((hi << 8) | lo)
  assert.ok(Math.abs(raw / 10000 - rad) < 0.0002)
})

test('180 degree target TWA matches an H5000 capture', () => {
  assert.equal(encodeValue('signedRad', Math.PI, '53,20'), 'b7,7a')
})

test('true wind direction key 89 encodes radians × 10000', () => {
  // canboat mixed-format Average TWD sample: bytes 56,5e = 24150 → 2.415 rad
  assert.equal(encodeValue('rad', 2.415, '59,20'), '56,5e')
  assert.equal(valueBytes('59,20'), 2)
})

test('polar percentage, polar speed and VMG use the H5000 scales', () => {
  assert.equal(encodeValue('percent', 1.033, '7c,20'), '09,04')
  assert.equal(encodeValue('m/s', 3.91, '7e,20'), '87,01')
  assert.equal(encodeValue('m/s', 3.77, '7f,20'), '79,01')
  assert.equal(encodeValue('m/s', 3.72, '7d,20'), '74,01')
})

test('32-bit keys carry four value bytes', () => {
  assert.equal(valueBytes('38,40'), 4)
  assert.equal(encodeValue('m', 1.25, '38,40'), '7d,00,00,00')
  assert.equal(valueBytes('31,41'), 4)
  assert.equal(encodeValue('m', -1.5, '31,41'), '6a,ff,ff,ff')
})

test('payload length counts the header and not trailing ff', () => {
  const tail = ',53,20,b7,7a'
  assert.equal(payloadLength(tail), 6)
  assert.equal(payloadLength(',38,40,7d,00,00,00,7f,20,79,01'), 12)
})

test('a short 130824 is one fast packet whose length excludes CAN padding', () => {
  const payload = Buffer.from([0x7d, 0x99, 0x53, 0x20, 0xb7, 0x7a])
  const frames = fastPacketFrames(payload)
  assert.equal(frames.length, 1)
  assert.equal(frames[0][0], 0x40)
  assert.equal(frames[0][1], 6)
  assert.deepEqual([...frames[0].subarray(2)], [...payload])
})

test('eight data bytes still declare length 8 on the fast packet', () => {
  const payload = Buffer.from([0x7d, 0x99, 0x38, 0x40, 0x7d, 0x00, 0x00, 0x00])
  const frames = fastPacketFrames(payload)
  assert.equal(frames.length, 2)
  assert.equal(frames[0][1], 8)
  assert.equal(frames[1][0], 0x41)
  assert.equal(frames[1][1], 0x00)
  assert.equal(frames[1][2], 0x00)
  assert.equal(frames[1][3], 0xff)
})

test('130824 CAN id is priority 3 PDU2', () => {
  assert.equal(canIdForPgn(3, 130824, 38), 0x0dff0826)
})

test('true wind angle wraps negative Signal K radians for 130306', () => {
  assert.equal(trueWindAngleForPgn(-Math.PI / 2), 1.5 * Math.PI)
  assert.equal(trueWindAngleForPgn(1.2), 1.2)
  assert.equal(trueWindAngleForPgn(undefined), null)
})

test('true wind 130306 Actisense uses Reference True (boat) and requested src', () => {
  const msg = encodeTrueWind130306(-0.34668530717958657, 6.69, 23)
  assert.match(msg, /^[^,]+,2,130306,23,255,8,/)
  const bytes = msg.split(',').slice(6).map((h) => parseInt(h, 16))
  assert.equal(bytes[5] & 0x07, 3)
})

test('true wind direction 130306 uses ground/North reference', () => {
  const rad = 268 * Math.PI / 180
  const msg = encodeTrueWindDirection130306(rad, 11.5, 200)
  assert.match(msg, /^[^,]+,2,130306,200,255,8,/)
  const bytes = msg.split(',').slice(6).map((h) => parseInt(h, 16))
  assert.equal(bytes[5] & 0x07, 0)
  const ang = bytes[3] | (bytes[4] << 8)
  assert.ok(Math.abs(ang / 10000 - rad) < 0.001)
})
