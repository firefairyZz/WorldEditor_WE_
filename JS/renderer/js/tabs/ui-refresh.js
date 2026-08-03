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
    // 导航项
    container.querySelector('.nav-item[data-section="general"]').textContent = t('ui.general');
    const tagsNav = container.querySelector('.nav-item[data-section="tags"]');
    if (tagsNav) tagsNav.textContent = t('ui.tags_settings') || '标签';
    const accountNav = container.querySelector('.nav-item[data-section="account"]');
    if (accountNav) accountNav.textContent = t('ui.account') || '账户';
    const appearanceNav = container.querySelector('.nav-item[data-section="appearance"]');
    if (appearanceNav) appearanceNav.textContent = t('ui.appearance') || '外观';
    container.querySelector('.nav-item[data-section="editor"]').textContent = t('ui.editor');
    const shortcutsNav = container.querySelector('.nav-item[data-section="shortcuts"]');
    if (shortcutsNav) shortcutsNav.textContent = t('ui.shortcuts') || '快捷键';
    container.querySelector('.nav-item[data-section="about"]').textContent = t('ui.about');

    // 通用区
    const general = container.querySelector('#section-general');
    general.querySelector('h3').textContent = t('ui.general');
    const generalSpans = general.querySelectorAll('.setting-row > span');
    generalSpans[0].textContent = t('ui.language');
    generalSpans[1].textContent = t('ui.auto_save') || '自动保存';
    generalSpans[2].textContent = t('ui.tab_close_confirm') || '关闭标签确认';
    generalSpans[3].textContent = t('ui.always_on_top') || '窗口置顶';

    // 外观区：背景材质组
    const appearance = container.querySelector('#section-appearance');
    if (appearance) {
        const bgGroupTitle = appearance.querySelector('#bg-material-group .setting-group-title');
        if (bgGroupTitle) bgGroupTitle.textContent = t('ui.background_material') || '背景材质';
        const appearanceSpans = appearance.querySelectorAll('#bg-material-group .setting-row > span');
        if (appearanceSpans[0]) appearanceSpans[0].textContent = t('ui.bg_material') || '材质';
        if (appearanceSpans[1]) appearanceSpans[1].textContent = t('ui.bg_tint') || '内容区透明度';
        if (appearanceSpans[2]) appearanceSpans[2].textContent = t('ui.bg_overlay') || '遮罩透明度';
        if (appearanceSpans[3]) appearanceSpans[3].textContent = t('ui.bg_bar_tint') || '标题栏透明度';
        const bgmSelect = appearance.querySelector('#bg-material-select');
        if (bgmSelect) {
            // option 顺序：none / mica / acrylic / tabbed（无 transparent）
            bgmSelect.options[0].text = t('ui.bg_none') || '无';
            bgmSelect.options[1].text = t('ui.bg_mica') || '云母 (Mica)';
            bgmSelect.options[2].text = t('ui.bg_acrylic') || '亚克力 (Acrylic)';
            bgmSelect.options[3].text = t('ui.bg_tabbed') || '标签式 (Tabbed)';
        }
    }

    // 标签区
    const tagsSection = container.querySelector('#section-tags');
    if (tagsSection) {
        tagsSection.querySelector('h3').textContent = t('ui.tags_settings') || '标签';
        const tagGroupTitle = tagsSection.querySelector('.setting-group-title');
        if (tagGroupTitle) tagGroupTitle.textContent = t('ui.pinned_tags') || '固定标签';
        const tagHint = tagsSection.querySelector('.setting-hint');
        if (tagHint) tagHint.textContent = t('ui.pinned_tags_hint') || '固定标签会在所有项目的标签选择器中显示为快捷选项';
        const tagLabelInput = tagsSection.querySelector('#pinned-tag-label');
        if (tagLabelInput) tagLabelInput.placeholder = t('ui.tag_label_placeholder') || '标签名称';
        const noEmojiOpt = tagsSection.querySelector('#pinned-tag-emoji option[value=""]');
        if (noEmojiOpt) noEmojiOpt.textContent = t('ui.no_emoji') || '无';
        const addTagBtn = tagsSection.querySelector('#btn-add-pinned-tag');
        if (addTagBtn) addTagBtn.textContent = t('ui.add') || '添加';
    }

    // 账户区
    const accountSection = container.querySelector('#section-account');
    if (accountSection) {
        accountSection.querySelector('h3').textContent = t('ui.account') || '账户';
        const uploadBtn = accountSection.querySelector('#btn-change-avatar');
        if (uploadBtn) uploadBtn.textContent = t('ui.upload_avatar') || '上传头像';
        const removeBtn = accountSection.querySelector('#btn-remove-avatar');
        if (removeBtn) removeBtn.textContent = t('ui.remove_avatar') || '移除头像';
        const copyBtn = accountSection.querySelector('#btn-copy-id');
        if (copyBtn) { copyBtn.textContent = t('ui.copy') || '复制'; copyBtn.title = t('ui.copy') || '复制'; }
        const accLabels = accountSection.querySelectorAll('.settings-account-label');
        if (accLabels.length >= 3) {
            accLabels[1].textContent = t('ui.account_name') || '账户名称';
            accLabels[2].textContent = t('ui.display_name') || '显示名称';
        }
        const editBtns = accountSection.querySelectorAll('.settings-account-edit-btn');
        editBtns.forEach(btn => btn.textContent = t('ui.edit') || '修改');
        const accNameVal = accountSection.querySelector('#display-account-name');
        if (accNameVal) accNameVal.textContent = (typeof currentAccount !== 'undefined' && currentAccount?.name) ? currentAccount.name : (t('ui.not_set') || '未设置');
        const accDisplayVal = accountSection.querySelector('#display-account-display');
        if (accDisplayVal) accDisplayVal.textContent = (typeof currentAccount !== 'undefined' && currentAccount?.displayName) ? currentAccount.displayName : (t('ui.not_set') || '未设置');
    }

    // 外观区（材质组已在上方处理，这里处理配色/自定义颜色组）
    const appearanceSection = container.querySelector('#section-appearance');
    if (appearanceSection) {
        appearanceSection.querySelector('h3').textContent = t('ui.appearance') || '外观';
        const appGroupTitles = appearanceSection.querySelectorAll('.setting-group-title');
        if (appGroupTitles[0]) appGroupTitles[0].textContent = t('ui.color_preset') || '主题配色';
        if (appGroupTitles[1]) appGroupTitles[1].textContent = t('ui.custom_colors') || '自定义颜色';
        const schemeSpan = appearanceSection.querySelector('.setting-row span');
        if (schemeSpan) schemeSpan.textContent = t('ui.color_scheme') || '配色方案';
        const optgroups = appearanceSection.querySelectorAll('#color-preset-select optgroup');
        if (optgroups[0]) optgroups[0].label = t('ui.group_light') || '亮色主题';
        if (optgroups[1]) optgroups[1].label = t('ui.group_dark') || '暗色主题';
        const presetSelect = appearanceSection.querySelector('#color-preset-select');
        if (presetSelect) {
            const lightOpt = presetSelect.querySelector('option[value="default-light"]');
            if (lightOpt) lightOpt.textContent = t('ui.theme_default_light') || '默认亮色';
            const darkOpt = presetSelect.querySelector('option[value="default-dark"]');
            if (darkOpt) darkOpt.textContent = t('ui.theme_default_dark') || '默认暗色';
            const customOpt = presetSelect.querySelector('option[value="custom"]');
            if (customOpt) customOpt.textContent = t('ui.theme_custom') || '自定义';
        }
        const colorLabels = appearanceSection.querySelectorAll('.color-picker-item label');
        const colorKeys = ['color_bg_main', 'color_bg_sidebar', 'color_bg_toolbar', 'color_text', 'color_text_secondary', 'color_accent', 'color_border', 'color_gap'];
        colorLabels.forEach((label, i) => {
            if (i < colorKeys.length) label.textContent = t('ui.' + colorKeys[i]) || label.textContent;
        });
        const resetBtn = appearanceSection.querySelector('#btn-reset-colors');
        if (resetBtn) resetBtn.textContent = t('ui.reset_colors') || '重置为默认';
    }

    // 编辑器区
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
        const fontSpans = groups[0].querySelectorAll('.setting-row > span');
        fontSpans[0].textContent = t('ui.font');
        fontSpans[1].textContent = t('ui.font_size');
        // 自动保存组: 自动保存, 关闭标签确认
        const saveSpans = groups[1].querySelectorAll('.setting-row > span');
        saveSpans[0].textContent = t('ui.auto_save');
        saveSpans[1].textContent = t('ui.tab_close_confirm') || '关闭标签确认';
        // 工具组: 字数统计, 显示工具栏, 启用 Markdown
        const toolSpans = groups[2].querySelectorAll('.setting-row > span');
        toolSpans[0].textContent = t('ui.word_count');
        toolSpans[1].textContent = t('ui.toolbar_show') || '显示工具栏';
        toolSpans[2].textContent = t('ui.markdown_render') || '启用 Markdown 渲染';
    }

    // 关于区
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

    // 底部按钮
    const applyBtn = container.querySelector('.settings-apply-btn');
    if (applyBtn) applyBtn.textContent = t('ui.apply');
    const deleteAccBtn = container.querySelector('#footer-btn-delete-account');
    if (deleteAccBtn) deleteAccBtn.textContent = t('ui.delete_account') || '删除账户';

    const autoSaveSelect = container.querySelector('#auto-save-select');
    if (autoSaveSelect) {
        autoSaveSelect.options[0].textContent = t('ui.off');
        autoSaveSelect.options[1].textContent = '5 ' + t('ui.minutes');
        autoSaveSelect.options[2].textContent = '10 ' + t('ui.minutes');
        autoSaveSelect.options[3].textContent = '15 ' + t('ui.minutes');
    }
}