// ========== 移动端导航 ==========
// 依赖: init.js, welcome.js, project.js, filetree.js, editor/*.js, settings.js

let mobileNavActive = false;
let mobileEditingFile = null;
let lastBackPressTime = 0;
const BACK_PRESS_INTERVAL = 2000; // 2秒内第二次按返回键才退出

// 页面栈追踪（用于标题栏返回逻辑）
let mobilePageStack = [];

// 当前移动端页面状态
let mobileCurrentPage = 'welcome'; // welcome | settings | project | editor | new-project | about

// ========== JS 版独有函数 ==========
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
    setupTagToggle(safeId);
}

function initMobileNav() {
    weLog.info('mobile-nav', '→ initMobileNav');

    // ====== 检测 Capacitor 原生环境（APK） ======
    const isElectron = /Electron/i.test(navigator.userAgent || '') ||
                       !!(window.require && window.require('electron'));
    const hasRealCapacitorBridge = !!(
        window.Capacitor &&
        typeof window.Capacitor === 'object' &&
        window.Capacitor.Plugins &&
        Object.keys(window.Capacitor.Plugins).length > 0
    );
    const isCapacitorNative = hasRealCapacitorBridge && !isElectron;

    if (isCapacitorNative) {
        weLog.info('mobile-nav', '检测到 Capacitor 原生环境，启用全屏移动端模式');

        document.body.classList.add('is-mobile');
        document.body.classList.remove('is-desktop');

        // 隐藏桌面专属元素
        ['#title-bar'].forEach(sel => {
            const el = document.querySelector(sel);
            if (el) el.style.display = 'none';
        });

        if (window.Capacitor?.Plugins?.StatusBar) {
            try {
                window.Capacitor.Plugins.StatusBar.setOverlaysWebView({ overlay: true });
            } catch (e) {}
        }

        startStatusClock();
    } else {
        // 桌面端恢复被隐藏的元素
        ['#title-bar'].forEach(sel => {
            const el = document.querySelector(sel);
            if (el && el.style.display === 'none') {
                el.style.display = '';
            }
        });
    }

    // ====== 移动端标题栏初始化 ======
    initMobileHeader();

    // ====== 原有逻辑 ======
    // 切换 We 图标
    function updateWeIcon() {
        const icon = document.getElementById('mobile-nav-we-icon');
        if (!icon) return;
        const isLight = document.body.classList.contains('theme-light');
        icon.src = isLight ? 'resources/Black.png' : 'resources/White.png';
    }
    updateWeIcon();
    const weIconObserver = new MutationObserver(updateWeIcon);
    weIconObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    // 底部导航按钮点击
    document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.mobileTab;
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

    updateMobileEditButton();
    window.addEventListener('project-opened', updateMobileEditButton);
    window.addEventListener('project-closed', updateMobileEditButton);

    // 移动端标题栏返回按钮
    const headerBackBtn = document.getElementById('btn-mobile-header-back');
    if (headerBackBtn) {
        headerBackBtn.addEventListener('click', handleMobileBack);
    }

    // 监听 filetree 的文件点击，进入编辑器
    document.addEventListener('file-selected', (e) => {
        if (!mobileNavActive) return;
        const filename = e.detail && e.detail.filename;
        if (filename) enterMobileEditor(filename);
    });

    // 监听标签切换
    window.addEventListener('tab-activated', (e) => {
        if (!mobileNavActive) return;
        const tabId = e.detail && e.detail.tabId;
        updateMobileTabBarVisibility(tabId);
        updateMobileEditButton();
        updateMobileHeaderForPage(tabId);
    });

    const tabBar = document.getElementById('tab-bar');
    if (tabBar) {
        const tabObserver = new MutationObserver(() => {
            if (mobileNavActive) {
                updateMobileEditButton();
                updateMobileHeaderForPage();
            }
        });
        tabObserver.observe(tabBar, { childList: true, subtree: true });
    }

    // 注册全局返回键处理
    if (weAPI && weAPI.registerBackButtonHandler) {
        weAPI.registerBackButtonHandler(handleMobileBack);
    }

    checkMobileLayout();
    window.addEventListener('resize', checkMobileLayout);
}

