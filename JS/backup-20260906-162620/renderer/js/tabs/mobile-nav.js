// ========== 移动端导航 ==========
// 依赖: init.js, welcome.js, project.js, filetree.js, editor/*.js, settings.js

let mobileNavActive = false;
let mobileEditingFile = null;
let _mobileSavedSidebar = null;  // 进入编辑器时保存的侧边栏 DOM，用于恢复

/**
 * 移动端：构建独立 OA（侧边栏）+ 注册 tab
 * 完整独立实现，与桌面端 openProjectDirectly 零共享
 */
async function openMobileProjectDirectly({ folder, name, fileList, projectMode, owner }) {
    weLog.info('mobile-nav', '→ openMobileProjectDirectly 开始', { folder, name });
    const safeId = sanitizeId(folder);
    if (tabs[safeId]) { weLog.debug('mobile-nav', 'openMobileProjectDirectly: 标签已存在', { safeId }); switchTab(safeId); return; }

    // 获取当前账户信息
    let currentAccountData = null;
    try {
        const accRes = await weAPI.getAccount();
        if (accRes.success) currentAccountData = accRes.account;
    } catch(e) {
        weLog.error('mobile-nav', 'openMobileProjectDirectly: 获取账户信息失败', e && e.stack ? e.stack : String(e));
    }

    // ===== 移动端 OA 单OA：area-root.oa > area-card（只有侧边栏）=====
    const layout = document.createElement('div');
    layout.className = 'project-layout area-root oa';

    const sidebar = document.createElement('div');
    sidebar.className = 'project-sidebar area-card';

    // --- 项目名 + 重命名（和桌面端一样）---
    const projectNameEl = document.createElement('h3');
    projectNameEl.className = 'project-name-editable';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'project-name-text';
    nameSpan.textContent = name;
    projectNameEl.appendChild(nameSpan);
    projectNameEl.title = t('ui.double_click_rename') || '双击重命名';
    projectNameEl.contentEditable = 'false';
    projectNameEl.spellcheck = false;

    let editState = { editing: false, original: '' };
    const beginEdit = () => {
        if (editState.editing) return;
        editState.editing = true;
        editState.original = nameSpan.textContent.trim();
        nameSpan.contentEditable = 'true';
        projectNameEl.classList.add('editing');
        projectNameEl.focus();
        const range = document.createRange();
        range.selectNodeContents(nameSpan);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    };
    const endEdit = async (cancel = false) => {
        if (editState.editing) return;
        const newName = cancel ? editState.original : nameSpan.textContent.trim();
        nameSpan.contentEditable = 'false';
        projectNameEl.classList.remove('editing');
        editState.editing = false;
        if (cancel) { nameSpan.textContent = editState.original; return; }
        if (!newName) {
            nameSpan.textContent = editState.original;
            showNotification(t('ui.name_required') || '名称不能为空');
            return;
        }
        if (newName === editState.original) return;
        const oldPath = tabs[safeId].projectPath;
        const res = await weAPI.renameProject(oldPath, newName);
        if (res.success) {
            tabs[safeId].projectPath = res.newFolder;
            nameSpan.textContent = newName;
            const tabEl = tabs[safeId]?.tabElement;
            if (tabEl) {
                const closeSpan = tabEl.querySelector('.close-tab');
                tabEl.innerHTML = newName + (closeSpan ? ' ' + closeSpan.outerHTML : '');
            }
            if (tabs[safeId]) tabs[safeId].title = newName;
            showNotification(t('ui.renamed') || '已重命名');
        } else {
            nameSpan.textContent = editState.original;
            showNotification((t('ui.rename_failed') || '重命名失败') + ': ' + (res.error || ''));
        }
    };
    projectNameEl.addEventListener('dblclick', beginEdit);
    nameSpan.addEventListener('blur', () => endEdit(false));
    nameSpan.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); nameSpan.blur(); }
        else if (e.key === 'Escape') { e.preventDefault(); endEdit(true); }
    });

    // --- 侧边栏内容（和桌面端一样）---
    sidebar.innerHTML = `
        <div class="search-bar" id="search-bar-${safeId}">
            <div class="search-bar-row">
                <button class="search-toggle-btn" id="search-toggle-${safeId}" title="${t('ui.search_placeholder') || 'Search...'}">
                    <svg viewBox="0 0 16 16" width="14" height="14"><path fill="none" stroke="currentColor" stroke-width="1.5" d="M7 2a5 5 0 100 10A5 5 0 007 2zm3.5 8.5L14 14"/></svg>
                </button>
                <button class="sort-toggle-btn" id="sort-toggle-${safeId}" title="${t('ui.sort_asc') || '升序'}">
                    <svg viewBox="0 0 16 16" width="14" height="14"><path fill="none" stroke="currentColor" stroke-width="1.5" d="M3 4l5-2 5 2M5 6v6m3-6v6m3-6v6" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
            </div>
            <div class="search-body" id="search-body-${safeId}">
                <div class="search-input-wrap">
                    <input type="text" class="search-input" id="search-input-${safeId}" placeholder="${t('ui.search_placeholder') || 'Search...'}" />
                    <button class="search-clear" id="search-clear-${safeId}" style="display:none;">✕</button>
                </div>
                <div class="search-filters" id="search-filters-${safeId}">
                    <button class="search-filter-toggle active" data-type="file">${t('ui.search_file') || 'File'}</button>
                    <button class="search-filter-toggle active" data-type="folder">${t('ui.search_folder') || 'Folder'}</button>
                    <button class="search-filter-toggle active" data-type="tag">${t('ui.search_tag') || 'Tag'}</button>
                    <button class="search-filter-toggle active" data-type="content">${t('ui.search_content') || 'Content'}</button>
                </div>
            </div>
        </div>
        <div class="file-tree-wrapper" id="file-tree-${safeId}" tabindex="0"></div>
        <div class="sidebar-footer">
            <button id="btn-add-file-${safeId}">+ ${t('ui.new_file')}</button>
        </div>
    `;
    sidebar.insertBefore(projectNameEl, sidebar.firstChild);

    // --- 账户信息（和桌面端一样）---
    const accountInfoContainer = document.createElement('div');
    accountInfoContainer.className = 'project-owner-info';
    if (owner && owner.name) {
        const ownerItem = document.createElement('div');
        ownerItem.className = 'account-info-item';
        const avatarHtml = owner.avatarDataUrl
            ? `<img src="${owner.avatarDataUrl}" alt="avatar" />`
            : `<span class="owner-avatar-mini">${(owner.name[0] || '?').toUpperCase()}</span>`;
        const displayName = (owner.displayName || owner.name).replace(/[<>]/g, '');
        ownerItem.innerHTML = `${avatarHtml}<span class="account-info-label">${t('ui.creator') || '创作者'}:</span><span class="owner-name-mini">${displayName}</span>`;
        accountInfoContainer.appendChild(ownerItem);
    }
    if (currentAccountData && currentAccountData.name) {
        const isSame = owner && owner.id && owner.id === currentAccountData.id;
        if (!isSame) {
            const currentItem = document.createElement('div');
            currentItem.className = 'account-info-item';
            const avatarHtml = currentAccountData.avatarDataUrl
                ? `<img src="${currentAccountData.avatarDataUrl}" alt="avatar" />`
                : `<span class="owner-avatar-mini">${(currentAccountData.name[0] || '?').toUpperCase()}</span>`;
            const displayName = (currentAccountData.displayName || currentAccountData.name).replace(/[<>]/g, '');
            currentItem.innerHTML = `${avatarHtml}<span class="account-info-label">${t('ui.current_user') || '当前用户'}:</span><span class="owner-name-mini">${displayName}</span>`;
            accountInfoContainer.appendChild(currentItem);
        }
    }
    if (accountInfoContainer.children.length > 0) {
        sidebar.insertBefore(accountInfoContainer, sidebar.firstChild.nextSibling);
    }

    const divider = document.createElement('hr');
    divider.className = 'sidebar-divider';
    sidebar.insertBefore(divider, sidebar.children[owner ? 2 : 1] || null);

    // --- pin/delete 按钮（和桌面端一样）---
    const pinProjectBtn = document.createElement('button');
    pinProjectBtn.className = 'btn-pin-project init-hidden';
    pinProjectBtn.title = t('ui.pin_project') || '固定项目';
    pinProjectBtn.innerHTML = `<img class="pin-icon" src="../resources/pin.svg" alt="">`;
    pinProjectBtn.onclick = async () => {
        const result = await weAPI.togglePinProject(folder);
        if (result.success) {
            pinProjectBtn.classList.toggle('active', result.pinned);
            pinProjectBtn.title = t(result.pinned ? 'ui.unpin_project' : 'ui.pin_project') || (result.pinned ? '取消固定' : '固定项目');
            showNotification(t(result.pinned ? 'ui.project_pinned' : 'ui.project_unpinned') || (result.pinned ? '已固定' : '已取消固定'));
            if (window.refreshRecentProjects) await window.refreshRecentProjects();
        }
    };
    const deleteProjectBtn = document.createElement('button');
    deleteProjectBtn.className = 'btn-delete-project';
    deleteProjectBtn.title = t('ui.delete_project') || '删除项目';
    deleteProjectBtn.innerHTML = '<svg class="delete-icon" viewBox="0 0 24 24" width="14" height="14"><path fill="none" stroke="currentColor" stroke-width="1.5" d="M5 7h14M10 7V5a1 1 0 011-1h2a1 1 0 011 1v2M6 7l1 12a1 1 0 001 1h8a1 1 0 001-1l1-12" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    deleteProjectBtn.onclick = () => deleteProject(safeId);
    projectNameEl.appendChild(pinProjectBtn);
    projectNameEl.appendChild(deleteProjectBtn);

    weAPI.isProjectPinned(folder).then(isPinned => {
        pinProjectBtn.classList.toggle('active', isPinned);
        pinProjectBtn.title = t(isPinned ? 'ui.unpin_project' : 'ui.pin_project') || (isPinned ? '取消固定' : '固定项目');
        pinProjectBtn.classList.remove('init-hidden');
    });

    const addBtn = sidebar.querySelector(`#btn-add-file-${safeId}`);
    addBtn.onclick = () => addFileToProject(safeId);

    // ===== 移动端：sidebar 是 area-root.oa 的唯一子元素 =====
    layout.appendChild(sidebar);

    // ===== 注册 tab =====
    addTab(safeId, name, layout, true);
    tabs[safeId].projectPath = folder;
    tabs[safeId].fileList = fileList;
    tabs[safeId].projectMode = projectMode || 'rich';

    if (window.tagModule) {
        await window.tagModule.loadProjectMetadata(safeId, folder);
    }

    refreshFileTree(safeId, fileList);
    setupSearch(safeId);
    setupSortToggle(safeId);

    weLog.info('mobile-nav', '← openMobileProjectDirectly 完成', { safeId });
}

