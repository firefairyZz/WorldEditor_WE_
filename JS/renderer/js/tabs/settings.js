let APP_VERSION = '0.3.0';

// 简易 Markdown 渲染器（无需外部依赖）
let __mdAnchors = [];
function renderMarkdown(md) {
    __mdAnchors = [];
    const lines = md.split(/\r?\n/);
    const out = [];
    let inCode = false, codeBuf = [], codeLang = '';
    let inList = false, listType = '', listBuf = [];
    let inQuote = false, quoteBuf = [];

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

    for (const rawLine of lines) {
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
            flushList(); flushQuote();
            inCode = true;
            codeLang = line.trim().slice(3).trim();
            continue;
        }

        if (!line.trim()) {
            flushList(); flushQuote();
            continue;
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
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
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
    'close-tab', 'next-tab', 'prev-tab', 'goto-tab-1'
];

// 构建快捷键设置 HTML
function buildShortcutsSettingsHTML() {
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

function createSettingsTab() {
    const id = 'settings';
    if (tabs[id]) { switchTab(id); return; }
    const content = document.createElement('div');
    content.className = 'settings-layout';

    const nav = document.createElement('div');
    nav.className = 'settings-nav';
    nav.innerHTML = `
        <div class="nav-item active" data-section="general">${t('ui.general')}</div>
        <div class="nav-item" data-section="editor">${t('ui.editor')}</div>
        <div class="nav-item" data-section="shortcuts">${t('ui.shortcuts') || '快捷键'}</div>
        <div class="nav-item" data-section="about">${t('ui.about')}</div>
    `;
    const panel = document.createElement('div');
    panel.className = 'settings-panel';
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
            </select>
        </div>
        <div class="setting-row">
            <span>${t('ui.theme')}</span>
            <select id="theme-select">
                <option value="dark">${t('ui.dark')}</option>
                <option value="light">${t('ui.light')}</option>
            </select>
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
            <div class="setting-group-title">${t('ui.auto_save_group') || '自动保存'}</div>
            <div class="setting-row">
                <span>${t('ui.auto_save')}</span>
                <select id="auto-save-select">
                    <option value="0">${t('ui.off')}</option>
                    <option value="5">5 ${t('ui.minutes')}</option>
                    <option value="10">10 ${t('ui.minutes')}</option>
                    <option value="15">15 ${t('ui.minutes')}</option>
                </select>
            </div>
            <div class="setting-row">
                <span>${t('ui.tab_close_confirm') || '关闭标签确认'}</span>
                <label class="toggle-switch"><input type="checkbox" id="tab-close-confirm" checked><span class="toggle-slider"></span></label>
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
        </div>
    `;

    const aboutSection = document.createElement('div');
    aboutSection.className = 'settings-section';
    aboutSection.id = 'section-about';
    aboutSection.innerHTML = `
        <h3>${t('ui.about')}</h3>
        <div class="about-info">
            <p style="color:var(--text-secondary)">World Editor <span id="about-version">v${APP_VERSION}</span></p>
            <p style="color:var(--text-secondary); margin-top:4px;">${t('ui.about_desc')}</p>
            <div class="about-links">
                <a href="https://github.com/firefairyZz" class="about-link" data-external="true">
                    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38C13.71 14.53 16 11.53 16 8c0-4.42-3.58-8-8-8z"/></svg>
                    <span>firefairyZz</span>
                </a>
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

    contentArea.appendChild(generalSection);
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
    const applyBtn = document.createElement('button');
    applyBtn.textContent = t('ui.apply');
    applyBtn.className = 'settings-apply-btn';
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
            // 关于页面隐藏应用按钮
            footer.style.display = section === 'about' ? 'none' : 'flex';
            if (section === 'about') loadUpdateNotes();
        });
    });

    // 加载版本号
    weAPI.getVersion().then(v => {
        const verEl = aboutSection.querySelector('#about-version');
        if (verEl) verEl.textContent = 'v' + v;
    });

    weAPI.getSettings().then(s => {
        content.querySelector('#lang-select').value = s.language || 'zh_CN';
        content.querySelector('#theme-select').value = s.theme || 'dark';
        content.querySelector('#font-family-select').value = s.fontFamily || 'Microsoft YaHei';
        content.querySelector('#font-size-select').value = s.fontSize || '16';
        content.querySelector('#auto-save-select').value = s.autoSave || '0';
        const tc = content.querySelector('#tab-close-confirm'); if (tc) tc.checked = s.tabCloseConfirm !== false;
        const wc = content.querySelector('#word-count-toggle'); if (wc) wc.checked = s.wordCount !== false;
        const tb = content.querySelector('#toolbar-show-toggle'); if (tb) tb.checked = s.toolbarShow !== false;
        const md = content.querySelector('#md-render-toggle'); if (md) md.checked = s.markdownRender !== false;
        savedFontFamily = s.fontFamily || 'Microsoft YaHei';
        savedFontSize = s.fontSize || '16';
        if (s.autoSave) setupAutoSave(s.autoSave);
    });

    applyBtn.onclick = async () => {
        const lang = content.querySelector('#lang-select').value;
        const theme = content.querySelector('#theme-select').value;
        const fontFamily = content.querySelector('#font-family-select').value;
        const fontSize = content.querySelector('#font-size-select').value;
        const autoSave = content.querySelector('#auto-save-select').value;
        const tcVal = content.querySelector('#tab-close-confirm')?.checked ?? true;
        const wcVal = content.querySelector('#word-count-toggle')?.checked ?? true;
        const tbVal = content.querySelector('#toolbar-show-toggle')?.checked ?? true;
        const mdVal = content.querySelector('#md-render-toggle')?.checked ?? true;

        // 收集自定义快捷键
        const customShortcuts = collectCustomShortcuts(content);

        await weAPI.setSettings({
            language: lang, theme: theme,
            fontFamily: fontFamily, fontSize: fontSize,
            autoSave: autoSave,
            tabCloseConfirm: tcVal, wordCount: wcVal, toolbarShow: tbVal, markdownRender: mdVal,
            customShortcuts: customShortcuts
        });

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
        tabCloseConfirm = tcVal;
        // Apply live effects
        applyToolbarVisibility(tbVal);
        applyWordCountVisibility(wcVal);
        await loadLanguage(lang);
        showNotification(t('ui.settings_saved'));
        // Reload update notes if markdown render changed
        const c = document.getElementById('update-notes-container');
        if (c) { c.dataset.loaded = ''; loadUpdateNotes(); }
    };

    // 绑定快捷键捕获事件
    bindShortcutCapture(content);

    addTab(id, t('ui.settings'), content, true);
}

