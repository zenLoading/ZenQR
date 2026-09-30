// Smoke test for the Firefox build (dist/firefox), run with `yarn test:firefox`.
//
// Loads the extension into the locally installed Firefox via puppeteer
// (WebDriver BiDi) and checks the behavior that depends on Firefox's
// non-persistent event page:
// - state handed between extension contexts survives the event page suspending
// - region scanning captures in the background and decodes in the picker page
//
// Firefox fires no error/unhandledrejection events in the event page (errors
// only reach the browser console), so unlike the Chrome test this one can't
// assert on background errors; check about:debugging's console by hand.
//
// Set FIREFOX_BIN to use a Firefox other than /Applications/Firefox.app.
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer";
import { BarcodeFormat, QRCodeWriter } from "@zxing/library";

const DIST_DIR = path.resolve("dist/firefox");
const FIREFOX_BIN =
  process.env.FIREFOX_BIN || "/Applications/Firefox.app/Contents/MacOS/firefox";
const FAILURE_SCREENSHOT = path.resolve(".local/firefox-smoke-failure.png");
const ADDON_ID = "zenqr@zenloading";
// Pinned so the test can open moz-extension:// pages without looking it up.
const EXT_UUID = "5f0c2f6e-8f7a-4c1e-9d0b-7a2e3c4d5e6f";
const EXT_ORIGIN = `moz-extension://${EXT_UUID}`;
const QR_TEXT = "https://example.com/zenqr-smoke";
const QR_CELL_PX = 8;
const QR_QUIET_ZONE = 4;
const QR_OFFSET_PX = 100;
// Firefox suspends an idle event page after this long (default 30s).
const BG_IDLE_TIMEOUT_S = 2;
const BG_SUSPEND_WAIT_MS = (BG_IDLE_TIMEOUT_S + 2) * 1000;
const DECODER_WARMUP_MS = 1500;
const SCAN_TIMEOUT_MS = 15000;

const results = [];
function check(name, isOk, detail = "") {
  results.push({ name, isOk });
  const suffix = detail ? `  — ${detail}` : "";
  console.log(`${isOk ? "PASS" : "FAIL"}  ${name}${suffix}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function renderQrSvg(text) {
  const matrix = new QRCodeWriter().encode(
    text,
    BarcodeFormat.QR_CODE,
    0,
    0,
    new Map()
  );
  const size = (matrix.getWidth() + QR_QUIET_ZONE * 2) * QR_CELL_PX;
  const rects = [];
  for (let y = 0; y < matrix.getHeight(); y++) {
    for (let x = 0; x < matrix.getWidth(); x++) {
      if (matrix.get(x, y)) {
        const px = (x + QR_QUIET_ZONE) * QR_CELL_PX;
        const py = (y + QR_QUIET_ZONE) * QR_CELL_PX;
        rects.push(
          `<rect x="${px}" y="${py}" width="${QR_CELL_PX}" height="${QR_CELL_PX}"/>`
        );
      }
    }
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
    `<rect width="100%" height="100%" fill="#fff"/>${rects.join("")}</svg>`;
  return { size, svg };
}

const TEST_HOOK_FILE = "smoke-test-hook.js";
// WebDriver BiDi refuses to navigate to moz-extension:// URLs, so the test
// copy opens its own settings page once, on install, for the test to drive.
const TEST_HOOK_SOURCE = `browser.runtime.onInstalled.addListener(() => {
  browser.tabs.create({ url: "pages/settings.html" });
});`;

/**
 * Copies the build, adds the test hook, and grants host access: `activeTab`
 * is only granted by a real user gesture (toolbar click, shortcut, context
 * menu), which puppeteer can't produce, and `tabs.captureVisibleTab` needs
 * one or the other.
 */
function prepareTestExtension() {
  if (!fs.existsSync(path.join(DIST_DIR, "manifest.json"))) {
    throw new Error(`${DIST_DIR} not found, build the Firefox variant first`);
  }
  const extDir = fs.mkdtempSync(path.join(os.tmpdir(), "zenqr-firefox-"));
  fs.cpSync(DIST_DIR, extDir, { recursive: true });
  const manifestPath = path.join(extDir, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  fs.writeFileSync(path.join(extDir, TEST_HOOK_FILE), TEST_HOOK_SOURCE);
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({
      ...manifest,
      host_permissions: ["<all_urls>"],
      background: {
        ...manifest.background,
        scripts: [...manifest.background.scripts, TEST_HOOK_FILE],
      },
    })
  );
  return extDir;
}

async function startQrPageServer(svg) {
  const html =
    `<!doctype html><body style="margin:0;background:#eee">` +
    `<div style="position:absolute;left:${QR_OFFSET_PX}px;top:${QR_OFFSET_PX}px">${svg}</div></body>`;
  const server = http.createServer((req, res) => {
    res.setHeader("content-type", "text/html");
    res.end(html);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}/` };
}

const EXT_PAGE_POLL_MS = 200;
const EXT_PAGE_TIMEOUT_MS = 20000;

/**
 * Finds the settings page opened by the test hook. Puppeteer reports
 * extension tabs as about:blank over BiDi, so ask each page where it is.
 */
async function findExtPage(browser) {
  const settingsUrl = `${EXT_ORIGIN}/pages/settings.html`;
  const deadline = Date.now() + EXT_PAGE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    for (const page of await browser.pages()) {
      const href = await page
        .evaluate(() => location.href)
        .catch(() => null);
      if (href === settingsUrl) {
        return page;
      }
    }
    await sleep(EXT_PAGE_POLL_MS);
  }
  throw new Error(`${settingsUrl} did not open`);
}

