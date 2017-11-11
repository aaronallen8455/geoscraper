// google api stuff
var apikey = 'AIzaSyAXF6z1NT5Dfci6kGmahPyxtsVsQFlOLnc',
    mapsUrl = 'https://maps.googleapis.com/maps/api/geocode/json?',
    map,
    infoWindow,
    service;

// constants
var RADIUS = 1000;

// Dom elements
var lookupButton,
    lookupInput,  
    submitButton,
    venueData;

// a dictionary of venue objects keyed by google 'place_id'
var venues = {};

// holds info about the searched for location : state, city, country
var locationMeta = {};

// init
$(function() {
    
    lookupButton  = $('#lookupButton'),
    lookupInput   = $('#lookupInput'),
    submitButton  = $('#submitButton'),
    venueData     = $('#venueData');
    
    // attach handler for the lookup button
    lookupButton.click(function (e) {
        venues = {}; // should accumulate searches instead?
        venueData.val('');
        submitButton.get(0).disabled = true;
        lookupButton.get(0).disabled = true;
        getLatLong(lookupInput.val());
    });
    
    
    submitButton.click(function (e) {
        var data = JSON.stringify(venues);
        
        $.ajax({
            dataType: "json",
            contentType: "application/json; charset=utf-8",
            type: "PUT",
            url: '/',
            data: data,
            success: success
        });
        
        function success(result) {
            $('#outputModalContent').text(JSON.stringify(result));
            $('#outputModal').modal();
            console.log(result);
        }
    });
    
    infowindow = new google.maps.InfoWindow();
});


// find the lat and long of the location
function getLatLong(location) {
    
    if (location) {
        var address = 'address='+location.replace(' ','+'),
           key     = '&key='+apikey,
           url     = mapsUrl+address+key;
    
        $.getJSON(url,function(resp){
            var data = resp.results;
            
            locationMeta = {
                city: data[0].address_components[0],
                
            }
            
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
                
                initMap(data[i].geometry.location);
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
                
        // types of venues to search for
        var types=['restaurant','bar','cafe','night_club','casino','stadium','zoo','amusement_park'];
	    
	    for (var t in types){
 	    	service = new google.maps.places.PlacesService(map);
            // perform a seperate search for each type for maximum payload
	    	service.nearbySearch({
        		location: center,
        		radius: RADIUS,
        		type: types[t]
  	    	}, callback);
  	    }
    }
}


// callback for results from places search
function callback(results, status, pagination) {
	
	if (status === google.maps.places.PlacesServiceStatus.OK) {
	
		for (var i = 0; i < results.length; i++) {
			var place=results[i];
		
            // add to the venue dict
            venues[place.place_id] = {
				name:place.name,
      			location:place.geometry.location,
		      	bounds:place.geometry.viewport,
		      	types:place.types,
                address: place.vicinity,
                state: locationMeta.state,
                city: locationMeta.city
			};
		}
        
        if (pagination.hasNextPage) {
            // asyncronously calls the current function with new results
            pagination.nextPage();
        }
        else {
            // no other pages
            // add markers for each venue
            for (var id in venues) {
                addMarker(venues[id]);
            }
            
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
    position: place.location,
  });

  google.maps.event.addListener(marker, 'click', function() {
    	infowindow.setContent(place.name+'('+JSON.stringify(place.types)+')');
    	infowindow.open(map, this);
	});
}