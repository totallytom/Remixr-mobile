import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import en from './locales/en/translation.json';
import ko from './locales/ko/translation.json';
import ja from './locales/ja/translation.json';
import { storage, STORAGE_KEYS } from './platform/storage';

const SUPPORTED = ['en', 'ko', 'ja'];
const device = getLocales()[0]?.languageCode ?? 'en';
const deviceLang = SUPPORTED.includes(device) ? device : 'en';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ko: { translation: ko },
      ja: { translation: ja },
    },
    lng: deviceLang,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

// The language picked in Settings wins over the device language. Applied as
// soon as storage answers (a moment after launch); saved on every change.
storage.get(STORAGE_KEYS.LANGUAGE)
  .then((saved) => {
    if (saved && SUPPORTED.includes(saved) && saved !== i18n.language) i18n.changeLanguage(saved);
  })
  .catch(() => {})
  .finally(() => {
    i18n.on('languageChanged', (lng) => {
      storage.set(STORAGE_KEYS.LANGUAGE, lng).catch(() => {});
    });
  });

export default i18n;
