// implements browser_base.js

// this should not bother chrome
if (typeof exports != "undefined") {
    var Browser = require("browser_base").Browser;
}

Browser.init = function (script) { 
    Browser._script = script;
    Browser.log('initializing');

    Browser.storage._init();

    switch(script) {
    case 'main':
	Browser._main_script();
        Browser.gui._init();
        Browser._install_update();
	break;

    case 'content':
        // sets up low level communication
        extension.onMessage.addListener(Browser.handleMessage);
	break;
    }
    Browser.gui.refreshAllIcons();

};

// handle installation and upgrade 
Browser._install_update = function(){
    
    var self = require("sdk/self");
    var Util = require("./util").Util;

    if(self.loadReason == "install") {
	Browser.gui.showOptions('#faq');
    }
    else if(self.loadReason == "upgrade"){
	Browser.storage.get(function(st) {
	    if(st.fixedPosNoAPI == null)
		st.fixedPosNoAPI = true;
            
	    Browser.storage.set(st);
	});
    }
}

Browser._main_script = function() {

    Browser.workers = [];

    var array = require('sdk/util/array');
    var data = require("sdk/self").data;
    const { createMessageChannel, messageContentScriptFile } = require('messaging');

    // user tabs

    var pagemod = require("sdk/page-mod").PageMod({
        include: ['*'],
        attachTo: ["top"],//excludes iframes
        contentScriptWhen: 'start', // TODO THIS IS TRICKY
        contentScriptFile: [messageContentScriptFile, 
                            data.url("js/util.js"), 
                            data.url("js/browser_base.js"), 
                            data.url("js/browser.js"), 
                            data.url("js/laplace.js"),
                            data.url("js/content.js")],
        contentScriptOptions: {
            channelName: 'whatever you want',
            // Set the following to false if you want to communicate between
            // the "extension" and a content script instead of the page.
            endAtPage: false
        },

        onAttach: function(worker) {
            worker["channel"] = createMessageChannel(pagemod.contentScriptOptions, worker.port);
            worker.channel.onMessage.addListener(Browser.handleMessage);
                                            
            array.add(Browser.workers, worker);
            status();
            worker.on('pageshow', function() { array.add(Browser.workers, this); status();});
            worker.on('pagehide', function() { array.remove(Browser.workers, this); status();});
            worker.on('detach', function() { array.remove(Browser.workers, this); status();});

            worker.tab.on('activate', function(tab){
                Browser.log(tab.url + ' activated');
                Browser.gui.refreshIcon(null);//tabId is ignored
            });
            worker.tab.on('pageShow', function(tab){
                Browser.log(tab.url + ' pageShow');
                Browser.gui.refreshIcon(null);//tabId is ignored
            });
        }
    });

    // options page

    var pagemod = require("sdk/page-mod").PageMod({
        include: [data.url("options.html*")],
//        attachTo: ["top"], //excludes iframes
        contentScriptWhen: 'start', // sets up comm. before running the page scripts
        contentScriptFile: [messageContentScriptFile], 
        contentScriptOptions: {
            channelName: 'whatever you want',
            endAtPage: true //sets up communication with the page, not its content script
        },
        onAttach: function(worker) {
            worker["channel"] = createMessageChannel(pagemod.contentScriptOptions, worker.port);
            worker.channel.onMessage.addListener(Browser.handleMessage);
                                            
            array.add(Browser.workers, worker);
            status();
            worker.on('pageshow', function() { array.add(Browser.workers, this); status();});
            worker.on('pagehide', function() { array.remove(Browser.workers, this); status();});
            worker.on('detach', function() { array.remove(Browser.workers, this); status();});

            worker.tab.on('activate', function(tab){
                Browser.log(tab.url + ' activated');
                Browser.gui.refreshIcon(null);//tabId is ignored
            });
            worker.tab.on('pageShow', function(tab){
                Browser.log(tab.url + ' pageShow');
                Browser.gui.refreshIcon(null);//tabId is ignored
            });
        }
    });


    var status = function () {
        Browser.log('# of workers: ' + Browser.workers.length);
        for (var i=0; i<Browser.workers.length; i++) {
            Browser.log('#'+ i + ": " + Browser.workers[i].tab.url);
        }     
    }


}


//// low level communication

var id = function (msg,sender,sendResponse){sendResponse(msg)};
Browser.messageHandlers = {};
Browser.messageHandlers['id'] = id;

