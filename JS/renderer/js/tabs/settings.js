let APP_VERSION = '...'; // 由 weAPI.getVersion() 动态填充

// 简易 Markdown 渲染器（无需外部依赖）
let __mdAnchors = [];
function renderMarkdown(md) {
    weLog.debug('settings', '→ renderMarkdown 开始', { mdLength: md ? md.length : 0 });
    __mdAnchors = [];
    const lines = md.split(/\r?\n/);
    const out = [];
    let inCode = false, codeBuf = [], codeLang = '';
    let inList = false, listType = '', listBuf = [];
    let inQuote = false, quoteBuf = [];
    // 空行暂存：列表/引用中的空行不立即结束列表，而是等待下一行判断
    let pendingBlank = false;

    const flushList = () => {
        if (!listBuf.length) return;
        const tag = listType === 'ol' ? 'ol' : 'ul';
        out.push(`<${tag}>`);
        for (const li of listBuf) out.push(`<li>${inline(li)}</li>`);
        out.push(`</${tag}>`);
        listBuf = []; listType = ''; inList = false;
    };
    const flushQuote = () => {
        if (!quoteBuf.length) return;
        out.push('<blockquote>' + quoteBuf.map(l => `<p>${inline(l)}</p>`).join('') + '</blockquote>');
        quoteBuf = []; inQuote = false;
    };
    const flushPending = () => {
        if (pendingBlank) { pendingBlank = false; }
    };

    for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i];
        const line = rawLine.trimEnd();

        if (inCode) {
            if (line.trim().startsWith('```')) {
                out.push('<pre><code>' + escapeHtml(codeBuf.join('\n')) + '</code></pre>');
                inCode = false; codeBuf = []; codeLang = '';
            } else {
                codeBuf.push(rawLine);
            }
            continue;
        }

        if (line.trim().startsWith('```')) {
            flushList(); flushQuote(); flushPending();
            inCode = true;
            codeLang = line.trim().slice(3).trim();
            continue;
        }

        // 空行处理：在列表/引用中暂存，等下一行判断是否继续同一列表/引用
        if (!line.trim()) {
            if (inList || inQuote) {
                pendingBlank = true;
            } else {
                flushList(); flushQuote();
            }
            continue;
        }

        // 如果当前行不是列表/引用，且之前有暂存空行，则结束列表/引用
        const isListItem = /^\s*(\d+\.|[-*+])\s+/.test(line);
        const isQuoteLine = line.startsWith('>');

        if (pendingBlank) {
            if (inList && !isListItem) {
                flushList();
                pendingBlank = false;
            } else if (inQuote && !isQuoteLine) {
                flushQuote();
                pendingBlank = false;
            } else {
                pendingBlank = false;
            }
        }

        // heading
        const h = line.match(/^(#{1,6})\s+(.*)$/);
        if (h) {
            flushList(); flushQuote();
            const level = h[1].length;
            const text = inline(h[2]);
            const anchor = 'h-' + __mdAnchors.length + '-' + h[2].toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
            __mdAnchors.push({ level, text: h[2], anchor });
            out.push(`<h${level} id="${anchor}" class="md-h md-h-${level}">${text}</h${level}>`);
            continue;
        }

        // hr
        if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flushList(); flushQuote(); out.push('<hr>'); continue; }

        // list
        const li = line.match(/^\s*(\d+\.|[-*+])\s+(.*)$/);
        if (li) {
            const lt = /^\d+\./.test(li[1]) ? 'ol' : 'ul';
            if (inList && listType !== lt) flushList();
            inList = true; listType = lt;
            listBuf.push(li[2]);
            continue;
        }

        // blockquote
        if (line.startsWith('>')) {
            flushList();
            inQuote = true;
            quoteBuf.push(line.replace(/^>\s?/, ''));
            continue;
        }

        // paragraph
        flushList(); flushQuote();
        out.push(`<p>${inline(line)}</p>`);
    }

    flushList(); flushQuote();
    if (inCode) out.push('<pre><code>' + escapeHtml(codeBuf.join('\n')) + '</code></pre>');

    return { html: out.join('\n'), anchors: __mdAnchors };
}

