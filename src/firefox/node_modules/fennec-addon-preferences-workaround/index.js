/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
'use strict';

const { Cu } = require('chrome');
const { on } = require('sdk/system/events');
const { preferencesBranch } = require('sdk/self');
const { localizeInlineOptions } = require('sdk/l10n/prefs');
const { AddonManager } = Cu.import("resource://gre/modules/AddonManager.jsm");
const { defer } = require("sdk/core/promise");

// Import the original methods from the native-options that don't need to be fixed.
const { validate, setDefaults } = require("sdk/preferences/native-options");

const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";;

// Tweaks on the original `require("sdk/preferences/native-options").enable` method
// to fix the issues on Firefox for Android, by injecting the elements in the right place.
function enable({ preferences, id }) {
  let enabled = defer();

  validate(preferences);

  setDefaults(preferences, preferencesBranch);

  // allow the use of custom options.XL
  AddonManager.getAddonByID(id, (addon) => {
    on('addon-options-displayed', onAddonOptionsDisplayed, true);
    enabled.resolve({ id: id });
  });

  function onAddonOptionsDisplayed({ subject: doc, data }) {
    let optionsBox = doc.querySelector('.options-box');

    if (!optionsBox) {
      // if the options elements are not found the workaround will
      // not work.
      return;
    }

    if (data === id) {
      optionsBox.style.display = "block";

      let header = doc.querySelector(".options-header").cloneNode(true);
      header.style.display = "block";
      optionsBox.appendChild(header);

      injectOptions({
        preferences: preferences,
        preferencesBranch: preferencesBranch,
        document: doc,
        parent: optionsBox,
        id: id
      });
      localizeInlineOptions(doc);
    }
  }

  return enabled.promise;
}

// dynamically injects inline options into about:addons page at runtime
// NOTE: Redefined to fix injection of xul controls into an xhtml document,
// because on Firefox Desktop the about:addons page is a xul page document,
// on Firefox for Android the about:addons page is an xhtml page.
function injectOptions({ preferences, preferencesBranch, document, parent, id }) {
  for (let { name, type, hidden, title, description, label, options, on, off } of preferences) {

    if (hidden) {
      continue;
    }

    let setting = document.createElementNS(XUL_NS, 'setting');
    setting.setAttribute('pref-name', name);
    setting.setAttribute('data-jetpack-id', id);
    setting.setAttribute('pref', 'extensions.' + preferencesBranch + '.' + name);
    setting.setAttribute('type', type);
    setting.setAttribute('title', title);
    if (description)
      setting.setAttribute('desc', description);

    if (type === 'file' || type === 'directory') {
      setting.setAttribute('fullpath', 'true');
    }
    else if (type === 'control') {
      let button = document.createElementNS(XUL_NS, 'button');
      button.setAttribute('pref-name', name);
      button.setAttribute('data-jetpack-id', id);
      button.setAttribute('label', label);
      button.setAttribute('oncommand', "Services.obs.notifyObservers(null, '" +
                                        id + "-cmdPressed', '" + name + "');");
      setting.appendChild(button);
    }
    else if (type === 'boolint') {
      setting.setAttribute('on', on);
      setting.setAttribute('off', off);
    }
    else if (type === 'menulist') {
      let menulist = document.createElementNS(XUL_NS, 'menulist');
      let menupopup = document.createElementNS(XUL_NS, 'menupopup');
      for (let { value, label } of options) {
        let menuitem = document.createElement(XUL_NS, 'menuitem');
        menuitem.setAttribute('value', value);
        menuitem.setAttribute('label', label);
        menupopup.appendChild(menuitem);
      }
      menulist.appendChild(menupopup);
      setting.appendChild(menulist);
    }
    else if (type === 'radio') {
      let radiogroup = document.createElementNS(XUL_NS, 'radiogroup');
      for (let { value, label } of options) {
        let radio = document.createElementNS(XUL_NS, 'radio');
        radio.setAttribute('value', value);
        radio.setAttribute('label', label);
        radiogroup.appendChild(radio);
      }
      setting.appendChild(radiogroup);
    }

    parent.appendChild(setting);
  }
}


// Check if the workaround is needed:
// native-options does stuff directly with preferences key from package.json
// that needs to be hot fixed for Firefox for Android 44 and 45
const { id } = require('sdk/self');
const { metadata } = require('@loader/options');
const { preferences } = metadata;

const xulApp = require("sdk/system/xul-app");
const isFennec = xulApp.is("Fennec");
const isVersionInRange = xulApp.versionInRange(xulApp.platformVersion, "44.0", "*");

// Apply the workaround on Firefox for Android >= 44.0
if (isFennec && isVersionInRange && preferences && preferences.length > 0) {
  try {
    enable({ preferences: preferences, id: id }).
      catch(console.exception);
  }
  catch (error) {
    console.exception(error);
  }
}
