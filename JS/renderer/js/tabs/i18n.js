let i18n = {};
function t(key) { return i18n[key] || key; }

async function loadLanguage(lang) {
    try {
        const translations = await weAPI.loadLang(lang);
        i18n = translations;
    } catch (e) {
        console.error('Failed to load language:', e);
        i18n = {};
    }
    refreshAllUITexts(); // 依赖 ui-refresh.js
}