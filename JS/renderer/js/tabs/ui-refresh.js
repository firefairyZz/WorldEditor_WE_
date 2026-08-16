function refreshAllUITexts() {
    weLog.info('ui-refresh', '→ refreshAllUITexts 开始');
    try {
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
        if (typeof updateEditMenuTexts === 'function') updateEditMenuTexts();
        if (tabs['welcome']) {
            weLog.info('ui-refresh', 'refreshAllUITexts: 刷新 welcome 标签');
            const welcomePage = tabs['welcome'].element.querySelector('.welcome-new');
            if (welcomePage) {
                welcomePage.querySelectorAll('.action-label[data-label-key]').forEach(label => {
                    label.textContent = t(label.dataset.labelKey);
                });
                // 刷新所有 .recent-title（固定项目和最近项目）
                const recentTitles = welcomePage.querySelectorAll('.recent-title');
                if (recentTitles.length > 0) recentTitles[0].textContent = t('ui.pinned_projects');
                if (recentTitles.length > 1) recentTitles[1].textContent = t('ui.recent_projects');
                // 刷新项目列表中的时间文本（重新加载项目列表）
                if (typeof window.refreshRecentProjects === 'function') {
                    window.refreshRecentProjects();
                }
            } else {
                weLog.warn('ui-refresh', 'refreshAllUITexts: welcome 页面元素不存在');
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
            else if (id === 'account') newTitle = t('ui.define_world') || '定义世界';
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
        // 刷新状态栏
        refreshStatusBarTexts();
        // 刷新工具栏
        refreshToolbarTexts();
        // 刷新所有已打开项目的侧边栏文本
        refreshProjectTexts();
        weLog.info('ui-refresh', '← refreshAllUITexts 完成');
    } catch (e) {
        weLog.error('ui-refresh', 'refreshAllUITexts 失败', e && e.stack ? e.stack : String(e));
        throw e;
    }
}

function refreshStatusBarTexts() {
    const statusBar = document.getElementById('status-bar');
    if (!statusBar) return;
    const welcomeLabel = statusBar.querySelector('.status-left .status-label');
    if (welcomeLabel) welcomeLabel.textContent = t('status.welcome') || '欢迎';
    const statusLabels = {
        'status-words': 'ui.words',
        'status-chars': 'ui.chars',
        'status-paragraphs': 'ui.paragraphs',
        'status-reading-time': 'ui.reading_time'
    };
    for (const [id, key] of Object.entries(statusLabels)) {
        const el = statusBar.querySelector(`#${id} .status-label`);
        if (el) el.textContent = t(key);
    }
}

function refreshToolbarTexts() {
    const toolbar = document.getElementById('quill-toolbar');
    if (!toolbar) return;
    // 标题下拉
    const header = toolbar.querySelector('.ql-header');
    if (header) {
        const opts = header.querySelectorAll('option');
        const keys = ['ui.normal', 'ui.heading1', 'ui.heading2', 'ui.heading3'];
        opts.forEach((opt, i) => { if (i < keys.length) opt.textContent = t(keys[i]); });
    }
    // 按钮 titles
    const titleMap = {
        'ql-bold': 'ui.bold',
        'ql-italic': 'ui.italic',
        'ql-underline': 'ui.underline',
        'ql-strike': 'ui.strike',
        'ql-color': 'ui.text_color',
        'ql-background': 'ui.background_color',
        'ql-list[value="ordered"]': 'ui.ordered_list',
        'ql-list[value="bullet"]': 'ui.bullet_list',
        'ql-list[value="check"]': 'ui.check_list',
        'ql-blockquote': 'ui.quote',
        'ql-code-block': 'ui.code_block',
        'ql-align': 'ui.align',
        'ql-link': 'ui.link',
        'btn-insert-card': 'ui.insert_card',
        'btn-history': 'ui.ng_history',
        'btn-export-md': 'ui.export',
        'btn-toggle-toc': 'ui.toggle_toc'
    };
    for (const [sel, key] of Object.entries(titleMap)) {
        const el = toolbar.querySelector('.' + sel);
        if (el) el.title = t(key);
    }
}

function refreshSettingsTexts(container) {
    weLog.info('ui-refresh', '→ refreshSettingsTexts 开始');
    try {
    // 导航项（保留图标 SVG，只更新文本）
    function updateNavItemText(selector, text) {
        const el = container.querySelector(selector);
        if (!el) return;
        const icon = el.querySelector('svg');
        el.innerHTML = '';
        if (icon) el.appendChild(icon);
        el.appendChild(document.createTextNode(text));
    }
    updateNavItemText('.nav-item[data-section="general"]', t('ui.general'));
    const tagsNav = container.querySelector('.nav-item[data-section="tags"]');
    if (tagsNav) updateNavItemText('.nav-item[data-section="tags"]', t('ui.tags_settings') || '标签');
    const accountNav = container.querySelector('.nav-item[data-section="account"]');
    if (accountNav) updateNavItemText('.nav-item[data-section="account"]', t('ui.account') || '账户');
    const appearanceNav = container.querySelector('.nav-item[data-section="appearance"]');
    if (appearanceNav) updateNavItemText('.nav-item[data-section="appearance"]', t('ui.appearance') || '外观');
    updateNavItemText('.nav-item[data-section="editor"]', t('ui.editor'));
    const shortcutsNav = container.querySelector('.nav-item[data-section="shortcuts"]');
    if (shortcutsNav) updateNavItemText('.nav-item[data-section="shortcuts"]', t('ui.shortcuts') || '快捷键');
    updateNavItemText('.nav-item[data-section="about"]', t('ui.about'));

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
            const autoOpt = presetSelect.querySelector('option[value="auto"]');
            if (autoOpt) autoOpt.textContent = t('ui.theme_auto') || '自动';
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
    if (editor) {
        editor.querySelector('h3').textContent = t('ui.editor');
        // 刷新分组标题
        const groupTitles = editor.querySelectorAll('.setting-group-title');
        groupTitles.forEach((el, i) => {
            const keys = ['font_group', 'tools_group', 'node_graph_group'];
            if (i < keys.length) el.textContent = t('ui.' + keys[i]) || el.textContent;
        });
        // 刷新各设置项标签
        const groups = editor.querySelectorAll('.setting-group');
        // 字体组: 字体, 字体大小
        if (groups[0]) {
            const fontSpans = groups[0].querySelectorAll('.setting-row > span');
            if (fontSpans[0]) fontSpans[0].textContent = t('ui.font');
            if (fontSpans[1]) fontSpans[1].textContent = t('ui.font_size');
        }
        // 工具组: 字数统计, 显示工具栏, 启用 Markdown, 智能括号
        if (groups[1]) {
            const toolSpans = groups[1].querySelectorAll('.setting-row > span');
            const toolKeys = ['word_count', 'toolbar_show', 'markdown_render', 'smart_brackets'];
            toolSpans.forEach((span, i) => {
                if (i < toolKeys.length) span.textContent = t('ui.' + toolKeys[i]) || span.textContent;
            });
        }
        // 节点图组: 默认创建隐藏箭头连线
        if (groups[2]) {
            const ngSpans = groups[2].querySelectorAll('.setting-row > span');
            if (ngSpans[0]) ngSpans[0].textContent = t('ui.ng_hide_arrow_default') || ngSpans[0].textContent;
        }
    }

    // 关于区
    const about = container.querySelector('#section-about');
    if (about) {
        const aboutH3 = about.querySelector('h3');
        if (aboutH3) aboutH3.textContent = t('ui.about');
        const aboutPs = about.querySelectorAll('p');
        if (aboutPs[0]) {
            const verSpan = aboutPs[0].querySelector('#about-version');
            if (verSpan) {
                aboutPs[0].textContent = 'World Editor ';
                aboutPs[0].appendChild(verSpan);
            }
        }
        if (aboutPs[1]) aboutPs[1].textContent = t('ui.about_desc');
    }

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
    weLog.info('ui-refresh', '← refreshSettingsTexts 完成');
    } catch (e) {
        weLog.error('ui-refresh', 'refreshSettingsTexts 失败', e && e.stack ? e.stack : String(e));
        throw e;
    }
}

function refreshProjectTexts() {
    weLog.info('ui-refresh', '→ refreshProjectTexts 开始');
    try {
        for (const id in tabs) {
            const tab = tabs[id];
            if (!tab || !tab.projectPath) continue;
            const root = tab.element;
            if (!root) continue;

            // 项目名称 title
            const nameEl = root.querySelector('.project-name-editable');
            if (nameEl) nameEl.title = t('ui.double_click_rename') || '双击重命名';

            // 搜索栏
            const searchToggle = root.querySelector('.search-toggle-btn');
            if (searchToggle) searchToggle.title = t('ui.search_placeholder') || 'Search...';

            const sortToggle = root.querySelector('.sort-toggle-btn');
            if (sortToggle) sortToggle.title = t('ui.sort_asc') || '升序';

            const searchInput = root.querySelector('.search-input');
            if (searchInput) searchInput.placeholder = t('ui.search_placeholder') || 'Search...';

            // 搜索筛选按钮
            const filterToggles = root.querySelectorAll('.search-filter-toggle');
            const filterKeys = ['ui.search_file', 'ui.search_folder', 'ui.search_tag', 'ui.search_content'];
            const filterDefaults = ['File', 'Folder', 'Tag', 'Content'];
            filterToggles.forEach((btn, i) => {
                if (i < filterKeys.length) btn.textContent = t(filterKeys[i]) || filterDefaults[i];
            });

            // 添加文件按钮
            const addFileBtn = root.querySelector('[id^="btn-add-file-"]');
            if (addFileBtn) addFileBtn.textContent = '+ ' + (t('ui.new_file') || '新建文件');

            // 固定/删除项目按钮
            const pinBtn = root.querySelector('.btn-pin-project');
            if (pinBtn) {
                const isActive = pinBtn.classList.contains('active');
                pinBtn.title = t(isActive ? 'ui.unpin_project' : 'ui.pin_project') || (isActive ? '取消固定' : '固定项目');
            }

            const deleteBtn = root.querySelector('.btn-delete-project');
            if (deleteBtn) deleteBtn.title = t('ui.delete_project') || '删除项目';

            // 账户信息标签
            const infoLabels = root.querySelectorAll('.account-info-label');
            infoLabels.forEach(label => {
                const text = label.textContent.trim();
                if (text === '创作者:' || text === 'Creator:' || text.match(/^创作者/) || text.match(/^Creator/)) {
                    label.textContent = t('ui.creator') || '创作者' + ':';
                } else if (text === '当前用户:' || text === 'Current user:' || text.match(/^当前用户/) || text.match(/^Current user/)) {
                    label.textContent = t('ui.current_user') || '当前用户' + ':';
                }
            });
        }
        weLog.info('ui-refresh', '← refreshProjectTexts 完成');
    } catch (e) {
        weLog.error('ui-refresh', 'refreshProjectTexts 失败', e && e.stack ? e.stack : String(e));
    }
}