// Captures the UI screenshots used by the store promo images and the docs site
// from the current Chrome build of the extension.
//
// Prerequisites: `yarn webpack --mode production --env browser=chrome`, and a
// Chromium build that still accepts unpacked extensions (branded Google Chrome
// doesn't). Set CHROMIUM_PATH if it isn't at the macOS default below.
//
// Outputs:
//   promo/screenshots/{generate,scan-result,history}.png  (400x600 popup @2x)
//   promo/screenshots/marquee-bg.png                      (2000x1000)
//   docs/assets/screenshots/{create,template,history,batch}.png (@2x)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { QRCodeEncoder, QRCodeDecoderErrorCorrectionLevel } from "@zxing/library";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROMO_DIR = path.join(ROOT, "promo/screenshots");
const DOCS_DIR = path.join(ROOT, "docs/assets/screenshots");
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || "/Applications/Chromium.app/Contents/MacOS/Chromium";

const POPUP = { width: 400, height: 600, scale: 2 };
const DOCS_HISTORY_HEIGHT = 260;
const DOCS_TEMPLATE_HEIGHT = 392;
const BATCH_PAGE = { width: 900, height: 820, scale: 2 };
const BATCH_CONTENT_WIDTH = 720;
const SETTLE_MS = 800;
const SCAN_TIMEOUT_MS = 10000;

const SCAN_TEXT = "https://www.mozilla.org/firefox/";
const REPO_URL = "https://github.com/zenLoading/ZenQR";
// Oldest first; the history tab shows the newest entry at the top.
const HISTORY_ITEMS = [
  { type: "decode", text: "tel:+15551234567" },
  { type: "encode", text: "https://example.com/menu" },
  { type: "encode", text: "WIFI:T:WPA;S:HomeWiFi_5G;P:sunflower42;;" },
  { type: "decode", text: SCAN_TEXT },
  { type: "encode", text: REPO_URL },
];
const BATCH_LINES = [REPO_URL, "https://example.com/menu", "https://example.com/wifi-guest", "tel:+15551234567"];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A QR code printed on a slightly rotated product label, pasted into the popup to scan.
function labelSvg(text) {
  const matrix = QRCodeEncoder.encode(text, QRCodeDecoderErrorCorrectionLevel.M, new Map()).getMatrix();
  const size = matrix.getWidth();
  const modules = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (matrix.get(x, y)) modules.push(`<rect x="${x}" y="${y}" width="1.02" height="1.02"/>`);
    }
  }
  const lines = ["NET WT 8 OZ (227g)", "Roasted &amp; Salted", "Best before 03/2027", "Scan for recipes"]
    .map((line, i) => `<text x="300" y="${120 + i * 46}" font-size="30" font-family="Helvetica" fill="#2b2b2b">${line}</text>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="560" viewBox="0 0 800 560">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9a441"/><stop offset="1" stop-color="#b9772a"/></linearGradient></defs>
    <rect width="800" height="560" fill="url(#bg)"/>
    <g transform="rotate(-6 400 280) translate(40 70)">
      <rect width="720" height="420" rx="14" fill="#f7f4ec"/>
      <g transform="translate(36 60) scale(${240 / size})" fill="#111">${modules.join("")}</g>
      ${lines}
      <rect x="300" y="330" width="380" height="8" fill="#2b2b2b"/>
    </g></svg>`;
}

// Blurred, tilted copy of the generator screenshot, used behind the marquee promo tile.
function marqueeHtml(pngBase64) {
  return `<body style="margin:0;width:2000px;height:1000px;overflow:hidden;background:#fff">
    <img src="data:image/png;base64,${pngBase64}" style="position:absolute;left:900px;top:-260px;width:800px;
      transform:perspective(1400px) rotateX(38deg) rotateZ(-24deg);filter:blur(7px);opacity:.9"></body>`;
}

async function renderHtml(browser, html, width, height) {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  await page.setContent(html);
  await sleep(300);
  const png = await page.screenshot({ type: "png" });
  await page.close();
  return png;
}

async function openExtensionPage(browser, extensionId, file, { width, height, scale }) {
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
  await page.setViewport({ width, height, deviceScaleFactor: scale });
  await page.goto(`chrome-extension://${extensionId}/pages/${file}`);
  await sleep(SETTLE_MS);
  return page;
}

async function typeInto(page, selector, text) {
  await page.click(selector);
  await page.keyboard.type(text);
  await sleep(SETTLE_MS);
}

async function clickByText(page, text) {
  const [element] = await page.$$(`xpath/.//*[normalize-space(text())='${text}']`);
  if (!element) throw new Error(`No element with text "${text}"`);
  await element.click();
  await sleep(SETTLE_MS);
}

