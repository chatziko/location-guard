// PostRPC provides RPC functionality through message passing (postMessage)
//
// sendObj: object for sending messages (window or port)
// receiveObj: object for receiving messages
//
// The case when sendObj == receiveObj == window is supported. In this
// case sent messages will be also received by us, and ignored.
//
function _code() {		// include all code here to inject easily

	var PostRPC = function(name, sendObj, receiveObj, targetOrigin) {
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
				if(console)
					console.log('PostRPC: no handler for '+data.method);
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

	return PostRPC;
}

module.exports = _code();
module.exports._code = _code;
