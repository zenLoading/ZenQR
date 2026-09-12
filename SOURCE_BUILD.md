# Building QRCraft from Source

QRCraft's shipped code goes through Babel transpilation and webpack module
bundling, which Mozilla's add-on policies classify as "machine-generated"
code. This file is the build documentation required by AMO's
[source code submission](https://extensionworkshop.com/documentation/publish/source-code-submission/)
policy: it explains how to reproduce `dist/firefox/` from this source tree.

## Build environment used for the submitted build

- OS: macOS 26.6.2 (Darwin 25.6.0)
- Node.js: v24.13.0
- Package manager: Yarn Classic v1.22.22 (see `yarn.lock`, header `# yarn lockfile v1`)
- All dependencies are resolved from the public npm registry via `yarn.lock`.
  No private registries, no build-time downloads other than `npm`/`yarn`
  fetching packages, no postinstall scripts that reach the network.

If you use a different Node/Yarn version and get a different result, please
try the versions above first before assuming a discrepancy is meaningful.

## Steps to reproduce `dist/firefox`

```sh
# 1. Install dependencies (exact versions pinned by yarn.lock)
yarn install --frozen-lockfile

# 2. Lint (optional, does not affect output, but is run before every release)
yarn run eslint src

# 3. Production build for Firefox
yarn run webpack --mode production --env browser=firefox
```

Step 3 is the exact command `scripts/release.sh firefox` runs (see that file).
The result appears in `dist/firefox/` and is what gets zipped into the
uploaded release package.

## Third-party prebuilt binary: `src/opencv/opencv.js` + `src/opencv/opencv_js.wasm`

These two files are not hand-written and not meant to be read as this
extension's own logic — they are a WebAssembly build of OpenCV, produced by
the open-source Emscripten toolchain, not an obfuscated bundle of QRCraft
code.

- Upstream source: [opencv/opencv](https://github.com/opencv/opencv) and
  [opencv/opencv_contrib](https://github.com/opencv/opencv_contrib), both
  pinned to tag `4.11.0` (Apache-2.0 license), with the contrib repo patched
  by the included `opencv/opencv_contrib.patch` to build the `wechat_qrcode`
  detector module.
- Build script: `opencv/build_opencv_wasm.sh`, included verbatim in this
  source package. It clones the two repositories above at the pinned commit,
  applies the patch, and invokes OpenCV's own
  `platforms/js/build_js.py` under `emcmake` to produce
  `opencv.js` / `opencv_js.wasm` and the `wechat_qrcode` model files.
- This script requires [Emscripten/emsdk](https://emscripten.org) (open
  source) and is a heavyweight native-toolchain build, so it is intentionally
  **not** part of `yarn install`/`yarn build`/`scripts/release.sh`. The
  output is built once, committed under `src/opencv/`, and copied into the
  extension bundle by webpack's `CopyPlugin` (see the `opencv_js.wasm` /
  `models/*` entries in `webpack.config.mjs`).
- At runtime this code only reads the bundled model files under
  `src/opencv/models/*` (also produced by `build_opencv_wasm.sh`, copied
  verbatim) — it makes no network requests.

## Other build-time transforms

- SVG icons under `src/icons/*.svg` are passed through
  [SVGO](https://github.com/svg/svgo) (open source, listed as a
  devDependency) during the webpack copy step, purely to strip metadata and
  whitespace. This is why built icons differ slightly, byte-for-byte, from
  the sources in `src/icons/`.
- `.js`/`.jsx` sources are transpiled with Babel (`@babel/preset-env`,
  `@babel/plugin-transform-react-jsx`, see `babel.config.json`) and bundled
  with webpack 5 (see `webpack.config.mjs`).

## Notes for reviewers

- There are no analytics, telemetry, or third-party network calls anywhere
  in this extension. The only network-adjacent code is `fetch()` calls
  against `self`/`data:`/local extension resources (see
  `src/utils/qrcode.js` and `src/utils/misc.js`); nothing is ever sent to a
  remote server.
- Permission usage is documented in `README.md` under "Permissions".
- Locale strings under `src/_locales/*` other than `en` are machine
  translated; see `README.md` under "Localization".
