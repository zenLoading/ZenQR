import { useState } from "react";
import { PropTypes } from "prop-types";

import { T, TT } from "../../utils/i18n";
import {
  templateTypes,
  buildWifiQrContent,
  buildVCardQrContent,
  buildEmailQrContent,
  buildSmsQrContent,
  buildPhoneQrContent,
  buildEventQrContent,
} from "../../utils/templates";

const templateLabelKeys = {
  wifi: "template_type_wifi",
  vcard: "template_type_vcard",
  email: "template_type_email",
  sms: "template_type_sms",
  phone: "template_type_phone",
  event: "template_type_event",
};

function buildContentAndTitle(type, fields) {
  switch (type) {
    case "wifi":
      return {
        content: buildWifiQrContent(fields),
        title: fields.ssid ? `WiFi: ${fields.ssid}` : "WiFi",
      };
    case "vcard":
      return {
        content: buildVCardQrContent(fields),
        title:
          [fields.firstName, fields.lastName].filter(Boolean).join(" ") ||
          "Contact",
      };
    case "email":
      return {
        content: buildEmailQrContent(fields),
        title: fields.to || "Email",
      };
    case "sms":
      return {
        content: buildSmsQrContent(fields),
        title: fields.phone || "SMS",
      };
    case "phone":
      return {
        content: buildPhoneQrContent(fields),
        title: fields.phone || "Phone",
      };
    case "event":
      return {
        content: buildEventQrContent(fields),
        title: fields.title || "Event",
      };
    default:
      return { content: "", title: "" };
  }
}

function isTemplateFilled(type, fields) {
  switch (type) {
    case "wifi":
      return !!fields.ssid;
    case "vcard":
      return !!(fields.firstName || fields.lastName || fields.phone || fields.email);
    case "email":
      return !!fields.to;
    case "sms":
    case "phone":
      return !!fields.phone;
    case "event":
      return !!fields.title;
    default:
      return false;
  }
}

