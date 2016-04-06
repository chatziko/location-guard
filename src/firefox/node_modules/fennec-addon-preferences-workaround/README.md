# fennec-addon-preferences-workaround

This repo contains an npm package which can be used as a dependency in a Firefox Addon based on the
Addon SDK and built with the jpm tool.

The goal of this module is to workaround an issue with the rendering of the addon preferences on Android.

## Usage

In your SDK addon, install the package as a dependency:

```
$ npm install --save rpl/fennec-addon-preferences-workaround
```

and in your main module, require the module to activate the workaround:

```js
require('fennec-addon-preferences-workaround');
// and then do all your stuff
// ...
```

## Related Bugzilla Issues

- [Bug 1243467 - JPM xpi - Error when addon options should appear](https://bugzilla.mozilla.org/show_bug.cgi?id=1243467)
- [Bug 1167246 - Addon simple preferences do not appear in addons manager on Android using JPM](https://bugzilla.mozilla.org/show_bug.cgi?id=1167246)
