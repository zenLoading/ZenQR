import { T, TT } from "../utils/i18n";
import {
  apiNs,
  openShortcutSettings,
  canOpenShortcutSettings,
} from "../utils/compat";
import { render } from "preact";
import { useMemo } from "react";
import { PropTypes } from "prop-types";
import {
  usePageTitle,
  useSettingsContext,
  useThemePreferenceSync,
  useTemporaryState,
  SettingsContextProvider,
} from "../utils/hooks";
import GeneratorOptions from "./components/GeneratorOptions";

const HISTORY_MAX_ITEMS_OPTIONS = [50, 100, 200, 500];

const THEME_OPTIONS = [
  ["system", "settings_theme_option_system"],
  ["light", "settings_theme_option_light"],
  ["dark", "settings_theme_option_dark"],
];

const MOTION_OPTIONS = [
  ["system", "settings_motion_option_system"],
  ["reduced", "settings_motion_option_reduced"],
  ["full", "settings_motion_option_full"],
];

function SegmentedControl({ value, options, label, onChange }) {
  return (
    <div class="segmented-control" role="radiogroup" aria-label={label}>
      {options.map(([optionValue, labelKey]) => (
        <button
          type="button"
          key={optionValue}
          class={
            "segmented-control-option " +
            (value === optionValue ? "active" : "")
          }
          aria-pressed={value === optionValue}
          onClick={() => onChange(optionValue)}
        >
          {TT(labelKey)}
        </button>
      ))}
    </div>
  );
}

SegmentedControl.propTypes = {
  value: PropTypes.string,
  options: PropTypes.arrayOf(PropTypes.arrayOf(PropTypes.string)),
  label: PropTypes.string,
  onChange: PropTypes.func,
};

