// google api stuff
var apikey = 'AIzaSyAXF6z1NT5Dfci6kGmahPyxtsVsQFlOLnc',
    mapsUrl = 'https://maps.googleapis.com/maps/api/geocode/json?',
    map,
    infoWindow,
    service,
    markers = [];

// constants
// the lookup radius in meters
var RADIUS = 1000;
 // types of venues to search for
var VENUE_TYPES = ['restaurant','bar','cafe','night_club','casino','stadium','zoo','amusement_park'];

// Dom elements
var lookupButton,
    lookupInput,  
    submitButton,
    expandButton,
    clearButton;

// a dictionary of venue objects keyed by google's 'place_id'
var venues = {};

// holds info about the searched for location
var locationMeta = {
    country: '',
    state: '',
    city: '',
    postalCode: ''
};

// tracks the bounding corners of the most recent search to facilitate expansion
var searchBounds = {
    nw: { lat: 0, long: 0},
    ne: { lat: 0, long: 0},
    sw: { lat: 0, long: 0},
    se: { lat: 0, long: 0},
    segmentLength: 0,
    size: 0 // number of segments per side
};

var ConversionHelper = {
    metersToLat: function (meters) {
        return meters / 111111;
    },
    metersToLong: function (meters, lat) {
        return meters / (111111 * Math.cos(lat * Math.PI / 180));
    }
}

// init
$(function() {
    
    lookupButton = $('#lookupButton'),
    lookupInput  = $('#lookupInput'),
    expandButton = $('#expandButton'),
    clearButton =  $('#clearButton'),
    submitButton = $('#submitButton');
    
    // attach handler for the lookup button
    lookupButton.click(function (e) {
        clearVenues();
        //venues = {}; // should accumulate searches instead?
        disableUI();
        getLatLong(lookupInput.val(), function(center) {
            getMeta(center, function() {
                initMap(center);
                performSearch(center);
                // init the search bounding box
                initSearchBox(center.lat, center.lng);
            });
        });
    });
    
    expandButton.click(function(e) {
        disableUI();
        expandSearch();
    });
    
    clearButton.click(function(e) {
        clearVenues();
        expandButton.get(0).disabled = true;
        clearButton.get(0).disabled = true;
        submitButton.get(0).disabled = true;
    })
    
    submitButton.click(submitToDatabaseHandler);
    
    infowindow = new google.maps.InfoWindow();
});


function submitToDatabaseHandler(e) {
    disableUI();
    
    // send data to server
    
    // need to chunk the data
    var keys = Object.keys(venues),
        chunks = [],
        chunkSize = 100;
    
    for (var i = 0; i < Math.ceil(keys.length / chunkSize); i++) {
        for (var p = 0; p < chunkSize; p++) {
            var key = keys[p + i * chunkSize];
            if (key === undefined) break;
            if (chunks[i] === undefined) chunks[i] = {};
            chunks[i][key] = venues[key];
        }
    }
    
    var resultsAccum = { successes: [], failures: [] };
    
    for (var i in chunks) {
        
        var data = JSON.stringify(chunks[i]);
        
        $.ajax({
            dataType:    "json",
            contentType: "application/json; charset=utf-8",
            type:        "PUT",
            url:         '/',
            data:        data,
            success:     callback
        });
    }
    
    var chunkIndex = 0;
    function callback(result) {
        resultsAccum.successes = resultsAccum.successes.concat(result.successes);
        resultsAccum.failures = resultsAccum.failures.concat(result.failures);
        
        chunkIndex++;
        
        if (chunkIndex === chunks.length) success();
    }
    
    function success() {
        $('#resultSummary').text('Succeeded: ' + resultsAccum.successes.length + ', Failed: ' + resultsAccum.failures.length);
        $('#resultDump').text(JSON.stringify(resultsAccum));
        $('#outputModal').modal();
        searchDone();
    }
}


