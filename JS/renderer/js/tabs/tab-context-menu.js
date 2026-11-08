// ========== 标签右键菜单 ==========
let tabContextMenu = null;

function showTabContextMenu(e, tabId) {
    weLog.info('tab-context-menu', '→ showTabContextMenu', { tabId });
    e.preventDefault();
    e.stopPropagation();

    // 关闭已存在的菜单
    hideTabContextMenu();

    const tab = tabs[tabId];
    if (!tab) { weLog.warn('tab-context-menu', 'showTabContextMenu: 标签不存在', { tabId }); return; }

    const menu = document.createElement('div');
    menu.className = 'tab-context-menu';

    const isPinned = tab.pinned === true;
    const isLocked = tab.closable === false; // 强制固定（启程页等）
    const canPin = !isLocked;
    const canClose = tab.closable !== false && !isPinned;

    const parts = [];
    // 只有非强制固定的 tab 才显示 pin 菜单项
    if (canPin) {
        parts.push(`
            <div class="context-item" data-action="pin">
                <span class="context-icon" style="display:inline-flex;align-items:center;justify-content:center;">
                    <img src="../resources/pin.svg" width="12" height="12" alt="" style="display:block;transform:rotate(${isPinned ? 0 : 45}deg);transition:transform 0.15s;filter:brightness(${isPinned ? 1.2 : 1});">
                </span>
                <span>${isPinned ? (t('ui.unpin_tab') || '取消固定') : (t('ui.pin_tab') || '固定标签')}</span>
            </div>
        `);
        parts.push(`<div class="context-separator"></div>`);
    }
    parts.push(`
        <div class="context-item ${!canClose ? 'disabled' : ''}" data-action="close">
            <span class="context-icon"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg></span>
            <span>${t('ui.close_tab') || '关闭标签'}</span>
            <span class="shortcut-hint">Ctrl+W</span>
        </div>
        <div class="context-item" data-action="closeOthers">
            <span class="context-icon"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="8" height="16" rx="1"/><path d="M14 8h7M14 12h7M14 16h7"/></svg></span>
            <span>${t('ui.close_others') || '关闭其他标签'}</span>
        </div>
        <div class="context-item" data-action="closeRight">
            <span class="context-icon"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/><line x1="2" y1="8" x2="2" y2="16"/></svg></span>
            <span>${t('ui.close_right') || '关闭右侧标签'}</span>
        </div>
    `);
    parts.push(`<div class="context-separator"></div>`);
    parts.push(`
        <div class="context-item" data-action="rename">
            <span class="context-icon"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></span>
            <span>${t('ui.rename_tab') || '重命名标签'}</span>
        </div>
    `);

    menu.innerHTML = parts.join('');

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
            weLog.info('tab-context-menu', 'showTabContextMenu: 点击菜单项', { action, tabId });
            if (item.classList.contains('disabled')) { hideTabContextMenu(); return; }
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
    weLog.debug('tab-context-menu', '→ outsideClickHandler');
    if (tabContextMenu && !tabContextMenu.contains(e.target)) {
        hideTabContextMenu();
    }
}

function hideTabContextMenu() {
    weLog.info('tab-context-menu', '→ hideTabContextMenu');
    if (tabContextMenu) {
        tabContextMenu.remove();
        tabContextMenu = null;
        document.removeEventListener('click', outsideClickHandler);
        document.removeEventListener('contextmenu', outsideClickHandler);
    }
}

/**
 * 批量关闭标签（先检查 dirty 数量，有脏则弹统一确认）
 * @param {string[]} tabIds 要关闭的 tab ID 列表（已过滤 closable && !pinned）
 */
async function batchCloseTabs(tabIds) {
    weLog.info('tab-context-menu', '→ batchCloseTabs', { count: tabIds.length });
    const dirtyIds = tabIds.filter(id => tabs[id]?.dirty);
    if (dirtyIds.length > 0) {
        const dirtyNames = dirtyIds.map(id => tabs[id]?.title || id).join('、');
        const total = tabIds.length;
        const msg = dirtyIds.length === total
            ? (t('ui.batch_close_all_dirty') || `共 ${total} 个标签，全部未保存，确定全部关闭？`)
            : (t('ui.batch_close_with_dirty') || `${dirtyNames} 等 ${dirtyIds.length}/${total} 个标签未保存，确定全部关闭？`);
        const ok = await showConfirmDialog(msg, t('ui.batch_close_confirm') || '批量关闭确认');
        if (!ok) { weLog.info('tab-context-menu', 'batchCloseTabs: 用户取消'); return; }
    }
    // 一次性关闭（用 skipConfirm 模式）
    for (const id of tabIds) {
        if (tabs[id]) doCloseTab(id);
    }
}