/**
 * Tags the current event page instance. `getBackgroundPage()` wakes a
 * suspended event page, so a missing tag afterwards means it was restarted.
 */
async function tagBackground(extPage) {
  const tag = String(Math.random());
  await extPage.evaluate(async (t) => {
    const bg = await browser.runtime.getBackgroundPage();
    bg.__zenqrSmokeTag = t;
  }, tag);
  return tag;
}

async function waitForSuspend(extPage, tag) {
  await sleep(BG_SUSPEND_WAIT_MS);
  const current = await extPage.evaluate(async () => {
    const bg = await browser.runtime.getBackgroundPage();
    return bg.__zenqrSmokeTag ?? null;
  });
  return current !== tag;
}

async function testStateSurvivesSuspend(extPage) {
  const send = (message) =>
    extPage.evaluate((m) => browser.runtime.sendMessage(m), message);

  await extPage.evaluate(() =>
    browser.storage.session.set({
      bgPopupOptions: { action: "POPUP_ENCODE", text: "hello" },
    })
  );
  const tag = await tagBackground(extPage);
  check("event page suspends when idle", await waitForSuspend(extPage, tag));

  const options = await send({ action: "POPUP_GET_OPTIONS" });
  check(
    "popup options survive suspend",
    options?.text === "hello",
    JSON.stringify(options)
  );
  const optionsAgain = await send({ action: "POPUP_GET_OPTIONS" });
  check("popup options are consumed once", optionsAgain === null);

  const pickerUrl = await send({ action: "BG_GET_PICKER_URL" });
  const secret = new URL(pickerUrl).searchParams.get("secret");
  await waitForSuspend(extPage, await tagBackground(extPage));
  const validate = (s) =>
    send({ action: "BG_VALIDATE_PICKER_SECRET", secret: s });
  check("picker secret survives suspend", (await validate(secret)) === true);
  check("picker secret is single-use", (await validate(secret)) === false);
  check(
    "unknown picker secret is rejected",
    (await validate("bogus")) === false
  );
}

async function testRegionScan(browser, extPage, qrPage) {

  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 800 });
  await page.goto(qrPage.url);
  await page.bringToFront();

  // Same injection as injectPickerLoader() in background.js. The file path is
  // absolute because Firefox resolves it against the calling page.
  await extPage.evaluate(async (url) => {
    // Firefox match patterns can't carry the test server's port.
    const tab = (await browser.tabs.query({})).find((t) => t.url === url);
    const target = { tabId: tab.id };
    await browser.scripting.executeScript({
      files: ["/content_scripts/picker-loader.js"],
      target,
    });
    await browser.scripting.executeScript({
      func: (options) => window.loadPickerLoader(options),
      args: [{ openUrlMode: "NO_OPEN", pauseVideos: false }],
      target,
    });
  }, qrPage.url);

  const frame = await (await page.waitForSelector("iframe")).contentFrame();
  await frame.waitForFunction(() => document.body?.children.length > 0);
  await sleep(DECODER_WARMUP_MS);

  const center = QR_OFFSET_PX + qrPage.size / 2;
  await page.mouse.move(center - 20, center - 20);
  await page.mouse.move(center, center, { steps: 5 });
  // Grow the scan spot so the whole code, quiet zone included, fits inside.
  for (let i = 0; i < 12; i++) {
    await page.mouse.wheel({ deltaY: -100 });
  }
  await page.mouse.click(center, center);

  const decoded = await frame
    .waitForFunction(() => document.querySelector("textarea")?.value, {
      timeout: SCAN_TIMEOUT_MS,
    })
    .then((handle) => handle.jsonValue())
    .catch(() => null);
  check(
    "region scan decodes the QR code",
    decoded === QR_TEXT,
    decoded ?? "no result"
  );

  const stored = await extPage.evaluate(() => browser.storage.local.get(null));
  check(
    "scan is recorded in history",
    JSON.stringify(stored).includes(QR_TEXT)
  );

  if (decoded !== QR_TEXT) {
    fs.mkdirSync(path.dirname(FAILURE_SCREENSHOT), { recursive: true });
    await page.screenshot({ path: FAILURE_SCREENSHOT });
    console.log(`screenshot saved to ${FAILURE_SCREENSHOT}`);
  }
  await page.close();
}

async function main() {
  const extDir = prepareTestExtension();
  const qr = renderQrSvg(QR_TEXT);
  const { server, url } = await startQrPageServer(qr.svg);
  const browser = await puppeteer.launch({
    browser: "firefox",
    executablePath: FIREFOX_BIN,
    headless: true,
    // Needed to run scripts in moz-extension:// pages.
    args: ["-remote-allow-system-access"],
    extraPrefsFirefox: {
      "extensions.background.idle.timeout": BG_IDLE_TIMEOUT_S,
      "extensions.webextensions.uuids": JSON.stringify({
        [ADDON_ID]: EXT_UUID,
      }),
    },
  });
  try {
    check("Firefox version", true, await browser.version());
    const addonId = await browser.installExtension(extDir);
    check("extension installs", addonId === ADDON_ID, addonId);

    const extPage = await findExtPage(browser);
    await testStateSurvivesSuspend(extPage);
    await testRegionScan(browser, extPage, { url, size: qr.size });
  } finally {
    await browser.close();
    server.close();
    fs.rmSync(extDir, { recursive: true, force: true });
  }

  const failed = results.filter((r) => !r.isOk).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exitCode = failed ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
