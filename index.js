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

    'avgTrueWindDirection': {
      'name'        : 'Average True Wind Direction',
      'key'         : '50,21',
      'length'      : 2,
      'unit'        : 'rad',
      'defaultPath' : ''
    },

    'biasAdvantage': {
      'name'        : 'Bias Advantage',
      'key'         : '31,21',
      'length'      : 2,
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'chainLength': {
      'name'        : 'Chain Length',
      'key'         : '1c,21',
      'length'      : 2,
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'codeZeroLoad': {
      'name'        : 'Code Zero Load',
      'key'         : '2a,21',
      'length'      : 2,
      'unit'        : '',
      'defaultPath' : ''
    },

    'course': {
      'name'        : 'Course',
      'key'         : '69,20',
      'length'      : 2,
      'unit'        : 'rad',
      'defaultPath' : 'navigation.courseOverGroundTrue'
    },

    'cunningham': {
      'name'        : 'Cunningham',
      'key'         : '24,21',
      'length'      : 2,
      'unit'        : '',
      'defaultPath' : ''
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

    'groundWindDirection': {
      'name'        : 'Ground Wind Direction',
      'key'         : '37,21',
      'length'      : 2,
      'unit'        : 'rad',
      'defaultPath' : 'environment.wind.directionGround'
    },

    'groundWind': {
      'name'        : 'Ground Wind Speed',
      'key'         : '38,21',
      'length'      : 2,
      'unit'        : 'm/s',
      'defaultPath' : 'environment.wind.speedOverGround'
    },

    'headingOppTack': {
      'name'        : 'Heading on Opposite Tack (True)',
      'key'         : '9a,20',
      'length'      : 2,
      'unit'        : 'rad',
      'defaultPath' : 'performance.tackTrue'
    },

    'heelAngle': {
      'name'        : 'Heel Angle',
      'key'         : '34,20',
      'length'      : 2,
      'unit'        : 'rad',
      'defaultPath' : 'navigation.attitude'
    },

    'jacuzziTemperature': {
      'name'        : 'Jacuzzi Temperature',
      'key'         : '25,21',
      'length'      : 2,
      'unit'        : 'celcius',
      'defaultPath' : 'environment.jacuzzi.temperature'
    },

    'leewayAngle': {
      'name'        : 'Leeway Angle',
      'key'         : '82,20',
      'length'      : 2,
      'unit'        : 'rad',
      'defaultPath' : 'navigation.leewayAngle'
    },

    'mastRake': {
      'name'        : 'Mast Rake',
      'key'         : '34,21',
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

    'nextLegTargetSpeed': {
      'name'        : 'Next Leg Target Speed',
      'key'         : '36,21',
      'length'      : 2,
      'unit'        : 'm/s',
      'defaultPath' : ''
    },

    'oppTackCOG': {
      'name'        : 'Opposite Tack COG',
      'key'         : '32,21',
      'length'      : 2,
      'unit'        : 'rad',
      'defaultPath' : ''
    },

    'oppTackTarget': {
      'name'        : 'Opposite Tack Target heading',
      'key'         : '33,21',
      'length'      : 2,
      'unit'        : 'rad',
      'defaultPath' : 'performance.tackTrue'
    },

    'oppWindAngle': {
      'name'        : 'Optimal Wind Angle',
      'key'         : '35,20',
      'length'      : 2,
      'unit'        : 'rad',
      'defaultPath' : ''
    },

    'outhaulLoad': {
      'name'        : 'Outhaul Load',
      'key'         : '22,21',
      'length'      : 2,
      'unit'        : '',
      'defaultPath' : ''
    },

    'plowAngle': {
      'name'        : 'Plow Angle',
      'key'         : '23,21',
      'length'      : 2,
      'unit'        : 'rad',
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

    'poolTemperature': {
      'name'        : 'Pool Temperature',
      'key'         : '26,21',
      'length'      : 2,
      'unit'        : 'celcius',
      'defaultPath' : 'environment.pool.temperature'
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

    'tackingPerf': {
      'name'        : 'Tacking Performance',
      'key'         : '32,20',
      'length'      : 2,
      'unit'        : 'percent',
      'defaultPath' : ''
    },

    'trimAngle': {
      'name'        : 'Trim Angle',
      'key'         : '9b,20',
      'length'      : 2,
      'unit'        : 'rad',
      'defaultPath' : 'navigation.attitude'
    },

    'vmg': {
      'name'        : 'Velocity Made Good',
      'key'         : '7f,20',
      'length'      : 2,
      'unit'        : 'm/s',
      'defaultPath' : 'performance.velocityMadeGood'
    },

    'vmgperf': {
      'name'        : 'VMG Performance',
      'key'         : '1d,21',
      'length'      : 2,
      'unit'        : 'percent',
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

    'user1': {
      'name'        : 'User 1',
      'key'         : '38,20',
      'length'      : 2,
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user2': {
      'name'        : 'User 2',
      'key'         : '39,20',
      'length'      : 2,
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user3': {
      'name'        : 'User 3',
      'key'         : '3a,20',
      'length'      : 2,
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user4': {
      'name'        : 'User 4',
      'key'         : '3b,20',
      'length'      : 2,
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user5': {
      'name'        : 'User 5',
      'key'         : '10,20',
      'length'      : 2,
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user6': {
      'name'        : 'User 6',
      'key'         : '11,20',
      'length'      : 2,
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user7': {
      'name'        : 'User 7',
      'key'         : '12,20',
      'length'      : 2,
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user8': {
      'name'        : 'User 8',
      'key'         : '13,20',
      'length'      : 2,
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user9': {
      'name'        : 'User 9',
      'key'         : '14,20',
      'length'      : 2,
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user10': {
      'name'        : 'User 10',
      'key'         : '15,20',
      'length'      : 2,
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user11': {
      'name'        : 'User 11',
      'key'         : '16,20',
      'length'      : 2,
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user12': {
      'name'        : 'User 12',
      'key'         : '17,20',
      'length'      : 2,
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user13': {
      'name'        : 'User 13',
      'key'         : '18,20',
      'length'      : 2,
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user14': {
      'name'        : 'User 14',
      'key'         : '19,20',
      'length'      : 2,
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user15': {
      'name'        : 'User 15',
      'key'         : '1a,20',
      'length'      : 2,
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user16': {
      'name'        : 'User 16',
      'key'         : '1b,20',
      'length'      : 2,
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user17': {
      'name'        : 'User 17',
      'key'         : '3d,21',
      'length'      : 2,
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user18': {
      'name'        : 'User 18',
      'key'         : '3e,21',
      'length'      : 2,
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user19': {
      'name'        : 'User 19',
      'key'         : '3f,21',
      'length'      : 2,
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user20': {
      'name'        : 'User 20',
      'key'         : '40,21',
      'length'      : 2,
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user21': {
      'name'        : 'User 21',
      'key'         : '41,21',
      'length'      : 2,
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user22': {
      'name'        : 'User 22',
      'key'         : '42,21',
      'length'      : 2,
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user23': {
      'name'        : 'User 23',
      'key'         : '43,21',
      'length'      : 2,
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user24': {
      'name'        : 'User 24',
      'key'         : '44,21',
      'length'      : 2,
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user25': {
      'name'        : 'User 25',
      'key'         : '45,21',
      'length'      : 2,
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user26': {
      'name'        : 'User 26',
      'key'         : '46,21',
      'length'      : 2,
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user27': {
      'name'        : 'User 27',
      'key'         : '47,21',
      'length'      : 2,
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user28': {
      'name'        : 'User 28',
      'key'         : '48,21',
      'length'      : 2,
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user29': {
      'name'        : 'User 29',
      'key'         : '49,21',
      'length'      : 2,
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user30': {
      'name'        : 'User 30',
      'key'         : '4a,21',
      'length'      : 2,
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user31': {
      'name'        : 'User 31',
      'key'         : '4b,21',
      'length'      : 2,
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'user32': {
      'name'        : 'User 32',
      'key'         : '4c,21',
      'length'      : 2,
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'remote0': {
      'name'        : 'Remote 0',
      'key'         : 'df,20',
      'length'      : 2,
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'remote1': {
      'name'        : 'Remote 1',
      'key'         : 'ef,20',
      'length'      : 2,
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'remote2': {
      'name'        : 'Remote 2',
      'key'         : 'f0,20',
      'length'      : 2,
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'remote3': {
      'name'        : 'Remote 3',
      'key'         : 'f1,20',
      'length'      : 2,
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'remote4': {
      'name'        : 'Remote 4',
      'key'         : 'f2,20',
      'length'      : 2,
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'remote5': {
      'name'        : 'Remote 5',
      'key'         : 'f3,20',
      'length'      : 2,
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'remote6': {
      'name'        : 'Remote 6',
      'key'         : 'f4,20',
      'length'      : 2,
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'remote7': {
      'name'        : 'Remote 7',
      'key'         : 'f5,20',
      'length'      : 2,
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'remote8': {
      'name'        : 'Remote 8',
      'key'         : 'f6,20',
      'length'      : 2,
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'remote9': {
      'name'        : 'Remote 9',
      'key'         : 'f7,20',
      'length'      : 2,
      'unit'        : 'm',
      'defaultPath' : ''
    }

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

            case 'celcius':
              var hex = intToHex(value * 100) // Celcius in Kelvin
              app.debug('celcius intToHex: %s %s', value, hex)
              performancePGN_2 += ',' + hex
              break

            case '':
              var hex = intToHex(value * 1000) 
              app.debug('intToHex: %s %s', value, hex)
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
    Object.keys(supportedValues).forEach(key => {
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
