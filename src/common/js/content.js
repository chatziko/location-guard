// Some code runs in the content script, and some is injected in the page.
// CPC simplifies the communication between the two.
// It uses document.defaultView.postMessage (this is the same as window.postMessage, but in Firefox
// document.defaultView should be used due to some compatibility issues)
// sending a message for each call and each reply
//
// NOTE: this communication is not secure and could be intercepted by the page.
//       so only a noisy location should be transmitted over CPC
//
function CPC() {
	this._calls = {};
	this._methods = {};

	this.register = function(name, fun) {
		this._methods[name] = fun;
	};
	this.call = function(method, args, handler) {
		var callId = Math.floor(Math.random()*1000000);
		this._calls[callId] = handler;

		if(!args) args = [];

		document.defaultView.postMessage({ method: method, args: args, callId: callId }, "*");
	};

	var cpc = this;
	window.addEventListener("message", function(event) {
		var data = event.data;
		if(!(event.source == window && data.callId)) return;		// we only care about messages from the same window, and having callId

		if(data.method) {
			/* message call */
			if(data.callId in cpc._calls) return;					// we made this call, the other side should reply
			data.args.push(function() {								// pass returnHandler, used to send back the result
				var args = Array.prototype.slice.call(arguments);	// arguments in real array
				document.defaultView.postMessage({ callId: data.callId, value: args }, "*");
			});
			cpc._methods[data.method].apply(null, data.args)

		} else {
			/* return value */
			var c = cpc._calls[data.callId];
			delete cpc._calls[data.callId];
			if(!c) return;											// return value for the other side, or no return handler
			c.apply(null, data.value);
		}
	}, false);
};


// this will be injected to the page
//
var pageCode = function() {
	if(!navigator.geolocation) return;		/* no geolocation API */

	var cpc = new CPC();

	// we replace geolocation methods with our own
	// the real methods will be called by the content script (not by the page)
	// so we dont need to keep them at all.

	navigator.geolocation.getCurrentPosition = function(cb1, cb2, options) {
		// call getNoisyPosition on the content-script
		cpc.call('getNoisyPosition', [options], function(success, res) {
			// call cb1 on success, cb2 on failure
			var f = success ? cb1 : cb2;
			if(f) f(res);
		});						
	};

	navigator.geolocation.watchPosition = function(cb1, cb2, options) {
		// we don't install a real watch, just return the position once
		// TODO: implement something closer to a watch
		this.getCurrentPosition(cb1, cb2, options);
		return Math.floor(Math.random()*10000);		// return random id, it's not really used
	};

	navigator.geolocation.clearWatch = function () {
		// nothing to do
	};
};

// the remaining runs in the content script
//
// inject the code in the page
//
if(document.documentElement.tagName.toLowerCase() == 'html') { // only for html
	// we inject the CPC class, followed by pageCode, all protected by anonymous functions
	var inject = "(function(){ "
		+ CPC +
		"(" + pageCode + ")();" +
	"})()";

	var script = document.createElement('script');
	script.appendChild(document.createTextNode(inject));

        // FF: there is another variables in the scope named parent, this causes a very hard to catch bug
	var parent_ = document.head || document.body || document.documentElement;
	var firstChild = (parent_.childNodes && (parent_.childNodes.length > 0)) ? parent_.childNodes[0] : null;
	if(firstChild)
		parent_.insertBefore(script, firstChild);
	else
		parent_.appendChild(script);
}

var apiCalled = false;		// true means that an API call has already happened, so we need to show the icon

// methods called by the page
//
var cpc = new CPC();
cpc.register('getNoisyPosition', function(options, replyHandler) {
	// refresh icon before fetching the location
	apiCalled = true;
	Browser.gui.refreshIcon();

	Browser.storage.get(function(st) {
		// if level == 'fixed' and fixedPosNoAPI == true, then we return the
		// fixed position without calling the geolocation API at all.
		//
		var domain = Util.extractDomain(window.location.href);
		var level = st.domainLevel[domain] || st.defaultLevel;

		if(level == 'fixed' && st.fixedPosNoAPI) {
			var noisy = { coords: st.fixedPos, timestamp: new Date().getTime() };
			replyHandler(true, noisy);
			blog(noisy);
			return;
		}

		// we call getCurrentPosition here in the content script, instead of
		// inside the page, because the content-script/page communication is not secure
		//
		navigator.geolocation.getCurrentPosition(
			function(position) {
			    // clone, modifying/sending the native object returns error
                            //FF: position is XRayWrapper and Util.clone fails
                            var clonedPosition = 
                                {'coords' : 
                                 {'latitude': position.coords.latitude, 
                                  'longitude': position.coords.longitude,
                                  'altitude' : position.coords.altitude,
                                  'accuracy' : position.coords.accuracy,
                                  'altitudeAccuracy' : position.coords.altitudeAccuracy,
                                  'heading' : position.coords.heading,
                                  'speed' : position.coords.speed,
                                 }};

			    addNoise(clonedPosition, function(noisy) {
					replyHandler(true, noisy);	
			    });
			},
			function(error) {
				replyHandler(false, Util.clone(error));		// clone, sending the native object returns error
			},
			options
		);
	});
});

// gets position, returs noisy version based on the options
//
function addNoise(position, handler) {
	Browser.storage.get(function(st) {
		var domain = Util.extractDomain(window.location.href);
		var level = st.domainLevel[domain] || st.defaultLevel;

		if(st.paused || level == 'real') {
			// do nothing, use real location

		} else if(level == 'fixed') {
			position.coords = st.fixedPos;

		} else if(st.cachedPos[level] && ((new Date).getTime() - st.cachedPos[level].epoch)/60000 < st.levels[level].cacheTime) {
			position = st.cachedPos[level].position;
			blog('using cached', position);
			
		} else {
			// add noise
			var epsilon = st.epsilon / st.levels[level].radius;

			var pl = new PlannarLaplace();
			var noisy = pl.addNoise(epsilon, position.coords);

			position.coords.latitude = noisy.latitude;
			position.coords.longitude = noisy.longitude;

			// update accuracy
			if(position.coords.accuracy && st.updateAccuracy)
				position.coords.accuracy += Math.round(pl.alphaDeltaAccuracy(epsilon, .9));

			// cache
			st.cachedPos[level] = { epoch: (new Date).getTime(), position: position };
			Browser.storage.set(st);

			blog('noisy coords', position.coords);
		}

		// return noisy position
		handler(position);
	});
}

Browser.init('content');

Browser.rpc.register('getIconInfo', function(tabId, replyHandler) {
	Browser.storage.get(function(st) {
		var domain = Util.extractDomain(window.location.href);
		var level = st.domainLevel[domain] || st.defaultLevel;

		var info = {
			hidden:  st.hideIcon || !apiCalled,
			private: !st.paused && level != 'real',
			title:
				st.paused		? "Location Guard is paused" :
				level == 'real'	? "Using your real location" :
				level == 'fixed'? "Using a fixed location" :
				"Privacy level: " + level
		};
		replyHandler(info);
	});
	return true;	// indicate that we plan to send a reply later
});