function initMobileNav() {
    weLog.info('mobile-nav', '→ initMobileNav');

    // 切换 We 图标（跟随主题亮度）
    function updateWeIcon() {
        const icon = document.getElementById('mobile-nav-we-icon');
        if (!icon) return;
        const isLight = document.body.classList.contains('theme-light');
        icon.src = isLight ? '../resources/Black.png' : '../resources/White.png';
    }
    updateWeIcon();
    const weIconObserver = new MutationObserver(updateWeIcon);
    weIconObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    // 底部导航按钮点击
    document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.mobileTab;
            // 无项目时点击编辑按钮 → 打开新建项目
            if (tab === 'edit') {
                const projectTab = document.querySelector('.tab:not([data-id="welcome"]):not([data-id="settings"])');
                if (!projectTab && typeof createNewProjectTab === 'function') {
                    createNewProjectTab();
                    return;
                }
            }
            switchMobileTab(tab);
        });
    });

    // 监听项目打开/关闭，更新编辑按钮文字
    updateMobileEditButton();
    window.addEventListener('project-opened', updateMobileEditButton);
    window.addEventListener('project-closed', updateMobileEditButton);

    // 手机端编辑器返回按钮（独立固定定位元素）
    const backBtn = document.getElementById('btn-mobile-back-fixed');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            if (mobileEditingFile) {
                exitMobileEditor(false);
            }
        });
    }

    // 监听 filetree 的文件点击，进入编辑器
    document.addEventListener('file-selected', (e) => {
        if (!mobileNavActive) return;
        const filename = e.detail && e.detail.filename;
        if (filename) enterMobileEditor(filename);
    });

    // 监听标签切换，控制标签栏显示/隐藏
    window.addEventListener('tab-activated', (e) => {
        if (!mobileNavActive) return;
        const tabId = e.detail && e.detail.tabId;
        updateMobileTabBarVisibility(tabId);
        updateMobileEditButton();  // 切换标签时刷新编辑按钮状态
    });

    // 监听 tab-bar 子节点变化（项目标签增删），刷新编辑按钮状态
    const tabBar = document.getElementById('tab-bar');
    if (tabBar) {
        const tabObserver = new MutationObserver(() => {
            if (mobileNavActive) updateMobileEditButton();
        });
        tabObserver.observe(tabBar, { childList: true, subtree: true });
    }

    // 初始检测
    checkMobileLayout();
    window.addEventListener('resize', checkMobileLayout);
}

