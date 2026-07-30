function refreshAllUITexts() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        if (el.dataset.i18nTitleActive && el.classList.contains('active')) {
            el.title = t(el.dataset.i18nTitleActive);
        } else {
            el.title = t(el.dataset.i18nTitle);
        }
    });
    updateFileMenuTexts();
    if (tabs['welcome']) {
        const welcomePage = tabs['welcome'].element.querySelector('.welcome-new');
        if (welcomePage) {
            welcomePage.querySelectorAll('.action-btn').forEach(btn => {
                const icon = btn.querySelector('.action-icon').textContent;
                const label = btn.querySelector('.action-label');
                if (icon === '📂') label.textContent = t('ui.open_folder');
                else if (icon === '📄') label.textContent = t('ui.new_project');
                else if (icon === '✏️') label.textContent = t('ui.new_file');
            });
            const recentTitle = welcomePage.querySelector('.recent-title');
            if (recentTitle) recentTitle.textContent = t('ui.recent_projects');
        }
    }
    if (tabs['settings']) refreshSettingsTexts(tabs['settings'].element);
    for (const id in tabs) {
        const tab = tabs[id].tabElement;
        if (!tab) continue;
        let newTitle = '';
        if (id === 'welcome') newTitle = t('ui.welcome_tab');
        else if (id === 'settings') newTitle = t('ui.settings');
        else if (id === 'new-project') newTitle = t('ui.new_project_tab');
        if (newTitle) {
            const closeBtn = tab.querySelector('.close-tab');
            if (closeBtn) {
                closeBtn.remove();
                tab.textContent = newTitle;
                tab.appendChild(closeBtn);
            } else {
                tab.textContent = newTitle;
            }
        }
    }
}

function refreshSettingsTexts(container) {
    container.querySelector('.nav-item[data-section="general"]').textContent = t('ui.general');
    container.querySelector('.nav-item[data-section="editor"]').textContent = t('ui.editor');
    const shortcutsNav = container.querySelector('.nav-item[data-section="shortcuts"]');
    if (shortcutsNav) shortcutsNav.textContent = t('ui.shortcuts') || '快捷键';
    container.querySelector('.nav-item[data-section="about"]').textContent = t('ui.about');
    const general = container.querySelector('#section-general');
    general.querySelector('h3').textContent = t('ui.general');
    const generalSpans = general.querySelectorAll('.setting-row span');
    generalSpans[0].textContent = t('ui.language');
    generalSpans[1].textContent = t('ui.theme');
    const editor = container.querySelector('#section-editor');
    editor.querySelector('h3').textContent = t('ui.editor');
    // 刷新分组标题
    const groupTitles = editor.querySelectorAll('.setting-group-title');
    if (groupTitles.length >= 3) {
        groupTitles[0].textContent = t('ui.font_group') || '字体';
        groupTitles[1].textContent = t('ui.auto_save_group') || '自动保存';
        groupTitles[2].textContent = t('ui.tools_group') || '工具';
    }
    // 刷新各设置项标签
    const groups = editor.querySelectorAll('.setting-group');
    if (groups.length >= 3) {
        // 字体组: 字体, 字体大小
        const fontSpans = groups[0].querySelectorAll('.setting-row span');
        fontSpans[0].textContent = t('ui.font');
        fontSpans[1].textContent = t('ui.font_size');
        // 自动保存组: 自动保存, 关闭标签确认
        const saveSpans = groups[1].querySelectorAll('.setting-row span');
        saveSpans[0].textContent = t('ui.auto_save');
        saveSpans[1].textContent = t('ui.tab_close_confirm') || '关闭标签确认';
        // 工具组: 字数统计, 显示工具栏, 启用 Markdown
        const toolSpans = groups[2].querySelectorAll('.setting-row span');
        toolSpans[0].textContent = t('ui.word_count');
        toolSpans[1].textContent = t('ui.toolbar_show') || '显示工具栏';
        toolSpans[2].textContent = t('ui.markdown_render') || '启用 Markdown 渲染';
    }
    const about = container.querySelector('#section-about');
    about.querySelector('h3').textContent = t('ui.about');
    const aboutPs = about.querySelectorAll('p');
    // 保留 span#about-version 结构，只更新前缀文本
    const verSpan = aboutPs[0].querySelector('#about-version');
    if (verSpan) {
        aboutPs[0].textContent = 'World Editor ';
        aboutPs[0].appendChild(verSpan);
    }
    aboutPs[1].textContent = t('ui.about_desc');
    const applyBtn = container.querySelector('.settings-apply-btn');
    if (applyBtn) applyBtn.textContent = t('ui.apply');
    const themeSelect = container.querySelector('#theme-select');
    if (themeSelect) {
        themeSelect.options[0].textContent = t('ui.dark');
        themeSelect.options[1].textContent = t('ui.light');
    }
    const autoSaveSelect = container.querySelector('#auto-save-select');
    if (autoSaveSelect) {
        autoSaveSelect.options[0].textContent = t('ui.off');
        autoSaveSelect.options[1].textContent = '5 ' + t('ui.minutes');
        autoSaveSelect.options[2].textContent = '10 ' + t('ui.minutes');
        autoSaveSelect.options[3].textContent = '15 ' + t('ui.minutes');
    }
}