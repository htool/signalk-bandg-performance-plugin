'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const n2kCamelCompat = require('../lib/n2k-camel-compat')

test('ISO 59904 copies fields.pgn onto fields.PGN', () => {
  var n2k = { pgn: 59904, dst: 23, src: 30, fields: { pgn: 60928 } }
  n2kCamelCompat(n2k)
  assert.equal(n2k.fields.PGN, 60928)
  assert.equal(n2k.fields.pgn, 60928)
})

test('own 60928 echo is not treated as a peer (src 254)', () => {
  var n2k = {
    pgn: 60928,
    src: 23,
    dst: 255,
    fields: { uniqueNumber: 1731561, manufacturerCode: 'Navico' }
  }
  n2kCamelCompat(n2k, 1731561)
  assert.equal(n2k.src, 254)
})

test('peer 60928 keeps src', () => {
  var n2k = { pgn: 60928, src: 44, fields: { uniqueNumber: 1072 } }
  n2kCamelCompat(n2k, 1731561)
  assert.equal(n2k.src, 44)
})
