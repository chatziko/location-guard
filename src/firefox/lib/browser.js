// implements browser_base.js

if (typeof exports != "undefined") {
    var Browser = require("./browser_base").Browser;
}

Browser.calls = [];
Browser.init = function (script) { 
    Browser._script = script;
    Browser.storage._init();

    switch(script) {
    case 'main':
	this._main_script();
	break;

    case 'content':

        self.on("message", function(msg) {
            Browser.listener(null,msg);
        });

	// to avoid asking for the 'tabs' permission, we get the tab's url
	// from the content script

	// Browser.rpc.register('getUrl', function(tabId, replyHandler) {
	//     replyHandler(window.location.href);
	// });

	break;
    }
};

Browser._main_script = function() {
    Browser.workers = [];

    var data = require("sdk/self").data;
    var pageMod = require("sdk/page-mod");
    
    pageMod.PageMod({
        include: ["*"],
        contentScriptFile: [data.url("util.js"), data.url("browser_base.js"), data.url("browser.js"), data.url("content.js")],
        onAttach: function(worker) {
            Browser.workers.push(worker);
            status();
            worker.on('message', function(msg) {
                Browser.listener(worker.tab.id,msg);
            });
            worker.on('detach', function() {
                var index = Browser.workers.indexOf(worker);
                if (index !== -1) Browser.workers.splice(index, 1);
                status();
            });
        }
    });

var status = function () {
    console.error('# of workers: ' + Browser.workers.length);
    for (var i=0; i<Browser.workers.length; i++) {
        console.error(Browser.workers[i].tab.url);
    }     
}


	// fire browser.install/update events
	//
	// chrome.runtime.onInstalled.addListener(function(details) {
	// 	if(details.reason == "install")
	// 		Util.events.fire('browser.install');

	// 	else if(details.reason == "update")
	// 		Util.events.fire('browser.update');
	// });

	// some operations cannot be done by other scripts, so we set
	// handlers to do them in the main script
	//
	// Browser.rpc.register('refreshIcon', function(tabId) {
	// 	Browser.gui.refreshIcon(tabId);
	// });
}


Browser.listener = function(sender, msg) {

    if (this.calls[msg.msgId]) { //i'm the original sender
        console.error('finishing my cb');
        var cb = this.calls[msg.msgId];
        delete this.calls[msg.msgId];
        if (cb) cb.apply(null,[msg.msg]); 
    }
    else {
        var recipient = null;
        var logString = "";
        if (sender) { //send to a tab
            for (var i=0; i<this.workers.length; i++) {
                if (this.workers[i].tab.id == sender) { 
                    logString = 'tab <-> main ['+msg.msgId+']';
                    recipient = this.workers[i];
                }
            }
        }
        else {//send to main
            logString = 'main <-> tab['+sender+']  ['+msg.msgId+']';
            recipient = self;
        }
        var sendResponse = function(response) {
            console.error(logString);
            recipient.postMessage({msgId : msg.msgId, msg : response});
        }
        Browser.handleMessage(msg.msg,sender,sendResponse); //handle message
    }
};

var id = function (msg,sender,sendResponse){sendResponse(msg)};
Browser.messageHandlers = {};
Browser.messageHandlers['id'] = id;
Browser.handleMessage = function(msg,sender,sendResponse) {
    if (!msg.type) console.error('No message type');
    console.error('message type ' + msg.type);
    Browser.messageHandlers[msg.type].apply(null,[msg.data,sender,sendResponse]);
}

var cnt = 0;
Browser._makeId = function(){
    cnt = cnt +1;
    if (Browser._script == 'main') {return 'main_' + cnt}
    else {return 'content_'+cnt}
}

Browser.sendMessage = function (tabId, message, cb) {
    if (Browser._script == 'main'){
        for (var i=0; i<this.workers.length; i++) {
            if (this.workers[i].tab.id == tabId) { 
                console.error('main -> tab[' + this.workers[i].tab.url) + ']';
                var msgId = Browser._makeId();
                this.workers[i].postMessage({msgId : msgId, msg : message});
                if (cb) this.calls[msgId] = cb;
//                console.error('#cbs main ' + this.calls.length);
            }
        }    
    }
    else {
        var msgId = Browser._makeId();
        console.error('tab -> main ['+msgId+']');
        self.postMessage({msgId : msgId, msg : message});
        if (cb) this.calls[msgId] = cb;
//        console.error('#cbs tab ' + this.calls.length);
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
	//chrome.runtime.onMessage.addListener(this._listener);
    }
    this._methods[name] = handler;
}