// ====== 移动端标题栏初始化 ======
function initMobileHeader() {
    const header = document.getElementById('mobile-header');
    const titleEl = document.getElementById('mobile-header-title');
    const backBtn = document.getElementById('btn-mobile-header-back');
    const actionsEl = document.getElementById('mobile-header-actions');

    if (!header || !titleEl) return;

    // 双击重命名（仅项目页面）
    titleEl.addEventListener('dblclick', async (e) => {
        const activeTab = document.querySelector('.tab.active');
        if (!activeTab) return;
        const tabId = activeTab.dataset.id;
        const tab = tabs[tabId];
        if (!tab || !tab.projectPath) return; // 仅项目标签可编辑
        
        // 检查是否可编辑
        if (!titleEl.classList.contains('editable')) return;

        const oldTitle = tab.title;
        
        titleEl.contentEditable = 'true';
        titleEl.classList.add('editing');
        titleEl.focus();

        // 全选文字
        const range = document.createRange();
        range.selectNodeContents(titleEl);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);

        let editCommitted = false;

        const finishEdit = async () => {
            if (editCommitted) return;
            editCommitted = true;
            
            titleEl.contentEditable = 'false';
            titleEl.classList.remove('editing');
            
            const newName = titleEl.textContent.trim();
            if (newName && newName !== oldTitle) {
                try {
                    // 使用 weAPI.renameProject 重命名项目
                    if (weAPI && weAPI.renameProject) {
                        const result = await weAPI.renameProject(tab.projectPath, newName);
                        if (result && result.success) {
                            tab.title = newName;
                            // 更新标签页显示
                            if (tab.tabElement) {
                                tab.tabElement.textContent = newName + (tab.closable ? ' ×' : '');
                            }
                            showMobileNotification('项目已重命名');
                            return;
                        }
                    }
                    // 如果 weAPI.renameProject 不可用，仅更新本地状态
                    tab.title = newName;
                    if (tab.tabElement) {
                        tab.tabElement.textContent = newName + (tab.closable ? ' ×' : '');
                    }
                    showMobileNotification('名称已更新');
                } catch (err) {
                    console.error('重命名失败:', err);
                    showMobileNotification('重命名失败');
                    titleEl.textContent = oldTitle;
                }
            } else {
                titleEl.textContent = oldTitle;
            }
        };

        // 保存引用以便在 keydown 中调用
        titleEl._finishEdit = finishEdit;

        titleEl.addEventListener('blur', finishEdit, { once: true });
        titleEl.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') {
                ev.preventDefault();
                if (titleEl._finishEdit) titleEl._finishEdit();
            } else if (ev.key === 'Escape') {
                editCommitted = true;
                titleEl.textContent = oldTitle;
                titleEl.blur();
            }
        }, { once: true });
    });
}

