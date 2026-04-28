// js/i18n-config.js
(function (global) {
  const config = {
    storageKey: 'r4e_lang',
    defaultLanguage: 'en',
    fallbackLanguage: 'en',
    supportedLanguages: ['en', 'te', 'hi'],
    dictionaryPath: './js/i18n-dictionary.json'
  };

  global.R4E_I18N_CONFIG = config;
})(window);