function SettingsPage() {
  const showKeyboardShortcutsSetting = useMemo(canOpenShortcutSettings, []);
  const { settings, saveSettings, resetSettings } = useSettingsContext();
  const [confirmingReset, setConfirmingReset] = useTemporaryState(false, 4000);

  usePageTitle(apiNs.i18n.getMessage("settings_window_title"));
  useThemePreferenceSync(settings);

  const handleResetClick = () => {
    if (confirmingReset) {
      resetSettings();
      setConfirmingReset(false);
    } else {
      setConfirmingReset(true);
    }
  };

  return (
    <div class="container">
      <div class="box">
        <div class="header">
          <img src="../icons/qrcraft.svg" class="logo" />
          <h1>{TT("settings_window_title")}</h1>
        </div>
        <form>
          <fieldset>
            <legend>{TT("settings_appearance_legend")}</legend>
            <div class="form-entry">
              <div class="form-entry-line">
                <label>{TT("settings_theme_label")}</label>
              </div>
              <SegmentedControl
                value={settings?.themePreference || "system"}
                options={THEME_OPTIONS}
                label={T("settings_theme_label")}
                onChange={(value) => saveSettings({ themePreference: value })}
              />
              <p class="form-entry-explainer">
                {TT("settings_theme_explainer")}
              </p>
            </div>
            <div class="form-entry">
              <div class="form-entry-line">
                <label>{TT("settings_motion_label")}</label>
              </div>
              <SegmentedControl
                value={settings?.motionPreference || "system"}
                options={MOTION_OPTIONS}
                label={T("settings_motion_label")}
                onChange={(value) => saveSettings({ motionPreference: value })}
              />
              <p class="form-entry-explainer">
                {TT("settings_motion_explainer")}
              </p>
            </div>
          </fieldset>
          <fieldset>
            <legend>{TT("settings_generator_legend")}</legend>
            <div class="form-entry">
              <div class="form-entry-line">
                <input
                  disabled={!settings}
                  id="whiteOnBlackQRCodeInDarkModeCheckbox"
                  name="whiteOnBlackQRCodeInDarkMode"
                  type="checkbox"
                  checked={settings?.whiteOnBlackQRCodeInDarkMode}
                  onChange={(e) => {
                    saveSettings({
                      whiteOnBlackQRCodeInDarkMode: e.target.checked,
                    });
                  }}
                />
                <label htmlFor="whiteOnBlackQRCodeInDarkModeCheckbox">
                  {TT("settings_white_on_black_qr_ccode_in_dark_mode_label")}
                </label>
              </div>
              <p class="form-entry-explainer">
                {TT("settings_white_on_black_qr_ccode_in_dark_mode_explainer")}
              </p>
            </div>
            <div class="form-entry">
              <p class="form-entry-explainer">
                {TT("settings_generator_defaults_explainer")}
              </p>
              <GeneratorOptions />
            </div>
          </fieldset>
          <fieldset>
            <legend>{TT("settings_scanner_legend")}</legend>
            <div class="form-entry">
              <div class="form-entry-line">
                <input
                  disabled={!settings}
                  id="scanSuccessSoundEnabledCheckbox"
                  name="scanSuccessSoundEnabled"
                  type="checkbox"
                  checked={settings?.scanSuccessSoundEnabled}
                  onChange={(e) => {
                    saveSettings({ scanSuccessSoundEnabled: e.target.checked });
                  }}
                />
                <label htmlFor="scanSuccessSoundEnabledCheckbox">
                  {TT("settings_scan_success_sound_enabled_label")}
                </label>
              </div>
              <p class="form-entry-explainer">
                {TT("settings_scan_success_sound_enabled_explainer")}
              </p>
            </div>
            <div class="form-entry">
              <div class="form-entry-line">
                <input
                  disabled={!settings}
                  id="pickerPauseVideosOnloadEnabledCheckbox"
                  name="pickerPauseVideosOnloadEnabled"
                  type="checkbox"
                  checked={settings?.pickerPauseVideosOnloadEnabled}
                  onChange={(e) => {
                    saveSettings({
                      pickerPauseVideosOnloadEnabled: e.target.checked,
                    });
                  }}
                />
                <label htmlFor="pickerPauseVideosOnloadEnabledCheckbox">
                  {TT("settings_picker_pause_videos_onload_enabled_label")}
                </label>
              </div>
              <p class="form-entry-explainer">
                {TT("settings_picker_pause_videos_onload_enabled_explainer")}
              </p>
            </div>
          </fieldset>
          <fieldset>
            <legend>{TT("settings_history_legend")}</legend>
            <div class="form-entry">
              <div class="form-entry-line">
                <label htmlFor="historyMaxItemsSelect">
                  {TT("settings_history_max_items_label")}
                </label>
                <select
                  id="historyMaxItemsSelect"
                  disabled={!settings}
                  value={settings?.historyMaxItems}
                  onChange={(e) => {
                    saveSettings({ historyMaxItems: e.target.value });
                  }}
                >
                  {HISTORY_MAX_ITEMS_OPTIONS.map((count) => (
                    <option key={count} value={count}>
                      {count}
                    </option>
                  ))}
                </select>
              </div>
              <p class="form-entry-explainer">
                {TT("settings_history_max_items_explainer")}
              </p>
            </div>
          </fieldset>
          <fieldset>
            <legend>{TT("settings_data_legend")}</legend>
            <div class="form-entry">
              <div class="form-entry-line">
                <span
                  class="clickable"
                  id="resetSettingsBtn"
                  onClick={handleResetClick}
                >
                  <img class="icon icon-invert" src="../icons/refresh.svg" />
                  {confirmingReset
                    ? TT("settings_reset_confirm_btn_label")
                    : TT("settings_reset_btn_label")}
                </span>
              </div>
              <p class="form-entry-explainer">
                {TT("settings_reset_explainer")}
              </p>
            </div>
          </fieldset>
          {showKeyboardShortcutsSetting && (
            <div class="form-entry">
              <div>
                <span
                  class="clickable"
                  id="configKeyboardShortcutsBtn"
                  onClick={openShortcutSettings}
                >
                  {TT("settings_config_keyboard_shortcuts_btn_label")}
                </span>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

render(
  <SettingsContextProvider>
    <SettingsPage />
  </SettingsContextProvider>,
  document.body
);
