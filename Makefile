CORE_DIR    := core
APP_DIR     := app
BINARY      := term-core
APP_NAME    := jebi
APP_BUNDLE  := $(APP_DIR)/dist/mac-arm64/$(APP_NAME).app
INSTALL_DIR := /Applications

.PHONY: all build build-core build-app deps install clean dev \
	release-build release-publish release-status release-clean guard-version

all: build

## deps: download pre-built llama.cpp binaries for the current architecture
deps:
	bash scripts/download-deps.sh

## build: compile Go core + package Electron app into jebi.app
build: deps build-core build-app

build-core:
	cd $(CORE_DIR) && go build -o $(BINARY) .

build-app:
	cd $(APP_DIR) && npm run build && npm run pack

## install: move jebi.app into /Applications
install:
	@if [ ! -d "$(APP_BUNDLE)" ]; then \
		echo "Run 'make build' first."; exit 1; \
	fi
	rm -rf "$(INSTALL_DIR)/$(APP_NAME).app"
	cp -r "$(APP_BUNDLE)" "$(INSTALL_DIR)/$(APP_NAME).app"
	@echo "Installed → $(INSTALL_DIR)/$(APP_NAME).app"

## dev: build Go core then start Electron dev server
dev: deps
	cd $(CORE_DIR) && go build -o $(BINARY) . && cd ../$(APP_DIR) && \
	{ [ -d node_modules ] && [ package.json -ot node_modules ] || npm install; } && \
	npm run dev

## clean: remove build artifacts
clean:
	rm -f $(CORE_DIR)/$(BINARY)
	rm -rf $(APP_DIR)/dist $(APP_DIR)/out

## --- Release (see docs/releasing.md) ---
RELEASE_OUTPUT_DIR := release-output
NOTARY_PROFILE      := jebi-notary
HOMEBREW_TAP_REPO   := git@github.com:jebi-sh/homebrew-tap.git

guard-version:
	@if [ -z "$(VERSION)" ]; then \
		echo "VERSION is required, e.g. make release-build VERSION=0.1.25"; exit 1; \
	fi

## release-build: build, sign, notarize, staple and package a release (VERSION=x.y.z required; RESUME_NOTARIZATION=1 to resume polling)
release-build: guard-version
	VERSION=$(VERSION) RESUME_NOTARIZATION=$(RESUME_NOTARIZATION) NOTARY_PROFILE=$(NOTARY_PROFILE) bash scripts/release-build.sh

## release-publish: tag, create GitHub release, upload assets, update Homebrew tap (VERSION=x.y.z required; RESUME=1, DRY_RUN=1 supported)
release-publish: guard-version
	VERSION=$(VERSION) RESUME=$(RESUME) DRY_RUN=$(DRY_RUN) HOMEBREW_TAP_REPO=$(HOMEBREW_TAP_REPO) bash scripts/release-publish.sh

## release-status: show build/notarization/publish status for VERSION
release-status: guard-version
	VERSION=$(VERSION) NOTARY_PROFILE=$(NOTARY_PROFILE) bash scripts/release-status.sh

## release-clean: remove build and release-output artifacts for VERSION
release-clean: guard-version
	rm -rf $(APP_DIR)/dist "$(RELEASE_OUTPUT_DIR)/$(VERSION)"
	@echo "Cleaned release artifacts for $(VERSION)"
