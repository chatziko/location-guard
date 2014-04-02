// main script
// Here we only handle the install/update events
// Browser-specific functionality for the main script, if needed, is added by browser/*.js
//

var Browser = require("browser").Browser;

Browser.log('starting');

Browser.init('main');