function checkMobileLayout() {
    const isMobile = !document.body.classList.contains('is-desktop');
    if (isMobile === mobileNavActive) return;
    mobileNavActive = isMobile;

    if (isMobile) {
        weLog.info('mobile-nav', '移动端布局激活');
        // 强制 OA 模式
        forceOAMode();
        // 默认显示启程页
        switchMobileTab('welcome');
    } else {
        weLog.info('mobile-nav', '桌面端布局');
        // 恢复桌面端
        document.body.classList.remove('mobile-hide-tab-bar', 'mobile-editing');
    }
}

function updateMobileEditButton() {
    const label = document.getElementById('mobile-nav-edit-label');
    const weIcon = document.getElementById('mobile-nav-we-icon');
    const plusIcon = document.getElementById('mobile-nav-plus-icon');
    if (!label || !weIcon || !plusIcon) return;
    const projectTab = document.querySelector('.tab:not([data-id="welcome"]):not([data-id="settings"])');
    if (projectTab) {
        // 有项目：显示 WE 图标和"编辑"文字，隐藏加号图标
        label.style.display = '';
        weIcon.style.display = '';
        plusIcon.style.display = 'none';
        label.textContent = '编辑';
    } else {
        // 无项目：显示加号图标，隐藏 WE 图标和文字
        label.style.display = 'none';
        weIcon.style.display = 'none';
        plusIcon.style.display = '';
    }
}

