// implements browser_base.js

Browser.init = function (script) {
	Browser._script = script;
	Browser.log('initializing', script);

	Browser.storage._init();

	if(script == 'main') {
		Browser._main_script();
		Browser.gui._init();
		Browser._install_update();
	} else {
		// setup the internal RPC with the main script, on which the higher-level Browser.rpc is based
		// If we run in a content script we use self.port
		// If we run in a normal page we use window (messageProxy.js will then forward the messages)
		//
		var sendObj = self.port || window;
		Browser._internal_rpc = new PostRPC('internal', sendObj, sendObj);
		Browser._internal_rpc.register('internalCall', Browser.rpc._listener);
	}
};

// handle installation and upgrade
Browser._install_update = function(){

	var self = require("sdk/self");

	if(self.loadReason == "install") {
		Util.events.fire('browser.install');
	}
	else if(self.loadReason == "upgrade"){
		Util.events.fire('browser.update');
	}
}

Browser._main_script = function() {
	var data = require("sdk/self").data;

	// refresh icon when a tab is activated
	//
	require('sdk/tabs').on('activate', function (tab) {
		Browser.gui.refreshIcon(tab.id);
		Browser.gui._hidePopup();			// firefox hides panel automatically on mouse click, but not on Ctrl-T tab change
	});

	Browser.workers = [];

	// content script insertion
	// all http[s] pages: insert content.js
	//
	require("sdk/page-mod").PageMod({
		include: ['*'],
		attachTo: ["top", "frame"],
		contentScriptWhen: 'start', // TODO THIS IS TRICKY
		contentScriptFile: [data.url("js/util.js"),
							data.url("js/browser_base.js"),
							data.url("js/browser.js"),
							data.url("js/laplace.js"),
							data.url("js/content.js")],
		onAttach: Browser._onWorkerAttach,
	});

	// our internal pages (options, demo, popup): insert only messageProxy for communication
	//
	require("sdk/page-mod").PageMod({
		include: [data.url("*")],
		contentScriptWhen: 'start', // sets up comm. before running the page scripts
		contentScriptFile: [data.url("js/messageProxy.js")],
		onAttach: Browser._onWorkerAttach,
	});
}

// executed when a worker is created, each worker corresponds to a page
// we need to setup internal RPC, and to keep track of workers in Browser.workers to
// allow for main -> page communication
//
Browser._onWorkerAttach = function(worker) {
	var array = require('sdk/util/array');

	worker._internal_rpc = new PostRPC('internal', worker.port, worker.port);
	worker._internal_rpc.register('internalCall', function(call, replyHandler) {
		// add tabId and pass to Browser.rpc
		call.tabId = worker.tab.id;
		return Browser.rpc._listener(call, replyHandler);
	});

	array.add(Browser.workers, worker);

	if(!worker.on) return;		// dummy 'popup' worker, has no events

	// pagehide: called when user moves away from the page (closes tab or moves back/forward).
	// the worker is not valid anymore so we need to remove it.
	// in case of back/forward, the tab is still active and the icon needs to be removed, so we call refreshIcon.
	// in case of tab close, the "activate" even of the new tab will be called anyway, so the icon will be refreshed there.
	//
	worker.on('pagehide', function() {
		array.remove(Browser.workers, this);

		if(this.tab)								// moving back/forward, the tab is still active so the icon must be refreshed
			Browser.gui.refreshIcon(this.tab.id);

		Browser.gui._hidePopup();					// firefox hides panel automatically on mouse click, but not on Ctrl-W tab close
	});

	// pageshow: called when page is shown, either the first time, or when navigating history (back/forward button)
	// When havigating history, an old (hidden) worker is reused instead of creating a new one. So we need to put it
	// back to Browser.workers
	//
	worker.on('pageshow', function() {
		array.add(Browser.workers, this);
	});
}

Browser._find_worker = function(tabId) {
	for (var i = 0; i < Browser.workers.length; i++)
		if (Browser.workers[i].tab && Browser.workers[i].tab.id == tabId)
			return Browser.workers[i];
	return null;
}



//////////////////// rpc ///////////////////////////
//
Browser.rpc._methods = {};

// handler is a   function(...args..., tabId, replyHandler)
Browser.rpc.register = function(name, handler) {
	this._methods[name] = handler;
}

// internal RPC listener. 'call' is of the form
// { method: ..., args: ..., tabId: ... }
//
Browser.rpc._listener = function(call, replyHandler) {
	var handler = Browser.rpc._methods[call.method];
	if(!handler) {
		replyHandler();		// if the call cannot be made, call handler with no arguments
		return;
	}

	// add tabId and replyHandler to the arguments
	var args = call.args || [];
	args.push(call.tabId, replyHandler);

	return handler.apply(null, args);
};

