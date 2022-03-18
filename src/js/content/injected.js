// This will be injected to the page by content.js. Either inline, by copying the code of the injectedCode function
// in a <script>...</script>, or by inserting inject.js as an external script.
//
module.exports = function(PostRPC) {
	if(navigator.geolocation) {		// the geolocation API exists
		var prpc;
		function getPostRPC() {
			// create a PostRPC object only when getCurrentPosition is called. This
			// avoids having our own postMessage handler on every page
			if(!prpc)
				prpc = new PostRPC('page-content', window, window, window.origin);	// This PostRPC is created by the injected code!
			return prpc;
		}
		async function callCb(cb, pos, checkAllowed) {
			if(cb && (!checkAllowed || await getPostRPC().call('watchAllowed', [false])))
				cb(pos);
		}

		// We replace geolocation methods with our own.
		// getCurrentPosition will be called by the content script (not by the page)
		// so we dont need to keep it at all.

		navigator.geolocation.getCurrentPosition = async function(cb1, cb2, options) {
			// call getNoisyPosition on the content-script
			// call cb1 on success, cb2 on failure
			const res = await getPostRPC().call('getNoisyPosition', [options]);
			callCb(res.success ? cb1 : cb2, res.position, false);
		};

		const watchPosition = navigator.geolocation.watchPosition;
		const handlers = {};
		navigator.geolocation.watchPosition = function(cb1, cb2, options) {
			// We need to return a handler synchronously, but decide whether we'll use the real watchPosition or not
			// asynchronously. So we create our own handler, and we'll associate it with the real one later.
			const handler = Math.floor(Math.random()*10000);

			(async () => {
				if(await getPostRPC().call('watchAllowed', [true]))
					// We're allowed to call the real watchPosition (note: remember the handler)
					handlers[handler] = watchPosition.apply(navigator.geolocation, [
						position => callCb(cb1, position, true),	// ignore the call if privacy protection
						error    => callCb(cb2, error, true),		// becomes active later!
						options
					]);
				else
					// Not allowed, we don't install a real watch, just return the position once
					this.getCurrentPosition(cb1, cb2, options);
			})();
			return handler;
		};

		const clearWatch = navigator.geolocation.clearWatch;
		navigator.geolocation.clearWatch = function (handler) {
			if(handler in handlers) {
				clearWatch.apply(navigator.geolocation, [handlers[handler]]);
				delete handlers[handler];
			}
		};
	}

	// remove script
	var s = document.getElementById('__lg_script');
	if(s) s.remove();	// DEMO: in demo injectCode is run directly so there's no script
};
