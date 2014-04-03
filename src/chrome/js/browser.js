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
	Browser.rpc.register('refreshIcon', function(tabId) {
		Browser.gui.refreshIcon(tabId);
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
	Browser.log("RPC: got message", [message, sender, replyHandler]);

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

Browser.storage.set = function(st) {
	Browser.log('saving st', st);
	var items = {};
	items[Browser.storage._key] = st;
	chrome.storage.local.set(items);
};

Browser.storage.clear = function() {
	chrome.storage.local.clear();
};


//////////////////// gui ///////////////////////////
//
//
Browser.gui.refreshIcon = function(tabId) {
	if(Browser._script == 'content') {
		// cannot do it in the content script, delegate to the main
		// in this case tabId can be null, the main script will get the tabId
		// from the rpc call

		Browser.rpc.call(null, 'refreshIcon');
		return;
	}

	Util.getIconInfo(tabId, function(info) {
		if(!info || info.hidden) {
			chrome.pageAction.hide(tabId);

		} else {
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

Browser.gui.showOptions = function(anchor) {
	var baseUrl = chrome.extension.getURL('options.html');
	var fullUrl = baseUrl + (anchor || '');

	chrome.tabs.query({ url: baseUrl }, function(tabs) {
		Browser.log("tabs",tabs);
		if (tabs.length)
			chrome.tabs.update(tabs[0].id, { active: true, url: fullUrl });
		else
			chrome.tabs.create({ url: fullUrl });
	});
};

Browser.gui.getActiveTabUrl = function(handler) {
	chrome.tabs.query(
		{ active: true,               // Select active tabs
		  lastFocusedWindow: true     // In the current window
		}, function(tabs) {
			// there can be only one;
			// we call getUrl from the content script (avoid asking for 'tabs' permisison)
			//
			Browser.rpc.call(tabs[0].id, 'getState', [], function(state) {
				handler(state.url);
			});
		}
	);
};


// in chrome, apart from the current console, we also log to the background page, if possible and loaded
//
Browser.log = function(a, b) {
	if(!Browser.debugging) return;

	console.log(a, b);

	var bp;
	if(chrome.extension && chrome.extension.getBackgroundPage)
		bp = chrome.extension.getBackgroundPage();

	if(bp && bp.console != console)		// avoid logging twice
		bp.console.log(a, b);
}

