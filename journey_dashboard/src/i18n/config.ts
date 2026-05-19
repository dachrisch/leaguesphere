import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import all translation files statically so Vite can properly bundle them
import deUi from './locales/de/ui.json';
import deDomain from './locales/de/domain.json';
import deValidation from './locales/de/validation.json';
import deModal from './locales/de/modal.json';
import deError from './locales/de/error.json';

import enUi from './locales/en/ui.json';
import enDomain from './locales/en/domain.json';
import enValidation from './locales/en/validation.json';
import enModal from './locales/en/modal.json';
import enError from './locales/en/error.json';

const resources = {
  de: {
    ui: deUi,
    domain: deDomain,
    validation: deValidation,
    modal: deModal,
    error: deError,
  },
  en: {
    ui: enUi,
    domain: enDomain,
    validation: enValidation,
    modal: enModal,
    error: enError,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'de',
    defaultNS: 'ui',
    ns: ['ui', 'domain', 'validation', 'modal', 'error'],
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'i18nextLng',
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false,
    },
  });

// Update HTML lang attribute when language changes
i18n.on('languageChanged', (lng) => {
  document.documentElement.setAttribute('lang', lng);
});

export default i18n;
