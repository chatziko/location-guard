var levelMap, accCircle, protCircle, posMarker;
var fixedPosMap, fixedPosMarker;
var epsilon, disableSave;

var showAccCircle = true;
var samplePointsNo = 0;
var samplePoints = [];

var tabIndex = { general: 0, levels: 1, fixedPos: 2, faq: 3 };

// default pos
var currentPos = {
	latitude: 48.86014106672441,
	longitude: 2.3569107055664062
};

var Browser = require("browser").Browser;
Browser.init('options');
Browser.storage.get(function(st) {
	epsilon = st.epsilon;
});



// TODO: right now changes in textboxes are not saved when closing the popup, cause
//       javascript stops running right away and Browser.storage.add is not executed
//       we should avoid using textboxes anyway
//
function saveGeneral() {
	Browser.storage.get(function(st) {
		st.paused = $("#paused").prop('checked');
		st.hideIcon = $("#hideIcon").prop('checked');
		//st.epsilon = parseFloat($("#epsilon").val());
		st.updateAccuracy = $("#updateAccuracy").prop('checked');
		st.fixedPosNoAPI = $("#fixedPosNoAPI").prop('checked');
		st.defaultLevel = $('#defaultLevel').val();

		if(st.epsilon <= 0) {
			Browser.log('bad settings, ignoring', st);
			drawUI();
			return;
		}

		Browser.storage.set(st);

		Browser.gui.refreshAllIcons();
	});
}

function saveLevel() {
	if(disableSave) return;

	Browser.storage.get(function(st) {
		var active = $("#levelTabs").tabs("option", "active");
		var level = ['low', 'medium', 'high'][active];

		var radius = $("#setRadius").slider("option", "value");
		var ct = $("#setCacheTime").slider("option", "value");
		var cacheTime = ct <= 59 ? ct : 60 * (ct-59);

		st.levels[level] = {
			radius: radius,
			cacheTime: cacheTime
		};

		Browser.storage.set(st);
	});
}

function initializeLevelMap() {
	levelMap = L.map('levelMap');
	levelMap.addLayer(new L.TileLayer(
		'http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
		{ attribution: 'Map data © OpenStreetMap contributors' }
	));

	var latlng = [currentPos.latitude, currentPos.longitude];
	levelMap.setView(latlng, 13);

	posMarker = new L.marker(latlng)
		.addTo(levelMap)
		.bindPopup('Your current position');

	// build accuracy circle first to be on bottom
	if(showAccCircle)
		accCircle = new L.Circle(latlng, 1500, {
			color: null,
			fillColor: 'blue',
			fillOpacity: 0.4
		})	.addTo(levelMap)
			.bindPopup('Accuracy');

	protCircle = new L.Circle(latlng, 500, {
		color: null,
		fillColor: '#f03',
		fillOpacity: 0.4,
	})	.addTo(levelMap)
		.bindPopup('Protection area');
	
	/* CircleEditor
		.on("radiusdrag", function() { 
			Browser.log("a")
			var radius = Math.floor(this.getRadius());
			$("#setRadius").slider("option", "value", radius);
			updateRadiusText(radius);
		});
	*/
}

function showFixedPos() {
	// initialize the map, if not yet created. The map _needs_ to be created
	// when the panel is shown, otherwise its size will be wrong
	if(fixedPosMap) return;

	Browser.storage.get(function(st) {
		var latlng = [st.fixedPos.latitude, st.fixedPos.longitude];

		fixedPosMap = new L.map('fixedPosMap')
			.addLayer(new L.TileLayer(
				'http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
				{ attribution: 'Map data © OpenStreetMap contributors' }
			))
			.setView(latlng, 14)
			.on('click', saveFixedPos);

		fixedPosMarker = new L.marker(latlng)
			.addTo(fixedPosMap)
			.bindPopup('Your fixed position');
	});
}

function saveFixedPos(e) {
	Browser.storage.get(function(st) {
		st.fixedPos = { latitude: e.latlng.lat, longitude: e.latlng.lng };

		fixedPosMarker.setLatLng(e.latlng);

		Browser.log('saving st', st);
		Browser.storage.set(st);
	});
}

function showLevelInfo() {
	// initialize the map, if not yet created. The map _needs_ to be created
	// when the panel is shown, otherwise its size will be wrong
	if(!levelMap) initializeLevelMap();

	// set values
	var active = $("#levelTabs").tabs("option", "active");
	var level = ['low', 'medium', 'high'][active];

	Browser.storage.get(function(st) {
		// set sliders' value
		var radius = st.levels[level].radius;
		var cacheTime = st.levels[level].cacheTime;
		var ct = cacheTime <= 59				// 0-59 are mins, 60 and higher are hours
			? cacheTime
			: 59 + Math.floor(cacheTime/59);

		disableSave = true;						// save will be triggered by the change of value
		$("#setRadius").slider("option", "value", radius);
		$("#setCacheTime").slider("option", "value", ct);
		disableSave = false;

		updateRadiusText(radius);
		updateCacheText(ct);
	});
}

