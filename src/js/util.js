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
		else												// tabId
			Browser.rpc.call(about, 'getState', [], function(state) {
				Util._getStateIconInfo(state, handler);
			});
	},

	_getStateIconInfo: function(state, handler) {
		// return info for the default icon if state is null
		state = state || { callUrl: '', apiCalls: 0 };

		Browser.storage.get(function(st) {
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


// PostRPC provides RPC functionality through message passing (postMessage)
//
// sendObj: object for sending messages (window or port)
// receiveObj: object for receiving messages
//
// The case when sendObj == receiveObj == window is supported. In this
// case sent messages will be also received by us, and ignored.
//
function _PostRPC() {		// include all code here to inject easily

	PostRPC = function(name, sendObj, receiveObj, targetOrigin) {
		this._id = Math.floor(Math.random()*1000000);
		this._ns = '__PostRPC_' + name;
		this._sendObj = sendObj;
		this._calls = {};
		this._methods = {};
		this._targetOrigin = targetOrigin;

		if(receiveObj)
			receiveObj.addEventListener("message", this._receiveMessage.bind(this), false);
	};

	// public methods
	PostRPC.prototype.register = function(name, fun) {
		this._methods[name] = fun;
	};
	PostRPC.prototype.call = function(method, args, handler) {
		var callId;
		if(handler) {
			callId = Math.floor(Math.random()*1000000);
			this._calls[callId] = handler;
		}
		if(!args) args = [];

		this._sendMessage({ method: method, args: args, callId: callId, from: this._id });
	};

	// private methods for sending/receiving messages
	PostRPC.prototype._sendMessage = function(message) {
		// everything is inside ns, to minimize conflicts with other messages
		var temp = {};
		temp[this._ns] = message;
		this._sendObj.postMessage(temp, this._targetOrigin);
	}

	PostRPC.prototype._receiveMessage = function(event) {
		var data = event.data && event.data[this._ns];		// everything is inside ns, to minimize conflicts with other message
		if(!data) return;

		if(data.method) {
			// message call
			if(data.from == this._id) return;						// we made this call, the other side should reply
			if(!this._methods[data.method]) {						// not registered
				Browser.log('PostRPC: no handler for '+data.method);
				return;
			}

			// pass returnHandler, used to send back the result
			var replyHandler;
			if(data.callId) {
				var _this = this;
				replyHandler = function() {
					var args = Array.prototype.slice.call(arguments);	// arguments in real array
					_this._sendMessage({ callId: data.callId, value: args });
				};
			} else {
				replyHandler = function() {};		// no result expected, use dummy handler
			}

			var dataArgs = Array.prototype.slice.call(data.args);	// cannot modify data.args in Firefox 32, clone as workaround
			dataArgs.push(replyHandler);

			this._methods[data.method].apply(null, dataArgs);

		} else {
			// return value
			var c = this._calls[data.callId];
			delete this._calls[data.callId];
			if(!c) return;											// return value for the other side, or no return handler
			c.apply(null, data.value);
		}
	}
}
_PostRPC();
