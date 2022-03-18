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
Browser.rpc.register('apiCalledInFrame', async function(url, tabId) {
	return await Browser.rpc.call(tabId, 'apiCalledInFrame', [url]);
});

if(Browser.testing) {
	// test for nested calls, and for correct passing of tabId
	//
	Browser.rpc.register('nestedTestMain', async function(tabId) {
		Browser.log("in nestedTestMain, call from ", tabId, "calling back nestedTestTab");

		const res = Browser.rpc.call(tabId, 'nestedTestTab', []);
		Browser.log("got from nestedTestTab", res, "adding '_foo' and sending back");
		return res + '_foo';
	});
}
