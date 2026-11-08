// 全局通知
let notificationTimer = null;
function showNotification(message, duration = 2000) {
    weLog.debug('init', `showNotification: "${message}" duration=${duration}`);
    const bar = document.getElementById('notification-bar');
    if (!bar) { weLog.warn('init', 'showNotification: notification-bar 元素不存在'); return; }
    bar.textContent = message;
    bar.classList.add('show');
    clearTimeout(notificationTimer);
    if (duration > 0) {
        notificationTimer = setTimeout(() => bar.classList.remove('show'), duration);
    }
}

// 启动
window.onload = async () => {
    weLog.info('init', '=== window.onload 启动开始 ===');
    try {
        weLog.info('init', '→ 读取设置');
        const settings = await weAPI.getSettings();
        weLog.info('init', '← 设置读取完成', {
            colorPreset: settings.colorPreset,
            theme: settings.theme,
            language: settings.language,
            backgroundMaterial: settings.backgroundMaterial,
            backgroundImageEnabled: settings.backgroundImageEnabled
        });

        weLog.info('init', '→ 应用配色预设');
        // 先应用配色预设（会同时设置主题）
        if (typeof applyColorPreset === 'function') {
            applyColorPreset(settings.colorPreset || 'default-dark', settings.customColors);
            weLog.info('init', `← 配色预设已应用: ${settings.colorPreset || 'default-dark'}`);
        } else {
            weLog.warn('init', 'applyColorPreset 未定义，回退到 applyTheme');
            currentTheme = settings.theme || 'dark';
            applyTheme(currentTheme);
        }

        weLog.info('init', '→ 应用背景材质/遮罩/图片');
        // 读取系统主题（缓存到 window._systemDark 供 checkMaterialThemeCompat 用）
        let sysIsDark = false;
        try {
            const sysTheme = await weAPI.getSystemTheme();
            sysIsDark = !!(sysTheme && sysTheme.isDark);
            window._systemDark = sysIsDark;
            weLog.info('init', `系统主题 isDark=${sysIsDark}`);
        } catch (e) {
            weLog.warn('init', '读取系统主题失败，默认暗色', e);
            window._systemDark = false;
        }

        // 应用背景材质（Mica/Acrylic/Tabbed）
        const userMaterial = settings.backgroundMaterial || 'none';
        window._userMaterialChoice = userMaterial; // 保存用户原始选择（不降级）
        const savedTint = settings.materialTint ?? 78;
        const savedOverlay = settings.materialOverlay ?? 30;
        const savedBarTint = settings.materialBarTint ?? 100;
        window.savedTint = savedTint;
        window.savedOverlay = savedOverlay;
        window.savedBarTint = savedBarTint;

        // 检查主题-材质兼容性
        let effectiveMaterial = userMaterial;
        if (typeof checkMaterialThemeCompat === 'function') {
            const autoAdapt = settings.materialAutoAdaptTheme !== false;
            window._autoAdaptTheme = autoAdapt; // 同步到全局，供其他回调读取
            const result = checkMaterialThemeCompat(userMaterial, currentTheme, autoAdapt);
            effectiveMaterial = result.effective;
            if (result.downgraded) {
                weLog.warn('init', `材质降级: ${userMaterial} → none（主题不匹配），原始选择已保存`);
                // OS 层也同步降级（覆盖 main.js ready-to-show 时设的材质）
                try { await weAPI.setBackgroundMaterial('none'); } catch (e) {}
                // 弹通知提醒用户
                setTimeout(() => {
                    if (typeof showNotification === 'function') {
                        showNotification(`⚠ ${result.reason}`, 4000);
                    }
                }, 2000); // 延迟 2s，等启动画面加载完再弹
            }
        }
        weLog.info('init', `材质: 用户选择=${userMaterial} 生效=${effectiveMaterial}`);

        if (typeof applyBackgroundMaterial === 'function') {
            applyBackgroundMaterial(effectiveMaterial, savedTint, savedOverlay, savedBarTint);
        }
        // 应用背景遮罩透明度（独立于材质，始终生效，用于覆盖背景图片）
        if (typeof applyOverlay === 'function') {
            applyOverlay(settings.materialOverlay ?? 30);
        }
        // 应用背景图片
        if (settings.backgroundImageEnabled && settings.backgroundImage) {
            weLog.info('init', `→ 加载背景图片: ${settings.backgroundImage}`);
            try {
                const dataUrl = await weAPI.getBackgroundImage(settings.backgroundImage);
                if (dataUrl && typeof applyBackgroundImage === 'function') {
                    applyBackgroundImage(dataUrl, settings.backgroundImageOpacity ?? 100);
                    weLog.info('init', '← 背景图片已应用');
                } else {
                    weLog.warn('init', '背景图片 dataUrl 为空或 applyBackgroundImage 未定义');
                }
            } catch (e) { weLog.error('init', '加载背景图片失败', e && e.stack ? e.stack : String(e)); }
        }

        weLog.info('init', '→ 应用字体设置');
        savedFontFamily = settings.fontFamily || 'Microsoft YaHei';
        savedFontSize = settings.fontSize || '16';
        applyFontSettings(savedFontFamily, savedFontSize);
        weLog.info('init', `← 字体: ${savedFontFamily} / ${savedFontSize}`);

        weLog.info('init', '→ 同步编辑器相关全局变量');
        // 同步编辑器相关全局变量（启动时从设置读取）
        if (typeof toolbarShow !== 'undefined') toolbarShow = settings.toolbarShow !== false;
        if (typeof wordCountShow !== 'undefined') wordCountShow = settings.wordCount !== false;
        if (typeof markdownRender !== 'undefined') markdownRender = settings.markdownRender !== false;
        if (typeof smartBracketsEnabled !== 'undefined') smartBracketsEnabled = settings.smartBrackets === true;
        if (typeof tabCloseConfirm !== 'undefined') tabCloseConfirm = settings.tabCloseConfirm !== false;
        weLog.info('init', `← 全局变量: toolbarShow=${toolbarShow} wordCountShow=${wordCountShow} markdownRender=${markdownRender} smartBrackets=${smartBracketsEnabled} tabCloseConfirm=${tabCloseConfirm}`);

        if (settings.autoSave) {
            weLog.info('init', `→ 启用自动保存: ${settings.autoSave}`);
            setupAutoSave(settings.autoSave);
        }

        weLog.info('init', `→ 加载语言: ${settings.language || 'zh_CN'}`);
        await loadLanguage(settings.language || 'zh_CN');
        weLog.info('init', '← 语言加载完成');

        weLog.info('init', '→ 更新文件菜单文本');
        updateFileMenuTexts();

        weLog.info('init', '→ 加载账户');
        // 加载账户
        await loadAccount();
        updateAccountUI();
        weLog.info('init', `← 账户加载完成, currentAccount=${currentAccount ? currentAccount.name || '(有)' : '无'}`);

        // 首次启动时如果没有账户，创建两步向导标签页（语言选择→账户注册）
        if (!currentAccount) {
            weLog.info('init', '无账户，创建向导标签页');
            // 默认语言设为英文
            if ((settings.language || 'zh_CN') !== 'en') {
                try {
                    await loadLanguage('en');
                } catch (e) {
                    weLog.error('init', '首次启动加载英文失败', e && e.stack ? e.stack : String(e));
                }
            }
            setTimeout(() => createAccountTab(true), 300);
        }

        // 账户按钮点击：有账户→跳转设置页账户区；无账户→创建账户标签页
        const accountBtn = document.getElementById('btn-account');
        if (accountBtn) {
            weLog.info('init', '→ 绑定账户按钮点击事件');
            accountBtn.onclick = () => {
                weLog.info('init', `账户按钮点击, currentAccount=${currentAccount ? '有' : '无'}`);
                if (currentAccount) {
                    createSettingsTab();
                    // 切换到账户分区
                    setTimeout(() => {
                        const navItems = document.querySelectorAll('.settings-nav .nav-item');
                        navItems.forEach(n => n.classList.remove('active'));
                        const accountNav = document.querySelector('.settings-nav .nav-item[data-section="account"]');
                        if (accountNav) accountNav.click();
                    }, 50);
                } else {
                    createAccountTab();
                }
            };
        } else {
            weLog.warn('init', 'btn-account 元素不存在');
        }

        weLog.info('init', '→ 初始化状态栏');
        // 先初始化状态栏，确保 createWelcomeTab 调用 switchTab 时结构已就绪
        initStatusBar();

        weLog.info('init', '→ 创建欢迎标签页');
        createWelcomeTab();

        weLog.info('init', '→ 设置拖放');
        setupDragAndDrop();

        weLog.info('init', '→ 初始化标签右键菜单');
        // 初始化标签右键菜单
        setupTabContextMenu();

        weLog.info('init', '→ 初始化文件拖放');
        // 监听最大化/还原：同步 win-maximized 类（tab-manager 也会设置，但这里再次同步以保证事件监听先后顺序不影响）
        weAPI.onMaximizedChanged((isMaximized) => {
            document.body.classList.toggle('is-maximized', isMaximized);
            document.body.classList.toggle('win-maximized', isMaximized);
        });
        // 初始化文件拖放
        initFileDragDrop();

        weLog.info('init', '→ 初始化标题栏更新指示器点击事件');
        // 初始化标题栏更新指示器点击事件
        if (typeof window.initUpdateIndicatorClick === 'function') {
            window.initUpdateIndicatorClick();
        } else {
            weLog.warn('init', 'initUpdateIndicatorClick 未定义');
        }

        weLog.info('init', '→ 检查更新（splash 阶段结果）');
        // 获取 splash 阶段的更新检查结果
        try {
            const result = await weAPI.checkUpdate();
            weLog.info('init', `← 更新检查: success=${result.success} hasUpdate=${result.hasUpdate}`);
            if (result.success && result.hasUpdate && typeof showUpdateIndicator === 'function') {
                showUpdateIndicator(result);
            }
        } catch (e) { weLog.error('init', '检查更新失败', e && e.stack ? e.stack : String(e)); }

        // 监听系统主题变化，自动切换"自动"模式
        if (typeof weAPI !== 'undefined' && weAPI.onSystemThemeChanged) {
            weAPI.onSystemThemeChanged(() => {
                const presetSelect = document.getElementById('color-preset-select');
                if (presetSelect && presetSelect.value === 'auto') {
                    weLog.info('init', '系统主题变化，自动重新应用配色');
                    applyColorPreset('auto', null);
                    if (typeof refreshNodeGraphTheme === 'function') refreshNodeGraphTheme();
                }
            });
        }
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
        prefersDark.addEventListener('change', () => {
            const presetSelect = document.getElementById('color-preset-select');
            if (presetSelect && presetSelect.value === 'auto') {
                weLog.info('init', '系统主题变化（matchMedia），自动重新应用配色');
                applyColorPreset('auto', null);
                if (typeof refreshNodeGraphTheme === 'function') refreshNodeGraphTheme();
            }
        });

        weLog.info('init', '=== window.onload 启动完成 ===');
    } catch (e) {
        weLog.error('init', '!!! window.onload 启动失败 !!!', e && e.stack ? e.stack : String(e));
    }
};

