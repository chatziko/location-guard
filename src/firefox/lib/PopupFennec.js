// popup implementation for firefox mobile (fennec)
// reimplements popup.js using fennec's native ui
//
'use strict';

let Cu = require("chrome").Cu;
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/Prompt.jsm");

let { Browser, Util } = require('./main');

let PopupFennec = exports;

PopupFennec.show = function() {
	// we need storage and url
	Browser.gui.getActiveCallUrl(function(callUrl) {
	Browser.storage.get(function(st) {
		Browser.log("androidPopup: callUrl", callUrl, "settings", st);

		var domain = Util.extractDomain(callUrl);
		var level = st.domainLevel[domain] || st.defaultLevel;

		var title =
			st.paused		? "Location Guard is paused" :
			level == 'real'	? "Using your real location" :
			level == 'fixed'? "Using a fixed location" :
			"Privacy level: " + level;

		var items = [
			{ label: (st.paused ? "Resume" : "Pause") + " Location Guard", action: "pause" },
			{ label: (st.hideIcon ? "Show" : "Hide") + " icon", action: "toggleIcon" },
			{ label: "Options", action: "options" },
			{ label: "What is Location Guard?", action: "faq" },
		];
		if(!st.paused)
			items.unshift({ label: "Set level for " + domain, menu: true, action: "setLevel" });

		new Prompt({
			title: title,
			window: Services.wm.getMostRecentWindow("navigator:browser"),
		})
		.setSingleChoiceItems(items)
		.show(function(data) {
			if(data.button == -1) return;
			var action = items[data.button].action;
			switch(action) {
				case 'setLevel':
					PopupFennec.setLevel(domain, level);
					break;

				case 'options':
				case 'faq':
					var page = action == 'options' ? 'options.html' : 'faq.html#general';
					Browser.gui.showPage(page);
					break;

				case 'toggleIcon':
					PopupFennec.toggleIcon();
					break;

				case 'pause':
					Browser.storage.get(function(st) {
						st.paused = !st.paused;
						Browser.storage.set(st, function() {
							Browser.gui.refreshAllIcons();
						});
					});
					break;
			}
		});
	});
	});
};

PopupFennec.setLevel = function(domain, level) {
	var items = [
		{ label: "Use fixed location", selected: (level == "fixed"),  level: "fixed"  },
		{ label: "High",               selected: (level == "high"),   level: "high"   },
		{ label: "Medium",             selected: (level == "medium"), level: "medium" },
		{ label: "Low",                selected: (level == "low"),    level: "low"    },
		{ label: "Use real location",  selected: (level == "real"),   level: "real"   },
	];

	new Prompt({
		title: "Privacy level for " + domain,
		window: Services.wm.getMostRecentWindow("navigator:browser"),
	})
	.setSingleChoiceItems(items)
	.show(function(data) {
		if(data.button == -1) return;
		var level = items[data.button].level;

		Browser.storage.get(function(st) {
			if(level == st.defaultLevel)
				delete st.domainLevel[domain];
			else
				st.domainLevel[domain] = level;

			Browser.storage.set(st, function() {
				Browser.gui.refreshAllIcons();
			});
		});
	});
};

PopupFennec.toggleIcon = function() {
	var nw = Services.wm.getMostRecentWindow("navigator:browser").NativeWindow;

	Browser.storage.get(function(st) {
		st.hideIcon = !st.hideIcon;
		Browser.storage.set(st, function() {
			Browser.gui.refreshAllIcons();
		});

		var msg = st.hideIcon
			? "Icon replaced by menu item"
			: "Icon restored";

		nw.toast.show(msg, "long", {
			button: {
				label: "UNDO",
				callback: PopupFennec.toggleIcon
			}
		});
	});
}

