import { useRef } from "react";
import {
  useSettingsContext,
} from "../../utils/hooks";
import { T, TT } from "../../utils/i18n";
import { finderStyleNames, moduleStyleNames } from '../../utils/qrcode-gen';
import { fileToSquareLogoDataUrl } from "../../utils/qrcode-image";

const ecLevels = [
  ["L", T("error_correction_level_btn_low_title")],
  ["M", T("error_correction_level_btn_medium_title")],
  ["Q", T("error_correction_level_btn_quartile_title")],
  ["H", T("error_correction_level_btn_high_title")],
];

function GeneratorOptions() {
  const { settings, saveSettings } = useSettingsContext();
  const logoFileInputRef = useRef(null);

  const handleLogoFileChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) {
      return;
    }
    fileToSquareLogoDataUrl(file)
      .then((dataUrl) => {
        saveSettings({ qrCodeLogoDataUrl: dataUrl, qrCodeLogoEnabled: true });
      })
      .catch((error) => {
        console.error("Failed to process logo image:", error);
      });
  };

  return (
    <div class="generator-options">
      <label title={T("error_correction_level_label_title")}>
        {TT("error_correction_level_label")}
      </label>
      <span id="ecLevels" class="ec-levels-container">
        {ecLevels.map(([level, title]) => (
          <span
            key={level}
            class={
              "clickable ec-level " +
              (settings?.ecLevel === level ? "ec-level-active" : "")
            }
            title={title}
            onClick={() => saveSettings({ ecLevel: level })}
          >
            {level}
          </span>
        ))}
      </span>
      <label title={T("image_size_label_title")}>
        {TT("image_size_label")}
      </label>
      <select value={settings?.qrCodeImageSize} onChange={(e) => saveSettings({
        qrCodeImageSize: e.target.value,
      })}>
        <option value="500">500x500</option>
        <option value="1000">1000x1000</option>
        <option value="1500">1500x1500</option>
        <option value="2000">2000x2000</option>
      </select>
      <label title={T("finder_style_label_title")}>
        {TT("finder_style_label")}
      </label>
      <select value={settings?.qrCodeFinderStyle || "default"} onChange={(e) => saveSettings({
        qrCodeFinderStyle: e.target.value,
      })}>
        {finderStyleNames.map((name) => (
          <option key={name} value={name}>{name}</option>
        ))}
      </select>
      <label title={T("module_style_label_title")}>
        {TT("module_style_label")}
      </label>
      <select value={settings?.qrCodeModuleStyle || "default"} onChange={(e) => saveSettings({
        qrCodeModuleStyle: e.target.value,
      })}>
        {moduleStyleNames.map((name) => (
          <option key={name} value={name}>{name}</option>
        ))}
      </select>
      <label title={T("logo_label_title")}>{TT("logo_label")}</label>
      <span class="logo-option-container">
        <input
          ref={logoFileInputRef}
          type="file"
          accept="image/*"
          class="hidden"
          onChange={handleLogoFileChange}
        />
        {settings?.qrCodeLogoDataUrl && (
          <img class="logo-thumbnail" src={settings.qrCodeLogoDataUrl} />
        )}
        <span
          class="clickable"
          title={T("logo_choose_btn_title")}
          onClick={() => logoFileInputRef.current?.click()}
        >
          <img class="icon icon-invert" src="../icons/image.svg" />
          {TT("logo_choose_btn")}
        </span>
        {settings?.qrCodeLogoDataUrl && (
          <>
            <label class="logo-toggle-label" title={T("logo_show_checkbox_title")}>
              <input
                type="checkbox"
                checked={!!settings?.qrCodeLogoEnabled}
                onChange={(e) =>
                  saveSettings({ qrCodeLogoEnabled: e.target.checked })
                }
              />
              {TT("logo_show_checkbox_label")}
            </label>
            <span
              class="clickable"
              title={T("logo_remove_btn_title")}
              onClick={() =>
                saveSettings({ qrCodeLogoDataUrl: "", qrCodeLogoEnabled: false })
              }
            >
              <img class="icon icon-invert" src="../icons/trash.svg" />
            </span>
          </>
        )}
      </span>
      {settings?.qrCodeLogoEnabled &&
        settings?.qrCodeLogoDataUrl &&
        settings?.ecLevel !== "H" && (
          <p class="logo-ec-hint">{TT("logo_ec_level_hint")}</p>
        )}
    </div>
  );
}

export default GeneratorOptions;