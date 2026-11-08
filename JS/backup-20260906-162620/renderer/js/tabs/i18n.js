let i18n = {};
function t(key) { return i18n[key] || key; }

async function loadLanguage(lang) {
    weLog.info('i18n', '→ loadLanguage 开始', { lang });
    try {
        const translations = await weAPI.loadLang(lang);
        i18n = translations;
        weLog.info('i18n', '← loadLanguage 完成', { lang, keyCount: Object.keys(i18n).length });
    } catch (e) {
        weLog.error('i18n', 'loadLanguage 加载语言失败', e && e.stack ? e.stack : String(e));
        i18n = {};
    }
    refreshAllUITexts(); // 依赖 ui-refresh.js
}