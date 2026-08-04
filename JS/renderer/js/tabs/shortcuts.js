// ========== 快捷键系统 ==========
// 默认快捷键映射
const DEFAULT_SHORTCUTS = {
    'toggle-help':    { key: 'F1',           ctrl: false, shift: false, label: 'ui.show_shortcuts',   group: 'view' },
    'toggle-help-alt':{ key: '/',            ctrl: true,  shift: false, label: 'ui.show_shortcuts2',  group: 'view' },
    'command-palette':{ key: 'p',            ctrl: true,  shift: false, label: 'ui.command_palette', group: 'view' },
    'save':           { key: 's',            ctrl: true,  shift: false, label: 'ui.save_current',     group: 'file' },
    'new-file':       { key: 'n',            ctrl: true,  shift: false, label: 'ui.new_file',         group: 'file' },
    'open-project':   { key: 'o',            ctrl: true,  shift: false, label: 'ui.open_project',     group: 'file' },
    'close-tab':      { key: 'w',            ctrl: true,  shift: false, label: 'ui.close_tab',        group: 'tab' },
    'next-tab':       { key: 'Tab',          ctrl: true,  shift: false, label: 'ui.next_tab',         group: 'tab' },
    'prev-tab':       { key: 'Tab',          ctrl: true,  shift: true,  label: 'ui.prev_tab',         group: 'tab' },
    'goto-tab-1':     { key: '1',            ctrl: true,  shift: false, label: 'ui.goto_tab',         group: 'tab' },
    'goto-tab-2':     { key: '2',            ctrl: true,  shift: false, label: 'ui.goto_tab',         group: 'tab' },
    'goto-tab-3':     { key: '3',            ctrl: true,  shift: false, label: 'ui.goto_tab',         group: 'tab' },
    'goto-tab-4':     { key: '4',            ctrl: true,  shift: false, label: 'ui.goto_tab',         group: 'tab' },
    'goto-tab-5':     { key: '5',            ctrl: true,  shift: false, label: 'ui.goto_tab',         group: 'tab' },
    'goto-tab-6':     { key: '6',            ctrl: true,  shift: false, label: 'ui.goto_tab',         group: 'tab' },
    'goto-tab-7':     { key: '7',            ctrl: true,  shift: false, label: 'ui.goto_tab',         group: 'tab' },
    'goto-tab-8':     { key: '8',            ctrl: true,  shift: false, label: 'ui.goto_tab',         group: 'tab' },
    'goto-tab-9':     { key: '9',            ctrl: true,  shift: false, label: 'ui.goto_tab',         group: 'tab' },
    'find':           { key: 'f',            ctrl: true,  shift: false, label: 'ui.find',             group: 'view' },
    'replace':        { key: 'h',            ctrl: true,  shift: false, label: 'ui.find_replace',     group: 'view' },
    'command-mode':   { key: 'p',            ctrl: true,  shift: true,  label: 'ui.command_palette',  group: 'view' },
    'select-all':     { key: 'a',            ctrl: true,  shift: false, label: 'ui.select_all',       group: 'file' },
    'batch-tag':      { key: 't',            ctrl: true,  shift: false, label: 'ui.batch_tag',        group: 'file' },
};

// 当前生效的快捷键（合并用户自定义）
let activeShortcuts = JSON.parse(JSON.stringify(DEFAULT_SHORTCUTS));

// 加载用户自定义快捷键
async function loadCustomShortcuts() {
    try {
        const settings = await weAPI.getSettings();
        if (settings.customShortcuts) {
            // 合并：用户自定义覆盖默认值
            for (const action in settings.customShortcuts) {
                if (activeShortcuts[action]) {
                    Object.assign(activeShortcuts[action], settings.customShortcuts[action]);
                }
            }
        }
    } catch (e) {
        console.error('Failed to load custom shortcuts:', e);
    }
}

// 格式化快捷键显示文本
function formatShortcutKey(sc) {
    if (!sc) return '';
    let parts = [];
    if (sc.ctrl) parts.push('Ctrl');
    if (sc.shift) parts.push('Shift');
    if (sc.key === 'Tab') parts.push('Tab');
    else if (sc.key.length === 1) parts.push(sc.key.toUpperCase());
    else parts.push(sc.key);
    return parts.join(' + ');
}

