// Base class for browser-specific functionality
// Subclasses should implement the API defined here
//
if(typeof(browser) === 'undefined')
	window.browser = chrome;

var Browser = {
	debugging: null,				// null: auto set to true if running locally
	testing: false,					// set to true to run tests on load

	// Browser.init(script)
	//
	// Initializes the Browser library. 'script' is the type of scrpit loading the
	// library, it can be one of:
	//   main
	//   content
	//   popup
	//   options
	//
	init: function(script) {},

	// Browser.rpc
	//
	// Class implementing rpc calls between the main script and content script
	// running in tabs. It is used both internally in the Browser library
	// and externally in the extension's scripts.
	//
	rpc: {
		// Browser.rpc.register(name, handler)
		//
		// Registers a method to be callable from other scripts.
		// handler should be a function
		//    function(...args..., tabId, replyHandler)
		//
		// The function receives any arguments passed during the call (see Browser.rpc.call)
		// Moreover, two extra arguments are automatically added:
		//   tabId:         the tabId of the caller, or null if the call is made from the main script
		//   replyHandler:  function for asynchronously returning a result by calling replyHandler(result)
		//
		// IMPORTANT: If handler does not immediately return a result but stores replyHandler to do it asynchronously later,
		// it should return a true value to keep replyHandler open.
		//
		register: function(name, handler) {},

		// Browser.rpc.call(tabId, name, args, handler)
		//
		// Calls a remote method.
		//   tabId:    tab id of the script to call, or null to call the main script
		//   name:     method name
		//   args:     array of arguments to pass
		//   handler:  function(res), will be called when the result is received
		//
		// If the call cannot be made to the specific tabId, handler will be called with no arguments.
		//
		call: function(tabId, name, args, handler) {}
	},

	// Browser.storage
	//
	// Class implementing the extensions persistent storage.
	// The storage is a single object containing options, cache and everything
	// else that needs to be stored. It is fetched and stored as a whole.
	//
	storage: {
		// browser.storage.get(handler)
		//
		// fetches the storage object and passes it to the handler.
		// The default object is returned if the storage is empty.
		//
		get: function(handler) {},

		// browser.storage.set(st, handler)
		//
		// Stores the give storage object. Calls the handler when finished.
		//
		set: function(st, handler) {},

		// browser.storage.clear(handler)
		//
		// Clears the storage. Calls the handler when finished.
		//
		clear: function(handler) {},

		// default storage object
		//
		_default: {
			paused: false,
			hideIcon: false,
			cachedPos: {},
			fixedPos: {
				latitude: -4.448784,
				longitude: -171.24832
			},
			fixedPosNoAPI: true,
			updateAccuracy: true,
			epsilon: 2,
			levels: {
				low: {
					radius: 200,
					cacheTime: 10,
				},
				medium: {
					radius: 500,
					cacheTime: 30,
				},
				high: {
					radius: 2000,
					cacheTime: 60,
				}
			},
			defaultLevel: "medium",
			domainLevel: {}
		}
	},

	// Browser.gui
	//
	// Class controlling the browser's GUI. The main GUI element is the extension's icon. Each tab has
	// a possibly different icon, whose information can be obtained by calling the rpc method 'getIconInfo'
	// of the content script. The method should return an object:
	//   { hidden:          true if the icon should be hidden,
	//     private:         true if the current tab is in a private mode,
	//     defaultPrivate:  true if the default settings are in a private mode,
	//     apiCalls:        no of times the API has been called in the current tab
	//     title:           icon's title }
	//
	// The GUI is free to render the icon in any way based on the above info. It can also render it
	// at any moment, by calling getIconInfo to get the info object.
	// When refreshIcon or refreshAllIcons are called the icons should be refreshed.
	//
	gui: {
		// Browser.gui.refreshIcon(tabId)
		//
		// Refreshes the icon of the tab with the given 'tabId'.
		// If called from a content script and tabId = 'self' it refreshes the icon of the content script's tab.
		// getIconInfo should be called to get the icon's info
		//
		refreshIcon: function(tabId) {},

		// Browser.gui.refreshAllIcons()
		//
		// Refreshes the icons of all tabs.
		// getIconInfo should be called to get the icon's info
		//
		refreshAllIcons: function() {},

		// Browser.gui.showPage(name)
		//
		// Shows an internal html page by opening a new tab, or focusing an old tab if it's already open
		// (at most one internal page should be open)
		//
		showPage: function(name) {},

		// Browser.gui.getCallUrl(tabId, handler)
		//
		// Gets the callUrl of given tab and passes it to 'handler'
		//
		getActiveCallUrl: function(tabId, handler) {},

		// Browser.gui.closePopup()
		//
		// Closes the popup.
		//
		closePopup: function() {},
	},

	// Browser.capabilities
	//
	// Class for browser detection
	//
	capabilities: {
		isFirefox: function() {
			return navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
		},
		isAndroid: function() {
			return navigator.userAgent.toLowerCase().indexOf('android') > -1;
		},
		isOpera: function() {
			return !!navigator.userAgent.match(/Opera|OPR\//);
		},
		isDebugging: function() {
			// update_url is only present if the extensioned is installed via the web store
			if(Browser.debugging == null)
				Browser.debugging = !('update_url' in browser.runtime.getManifest());
			return Browser.debugging;
		},
		popupAsTab: function() {
			// Firefox@Android shows popup as normal tab
			return Browser.capabilities.isFirefox() && Browser.capabilities.isAndroid();
		},
		needsPAManualHide: function() {
			// Workaroud some Firefox page-action 'bugs'
			return Browser.capabilities.isFirefox();
		},
		usesBrowserAction: function() {
			// use pageAction for Firefox/Opera, browserAction for Chrome
			return !Browser.capabilities.isFirefox() && !Browser.capabilities.isOpera();
		}
	},

	// Browser.log(text, value)
	//
	// Logs the given text/value pair
	//
	log: function(text, value) {
		if(!Browser.capabilities.isDebugging()) return;

		console.log(text, value);
	}
};

// for quick logging
function blog() {
	Browser.log.apply(Browser, arguments);
}

