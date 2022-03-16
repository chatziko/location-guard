// utility class, loaded in various places
//
// It should contain only browser-independent functions, browser-specific
// functionality should go to browser/*.js
//

var Util = {
	extractDomain: function(url) {
		var match = /\/\/([^\/]+)/.exec(url);
		return match ? match[1] : "";
	},
	extractAnchor: function(url) {
		var match = /#(.+)/.exec(url);
		return match ? match[1] : "";
	},
	clone: function(obj) {
		// Note: JSON stringify/parse doesn't work for cloning native objects such as Position and PositionError
		//
		var t = typeof obj;
		if(obj === null || t === 'undefined' || t === 'boolean' || t === 'string' || t === 'number')
			return obj;
		if(t !== 'object')
			return null;

		var o = {};
		for (var k in obj)
			o[k] = Util.clone(obj[k]);
		return o;
	},

	// Get icon information. 'about' can be:
	//   tabId
	//   null (get info for the default icon)
	//   state object { callUrl: ..., apiCalls: ... }
	//
	// Returns:
	//   { hidden:          true if the icon should be hidden,
	//     private:         true if the current tab is in a private mode,
	//     defaultPrivate:  true if the default settings are in a private mode,
	//     apiCalls:        no of times the API has been called in the current tab
	//     title:           icon's title }
	//
	//
	getIconInfo: function(about, handler) {
		if(typeof(about) == 'object')						// null or state object
			Util._getStateIconInfo(about, handler);
		else {												// tabId
			const Browser = require('./browser');
			Browser.rpc.call(about, 'getState', [], function(state) {
				Util._getStateIconInfo(state, handler);
			});
		}
	},

	_getStateIconInfo: function(state, handler) {
		// return info for the default icon if state is null
		state = state || { callUrl: '', apiCalls: 0 };

		const Browser = require('./browser');
		Browser.storage.get().then(st => {
			var domain = Util.extractDomain(state.callUrl);
			var level = st.domainLevel[domain] || st.defaultLevel;

			var info = {
				hidden:  st.hideIcon,
				private: !st.paused && level != 'real',
				defaultPrivate: !st.paused && st.defaultLevel != 'real',
				apiCalls: state.apiCalls,
				title:
					"Location Guard\n" +
					(st.paused		? "Paused" :
					level == 'real'	? "Using your real location" :
					level == 'fixed'? "Using a fixed location" :
					"Privacy level: " + level)
			};
			handler(info);
		});
	},

	events: {
		_listeners: {},

		addListener: function(name, fun) {
			if(!this._listeners[name])
				this._listeners[name] = [];
			this._listeners[name].push(fun);
		},

		fire: function(name) {
			var list = this._listeners[name];
			if(!list) return;

			for(var i = 0; i < list.length; i++)
				list[i]();
		}
	}
};

module.exports = Util;