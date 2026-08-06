// ====== 全局命令面板（类似 VSCode Ctrl+P / Ctrl+Shift+P） ======

const commandPalette = {
    element: null,
    input: null,
    list: null,
    isVisible: false,
    selectedIndex: 0,
    filteredCommands: [],
    mode: 'all', // 'all' | 'command' | 'settings'

    commands: [],

    register(cmd) {
        weLog.debug('command-palette', '→ register', { id: cmd && cmd.id });
        if (!this.commands.find(c => c.id === cmd.id)) {
            this.commands.push(cmd);
        }
    },

    registerDefaults() {
        weLog.info('command-palette', '→ registerDefaults 开始');
        const fileGroup = t('ui.file_operations') || '文件操作';
        const tabGroup = t('ui.tab_operations') || '标签操作';
        const viewGroup = t('ui.view_operations') || '视图操作';
        const insertGroup = t('ui.insert_operations') || '插入';
        const settingsGroup = t('ui.settings') || '设置';
        const exportGroup = t('ui.export') || '导出';
        const searchGroup = t('ui.search_group') || '搜索';

        // 文件操作
        this.register({ id: 'new-project', label: t('ui.new_project') || '新建项目', group: fileGroup, action: () => createNewProjectTab() });
        this.register({ id: 'open-project', label: t('ui.open_folder') || '打开项目', group: fileGroup, action: () => { if (typeof openProject === 'function') openProject(); } });
        this.register({ id: 'save-file', label: t('ui.save') || '保存', group: fileGroup, action: () => { if (typeof saveCurrentFile === 'function') saveCurrentFile(); } });
        this.register({ id: 'new-file', label: t('ui.new_file') || '新建文件', group: fileGroup, action: () => {
            if (activeTabId && tabs[activeTabId]?.projectPath) { if (typeof addFileToProject === 'function') addFileToProject(activeTabId); }
            else createNewProjectTab();
        }});
        this.register({ id: 'switch-mode', label: t('ui.switch_editor_mode') || '切换编辑器模式', group: fileGroup, action: () => { if (typeof switchEditorMode === 'function') switchEditorMode(); } });

        // 设置导航
        const sections = ['general', 'tags', 'account', 'appearance', 'editor', 'shortcuts', 'about'];
        const sectionLabels = {
            general: t('ui.general') || '通用',
            tags: t('ui.tags_settings') || '固定标签',
            account: t('ui.account') || '账户',
            appearance: t('ui.appearance') || '外观',
            editor: t('ui.editor') || '编辑器',
            shortcuts: t('ui.shortcuts') || '快捷键',
            about: t('ui.about') || '关于',
        };
        sections.forEach(sec => {
            this.register({
                id: `settings-${sec}`,
                label: `${t('ui.settings') || '设置'}: ${sectionLabels[sec]}`,
                group: settingsGroup,
                isSettings: true,
                action: () => {
                    if (!tabs['settings']) {
                        createSettingsTab();
                        setTimeout(() => navigateToSettingsSection(sec), 100);
                    } else {
                        switchTab('settings');
                        navigateToSettingsSection(sec);
                    }
                }
            });
        });
        this.register({ id: 'settings', label: t('ui.settings') || '设置', group: fileGroup, action: () => {
            if (!tabs['settings']) createSettingsTab(); else switchTab('settings');
        }});

        // 导出
        this.register({ id: 'export-md', label: t('ui.export_markdown') || '导出为 Markdown', group: exportGroup, action: () => { if (typeof handleExport === 'function') handleExport('md'); } });
        this.register({ id: 'export-html', label: t('ui.export_html') || '导出为 HTML', group: exportGroup, action: () => { if (typeof handleExport === 'function') handleExport('html'); } });
        this.register({ id: 'export-pdf', label: t('ui.export_pdf') || '导出为 PDF', group: exportGroup, action: () => { if (typeof handleExport === 'function') handleExport('pdf'); } });
        this.register({ id: 'export-zip', label: t('ui.export_zip') || '导出为 ZIP', group: exportGroup, action: () => { if (typeof handleExport === 'function') handleExport('zip'); } });

        // 标签操作
        this.register({ id: 'close-tab', label: t('ui.close_tab') || '关闭标签', group: tabGroup, action: () => {
            if (activeTabId && tabs[activeTabId]?.closable) closeTab(activeTabId);
        }});
        this.register({ id: 'next-tab', label: t('ui.next_tab') || '下一个标签', group: tabGroup, action: () => switchToNextTab() });
        this.register({ id: 'prev-tab', label: t('ui.prev_tab') || '上一个标签', group: tabGroup, action: () => switchToPrevTab() });

        // 视图
        this.register({ id: 'toggle-shortcuts', label: t('ui.show_shortcuts') || '显示快捷键帮助', group: viewGroup, action: () => shortcutHelpPanel.toggle() });

        // 搜索
        this.register({ id: 'find', label: t('ui.find') || '查找', hint: 'Ctrl+F', group: searchGroup, action: () => findBar.show(false) });
        this.register({ id: 'replace', label: t('ui.find_replace') || '查找和替换', hint: 'Ctrl+H', group: searchGroup, action: () => findBar.show(true) });

        // 插入
        this.register({ id: 'insert-formula-block', label: t('ui.insert_formula_block') || '插入块级公式', group: insertGroup, action: () => insertMarkdownSnippet('$$\nE = mc^2\n$$') });
        this.register({ id: 'insert-formula-inline', label: t('ui.insert_formula_inline') || '插入行内公式', group: insertGroup, action: () => insertMarkdownSnippet('$E=mc^2$') });
        weLog.info('command-palette', '← registerDefaults 完成', { count: this.commands.length });
    },

    show(initialQuery) {
        weLog.info('command-palette', '→ show', { initialQuery });
        if (this.isVisible) return;
        this.isVisible = true;
        if (!this.element) this.create();
        this.registerDefaults();
        this.input.value = initialQuery || '';
        this.selectedIndex = 0;
        this.filter(this.input.value);
        this.element.style.display = 'block';
        setTimeout(() => { this.input.focus(); this.input.select(); }, 50);
    },

    hide() {
        weLog.info('command-palette', '→ hide');
        this.isVisible = false;
        if (this.element) this.element.style.display = 'none';
    },

    toggle(initialQuery) {
        weLog.info('command-palette', '→ toggle', { isVisible: this.isVisible, initialQuery });
        if (this.isVisible) this.hide();
        else this.show(initialQuery);
    },

    create() {
        weLog.info('command-palette', '→ create');
        this.element = document.createElement('div');
        this.element.className = 'command-palette-overlay';
        this.element.innerHTML = `
            <div class="command-palette">
                <div class="command-palette-input-wrapper">
                    <span class="command-palette-mode-icon">></span>
                    <input type="text" class="command-palette-input" placeholder="${t('ui.command_palette_placeholder') || '输入命令名称...'}" spellcheck="false">
                    <span class="command-palette-hint"></span>
                </div>
                <div class="command-palette-list"></div>
            </div>
        `;
        document.body.appendChild(this.element);

        this.input = this.element.querySelector('.command-palette-input');
        this.list = this.element.querySelector('.command-palette-list');
        this.modeIcon = this.element.querySelector('.command-palette-mode-icon');
        this.hintEl = this.element.querySelector('.command-palette-hint');

        this.element.addEventListener('click', (e) => {
            if (e.target === this.element) this.hide();
        });

        this.input.addEventListener('input', () => {
            this.selectedIndex = 0;
            this.filter(this.input.value);
        });

        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { e.preventDefault(); this.hide(); return; }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (this.selectedIndex < this.filteredCommands.length - 1) this.selectedIndex++;
                this.updateSelection();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (this.selectedIndex > 0) this.selectedIndex--;
                this.updateSelection();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                this.executeSelected();
            }
        });
    },

    detectMode(query) {
        weLog.debug('command-palette', '→ detectMode', { query });
        if (query.startsWith('>')) return 'command';
        if (query.startsWith('@')) return 'settings';
        return 'all';
    },

    filter(query) {
        weLog.debug('command-palette', '→ filter', { query });
        const mode = this.detectMode(query);
        this.mode = mode;

        // 更新模式图标
        if (mode === 'command') this.modeIcon.textContent = '>';
        else if (mode === 'settings') this.modeIcon.textContent = '@';
        else this.modeIcon.textContent = '';

        // 去除前缀
        const q = (query || '').replace(/^[>@]/, '').toLowerCase().trim();

        let pool = this.commands;
        if (mode === 'command') pool = pool.filter(c => !c.isSettings);
        if (mode === 'settings') pool = pool.filter(c => c.isSettings);

        if (!q) {
            this.filteredCommands = [...pool];
        } else {
            this.filteredCommands = pool.filter(cmd =>
                cmd.label.toLowerCase().includes(q) ||
                (cmd.group && cmd.group.toLowerCase().includes(q)) ||
                (cmd.id && cmd.id.toLowerCase().includes(q))
            );
        }

        // 如果在 all 模式下无匹配，添加"在编辑器中查找"选项
        if (mode === 'all' && q && this.filteredCommands.length === 0) {
            weLog.info('command-palette', 'filter: 无匹配，添加在编辑器中查找选项', { q });
            this.filteredCommands = [{
                id: 'find-in-editor',
                label: `${t('ui.command_palette_find_in_editor') || '在编辑器中查找'}: "${q}"`,
                group: '',
                action: () => {
                    findBar.show(false);
                    findBar.findInput.value = q;
                    findBar.countMatches(q);
                    findBar.findNext(true);
                }
            }];
        }

        this.renderList();
    },

    renderList() {
        if (this.filteredCommands.length === 0) {
            this.list.innerHTML = `<div class="command-palette-empty">${t('ui.command_palette_empty') || '无匹配命令'}</div>`;
            return;
        }

        // 按 group 分组渲染
        const groups = new Map();
        this.filteredCommands.forEach((cmd, i) => {
            const g = cmd.group || '';
            if (!groups.has(g)) groups.set(g, []);
            groups.get(g).push({ cmd, index: i });
        });

        let html = '';
        for (const [group, items] of groups) {
            if (group) html += `<div class="command-palette-group-header">${group}</div>`;
            for (const { cmd, index } of items) {
                const selected = index === this.selectedIndex;
                html += `
                    <div class="command-palette-item ${selected ? 'selected' : ''}" data-index="${index}">
                        <span class="command-palette-label">${cmd.label}</span>
                        ${cmd.hint ? `<kbd class="command-palette-hint-key">${cmd.hint}</kbd>` : ''}
                    </div>
                `;
            }
        }
        this.list.innerHTML = html;

        this.list.querySelectorAll('.command-palette-item').forEach(item => {
            item.addEventListener('click', () => {
                this.selectedIndex = parseInt(item.dataset.index);
                this.executeSelected();
            });
            item.addEventListener('mouseenter', () => {
                this.selectedIndex = parseInt(item.dataset.index);
                this.updateSelection();
            });
        });
    },

    updateSelection() {
        this.list.querySelectorAll('.command-palette-item').forEach((item) => {
            const idx = parseInt(item.dataset.index);
            item.classList.toggle('selected', idx === this.selectedIndex);
        });
        const sel = this.list.querySelector('.command-palette-item.selected');
        if (sel) sel.scrollIntoView({ block: 'nearest' });
    },

    executeSelected() {
        const cmd = this.filteredCommands[this.selectedIndex];
        if (!cmd) { weLog.warn('command-palette', 'executeSelected: 未找到选中命令'); return; }
        weLog.info('command-palette', '→ executeSelected', { id: cmd.id, label: cmd.label });
        this.hide();
        if (cmd.action) {
            try { cmd.action(); }
            catch (e) { weLog.error('command-palette', 'executeSelected 执行失败', e && e.stack ? e.stack : String(e)); }
        }
    }
};

