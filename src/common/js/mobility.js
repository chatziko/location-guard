var map;
// var intro;
// var showPressed, geoDone;

$.mobile.ajaxEnabled = false;
//$.mobile.linkBindingEnabled = false;

$(document).ready(function() {
	$("#left-panel").panel().enhanceWithin();			// initialize panel

	// open panel on swipe
	$(document).on("swiperight", function(e) {
		if($("#left-panel").css("visibility") !== "visible" )		// check if already open (manually or due to large screen)
			$("#left-panel").panel("open");
	});

	// setup map
	map = new L.map('map')
		.addLayer(new L.TileLayer(
			'http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
			{ attribution: 'Map data © OpenStreetMap contributors' }
		))
		.setView([0,0], 2);


    var domains = {};

    var select = document.getElementById("domain");
    select.onchange = function(e){changeDomain(e.target.value)}; 

    var changeDomain = function(value){
	blog("changed to " + value);
	var bb = new L.LatLngBounds();

	for (var domain in domains){
	    map.removeLayer(domains[domain]);
	}
	if (value == "All") {
	    for (var domain in domains){
		var bounds = displayDomain(domain);
		bb.extend(bounds);
	    }
	} else {
	    bb = displayDomain(value);
	}
	map.fitBounds(bb);
    };

    var displayDomain = function(domain){
	blog("displaying", domain);
	var logs = domains[domain];
	map.addLayer(logs);
	return logs.getBounds();
    }


    var refreshMap = function(){
	Browser.storage.get(function(st) {

	    // clear domains data structure
	    for (var domain in domains){
		map.removeLayer(domains[domain]);
	    }
	    domains = [];

	    // populate domains data structure with new layers of points
	    blog('logs',st.logs.data);
	    st.logs.data.forEach(function(log){
		if (!log.real){blog('skipping fixed location');return;}
		var domainLayer = null;
		if (!domains[log.domain]) {
		    domainLayer = new L.featureGroup();
		    domains[log.domain] = domainLayer;
		} else {
		    domainLayer = domains[log.domain];
		}
		
		var circleStyleMaker = function(color,opa){
		    return {
			radius: 5,
			fillColor: color,
			color: "#000",
			weight: 1,
			opacity: opa,
			fillOpacity: opa
		    }
		}
		var red  = '#FF0000';
		var blue = '#0000FF';

		var cooReal = [log.real.coords.latitude,
			       log.real.coords.longitude];
		var cooSanit = [log.sanitized.coords.latitude,
				log.sanitized.coords.longitude]
		var markerReal = L.circleMarker(cooReal, circleStyleMaker(red,1));
		var markerSanit = L.circleMarker(cooSanit, circleStyleMaker(blue,1));
		var line = L.polyline([cooReal,cooSanit], {color: 'grey'});

		var logLayer = new L.featureGroup();
		logLayer.addLayer(markerReal);
		logLayer.addLayer(markerSanit);

		var distance = Math.floor(L.latLng(cooReal).distanceTo(cooSanit));
		var popupString = '<div class="popup">';
		// popupString += 'Coord [' + p.coords.latitude + ',' + p.coords.latitude + '] <br />';
		popupString += '<a href='+log.domain+'>'+log.domain + '</a><br />';
		popupString += 'Level: ' + log.level + '<br />';
		popupString += 'Distance: ' + distance + ' m <br />';
		popupString += 'Time: ' + (new Date(log.timestamp)).toLocaleString() + '<br />';
		popupString += '</div>';

		var popup = L.popup().setContent(popupString);
		popup.setLatLng(line.getBounds().getCenter());

		var removeLine = function(e){
		    logLayer.removeLayer(line);
		}
		var visible = false
		var toggleLine = function(e){
		    if (visible) {
			logLayer.removeLayer(line);
			visible = false;
		    } else {
			logLayer.addLayer(line);
			map.fitBounds(logLayer.getBounds());
			popup.openOn(map);
			map.addOneTimeEventListener('click',toggleLine);
			visible = true;
		    }
		}
		logLayer.on('click',toggleLine);

		domainLayer.addLayer(logLayer);
	    });
	    // clear select menu
	    while (select.firstChild) {
		select.removeChild(select.firstChild);
	    }	
	    // make select menu
	    var optionAll = document.createElement("option");
	    optionAll.appendChild(document.createTextNode("All"));
	    optionAll.setAttribute("value","All");
	    optionAll.selected = true;
	    select.appendChild(optionAll);

	    var options = [];
	    for (var domain in domains) {
	    	var size = domains[domain].getLayers().length;
	    	var option = document.createElement("option");
	    	option.appendChild(document.createTextNode(domain + " ("+size+")"));
	    	option.setAttribute("value",domain);
	    	options.push([size,option]);
	    };
	    options.sort(function(a,b){return a[0] < b[0]});
	    options.forEach(function(option){select.appendChild(option[1])});

	    $('#domain').selectmenu( "refresh" );
	    blog('domains',domains);
	    changeDomain('All');

	})
    }
    

    // display on http://geojsonlint.com/
    var exportGeojson = function(){
	function exportLog(log) {
	    var sanitGeojson = { "type": "Feature",
    				 "geometry": {"type": "Point", 
    					      "coordinates": [log.sanitized.coords.longitude,
							      log.sanitized.coords.latitude]},
    				 "properties": {
				     "accuracy": log.sanitized.coords.accuracy,
				     "level": (log.level + ": " + log.radius),
				     "domain": log.domain,
				     "timestamp": log.timestamp,
				 }
    			       };
	    if (log.real) {
		var realGeojson = { "type": "Feature",
    				    "geometry": {"type": "Point", 
    						 "coordinates": [log.real.coords.longitude,
								 log.real.coords.latitude]},
    				    "properties": {
					"accuracy": log.real.coords.accuracy,
					"timestamp": log.timestamp
				    }
    				  };
		return [realGeojson,sanitGeojson]
	    } else {
		return [sanitGeojson]
	    }
	}

	Browser.storage.get(function(st) {
	    var features = [];
	    st.logs.data.forEach(function(log){
		var points = exportLog(log);
		features.concat(points);
	    });
    	    var geojson = { "type": "FeatureCollection",
    			    "features": features
    			  };
	    var geojsonString = JSON.stringify(geojson);
	    var now = new Date();
	    var filename = 'location-guard-'+now.getFullYear()+'-'+(now.getMonth()+1)+'-'+now.getDate()+'-geo.json';
	    
	    var a         = document.createElement('a');
	    a.href        = 'data:attachment/json,' + geojsonString;
	    a.target      = '_blank';
	    a.download    = filename;
	    document.body.appendChild(a);
	    a.click();
	});
    }
    document.getElementById('exportGeojson').onclick = exportGeojson;
    if (!Browser.debugging) {document.getElementById('exportGeojson').remove()}

	// var allLayer = new L.featureGroup();
	// for (var domain in domains){
	//     allLayer.addLayer(domains[domain][0]);
	//     allLayer.addLayer(domains[domain][1]);
	// }
        // var geojsonString = JSON.stringify(allLayer.toGeoJSON());

    function exportJson(){
	Browser.storage.get(function(st) {
	    var jsonString = JSON.stringify(st.logs.data);
	    var now = new Date();
	    var filename = 'location-guard-'+now.getFullYear()+'-'+(now.getMonth()+1)+'-'+now.getDate()+'.json';
	    
	    var a         = document.createElement('a');
	    a.href        = 'data:attachment/json,' + jsonString;
	    a.target      = '_blank';
	    a.download    = filename;
	    document.body.appendChild(a);
	    a.click();
	});
    }
    document.getElementById('export').onclick = exportJson;



    function deleteAll(){
	if(window.confirm('Are you sure you want to delete all data?')) {
	    Browser.storage.get(function(st) {
		st.logs.data = [];
		Browser.storage.set(st);
		refreshMap();
		blog('delete all data');
	    })	
	}
    }
    document.getElementById('deleteAll').onclick = deleteAll;

    function deletePastInterval(time){
	var now = Date.now();
	Browser.storage.get(function(st) {
	    st.logs.data = st.logs.data.filter(function(log){
		var str = 
		    "time: " + (new Date(time)).toISOString() + "\n" + 
		    "now: " + (new Date(now)).toISOString() + "\n" + 
		    "stamp: " + (new Date(log.timestamp)).toISOString() + "\n";
		blog(str);
		if (log.timestamp < now - time) {return true}
		else {return false}
	    });
	    Browser.storage.set(st);
	    refreshMap();
	})	
    }
    function deleteHour(){
	if(window.confirm('Are you sure you want to delete the past hour?')) {
	    var hour = 60 * 60 * 1000;
	    deletePastInterval(hour);
	    blog('delete past hour');
	}
    }
    document.getElementById('deleteHour').onclick = deleteHour;

    function deleteDay(){
	if(window.confirm('Are you sure you want to delete the last day?')) {
	    var day = 24 * 60 * 60 * 1000;
	    deletePastInterval(day);
	    blog('delete past day');
	}
	blog('closeit');
	$('popupMenu').popup('close');
    }
    document.getElementById('deleteDay').onclick = deleteDay;








    function handleEventFile(fileHandler) {
	return function(evt){
	    var file = evt.target.files[0];
	    var reader = null;
	    
            reader = new FileReader();
	    
            reader.onload = (function(file){
		return function(e){
		    
		    blog('loading ' + file.name);
		    fileHandler(e.target.result);
		    
		}})(file);                  // closure trick to remember file
	    reader.readAsText(file);
	}
    };


    function importProfile(filedata) {
	blog('import profile');
	Browser.storage.get(function(st) {
	    st.logs.data = JSON.parse(filedata);
	    Browser.storage.set(st);
	    refreshMap();
	})
    };
    // document.getElementById('profile').onchange = handleEventFile(importProfile);
    // if (!Browser.debugging) {document.getElementById('profile').remove()}
    $('#profile input').change(handleEventFile(importProfile));
    if (!Browser.debugging) {$('#profile').remove()}



    function generateProfile(filedata) {
	blog('generate profile');
	Browser.storage.get(function(st) {
	    var data = JSON.parse(filedata);

	    // TODO GENERATE SOME CACHED POINTS

	    var timestamps = [];
	    var now = Date.now();
	    var hour = 3600 * 1000;
	    var day = 24 * hour;
	    timestamps.push(now - (0.5 * hour)); //to test deleteHour
	    timestamps.push(now - (2   * hour)); //to test deleteDay
	    var size = data.features.length -2 +1; // minus the two previous points, plus the fixed one
	    for (var i=1; i<=size; i++) {
		timestamps.push(now - (i*day));
	    }
	    
	    // blog('timestamp', (new Date(start)).toISOString());
    

	    var fixed = {
		coords: {
		    latitude: st.fixedPos.latitude,
		    longitude: st.fixedPos.longitude,
		    accuracy: 10,
		    altitude: null,
		    altitudeAccuracy: null,
		    heading: null,
		    speed: null
		},
		timestamp: timestamps[0]
	    };
	    st.logs.data.push(fixed);

	    data.features.forEach(function(p,i) {
		var real = {
		    coords: {
			latitude: p.geometry.coordinates[1],
			longitude: p.geometry.coordinates[0],
			accuracy: 10,
			altitude: null,
			altitudeAccuracy: null,
			heading: null,
			speed: null
		    },
		    timestamp: timestamps[i]};
		
		var idx = Math.floor(Math.random()*3);
		var radius = ([200,500,2000])[idx];
		var level = (["low","medium","high"])[idx];
		
		var domains = ["http://openstreetmap.org/", "http://maps.google.com/", "http://accuweather.com/", "http://html5demos.com/geo", "http://forecast.io/", "http://facebook.com/", "https://foursquare.com/", "http://instagram.com/", "http://tripadvisor.it/", "http://yelp.com/"];
		var domain = domains[Math.floor(Math.random()*domains.length)];

		var epsilon = 2 / radius;
		var pl = new PlannarLaplace();
		var noisy = pl.addNoise(epsilon,real.coords);
		var accuracy = Math.round(pl.alphaDeltaAccuracy(epsilon, .9)) + real.coords.accuracy;
		var sanitized = {
		    coords: {
			latitude: noisy.latitude,
			longitude: noisy.longitude,
			accuracy: accuracy,
			altitude: null,
			altitudeAccuracy: null,
			heading: null,
			speed: null
		    },
		    timestamp: real.timestamp};

		st.logs.data.push({real: real,
				   sanitized: sanitized,
				   level: level,
				   radius: st.levels[level].radius,
				   domain: domain,
				   timestamp: real.timestamp});
	    });
	    Browser.storage.set(st);
	    refreshMap();
	    blog('logs ', st.logs.data);
	})
    }
    $('#reals input').change(handleEventFile(generateProfile));
    if (!Browser.debugging) {$('#reals').remove()}


    var deactivate = function(){
	if(window.confirm('Deactivate and delete all data?')) {
	    Browser.storage.get(function(st) {
		st.logs.data = [];
		st.logs.enabled = false;
		st.logs.send = true;
		blog('delete all data and deactivated logging');
		Browser.storage.set(st);
		refreshUI;
	    })
	}
    }
    document.getElementById('deactivate').onclick = deactivate;

    var activate = function(){
	Browser.storage.get(function(st) {
	    st.logs.enabled = true;
	    blog('logging activated');
	    Browser.storage.set(st);
	})
    }

    var updateSend = function(e){
	Browser.storage.get(function(st) {
	    st.logs.send = e.target.checked;
	    blog('sending', e.target.checked);
	    $('.send').prop('checked', e.target.checked).checkboxradio( "refresh" );;
	    Browser.storage.set(st);
	})
    }

    var refreshUI = function(){
	$('#popupMenu').popup( "close" ); // TODO not working
	Browser.storage.get(function(st) {
	    $('.send').prop('checked', st.logs.send).checkboxradio( "refresh" );;
	    $('.send').change(updateSend);
	    if (!st.logs.enabled) {
		$('#activationDialog').popup({ positionTo: "#controls" }).popup('open');
		$('#activate').click(activate);
	    }
	    refreshMap();
	})
    }
    refreshUI();
    
});

