// js/translator.js
(function (global) {
  var R4E = global.R4E = global.R4E || {};
  var cache = { dictionary: null, loading: null };

  function config() {
    return R4E.i18nConfig || {
      storageKey: 'r4e_language',
      defaultLanguage: 'en',
      supportedLanguages: ['en', 'te', 'hi'],
      dictionaryPath: './js/i18n-dictionary.json',
      fallbackLanguage: 'en'
    };
  }

  function normalizeLang(lang) {
    var cfg = config();
    return cfg.supportedLanguages.indexOf(lang) >= 0 ? lang : cfg.defaultLanguage;
  }

  function getLanguage() {
    var cfg = config();
    var raw = localStorage.getItem(cfg.storageKey) || cfg.defaultLanguage;
    return normalizeLang(raw);
  }

  function setLanguage(lang) {
    var cfg = config();
    var next = normalizeLang(lang);
    localStorage.setItem(cfg.storageKey, next);
    global.document.documentElement.setAttribute('lang', next);
    console.info('[i18n] language switched to', next);
    return applyTranslations();
  }

  function getByPath(obj, path) {
    return (path || '').split('.').reduce(function (acc, key) {
      return acc && acc[key] !== undefined ? acc[key] : null;
    }, obj);
  }

  function translateKey(key, lang) {
    var dict = cache.dictionary;
    if (!dict) return key;
    var cfg = config();
    var targetLang = normalizeLang(lang || getLanguage());
    var node = getByPath(dict, key);
    if (!node) return key;
    if (typeof node === 'string') return node;
    return node[targetLang] || node[cfg.fallbackLanguage] || Object.values(node)[0] || key;
  }

  function loadDictionary() {
    if (cache.dictionary) return Promise.resolve(cache.dictionary);
    if (global.R4E_I18N_DICTIONARY) {
      cache.dictionary = global.R4E_I18N_DICTIONARY;
      return Promise.resolve(cache.dictionary);
    }
    if (cache.loading) return cache.loading;
    cache.loading = fetch(config().dictionaryPath)
      .then(function (r) { return r.json(); })
      .then(function (d) { cache.dictionary = d; return d; })
      .catch(function () {
        cache.dictionary = global.R4E_I18N_DICTIONARY || {};
        return cache.dictionary;
      });
    return cache.loading;
  }

  function applyTranslations(root) {
    var ctx = root || global.document;
    return loadDictionary().then(function () {
      var lang = getLanguage();
      global.document.documentElement.setAttribute('lang', lang);
      ctx.querySelectorAll('[data-i18n]').forEach(function (el) {
        var key = el.getAttribute('data-i18n');
        el.textContent = translateKey(key, lang);
      });
      ctx.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
        var key = el.getAttribute('data-i18n-placeholder');
        el.setAttribute('placeholder', translateKey(key, lang));
      });
      ctx.querySelectorAll('[data-i18n-title]').forEach(function (el) {
        var key = el.getAttribute('data-i18n-title');
        el.setAttribute('title', translateKey(key, lang));
      });
      global.document.querySelectorAll('[data-lang-switch]').forEach(function (btn) {
        var isActive = btn.getAttribute('data-lang-switch') === lang;
        btn.classList.toggle('ring-2', isActive);
        btn.classList.toggle('ring-white', isActive);
      });
    });
  }

  function translateSubject(subject, lang) {
    return translateKey('subjects.' + subject, lang);
  }

  R4E.i18n = {
    loadDictionary: loadDictionary,
    applyTranslations: applyTranslations,
    getLanguage: getLanguage,
    setLanguage: setLanguage,
    t: translateKey,
    translateSubject: translateSubject
  };

  document.addEventListener('DOMContentLoaded', function () {
    applyTranslations();
  });
})(window);
