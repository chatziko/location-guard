
find = $(foreach dir,$(1),$(foreach d,$(wildcard $(dir)/*),$(call find,$(d),$(2))) $(wildcard $(dir)/$(strip $(2))))

export PATH := ./node_modules/.bin:$(PATH)	# in case web-ext is locally installed

FIREFOX ?= $(shell which firefox)
CHROME  ?= $(shell which google-chrome)
OPERA   ?= $(shell which opera)
VER      = $(shell grep -Po '(?<="version": ")[^"]*' src/common/manifest.json)


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

build/%/: $(call find, src/common, *)
	rm -rf $@
	mkdir -p $@
	cp -r src/common/* $@
	cpp -P -Dis_$* src/common/manifest.json > $@manifest.json


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
	web-ext --source-dir build/firefox -f $(FIREFOX) run --browser-console

test-firefox-android: build/location-guard-firefox-$(VER).xpi
	adb push build/location-guard-firefox-$(VER).xpi /mnt/sdcard/
	adb shell am start -a android.intent.action.VIEW -n org.mozilla.firefox/.App -d 'file:///mnt/sdcard/location-guard-firefox-$(VER).xpi'

