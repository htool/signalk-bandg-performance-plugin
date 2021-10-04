# B_and_G_Performance-plugin
Generate B&amp;G performance PGNs to be displayed on Vulcan/Zeus/Triton2 

Not all B&G displayable values are currently available in SignalK's schema.
Help with mapping is appreciated.

Currently supported values:

 |B&G's data source name          | SignalK's map                     |
 |--------------------------------|-----------------------------------|
 |Average True Wind Direction     |                                   |
 |Course                          | navigation.courseOverGroundTrue   |
 |Dead Reckoning bearing          |                                   |
 |Dead Reckoning distance         |                                   |
 |Heading on opposite tack (True) | performance.tackTrue              |
 |Leeway Angle                    | navigation.leewayAngle            |
 |Opposite tack COG               |                                   |
 |Opposite tack target heading    | performance.tackTrue              |
 |Optimal Wind Angle              | performance.beatAngle             |
 |Polar Boat Speed                | performance.polarSpeed            |
 |Polar Performance               | performance.polarPerformance      |
 |Velocity Made Good              | performance.velocityMadeGood      |
 |VMG Performance                 |                                   |
 |Wind Lift                       |                                   |
 |Wind Phase                      |                                   |

