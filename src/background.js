import {
  apiNs,
  capturePartialScreen,
  openPopup,
  tabs,
  storage,
} from "./utils/compat";
import { convertBlobToDataUri, randomStr } from "./utils/misc";
import { getSettingValueFromStorage } from "./utils/settings";

const menusApi = apiNs.menus || apiNs.contextMenus;

// The background runs as a non-persistent script (a service worker in Chrome,
// an event page in Firefox) and can be torn down whenever it goes idle, so any
// state that has to outlive a single event lives in session storage.
const POPUP_OPTIONS_KEY = "bgPopupOptions";
const PICKER_SECRETS_KEY = "bgPickerSecrets";
const MAX_PICKER_SECRETS = 10;

/**
 * Resolves once the latest popup options write has landed, so a popup opened
 * right after `openPopupWithOptions()` never reads stale options.
 * @type {Promise<void>}
 */
let popupOptionsWrite = Promise.resolve();
/**
 * Serializes read-modify-write cycles on the picker secrets list.
 * @type {Promise<unknown>}
 */
let pickerSecretsQueue = Promise.resolve();

/**
 * @param {{action:string}} options
 */
function openPopupWithOptions(options) {
  popupOptionsWrite = storage("session").set({ [POPUP_OPTIONS_KEY]: options });
  // Firefox only honors `action.openPopup()` while still handling the user
  // gesture, so it must not wait for the storage write above.
  openPopup();
}

async function takePopupOptions() {
  await popupOptionsWrite;
  const data = await storage("session").get(POPUP_OPTIONS_KEY);
  await storage("session").set({ [POPUP_OPTIONS_KEY]: null });
  return data[POPUP_OPTIONS_KEY] || null;
}

/**
 * @param {{openUrlMode:'NO_OPEN'|'OPEN'|'OPEN_NEW_BG_TAB'|'OPEN_NEW_FG_TAB'}} options
 */
function openPickerWithOptions(options) {
  tabs
    .query({ active: true, currentWindow: true })
    .then((tabs) => tabs[0])
    .then((tab) => injectPickerLoader(tab, options));
}

/**
 * @return {Promise<{image:string}|{err:string}>}
 */
async function capture(request) {
  try {
    const canvas = await capturePartialScreen(
      request.rect,
      request.scroll,
      request.devicePixelRatio
    );
    const blob = await canvas.convertToBlob({ type: "image/png" });
    return { image: await convertBlobToDataUri(blob) };
  } catch (err) {
    console.error("capture failed", err);
    return { err: err?.message || String(err) };
  }
}

async function injectPickerLoader(tab, options) {
  await apiNs.scripting.executeScript({
    files: ["content_scripts/picker-loader.js"],
    target: {
      tabId: tab.id,
    },
  });
  if (!options) {
    options = {};
  }
  options.pauseVideos = await getSettingValueFromStorage(
    "pickerPauseVideosOnloadEnabled"
  );
  await apiNs.scripting.executeScript({
    func: (options) => {
      // Ensure the function exists before calling
      if (typeof window.loadPickerLoader === "function") {
        window.loadPickerLoader(options);
      } else {
        console.error(
          "loadPickerLoader function not found after injecting script."
        );
      }
    },
    args: [options],
    target: {
      tabId: tab.id,
    },
  });
}

const menuItems = {
  context_menu_pick_region_to_scan: {
    title: apiNs.i18n.getMessage("context_menu_pick_region_to_scan"),
    contexts: ["page", "action", "image", "video", "audio"],
    onclick: async function (info, tab) {
      await injectPickerLoader(tab);
    },
  },
  context_menu_make_qr_code_for_selected_text: {
    title: apiNs.i18n.getMessage("context_menu_make_qr_code_for_selected_text"),
    contexts: ["selection"],
    onclick: function (info) {
      openPopupWithOptions({
        action: "POPUP_ENCODE",
        text: info.selectionText,
        title: info.selectionText,
      });
    },
  },
  context_menu_make_qr_code_for_link: {
    title: apiNs.i18n.getMessage("context_menu_make_qr_code_for_link"),
    contexts: ["link"],
    onclick: function (info) {
      openPopupWithOptions({
        action: "POPUP_ENCODE",
        text: info.linkUrl,
        title: info.linkText,
      });
    },
  },
  context_menu_batch_generate_from_selection: {
    title: apiNs.i18n.getMessage("context_menu_batch_generate_from_selection"),
    contexts: ["selection"],
    onclick: async function (info) {
      await storage("session").set({
        batchGeneratorPendingText: info.selectionText || "",
      });
      await tabs.create({
        url: apiNs.runtime.getURL("pages/batch.html"),
      });
    },
  },
  context_menu_scan_qr_code_in_image: {
    title: apiNs.i18n.getMessage("context_menu_scan_qr_code_in_image"),
    contexts: ["image"],
    onclick: (info, tab) => {
      openPopupWithOptions({
        action: "POPUP_DECODE",
        url: info.srcUrl,
        tabId: tab.id,
        frameId: info.frameId,
        // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/menus/OnClickData#targetelementid
        targetElementId: info.targetElementId,
      });
    },
  },
  context_menu_scan_with_camera: {
    title: apiNs.i18n.getMessage("context_menu_scan_with_camera"),
    contexts: ["action"],
    onclick: function () {
      openPopupWithOptions({ action: "POPUP_DECODE_CAMERA" });
    },
  },
};

