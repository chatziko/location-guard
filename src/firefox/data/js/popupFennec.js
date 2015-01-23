// popup implementation for firefox mobile (fennec)
// reimplements popup.js using fennec's native ui
//
PopupFennec = {};

PopupFennec.show = function() {
	// we need storage and url
	Browser.gui.getActiveCallUrl(function(callUrl) {
	Browser.storage.get(function(st) {
		blog("androidPopup: callUrl", callUrl, "settings", st);

		var domain = Util.extractDomain(callUrl);
		var level = st.domainLevel[domain] || st.defaultLevel;

		var title =
			st.paused		? "Location Guard is paused" :
			level == 'real'	? "Using your real location" :
			level == 'fixed'? "Using a fixed location" :
			"Privacy level: " + level;

		var items = [
			{ label: (st.paused ? "Resume" : "Pause") + " Location Guard", action: "pause" },
			{ label: "Hide icon", action: "hideIcon" },
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

				case 'hideIcon':
					Browser.storage.get(function(st) {
						st.hideIcon = true;
						Browser.storage.set(st);

						Browser.gui.refreshAllIcons();
					});
					break;

				case 'pause':
					Browser.storage.get(function(st) {
						st.paused = !st.paused;
						Browser.storage.set(st);

						Browser.gui.refreshAllIcons();
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
			Browser.storage.set(st);

			Browser.gui.refreshAllIcons();
		});
	});
};

