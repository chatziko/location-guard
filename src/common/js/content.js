//
// content.js
//
// This script runs as a _content script_ (in a separate js environment) on all pages.
//
// HOWEVER:
// Chrome does not allow content scripts in internal pages, so in the _demo page_ we just
// include content.js as a normal <script>. This mostly works (we don't need the
// separate js environment anyway), apart from a few things marked as DEMO below.
//
//
// PostRPC is being used it in 2 ways:
//
// 1. For communication between the content script and the code injected in the
//    page (they both share the same window object).
//    NOTE: this communication is not secure and could be intercepted by the page.
//          so only a noisy location should be transmitted over PostRPC
//
// 2. For communication between the content script of an iframe and the content
//    script of the top-most frame (through window.top)
//
// FF compatibility:
// In Firefox < 31 window.postMessage does not work _from_ the content script
// _to_ the page (although it works from the page to the content script), hence
// we use document.defaultView.postMessage which is equivalent and always works.
//
// Thankfully, window.top.postMessage (used for iframe -> top frame communication)
// works in all FF versions.


// this will be injected to the page
//
function injectedCode() {
	if(!navigator.geolocation) return;		/* no geolocation API */

	var prpc;

	// we replace geolocation methods with our own
	// the real methods will be called by the content script (not by the page)
	// so we dont need to keep them at all.

	navigator.geolocation.getCurrentPosition = function(cb1, cb2, options) {
		// create a PostRPC object only when getCurrentPosition is called. This
		// avoids having our own postMessage handler on every page
		if(!prpc)
			prpc = new PostRPC('page-content', document.defaultView, window);

		// call getNoisyPosition on the content-script
		prpc.call('getNoisyPosition', [options], function(success, res) {
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

	// remove script
	var s = document.getElementById('__lg_script');
	if(s) s.remove();	// DEMO: in demo injectCode is run directly so there's no script
}

// the remaining runs in the content script
//
// DEMO: save the getCurrentPosition function, cause in the demo page it gets replaced (no separate js environment)
var getCurrentPosition = navigator.geolocation.getCurrentPosition;

var inDemo;				// DEMO: this is set in demo.js
if(inDemo) {
	// DEMO: we are inside the page, just run injectedCode()
	injectedCode();

} else if(document.documentElement.tagName.toLowerCase() == 'html') { // only for html
	// we inject PostRPC/injectedCode, and call injectedCode, all protected by an anonymous function
	//
	var inject = "(function(){"
		+ _PostRPC + injectedCode +
		"_PostRPC(); injectedCode();" +
	"})()";

	// Note: the code _must_ be inserted _inline_, i.e. <script>...code...</script>
	// instead of <script src="...">, otherwise it might not run immediately
	//
	var script = document.createElement('script');
	script.setAttribute('id', '__lg_script');
	script.appendChild(document.createTextNode(inject));

	// FF: there is another variables in the scope named parent, this causes a very hard to catch bug
	var _parent = document.head || document.body || document.documentElement;
	var firstChild = (_parent.childNodes && (_parent.childNodes.length > 0)) ? _parent.childNodes[0] : null;
	if(firstChild)
		_parent.insertBefore(script, firstChild);
	else
		_parent.appendChild(script);
}

var inFrame = (window != window.top);	// are we in a frame?
var apiCalled = false;					// true means that an API call has already happened (here or in a nested frame), so we need to show the icon
var myUrl = inDemo ? 'http://demo-page/' : window.location.href;	// DEMO: user-friendly url
var callUrl = myUrl;					// the url from which the last call was made, it could be us or a nested frame

// methods called by the page
//
var rpc = new PostRPC('page-content', document.defaultView, window);			// window.postMessage does not work in FF < 31, use document.defaultView.postMessage
rpc.register('getNoisyPosition', function(options, replyHandler) {
	if(inFrame) {
		// we're in a frame, we just notify the top window
		new PostRPC('frames', window.top).call('apiCalledInFrame', [myUrl]);	// window.top.postMessage always works!
	} else {
		// refresh icon before fetching the location
		apiCalled = true;
		callUrl = myUrl;
		Browser.gui.refreshIcon();
	}

	Browser.storage.get(function(st) {
		// if level == 'fixed' and fixedPosNoAPI == true, then we return the
		// fixed position without calling the geolocation API at all.
		//
		var domain = Util.extractDomain(myUrl);
		var level = st.domainLevel[domain] || st.defaultLevel;

		// we save the configuration before the Geolocation API popup, to check if the user is changing the level before accepting
		var configBefore = {
			level: level,
			defaultLevel: st.defaultLevel,
			radius: null,
			cacheTime: null
		};
		// only for high,medium,low these two values are non-null
		if (level != 'fixed' && level != 'real') {
			configBefore.radius = st.levels[level].radius;
			configBefore.cacheTime = st.levels[level].cachedTime;
		}

		if(level == 'fixed' && st.fixedPosNoAPI) {
			var noisy = {
				coords: {
					latitude: st.fixedPos.latitude,
					longitude: st.fixedPos.longitude,
					accuracy: 10,
					altitude: null,
					altitudeAccuracy: null,
					heading: null,
					speed: null
				},
				timestamp: Date.now()
			};
			// log fixed
			if (st.logs.enabled){
				while (st.logs.data.length >= Browser.storage.logSize) {
					st.logs.data.pop();
				}
				st.logs.data.push({
					real: null,
					sanitized: noisy,
					domain: domain,
					timestamp: noisy.timestamp,
					levelConfig: {before: null, after: configBefore},
					error: null,
					cached: false
				});
				Browser.storage.set(st);
				blog("logs",st.logs.data);
			}

			blog("returning fixed", noisy);
			replyHandler(true, noisy);
			return;
		}

		// we call getCurrentPosition here in the content script, instead of
		// inside the page, because the content-script/page communication is not secure
		//
		// there are three outcomes: success, failure and no-reply.
		// For the latter we set a timeout and consider it as a failure

		var handleError = function(error) {
			// log failed API call
			if (st.logs.enabled){
				while (st.logs.data.length >= Browser.storage.logSize) {
					st.logs.data.pop();
				}

				var level = st.domainLevel[domain] || st.defaultLevel;
				var configAfter = {
					level: level,
					defaultLevel: st.defaultLevel,
					radius : st.levels[level].radius,
					cacheTime : st.levels[level].cachedTime,
				};
				if (configBefore === configAfter) {
					configBefore = null;
				} else {blog("configs", [configBefore,configAfter])}
				
				st.logs.data.push({
					real: null,
					sanitized: null,
					domain: domain,
					timestamp: Date.now(),
					levelConfig: {before : configBefore, after : configAfter},
					error : error,
					cached: false
				});
				Browser.storage.set(st);
				blog("logs",st.logs.data);
			}

			blog("failed API call", error);
			replyHandler(false, Util.clone(error));		// clone, sending the native object returns error
			return;
		};

		timeoutID = window.setTimeout(function(){handleError({code: 3, message: "Location Guard: timeout"})}, 5000);
		
		getCurrentPosition.apply(navigator.geolocation, [
			function(position) {
				window.clearTimeout(timeoutID);
				// clone, modifying/sending the native object returns error
				addNoise(Util.clone(position), configBefore, function(noisy) {
					replyHandler(true, noisy);
				});
			},
			function(error) {
				window.clearTimeout(timeoutID);
				return handleError(error);
			},
			options
		]);
	});
});

// gets position, returs noisy version based on the options
//
function addNoise(position, configBefore, handler) {
	Browser.storage.get(function(st) {
		var cached = false;
		var domain = Util.extractDomain(myUrl);
		var level = st.domainLevel[domain] || st.defaultLevel;
		var now = Date.now();
		var sanitized = {
			coords: {
				latitude: null,
				longitude: null,
				accuracy: null,
				// don't know how to add noise to those, so we set to null (they're most likely null anyway)
				altitude: null,
				altitudeAccuracy: null,
				heading: null,
				speed: null
			},
			timestamp: null};

		if(st.paused || level == 'real') {
			// copy real location
			sanitized.coords.latitude = position.coords.latitude;
			sanitized.coords.longitude = position.coords.longitude;
			sanitized.coords.accuracy = position.coords.accuracy;
			sanitized.timestamp = position.timestamp;
		} else if(level == 'fixed') { // in case the user sees the popup and changes the level to fixed
			sanitized.coords.latitude = st.fixedPos.latitude;
			sanitized.coords.longitude = st.fixedPos.longitude;
			sanitized.coords.accuracy = 10;
			sanitized.timestamp = now;
		} else if(st.cachedPos[level] && ((new Date).getTime() - st.cachedPos[level].epoch)/60000 < st.levels[level].cacheTime) {
			var pos = st.cachedPos[level].position;
			sanitized.coords.latitude = pos.coords.latitude;
			sanitized.coords.longitude = pos.coords.longitude;
			sanitized.coords.accuracy = pos.coords.accuracy;
			sanitized.timestamp = pos.timestamp;
			cached = true;
			blog('using cached');
		} else {
			// add noise
			var epsilon = st.epsilon / st.levels[level].radius;
			var pl = new PlannarLaplace();
			var noisy = pl.addNoise(epsilon, position.coords);

			var accuracy = 0; // in case real accuracy is not defined
			if(position.coords.accuracy) {
				accuracy = position.coords.accuracy;
			}
			if(st.updateAccuracy) {
				accuracy = Math.round(pl.alphaDeltaAccuracy(epsilon, .9)) + position.coords.accuracy;
			}

			sanitized.coords.latitude = noisy.latitude;
			sanitized.coords.longitude = noisy.longitude;
			sanitized.coords.accuracy = accuracy;
			sanitized.timestamp = now;

			// update cache
			st.cachedPos[level] = { epoch: position.timestamp, position: sanitized }; //redundant
			blog('noisy coords', sanitized.coords);
		}

		// log
		if (st.logs.enabled){
			while (st.logs.data.length >= Browser.storage.logSize) {
				st.logs.data.pop();
			}
			var level = st.domainLevel[domain] || st.defaultLevel;
			var configAfter = {
				level: level,
				defaultLevel: st.defaultLevel,
				radius : st.levels[level].radius,
				cacheTime : st.levels[level].cachedTime
			};
			if (configBefore === configAfter) {
				configBefore = null;
			} else {blog("configs", [configBefore,configAfter])}

			st.logs.data.push({
				real: position,
				sanitized: sanitized,
				domain: domain,
				timestamp: now,
				levelConfig: {before: configBefore, after: configAfter},
				error : null,
				cached : cached
			});
			Browser.storage.set(st);
			blog("logs",st.logs.data);
		}
		// return noisy position
		handler(sanitized);
	});
}

Browser.init('content');

// only the top frame handles getState and apiCalledInFrame requests
var frames_rpc;
if(!inFrame) {
	Browser.rpc.register('getState', function(tabId, replyHandler) {
		replyHandler({
			callUrl: callUrl,
			apiCalled: apiCalled
		});
	});

	frames_rpc = new PostRPC("frames", window, window);
	frames_rpc.register('apiCalledInFrame', function(url) {
		apiCalled = true;
		callUrl = url;
		Browser.gui.refreshIcon();
	});
}

if(Browser.testing) {
	// test for nested calls, and for correct passing of tabId
	//
	Browser.rpc.register('nestedTestTab', function(tabId, replyHandler) {
		blog("in nestedTestTab, returning 'content'");
		replyHandler("content");
	});

	blog("calling nestedTestMain");
	Browser.rpc.call(null, 'nestedTestMain', [], function(res) {
		blog('got from nestedTestMain', res);
	});
}
