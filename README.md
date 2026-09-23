# ZenQR

ZenQR is a browser extension for generating and scanning QR codes offline.

> This extension is not currently published on any browser's add-on store. You'll need to build and install it from source yourself.

## Features

- Generate QR code for current tab in popup.
- Generate QR code for selected link/text.
- Change error correction level of generated QR code.
- Scan QR codes in images.
- Keep track of generating and scanning history.

## Permissions

ZenQR requires the following permissions:

- Access to the active tab (`activeTab`): mandatory, enables capturing image of the active page for scanning
- Context menus (`menus`/`contextMenus`): mandatory, enables the context menu items
- Storage (`storage`): mandatory, enables preferences and history persistence on disk
- Clipboard write (`clipboardWrite`): mandatory, enables copying QR code images or text to clipboard
- Scripting (`scripting`): mandatory, enables script injection for the following scenarios:
  - When _Select region to scan.._ is chosen, a script need to be injected to the active page to load the "scan region picker" UI
  - When _Scan QR code in Image_ is chosen, a script need to be injected to the active page to retrieve the image data
- Camera access: optional, enables QR code scanning with camera

## Development

Prerequisites: yarn

1. Clone this repo and sync the submodules.
1. Run `yarn` to install dependencies.
1. Run `yarn dev` to watch source files and automatically build the add-on when they change.
1. Use your browser's "Load unpacked extension" feature to load the extension at
   `dist/{firefox,chrome}/manifest.json` in the project root.

Use the script in `/opencv` to update the pre-built OpenCV library and wasm.

## Building

Build steps (Linux or macOS):

1. Make sure you have `node`, `yarn`, and the `zip` command installed.
1. Open terminal and cd to project root.
1. Run `yarn release:firefox` or `yarn release:chrome` (which call `scripts/release.sh`). This will generate 2 files in the `release` directory: `zenqr-<version>-<browser>-release.zip`
   is the installable extension, and `zenqr-<version>-<browser>-source.zip` is the zipped source code.

The source zip is built from the committed `git HEAD`, so commit your changes before running the release script.

## Localization

As of now, translations for most of the languages are done by AI. You're welcome to help improve the translation or add your own translations, just submit a pull request.

## Credits

- [ZXing for JS](https://github.com/zxing-js/library) for generating QR code.
- [OpenCV + wechat_qrcode](https://docs.opencv.org/4.9.0/dd/d63/group__wechat__qrcode.html) for decoding QR code.
- [Javascript QR Code](https://addons.mozilla.org/zh-CN/firefox/addon/javascript-qr-code/) for the initial code base.

## License

MIT
