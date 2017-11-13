// google api stuff
var apikey = 'AIzaSyAXF6z1NT5Dfci6kGmahPyxtsVsQFlOLnc',
    mapsUrl = 'https://maps.googleapis.com/maps/api/geocode/json?',
    map,
    infoWindow,
    service,
    markers = [];

// constants
var RADIUS = 1000;
 // types of venues to search for
var VENUE_TYPES = ['restaurant'];//,'bar','cafe','night_club','casino','stadium','zoo','amusement_park'];

// Dom elements
var lookupButton,
    lookupInput,  
    submitButton,
    expandButton,
    clearButton;

// a dictionary of venue objects keyed by google 'place_id'
var venues = {};

// holds info about the searched for location : state, city, country
var locationMeta = {};

// tracks the bounding corners of the most recent search so we can expand it
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
    clearButton = $('#clearButton'),
    submitButton = $('#submitButton');
    
    // attach handler for the lookup button
    lookupButton.click(function (e) {
        venues = {}; // should accumulate searches instead?
        submitButton.get(0).disabled = true;
        lookupButton.get(0).disabled = true;
        getLatLong(lookupInput.val(), function(center) {
            initMap(center);
            performSearch(center);
            // init the search bounding box
            initSearchBox(center.lat, center.lng);
        });
    });
    
    expandButton.click(function(e) {
        expandSearch();
    });
    
    clearButton.click(function(e) {
        clearVenues();
    })
    
    submitButton.click(function (e) {
        // send data to server
        var data = JSON.stringify(venues);
        
        $.ajax({
            dataType:    "json",
            contentType: "application/json; charset=utf-8",
            type:        "PUT",
            url:         '/',
            data:        data,
            success:     success
        });
        
        function success(result) {
            $('#outputModalContent').text(JSON.stringify(result));
            $('#outputModal').modal();
        }
    });
    
    infowindow = new google.maps.InfoWindow();
});


// set the search bounding rect given the center point of the initial search
function initSearchBox(lat, long) {
    
    var segmentLength = Math.sqrt(RADIUS * RADIUS * 2),
        latOffset     = ConversionHelper.metersToLat(segmentLength),
        lngOffset     = ConversionHelper.metersToLong(segmentLength, lat);
    
    searchBounds.ne.lat = searchBounds.nw.lat = lat + latOffset;
    searchBounds.ne.long = searchBounds.se.long = long + lngOffset;
    searchBounds.nw.long = searchBounds.sw.long = long - lngOffset;
    searchBounds.se.lat = searchBounds.sw.lat = lat - latOffset;
    searchBounds.segmentLength = segmentLength;
    searchBounds.size = 1;
}


// find the lat and long of the location
function getLatLong(location, callBack) {
    
    if (location) {
        var address = 'address='+location.replace(' ','+'),
            key     = '&key='+apikey,
            url     = mapsUrl+address+key;
        
        var center;
    
        $.getJSON(url,function(resp){
            var data = resp.results;
                        
            for (var i in data){
                
                // get the location meta data
                var ac = data[i].address_components;
                for (var p=0; p<ac.length; p++) {
                    if (ac[p].types) {
                        switch (ac[p].types[0]) {
                            case 'locality':
                                locationMeta.city = ac[p].long_name;
                                break;
                            case 'administrative_area_level_1':
                                locationMeta.state = ac[p].long_name;
                                break;
                            case 'country':
                                locationMeta.country = ac[p].long_name;
                                break;
                        }
                    }
                }
                
                center = data[i].geometry.location;
                callBack(center);
            }
        });
    }
}


// creates the map and initiates the search for each venue type
function initMap(center) {
    if (center) {
        
        map = new google.maps.Map(document.getElementById('map'), {
        	zoom: 14,
        	center: center,
        	mapTypeId: 'roadmap',
        	clickableIcons: false
  	    });
    }
}


