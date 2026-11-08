// ========== Debug 面板 ==========
let debugPanel = null;
let debugLog = [];

function logDebug(category, message) {
    weLog.debug('debug', '→ logDebug', { category, message });
    const time = new Date().toLocaleTimeString();
    debugLog.unshift({ time, category, message });
    if (debugLog.length > 50) debugLog.pop();
    if (debugPanel) updateDebugPanel();
}

function toggleDebugPanel() {
    weLog.info('debug', '→ toggleDebugPanel', { isOpen: !!debugPanel });
    if (debugPanel) {
        closeDebugPanel();
    } else {
        openDebugPanel();
    }
}

function openDebugPanel() {
    weLog.info('debug', '→ openDebugPanel');
    debugPanel = document.createElement('div');
    debugPanel.className = 'debug-panel';
    debugPanel.innerHTML = `
        <div class="debug-header">
            <span>Debug Console</span>
            <div class="debug-header-actions">
                <button class="debug-btn-reload" title="Reload">↻</button>
                <button class="debug-btn-devtools" title="DevTools">⚡</button>
                <button class="debug-btn-close" title="Close">✕</button>
            </div>
        </div>
        <div class="debug-section">
            <div class="debug-section-title">Quick Actions</div>
            <div class="debug-actions">
                <button class="debug-action-btn" data-action="create-test">创建测试项目</button>
                <button class="debug-action-btn" data-action="delete-all-test">删除所有测试项目</button>
                <button class="debug-action-btn" data-action="list-projects">列出最近项目</button>
                <button class="debug-action-btn" data-action="dump-state">导出当前状态</button>
                <button class="debug-action-btn" data-action="clear-cache">清空缓存</button>
                <button class="debug-action-btn" data-action="toggle-mobile" id="debug-toggle-mobile">📱 测试手机布局</button>
                <button class="debug-action-btn danger" data-action="delete-user-config">删除用户配置</button>
            </div>
        </div>
        <div class="debug-section">
            <div class="debug-section-title">State</div>
            <div class="debug-state" id="debug-state"></div>
        </div>
        <div class="debug-section">
            <div class="debug-section-title">Log</div>
            <div class="debug-log" id="debug-log"></div>
        </div>
    `;
    document.body.appendChild(debugPanel);

    debugPanel.querySelector('.debug-btn-close').onclick = closeDebugPanel;
    debugPanel.querySelector('.debug-btn-reload').onclick = () => {
        weLog.info('debug', 'openDebugPanel: 点击 Reload');
        logDebug('Action', 'Reloading app...');
        setTimeout(() => location.reload(), 300);
    };
    debugPanel.querySelector('.debug-btn-devtools').onclick = () => {
        weLog.info('debug', 'openDebugPanel: 点击 DevTools');
        weAPI.toggleDevTools();
    };

    debugPanel.querySelectorAll('.debug-action-btn').forEach(btn => {
        btn.onclick = () => handleDebugAction(btn.dataset.action);
    });

    updateDebugPanel();
}

function closeDebugPanel() {
    weLog.info('debug', '→ closeDebugPanel');
    if (debugPanel) {
        debugPanel.remove();
        debugPanel = null;
    } else {
        weLog.warn('debug', 'closeDebugPanel: debugPanel 不存在');
    }
}

function updateDebugPanel() {
    weLog.debug('debug', '→ updateDebugPanel');
    if (!debugPanel) return;

    // 更新状态
    const stateEl = debugPanel.querySelector('#debug-state');
    const tabIds = Object.keys(tabs);
    const stateLines = [];
    stateLines.push(`<div class="state-row"><span class="state-key">activeTabId</span><span class="state-val">${activeTabId || 'null'}</span></div>`);
    stateLines.push(`<div class="state-row"><span class="state-key">tabs count</span><span class="state-val">${tabIds.length}</span></div>`);
    tabIds.forEach(id => {
        const tab = tabs[id];
        const info = [
            `title=${tab.title || '?'}`,
            tab.projectPath ? `path=${tab.projectPath}` : '',
            tab.projectMode ? `mode=${tab.projectMode}` : '',
            tab.dirty ? 'dirty' : '',
            tab.currentFile ? `file=${tab.currentFile}` : ''
        ].filter(Boolean).join(', ');
        stateLines.push(`<div class="state-row"><span class="state-key">${id}</span><span class="state-val">${info}</span></div>`);
    });
    stateEl.innerHTML = stateLines.join('');

    // 更新日志
    const logEl = debugPanel.querySelector('#debug-log');
    logEl.innerHTML = debugLog.map(entry =>
        `<div class="log-row"><span class="log-time">${entry.time}</span><span class="log-cat">${entry.category}</span><span class="log-msg">${entry.message}</span></div>`
    ).join('') || '<div class="log-empty">No logs yet</div>';
}

