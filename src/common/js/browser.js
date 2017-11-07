// Browser class for Google Chrome. For documentation of the various methods,
// see browser_base.js
//

Browser.init = function(script) {
	Browser._script = script;

	switch(script) {
		case 'main':
			this._main_script();
			break;

		case 'content':
			break;
	}
};

// all browser-specific code that runs in the main script goes here
//
Browser._main_script = function() {
	// fire browser.install/update events
	//
	chrome.runtime.onInstalled.addListener(function(details) {
		if(details.reason == "install")
			Util.events.fire('browser.install');

		else if(details.reason == "update")
			Util.events.fire('browser.update');
	});

	// some operations cannot be done by other scripts, so we set
	// handlers to do them in the main script
	//
	Browser.rpc.register('refreshIcon', function(tabId, callerTabId, replyHandler) {
		// 'self' tabId in the content script means refresh its own tab
		Browser.gui.refreshIcon(tabId == 'self' ?  callerTabId : tabId, replyHandler);
	});

	Browser.rpc.register('closeTab', function(tabId) {
		chrome.tabs.remove(tabId);
	});

	// Workaroud some Firefox page-action 'bugs' (different behaviour than chrome)
	// - the icon is _not_ hidden automatically on refresh
	// - [android-only] the icon is _not_ hidden when navigating away from a page
	// - the icon _is_ hidden on history.pushstate (eg on google maps when
	//   clicking on some label) although the same page remains loaded
	//
	if(!Browser.capabilities.usesBrowserAction()) {
		Browser.gui.iconShown = {};

		chrome.tabs.onUpdated.addListener(function(tabId, info) {
			// minimize overhead: only act if we have shown an icon in this tab before
			if(!Browser.gui.iconShown[tabId]) return;

			if(info.status == 'loading')
				// tab is loading, make sure the icon is hidden
				chrome.pageAction.hide(tabId);
			else if(info.status == 'complete')
				// this fires after history.pushState. Call refreshIcon to reset
				// the icon if it was incorrectly hidden
				Browser.gui.refreshIcon(tabId);
		});
	}

	// set default icon (for browser action)
	//
	Browser.gui.refreshAllIcons();

	// migrate from old Firefox extension
	//
	if(Browser.capabilities.isFirefox())
		browser.runtime.sendMessage("migrate").then(reply => {
			console.log("migrate: response from legacy addon: ", reply);

			if(reply && reply.storage)
				Browser.storage.migrate(reply.storage);

			if(reply && reply.install)
				Util.events.fire('browser.install');
		});
}


//////////////////// rpc ///////////////////////////
//
//
Browser.rpc.register = function(name, handler) {
	// set onMessage listener if called for first time
	if(!this._methods) {
		this._methods = {};
		chrome.runtime.onMessage.addListener(this._listener);
	}
	this._methods[name] = handler;
}

// onMessage listener. Received messages are of the form
// { method: ..., args: ... }
//
Browser.rpc._listener = function(message, sender, replyHandler) {
	blog("RPC: got message", [message, sender, replyHandler]);

	var handler = Browser.rpc._methods[message.method];
	if(!handler) return;

	// add tabId and replyHandler to the arguments
	var args = message.args || [];
	var tabId = sender.tab ? sender.tab.id : null;
	args.push(tabId, replyHandler);

	return handler.apply(null, args);
};

Browser.rpc.call = function(tabId, name, args, cb) {
	var message = { method: name, args: args };
	if(!cb) cb = function() {};							// we get error of not cb is passed

	if(tabId)
		chrome.tabs.sendMessage(tabId, message, cb);
	else
		chrome.runtime.sendMessage(null, message, cb);
}


//////////////////// storage ///////////////////////////
//
// implemented using chrome.storage.local
//
// Note: chrome.storage.local can be used from any script (main, content,
//       popup, ...) and it always accesses the same storage, so no rpc
//       is needed for storage!
//
Browser.storage._key = "global";	// store everything under this key

Browser.storage.get = function(cb) {
	chrome.storage.local.get(Browser.storage._key, function(items) {
		var st = items[Browser.storage._key];

		// default values
		if(!st) {
			st = Browser.storage._default;
			Browser.storage.set(st);
		}
		cb(st);
	});
};

Browser.storage.set = function(st, handler) {
	blog('saving st', st);
	var items = {};
	items[Browser.storage._key] = st;
	chrome.storage.local.set(items, handler);
};

Browser.storage.clear = function(handler) {
	chrome.storage.local.clear(handler);
};

Browser.storage.migrate = function(oldSt) {
	// first check whether we have a st object stored in the new addon
	chrome.storage.local.get(Browser.storage._key, function(items) {
		var st = items[Browser.storage._key];
		if(!st)
			Browser.storage.set(oldSt);
	});
}


