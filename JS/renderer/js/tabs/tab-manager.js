// ========== 窗口控制 ==========
function updateMaximizeIcon(isMaximized) {
    weLog.debug('tab-manager', `updateMaximizeIcon: isMaximized=${isMaximized}`);
    const btn = document.getElementById('btn-maximize');
    if (!btn) { weLog.warn('tab-manager', 'updateMaximizeIcon: btn-maximize 不存在'); return; }
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
    weLog.debug('tab-manager', '→ updatePinButton');
    const btn = document.getElementById('btn-always-on-top');
    if (!btn) { weLog.warn('tab-manager', 'updatePinButton: btn-always-on-top 不存在'); return; }
    const isOnTop = await weAPI.isAlwaysOnTop();
    btn.classList.toggle('active', isOnTop);
    setPinIcon(btn);
    btn.title = t(isOnTop ? 'ui.always_on_top_off' : 'ui.always_on_top');
    weLog.debug('tab-manager', `← updatePinButton: isOnTop=${isOnTop}`);
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
    weLog.info('tab-manager', '→ updateFileMenuTexts');
    const menu = document.getElementById('file-menu-popup');
    const fileBtn = document.getElementById('btn-file-menu');
    if (fileBtn) fileBtn.textContent = t('ui.file');
    if (!menu) { weLog.warn('tab-manager', 'updateFileMenuTexts: file-menu-popup 不存在'); return; }
    menu.innerHTML = `
        <div class="menu-item" data-action="new">
            <span class="menu-label">${t('ui.new_project')}</span>
            <span class="menu-shortcut">Ctrl + N</span>
        </div>
        <div class="menu-item" data-action="open">
            <span class="menu-label">${t('ui.open_folder')}</span>
            <span class="menu-shortcut">Ctrl + O</span>
        </div>
        <div class="menu-item" data-action="save">
            <span class="menu-label">${t('ui.save')}</span>
            <span class="menu-shortcut">Ctrl + S</span>
        </div>
        <div class="menu-separator"></div>
        <div class="menu-item" data-action="switch-mode">${t('ui.switch_editor_mode') || '切换编辑器模式'}</div>
        <div class="menu-separator"></div>
        <div class="menu-item" data-action="new-file">
            <span class="menu-label">${t('ui.new_file') || '新建文件'}</span>
            <span class="menu-shortcut">Ctrl + Shift + N</span>
        </div>
        <div class="menu-separator"></div>
        <div class="menu-item" data-action="settings">${t('ui.settings')}</div>
    `;
    menu.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', () => {
            const action = item.dataset.action;
            weLog.info('tab-manager', `文件菜单点击: action=${action}`);
            if (action === 'new') createNewProjectTab();
            else if (action === 'open') openProject();
            else if (action === 'save') saveCurrentFile();
            else if (action === 'switch-mode') {
                if (typeof switchEditorMode === 'function') switchEditorMode();
            }
            else if (action === 'new-file') {
                weLog.info('tab-manager', '文件菜单点击: new-file, activeTabId=', activeTabId);
                if (activeTabId && tabs[activeTabId]?.projectPath) {
                    if (typeof addFileToProject === 'function') addFileToProject(activeTabId);
                } else {
                    showNotification(t('ui.open_project_first') || '请先打开一个项目');
                }
            }
            else if (action === 'settings') {
                if (!tabs['settings']) createSettingsTab();
                else switchTab('settings');
            }
            menu.classList.remove('show');
        });
    });
}

// 新建节点图
function createNewNodeGraph() {
    weLog.info('tab-manager', '→ createNewNodeGraph');
    const projectFolder = window.tagModule?.currentProjectPath;
    if (!projectFolder) {
        weLog.warn('tab-manager', 'createNewNodeGraph: 无当前项目');
        showNotification(t('ui.open_project_first') || '请先打开一个项目');
        return;
    }
    const name = prompt(t('ui.nodegraph_name') || '节点图名称', '节点图');
    if (!name) { weLog.info('tab-manager', 'createNewNodeGraph: 用户取消'); return; }
    const graphId = name.trim();
    createNodeGraphTab(graphId, graphId, projectFolder);
}

