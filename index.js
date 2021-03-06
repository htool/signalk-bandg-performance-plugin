const util = require('util')
const _ = require('lodash')
var sourceAddress
var globalOptions = []
const performancePGN = '%s,3,130824,%s,255,%s,7d,99'

module.exports = function (app) {
  var plugin = {}
  var unsubscribes = []
  var timers = []

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
      sourceAddress: {
        type: "number",
        title: "Source device id to use. Potentially useful for Actisense output.",
        default: 1
      },
    }
  }

  function sendN2k(msgs) {
    app.debug("n2k_msg: " + msgs)
    msgs.map(function(msg) { app.emit('nmea2000out', msg)})
  }

  let supportedValues = {

    'vmg': {
      'name'        : 'Velocity Made Good',
      'key'         : '7f,20',
      'length'      : 2,
      'unit'        : 'm/s',
      'defaultPath' : 'performance.velocityMadeGood'
    },

    'groundWind': {
      'name'        : 'Ground Wind Speed',
      'key'         : '38,21',
      'length'      : 2,
      'unit'        : 'm/s',
      'defaultPath' : 'environment.wind.speedOverGround'
    },


    'nextLegTargetSpeed': {
      'name'        : 'Next Leg Target Speed',
      'key'         : '36,21',
      'length'      : 2,
      'unit'        : 'm/s',
      'defaultPath' : ''
    },

    'vmgperf': {
      'name'        : 'VMG Performance',
      'key'         : '1d,21',
      'length'      : 2,
      'unit'        : 'percent',
      'defaultPath' : ''
    },

    'polarSpeed': {
      'name'        : 'Polar Boat Speed',
      'key'         : '7e,20',
      'length'      : 2,
      'unit'        : 'm/s',
      'defaultPath' : 'performance.polarSpeed'
    },

    'polarPerformance': {
      'name'        : 'Polar Performance',
      'key'         : '7c,20',
      'length'      : 2,
      'unit'        : 'percent',
      'defaultPath' : 'performance.polarPerformance'
    },

    'targetTWA': {
      'name'        : 'Target TWA',
      'key'         : '53,20',
      'length'      : 2,
      'unit'        : 'rad',
      'defaultPath' : 'performance.targetAngle'
    },

    'tideRate': {
      'name'        : 'Tide Rate',
      'key'         : '83,20',
      'length'      : 2,
      'unit'        : 'm/s',
      'defaultPath' : ''
    },

    'tideSet': {
      'name'        : 'Tide Set',
      'key'         : '84,20',
      'length'      : 2,
      'unit'        : 'rad',
      'defaultPath' : ''
    },

    'oppTackCOG': {
      'name'        : 'Opposite Tack COG',
      'key'         : '32,21',
      'length'      : 2,
      'unit'        : 'rad',
      'defaultPath' : ''
    },

    'nextLegBearing': {
      'name'        : 'Next Leg Bearing',
      'key'         : '35,21',
      'length'      : 2,
      'unit'        : 'rad',
      'defaultPath' : ''
    },

    'groundWindDirection': {
      'name'        : 'Ground Wind Direction',
      'key'         : '37,21',
      'length'      : 2,
      'unit'        : 'rad',
      'defaultPath' : 'environment.wind.directionGround'
    },

    'oppTackTarget': {
      'name'        : 'Opposite Tack Target heading',
      'key'         : '33,21',
      'length'      : 2,
      'unit'        : 'rad',
      'defaultPath' : 'performance.tackTrue'
    },

    'avgTrueWindDirection': {
      'name'        : 'Average True Wind Direction',
      'key'         : '50,21',
      'length'      : 2,
      'unit'        : 'rad',
      'defaultPath' : ''
    },

    'course': {
      'name'        : 'Course',
      'key'         : '69,20',
      'length'      : 2,
      'unit'        : 'rad',
      'defaultPath' : 'navigation.courseOverGroundTrue'
    },

    'drBearing': {
      'name'        : 'Dead Reckoning bearing',
      'key'         : 'd3,20',
      'length'      : 2,
      'unit'        : 'rad',
      'defaultPath' : ''
    },

    'drDistance': {
      'name'        : 'Dead Reckoning Distance',
      'key'         : '81,20',
      'length'      : 2,
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'biasAdvantage': {
      'name'        : 'Bias Advantage',
      'key'         : '31,21',
      'length'      : 2,
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'headingOppTack': {
      'name'        : 'Heading on Opposite Tack (True)',
      'key'         : '9a,20',
      'length'      : 2,
      'unit'        : 'rad',
      'defaultPath' : 'performance.tackTrue'
    },

    'tackingPerf': {
      'name'        : 'Tacking Performance',
      'key'         : '32,20',
      'length'      : 2,
      'unit'        : 'percent',
      'defaultPath' : ''
    },

    'leewayAngle': {
      'name'        : 'Leeway Angle',
      'key'         : '82,20',
      'length'      : 2,
      'unit'        : 'rad',
      'defaultPath' : 'navigation.leewayAngle'
    },

    'heelAngle': {
      'name'        : 'Heel Angle',
      'key'         : '34,20',
      'length'      : 2,
      'unit'        : 'rad',
      'defaultPath' : 'navigation.attitude'
    },

    'trimAngle': {
      'name'        : 'Trim Angle',
      'key'         : '9b,20',
      'length'      : 2,
      'unit'        : 'rad',
      'defaultPath' : 'navigation.attitude'
    },

    'oppWindAngle': {
      'name'        : 'Optimal Wind Angle',
      'key'         : '35,20',
      'length'      : 2,
      'unit'        : 'rad',
      'defaultPath' : ''
    },

    'mastRake': {
      'name'        : 'Mast Rake',
      'key'         : '34,21',
      'length'      : 2,
      'unit'        : 'rad',
      'defaultPath' : ''
    },

    'windAngleMast': {
      'name'        : 'Wind Angle to Mast',
      'key'         : '9d,20',
      'length'      : 2,
      'unit'        : 'rad',
      'defaultPath' : ''
    },

    'windPhase': {
      'name'        : 'Wind Phase',
      'key'         : '51,21',
      'length'      : 2,
      'unit'        : 'rad',
      'defaultPath' : ''
    },

    'windLift': {
      'name'        : 'Wind Lift',
      'key'         : '52,21',
      'length'      : 2,
      'unit'        : 'rad',
      'defaultPath' : ''
    },

    'chainLength': {
      'name'        : 'Chain Length',
      'key'         : '1c,21',
      'length'      : 2,
      'unit'        : 'm',
      'defaultPath' : ''
    },

  };

  function sendPerformance() {
    var performancePGN_2 = ""
    var length = 2
    var value

    for (var type in supportedValues) {
      //app.debug('type: %s', type)
      if (typeof (globalOptions[type]) != 'undefined' && globalOptions[type]['enabled'] == true) {
        // Get value
        var path = globalOptions[type]['path']
        var source = globalOptions[type]['source']
        app.debug('globalOptions[%s] enabled  path: %s  source: %s', type, path, source);
        value = app.getSelfPath(path)
        app.debug('path: %s  value: %j', path, value);
        if (typeof (value) != 'undefined') {
          if (typeof (source) == 'undefined') {
            value = value['value']
          } else {
            value = value['values'][source]['value']
          }
        }
        if (path == 'navigation.attitude') {
          if (typeof (value) != 'undefined') {
            if (type == 'heelAngle') {
              value = value.roll
            } else if (type == 'trimAngle') {
              value = value.pitch
            }
          }
        }
        app.debug('path: %s  value: %j', path, value);
        if (typeof (value) != 'undefined') {
          // We have a path with a working value
          app.debug('path: %s  value: %j', path, value);
          // Add key to msg
          performancePGN_2 += ',' + supportedValues[type]['key']
          // Add value
          switch (supportedValues[type]['unit']) {
            case 'rad':
              var hex = radToHex(value)
              app.debug('radToDeg: %s radToHex: %s %s', radToDeg(value), value, hex)
              performancePGN_2 += ',' + hex
              break

            case 'percent':
              var hex = intToHex(value * 1000) // ratio to percentiles
              //app.debug('% intToHex: %s %s', value, hex)
              performancePGN_2 += ',' + hex
              break
              
            case 'm':
              var hex = intToHex(value * 100) // m to cm
              app.debug('m intToHex: %s %s', value, hex)
              performancePGN_2 += ',' + hex
              break

            case 'm/s':
              var hex = intToHex(value * 100) // m/s to cm/s
              //app.debug('intToHex: %s %s', value, hex)
              performancePGN_2 += ',' + hex
              break

          }
          length += supportedValues[type]['length']
        }
        

      } else {
        //app.debug('globalOptions[%s] disabled', type);
      }
      //app.debug('performancePGN_2: %s length: %s', performancePGN_2, length);
    }

    // app.debug ('%j', globalOptions)
    if (length >= 4) {
      if (length <= 8) {
        for (let x = length; x<10; x++) {
          performancePGN_2 += ',ff'
        }
        length = 10; // force multipacket
      }
      var msg = util.format(performancePGN + performancePGN_2, (new Date()).toISOString(), sourceAddress, padd((length & 0xff).toString(16), 2))
      sendN2k([msg])
    }
  }


  function updateSchema() {
    Object.keys(supportedValues).sort().forEach(key => {
      var obj =  {
        type: 'object',
        title: supportedValues[key]['name'],
        properties: {
          enabled: {
            title: 'Enabled',
            type: 'boolean',
            default: false
          },
          path: {
            type: 'string',
            title: 'Use data from this path (leave blank to use default path)',
            default: supportedValues[key]['defaultPath']
          },
          source: {
            type: 'string',
            title: 'Use data only from this source (leave blank if path has only one source)'
          }
        }
      }
      schema.properties[key] = obj;
    });
    app.debug('schema: %j', schema);
  }

  updateSchema()

  plugin.schema = function() {
    updateSchema()
    return schema
  }


  plugin.start = function (options, restartPlugin) {
    // Here we put our plugin logic
    app.debug('Plugin started');
    var unsubscribes = [];

    globalOptions = options;
    sourceAddress = globalOptions['sourceAddress']
    app.debug('Using device id: %d', sourceAddress)

    timers.push(setInterval(() => {
      sendPerformance(); 
    }, 500))
  };



  plugin.stop = function () {
    // Here we put logic we need when the plugin stops
    app.debug('Plugin stopped');
    plugin.stop = function () {
      unsubscribes.forEach(f => f());
      unsubscribes = [];
      timers.forEach(timer => {
        clearInterval(timer)
      }) 
    };

  };

  return plugin;
};

function padd(n, p, c)
{
  var pad_char = typeof c !== 'undefined' ? c : '0';
  var pad = new Array(1 + p).join(pad_char);
  return (pad + n).slice(-pad.length);
}


function radToDeg(radians) {
  return radians * 180 / Math.PI
}

function radToHex(rad) {
  return intToHex(Math.trunc(rad*10000))
}

function degToHex(degrees) {
  return radToHex(degToRad(degrees))
}

function degToRad(degrees) {
  return degrees * (Math.PI/180.0);
}

function intToHex(integer) {
	var hex = padd((integer & 0xff).toString(16), 2) + "," + padd(((integer >> 8) & 0xff).toString(16), 2)
  return hex
}

function intTo4BHex(integer) {
	var hex = padd((integer & 0xff).toString(16), 2) + "," + padd(((integer >> 8) & 0xff).toString(16), 2) + "," + padd(((integer >> 16)& 0xff).toString(16), 2) + "," + padd(((integer >> 24) & 0xff).toString(16), 2)
  return hex;
}