Browser.handleMessage = function(msg,sender,sendResponse) {
    // Browser.log('handling: ' + JSON.stringify(msg) + 
    //             '\n from :'+ JSON.stringify(sender) + 
    //             '\n response :'+ JSON.stringify(sendResponse));
    Browser.messageHandlers[msg.type].apply(null,[msg.message,sender,sendResponse]);
}

Browser.sendMessage = function (tabId, type, message, cb) {
    if (Browser._script == 'main'){
        for (var i=0; i<Browser.workers.length; i++) {
            if (Browser.workers[i].tab.id == tabId) { 
                // Browser.log('-> ' + Browser.workers[i].tab.url + JSON.stringify(message));
                Browser.workers[i].channel.sendMessage({'type': type, 'message': message},cb);
            }
            else {if (i == Browser.workers.length) Browser.log('no destination '+tabId)}
        }    
    }
    // content or popup
    else {
        // Browser.log(' -> main' + JSON.stringify(message));
        extension.sendMessage({'type': type, 'message': message},cb);
    }
};



//////////////////// rpc ///////////////////////////
//
//
// handler is a   function(...args..., tabId, replyHandler)
Browser.rpc.register = function(name, handler) {
    // set onMessage listener if called for first time
    if(!this._methods) {
	this._methods = {};
        Browser.messageHandlers['rpc'] = Browser.rpc._listener;
    }
    this._methods[name] = handler;
}

// onMessage listener. Received messages are of the form
// { method: ..., args: ... }
//
Browser.rpc._listener = function(message, tabId, replyHandler) {
	//blog("RPC: got message", [message, sender, replyHandler]);

    var handler = Browser.rpc._methods[message.method];
    if(!handler) {
        Browser.log('No handler for '+message.method);
        return;
    }
    
    // add tabId and replyHandler to the arguments
    var args = message.args || [];
    args.push(tabId, replyHandler);
    
    handler.apply(null, args);
};

Browser.rpc.call = function(tabId, name, args, cb) {
    var message = { method: name, args: args };

    Browser.sendMessage(tabId, 'rpc', message, cb)
}


//////////////////// storage ///////////////////////////

Browser.storage._key = "global";	// store everything under this key
Browser.storage._init = function(){
    if (Browser._script == 'main') {
        
        var ss = require("sdk/simple-storage").storage;
        
        Browser.storage.get = function(cb) {
            var st = ss[Browser.storage._key];
            
            // default values
            if(!st) {
            // Browser.log('initializing settings');
	        st = Browser.storage._default;
	        Browser.storage.set(st);
            }
            // Browser.log('returning st');
            cb(st);
        };

        Browser.storage.set = function(st) {
            // Browser.log('setting st');
            ss[Browser.storage._key] = st;
        };

        Browser.storage.clear = function() {
            // Browser.log('clearing st');
            delete ss[Browser.storage._key];
        };

        Browser.rpc.register('storage.get',function(tabId,replyHandler){
            Browser.storage.get(replyHandler);
        });

        Browser.rpc.register('storage.set',function(st,tabId,replyHandler){
            Browser.storage.set(st);
            replyHandler();
        });
        Browser.rpc.register('storage.clear',function(){
            Browser.storage.clear();
        });

    }
    // content and popup
    else{
        
        Browser.storage.get = function(cb) {
            // Browser.log('getting state');
            Browser.rpc.call(null,'storage.get',null,cb);
        }

        Browser.storage.set = function(st) {
            // Browser.log('setting state');
            Browser.rpc.call(null,'storage.set',[st]);
        }

        Browser.storage.clear = function() {
            // Browser.log('clearing state');
            Browser.rpc.call(null,'storage.clear');
        }

    }
}


//////////////////// gui ///////////////////////////

