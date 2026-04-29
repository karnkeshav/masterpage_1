// js/translator.js
(function (global) {
  const cfg = global.R4E_I18N_CONFIG || {
    storageKey: 'r4e_lang',
    defaultLanguage: 'en',
    fallbackLanguage: 'en',
    supportedLanguages: ['en', 'te', 'hi'],
    dictionaryPath: './js/i18n-dictionary.json'
  };

  function normalizeLang(lang) {
    if (!lang) return cfg.defaultLanguage;
    const code = String(lang).toLowerCase();
    return cfg.supportedLanguages.includes(code) ? code : cfg.defaultLanguage;
  }

  // Synchronous Bootstrap
  const initialLang = normalizeLang(localStorage.getItem(cfg.storageKey) || cfg.defaultLanguage);
  document.documentElement.setAttribute('lang', initialLang);

  let dictionary = null;
  let loadingPromise = null;

  function getLanguage() {
    const fromStorage = localStorage.getItem(cfg.storageKey);
    return normalizeLang(fromStorage || document.documentElement.getAttribute('lang') || cfg.defaultLanguage);
  }

  async function setLanguage(lang) {
    const code = normalizeLang(lang);
    localStorage.setItem(cfg.storageKey, code);
    document.documentElement.setAttribute('lang', code);
    document.body?.setAttribute('data-lang', code);
    await loadDictionary();
    return applyTranslations(document);
  }

  function getPathValue(obj, key) {
    return key.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), obj);
  }

  async function loadDictionary() {
    if (dictionary) return dictionary;
    if (loadingPromise) return loadingPromise;

    loadingPromise = fetch(cfg.dictionaryPath)
      .then(r => {
        if (!r.ok) throw new Error(`i18n dictionary load failed: ${r.status}`);
        return r.json();
      })
      .then(json => {
        dictionary = json;
        return dictionary;
      })
      .catch(err => {
        console.error(err);
        console.error('CRITICAL: Failed to load i18n dictionary. Injecting hardcoded fallback.');
        dictionary = {
            'en': {
                'auth.login': 'Login',
                'common.sign_out': 'Sign Out',
                'hero.master_exams': 'Master Your Exams',
                'hero.with_precision': 'With Precision',
                'hero.subtext': 'Access high-end educational resources and premium exam preparation tools tailored for your success. For registered schools & students.'
            }
        };
        return dictionary;
      });

    return loadingPromise;
  }

  function t(key, fallback = '') {
    const lang = getLanguage();
    const langPack = dictionary?.[lang] || {};
    const fallbackPack = dictionary?.[cfg.fallbackLanguage] || {};
    return getPathValue(langPack, key)
      || getPathValue(fallbackPack, key)
      || fallback
      || key;
  }

  function translateSubject(subject) {
    if (!subject) return '';
    const slug = String(subject).trim().toLowerCase().replace(/\s+/g, '_');
    return t(`subject.${slug}`, subject);
  }

  async function applyTranslations(root = document) {
    await loadDictionary();
    const targets = root.querySelectorAll('[data-i18n]');
    targets.forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (!key) return;
      const localized = t(key, el.getAttribute('data-i18n-fallback') || el.textContent || '');
      if (el.hasAttribute('data-i18n-placeholder')) {
        el.setAttribute('placeholder', localized);
      } else {
        el.innerHTML = localized;
      }
    });
  }

  global.R4ETranslator = {
    init: () => applyTranslations(document),
    t,
    setLanguage,
    getLanguage,
    applyTranslations,
    translateSubject,
    loadDictionary
  };

  document.addEventListener('DOMContentLoaded', () => {
    document.documentElement.setAttribute('lang', getLanguage());
    document.body?.setAttribute('data-lang', getLanguage());
    applyTranslations(document);
  });
})(window);
