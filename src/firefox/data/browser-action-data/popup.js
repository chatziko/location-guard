/**
 * (c) 2013 Rob Wu <gwnRob@gmail.com>
 * Implementation of chrome.browserAction for Jetpack Add-ons.
 * Distributed under the MIT license.
 */

/*jshint browser:true*/
/*globals self*/
'use strict';
var lastHeight = 0;
var lastWidth = 0;
function updatePanelDimensions() {
    let wrapper = document.documentElement;
    let height = wrapper.scrollHeight;
    let width = wrapper.scrollWidth;
    if (height === lastHeight && width === lastWidth) {
        return;
    }
    let dimensions = {
        height: height,
        width: width
    };
    self.port.emit('dimensions', dimensions);
}
// Monitor content changes for calculating the scrollheight.
var deferredDimensionCheck;
var lastChecked = 0;
var rootObserver = new MutationObserver(function() {
    var now = Date.now();
    clearTimeout(deferredDimensionCheck);
    if (now - lastChecked > 200) {
        // Last check was over 0.2 seconds ago. Check immediately.
        updatePanelDimensions();
    } else {
        deferredDimensionCheck = setTimeout(updatePanelDimensions, 10);
    }
    lastChecked = now;
});
rootObserver.observe(document.documentElement, {
    attributes: true,
    childList: true,
    characterData: true,
    subtree: true,
    attributeOldValue: false,
    characterDataOldValue: false
});

if (document.readyState == 'complete') {
    updatePanelDimensions();
} else {
    document.addEventListener('DOMContentLoaded', updatePanelDimensions);
}

const CLOSE_TOKEN = 'window.close.' + Math.random();

document.addEventListener(CLOSE_TOKEN, function() {
    self.port.emit('hide');
});
self.on('detach', function() {
    window.dispatchEvent(new CustomEvent('unload'));
});

// When window.close() is called, hide the popup.
document.documentElement.setAttribute('onreset',
        'document.documentElement.removeAttribute("onreset");' +
        'window.close=function(){document.dispatchEvent(new CustomEvent("' + CLOSE_TOKEN + '"));};'
);
document.documentElement.onreset();