// 菜单按钮事件
const fileMenuBtn = document.getElementById('btn-file-menu');
const fileMenuPopup = document.getElementById('file-menu-popup');
if (fileMenuBtn) {
    fileMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileMenuPopup?.classList.toggle('show');
        editMenuPopup?.classList.remove('show');
    });
    fileMenuPopup?.addEventListener('click', (e) => e.stopPropagation());
}

// ========== 编辑菜单 ==========
let editMenuPopup;
function updateEditMenuTexts() {
    const btn = document.getElementById('btn-edit-menu');
    if (btn) btn.textContent = t('ui.edit');
    const menu = document.getElementById('edit-menu-popup');
    if (!menu) return;
    menu.innerHTML = `
        <div class="menu-item" data-action="undo">
            <span class="menu-label">${t('ui.undo') || '撤销'}</span>
            <span class="menu-shortcut">Ctrl + Z</span>
        </div>
        <div class="menu-item" data-action="redo">
            <span class="menu-label">${t('ui.redo') || '恢复'}</span>
            <span class="menu-shortcut">Ctrl + Y</span>
        </div>
        <div class="menu-separator"></div>
        <div class="menu-item" data-action="cut">
            <span class="menu-label">${t('ui.cut') || '剪切'}</span>
            <span class="menu-shortcut">Ctrl + X</span>
        </div>
        <div class="menu-item" data-action="copy">
            <span class="menu-label">${t('ui.copy') || '复制'}</span>
            <span class="menu-shortcut">Ctrl + C</span>
        </div>
        <div class="menu-item" data-action="paste">
            <span class="menu-label">${t('ui.paste') || '粘贴'}</span>
            <span class="menu-shortcut">Ctrl + V</span>
        </div>
        <div class="menu-separator"></div>
        <div class="menu-item" data-action="find">
            <span class="menu-label">${t('ui.find') || '查找'}</span>
            <span class="menu-shortcut">Ctrl + F</span>
        </div>
        <div class="menu-item" data-action="replace">
            <span class="menu-label">${t('ui.find_replace') || '替换'}</span>
            <span class="menu-shortcut">Ctrl + H</span>
        </div>
    `;
    menu.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', () => {
            const action = item.dataset.action;
            handleEditAction(action);
            menu.classList.remove('show');
        });
    });
}

function handleEditAction(action) {
    weLog.info('tab-manager', `→ handleEditAction: action=${action}`);
    // 获取当前活动的编辑器（Quill 或 Markdown）
    const isMarkdown = markdownEditor && markdownEditor.offsetParent !== null;
    weLog.debug('tab-manager', `handleEditAction: isMarkdown=${isMarkdown}`);

    if (action === 'undo' || action === 'redo') {
        if (isMarkdown) {
            // Markdown 模式：用 document.execCommand 作兜底
            document.execCommand(action === 'undo' ? 'undo' : 'redo');
        } else if (typeof quill !== 'undefined' && quill) {
            if (action === 'undo') quill.undo();
            else quill.redo();
        }
    } else if (action === 'cut') {
        if (isMarkdown) {
            document.execCommand('cut');
        } else if (typeof quill !== 'undefined' && quill) {
            const sel = quill.getSelection();
            if (sel && sel.length > 0) {
                const text = quill.getText(sel.index, sel.length);
                navigator.clipboard?.writeText(text);
                quill.deleteText(sel.index, sel.length);
            }
        }
    } else if (action === 'copy') {
        if (isMarkdown) {
            document.execCommand('copy');
        } else if (typeof quill !== 'undefined' && quill) {
            const sel = quill.getSelection();
            if (sel && sel.length > 0) {
                const text = quill.getText(sel.index, sel.length);
                navigator.clipboard?.writeText(text);
            }
        }
    } else if (action === 'paste') {
        if (isMarkdown) {
            markdownEditor.focus();
            document.execCommand('paste');
        } else if (typeof quill !== 'undefined' && quill) {
            if (navigator.clipboard?.readText) {
                navigator.clipboard.readText().then(text => {
                    const sel = quill.getSelection(true);
                    if (sel) quill.insertText(sel.index, text);
                });
            }
        }
    } else if (action === 'find') {
        if (findBar) findBar.show(false);
    } else if (action === 'replace') {
        if (findBar) findBar.show(true);
    }
}