//////////////////// gui ///////////////////////////
//
//
Browser.gui.refreshIcon = function(tabId, cb) {
	// delegate the call to the 'main' script if:
	// - we're in 'content': chrome.pageAction/browserAction is not available there
	// - we use a pageAction: we need to update Browser.gui.iconShown for the FF workaround
	//
	var ba = Browser.capabilities.usesBrowserAction();
	if(Browser._script == 'content' || (Browser._script != 'main' && !ba)) {
		Browser.rpc.call(null, 'refreshIcon', [tabId], cb);
		return;
	}

	Util.getIconInfo(tabId, function(info) {
		if(ba)
			Browser.gui._refreshBrowserAction(tabId, info, cb);
		else
			Browser.gui._refreshPageAction(tabId, info, cb);
	});
};

Browser.gui._refreshPageAction = function(tabId, info, cb) {
	if(info.hidden || info.apiCalls == 0)
		return chrome.pageAction.hide(tabId);

	Browser.gui.iconShown[tabId] = 1;

	chrome.pageAction.setPopup({
		tabId: tabId,
		popup: "popup.html?tabId=" + tabId		// pass tabId in the url
	});
	chrome.pageAction.show(tabId);

	// Firefox on Android (version 56) doesn't support pageAction.setIcon/setTitle so we try/catch
	try {
		chrome.pageAction.setTitle({
			tabId: tabId,
			title: info.title
		});
		chrome.pageAction.setIcon({
			tabId: tabId,
			path: {
				16: '/images/' + (info.private ? 'pin_16.png' : 'pin_disabled_16.png'),
				32: '/images/' + (info.private ? 'pin_32.png' : 'pin_disabled_32.png'),
				64: '/images/' + (info.private ? 'pin_64.png' : 'pin_disabled_64.png')
			}
		}, cb);		// setIcon is the only pageAction.set* method with a callback
	} catch(e) {
		if(cb) cb();
	}
}

Browser.gui._refreshBrowserAction = function(tabId, info, cb) {
	chrome.browserAction.setTitle({
		tabId: tabId,
		title: info.title
	});
	chrome.browserAction.setBadgeText({
		tabId: tabId,
		text: (info.apiCalls || "").toString()
	});
	chrome.browserAction.setBadgeBackgroundColor({
		tabId: tabId,
		color: "#b12222"
	});
	chrome.browserAction.setPopup({
		tabId: tabId,
		popup: "popup.html" + (tabId ? "?tabId="+tabId : "")	// pass tabId in the url
	});
	chrome.browserAction.setIcon({
		tabId: tabId,
		path: {
			// chrome used to have 19px icons, now it has 16px
			16: '/images/' + (info.private ? 'pin_16.png' : 'pin_disabled_16.png'),
			19: '/images/' + (info.private ? 'pin_19.png' : 'pin_disabled_19.png'),
			32: '/images/' + (info.private ? 'pin_32.png' : 'pin_disabled_32.png'),
			38: '/images/' + (info.private ? 'pin_38.png' : 'pin_disabled_38.png'),
			64: '/images/' + (info.private ? 'pin_64.png' : 'pin_disabled_64.png')
		}
	}, cb);		// setIcon is the only browserAction.set* method with a callback
}

Browser.gui.refreshAllIcons = function(cb) {
	chrome.tabs.query({}, function(tabs) {
		// for browser action, also refresh default state (null tabId)
		if(Browser.capabilities.usesBrowserAction())
			tabs.push({ id: null });

		var done = 0;
		for(var i = 0; i < tabs.length; i++)
			Browser.gui.refreshIcon(tabs[i].id, function() {
				if(++done == tabs.length && cb)
					cb();
			});
	});
};

Browser.gui.showPage = function(name) {
	chrome.tabs.create({ url: chrome.extension.getURL(name) });
};

Browser.gui.getCallUrl = function(tabId, handler) {
	function fetch(tabId) {
		// we call getState from the content script
		//
		Browser.rpc.call(tabId, 'getState', [], function(state) {
			handler(state && state.callUrl);		// state might be null if no content script runs in the tab
		});
	}

	if(tabId)
		fetch(tabId);
	else
		chrome.tabs.query({
			active: true,               // Select active tabs
			lastFocusedWindow: true     // In the current window
		}, function(tabs) {
			fetch(tabs[0].id)
		});
};

Browser.gui.closePopup = function() {
	if(Browser._script != 'popup') throw "only called from popup";

	if(Browser.capabilities.popupAsTab())
		// popup is shown as a normal tab so window.close() doesn't work. Call closeTab in the main script
		Browser.rpc.call(null, 'closeTab', []);
	else
		// normal popup closes with window.close()
		window.close();
}

Browser.log = function() {
	if(!Browser.capabilities.isDebugging()) return;

	console.log.apply(console, arguments);

	// in chrome, apart from the current console, we also log to the background page, if possible and loaded
	//
	if(!Browser.capabilities.isFirefox()) {
		var bp;
		if(chrome.extension && chrome.extension.getBackgroundPage)
			bp = chrome.extension.getBackgroundPage();

		if(bp && bp.console != console)		// avoid logging twice
			bp.console.log.apply(bp.console, arguments);
	}
}