// ====== 根据当前页面更新移动端标题栏 ======
function updateMobileHeaderForPage(tabId) {
    const titleEl = document.getElementById('mobile-header-title');
    const backBtn = document.getElementById('btn-mobile-header-back');
    const actionsEl = document.getElementById('mobile-header-actions');
    if (!titleEl) return;

    // 清除旧的操作按钮
    if (actionsEl) actionsEl.innerHTML = '';

    let pageName = '';
    let showBack = false;
    let canRename = false;

    // 检查是否在新建项目子页面或账户子页面
    const isNewProjectSubpage = window._activeNewProjectSubpage && window._activeNewProjectSubpage.isActive && window._activeNewProjectSubpage.isActive();
    const isAccountSubpage = window._activeAccountSubpage && window._activeAccountSubpage.isActive && window._activeAccountSubpage.isActive();

    if (mobileEditingFile) {
        // 编辑器页面：显示文件名
        pageName = mobileEditingFile.replace(/\.[^.]+$/, '');
        showBack = true;
        canRename = false; // 文件名不在此重命名
        mobileCurrentPage = 'editor';
    } else if (!tabId) {
        const activeTab = document.querySelector('.tab.active');
        tabId = activeTab?.dataset?.id;
    }

    if (!mobileEditingFile) {
        if (isAccountSubpage && tabId === 'welcome') {
            // 定义世界子页面（启程页子页面）
            pageName = t('ui.define_world') || '定义世界';
            showBack = true;
            mobileCurrentPage = 'account';
        } else if (isNewProjectSubpage && tabId === 'welcome') {
            // 新建项目子页面（启程页子页面）
            pageName = t('ui.create_project') || '新建项目';
            showBack = true;
            mobileCurrentPage = 'new-project';
        } else {
        switch (tabId) {
            case 'welcome':
                pageName = '启程';
                showBack = false;
                mobileCurrentPage = 'welcome';
                break;

            case 'settings':
                // 检测是否在设置子页面（only-right 模式）
                if (tabId === 'settings' && tabs['settings'] && tabs['settings'].element) {
                    const layout = tabs['settings'].element.querySelector('.settings-layout');
                    if (layout && layout.classList.contains('only-right')) {
                        pageName = t('ui.settings') || '设置';
                        showBack = true;
                        // 尝试获取当前选中的设置区域名称
                        const activeSection = layout.querySelector('.settings-section.active');
                        if (activeSection) {
                            const h3 = activeSection.querySelector('h3');
                            if (h3) pageName = h3.textContent.trim();
                        }
                        mobileCurrentPage = 'settings-sub';
                        break;
                    }
                }
                pageName = '设置';
                showBack = false; // 设置主页不需要返回（底部导航已有入口）
                mobileCurrentPage = 'settings';
                break;

            case 'new-project':
                pageName = '新建项目';
                showBack = true;
                mobileCurrentPage = 'new-project';
                break;

            default:
                // 项目标签
                if (tabs[tabId] && tabs[tabId].projectPath) {
                    const tab = tabs[tabId];
                    // 如果是子页面（如 about、账户等嵌入到 welcome 的），显示对应名称
                    const activeSubPage = getWelcomeSubPageName();
                    if (activeSubPage) {
                        pageName = activeSubPage;
                        showBack = true;
                    } else {
                        pageName = tab.title || tabId;
                        showBack = false; // 文件树主页面不需要返回
                        canRename = true;
                    }
                    mobileCurrentPage = 'project';
                } else {
                    // 非项目标签（如 account/定义世界）：使用 tab.title
                    if (tabs[tabId] && tabs[tabId].title) {
                        pageName = tabs[tabId].title;
                    } else {
                        pageName = tabId || '未知';
                    }
                    showBack = true;
                    mobileCurrentPage = 'other';
                }
                break;
        }
        } // end else { switch(tabId) }
    }

    titleEl.textContent = pageName;

    // 设置可编辑状态
    if (canRename) {
        titleEl.classList.add('editable');
        titleEl.title = '双击修改项目名';
    } else {
        titleEl.classList.remove('editable');
        titleEl.title = '';
    }

    // 设置弹窗模式：显示返回按钮和"设置"标题
    if (mobileCurrentPage === 'settings-popup' || tabId === 'settings') {
        titleEl.textContent = t('ui.settings') || '设置';
        if (backBtn) backBtn.style.display = 'flex';
        document.body.classList.add('mobile-hide-tab-bar');
        return;
    }

    // 显示/隐藏返回按钮（仅标题栏）
    if (backBtn) {
        if (showBack) {
            backBtn.style.display = 'flex';
        } else {
            backBtn.style.display = 'none';
        }
    }

    // 编辑器页面：隐藏标签栏（文件树模式显示）
    if (mobileEditingFile) {
        document.body.classList.add('mobile-editing');
        document.body.classList.remove('mobile-hide-tab-bar');
    } else if (tabId === 'welcome' || tabId === 'settings') {
        document.body.classList.add('mobile-hide-tab-bar');
        document.body.classList.remove('mobile-editing');
    } else if (isNewProjectSubpage) {
        // 新建项目子页面在启程页内：隐藏标签栏
        document.body.classList.add('mobile-hide-tab-bar');
        document.body.classList.remove('mobile-editing');
    } else {
        document.body.classList.remove('mobile-editing', 'mobile-hide-tab-bar');
    }

    // 更新状态栏
    updateMobileStatusBar(tabId);
}

// 获取 welcome 标签的子页面名称（about 等）
function getWelcomeSubPageName() {
    const welcomeTab = document.querySelector('.tab[data-id="welcome"].active');
    if (!welcomeTab) return null;
    const aboutContent = welcomeTab.querySelector('.about-mobile-pages');
    if (aboutContent && aboutContent.style.display === 'flex') {
        const logContent = document.getElementById('about-mobile-log-content');
        if (logContent && logContent.style.display === 'flex') {
            return '更新日志';
        }
        return '关于';
    }
    return null;
}

