// ========== 新建项目 ==========
function createNewProjectTab() {
    const id = 'new-project';
    if (tabs[id]) { switchTab(id); return; }
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
                </div>
            </div>
            <div class="new-project-footer">
                <button class="btn-cancel" id="create-project-cancel">${t('ui.cancel')}</button>
                <button class="btn-submit" id="create-project-submit">${t('ui.create')}</button>
            </div>
        </div>
    `;
    const nameError = content.querySelector('#name-error');
    content.querySelector('#create-project-submit').onclick = async () => {
        const name = content.querySelector('#new-project-name').value.trim();
        if (!name) {
            nameError.textContent = t('ui.name_required') || 'Project name is required';
            nameError.style.display = 'block';
            return;
        }
        nameError.style.display = 'none';
        const desc = content.querySelector('#new-project-desc').value.trim();
        const template = content.querySelector('input[name="template"]:checked')?.value || 'empty';
        const projectMode = content.querySelector('input[name="project-mode"]:checked')?.value || 'rich';
        try {
            const folder = await weAPI.getDefaultProjectPath(name);
            const result = await weAPI.createProject(folder, name, desc, template, projectMode);
            if (result.success) {
                closeTab(id);
                openProjectDirectly({ folder, name, fileList: result.fileList, projectMode: result.projectMode });
                showNotification(t('ui.project_created') || '项目已创建');
            } else {
                nameError.textContent = (t('ui.create_failed') || 'Create failed') + ': ' + result.error;
                nameError.style.display = 'block';
            }
        } catch (e) {
            nameError.textContent = (t('ui.create_error') || 'Error') + ': ' + e.message;
            nameError.style.display = 'block';
        }
    };
    content.querySelector('#create-project-cancel').onclick = () => closeTab(id);
    addTab(id, t('ui.new_project_tab'), content, true);
    updateOwnerDisplay(currentAccount);
}

// ========== 打开项目 ==========
async function openProject() {
    const folder = await weAPI.selectFolder();
    if (folder) openProjectByPath(folder);
}

async function openProjectByPath(folder) {
    const result = await weAPI.openProject(folder);
    if (!result.success) { showNotification(t('ui.open_failed') + ': ' + result.error); return; }
    openProjectDirectly(result);
    showNotification(t('ui.project_opened') || '项目已打开');
}

async function openProjectDirectly({ folder, name, fileList, projectMode }) {
    const safeId = sanitizeId(folder);
    if (tabs[safeId]) { switchTab(safeId); return; }

    const layout = document.createElement('div');
    layout.className = 'project-layout';

    const sidebar = document.createElement('div');
    sidebar.className = 'project-sidebar';

    const projectNameEl = document.createElement('h3');
    projectNameEl.className = 'project-name-editable';
    projectNameEl.textContent = name;
    projectNameEl.title = t('ui.double_click_rename') || '双击重命名';
    projectNameEl.contentEditable = 'false';
    projectNameEl.spellcheck = false;

    let editState = { editing: false, original: '' };
    const beginEdit = () => {
        if (editState.editing) return;
        editState.editing = true;
        editState.original = projectNameEl.textContent.trim();
        projectNameEl.contentEditable = 'true';
        projectNameEl.classList.add('editing');
        projectNameEl.focus();
        const range = document.createRange();
        range.selectNodeContents(projectNameEl);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    };
    const endEdit = async (cancel = false) => {
        if (!editState.editing) return;
        const newName = cancel ? editState.original : projectNameEl.textContent.trim();
        projectNameEl.contentEditable = 'false';
        projectNameEl.classList.remove('editing');
        editState.editing = false;
        if (cancel) {
            projectNameEl.textContent = editState.original;
            return;
        }
        if (!newName) {
            projectNameEl.textContent = editState.original;
            showNotification(t('ui.name_required') || '名称不能为空');
            return;
        }
        if (newName === editState.original) return;
        const oldPath = tabs[safeId].projectPath;
        const res = await weAPI.renameProject(oldPath, newName);
        if (res.success) {
            tabs[safeId].projectPath = res.newFolder;
            projectNameEl.textContent = newName;
            // 更新标签页标题
            const tabEl = tabs[safeId]?.tabElement;
            if (tabEl) {
                const closeSpan = tabEl.querySelector('.close-tab');
                tabEl.innerHTML = newName + (closeSpan ? ' ' + closeSpan.outerHTML : '');
            }
            if (tabs[safeId]) tabs[safeId].title = newName;
            showNotification(t('ui.renamed') || '已重命名');
        } else {
            projectNameEl.textContent = editState.original;
            showNotification((t('ui.rename_failed') || '重命名失败') + ': ' + (res.error || ''));
        }
    };
    projectNameEl.addEventListener('dblclick', beginEdit);
    projectNameEl.addEventListener('blur', () => endEdit(false));
    projectNameEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); projectNameEl.blur(); }
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
        <div class="file-tree-wrapper" id="file-tree-${safeId}"></div>
        <div class="sidebar-footer">
            <button id="btn-add-file-${safeId}">+ ${t('ui.new_file')}</button>
        </div>
    `;
    sidebar.insertBefore(projectNameEl, sidebar.firstChild);

    // 在项目名右侧添加删除按钮
    const deleteProjectBtn = document.createElement('button');
    deleteProjectBtn.className = 'btn-delete-project';
    deleteProjectBtn.title = t('ui.delete_project') || '删除项目';
    deleteProjectBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14"><path fill="none" stroke="currentColor" stroke-width="1.5" d="M5 7h14M10 7V5a1 1 0 011-1h2a1 1 0 011 1v2M6 7l1 12a1 1 0 001 1h8a1 1 0 001-1l1-12" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    deleteProjectBtn.onclick = () => deleteProject(safeId);
    projectNameEl.appendChild(deleteProjectBtn);

    const addBtn = sidebar.querySelector(`#btn-add-file-${safeId}`);
    addBtn.onclick = () => addFileToProject(safeId);

    const resizer = document.createElement('div');
    resizer.className = 'sidebar-resizer';

    const editorArea = document.createElement('div');
    editorArea.className = 'project-editor';
    editorArea.innerHTML = `<div class="quill-wrapper" id="quill-${safeId}"></div>`;

    layout.appendChild(sidebar);
    layout.appendChild(resizer);
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
    if (fileList.includes('README.txt')) openProjectFile(safeId, 'README.txt');
}

function setupSidebarResizer(resizer, sidebar) {
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

    document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const newWidth = Math.max(140, Math.min(500, startWidth + e.clientX - startX));
        sidebar.style.width = newWidth + 'px';
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
    const project = tabs[safeId];
    if (!project || !project.projectPath) return;

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

    const closeDialog = () => dialog.remove();
    dialog.querySelector('.btn-cancel').onclick = closeDialog;
    dialog.querySelector('.dialog-overlay').onclick = closeDialog;

    dialog.querySelector('.btn-confirm').onclick = async () => {
        closeDialog();
        const result = await weAPI.deleteProject(projectPath);
        if (result.success) {
            closeTab(safeId, true);
            showNotification((t('ui.project_deleted') || '项目已删除') + ': ' + projectName);
        } else {
            alert((t('ui.delete_failed') || '删除失败') + ': ' + result.error);
        }
    };
}