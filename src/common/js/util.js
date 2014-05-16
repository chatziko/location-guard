// utility class, loaded in various places
//
// It should contain only browser-independent functions, browser-specific
// functionality should go to browser/*.js
//

var Util = {
	extractDomain: function(url) {
            var match = /\/\/[A-Za-z0-9_.]+\//.exec(url);
            return match[0].replace(/\//gi,""); // remove slashes used for match
	},
	extractAnchor: function(url) {
            var match = /#[A-Za-z0-9_]+/.exec(url);
            return match[0].replace(/\#/gi,""); // remove # used for match
	},
	clone: function(obj) {
		return JSON.parse(JSON.stringify(obj));
	},

	// Get icon information for a specific tabId. Returns:
	//   { hidden:   true if the icon should be hidden,
	//     private:  true if we are in a private mode,
	//     title:    icon's title }
	//
	// Note: we have this method here (instead of inside the content script) so
	//       that the rpc call and the storage access are serialized, instead of nested.
	//       Firefox has issues with nested calls (we should fix this at some point)
	//
	getIconInfo: function(tabId, handler) {
		Browser.rpc.call(tabId, 'getState', [], function(state) {
			if(!state) {
				// this is not a tab with content script loaded, hide icon
				handler({ hidden: true, private: false, title: "" });
				return;
			}

			Browser.storage.get(function(st) {
				var domain = Util.extractDomain(state.url);
				var level = st.domainLevel[domain] || st.defaultLevel;

				var info = {
					hidden:  st.hideIcon || !state.apiCalled,
					private: !st.paused && level != 'real',
					title:
						st.paused		? "Location Guard is paused" :
						level == 'real'	? "Using your real location" :
						level == 'fixed'? "Using a fixed location" :
						"Privacy level: " + level
				};
				handler(info);
			});
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