function inline(text) {
    // escape HTML first
    let s = escapeHtml(text);
    // images ![alt](url)
    s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="md-img" />');
    // links [text](url)
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" rel="noopener">$1</a>');
    // bold **x** or __x__
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    // italic *x* or _x_
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    s = s.replace(/_([^_]+)_/g, '<em>$1</em>');
    // inline code `code`
    s = s.replace(/`([^`]+)`/g, '<code class="md-code">$1</code>');
    return s;
}

// 可配置的快捷键列表（排除 goto-tab-2~9，它们跟随 goto-tab-1）
const CONFIGURABLE_SHORTCUTS = [
    'toggle-help', 'toggle-help-alt', 'save', 'new-file', 'open-project',
    'close-tab', 'next-tab', 'prev-tab', 'goto-tab-1', 'find', 'replace',
    'select-all', 'batch-tag'
];

// 构建快捷键设置 HTML
function buildShortcutsSettingsHTML() {
    weLog.debug('settings', '→ buildShortcutsSettingsHTML 开始');
    const groupTitles = {
        file: t('ui.file_operations') || '文件操作',
        tab: t('ui.tab_operations') || '标签操作',
        view: t('ui.view_operations') || '视图操作'
    };

    let html = `<h3>${t('ui.shortcuts') || '快捷键'}</h3>`;
    html += `<p class="shortcut-hint-text">${t('ui.shortcuts_hint') || '点击输入框后按下按键组合来修改快捷键'}</p>`;

    for (const group of ['file', 'tab', 'view']) {
        const items = CONFIGURABLE_SHORTCUTS.filter(a => activeShortcuts[a]?.group === group);
        if (items.length === 0) continue;

        html += `<div class="shortcut-settings-group">`;
        html += `<div class="shortcut-settings-group-title">${groupTitles[group]}</div>`;
        for (const action of items) {
            const sc = activeShortcuts[action];
            let displayKey = action === 'goto-tab-1' ? 'Ctrl + 1~9' : formatShortcutKey(sc);
            let label = t(sc.label) || sc.label;
            if (action === 'goto-tab-1') label = t('ui.goto_tab') || '跳转到指定标签';
            html += `
                <div class="setting-row shortcut-setting-row">
                    <span>${label}</span>
                    <div class="shortcut-input-wrapper">
                        <input type="text" class="shortcut-input" data-action="${action}"
                               value="${displayKey}" readonly placeholder="${t('ui.shortcut_click_to_set') || '点击设置'}">
                        <button class="shortcut-reset-btn" data-action="${action}" title="${t('ui.shortcut_reset') || '恢复默认'}">↺</button>
                    </div>
                </div>
            `;
        }
        html += `</div>`;
    }
    return html;
}

// 绑定快捷键输入捕获事件
function bindShortcutCapture(container) {
    weLog.info('settings', '→ bindShortcutCapture 开始');
    container.querySelectorAll('.shortcut-input').forEach(input => {
        input.addEventListener('focus', () => {
            input.classList.add('recording');
            input.value = t('ui.shortcut_recording') || '按下按键组合...';
        });

        input.addEventListener('keydown', (e) => {
            e.preventDefault();
            e.stopPropagation();

            // Esc 取消录制
            if (e.key === 'Escape') {
                input.blur();
                return;
            }
            // Backspace/Delete 清除
            if (e.key === 'Backspace' || e.key === 'Delete') {
                input.value = '';
                input.dataset.key = '';
                input.dataset.ctrl = '';
                input.dataset.shift = '';
                input.blur();
                return;
            }

            const action = input.dataset.action;
            const defaultSc = DEFAULT_SHORTCUTS[action];
            if (!defaultSc) { input.blur(); return; }

            // 忽略单独的修饰键
            if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

            const key = e.key;
            const ctrl = e.ctrlKey || e.metaKey;
            const shift = e.shiftKey;

            // 检查冲突
            const conflict = checkShortcutConflict(action, key, ctrl, shift);
            if (conflict) {
                showNotification(`${t('ui.shortcut_conflict') || '快捷键冲突'}: ${conflict}`);
                input.blur();
                return;
            }

            // 更新输入框显示
            const tempSc = { key, ctrl, shift };
            input.value = action === 'goto-tab-1' ? `${ctrl ? 'Ctrl + ' : ''}${shift ? 'Shift + ' : ''}1~9` : formatShortcutKey(tempSc);
            input.dataset.key = key;
            input.dataset.ctrl = ctrl;
            input.dataset.shift = shift;
            input.blur();
        });

        input.addEventListener('blur', () => {
            input.classList.remove('recording');
            // 如果没有设置新值，恢复显示当前值
            if (!input.dataset.key) {
                const action = input.dataset.action;
                const sc = activeShortcuts[action];
                if (sc) {
                    input.value = action === 'goto-tab-1' ? 'Ctrl + 1~9' : formatShortcutKey(sc);
                }
            }
        });
    });

    // 重置按钮
    container.querySelectorAll('.shortcut-reset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            const defaultSc = DEFAULT_SHORTCUTS[action];
            if (defaultSc) {
                const input = container.querySelector(`.shortcut-input[data-action="${action}"]`);
                if (input) {
                    input.value = action === 'goto-tab-1' ? 'Ctrl + 1~9' : formatShortcutKey(defaultSc);
                    input.dataset.key = defaultSc.key;
                    input.dataset.ctrl = defaultSc.ctrl;
                    input.dataset.shift = defaultSc.shift;
                }
            }
        });
    });
}

// 检查快捷键冲突
function checkShortcutConflict(action, key, ctrl, shift) {
    weLog.debug('settings', '→ checkShortcutConflict 开始', { action, key, ctrl, shift });
    for (const otherAction in activeShortcuts) {
        if (otherAction === action) continue;
        // goto-tab 系列互相不冲突
        if (action.startsWith('goto-tab-') && otherAction.startsWith('goto-tab-')) continue;
        const sc = activeShortcuts[otherAction];
        if (sc.key.toLowerCase() === key.toLowerCase() && sc.ctrl === ctrl && sc.shift === shift) {
            return otherAction;
        }
    }
    return null;
}

// 从设置 UI 收集自定义快捷键
function collectCustomShortcuts(container) {
    weLog.debug('settings', '→ collectCustomShortcuts 开始');
    const custom = {};
    container.querySelectorAll('.shortcut-input').forEach(input => {
        const action = input.dataset.action;
        if (input.dataset.key) {
            const key = input.dataset.key;
            const ctrl = input.dataset.ctrl === 'true';
            const shift = input.dataset.shift === 'true';
            const defaultSc = DEFAULT_SHORTCUTS[action];

            // 只保存与默认值不同的
            if (!defaultSc || defaultSc.key !== key || defaultSc.ctrl !== ctrl || defaultSc.shift !== shift) {
                custom[action] = { key, ctrl, shift };

                // goto-tab-1 特殊处理：同步所有 goto-tab-2~9
                if (action === 'goto-tab-1') {
                    for (let i = 2; i <= 9; i++) {
                        custom[`goto-tab-${i}`] = { key: String(i), ctrl, shift };
                    }
                }
            }
        }
    });
    return Object.keys(custom).length > 0 ? custom : null;
}

let settingsPanelRef = null;

function refreshSettingsI18n() {
    weLog.info('settings', '→ refreshSettingsI18n 开始');
    if (!settingsPanelRef) {
        weLog.debug('settings', 'refreshSettingsI18n: settingsPanelRef 不存在，跳过');
        return;
    }
    const panel = settingsPanelRef;

    // 导航项
    const navItems = panel.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        const section = item.dataset.section;
        let key = 'ui.' + section;
        if (section === 'shortcuts') key = 'ui.shortcuts';
        if (section === 'about') key = 'ui.about';
        if (section === 'general') key = 'ui.general';
        if (section === 'account') key = 'ui.account';
        if (section === 'appearance') key = 'ui.appearance';
        if (section === 'editor') key = 'ui.editor';
        const translated = t(key);
        if (translated) item.textContent = translated;
    });

    // Section 标题 (h3)
    const sectionTitles = panel.querySelectorAll('.settings-section > h3');
    sectionTitles.forEach(h3 => {
        const section = h3.parentElement.id.replace('section-', '');
        let key = 'ui.' + section;
        if (section === 'shortcuts') key = 'ui.shortcuts';
        const translated = t(key);
        if (translated) h3.textContent = translated;
    });

    // General section
    const generalSection = panel.querySelector('#section-general');
    if (generalSection) {
        const rows = generalSection.querySelectorAll('.setting-row > span');
        if (rows[0]) rows[0].textContent = t('ui.language') || rows[0].textContent;
        if (rows[1]) rows[1].textContent = t('ui.auto_save') || rows[1].textContent;
        if (rows[2]) rows[2].textContent = t('ui.tab_close_confirm') || rows[2].textContent;
        if (rows[3]) rows[3].textContent = t('ui.always_on_top') || rows[3].textContent;

        const autoSaveSelect = generalSection.querySelector('#auto-save-select');
        if (autoSaveSelect) {
            const options = autoSaveSelect.options;
            if (options[0]) options[0].textContent = t('ui.off') || 'Off';
            const minLabel = t('ui.minutes') || 'min';
            if (options[1]) options[1].textContent = `5 ${minLabel}`;
            if (options[2]) options[2].textContent = `10 ${minLabel}`;
            if (options[3]) options[3].textContent = `15 ${minLabel}`;
        }

        // 检查更新区域
        const updateGroupTitle = generalSection.querySelector('#update-check-group .setting-group-title');
        if (updateGroupTitle) { const v = t('ui.update_check'); if (v) updateGroupTitle.textContent = v; }
        const updateBtn = generalSection.querySelector('#btn-check-update');
        if (updateBtn) {
            const span = updateBtn.querySelector('span');
            if (span) { const v = t('ui.check_now'); if (v) span.textContent = v; }
        }
        const updateStatus = generalSection.querySelector('#update-check-status');
        if (updateStatus && !updateStatus.dataset.checked) {
            const v = t('ui.update_check_idle');
            if (v) updateStatus.textContent = v;
        }
    }

    // Account section
    const accountSection = panel.querySelector('#section-account');
    if (accountSection) {
        const uploadBtn = accountSection.querySelector('#btn-change-avatar');
        if (uploadBtn) uploadBtn.textContent = t('ui.upload_avatar') || uploadBtn.textContent;
        const removeBtn = accountSection.querySelector('#btn-remove-avatar');
        if (removeBtn) removeBtn.textContent = t('ui.remove_avatar') || removeBtn.textContent;
        const labels = accountSection.querySelectorAll('.settings-account-label');
        if (labels[0]) labels[0].textContent = 'ID';
        if (labels[1]) labels[1].textContent = t('ui.account_name') || labels[1].textContent;
        if (labels[2]) labels[2].textContent = t('ui.display_name') || labels[2].textContent;
        const editBtns = accountSection.querySelectorAll('.settings-account-edit-btn');
        editBtns.forEach(btn => { btn.textContent = t('ui.edit') || btn.textContent; });
        const copyBtn = accountSection.querySelector('#btn-copy-id');
        if (copyBtn) copyBtn.textContent = t('ui.copy') || copyBtn.textContent;

        // Update value displays if not being edited
        const nameValue = accountSection.querySelector('#display-account-name');
        if (nameValue && !nameValue.querySelector('input')) {
            const val = currentAccount?.name;
            nameValue.textContent = val || t('ui.not_set') || 'Not set';
        }
        const displayValue = accountSection.querySelector('#display-account-display');
        if (displayValue && !displayValue.querySelector('input')) {
            const val = currentAccount?.displayName;
            displayValue.textContent = val || t('ui.not_set') || 'Not set';
        }
    }

    // Appearance section
    const appearanceSection = panel.querySelector('#section-appearance');
    if (appearanceSection) {
        const firstRow = appearanceSection.querySelector('.setting-row > span');
        if (firstRow) firstRow.textContent = t('ui.color_scheme') || firstRow.textContent;
        const optgroups = appearanceSection.querySelectorAll('optgroup');
        if (optgroups[0]) optgroups[0].label = t('ui.group_light') || optgroups[0].label;
        if (optgroups[1]) optgroups[1].label = t('ui.group_dark') || optgroups[1].label;

        // Color preset options
        const options = appearanceSection.querySelectorAll('#color-preset-select > option');
        if (options[1]) { const v = t('ui.theme_default_light'); if (v) options[1].textContent = v; }
        if (options[5]) { const v = t('ui.theme_default_dark'); if (v) options[5].textContent = v; }
        if (options[12]) { const v = t('ui.theme_custom'); if (v) options[12].textContent = v; }

        // Reset button
        const resetBtn = appearanceSection.querySelector('#btn-reset-colors');
        if (resetBtn) resetBtn.textContent = t('ui.reset_colors') || resetBtn.textContent;

        // Color labels
        const colorLabels = appearanceSection.querySelectorAll('.color-picker-item > label');
        const colorKeys = ['ui.color_bg_main', 'ui.color_bg_sidebar', 'ui.color_bg_toolbar',
                          'ui.color_text', 'ui.color_text_secondary', 'ui.color_accent',
                          'ui.color_border', 'ui.color_gap'];
        colorLabels.forEach((lbl, i) => {
            const translated = t(colorKeys[i]);
            if (translated) lbl.textContent = translated;
        });

        // Group title "自定义颜色"
        const customColorsTitle = appearanceSection.querySelector('#custom-colors-group .setting-group-title');
        if (customColorsTitle) {
            const v = t('ui.custom_colors');
            if (v) customColorsTitle.textContent = v;
        }

        // Group title "主题配色"
        const presetGroupTitle = appearanceSection.querySelector('.setting-group-title');
        if (presetGroupTitle) {
            const v = t('ui.color_preset');
            if (v) presetGroupTitle.textContent = v;
        }
    }

    // Editor section
    const editorSection = panel.querySelector('#section-editor');
    if (editorSection) {
        const groupTitles = editorSection.querySelectorAll('.setting-group-title');
        const gtKeys = ['font_group', 'tools_group', 'node_graph_group'];
        groupTitles.forEach((el, i) => {
            if (i < gtKeys.length) { const v = t('ui.' + gtKeys[i]); if (v) el.textContent = v; }
        });

        // Font label
        const rows = editorSection.querySelectorAll('.setting-row');
        if (rows[0]) {
            const span = rows[0].querySelector('span');
            if (span) { const v = t('ui.font'); if (v) span.textContent = v; }
            // Font options
            const fontSelect = rows[0].querySelector('#font-family-select');
            if (fontSelect) {
                const opts = fontSelect.options;
                if (opts[0]) { const v = t('ui.yahei'); if (v) opts[0].textContent = v; }
                if (opts[1]) { const v = t('ui.simsun'); if (v) opts[1].textContent = v; }
                if (opts[2]) { const v = t('ui.simhei'); if (v) opts[2].textContent = v; }
                if (opts[3]) { const v = t('ui.kaiti'); if (v) opts[3].textContent = v; }
            }
        }
        if (rows[1]) {
            const span = rows[1].querySelector('span');
            if (span) { const v = t('ui.font_size'); if (v) span.textContent = v; }
        }
        if (rows[2]) {
            const span = rows[2].querySelector('span');
            if (span) { const v = t('ui.word_count'); if (v) span.textContent = v; }
        }
        if (rows[3]) {
            const span = rows[3].querySelector('span');
            if (span) { const v = t('ui.toolbar_show'); if (v) span.textContent = v; }
        }
        if (rows[4]) {
            const span = rows[4].querySelector('span');
            if (span) { const v = t('ui.markdown_render'); if (v) span.textContent = v; }
        }
        if (rows[5]) {
            const span = rows[5].querySelector('span');
            if (span) { const v = t('ui.smart_brackets'); if (v) span.textContent = v; }
        }
        if (rows[6]) {
            const span = rows[6].querySelector('span');
            if (span) { const v = t('ui.ng_hide_arrow_default'); if (v) span.textContent = v; }
        }
    }

    // Shortcuts section - rebuild from builder
    const shortcutsSection = panel.querySelector('#section-shortcuts');
    if (shortcutsSection) {
        shortcutsSection.innerHTML = buildShortcutsSettingsHTML();
        bindShortcutCapture(shortcutsSection);
    }

    // About section
    const aboutSection = panel.querySelector('#section-about');
    if (aboutSection) {
        const desc = aboutSection.querySelector('.about-info p:nth-child(2)');
        if (desc) { const v = t('ui.about_desc'); if (v) desc.textContent = v; }

        const updateNotesHeader = aboutSection.querySelector('.update-notes-header h4');
        if (updateNotesHeader) { const v = t('ui.update_notes'); if (v) updateNotesHeader.textContent = v; }

        const tocTitle = aboutSection.querySelector('.toc-title');
        if (tocTitle) { const v = t('ui.table_of_contents'); if (v) tocTitle.textContent = v; }

        // Update notes placeholder text (if visible)
        const placeholder = aboutSection.querySelector('.update-notes-placeholder .placeholder-text');
        if (placeholder) {
            const v = t('ui.update_notes_placeholder');
            if (v) placeholder.textContent = v;
        }
    }

    // Footer buttons
    const footer = panel.querySelector('.settings-footer');
    if (footer) {
        const applyBtn = footer.querySelector('.settings-apply-btn');
        if (applyBtn) { const v = t('ui.apply'); if (v) applyBtn.textContent = v; }
        const deleteBtn = footer.querySelector('#footer-btn-delete-account');
        if (deleteBtn) { const v = t('ui.delete_account'); if (v) deleteBtn.textContent = v; }
    }
}

function createSettingsTab() {
    weLog.info('settings', '→ createSettingsTab 开始');
    const id = 'settings';
    if (tabs[id]) { weLog.debug('settings', 'createSettingsTab: 标签已存在，切换过去'); switchTab(id); return; }
    const content = document.createElement('div');
    content.className = 'settings-layout';

    const nav = document.createElement('div');
    nav.className = 'settings-nav';
    nav.innerHTML = `
        <div class="nav-item active" data-section="general">${t('ui.general')}</div>
        <div class="nav-item" data-section="tags">${t('ui.tags_settings') || '标签'}</div>
        <div class="nav-item" data-section="account">${t('ui.account') || '账户'}</div>
        <div class="nav-item" data-section="appearance">${t('ui.appearance') || '外观'}</div>
        <div class="nav-item" data-section="editor">${t('ui.editor')}</div>
        <div class="nav-item" data-section="shortcuts">${t('ui.shortcuts') || '快捷键'}</div>
        <div class="nav-item" data-section="about">${t('ui.about')}</div>
    `;
    const panel = document.createElement('div');
    panel.className = 'settings-panel';
    settingsPanelRef = panel;
    const contentArea = document.createElement('div');
    contentArea.className = 'settings-content';

    const generalSection = document.createElement('div');
    generalSection.className = 'settings-section active';
    generalSection.id = 'section-general';
    generalSection.innerHTML = `
        <h3>${t('ui.general')}</h3>
        <div class="setting-row">
            <span>${t('ui.language')}</span>
            <select id="lang-select">
                <option value="zh_CN">中文</option>
                <option value="en">English</option>
                <option value="ja">日本語</option>
                <option value="ru">Русский</option>
            </select>
        </div>
        <div class="setting-row">
            <span>${t('ui.auto_save') || '自动保存'}</span>
            <select id="auto-save-select">
                <option value="0">${t('ui.off') || '关'}</option>
                <option value="5">5 ${t('ui.minutes') || '分钟'}</option>
                <option value="10">10 ${t('ui.minutes') || '分钟'}</option>
                <option value="15">15 ${t('ui.minutes') || '分钟'}</option>
            </select>
        </div>
        <div class="setting-row">
            <span>${t('ui.tab_close_confirm') || '关闭标签确认'}</span>
            <label class="toggle-switch"><input type="checkbox" id="tab-close-confirm" checked><span class="toggle-slider"></span></label>
        </div>
        <div class="setting-row">
            <span>${t('ui.always_on_top') || '窗口置顶'}</span>
            <label class="toggle-switch"><input type="checkbox" id="always-on-top-toggle"><span class="toggle-slider"></span></label>
        </div>
        <div class="setting-group" id="update-check-group">
            <div class="setting-group-title">${t('ui.update_check') || '检查更新'}</div>
            <div class="update-check-dev-hint" id="update-check-dev-hint" style="display:none"></div>
            <div class="setting-row update-check-row">
                <span id="update-check-status">${t('ui.update_check_idle') || '点击检查是否有新版本'}</span>
                <button id="btn-check-update" class="btn-check-update">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
                    <span>${t('ui.check_now') || '立即检查'}</span>
                </button>
            </div>
            <div class="update-check-detail" id="update-check-detail" style="display:none"></div>
        </div>
    `;

    // 标签设置区域
    const tagsSection = document.createElement('div');
    tagsSection.className = 'settings-section';
    tagsSection.id = 'section-tags';
    tagsSection.innerHTML = `
        <h3>${t('ui.tags_settings') || '标签'}</h3>
        <div class="setting-group">
            <div class="setting-group-title">${t('ui.pinned_tags') || '固定标签'}</div>
            <p class="setting-hint">${t('ui.pinned_tags_hint') || '固定标签会在所有项目的标签选择器中显示为快捷选项'}</p>
            <div class="pinned-tags-editor">
                <div class="pinned-tags-list" id="pinned-tags-list"></div>
                <div class="pinned-tags-add-row">
                    <input type="text" id="pinned-tag-label" maxlength="10" placeholder="${t('ui.tag_label_placeholder') || '标签名称'}" />
                    <input type="color" id="pinned-tag-color" value="#ff6b6b" />
                    <div class="emoji-picker-wrapper">
                        <button type="button" id="pinned-tag-emoji-trigger" class="emoji-trigger-btn" title="${t('ui.tag_emoji') || 'Emoji'}">
                            <span class="emoji-trigger-icon" id="pinned-tag-emoji-display">${t('ui.no_emoji') || '无'}</span>
                        </button>
                        <div class="emoji-popup" id="pinned-tag-emoji-popup" style="display:none;">
                            <div class="popup-section-label">${t('ui.tag_emoji') || 'Emoji'}</div>
                            <div class="popup-emoji-list"></div>
                        </div>
                    </div>
                    <button id="btn-add-pinned-tag">${t('ui.add') || '添加'}</button>
                </div>
            </div>
        </div>
    `;

    // 账户设置区域
    const accountSection = document.createElement('div');
    accountSection.className = 'settings-section';
    accountSection.id = 'section-account';
    const accountName = currentAccount?.name || '';
    const accountDisplayName = currentAccount?.displayName || '';
    const avatarUrl = currentAccount?.avatarDataUrl || '';
    accountSection.innerHTML = `
        <h3>${t('ui.account') || '账户'}</h3>
        <div class="settings-account-layout">
            <div class="settings-account-avatar-preview" id="settings-avatar-preview">
                ${avatarUrl ? `<img src="${avatarUrl}" alt="avatar" />` : `<span>${accountName.charAt(0).toUpperCase() || '?'}</span>`}
            </div>
            <div class="settings-account-avatar-actions">
                <button class="settings-account-link" id="btn-change-avatar">${t('ui.upload_avatar') || '上传头像'}</button>
                <span class="settings-account-link-sep">|</span>
                <button class="settings-account-link" id="btn-remove-avatar" ${avatarUrl ? '' : 'disabled'}>${t('ui.remove_avatar') || '移除头像'}</button>
            </div>
            <div class="settings-account-fields">
                <div class="settings-account-row" data-field="id">
                    <span class="settings-account-label">ID</span>
                    <span class="settings-account-value" id="display-account-id" style="font-family:monospace;font-size:11px;">${currentAccount?.id || '—'}</span>
                    <button class="settings-account-copy-btn" id="btn-copy-id" title="${t('ui.copy') || 'Copy'}">${t('ui.copy') || '复制'}</button>
                </div>
                <div class="settings-account-row" data-field="name">
                    <span class="settings-account-label">${t('ui.account_name') || '账户名称'}</span>
                    <span class="settings-account-value" id="display-account-name">${accountName || (t('ui.not_set') || '未设置')}</span>
                    <button class="settings-account-edit-btn" id="btn-edit-name">${t('ui.edit') || '修改'}</button>
                </div>
                <div class="settings-account-row" data-field="display">
                    <span class="settings-account-label">${t('ui.display_name') || '显示名称'}</span>
                    <span class="settings-account-value" id="display-account-display">${accountDisplayName || (t('ui.not_set') || '未设置')}</span>
                    <button class="settings-account-edit-btn" id="btn-edit-display">${t('ui.edit') || '修改'}</button>
                </div>
            </div>
        </div>
        <input type="file" id="settings-avatar-file" accept="image/*" style="display:none" />
    `;

    const appearanceSection = document.createElement('div');
    appearanceSection.className = 'settings-section';
    appearanceSection.id = 'section-appearance';
    appearanceSection.innerHTML = `
        <h3>${t('ui.appearance') || '外观'}</h3>
        <div class="setting-group">
            <div class="setting-group-title">${t('ui.color_preset') || '主题配色'}</div>
            <div class="setting-row">
                <span>${t('ui.color_scheme') || '配色方案'}</span>
                <select id="color-preset-select">
                    <optgroup label="${t('ui.group_light') || '亮色主题'}">
                        <option value="we-light">WE Exclusive</option>
                        <option value="default-light">${t('ui.theme_default_light') || '默认亮色'}</option>
                        <option value="github-light">GitHub Light</option>
                        <option value="solarized-light">Solarized Light</option>
                        <option value="nord-light">Nord Light</option>
                    </optgroup>
                    <optgroup label="${t('ui.group_dark') || '暗色主题'}">
                        <option value="default-dark">${t('ui.theme_default_dark') || '默认暗色'}</option>
                        <option value="dracula">Dracula</option>
                        <option value="monokai">Monokai</option>
                        <option value="solarized-dark">Solarized Dark</option>
                        <option value="nord">Nord</option>
                        <option value="github-dark">GitHub Dark</option>
                        <option value="one-dark">One Dark</option>
                    </optgroup>
                    <option value="custom">${t('ui.theme_custom') || '自定义'}</option>
                </select>
            </div>
        </div>
        <div class="setting-group" id="custom-colors-group" style="display:none">
            <div class="setting-group-title">${t('ui.custom_colors') || '自定义颜色'}</div>
            <div class="color-picker-grid">
                <div class="color-picker-item">
                    <label>${t('ui.color_bg_main') || '主背景'}</label>
                    <input type="color" id="color-bg-main" data-var="--bg-main">
                </div>
                <div class="color-picker-item">
                    <label>${t('ui.color_bg_sidebar') || '侧边栏'}</label>
                    <input type="color" id="color-bg-sidebar" data-var="--bg-sidebar">
                </div>
                <div class="color-picker-item">
                    <label>${t('ui.color_bg_toolbar') || '工具栏'}</label>
                    <input type="color" id="color-bg-toolbar" data-var="--bg-toolbar">
                </div>
                <div class="color-picker-item">
                    <label>${t('ui.color_text') || '文字'}</label>
                    <input type="color" id="color-text" data-var="--text">
                </div>
                <div class="color-picker-item">
                    <label>${t('ui.color_text_secondary') || '次要文字'}</label>
                    <input type="color" id="color-text-secondary" data-var="--text-secondary">
                </div>
                <div class="color-picker-item">
                    <label>${t('ui.color_accent') || '强调色'}</label>
                    <input type="color" id="color-accent" data-var="--accent">
                </div>
                <div class="color-picker-item">
                    <label>${t('ui.color_border') || '边框'}</label>
                    <input type="color" id="color-border" data-var="--border">
                </div>
                <div class="color-picker-item">
                    <label>${t('ui.color_gap') || '间隙'}</label>
                    <input type="color" id="color-gap" data-var="--gap-color">
                </div>
            </div>
            <div class="setting-row" style="margin-top:8px">
                <button class="btn-reset-colors" id="btn-reset-colors">${t('ui.reset_colors') || '重置为默认'}</button>
            </div>
        </div>
        <div class="setting-group" id="bg-material-group">
            <div class="setting-group-title">${t('ui.background_material') || '背景材质'}</div>
            <div class="setting-row">
                <span>${t('ui.bg_material') || '材质'}</span>
                <select id="bg-material-select">
                    <option value="none">${t('ui.bg_none') || '无'}</option>
                    <option value="mica">${t('ui.bg_mica') || '云母 (Mica)'}</option>
                    <option value="acrylic">${t('ui.bg_acrylic') || '亚克力 (Acrylic)'}</option>
                    <option value="tabbed">${t('ui.bg_tabbed') || '标签式 (Tabbed)'}</option>
                </select>
            </div>
            <div class="setting-row" id="bg-tint-row">
                <span>${t('ui.bg_tint') || '内容区透明度'}</span>
                <div style="display:flex;align-items:center;gap:8px">
                    <input type="range" id="bg-tint-slider" min="0" max="100" value="78" style="width:120px">
                    <span id="bg-tint-val" style="min-width:36px;text-align:right">78%</span>
                </div>
            </div>
            <div class="setting-row" id="bg-overlay-row">
                <span>${t('ui.bg_overlay') || '背景遮罩透明度'}</span>
                <div style="display:flex;align-items:center;gap:8px">
                    <input type="range" id="bg-overlay-slider" min="0" max="100" value="30" style="width:120px">
                    <span id="bg-overlay-val" style="min-width:36px;text-align:right">30%</span>
                </div>
            </div>
            <div class="setting-row" id="bg-bar-tint-row">
                <span>${t('ui.bg_bar_tint') || '标题栏透明度'}</span>
                <div style="display:flex;align-items:center;gap:8px">
                    <input type="range" id="bg-bar-tint-slider" min="0" max="100" value="100" style="width:120px">
                    <span id="bg-bar-tint-val" style="min-width:36px;text-align:right">100%</span>
                </div>
            </div>
        </div>
        <div class="setting-group" id="bg-image-group">
            <div class="setting-group-title">${t('ui.background_image') || '背景图片'}</div>
            <div class="setting-row">
                <span>${t('ui.show_background_image') || '显示背景图片'}</span>
                <label class="toggle-switch"><input type="checkbox" id="bg-image-toggle"><span class="toggle-slider"></span></label>
            </div>
            <div class="setting-row" id="bg-image-file-row">
                <span>${t('ui.bg_image_file') || '图片'}</span>
                <div style="display:flex;align-items:center;gap:8px">
                    <button type="button" id="btn-select-bg-image" style="padding:4px 12px;border:1px solid var(--border);background:var(--hover-bg);color:var(--text);border-radius:4px;cursor:pointer;font-size:12px">${t('ui.select_image') || '选择图片'}</button>
                    <span id="bg-image-name" style="font-size:12px;color:var(--text-secondary);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t('ui.no_image_selected') || '未选择'}</span>
                    <button type="button" id="btn-clear-bg-image" style="padding:4px 8px;border:1px solid var(--border);background:var(--hover-bg);color:var(--text);border-radius:4px;cursor:pointer;font-size:12px;display:none">${t('ui.clear') || '清除'}</button>
                </div>
            </div>
            <div class="setting-row" id="bg-image-opacity-row">
                <span>${t('ui.bg_image_opacity') || '图片透明度'}</span>
                <div style="display:flex;align-items:center;gap:8px">
                    <input type="range" id="bg-image-opacity-slider" min="0" max="100" value="100" style="width:120px">
                    <span id="bg-image-opacity-val" style="min-width:36px;text-align:right">100%</span>
                </div>
            </div>
        </div>
    `;

    const editorSection = document.createElement('div');
    editorSection.className = 'settings-section';
    editorSection.id = 'section-editor';
    editorSection.innerHTML = `
        <h3>${t('ui.editor')}</h3>
        <div class="setting-group">
            <div class="setting-group-title">${t('ui.font_group') || '字体'}</div>
            <div class="setting-row">
                <span>${t('ui.font')}</span>
                <select id="font-family-select">
                    <option value="Microsoft YaHei">${t('ui.yahei')}</option>
                    <option value="SimSun">${t('ui.simsun')}</option>
                    <option value="SimHei">${t('ui.simhei')}</option>
                    <option value="KaiTi">${t('ui.kaiti')}</option>
                    <option value="Arial">Arial</option>
                    <option value="Consolas">Consolas</option>
                </select>
            </div>
            <div class="setting-row">
                <span>${t('ui.font_size')}</span>
                <select id="font-size-select">
                    <option value="12">12px</option>
                    <option value="14">14px</option>
                    <option value="16" selected>16px</option>
                    <option value="18">18px</option>
                    <option value="20">20px</option>
                    <option value="24">24px</option>
                </select>
            </div>
        </div>
        <div class="setting-group">
            <div class="setting-group-title">${t('ui.tools_group') || '工具'}</div>
            <div class="setting-row">
                <span>${t('ui.word_count')}</span>
                <label class="toggle-switch"><input type="checkbox" id="word-count-toggle" checked><span class="toggle-slider"></span></label>
            </div>
            <div class="setting-row">
                <span>${t('ui.toolbar_show') || '显示工具栏'}</span>
                <label class="toggle-switch"><input type="checkbox" id="toolbar-show-toggle" checked><span class="toggle-slider"></span></label>
            </div>
            <div class="setting-row">
                <span>${t('ui.markdown_render') || '启用 Markdown 渲染'}</span>
                <label class="toggle-switch"><input type="checkbox" id="md-render-toggle" checked><span class="toggle-slider"></span></label>
            </div>
            <div class="setting-row">
                <span>${t('ui.smart_brackets') || '智能括号/引号补全'}</span>
                <label class="toggle-switch"><input type="checkbox" id="smart-brackets-toggle"><span class="toggle-slider"></span></label>
            </div>
        </div>
        <div class="setting-group">
            <div class="setting-group-title">${t('ui.node_graph_group') || '节点图'}</div>
            <div class="setting-row">
                <span>${t('ui.ng_hide_arrow_default') || '默认创建隐藏箭头连线'}</span>
                <label class="toggle-switch"><input type="checkbox" id="ng-hide-arrow-toggle"><span class="toggle-slider"></span></label>
            </div>
        </div>
    `;

    const aboutSection = document.createElement('div');
    aboutSection.className = 'settings-section';
    aboutSection.id = 'section-about';
    aboutSection.innerHTML = `
        <h3>${t('ui.about')}</h3>
        <div class="about-header">
            <div class="about-info">
                <p style="color:var(--text-secondary)">World Editor <span id="about-version">v${APP_VERSION}</span></p>
                <p style="color:var(--text-secondary); margin-top:4px;">${t('ui.about_desc')}</p>
                <div class="about-links">
                    <a href="https://github.com/firefairyZz" class="about-link" data-external="true">
                        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38C13.71 14.53 16 11.53 16 8c0-4.42-3.58-8-8-8z"/></svg>
                        <span>firefairyZz</span>
                    </a>
                    <a href="https://github.com/firefairyZz/WorldEditor_WE_" class="about-link" data-external="true">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9"/><path d="M12 12v3"/></svg>
                        <span>${t('ui.open_source_repo') || '开放源代码库'}</span>
                    </a>
                </div>
            </div>
            <div class="about-icon">
                <img src="../resources/White.png" alt="World Editor" id="about-app-icon" />
            </div>
        </div>
        <div class="update-notes-section">
            <div class="update-notes-header">
                <h4>${t('ui.update_notes') || '更新日志'}</h4>
            </div>
            <div class="update-notes-body">
                <aside class="update-notes-toc" id="update-notes-toc">
                    <div class="toc-title">${t('ui.table_of_contents')}</div>
                    <ul class="toc-list" id="update-notes-toc-list"></ul>
                </aside>
                <div class="update-notes-content" id="update-notes-container"></div>
            </div>
        </div>
        <div class="oss-licenses-section">
            <div class="oss-licenses-header">
                <h4>${t('ui.oss_licenses') || '开放源代码库'}</h4>
            </div>
            <div class="oss-licenses-body" id="oss-licenses-list"></div>
        </div>
    `;

    // 绑定 about 页面外部链接点击事件
    aboutSection.addEventListener('click', (e) => {
        const link = e.target.closest('a[data-external="true"]');
        if (link) {
            e.preventDefault();
            const url = link.getAttribute('href');
            if (url) weAPI.openExternalLink(url);
        }
    });

    // 彩蛋：双击图标切换为 icon.png / 恢复默认
    let iconEggMode = false;
    const aboutIcon = aboutSection.querySelector('.about-icon');
    if (aboutIcon) {
        aboutIcon.style.cursor = 'pointer';
        aboutIcon.addEventListener('dblclick', () => {
            const img = aboutIcon.querySelector('img');
            iconEggMode = !iconEggMode;
            if (iconEggMode) {
                // 显示 icon.png 原图
                aboutIcon.style.background = 'transparent';
                aboutIcon.style.borderRadius = '0';
                img.src = '../resources/icon.png';
                img.style.filter = 'none';
                img.style.width = '100%';
                img.style.height = '100%';
            } else {
                // 恢复默认图标样式
                aboutIcon.style.background = '';
                aboutIcon.style.borderRadius = '';
                img.src = document.body.classList.contains('theme-light') ? '../resources/Black.png' : '../resources/White.png';
                img.style.filter = '';
                img.style.width = '';
                img.style.height = '';
            }
        });
    }

    contentArea.appendChild(generalSection);
    contentArea.appendChild(tagsSection);
    contentArea.appendChild(accountSection);
    contentArea.appendChild(appearanceSection);
    contentArea.appendChild(editorSection);

    // 快捷键设置区域
    const shortcutsSection = document.createElement('div');
    shortcutsSection.className = 'settings-section';
    shortcutsSection.id = 'section-shortcuts';
    shortcutsSection.innerHTML = buildShortcutsSettingsHTML();
    contentArea.appendChild(shortcutsSection);

    contentArea.appendChild(aboutSection);

    const footer = document.createElement('div');
    footer.className = 'settings-footer';
    const deleteAccountBtn = document.createElement('button');
    deleteAccountBtn.textContent = t('ui.delete_account') || '删除账户';
    deleteAccountBtn.className = 'btn-settings-danger';
    deleteAccountBtn.id = 'footer-btn-delete-account';
    deleteAccountBtn.style.display = 'none';
    const applyBtn = document.createElement('button');
    applyBtn.textContent = t('ui.apply');
    applyBtn.className = 'settings-apply-btn';
    footer.appendChild(deleteAccountBtn);
    footer.appendChild(applyBtn);

    panel.appendChild(contentArea);
    panel.appendChild(footer);
    content.appendChild(nav);
    content.appendChild(panel);

    nav.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            nav.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            const section = item.dataset.section;
            panel.querySelectorAll('.settings-section').forEach(sec => sec.classList.remove('active'));
            document.getElementById(`section-${section}`).classList.add('active');
            // 关于页面隐藏底栏
            footer.style.display = section === 'about' ? 'none' : 'flex';
            // 删除账户按钮仅在账户分区显示
            deleteAccountBtn.style.display = section === 'account' ? '' : 'none';
            if (section === 'about') { loadUpdateNotes(); loadOssLicenses(); }
        });
    });

    // 加载版本号
    weAPI.getVersion().then(v => {
        const verEl = aboutSection.querySelector('#about-version');
        if (verEl) verEl.textContent = 'v' + v;
    });

    weAPI.getSettings().then(async (s) => {
        weLog.info('settings', '→ getSettings 回调开始', { language: s.language, colorPreset: s.colorPreset });
        await tagModule.loadPinnedAndFrequentTags();
        content.querySelector('#lang-select').value = s.language || 'zh_CN';
        const colorPresetSelect = content.querySelector('#color-preset-select');
        if (colorPresetSelect) colorPresetSelect.value = s.colorPreset || 'default-dark';
        const customColorsGroup = content.querySelector('#custom-colors-group');
        if (customColorsGroup) customColorsGroup.style.display = (s.colorPreset === 'custom') ? 'block' : 'none';
        // Load custom colors into pickers
        if (s.customColors) {
            for (const [cssVar, color] of Object.entries(s.customColors)) {
                const input = content.querySelector(`input[data-var="${cssVar}"]`);
                if (input) input.value = color;
            }
        }
        content.querySelector('#font-family-select').value = s.fontFamily || 'Microsoft YaHei';
        content.querySelector('#font-size-select').value = s.fontSize || '16';
        content.querySelector('#auto-save-select').value = s.autoSave || '0';
        const tc = content.querySelector('#tab-close-confirm'); if (tc) tc.checked = s.tabCloseConfirm !== false;
        const aot = content.querySelector('#always-on-top-toggle'); if (aot) aot.checked = s.alwaysOnTop === true;
        const bgm = content.querySelector('#bg-material-select'); if (bgm) bgm.value = s.backgroundMaterial || 'none';
        const bgTint = content.querySelector('#bg-tint-slider'); if (bgTint) { bgTint.value = s.materialTint ?? 78; content.querySelector('#bg-tint-val').textContent = bgTint.value + '%'; }
        const bgOverlay = content.querySelector('#bg-overlay-slider'); if (bgOverlay) { bgOverlay.value = s.materialOverlay ?? 30; content.querySelector('#bg-overlay-val').textContent = bgOverlay.value + '%'; }
        const bgBarTint = content.querySelector('#bg-bar-tint-slider'); if (bgBarTint) { bgBarTint.value = s.materialBarTint ?? 100; content.querySelector('#bg-bar-tint-val').textContent = bgBarTint.value + '%'; }
        // 背景图片
        const bgImgToggle = content.querySelector('#bg-image-toggle'); if (bgImgToggle) bgImgToggle.checked = s.backgroundImageEnabled === true;
        const bgImgOpacity = content.querySelector('#bg-image-opacity-slider');
        if (bgImgOpacity) {
            bgImgOpacity.value = s.backgroundImageOpacity ?? 100;
            content.querySelector('#bg-image-opacity-val').textContent = bgImgOpacity.value + '%';
        }
        const bgImgName = content.querySelector('#bg-image-name');
        const bgImgClearBtn = content.querySelector('#btn-clear-bg-image');
        if (bgImgName) {
            bgImgName.textContent = s.backgroundImage || (t('ui.no_image_selected') || '未选择');
            if (s.backgroundImage) bgImgName.dataset.path = s.backgroundImage;
            if (bgImgClearBtn) bgImgClearBtn.style.display = s.backgroundImage ? '' : 'none';
        }
        updateBgImageRowsState(s.backgroundImageEnabled === true);
        // 启动时应用背景图片
        if (s.backgroundImageEnabled && s.backgroundImage) {
            weAPI.getBackgroundImage(s.backgroundImage).then(dataUrl => {
                if (dataUrl) applyBackgroundImage(dataUrl, s.backgroundImageOpacity ?? 100);
            });
        }
        const wc = content.querySelector('#word-count-toggle'); if (wc) wc.checked = s.wordCount !== false;
        const tb = content.querySelector('#toolbar-show-toggle'); if (tb) tb.checked = s.toolbarShow !== false;
        const md = content.querySelector('#md-render-toggle'); if (md) md.checked = s.markdownRender !== false;
        const sb = content.querySelector('#smart-brackets-toggle'); if (sb) sb.checked = s.smartBrackets === true;
        const ha = content.querySelector('#ng-hide-arrow-toggle'); if (ha) ha.checked = s.ngHideArrowByDefault === true;
        // 同步到节点图全局设置
        if (typeof ngDefaultSettings !== 'undefined') {
            ngDefaultSettings.hideArrowByDefault = s.ngHideArrowByDefault === true;
        }
        savedFontFamily = s.fontFamily || 'Microsoft YaHei';
        savedFontSize = s.fontSize || '16';
        if (s.autoSave) setupAutoSave(s.autoSave);

        // 加载固定标签到设置页
        const pinnedList = content.querySelector('#pinned-tags-list');
        function renderPinnedTags() {
            if (!pinnedList) return;
            pinnedList.innerHTML = '';
            if (!tagModule.pinnedTags.length) {
                pinnedList.innerHTML = `<span class="tag-quick-empty">${t('ui.no_pinned_tags') || '暂无固定标签'}</span>`;
                return;
            }
            tagModule.pinnedTags.forEach((tag, idx) => {
                const el = document.createElement('span');
                el.className = 'tag-quick-item';
                el.style.backgroundColor = tag.color || TAG_COLORS[0];
                const emojiHtml = `<span class="tag-emoji">${tag.emoji || ''}</span>`;
                el.innerHTML = `${emojiHtml}<span class="tag-label">${tag.label || ''}</span><span class="tag-remove">✕</span>`;
                el.querySelector('.tag-remove').onclick = async () => {
                    tagModule.pinnedTags.splice(idx, 1);
                    await tagModule.savePinnedTags();
                    renderPinnedTags();
                };
                pinnedList.appendChild(el);
            });
        }
        renderPinnedTags();

        // 表情弹窗
        const emojiTrigger = content.querySelector('#pinned-tag-emoji-trigger');
        const emojiPopup = content.querySelector('#pinned-tag-emoji-popup');
        const emojiDisplay = content.querySelector('#pinned-tag-emoji-display');
        const emojiList = content.querySelector('.popup-emoji-list');
        let pickedEmoji = '';

        const renderEmojiPopup = () => {
            emojiList.innerHTML = '';
            TAG_EMOJIS.forEach(e => {
                const btn = document.createElement('button');
                btn.className = 'popup-emoji-btn' + (e === pickedEmoji ? ' active' : '');
                btn.textContent = e;
                btn.onclick = () => {
                    pickedEmoji = e;
                    emojiDisplay.textContent = e;
                    renderEmojiPopup();
                };
                emojiList.appendChild(btn);
            });
            const noneBtn = document.createElement('button');
            noneBtn.className = 'popup-emoji-btn' + (!pickedEmoji ? ' active' : '');
            noneBtn.textContent = '∅';
            noneBtn.title = t('ui.no_emoji') || '无';
            noneBtn.onclick = () => {
                pickedEmoji = '';
                emojiDisplay.textContent = t('ui.no_emoji') || '无';
                renderEmojiPopup();
            };
            emojiList.appendChild(noneBtn);
        };

        emojiTrigger.onclick = (e) => {
            e.stopPropagation();
            const willShow = emojiPopup.style.display === 'none';
            if (willShow) {
                emojiPopup.style.display = 'block';
                renderEmojiPopup();
                const rect = emojiTrigger.getBoundingClientRect();
                const popupRect = emojiPopup.getBoundingClientRect();
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                let top = rect.bottom + 4;
                let left = rect.left;
                if (top + popupRect.height > vh) {
                    top = rect.top - popupRect.height - 4;
                }
                if (top < 0) top = 4;
                if (left + popupRect.width > vw) {
                    left = Math.max(4, vw - popupRect.width - 4);
                }
                if (left < 4) left = 4;
                emojiPopup.style.top = top + 'px';
                emojiPopup.style.left = left + 'px';
                emojiPopup.style.right = 'auto';
            } else {
                emojiPopup.style.display = 'none';
            }
        };
        emojiPopup.onclick = (e) => e.stopPropagation();
        const closeEmojiPopup = () => { emojiPopup.style.display = 'none'; };
        document.addEventListener('click', closeEmojiPopup);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && emojiPopup.style.display !== 'none') {
                closeEmojiPopup();
            }
        });

        const addPinnedBtn = content.querySelector('#btn-add-pinned-tag');
        if (addPinnedBtn) {
            addPinnedBtn.onclick = async () => {
                const label = content.querySelector('#pinned-tag-label').value.trim();
                if (!label) { showNotification(t('ui.enter_tag_label') || '请输入标签名称'); return; }
                const color = content.querySelector('#pinned-tag-color').value;
                tagModule.pinnedTags.push({ label, color, emoji: pickedEmoji });
                await tagModule.savePinnedTags();
                content.querySelector('#pinned-tag-label').value = '';
                pickedEmoji = '';
                emojiDisplay.textContent = t('ui.no_emoji') || '无';
                emojiPopup.style.display = 'none';
                renderPinnedTags();
            };
        }
    });

    // 实时同步窗口置顶开关
    const aotToggle = content.querySelector('#always-on-top-toggle');
    if (aotToggle) {
        aotToggle.addEventListener('change', async () => {
            const val = aotToggle.checked;
            await weAPI.setAlwaysOnTop(val);
            window.dispatchEvent(new CustomEvent('settings:updated', { detail: { alwaysOnTop: val } }));
        });
    }

    // 配色方案切换：显示/隐藏自定义颜色区域
    const colorPresetSelect = content.querySelector('#color-preset-select');
    if (colorPresetSelect) {
        colorPresetSelect.addEventListener('change', (e) => {
            const isCustom = e.target.value === 'custom';
            const group = content.querySelector('#custom-colors-group');
            if (group) group.style.display = isCustom ? 'block' : 'none';
            // 如果选了预设，立即填充颜色选择器
            if (!isCustom && THEME_PRESETS[e.target.value]) {
                const preset = THEME_PRESETS[e.target.value];
                for (const [cssVar, color] of Object.entries(preset.colors)) {
                    const input = content.querySelector(`input[data-var="${cssVar}"]`);
                    if (input) input.value = color;
                }
            }
        });
    }

    // 背景材质：实时预览（对齐测试文件：滑块独立调用 applyTint / applyOverlay / applyBarTint）
    const bgTintSlider = content.querySelector('#bg-tint-slider');
    const bgTintVal = content.querySelector('#bg-tint-val');
    const bgOverlaySlider = content.querySelector('#bg-overlay-slider');
    const bgOverlayVal = content.querySelector('#bg-overlay-val');
    const bgBarTintSlider = content.querySelector('#bg-bar-tint-slider');
    const bgBarTintVal = content.querySelector('#bg-bar-tint-val');
    if (bgTintSlider) {
        bgTintSlider.addEventListener('input', () => {
            bgTintVal.textContent = bgTintSlider.value + '%';
            const bgm = content.querySelector('#bg-material-select')?.value || 'none';
            if (bgm !== 'none') {
                applyTint(parseInt(bgTintSlider.value));
            }
        });
    }
    if (bgOverlaySlider) {
        bgOverlaySlider.addEventListener('input', () => {
            bgOverlayVal.textContent = bgOverlaySlider.value + '%';
            applyOverlay(parseInt(bgOverlaySlider.value));
        });
    }
    if (bgBarTintSlider) {
        bgBarTintSlider.addEventListener('input', () => {
            bgBarTintVal.textContent = bgBarTintSlider.value + '%';
            const bgm = content.querySelector('#bg-material-select')?.value || 'none';
            if (bgm !== 'none') {
                applyBarTint(parseInt(bgBarTintSlider.value));
            }
        });
    }
    const bgMaterialSelect = content.querySelector('#bg-material-select');
    // 灰化/启用材质相关设置项（遮罩透明度独立于材质，始终可用）
    function updateMaterialRowsState(bgm) {
        const disabled = bgm === 'none';
        const tintRow = content.querySelector('#bg-tint-row');
        const barTintRow = content.querySelector('#bg-bar-tint-row');
        for (const row of [tintRow, barTintRow]) {
            if (row) {
                row.style.opacity = disabled ? '0.4' : '';
                row.style.pointerEvents = disabled ? 'none' : '';
            }
        }
    }
    if (bgMaterialSelect) {
        // 下拉框切换只更新 UI 状态（灰化相关行），不实时切换材质。
        // 材质切换和保存统一由"应用"按钮触发，与其他设置项保持一致。
        bgMaterialSelect.addEventListener('change', () => {
            const bgm = bgMaterialSelect.value;
            weLog.info('settings', 'bgMaterialSelect change: 待应用材质', { bgm });
            updateMaterialRowsState(bgm);
        });
        updateMaterialRowsState(bgMaterialSelect.value);
    }
    // 背景图片：灰化/启用相关行
    function updateBgImageRowsState(enabled) {
        const fileRow = content.querySelector('#bg-image-file-row');
        const opacityRow = content.querySelector('#bg-image-opacity-row');
        for (const row of [fileRow, opacityRow]) {
            if (row) {
                row.style.opacity = enabled ? '' : '0.4';
                row.style.pointerEvents = enabled ? '' : 'none';
            }
        }
    }
    const bgImgToggleEl = content.querySelector('#bg-image-toggle');
    if (bgImgToggleEl) {
        bgImgToggleEl.addEventListener('change', async () => {
            const enabled = bgImgToggleEl.checked;
            updateBgImageRowsState(enabled);
            if (enabled) {
                const name = bgImgNameEl?.dataset?.path || '';
                const opacity = parseInt(content.querySelector('#bg-image-opacity-slider')?.value || '100');
                if (name) {
                    const dataUrl = await weAPI.getBackgroundImage(name);
                    if (dataUrl) applyBackgroundImage(dataUrl, opacity);
                }
            } else {
                applyBackgroundImage(null, 0);
            }
        });
    }
    const bgImgOpacitySlider = content.querySelector('#bg-image-opacity-slider');
    const bgImgOpacityVal = content.querySelector('#bg-image-opacity-val');
    if (bgImgOpacitySlider) {
        bgImgOpacitySlider.addEventListener('input', () => {
            const v = parseInt(bgImgOpacitySlider.value);
            bgImgOpacityVal.textContent = v + '%';
            const layer = document.getElementById('background-image-layer');
            if (layer && layer.style.display !== 'none') {
                layer.style.opacity = v / 100;
            }
        });
    }
    const selectBgImgBtn = content.querySelector('#btn-select-bg-image');
    const bgImgNameEl = content.querySelector('#bg-image-name');
    const bgImgClearBtnEl = content.querySelector('#btn-clear-bg-image');
    if (selectBgImgBtn) {
        selectBgImgBtn.onclick = async () => {
            const name = await weAPI.selectBackgroundImage();
            if (!name) return;
            if (bgImgNameEl) {
                bgImgNameEl.textContent = name;
                bgImgNameEl.dataset.path = name;
            }
            if (bgImgClearBtnEl) bgImgClearBtnEl.style.display = '';
            // 自动开启开关
            if (bgImgToggleEl && !bgImgToggleEl.checked) {
                bgImgToggleEl.checked = true;
                updateBgImageRowsState(true);
            }
            const opacity = parseInt(bgImgOpacitySlider?.value || '100');
            const dataUrl = await weAPI.getBackgroundImage(name);
            if (dataUrl) applyBackgroundImage(dataUrl, opacity);
        };
    }
    if (bgImgClearBtnEl) {
        bgImgClearBtnEl.onclick = async () => {
            await weAPI.clearBackgroundImage();
            if (bgImgNameEl) {
                bgImgNameEl.textContent = t('ui.no_image_selected') || '未选择';
                delete bgImgNameEl.dataset.path;
            }
            bgImgClearBtnEl.style.display = 'none';
            applyBackgroundImage(null, 0);
        };
    }
    // 重置颜色按钮
    const resetBtn = content.querySelector('#btn-reset-colors');
    if (resetBtn) {
        resetBtn.onclick = () => {
            const preset = THEME_PRESETS['default-dark'];
            for (const [cssVar, color] of Object.entries(preset.colors)) {
                const input = content.querySelector(`input[data-var="${cssVar}"]`);
                if (input) input.value = color;
            }
        };
    }

    // 账户设置事件
    let tempAvatarUrl = currentAccount?.avatarDataUrl || '';
    let tempAccountName = currentAccount?.name || '';
    let tempAccountDisplay = currentAccount?.displayName || '';
    let accountChanged = false;

    // 更换头像
    const avatarFileInput = content.querySelector('#settings-avatar-file');
    const changeAvatarBtn = content.querySelector('#btn-change-avatar');
    if (changeAvatarBtn && avatarFileInput) {
        changeAvatarBtn.onclick = () => avatarFileInput.click();
        avatarFileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (file.size > 2 * 1024 * 1024) {
                alert(t('ui.avatar_too_large') || '头像不能超过2MB');
                return;
            }
            const reader = new FileReader();
            reader.onload = (evt) => {
                tempAvatarUrl = evt.target.result;
                accountChanged = true;
                const preview = content.querySelector('#settings-avatar-preview');
                preview.innerHTML = `<img src="${tempAvatarUrl}" alt="avatar" />`;
                const removeBtn = content.querySelector('#btn-remove-avatar');
                if (removeBtn) removeBtn.disabled = false;
            };
            reader.readAsDataURL(file);
        };
    }

    // 移除头像
    const removeAvatarBtn = content.querySelector('#btn-remove-avatar');
    if (removeAvatarBtn) {
        removeAvatarBtn.onclick = () => {
            if (!currentAccount) return;
            tempAvatarUrl = '';
            accountChanged = true;
            const preview = content.querySelector('#settings-avatar-preview');
            const initial = (tempAccountName || '?').charAt(0).toUpperCase();
            preview.innerHTML = `<span>${initial}</span>`;
            removeAvatarBtn.disabled = true;
        };
    }

    // 行内编辑功能
    function startInlineEdit(field) {
        const row = content.querySelector(`.settings-account-row[data-field="${field}"]`);
        if (!row) return;
        const valueSpan = row.querySelector('.settings-account-value');
        const editBtn = row.querySelector('.settings-account-edit-btn');
        const oldValue = field === 'name' ? tempAccountName : tempAccountDisplay;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'settings-account-input';
        input.value = oldValue;
        if (field === 'name') {
            input.maxLength = 20;
            input.placeholder = t('ui.account_name_placeholder') || '请输入账户名称';
        } else {
            input.maxLength = 30;
            input.placeholder = t('ui.display_name_placeholder') || '请输入显示名称';
        }

        valueSpan.style.display = 'none';
        editBtn.style.display = 'none';
        valueSpan.parentNode.insertBefore(input, editBtn);
        input.focus();
        input.select();

        let finished = false;
        const finishEdit = () => {
            if (finished) return;
            finished = true;
            let val = input.value.trim();
            if (field === 'name') {
                // 仅允许英文、数字、下划线、连字符
                val = val.replace(/[^a-zA-Z0-9_-]/g, '');
                if (val && val.length < 2) {
                    alert(t('ui.account_name_too_short') || '账户名称至少2个字符');
                    val = oldValue;
                }
            }
            if (field === 'name') {
                tempAccountName = val || oldValue;
            } else {
                tempAccountDisplay = val || tempAccountName;
            }
            accountChanged = true;

            // 恢复显示
            input.remove();
            valueSpan.textContent = (field === 'name' ? tempAccountName : tempAccountDisplay) || (t('ui.not_set') || '未设置');
            valueSpan.style.display = '';
            editBtn.style.display = '';

            // 名称变更时同步头像首字母
            if (field === 'name' && !tempAvatarUrl) {
                const preview = content.querySelector('#settings-avatar-preview');
                const initial = (tempAccountName || '?').charAt(0).toUpperCase();
                preview.innerHTML = `<span>${initial}</span>`;
            }
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
            else if (e.key === 'Escape') { finished = true; input.remove(); valueSpan.style.display = ''; editBtn.style.display = ''; }
        });
        input.addEventListener('blur', finishEdit);
    }

    const editNameBtn = content.querySelector('#btn-edit-name');
    if (editNameBtn) editNameBtn.onclick = () => startInlineEdit('name');
    const editDisplayBtn = content.querySelector('#btn-edit-display');
    if (editDisplayBtn) editDisplayBtn.onclick = () => startInlineEdit('display');

    // 复制账户ID
    const copyIdBtn = content.querySelector('#btn-copy-id');
    if (copyIdBtn) {
        copyIdBtn.onclick = async () => {
            const idText = content.querySelector('#display-account-id')?.textContent || '';
            if (!idText || idText === '—') return;
            try {
                await navigator.clipboard.writeText(idText);
                copyIdBtn.textContent = '✓';
                setTimeout(() => { copyIdBtn.textContent = t('ui.copy') || '复制'; }, 1500);
            } catch (e) {
                weLog.error('settings', 'copyIdBtn 复制账户ID失败', e && e.stack ? e.stack : String(e));
            }
        };
    }

    // 删除账户（底部按钮）
    deleteAccountBtn.onclick = async () => {
        weLog.info('settings', '→ deleteAccountBtn 点击');
        if (!currentAccount) return;
        // 二次确认弹窗
        const ok1 = await showConfirmDialog(
            t('ui.account_delete_confirm') || '确定要删除账户吗？此操作不可撤销。',
            t('ui.delete_account') || '删除账户'
        );
        if (!ok1) return;
        const ok2 = await showConfirmDialog(
            t('ui.account_delete_confirm_2') || '真的要删除吗？所有账户数据将被清除。',
            t('ui.delete_account') || '删除账户'
        );
        if (!ok2) return;
        weAPI.deleteAccount().then(result => {
            if (result.success) {
                weLog.info('settings', 'deleteAccountBtn: 账户删除成功');
                currentAccount = null;
                tempAccountName = '';
                tempAccountDisplay = '';
                tempAvatarUrl = '';
                accountChanged = false;
                updateAccountUI();
                // 清空设置页显示
                const preview = content.querySelector('#settings-avatar-preview');
                if (preview) preview.innerHTML = '<span>?</span>';
                const nameEl = content.querySelector('#display-account-name');
                if (nameEl) nameEl.textContent = t('ui.not_set') || '未设置';
                const dispEl = content.querySelector('#display-account-display');
                if (dispEl) dispEl.textContent = t('ui.not_set') || '未设置';
                showNotification(t('ui.account_deleted') || '账户已删除');
            } else {
                weLog.warn('settings', 'deleteAccountBtn: 账户删除失败', { error: result.error });
                alert(t('ui.delete_failed') + ': ' + result.error);
            }
        });
    };

    applyBtn.onclick = async () => {
        weLog.info('settings', '→ applyBtn 点击（应用设置）');
        const lang = content.querySelector('#lang-select').value;
        const colorPreset = content.querySelector('#color-preset-select')?.value || 'default-dark';
        let customColors = null;
        if (colorPreset === 'custom') {
            customColors = {};
            content.querySelectorAll('input[type="color"][data-var]').forEach(input => {
                customColors[input.dataset.var] = input.value;
            });
        }
        const fontFamily = content.querySelector('#font-family-select').value;
        const fontSize = content.querySelector('#font-size-select').value;
        const autoSave = content.querySelector('#auto-save-select').value;
        const tcVal = content.querySelector('#tab-close-confirm')?.checked ?? true;
        const aotVal = content.querySelector('#always-on-top-toggle')?.checked ?? false;
        const bgmVal = content.querySelector('#bg-material-select')?.value ?? 'none';
        const bgTintVal = parseInt(content.querySelector('#bg-tint-slider')?.value ?? '78');
        const bgOverlayVal = parseInt(content.querySelector('#bg-overlay-slider')?.value ?? '30');
        const bgBarTintVal = parseInt(content.querySelector('#bg-bar-tint-slider')?.value ?? '100');
        // 背景图片
        const bgImgEnabledVal = content.querySelector('#bg-image-toggle')?.checked ?? false;
        const bgImgOpacityVal = parseInt(content.querySelector('#bg-image-opacity-slider')?.value ?? '100');
        const bgImgNameVal = content.querySelector('#bg-image-name')?.dataset?.path || '';
        const wcVal = content.querySelector('#word-count-toggle')?.checked ?? true;
        const tbVal = content.querySelector('#toolbar-show-toggle')?.checked ?? true;
        const mdVal = content.querySelector('#md-render-toggle')?.checked ?? true;
        const sbVal = content.querySelector('#smart-brackets-toggle')?.checked ?? false;
        const haVal = content.querySelector('#ng-hide-arrow-toggle')?.checked ?? false;

        // 收集自定义快捷键
        const customShortcuts = collectCustomShortcuts(content);

        // 根据配色方案决定主题
        const isLightPreset = colorPreset.includes('light') || colorPreset === 'we-light';
        const theme = isLightPreset ? 'light' : 'dark';

        await weAPI.setSettings({
            language: lang, theme: theme,
            colorPreset: colorPreset, customColors: customColors,
            'font-family': fontFamily, fontSize: fontSize,
            autoSave: autoSave,
            tabCloseConfirm: tcVal, alwaysOnTop: aotVal, backgroundMaterial: bgmVal, materialTint: bgTintVal, materialOverlay: bgOverlayVal, materialBarTint: bgBarTintVal, wordCount: wcVal, toolbarShow: tbVal, markdownRender: mdVal, smartBrackets: sbVal, ngHideArrowByDefault: haVal,
            backgroundImageEnabled: bgImgEnabledVal, backgroundImage: bgImgNameVal, backgroundImageOpacity: bgImgOpacityVal,
            customShortcuts: customShortcuts
        });

        // 同步节点图全局设置（保存后立即生效，无需重启）
        if (typeof ngDefaultSettings !== 'undefined') {
            ngDefaultSettings.hideArrowByDefault = haVal === true;
        }

        // 应用窗口置顶
        await weAPI.setAlwaysOnTop(aotVal);
        
        // 同步标题栏按钮状态
        window.dispatchEvent(new CustomEvent('settings:updated', { detail: { alwaysOnTop: aotVal } }));

        // 应用主题配色
        applyColorPreset(colorPreset, customColors);

        // 应用快捷键变更
        if (customShortcuts) {
            for (const action in customShortcuts) {
                if (activeShortcuts[action]) {
                    Object.assign(activeShortcuts[action], customShortcuts[action]);
                }
            }
        } else {
            // 恢复默认
            activeShortcuts = JSON.parse(JSON.stringify(DEFAULT_SHORTCUTS));
        }
        // 刷新快捷键帮助面板
        if (shortcutHelpPanel.element) {
            shortcutHelpPanel.refresh();
        }

        currentTheme = theme;
        applyTheme(theme);
        savedFontFamily = fontFamily;
        savedFontSize = fontSize;
        applyFontSettings(fontFamily, fontSize);
        setupAutoSave(autoSave);
        // 同步到全局变量（供编辑器等其他模块读取）
        toolbarShow = tbVal;
        wordCountShow = wcVal;
        markdownRender = mdVal;
        smartBracketsEnabled = sbVal;
        tabCloseConfirm = tcVal;
        // Apply live effects
        applyToolbarVisibility(tbVal);
        applyWordCountVisibility(wcVal);
        await loadLanguage(lang);
        refreshSettingsI18n();

        // 应用背景材质（必须在 applyTheme/applyColorPreset 之后，否则背景色会被覆盖）
        console.log(`[renderer] 设置页"应用"按钮 → weAPI.setBackgroundMaterial('${bgmVal}')`);
        await weAPI.setBackgroundMaterial(bgmVal);
        console.log(`[renderer] 设置页"应用"按钮 → applyBackgroundMaterial('${bgmVal}', tint=${bgTintVal}, overlay=${bgOverlayVal}, barTint=${bgBarTintVal})`);
        applyBackgroundMaterial(bgmVal, bgTintVal, bgOverlayVal, bgBarTintVal);

        // 保存账户变更
        if (accountChanged && tempAccountName) {
            const accountData = {
                name: tempAccountName,
                displayName: tempAccountDisplay || tempAccountName,
                avatarDataUrl: tempAvatarUrl || generateInitialAvatar(tempAccountName),
                createdAt: currentAccount?.createdAt || new Date().toISOString()
            };
            const accResult = await weAPI.saveAccount(accountData);
            if (accResult.success) {
                currentAccount = accResult.account || accountData;
                if (!tempAvatarUrl) currentAccount.avatarDataUrl = accountData.avatarDataUrl;
                else currentAccount.avatarDataUrl = tempAvatarUrl;
                updateAccountUI();
                accountChanged = false;
            }
        }

        showNotification(t('ui.settings_saved'));
        // 全面刷新UI文本（包括欢迎页、标签页标题等）
        if (typeof refreshAllUITexts === 'function') {
            refreshAllUITexts();
        }
        // Reload update notes if markdown render changed
        const c = document.getElementById('update-notes-container');
        if (c) { c.dataset.loaded = ''; loadUpdateNotes(); }
        // 刷新最近项目列表（如果在欢迎页）
        if (window.refreshRecentProjects) {
            window.refreshRecentProjects();
        }
    };

    // 绑定快捷键捕获事件
    bindShortcutCapture(content);

    // 检查更新
    const checkUpdateBtn = content.querySelector('#btn-check-update');
    const updateStatusEl = content.querySelector('#update-check-status');
    const updateDetailEl = content.querySelector('#update-check-detail');
    const updateDevHintEl = content.querySelector('#update-check-dev-hint');

    // 渲染源码环境提示
    function renderDevHint(isDev) {
        if (!updateDevHintEl) return;
        if (isDev) {
            const hint = t('ui.update_dev_hint') || '当前为源码环境，请通过 git pull 更新代码';
            const repoUrl = t('ui.update_dev_repo') || '仓库地址';
            updateDevHintEl.innerHTML = `<div class="dev-hint-content">${hint}<br><a href="#" class="update-release-link" data-url="https://github.com/${'firefairyZz/WorldEditor_WE_'}">${repoUrl} →</a></div>`;
            updateDevHintEl.style.display = 'block';
        } else {
            updateDevHintEl.style.display = 'none';
        }
    }

    if (checkUpdateBtn) {
        checkUpdateBtn.onclick = async () => {
            weLog.info('settings', '→ checkUpdateBtn 点击（检查更新）');
            checkUpdateBtn.disabled = true;
            updateStatusEl.dataset.checked = 'true';
            updateStatusEl.textContent = t('ui.update_checking') || '正在检查...';
            updateDetailEl.style.display = 'none';
            try {
                const result = await weAPI.checkUpdate();
                renderDevHint(result.isDevEnvironment);
                if (!result.success) {
                    updateStatusEl.textContent = t('ui.update_check_failed') || '检查失败';
                    updateDetailEl.textContent = result.error || '';
                    updateDetailEl.style.display = 'block';
                    updateDetailEl.className = 'update-check-detail update-error';
                } else if (result.hasUpdate) {
                    updateStatusEl.textContent = `${t('ui.update_available') || '发现新版本'}: v${result.latestVersion}`;
                    const viewNotes = t('ui.view_release') || '查看发布页';
                    const devNote = result.isDevEnvironment
                        ? `<br><span class="update-dev-note">${t('ui.update_dev_pull_hint') || '源码环境：请执行 git pull 获取最新代码'}</span>`
                        : '';
                    updateDetailEl.innerHTML = `${t('ui.current_version') || '当前版本'}: v${result.currentVersion} → v${result.latestVersion}${devNote}<br><a href="#" class="update-release-link" data-url="${result.releaseUrl}">${viewNotes} →</a>`;
                    updateDetailEl.style.display = 'block';
                    updateDetailEl.className = 'update-check-detail update-available';
                    if (!result.isDevEnvironment) showUpdateIndicator(result);
                } else {
                    updateStatusEl.textContent = `${t('ui.update_latest') || '已是最新版本'} (v${result.currentVersion})`;
                    updateDetailEl.textContent = '';
                    updateDetailEl.style.display = 'none';
                    hideUpdateIndicator();
                }
            } catch (e) {
                weLog.error('settings', 'checkUpdateBtn 检查更新失败', e && e.stack ? e.stack : String(e));
                updateStatusEl.textContent = t('ui.update_check_failed') || '检查失败';
                updateDetailEl.textContent = e.message;
                updateDetailEl.style.display = 'block';
                updateDetailEl.className = 'update-check-detail update-error';
            }
            checkUpdateBtn.disabled = false;
        };
        // 发布页链接点击
        if (updateDetailEl) {
            updateDetailEl.addEventListener('click', (e) => {
                const link = e.target.closest('.update-release-link');
                if (link) {
                    e.preventDefault();
                    const url = link.dataset.url;
                    if (url) weAPI.openExternalLink(url);
                }
            });
        }
        if (updateDevHintEl) {
            updateDevHintEl.addEventListener('click', (e) => {
                const link = e.target.closest('.update-release-link');
                if (link) {
                    e.preventDefault();
                    const url = link.dataset.url;
                    if (url) weAPI.openExternalLink(url);
                }
            });
        }
    }

    addTab(id, t('ui.settings'), content, true);
}

function applyTheme(theme) {
    weLog.info('settings', '→ applyTheme 开始', { theme });
    document.body.classList.toggle('theme-light', theme === 'light');
    const titleIcon = document.getElementById('title-icon');
    if (titleIcon) titleIcon.src = theme === 'light' ? '../resources/Black.png' : '../resources/White.png';
    const aboutIcon = document.getElementById('about-app-icon');
    if (aboutIcon) aboutIcon.src = theme === 'light' ? '../resources/Black.png' : '../resources/White.png';
    // 窗口背景始终透明（圆角由 CSS clip-path 处理），不设置不透明背景色
}

// ============================================================
// 背景材质系统（对齐测试文件 mica-test.html 的三层架构）
//   applyTint()      — 控制内容区不透明度（--content-tint + --bg-*）
//   applyOverlay()   — 控制底层遮罩不透明度（--overlay-tint，覆盖边框+内容区底层）
//   applyBarTint()   — 仅控制标题栏不透明度（--title-bar-tint）
//   applyBackgroundMaterial() — 总入口，调用上述函数
// ============================================================

// 读取当前主题的实色值
// 优先从 body.dataset.themeColors 读取原始主题色（避免被 applyTint 覆盖后的半透明值污染）
function readThemeColors() {
    let cached = null;
    try {
        cached = JSON.parse(document.body.dataset.themeColors || 'null');
    } catch (e) {
        weLog.error('settings', 'readThemeColors: 解析 themeColors 缓存失败', e && e.stack ? e.stack : String(e));
    }
    if (cached) return cached;
    const styles = getComputedStyle(document.body);
    const colors = {
        bgSidebar: styles.getPropertyValue('--bg-sidebar').trim(),
        bgMain: styles.getPropertyValue('--bg-main').trim(),
        gapColor: styles.getPropertyValue('--gap-color').trim(),
        border: styles.getPropertyValue('--border').trim()
    };
    document.body.dataset.themeColors = JSON.stringify(colors);
    return colors;
}

// 清除主题色缓存（applyColorPreset 切换主题后调用）
function clearThemeColorsCache() {
    delete document.body.dataset.themeColors;
}

// 仅控制内容区不透明度
// tint: 0-100，100=完全不透明，0=完全透明
function applyTint(tint) {
    weLog.debug('settings', '→ applyTint 开始（只读日志）', { tint });
    const { bgSidebar, bgMain, border } = readThemeColors();
    const alpha = (tint ?? 78) / 100;
    document.body.style.setProperty('--content-tint', hexToRgba(bgSidebar, alpha));
    document.body.style.setProperty('--bg-sidebar', hexToRgba(bgSidebar, alpha));
    document.body.style.setProperty('--bg-main', hexToRgba(bgMain, alpha));
    document.body.style.setProperty('--border', hexToRgba(border, alpha));
}

// 控制底层遮罩不透明度（覆盖边框+内容区底层，颜色跟随主题 gap-color）
// overlay: 0-100，100=完全不透明，0=完全透明
function applyOverlay(overlay) {
    weLog.debug('settings', '→ applyOverlay 开始（只读日志）', { overlay });
    const { gapColor } = readThemeColors();
    const alpha = (overlay ?? 30) / 100;
    document.body.style.setProperty('--overlay-tint', hexToRgba(gapColor, alpha));
    // 标签栏边框色跟随遮罩（标签栏在遮罩之上，用 gap-color 半透明）
    document.body.style.setProperty('--gap-color', hexToRgba(gapColor, alpha));
}

// 仅控制标题栏不透明度
// barTint: 0-100，100=实心（主题色），0=完全透明
function applyBarTint(barTint) {
    weLog.debug('settings', '→ applyBarTint 开始（只读日志）', { barTint });
    const { bgSidebar } = readThemeColors();
    const alpha = (barTint ?? 100) / 100;
    document.body.style.setProperty('--title-bar-tint', hexToRgba(bgSidebar, alpha));
    const titleBar = document.getElementById('title-bar');
    if (titleBar) titleBar.style.removeProperty('border-bottom');
}

// 应用背景图片：dataUrl 为 null 时隐藏图片层
// opacity: 0-100
function applyBackgroundImage(dataUrl, opacity) {
    weLog.info('settings', '→ applyBackgroundImage 开始（只读日志）', { hasDataUrl: !!dataUrl, opacity });
    const layer = document.getElementById('background-image-layer');
    if (!layer) return;
    if (dataUrl) {
        layer.style.backgroundImage = `url("${dataUrl}")`;
        layer.style.opacity = Math.max(0, Math.min(1, (opacity ?? 100) / 100));
        layer.style.display = 'block';
    } else {
        layer.style.backgroundImage = '';
        layer.style.display = 'none';
    }
}
window.applyBackgroundImage = applyBackgroundImage;

// 恢复不透明状态（材质为"无"时调用）
function resetMaterialStyles() {
    const { bgSidebar, bgMain, gapColor, border } = readThemeColors();
    document.body.style.setProperty('--content-tint', bgSidebar);
    document.body.style.setProperty('--bg-sidebar', bgSidebar);
    document.body.style.setProperty('--bg-main', bgMain);
    document.body.style.setProperty('--border', border);
    document.body.style.setProperty('--gap-color', gapColor);
    document.body.style.setProperty('--overlay-tint', gapColor);
    document.body.style.setProperty('--title-bar-tint', bgSidebar);
    const titleBar = document.getElementById('title-bar');
    if (titleBar) titleBar.style.removeProperty('border-bottom');
}

// 应用背景材质（总入口）
// material: 'none' | 'mica' | 'acrylic' | 'tabbed'
// tint: 内容区不透明度（0-100）
// overlay: 底层遮罩不透明度（0-100）
// barTint: 标题栏不透明度（0-100）
function applyBackgroundMaterial(material, tint, overlay, barTint) {
    weLog.info('settings', '→ applyBackgroundMaterial 开始（只读日志）', { material, tint, overlay, barTint });
    const active = material && material !== 'none';
    console.log(`[renderer] applyBackgroundMaterial | material=${material} tint=${tint} overlay=${overlay} barTint=${barTint} active=${active}`);
    document.documentElement.classList.toggle('material-active', active);
    document.body.classList.toggle('material-active', active);
    document.body.dataset.bgMaterial = material || 'none';
    window.__lastMaterialSettings = { material, tint, overlay, barTint };

    if (!active) {
        console.log(`[renderer] applyBackgroundMaterial → 调用 resetMaterialStyles()`);
        resetMaterialStyles();
        return;
    }
    console.log(`[renderer] applyBackgroundMaterial → applyTint(${tint}) + applyOverlay(${overlay}) + applyBarTint(${barTint})`);
    applyTint(tint);
    applyOverlay(overlay);
    applyBarTint(barTint);
}

// 颜色转 rgba 工具函数
function hexToRgba(color, alpha) {
    color = color.trim();
    if (color.startsWith('rgba')) {
        // 替换已有 rgba 的 alpha 值
        return color.replace(/rgba\(([^)]+),\s*[\d.]+\)/, (_, rgb) => `rgba(${rgb}, ${alpha})`);
    }
    if (color.startsWith('rgb(')) {
        return color.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
    }
    // hex 格式 #rgb 或 #rrggbb
    let hex = color.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    if (hex.length === 8) hex = hex.slice(0, 6); // 去掉 alpha 通道
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// 应用主题配色预设
function applyColorPreset(presetName, customColors) {
    weLog.info('settings', '→ applyColorPreset 开始（只读日志）', { presetName, hasCustomColors: !!customColors });
    currentColorPreset = presetName;
    const target = document.body;  // 设到 body 以覆盖 body.theme-light 的硬编码

    // 清除之前的预设（在 body 和 root 上都清除）
    const cssVars = ['--bg-main', '--bg-sidebar', '--bg-toolbar', '--border', '--text', '--text-secondary', '--accent', '--accent-hover', '--gap-color', '--content-tint', '--overlay-tint', '--title-bar-tint'];
    cssVars.forEach(v => {
        target.style.removeProperty(v);
        document.documentElement.style.removeProperty(v);
    });
    // 清除主题色缓存，让 readThemeColors 重新读取新主题色
    clearThemeColorsCache();

    if (presetName === 'custom' && customColors) {
        const bgMain = customColors['--bg-main'] || '#1e1e1e';
        const isLight = hexToLuminance(bgMain) > 0.5;
        if (isLight) target.classList.add('theme-light');
        else target.classList.remove('theme-light');
        for (const [cssVar, color] of Object.entries(customColors)) {
            target.style.setProperty(cssVar, color);
        }
    } else if (THEME_PRESETS[presetName]) {
        const preset = THEME_PRESETS[presetName];
        // 同步亮/暗主题
        const isLight = presetName.includes('light') || presetName === 'we-light';
        if (isLight) target.classList.add('theme-light');
        else target.classList.remove('theme-light');
        // 在 body 上设置变量 —— 内联样式优先级高于 stylesheet 中的 body.theme-light
        for (const [cssVar, color] of Object.entries(preset.colors)) {
            target.style.setProperty(cssVar, color);
        }
    }

    // 同步标题栏/关于页图标与原生背景色（亮/暗主题）
    const isLightTheme = target.classList.contains('theme-light');
    const titleIcon = document.getElementById('title-icon');
    if (titleIcon) titleIcon.src = isLightTheme ? '../resources/Black.png' : '../resources/White.png';
    const aboutIcon = document.getElementById('about-app-icon');
    if (aboutIcon) aboutIcon.src = isLightTheme ? '../resources/Black.png' : '../resources/White.png';
    // 窗口背景始终透明（圆角由 CSS clip-path 处理），不设置不透明背景色

    // 主题切换后，若材质已激活则重新读取新主题颜色并应用半透明值
    // 否则 body 上的旧内联 rgba 会覆盖新主题颜色
    if (target.classList.contains('material-active') && typeof applyBackgroundMaterial === 'function') {
        const m = target.dataset.bgMaterial || 'none';
        if (m && m !== 'none') {
            const saved = window.__lastMaterialSettings || {};
            console.log(`[renderer] applyColorPreset 主题切换 → 重新应用材质 applyBackgroundMaterial('${m}')`);
            applyBackgroundMaterial(m, saved.tint ?? 78, saved.overlay ?? 30, saved.barTint ?? 100);
        }
    }
    // 注意：此处不再调用 weAPI.setBackgroundMaterial。
    // applyColorPreset 的职责是应用配色预设（CSS），不应覆盖材质设置。
    // body 上无 data-bg-material 属性，旧代码会用 'none' 覆盖已保存的材质值，导致重启后丢失。
    // 材质的 OS 层面应用由窗口构造时和"应用"按钮的 setBackgroundMaterial 调用负责。

    // 主题切换后刷新节点图样式
    if (typeof refreshNodeGraphTheme === 'function') refreshNodeGraphTheme();
}

// 计算颜色相对亮度（用于判断亮/暗主题）
function hexToLuminance(hex) {
    const c = hex.replace('#', '');
    const r = parseInt(c.substr(0, 2), 16) / 255;
    const g = parseInt(c.substr(2, 2), 16) / 255;
    const b = parseInt(c.substr(4, 2), 16) / 255;
    return 0.299 * r + 0.587 * g + 0.114 * b;
}

function applyFontSettings(family, size) {
    weLog.info('settings', '→ applyFontSettings 开始', { family, size });
    document.documentElement.style.setProperty('--font-family', family);
    document.documentElement.style.setProperty('--font-size', size + 'px');
    document.documentElement.style.setProperty('--editor-font-size', size + 'px');
    savedFontFamily = family;
    savedFontSize = size;
    if (quill) {
        quill.root.style.fontFamily = family;
        quill.root.style.fontSize = size + 'px';
    }
}

function setupAutoSave(minutes) {
    weLog.info('settings', '→ setupAutoSave 开始', { minutes });
    clearInterval(autoSaveTimer);
    if (minutes > 0) {
        autoSaveTimer = setInterval(() => {
            if (activeTabId && tabs[activeTabId] && tabs[activeTabId].dirty) {
                saveCurrentFile(true);
            }
        }, minutes * 60 * 1000);
    }
}

function updateStatusBar() {
    weLog.debug('settings', '→ updateStatusBar 开始', { activeTabId });
    if (!activeTabId || !tabs[activeTabId]) return;
    const statusBar = document.getElementById('status-bar');
    if (!statusBar) return;
    
    // 检查是否有新的状态栏结构
    const existingStatus = statusBar.querySelector('.status-left .status-item');
    if (!existingStatus) {
        // 结构不存在则先重建
        if (typeof window.initStatusBar === 'function') {
            window.initStatusBar();
        }
    }
    const statusItem = statusBar.querySelector('.status-left .status-item');
    if (statusItem) {
        if (tabs[activeTabId].dirty) {
            statusItem.innerHTML = `<span class="status-label">${t('ui.modified') || '已修改'}</span>`;
            statusItem.classList.add('dirty');
        } else {
            statusItem.innerHTML = `<span class="status-label">${t('ui.saved') || '已保存'}</span>`;
            statusItem.classList.remove('dirty');
        }
    }
}

// SVG 箭头图标（与文件树风格一致）
const ARROW_COLLAPSED_SVG = '<svg class="toc-arrow-svg" viewBox="0 0 16 16" width="10" height="10"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ARROW_EXPANDED_SVG = '<svg class="toc-arrow-svg" viewBox="0 0 16 16" width="10" height="10"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

async function loadUpdateNotes() {
    weLog.info('settings', '→ loadUpdateNotes 开始');
    const container = document.getElementById('update-notes-container');
    const tocList = document.getElementById('update-notes-toc-list');
    if (!container || !tocList) {
        weLog.warn('settings', 'loadUpdateNotes: container 或 tocList 元素不存在');
        return;
    }
    if (container.dataset.loaded) {
        weLog.debug('settings', 'loadUpdateNotes: 已加载过，跳过');
        return;
    }
    container.dataset.loaded = 'true';

    try {
        const settings = await weAPI.getSettings();
        const currentLang = settings.language || 'en';
        const res = await weAPI.getUpdateNotes(currentLang);
        const useMd = settings.markdownRender !== false;

        if (res.success && res.notes.length > 0) {
            // 按版本号降序排列（最新在前）
            const sortedNotes = [...res.notes].sort((a, b) => {
                const va = a.version.split('.').map(Number);
                const vb = b.version.split('.').map(Number);
                for (let i = 0; i < 3; i++) {
                    if ((vb[i] || 0) !== (va[i] || 0)) return (vb[i] || 0) - (va[i] || 0);
                }
                return 0;
            });

            // 存储每个版本的渲染结果和子标题
            const versionCards = {};
            const latestVersion = sortedNotes[0].version;

            for (const note of sortedNotes) {
                const ver = note.version;
                const versionAnchor = 'ver-' + ver.replace(/\./g, '-');
                let bodyHtml = '';
                let headings = [];
                if (useMd) {
                    const { html, anchors } = renderMarkdown(note.content);
                    // 给所有标题 ID 添加版本前缀，确保唯一性
                    let prefixedHtml = html;
                    for (const a of anchors) {
                        const origId = a.anchor;
                        const newId = versionAnchor + '-' + origId;
                        prefixedHtml = prefixedHtml.replace(
                            new RegExp(`id="${origId}"`, 'g'),
                            `id="${newId}"`
                        );
                    }
                    bodyHtml = prefixedHtml;
                    // 收集 h2 和 h3 标题用于目录（排除 h1 总标题）
                    headings = anchors.filter(a => a.level >= 2 && a.level <= 3).map(a => ({
                        level: a.level,
                        text: a.text,
                        anchor: versionAnchor + '-' + a.anchor
                    }));
                } else {
                    bodyHtml = `<p>${escapeHtml(note.content).replace(/\n/g, '<br>')}</p>`;
                }
                versionCards[ver] = {
                    anchor: versionAnchor,
                    html: `<div class="update-note-content md-body">${bodyHtml}</div>`,
                    headings: headings
                };
            }

            // 构建目录 HTML
            let tocHtml = '';
            sortedNotes.forEach((note, idx) => {
                const ver = note.version;
                const card = versionCards[ver];

                tocHtml += `<li class="toc-version collapsed" data-version="${ver}">`;
                tocHtml += `<span class="toc-arrow-icon">${ARROW_COLLAPSED_SVG}</span>`;
                tocHtml += `<span class="toc-version-label">v${escapeHtml(ver)}</span>`;
                tocHtml += `</li>`;

                // 子标题
                if (card.headings && card.headings.length > 0) {
                    tocHtml += `<ul class="toc-sub-list hidden" data-version="${ver}">`;
                    for (const h of card.headings) {
                        const indent = (h.level - 2) * 12;
                        tocHtml += `<li class="toc-heading-item" data-anchor="${h.anchor}" style="padding-left:${indent + 12}px">`;
                        tocHtml += `<span class="toc-heading-dot"></span>${escapeHtml(h.text)}`;
                        tocHtml += `</li>`;
                    }
                    tocHtml += `</ul>`;
                }
            });
            tocList.innerHTML = tocHtml;

            // 初始空状态：不默认展开任何版本，显示提示
            container.innerHTML = `<div class="update-notes-placeholder">
                <div class="placeholder-icon">📋</div>
                <div class="placeholder-text">${t('ui.update_notes_placeholder') || '← 点击左侧版本号查看日志'}</div>
            </div>`;

            // 版本目录项点击：展开/折叠子标题 + 切换显示
            tocList.querySelectorAll('.toc-version').forEach(li => {
                li.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const ver = li.dataset.version;
                    const card = versionCards[ver];
                    if (!card) return;

                    const isActive = li.classList.contains('active');
                    const isCollapsed = li.classList.contains('collapsed');
                    const subList = tocList.querySelector(`.toc-sub-list[data-version="${ver}"]`);

                    if (isActive) {
                        // 已激活 → 折叠，恢复空状态提示
                        li.classList.remove('active');
                        li.classList.add('collapsed');
                        const arrow = li.querySelector('.toc-arrow-icon');
                        if (arrow) arrow.innerHTML = ARROW_COLLAPSED_SVG;
                        if (subList) subList.classList.add('hidden');

                        // 恢复 placeholder
                        container.innerHTML = `<div class="update-notes-placeholder">
                            <div class="placeholder-icon">📋</div>
                            <div class="placeholder-text">${t('ui.update_notes_placeholder') || '← 点击左侧版本号查看日志'}</div>
                        </div>`;
                    } else {
                        // 未激活 → 切换到该版本并展开
                        // 先收起所有其他版本
                        tocList.querySelectorAll('.toc-version').forEach(x => {
                            if (x !== li) {
                                x.classList.remove('active');
                                x.classList.add('collapsed');
                                x.classList.add('hidden-version');
                                const a = x.querySelector('.toc-arrow-icon');
                                if (a) a.innerHTML = ARROW_COLLAPSED_SVG;
                                const sl = tocList.querySelector(`.toc-sub-list[data-version="${x.dataset.version}"]`);
                                if (sl) sl.classList.add('hidden');
                            }
                        });

                        li.classList.remove('collapsed');
                        li.classList.add('active');
                        const arrow = li.querySelector('.toc-arrow-icon');
                        if (arrow) arrow.innerHTML = ARROW_EXPANDED_SVG;
                        if (subList) subList.classList.remove('hidden');

                        // 渲染内容区
                        container.innerHTML = `<div class="update-note-card active-version" data-version="${ver}">
                            <div class="version-body">${card.html}</div>
                        </div>`;
                    }
                });
            });

            // 子标题点击：平滑滚转到对应位置
            tocList.querySelectorAll('.toc-heading-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const anchor = item.dataset.anchor;
                    const target = document.getElementById(anchor);
                    if (target) {
                        // 用 getBoundingClientRect 计算相对容器的真实偏移，避免 offsetParent 嵌套导致定位错误
                        const targetRect = target.getBoundingClientRect();
                        const containerRect = container.getBoundingClientRect();
                        const offset = container.scrollTop + targetRect.top - containerRect.top - 10;
                        container.scrollTo({ top: offset, behavior: 'smooth' });
                    }
                });
            });

            // 内容区外部链接点击 → 外部浏览器
            container.addEventListener('click', (e) => {
                const link = e.target.closest('a[href]');
                if (!link) return;
                const url = link.getAttribute('href');
                if (url && url.startsWith('http')) {
                    e.preventDefault();
                    weAPI.openExternalLink(url);
                }
            });
        } else {
            container.innerHTML = '<div class="update-notes-empty">暂无更新日志</div>';
            tocList.innerHTML = '';
        }
    } catch (e) {
        weLog.error('settings', 'loadUpdateNotes 加载更新日志失败', e && e.stack ? e.stack : String(e));
        container.innerHTML = '<div class="update-notes-empty">加载失败</div>';
        tocList.innerHTML = '';
    }
}

// ========== 开放源代码库 ==========
const OSS_LICENSES = [
    {
        name: 'Electron',
        version: 'latest',
        license: 'MIT License',
        url: 'https://github.com/electron/electron',
        description: 'Cross-platform desktop application framework',
        licenseText: `MIT License