apiNs.runtime.onInstalled.addListener(() => {
  // Remove all existing context menus for this extension first to ensure a clean state
  menusApi.removeAll(() => {
    if (apiNs.runtime.lastError) {
      // Log error but continue, as this is not always critical
      console.warn(
        "Error removing context menus:",
        apiNs.runtime.lastError.message
      );
    }
  });

  for (const [id, menuItem] of Object.entries(menuItems)) {
    const createProperties = { ...menuItem, id };
    delete createProperties.onclick;
    menusApi.create(createProperties, () => {
      if (apiNs.runtime.lastError) {
        console.error(
          `Error creating context menu item ${id}:`,
          apiNs.runtime.lastError.message
        );
      }
    });
  }
});

menusApi.onClicked.addListener((info, tab) => {
  // info: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/menus/OnClickData
  // tab: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/Tab
  const menuItem = menuItems[info.menuItemId];
  if (menuItem && typeof menuItem.onclick === "function") {
    menuItem.onclick(info, tab);
  } else {
    console.warn(
      "No onclick handler or menu item definition found for:",
      info.menuItemId
    );
  }
});

apiNs.commands.onCommand.addListener((command) => {
  switch (command) {
    case "select-region-to-scan":
      openPickerWithOptions({ openUrlMode: "NO_OPEN" });
      break;
    case "select-region-to-scan-open":
      openPickerWithOptions({ openUrlMode: "OPEN" });
      break;
    case "select-region-to-scan-open-new-bg-tab":
      openPickerWithOptions({ openUrlMode: "OPEN_NEW_BG_TAB" });
      break;
    case "select-region-to-scan-open-new-fg-tab":
      openPickerWithOptions({ openUrlMode: "OPEN_NEW_FG_TAB" });
      break;
    case "scan-with-camera":
      openPopupWithOptions({ action: "POPUP_DECODE_CAMERA" });
      break;
  }
});

/**
 * @param {(secrets:string[]) => {secrets:string[], result:any}} update
 */
function updatePickerSecrets(update) {
  const run = pickerSecretsQueue.then(async () => {
    const data = await storage("session").get(PICKER_SECRETS_KEY);
    const { secrets, result } = update(data[PICKER_SECRETS_KEY] || []);
    await storage("session").set({ [PICKER_SECRETS_KEY]: secrets });
    return result;
  });
  pickerSecretsQueue = run.catch(() => {});
  return run;
}

function createPickerSecret() {
  const secret = randomStr(16);
  return updatePickerSecrets((secrets) => ({
    secrets: [...secrets.slice(-MAX_PICKER_SECRETS), secret],
    result: secret,
  }));
}

function validatePickerSecret(secret) {
  return updatePickerSecrets((secrets) => {
    const isValid = secrets.includes(secret);
    return {
      secrets: isValid ? secrets.filter((s) => s !== secret) : secrets,
      result: isValid,
    };
  });
}

apiNs.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // In firefox we can return a promise but we can't do that in Chrome
  switch (request.action) {
    case "BG_INJECT_PICKER_LOADER":
      openPickerWithOptions({ openUrlMode: "NO_OPEN" });
      break;
    // capture image
    case "BG_CAPTURE":
      capture(request).then(sendResponse);
      return true;
    case "BG_CREATE_TAB":
      tabs
        .create({
          url: request.url,
          active: request.active,
          openerTabId: sender.tab?.id,
        })
        .then(sendResponse);
      return true;
    // get popup options
    case "POPUP_GET_OPTIONS":
      takePopupOptions().then(sendResponse);
      return true;
    case "BG_GET_PICKER_URL":
      createPickerSecret().then((secret) => {
        const url = new URL(apiNs.runtime.getURL("pages/picker.html"));
        url.searchParams.set("secret", secret);
        sendResponse(url.href);
      });
      return true;
    case "BG_VALIDATE_PICKER_SECRET":
      validatePickerSecret(request.secret).then(sendResponse);
      return true;
    case "BG_APPLY_CSS":
      if (sender.tab?.id) {
        const promises = [];
        if (request.add?.length) {
          promises.push(
            apiNs.scripting.insertCSS({
              css: request.add,
              origin: "USER",
              target: {
                tabId: sender.tab.id,
              },
            })
          );
        }
        if (request.remove?.length) {
          promises.push(
            apiNs.scripting.removeCSS({
              css: request.remove,
              origin: "USER",
              target: {
                tabId: sender.tab.id,
              },
            })
          );
        }
        Promise.all(promises)
          .then(() => sendResponse({ success: true }))
          .catch((error) =>
            sendResponse({ success: false, error: error.message })
          );
      } else {
        console.warn("BG_APPLY_CSS: No sender.tab.id available.");
        sendResponse({ success: false, error: "No tab ID" }); // Explicitly respond on failure path
      }
      return true;
  }
});
