
const $ = require('jquery');
require('sglide');		// extends jquery

// Requiring the plugins extends Leaflet automatically
const L = require('leaflet');
require('pelias-leaflet-plugin');
require('leaflet.locatecontrol');

const Browser = require('./browser');
const PlannarLaplace = require('./laplace');

const geocoderKey = '5b3ce3597851110001cf6248c6adb7e28d3b47f5b3d4ab3e43e1f87f';
const geocoderUrl = 'https://api.openrouteservice.org/geocode';

var levelMap, fixedPosMap;
var epsilon;
var activeLevel = "medium";
var inited = {};
var sliderRadius, sliderCacheTime;

// default pos
var currentPos = {
	latitude: 48.86014106672441,
	longitude: 2.3569107055664062
};

Browser.init('options');
Browser.storage.get(function(st) {
	epsilon = st.epsilon;
});
// getState should fail (call replyHandler with no args) on the options page. On
// Chrome it fails (cause no handler is set?) but on Edge we never get a reply.
// So we explicitly register a handler and send an empty reply.
Browser.rpc.register('getState', function(tabId, replyHandler) {
	replyHandler();
});


// slider wrapper class, cause sGlide interface sucks
function Slider(opt) {
	this.opt = opt;
	this.value = opt.min;

	var obj = this;
	$("#"+opt.id).sGlide({
		totalRange: [opt.min, opt.max],
		drag: function(e) {
			var value = Math.round(e.custom);
			value -= value % opt.step;
			opt.slide(value);
		},
		drop: function(e) {
			obj.value = Math.round(e.custom);
			obj.value -= obj.value % opt.step;
			opt.change(obj.value);
		}
	});

	this.set = function(value) {
		this.value = value;
		var pct = 100 * (value - opt.min) / (opt.max - opt.min);
		$("#"+opt.id).sGlide("startAt", pct);
	}
}

function saveOptions() {
	Browser.storage.get(function(st) {
		st.defaultLevel = $('#defaultLevel').val();
		st.paused = $("#paused").prop('checked');
		st.hideIcon = $("#hideIcon").prop('checked');

		var updateAccuracy = $("#updateAccuracy").prop('checked');
		if(st.updateAccuracy != updateAccuracy) {
			// update accuracy of cached positions to reflect the change
			for(var level in st.cachedPos) {
				var epsilon = st.epsilon / st.levels[level].radius;
				var pl = new PlannarLaplace();

				st.cachedPos[level].position.coords.accuracy +=									// add/remove the .9 accuracy
					(updateAccuracy ? 1 : -1) * Math.round(pl.alphaDeltaAccuracy(epsilon, .9));
			}

			st.updateAccuracy = updateAccuracy;
		}

		Browser.storage.set(st, function() {
			Browser.gui.refreshAllIcons();
		});
	});
}

function saveFixedPosNoAPI() {
	Browser.storage.get(function(st) {
		st.fixedPosNoAPI = $("#fixedPosNoAPI").prop('checked');

		Browser.storage.set(st);
	});
}

function saveLevel() {
	Browser.storage.get(function(st) {
		var radius = sliderRadius.value;
		var ct = sliderCacheTime.value;
		var cacheTime = ct <= 59 ? ct : 60 * (ct-59);

		updateRadius(radius, true);

		// delete cache for that level if radius changes
		if(st.levels[activeLevel].radius != radius)
			delete st.cachedPos[activeLevel];

		st.levels[activeLevel] = {
			radius: radius,
			cacheTime: cacheTime
		};

		Browser.storage.set(st);
	});
}

