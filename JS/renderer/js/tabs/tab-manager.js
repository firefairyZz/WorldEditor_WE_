// ========== 窗口控制 ==========
function updateMaximizeIcon(isMaximized) {
    const btn = document.getElementById('btn-maximize');
    btn.innerHTML = isMaximized ? '&#xE923;' : '&#xE922;';
}
window.weAPI.onMaximizedChanged(updateMaximizeIcon);

document.getElementById('btn-minimize')?.addEventListener('click', () => weAPI.minimize());
document.getElementById('btn-maximize')?.addEventListener('click', () => weAPI.maximize());
document.getElementById('btn-close')?.addEventListener('click', () => weAPI.close());

// ========== 置顶按钮 ==========
const PIN_SVG_SRC = '../resources/pin.svg';

function setPinIcon(btn) {
    btn.innerHTML = `<img class="pin-icon" src="${PIN_SVG_SRC}" alt="">`;
}

async function updatePinButton() {
    const btn = document.getElementById('btn-always-on-top');
    if (!btn) return;
    const isOnTop = await weAPI.isAlwaysOnTop();
    btn.classList.toggle('active', isOnTop);
    setPinIcon(btn);
    btn.title = t(isOnTop ? 'ui.always_on_top_off' : 'ui.always_on_top');
}

document.getElementById('btn-always-on-top')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-always-on-top');
    const isOnTop = await weAPI.isAlwaysOnTop();
    const newState = !isOnTop;
    await weAPI.setAlwaysOnTop(newState);
    btn.classList.toggle('active', newState);
    setPinIcon(btn);
    btn.title = t(newState ? 'ui.always_on_top_off' : 'ui.always_on_top');
    showNotification(newState ? t('ui.always_on_top') : t('ui.always_on_top_off'));
    // 保存设置
    const settings = await weAPI.getSettings();
    settings.alwaysOnTop = newState;
    await weAPI.setSettings(settings);
    // 同步设置页开关
    window.dispatchEvent(new CustomEvent('pin-button:clicked', { detail: { alwaysOnTop: newState } }));
});

// 初始化置顶按钮状态
updatePinButton();

// 监听设置页更新，同步按钮状态
window.addEventListener('settings:updated', (e) => {
    if (e.detail && 'alwaysOnTop' in e.detail) {
        const btn = document.getElementById('btn-always-on-top');
        if (!btn) return;
        const isOnTop = e.detail.alwaysOnTop;
        btn.classList.toggle('active', isOnTop);
        setPinIcon(btn);
        btn.title = t(isOnTop ? 'ui.always_on_top_off' : 'ui.always_on_top');
    }
});

// 标题栏按钮点击后同步设置页
window.addEventListener('pin-button:clicked', (e) => {
    if (e.detail && 'alwaysOnTop' in e.detail) {
        const toggle = document.getElementById('always-on-top-toggle');
        if (toggle) toggle.checked = e.detail.alwaysOnTop;
    }
});

// ========== 文件菜单 ==========
function updateFileMenuTexts() {
    const menu = document.getElementById('file-menu-popup');
    const fileBtn = document.getElementById('btn-file-menu');
    if (fileBtn) fileBtn.textContent = t('ui.file');
    if (!menu) return;
    menu.innerHTML = `
        <div class="menu-item" data-action="new">${t('ui.new_project')}</div>
        <div class="menu-item" data-action="open">${t('ui.open_folder')}</div>
        <div class="menu-item" data-action="save">${t('ui.save')}</div>
        <div class="menu-separator"></div>
        <div class="menu-item" data-action="switch-mode">${t('ui.switch_editor_mode') || '切换编辑器模式'}</div>
        <div class="menu-separator"></div>
        <div class="menu-item" data-action="settings">${t('ui.settings')}</div>
    `;
    menu.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', () => {
            const action = item.dataset.action;
            if (action === 'new') createNewProjectTab();
            else if (action === 'open') openProject();
            else if (action === 'save') saveCurrentFile();
            else if (action === 'switch-mode') {
                if (typeof switchEditorMode === 'function') switchEditorMode();
            }
            else if (action === 'settings') {
                if (!tabs['settings']) createSettingsTab();
                else switchTab('settings');
            }
            menu.classList.remove('show');
        });
    });
}