// ====== 移动端状态栏更新 ======
function updateMobileStatusBar(tabId) {
    const statusBar = document.getElementById('status-bar');
    if (!statusBar) return;

    if (!mobileNavActive || document.body.classList.contains('is-desktop')) return;

    if (mobileEditingFile) {
        // 编辑模式：显示状态栏（显示文件统计信息）
        statusBar.style.display = 'flex';
    } else {
        // 普通模式：隐藏状态栏
        statusBar.style.display = 'none';
    }
}

// ====== 移动端通知栏改为弹窗样式 ======
function showMobileNotification(message, iconOrDuration) {
    const bar = document.getElementById('notification-bar');
    if (!bar) return;

    // 兼容：第二参数可以是 icon(html 字符串) 或 duration(ms)
    let icon = null;
    let duration = 3500;
    if (typeof iconOrDuration === 'number') {
        duration = iconOrDuration;
    } else if (typeof iconOrDuration === 'string') {
        icon = iconOrDuration;
    } else if (typeof iconOrDuration === 'undefined') {
        duration = 3500;
    }

    // 构建弹窗内容
    const iconSvg = icon || '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><polyline points="12 6 12 12 16 14"/></svg>';

    bar.innerHTML = `
        <div class="notif-icon">${iconSvg}</div>
        <div class="notif-content">${escapeHtml(message)}</div>
        <button class="notif-close" title="关闭">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
    `;

    bar.classList.add('show');

    // 绑定关闭按钮
    const closeBtn = bar.querySelector('.notif-close');
    if (closeBtn) {
        closeBtn.onclick = () => hideMobileNotification();
    }

    // 自动消失
    clearTimeout(bar._autoHideTimer);
    if (duration > 0) {
        bar._autoHideTimer = setTimeout(() => hideMobileNotification(), duration);
    }
}

function hideMobileNotification() {
    const bar = document.getElementById('notification-bar');
    if (bar) bar.classList.remove('show');
}

// 覆盖全局 showNotification — 让移动端统一使用弹窗样式（mobile-nav 接管）
function installMobileNotificationOverride() {
    // 暴露到 window，供 init.js 中的 showMobileToast 调用；
    // 使用 getter 保证即便 showMobileNotification 被后续重定义，也能获取最新版本
    Object.defineProperty(window, 'showPopupNotification', {
        configurable: true,
        enumerable: true,
        get: () => showMobileNotification,
    });
    window.__mobileUsePopupNotification = true;

    // 同时覆盖 window.showNotification（供直接调用的代码路径）
    const originalShowNotification = window.showNotification;
    window.showNotification = function (msg, type) {
        if (mobileNavActive && !document.body.classList.contains('is-desktop')) {
            showMobileNotification(msg, typeof type === 'number' ? type : undefined);
        } else {
            if (typeof originalShowNotification === 'function') {
                return originalShowNotification.call(this, msg, type);
            }
            // 桌面端兜底
            const bar = document.getElementById('notification-bar');
            if (bar) {
                bar.textContent = msg;
                bar.classList.add('show');
            }
        }
    };
}

// 延迟安装，确保所有脚本都加载完毕（init.js 先执行）
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(installMobileNotificationOverride, 600));
} else {
    setTimeout(installMobileNotificationOverride, 600);
}