// 初始化状态栏
function initStatusBar() {
    weLog.info('init', '→ initStatusBar');
    const statusBar = document.getElementById('status-bar');
    if (!statusBar) { weLog.warn('init', 'initStatusBar: status-bar 元素不存在'); return; }
    
    statusBar.innerHTML = `
        <div class="status-left">
            <span class="status-item">
                <span class="status-label">${t('status.welcome') || '欢迎'}</span>
            </span>
        </div>
        <div class="status-right">
            <span class="status-item" id="status-words">
                <span class="status-label">${t('ui.words') || '字数'}:</span>
                <span class="status-value">0</span>
            </span>
            <span class="status-item" id="status-chars">
                <span class="status-label">${t('ui.chars') || '字符'}:</span>
                <span class="status-value">0</span>
            </span>
            <span class="status-item" id="status-paragraphs">
                <span class="status-label">${t('ui.paragraphs') || '段落'}:</span>
                <span class="status-value">0</span>
            </span>
            <span class="status-item" id="status-reading-time">
                <span class="status-label">${t('ui.reading_time') || '阅读时间'}:</span>
                <span class="status-value">0分钟</span>
            </span>
        </div>
    `;
}

// 更新状态栏统计
// 缓存状态栏 DOM 引用，避免每次 keystroke 都执行 querySelector 触发布局计算
const _statusEls = {
    words: null, chars: null, paragraphs: null, readingTime: null
};
function _getStatusEl(key) {
    let el = _statusEls[key];
    if (el && el.isConnected) return el;
    const id = { words: '#status-words', chars: '#status-chars', paragraphs: '#status-paragraphs', readingTime: '#status-reading-time' }[key];
    el = id ? document.querySelector(id + ' .status-value') : null;
    _statusEls[key] = el;
    return el;
}
function updateStatusBarStats() {
    // Markdown 模式下使用 markdownEditor
    if (markdownEditor) {
        weLog.debug('init', 'updateStatusBarStats: Markdown 模式');
        const text = markdownEditor.value || '';
        const cleanText = text.replace(/\n$/, '');
        let words = 0;
        if (cleanText.trim()) {
            const chineseChars = (cleanText.match(/[\u4e00-\u9fa5]/g) || []).length;
            const nonChineseText = cleanText.replace(/[\u4e00-\u9fa5]/g, ' ').trim();
            const nonChineseWords = nonChineseText ? nonChineseText.split(/\s+/).filter(Boolean).length : 0;
            words = chineseChars + nonChineseWords;
        }
        const chars = cleanText.length;
        const paragraphs = cleanText.split(/\n\n/).filter(p => p.trim()).length;
        const readingTime = Math.max(1, Math.ceil(words / 200));

        const wordsEl = _getStatusEl('words');
        const charsEl = _getStatusEl('chars');
        const paragraphsEl = _getStatusEl('paragraphs');
        const readingTimeEl = _getStatusEl('readingTime');
        if (wordsEl) wordsEl.textContent = words;
        if (charsEl) charsEl.textContent = chars;
        if (paragraphsEl) paragraphsEl.textContent = paragraphs;
        if (readingTimeEl) readingTimeEl.textContent = readingTime + '分钟';
        return;
    }

    if (!quill) return;

    weLog.debug('init', 'updateStatusBarStats: Quill 模式');
    const text = quill.getText();
    const cleanText = text.replace(/\n$/, '');
    // 字数：中文按字符计，英文按单词计
    let words = 0;
    if (cleanText.trim()) {
        const chineseChars = (cleanText.match(/[\u4e00-\u9fa5]/g) || []).length;
        const nonChineseText = cleanText.replace(/[\u4e00-\u9fa5]/g, ' ').trim();
        const nonChineseWords = nonChineseText ? nonChineseText.split(/\s+/).filter(Boolean).length : 0;
        words = chineseChars + nonChineseWords;
    }
    const chars = cleanText.length;
    // 段落：Quill 每个块（p/h1/h2/li 等）对应一个 \n，用 getLines() 统计非空行
    const lines = quill.getLines();
    let paragraphs = 0;
    for (const line of lines) {
        const lineText = line.domNode?.textContent || '';
        if (lineText.trim()) paragraphs++;
    }
    const readingTime = Math.max(1, Math.ceil(words / 200));

    const wordsEl = _getStatusEl('words');
    const charsEl = _getStatusEl('chars');
    const paragraphsEl = _getStatusEl('paragraphs');
    const readingTimeEl = _getStatusEl('readingTime');

    if (wordsEl) wordsEl.textContent = words;
    if (charsEl) charsEl.textContent = chars;
    if (paragraphsEl) paragraphsEl.textContent = paragraphs;
    if (readingTimeEl) readingTimeEl.textContent = readingTime + '分钟';
}

// 暴露到全局以便其他模块调用
window.initStatusBar = initStatusBar;
window.updateStatusBarStats = updateStatusBarStats;