// 初始化编辑菜单
const editMenuBtn = document.getElementById('btn-edit-menu');
editMenuPopup = document.getElementById('edit-menu-popup');
if (editMenuBtn) {
    updateEditMenuTexts();
    editMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const rect = editMenuBtn.getBoundingClientRect();
        editMenuPopup.style.top = rect.bottom + 'px';
        editMenuPopup.style.left = rect.left + 'px';
        editMenuPopup.style.right = 'auto';
        editMenuPopup?.classList.toggle('show');
        fileMenuPopup?.classList.remove('show');
    });
    editMenuPopup?.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', () => {
        editMenuPopup?.classList.remove('show');
        fileMenuPopup?.classList.remove('show');
    });
}

// 标签栏设置按钮
document.getElementById('btn-tab-settings')?.addEventListener('click', () => {
    if (!tabs['settings']) createSettingsTab();
    else switchTab('settings');
});

// ========== 标签拖拽 ==========
function setupDragAndDrop() {
    weLog.info('tab-manager', '→ setupDragAndDrop');
    const tabsContainer = document.querySelector('.tabs-container');
    if (!tabsContainer) { weLog.warn('tab-manager', 'setupDragAndDrop: tabs-container 不存在'); return; }
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
    weLog.info('tab-manager', `→ addTab: id=${id} title="${title}" closable=${closable}`);
    if (tabs[id]) {
        weLog.info('tab-manager', `addTab: id=${id} 已存在，直接切换`);
        switchTab(id); return;
    }
    const tabsContainer = document.querySelector('#tab-bar .tabs-container');
    const container = document.getElementById('content-container');
    if (!tabsContainer) { weLog.error('tab-manager', 'addTab: tabs-container 不存在'); return; }
    if (!container) { weLog.error('tab-manager', 'addTab: content-container 不存在'); return; }

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
    weLog.info('tab-manager', `← addTab 完成: id=${id}`);
    switchTab(id);
}

