const util = require('util')
const _ = require('lodash')
var n2kCamelCompat = require('./lib/n2k-camel-compat')
const {
  encodeValue,
  valueConfig,
  encodeTrueWind130306,
  encodeTrueWindDirection130306,
  encodeOptimumWindAngle,
  canIdForPgn,
  fastPacketFrames
} = require('./lib/performance-pgn')
var H5000_UNIQUE_NUMBER = 1731561
var globalOptions = []
const performancePGN = '%s,3,130824,%s,255,%s,7d,99'
// Navico proprietary modes keepalive. Same shape as a real H5000 CPU
// (canboat sample triton-engine-setup.all src 38). Byte 3 must be 0x17;
// mode word bit 4 set keeps Triton2/Zeus eSystemType in {1,2,3} so the
// Laylines menu stays offered. Compared against the sender's ISO NAME in
// SelectedDevice slot 14 — not against these payload bytes.
const keepAlivePGN = '%s,7,65305,%s,255,8,41,9f,01,17,18,09,00,00'

module.exports = function (app) {
  var plugin = {}
  var unsubscribes = []
  var timers = []
  var sourceAddress = 1
  var simpleCan
  var duplicatePGNs = [130306, 128259, 129284,     127250,  129283]
      //               Wind  , STW   , navigation, heading, XTE

  plugin.id = 'signalk-bandg-performance-plugin';
  plugin.name = 'B&G performance PGN plugin';
  plugin.description = 'Send B&G performance PGNs to display on Vulcan/Zeus/Triton2';

  var schema = {
    // The plugin schema
    properties: {
      'null': {
        'title': 'Select which data to send and what to use as path and source device. Source device can be specified when a path has multiple value sources. For explanations of the data you can check the B&G H5000 Operation manual here:\nhttps://softwaredownloads.navico.com/BG/downloads/documents/H5000_OM_EN_988-10630-002_w.pdf',
        'type': 'null',
      },
      emulate: {
        type: "boolean",
        title: "Enabled B&G H5000 device emulation to enable Laylines screen on Triton2 (only on canbus)"
      },
      candevice: {
        type: "string",
        title: "Candevice to use for B&G H5000 device emulation (leave empty for autodetect)"
      },
      sourceAddress: {
        type: "number",
        title: "Source device id for B&G H5000 device emulation to use.",
        default: 14
      },
      
    }
  }

  let supportedValues = {

    'avgTrueWindDirection': {
      'name'        : 'Average True Wind Direction (rad)',
      'key'         : '50,21',
      'unit'        : 'rad',
      'defaultPath' : 'environment.wind.directionTrue'
    },

    'trueWindDirection': {
      'name'        : 'True Wind Direction (rad) — 130824 key 89 + 130306 ground',
      'key'         : '59,20',
      'unit'        : 'rad',
      'defaultPath' : 'environment.wind.directionTrue'
    },

    'biasAdvantage': {
      'name'        : 'Bias Advantage (m)',
      'key'         : '31,41',
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'chainLength': {
      'name'        : 'Chain Length (m)',
      'key'         : '1c,41',
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'codeZeroLoad': {
      'name'        : 'Code Zero Load',
      'key'         : '2a,41',
      'unit'        : '',
      'defaultPath' : ''
    },

    'course': {
      'name'        : 'Course (rad)',
      'key'         : '69,20',
      'unit'        : 'rad',
      'defaultPath' : 'navigation.courseOverGroundTrue'
    },

    'cunningham': {
      'name'        : 'Cunningham',
      'key'         : '24,41',
      'unit'        : '',
      'defaultPath' : ''
    },

    'drBearing': {
      'name'        : 'Dead Reckoning bearing (rad)',
      'key'         : 'd3,20',
      'unit'        : 'rad',
      'defaultPath' : ''
    },

    'drDistance': {
      'name'        : 'Dead Reckoning Distance (m)',
      'key'         : '81,40',
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'groundWindDirection': {
      'name'        : 'Ground Wind Direction (rad)',
      'key'         : '37,21',
      'unit'        : 'rad',
      'defaultPath' : 'environment.wind.directionGround'
    },

    'groundWind': {
      'name'        : 'Ground Wind Speed (m/s)',
      'key'         : '38,21',
      'unit'        : 'm/s',
      'defaultPath' : 'environment.wind.speedOverGround'
    },

    'headingOppTack': {
      'name'        : 'Heading on Opposite Tack (True) (rad)',
      'key'         : '9a,20',
      'unit'        : 'rad',
      'defaultPath' : 'performance.tackTrue'
    },

    'heelAngle': {
      'name'        : 'Heel Angle (rad)',
      'key'         : '34,20',
      'unit'        : 'rad',
      'defaultPath' : 'navigation.attitude'
    },

    'jacuzziTemperature': {
      'name'        : 'Jacuzzi Temperature (Kelvin)',
      'key'         : '25,21',
      'unit'        : 'celcius',
      'defaultPath' : 'environment.jacuzzi.temperature'
    },

    'leewayAngle': {
      'name'        : 'Leeway Angle (rad)',
      'key'         : '82,20',
      'unit'        : 'rad',
      'defaultPath' : 'navigation.leewayAngle'
    },

    'mastRake': {
      'name'        : 'Mast Rake (rad)',
      'key'         : '34,21',
      'unit'        : 'rad',
      'defaultPath' : ''
    },

    'nextLegBearing': {
      'name'        : 'Next Leg Bearing (rad)',
      'key'         : '35,21',
      'unit'        : 'rad',
      'defaultPath' : ''
    },

    'nextLegTargetSpeed': {
      'name'        : 'Next Leg Target Speed (m/s)',
      'key'         : '36,21',
      'unit'        : 'm/s',
      'defaultPath' : ''
    },

    'oppTackCOG': {
      'name'        : 'Opposite Tack COG (rad)',
      'key'         : '32,21',
      'unit'        : 'rad',
      'defaultPath' : ''
    },

    'oppTackTarget': {
      'name'        : 'Opposite Tack Target heading (rad)',
      'key'         : '33,21',
      'unit'        : 'rad',
      'defaultPath' : 'performance.tackTrue'
    },

    'oppWindAngle': {
      'name'        : 'Optimum Wind Angle (rad)',
      'key'         : '35,20',
      'unit'        : 'signedRad',
      'defaultPath' : 'performance.optimumWindAngle'
    },

    'outhaulLoad': {
      'name'        : 'Outhaul Load',
      'key'         : '22,41',
      'unit'        : '',
      'defaultPath' : ''
    },

    'plowAngle': {
      'name'        : 'Plow Angle (rad)',
      'key'         : '23,21',
      'unit'        : 'rad',
      'defaultPath' : ''
    },

    'polarSpeed': {
      'name'        : 'Polar Boat Speed (m/s)',
      'key'         : '7e,20',
      'unit'        : 'm/s',
      'defaultPath' : 'performance.polarSpeed'
    },

    'polarPerformance': {
      'name'        : 'Polar Performance (ratio)',
      'key'         : '7c,20',
      'unit'        : 'percent',
      'defaultPath' : 'performance.polarSpeedRatio'
    },

    'poolTemperature': {
      'name'        : 'Pool Temperature (Kelvin)',
      'key'         : '26,21',
      'unit'        : 'celcius',
      'defaultPath' : 'environment.pool.temperature'
    },

    'targetTWA': {
      'name'        : 'Target TWA (rad)',
      'key'         : '53,20',
      'unit'        : 'signedRad',
      'defaultPath' : 'performance.targetAngle'
    },

    'targetBoatSpeed': {
      'name'        : 'Target Boat Speed (m/s)',
      'key'         : '7d,20',
      'unit'        : 'm/s',
      'defaultPath' : 'performance.targetSpeed'
    },

    'tideRate': {
      'name'        : 'Tide Rate (m/s)',
      'key'         : '83,20',
      'unit'        : 'm/s',
      'defaultPath' : ''
    },

    'tideSet': {
      'name'        : 'Tide Set (rad)',
      'key'         : '84,20',
      'unit'        : 'rad',
      'defaultPath' : ''
    },

    'tackingPerf': {
      'name'        : 'Tacking Performance (ratio)',
      'key'         : '32,20',
      'unit'        : 'percent',
      'defaultPath' : ''
    },

    'trimAngle': {
      'name'        : 'Trim Angle (rad)',
      'key'         : '9b,20',
      'unit'        : 'rad',
      'defaultPath' : 'navigation.attitude'
    },

    'vmg': {
      'name'        : 'Velocity Made Good (m/s)',
      'key'         : '7f,20',
      'unit'        : 'm/s',
      'defaultPath' : 'performance.velocityMadeGood'
    },

    'vmgperf': {
      'name'        : 'VMG Performance (ratio)',
      'key'         : '1d,21',
      'unit'        : 'percent',
      'defaultPath' : 'performance.velocityMadeGoodRatio'
    },

    'windAngleMast': {
      // With mast rotation 0, WAM == apparent wind angle (signed, port negative).
      'name'        : 'Wind Angle to Mast (rad)',
      'key'         : '9d,20',
      'unit'        : 'signedRad',
      'defaultPath' : 'environment.wind.angleApparent'
    },

    'windPhase': {
      'name'        : 'Wind Phase (rad)',
      'key'         : '51,21',
      'unit'        : 'rad',
      'defaultPath' : ''
    },

    'windLift': {
      'name'        : 'Wind Lift (rad)',
      'key'         : '52,21',
      'unit'        : 'rad',
      'defaultPath' : ''
    },

    'user1': {
      'name'        : 'User 1',
      'key'         : '38,40',
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user2': {
      'name'        : 'User 2',
      'key'         : '39,40',
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user3': {
      'name'        : 'User 3',
      'key'         : '3a,40',
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user4': {
      'name'        : 'User 4',
      'key'         : '3b,40',
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user5': {
      'name'        : 'User 5',
      'key'         : '10,40',
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user6': {
      'name'        : 'User 6',
      'key'         : '11,40',
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user7': {
      'name'        : 'User 7',
      'key'         : '12,40',
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user8': {
      'name'        : 'User 8',
      'key'         : '13,40',
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user9': {
      'name'        : 'User 9',
      'key'         : '14,40',
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user10': {
      'name'        : 'User 10',
      'key'         : '15,40',
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user11': {
      'name'        : 'User 11',
      'key'         : '16,40',
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user12': {
      'name'        : 'User 12',
      'key'         : '17,40',
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user13': {
      'name'        : 'User 13',
      'key'         : '18,40',
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user14': {
      'name'        : 'User 14',
      'key'         : '19,40',
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user15': {
      'name'        : 'User 15',
      'key'         : '1a,40',
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user16': {
      'name'        : 'User 16',
      'key'         : '1b,40',
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user17': {
      'name'        : 'User 17',
      'key'         : '3d,41',
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user18': {
      'name'        : 'User 18',
      'key'         : '3e,41',
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user19': {
      'name'        : 'User 19',
      'key'         : '3f,41',
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user20': {
      'name'        : 'User 20',
      'key'         : '40,41',
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user21': {
      'name'        : 'User 21',
      'key'         : '41,41',
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user22': {
      'name'        : 'User 22',
      'key'         : '42,41',
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user23': {
      'name'        : 'User 23',
      'key'         : '43,41',
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user24': {
      'name'        : 'User 24',
      'key'         : '44,41',
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user25': {
      'name'        : 'User 25',
      'key'         : '45,41',
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user26': {
      'name'        : 'User 26',
      'key'         : '46,41',
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user27': {
      'name'        : 'User 27',
      'key'         : '47,41',
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user28': {
      'name'        : 'User 28',
      'key'         : '48,41',
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user29': {
      'name'        : 'User 29',
      'key'         : '49,41',
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user30': {
      'name'        : 'User 30',
      'key'         : '4a,41',
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user31': {
      'name'        : 'User 31',
      'key'         : '4b,41',
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user32': {
      'name'        : 'User 32',
      'key'         : '4c,41',
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'remote0': {
      'name'        : 'Remote 0',
      'key'         : 'df,20',
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'remote1': {
      'name'        : 'Remote 1',
      'key'         : 'ef,20',
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'remote2': {
      'name'        : 'Remote 2',
      'key'         : 'f0,20',
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'remote3': {
      'name'        : 'Remote 3',
      'key'         : 'f1,20',
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'remote4': {
      'name'        : 'Remote 4',
      'key'         : 'f2,20',
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'remote5': {
      'name'        : 'Remote 5',
      'key'         : 'f3,20',
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'remote6': {
      'name'        : 'Remote 6',
      'key'         : 'f4,20',
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'remote8': {
      'name'        : 'Remote 8',
      'key'         : 'f6,20',
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'remote9': {
      'name'        : 'Remote 9',
      'key'         : 'f7,20',
      'unit'        : 'm',
      'defaultPath' : ''
    }

  };

  // Standard NMEA 2000 wind (not B&G 130824 keys). Both must be enabled
  // to emit PGN 130306 Reference=True (boat) for laylines / SailSteer.
  // trueWindDirection (supportedValues) also emits 130306 ground/North when enabled.
  let windPgnValues = {
    'trueWindAngle': {
      'name'        : 'True Wind Angle (rad) — PGN 130306',
      'defaultPath' : 'environment.wind.angleTrueWater'
    },
    'trueWindSpeed': {
      'name'        : 'True Wind Speed (m/s) — PGN 130306',
      'defaultPath' : 'environment.wind.speedTrue'
    }
  }

  function readConfiguredNumber (type, spec) {
    var cfg = valueConfig(type, spec, globalOptions[type])
    if (cfg.enabled != true || !cfg.path) return undefined
    var value = app.getSelfPath(cfg.path)
    if (typeof value == 'undefined') return undefined
    if (typeof cfg.source == 'undefined') {
      value = value.value
    } else if (cfg.source == value['$source']) {
      value = value.value
    } else {
      return undefined
    }
    return (typeof value == 'number' && Number.isFinite(value)) ? value : undefined
  }

  function sendTrueWind () {
    var speed = readConfiguredNumber('trueWindSpeed', windPgnValues.trueWindSpeed)
    var angle = readConfiguredNumber('trueWindAngle', windPgnValues.trueWindAngle)
    if (typeof angle != 'undefined' && typeof speed != 'undefined') {
      var boatMsg = encodeTrueWind130306(angle, speed, sourceAddress)
      if (boatMsg) sendN2k(boatMsg)
    }
    // TWD: B&G key 89 is sent in sendPerformance; instruments also need
    // 130306 Reference=True (ground referenced to North).
    var direction = readConfiguredNumber(
      'trueWindDirection',
      supportedValues.trueWindDirection
    )
    if (typeof direction != 'undefined' && typeof speed != 'undefined') {
      var dirMsg = encodeTrueWindDirection130306(direction, speed, sourceAddress)
      if (dirMsg) sendN2k(dirMsg)
    }
  }

  // Laylines need key 125 > 0. Polar often nulls performance.targetSpeed when
  // speedAt(current TWA) fails even though targetAngle + target VMG are fine.
  function resolveTargetBoatSpeed () {
    var direct = readConfiguredNumber('targetBoatSpeed', supportedValues.targetBoatSpeed)
    if (typeof direct == 'number' && direct > 0) return direct
    var anglePath = app.getSelfPath('performance.targetAngle')
    var vmgPath = app.getSelfPath('performance.targetVelocityMadeGood')
    var angle = anglePath && anglePath.value
    var vmg = vmgPath && vmgPath.value
    if (typeof angle == 'number' && Number.isFinite(angle) &&
        typeof vmg == 'number' && Number.isFinite(vmg) && vmg > 0) {
      var cosTarget = Math.abs(Math.cos(angle))
      if (cosTarget > 0.01) return vmg / cosTarget
    }
    var polarPath = app.getSelfPath('performance.polarSpeed')
    var polar = polarPath && polarPath.value
    if (typeof polar == 'number' && Number.isFinite(polar) && polar > 0) return polar
    return undefined
  }

  // Last good values for keys that polar briefly nulls. Navico treats each
  // 130824 from a source as a full sample — omitting a key blanks the gauge.
  var lastPerformanceNumbers = Object.create(null)

  function sendPerformance() {
    var performancePGN_2 = ""
    var length = 0
    var value

    for (var type in supportedValues) {
      //app.debug('type: %s', type)
      var cfg = valueConfig(type, supportedValues[type], globalOptions[type])
      if (cfg.enabled == true) {
        // Get value
        var path = cfg.path
        var source = cfg.source
        // app.debug('globalOptions[%s] enabled  path: %s  source: %s', type, path, source || 'n/a');
        if (type === 'targetBoatSpeed') {
          value = resolveTargetBoatSpeed()
        } else {
          value = app.getSelfPath(path)
          if (typeof (value) != 'undefined') {
            if (typeof (source) == 'undefined') {
              value = value.value
            } else {
              if (source == value['$source']) {
                app.debug('Matched source: %s', value['$source'])
                value = value.value
              } else {
                value = undefined
              }
            }
          }
          if (path == 'navigation.attitude') {
            if (typeof (value) != 'undefined' && value) {
              if (type == 'heelAngle') {
                value = value.roll
              } else if (type == 'trimAngle') {
                value = value.pitch
              }
            }
          }
        }
        // Hold last finite sample when SK nulls polar/target paths briefly.
        if (typeof value == 'number' && Number.isFinite(value)) {
          lastPerformanceNumbers[type] = value
        } else if (typeof lastPerformanceNumbers[type] == 'number') {
          value = lastPerformanceNumbers[type]
        }
        app.debug('path: %s  value: %j', path, value);
        // typeof null === 'object' — must require a finite number before encode
        if (typeof value == 'number' && Number.isFinite(value)) {
          var hex = (type === 'oppWindAngle')
            ? encodeOptimumWindAngle(value)
            : encodeValue(supportedValues[type]['unit'], value, supportedValues[type]['key'])
          if (hex != null) {
            performancePGN_2 += ',' + supportedValues[type]['key'] + ',' + hex
          }
        }
      }
    }

    // app.debug ('%j', globalOptions)
    length = performancePGN_2.split(',').length + 1 // 7d,99 header plus data bytes
    if (length >= 4) {
      let msg = util.format(performancePGN + performancePGN_2, (new Date()).toISOString(), sourceAddress, String(length))
      sendN2k(msg)
    }
  }

  function sendN2k (msg) {
    // app.debug('Msg: %s', msg)
    if (globalOptions.emulate == true) {
      // 130824 is a fast packet. simpleCan sends a bare frame when the
      // payload is 8 bytes or fewer, which a Zeus will not reassemble.
      if (msg.split(',')[2] === '130824') {
        sendFast130824(msg)
      } else {
        simpleCan.sendPGN(msg)
      }
    } else {
      app.emit('nmea2000out', msg)
    }
  }

  function sendFast130824 (msg) {
    if (!simpleCan || !simpleCan.candevice || !simpleCan.candevice.cansend || !simpleCan.channel) {
      return
    }
    const parts = msg.split(',')
    const len = Number(parts[5])
    const payload = Buffer.from(parts.slice(6, 6 + len).map(h => parseInt(h, 16)))
    const canId = canIdForPgn(3, 130824, simpleCan.candevice.address)
    for (const frame of fastPacketFrames(payload)) {
      simpleCan.channel.send({ id: canId, ext: true, data: frame })
    }
  }

  function schemaEntry (key, name, defaultPath, enabledDefault) {
    if (defaultPath == '') {
      defaultPath = 'n/a'
    }
    return {
      type: 'object',
      title: name,
      properties: {
        enabled: {
          title: 'Enabled',
          type: 'boolean',
          default: !!enabledDefault
        },
        path: {
          type: 'string',
          title: 'Use data from this path',
          description: 'Leave blank to use default (' + defaultPath + ')',
          default: defaultPath
        },
        source: {
          type: 'string',
          title: 'Use data only from this source (leave blank if path has only one source)'
        }
      }
    }
  }

  function updateSchema() {
    Object.keys(supportedValues).forEach(key => {
      schema.properties[key] = schemaEntry(
        key,
        supportedValues[key]['name'],
        supportedValues[key]['defaultPath'],
        valueConfig(key, supportedValues[key], undefined).enabled
      )
    })
    Object.keys(windPgnValues).forEach(key => {
      schema.properties[key] = schemaEntry(
        key,
        windPgnValues[key]['name'],
        windPgnValues[key]['defaultPath'],
        key === 'trueWindAngle' || key === 'trueWindSpeed'
      )
    })
    app.debug('schema: %j', schema);
  }

  updateSchema()

  plugin.schema = function() {
    updateSchema()
    return schema
  }


  plugin.start = function (options, restartPlugin) {
    // Here we put our plugin logic
    app.debug('Plugin started')
    globalOptions = options
    app.debug('Options: %s', JSON.stringify(globalOptions))

    if (globalOptions.emulate == true) {
      const SimpleCan = require('@canboat/canboatjs').SimpleCan
      app.debug('Using device id: %d', options.sourceAddress)
      sourceAddress = options.sourceAddress || 14

      const canboatjs = require('@canboat/canboatjs')
      const Parser = require('@canboat/canboatjs').FromPgn
      var parser = new canboatjs.FromPgn()

      var deviceAddress
      var canDevice

	    if (typeof options.candevice != 'undefined' && options.candevice != "") {
	      canDevice = options.candevice
	      app.debug('Using configured canDevice: %s', canDevice)
	    } else {
	      // app.debug('%j', app.config.settings.pipedProviders)
	      app.debug('Trying to detect canDevice')
	      app.config.settings.pipedProviders.forEach(provider => {
	        if (provider.enabled == true) {
	          provider.pipeElements.forEach(element => {
	            if (element.type == 'providers/canbus' && typeof deviceAddress == 'undefined') {
	              app.debug('Found provider/canbus')
	              if (typeof element.options.canDevice != 'undefined') {
		              app.debug('element.options.canDevice: %s', element.options.canDevice)
	                canDevice = element.options.canDevice
	              }
	            }
	          })
	        }
	      })
      }

	    simpleCan = new SimpleCan({
	      app,
	      canDevice: canDevice,
	      preferredAddress: sourceAddress,
	      transmitPGNs: [ 126996 ],
	      addressClaim: {
	        'Unique Number': H5000_UNIQUE_NUMBER,
	        'Manufacturer Code': 'Navico',
	        'Device Function': 190,
	        'Device Class': 'Internal Environment',
	        'Device Instance Lower': 0,
	        'Device Instance Upper': 0,
	        'System Instance': 0,
	        'Industry Group': 'Marine'
	      },
	      productInfo: {
	        'NMEA 2000 Version': 2100,
	        'Product Code': 246,
	        'Model ID': 'H5000 CPU',
	        'Software Version Code': '2.0.45.0.29',
	        'Model Version': '',
	        'Model Serial Code': '005469',
	        'Certification Level': 2,
	        'Load Equivalency': 1
	      }
      })

      if (globalOptions.emulate == true) {
	      simpleCan.messageCb = (msg) => {
	        if (duplicatePGNs.includes(msg.pgn.pgn) == true && msg.pgn.src != simpleCan.candevice.address) {
	          // app.debug(msg)
	          // Resend from this plugin id
	          let PGN = "%s,%s,%s,%s,255,%s," + hex(msg.data)
	          let newMsg = util.format(PGN, (new Date()).toISOString(), msg.pgn.prio, msg.pgn.pgn, simpleCan.candevice.address, msg.length)
	          // app.debug(newMsg)
	          simpleCan.sendPGN(newMsg)
	        }
	      }
      }

      app.prependListener('N2KAnalyzerOut', function (n2k) {
        n2kCamelCompat(n2k, H5000_UNIQUE_NUMBER)
      })
      simpleCan.start()
      app.setPluginStatus(`Connected to ${canDevice}`)
      app.debug('simpleCan.candevice.address: %j', simpleCan.candevice.address)
      deviceAddress = simpleCan.candevice.address
    }

    function sendKeepAlive () {
      let msg = util.format(keepAlivePGN, (new Date()).toISOString(), sourceAddress)
      sendN2k(msg)
    }

    // Full 130824 only. A former 5 Hz solo key-53 packet from this same SA
    // replaced the sample and blanked polar speed / target TWA on Navico
    // gauges. 5 Hz keeps OPT WA ahead of the empty SA24 130824 (~1 Hz).
    // PGN 65305 keepalive stays a fixed 8-byte modes frame (not 130824).
    timers.push(setInterval(() => {
      sendPerformance()
      sendTrueWind()
    }, 200))

    if (globalOptions.emulate == true) {
      timers.push(setInterval(() => {
        sendKeepAlive();
      }, 1000))
    }

  }



  plugin.stop = function () {
    // Here we put logic we need when the plugin stops
    app.debug('Plugin stopped')
    unsubscribes.forEach(f => f())
    unsubscribes = []
    timers.forEach(timer => {
      clearInterval(timer)
    }) 
  }

  return plugin
}

const byteToHex = []
for (let n = 0; n <= 0xff; ++n)
{
  const hexOctet = n.toString(16).padStart(2, "0");
  byteToHex.push(hexOctet);
}

function hex(arrayBuffer)
{
  const buff = new Uint8Array(arrayBuffer);
  const hexOctets = []; // new Array(buff.length) is even faster (preallocates necessary array size), then use hexOctets[i] instead of .push()

  for (let i = 0; i < buff.length; ++i)
    hexOctets.push(byteToHex[buff[i]]);

  return hexOctets.join(",");
}