// 菜单按钮事件
const fileMenuBtn = document.getElementById('btn-file-menu');
const fileMenuPopup = document.getElementById('file-menu-popup');
if (fileMenuBtn) {
    fileMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileMenuPopup?.classList.toggle('show');
    });
    document.addEventListener('click', () => fileMenuPopup?.classList.remove('show'));
}

// 标签栏设置按钮
document.getElementById('btn-tab-settings')?.addEventListener('click', () => {
    if (!tabs['settings']) createSettingsTab();
    else switchTab('settings');
});

// ========== 标签拖拽 ==========
function setupDragAndDrop() {
    const tabsContainer = document.querySelector('.tabs-container');
    if (!tabsContainer) return;
    document.addEventListener('dragover', (e) => e.preventDefault());
    tabsContainer.addEventListener('dragstart', (e) => {
        const tab = e.target.closest('.tab');
        if (!tab || tab.dataset.id === 'welcome') return;
        e.dataTransfer.setData('text/plain', tab.dataset.id);
        tab.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    });
    tabsContainer.addEventListener('dragend', (e) => {
        const tab = e.target.closest('.tab');
        if (tab) tab.classList.remove('dragging');
    });
    tabsContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        const targetTab = e.target.closest('.tab');
        if (!targetTab || targetTab.dataset.id === 'welcome') return;
        const draggingTab = document.querySelector('.tab.dragging');
        if (!draggingTab || draggingTab === targetTab) return;
        const tabsList = [...tabsContainer.querySelectorAll('.tab')];
        const fromIndex = tabsList.indexOf(draggingTab);
        const toIndex = tabsList.indexOf(targetTab);
        if (fromIndex < 0 || toIndex < 0) return;
        if (fromIndex < toIndex) {
            tabsContainer.insertBefore(draggingTab, targetTab.nextSibling);
        } else {
            tabsContainer.insertBefore(draggingTab, targetTab);
        }
    });
}

// ========== 标签页核心操作 ==========
function addTab(id, title, element, closable = true) {
    if (tabs[id]) { switchTab(id); return; }
    const tabsContainer = document.querySelector('#tab-bar .tabs-container');
    const container = document.getElementById('content-container');

    const tab = document.createElement('div');
    tab.className = 'tab';
    tab.dataset.id = id;
    tab.draggable = (id !== 'welcome');
    tab.innerHTML = title + (closable ? ' <span class="close-tab" data-id="'+id+'">×</span>' : '');
    tab.onclick = (e) => {
        if (e.target.classList.contains('close-tab')) closeTab(e.target.dataset.id);
        else switchTab(id);
    };
    tabsContainer.appendChild(tab);

    const page = document.createElement('div');
    page.className = 'tab-page';
    page.dataset.id = id;
    page.appendChild(element);
    container.appendChild(page);

    tabs[id] = { title, element: page, tabElement: tab, dirty: false, closable };
    switchTab(id);
}