function updateRadiusText(radius) {
	// update radius text and map
	var acc = Math.round((new PlannarLaplace).alphaDeltaAccuracy(epsilon/radius, .95));

	var latlng = [currentPos.latitude, currentPos.longitude];
	posMarker.setLatLng(latlng);

	protCircle.setLatLng(latlng);
	protCircle.setRadius(radius);
	//protCircle.updateMarkers();	// for CircleEditor

	if(showAccCircle) {
		accCircle.setLatLng(latlng);
		accCircle.setRadius(acc);
	}

	levelMap.fitBounds((showAccCircle ? accCircle : protCircle).getBounds());

	// draw sample points
	var e = epsilon/radius;
	var pl = new PlannarLaplace;
	for(var i = 0; i < samplePointsNo; i++) {
		var noisy = pl.addNoise(e, currentPos);
		var latlng = [noisy.latitude, noisy.longitude];

		if(samplePoints[i])
			samplePoints[i].setLatLng(latlng);
		else
			samplePoints[i] = new L.Circle(latlng, 15, {
				color: null,
				fillColor: 'black',
				fillOpacity: 1,
			}).addTo(levelMap)
	}

	$("#radius").text(radius);
	$("#accuracy").text(acc);
}

function updateCacheText(ct) {
	// update cache time text
	var h = ct-59

	$("#cacheTime").text(
		ct == 0 ? "don't cache" :
		ct < 60 ? ct + " minute" + (ct > 1 ? "s" : "") :
		h + " hour" + (h > 1 ? "s" : "")
	);
}

function drawUI() {
	Browser.storage.get(function(st) {
		$('#faqlist').accordion({
			collapsible: true
		});

		// showLevelInfo needs to be called when the "level" pannel (the pannel
		// of the inner tab) is displayed.
		// Note that the 'activate' event is only called when the tab  _changes_.
		// not when it's first displayed. So we also use the activate event of the parent tab.
		//
		$("#tabs").tabs({
			active: tabIndex[require("util").Util.extractAnchor(window.location.href)],
			activate: function(event, ui) {
				var id = ui.newPanel.attr('id');
				window.location.hash = id;
				if(id == 'levels')
					showLevelInfo();
				else if(id == 'fixedPos')
					showFixedPos();
			}
		});
		$("#levelTabs").tabs({
			active: 1,
			activate: function(event, ui) {
				showLevelInfo();
			}
		});

		$("#setRadius").slider({
			animate: "fast",
			min: 40,
			max: 3000,
			step: 20,
			slide: function(event, ui) {
				updateRadiusText(ui.value);
			},
			change: saveLevel,
		});
		$("#setCacheTime").slider({
			animate: "fast",
			min: 0,
			max: 69,
			step: 1,
			slide: function(event, ui) {
				updateCacheText(ui.value);
			},
			change: saveLevel,
		});

		$('#paused').prop('checked', st.paused);
		$('#hideIcon').prop('checked', st.hideIcon);
		//$('#epsilon').val(st.epsilon);
		$('#updateAccuracy').prop('checked', st.updateAccuracy);
		$('#fixedPosNoAPI').prop('checked', st.fixedPosNoAPI);
		$('#defaultLevel').val(st.defaultLevel);
	});
}

function showCurrentPosition() {
	navigator.geolocation.getCurrentPosition(
		function (pos) {
			// store position and if map is loaded, call showLevelInfo to update it
			currentPos = pos.coords;
			if(levelMap)
				showLevelInfo();
		},
		function(err) {
			Browser.log("cannot get location", err);
		}
	);
}

function restoreDefaults() {
	if(window.confirm('Are you sure you want to restore the default options?')) {
		Browser.storage.clear();
		drawUI();
	}
}

function deleteCache() {
	Browser.storage.get(function(st) {
		st.cachedPos = {};
		Browser.storage.set(st);
		window.alert('Location cache was deleted');
	});
}

$(document).ready(function() {
	$("#general input").change(saveGeneral);
	$("#general select").change(saveGeneral);
	$("#fixedPos input").change(saveGeneral);

	$("#restoreDefaults").click(restoreDefaults);
	$("#deleteCache").click(deleteCache);

	$("#showCurrentPosition").click(showCurrentPosition);

	$(".showPrivacyFAQ").click(function() {
		$("#faqlist").accordion("option", "active", 1);
	});

	window.onhashchange = function() {
		$("#tabs").tabs("option", "active", tabIndex[require("util").Util.extractAnchor(window.location.href)]);
	};

	drawUI();

	// TODO remove
	//showLevelInfo();
});

