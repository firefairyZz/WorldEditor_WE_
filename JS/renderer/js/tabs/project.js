// ========== 新建项目 ==========
function createNewProjectTab() {
    weLog.info('project', '→ createNewProjectTab 开始');
    const id = 'new-project';
    if (tabs[id]) { weLog.debug('project', 'createNewProjectTab: 标签已存在，切换过去'); switchTab(id); return; }
    // OA 模板：area-root.oa > 单个 area-card > new-project-page
    const root = document.createElement('div');
    root.className = 'area-root oa';
    const block = document.createElement('div');
    block.className = 'area-card';
    const content = document.createElement('div');
    content.className = 'new-project-page';
    content.innerHTML = `
        <div class="new-project-wrapper">
            <div class="new-project-scroll">
                <div class="scroll-inner">
                    <h2>${t('ui.create_project')}</h2>
                    <div class="form-group">
                        <label>${t('ui.owner')}</label>
                        <div class="owner-display" id="owner-display">
                            <span class="owner-avatar" id="owner-avatar">U</span>
                            <span id="owner-name">${t('ui.loading') || '加载中...'}</span>
                        </div>
                        <p class="field-hint">${t('ui.owner_hint')}</p>
                    </div>
                    <hr>
                    <div class="form-group">
                        <label for="new-project-name">${t('ui.project_name')} <span class="required">*</span></label>
                        <input type="text" id="new-project-name" placeholder="${t('ui.name_placeholder')}" autofocus />
                        <div class="error-message" id="name-error"></div>
                        <p class="field-hint">${t('ui.name_hint')}</p>
                    </div>
                    <div class="form-group">
                        <label for="new-project-desc">${t('ui.description')} <span class="optional">${t('ui.optional')}</span></label>
                        <textarea id="new-project-desc" rows="3" placeholder="${t('ui.desc_placeholder')}"></textarea>
                    </div>
                    <hr>
                    <div class="form-group">
                        <label>${t('ui.visibility')}</label>
                        <div class="radio-group">
                            <label class="radio-option">
                                <input type="radio" name="visibility" value="local" checked />
                                <strong>${t('ui.local')}</strong>
                                <span class="radio-desc">${t('ui.local_desc')}</span>
                            </label>
                            <label class="radio-option">
                                <input type="radio" name="visibility" value="shared" disabled />
                                <strong>${t('ui.shared')}</strong>
                                <span class="radio-desc">${t('ui.shared_desc')}</span>
                            </label>
                        </div>
                    </div>
                    <hr>
                    <div class="form-group">
                        <label>${t('ui.project_mode') || '项目模式'}</label>
                        <div class="radio-group">
                            <label class="radio-option">
                                <input type="radio" name="project-mode" value="rich" checked />
                                <strong>${t('ui.rich_text_mode') || '富文本模式'}</strong>
                                <span class="radio-desc">${t('ui.rich_text_desc') || '使用富文本编辑器（Quill），所见即所得'}</span>
                            </label>
                            <label class="radio-option">
                                <input type="radio" name="project-mode" value="markdown" />
                                <strong>${t('ui.markdown_mode') || 'Markdown 模式'}</strong>
                                <span class="radio-desc">${t('ui.markdown_desc') || '纯 Markdown 文本编辑器 + 实时预览'}</span>
                            </label>
                        </div>
                        <p class="field-hint">${t('ui.project_mode_hint') || '创建后不可修改'}</p>
                    </div>
                    <hr>
                    <div class="form-group">
                        <label>${t('ui.project_template') || '项目模板'}</label>
                        <div class="template-grid">
                            <label class="template-option">
                                <input type="radio" name="template" value="empty" checked />
                                <div class="template-card">
                                    <div class="template-icon">📄</div>
                                    <strong>${t('ui.template_empty') || '空白项目'}</strong>
                                    <span class="template-desc">${t('ui.template_empty_desc') || '不创建任何文件'}</span>
                                </div>
                            </label>
                            <label class="template-option">
                                <input type="radio" name="template" value="novel" />
                                <div class="template-card">
                                    <div class="template-icon">📖</div>
                                    <strong>${t('ui.template_novel') || '小说'}</strong>
                                    <span class="template-desc">${t('ui.template_novel_desc') || '章节、角色、大纲'}</span>
                                </div>
                            </label>
                            <label class="template-option">
                                <input type="radio" name="template" value="worldbuilding" />
                                <div class="template-card">
                                    <div class="template-icon">🌍</div>
                                    <strong>${t('ui.template_world') || '世界观'}</strong>
                                    <span class="template-desc">${t('ui.template_world_desc') || '地理、种族、历史、魔法'}</span>
                                </div>
                            </label>
                            <label class="template-option">
                                <input type="radio" name="template" value="script" />
                                <div class="template-card">
                                    <div class="template-icon">🎬</div>
                                    <strong>${t('ui.template_script') || '剧本'}</strong>
                                    <span class="template-desc">${t('ui.template_script_desc') || '场景、角色、对话'}</span>
                                </div>
                            </label>
                        </div>
                    </div>
                    <hr>
                    <div class="form-group">
                        <label class="checkbox-option">
                            <input type="checkbox" id="new-project-pin" />
                            <strong>${t('ui.pin_to_welcome') || '将此项目固定到启程页'}</strong>
                        </label>
                    </div>
                </div>
            </div>
            <div class="new-project-footer">
                <button class="btn-cancel" id="create-project-cancel">${t('ui.cancel')}</button>
                <button class="btn-submit" id="create-project-submit">${t('ui.create')}</button>
            </div>
        </div>
    `;
    const nameError = content.querySelector('#name-error');
    const nameInput = content.querySelector('#new-project-name');
    const submitBtn = content.querySelector('#create-project-submit');
    // 初始禁用创建按钮（视觉）
    submitBtn.classList.add('btn-disabled');
    // 清除错误状态
    const clearNameError = () => {
        nameError.classList.remove('prominent');
        nameError.style.display = 'none';
        nameInput.classList.remove('input-error');
    };
    // 输入时清除错误 + 控制按钮状态
    nameInput.addEventListener('input', () => {
        clearNameError();
        submitBtn.classList.toggle('btn-disabled', !nameInput.value.trim());
    });
    content.querySelector('#create-project-submit').onclick = async () => {
        const name = nameInput.value.trim();
        if (!name) {
            weLog.warn('project', 'createNewProjectTab: 项目名称为空');
            nameError.textContent = t('ui.name_required') || 'Project name is required';
            nameError.classList.add('prominent');
            nameInput.classList.add('input-error');
            nameInput.focus();
            // 重新触发抖动动画
            nameInput.classList.remove('input-error');
            void nameInput.offsetWidth;
            nameInput.classList.add('input-error');
            return;
        }
        clearNameError();
        const desc = content.querySelector('#new-project-desc').value.trim();
        const template = content.querySelector('input[name="template"]:checked')?.value || 'empty';
        const projectMode = content.querySelector('input[name="project-mode"]:checked')?.value || 'rich';
        const shouldPin = content.querySelector('#new-project-pin')?.checked || false;
        try {
            weLog.info('project', 'createNewProjectTab: 开始创建项目', { name, template, projectMode, shouldPin });
            const folder = await weAPI.getDefaultProjectPath(name);
            const result = await weAPI.createProject(folder, name, desc, template, projectMode);
            if (result.success) {
                weLog.info('project', 'createNewProjectTab: 项目创建成功', { folder });
                if (shouldPin) {
                    await weAPI.togglePinProject(folder);
                }
                closeTab(id);
                openProjectDirectly({ folder, name, fileList: result.fileList, projectMode: result.projectMode, owner: result.owner });
                showNotification(t('ui.project_created') || '项目已创建');
            } else {
                weLog.warn('project', 'createNewProjectTab: 项目创建失败', { error: result.error });
                nameError.textContent = (t('ui.create_failed') || 'Create failed') + ': ' + result.error;
                nameError.classList.add('prominent');
            }
        } catch (e) {
            weLog.error('project', 'createNewProjectTab 创建项目失败', e && e.stack ? e.stack : String(e));
            nameError.textContent = (t('ui.create_error') || 'Error') + ': ' + e.message;
            nameError.classList.add('prominent');
        }
    };
    content.querySelector('#create-project-cancel').onclick = () => closeTab(id);
    block.appendChild(content);
    root.appendChild(block);
    addTab(id, t('ui.new_project_tab'), root, true);
    updateOwnerDisplay(currentAccount);
}

