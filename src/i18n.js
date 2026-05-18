import en from "./locales/en.js";
import ja from "./locales/ja.js";

export const SUPPORTED_LOCALES = ["en", "ja"];
export const DEFAULT_LOCALE = "en";

const dictionaries = { en, ja };
let currentLocale = DEFAULT_LOCALE;

function normalizeLocale(locale) {
  if (!locale || typeof locale !== "string") return DEFAULT_LOCALE;
  const normalized = locale.trim().toLowerCase().replace("_", "-").split("-")[0];
  return SUPPORTED_LOCALES.includes(normalized) ? normalized : DEFAULT_LOCALE;
}

export function resolveInitialLocale() {
  try {
    const savedLocale = globalThis.localStorage?.getItem("survivor_locale");
    if (savedLocale) return normalizeLocale(savedLocale);
  } catch (_error) {
    // Ignore storage failures.
  }
  return normalizeLocale(globalThis.navigator?.language);
}

export function setLocale(locale) {
  currentLocale = normalizeLocale(locale);
  try {
    globalThis.localStorage?.setItem("survivor_locale", currentLocale);
  } catch (_error) {
    // Ignore storage failures.
  }
  if (globalThis.document?.documentElement) {
    globalThis.document.documentElement.lang = currentLocale;
  }
  globalThis.dispatchEvent?.(new CustomEvent("survivor:locale-changed", { detail: { locale: currentLocale } }));
  return currentLocale;
}

export function getLocale() {
  return currentLocale;
}

export function t(key, params = {}) {
  const value = dictionaries[currentLocale]?.[key] ?? dictionaries[DEFAULT_LOCALE]?.[key] ?? key;
  if (typeof value !== "string") return value;
  return value.replace(/\{(\w+)\}/g, (match, name) => (params[name] ?? match));
}

export function localizeDom(root = document) {
  root.querySelectorAll?.("[data-i18n]").forEach((element) => {
    const value = t(element.dataset.i18n);
    if (element.dataset.i18nHtml === "true") element.innerHTML = value;
    else element.textContent = value;
  });
  root.querySelectorAll?.("[data-i18n-aria-label]").forEach((element) => {
    element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel));
  });
  root.querySelectorAll?.("[data-i18n-title]").forEach((element) => {
    element.setAttribute("title", t(element.dataset.i18nTitle));
  });
  if (document?.title) document.title = t("app.title");
}

currentLocale = resolveInitialLocale();
if (globalThis.document?.documentElement) {
  globalThis.document.documentElement.lang = currentLocale;
}