function expandSearch() {
    if (searchBounds.segmentLength > 0) {
        
        // top row
        var lngIncr = ConversionHelper.metersToLong(searchBounds.segmentLength, searchBounds.ne.lat);
        var latIncr = ConversionHelper.metersToLat(searchBounds.segmentLength);
        var centerLat = searchBounds.ne.lat,// + latIncr / 2,
            centerLng = searchBounds.ne.long;// - lngIncr / 2;
        
        var c = {
            lat: searchBounds.ne.lat,
            lng: searchBounds.ne.long
        };
        
        addMarker(c);
        
        // set new bounds
        searchBounds.ne.lat += latIncr;
        searchBounds.ne.long += lngIncr;
        searchBounds.nw.lat += latIncr;
        searchBounds.nw.long -= lngIncr;
        searchBounds.se.lat -= latIncr;
        searchBounds.sw.lat -= latIncr;
        
        var searchLoop = null;
        
        for (var i=0; i < searchBounds.size + 2; i++) {
            
            searchLoop = performSearch.bind(
                this, 
                {
                    lat: centerLat,
                    lng: centerLng
                },
                searchLoop
            );
                        
            // move east to west
            centerLng -= lngIncr;
        }
        centerLng += lngIncr;
        
        // left side
        centerLat -= latIncr;
        
        for (var i=0; i < searchBounds.size; i++) {

            searchLoop = performSearch.bind(
                this, 
                {
                    lat: centerLat,
                    lng: centerLng
                },
                searchLoop
            );
            
            // move north to south
            centerLat -= latIncr;
        }
        
        // bottom row
        lngIncr = ConversionHelper.metersToLong(searchBounds.segmentLength, centerLat);
        
        searchBounds.sw.long -= lngIncr;
        searchBounds.se.long += lngIncr;
        
        for (var i=0; i < searchBounds.size + 2; i++) {

            searchLoop = performSearch.bind(
                this, 
                {
                    lat: centerLat,
                    lng: centerLng
                },
                searchLoop
            );
            
            // move west to east
            centerLng += lngIncr;
        }
        centerLng -= lngIncr;
        
        // right side
        centerLat += latIncr;
        
        for (var i=0; i <searchBounds.size; i++) {

            searchLoop = performSearch.bind(
                this, 
                {
                    lat: centerLat,
                    lng: centerLng
                },
                searchLoop
            );
            
            centerLat += latIncr;
        }
        
        searchLoop();
        
        // increment the size
        searchBounds.size += 2;
    }
}


function performSearch(center, searchLoop = null) {
    service = new google.maps.places.PlacesService(map);
    
    for (var i=0; i<VENUE_TYPES.length; i++) {
                        
        function loop(next, vi) {
            // perform a seperate search for each type for maximum payload
		    service.nearbySearch({
    	    	location: center,
    	    	radius: RADIUS,
    	    	type: VENUE_TYPES[vi]
  		    }, callback);//next);
        }
        
        // build up the search loop chain
        searchLoop = loop.bind(this, callback.bind(this, searchLoop), i);        
    }
    
    // start the search
    if (searchLoop)
        searchLoop();
}


// callback for results from places search
function callback(loop, results, status, pagination) {
	
	if (status === google.maps.places.PlacesServiceStatus.OK) {
	
		for (var i = 0; i < results.length; i++) {
			var place = results[i];
            
            if (!venues.hasOwnProperty(place.place_id)) {
                addMarker(place.geometry.location);
            }
            
            // add to the venue dict
            venues[place.place_id] = {
				name:     place.name,
      			location: place.geometry.location,
		      	bounds:   place.geometry.viewport,
		      	types:    place.types,
                address:  place.vicinity,
                state:    locationMeta.state,
                city:     locationMeta.city
			};            
		}
        
        if (pagination.hasNextPage) {
            // asyncronously calls the current function with new results
            pagination.nextPage();
        }
        else {
            // no other pages
            //searchDone();
            if (loop) loop();
            else searchDone();
        }
	} else {
        if (loop) loop();
        else searchDone();
    }
}


// called when all searching has finished
function searchDone() {
    if (Object.keys(venues).length) {
        submitButton.get(0).disabled = false;
    }
    lookupButton.get(0).disabled = false;
    
    console.log(Object.keys(venues).length);
}


// adds a marker for a venue object
function addMarker(location) {
  var marker = new google.maps.Marker({
    map: map,
    position: location,
  });
    
  markers.push(marker);

  google.maps.event.addListener(marker, 'click', function() {
    	infowindow.setContent(place.name+'('+JSON.stringify(place.types)+')');
    	infowindow.open(map, this);
	});
}


// Resets the map and venue dictionary
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