// 检查按键事件是否匹配某个快捷键
function matchesShortcut(e, sc) {
    if (!sc) return false;
    const ctrl = e.ctrlKey || e.metaKey;
    return e.key.toLowerCase() === sc.key.toLowerCase() &&
           ctrl === sc.ctrl &&
           e.shiftKey === sc.shift;
}

const shortcutHelpPanel = {
    element: null,
    isVisible: false,

    show() {
        if (this.isVisible) return;
        this.isVisible = true;
        if (!this.element) this.createPanel();
        this.element.style.display = 'flex';
    },

    hide() {
        this.isVisible = false;
        if (this.element) this.element.style.display = 'none';
    },

    toggle() {
        if (this.isVisible) this.hide();
        else this.show();
    },

    createPanel() {
        this.element = document.createElement('div');
        this.element.className = 'shortcut-help-panel';
        this.element.innerHTML = this._buildContent();
        document.body.appendChild(this.element);
        this.element.querySelector('.shortcut-close-btn').onclick = () => this.hide();
        this.element.addEventListener('click', (e) => {
            if (e.target === this.element) this.hide();
        });
    },

    refresh() {
        if (this.element) {
            this.element.querySelector('.shortcut-help-content').innerHTML = this._buildInner();
        }
    },

    _buildContent() {
        return `<div class="shortcut-help-content">${this._buildInner()}</div>`;
    },

    _buildInner() {
        const groups = { file: [], tab: [], view: [] };
        const groupTitles = {
            file: t('ui.file_operations') || '文件操作',
            tab: t('ui.tab_operations') || '标签操作',
            view: t('ui.view_operations') || '视图操作'
        };

        for (const action in activeShortcuts) {
            const sc = activeShortcuts[action];
            // 去重 goto-tab 显示
            if (action.startsWith('goto-tab-') && action !== 'goto-tab-1') continue;
            let displayLabel = t(sc.label) || sc.label;
            if (action === 'goto-tab-1') displayLabel = t('ui.goto_tab') || '跳转到指定标签';
            groups[sc.group].push({
                key: action === 'goto-tab-1' ? 'Ctrl + 1~9' : formatShortcutKey(sc),
                desc: displayLabel
            });
        }

        let html = `
            <div class="shortcut-help-header">
                <span>${t('ui.shortcuts') || '键盘快捷键'}</span>
                <button class="shortcut-close-btn">✕</button>
            </div>
            <div class="shortcut-help-body">
        `;

        for (const g of ['file', 'tab', 'view']) {
            if (groups[g].length === 0) continue;
            html += `<div class="shortcut-group"><div class="shortcut-group-title">${groupTitles[g]}</div>`;
            for (const item of groups[g]) {
                html += `<div class="shortcut-item"><span class="shortcut-key">${item.key}</span><span class="shortcut-desc">${item.desc}</span></div>`;
            }
            html += `</div>`;
        }
        html += `</div>`;
        return html;
    }
};

