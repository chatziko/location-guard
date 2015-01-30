blog("popup loading");

Browser.init('popup');

$.mobile.hashListeningEnabled = false;		// disabling state changing is needed in firefox,
$.mobile.pushStateEnabled = false;			// it breaks when executed in the popup cause there's no history
$.mobile.ajaxEnabled = false;				// doesn't hurt but not needed
$.mobile.autoInitializePage = false;		// don't initialize until we set all values, avoids a quick but visible refresh

$(document).ready(drawUI);


var url;

function closePopup() {
	// delay closing to allow scripts to finish executing
	setInterval(window.close, 50);
}

function doAction() {
	var action = $(this).attr("id");

	switch(action) {
		case 'options':
		case 'faq':
			var page = action == 'options' ? 'options.html' : 'faq.html#general';
			Browser.gui.showPage(page);

			closePopup();
			break;

		case 'hideIcon':
			Browser.storage.get(function(st) {
				st.hideIcon = true;
				Browser.storage.set(st);

				Browser.gui.refreshAllIcons();

				closePopup();
			});
			break;

		case 'pause':
			Browser.storage.get(function(st) {
				st.paused = !st.paused;
				Browser.storage.set(st);

				Browser.gui.refreshAllIcons();

				closePopup();
			});
			break;

		case 'setLevel':
			$("#levels").popup("open");
			break;

		default:	// set level
			Browser.storage.get(function(st) {
				var domain = Util.extractDomain(url);
				var level = action;
				if(level == st.defaultLevel)
					delete st.domainLevel[domain];
				else
					st.domainLevel[domain] = level;
				Browser.storage.set(st);

				Browser.gui.refreshAllIcons();

				closePopup();
			});
			break;
	}
}

function drawUI() {
	// we need storage and url
	Browser.gui.getActiveCallUrl(function(callUrl) {
	Browser.storage.get(function(st) {
		blog("popup: callUrl", callUrl, "settings", st);

		url = callUrl;
		var domain = Util.extractDomain(url);
		var level = st.domainLevel[domain] || st.defaultLevel;

		$("#title").text(
			st.paused		? "Location Guard is paused" :
			level == 'real'	? "Using your real location" :
			level == 'fixed'? "Using a fixed location" :
			"Privacy level: " + level
		);

		$("#pause").text((st.paused ? "Resume" : "Pause") + " Location Guard");
		$("#pause").parent().attr("data-icon", st.paused ? "play" : "pause");
		$("#setLevel").html("Set level for <b>" + domain + "</b>");

		$("#setLevel,#hideIcon").toggle(!st.paused);

		$("#"+level).attr("checked", true);

		$("a, input").on("click", doAction);

		// we're ready, init
		$.mobile.initializePage();

		// resize body to match #container
		$("html, body").css({
			width:  $("#container").width(),
			height: $("#container").height(),
		});
	});
	});
}


if(Browser.testing) {
	// test for nested calls, and for correct passing of tabId
	//
	Browser.rpc.register('nestedTestTab', function(tabId, replyHandler) {
		blog("in nestedTestTab, returning 'popup'");
		replyHandler("popup");
	});

	blog("calling nestedTestMain");
	Browser.rpc.call(null, 'nestedTestMain', [], function(res) {
		blog('got from nestedTestMain', res);
	});
}
