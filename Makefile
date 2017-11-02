
find = $(foreach dir,$(1),$(foreach d,$(wildcard $(dir)/*),$(call find,$(d),$(2))) $(wildcard $(dir)/$(strip $(2))))

export PATH := ./node_modules/.bin:$(PATH)	# in case web-ext is locally installed

FIREFOX ?= $(shell which firefox)
CHROME  ?= $(shell which google-chrome)
CVER     = $(shell grep -Po '(?<="version": ")[^"]*' src/chrome/manifest.json)
FVER     = $(shell grep -Po '(?<="version": ")[^"]*' src/firefox/manifest.json)


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

build-chrome: build/chrome
build-firefox: build/firefox
build-firefox-embedded: build/firefox-embedded

build/chrome: $(call find, src/common src/chrome, *)
	rm -rf build/chrome
	mkdir -p build/chrome
	cp -r src/common/* src/chrome/manifest.json build/chrome/

build/firefox: $(call find, src/common src/firefox, *)
	rm -rf build/firefox
	mkdir -p build/firefox
	cp -r src/common/* src/firefox/manifest.json build/firefox/

build/firefox-embedded: build/firefox
	rm -rf build/firefox-embedded
	mkdir -p build/firefox-embedded
	cp -r src/firefox/lib src/firefox/package.json build/firefox-embedded/
	cp -r build/firefox build/firefox-embedded/webextension


# package #############################################################

package-chrome:  build/location-guard-chrome-$(CVER).zip
package-firefox: build/location-guard-firefox-$(FVER).xpi
package-firefox-embedded: build/location-guard-firefox-embedded-$(FVER).xpi

build/location-guard-chrome-$(CVER).zip: build/chrome
	rm -f build/location-guard-chrome.zip
	(cd build/chrome && zip -r ../location-guard-chrome-$(CVER).zip .)

build/location-guard-firefox-$(FVER).xpi: build/firefox
	rm -f build/location-guard-firefox.xpi
	(cd build/firefox && zip -r ../location-guard-firefox-$(FVER).xpi .)

build/location-guard-firefox-embedded-$(FVER).xpi: build/firefox-embedded
	jpm xpi --addon-dir build/firefox-embedded
	@mv build/firefox-embedded/location-guard.xpi build/location-guard-firefox-embedded-$(FVER).xpi
	@touch build/location-guard-firefox-embedded-$(FVER).xpi		# get newer date than the folder


# test #################################################################

test-chrome: build/chrome
	@rm -rf /tmp/lg-chrome-profile
	$(CHROME) --load-extension=build/chrome/ --user-data-dir=/tmp/lg-chrome-profile --no-first-run --no-default-browser-check

test-firefox: build/firefox
	web-ext --source-dir build/firefox -f $(FIREFOX) run --browser-console

test-firefox-embedded: build/firefox-embedded
	jpm run --addon-dir build/firefox-embedded -b $(FIREFOX) --binary-args -jsconsole

test-firefox-android: build/location-guard-firefox-$(FVER).xpi
	adb push build/location-guard-firefox-$(FVER).xpi /mnt/sdcard/
	adb shell am start -a android.intent.action.VIEW -n org.mozilla.firefox/.App -d 'file:///mnt/sdcard/location-guard-firefox-$(FVER).xpi'

test-firefox-embedded-android: build/location-guard-firefox-embedded-$(FVER).xpi
	adb push build/location-guard-firefox-embedded-$(FVER).xpi /mnt/sdcard/
	adb shell am start -a android.intent.action.VIEW -n org.mozilla.firefox/.App -d 'file:///mnt/sdcard/location-guard-firefox-embedded-$(FVER).xpi'

