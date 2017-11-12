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
var VENUE_TYPES = ['restaurant','bar','cafe','night_club','casino','stadium','zoo','amusement_park'];

// Dom elements
var lookupButton,
    lookupInput,  
    submitButton,
    venueData;

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
        return meters / (111111 * Math.cos(lat));
    }
}

// init
$(function() {
    
    lookupButton = $('#lookupButton'),
    lookupInput  = $('#lookupInput'),
    submitButton = $('#submitButton'),
    venueData    = $('#venueData');
    
    // attach handler for the lookup button
    lookupButton.click(function (e) {
        venues = {}; // should accumulate searches instead?
        venueData.val('');
        submitButton.get(0).disabled = true;
        lookupButton.get(0).disabled = true;
        var center = getLatLong(lookupInput.val());
        
        initMap(center);
        performSearch(center);
        // init the search bounding box
        initSearchBox(center.lat, center.lng);
    });
    
    
    submitButton.click(function (e) {
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
            console.log(result);
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
    searchBounds.ne.long = searchBounds.se.long = long - lngOffset;
    searchBounds.nw.long = searchBounds.sw.long = long + lngOffset;
    searchBounds.se.lat = searchBounds.sw.lat = lat - latOffset;
    searchBounds.segmentLength = segmentLength;
    searchBounds.size = 1;
}


// find the lat and long of the location
function getLatLong(location) {
    
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
            }
       });
        
        return center;
    }
    
    return null;
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
        var centerLat = searchBounds.ne.lat + latIncr / 2,
            centerLng = searchBounds.ne.long - lngIncr / 2;
        
        // set new bounds
        searchBounds.ne.lat += latIncr;
        searchBounds.ne.long -= lngIncr;
        searchBounds.nw.lat += latIncr;
        searchBounds.nw.long += lngIncr;
        searchBounds.se.lat -= latIncr;
        searchBounds.sw.lat -= latIncr;
        
        for (var i=0; i < searchBounds.size + 2; i++) {
            performSearch({
                lat: centerLat,
                lng: centerLng
            });
            
            // move east to west
            centerLng += lngIncr;
        }
        
        // left side
        centerLat -= ConversionHelper.metersToLat(searchBounds.segmentLength);
        
        for (var i=0; i < searchBounds.size; i++) {
            performSearch({
                lat: centerLat,
                lng: centerLng
            });
            
            // move north to south
            centerLat -= latIncr;
        }
        
        // bottom row
        centerLat -= latIncr;
        lngIncr = ConversionHelper.metersToLong(searchBounds.size, centerLat);
        
        searchBounds.sw.long += lngIncr;
        searchBounds.se.long -= lngIncr;
        
        for (var i=0; i < searchBounds.size + 2; i++) {
            performSearch({
                lat: centerLat,
                lng: centerLng
            });
            
            // move west to east
            centerLng -= lngIncr;
        }
        
        // right side
        centerLat += latIncr;
        
        for (var i=0; i <searchBounds.size; i++) {
            performSearch({
                lat: centerLat,
                lng: centerLng
            });
            
            centerLat += latIncr;
        }
        
        // increment the size
        searchBounds.size += 2;
    }
}


function performSearch(center) {
    for (var t in VENUE_TYPES){
 		service = new google.maps.places.PlacesService(map);
        // perform a seperate search for each type for maximum payload
		service.nearbySearch({
    		location: center,
    		radius: RADIUS,
    		type: VENUE_TYPES[t]
  		}, callback);
  	}
}


// callback for results from places search
function callback(results, status, pagination) {
	
	if (status === google.maps.places.PlacesServiceStatus.OK) {
	
		for (var i = 0; i < results.length; i++) {
			var place=results[i];
		
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
            
            addMarker(place);
		}
        
        if (pagination.hasNextPage) {
            // asyncronously calls the current function with new results
            pagination.nextPage();
        }
        else {
            // no other pages
            searchDone();
        }
	}
}


// called when all searching has finished
function searchDone() {
    if (Object.keys(venues).length) {
        submitButton.get(0).disabled = false;
    }
    lookupButton.get(0).disabled = false;
}


// adds a marker for a venue object
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