function switchTab(id) {
    weLog.info('tab-manager', `→ switchTab: id=${id}`);
    if (!tabs[id]) { weLog.warn('tab-manager', `switchTab: id=${id} 不存在`); return; }
    // 保存当前编辑器内容
    if (quill && currentQuillProjectId && tabs[currentQuillProjectId]?.currentFile) {
        weLog.debug('tab-manager', `switchTab: 保存当前 Quill 内容, from=${currentQuillProjectId}`);
        pendingQuillSave = { projectId: currentQuillProjectId, content: quill.root.innerHTML };
    }
    Object.values(tabs).forEach(t => t.element.style.display = 'none');
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tabs[id].element.style.display = 'flex';
    tabs[id].tabElement.classList.add('active');
    activeTabId = id;
    weLog.debug('tab-manager', `switchTab: activeTabId=${id}`);

    // 切换标签时关闭 TOC 面板（跨标签共享时避免混乱）
    if (tocPanel) {
        weLog.debug('tab-manager', 'switchTab: 移除 TOC 面板');
        tocPanel.remove();
        tocPanel = null;
    }

    // 切换项目时更新 tagModule 的上下文，避免标签/缩略图操作应用到错误项目
    if (window.tagModule && tabs[id]?.projectPath) {
        weLog.debug('tab-manager', `switchTab: 更新 tagModule 上下文, projectPath=${tabs[id].projectPath}`);
        window.tagModule.currentProjectId = id;
        window.tagModule.currentProjectPath = tabs[id].projectPath;
        if (tabs[id].metadata) {
            window.tagModule.metadata = tabs[id].metadata;
            window.tagModule.loadAvailableImages();
        }
    }

    // 移动 Quill 实例
    if (quill) {
        weLog.debug('tab-manager', 'switchTab: 移动 Quill 实例');
        const quillWrapper = tabs[id]?.element.querySelector('.quill-wrapper');
        const toolbar = quill.container.previousElementSibling;
        const editor = quill.container;

        if (quillWrapper) {
            weLog.debug('tab-manager', `switchTab: 找到 quillWrapper, 移动编辑器到 id=${id}`);
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
                weLog.debug('tab-manager', 'switchTab: 恢复 pendingQuillSave 内容');
                quill.root.innerHTML = pendingQuillSave.content;
                pendingQuillSave = null;
            }
        } else {
            weLog.debug('tab-manager', `switchTab: 未找到 quillWrapper, 移动 Quill 到 storage (id=${id} 无编辑器)`);
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
        weLog.debug('tab-manager', 'switchTab: welcome 标签，加载最近项目列表');
        const recentContainer = document.querySelector('#recent-list');
        if (recentContainer) loadRecentProjectsNew(recentContainer);
    } else {
        if (typeof updateStatusBarStats === 'function') updateStatusBarStats();
    }
    weLog.info('tab-manager', `← switchTab 完成: id=${id}`);
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
    weLog.info('tab-manager', `→ closeTab: id=${id} skipConfirm=${skipConfirm}`);
    if (!tabs[id] || !tabs[id].closable) { weLog.warn('tab-manager', `closeTab: id=${id} 不存在或不可关闭`); return; }
    // 异步关闭：需要先检查是否有未保存内容
    (async () => {
        if (!skipConfirm) {
            const needConfirm = (tabCloseConfirm !== false && tabs[id].element?.classList?.contains('project-layout')) || tabs[id].dirty;
            if (needConfirm) {
                weLog.info('tab-manager', `closeTab: id=${id} 需要确认 (dirty=${tabs[id].dirty})`);
                const ok = await showConfirmDialog(t('ui.unsaved_confirm') || '文件未保存，确定关闭？');
                if (!ok) { weLog.info('tab-manager', `closeTab: id=${id} 用户取消关闭`); return; }
            }
        }
        doCloseTab(id);
    })();
}

function doCloseTab(id) {
    weLog.info('tab-manager', `→ doCloseTab: id=${id}`);
    if (quill && currentQuillProjectId === id) {
        weLog.debug('tab-manager', `doCloseTab: 移动 Quill 到 storage (当前项目=${id})`);
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
        weLog.debug('tab-manager', `doCloseTab: 移除 TOC 面板 (id=${id})`);
        tocPanel.remove();
        tocPanel = null;
    }
    tabs[id].tabElement.remove();
    tabs[id].element.remove();
    // 清理独立节点图实例
    if (typeof nodeGraphInstances !== 'undefined' && nodeGraphInstances[id]) {
        weLog.debug('tab-manager', `doCloseTab: 清理独立节点图实例 (id=${id})`);
        try { nodeGraphInstances[id].lf.clearData(); } catch (e) {}
        delete nodeGraphInstances[id];
    }
    // 清理嵌入项目编辑区的节点图实例
    if (typeof embeddedNodeGraphs !== 'undefined' && embeddedNodeGraphs[id]) {
        weLog.debug('tab-manager', `doCloseTab: 清理嵌入节点图实例 (id=${id})`);
        if (typeof destroyEmbeddedNodeGraph === 'function') destroyEmbeddedNodeGraph(id);
    }
    delete tabs[id];
    weLog.info('tab-manager', `← doCloseTab 完成: id=${id} 已删除`);
    if (activeTabId === id) {
        const remaining = Object.keys(tabs);
        weLog.debug('tab-manager', `doCloseTab: activeTabId=${id} 已关闭, 剩余 ${remaining.length} 个标签`);
        if (remaining.length > 0) switchTab(remaining[0]);
        else createWelcomeTab();
    }
}