async function openHistoryTab(page, items) {
  await page.evaluate((history) => chrome.storage.local.set({ history: JSON.stringify(history) }), items);
  await page.reload();
  await sleep(SETTLE_MS);
  await page.click('.tabs-item[title="History"]');
  await sleep(SETTLE_MS);
}

async function pasteImage(page, png) {
  await page.evaluate((base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const data = new DataTransfer();
    data.items.add(new File([bytes], "label.png", { type: "image/png" }));
    window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data }));
  }, png.toString("base64"));
}

async function waitForScanResult(page, expected) {
  const deadline = Date.now() + SCAN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const found = await page.evaluate(
      (text) => [...document.querySelectorAll("textarea")].some((el) => el.value.includes(text)),
      expected
    );
    if (found) return;
    await sleep(250);
  }
  throw new Error(`Scan result "${expected}" did not appear within ${SCAN_TIMEOUT_MS}ms`);
}

async function withPage(browser, extensionId, file, viewport, fn) {
  const page = await openExtensionPage(browser, extensionId, file, viewport);
  try {
    await fn(page);
  } finally {
    await page.close();
  }
}

async function captureStore(browser, extensionId) {
  const out = (name) => path.join(PROMO_DIR, name);

  await withPage(browser, extensionId, "popup.html", POPUP, async (page) => {
    await typeInto(page, "textarea.source", "https://www.mozilla.org/");
    await page.screenshot({ path: out("generate.png") });
  });

  const label = await renderHtml(browser, `<body style="margin:0">${labelSvg(SCAN_TEXT)}</body>`, 800, 560);
  await withPage(browser, extensionId, "popup.html", POPUP, async (page) => {
    await pasteImage(page, label);
    await waitForScanResult(page, SCAN_TEXT);
    await sleep(SETTLE_MS);
    await page.screenshot({ path: out("scan-result.png") });
  });

  await withPage(browser, extensionId, "popup.html", POPUP, async (page) => {
    await openHistoryTab(page, HISTORY_ITEMS);
    await page.screenshot({ path: out("history.png") });
  });

  const generate = fs.readFileSync(out("generate.png")).toString("base64");
  fs.writeFileSync(out("marquee-bg.png"), await renderHtml(browser, marqueeHtml(generate), 2000, 1000));
}

async function captureDocs(browser, extensionId) {
  const out = (name) => path.join(DOCS_DIR, name);

  await withPage(browser, extensionId, "popup.html", POPUP, async (page) => {
    await typeInto(page, "textarea.source", REPO_URL);
    await page.screenshot({ path: out("create.png") });
  });

  await withPage(browser, extensionId, "popup.html", POPUP, async (page) => {
    await clickByText(page, "Template");
    const [ssid, password] = await page.$$("input:not([type=checkbox])");
    await ssid.type("HomeWiFi_5G");
    await password.type("sunflower42");
    await sleep(SETTLE_MS);
    await page.screenshot({ path: out("template.png"), clip: { x: 0, y: 0, width: POPUP.width, height: DOCS_TEMPLATE_HEIGHT } });
  });

  await withPage(browser, extensionId, "popup.html", POPUP, async (page) => {
    await openHistoryTab(page, HISTORY_ITEMS.slice(2));
    // The popup has a fixed 600px height; shrink it so the footer sits under a short list.
    await page.setViewport({ width: POPUP.width, height: DOCS_HISTORY_HEIGHT, deviceScaleFactor: POPUP.scale });
    await page.evaluate((h) => {
      document.querySelectorAll("html,body,.container").forEach((el) => el.style.setProperty("height", `${h}px`, "important"));
    }, DOCS_HISTORY_HEIGHT);
    await sleep(SETTLE_MS);
    await page.screenshot({ path: out("history.png") });
  });

  await withPage(browser, extensionId, "batch.html", BATCH_PAGE, async (page) => {
    await typeInto(page, "textarea.batch-generator-input", BATCH_LINES.join("\n"));
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.screenshot({
      path: out("batch.png"),
      clip: { x: 0, y: 0, width: BATCH_CONTENT_WIDTH, height },
      captureBeyondViewport: true,
    });
  });
}

async function main() {
  const extensionDir = path.join(ROOT, "dist/chrome");
  if (!fs.existsSync(path.join(extensionDir, "manifest.json"))) {
    throw new Error("dist/chrome not found; run `yarn webpack --mode production --env browser=chrome` first");
  }
  const browser = await puppeteer.launch({ executablePath: CHROMIUM_PATH, pipe: true, enableExtensions: true, headless: true });
  try {
    const extensionId = await browser.installExtension(extensionDir);
    await captureStore(browser, extensionId);
    await captureDocs(browser, extensionId);
    console.log("Screenshots written to promo/screenshots and docs/assets/screenshots");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