// ========== 打开项目 ==========
async function openProject() {
    weLog.info('project', '→ openProject 开始');
    const folder = await weAPI.selectFolder();
    if (folder) openProjectByPath(folder);
    else weLog.debug('project', 'openProject: 用户未选择文件夹');
}

async function openProjectByPath(folder) {
    weLog.info('project', '→ openProjectByPath 开始', { folder });
    const result = await weAPI.openProject(folder);
    if (!result.success) { weLog.warn('project', 'openProjectByPath: 打开项目失败', { error: result.error }); showNotification(t('ui.open_failed') + ': ' + result.error); return; }
    openProjectDirectly(result);
    showNotification(t('ui.project_opened') || '项目已打开');
}

async function openProjectDirectly({ folder, name, fileList, projectMode, owner }) {
    weLog.info('project', '→ openProjectDirectly 开始', { folder, name, projectMode, fileCount: fileList ? fileList.length : 0 });
    const safeId = sanitizeId(folder);
    if (tabs[safeId]) { weLog.debug('project', 'openProjectDirectly: 标签已存在，切换过去', { safeId }); switchTab(safeId); return; }

    // 获取当前账户信息
    let currentAccountData = null;
    try {
        const accRes = await weAPI.getAccount();
        if (accRes.success) currentAccountData = accRes.account;
    } catch(e) {
        weLog.error('project', 'openProjectDirectly: 获取账户信息失败', e && e.stack ? e.stack : String(e));
    }

    // 读取默认打开第一项设置
    let defaultOpenFirst = false;
    try {
        const settings = await weAPI.getSettings();
        defaultOpenFirst = settings.defaultOpenFirst === true;
    } catch(e) {
        weLog.error('project', 'openProjectDirectly: 读取设置失败', e && e.stack ? e.stack : String(e));
    }

    const layout = document.createElement('div');
    // TA 模板：area-root.ta(透材质+8px padding+8px gap) ──> area-card.is-left + area-resizer + area-card.is-right
    layout.className = 'project-layout area-root ta';

    const sidebar = document.createElement('div');
    sidebar.className = 'project-sidebar area-card is-left';

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
        nameSpan.focus();
        const range = document.createRange();
        range.selectNodeContents(nameSpan);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    };
    const endEdit = async (cancel = false) => {
        if (!editState.editing) return;
        weLog.info('project', '→ endEdit 开始', { cancel });
        const newName = cancel ? editState.original : nameSpan.textContent.trim();
        nameSpan.contentEditable = 'false';
        projectNameEl.classList.remove('editing');
        editState.editing = false;
        if (cancel) {
            weLog.debug('project', 'endEdit: 取消编辑，恢复原名');
            nameSpan.textContent = editState.original;
            return;
        }
        if (!newName) {
            weLog.warn('project', 'endEdit: 新名称为空');
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
            // 更新标签页标题
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

    // 在项目名下方显示账户信息
    const accountInfoContainer = document.createElement('div');
    accountInfoContainer.className = 'project-owner-info';

    // 创建者信息
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

    // 当前账户信息（如果与创建者不同则显示）
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

    // 横线分隔项目信息区和文件树区
    const divider = document.createElement('hr');
    divider.className = 'sidebar-divider';
    sidebar.insertBefore(divider, sidebar.children[owner ? 2 : 1] || null);

    // 在项目名右侧添加固定按钮和删除按钮
    const pinProjectBtn = document.createElement('button');
    pinProjectBtn.className = 'btn-pin-project init-hidden';
    pinProjectBtn.title = t('ui.pin_project') || '固定项目';
    pinProjectBtn.innerHTML = `<img class="pin-icon" src="../resources/pin.svg" alt="">`;
    pinProjectBtn.onclick = async () => {
        weLog.info('project', '→ pinProjectBtn 点击', { folder });
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

    // 初始化固定按钮状态（先隐藏，获取后再显示，避免闪烁）
    weAPI.isProjectPinned(folder).then(isPinned => {
        pinProjectBtn.classList.toggle('active', isPinned);
        pinProjectBtn.title = t(isPinned ? 'ui.unpin_project' : 'ui.pin_project') || (isPinned ? '取消固定' : '固定项目');
        pinProjectBtn.classList.remove('init-hidden');
    });

    const addBtn = sidebar.querySelector(`#btn-add-file-${safeId}`);
    addBtn.onclick = () => addFileToProject(safeId);

    const resizer = document.createElement('div');
    resizer.className = 'area-resizer';

    const editorArea = document.createElement('div');
    editorArea.className = 'project-editor area-card is-right';
    editorArea.innerHTML = `
        <div class="quill-wrapper" id="quill-${safeId}"></div>
        <div class="node-graph-embed" id="ng-embed-${safeId}" style="display:none;"></div>
    `;

    // resizer 作为 sidebar 的子元素，CSS left:100% 自动贴右边缘
    // sidebar 的 overflow:visible（CSS）让 resizer 伸入 gap 不被裁剪
    sidebar.appendChild(resizer);
    layout.appendChild(sidebar);
    layout.appendChild(editorArea);

    setupSidebarResizer(resizer, sidebar);
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
    // 状态 1：项目打开后默认进入目录独占模式（文件树 100%），用户点击具体文件后再切完整 TA
    // 若 defaultOpenFirst 开启，则直接进入 TA 模式（手机端始终 only-left）
    if (!defaultOpenFirst || !document.body.classList.contains('is-desktop')) {
        layout.classList.add('only-left');
    }
    weLog.info('project', '← openProjectDirectly 完成', { safeId });
}

/**
 * 切换 TA 布局状态
 * @param {string} safeId - 项目 tab id
 * @param {'ta'|'only-left'} state - 'ta' 完整双栏 / 'only-left' 目录独占
 */
function setTaState(safeId, state) {
    const tab = tabs[safeId];
    if (!tab || !tab.element) return;
    const layout = tab.element.querySelector('.area-root.ta');
    if (!layout) return;
    layout.classList.toggle('only-left', state === 'only-left');
    weLog.debug('project', 'setTaState', { safeId, state });
}
window.setTaState = setTaState;

function setupSidebarResizer(resizer, sidebar) {
    weLog.info('project', '→ setupSidebarResizer 开始');
    let dragging = false;
    let startX = 0;
    let startWidth = 0;

    resizer.addEventListener('mousedown', (e) => {
        dragging = true;
        startX = e.clientX;
        startWidth = sidebar.offsetWidth;
        resizer.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    // TA 百分比拖拽：根据像素偏移换算成 --area-left 百分比写回 .area-root.ta
    // resizer 的位置由 CSS left:100% 自动跟随 sidebar 宽度，无需手动更新
    document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const layout = sidebar.closest('.area-root.ta');
        if (!layout) return;
        const newWidth = Math.max(140, Math.min(500, startWidth + e.clientX - startX));
        const overall = layout.clientWidth - 16;  /* content-box 宽度（减去 padding 16px），百分比 flex-basis 基于此值 */
        if (overall > 0) {
            const percent = Math.round((newWidth / overall) * 100);
            layout.style.setProperty('--area-left', percent);
        }
    });

    document.addEventListener('mouseup', () => {
        if (dragging) {
            dragging = false;
            resizer.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });
}

// ========== 删除项目 ==========
async function deleteProject(safeId) {
    weLog.info('project', '→ deleteProject 开始', { safeId });
    const project = tabs[safeId];
    if (!project || !project.projectPath) {
        weLog.warn('project', 'deleteProject: project 或 projectPath 不存在', { safeId });
        return;
    }

    const projectName = project.title || safeId;
    const projectPath = project.projectPath;

    // 强警告对话框
    const dialog = document.createElement('div');
    dialog.className = 'jump-link-dialog mode-switch-dialog';
    dialog.innerHTML = `
        <div class="dialog-overlay"></div>
        <div class="dialog-box mode-switch-box">
            <div class="warning-icon">⚠</div>
            <h3>${t('ui.delete_project') || '删除项目'}</h3>
            <div class="warning-text">
                ${t('ui.delete_project_warning') || '警告：此操作不可逆！'}
            </div>
            <div class="mode-switch-detail">
                <p class="warning-detail">${(t('ui.delete_project_confirm') || '确定要删除项目「{name}」吗？所有文件和数据将永久丢失。').replace('{name}', projectName)}</p>
                <p class="warning-confirm-text">${t('ui.delete_project_hint') || '项目将被移入回收站，可从回收站恢复。'}</p>
            </div>
            <div class="dialog-actions">
                <button class="btn-cancel">${t('ui.cancel') || '取消'}</button>
                <button class="btn-confirm btn-danger">${t('ui.delete_project_btn') || '确认删除'}</button>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);
    positionDialog(dialog);

    const closeDialog = () => dialog.remove();
    dialog.querySelector('.btn-cancel').onclick = closeDialog;
    dialog.querySelector('.dialog-overlay').onclick = closeDialog;

    dialog.querySelector('.btn-confirm').onclick = async () => {
        closeDialog();
        weLog.info('project', 'deleteProject: 用户确认删除', { projectName, projectPath });
        // 先同步关闭标签页释放文件占用，再删除
        doCloseTab(safeId);
        const result = await weAPI.deleteProject(projectPath);
        if (result.success) {
            weLog.info('project', 'deleteProject: 项目删除成功', { projectName });
            showNotification((t('ui.project_deleted') || '项目已删除') + ': ' + projectName);
            // 刷新最近项目列表
            if (window.refreshRecentProjects) {
                await window.refreshRecentProjects();
            }
        } else {
            weLog.warn('project', 'deleteProject: 项目删除失败', { error: result.error });
            alert((t('ui.delete_failed') || '删除失败') + ': ' + result.error);
        }
    };
}