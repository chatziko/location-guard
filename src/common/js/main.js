// main script
// Here we only handle the install/update events
// Browser-specific functionality for the main script, if needed, is added by browser/*.js
//

Browser.log('starting');

Util.events.addListener('browser.install', function() {
	// show FAQ on first install
	Browser.gui.showPage('faq.html');
});

Util.events.addListener('browser.update', function() {
	// upgrade options from previous versions
	Browser.storage.get(function(st) {
		if(st.fixedPosNoAPI == null)
			st.fixedPosNoAPI = true;

		Browser.storage.set(st);
	});
});

Browser.init('main');

if(Browser.testing) {
	// test for nested calls, and for correct passing of tabId
	//
	Browser.rpc.register('nestedTestMain', function(tabId, replyHandler) {
		blog("in nestedTestMain, call from ", tabId, "calling back nestedTestTab");

		Browser.rpc.call(tabId, 'nestedTestTab', [], function(res) {
			blog("got from nestedTestTab", res, "adding '_foo' and sending back");
			replyHandler(res + '_foo');
		});

		// we MUST return true to signal that replyHandler will be used at a later
		// time (when we get the reply of nestedTestTab). Returning false will
		// fail in FF and some versions of Chrome. We mention this in the
		// specification of Browser.rpc.register
		return true;
	});
}
