# B_and_G_Performance-plugin
Generate B&amp;G performance PGNs to be displayed on Vulcan/Zeus/Triton2 

Not all B&G displayable values are currently available in SignalK's schema.
Help with mapping is appreciated.

In case of multiple sources for a path you can specify the source per path.

Currently supported values:

 |B&G's data source name          | SignalK's map                     |
 |--------------------------------|-----------------------------------|
 |Average True Wind Direction     |                                   |
 |Bias Advantage                  |                                   |
 |Course                          | navigation.courseOverGroundTrue   |
 |Chain Length                    |                                   |
 |Dead Reckoning bearing          |                                   |
 |Dead Reckoning distance         |                                   |
 |Ground Wind Direction						| environment.wind.directionGround  |
 |Ground Wind Speed						    | environment.wind.speedOverGround  |
 |Heading on Opposite Tack (True) | performance.tackTrue              |
 |Heel Angle						          | navigation.attitude               |
 |Leeway Angle                    | navigation.leewayAngle            |
 |Mast Rake						            |                                   |
 |Next Leg Bearing						    |                                   |
 |Next Leg Target Speed					  |                                   |
 |Opposite Tack COG               |                                   |
 |Opposite Tack Target Heading    | performance.tackTrue              |
 |Optimal Wind Angle              |                                   |
 |Polar Boat Speed                | performance.polarSpeed            |
 |Polar Performance               | performance.polarPerformance      |
 |Tacking Performance						  |                                   |
 |Target TWA                      | performance.beatAngle
 |Tide Rate						            |                                   |
 |Tide Set						            |                                   |
 |Trim Angle                      | navigation.attitude               |
 |Velocity Made Good              | performance.velocityMadeGood      |
 |VMG Performance                 |                                   |
 |Wind Angle to Mast						  |                                   |
 |Wind Lift                       |                                   |
 |Wind Phase                      |                                   |
