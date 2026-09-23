# AMO Listing Content — Draft

Copy-paste source for the addons.mozilla.org submission form. Everything here is
ready to paste as-is.
Firefox listing description only allows this HTML subset:
`<a href title> <abbr title> <acronym title> <b> <blockquote> <code> <em> <i> <li> <ol> <strong> <ul>`
(no `<p>`, no `<br>`) — the draft below only uses tags from that list.

## Name

ZenQR - QR Code Generator and Scanner

## Summary and Description

The paste-ready text lives in `promo/amo-listing-fields.txt` (same wording as
`promo/_locales/en-US/messages.json`, which `yarn update-listings` pushes for
the other locales). Keep them in sync — edit the locale JSON files, then copy
en-US into the fields file.

Wording rules the copy follows:
- Don't claim "no network requests". When a page image can't be read
  directly, `ImageScanner.js` reloads it from its original URL
  (`crossOrigin="anonymous"`, no cookies). Say "never sent to the developer
  or any third-party service" instead.
- The extension UI ships 10 locales (`src/_locales`). The 17 folders under
  `promo/_locales` are store-listing translations only.
- AMO turns line breaks inside text into `<br>`, so each `<li>` stays on one
  line.

## Categories

Suggested: **Privacy & Security** (primary — the whole pitch is
local-only/offline processing), **Other** (secondary). Verify against the
current AMO category list at submission time, since it varies by locale.

## Support

- Support site: `https://github.com/zenLoading/ZenQR/issues`
- License: MIT (already in `LICENSE`)
- Homepage/URL: `https://github.com/zenLoading/ZenQR`

## Privacy policy

ZenQR does not collect any data, and nothing you generate or scan is sent
to the developer or to any third party.

```
ZenQR Privacy Policy

ZenQR does not collect, transmit, sell, or share any personal data, and
has no servers of its own.

- All QR code generation and scanning happens locally in your browser.
- Generation/scan history is stored only in your browser's local storage
  (the "storage" permission) and never leaves your device. You can clear it
  at any time from the extension, or export/import it yourself as a JSON
  file.
- Camera access is optional and only requested when you choose to scan with
  your camera. Camera frames are processed locally and are never recorded,
  stored, or transmitted.
- When you scan an image on a web page and the extension can't read it
  directly, ZenQR reloads that image from the same web address the page
  uses, without cookies. This is the only network request ZenQR ever
  makes. It sends no data about you, and the decoded result stays in your
  browser.
- ZenQR has no analytics, telemetry, or tracking of any kind.
```

## Known validator warnings (not fixed, and not worth fixing)

The validator surfaces two more things worth pre-empting in reviewer notes:

- **"strict_min_version requires Firefox 126, which predates 140's support
  for data_collection_permissions."** Informational only. Firefox versions
  126-139 simply ignore the `data_collection_permissions` key (no error,
  no crash) and fall back to AMO's listing-page consent text instead of the
  new in-browser consent prompt. Bumping `strict_min_version` to 140 would
  just cut off real users on 126-139 for no functional gain, so it's left
  as-is.
- **"Unsafe assignment to innerHTML"** in `grant.js`, `picker.js`,
  `settings.js`, `batch.js`, `popup.js`. All of these come from one shared
  helper, `src/utils/i18n.js`'s `TT()`, which renders any locale message
  key ending in `_html` via Preact's `dangerouslySetInnerHTML`. This is
  used because some translated strings need an inline `<img>`/`<strong>`/
  `<kbd>` (e.g. "Right-click ... and choose 🖼 Scan QR Code in This Image").
  Every one of those `_html` strings is a static, developer-authored
  template in `src/_locales/*/messages.json` — none of them are built from
  page content, user text, or network responses. The one call site that
  passes a substitution (`PermissionPrompt.js`, the `$PERMISSION$`
  placeholder in `grant_permissions_instructions_html`) only ever
  substitutes another static, translated string
  (`grant_camera_permission_name`, e.g. "Access to your camera") — never
  anything dynamic or attacker-influenced. No rewrite was done since the
  content genuinely isn't user/DOM/network-controlled and a system-wide
  i18n rewrite is riskier than the warning it would silence; happy to
  follow up if a reviewer wants it removed anyway.

