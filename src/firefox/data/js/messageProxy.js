// Inserted as a content script in internal pages (options, popup, demo)
// These pages run as normal pages, have no self.port and cannot communicate
// with the main script. So we use PostRPC on window, and add this proxy as a
// content script. It forwards all messages for the 'internal' RPC from window
// to self.port and vice versa
//
var ns = '__PostRPC_internal';

self.port.on(ns, function(message) {
	var temp = { __fwd: true };
	temp[ns] = message;
	window.postMessage(temp, "*");
});

window.addEventListener("message", function(event) {
	if(event.data && event.data[ns] && !event.data.__fwd)
		self.port.emit(ns, event.data[ns]);
}, false);

