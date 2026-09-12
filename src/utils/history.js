import { storage } from "./compat";
import { getSettings } from "./settings";

/**
 * @returns {Promise<{type:'encode'|'decode', text: string}[]>}
 */
export async function getHistory() {
  try {
    const results = await storage("local").get("history");
    if (results.history) {
      return JSON.parse(results.history);
    }
    return [];
  } catch (e) {
    console.error("error while parsing history", e);
  }
}

export async function clearHistory() {
  await storage("local").set({
    history: "[]",
  });
}

/**
 *
 * @param {'encode'|'decode'} type
 * @param {string} text
 * @returns
 */
export async function addHistory(type, text) {
  if (type !== "encode" && type !== "decode") {
    return;
  }
  const settings = await getSettings();
  if (!settings.historyEnabled) {
    return;
  }

  let history = await getHistory();
  // Don't add duplicate items
  if (history && history.length > 0) {
    if (history[history.length - 1].text === text) {
      return;
    }
  }
  history = history.filter(function (item) {
    return item.text && item.text !== text;
  });
  history = [...history, { type, text }];
  const maxItems = settings.historyMaxItems;
  if (history.length > maxItems) {
    history = history.slice(history.length - maxItems, history.length);
  }

  await storage("local").set({
    history: JSON.stringify(history),
  });
}

export async function removeHistory(text) {
  let history = await getHistory();
  history = history.filter(function (item) {
    return item.text !== text;
  });
  await storage("local").set({
    history: JSON.stringify(history),
  });
}

/**
 * @returns {Promise<string>} a JSON string suitable for saving to a file
 */
export async function exportHistoryAsJson() {
  const history = await getHistory();
  return JSON.stringify(history, null, 2);
}

/**
 * Merges history entries parsed from a previously exported JSON file into
 * the existing history. Invalid entries are silently skipped.
 * @param {string} json
 * @returns {Promise<number>} number of entries actually imported
 */
export async function importHistoryFromJson(json) {
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed)) {
    throw new Error("Invalid history file: expected an array");
  }

  const validImportedItems = parsed.filter(
    (item) =>
      item &&
      typeof item.text === "string" &&
      item.text &&
      (item.type === "encode" || item.type === "decode")
  );

  let history = await getHistory();
  // Imported items take precedence over existing ones with the same text.
  const importedTexts = new Set(validImportedItems.map((item) => item.text));
  history = history.filter((item) => !importedTexts.has(item.text));
  history = [...history, ...validImportedItems];
  const maxItems = (await getSettings()).historyMaxItems;
  if (history.length > maxItems) {
    history = history.slice(history.length - maxItems, history.length);
  }

  await storage("local").set({
    history: JSON.stringify(history),
  });

  return validImportedItems.length;
}