function initLevelMap() {
	var latlng = [currentPos.latitude, currentPos.longitude];

	// map
	levelMap = L.map('levelMap')
		.addLayer(new L.TileLayer(
			'http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
			{ attribution: 'Map data © OpenStreetMap contributors' }
		))
		.setView(latlng, 13)
		.on('dragstart', function() {
			levelMap.closePopup();
		})
		.on('click', function(e){
			if(levelMap.popup._isOpen) {	// if popup is open, close it
				levelMap.closePopup();
				return;
			}
			handleChangePosEvent(e);
		});

	// marker
	levelMap.marker = new L.marker(latlng, { draggable: true })
		.addTo(levelMap)
		.on('click', function() {
			showPopup(levelMap);
		})
		.on('drag', handleChangePosEvent);

	// popup
	var popupHtml =
		'<div class="map-popup">' +
			'<p><b>Protection area (red)</b> and <b>accuracy (blue)</b> around some (hypothetical) location.</p>' +
			'<p>Click on the map or drag the marker to change the location. Click on' +
			'<a href="#" id="levelMapCurrentPos" class="popup-location-btn ui-btn ui-btn-inline ui-icon-location ui-btn-icon-notext"></a>' +
			'to show your current location.</p>' +
		'</div>';

	levelMap.popup = L.popup({
			autoPan: false,
			closeOnClick: false,		// we'll close it ourselves
			maxWidth: Math.min($("#levelMap").width() - 50, 300),
		})
		.setContent(popupHtml);

	// circles (accuracy circle first to be on bottom)
	levelMap.accuracy = new L.Circle(latlng, 1500, {
			color: null,
			fillColor: 'blue',
			fillOpacity: 0.4,
			clickable: false,
		})
		.addTo(levelMap);

	levelMap.protection = new L.Circle(latlng, 500, {
			color: null,
			fillColor: '#f03',
			fillOpacity: 0.4,
			clickable: false,
		})
		.addTo(levelMap);

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
	.addTo(levelMap);

	// geocoder control
	if(!Browser.capabilities.isAndroid()) // not enough space on smartphones, better have a cleaner interface
		L.control.geocoder(geocoderKey, {
        	url: geocoderUrl,
			markers: false,
			autocomplete: false
		}).on('highlight', handleChangePosEvent)
		  .on('select',    handleChangePosEvent)
		  .addTo(levelMap);
}

function initFixedPosMap() {
	Browser.storage.get(function(st) {
		var latlng = [st.fixedPos.latitude, st.fixedPos.longitude];

		fixedPosMap = new L.map('fixedPosMap')
			.addLayer(new L.TileLayer(
				'http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
				{ attribution: 'Map data © OpenStreetMap contributors' }
			))
			.setView(latlng, 14)
			.on('dragstart', function() {
				fixedPosMap.closePopup();
			})
			.on('click', function(e) {
				if(fixedPosMap.popup._isOpen) {	// if popup is open, close it
					fixedPosMap.closePopup();
					return;
				}
				saveFixedPos(e.latlng);
			});

		// marker
		fixedPosMap.marker = new L.marker(latlng, { draggable: true })
			.addTo(fixedPosMap)
			.on('click', function() {
				showPopup(fixedPosMap);
			})
			.on('dragend', function(e) {
				saveFixedPos(e.target._latlng);
			});

		// popup
		var popupHtml =
			'<div class="map-popup">' +
				'<p>This is the location reported when the privacy level is set to <b>"Use fixed location"</b>.</p>' +
				'<p>Click on the map or drag the marker to set a new fixed location.</p>' +
			'</div>';

		fixedPosMap.popup = L.popup({
				autoPan: false,
				closeOnClick: false,		// we'll close it ourselves
				maxWidth: Math.min($("#fixedPosMap").width() - 50, 300),
			})
			.setContent(popupHtml);

		showPopup(fixedPosMap);

		// locate control
		L.control.locate({
			drawCircle: false,
			follow: false,
			icon: 'icon-trans ui-btn-icon-notext ui-icon-location',				// use jqm's icons to avoid loading
			iconLoading: 'icon-trans ui-btn-icon-notext ui-icon-location',		// font awesome
		}).addTo(fixedPosMap);

		// geocoder control
		if(!Browser.capabilities.isAndroid()) // not enough space on smartphones, better have a cleaner interface
			L.control.geocoder(geocoderKey, {
				url: geocoderUrl,
				markers: false,
				autocomplete: false
			}).on('results', function(e) {
				// directly set position if the text is a latlon
				var res = e.params.text.match(/^([-+]?[0-9]+\.[0-9]+)\s*,?\s*([-+]?[0-9]+\.[0-9]+)$/);
				if(!res) return;

				var latlng = L.latLng(parseFloat(res[1]), parseFloat(res[2]));
				saveFixedPos(latlng);
				fixedPosMap.setView(latlng, 14)
				this.collapse();		// close the geocoder search

			}).addTo(fixedPosMap);
	});
}

