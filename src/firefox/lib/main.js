// main script
// Here we only handle the install/update events
// Browser-specific functionality for the main script, if needed, is added by browser/*.js
//

// FF: we need to load dependencies with require()
if (require) {
    var Browser = require("./browser").Browser;
    var Util = require("./util").Util;
}

Browser.log('starting');

Browser.init('main');