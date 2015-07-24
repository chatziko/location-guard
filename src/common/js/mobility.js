var mobilityMap;
// var intro;
// var showPressed, geoDone;

$.mobile.ajaxEnabled = false;
$.mobile.linkBindingEnabled = false;

$(document).ready(function() {
	$("#left-panel").panel().enhanceWithin();			// initialize panel

	// open panel on swipe
	$(document).on("swiperight", function(e) {
		if($("#left-panel").css("visibility") !== "visible" )		// check if already open (manually or due to large screen)
			$("#left-panel").panel("open");
	});

	// setup map
	mobilityMap = new L.map('mobilityMap')
		.addLayer(new L.TileLayer(
			'http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
			{ attribution: 'Map data © OpenStreetMap contributors' }
		))
		// .on('click', function(e){
		// 	intro.exit();
		// })
		.setView([0,0], 2);



    var domains = {};

    var select = document.getElementById("domain");
    select.onchange = function(e){refreshMap(e.target.value)}; 

    var refreshMap = function(value){
	blog("changed to " + value);
	var bb = new L.LatLngBounds();

	for (var domain in domains){
	    mobilityMap.removeLayer(domains[domain][0]);
	    mobilityMap.removeLayer(domains[domain][1]);
	}
	if (value == "All") {
	    for (var domain in domains){
		var bounds = displayDomain(domain);
		bb.extend(bounds);
	    }
	} else {
	    bb = displayDomain(value);
	}
	mobilityMap.fitBounds(bb);
    };

    var displayDomain = function(domain){
	blog("displaying", domain);
	var reals = domains[domain][0];
	var sanit = domains[domain][1];
	mobilityMap.addLayer(reals);
	mobilityMap.addLayer(sanit);
	return reals.getBounds().extend(sanit.getBounds());
    }


    var refreshUI = function(){
	Browser.storage.get(function(st) {

	    // clear domains data structure
	    for (var domain in domains){
		mobilityMap.removeLayer(domains[domain][0]);
		mobilityMap.removeLayer(domains[domain][1]);
	    }
	    domains = [];

	    // populate domains data structure with new layers of points
	    blog('logs',st.logs.data);
	    st.logs.data.forEach(function(el){
		var realLayer = null;
		var sanitLayer = null;
		if (!domains[el.domain]) {
		    realLayer = new L.featureGroup();
		    sanitLayer = new L.featureGroup();
		    domains[el.domain] = [realLayer,sanitLayer];
		} else {
		    realLayer = domains[el.domain][0];
		    sanitLayer = domains[el.domain][1];
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
		var makeMarker = function(p,color,opa){
		    var popupString = '<div class="popup">';
		    popupString += 'Coord [' + p.coords.latitude + ',' + p.coords.latitude + '] <br />';
		    popupString += 'Time: ' + (new Date(p.timestamp)).toISOString() + '<br />';
		    popupString += '</div>';
		    
		    var marker = L.circleMarker([p.coords.latitude, 
						 p.coords.longitude], 
						circleStyleMaker(color,opa));
		    marker.bindPopup(popupString, { maxHeight: 200 });
		    return marker
		}
		realLayer.addLayer(makeMarker(el.real,'#FF0000',1));
		sanitLayer.addLayer(makeMarker(el.sanitized,'#0000FF',1));
	    });
	    // clear select menu
	    while (select.firstChild) {
		select.removeChild(select.firstChild);
	    }	
	    // make select menu
	    var optionAll = document.createElement("option");
	    optionAll.appendChild(document.createTextNode("All"));
	    select.appendChild(optionAll);
	    var options = [];
	    for (var domain in domains) {
		var size = domains[domain][0].getLayers().length;
		var option = document.createElement("option");
		option.appendChild(document.createTextNode(domain + " ("+size+")"));
		option.setAttribute("value",domain);
		options.push([size,option]);
	    };
	    options.sort(function(a,b){return a[0] < b[0]});
	    options.forEach(function(option){select.appendChild(option[1])});

	    blog('domains',domains);
	    refreshMap('All');
	})
    }
    refreshUI();
    

    // display on http://geojsonlint.com/
    var exportGeojson = function(){
	function exportLog(log) {
	    var realGeojson = { "type": "Feature",
    				"geometry": {"type": "Point", 
    					     "coordinates": [log.real.coords.longitude,
							     log.real.coords.latitude]},
    				"properties": {
				    "accuracy": log.real.coords.accuracy,
				    "timestamp": log.timestamp
				}
    			      };
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
	    return [realGeojson,sanitGeojson]
	}

	Browser.storage.get(function(st) {
	    var features = [];
	    st.logs.data.forEach(function(log){
		var points = exportLog(log);
		features.push(points[0]);
		features.push(points[1]);
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
	Browser.storage.get(function(st) {
	    st.logs.data = [];
	    Browser.storage.set(st);
	    refreshUI();
	    blog('delete all data');
	})	
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
	    refreshUI();
	})	
    }
    function deleteHour(){
	var hour = 60 * 60 * 1000;
	deletePastInterval(hour);
	blog('delete past hour');
    }
    document.getElementById('deleteHour').onclick = deleteHour;

    function deleteDay(){
	var day = 24 * 60 * 60 * 1000;
	deletePastInterval(day);
	blog('delete past day');
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
	    refreshUI();
	})
    };
    document.getElementById('profile').onchange = handleEventFile(importProfile);
    if (!Browser.debugging) {document.getElementById('profile').remove()}



    function generateProfile(filedata) {
	blog('generate profile');
	Browser.storage.get(function(st) {
	    var data = JSON.parse(filedata);

	    var makeTimestamp =
		(function(){
		    var day = 24 * 3600 * 1000;
		    var days = data.features.length * day; 
		    var start = Date.now() - days;
		    return function(idx){
			if (idx == data.features.length -1) { 
			    return Date.now() - (30 * 60 * 1000); //to test deleteHour
			} else if (idx == data.features.length -2) { 
			    return Date.now() - (2 * 3600 * 1000); //to test deleteDay
			} else { // random
			    start += Math.random() * day;
			    blog('timestamp', (new Date(start)).toISOString());
			    return start
			}
		    }})()
	    

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
		    timestamp: makeTimestamp(i)};
		
		var idx = Math.floor(Math.random()*3);
		var radius = ([200,500,2000])[idx];
		var level = (["low","medium","high"])[idx];
		var domain = level + ".com";
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
	    refreshUI();
	    blog('logs ', st.logs.data);
	})
    }
    document.getElementById('reals').onchange = handleEventFile(generateProfile);
    if (!Browser.debugging) {document.getElementById('reals').remove()}












	// extend the Locate control and override the "start" method, so that it sets the marker to the user's location
	// see https://github.com/domoritz/leaflet-locatecontrol
	//
	// var myLocate = L.Control.Locate.extend({
	//    start: showCurrentPosition
	// });
	// new myLocate({
	// 		icon: 'icon-trans ui-btn-icon-notext ui-icon-location',				// use jqm's icons to avoid loading
	// 		iconLoading: 'icon-trans ui-btn-icon-notext ui-icon-location',		// font awesome
	// 	})
	// .addTo(demoMap);

	// set tooltip's max-width to the width of the page
	// this cannot be done with max-width: 100% cause introjs-tooltip's parent has width=0 !
	// var w = $(window).width() - 40;
	// $('head').append('<style> .introjs-tooltip { max-width: '+w+'px } </style>');

	// $("#demo-link").on("click", function() {
	// 	if(intro._currentStep == undefined)
	// 		intro.start();

	// 	$("#left-panel").panel("close");
	// });

	// ready to go
	// startDemo();
});

