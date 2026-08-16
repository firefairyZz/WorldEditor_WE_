// ========== 移动端导航 ==========
// 依赖: init.js, welcome.js, project.js, filetree.js, editor/*.js, settings.js

let mobileNavActive = false;
let mobileEditingFile = null;

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
    // 强制所有标签切换到 OA（only-left）模式，包括设置页
    Object.keys(tabs).forEach(id => {
        if (id !== 'welcome' && typeof setTaState === 'function') {
            setTaState(id, 'only-left');
        }
    });
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
                        // 强制 OA 模式
                        if (typeof setTaState === 'function') setTaState(id, 'only-left');
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
            // 手机端切到设置页时重置为导航列表（only-left）
            if (!document.body.classList.contains('is-desktop')) {
                const settingsTab = tabs['settings'];
                if (settingsTab && settingsTab.element) {
                    const layout = settingsTab.element.querySelector('.settings-layout');
                    if (layout) {
                        layout.classList.remove('only-right');
                        layout.classList.add('only-left');
                    }
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
        // 强制 OA 模式
        if (typeof setTaState === 'function') setTaState(tabId, 'only-left');
    }
}

function enterMobileEditor(filename) {
    weLog.info('mobile-nav', '→ enterMobileEditor', { filename });
    mobileEditingFile = filename;

    // 隐藏底部导航栏
    document.body.classList.add('mobile-editing');

    // 切换布局为 only-right（只显示编辑器，隐藏文件树）
    const activeTab = document.querySelector('.tab.active');
    if (activeTab) {
        const id = activeTab.dataset.id;
        if (id && typeof setTaState === 'function') {
            // 先移除 only-left，再添加 only-right
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
}

function exitMobileEditor(silent) {
    weLog.info('mobile-nav', '→ exitMobileEditor', { silent: !!silent });
    mobileEditingFile = null;

    // 显示底部导航栏
    document.body.classList.remove('mobile-editing');

    // 内容区恢复
    const main = document.getElementById('main');
    main.classList.remove('editor-open');

    // 切回文件树（only-left 模式）
    if (!silent) {
        const activeTab = document.querySelector('.tab.active');
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
        // 高亮编辑按钮
        document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mobileTab === 'edit');
        });
    }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initMobileNav, 500);
});