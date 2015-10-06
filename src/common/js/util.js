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
	delegate: function(obj, name) {
		return function() {
			return obj[name].apply(obj, arguments);
		};
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
				var domain = Util.extractDomain(state.callUrl);
				var level = st.domainLevel[domain] || st.defaultLevel;

				var info = {
					hidden:  st.hideIcon || !state.apiCalled,
					apiCalled: state.apiCalled,
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


// PostRPC provides RPC functionality through message passing. Both postMessage
// and Firefox's port object are supported
//
// sendObj: object for sending messages (window or port)
// receiveObj: object for receiving messages
//
// The case when sendObj == receiveObj == window is supported. In this
// case sent messages will be also received by us, and ignored.
//
function _PostRPC() {		// include all code here to inject easily

	PostRPC = function(name, sendObj, receiveObj) {
		this._id = Math.floor(Math.random()*1000000);
		this._ns = '__PostRPC_' + name;
		this._sendObj = sendObj;
		this._calls = {};
		this._methods = {};

		if(!receiveObj) return;		// send-only RPC

		if(receiveObj.emit) {
			receiveObj.on(this._ns, Util.delegate(this, '_receiveMessage'));
		} else {
			var _this = this;
			receiveObj.addEventListener("message", function(event) {
				var data = event.data && event.data[_this._ns];		// everything is inside ns, to minimize conflicts with other message
				if(data)
					_this._receiveMessage(data);
			}, false);
		}
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
		if(this._sendObj.emit)
			this._sendObj.emit(this._ns, message);
		else {
			// everything is inside ns, to minimize conflicts with other messages
			var temp = {};
			temp[this._ns] = message;
			this._sendObj.postMessage(temp, "*");
		}
	}

	PostRPC.prototype._receiveMessage = function(data) {
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
