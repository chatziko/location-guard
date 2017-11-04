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

		if(!st.paused && level == 'fixed' && st.fixedPosNoAPI) {
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
				timestamp: new Date().getTime()
			};
			replyHandler(true, noisy);
			blog("returning fixed", noisy);
			return;
		}

		// we call getCurrentPosition here in the content script, instead of
		// inside the page, because the content-script/page communication is not secure
		//
		getCurrentPosition.apply(navigator.geolocation, [
			function(position) {
				// clone, modifying/sending the native object returns error
				addNoise(Util.clone(position), function(noisy) {
					replyHandler(true, noisy);
				});
			},
			function(error) {
				replyHandler(false, Util.clone(error));		// clone, sending the native object returns error
			},
			options
		]);
	});
});

// gets position, returs noisy version based on the options
//
function addNoise(position, handler) {
	Browser.storage.get(function(st) {
		var domain = Util.extractDomain(myUrl);
		var level = st.domainLevel[domain] || st.defaultLevel;

		if(st.paused || level == 'real') {
			// do nothing, use real location

		} else if(level == 'fixed') {
			position.coords = {
				latitude: st.fixedPos.latitude,
				longitude: st.fixedPos.longitude,
				accuracy: 10,
				altitude: null,
				altitudeAccuracy: null,
				heading: null,
				speed: null
			};

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

			// don't know how to add noise to those, so we set to null (they're most likely null anyway)
			position.altitude = null;
			position.altitudeAccuracy = null;
			position.heading = null;
			position.speed = null;

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
