'use strict';


// A small legacy addon that embeds the new WebExtension addon and allows to
// transfer the stored settings.
// See: https://developer.mozilla.org/en-US/Add-ons/WebExtensions/Embedded_WebExtensions


// load storage from the old addon
//
var ss = require("sdk/simple-storage").storage;
var st = ss["global"];			// the whole storage object

// chrome.runtime.onInstalled does not fire inside an embeded addon, so we check
// self.loadReason and pass an 'install' flag to the embeded addon
//
var self = require("sdk/self");
var install = self.loadReason == "install";

// start the new addon, and send the migrate info when asked
//
const webExtension = require("sdk/webextension");

webExtension.startup().then(api => {
	const {browser} = api;
	browser.runtime.onMessage.addListener((msg, sender, sendReply) => {
		if(msg == "migrate")
			sendReply({
				storage: st,
				install: install
			});
    });
});