// ====== 移动端返回逻辑 ======
function handleMobileBack() {
    weLog.info('mobile-nav', '→ handleMobileBack');

    // 0. 设置弹窗打开中 → 关闭弹窗
    if (settingsPopupEl) {
        hideSettingsPopup();
        const welcomeBtn = document.querySelector('.mobile-nav-btn[data-mobile-tab="welcome"]');
        if (welcomeBtn) welcomeBtn.classList.add('active');
        const settingsBtn = document.querySelector('.mobile-nav-btn[data-mobile-tab="settings"]');
        if (settingsBtn) settingsBtn.classList.remove('active');
        updateMobileHeaderForPage();
        return true;
    }

    // 1. 编辑器中 → 返回文件树
    if (mobileEditingFile) {
        weLog.info('mobile-nav', '  exitMobileEditor');
        exitMobileEditor(false);
        return true;
    }

    // 2. 获取当前活跃标签
    const activeTab = document.querySelector('.tab.active');
    if (!activeTab) {
        if (typeof openWelcomeTab === 'function') {
            openWelcomeTab();
            switchMobileTab('welcome');
            return true;
        }
        return false;
    }

    const tabId = activeTab.dataset.id;

    // 3. 设置页子页面 → 返回设置列表
    if (tabId === 'settings') {
        const layout = activeTab.querySelector('.settings-layout');
        if (layout && layout.classList.contains('only-right')) {
            layout.classList.remove('only-right');
            layout.classList.add('only-left');
            updateMobileHeaderForPage(tabId);
            return true;
        }
        // 设置主页 → 返回启程页
        switchMobileTab('welcome');
        return true;
    }

    // 4. 启程页 → 处理子页面或退出
    if (tabId === 'welcome') {
        // 4.0 定义世界子页面 → 关闭（向导模式不可关闭）
        if (window._activeAccountSubpage && window._activeAccountSubpage.isActive && window._activeAccountSubpage.isActive()) {
            if (window._activeAccountSubpage.isWizard && window._activeAccountSubpage.isWizard()) {
                // 向导模式不允许关闭
                return true;
            }
            window._activeAccountSubpage.close();
            return true;
        }

        // 4.1 新建项目子页面 → 关闭
        if (window._activeNewProjectSubpage && window._activeNewProjectSubpage.isActive && window._activeNewProjectSubpage.isActive()) {
            window._activeNewProjectSubpage.close();
            return true;
        }

        const aboutContent = activeTab.querySelector('.about-mobile-pages');
        if (aboutContent && aboutContent.style.display === 'flex') {
            // 在 about 子页面
            const logContent = document.getElementById('about-mobile-log-content');
            if (logContent && logContent.style.display === 'flex') {
                logContent.style.display = 'none';
                const logDir = document.getElementById('about-mobile-log-dir');
                if (logDir) logDir.style.display = 'block';
                updateMobileHeaderForPage(tabId);
                return true;
            }
            // 返回 about 目录
            aboutContent.style.display = 'none';
            const aboutDir = activeTab.querySelector('.about-mobile-dir');
            if (aboutDir) aboutDir.style.display = 'flex';
            updateMobileHeaderForPage(tabId);
            return true;
        }

        // 启程页主页面 → 再按一次退出
        const now = Date.now();
        if (now - lastBackPressTime < BACK_PRESS_INTERVAL) {
            // 第二次按 → 退出应用
            weLog.info('mobile-nav', '  at welcome → exit app');
            return false;
        } else {
            // 第一次按 → 显示提示
            lastBackPressTime = now;
            showMobileExitToast();
            return true;
        }
    }

    // 5. 新建项目页 → 返回启程页
    if (tabId === 'new-project') {
        // 关闭新建项目标签
        if (typeof closeTab === 'function') {
            closeTab(tabId, true);
        }
        switchMobileTab('welcome');
        return true;
    }

    // 5.5 定义世界（account）→ 关闭标签并返回启程页
    if (tabId === 'account') {
        if (typeof closeTab === 'function') {
            closeTab(tabId, true);
        }
        switchMobileTab('welcome');
        return true;
    }

    // 6. 项目标签（文件树模式）→ 关闭标签或返回启程页
    if (tabs[tabId] && tabs[tabId].closable !== false) {
        weLog.info('mobile-nav', '  close tab', { tabId });
        if (typeof closeTab === 'function') {
            closeTab(tabId, true);
        }
        setTimeout(() => {
            const remainingProjectTabs = document.querySelectorAll('.tab:not([data-id="welcome"]):not([data-id="settings"])');
            if (remainingProjectTabs.length === 0) {
                switchMobileTab('welcome');
            } else {
                // 更新标题栏
                const activeTabAfter = document.querySelector('.tab.active');
                if (activeTabAfter) {
                    updateMobileHeaderForPage(activeTabAfter.dataset.id);
                }
            }
        }, 50);
        return true;
    }

    // 7. 其他不可关闭标签 → 返回启程页
    switchMobileTab('welcome');
    return true;
}

