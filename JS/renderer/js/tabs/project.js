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
                        <div class="owner-display">
                            <span class="owner-avatar">U</span>
                            <span>firefairyZz</span>
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
                        <label>${t('ui.init_label')}</label>
                        <label class="checkbox-option">
                            <input type="checkbox" id="init-readme" checked />
                            ${t('ui.init_readme')}
                        </label>
                        <p class="field-hint">${t('ui.init_readme_hint')}</p>
                        <label class="checkbox-option">
                            <input type="checkbox" id="init-sample" />
                            ${t('ui.init_sample')}
                        </label>
                        <p class="field-hint">${t('ui.init_sample_hint')}</p>
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
        const initReadme = content.querySelector('#init-readme').checked;
        const initSample = content.querySelector('#init-sample').checked;
        try {
            const folder = await weAPI.getDefaultProjectPath(name);
            const result = await weAPI.createProject(folder, name, desc, initReadme, initSample);
            if (result.success) {
                closeTab(id);
                openProjectDirectly({ folder, name, fileList: result.fileList });
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

async function openProjectDirectly({ folder, name, fileList }) {
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
            <button class="search-toggle-btn" id="search-toggle-${safeId}" title="${t('ui.search_placeholder') || 'Search...'}">
                <svg viewBox="0 0 16 16" width="14" height="14"><path fill="none" stroke="currentColor" stroke-width="1.5" d="M7 2a5 5 0 100 10A5 5 0 007 2zm3.5 8.5L14 14"/></svg>
            </button>
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

    if (window.tagModule) {
        await window.tagModule.loadProjectMetadata(safeId, folder);
    }

    refreshFileTree(safeId, fileList);
    setupSearch(safeId);
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