function forceOAMode() {
    // 移动端已改用独立 OA DOM（project.js 不再构建 TA），不再需要 setTaState
    // 保留函数名供桌面端兼容调用
}

function switchMobileTab(tab) {
    weLog.info('mobile-nav', '→ switchMobileTab', { tab });

    // 更新按钮状态
    document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mobileTab === tab);
    });

    // 清除编辑状态
    if (mobileEditingFile) {
        exitMobileEditor(true);
    }

    // 切换内容
    const main = document.getElementById('main');
    main.classList.remove('editor-open');

    switch (tab) {
        case 'welcome':
            if (typeof switchTab === 'function') {
                if (tabs['welcome']) {
                    switchTab('welcome');
                } else if (typeof openWelcomeTab === 'function') {
                    openWelcomeTab();
                }
            }
            document.body.classList.add('mobile-hide-tab-bar');
            break;

        case 'edit':
            document.body.classList.remove('mobile-hide-tab-bar');
            updateMobileEditButton();
            if (typeof switchTab === 'function') {
                const projectTab = document.querySelector('.tab:not([data-id="welcome"]):not([data-id="settings"])');
                if (projectTab) {
                    const id = projectTab.dataset.id;
                    if (id) {
                        switchTab(id);
                        // 移动端：已是 OA 单OA，无需额外操作
                    }
                } else if (typeof openWelcomeTab === 'function') {
                    // 无项目时显示启程页，但高亮编辑按钮
                    openWelcomeTab();
                    document.body.classList.add('mobile-hide-tab-bar');
                }
            }
            break;

        case 'settings':
            if (typeof switchTab === 'function') {
                if (tabs['settings']) {
                    switchTab('settings');
                } else if (typeof createSettingsTab === 'function') {
                    createSettingsTab();
                }
            }
            document.body.classList.add('mobile-hide-tab-bar');
            break;
    }
}

function updateMobileTabBarVisibility(tabId) {
    if (!mobileNavActive) return;
    if (tabId === 'welcome' || tabId === 'settings') {
        document.body.classList.add('mobile-hide-tab-bar');
        // 更新底部导航高亮
        document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mobileTab === tabId);
        });
    } else {
        document.body.classList.remove('mobile-hide-tab-bar');
        // 移动端项目 tab 已是 OA 单OA
    }
}

/**
 * 移动端：进入编辑器态
 * 替换 DOM（保存侧边栏 → 构建独立编辑器 OA），而非切换 CSS class
 */