// set the search bounding rect given the center point of the initial search
function initSearchBox(lat, long) {
    
    var segmentLength = Math.sqrt(RADIUS * RADIUS * 2),
        latOffset     = ConversionHelper.metersToLat(segmentLength),
        lngOffset     = ConversionHelper.metersToLong(segmentLength, lat);
    
    searchBounds.ne.lat        = searchBounds.nw.lat = lat + latOffset;
    searchBounds.ne.long       = searchBounds.se.long = long + lngOffset;
    searchBounds.nw.long       = searchBounds.sw.long = long - lngOffset;
    searchBounds.se.lat        = searchBounds.sw.lat = lat - latOffset;
    searchBounds.segmentLength = segmentLength;
    searchBounds.size          = 1;
}


// find the lat and long of the location
function getLatLong(location, callBack) {
    
    if (location) {
        var address = 'address=' + location.replace(' ', '+'),
            key     = '&key=' + apikey,
            url     = mapsUrl + address + key;
        
        var center;
    
        $.getJSON(url, function(resp) {
            var data = resp.results;
            console.log(data);
            center = data[0].geometry.location;
            
            callBack(center);
        });
    }
}


// gets location info for a geocode
function getMeta(loc, callback) {
    var url = mapsUrl +
              'latlng=' +loc.lat + ',' + loc.lng +
              "&key=" + apikey;
    
    $.getJSON(url, function(resp) {
        var data = resp.results;
        var ac = data[0].address_components;
        
        // assign the meta data
        for (var i in ac) {
            if (ac[i].types) {
                switch (ac[i].types[0]) {
                    case 'postal_code':
                        locationMeta.postalCode = ac[i].long_name;
                        break;
                    case 'country':
                        locationMeta.country = ac[i].long_name;
                        break;
                    case 'locality':
                        locationMeta.city = ac[i].long_name;
                        break;
                    case 'administrative_area_level_1':
                        locationMeta.state = ac[i].long_name;
                        break;
                }
            }
        }
        
        if (callback) callback();
    });
}


// creates the map and initiates the search for each venue type
function initMap(center) {
    if (center) {
        
        map = new google.maps.Map(document.getElementById('map'), {
        	zoom:           14,
        	center:         center,
        	mapTypeId:      'roadmap',
        	clickableIcons: false
  	    });
        
        
    }
}


function expandSearch() {
    if (searchBounds.segmentLength > 0) {
        
        // top row
        var lngIncr   = ConversionHelper.metersToLong(searchBounds.segmentLength, searchBounds.ne.lat);
        var latIncr   = ConversionHelper.metersToLat(searchBounds.segmentLength);
        var centerLat = searchBounds.ne.lat,// + latIncr / 2,
            centerLng = searchBounds.ne.long;// - lngIncr / 2;
        
                
        // set new bounds
        searchBounds.ne.lat += latIncr;
        searchBounds.ne.long += lngIncr;
        searchBounds.nw.lat += latIncr;
        searchBounds.nw.long -= lngIncr;
        searchBounds.se.lat -= latIncr;
        searchBounds.sw.lat -= latIncr;
        
        var searchChain = null;
        
        for (var i=0; i < searchBounds.size + 2; i++) {
            
            var c = {
                lat: centerLat,
                lng: centerLng
            };
            
            searchChain = getMeta.bind(
                this,
                c,
                performSearch.bind(
                    this,
                    c,
                    searchChain
                )
            );
                        
            // move east to west
            centerLng -= lngIncr;
        }
        centerLng += lngIncr;
        
        // left side
        centerLat -= latIncr;
        
        for (var i=0; i < searchBounds.size; i++) {

            var c = {
                lat: centerLat,
                lng: centerLng
            };
            
            searchChain = getMeta.bind(
                this,
                c,
                performSearch.bind(
                    this,
                    c,
                    searchChain
                )
            );
            
            // move north to south
            centerLat -= latIncr;
        }
        
        // bottom row
        lngIncr = ConversionHelper.metersToLong(searchBounds.segmentLength, centerLat);
        
        searchBounds.sw.long -= lngIncr;
        searchBounds.se.long += lngIncr;
        
        for (var i=0; i < searchBounds.size + 2; i++) {

            var c = {
                lat: centerLat,
                lng: centerLng
            };
            
            searchChain = getMeta.bind(
                this,
                c,
                performSearch.bind(
                    this,
                    c,
                    searchChain
                )
            );
            
            // move west to east
            centerLng += lngIncr;
        }
        centerLng -= lngIncr;
        
        // right side
        centerLat += latIncr;
        
        for (var i=0; i <searchBounds.size; i++) {

            var c = {
                lat: centerLat,
                lng: centerLng
            };
            
            searchChain = getMeta.bind(
                this,
                c,
                performSearch.bind(
                    this,
                    c,
                    searchChain
                )
            );
            
            centerLat += latIncr;
        }
        
        // start search
        searchChain();
        
        // increment the size
        searchBounds.size += 2;
    }
}

