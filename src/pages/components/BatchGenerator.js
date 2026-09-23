import { useEffect, useMemo, useState, useRef } from "react";

import { storage } from "../../utils/compat";
import { T, TT } from "../../utils/i18n";
import { useSettings, useThemePreferenceSync } from "../../utils/hooks";
import { debouncer, sleep } from "../../utils/misc";
import { downloadQrCodeImage } from "../../utils/qrcode-image";
import { finderStyleNames, moduleStyleNames } from "../../utils/qrcode-gen";
import QRCodeSVG from "./QRCodeSVG";

const PENDING_TEXT_KEY = "batchGeneratorPendingText";
const DOWNLOAD_STAGGER_MS = 400;

function parseLines(rawText) {
  return rawText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function BatchGenerator() {
  const { settings } = useSettings();
  useThemePreferenceSync(settings);
  const [rawText, setRawText] = useState("");
  const [items, setItems] = useState([]);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const debouncerRef = useRef(debouncer(300));

  useEffect(() => {
    storage("session")
      .get(PENDING_TEXT_KEY)
      .then((data) => {
        const pendingText = data?.[PENDING_TEXT_KEY];
        if (pendingText) {
          setRawText(pendingText);
          storage("session").set({ [PENDING_TEXT_KEY]: "" });
        }
      })
      .catch(() => {
        // storage.session may be unavailable on older browser versions; ignore.
      });
  }, []);

  useEffect(() => {
    const debouncerInstance = debouncerRef.current;
    debouncerInstance.debounce(() => {
      setItems(parseLines(rawText).map((text) => ({ text, title: text })));
    });
    return () => debouncerInstance.cancel();
  }, [rawText]);

  const logoOpts = useMemo(
    () =>
      settings?.qrCodeLogoEnabled && settings?.qrCodeLogoDataUrl
        ? { logoDataUrl: settings.qrCodeLogoDataUrl }
        : {},
    [settings?.qrCodeLogoEnabled, settings?.qrCodeLogoDataUrl]
  );

  const handleSaveOne = (item) => {
    downloadQrCodeImage(
      item.text,
      settings?.qrCodeImageSize,
      item.title,
      settings?.qrCodeModuleStyle || moduleStyleNames[0],
      settings?.qrCodeFinderStyle || finderStyleNames[0],
      logoOpts
    );
  };

  const handleSaveAll = async () => {
    setIsDownloadingAll(true);
    for (const item of items) {
      handleSaveOne(item);
      await sleep(DOWNLOAD_STAGGER_MS);
    }
    setIsDownloadingAll(false);
  };

  return (
    <div class="batch-generator">
      <div class="box">
        <div class="header">
          <img src="../icons/zenqr.svg" class="logo" />
          <h1>{TT("batch_generator_window_title")}</h1>
        </div>
        <p class="batch-generator-instructions">
          {TT("batch_generator_instructions")}
        </p>
        <textarea
          class="batch-generator-input"
          spellCheck="false"
          placeholder={T("batch_generator_input_placeholder")}
          value={rawText}
          onInput={(e) => setRawText(e.target.value)}
        ></textarea>
        {items.length > 0 && (
          <div class="form-entry-line">
            <span
              class="clickable"
              onClick={isDownloadingAll ? undefined : handleSaveAll}
            >
              <img class="icon icon-invert" src="../icons/save.svg" />
              {isDownloadingAll
                ? TT("batch_generator_saving_all_btn")
                : TT("batch_generator_save_all_btn", [String(items.length)])}
            </span>
          </div>
        )}
        <div class="batch-generator-grid">
          {items.map((item, index) => (
            <div class="batch-generator-card" key={`${index}-${item.text}`}>
              <div class="batch-generator-card-qr">
                <QRCodeSVG
                  content={item.text}
                  width={140}
                  height={140}
                  errorCorrectionLevel={settings?.ecLevel}
                  moduleStyle={settings?.qrCodeModuleStyle || moduleStyleNames[0]}
                  finderStyle={settings?.qrCodeFinderStyle || finderStyleNames[0]}
                  foregroundColor="#000000"
                  backgroundColor="#ffffff"
                ></QRCodeSVG>
                {logoOpts.logoDataUrl && (
                  <img class="qr-logo-overlay" src={logoOpts.logoDataUrl} />
                )}
              </div>
              <div class="batch-generator-card-text" title={item.text}>
                {item.text}
              </div>
              <span
                class="clickable"
                title={T("save_image_btn_title")}
                onClick={() => handleSaveOne(item)}
              >
                <img class="icon icon-invert" src="../icons/save.svg" />
                {TT("save_image_btn")}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default BatchGenerator;
