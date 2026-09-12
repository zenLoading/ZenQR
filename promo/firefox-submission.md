# AMO Listing Content — Draft

Copy-paste source for the addons.mozilla.org submission form. Fill in the
`[ ]` placeholders before submitting; everything else is ready to paste as-is.
Firefox listing description only allows this HTML subset:
`<a href title> <abbr title> <acronym title> <b> <blockquote> <code> <em> <i> <li> <ol> <strong> <ul>`
(no `<p>`, no `<br>`) — the draft below only uses tags from that list.

## Name

QRCraft - QR Code Generator and Scanner

## Summary (short, ~250 chars max)

Generate and scan QR codes entirely offline — no accounts, no tracking, no
network requests. Create codes for links, text, WiFi, contacts, and more;
scan from images, a screen region, or your camera.

## Description

```html
QRCraft generates and scans QR codes without ever sending your data
anywhere — everything runs locally in your browser.

<b>Generate</b>
<ul>
  <li>QR code for the current tab, a selected link, or any text you type</li>
  <li>Templates for WiFi networks, contact cards (vCard), email, SMS, phone
  numbers, and calendar events</li>
  <li>Batch-generate many QR codes at once, one per line of text</li>
  <li>Adjustable error correction level, image size, finder/module style,
  and an optional embedded logo</li>
</ul>

<b>Scan</b>
<ul>
  <li>Scan a QR code in any image via the right-click context menu</li>
  <li>Select a region of the page to scan</li>
  <li>Scan with your camera (optional permission, only requested if you use
  this feature)</li>
</ul>

<b>Other features</b>
<ul>
  <li>History of everything you've generated or scanned, with import/export
  to a JSON file</li>
  <li>Fully offline: no network requests, no third-party services, no
  analytics</li>
  <li>Available in 17 languages</li>
</ul>

Source code: <a href="https://github.com/zenLoading/QRCraft">github.com/zenLoading/QRCraft</a>
```

## Categories

Suggested: **Privacy & Security** (primary — the whole pitch is
local-only/offline processing), **Other** (secondary). Verify against the
current AMO category list at submission time, since it varies by locale.

## Support

- Support site: `https://github.com/zenLoading/QRCraft/issues`
- License: MIT (already in `LICENSE`)
- Homepage/URL: `https://github.com/zenLoading/QRCraft`

## Privacy policy

QRCraft does not collect, transmit, or store any data outside your own
browser.

```
QRCraft Privacy Policy

QRCraft does not collect, transmit, sell, or share any personal data, and
has no servers of its own.

- All QR code generation and scanning happens locally in your browser.
- Generation/scan history is stored only in your browser's local storage
  (the "storage" permission) and never leaves your device. You can clear it
  at any time from the extension, or export/import it yourself as a JSON
  file.
- Camera access is optional and only requested when you choose to scan with
  your camera. Camera frames are processed locally and are never recorded,
  stored, or transmitted.
- QRCraft makes no network requests to any server, first-party or
  third-party, and includes no analytics or tracking of any kind.
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

No network requests are made anywhere in the extension; there is no
analytics/telemetry. Non-English locale strings were machine-translated
(see README.md "Localization").
```

## Assets checklist — gap found, not yet automated

`promo/generate-images.mjs` currently only renders Chrome/Edge-sized
marketing images (440x280 promo tile, 1400x560 marquee, 1280x800
screenshots). AMO's listing wants:

- [ ] Icon: 32x32 / 64x64 / 128x128 PNG (the manifest itself only ships a
      16/48 SVG for the toolbar button — the *store listing* icon is a
      separate upload and needs a raster version; `src/icons/qrlite-128.png`
      used for Chrome may already work at 128, but 32/64 aren't generated)
- [ ] Screenshots: 2400x1800 (AMO's recommended/max size) — the existing
      `promo/image-source/promo-screenshot-1280x800.html` template renders at
      1280x800 for Chrome; either upscale that template's puppeteer viewport
      config for a Firefox-sized pass, or accept a smaller size (AMO accepts
      screenshots below 2400x1800, just not above).

This wasn't built out here since it's a separate image-pipeline change, not
a text/doc gap — flagging so it doesn't get missed before upload.
