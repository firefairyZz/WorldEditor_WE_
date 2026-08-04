function createWelcomeTab() {
    const id = 'welcome';
    if (tabs[id]) { switchTab(id); return; }
    const content = document.createElement('div');
    content.className = 'welcome-new';
    const folderOpenSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/></svg>';
    const filePlusSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M9 15h6"/><path d="M12 18v-6"/></svg>';
    const actions = [
        { icon: folderOpenSvg, labelKey: 'ui.open_folder', action: openProject },
        { icon: filePlusSvg, labelKey: 'ui.new_project', action: createNewProjectTab }
    ];
    const actionsContainer = document.createElement('div');
    actionsContainer.className = 'welcome-actions-new';
    actions.forEach(item => {
        const btn = document.createElement('button');
        btn.className = 'action-btn';
        btn.innerHTML = `<span class="action-icon">${item.icon}</span><span class="action-label" data-label-key="${item.labelKey}">${t(item.labelKey)}</span>`;
        if (item.action) btn.onclick = item.action;
        actionsContainer.appendChild(btn);
    });

    // 固定的项目区域
    const pinnedContainer = document.createElement('div');
    pinnedContainer.className = 'recent-section-new pinned-section';
    pinnedContainer.innerHTML = `<div class="recent-title">${t('ui.pinned_projects')}</div><div class="recent-list-new" id="pinned-list"></div>`;

    // 最近打开的项目区域
    const recentContainer = document.createElement('div');
    recentContainer.className = 'recent-section-new';
    recentContainer.innerHTML = `<div class="recent-title">${t('ui.recent_projects')}</div><div class="recent-list-new" id="recent-list"></div>`;

    content.appendChild(actionsContainer);
    content.appendChild(pinnedContainer);
    content.appendChild(recentContainer);
    loadPinnedProjects(content.querySelector('#pinned-list'));
    loadRecentProjectsNew(content.querySelector('#recent-list'));
    addTab(id, t('ui.welcome_tab'), content, false);
}

function formatModifiedTime(ms) {
    if (!ms) return '';
    const date = new Date(ms);
    const now = new Date();
    const diff = now - date;
    if (diff < 60000) return t('ui.just_now') || '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + (t('ui.minutes_ago') || '分钟前');
    if (diff < 86400000) return Math.floor(diff / 3600000) + (t('ui.hours_ago') || '小时前');
    if (diff < 604800000) return Math.floor(diff / 86400000) + (t('ui.days_ago') || '天前');
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

async function loadPinnedProjects(container) {
    try {
        const result = await weAPI.getRecentProjects();
        const projects = result.pinned || [];
        if (!projects.length) {
            container.innerHTML = `<div class="recent-empty">${t('ui.no_pinned') || '暂无固定项目'}</div>`;
            return;
        }
        container.innerHTML = projects.map(p => `
            <div class="recent-item-new pinned-item" data-path="${escapeHtml(p.path)}">
                <div class="item-left">
                    <img class="item-pin-icon" src="../resources/pin.svg" alt="">
                    <span class="item-name">${escapeHtml(p.name)}</span>
                </div>
                <span class="item-modified">${escapeHtml(formatModifiedTime(p.modified))}</span>
            </div>
        `).join('');
        container.querySelectorAll('.pinned-item').forEach(item => {
            item.addEventListener('click', () => openProjectByPath(item.dataset.path));
        });
    } catch (e) {
        container.innerHTML = `<div class="recent-empty">${t('ui.load_failed')}</div>`;
    }
}

async function loadRecentProjectsNew(container) {
    try {
        const result = await weAPI.getRecentProjects();
        const projects = result.recent || [];
        if (!projects.length) {
            container.innerHTML = `<div class="recent-empty">${t('ui.no_recent')}</div>`;
            return;
        }
        container.innerHTML = projects.map(p => `
            <div class="recent-item-new" data-path="${escapeHtml(p.path)}">
                <span class="item-name">${escapeHtml(p.name)}</span>
                <span class="item-path">${escapeHtml(p.path)}</span>
            </div>
        `).join('');
        container.querySelectorAll('.recent-item-new').forEach(item => {
            item.addEventListener('click', () => openProjectByPath(item.dataset.path));
        });
    } catch (e) {
        container.innerHTML = `<div class="recent-empty">${t('ui.load_failed')}</div>`;
    }
}

// 暴露给其他模块调用的刷新函数
window.refreshRecentProjects = async function() {
    const pinnedContainer = document.getElementById('pinned-list');
    const recentContainer = document.getElementById('recent-list');
    if (pinnedContainer) await loadPinnedProjects(pinnedContainer);
    if (recentContainer) await loadRecentProjectsNew(recentContainer);
};
