import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { pt } from './locales/pt'
import { en } from './locales/en'

const LANG_KEY = 'kyanite:language'

function detectInitialLanguage(): string {
  const saved = localStorage.getItem(LANG_KEY)
  if (saved) return saved

  const browserLang = navigator.language.toLowerCase()
  return browserLang.startsWith('pt') ? 'pt' : 'en'
}

i18n.use(initReactI18next).init({
  resources: { pt, en },
  lng: detectInitialLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

i18n.on('languageChanged', (lng) => {
  localStorage.setItem(LANG_KEY, lng)
})

export default i18n
