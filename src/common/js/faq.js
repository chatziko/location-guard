blog("faq loading");

// although we don't use it explicitly in faq.js, Browser should be always loaded, it might be needed internally
Browser.init('options');

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

	$("#lgIcon").addClass(Browser.capabilities.usesBrowserAction() ? 'lg-icon-browseraction' : 'lg-icon-pageaction');

	$(window).on("hashchange", openHash);

	if(location.hash)
		openHash();
	else
		location.hash = "#general";
});