// only called by main
Browser.gui._init = function(){

    var array = require('sdk/util/array');

    Browser.gui["badge"] = {
        theBadge : null,
        visible : false,
        enabled : false,
        disable : function(title) {  // visible but disabled
            Browser.log('disabling button');
            if (!Browser.gui.badge.visible) {
                this.enable("");
            }
            this.enabled = false;
            Browser.gui.badge.theBadge.setIcon({path: 'images/pin_disabled_38.png'});
            Browser.gui.badge.theBadge.setTitle({title : title});
        },
        enable : function(title) {     // visible and enabled
            Browser.log('enabling button');

            if (!Browser.gui.badge.visible) {
                Browser.gui.badge.visible = true;

                Browser.gui.badge.theBadge = require('browserAction').BrowserAction({
                    default_icon: 'images/pin_38.png',
                    default_title: title,
                    default_popup: 'popup.html',
                });
                Browser.gui.badge.theBadge.onMessage.addListener(Browser.handleMessage);
                array.add(Browser.workers, {"tab" : {"id" : "popup", "url" : "popup"}, 'channel': Browser.gui.badge.theBadge});
            }
            Browser.gui.badge.enabled = true;
            Browser.gui.badge.theBadge.setIcon({path: 'images/pin_38.png'});
            Browser.gui.badge.theBadge.setTitle({title : title});
        },
        hide : function() {
            Browser.log('hiding button');
            if (Browser.gui.badge.visible) {
                Browser.gui.badge.visible = false;
                Browser.gui.badge.enabled = false;
                Browser.gui.badge.theBadge.destroy();
                array.remove(Browser.workers, {"tab" : {"id" : "popup", "url" : "popup"}, 'channel': Browser.gui.badge.theBadge});
            }
        },   
    };

    var tabs = require("sdk/tabs");

    Browser.gui._getActiveTab = function(){
        Browser.log('active tab: '+tabs.activeTab.url);
        return tabs.activeTab;
    }
    
    Browser.rpc.register('getActiveTabUrl', function(tabId, replyHandler) {
        var tab = Browser.gui._getActiveTab();
        replyHandler(tab.url);
    });

    Browser.rpc.register('refreshIcon', function(tabId) {
    	Browser.gui.refreshIcon(tabId);
    });

    var data = require("sdk/self").data;

    Browser.gui._showOptions = function(anchor){
        var url = data.url('options.html') + (anchor || '');
        tabs.open(url);

	// var baseUrl = chrome.extension.getURL('html/options.html');
	// var fullUrl = baseUrl + (anchor || '');
	// chrome.tabs.query({ url: baseUrl }, function(tabs) {
	// 	blog("tabs",tabs);
	// 	if (tabs.length)
	// 		chrome.tabs.update(tabs[0].id, { active: true, url: fullUrl });
	// 	else
	// 		chrome.tabs.create({ url: fullUrl });
	// });
    }

    Browser.rpc.register('showOptions', function(anchor) {
        Browser.log('showing options');        
        Browser.gui._showOptions(anchor);
    });


    var prefsModule = require("sdk/simple-prefs");
    prefsModule.on("optionButton", function() {
        console.log("options was clicked");
        Browser.gui._showOptions();
    })

}

Browser.gui.refreshIcon = function(tabId) {
    Browser.log('refreshing icon');
    if(Browser._script == 'main') {

        var tab = Browser.gui._getActiveTab();

	require("./util").Util.getIconInfo(tab.id, function(info) {
                Browser.log('got info for refreshIcon: ' + JSON.stringify(info));
	        if(info.hidden) {
                    Browser.gui.badge.hide();
	        } else {
                    if (!info.private) {
                        Browser.gui.badge.disable(info.title);
                    }
                    else {
                        Browser.gui.badge.enable(info.title);
                    }
	        }
	});
    }
    // content popup
    else {
	// cannot do it in the content script, delegate to the main
	// in this case tabId can be null, the main script will get the tabId
	// from the rpc call
        
	Browser.rpc.call(null, 'refreshIcon', null);
    }
};

Browser.gui.refreshAllIcons = function() {Browser.gui.refreshIcon(null)};

Browser.gui.showOptions = function(anchor) {
    Browser.log('calling showOptions');
    if(Browser._script == 'main') {
        Browser.gui._showOptions(anchor);
    }
    else {
        Browser.rpc.call(null,'showOptions',[anchor],null);
    }
};

Browser.gui.getActiveTabUrl = function(handler) {
    Browser.rpc.call(null,'getActiveTabUrl',[],handler)
}


// in chrome, apart from the current console, we also log to the background page, if possible and loaded
//
Browser.log = function(a, b) {
    if(!Browser.debugging) return;
    
    console.error(Browser._script + ": " + a, b);
}


// // this was used to test nested rpc calls with content script
// Browser.rpc.call(tab.id, 'test',null, function(inf){Browser.log('finally displaying: ' + inf);});

// // this was a test function, to use in content.js, to show that registering on content script side works
// // what doesn't work is nested calls, in particular everything goes ok until replyHandler is called 
// // and the argument that arrives on the other side is null
// Browser.rpc.register('test',function(tabId, replyHandler){
//     Browser.log('sending test');
//     Browser.storage.get(function(st) {
//         replyHandler('test');
//     });
// });





if (typeof exports != "undefined") {
    exports.Browser = Browser;
}