function enterMobileEditor(filename) {
    weLog.info('mobile-nav', '→ enterMobileEditor', { filename });
    mobileEditingFile = filename;

    // 隐藏底部导航栏
    document.body.classList.add('mobile-editing');

    const activeTabEl = document.querySelector('.tab.active');
    if (!activeTabEl) { weLog.warn('mobile-nav', 'enterMobileEditor: 无活跃 tab'); return; }
    const safeId = activeTabEl.dataset.id;
    const tab = tabs[safeId];
    if (!tab || !tab.element) { weLog.warn('mobile-nav', 'enterMobileEditor: tab 不存在', { safeId }); return; }

    // 1. 保存当前侧边栏 DOM（从 area-root.oa > area-card 中取出）
    const areaRoot = tab.element.querySelector('.area-root');
    const sidebarCard = areaRoot && areaRoot.querySelector('.project-sidebar');
    if (!sidebarCard) { weLog.warn('mobile-nav', 'enterMobileEditor: 侧边栏不存在'); return; }
    _mobileSavedSidebar = sidebarCard;
    const parentOfAreaRoot = areaRoot.parentElement;  // tab.element
    const areaRootClass = areaRoot.className;          // 'project-layout area-root oa'

    // 2. 清空 tab.element
    tab.element.innerHTML = '';

    // 3. 创建编辑器 OA
    const editorRoot = document.createElement('div');
    editorRoot.className = 'area-root oa';
    const editorCard = document.createElement('div');
    editorCard.className = 'area-card';
    editorRoot.appendChild(editorCard);
    tab.element.appendChild(editorRoot);

    // 4. 根据文件类型填充编辑器
    const projectFolder = tab.projectPath;
    const baseName = filename.split('/').pop();

    if (filename.endsWith('.node.json')) {
        // 节点图：调 createNodeGraphTab，container=editorCard
        const graphBaseName = baseName.replace(/\.node\.json$/, '');
        if (typeof createNodeGraphTab === 'function') {
            createNodeGraphTab(graphBaseName, graphBaseName, projectFolder, {
                container: editorCard,
                tabId: 'mobile-ng-' + safeId,
            });
        } else {
            editorCard.innerHTML = '<div style="padding:20px;color:var(--text-muted,#999)">节点图引擎未加载</div>';
        }
    } else {
        // 富文本 / Markdown：创建 quill-wrapper
        const quillWrapper = document.createElement('div');
        quillWrapper.className = 'quill-wrapper';
        quillWrapper.id = 'quill-mobile-' + safeId;
        editorCard.appendChild(quillWrapper);
        // 延迟到 DOM 插入后再初始化 Quill
        requestAnimationFrame(() => {
            if (typeof openMobileEditorFile === 'function') {
                openMobileEditorFile(safeId, filename, quillWrapper);
            } else {
                weLog.warn('mobile-nav', 'openMobileEditorFile 未定义');
            }
        });
    }
}

/**
 * 移动端：退出编辑器态
 * 恢复侧边栏 DOM（从保存的 sidebarCard → 重建 area-root.oa）
 */
function exitMobileEditor(silent) {
    weLog.info('mobile-nav', '→ exitMobileEditor', { silent: !!silent });
    const prevFile = mobileEditingFile;
    mobileEditingFile = null;

    // 显示底部导航栏
    document.body.classList.remove('mobile-editing');

    const main = document.getElementById('main');
    main.classList.remove('editor-open');

    // 清理当前编辑器 DOM（销毁实例）
    const activeTabEl = document.querySelector('.tab.active');
    if (!activeTabEl) { _mobileSavedSidebar = null; return; }
    const safeId = activeTabEl.dataset.id;
    const tab = tabs[safeId];
    if (!tab || !tab.element) { _mobileSavedSidebar = null; return; }

    // 销毁编辑器实例
    if (prevFile && prevFile.endsWith('.node.json')) {
        // 销毁节点图
        const ngTabId = 'mobile-ng-' + safeId;
        if (typeof destroyEmbeddedNodeGraph === 'function') {
            // 复用 destroyEmbeddedNodeGraph 的清理逻辑（它同时清理 nodeGraphInstances 和 embeddedNodeGraphs）
            destroyEmbeddedNodeGraph(safeId);
        }
        // 额外清理 nodeGraphInstances
        if (typeof nodeGraphInstances !== 'undefined' && nodeGraphInstances[ngTabId]) {
            try { nodeGraphInstances[ngTabId].engine?.destroy?.(); } catch(e) {}
            delete nodeGraphInstances[ngTabId];
        }
    } else {
        // 销毁 Quill / Markdown
        if (typeof destroyMobileEditorFile === 'function') {
            destroyMobileEditorFile(safeId);
        }
    }

    // 恢复侧边栏
    if (_mobileSavedSidebar && tab.element) {
        tab.element.innerHTML = '';
        const layout = document.createElement('div');
        layout.className = 'project-layout area-root oa';
        layout.appendChild(_mobileSavedSidebar);
        tab.element.appendChild(layout);
        _mobileSavedSidebar = null;
        weLog.info('mobile-nav', 'exitMobileEditor: 侧边栏已恢复');
    }

    // 高亮编辑按钮
    if (!silent) {
        document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mobileTab === 'edit');
        });
    }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initMobileNav, 500);
});