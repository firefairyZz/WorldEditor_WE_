function createWelcomeTab() {
    const id = 'welcome';
    if (tabs[id]) { switchTab(id); return; }
    const content = document.createElement('div');
    content.className = 'welcome-new';
    const actions = [
        { icon: '📂', labelKey: 'ui.open_folder', action: openProject },
        { icon: '📄', labelKey: 'ui.new_project', action: createNewProjectTab },
        { icon: '✏️', labelKey: 'ui.new_file', action: () => {
            if (activeTabId && tabs[activeTabId] && tabs[activeTabId].projectPath) {
                addFileToProject(activeTabId);
            } else {
                alert(t('ui.need_open_project'));
            }
        }}
    ];
    const actionsContainer = document.createElement('div');
    actionsContainer.className = 'welcome-actions-new';
    actions.forEach(item => {
        const btn = document.createElement('button');
        btn.className = 'action-btn';
        btn.innerHTML = `<span class="action-icon">${item.icon}</span><span class="action-label">${t(item.labelKey)}</span>`;
        if (item.action) btn.onclick = item.action;
        actionsContainer.appendChild(btn);
    });
    const recentContainer = document.createElement('div');
    recentContainer.className = 'recent-section-new';
    recentContainer.innerHTML = `<div class="recent-title">${t('ui.recent_projects')}</div><div class="recent-list-new" id="recent-list"></div>`;
    content.appendChild(actionsContainer);
    content.appendChild(recentContainer);
    loadRecentProjectsNew(content.querySelector('#recent-list'));
    addTab(id, t('ui.welcome_tab'), content, false);
}

async function loadRecentProjectsNew(container) {
    try {
        const projects = await weAPI.getRecentProjects();
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