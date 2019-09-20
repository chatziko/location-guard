
find = $(foreach dir,$(1),$(foreach d,$(wildcard $(dir)/*),$(call find,$(d),$(2))) $(wildcard $(dir)/$(strip $(2))))

FIREFOX ?= $(shell which firefox)
CHROME  ?= $(shell which google-chrome)
OPERA   ?= $(shell which opera)
VER      = $(shell grep -Po '(?<="version": ")[^"]*' src/manifest.json)


default:
	@echo "\nbuilding:"
	@echo make build-chrome
	@echo make build-firefox
	@echo "\npackaging:"
	@echo make package-chrome
	@echo make package-firefox
	@echo "\ntesting:"
	@echo make [CHROME=/path/to/google-chrome] test-chrome
	@echo make [FIREFOX=/path/to/firefox] test-firefox
	@echo make test-firefox-android
	@echo

clean:
	rm -rf build/


# build ##############################################################

build-chrome: build/chrome/
build-opera: build/opera/
build-firefox: build/firefox/
build-edge: build/edge/

COMMON_MODULES = -x ./src/js/browser_base.js -x ./src/js/browser.js -x ./src/js/util.js -x ./src/js/laplace.js -x leaflet -x pelias-leaflet-plugin -x leaflet.locatecontrol -x intro.js -x jquery -x sglide

build/%/: $(call find, src, *)
	rm -rf $@
	mkdir -p $@
	cp -r src/* $@
	rm $@js/*

	# bundles with common modules
	npx browserify -r ./src/js/browser_base.js -r ./src/js/browser.js -r ./src/js/util.js -r ./src/js/laplace.js                        > $@js/common.js
	npx browserify -r leaflet -r pelias-leaflet-plugin -r leaflet.locatecontrol -r intro.js -r jquery -r sglide ./src/js/load-jquery.js > $@js/common-gui.js

	# entry points
	npx browserify $(COMMON_MODULES) ./src/js/main.js    > $@js/main.js
	npx browserify $(COMMON_MODULES) ./src/js/content.js > $@js/content.js
	npx browserify $(COMMON_MODULES) ./src/js/options.js > $@js/options.js
	npx browserify $(COMMON_MODULES) ./src/js/demo.js    > $@js/demo.js
	npx browserify $(COMMON_MODULES) ./src/js/popup.js   > $@js/popup.js
	npx browserify $(COMMON_MODULES) ./src/js/faq.js     > $@js/faq.js

	# copy module css/images
	cp -r node_modules/jquery-mobile-babel-safe/css/images node_modules/jquery-mobile-babel-safe/css/jquery.mobile-1.4.5.min.css $@css/
	cp -r node_modules/leaflet/dist/images                 node_modules/leaflet/dist/leaflet.css                                 $@css/
	cp -r node_modules/pelias-leaflet-plugin/dist/images   node_modules/pelias-leaflet-plugin/dist/leaflet-geocoder-mapzen.css   $@css/
	cp node_modules/intro.js/minified/introjs.min.css                                                                            $@css/

	cpp -P -Dis_$* src/manifest.json > $@manifest.json
	sed -i 's/%BUILD%/$*/' $@js/common.js


# package #############################################################

package-chrome:  build/location-guard-chrome-$(VER).zip
package-opera:   build/location-guard-opera-$(VER).zip
package-firefox: build/location-guard-firefox-$(VER).xpi
package-edge:    build/location-guard-edge-$(VER).zip

build/location-guard-%-$(VER).zip: build/%/
	rm -f build/location-guard-$*-$(VER).zip
	(cd build/$* && zip -r ../location-guard-$*-$(VER).zip .)

build/location-guard-%-$(VER).xpi: build/location-guard-%-$(VER).zip
	mv $< $@


# test #################################################################

test-chrome: build/chrome/
	@rm -rf /tmp/lg-chrome-profile
	$(CHROME) --load-extension=build/chrome/ --user-data-dir=/tmp/lg-chrome-profile --no-first-run --no-default-browser-check

test-opera: build/opera/
	@rm -rf /tmp/lg-opera-profile
	$(OPERA) --load-extension=build/opera/ --user-data-dir=/tmp/lg-opera-profile --no-first-run --no-default-browser-check

test-firefox: build/firefox/
	npx web-ext --source-dir build/firefox -f $(FIREFOX) run --browser-console

test-firefox-android: build/location-guard-firefox-$(VER).xpi
	adb push build/location-guard-firefox-$(VER).xpi /mnt/sdcard/
	adb shell am start -a android.intent.action.VIEW -n org.mozilla.firefox/.App -d 'file:///mnt/sdcard/location-guard-firefox-$(VER).xpi'