Browser.rpc.call = function(tabId, name, args, cb) {
	var call = { method: name, args: args };

	if (Browser._script == 'main') {
		var worker = Browser._find_worker(tabId);
		if(worker) {
			worker._internal_rpc.call('internalCall', [call], cb);
		} else {
			if(cb) cb();				// cannot connect, call cb with no arguments
		}

	} else {
		// content or popup
		Browser._internal_rpc.call('internalCall', [call], cb);
	}
}


//////////////////// storage ///////////////////////////

Browser.storage._key = "global";		// store everything under this key
Browser.storage._init = function(){
	if (Browser._script == 'main') {

		var ss = require("sdk/simple-storage").storage;

		Browser.storage.get = function(cb) {
			var st = ss[Browser.storage._key];

			// default values
			if(!st) {
				// Browser.log('initializing settings');
				st = Browser.storage._default;
				Browser.storage.set(st);
			}
			// Browser.log('returning st');
			cb(st);
		};

		Browser.storage.set = function(st) {
			// Browser.log('setting st');
			ss[Browser.storage._key] = st;
		};

		Browser.storage.clear = function() {
			// Browser.log('clearing st');
			delete ss[Browser.storage._key];
		};

		Browser.rpc.register('storage.get',function(tabId,replyHandler){
			Browser.storage.get(replyHandler);
		});

		Browser.rpc.register('storage.set',function(st,tabId,replyHandler){
			Browser.storage.set(st);
			replyHandler();
		});
		Browser.rpc.register('storage.clear',function(){
			Browser.storage.clear();
		});

	}
	// content and popup
	else{

		Browser.storage.get = function(cb) {
			// Browser.log('getting state');
			Browser.rpc.call(null,'storage.get',null,cb);
		}

		Browser.storage.set = function(st) {
			// Browser.log('setting state');
			Browser.rpc.call(null,'storage.set',[st]);
		}

		Browser.storage.clear = function() {
			// Browser.log('clearing state');
			Browser.rpc.call(null,'storage.clear');
		}

	}
}


//////////////////// gui ///////////////////////////

// only called by main
Browser.gui._init = function(){

	var Cu = require("chrome").Cu;
	Cu.import("resource://gre/modules/Services.jsm");

	Browser.gui._fennec = Services.wm.getMostRecentWindow("navigator:browser").NativeWindow != undefined;

	if(Browser.gui._fennec) {
		Cu.import("resource://gre/modules/PageActions.jsm");
		Cu.import("resource://gre/modules/NetUtil.jsm");
		Cu.import("resource://gre/modules/Prompt.jsm");

	} else {
		// The fact that we create/destroy the button multiple times doesn't play well with Firefox about:customizing page.
		// For instance if the user presses "remove from toolbar" and we keep creating/destroying, we'll get errors:
		//    https://bugzilla.mozilla.org/show_bug.cgi?id=1150907
		// Sometimes (hard to reproduce) the customizing page will even get in a "stuck" state.
		//
		// To avoid these issues, and since our button emulated a "pageaction" button anyway, we don't allow customization. More precisely:
		//  - "move to menu" is disabled, if pressed the button immediately returns in the toolbar
		//  - "remove from toolbar" is caught, and sets the "hide icon" option. The user needs to re-enable it in the options page
		//  - the button does not appear in about:customizing
		//
		Cu.import("resource:///modules/CustomizableUI.jsm");

		this._widgetId =															// widget id used internally by CustomizableUI, see https://github.com/mozilla/addon-sdk/blob/master/lib/sdk/ui/button/toggle.js
			('toggle-button--' + require("sdk/self").id.toLowerCase()+ '-' + "location_guard").
			replace(/[^a-z0-9_-]/g, '');

		CustomizableUI.addListener({
			onWidgetRemoved: function(widgetId) {
				if(widgetId != Browser.gui._widgetId) return;

				// button removed from toolbar. if "move to menu" was pressed it will be added to the menu immediately (but it's not there yet).
				// if "remove from toolbar" was pressed it will remained "unused". so we wait 10msecs and see what happened.
				//
				require("sdk/timers").setTimeout(function() {
					if(CustomizableUI.getPlacementOfWidget(widgetId)) {
						// button was moved to Menu, notify user that this is not supported
						require("sdk/notifications").notify({
							text: "This icon cannot be moved to Menu.",
							iconURL: require("sdk/self").data.url('images/pin_38.png')
						});

					} else {
						// button is "unused", remove and update settings
						Browser.gui._refreshButton(null);

						Browser.storage.get(function(st) {
							st.hideIcon = true;
							Browser.storage.set(st);
						});
					}

					// in both cases we put the button back in the toolbar
					CustomizableUI.addWidgetToArea(Browser.gui._widgetId, CustomizableUI.AREA_NAVBAR);
				}, 10);
			}
		});
	}

	// register rpc methods
	//
	Browser.rpc.register('getActiveCallUrl', function(tabId, replyHandler) {
		Browser.gui.getActiveCallUrl(replyHandler);
		return true;	// replyHandler will be used later
	});

	Browser.rpc.register('refreshIcon', function(tabId, callerTabId) {
		Browser.gui.refreshIcon(tabId || callerTabId);		// null tabId in the content script means refresh its own tab
	});

	Browser.rpc.register('refreshAllIcons', Util.delegate(Browser.gui, 'refreshAllIcons'));
	Browser.rpc.register('showPage',        Util.delegate(Browser.gui, 'showPage'));
	Browser.rpc.register('resizePopup',     Util.delegate(Browser.gui, 'resizePopup'));

	// register options button
	//
	var prefsModule = require("sdk/simple-prefs");
	prefsModule.on("optionButton", function() {
		Browser.log("options was clicked");
		Browser.gui.showPage("options.html");
	})
}