function saveFixedPos(latlng) {
	Browser.storage.get(function(st) {
		var wrapped = latlng.wrap();			// force within normal range
		st.fixedPos = { latitude: wrapped.lat, longitude: wrapped.lng };

		fixedPosMap.marker.setLatLng(latlng);

		Browser.log('saving st', st);
		Browser.storage.set(st);
	});
}

function showLevelInfo() {
	Browser.storage.get(function(st) {
		// set sliders' value
		var radius = st.levels[activeLevel].radius;
		var cacheTime = st.levels[activeLevel].cacheTime;
		var ct = cacheTime <= 59				// 0-59 are mins, 60 and higher are hours
			? cacheTime
			: 59 + Math.floor(cacheTime/59);

		sliderRadius.set(radius);
		sliderCacheTime.set(ct);

		updateRadius(radius, true);
		updateCache(ct);
	});
}

// change current pos as a reaction to a Leaflet event
function handleChangePosEvent(e) {
	currentPos = { latitude: e.latlng.lat, longitude: e.latlng.lng };
	moveCircles();
}

function moveCircles() {
	var latlng = [currentPos.latitude, currentPos.longitude];

	levelMap.marker.setLatLng(latlng);
	levelMap.protection.setLatLng(latlng);
	levelMap.accuracy.setLatLng(latlng);
}

function showPopup(map) {
	var smallSize = $(map._container).width() < 500 || $(map._container).height() < 450;

	// on small screens we center the popup at the bottom of the map
	// on large screens we open at the marker
	//
	var latlng;
	if(smallSize) {
		var bounds = map.getBounds();
		latlng = bounds.getCenter();
		latlng.lat = bounds.getSouth();
	} else {
		// get pos 30 pixes above the marker
		var pos = map.latLngToLayerPoint(map.marker._latlng);
		pos.y -= 30;
		latlng = map.layerPointToLatLng(pos);
	}

	map.popup
		.setLatLng(latlng)
		.openOn(map);

	// hide popup "arrow" on small screens
	$(".leaflet-popup-tip-container").css({ visibility: (smallSize ? "hidden" : "visible") });
}

function updateRadius(radius, fit) {
	// update radius text and map
	var acc = Math.round((new PlannarLaplace).alphaDeltaAccuracy(epsilon/radius, .95));

	moveCircles();

	levelMap.protection.setRadius(radius);
	levelMap.accuracy.setRadius(acc);

	var first_view = !inited.radius;
	inited.radius = true;

	if(fit)
		levelMap.fitBounds(levelMap.accuracy.getBounds(), { animate: !first_view });

	if(first_view)
		showPopup(levelMap);

	$("#radius").text(radius);
	$("#accuracy").text(acc);
}

function updateCache(ct) {
	// update cache time text
	var h = ct-59

	$("#cacheTime").text(
		ct == 0 ? "don't cache" :
		ct < 60 ? ct + " minute" + (ct > 1 ? "s" : "") :
		h + " hour" + (h > 1 ? "s" : "")
	);
}