function handleTabContextAction(action, tabId) {
    weLog.info('tab-context-menu', '→ handleTabContextAction', { action, tabId });
    const tab = tabs[tabId];
    if (!tab) { weLog.warn('tab-context-menu', 'handleTabContextAction: 标签不存在', { tabId }); return; }

    switch (action) {
        case 'pin':
            weLog.info('tab-context-menu', 'handleTabContextAction: pin', { tabId, willPin: !tab.pinned });
            togglePinTab(tabId);
            break;

        case 'close':
            weLog.info('tab-context-menu', 'handleTabContextAction: close', { tabId });
            if (tab.closable && !tab.pinned) {
                closeTab(tabId);
            } else {
                weLog.warn('tab-context-menu', 'handleTabContextAction: 标签不可关闭', { tabId, closable: tab.closable, pinned: tab.pinned });
            }
            break;

        case 'closeOthers': {
            weLog.info('tab-context-menu', 'handleTabContextAction: closeOthers', { tabId });
            const targets = Object.keys(tabs).filter(id =>
                id !== tabId && tabs[id].closable && !tabs[id].pinned
            );
            if (targets.length === 0) { showNotification(t('ui.no_close_target') || '没有可关闭的标签'); break; }
            batchCloseTabs(targets);
            break;
        }

        case 'closeRight': {
            weLog.info('tab-context-menu', 'handleTabContextAction: closeRight', { tabId });
            const orderedIds = getOrderedTabIds();
            const currentIndex = orderedIds.indexOf(tabId);
            const targets = [];
            for (let i = currentIndex + 1; i < orderedIds.length; i++) {
                const t = tabs[orderedIds[i]];
                if (t && t.closable && !t.pinned) targets.push(orderedIds[i]);
            }
            if (targets.length === 0) { showNotification(t('ui.no_close_target') || '没有可关闭的标签'); break; }
            batchCloseTabs(targets);
            break;
        }

        case 'rename':
            weLog.info('tab-context-menu', 'handleTabContextAction: rename', { tabId });
            const newName = prompt(t('ui.rename_tab_prompt') || '重命名标签', tab.title);
            if (newName && newName.trim()) {
                tab.title = newName.trim();
                // 只更新文字节点，保留按钮，然后调 updateTabButtons 修正按钮状态
                // tab HTML 结构：textNode + [close-tab|unpin-tab]
                const tabEl = tab.tabElement;
                // 收集现有按钮节点
                const btnNodes = [];
                tabEl.querySelectorAll('.close-tab, .unpin-tab').forEach(n => btnNodes.push(n));
                // 清空内容
                tabEl.textContent = '';
                // 重新填充：先加文字
                tabEl.appendChild(document.createTextNode(newName.trim()));
                // 再加按钮（但先用 updateTabButtons 统一处理状态）
                updateTabButtons(tabId);
                // 更新 onclick（加入 unpin-tab 处理）
                tabEl.onclick = (e) => {
                    if (e.target.classList.contains('close-tab')) closeTab(e.target.dataset.id);
                    else if (e.target.classList.contains('unpin-tab')) togglePinTab(e.target.dataset.id);
                    else switchTab(tabId);
                };
                weLog.info('tab-context-menu', 'handleTabContextAction: rename 完成', { tabId, newName: newName.trim() });
            } else {
                weLog.info('tab-context-menu', 'handleTabContextAction: rename 取消');
            }
            break;

        default:
            weLog.warn('tab-context-menu', 'handleTabContextAction: 未知 action', { action });
    }
}

// 为所有标签添加右键菜单支持
function setupTabContextMenu() {
    weLog.info('tab-context-menu', '→ setupTabContextMenu');
    const tabsContainer = document.querySelector('.tabs-container');
    if (!tabsContainer) { weLog.warn('tab-context-menu', 'setupTabContextMenu: tabs-container 不存在'); return; }

    tabsContainer.addEventListener('contextmenu', (e) => {
        const tabEl = e.target.closest('.tab');
        if (tabEl && tabEl.dataset.id) {
            showTabContextMenu(e, tabEl.dataset.id);
        }
    });
    weLog.info('tab-context-menu', '← setupTabContextMenu 完成');
}

// 标签固定样式支持
function initTabPinState() {
    weLog.info('tab-context-menu', '→ initTabPinState');
    Object.values(tabs).forEach(tab => {
        if (tab.pinned && tab.tabElement) {
            tab.tabElement.classList.add('pinned');
        }
    });
}