function applyTheme(theme) {
    document.body.classList.toggle('theme-light', theme === 'light');
    const titleIcon = document.getElementById('title-icon');
    if (titleIcon) titleIcon.src = theme === 'light' ? '../resources/Black.png' : '../resources/White.png';
    weAPI.setBackgroundColor(theme === 'light' ? '#e8e8e8' : '#2a2a2a');
}

function applyFontSettings(family, size) {
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
    if (!activeTabId || !tabs[activeTabId]) return;
    const statusBar = document.getElementById('status-bar');
    if (!statusBar) return;
    
    // 检查是否有新的状态栏结构
    const existingStatus = statusBar.querySelector('.status-left .status-item');
    if (existingStatus) {
        // 更新新的状态栏结构
        if (tabs[activeTabId].dirty) {
            existingStatus.innerHTML = `<span class="status-label">${t('ui.modified') || '已修改'}</span>`;
            existingStatus.classList.add('dirty');
        } else {
            existingStatus.innerHTML = `<span class="status-label">${t('ui.saved') || '已保存'}</span>`;
            existingStatus.classList.remove('dirty');
        }
    } else {
        // 保持向后兼容
        statusBar.textContent = tabs[activeTabId].dirty ? t('ui.modified') : t('ui.saved');
    }
}

// SVG 箭头图标（与文件树风格一致）
const ARROW_COLLAPSED_SVG = '<svg class="toc-arrow-svg" viewBox="0 0 16 16" width="10" height="10"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ARROW_EXPANDED_SVG = '<svg class="toc-arrow-svg" viewBox="0 0 16 16" width="10" height="10"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

async function loadUpdateNotes() {
    const container = document.getElementById('update-notes-container');
    const tocList = document.getElementById('update-notes-toc-list');
    if (!container || !tocList) return;
    if (container.dataset.loaded) return;
    container.dataset.loaded = 'true';

    try {
        const res = await weAPI.getUpdateNotes();
        const settings = await weAPI.getSettings();
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
                const isLatest = idx === 0;

                tocHtml += `<li class="toc-version ${isLatest ? 'active' : 'collapsed'}" data-version="${ver}">`;
                tocHtml += `<span class="toc-arrow-icon">${isLatest ? ARROW_EXPANDED_SVG : ARROW_COLLAPSED_SVG}</span>`;
                tocHtml += `<span class="toc-version-label">v${escapeHtml(ver)}</span>`;
                tocHtml += `</li>`;

                // 子标题
                if (card.headings && card.headings.length > 0) {
                    tocHtml += `<ul class="toc-sub-list ${isLatest ? '' : 'hidden'}" data-version="${ver}">`;
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

            // 渲染内容区：默认只显示最新版本
            const latestCard = versionCards[latestVersion];
            container.innerHTML = `<div class="update-note-card active-version" data-version="${latestVersion}">
                <div class="version-body">${latestCard.html}</div>
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
                        // 已激活 → 折叠子标题
                        li.classList.remove('active');
                        li.classList.add('collapsed');
                        const arrow = li.querySelector('.toc-arrow-icon');
                        if (arrow) arrow.innerHTML = ARROW_COLLAPSED_SVG;
                        if (subList) subList.classList.add('hidden');

                        // 同步内容区折叠
                        const contentCard = container.querySelector(`.update-note-card[data-version="${ver}"]`);
                        if (contentCard) {
                            contentCard.classList.remove('active-version');
                            const body = contentCard.querySelector('.version-body');
                            if (body) body.style.display = 'none';
                        }
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
        container.innerHTML = '<div class="update-notes-empty">加载失败</div>';
        tocList.innerHTML = '';
    }
}

function applyToolbarVisibility(show) {
    const tb = document.getElementById('quill-toolbar');
    if (tb) tb.style.display = show ? '' : 'none';
}
function applyWordCountVisibility(show) {
    const wc = document.getElementById('word-count');
    if (wc) wc.style.display = show ? '' : 'none';
}