Browser.gui._getActiveTab = function(){
	var tabs = require("sdk/tabs");
	return tabs.activeTab;
}

Browser.gui._refreshButton = function(info) {
	var { ToggleButton } = require('sdk/ui/button/toggle');
	var { data } = require("sdk/self");

	if(!info || info.hidden) {
		if(this._button) {
			this._button.destroy();
			this._button = null;
		}

	} else {
		var icon = {
			19: data.url('images/' + (info.private ? 'pin_19.png' : 'pin_disabled_19.png')),
			38: data.url('images/' + (info.private ? 'pin_38.png' : 'pin_disabled_38.png')),
			50: data.url('images/' + (info.private ? 'pin_50.png' : 'pin_disabled_50.png')),
		};

		if(!this._button) {
			this._button = ToggleButton({
				id: "location_guard",
				label: "Location Guard",
				icon: icon,
				onChange: function(state) {
					if(state.checked)
						Browser.gui._showPopup();
				},
			});

			// make sure it's in the main toolbar
			CustomizableUI.addWidgetToArea(Browser.gui._widgetId, CustomizableUI.AREA_NAVBAR);

		} else {
			this._button.icon = icon;
			this._button.label = info.title;
		}
	}
}

Browser.gui._hidePopup = function() {
	if(Browser.gui._panel)
		Browser.gui._panel.hide();
}

Browser.gui._showPopup = function() {
	var { data } = require("sdk/self");

	// we create a dummy worker with tabId = "popup" and add it in Brower.workers, so that
	// communication with the popup happens in the same way as with all tabs
	//
	var worker = {
		tab: { id: "popup", url: "popup" }
	};

	// hide previous panel, if any
	this._hidePopup();

	// we create a new panel each time, and destroy it when it's hidden (simulate chrome's bejaviour)
	// the panel starts hidden, it will be shown by Browser.gui.resizePopup
	//
	var panel = require("sdk/panel").Panel({
		contentURL: data.url("popup.html"),

		contentScriptWhen: 'start',								// sets up comm. before running the page scripts
		contentScriptFile: [data.url("js/messageProxy.js")],	// needed for communication

		onHide: function() {
			if(Browser.gui._button)
				Browser.gui._button.state("window", { checked: false });

			if(Browser.gui._panel == panel)
				Browser.gui._panel = null;
			panel.destroy();

			require('sdk/util/array').remove(Browser.workers, worker);
		},
	});
	Browser.gui._panel = panel;

	// prepare RPC, add to workers array
	worker.port = panel.port;
	Browser._onWorkerAttach(worker);
}

Browser.gui._refreshPageAction = function(info) {
	 var nw = Services.wm.getMostRecentWindow("navigator:browser").NativeWindow;

	if(this._pageaction)
		PageActions.remove(this._pageaction);
	if(this._menu)
		 nw.menu.remove(this._menu);

	if(!info.apiCalled) {
		// no API call, show nothing
		return;

	} else if(info.hidden) {
		// if the API is called by the icon is hidden, add menu
		//
		this._menu = nw.menu.add({
			name: "Location Guard",
			callback: PopupFennec.show
		});

	} else {
		// load and cache icon in base64
		var icon = 'images/' + (info.private ? "pin_50.png" : "pin_disabled_50.png");
		if(!this._base64_cache)
			this._base64_cache = {};
		if(!this._base64_cache[icon])
			this._base64_cache[icon] = require('sdk/base64').encode( load_binary(icon) );

		this._pageaction = PageActions.add({
			icon: "data:image/png;base64," + this._base64_cache[icon],
			title: "Location Guard",
			clickCallback: PopupFennec.show
		});
	}

	/*
	nw.toast.show("Location Guard is enabled", "long", {
		button: {
			label: "SHOW",
			callback: PopupFennec.show
		}
	});
	*/
}