// 显示"再按一次退出"提示
function showMobileExitToast() {
    const toast = document.createElement('div');
    toast.id = 'mobile-exit-toast';
    toast.textContent = '再按一次退出编辑器';
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, BACK_PRESS_INTERVAL);
}

// ====== 移动端布局检测 ======
function checkMobileLayout() {
    const isMobile = !document.body.classList.contains('is-desktop');
    if (isMobile === mobileNavActive) {
        if (!isMobile) {
            restoreDesktopChrome();
        }
        return;
    }
    mobileNavActive = isMobile;

    if (isMobile) {
        weLog.info('mobile-nav', '移动端布局激活');
        forceOAMode();
        // 显示移动端标题栏
        const header = document.getElementById('mobile-header');
        if (header) header.style.display = 'flex';
        switchMobileTab('welcome');
    } else {
        weLog.info('mobile-nav', '桌面端布局');
        document.body.classList.remove('mobile-hide-tab-bar', 'mobile-editing');
        // 隐藏移动端标题栏
        const header = document.getElementById('mobile-header');
        if (header) header.style.display = 'none';
        restoreDesktopChrome();
    }
}

// 恢复桌面端专属 UI 元素
function restoreDesktopChrome() {
    ['#title-bar'].forEach(sel => {
        const el = document.querySelector(sel);
        if (el && el.style.display === 'none') {
            el.style.display = '';
        }
    });
}

// ====== 移动端编辑按钮 ======
function updateMobileEditButton() {
    const label = document.getElementById('mobile-nav-edit-label');
    const weIcon = document.getElementById('mobile-nav-we-icon');
    const plusIcon = document.getElementById('mobile-nav-plus-icon');
    if (!label || !weIcon || !plusIcon) return;
    const projectTab = document.querySelector('.tab:not([data-id="welcome"]):not([data-id="settings"])');
    if (projectTab) {
        label.style.display = '';
        weIcon.style.display = '';
        plusIcon.style.display = 'none';
        label.textContent = '编辑';
    } else {
        label.style.display = 'none';
        weIcon.style.display = 'none';
        plusIcon.style.display = '';
    }
}

function forceOAMode() {
    Object.keys(tabs).forEach(id => {
        if (id !== 'welcome' && typeof setTaState === 'function') {
            setTaState(id, 'only-left');
        }
    });
}

// ====== 移动端标签页切换 ======
let settingsPopupEl = null;