Copyright (c) 2013-2024 GitHub Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`
    },
    {
        name: 'Node.js',
        version: 'latest',
        license: 'MIT License',
        url: 'https://github.com/nodejs/node',
        description: 'JavaScript runtime built on Chrome V8 engine',
        licenseText: `MIT License

Copyright (c) Joyent, Inc. and other Node contributors.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`
    },
    {
        name: 'Lucide Icons',
        version: '1.28.0',
        license: 'ISC License',
        url: 'https://github.com/lucide-icons/lucide',
        description: 'Beautiful & consistent icon toolkit',
        licenseText: `ISC License

Copyright (c) 2024, Lucide Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.`
    },
    {
        name: 'Quill',
        version: '2.0.2',
        license: 'BSD 3-Clause License',
        url: 'https://github.com/quilljs/quill',
        description: 'Powerful rich text editor for the web',
        licenseText: `BSD 3-Clause License

Copyright (c) 2024, Quill Contributors
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

* Neither the name of the copyright holder nor the names of its
  contributors may be used to endorse or promote products derived from
  this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.`
    },
    {
        name: 'KaTeX',
        version: 'latest',
        license: 'MIT License',
        url: 'https://github.com/KaTeX/KaTeX',
        description: 'Fast, easy-to-use math LaTeX rendering',
        licenseText: `MIT License

