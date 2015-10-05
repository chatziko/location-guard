// https://gist.github.com/Gozala/3488498
// Usage example: require('resource').set('projectname', data.url('index.html'));
// then navigate to "resource://projectname" equals "resource:///index.html"
//
/*jshint asi:true globalstrict:true*/

'use strict';

let { Cc, Ci } = require('chrome')
let ioService = Cc['@mozilla.org/network/io-service;1'].
                getService(Ci.nsIIOService)
let resourceHandler = ioService.getProtocolHandler('resource').
                        QueryInterface(Ci.nsIResProtocolHandler)


function get(root) {
  /**
  Gets the substitution for the `root` key.
  **/
  try { return resourceHandler.getSubstitution(root).spec }
  catch (error) { return null }
}
exports.get = get

function has(root) {
  /**
  Returns `true` if the substitution exists and `false` otherwise.
  **/
  return resourceHandler.hasSubstitution(root)
}
exports.get = get

function set(root, uri) {
  /**
  Sets the substitution for the root key:

      resource://root/path ==> baseURI.resolve(path)

  A `null` `uri` removes substitution. A root key should
  always be lowercase. However, this may not be enforced.
  **/
  uri = !uri ? null :
        uri instanceof Ci.nsIURI ? uri :
        ioService.newURI(uri, null, null)
  resourceHandler.setSubstitution(root, uri)
}
exports.set = set
