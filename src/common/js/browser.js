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
	Browser.rpc.register('refreshIcon', function(tabId, callerTabId) {
		Browser.gui.refreshIcon(tabId || callerTabId);		// null tabId in the content script means refresh its own tab
	});

	Browser.rpc.register('closeTab', function(tabId) {
		chrome.tabs.remove(tabId);
	});

	// migrate from old Firefox extension
	//
	if(Browser.version.isFirefox())
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
Browser.gui.refreshIcon = function(tabId) {
	if(Browser._script == 'content') {
		// cannot do it in the content script, delegate to the main
		Browser.rpc.call(null, 'refreshIcon', [tabId]);
		return;
	}

	if(tabId == undefined)
		throw "tabId not set";

	Util.getIconInfo(tabId, function(info) {
		if(!info || info.hidden) {
			chrome.pageAction.hide(tabId);

		} else {
			// Firefox on Android (version 56) doesn't support pageAction.setIcon/setTitle so we try/catch
			try {
				chrome.pageAction.setIcon({
					tabId: tabId,
					path: {
						19: '/images/' + (info.private ? 'pin_19.png' : 'pin_disabled_19.png'),
						38: '/images/' + (info.private ? 'pin_38.png' : 'pin_disabled_38.png')
					}
				});
				chrome.pageAction.setTitle({
					tabId: tabId,
					title: info.title
				});
			} catch(e) {
			}

			chrome.pageAction.setPopup({
				tabId: tabId,
				popup: "popup.html?tabId=" + tabId		// pass tabId in the url
			});
			chrome.pageAction.show(tabId);
		}
	});
};

Browser.gui.refreshAllIcons = function() {
	chrome.tabs.query({}, function(tabs) {
		for(var i = 0; i < tabs.length; i++)
			Browser.gui.refreshIcon(tabs[i].id);
	});
};

Browser.gui.showPage = function(name) {
	chrome.tabs.create({ url: chrome.extension.getURL(name) });
};

Browser.gui.getCallUrl = function(tabId, handler) {
	// we call getState from the content script
	//
	Browser.rpc.call(tabId, 'getState', [], function(state) {
		handler(state.callUrl);
	});
};

Browser.gui.closePopup = function() {
	if(Browser._script != 'popup') throw "only called from popup";

	if(Browser.version.isFirefox() && Browser.version.isAndroid())
		// Firefox@Android shows popup as normal tab, and window.close() doesn't
		// work. Call closeTab in the main script
		Browser.rpc.call(null, 'closeTab', []);
	else
		// normal popup closes with window.close()
		window.close();
}

Browser.log = function() {
	if(!Browser.debugging) return;

	console.log.apply(console, arguments);

	// in chrome, apart from the current console, we also log to the background page, if possible and loaded
	//
	if(!Browser.version.isFirefox()) {
		var bp;
		if(chrome.extension && chrome.extension.getBackgroundPage)
			bp = chrome.extension.getBackgroundPage();

		if(bp && bp.console != console)		// avoid logging twice
			bp.console.log.apply(bp.console, arguments);
	}
}

