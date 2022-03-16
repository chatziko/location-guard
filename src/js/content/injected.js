// This will be injected to the page by content.js. Either inline, by copying the code of the injectedCode function
// in a <script>...</script>, or by inserting inject.js as an external script.
//
module.exports = function(PostRPC) {
	if(navigator.geolocation) {		// the geolocation API exists
		var prpc;

		// we replace geolocation methods with our own
		// the real methods will be called by the content script (not by the page)
		// so we dont need to keep them at all.

		navigator.geolocation.getCurrentPosition = async function(cb1, cb2, options) {
			// create a PostRPC object only when getCurrentPosition is called. This
			// avoids having our own postMessage handler on every page
			if(!prpc)
				prpc = new PostRPC('page-content', window, window, window.origin);	// This PostRPC is created by the injected code!

			// call getNoisyPosition on the content-script
			// call cb1 on success, cb2 on failure
			const res = await prpc.call('getNoisyPosition', [options]);
			var f = res.success ? cb1 : cb2;
			if(f)
				f(res.position);
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
	}

	// remove script
	var s = document.getElementById('__lg_script');
	if(s) s.remove();	// DEMO: in demo injectCode is run directly so there's no script
};
