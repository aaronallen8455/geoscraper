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

// inserting new venues (ajax)
app.put('/', (req, res) => {
    
    var venueData,
        placeIds;
        
    if ((venueData = req.body) && (placeIds = Object.keys(venueData)) && placeIds.length) {
        
        var query1 = 'INSERT INTO place_ids(place_id) VALUES($1)',
            query2 = 'INSERT INTO venues(name, address, state) VALUES($1, $2, $3)';
        //var query = 'BEGIN; INSERT INTO place_ids(place_id) VALUES($1); INSERT INTO venues(name, address, state) VALUES($2, $3, $4); COMMIT;';
        //var query = 'INSERT INTO venues(name, address, state) VALUES($1, $2, $3)';
        var failures = [],
            successes = [];
        
        // recursive function to run the queries sequentially
        function insertVenue(placeIndex) {
            var placeId = placeIds[placeIndex];
            
            if (placeId === undefined) {
                // we have reached the end
                res.status(200);
                res.json({successes: successes, failures: failures});
                return;
            }
            
            var venue = venueData[placeId];

            var params = [
                venue.name,
                venue.address,
                venue.state
            ];

            db.query(query1, [placeId], (err, result) => {
                if (err) {
                    failures.push(venueData[placeId]);
                    //console.log(err);
                    
                    // run next query
                    insertVenue(placeIndex + 1);
                } else {
                    // query1 succeeded, venue is not a duplicate.
                    db.query(query2, params, (err, result) => {
                        if (err) {
                            failures.push(venueData[placeId]);
                            //console.log(err);
                        } else {
                            successes.push(venueData[placeId]);
                            
                            
                        }
                        
                        // run next query
                        insertVenue(placeIndex + 1);
                    });
                }                
            });
        }
        
        // start the loop
        insertVenue(0);
        
    } else {
        res.sendStatus(500);
    }
});


// Server
app.listen(3000, function() {
 	console.log('Server started on port 3000');
});