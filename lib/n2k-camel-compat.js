'use strict'

// Same SimpleCan 1.23 issue as naviop: SK 2.x canboatjs 3 emits camelCase
// 60928. Own uniqueNumber echo then looks like a NAME conflict and H5000
// walks to a new src (26, 27, 203, …).

function n2kCamelCompat (n2k, ownUnique) {
  if (!n2k || !n2k.fields) return n2k
  if (n2k.fields.PGN == null && n2k.fields.pgn != null) {
    n2k.fields.PGN = n2k.fields.pgn
  }
  if (n2k.pgn === 60928 && ownUnique != null) {
    var uid = n2k.fields.uniqueNumber != null
      ? n2k.fields.uniqueNumber
      : n2k.fields['Unique Number']
    if (uid == ownUnique) {
      n2k.src = 254
    }
  }
  return n2k
}

module.exports = n2kCamelCompat