// 跳转到设置页指定 section
function navigateToSettingsSection(section) {
    weLog.info('command-palette', '→ navigateToSettingsSection', { section });
    const nav = document.querySelector('.settings-nav');
    if (!nav) { weLog.warn('command-palette', 'navigateToSettingsSection: settings-nav 不存在'); return; }
    const item = nav.querySelector(`.nav-item[data-section="${section}"]`);
    if (item) item.click();
    else weLog.warn('command-palette', 'navigateToSettingsSection: nav-item 不存在', { section });
}

// ====== 查找/替换栏 ======

const findBar = {
    element: null,
    findInput: null,
    replaceInput: null,
    matchCountEl: null,
    isVisible: false,
    showReplace: false,
    matches: [],
    currentMatch: -1,
    lastQuery: '',

    show(replaceMode) {
        weLog.info('command-palette', '→ findBar.show', { replaceMode, isVisible: this.isVisible });
        if (this.isVisible) {
            if (replaceMode) this.toggleReplace(true);
            this.findInput.focus();
            this.findInput.select();
            return;
        }
        this.isVisible = true;
        this.showReplace = !!replaceMode;
        if (!this.element) this.create();
        this.element.style.display = 'flex';
        this.toggleReplace(this.showReplace);
        setTimeout(() => { this.findInput.focus(); }, 50);
    },

    hide() {
        weLog.info('command-palette', '→ findBar.hide');
        this.isVisible = false;
        if (this.element) this.element.style.display = 'none';
        this.clearHighlights();
    },

    toggle: function() { weLog.info('command-palette', '→ findBar.toggle', { isVisible: this.isVisible }); if (this.isVisible) this.hide(); else this.show(false); },

    create() {
        weLog.info('command-palette', '→ findBar.create');
        this.element = document.createElement('div');
        this.element.className = 'find-bar';
        this.element.innerHTML = `
            <div class="find-bar-main">
                <input type="text" class="find-input" placeholder="${t('ui.find_placeholder') || '查找...'}" spellcheck="false">
                <span class="find-match-count"></span>
                <button class="find-btn find-execute-btn" title="${t('ui.find_execute') || '查找 (Enter)'}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>
                </button>
                <button class="find-btn find-prev-btn" title="${t('ui.find_prev') || '上一个 (Shift+Enter)'}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m18 15-6-6-6 6"/></svg>
                </button>
                <button class="find-btn find-next-btn" title="${t('ui.find_next') || '下一个 (Ctrl+Enter)'}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
                </button>
                <button class="find-btn find-toggle-replace-btn" title="${t('ui.toggle_replace') || '切换替换'}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
                </button>
                <button class="find-btn find-close-btn" title="${t('ui.close') || '关闭 (Esc)'}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
            </div>
            <div class="find-bar-replace" style="display:none;">
                <input type="text" class="replace-input" placeholder="${t('ui.replace_placeholder') || '替换为...'}" spellcheck="false">
                <button class="find-btn replace-btn" title="${t('ui.replace') || '替换'}">${t('ui.replace') || '替换'}</button>
                <button class="find-btn replace-all-btn" title="${t('ui.replace_all') || '全部替换'}">${t('ui.replace_all') || '全部'}</button>
            </div>
        `;
        document.body.appendChild(this.element);

        this.findInput = this.element.querySelector('.find-input');
        this.replaceInput = this.element.querySelector('.replace-input');
        this.matchCountEl = this.element.querySelector('.find-match-count');
        const replaceContainer = this.element.querySelector('.find-bar-replace');
        const toggleReplaceBtn = this.element.querySelector('.find-toggle-replace-btn');

        // 事件绑定：输入只更新匹配计数，不跳转
        this.findInput.addEventListener('input', () => {
            this.countMatches(this.findInput.value);
        });

        this.findInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { e.preventDefault(); this.hide(); return; }
            if (e.key === 'Enter') {
                e.preventDefault();
                if (e.ctrlKey || e.shiftKey === false) this.findNext(true);
                else this.findPrev(true);
            } else if (e.key === 'F3') {
                e.preventDefault();
                if (e.shiftKey) this.findPrev(true);
                else this.findNext(true);
            }
        });

        this.replaceInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { e.preventDefault(); this.hide(); return; }
            if (e.key === 'Enter') {
                e.preventDefault();
                this.doReplace();
            }
        });

        this.element.querySelector('.find-execute-btn').addEventListener('click', () => this.findNext(true));
        this.element.querySelector('.find-next-btn').addEventListener('click', () => this.findNext(true));
        this.element.querySelector('.find-prev-btn').addEventListener('click', () => this.findPrev(true));
        this.element.querySelector('.find-close-btn').addEventListener('click', () => this.hide());
        this.element.querySelector('.replace-btn').addEventListener('click', () => this.doReplace());
        this.element.querySelector('.replace-all-btn').addEventListener('click', () => this.doReplaceAll());

        toggleReplaceBtn.addEventListener('click', () => {
            this.toggleReplace(!this.showReplace);
        });
    },

    toggleReplace(show) {
        this.showReplace = show;
        const replaceContainer = this.element.querySelector('.find-bar-replace');
        const toggleBtn = this.element.querySelector('.find-toggle-replace-btn');
        replaceContainer.style.display = show ? 'flex' : 'none';
        toggleBtn.style.transform = show ? 'rotate(180deg)' : '';
    },

    // 输入时只统计匹配数量，不跳转
    countMatches(query) {
        weLog.debug('command-palette', '→ findBar.countMatches', { query });
        this.lastQuery = query;
        this.matches = [];
        this.currentMatch = -1;

        if (!query) {
            this.updateMatchCount();
            return;
        }

        if (markdownEditor && markdownEditor.offsetParent !== null) {
            this.findInTextarea(markdownEditor, query);
        } else if (typeof quill !== 'undefined' && quill && quill.root) {
            this.findInQuill(quill, query);
        }
        this.updateMatchCount();
    },

    // 确保已收集到当前输入的匹配
    ensureMatchesCollected() {
        const q = this.findInput ? this.findInput.value : this.lastQuery;
        if (!q) return false;
        if (!this.lastQuery || this.lastQuery !== q || this.matches.length === 0) {
            this.countMatches(q);
        }
        return this.matches.length > 0;
    },

    findInTextarea(editor, query) {
        const text = editor.value;
        const lowerText = text.toLowerCase();
        const lowerQuery = query.toLowerCase();
        let pos = 0;
        while (true) {
            const idx = lowerText.indexOf(lowerQuery, pos);
            if (idx === -1) break;
            this.matches.push({ start: idx, end: idx + query.length, type: 'textarea' });
            pos = idx + 1;
        }
    },

    findInQuill(editor, query) {
        const text = editor.getText();
        const lowerText = text.toLowerCase();
        const lowerQuery = query.toLowerCase();
        let pos = 0;
        while (true) {
            const idx = lowerText.indexOf(lowerQuery, pos);
            if (idx === -1) break;
            this.matches.push({ start: idx, end: idx + query.length, type: 'quill' });
            pos = idx + 1;
        }
    },

    findNext(fromInput) {
        weLog.debug('command-palette', '→ findBar.findNext', { fromInput });
        if (!this.ensureMatchesCollected()) return;
        if (fromInput || this.currentMatch < 0) this.currentMatch = 0;
        else this.currentMatch = (this.currentMatch + 1) % this.matches.length;
        this.highlightMatch();
        this.updateMatchCount();
    },

    findPrev(fromInput) {
        weLog.debug('command-palette', '→ findBar.findPrev', { fromInput });
        if (!this.ensureMatchesCollected()) return;
        if (fromInput || this.currentMatch < 0) this.currentMatch = this.matches.length - 1;
        else this.currentMatch = (this.currentMatch - 1 + this.matches.length) % this.matches.length;
        this.highlightMatch();
        this.updateMatchCount();
    },

    highlightMatch() {
        const m = this.matches[this.currentMatch];
        if (!m) return;

        if (m.type === 'textarea' && markdownEditor) {
            markdownEditor.focus();
            markdownEditor.setSelectionRange(m.start, m.end);
            // 滚动到可见
            const lineHeight = parseFloat(getComputedStyle(markdownEditor).lineHeight) || 20;
            const linesBefore = markdownEditor.value.substring(0, m.start).split('\n').length;
            markdownEditor.scrollTop = (linesBefore - 1) * lineHeight - markdownEditor.clientHeight / 2;
        } else if (m.type === 'quill' && quill) {
            quill.focus();
            quill.setSelection(m.start, m.end - m.start);
        }
    },

    updateMatchCount() {
        if (this.matchCountEl) {
            if (this.matches.length === 0) {
                this.matchCountEl.textContent = this.lastQuery ? (t('ui.no_matches') || '无匹配') : '';
            } else {
                this.matchCountEl.textContent = `${this.currentMatch + 1}/${this.matches.length}`;
            }
        }
    },

    clearHighlights() {
        this.matches = [];
        this.currentMatch = -1;
        this.lastQuery = '';
        this.updateMatchCount();
    },

    doReplace() {
        weLog.info('command-palette', '→ findBar.doReplace', { currentMatch: this.currentMatch, matchCount: this.matches.length });
        if (this.currentMatch < 0 || this.matches.length === 0) return;
        const m = this.matches[this.currentMatch];
        const replaceText = this.replaceInput.value;

        if (m.type === 'textarea' && markdownEditor) {
            const val = markdownEditor.value;
            markdownEditor.value = val.substring(0, m.start) + replaceText + val.substring(m.end);
            markdownEditor.dispatchEvent(new Event('input'));
            // 重新查找
            this.find(this.lastQuery);
            if (this.matches.length > 0) {
                this.currentMatch = Math.min(this.currentMatch, this.matches.length - 1);
                this.highlightMatch();
            }
            this.updateMatchCount();
        } else if (m.type === 'quill' && quill) {
            quill.deleteText(m.start, m.end - m.start);
            quill.insertText(m.start, replaceText);
            // 重新查找
            this.find(this.lastQuery);
            if (this.matches.length > 0) {
                this.currentMatch = Math.min(this.currentMatch, this.matches.length - 1);
                this.highlightMatch();
            }
            this.updateMatchCount();
        }
    },

    doReplaceAll() {
        weLog.info('command-palette', '→ findBar.doReplaceAll', { matchCount: this.matches.length, lastQuery: this.lastQuery });
        if (this.matches.length === 0 || !this.lastQuery) return;
        const replaceText = this.replaceInput.value;

        if (markdownEditor && markdownEditor.offsetParent !== null) {
            const val = markdownEditor.value;
            const lowerVal = val.toLowerCase();
            const lowerQuery = this.lastQuery.toLowerCase();
            let result = '';
            let lastEnd = 0;
            let pos = 0;
            while (true) {
                const idx = lowerVal.indexOf(lowerQuery, pos);
                if (idx === -1) break;
                result += val.substring(lastEnd, idx) + replaceText;
                lastEnd = idx + this.lastQuery.length;
                pos = lastEnd;
            }
            result += val.substring(lastEnd);
            markdownEditor.value = result;
            markdownEditor.dispatchEvent(new Event('input'));
        } else if (quill) {
            const text = quill.getText();
            const lowerText = text.toLowerCase();
            const lowerQuery = this.lastQuery.toLowerCase();
            // 从后向前替换以保持索引
            const positions = [];
            let pos = 0;
            while (true) {
                const idx = lowerText.indexOf(lowerQuery, pos);
                if (idx === -1) break;
                positions.push(idx);
                pos = idx + 1;
            }
            for (let i = positions.length - 1; i >= 0; i--) {
                quill.deleteText(positions[i], this.lastQuery.length);
                quill.insertText(positions[i], replaceText);
            }
        }

        this.clearHighlights();
        this.findInput.value = '';
        this.find(this.lastQuery);
        this.updateMatchCount();
    }
};

// 向 Markdown 编辑器插入文本片段
function insertMarkdownSnippet(snippet) {
    weLog.info('command-palette', '→ insertMarkdownSnippet', { snippet });
    if (!markdownEditor) {
        weLog.warn('command-palette', 'insertMarkdownSnippet: markdownEditor 不存在');
        showNotification(t('ui.command_palette_md_only') || '此命令仅在 Markdown 模式可用');
        return;
    }
    const start = markdownEditor.selectionStart;
    const end = markdownEditor.selectionEnd;
    const val = markdownEditor.value;
    const insertText = (start > 0 && val[start - 1] !== '\n') ? '\n' + snippet : snippet;
    markdownEditor.value = val.substring(0, start) + insertText + val.substring(end);
    markdownEditor.selectionStart = markdownEditor.selectionEnd = start + insertText.length;
    markdownEditor.dispatchEvent(new Event('input'));
    markdownEditor.focus();
    weLog.info('command-palette', '← insertMarkdownSnippet 完成');
}

// ====== 标题栏按钮 & 快捷键绑定 ======

document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btn-command-palette');
    if (btn) {
        btn.addEventListener('click', () => commandPalette.toggle());
    }
});
