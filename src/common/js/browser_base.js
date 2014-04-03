// Base class for browser-specific functionality
// Subclasses should implement the API defined here
//
var Browser = {
	debugging: true,				// set this to false on production

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
		// If handler does not immediately return a result but stores replyHandler to do it asynchronously later, it should return a true
		// value to keep replyHandler open.
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

		// browser.storage.set(st)
		//
		// Stores the give storage object.
		//
		set: function(st) {},

		// browser.storage.clear()
		//
		// Clears the storage.
		//
		clear: function() {},

		// default storage object
		//
		_default: {
			paused: false,
			hideIcon: false,
			cachedPos: {},
			fixedPos: {
				latitude: 39.108889,
				longitude: -76.771389,
				accuracy: 10
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
	//   { hidden:   true if the icon should be hidden,
	//     private:  true if we are in a private mode,
	//     title:    icon's title }
	//
	// The GUI is free to render the icon in any way based on the above info. It can also render it
	// at any moment, by calling getIconInfo to get the info object.
	// When refreshIcon or refreshAllIcons are called the icons should be refreshed.
	//
	gui: {
		// Browser.gui.refreshIcon(tabId)
		//
		// Refreshes the icon of the tab with the given 'tabId', or the current tab if tabId is null
		// getIconInfo should be called to get the icon's info
		//
		refreshIcon: function(tabId) {},

		// Browser.gui.refreshAllIcons()
		//
		// Refreshes the icons of all tabs.
		// getIconInfo should be called to get the icon's info
		//
		refreshAllIcons: function() {},

		// Browser.gui.showOptions(anchor)
		//
		// Shows the options page (by opening a new tab, or focusing an old tab if it's already open).
		// An 'anchor' (eg. '#faq' can be optionally given)
		//
		showOptions: function(anchor) {},

		// Browser.gui.getActiveTabUrl(handler)
		//
		// Gets the url of the active tab and passes it to 'handler'
		//
		getActiveTabUrl: function(handler) {}
	},

	// Browser.log(text, value)
	//
	// Logs the given text/value pair
	//
	log: function(text, value) {
		if(!Browser.debugging) return;

		console.log(text, value);
	}
};