// the following 5 are the public methods of Browser.gui
//
Browser.gui.refreshIcon = function(tabId) {
	Browser.log('refreshing icon', tabId);

	if(Browser._script == 'main') {
		// refreshIcon is supposed to change the icon of a specific tab (or the active tab if tabId = null). In firefox
		// the icon is actually _global_, we update it on every tab change. So refreshIcon only needs to refresh the _active_
		// tab's icon (i.e. when tabId == null or tabId == activeTab.id).
		//
		if(tabId == undefined)
			throw "tabId not set";
		if(tabId != Browser.gui._getActiveTab().id)
			return;		// asked to refresh a non-active tab, nothing to do

		Util.getIconInfo(tabId, function(info) {
			Browser.log('got info for refreshIcon', info);

			if(Browser.gui._fennec)
				Browser.gui._refreshPageAction(info);
			else
				Browser.gui._refreshButton(info);
		});

	} else {
		// content popup
		// cannot do it in the content script, delegate to the main
		Browser.rpc.call(null, 'refreshIcon', [tabId]);
	}
};

Browser.gui.refreshAllIcons = function() {
	if(Browser._script == 'main')
		// in firefox the icon is global, we only need to refresh the active tab
		Browser.gui.refreshIcon(Browser.gui._getActiveTab().id);
	else
		Browser.rpc.call(null, 'refreshAllIcons');
};

Browser.gui.showPage = function(name) {
	Browser.log('showPage', name);

	if(Browser._script == 'main') {
		// if there is any tab showing an internal page, activate and update it, otherwise open new
		//
		var data = require("sdk/self").data;
		var baseUrl = data.url("");
		var fullUrl = baseUrl + name;

		if(this._fennec) {
			// sdk/tabs doesn't enumerate tabs correctly in fennec
			// maybe bug: https://bugzilla.mozilla.org/show_bug.cgi?id=844859
			// So we use BrowserApp instead
			//
			var ba = Services.wm.getMostRecentWindow("navigator:browser").BrowserApp;
			var tabs = ba.tabs;

			for(var i = 0; i < tabs.length; i++) {
				var url = tabs[i].window.location.href;
				if(url.search(baseUrl) != -1) {
					ba.selectTab(tabs[i]);
					if(url != fullUrl)		// if identical avoid reload
						tabs[i].browser.loadURI(fullUrl);
					return;
				}
			}

			ba.addTab(fullUrl);

		} else {
			var tabs = require("sdk/tabs");

			for(var i = 0; i < tabs.length; i++) {
				if(tabs[i].url.search(baseUrl) != -1) {
					tabs[i].url = fullUrl;
					tabs[i].activate();
					return;
				}
			}
			tabs.open(fullUrl);
		}

	} else {
		Browser.rpc.call(null, 'showPage', [name], null);
	}
};

Browser.gui.getActiveCallUrl = function(handler) {
	if(Browser._script == 'main') {
		// Note: the callUrl might come from a frame inside the page, from a different url than tab.url
		// We need to get it from the content script using the getState rpc call
		//
		var tab = Browser.gui._getActiveTab();
		Browser.rpc.call(tab.id, 'getState', [], function(state) {
			handler(state.callUrl);
		});
	} else {
		// cannot do it in the content script, delegate to the main
		Browser.rpc.call(null, 'getActiveCallUrl', [], handler)
	}
}

Browser.gui.resizePopup = function(width, height) {
	if(Browser._script == 'main') {
		if(!Browser.gui._panel) return;

		if(width && height) {
			Browser.gui._panel.resize(width, height);
			Browser.gui._panel.show({ position: Browser.gui._button });
		} else {
			// close
			Browser.gui._panel.hide();
		}

	} else {
		Browser.rpc.call(null, 'resizePopup', [width, height]);
	}
};


Browser.log = function() {
	if(!Browser.debugging) return;

    var args = Array.prototype.slice.call(arguments);	// convert to real array
	args.unshift(Browser._script + ":");

	console.log.apply(console, args);
}


// loads a binary file from the data directory
// same as data.load, but data.load does string conversion, and fails for binary
// files. It's a slight modification of readURISync (which is used by data.load)
// https://github.com/mozilla/addon-sdk/blob/master/lib/sdk/net/url.js
//
function load_binary(uri) {
	var data = require("sdk/self").data;
	var channel = NetUtil.newChannel(data.url(uri), null);
	var stream = channel.open();
	var count = stream.available();
	var data = NetUtil.readInputStreamToString(stream, count);
	stream.close();
	return data;
}

