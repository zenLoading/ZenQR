/**
 * Content builders for common QR code "templates" (WiFi, contact card, etc).
 * Each function takes a plain object of form field values and returns the
 * raw string that should be encoded into the QR code.
 */

function escapeWifiValue(str) {
  return String(str || "").replace(/([\\;,":])/g, "\\$1");
}

/**
 * @param {{ssid: string, password?: string, encryption?: 'WPA'|'WEP'|'nopass', hidden?: boolean}} fields
 */
export function buildWifiQrContent({ ssid, password, encryption, hidden }) {
  const type = encryption === "WEP" || encryption === "nopass" ? encryption : "WPA";
  const passwordPart =
    type === "nopass" ? "" : `P:${escapeWifiValue(password)};`;
  return `WIFI:T:${type};S:${escapeWifiValue(ssid)};${passwordPart}H:${
    hidden ? "true" : "false"
  };;`;
}

/**
 * @param {{firstName?: string, lastName?: string, phone?: string, email?: string, org?: string, url?: string}} fields
 */
export function buildVCardQrContent({
  firstName,
  lastName,
  phone,
  email,
  org,
  url,
}) {
  const fullName = [firstName, lastName].filter(Boolean).join(" ");
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${lastName || ""};${firstName || ""};;;`,
    `FN:${fullName}`,
  ];
  if (org) lines.push(`ORG:${org}`);
  if (phone) lines.push(`TEL:${phone}`);
  if (email) lines.push(`EMAIL:${email}`);
  if (url) lines.push(`URL:${url}`);
  lines.push("END:VCARD");
  return lines.join("\n");
}

/**
 * @param {{to: string, subject?: string, body?: string}} fields
 */
export function buildEmailQrContent({ to, subject, body }) {
  const params = new URLSearchParams();
  if (subject) params.set("subject", subject);
  if (body) params.set("body", body);
  const query = params.toString();
  return `mailto:${to || ""}${query ? "?" + query : ""}`;
}

/**
 * @param {{phone: string, message?: string}} fields
 */
export function buildSmsQrContent({ phone, message }) {
  return `SMSTO:${phone || ""}:${message || ""}`;
}

/**
 * @param {{phone: string}} fields
 */
export function buildPhoneQrContent({ phone }) {
  return `tel:${phone || ""}`;
}

function formatEventDateTime(value) {
  // `value` comes from <input type="datetime-local">, e.g. "2026-09-12T14:30"
  if (!value) {
    return "";
  }
  return value.replace(/[-:]/g, "") + "00";
}

/**
 * @param {{title?: string, location?: string, description?: string, start?: string, end?: string}} fields
 */
export function buildEventQrContent({ title, location, description, start, end }) {
  const lines = ["BEGIN:VEVENT"];
  if (title) lines.push(`SUMMARY:${title}`);
  if (start) lines.push(`DTSTART:${formatEventDateTime(start)}`);
  if (end) lines.push(`DTEND:${formatEventDateTime(end)}`);
  if (location) lines.push(`LOCATION:${location}`);
  if (description) lines.push(`DESCRIPTION:${description}`);
  lines.push("END:VEVENT");
  return lines.join("\n");
}

export const templateTypes = ["wifi", "vcard", "email", "sms", "phone", "event"];