function switchTab(id) {
    if (!tabs[id]) return;
    // 保存当前编辑器内容
    if (quill && currentQuillProjectId && tabs[currentQuillProjectId]?.currentFile) {
        pendingQuillSave = { projectId: currentQuillProjectId, content: quill.root.innerHTML };
    }
    Object.values(tabs).forEach(t => t.element.style.display = 'none');
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tabs[id].element.style.display = 'flex';
    tabs[id].tabElement.classList.add('active');
    activeTabId = id;

    // 切换标签时关闭 TOC 面板（跨标签共享时避免混乱）
    if (tocPanel) {
        tocPanel.remove();
        tocPanel = null;
    }

    // 切换项目时更新 tagModule 的上下文，避免标签/缩略图操作应用到错误项目
    if (window.tagModule && tabs[id]?.projectPath) {
        window.tagModule.currentProjectId = id;
        window.tagModule.currentProjectPath = tabs[id].projectPath;
        if (tabs[id].metadata) {
            window.tagModule.metadata = tabs[id].metadata;
            window.tagModule.loadAvailableImages();
        }
    }

    // 移动 Quill 实例
    if (quill) {
        const quillWrapper = tabs[id]?.element.querySelector('.quill-wrapper');
        const toolbar = quill.container.previousElementSibling;
        const editor = quill.container;

        if (quillWrapper) {
            if (editor.parentElement !== quillWrapper) {
                if (toolbar && toolbar.classList.contains('ql-toolbar')) {
                    quillWrapper.appendChild(toolbar);
                }
                quillWrapper.appendChild(editor);
            }
            if (toolbar && toolbar.classList.contains('ql-toolbar')) {
                toolbar.style.display = '';
            }
            editor.style.display = '';
            currentQuillProjectId = id;
            if (pendingQuillSave && pendingQuillSave.projectId === id) {
                quill.root.innerHTML = pendingQuillSave.content;
                pendingQuillSave = null;
            }
        } else {
            let storage = document.getElementById('quill-storage');
            if (!storage) {
                storage = document.createElement('div');
                storage.id = 'quill-storage';
                storage.style.display = 'none';
                storage.style.position = 'absolute';
                storage.style.left = '-9999px';
                storage.style.top = '-9999px';
                document.body.appendChild(storage);
            }
            if (toolbar && toolbar.classList.contains('ql-toolbar')) {
                storage.appendChild(toolbar);
            }
            storage.appendChild(editor);
            currentQuillProjectId = null;
        }
    }

    updateStatusBar();
    const statusBar = document.getElementById('status-bar');
    statusBar.style.display = (tabs[id] && tabs[id].projectPath) ? 'flex' : 'none';
    if (id === 'welcome') {
        const recentContainer = document.querySelector('#recent-list');
        if (recentContainer) loadRecentProjectsNew(recentContainer);
    }
}

function showConfirmDialog(message, title) {
    return new Promise((resolve) => {
        const dialog = document.createElement('div');
        dialog.className = 'jump-link-dialog mode-switch-dialog';
        dialog.innerHTML = `
            <div class="dialog-overlay"></div>
            <div class="dialog-box confirm-dialog-box">
                <div class="confirm-icon">⚠</div>
                <h3>${title || (t('ui.tab_close_confirm') || '关闭标签确认')}</h3>
                <p class="confirm-message">${message}</p>
                <div class="dialog-actions">
                    <button class="btn-cancel">${t('ui.cancel') || '取消'}</button>
                    <button class="btn-confirm btn-danger">${t('ui.confirm') || '确认'}</button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);
        positionDialog(dialog);
        const cleanup = (result) => { dialog.remove(); resolve(result); };
        dialog.querySelector('.btn-cancel').onclick = () => cleanup(false);
        dialog.querySelector('.dialog-overlay').onclick = () => cleanup(false);
        dialog.querySelector('.btn-confirm').onclick = () => cleanup(true);
    });
}

function closeTab(id, skipConfirm) {
    if (!tabs[id] || !tabs[id].closable) return;
    // 异步关闭：需要先检查是否有未保存内容
    (async () => {
        if (!skipConfirm) {
            const needConfirm = (tabCloseConfirm !== false && tabs[id].element?.classList?.contains('project-layout')) || tabs[id].dirty;
            if (needConfirm) {
                const ok = await showConfirmDialog(t('ui.unsaved_confirm') || '文件未保存，确定关闭？');
                if (!ok) return;
            }
        }
        doCloseTab(id);
    })();
}

function doCloseTab(id) {
    if (quill && currentQuillProjectId === id) {
        const toolbar = quill.container.previousElementSibling;
        const editor = quill.container;
        let storage = document.getElementById('quill-storage');
        if (!storage) {
            storage = document.createElement('div');
            storage.id = 'quill-storage';
            storage.style.display = 'none';
            storage.style.position = 'absolute';
            storage.style.left = '-9999px';
            storage.style.top = '-9999px';
            document.body.appendChild(storage);
        }
        if (toolbar && toolbar.classList.contains('ql-toolbar')) {
            storage.appendChild(toolbar);
        }
        storage.appendChild(editor);
        currentQuillProjectId = null;
    }
    if (tocPanel && tabs[id].element?.contains(tocPanel)) {
        tocPanel.remove();
        tocPanel = null;
    }
    tabs[id].tabElement.remove();
    tabs[id].element.remove();
    delete tabs[id];
    if (activeTabId === id) {
        const remaining = Object.keys(tabs);
        if (remaining.length > 0) switchTab(remaining[0]);
        else createWelcomeTab();
    }
}