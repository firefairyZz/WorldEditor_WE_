// ========== Debug 面板 ==========
let debugPanel = null;
let debugLog = [];

function logDebug(category, message) {
    const time = new Date().toLocaleTimeString();
    debugLog.unshift({ time, category, message });
    if (debugLog.length > 50) debugLog.pop();
    if (debugPanel) updateDebugPanel();
}

function toggleDebugPanel() {
    if (debugPanel) {
        closeDebugPanel();
    } else {
        openDebugPanel();
    }
}

function openDebugPanel() {
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
        logDebug('Action', 'Reloading app...');
        setTimeout(() => location.reload(), 300);
    };
    debugPanel.querySelector('.debug-btn-devtools').onclick = () => {
        weAPI.toggleDevTools();
    };

    debugPanel.querySelectorAll('.debug-action-btn').forEach(btn => {
        btn.onclick = () => handleDebugAction(btn.dataset.action);
    });

    updateDebugPanel();
}

function closeDebugPanel() {
    if (debugPanel) {
        debugPanel.remove();
        debugPanel = null;
    }
}

function updateDebugPanel() {
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
    switch (action) {
        case 'create-test': {
            const name = 'TestProject_' + Date.now().toString(36);
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
                logDebug('Error', e.message);
            }
            break;
        }
        case 'delete-all-test': {
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
                logDebug('Error', e.message);
            }
            break;
        }
        case 'list-projects': {
            try {
                const projects = await weAPI.getRecentProjects();
                logDebug('Info', `Recent projects (${projects.length}): ${projects.join(', ') || 'none'}`);
            } catch (e) {
                logDebug('Error', e.message);
            }
            break;
        }
        case 'dump-state': {
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
            Object.keys(tabs).forEach(id => {
                if (tabs[id] && tabs[id].fileCache) {
                    tabs[id].fileCache = {};
                }
            });
            logDebug('Action', 'All file caches cleared');
            showNotification('缓存已清空');
            break;
        }
    }
    updateDebugPanel();
}

// Ctrl+Shift+D 切换 Debug 面板
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        toggleDebugPanel();
    }
});
