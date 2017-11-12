const express = require('express'),
      path = require('path'),
      db = require('db');
var bodyParser = require('body-parser');

var app = express();

// set view engine
app.set('view engine', 'pug');
app.set('views', __dirname + '/views');

// set public folder
app.use(express.static(path.join(__dirname, 'public')));

// Body parser middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// serve the index page
app.get('/', (req, res) => {
    res.render('index');
});

/* example search result

ChIJf9rTVKa1RIYRGWjMsGuTEZw:
   { name: 'The Jackalope',
     location: { lat: 30.2672231, lng: -97.7389569 },
     bounds:
      { south: 30.2658741197085,
        west: -97.74030588029149,
        north: 30.2685720802915,
        east: -97.73760791970847 },
     types:
      [ 'bar',
        'restaurant',
        'food',
        'point_of_interest',
        'establishment' ],
     address: '404 East 6th, Austin',
     state: 'Texas',
     city: 'Austin' }
*/

// inserting new venues (ajax)
app.put('/', async (req, res) => {
    var venueData,
        placeIds;
        
    if ((venueData = req.body) && (placeIds = Object.keys(venueData)) && placeIds.length) {
        
        //var query1 = 'INSERT INTO place_ids(place_id) VALUES($1)',
        //    query2 = "INSERT INTO venues(name, address, state, gps) VALUES($1, $2, $3, ST_GeomFromText($4, 4326))",
        //    query3 = "INSERT INTO geofences(polygon) VALUES(ST_GeomFromText('POLYGON(($1,$2,$3,$4,$5))', 4326))";
        var failures = [],
            successes = [];
        
        for (var placeId in venueData) {
            var venue = venueData[placeId];

            var params = [
                "'" + venue.name.replace(/'/g, "''") + "'",
                "'" + venue.address.replace(/'/g, "''") + "'",
                "'" + venue.state + "'",
                "ST_GeomFromText('POINT(" + venue.location.lng + ' ' + venue.location.lat + " 0)', 4326)"
            ];
            
            var boundingBox = [
                venue.bounds.west + ' ' + venue.bounds.north,
                venue.bounds.east + ' ' + venue.bounds.north,
                venue.bounds.east + ' ' + venue.bounds.south,
                venue.bounds.west + ' ' + venue.bounds.south,
                venue.bounds.west + ' ' + venue.bounds.north
            ];
            
            var query = 
                "BEGIN;" +
                "INSERT INTO place_ids(place_id) VALUES('"+placeId+"');" +
                "INSERT INTO venues(name, address, state, gps) VALUES("+params.join(',')+");" +
                "COMMIT;"
            
            try {
                // run the query
                await db.query(query, []);
                
                successes.push(venue);
            } catch (err) {
                console.log(err);
                failures.push(venue);
            }
        }
        
        res.status(200);
        res.json({successes: successes, failures: failures});

    } else {
        res.sendStatus(500);
    }
});


// Server
app.listen(3000, function() {
 	console.log('Server started on port 3000');
});