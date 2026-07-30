// ========== 标签右键菜单 ==========
let tabContextMenu = null;

function showTabContextMenu(e, tabId) {
    e.preventDefault();
    e.stopPropagation();

    // 关闭已存在的菜单
    hideTabContextMenu();

    const tab = tabs[tabId];
    if (!tab) return;

    const menu = document.createElement('div');
    menu.className = 'tab-context-menu';
    
    const isPinned = tab.pinned === true;
    const closable = tab.closable !== false;
    
    menu.innerHTML = `
        <div class="context-item" data-action="pin">
            <span class="context-icon">${isPinned ? '📌' : '📍'}</span>
            <span>${isPinned ? (t('ui.unpin_tab') || '取消固定') : (t('ui.pin_tab') || '固定标签')}</span>
        </div>
        <div class="context-separator"></div>
        <div class="context-item ${!closable || tabId === 'welcome' ? 'disabled' : ''}" data-action="close">
            <span class="context-icon">✕</span>
            <span>${t('ui.close_tab') || '关闭标签'}</span>
            <span class="shortcut-hint">Ctrl+W</span>
        </div>
        <div class="context-item" data-action="closeOthers">
            <span class="context-icon">⇔</span>
            <span>${t('ui.close_others') || '关闭其他标签'}</span>
        </div>
        <div class="context-item" data-action="closeRight">
            <span class="context-icon">→</span>
            <span>${t('ui.close_right') || '关闭右侧标签'}</span>
        </div>
        <div class="context-separator"></div>
        <div class="context-item" data-action="rename">
            <span class="context-icon">✎</span>
            <span>${t('ui.rename_tab') || '重命名标签'}</span>
        </div>
    `;

    // 调整位置防止溢出
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - 10;
    const maxY = window.innerHeight - rect.height - 10;
    menu.style.left = Math.min(e.clientX, maxX) + 'px';
    menu.style.top = Math.min(e.clientY, maxY) + 'px';

    menu.querySelectorAll('.context-item').forEach(item => {
        item.addEventListener('click', () => {
            const action = item.dataset.action;
            handleTabContextAction(action, tabId);
            hideTabContextMenu();
        });
    });

    tabContextMenu = menu;
    
    // 点击其他地方关闭
    setTimeout(() => {
        document.addEventListener('click', outsideClickHandler);
        document.addEventListener('contextmenu', outsideClickHandler);
    }, 0);
}

function outsideClickHandler(e) {
    if (tabContextMenu && !tabContextMenu.contains(e.target)) {
        hideTabContextMenu();
    }
}

function hideTabContextMenu() {
    if (tabContextMenu) {
        tabContextMenu.remove();
        tabContextMenu = null;
        document.removeEventListener('click', outsideClickHandler);
        document.removeEventListener('contextmenu', outsideClickHandler);
    }
}

function handleTabContextAction(action, tabId) {
    const tab = tabs[tabId];
    if (!tab) return;

    switch (action) {
        case 'pin':
            tab.pinned = !tab.pinned;
            const tabElement = tab.tabElement;
            if (tab.pinned) {
                tabElement.classList.add('pinned');
                // 移动到最前面
                const container = tabElement.parentElement;
                container.insertBefore(tabElement, container.firstChild);
            } else {
                tabElement.classList.remove('pinned');
            }
            showNotification(tab.pinned ? (t('ui.tab_pinned') || '标签已固定') : (t('ui.tab_unpinned') || '标签已取消固定'));
            break;

        case 'close':
            if (tab.closable && tabId !== 'welcome') {
                closeTab(tabId);
            }
            break;

        case 'closeOthers':
            Object.keys(tabs).forEach(id => {
                if (id !== tabId && tabs[id].closable && id !== 'welcome') {
                    closeTab(id);
                }
            });
            break;

        case 'closeRight':
            const ids = getOrderedTabIds();
            const currentIndex = ids.indexOf(tabId);
            for (let i = currentIndex + 1; i < ids.length; i++) {
                if (tabs[ids[i]].closable && ids[i] !== 'welcome') {
                    closeTab(ids[i]);
                }
            }
            break;

        case 'rename':
            const newName = prompt(t('ui.rename_tab_prompt') || '重命名标签', tab.title);
            if (newName && newName.trim()) {
                tab.title = newName.trim();
                // 更新标签显示
                const displayName = tab.closable ? newName.trim() + ' <span class="close-tab" data-id="' + tabId + '">×</span>' : newName.trim();
                tab.tabElement.innerHTML = displayName;
                tab.tabElement.onclick = (e) => {
                    if (e.target.classList.contains('close-tab')) closeTab(e.target.dataset.id);
                    else switchTab(tabId);
                };
            }
            break;
    }
}

// 为所有标签添加右键菜单支持
function setupTabContextMenu() {
    const tabsContainer = document.querySelector('.tabs-container');
    if (!tabsContainer) return;

    tabsContainer.addEventListener('contextmenu', (e) => {
        const tabEl = e.target.closest('.tab');
        if (tabEl && tabEl.dataset.id) {
            showTabContextMenu(e, tabEl.dataset.id);
        }
    });
}

// 标签固定样式支持
function initTabPinState() {
    Object.values(tabs).forEach(tab => {
        if (tab.pinned && tab.tabElement) {
            tab.tabElement.classList.add('pinned');
        }
    });
}