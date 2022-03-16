// Base class for browser-specific functionality
// Subclasses should implement the API defined here
//
if(typeof(browser) === 'undefined')
	window.browser = chrome;

const Browser = {
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
		//    async function(...args..., tabId)
		//
		// The function receives any arguments passed during the call (see Browser.rpc.call)
		// Moreover, one extra arguments are automatically added:
		//   tabId:         the tabId of the caller, or null if the call is made from the main script
		//
		register: function(name, handler) {},

		// Browser.rpc.call(tabId, name, args)
		//
		// Calls a remote method.
		//   tabId:    tab id of the script to call, or null to call the main script
		//   name:     method name
		//   args:     array of arguments to pass
		//
		// If the call cannot be made to the specific tabId, null is returned.
		//
		call: async function(tabId, name, args) {}
	},

	// Browser.storage
	//
	// Class implementing the extensions persistent storage.
	// The storage is a single object containing options, cache and everything
	// else that needs to be stored. It is fetched and stored as a whole.
	//
	storage: {
		// browser.storage.get()
		//
		// fetches the storage object.
		// The default object is returned if the storage is empty.
		//
		get: async function() {},

		// browser.storage.set(st)
		//
		// Stores the give storage object.
		//
		set: async function(st) {},

		// browser.storage.clear()
		//
		// Clears the storage.
		//
		clear: async function() {},

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

		// Browser.gui.getCallUrl(tabId)
		//
		// Gets the callUrl of given tab.
		//
		getCallUrl: async function(tabId) {},

		// Browser.gui.closePopup()
		//
		// Closes the popup.
		//
		closePopup: function() {},

		// Browser.gui.getURL()
		//
		// Coverts a relative URL to a fully-qualified one.
		//
		getURL: function() {},
	},

	// Browser.capabilities
	//
	capabilities: {
		_build: '%BUILD%',		// this is replaced by "make build-foo"

		isDebugging: function() { return Browser.debugging },
		popupAsTab: function() { return false },
		permanentIcon: function() { return false },
		isAndroid: function() { return navigator.userAgent.toLowerCase().indexOf('android') > -1 }
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
module.exports = Browser;

