
const $ = require('jquery');
const introJs = require('intro.js');
const L = require('leaflet');
require('leaflet.locatecontrol');

const Browser = require('../common/browser');

Browser.inDemo = true;		// used in content.js
var intro, steps;
var demoMap;
var showPressed, geoDone;

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
	demoMap = new L.map('demoMap')
		.addLayer(new L.TileLayer(
			Browser.gui.mapTiles().url,
			Browser.gui.mapTiles().info,
		))
		.on('click', function(e){
			intro.exit();
		})
		.setView([0,0], 2);

	// extend the Locate control and override the "start" method, so that it sets the marker to the user's location
	// see https://github.com/domoritz/leaflet-locatecontrol
	//
	var myLocate = L.Control.Locate.extend({
	   start: showCurrentPosition
	});
	new myLocate({
			icon: 'icon-trans ui-btn-icon-notext ui-icon-location',				// use jqm's icons to avoid loading
			iconLoading: 'icon-trans ui-btn-icon-notext ui-icon-location',		// font awesome
		})
	.addTo(demoMap);

	// set tooltip's max-width to the width of the page
	// this cannot be done with max-width: 100% cause introjs-tooltip's parent has width=0 !
	var w = $(window).width() - 40;
	$('head').append('<style> .introjs-tooltip { max-width: '+w+'px } </style>');

	$("#demo-link").on("click", function() {
		if(intro._currentStep == undefined)
			intro.start();

		$("#left-panel").panel("close");
	});

	// ready to go
	startDemo();
});

function showCurrentPosition() {
	navigator.geolocation.getCurrentPosition(
		drawPosition,
		function(err) {
			geoDone = true;
			alert("The following error occurred while retrieving your location:\n\n" + err.message);
		}
	);

	showPressed = true;
	if(intro._currentStep + 1 <= 2)
		intro.goToStep(3);
}

async function drawPosition(pos) {
	var latlng = [pos.coords.latitude, pos.coords.longitude];
	var acc = pos.coords.accuracy;

	if(!demoMap.marker) {
		demoMap.marker = new L.marker(latlng)
			.addTo(demoMap);

		demoMap.accuracy = new L.Circle(latlng, acc, {
				color: '#136AEC',
				fillColor: '#136AEC',
				fillOpacity: 0.15,
				weight: 2,
				opacity: 0.5,
			})
			.addTo(demoMap);
	}

	demoMap.marker.setLatLng(latlng);
	demoMap.accuracy.setLatLng(latlng);
	demoMap.accuracy.setRadius(acc);

	demoMap.fitBounds(demoMap.accuracy.getBounds());

	geoDone = true;
	if(intro._currentStep + 1 <= 3) {
		const st = await Browser.storage.get();
		var level = st.paused ? 'real' : (st.domainLevel['demo-page'] || st.defaultLevel);

		var s =
			level == 'fixed' ? 'Location Guard replaced it with your configured fixed location.' :
			level == 'real'  ? 'Location Guard did not modify it.' :
			'Location Guard added "noise" to it so that it\'s not very accurate.';

		// hacky way to modify the step's message
		intro._introItems[3].intro = steps[3].intro.replace("%s", s);

		intro.goToStep(4);
	}
}

function startDemo() {
	var iconClass = Browser.capabilities.permanentIcon() ? 'lg-icon-browseraction' : 'lg-icon-pageaction';
	steps = [ {
			element: ".placeholder-step1",
			intro: '<p>Location Guard was successfully installed.</p><p>This demo illustrates its use.</p>',
			position: "floating",
			tooltipClass: 'tooltip-step1',
		}, {
			element: ".leaflet-control-locate",
			intro:
				'<p>The demo asks the browser for your location when you press the ' +
				'<span class="popup-location-btn ui-btn ui-btn-inline ui-icon-location ui-btn-icon-notext"></span> ' +
				'button.</p><p>Press it!</p>',
			position: 'bottom',
			tooltipClass: 'tooltip-step2',
		}, {
			element: ".placeholder-step3",
			intro:
				'<p>The browser asks permission to disclose your location. At the same time, the <span class="' + iconClass + '"></span> icon ' +
				(Browser.capabilities.permanentIcon()
					? 'shows that a location request has been made.</p>'
					: 'appears, showing that Location Guard is active.</p>'
				) + '<p>To continue, allow access to your location.</p>',
			position: 'bottom-right-aligned',
			tooltipClass: 'tooltip-step3',
		}, {
			element: ".placeholder-step4",
			intro:
				'<p>This is the location disclosed by your browser. %s</p><p>Click on the <span class="' +
				iconClass + '"></span> icon to try more options.</p>',
			position: "bottom-middle-aligned",
			highlightClass: 'highlight-step4',
			tooltipClass: 'tooltip-step4',
	} ];

	intro = introJs();
	intro
	.setOptions({
		steps: steps,
		overlayOpacity: 0,
		showStepNumbers: false,
		skipLabel: "Close",
		doneLabel: "Close",
		keyboardNavigation: "keyboardNavigation",
	})
	.onafterchange(function() {
		var step = intro._currentStep + 1;

		// disable "Next" in steps 2/3 until the corresponding actions are performed
		$(".introjs-nextbutton").toggleClass(
			"introjs-disabled unclickable",
			(step == 2 && !showPressed) || (step == 3 && !geoDone) || step == 4
		);

		// remove dark overlay in steps 1, 4
		$(".introjs-overlay")[0].style.opacity = (step == 1 || step == 4 ? 0 : 0.5);
	})
	.start();
}