// 快捷键处理
document.addEventListener('keydown', (e) => {
    const tag = e.target.tagName;
    const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

    // Esc - 关闭快捷键面板
    if (e.key === 'Escape' && shortcutHelpPanel.isVisible) {
        shortcutHelpPanel.hide();
        return;
    }

    // F1 - 显示快捷键帮助（不受 isInput 限制）
    if (matchesShortcut(e, activeShortcuts['toggle-help'])) {
        e.preventDefault();
        shortcutHelpPanel.toggle();
        return;
    }

    // Ctrl+/ - 显示快捷键帮助
    if (matchesShortcut(e, activeShortcuts['toggle-help-alt'])) {
        e.preventDefault();
        shortcutHelpPanel.toggle();
        return;
    }

    // Ctrl+P / Ctrl+Shift+P - 全局命令面板（不受 isInput 限制，但在命令面板自身输入框中不触发）
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        if (commandPalette && commandPalette.isVisible) return;
        e.preventDefault();
        // Ctrl+Shift+P → 命令模式（带 > 前缀）
        if (e.shiftKey) commandPalette.toggle('>');
        else commandPalette.toggle();
        return;
    }

    // Ctrl+F - 查找（不受 isInput 限制，但在命令面板/查找栏自身中不触发）
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        if (commandPalette && commandPalette.isVisible) return;
        if (findBar && findBar.isVisible) { e.preventDefault(); findBar.findInput.focus(); return; }
        e.preventDefault();
        if (findBar) findBar.show(false);
        return;
    }

    // Ctrl+H - 查找和替换
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'h') {
        if (commandPalette && commandPalette.isVisible) return;
        e.preventDefault();
        if (findBar) findBar.show(true);
        return;
    }

    // Ctrl+S - 保存当前文件（在输入框中也生效）
    if (matchesShortcut(e, activeShortcuts['save'])) {
        e.preventDefault();
        saveCurrentFile();
        return;
    }

    // Ctrl+A - 全选文件树中的文件（仅当焦点在文件树区域时）
    if (matchesShortcut(e, activeShortcuts['select-all'])) {
        if (activeTabId && tabs[activeTabId]?.projectPath) {
            const treeContainer = document.getElementById(`file-tree-${activeTabId}`);
            if (treeContainer && treeContainer.contains(document.activeElement)) {
                e.preventDefault();
                selectAllVisible(activeTabId, treeContainer);
                return;
            }
        }
    }

    // Ctrl+T - 批量加标签（仅当选中多个文件时）
    if (matchesShortcut(e, activeShortcuts['batch-tag'])) {
        if (multiSelectState.items.size > 0 && multiSelectState.safeId) {
            e.preventDefault();
            const sid = multiSelectState.safeId;
            const projectPath = tabs[sid]?.projectPath;
            batchAddTags(sid, projectPath);
            return;
        }
    }

    // 以下快捷键在输入框中不生效
    if (isInput) return;

    // Ctrl+N - 新建文件
    if (matchesShortcut(e, activeShortcuts['new-file'])) {
        e.preventDefault();
        if (activeTabId && tabs[activeTabId]?.projectPath) {
            addFileToProject(activeTabId);
        } else {
            createNewProjectTab();
        }
        return;
    }

    // Ctrl+O - 打开项目
    if (matchesShortcut(e, activeShortcuts['open-project'])) {
        e.preventDefault();
        openProject();
        return;
    }

    // Ctrl+W - 关闭当前标签
    if (matchesShortcut(e, activeShortcuts['close-tab'])) {
        e.preventDefault();
        if (activeTabId && tabs[activeTabId]?.closable) {
            closeTab(activeTabId);
        }
        return;
    }

    // Ctrl+Tab - 下一个标签
    if (matchesShortcut(e, activeShortcuts['next-tab'])) {
        e.preventDefault();
        switchToNextTab();
        return;
    }

    // Ctrl+Shift+Tab - 上一个标签
    if (matchesShortcut(e, activeShortcuts['prev-tab'])) {
        e.preventDefault();
        switchToPrevTab();
        return;
    }

    // Ctrl+1~9 - 跳转到指定标签
    for (let i = 1; i <= 9; i++) {
        if (matchesShortcut(e, activeShortcuts[`goto-tab-${i}`])) {
            e.preventDefault();
            const index = i - 1;
            const tabIds = getOrderedTabIds();
            if (index < tabIds.length) {
                switchTab(tabIds[index]);
            }
            return;
        }
    }
});

// 获取按顺序排列的标签ID列表
function getOrderedTabIds() {
    const tabsContainer = document.querySelector('.tabs-container');
    if (!tabsContainer) return Object.keys(tabs);
    const tabElements = tabsContainer.querySelectorAll('.tab');
    const ids = [];
    tabElements.forEach(el => {
        const id = el.dataset.id;
        if (id && tabs[id]) ids.push(id);
    });
    return ids;
}

// 切换到下一个标签
function switchToNextTab() {
    const ids = getOrderedTabIds();
    if (ids.length <= 1) return;
    const currentIndex = ids.indexOf(activeTabId);
    const nextIndex = (currentIndex + 1) % ids.length;
    switchTab(ids[nextIndex]);
}

// 切换到上一个标签
function switchToPrevTab() {
    const ids = getOrderedTabIds();
    if (ids.length <= 1) return;
    const currentIndex = ids.indexOf(activeTabId);
    const prevIndex = (currentIndex - 1 + ids.length) % ids.length;
    switchTab(ids[prevIndex]);
}

// 启动时加载自定义快捷键
loadCustomShortcuts();
