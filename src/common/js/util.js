/*! jsUri git 1aa9772347 | https://github.com/derek-watson/jsUri */
(function(e){function t(e){return e=decodeURIComponent(e),e=e.replace("+"," "),e}function n(e){var t=/^(?:(?![^:@]+:[^:@\/]*@)([^:\/?#.]+):)?(?:\/\/)?((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/,n=["source","protocol","authority","userInfo","user","password","host","port","relative","path","directory","file","query","anchor"],r=t.exec(e||""),i={};return n.forEach(function(e,t){i[e]=r[t]||""}),i}
function r(e){var t,n,r,i,s,o,u=[];if(typeof e=="undefined"||e===null||e==="")return u;e.indexOf("?")===0&&(e=e.substring(1)),n=e.toString().split(/[&;]/);for(t=0;t<n.length;t++)r=n[t],i=r.split("="),s=i[0],o=r.indexOf("=")===-1?null:i[1]===null?"":i[1],u.push([s,o]);return u}function i(e){this.uriParts=n(e),this.queryPairs=r(this.uriParts.query),this.hasAuthorityPrefixUserPref=null}Array.prototype.forEach||(Array.prototype.forEach=function(e,t){for(var n=0,r=this.length;n<r;++n)e.call(t||this,this[n],n,this)}),
["protocol","userInfo","host","port","path","anchor"].forEach(function(e){i.prototype[e]=function(t){return typeof t!="undefined"&&(this.uriParts[e]=t),this.uriParts[e]}}),i.prototype.hasAuthorityPrefix=function(e){return typeof e!="undefined"&&(this.hasAuthorityPrefixUserPref=e),this.hasAuthorityPrefixUserPref===null?this.uriParts.source.indexOf("//")!==-1:this.hasAuthorityPrefixUserPref},i.prototype.query=function(e){var t="",n,i;typeof e!="undefined"&&(this.queryPairs=r(e));for(n=0;n<this.queryPairs.length;n++)
i=this.queryPairs[n],t.length>0&&(t+="&"),i[1]===null?t+=i[0]:(t+=i[0],t+="=",i[1]&&(t+=encodeURIComponent(i[1])));return t.length>0?"?"+t:t},i.prototype.getQueryParamValue=function(e){var n,r;for(r=0;r<this.queryPairs.length;r++){n=this.queryPairs[r];if(t(e)===t(n[0]))return n[1]}},i.prototype.getQueryParamValues=function(e){var n=[],r,i;for(r=0;r<this.queryPairs.length;r++)i=this.queryPairs[r],t(e)===t(i[0])&&n.push(i[1]);return n},i.prototype.deleteQueryParam=function(e,n){var r=[],i,s,o,u;
for(i=0;i<this.queryPairs.length;i++)s=this.queryPairs[i],o=t(s[0])===t(e),u=t(s[1])===t(n),(arguments.length===1&&!o||arguments.length===2&&!o&&!u)&&r.push(s);return this.queryPairs=r,this},i.prototype.addQueryParam=function(e,t,n){return arguments.length===3&&n!==-1?(n=Math.min(n,this.queryPairs.length),this.queryPairs.splice(n,0,[e,t])):arguments.length>0&&this.queryPairs.push([e,t]),this},i.prototype.replaceQueryParam=function(e,n,r){var i=-1,s,o;if(arguments.length===3){for(s=0;s<this.queryPairs.length;s++)
{o=this.queryPairs[s];if(t(o[0])===t(e)&&decodeURIComponent(o[1])===t(r)){i=s;break}}this.deleteQueryParam(e,r).addQueryParam(e,n,i)}else{for(s=0;s<this.queryPairs.length;s++){o=this.queryPairs[s];if(t(o[0])===t(e)){i=s;break}}this.deleteQueryParam(e),this.addQueryParam(e,n,i)}return this},["protocol","hasAuthorityPrefix","userInfo","host","port","path","query","anchor"].forEach(function(e){var t="set"+e.charAt(0).toUpperCase()+e.slice(1);i.prototype[t]=function(t){return this[e](t),this}}),i.prototype.scheme=
function(){var e="";return this.protocol()?(e+=this.protocol(),this.protocol().indexOf(":")!==this.protocol().length-1&&(e+=":"),e+="//"):this.hasAuthorityPrefix()&&this.host()&&(e+="//"),e},i.prototype.origin=function(){var e=this.scheme();return this.userInfo()&&this.host()&&(e+=this.userInfo(),this.userInfo().indexOf("@")!==this.userInfo().length-1&&(e+="@")),this.host()&&(e+=this.host(),this.port()&&(e+=":"+this.port())),e},i.prototype.toString=function(){var e=this.origin();return this.path()?e+=this.path():this.host()
&&(this.query().toString()||this.anchor())&&(e+="/"),this.query().toString()&&(this.query().toString().indexOf("?")!==0&&(e+="?"),e+=this.query().toString()),this.anchor()&&(this.anchor().indexOf("#")!==0&&(e+="#"),e+=this.anchor()),e},i.prototype.clone=function(){return new i(this.toString())},// typeof module=="undefined"?
             e.Uri=i// :module.exports=i
            })(this);


// utility class, loaded in various places
//
// It should contain only browser-independent functions, browser-specific
// functionality should go to browser/*.js
//

// if exports/require are not available, implement them using a global namespace
// (Firefox's main script provides exports/require, but Chrome and Firefox's
// non-main scripts use a global namespace)
//
if(typeof exports == 'undefined') {
	exports = {};

	require = function(name) {
		return exports;
	}
}

var _Util = {
	extractDomain: function(url) {
		return new Uri(url).host();
	},
	extractAnchor: function(url) {
		return new Uri(url).anchor();
	},
	clone: function(obj) {
		return JSON.parse(JSON.stringify(obj));
	},

	// Get icon information for a specific tabId. Returns:
	//   { hidden:   true if the icon should be hidden,
	//     private:  true if we are in a private mode,
	//     title:    icon's title }
	//
	// Note: we have this method here (instead of inside the content script) so
	//       that the rpc call and the storage access are serialized, instead of nested.
	//       Firefox has issues with nested calls (we should fix this at some point)
	//
	getIconInfo: function(tabId, handler) {
		var Browser = require("browser").Browser;

		Browser.rpc.call(tabId, 'getState', [], function(state) {
			if(!state) {
				// this is not a tab with content script loaded, hide icon
				handler({ hidden: true, private: false, title: "" });
				return;
			}

			Browser.storage.get(function(st) {
				var domain = _Util.extractDomain(state.url);
				var level = st.domainLevel[domain] || st.defaultLevel;

				var info = {
					hidden:  st.hideIcon || !state.apiCalled,
					private: !st.paused && level != 'real',
					title:
						st.paused		? "Location Guard is paused" :
						level == 'real'	? "Using your real location" :
						level == 'fixed'? "Using a fixed location" :
						"Privacy level: " + level
				};
				handler(info);
			});
		});
	},

	events: {
		_listeners: {},

		addListener: function(name, fun) {
			if(!this._listeners[name])
				this._listeners[name] = [];
			this._listeners[name].push(fun);
		},

		fire: function(name) {
			var list = this._listeners[name];
			if(!list) return;

			for(var i = 0; i < list.length; i++)
				list[i]();
		}
	}
};

exports.Util = _Util;