function TemplateBuilder({ onApply }) {
  const [type, setType] = useState("wifi");
  const [fieldsByType, setFieldsByType] = useState({});
  const fields = fieldsByType[type] || {};

  const setField = (key, value) => {
    setFieldsByType((prev) => ({
      ...prev,
      [type]: { ...(prev[type] || {}), [key]: value },
    }));
  };

  const handleApply = () => {
    const { content, title } = buildContentAndTitle(type, fields);
    if (content) {
      onApply(content, title);
    }
  };

  return (
    <div class="template-builder">
      <select value={type} onChange={(e) => setType(e.target.value)}>
        {templateTypes.map((t) => (
          <option key={t} value={t}>
            {T(templateLabelKeys[t])}
          </option>
        ))}
      </select>

      {type === "wifi" && (
        <>
          <input
            type="text"
            placeholder={T("template_wifi_ssid_placeholder")}
            value={fields.ssid || ""}
            onInput={(e) => setField("ssid", e.target.value)}
          />
          <select
            value={fields.encryption || "WPA"}
            onChange={(e) => setField("encryption", e.target.value)}
          >
            <option value="WPA">{T("template_wifi_encryption_wpa")}</option>
            <option value="WEP">{T("template_wifi_encryption_wep")}</option>
            <option value="nopass">{T("template_wifi_no_password")}</option>
          </select>
          {fields.encryption !== "nopass" && (
            <input
              type="text"
              placeholder={T("template_wifi_password_placeholder")}
              value={fields.password || ""}
              onInput={(e) => setField("password", e.target.value)}
            />
          )}
          <label class="template-builder-checkbox-field">
            <input
              type="checkbox"
              checked={!!fields.hidden}
              onChange={(e) => setField("hidden", e.target.checked)}
            />
            {TT("template_wifi_hidden_label")}
          </label>
        </>
      )}

      {type === "vcard" && (
        <>
          <input
            type="text"
            placeholder={T("template_vcard_first_name_placeholder")}
            value={fields.firstName || ""}
            onInput={(e) => setField("firstName", e.target.value)}
          />
          <input
            type="text"
            placeholder={T("template_vcard_last_name_placeholder")}
            value={fields.lastName || ""}
            onInput={(e) => setField("lastName", e.target.value)}
          />
          <input
            type="text"
            placeholder={T("template_vcard_phone_placeholder")}
            value={fields.phone || ""}
            onInput={(e) => setField("phone", e.target.value)}
          />
          <input
            type="text"
            placeholder={T("template_vcard_email_placeholder")}
            value={fields.email || ""}
            onInput={(e) => setField("email", e.target.value)}
          />
          <input
            type="text"
            placeholder={T("template_vcard_org_placeholder")}
            value={fields.org || ""}
            onInput={(e) => setField("org", e.target.value)}
          />
          <input
            type="text"
            placeholder={T("template_vcard_url_placeholder")}
            value={fields.url || ""}
            onInput={(e) => setField("url", e.target.value)}
          />
        </>
      )}

      {type === "email" && (
        <>
          <input
            type="text"
            placeholder={T("template_email_to_placeholder")}
            value={fields.to || ""}
            onInput={(e) => setField("to", e.target.value)}
          />
          <input
            type="text"
            placeholder={T("template_email_subject_placeholder")}
            value={fields.subject || ""}
            onInput={(e) => setField("subject", e.target.value)}
          />
          <textarea
            class="template-builder-textarea"
            placeholder={T("template_email_body_placeholder")}
            value={fields.body || ""}
            onInput={(e) => setField("body", e.target.value)}
          ></textarea>
        </>
      )}

      {type === "sms" && (
        <>
          <input
            type="text"
            placeholder={T("template_sms_phone_placeholder")}
            value={fields.phone || ""}
            onInput={(e) => setField("phone", e.target.value)}
          />
          <textarea
            class="template-builder-textarea"
            placeholder={T("template_sms_message_placeholder")}
            value={fields.message || ""}
            onInput={(e) => setField("message", e.target.value)}
          ></textarea>
        </>
      )}

      {type === "phone" && (
        <input
          type="text"
          placeholder={T("template_phone_placeholder")}
          value={fields.phone || ""}
          onInput={(e) => setField("phone", e.target.value)}
        />
      )}

      {type === "event" && (
        <>
          <input
            type="text"
            placeholder={T("template_event_title_placeholder")}
            value={fields.title || ""}
            onInput={(e) => setField("title", e.target.value)}
          />
          <label class="template-builder-field">
            <span class="template-builder-field-label">
              {TT("template_event_start_label")}
            </span>
            <input
              type="datetime-local"
              value={fields.start || ""}
              onInput={(e) => setField("start", e.target.value)}
            />
          </label>
          <label class="template-builder-field">
            <span class="template-builder-field-label">
              {TT("template_event_end_label")}
            </span>
            <input
              type="datetime-local"
              value={fields.end || ""}
              onInput={(e) => setField("end", e.target.value)}
            />
          </label>
          <input
            type="text"
            placeholder={T("template_event_location_placeholder")}
            value={fields.location || ""}
            onInput={(e) => setField("location", e.target.value)}
          />
          <textarea
            class="template-builder-textarea"
            placeholder={T("template_event_description_placeholder")}
            value={fields.description || ""}
            onInput={(e) => setField("description", e.target.value)}
          ></textarea>
        </>
      )}

      <span
        class={"clickable template-builder-apply" + (isTemplateFilled(type, fields) ? "" : " disabled")}
        onClick={isTemplateFilled(type, fields) ? handleApply : undefined}
      >
        {TT("template_apply_btn")}
      </span>
    </div>
  );
}

TemplateBuilder.propTypes = {
  onApply: PropTypes.func.isRequired,
};

export default TemplateBuilder;