Copyright (c) 2013-2024 KaTeX Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`
    },
    {
        name: 'archiver',
        version: 'latest',
        license: 'MIT License',
        url: 'https://github.com/archiverjs/node-archiver',
        description: 'ZIP stream archiver for Node.js',
        licenseText: `MIT License

Copyright (c) 2012-2024 archiver contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`
    },
    {
        name: 'unzipper',
        version: 'latest',
        license: 'MIT License',
        url: 'https://github.com/ZJONSSON/node-unzipper',
        description: 'ZIP extraction for Node.js',
        licenseText: `MIT License

Copyright (c) 2012-2024 unzipper contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`
    }
];

function loadOssLicenses() {
    weLog.info('settings', '→ loadOssLicenses 开始');
    const container = document.getElementById('oss-licenses-list');
    if (!container) {
        weLog.warn('settings', 'loadOssLicenses: container 元素不存在');
        return;
    }
    if (container.dataset.loaded) {
        weLog.debug('settings', 'loadOssLicenses: 已加载过，跳过');
        return;
    }
    container.dataset.loaded = 'true';

    const viewText = t('ui.oss_view_license') || '查看许可证';
    const closeText = t('ui.oss_close') || '关闭';

    let html = '';
    OSS_LICENSES.forEach((lib, idx) => {
        const licenseId = `oss-license-${idx}`;
        html += `<div class="oss-license-item">
            <div class="oss-license-header">
                <div class="oss-license-info">
                    <span class="oss-license-name">${escapeHtml(lib.name)}</span>
                    <span class="oss-license-version">v${escapeHtml(lib.version)}</span>
                    <span class="oss-license-badge">${escapeHtml(lib.license)}</span>
                </div>
                <div class="oss-license-actions">
                    <a href="#" class="oss-license-toggle" data-target="${licenseId}">${viewText}</a>
                </div>
            </div>
            <div class="oss-license-body" id="${licenseId}" style="display:none">
                <div class="oss-license-desc">${escapeHtml(lib.description)}</div>
                <pre class="oss-license-text">${escapeHtml(lib.licenseText)}</pre>
            </div>
        </div>`;
    });
    container.innerHTML = html;

    // 绑定展开/折叠事件
    container.querySelectorAll('.oss-license-toggle').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = btn.dataset.target;
            const target = document.getElementById(targetId);
            if (target) {
                const isHidden = target.style.display === 'none';
                target.style.display = isHidden ? 'block' : 'none';
                btn.textContent = isHidden ? closeText : viewText;
            }
        });
    });

    // 绑定外部链接点击
    container.addEventListener('click', (e) => {
        const link = e.target.closest('.oss-license-name, .oss-license-version');
        if (link) {
            e.preventDefault();
            const lib = OSS_LICENSES[parseInt(link.closest('.oss-license-item').dataset.idx || '0')];
            if (lib && lib.url) weAPI.openExternalLink(lib.url);
        }
    });

    // 点击库名/版本号跳转仓库
    container.querySelectorAll('.oss-license-item').forEach((item, idx) => {
        item.dataset.idx = idx;
        const nameEl = item.querySelector('.oss-license-name');
        const versionEl = item.querySelector('.oss-license-version');
        nameEl.style.cursor = 'pointer';
        versionEl.style.cursor = 'pointer';
        nameEl.title = t('ui.oss_view_repo') || '查看仓库';
        versionEl.title = t('ui.oss_view_repo') || '查看仓库';
        nameEl.addEventListener('click', (e) => {
            e.preventDefault();
            weAPI.openExternalLink(OSS_LICENSES[idx].url);
        });
        versionEl.addEventListener('click', (e) => {
            e.preventDefault();
            weAPI.openExternalLink(OSS_LICENSES[idx].url);
        });
    });
}

function applyToolbarVisibility(show) {
    const tb = document.getElementById('quill-toolbar');
    if (tb) tb.style.display = show ? '' : 'none';
}
function applyWordCountVisibility(show) {
    const wc = document.getElementById('word-count');
    if (wc) wc.style.display = show ? '' : 'none';
}

// ========== 标题栏更新指示器 ==========
let lastUpdateResult = null;

function showUpdateIndicator(result) {
    weLog.info('settings', '→ showUpdateIndicator 开始', { latestVersion: result?.latestVersion });
    lastUpdateResult = result;
    const btn = document.getElementById('btn-update-available');
    const sep = document.getElementById('update-separator');
    if (!btn) {
        weLog.warn('settings', 'showUpdateIndicator: btn-update-available 元素不存在');
        return;
    }
    const title = (t('ui.update_available_title') || '发现新版本') + `: v${result.latestVersion}`;
    btn.title = title;
    btn.style.display = '';
    if (sep) sep.style.display = '';
}

function hideUpdateIndicator() {
    weLog.info('settings', '→ hideUpdateIndicator 开始');
    lastUpdateResult = null;
    const btn = document.getElementById('btn-update-available');
    const sep = document.getElementById('update-separator');
    if (btn) btn.style.display = 'none';
    if (sep) sep.style.display = 'none';
}

// 标题栏更新指示器点击事件（跳转到设置页检查更新）
window.initUpdateIndicatorClick = function() {
    const btn = document.getElementById('btn-update-available');
    if (btn) {
        btn.onclick = () => {
            createSettingsTab();
            setTimeout(() => {
                const navItems = document.querySelectorAll('.settings-nav .nav-item');
                navItems.forEach(n => n.classList.remove('active'));
                const generalNav = document.querySelector('.settings-nav .nav-item[data-section="general"]');
                if (generalNav) generalNav.click();
                const checkBtn = document.getElementById('btn-check-update');
                if (checkBtn) checkBtn.click();
            }, 100);
        };
    }
};
