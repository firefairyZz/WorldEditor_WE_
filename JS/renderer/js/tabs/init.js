// 全局通知
let notificationTimer = null;
function showNotification(message) {
    const bar = document.getElementById('notification-bar');
    if (!bar) return;
    bar.textContent = message;
    bar.classList.add('show');
    clearTimeout(notificationTimer);
    notificationTimer = setTimeout(() => bar.classList.remove('show'), 2000);
}

// 启动
window.onload = async () => {
    const settings = await weAPI.getSettings();
    // 先应用配色预设（会同时设置主题）
    if (typeof applyColorPreset === 'function') {
        applyColorPreset(settings.colorPreset || 'default-dark', settings.customColors);
    } else {
        currentTheme = settings.theme || 'dark';
        applyTheme(currentTheme);
    }
    savedFontFamily = settings.fontFamily || 'Microsoft YaHei';
    savedFontSize = settings.fontSize || '16';
    applyFontSettings(savedFontFamily, savedFontSize);
    if (settings.autoSave) setupAutoSave(settings.autoSave);
    await loadLanguage(settings.language || 'zh_CN');
    updateFileMenuTexts();
    
    // 加载账户
    await loadAccount();
    updateAccountUI();
    
    // 首次启动时如果没有账户，创建账户注册标签页
    if (!currentAccount) {
        setTimeout(() => createAccountTab(), 300);
    }
    
    // 账户按钮点击：有账户→跳转设置页账户区；无账户→创建账户标签页
    const accountBtn = document.getElementById('btn-account');
    if (accountBtn) {
        accountBtn.onclick = () => {
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
    }
    
    // 先初始化状态栏，确保 createWelcomeTab 调用 switchTab 时结构已就绪
    initStatusBar();
    
    createWelcomeTab();
    setupDragAndDrop();
    
    // 初始化标签右键菜单
    setupTabContextMenu();
    
    // 初始化文件拖放
    initFileDragDrop();
};

// 初始化状态栏
function initStatusBar() {
    const statusBar = document.getElementById('status-bar');
    if (!statusBar) return;
    
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
function updateStatusBarStats() {
    // Markdown 模式下使用 markdownEditor
    if (markdownEditor) {
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

        const wordsEl = document.querySelector('#status-words .status-value');
        const charsEl = document.querySelector('#status-chars .status-value');
        const paragraphsEl = document.querySelector('#status-paragraphs .status-value');
        const readingTimeEl = document.querySelector('#status-reading-time .status-value');
        if (wordsEl) wordsEl.textContent = words;
        if (charsEl) charsEl.textContent = chars;
        if (paragraphsEl) paragraphsEl.textContent = paragraphs;
        if (readingTimeEl) readingTimeEl.textContent = readingTime + '分钟';
        return;
    }

    if (!quill) return;

    const text = quill.getText();
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const chars = text.length;
    const paragraphs = text.split('\n\n').filter(p => p.trim()).length;
    const readingTime = Math.max(1, Math.ceil(words / 200));

    const wordsEl = document.querySelector('#status-words .status-value');
    const charsEl = document.querySelector('#status-chars .status-value');
    const paragraphsEl = document.querySelector('#status-paragraphs .status-value');
    const readingTimeEl = document.querySelector('#status-reading-time .status-value');

    if (wordsEl) wordsEl.textContent = words;
    if (charsEl) charsEl.textContent = chars;
    if (paragraphsEl) paragraphsEl.textContent = paragraphs;
    if (readingTimeEl) readingTimeEl.textContent = readingTime + '分钟';
}

// 暴露到全局以便 editor.js 调用
window.updateStatusBarStats = updateStatusBarStats;