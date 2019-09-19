const Browser = require('./browser');

Browser.log("faq loading");

// send an empty reply to getState (see options.js)
Browser.init('options');
Browser.rpc.register('getState', function(tabId, replyHandler) {
	replyHandler();
});

const $ = require('jquery');
$.mobile.ajaxEnabled = false;
$.mobile.linkBindingEnabled = false;

function openHash() {
	$("#faq-" + location.hash.substr(1)).collapsible("expand");
}

$(document).ready(function() {
	$("#left-panel").panel().enhanceWithin();			// initialize panel

	// open panel on swipe
	$(document).on("swiperight", function(e) {
		if($("#left-panel").css("visibility") !== "visible" )		// check if already open (manually or due to large screen)
			$("#left-panel").panel("open");
	});

	// animate collapsibles in the faq
	$("#faq [data-role='collapsible']").collapsible({
		collapse: function( event, ui ) {
			$(this).children().next().slideUp(150);
		},
		expand: function( event, ui ) {
			location.hash = "#" + $(this).attr("id").substr(4);

			$(this).children().next().hide();
			$(this).children().next().slideDown(150);
		}
	});

	$("#lgIcon").addClass(Browser.capabilities.permanentIcon() ? 'lg-icon-browseraction' : 'lg-icon-pageaction');

	$(window).on("hashchange", openHash);

	if(location.hash)
		openHash();
	else
		location.hash = "#general";
});