## Reviewer notes (paste into "Notes to reviewers")

```
This extension bundles code with webpack + Babel, so a source package is
attached per AMO's source code policy. Build instructions are in
SOURCE_BUILD.md at the root of the source package (also see README.md).

Two automated-validator warnings are expected and intentional, detailed
further below in this same submission's notes doc (promo/firefox-submission.md,
not included in the source zip) if useful:
- strict_min_version (126) predates data_collection_permissions support
  (140) — left as-is so users on 126-139 aren't cut off; the extension
  still works fine there, just without the new in-browser consent prompt.
- "Unsafe assignment to innerHTML" in grant.js/picker.js/settings.js/
  batch.js/popup.js: all from one i18n helper (src/utils/i18n.js `TT()`)
  rendering static, developer-authored `_html`-suffixed strings from
  src/_locales/*/messages.json (never user/page/network content).

Two files need context, since they aren't hand-written and look unusual to
read: src/opencv/opencv.js and src/opencv/opencv_js.wasm are a WebAssembly
build of OpenCV 4.11.0 + the wechat_qrcode module from opencv_contrib
4.11.0 (both Apache-2.0), used only for local, offline QR-code scanning.
Full provenance and the exact (included) build script are documented in
SOURCE_BUILD.md under "Third-party prebuilt binary".

Permissions used and why (also documented in README.md "Permissions"):
- activeTab: capture the active page for scanning
- menus: context menu entries (generate/scan)
- storage: local history + preferences persistence
- clipboardWrite: copy generated QR images/text
- scripting: inject the scan-region picker UI and read image data for
  "Scan QR Code in Image"
- camera (optional, requested at runtime): QR scanning via webcam

The extension sends no data anywhere and has no analytics/telemetry. The
only request it can make is in "Scan QR Code in This Image": if the page's
image can't be read directly (cross-origin, no CORS), ImageScanner.js loads
the same image URL again in a new <img crossOrigin="anonymous"> so it can
decode it locally. Non-English locale strings were machine-translated
(see README.md "Localization").
```

## Assets checklist

- [x] Icon: `src/icons/zenqr-128.png` (128x128 PNG, already built for the
      Chrome manifest) covers AMO's store-listing icon upload — AMO only
      requires a single icon, minimum 64x64, recommended 128x128.
- [x] Screenshots: generated via `node promo/generate-images.mjs` (requires
      `yarn` deps installed) — produces 1280x800 PNGs per locale under
      `promo/generated-images/<locale>/`. Use the `en-US` set for the
      primary listing: `promo-screenshot-1280x800-{generator,scanner,history}.png`.
      This is below AMO's 2400x1800 max but within its accepted range, so no
      further upscaling is needed. `promo/generated-images/` is gitignored
      (regenerate before each submission pass, don't commit it).

## Release build verification (last run 2026-09-12)

- `yarn eslint src` — clean
- `yarn webpack --mode production --env browser=firefox` — clean build,
  only expected bundle-size warnings (popup.js/batch.js/opencv assets)
- `npx web-ext lint --source-dir=dist/firefox` — 0 errors, 7 warnings, all
  matching the two categories pre-cleared above (version-gating note +
  the 5 static-i18n `innerHTML` warnings)
- `node scripts/locale-tools.mjs check` — 0 missing keys across all 9
  non-English locales (a handful of untranslated WPA/WEP acronyms only)
- `scripts/release.sh firefox` — produces
  `release/zenqr-v1.0.1-firefox-{release,source}.zip` from the current
  `git HEAD`; re-run this after any source change before uploading.