// onMessage listener. Received messages are of the form
// { method: ..., args: ... }
//
Browser.rpc._listener = function(message, tabId, replyHandler) {
	//blog("RPC: got message", [message, sender, replyHandler]);

	var handler = Browser.rpc._methods[message.method];
	if(!handler) return;

	// add tabId and replyHandler to the arguments
	var args = message.args || [];
	args.push(tabId, replyHandler);

	return handler.apply(null, args);
};

Browser.rpc.call = function(tabId, name, args, cb) {
    var message = { method: name, args: args };

    Browser.sendMessage(tabId,{type: 'rpc', data : message}, cb)
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
	        st = Browser.storage._default;
	        Browser.storage.set(st);
            }
            console.log('returning st');
            cb(st);
        };

        Browser.storage.set = function(st) {
            console.error('saving st');
            ss[Browser.storage._key] = st;
        };

        Browser.storage.clear = function() {
            console.error('clear st');
            delete ss[Browser.storage._key];
        };

        Browser.rpc.register('storage.get',function(tabId,replyHandler){
            Browser.storage.get(replyHandler);
        });

        //BUG somebody need to call reply handler
        Browser.rpc.register('storage.set',function(st,tabId,replyHandler){
            Browser.storage.set(st);
            replyHandler();
        });
        Browser.rpc.register('storage.clear',function(){
            Browser.storage.clear();
        });

    }
    else{
        
        Browser.storage.get = function(cb) {
            Browser.rpc.call(null,'storage.get',null,cb);
        }

        Browser.storage.set = function(st) {
            Browser.rpc.call(null,'storage.set',[st]);
        }

        Browser.storage.clear = function() {
            Browser.rpc.call(null,'storage.clear');
        }

    }
}


//////////////////// gui ///////////////////////////
//
//
// Browser.gui.refreshIcon = function(tabId) {
// 	if(Browser._script == 'content') {
// 		// cannot do it in the content script, delegate to the main
// 		// in this case tabId can be null, the main script will get the tabId
// 		// from the rpc call

// 		Browser.rpc.call(null, 'refreshIcon');
// 		return;
// 	}

// 	Browser.rpc.call(tabId, "getIconInfo", [], function(info) {
// 		if(!info || info.hidden) {
// 			chrome.pageAction.hide(tabId);

// 		} else {
// 			chrome.pageAction.setIcon({
// 				tabId: tabId,
// 				path: {
// 					19: '/images/' + (info.private ? 'pin_19.png' : 'pin_disabled_19.png'),
// 					38: '/images/' + (info.private ? 'pin_38.png' : 'pin_disabled_38.png')
// 				}
// 			});
// 			chrome.pageAction.setTitle({
// 				tabId: tabId,
// 				title: info.title
// 			});
// 			chrome.pageAction.show(tabId);
// 		}
// 	});
// };

// Browser.gui.refreshAllIcons = function() {
// 	chrome.tabs.query({}, function(tabs) {
// 		for(var i = 0; i < tabs.length; i++)
// 			Browser.gui.refreshIcon(tabs[i].id);
// 	});
// };

// Browser.gui.showOptions = function(anchor) {
// 	var baseUrl = chrome.extension.getURL('html/options.html');
// 	var fullUrl = baseUrl + (anchor || '');

// 	chrome.tabs.query({ url: baseUrl }, function(tabs) {
// 		blog("tabs",tabs);
// 		if (tabs.length)
// 			chrome.tabs.update(tabs[0].id, { active: true, url: fullUrl });
// 		else
// 			chrome.tabs.create({ url: fullUrl });
// 	});
// };

// Browser.gui.getActiveTabUrl = function(handler) {
// 	chrome.tabs.query(
// 		{ active: true,               // Select active tabs
// 		  lastFocusedWindow: true     // In the current window
// 		}, function(tabs) {
// 			// there can be only one;
// 			// we call getUrl from the content script
// 			//
// 			Browser.rpc.call(tabs[0].id, 'getUrl', [], function(url) {
// 				handler(url);
// 			});
// 		}
// 	);
// };


// in chrome, apart from the current console, we also log to the background page, if possible and loaded
//
// Browser.log = function(a, b) {
// 	if(!Browser.debugging) return;

// 	console.log(a, b);

// 	var bp;
// 	if(chrome.extension && chrome.extension.getBackgroundPage)
// 		bp = chrome.extension.getBackgroundPage();

// 	if(bp && bp.console != console)		// avoid logging twice
// 		bp.console.log(a, b);
// }







if (typeof exports != "undefined") {
    exports.Browser = Browser;
}
