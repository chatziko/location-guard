// main script
// Here we only handle the install/update events
// Browser-specific functionality for the main script, if needed, is added by browser/*.js
//

const Browser = require('./common/browser');
const Util = require('./common/util');

Browser.log('starting');

Util.events.addListener('browser.install', function() {
	// show demo on first install
	Browser.gui.showPage('demo.html');
});

Browser.init('main');

// this is used from the content-script of an iframe, to communicate with the content-script
// of the top-window. We just echo the call back to the tab.
//
Browser.rpc.register('apiCalledInFrame', function(url, tabId, replyHandler) {
	Browser.rpc.call(tabId, 'apiCalledInFrame', [url], function(res) {
		replyHandler(res);
	});
	return true; // reply later
});

if(Browser.testing) {
	// test for nested calls, and for correct passing of tabId
	//
	Browser.rpc.register('nestedTestMain', function(tabId, replyHandler) {
		Browser.log("in nestedTestMain, call from ", tabId, "calling back nestedTestTab");

		Browser.rpc.call(tabId, 'nestedTestTab', [], function(res) {
			Browser.log("got from nestedTestTab", res, "adding '_foo' and sending back");
			replyHandler(res + '_foo');
		});

		// we MUST return true to signal that replyHandler will be used at a later
		// time (when we get the reply of nestedTestTab). Returning false will
		// fail in FF and some versions of Chrome. We mention this in the
		// specification of Browser.rpc.register
		return true;
	});
}