// find the venues at a given location
function performSearch(center, searchChain = null) {
    service = new google.maps.places.PlacesService(map);
    
    function search(next, vi) {
        // perform a seperate search for each type for maximum payload
	    service.nearbySearch({
        	location: center,
        	radius: RADIUS,
        	type: VENUE_TYPES[vi]
  	    }, next);
    }
    
    for (var i=0; i<VENUE_TYPES.length; i++) {
        // build up the search chain
        searchChain = search.bind(this, callback.bind(this, searchChain), i);        
    }
    
    // start the search
    if (searchChain) searchChain();
}


// callback for results from places search
function callback(nextSearch, results, status, pagination) {
	
	if (status === google.maps.places.PlacesServiceStatus.OK) {
	
		for (var i = 0; i < results.length; i++) {
			var place = results[i];
            
            if (!venues.hasOwnProperty(place.place_id)) {
                addMarker(place);
            }
            
            // add to the venue dict
            venues[place.place_id] = {
				name:       place.name,
      			location:   place.geometry.location,
		      	bounds:     place.geometry.viewport,
		      	types:      place.types,
                postalCode: locationMeta.postalCode,
                address:    place.vicinity,
                state:      locationMeta.state,
                city:       locationMeta.city
			};            
		}
        
        if (pagination.hasNextPage) {
            // asyncronously calls the current function with new results
            pagination.nextPage();
        }
        else {
            // no other pages
            if (nextSearch) nextSearch();
            else searchDone();
        }
	} else {
        if (nextSearch) nextSearch();
        else searchDone();
    }
}


// called when all searching has finished
function searchDone() {
    if (Object.keys(venues).length) {
        submitButton.get(0).disabled = false;
        expandButton.get(0).disabled = false;
        clearButton.get(0).disabled = false;
    }
    lookupButton.get(0).disabled = false;
    
    console.log("number of venues: " + Object.keys(venues).length);
    console.log(venues);
}


// disables the ui elements while searching occurs
function disableUI() {
    submitButton.get(0).disabled = true;
    lookupButton.get(0).disabled = true;
    expandButton.get(0).disabled = true;
    clearButton.get(0).disabled = true;
}


// adds a marker at given place
function addMarker(place) {
  var marker = new google.maps.Marker({
    map: map,
    position: place.geometry.location,
  });
    
  markers.push(marker);

  google.maps.event.addListener(marker, 'click', function() {
    	infowindow.setContent(place.name+'('+JSON.stringify(place.types)+')');
    	infowindow.open(map, this);
	});
}


// Resets the mapmarkers and the venue dictionary
function clearVenues() {
    clearMarkers();
    venues = {};
}


// delete all map markers
function clearMarkers() {
    for (var i=0; i<markers.length; i++) {
        markers[i].setMap(null);
    }
    
    markers = [];
}