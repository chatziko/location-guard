// jquery-mobile 1.4.5 has no proper npm version, but a
// "jquery-mobile-babel-safe" package exists and can be loaded in a hack-ish way.
//
// We load jquery, and store it globally to be accessible to jquery-mobile
window.jQuery = require('jquery');

// jquery-mobile does not support jquery 3, so we need the migration package
require('jquery-migrate');

// Finally we load jquery-mobile. This includes jquery.mobile-1.4.5.js" as a "shim", see package.json
require('jquery-mobile');