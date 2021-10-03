const util = require('util')
const _ = require('lodash')
const default_src = '30' // should be SignalK's address
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
    title: 'Select which data to send and what to use as source',
    type: 'object',
    properties: {}
  }

  function sendN2k(msgs) {
    //app.debug("n2k_msg: " + msgs)
    msgs.map(function(msg) { app.emit('nmea2000out', msg)})
  }

  var localSubscription = {
    context: '*', // Get data for all contexts
    subscribe: [
          {
            path: 'performance.velocityMadeGood',
            period: 'instant'
          },
          {
            path: 'performance.polarSpeed',
            period: 'instant'
          },
          {
            path: 'performance.polarPerformance',
            period: 'instant'
          }
        ]
      };

  let supportedValues = {
/*
Key = 8318; Polar boat speed = 0.38 m/s
Key = 8316; Polar performance = 100.0 %
Key = 8498; Opposite tack COG = 66.3 deg
Key = 8499; Opposite tack target heading = 328.8 deg
Key = 8477; VMG performance = 0.0 %
Key = 8528; Average True Wind Direction = 359.6 deg
Key = 8529; Wind Phase = 11.6 deg
Key = 8530; Wind lift = 11.6 deg

Key = 8292; Unknown = 
Key = 8297; Course = 336.2 deg
Key = 8403; DR Bearing = 210.4 deg
Key = 16513; DR Distance = 1881.80848 kmA
Key = 8346; Heading on opposite Tack (True) = 30.8 deg
Key = 8322; Leeway Angle = 0.0 deg
Key = 8458; Optimum Wind Angle = 3.4 deg
Key = 8460; Racetimer = 4 bytes
Key = 16662; Latitude = 52.5784166
Key = 16663; Longitude =  5.2693009
Key = 8317; Polar boat speed = 3.21 m/s
Key = 8275; Target TWA = 42.3 deg
Key = 16501; Trip time = 4 bytes
Key = 16649; Unknown 2 = 
Key = 8477; VMG performance = 0.0 %
Key = 8319; Velocity Made Good = 0.00 m/s
Key = 8349; Wind Angle to mast = 45.8 deg
*/
    'vmg': {
      'name'        : 'Velocity Made Good',
      'key'         : '7f,20',
      'length'      : 4,
      'unit'        : 'm/s',
      'defaultPath' : 'performance.velocityMadeGood'
    },

    'vmgperf': {
      'name'        : 'VMG Performance',
      'key'         : '1d,21',
      'length'      : 4,
      'unit'        : 'percent',
      'defaultPath' : ''
    },

    'polarSpeed': {
      'name'        : 'Polar Boat Speed',
      'key'         : '7e,20',
      'length'      : 4,
      'unit'        : 'm/s',
      'defaultPath' : 'performance.polarSpeed'
    },

    'polarPerformance': {
      'name'        : 'Polar Performance',
      'key'         : '7c,20',
      'length'      : 4,
      'unit'        : 'percent',
      'defaultPath' : 'performance.polarPerformance'
    },

    'oppTackCOG': {
      'name'        : 'Opposite tack COG',
      'key'         : '32,21',
      'length'      : 4,
      'unit'        : 'rad',
      'defaultPath' : ''
    },

    'oppTackTarget': {
      'name'        : 'Opposite tack target heading',
      'key'         : '33,21',
      'length'      : 4,
      'unit'        : 'rad',
      'defaultPath' : 'performance.tackTrue'
    },

    'avgTrueWindDirection': {
      'name'        : 'Average True Wind Direction',
      'key'         : '50,21',
      'length'      : 4,
      'unit'        : 'rad',
      'defaultPath' : ''
    },

    'windPhase': {
      'name'        : 'Wind Phase',
      'key'         : '51,21',
      'length'      : 4,
      'unit'        : 'rad',
      'defaultPath' : ''
    },

    'windLift': {
      'name'        : 'Wind Lift',
      'key'         : '52,21',
      'length'      : 4,
      'unit'        : 'rad',
      'defaultPath' : ''
    },

    'course': {
      'name'        : 'Course',
      'key'         : '69,20',
      'length'      : 4,
      'unit'        : 'rad',
      'defaultPath' : 'navigation.courseOverGroundTrue'
    },

    'drBearing': {
      'name'        : 'Dead Reckoning bearing',
      'key'         : 'd3,20',
      'length'      : 4,
      'unit'        : 'rad',
      'defaultPath' : ''
    },

    'drDistance': {
      'name'        : 'Dead Reckoning distance',
      'key'         : '81,40',
      'length'      : 4,
      'unit'        : 'm',
      'defaultPath' : ''
    },

    'headingOppTack': {
      'name'        : 'Heading on opposite tack (True)',
      'key'         : '9a,20',
      'length'      : 4,
      'unit'        : 'rad',
      'defaultPath' : 'performance.tackTrue'
    },

    'leewayAngle': {
      'name'        : 'Leeway Angle',
      'key'         : '82,20',
      'length'      : 4,
      'unit'        : 'rad',
      'defaultPath' : 'navigation.leewayAngle'
    },

    'oppWindAngle': {
      'name'        : 'Optimal Wind Angle',
      'key'         : '0a,21',
      'length'      : 4,
      'unit'        : 'rad',
      'defaultPath' : 'performance.beatAngle'
    }
  };

  function sendPerformance() {
    var performancePGN_2 = ""
    var length = 2

    for (var type in supportedValues) {
      app.debug('type: %s', type)
      if (typeof (globalOptions[type]) != 'undefined' && globalOptions[type]['enabled'] == true) {
        //app.debug('globalOptions[%s] enabled', type);
        // Get value
        var value = app.getSelfPath(globalOptions[type]['source'])
        //app.debug('path: %s  value: %j', globalOptions[type]['source'], value);
        if (typeof (value) != 'undefined') {
          value = value.value
          // We have a path with a working value
          app.debug('path: %s  value: %j', globalOptions[type]['source'], value);
          // Add key to msg
          performancePGN_2 += ',' + supportedValues[type]['key']
          // Add value
          switch (supportedValues[type]['unit']) {
            case 'rad':
              var hex = degToHex(value)
              app.debug('degToHex: %s %s', value, hex)
              performancePGN_2 += ',' + hex
              break

            case 'percent':
              var hex = intToHex(value * 1000) // ratio to percentiles
              /app.debug('% intToHex: %s %s', value, hex)
              performancePGN_2 += ',' + hex
              break
              
            case 'm':
              var hex = intToHex(value / 100) // m to cm
              /app.debug('m intToHex: %s %s', value, hex)
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
        app.debug('globalOptions[%s] disabled', type);
      }
      app.debug('performancePGN_2: %s length: %s', performancePGN_2, length);
    }

    app.debug ('%j', globalOptions)
    for (var key in globalOptions) {
    }
    var msg = util.format(performancePGN + performancePGN_2, (new Date()).toISOString(), default_src, padd((length & 0xff).toString(16), 2))
    sendN2k([msg])
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
          source: {
            type: 'string',
            title: 'Use data only from this source (leave blank to ignore source)',
            default: supportedValues[key]['defaultPath']
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

    app.subscriptionmanager.subscribe(
      localSubscription,
      unsubscribes,
      subscriptionError => {
        app.error('Error:' + subscriptionError);
      },
      delta => {
        delta.updates.forEach(update => {
          if (update.values) {
            update.values.forEach(function (pathValue) {
              var path = pathValue.path
              var value = pathValue.value
              // app.debug('path: %s value: %s', path, value)
            });
          }
        });
      }
    );
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

function degToHex(degrees) {
  var rad = Math.trunc((degToRad(degrees)*10000))
  return intToHex(rad)

}

function degToRad(degrees) {
  return degrees * (Math.PI/180.0);
}

function intToHex(integer) {
	var hex = padd((integer & 0xff).toString(16), 2) + "," + padd(((integer >> 8) & 0xff).toString(16), 2)
  return hex
}