async function handleDebugAction(action) {
    weLog.info('debug', '→ handleDebugAction', { action });
    switch (action) {
        case 'create-test': {
            const name = 'TestProject_' + Date.now().toString(36);
            weLog.info('debug', 'handleDebugAction: create-test', { name });
            logDebug('Action', `Creating test project: ${name}`);
            try {
                const folder = await weAPI.getDefaultProjectPath(name);
                const result = await weAPI.createProject(folder, name, 'Debug test project', 'empty', 'rich');
                if (result.success) {
                    openProjectDirectly({ folder, name, fileList: result.fileList, projectMode: 'rich' });
                    logDebug('Success', `Created: ${name} at ${folder}`);
                } else {
                    logDebug('Error', `Create failed: ${result.error}`);
                }
            } catch (e) {
                weLog.error('debug', 'handleDebugAction create-test 失败', e && e.stack ? e.stack : String(e));
                logDebug('Error', e.message);
            }
            break;
        }
        case 'delete-all-test': {
            weLog.info('debug', 'handleDebugAction: delete-all-test');
            logDebug('Action', 'Deleting all test projects...');
            try {
                const projects = await weAPI.getRecentProjects();
                let count = 0;
                for (const p of projects) {
                    if (p.includes('TestProject_')) {
                        await weAPI.deleteProject(p);
                        count++;
                    }
                }
                logDebug('Success', `Deleted ${count} test projects`);
                showNotification(`已删除 ${count} 个测试项目`);
            } catch (e) {
                weLog.error('debug', 'handleDebugAction delete-all-test 失败', e && e.stack ? e.stack : String(e));
                logDebug('Error', e.message);
            }
            break;
        }
        case 'list-projects': {
            weLog.info('debug', 'handleDebugAction: list-projects');
            try {
                const projects = await weAPI.getRecentProjects();
                logDebug('Info', `Recent projects (${projects.length}): ${projects.join(', ') || 'none'}`);
            } catch (e) {
                weLog.error('debug', 'handleDebugAction list-projects 失败', e && e.stack ? e.stack : String(e));
                logDebug('Error', e.message);
            }
            break;
        }
        case 'dump-state': {
            weLog.info('debug', 'handleDebugAction: dump-state');
            const state = {
                activeTabId,
                tabs: Object.keys(tabs).map(id => ({
                    id, title: tabs[id].title,
                    projectPath: tabs[id].projectPath,
                    projectMode: tabs[id].projectMode,
                    dirty: tabs[id].dirty,
                    currentFile: tabs[id].currentFile
                }))
            };
            const json = JSON.stringify(state, null, 2);
            logDebug('State', json.substring(0, 200) + (json.length > 200 ? '...' : ''));
            console.log('=== WE Debug State ===\n', state);
            break;
        }
        case 'clear-cache': {
            weLog.info('debug', 'handleDebugAction: clear-cache');
            Object.keys(tabs).forEach(id => {
                if (tabs[id] && tabs[id].fileCache) {
                    tabs[id].fileCache = {};
                }
            });
            logDebug('Action', 'All file caches cleared');
            showNotification('缓存已清空');
            break;
        }
        case 'delete-user-config': {
            weLog.info('debug', 'handleDebugAction: delete-user-config');
            if (!confirm('确定要删除所有用户配置吗？包括账户、设置等所有数据。')) return;
            if (!confirm('此操作不可撤销，确定继续？')) return;
            logDebug('Action', 'Deleting all user config...');
            try {
                const result = await weAPI.deleteUserConfig();
                if (result.success) {
                    logDebug('Success', 'All user config deleted');
                    showNotification('用户配置已删除，即将重新加载');
                    setTimeout(() => location.reload(), 500);
                } else {
                    logDebug('Error', `Delete failed: ${result.error}`);
                }
            } catch (e) {
                weLog.error('debug', 'handleDebugAction delete-user-config 失败', e && e.stack ? e.stack : String(e));
                logDebug('Error', e.message);
            }
            break;
        }
        case 'toggle-mobile': {
            weLog.info('debug', 'handleDebugAction: toggle-mobile');
            const isDesktop = document.body.classList.toggle('is-desktop');
            logDebug('Action', `手机布局: ${isDesktop ? '已关闭' : '已开启'}`);
            const btn = document.getElementById('debug-toggle-mobile');
            if (btn) btn.textContent = isDesktop ? '📱 测试手机布局' : '🖥️ 关闭手机布局';
            // 触发移动端导航初始化
            if (typeof checkMobileLayout === 'function') checkMobileLayout();
            // 刷新 We 图标（如果已切换）
            updateDebugPanel();
            break;
        }
        default:
            weLog.warn('debug', 'handleDebugAction: 未知 action', { action });
    }
    updateDebugPanel();
}

// Ctrl+Shift+D 切换 Debug 面板
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd' || e.code === 'KeyD')) {
        weLog.info('debug', 'keydown: 匹配 Ctrl+Shift+D 切换 Debug 面板');
        e.preventDefault();
        e.stopPropagation();
        toggleDebugPanel();
    }
});
