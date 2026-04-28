// js/i18n-config.js
(function (global) {
  var R4E = global.R4E = global.R4E || {};
  R4E.i18nConfig = {
    storageKey: 'r4e_language',
    defaultLanguage: 'en',
    supportedLanguages: ['en', 'te', 'hi'],
    dictionaryPath: './js/i18n-dictionary.json',
    fallbackLanguage: 'en'
  };
})(window);