// function showCurrentPosition() {
// 	navigator.geolocation.getCurrentPosition(
// 		drawPosition,
// 		function(err) {
// 			geoDone = true;
// 			alert("The following error occurred while retrieving your location:\n\n" + err.message);
// 		}
// 	);

// 	showPressed = true;
// 	if(intro._currentStep + 1 <= 2)
// 		intro.goToStep(3);
// }

// function drawPosition(pos) {
// 	var latlng = [pos.coords.latitude, pos.coords.longitude];
// 	var acc = pos.coords.accuracy;

// 	if(!demoMap.marker) {
// 		demoMap.marker = new L.marker(latlng)
// 			.addTo(demoMap);

// 		demoMap.accuracy = new L.Circle(latlng, acc, {
// 				color: '#136AEC',
// 				fillColor: '#136AEC',
// 				fillOpacity: 0.15,
// 				weight: 2,
// 				opacity: 0.5,
// 			})
// 			.addTo(demoMap);
// 	}

// 	demoMap.marker.setLatLng(latlng);
// 	demoMap.accuracy.setLatLng(latlng);
// 	demoMap.accuracy.setRadius(acc);

// 	demoMap.fitBounds(demoMap.accuracy.getBounds());

// 	geoDone = true;
// 	if(intro._currentStep + 1 <= 3)
// 		intro.goToStep(4);
// }

// function startDemo() {
// 	intro = introJs();
// 	intro
// 	.setOptions({
// 		steps: [ {
// 				element: ".placeholder-step1",
// 				intro: '<p>Location Guard was successfully installed.</p><p>This demo illustrates its use.</p>',
// 				position: "floating",
// 				tooltipClass: 'tooltip-step1',
// 			}, {
// 				element: ".leaflet-control-locate",
// 				intro:
// 					'<p>The demo asks the browser for your location when you press the ' +
// 					'<span class="popup-location-btn ui-btn ui-btn-inline ui-icon-location ui-btn-icon-notext"></span> ' +
// 					'button.</p><p>Press it!</p>',
// 				position: 'bottom',
// 				tooltipClass: 'tooltip-step2',
// 			}, {
// 				element: ".placeholder-step3",
// 				intro:
// 					'<p>The browser asks permission to disclose your location. At the same time, the ' +
// 					'<img src="images/pin_19.png" style="width: 0.9em"/> icon appears, showing that Location Guard is active.</p>' +
// 					'<p>To continue, allow access to your location.</p>',
// 				position: 'bottom-right-aligned',
// 				tooltipClass: 'tooltip-step3',
// 			}, {
// 				element: ".placeholder-step4",
// 				intro:
// 					'<p>This is the location disclosed by your browser. Location Guard added "noise" to it so that it\'s not ' +
// 					'very accurate.</p><p>Click on the <img src="images/pin_19.png" style="width: 0.9em"/> icon to try more options.</p>',
// 				position: "bottom-middle-aligned",
// 				highlightClass: 'highlight-step4',
// 				tooltipClass: 'tooltip-step4',
// 		} ],
// 		overlayOpacity: 0,
// 		showStepNumbers: false,
// 		skipLabel: "Close",
// 		doneLabel: "Close",
// 		keyboardNavigation: "keyboardNavigation",
// 	})
// 	.onafterchange(function() {
// 		var step = intro._currentStep + 1;

// 		// disable "Next" in steps 2/3 until the corresponding actions are performed
// 		$(".introjs-nextbutton").toggleClass(
// 			"introjs-disabled unclickable",
// 			(step == 2 && !showPressed) || (step == 3 && !geoDone) || step == 4
// 		);

// 		// remove dark overlay in steps 1, 4
// 		$(".introjs-overlay")[0].style.opacity = (step == 1 || step == 4 ? 0 : 0.5);
// 	})
// 	.start();
// }
