/**
 * (c) 2013 Rob Wu <gwnRob@gmail.com>
 * Implementation of chrome.browserAction for Jetpack Add-ons.
 * Distributed under the MIT license.
 */

/*jshint browser:true*/
/*globals self*/
'use strict';
var badgeText = document.getElementById('badgeText');
self.port.on('setBadgeText', function(text) {
    badgeText.textContent = text;
    badgeText.style.display = text ? '' : 'none';
});
self.port.on('setBadgeBackgroundColor', function(colorArray) {
    // Default color when every digit is 0
    if (colorArray.every(function(d) d === 0))
        colorArray = [0xEE, 0, 0, 255];

    colorArray[3] = colorArray[3] / 255; // Alpha channel convert [0,255] to [0,1]
    function rgba() 'rgba(' + colorArray.join(',') + ')'

    badgeText.style.backgroundColor = rgba();

    // Darken the color
    for (let i=0; i<3; ++i) colorArray[i] = Math.round(colorArray[i] * 0.95);
    badgeText.style.borderColor = rgba();
});
self.port.on('setIcon', function(url) {
    document.getElementById('button-img').src = url;
});

self.port.on('enabled', function(enabled) {
    document.documentElement.classList[enabled?'remove':'add']('disabled');
    document.querySelector('button').disabled = !enabled;
});

self.postMessage(''); // I am alive, request render data