function showSettingsPopup(initialSection) {
    weLog.info('mobile-nav', '→ showSettingsPopup', { initialSection });

    // 关闭已存在的弹窗
    if (settingsPopupEl) {
        settingsPopupEl.remove();
        settingsPopupEl = null;
    }

    // 全屏显示设置，使用移动端导航栏
    const overlay = document.createElement('div');
    overlay.className = 'mobile-settings-overlay';
    overlay.innerHTML = `
        <div class="mobile-settings-popup">
            <div class="msp-body">
                <div class="msp-scroll" id="mobile-settings-content">
                    <!-- 设置内容将动态填充 -->
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    settingsPopupEl = overlay;

    // 填充设置内容
    const contentArea = overlay.querySelector('#mobile-settings-content');
    if (contentArea && typeof createSettingsContentForPopup === 'function') {
        createSettingsContentForPopup(contentArea, initialSection);
    } else if (typeof createSettingsTab === 'function') {
        // fallback: 从已存在的设置标签复制内容
        const existingTab = tabs['settings'];
        if (existingTab && existingTab.element) {
            const panel = existingTab.element.querySelector('.settings-panel');
            if (panel) {
                const contentClone = panel.querySelector('.settings-content');
                if (contentClone) {
                    contentArea.appendChild(contentClone.cloneNode(true));
                }
            }
        }
    }

    // 更新移动端状态
    mobileCurrentPage = 'settings-popup';
    if (typeof updateMobileHeaderForPage === 'function') {
        updateMobileHeaderForPage('settings');
    }
}

function hideSettingsPopup() {
    if (settingsPopupEl) {
        settingsPopupEl.remove();
        settingsPopupEl = null;
    }
}

function switchMobileTab(tab) {
    weLog.info('mobile-nav', '→ switchMobileTab', { tab });

    // 关闭设置弹窗（如果打开中）
    if (tab !== 'settings' && settingsPopupEl) {
        hideSettingsPopup();
    }

    document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mobileTab === tab);
    });

    if (mobileEditingFile) {
        exitMobileEditor(true);
    }

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
            break;

        case 'edit':
            if (typeof switchTab === 'function') {
                const projectTab = document.querySelector('.tab:not([data-id="welcome"]):not([data-id="settings"])');
                if (projectTab) {
                    const id = projectTab.dataset.id;
                    if (id) {
                        switchTab(id);
                        if (typeof setTaState === 'function') setTaState(id, 'only-left');
                    }
                } else if (typeof openWelcomeTab === 'function') {
                    openWelcomeTab();
                }
            }
            break;

        case 'settings':
            // 移动端：显示为弹窗而非跳转页面
            if (!document.body.classList.contains('is-desktop')) {
                showSettingsPopup();
                return; // 不继续执行默认逻辑
            }
            // 桌面端：保持原有行为
            if (typeof switchTab === 'function') {
                if (tabs['settings']) {
                    switchTab('settings');
                } else if (typeof createSettingsTab === 'function') {
                    createSettingsTab();
                }
            }
            break;
    }

    updateMobileHeaderForPage();
}

function updateMobileTabBarVisibility(tabId) {
    if (!mobileNavActive) return;
    updateMobileHeaderForPage(tabId);
}

// ====== 移动端编辑器进入/退出 ======
function enterMobileEditor(filename) {
    weLog.info('mobile-nav', '→ enterMobileEditor', { filename });
    mobileEditingFile = filename;

    document.body.classList.add('mobile-editing');
    document.body.classList.remove('mobile-hide-tab-bar');

    const activeTab = document.querySelector('.tab.active');
    if (activeTab) {
        const id = activeTab.dataset.id;
        if (id && typeof setTaState === 'function') {
            const tab = tabs[id];
            if (tab && tab.element) {
                const layout = tab.element.querySelector('.area-root.ta');
                if (layout) {
                    layout.classList.remove('only-left');
                    layout.classList.add('only-right');
                }
            }
        }
    }

    updateMobileHeaderForPage();
}

function exitMobileEditor(silent) {
    weLog.info('mobile-nav', '→ exitMobileEditor', { silent: !!silent });
    
    // 先保存当前标签信息，再清除编辑状态
    const activeTab = document.querySelector('.tab.active');
    const currentTabId = activeTab ? activeTab.dataset.id : null;
    
    mobileEditingFile = null;

    document.body.classList.remove('mobile-editing');

    const main = document.getElementById('main');
    if (main) main.classList.remove('editor-open');

    if (!silent) {
        if (activeTab) {
            const id = activeTab.dataset.id;
            if (id) {
                const tab = tabs[id];
                if (tab && tab.element) {
                    const layout = tab.element.querySelector('.area-root.ta');
                    if (layout) {
                        layout.classList.remove('only-right');
                        layout.classList.add('only-left');
                    }
                }
            }
        }
        document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mobileTab === 'edit');
        });
    }

    // 使用保存的 tabId 更新标题栏，确保显示项目名而非文件名
    updateMobileHeaderForPage(currentTabId);
}

// ====== 状态栏时钟 ======
function startStatusClock() {
    const updateTime = () => {
        const timeEl = document.getElementById('mobile-status-time');
        if (timeEl) {
            const now = new Date();
            timeEl.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        }
    };
    updateTime();
    if (window._statusClockTimer) clearInterval(window._statusClockTimer);
    window._statusClockTimer = setInterval(updateTime, 30000);
}

// 暴露给其他模块
window.initMobileHeader = initMobileHeader;
window.updateMobileHeaderForPage = updateMobileHeaderForPage;
window.showMobileNotification = showMobileNotification;
window.mobileNavActive = mobileNavActive;
window.mobileEditingFile = mobileEditingFile;
window.showSettingsPopup = showSettingsPopup;
window.hideSettingsPopup = hideSettingsPopup;
window.switchMobileTab = switchMobileTab;
window.updateMobileStatusBar = updateMobileStatusBar;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initMobileNav, 500);
});
