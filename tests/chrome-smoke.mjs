// Smoke test for the Chrome build (dist/chrome), run with `yarn test:chrome`.
//
// Loads the extension into Chrome for Testing via puppeteer and checks the
// behavior that depends on Chrome's non-persistent service worker:
// - state handed between extension contexts survives the worker being stopped
// - region scanning captures in the background and decodes in the picker page
//
// First run: `npx puppeteer browsers install chrome` (branded Chrome no longer
// allows loading unpacked extensions from the command line).
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer";
import { BarcodeFormat, QRCodeWriter } from "@zxing/library";

const DIST_DIR = path.resolve("dist/chrome");
const FAILURE_SCREENSHOT = path.resolve(".local/chrome-smoke-failure.png");
const QR_TEXT = "https://example.com/zenqr-smoke";
const QR_CELL_PX = 8;
const QR_QUIET_ZONE = 4;
const QR_OFFSET_PX = 100;
// Time Chrome needs to actually tear the worker down after stopAllWorkers.
const WORKER_STOP_SETTLE_MS = 500;
const DECODER_WARMUP_MS = 1500;
const SCAN_TIMEOUT_MS = 15000;
// Time for the background to attempt (and fail) injecting into the page.
const RESTRICTED_PAGE_SETTLE_MS = 1000;

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

/**
 * Copies the build and grants host access: `activeTab` is only granted by a
 * real user gesture (toolbar click, shortcut, context menu), which puppeteer
 * can't produce, and `tabs.captureVisibleTab` needs one or the other.
 */
function prepareTestExtension() {
  if (!fs.existsSync(path.join(DIST_DIR, "manifest.json"))) {
    throw new Error(`${DIST_DIR} not found, build the Chrome variant first`);
  }
  const extDir = fs.mkdtempSync(path.join(os.tmpdir(), "zenqr-chrome-"));
  fs.cpSync(DIST_DIR, extDir, { recursive: true });
  const manifestPath = path.join(extDir, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({ ...manifest, host_permissions: ["<all_urls>"] })
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

const isBackgroundWorker = (target) =>
  target.type() === "service_worker" && target.url().endsWith("/background.js");

/**
 * Note: never attach to the worker (`target.worker()`) before stopping it —
 * stopping a worker DevTools is attached to crashes Chrome for Testing.
 */
async function testStateSurvivesWorkerRestart(browser, extId) {
  const extPage = await browser.newPage();
  await extPage.goto(`chrome-extension://${extId}/pages/settings.html`);
  const cdp = await extPage.createCDPSession();
  await cdp.send("ServiceWorker.enable");
  const stopWorker = async () => {
    await cdp.send("ServiceWorker.stopAllWorkers");
    await sleep(WORKER_STOP_SETTLE_MS);
  };
  const send = (message) =>
    extPage.evaluate((m) => chrome.runtime.sendMessage(m), message);

  await extPage.evaluate(() =>
    chrome.storage.session.set({
      bgPopupOptions: { action: "POPUP_ENCODE", text: "hello" },
    })
  );
  await stopWorker();
  const options = await send({ action: "POPUP_GET_OPTIONS" });
  check(
    "popup options survive worker restart",
    options?.text === "hello",
    JSON.stringify(options)
  );
  const optionsAgain = await send({ action: "POPUP_GET_OPTIONS" });
  check("popup options are consumed once", optionsAgain === null);

  const pickerUrl = await send({ action: "BG_GET_PICKER_URL" });
  const secret = new URL(pickerUrl).searchParams.get("secret");
  await stopWorker();
  const validate = (s) =>
    send({ action: "BG_VALIDATE_PICKER_SECRET", secret: s });
  check(
    "picker secret survives worker restart",
    (await validate(secret)) === true
  );
  check("picker secret is single-use", (await validate(secret)) === false);
  check(
    "unknown picker secret is rejected",
    (await validate("bogus")) === false
  );

  await extPage.close();
}

async function testRegionScan(browser, qrPage, workerErrors) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 800 });
  await page.goto(qrPage.url);
  await page.bringToFront();

  const workerTarget = await browser.waitForTarget(isBackgroundWorker);
  const worker = await workerTarget.worker();
  worker.on("console", (msg) => {
    if (msg.type() === "error") workerErrors.push(msg.text());
  });
  // Same injection as injectPickerLoader() in background.js.
  await worker.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url });
    const target = { tabId: tab.id };
    await chrome.scripting.executeScript({
      files: ["content_scripts/picker-loader.js"],
      target,
    });
    await chrome.scripting.executeScript({
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

  const stored = await worker.evaluate(() => chrome.storage.local.get(null));
  check(
    "scan is recorded in history",
    JSON.stringify(stored).includes(QR_TEXT)
  );

  if (decoded !== QR_TEXT) {
    fs.mkdirSync(path.dirname(FAILURE_SCREENSHOT), { recursive: true });
    await page.screenshot({ path: FAILURE_SCREENSHOT });
    console.log(`screenshot saved to ${FAILURE_SCREENSHOT}`);
  }
}

/**
 * Browsers forbid scripting their own pages (chrome://, the Web Store, other
 * extensions), so asking for a region scan there must fail quietly instead of
 * leaving an uncaught rejection on the extension's error page.
 */
async function testRegionScanOnRestrictedPage(browser, extId) {
  const workerTarget = await browser.waitForTarget(isBackgroundWorker);
  const cdp = await workerTarget.createCDPSession();
  const exceptions = [];
  cdp.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
    exceptions.push(
      exceptionDetails.exception?.description || exceptionDetails.text
    );
  });
  await cdp.send("Runtime.enable");

  const extPage = await browser.newPage();
  await extPage.goto(`chrome-extension://${extId}/pages/settings.html`);
  const restrictedPage = await browser.newPage();
  await restrictedPage.goto("chrome://version");
  await restrictedPage.bringToFront();

  // What the popup's "scan region" button sends.
  await extPage.evaluate(() =>
    chrome.runtime.sendMessage({ action: "BG_INJECT_PICKER_LOADER" })
  );
  await sleep(RESTRICTED_PAGE_SETTLE_MS);
  check(
    "region scan on chrome:// page throws no uncaught error",
    exceptions.length === 0,
    exceptions.join(" | ")
  );

  await cdp.detach();
  await restrictedPage.close();
  await extPage.close();
}

async function main() {
  const extDir = prepareTestExtension();
  const qr = renderQrSvg(QR_TEXT);
  const { server, url } = await startQrPageServer(qr.svg);
  const browser = await puppeteer.launch({
    headless: true,
    enableExtensions: [extDir],
    pipe: true,
  });
  const workerErrors = [];
  try {
    const workerTarget = await browser.waitForTarget(isBackgroundWorker);
    const extId = new URL(workerTarget.url()).host;
    check("service worker starts", Boolean(extId), extId);

    await testStateSurvivesWorkerRestart(browser, extId);
    await testRegionScan(browser, { url, size: qr.size }, workerErrors);
    await testRegionScanOnRestrictedPage(browser, extId);
    check(
      "no service worker console errors",
      workerErrors.length === 0,
      workerErrors.join(" | ")
    );
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
