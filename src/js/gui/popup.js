const Browser = require('../common/browser');
const Util = require('../common/util');

Browser.log("popup loading");

Browser.init('popup');

const $ = require('jquery');
$.mobile.hashListeningEnabled = false;		// disabling state changing is needed in firefox,
$.mobile.pushStateEnabled = false;			// it breaks when executed in the popup cause there's no history
$.mobile.ajaxEnabled = false;				// doesn't hurt but not needed
$.mobile.autoInitializePage = false;		// don't initialize until we set all values, avoids a quick but visible refresh

$(document).ready(drawUI);


var url;

async function doAction() {
	var action = $(this).attr("id");

	switch(action) {
		case 'options':
		case 'faq':
			var page = action == 'options' ? 'options.html' : 'faq.html#general';

			if(Browser.capabilities.popupAsTab()) {
				// we're in a normal tab, just navigate to the page
				window.location.href = page;
			} else {
				Browser.gui.showPage(page);
				Browser.gui.closePopup();
			}
			break;

		case 'hideIcon':
			var st = await Browser.storage.get();
			st.hideIcon = true;
			await Browser.storage.set(st);
			Browser.gui.refreshAllIcons(Browser.gui.closePopup);
			break;

		case 'pause':
			var st = await Browser.storage.get();
			st.paused = !st.paused;
			await Browser.storage.set(st);
			Browser.gui.refreshAllIcons(Browser.gui.closePopup);
			break;

		case 'setLevel':
			$("#levels").popup("open");
			break;

		default:	// set level
			if(!url) throw "no url";				// just to be sure

			var st = await Browser.storage.get();
			var domain = Util.extractDomain(url);
			var level = action;
			if(level == st.defaultLevel)
				delete st.domainLevel[domain];
			else
				st.domainLevel[domain] = level;

			await Browser.storage.set(st);
			Browser.gui.refreshAllIcons(Browser.gui.closePopup);
			break;
	}
}

function drawUI() {
	var res = window.location.href.match(/tabId=(\d+)/);
	var tabId = res ? parseInt(res[1]) : null;

	// we need storage and url
	Browser.gui.getCallUrl(tabId, async function(callUrl) {
		const st = await Browser.storage.get();
		Browser.log("popup: callUrl", callUrl, "settings", st);

		// we don't have a url if we are in chrome (browser action, visible in
		// all tabs), and the active tab has no content-script running (eg. new
		// tab page)
		//
		if(callUrl) {
			url = callUrl;
			var domain = Util.extractDomain(url);
			var level = st.domainLevel[domain] || st.defaultLevel;

			$("#title").text(
				st.paused		? "Location Guard is paused" :
				level == 'real'	? "Using your real location" :
				level == 'fixed'? "Using a fixed location" :
				"Privacy level: " + level
			);
			$("#setLevel b").text(domain);
			$("#"+level).attr("checked", true);

		} else {
			$("#title").parent().hide();
		}

		$("#pause").text((st.paused ? "Resume" : "Pause") + " Location Guard");
		$("#pause").parent().attr("data-icon", st.paused ? "play" : "pause");

		$("#setLevel").toggle(callUrl && !st.paused);
		$("#hideIcon").toggle(callUrl && !st.paused && !Browser.capabilities.permanentIcon());	// hiding the icon only works with page action (not browser action)

		$("a, input").on("click", doAction);

		// we're ready, init
		$.mobile.initializePage();

		if(Browser.capabilities.popupAsTab()) {
			// the popup is displayed as a normal tab
			// set 100% width/height
			$("html, body, #container").css({
				width:  "100%",
				height: "100%"
			});
			// show the close button
			$("#close").css({ display: "block" })
					   .on("click", Browser.gui.closePopup);

		} else {
			// normal popup, resize body to match #container
			var width = $("#container").width();
			var height = $("#container").height();

			$("html, body").css({
				width:  width,
				height: height,
			});
		}
	});
}


if(Browser.testing) {
	// test for nested calls, and for correct passing of tabId
	//
	Browser.rpc.register('nestedTestTab', function(tabId, replyHandler) {
		Browser.log("in nestedTestTab, returning 'popup'");
		replyHandler("popup");
	});

	Browser.log("calling nestedTestMain");
	Browser.rpc.call(null, 'nestedTestMain', []).then(res => {
		Browser.log('got from nestedTestMain', res);
	});
}