function initPages() {
	$.mobile.ajaxEnabled = false;
	//$.mobile.hideUrlBar = false;
	//$.mobile.defaultPageTransition = "none";

	$(document).ready(function() {
		$('#hideIcon').parent().toggle(!Browser.capabilities.permanentIcon());	// hiding the icon only works with page action (not browser action)
	});

	$(document).on("pagecontainershow", function(e, ui) {
		var page = ui.toPage[0].id;

		if(inited[page]) {
			// page already inited. only call invalidateSize on maps
			if(page == "levels")   levelMap.invalidateSize();
			if(page == "fixedPos") fixedPosMap.invalidateSize();
			return;
		}
		inited[page] = true;

		// page initialization
		//
		if(page == "options") {
			Browser.storage.get(function(st) {
				$('#defaultLevel').val(st.defaultLevel).selectmenu("refresh");
				$('#paused').prop('checked', st.paused).checkboxradio("refresh");
				$('#hideIcon').prop('checked', st.hideIcon).checkboxradio("refresh");
				$('#updateAccuracy').prop('checked', st.updateAccuracy).checkboxradio("refresh");
			});

		} else if (page == "levels") {
			sliderRadius = new Slider({
				id: "setRadius",
				min: 40,
				max: 3000,
				step: 20,
				slide: function(value) {
					levelMap.closePopup();
					updateRadius(value, false);
				},
				change: saveLevel,
			});
			sliderCacheTime = new Slider({
				id: "setCacheTime",
				min: 0,
				max: 69,
				step: 1,
				slide: updateCache,
				change: saveLevel,
			});

			initLevelMap();
			showLevelInfo();

		} else if (page == "fixedPos") {
			Browser.storage.get(function(st) {
				$('#fixedPosNoAPI').prop('checked', st.fixedPosNoAPI).checkboxradio("refresh");

				initFixedPosMap();
			});
		}
	});
}

function showCurrentPosition() {
	navigator.geolocation.getCurrentPosition(
		function (pos) {
			levelMap.closePopup();
			currentPos = pos.coords;
			showLevelInfo();		// moves circles and also centers map
		},
		function(err) {
			Browser.log("cannot get location", err);
		}
	);
}

function restoreDefaults() {
	if(window.confirm('Are you sure you want to restore the default options?')) {
		Browser.storage.clear(function() {
			Browser.gui.refreshAllIcons(function() {
				location.reload();
			});
		});
	}
}

function deleteCache() {
	Browser.storage.get(function(st) {
		st.cachedPos = {};
		Browser.storage.set(st, function() {
			window.alert('Location cache was deleted');
		});
	});
}

// set page events before "ready"
//
initPages();

$(document).ready(function() {
	$("#left-panel").panel().enhanceWithin();			// initialize panel

	// open panel on swipe
	$(document).on("swiperight", function(e) {
		if($("#left-panel").css("visibility") !== "visible" )		// check if already open (manually or due to large screen)
			$("#left-panel").panel("open");
	});

	$("#options input, #options select, #fixedPos input").change(saveOptions);
	$("#fixedPosNoAPI").change(saveFixedPosNoAPI);

	$("#restoreDefaults").click(restoreDefaults);
	$("#deleteCache").click(deleteCache);

	$("#activeLevel a").click(function(e) {
		levelMap.closePopup();

		activeLevel = $(e.target).attr("level");
		showLevelInfo();
	});

	$(".showFAQ").click(function(e) {
		location.href = "faq.html#" + $(e.target).attr("faq");
	});

	$(document).on("click", "#levelMapCurrentPos", showCurrentPosition);	// this doesn't exist yet (it's inside the popup), so we set in document
});


if(Browser.testing) {
	// test for nested calls, and for correct passing of tabId
	//
	Browser.rpc.register('nestedTestTab', function(tabId, replyHandler) {
		Browser.log("in nestedTestTab, returning 'options'");
		replyHandler("options");
	});

	Browser.log("calling nestedTestMain");
	Browser.rpc.call(null, 'nestedTestMain', [], function(res) {
		Browser.log('got from nestedTestMain', res);
	});
}
