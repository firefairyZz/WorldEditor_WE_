function buildFileTree(files) {
    const root = {};
    for (const file of files) {
        if (file.startsWith('_')) continue;
        // 跳过 .keep 占位文件，但仍会通过路径创建文件夹节点
        if (file.endsWith('/.keep')) {
            const dirPath = file.slice(0, -'/.keep'.length);
            const parts = dirPath.split('/');
            let current = root;
            for (const part of parts) {
                if (!current[part]) current[part] = {};
                current = current[part];
            }
            continue;
        }
        const parts = file.split('/');
        let current = root;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (i === parts.length - 1) {
                if (!current._files) current._files = [];
                current._files.push(part);
            } else {
                if (!current[part]) current[part] = {};
                current = current[part];
            }
        }
    }
    return root;
}

function stripExt(name) {
    const idx = name.lastIndexOf('.');
    return idx > 0 ? name.substring(0, idx) : name;
}

const ARROW_COLLAPSED = '<svg class="tree-arrow-icon" viewBox="0 0 16 16" width="12" height="12"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ARROW_EXPANDED = '<svg class="tree-arrow-icon" viewBox="0 0 16 16" width="12" height="12"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// 文件树拖拽状态
let treeDragData = { path: null, type: null, safeId: null };
const rootDropBound = new WeakSet();

// 排序顺序：'asc' 升序 | 'desc' 降序
let fileSortOrder = 'asc';

// ====== 多选状态 ======
// selectedItems: Map<path, { type: 'file'|'folder', element: HTMLElement }>
const multiSelectState = {
    safeId: null,
    items: new Map(),
    lastClickedPath: null,
    toolbar: null
};

function clearSelection(safeId) {
    weLog.debug('filetree', '→ clearSelection 开始', { safeId });
    if (safeId && multiSelectState.safeId !== safeId) {
        weLog.debug('filetree', 'clearSelection: safeId 不匹配，跳过', { current: multiSelectState.safeId, requested: safeId });
        return;
    }
    multiSelectState.items.forEach(item => {
        item.element.classList.remove('selected');
    });
    multiSelectState.items.clear();
    multiSelectState.lastClickedPath = null;
    hideMultiSelectToolbar();
}

function toggleSelectItem(path, type, element, safeId) {
    weLog.debug('filetree', '→ toggleSelectItem 开始', { path, type, safeId });
    if (multiSelectState.safeId !== safeId) {
        weLog.debug('filetree', 'toggleSelectItem: 切换 safeId 上下文', { old: multiSelectState.safeId, new: safeId });
        clearSelection(multiSelectState.safeId);
        multiSelectState.safeId = safeId;
    }
    if (multiSelectState.items.has(path)) {
        multiSelectState.items.delete(path);
        element.classList.remove('selected');
    } else {
        multiSelectState.items.set(path, { type, element });
        element.classList.add('selected');
    }
    updateMultiSelectToolbar();
}

function selectItem(path, type, element, safeId) {
    weLog.debug('filetree', '→ selectItem 开始', { path, type, safeId });
    if (multiSelectState.safeId !== safeId) {
        weLog.debug('filetree', 'selectItem: 切换 safeId 上下文', { old: multiSelectState.safeId, new: safeId });
        clearSelection(multiSelectState.safeId);
        multiSelectState.safeId = safeId;
    }
    if (!multiSelectState.items.has(path)) {
        multiSelectState.items.set(path, { type, element });
        element.classList.add('selected');
    }
    updateMultiSelectToolbar();
}

function selectRange(path, type, element, safeId, container) {
    weLog.debug('filetree', '→ selectRange 开始', { path, type, safeId });
    if (multiSelectState.safeId !== safeId) {
        weLog.debug('filetree', 'selectRange: 切换 safeId 上下文', { old: multiSelectState.safeId, new: safeId });
        clearSelection(multiSelectState.safeId);
        multiSelectState.safeId = safeId;
    }
    if (!multiSelectState.lastClickedPath) {
        weLog.debug('filetree', 'selectRange: 无上次点击记录，降级为单选');
        selectItem(path, type, element, safeId);
        return;
    }

    // 获取所有可见的文件和文件夹元素
    const allItems = [];
    container.querySelectorAll('.tree-file, .tree-folder-header').forEach(el => {
        if (el.classList.contains('tree-folder-header')) {
            const folderDiv = el.closest('.tree-folder');
            if (folderDiv && folderDiv.parentElement === container) {
                allItems.push(el);
            }
        } else {
            if (el.parentElement === container) {
                allItems.push(el);
            }
        }
    });

    // 找到起始和结束索引
    let startIdx = -1, endIdx = -1;
    for (let i = 0; i < allItems.length; i++) {
        const el = allItems[i];
        const itemPath = el.classList.contains('tree-folder-header')
            ? el.closest('.tree-folder').dataset.folderPath
            : el.dataset.file;
        if (itemPath === multiSelectState.lastClickedPath) startIdx = i;
        if (itemPath === path) endIdx = i;
    }
    if (startIdx === -1 || endIdx === -1) {
        weLog.debug('filetree', 'selectRange: 起止元素未找到，降级为单选', { startIdx, endIdx });
        selectItem(path, type, element, safeId);
        return;
    }
    if (startIdx > endIdx) [startIdx, endIdx] = [endIdx, startIdx];

    // 清除当前选择
    multiSelectState.items.forEach(item => item.element.classList.remove('selected'));
    multiSelectState.items.clear();

    for (let i = startIdx; i <= endIdx; i++) {
        const el = allItems[i];
        if (el.classList.contains('tree-folder-header')) {
            const folderDiv = el.closest('.tree-folder');
            const folderPath = folderDiv.dataset.folderPath;
            multiSelectState.items.set(folderPath, { type: 'folder', element: el });
        } else {
            multiSelectState.items.set(el.dataset.file, { type: 'file', element: el });
        }
        el.classList.add('selected');
    }
    updateMultiSelectToolbar();
}

function selectAllVisible(safeId, container) {
    weLog.info('filetree', '→ selectAllVisible 开始', { safeId });
    if (multiSelectState.safeId !== safeId) {
        weLog.debug('filetree', 'selectAllVisible: 切换 safeId 上下文', { old: multiSelectState.safeId, new: safeId });
        clearSelection(multiSelectState.safeId);
        multiSelectState.safeId = safeId;
    }
    multiSelectState.items.clear();
    // 递归遍历所有可见的文件和文件夹
    function traverse(parent) {
        const children = parent.children;
        for (const child of children) {
            if (child.classList.contains('tree-folder')) {
                const header = child.querySelector(':scope > .tree-folder-header');
                const content = child.querySelector(':scope > .tree-folder-content');
                if (header) {
                    const folderPath = child.dataset.folderPath;
                    if (folderPath) {
                        multiSelectState.items.set(folderPath, { type: 'folder', element: header });
                        header.classList.add('selected');
                    }
                }
                if (content && content.style.display !== 'none') {
                    traverse(content);
                }
            } else if (child.classList.contains('tree-file')) {
                const filePath = child.dataset.file;
                if (filePath) {
                    multiSelectState.items.set(filePath, { type: 'file', element: child });
                    child.classList.add('selected');
                }
            }
        }
    }
    traverse(container);
    updateMultiSelectToolbar();
}

function hideMultiSelectToolbar() {
    weLog.debug('filetree', '→ hideMultiSelectToolbar 开始', { hasToolbar: !!multiSelectState.toolbar });
    if (multiSelectState.toolbar) {
        multiSelectState.toolbar.remove();
        multiSelectState.toolbar = null;
    }
}

function updateMultiSelectToolbar() {
    const count = multiSelectState.items.size;
    if (count === 0) {
        weLog.debug('filetree', 'updateMultiSelectToolbar: 选中数为0，隐藏工具栏');
        hideMultiSelectToolbar();
        return;
    }
    if (!multiSelectState.toolbar) {
        multiSelectState.toolbar = document.createElement('div');
        multiSelectState.toolbar.className = 'multi-select-toolbar';
        document.body.appendChild(multiSelectState.toolbar);
    }
    const safeId = multiSelectState.safeId;
    const projectPath = tabs[safeId]?.projectPath;

    multiSelectState.toolbar.innerHTML = `
        <span class="multi-select-count">${count} ${t('ui.items_selected') || '项已选'}</span>
        <button class="multi-select-btn" data-action="tag">${t('ui.batch_tag') || '批量加标签'}</button>
        <button class="multi-select-btn" data-action="remove-tag">${t('ui.batch_remove_tag') || '批量删标签'}</button>
        <button class="multi-select-btn multi-select-danger" data-action="delete">${t('ui.delete') || '删除'}</button>
        <button class="multi-select-btn" data-action="cancel">✕</button>
    `;

    // 定位工具栏
    const treeContainer = document.getElementById(`file-tree-${safeId}`);
    if (treeContainer) {
        const rect = treeContainer.getBoundingClientRect();
        multiSelectState.toolbar.style.left = rect.left + 'px';
        multiSelectState.toolbar.style.top = (rect.bottom - 40) + 'px';
        multiSelectState.toolbar.style.width = rect.width + 'px';
    }

    multiSelectState.toolbar.querySelector('[data-action="tag"]').onclick = () => batchAddTags(safeId, projectPath);
    multiSelectState.toolbar.querySelector('[data-action="remove-tag"]').onclick = () => batchRemoveTags(safeId, projectPath);
    multiSelectState.toolbar.querySelector('[data-action="delete"]').onclick = () => batchDelete(safeId, projectPath);
    multiSelectState.toolbar.querySelector('[data-action="cancel"]').onclick = () => clearSelection(safeId);
}

async function batchAddTags(safeId, projectPath) {
    weLog.info('filetree', '→ batchAddTags 开始', { safeId, projectPath, count: multiSelectState.items.size });
    if (!projectPath || multiSelectState.items.size === 0) {
        weLog.warn('filetree', 'batchAddTags: projectPath 为空或无选中项，跳过', { projectPath, count: multiSelectState.items.size });
        return;
    }
    const paths = Array.from(multiSelectState.items.keys());
    window.tagModule.openTagPicker(paths[0], async (tag) => {
        // 对所有选中项应用相同标签
        for (const path of paths) {
            await window.tagModule.addTag(path, tag.label, tag.color, tag.emoji);
        }
        refreshFileTree(safeId, tabs[safeId].fileList);
        clearSelection(safeId);
        showNotification(`${t('ui.tags_added') || '已添加标签'} (${paths.length})`);
    });
}

function batchRemoveTags(safeId, projectPath) {
    weLog.info('filetree', '→ batchRemoveTags 开始', { safeId, projectPath, count: multiSelectState.items.size });
    if (!projectPath || multiSelectState.items.size === 0) {
        weLog.warn('filetree', 'batchRemoveTags: projectPath 为空或无选中项，跳过', { projectPath, count: multiSelectState.items.size });
        return;
    }
    const paths = Array.from(multiSelectState.items.keys());

    // 收集所有选中项的标签（去重）
    const tagMap = new Map(); // tagKey -> { tag, count }
    for (const p of paths) {
        const tags = window.tagModule?.getTagsForFile(p) || [];
        for (const tag of tags) {
            const key = `${tag.label}|${tag.color}|${tag.emoji}`;
            if (tagMap.has(key)) {
                tagMap.get(key).count++;
            } else {
                tagMap.set(key, { tag, count: 1 });
            }
        }
    }

    if (tagMap.size === 0) {
        weLog.info('filetree', 'batchRemoveTags: 选中项没有标签可删除');
        showNotification(t('ui.no_tags_to_remove') || '选中项没有标签');
        return;
    }

    // 创建选择面板
    const overlay = document.createElement('div');
    overlay.className = 'tag-picker-overlay';
    overlay.innerHTML = `<div class="tag-picker" style="max-width: 360px;">
        <div class="tag-picker-header">
            <h3>${t('ui.batch_remove_tag') || '批量删标签'}</h3>
            <button class="tag-picker-close" type="button">×</button>
        </div>
        <div class="tag-picker-body">
            <p style="font-size:12px;color:var(--text-sec);margin-bottom:8px;">${paths.length} ${t('ui.items') || '项'} — ${t('ui.select_tags_to_remove') || '选择要删除的标签'}</p>
            <div class="batch-remove-tag-list"></div>
        </div>
        <div class="tag-actions">
            <button class="btn-cancel" type="button">${t('ui.cancel')}</button>
            <button class="btn-save" type="button">${t('ui.delete') || '删除'}</button>
        </div>
    </div>`;
    document.body.appendChild(overlay);

    const listEl = overlay.querySelector('.batch-remove-tag-list');
    const selectedTagIds = new Set();

    for (const [key, { tag, count }] of tagMap) {
        const item = document.createElement('div');
        item.className = 'batch-remove-tag-item';
        item.innerHTML = `
            <span class="tag-item" style="background-color:${tag.color}">
                <span class="tag-emoji">${tag.emoji || ''}</span>
                <span class="tag-label">${tag.label || ''}</span>
            </span>
            <span style="font-size:11px;color:var(--text-sec);">${count}/${paths.length}</span>
        `;
        item.onclick = () => {
            if (selectedTagIds.has(key)) {
                selectedTagIds.delete(key);
                item.classList.remove('selected');
            } else {
                selectedTagIds.add(key);
                item.classList.add('selected');
            }
        };
        listEl.appendChild(item);
    }

    const closeOverlay = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) closeOverlay(); };
    overlay.querySelector('.tag-picker-close').onclick = closeOverlay;
    overlay.querySelector('.btn-cancel').onclick = closeOverlay;
    overlay.querySelector('.btn-save').onclick = async () => {
        if (selectedTagIds.size === 0) { closeOverlay(); return; }
        let removed = 0;
        for (const p of paths) {
            const tags = window.tagModule?.getTagsForFile(p) || [];
            for (const tag of tags) {
                const key = `${tag.label}|${tag.color}|${tag.emoji}`;
                if (selectedTagIds.has(key)) {
                    await window.tagModule.removeTag(p, tag.id);
                    removed++;
                }
            }
        }
        refreshFileTree(safeId, tabs[safeId].fileList);
        clearSelection(safeId);
        showNotification(`${t('ui.tags_removed') || '已删除标签'} (${removed})`);
    };
}

async function batchDelete(safeId, projectPath) {
    weLog.info('filetree', '→ batchDelete 开始', { safeId, projectPath, count: multiSelectState.items.size });
    if (!projectPath || multiSelectState.items.size === 0) {
        weLog.warn('filetree', 'batchDelete: projectPath 为空或无选中项，跳过', { projectPath, count: multiSelectState.items.size });
        return;
    }
    const count = multiSelectState.items.size;
    const ok = confirm((t('ui.batch_delete_confirm') || '确定删除选中的') + ` ${count} ` + (t('ui.items') || '项') + '?');
    if (!ok) {
        weLog.info('filetree', 'batchDelete: 用户取消删除');
        return;
    }

    let successCount = 0;
    let lastFileList = tabs[safeId].fileList;
    for (const [path, item] of multiSelectState.items) {
        try {
            if (item.type === 'file') {
                const res = await weAPI.deleteFile(projectPath, path);
                if (res.success) {
                    successCount++;
                    lastFileList = res.fileList;
                    if (tabs[safeId].currentFile === path) {
                        tabs[safeId].currentFile = null;
                        if (quill) quill.setText('');
                    }
                }
            } else {
                const res = await weAPI.deleteFolder(projectPath, path);
                if (res.success) {
                    successCount++;
                    lastFileList = res.fileList;
                    if (tabs[safeId].currentFile && tabs[safeId].currentFile.startsWith(path + '/')) {
                        tabs[safeId].currentFile = null;
                        if (quill) quill.setText('');
                    }
                }
            }
        } catch (e) {
            weLog.error('filetree', 'batchDelete: 单项删除失败', e && e.stack ? e.stack : String(e));
        }
    }

    tabs[safeId].fileList = lastFileList;
    refreshFileTree(safeId, tabs[safeId].fileList);
    clearSelection(safeId);
    showNotification(`${t('ui.deleted') || '已删除'} ${successCount}/${count}`);
    weLog.info('filetree', '← batchDelete 完成', { successCount, total: count });
}

function renderTreeNodes(container, tree, basePath = '') {
    const folders = Object.keys(tree).filter(k => k !== '_files');
    folders.sort();
    if (fileSortOrder === 'desc') folders.reverse();
    for (const folder of folders) {
        const folderPath = basePath ? `${basePath}/${folder}` : folder;
        const folderDiv = document.createElement('div');
        folderDiv.className = 'tree-folder';
        folderDiv.dataset.folderPath = folderPath;
        const header = document.createElement('div');
        header.className = 'tree-folder-header';
        // 显示文件夹标签
        const folderTags = window.tagModule?.getTagsForFile(folderPath) || [];
        const folderTagsHtml = folderTags.length > 0
            ? '<span class="file-tags">' + folderTags.map(tag =>
                `<span class="mini-tag" style="background-color:${tag.color}" title="${tag.label}">${tag.emoji || ''}${tag.label ? ' ' + tag.label : ''}</span>`
              ).join('') + '</span>'
            : '';
        header.innerHTML = `<span class="tree-arrow">${ARROW_COLLAPSED}</span><span class="folder-name">${folder}</span>${folderTagsHtml}`;
        header.onclick = (e) => {
            // Ctrl+点击 = 切换多选
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                e.stopPropagation();
                toggleSelectItem(folderPath, 'folder', header, container.closest('[id^="file-tree-"]').id.replace('file-tree-', ''));
                multiSelectState.lastClickedPath = folderPath;
                return;
            }
            // Shift+点击 = 范围选择
            if (e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                const sid = container.closest('[id^="file-tree-"]').id.replace('file-tree-', '');
                selectRange(folderPath, 'folder', header, sid, container);
                return;
            }
            const content = folderDiv.querySelector('.tree-folder-content');
            const arrow = header.querySelector('.tree-arrow');
            if (content.style.display === 'none') {
                content.style.display = 'block';
                arrow.innerHTML = ARROW_EXPANDED;
            } else {
                content.style.display = 'none';
                arrow.innerHTML = ARROW_COLLAPSED;
            }
        };
        const content = document.createElement('div');
        content.className = 'tree-folder-content';
        content.style.display = 'none';
        renderTreeNodes(content, tree[folder], folderPath);

        // 文件夹右键菜单
        header.oncontextmenu = (e) => {
            e.preventDefault();
            showFolderContextMenu(e, folderPath, container);
        };

        // 文件夹可拖拽（移动）
        header.draggable = true;
        header.addEventListener('dragstart', (e) => {
            const sid = container.closest('[id^="file-tree-"]').id.replace('file-tree-', '');
            treeDragData = { path: folderPath, type: 'folder', safeId: sid };
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', folderPath);
            header.classList.add('dragging');
            e.stopPropagation();
        });
        header.addEventListener('dragend', () => {
            header.classList.remove('dragging');
            treeDragData = { path: null, type: null, safeId: null };
        });

        // 文件夹作为 drop 目标
        header.addEventListener('dragover', (e) => {
            if (!treeDragData.path) return;
            const sid = container.closest('[id^="file-tree-"]').id.replace('file-tree-', '');
            if (treeDragData.safeId !== sid) return;
            // 防止文件夹拖到自身或子文件夹
            if (treeDragData.type === 'folder') {
                if (treeDragData.path === folderPath) return;
                if (folderPath.startsWith(treeDragData.path + '/')) return;
            }
            e.preventDefault();
            e.stopPropagation();
            header.classList.add('drag-over');
        });
        header.addEventListener('dragleave', () => {
            header.classList.remove('drag-over');
        });
        header.addEventListener('drop', (e) => {
            if (!treeDragData.path) return;
            e.preventDefault();
            e.stopPropagation();
            header.classList.remove('drag-over');

            const sid = container.closest('[id^="file-tree-"]').id.replace('file-tree-', '');
            if (treeDragData.safeId !== sid) return;

            const project = tabs[sid];
            if (!project) return;

            handleTreeDrop(treeDragData, folderPath, sid, project.projectPath);
            treeDragData = { path: null, type: null, safeId: null };
        });

        folderDiv.appendChild(header);
        folderDiv.appendChild(content);
        container.appendChild(folderDiv);
    }
    const files = tree._files || [];
    files.sort();
    if (fileSortOrder === 'desc') files.reverse();
    for (const file of files) {
        const filePath = basePath ? `${basePath}/${file}` : file;
        const fileDiv = document.createElement('div');
        fileDiv.className = 'tree-file';
        fileDiv.dataset.file = filePath;

        const thumb = window.tagModule?.getThumbnail(filePath);
        const tags = window.tagModule?.getTagsForFile(filePath) || [];

        let thumbHtml = '';
        if (thumb) {
            thumbHtml = `<span class="file-thumb"><img src="${thumb}" /></span>`;
        }
        let tagsHtml = '';
        if (tags.length > 0) {
            tagsHtml = '<span class="file-tags">' + tags.map(tag =>
                `<span class="mini-tag" style="background-color:${tag.color}" title="${tag.label}">${tag.emoji || ''}${tag.label ? ' ' + tag.label : ''}</span>`
            ).join('') + '</span>';
        }

        fileDiv.innerHTML = `${thumbHtml}<span class="file-name">${stripExt(file)}</span>${tagsHtml}`;
        fileDiv.onclick = (e) => {
            e.stopPropagation();
            const safeId = container.closest('[id^="file-tree-"]').id.replace('file-tree-', '');
            // Ctrl+点击 = 切换多选
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                toggleSelectItem(filePath, 'file', fileDiv, safeId);
                multiSelectState.lastClickedPath = filePath;
                return;
            }
            // Shift+点击 = 范围选择
            if (e.shiftKey) {
                e.preventDefault();
                selectRange(filePath, 'file', fileDiv, safeId, container);
                return;
            }
            // 普通点击 = 清除多选，打开文件
            if (multiSelectState.items.size > 0) {
                clearSelection(safeId);
            }
            openProjectFile(safeId, filePath);
        };

        fileDiv.oncontextmenu = (e) => {
            e.preventDefault();
            showFileContextMenu(e, filePath, container);
        };

        // 文件可拖拽（移动）
        fileDiv.draggable = true;
        fileDiv.addEventListener('dragstart', (e) => {
            const sid = container.closest('[id^="file-tree-"]').id.replace('file-tree-', '');
            treeDragData = { path: filePath, type: 'file', safeId: sid };
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', filePath);
            fileDiv.classList.add('dragging');
            e.stopPropagation();
        });
        fileDiv.addEventListener('dragend', () => {
            fileDiv.classList.remove('dragging');
            treeDragData = { path: null, type: null, safeId: null };
        });

        // 文件也作为 drop 目标（移动到该文件所在文件夹）
        fileDiv.addEventListener('dragover', (e) => {
            if (!treeDragData.path) return;
            const sid = container.closest('[id^="file-tree-"]').id.replace('file-tree-', '');
            if (treeDragData.safeId !== sid) return;
            if (treeDragData.path === filePath) return; // 不能拖到自己上
            e.preventDefault();
            e.stopPropagation();
            fileDiv.classList.add('drag-over-file');
        });
        fileDiv.addEventListener('dragleave', () => {
            fileDiv.classList.remove('drag-over-file');
        });
        fileDiv.addEventListener('drop', (e) => {
            if (!treeDragData.path) return;
            e.preventDefault();
            e.stopPropagation();
            fileDiv.classList.remove('drag-over-file');

            const sid = container.closest('[id^="file-tree-"]').id.replace('file-tree-', '');
            if (treeDragData.safeId !== sid) return;

            const project = tabs[sid];
            if (!project) return;

            // 目标文件夹 = 该文件所在的文件夹
            const targetFolder = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : '';
            handleTreeDrop(treeDragData, targetFolder, sid, project.projectPath);
            treeDragData = { path: null, type: null, safeId: null };
        });

        container.appendChild(fileDiv);
    }
}

// 处理文件树内拖拽移动
async function handleTreeDrop(dragData, targetFolder, safeId, projectPath) {
    weLog.info('filetree', '→ handleTreeDrop 开始', { sourcePath: dragData.path, type: dragData.type, targetFolder, safeId });
    const sourcePath = dragData.path;
    const name = sourcePath.split('/').pop();
    const newPath = targetFolder ? `${targetFolder}/${name}` : name;

    if (sourcePath === newPath) {
        weLog.debug('filetree', 'handleTreeDrop: 源路径与目标路径相同，跳过', { sourcePath, newPath });
        return;
    }

    if (dragData.type === 'file') {
        const res = await weAPI.renameFile(projectPath, sourcePath, newPath);
        if (res.success) {
            tabs[safeId].fileList = res.fileList;
            refreshFileTree(safeId, res.fileList);
            showNotification(t('ui.file_moved') || '文件已移动');
        } else {
            showNotification((t('ui.move_failed') || '移动失败') + ': ' + (res.error || ''));
        }
    } else if (dragData.type === 'folder') {
        weLog.info('filetree', 'handleTreeDrop: 走了文件夹移动分支', { sourcePath, newPath });
        const res = await weAPI.renameFolder(projectPath, sourcePath, newPath);
        if (res.success) {
            // 关闭已打开的子文件（路径变化）
            if (tabs[safeId].currentFile && tabs[safeId].currentFile.startsWith(sourcePath + '/')) {
                tabs[safeId].currentFile = null;
                if (quill) { quill.setText(''); }
            }
            tabs[safeId].fileList = res.fileList;
            refreshFileTree(safeId, res.fileList);
            showNotification(t('ui.folder_moved') || '文件夹已移动');
        } else {
            showNotification((t('ui.move_failed') || '移动失败') + ': ' + (res.error || ''));
        }
    }
}

function positionContextMenu(menu, e) {
    weLog.debug('filetree', '→ positionContextMenu 开始', { x: e.clientX, y: e.clientY });
    document.body.appendChild(menu);
    const x = Math.min(e.clientX, window.innerWidth - menu.offsetWidth - 10);
    const y = Math.min(e.clientY, window.innerHeight - menu.offsetHeight - 10);
    menu.style.left = Math.max(0, x) + 'px';
    menu.style.top = Math.max(0, y) + 'px';
    const closeMenu = (ev) => {
        if (!menu.contains(ev.target)) {
            menu.remove();
            document.removeEventListener('click', closeMenu);
        }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 10);
}

function showFileContextMenu(e, filePath, container) {
    weLog.info('filetree', '→ showFileContextMenu 开始', { filePath });
    const existing = document.getElementById('file-context-menu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.id = 'file-context-menu';
    menu.className = 'context-menu';

    const safeId = container.closest('[id^="file-tree-"]').id.replace('file-tree-', '');
    const projectPath = tabs[safeId]?.projectPath;
    const fileName = filePath.split('/').pop();
    const displayName = stripExt(fileName);
    const dirPart = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : '';

    const tagItem = document.createElement('div');
    tagItem.className = 'context-item';
    tagItem.textContent = t('ui.manage_tags') || '管理标签';
    tagItem.onclick = () => { menu.remove(); openTagManager(filePath, container); };

    const thumbItem = document.createElement('div');
    thumbItem.className = 'context-item';
    thumbItem.textContent = t('ui.manage_thumbnail') || '管理缩略图';
    thumbItem.onclick = () => { menu.remove(); openThumbnailManager(filePath, container); };

    const renameItem = document.createElement('div');
    renameItem.className = 'context-item';
    renameItem.textContent = t('ui.rename') || '重命名';
    renameItem.onclick = async () => {
        menu.remove();
        const result = await showPrompt(t('ui.rename') || '重命名', displayName);
        if (!result) return;
        const newName = result.trim();
        if (!newName || newName === displayName) return;
        const newFileName = newName + (fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')) : '');
        const newPath = dirPart ? dirPart + '/' + newFileName : newFileName;
        const res = await weAPI.renameFile(projectPath, filePath, newPath);
        if (res.success) {
            tabs[safeId].fileList = res.fileList;
            refreshFileTree(safeId, res.fileList);
            showNotification(t('ui.renamed') || '已重命名');
        } else {
            showNotification((t('ui.rename_failed') || '重命名失败') + ': ' + (res.error || ''));
        }
    };

    const deleteItem = document.createElement('div');
    deleteItem.className = 'context-item context-item-danger';
    deleteItem.textContent = t('ui.delete') || '删除';
    deleteItem.onclick = async () => {
        menu.remove();
        const ok = confirm((t('ui.delete_confirm') || '确定删除') + ' "' + displayName + '" ?');
        if (!ok) return;
        const res = await weAPI.deleteFile(projectPath, filePath);
        if (res.success) {
            // 若当前已打开该文件，关闭标签
            if (tabs[safeId].currentFile === filePath) {
                tabs[safeId].currentFile = null;
                if (quill) { quill.setText(''); }
            }
            tabs[safeId].fileList = res.fileList;
            refreshFileTree(safeId, res.fileList);
            showNotification(t('ui.deleted') || '已删除');
        } else {
            showNotification((t('ui.delete_failed') || '删除失败') + ': ' + (res.error || ''));
        }
    };

    menu.appendChild(tagItem);
    menu.appendChild(thumbItem);
    menu.appendChild(document.createElement('div')).className = 'context-sep';
    menu.appendChild(renameItem);
    menu.appendChild(deleteItem);

    positionContextMenu(menu, e);
}

function showFolderContextMenu(e, folderPath, container) {
    weLog.info('filetree', '→ showFolderContextMenu 开始', { folderPath });
    const existing = document.getElementById('file-context-menu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.id = 'file-context-menu';
    menu.className = 'context-menu';

    const safeId = container.closest('[id^="file-tree-"]').id.replace('file-tree-', '');
    const projectPath = tabs[safeId]?.projectPath;
    const folderName = folderPath.split('/').pop();

    const tagItem = document.createElement('div');
    tagItem.className = 'context-item';
    tagItem.textContent = t('ui.manage_tags') || '管理标签';
    tagItem.onclick = () => { menu.remove(); openTagManager(folderPath, container); };

    const renameItem = document.createElement('div');
    renameItem.className = 'context-item';
    renameItem.textContent = t('ui.rename') || '重命名';
    renameItem.onclick = async () => {
        menu.remove();
        const result = await showPrompt(t('ui.rename') || '重命名', folderName);
        if (!result) return;
        const newName = result.trim();
        if (!newName || newName === folderName) return;
        const newFolderPath = folderPath.includes('/') ? folderPath.substring(0, folderPath.lastIndexOf('/')) + '/' + newName : newName;
        const res = await weAPI.renameFolder(projectPath, folderPath, newFolderPath);
        if (res.success) {
            // 关闭已打开的子文件（因为路径变化）
            if (tabs[safeId].currentFile && (tabs[safeId].currentFile === folderPath || tabs[safeId].currentFile.startsWith(folderPath + '/'))) {
                tabs[safeId].currentFile = null;
                if (quill) { quill.setText(''); }
            }
            tabs[safeId].fileList = res.fileList;
            refreshFileTree(safeId, res.fileList);
            showNotification(t('ui.renamed') || '已重命名');
        } else {
            showNotification((t('ui.rename_failed') || '重命名失败') + ': ' + (res.error || ''));
        }
    };

    const deleteItem = document.createElement('div');
    deleteItem.className = 'context-item context-item-danger';
    deleteItem.textContent = t('ui.delete') || '删除';
    deleteItem.onclick = async () => {
        menu.remove();
        const ok = confirm((t('ui.delete_confirm') || '确定删除文件夹') + ' "' + folderName + '" ' + (t('ui.delete_warning') || '及其所有内容？') + '');
        if (!ok) return;
        const res = await weAPI.deleteFolder(projectPath, folderPath);
        if (res.success) {
            if (tabs[safeId].currentFile && tabs[safeId].currentFile.startsWith(folderPath + '/')) {
                tabs[safeId].currentFile = null;
                if (quill) { quill.setText(''); }
            }
            tabs[safeId].fileList = res.fileList;
            refreshFileTree(safeId, res.fileList);
            showNotification(t('ui.deleted') || '已删除');
        } else {
            showNotification((t('ui.delete_failed') || '删除失败') + ': ' + (res.error || ''));
        }
    };

    menu.appendChild(tagItem);
    menu.appendChild(document.createElement('div')).className = 'context-sep';
    menu.appendChild(renameItem);
    menu.appendChild(deleteItem);

    positionContextMenu(menu, e);
}

function openTagManager(filePath, container) {
    const existing = document.getElementById('tag-manager-panel');
    if (existing) existing.remove();

    const panel = document.createElement('div');
    panel.id = 'tag-manager-panel';
    panel.className = 'tag-manager-panel';

    const safeId = container.closest('[id^="file-tree-"]').id.replace('file-tree-', '');
    const fileDiv = container.querySelector(`[data-file="${filePath.replace(/"/g, '\\"')}"]`);

    const header = document.createElement('div');
    header.className = 'tag-manager-header';
    header.innerHTML = `<span class="tag-manager-title">${t('ui.manage_tags') || 'Manage Tags'}: ${stripExt(filePath.split('/').pop())}</span><button class="close-btn">✕</button>`;
    panel.appendChild(header);

    const tagsContainer = document.createElement('div');
    tagsContainer.className = 'tags-container';
    const tags = window.tagModule?.getTagsForFile(filePath) || [];
    tags.forEach(tag => {
        const tagEl = document.createElement('span');
        tagEl.className = 'tag-item';
        tagEl.style.backgroundColor = tag.color;
        tagEl.innerHTML = `<span class="tag-emoji">${tag.emoji || ''}</span><span class="tag-label">${tag.label}</span><span class="tag-remove">✕</span>`;
        tagEl.querySelector('.tag-remove').onclick = async () => {
            await window.tagModule.removeTag(filePath, tag.id);
            refreshFileTree(safeId, tabs[safeId].fileList);
            panel.remove();
        };
        tagsContainer.appendChild(tagEl);
    });
    panel.appendChild(tagsContainer);

    const addBtn = document.createElement('button');
    addBtn.className = 'tag-add-large';
    addBtn.textContent = '+ ' + (t('ui.add_tag') || 'Add Tag');
    addBtn.onclick = () => {
        window.tagModule.openTagPicker(filePath, () => {
            refreshFileTree(safeId, tabs[safeId].fileList);
            panel.remove();
        });
        panel.remove();
    };
    panel.appendChild(addBtn);

    header.querySelector('.close-btn').onclick = () => panel.remove();

    if (fileDiv) {
        const rect = fileDiv.getBoundingClientRect();
        panel.style.position = 'fixed';
        let left = rect.right + 10;
        let top = rect.top;
        if (left + 240 > window.innerWidth) left = rect.left - 250;
        if (left < 0) left = 10;
        if (top + 200 > window.innerHeight) top = window.innerHeight - 210;
        if (top < 0) top = 10;
        panel.style.left = left + 'px';
        panel.style.top = top + 'px';
    } else {
        panel.style.position = 'fixed';
        panel.style.right = '20px';
        panel.style.top = '80px';
    }

    document.body.appendChild(panel);
}

function openThumbnailManager(filePath, container) {
    weLog.info('filetree', '→ openThumbnailManager 开始', { filePath });
    const safeId = container.closest('[id^="file-tree-"]').id.replace('file-tree-', '');
    window.tagModule.openThumbnailPicker(filePath, () => {
        refreshFileTree(safeId, tabs[safeId].fileList);
    });
}

function refreshFileTree(safeId, files) {
    weLog.info('filetree', '→ refreshFileTree 开始', { safeId, fileCount: files ? files.length : 0 });
    const treeContainer = document.getElementById(`file-tree-${safeId}`);
    if (!treeContainer) {
        weLog.warn('filetree', 'refreshFileTree: treeContainer 元素不存在', { safeId });
        return;
    }
    treeContainer.innerHTML = '';
    // 清除多选状态
    if (multiSelectState.safeId === safeId) clearSelection(safeId);
    const tree = buildFileTree(files);
    renderTreeNodes(treeContainer, tree);

    // 点击空白区域清除选择
    treeContainer.onclick = (e) => {
        if (e.target === treeContainer) {
            clearSelection(safeId);
        }
    };

    // Ctrl+A 全选（在文件树内）
    treeContainer.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
            e.preventDefault();
            selectAllVisible(safeId, treeContainer);
        }
        if (e.key === 'Escape') {
            clearSelection(safeId);
        }
    });

    // 根容器作为 drop 目标（拖到根目录），只绑定一次
    if (!rootDropBound.has(treeContainer)) {
        rootDropBound.add(treeContainer);
        treeContainer.addEventListener('dragover', (e) => {
            if (!treeDragData.path) return;
            // 如果鼠标在文件夹 header 上，由 header 处理
            if (e.target.closest('.tree-folder-header')) return;
            const sid = treeContainer.id.replace('file-tree-', '');
            if (treeDragData.safeId !== sid) return;
            e.preventDefault();
            e.stopPropagation();
        });
        treeContainer.addEventListener('drop', (e) => {
            if (!treeDragData.path) return;
            if (e.target.closest('.tree-folder-header')) return;
            const sid = treeContainer.id.replace('file-tree-', '');
            if (treeDragData.safeId !== sid) return;
            e.preventDefault();
            e.stopPropagation();

            const project = tabs[sid];
            if (!project) return;

            handleTreeDrop(treeDragData, '', sid, project.projectPath);
            treeDragData = { path: null, type: null, safeId: null };
        });
    }
}

// 排序切换
function setupSortToggle(safeId) {
    const btn = document.getElementById(`sort-toggle-${safeId}`);
    if (!btn) return;

    // 同步当前排序状态到按钮图标
    updateSortButtonIcon(btn);

    btn.addEventListener('click', () => {
        fileSortOrder = fileSortOrder === 'asc' ? 'desc' : 'asc';
        updateSortButtonIcon(btn);

        // 刷新所有项目的文件树
        for (const sid in tabs) {
            if (tabs[sid].fileList) {
                refreshFileTree(sid, tabs[sid].fileList);
                // 同步其他按钮图标
                const otherBtn = document.getElementById(`sort-toggle-${sid}`);
                if (otherBtn && otherBtn !== btn) updateSortButtonIcon(otherBtn);
            }
        }
    });
}

function updateSortButtonIcon(btn) {
    weLog.debug('filetree', '→ updateSortButtonIcon 开始', { fileSortOrder });
    if (fileSortOrder === 'asc') {
        btn.title = t('ui.sort_asc') || '升序（点击切换为降序）';
        btn.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14"><path fill="none" stroke="currentColor" stroke-width="1.5" d="M3 4l5-2 5 2M5 6v6m3-6v6m3-6v6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    } else {
        btn.title = t('ui.sort_desc') || '降序（点击切换为升序）';
        btn.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14"><path fill="none" stroke="currentColor" stroke-width="1.5" d="M3 12l5 2 5-2M5 10V4m3 6V4m3 6V4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }
}

// ====== 搜索功能 ======
const searchState = {};

// 通配符/模糊匹配
function matchQuery(text, query) {
    if (!query) return { match: true, score: 0 };
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();

    // 通配符模式
    if (lowerQuery.includes('*') || lowerQuery.includes('?')) {
        const pattern = lowerQuery
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.');
        const regex = new RegExp(pattern);
        return regex.test(lowerText) ? { match: true, score: 50 } : { match: false, score: 0 };
    }

    // 精确连续匹配（优先）
    const idx = lowerText.indexOf(lowerQuery);
    if (idx !== -1) return { match: true, score: 100 - Math.min(idx, 50) };

    // 模糊匹配：query 每个字符按顺序出现在 text 中
    let qi = 0, lastPos = -1, gapBonus = 0;
    for (let i = 0; i < lowerText.length && qi < lowerQuery.length; i++) {
        if (lowerText[i] === lowerQuery[qi]) {
            if (lastPos >= 0 && i - lastPos > 1) gapBonus -= (i - lastPos - 1);
            lastPos = i;
            qi++;
        }
    }
    if (qi === lowerQuery.length) {
        return { match: true, score: 30 + gapBonus };
    }
    return { match: false, score: 0 };
}

function setupSearch(safeId) {
    weLog.info('filetree', '→ setupSearch 开始', { safeId });
    const input = document.getElementById(`search-input-${safeId}`);
    const clearBtn = document.getElementById(`search-clear-${safeId}`);
    const filters = document.getElementById(`search-filters-${safeId}`);
    const toggleBtn = document.getElementById(`search-toggle-${safeId}`);
    const searchBody = document.getElementById(`search-body-${safeId}`);
    if (!input || !filters) {
        weLog.warn('filetree', 'setupSearch: input 或 filters 元素不存在', { safeId, hasInput: !!input, hasFilters: !!filters });
        return;
    }

    searchState[safeId] = { query: '', types: new Set(['file', 'folder', 'tag', 'content']), contentCache: null };

    // 默认折叠搜索栏
    if (toggleBtn && searchBody) {
        searchBody.style.display = 'none';
        toggleBtn.classList.add('collapsed');
        toggleBtn.title = t('ui.search_expand') || '展开搜索';
    }

    // 折叠/展开整个搜索框
    if (toggleBtn && searchBody) {
        toggleBtn.addEventListener('click', () => {
            if (searchBody.style.display === 'none') {
                searchBody.style.display = '';
                toggleBtn.classList.remove('collapsed');
                toggleBtn.title = t('ui.search_placeholder') || '搜索...';
            } else {
                searchBody.style.display = 'none';
                toggleBtn.classList.add('collapsed');
                toggleBtn.title = t('ui.search_expand') || '展开搜索';
                // 清除搜索状态
                input.value = '';
                searchState[safeId].query = '';
                clearBtn.style.display = 'none';
                executeSearch(safeId);
            }
        });
    }

    let debounceTimer = null;
    input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            searchState[safeId].query = input.value.trim();
            clearBtn.style.display = input.value ? 'block' : 'none';
            executeSearch(safeId);
        }, 200);
    });

    clearBtn.addEventListener('click', () => {
        input.value = '';
        searchState[safeId].query = '';
        clearBtn.style.display = 'none';
        executeSearch(safeId);
        input.focus();
    });

    // toggle 按钮
    filters.querySelectorAll('.search-filter-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.type;
            if (btn.classList.contains('active')) {
                btn.classList.remove('active');
                searchState[safeId].types.delete(type);
            } else {
                btn.classList.add('active');
                searchState[safeId].types.add(type);
            }
            executeSearch(safeId);
        });
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            input.value = '';
            searchState[safeId].query = '';
            clearBtn.style.display = 'none';
            executeSearch(safeId);
        }
    });
}

async function executeSearch(safeId) {
    weLog.debug('filetree', '→ executeSearch 开始', { safeId, query: searchState[safeId] ? searchState[safeId].query : null });
    const state = searchState[safeId];
    if (!state) {
        weLog.warn('filetree', 'executeSearch: searchState 不存在', { safeId });
        return;
    }
    const treeContainer = document.getElementById(`file-tree-${safeId}`);
    if (!treeContainer) {
        weLog.warn('filetree', 'executeSearch: treeContainer 元素不存在', { safeId });
        return;
    }

    if (!state.query) {
        weLog.debug('filetree', 'executeSearch: 查询为空，恢复默认文件树');
        treeContainer.classList.remove('search-mode');
        treeContainer.innerHTML = '';
        const tree = buildFileTree(tabs[safeId].fileList);
        renderTreeNodes(treeContainer, tree);
        return;
    }

    const query = state.query;
    const results = [];
    const types = state.types;
    const noFilter = types.size === 0; // 都不选 = 全部

    // 搜索文件名和文件夹名
    if (noFilter || types.has('file') || types.has('folder')) {
        const seenFolders = new Set();
        for (const file of tabs[safeId].fileList) {
            if (file.startsWith('_')) continue;
            const parts = file.split('/');
            const fileName = parts[parts.length - 1];
            const displayName = stripExt(fileName);

            // 文件夹名匹配
            for (let i = 0; i < parts.length - 1; i++) {
                const folder = parts[i];
                if (seenFolders.has(folder)) continue;
                const m = matchQuery(folder, query);
                if (m.match) {
                    seenFolders.add(folder);
                    if (noFilter || types.has('folder')) {
                        results.push({ type: 'folder', name: folder, path: parts.slice(0, i + 1).join('/'), matchText: folder, score: m.score });
                    }
                }
            }

            // 文件名匹配
            const mDisplay = matchQuery(displayName, query);
            const mFull = matchQuery(fileName, query);
            const bestScore = Math.max(mDisplay.score, mFull.score);
            if (mDisplay.match || mFull.match) {
                if (noFilter || types.has('file')) {
                    results.push({ type: 'file', name: displayName, path: file, matchText: displayName, score: bestScore });
                }
            }
        }
    }

    // 搜索标签
    if (noFilter || types.has('tag')) {
        const tags = window.tagModule?.metadata?.tags || {};
        for (const [filePath, fileTags] of Object.entries(tags)) {
            for (const tag of fileTags) {
                const label = tag.label || '';
                const emoji = tag.emoji || '';
                const combined = label + ' ' + emoji;
                const mLabel = matchQuery(label, query);
                const mEmoji = matchQuery(emoji, query);
                const mCombined = matchQuery(combined, query);
                const bestScore = Math.max(mLabel.score, mEmoji.score, mCombined.score);
                if (mLabel.match || mEmoji.match || mCombined.match) {
                    const parts = filePath.split('/');
                    const displayName = stripExt(parts[parts.length - 1]);
                    results.push({
                        type: 'tag', name: displayName, path: filePath,
                        matchText: emoji + ' ' + label, score: bestScore,
                        tagColor: tag.color, tagEmoji: emoji, tagLabel: label
                    });
                }
            }
        }
    }

    // 搜索文件内容
    if (noFilter || types.has('content')) {
        const project = tabs[safeId];
        if (project) {
            if (!state.contentCache) {
                state.contentCache = {};
                const promises = tabs[safeId].fileList
                    .filter(f => !f.startsWith('_'))
                    .map(async (file) => {
                        const res = await weAPI.readFile(project.projectPath, file);
                        if (res.success) {
                            const text = res.content.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
                            state.contentCache[file] = text;
                        }
                    });
                await Promise.all(promises);
            }

            for (const [filePath, text] of Object.entries(state.contentCache)) {
                const m = matchQuery(text, query);
                if (m.match) {
                    const parts = filePath.split('/');
                    const displayName = stripExt(parts[parts.length - 1]);
                    // 找第一个匹配位置用于摘要
                    const lowerText = text.toLowerCase();
                    const lowerQuery = query.toLowerCase();
                    let idx = lowerText.indexOf(lowerQuery);
                    if (idx === -1) {
                        // 模糊匹配：找第一个字符位置
                        let qi = 0;
                        for (let i = 0; i < lowerText.length && qi < lowerQuery.length; i++) {
                            if (lowerText[i] === lowerQuery[qi]) { qi++; if (qi === lowerQuery.length) idx = i; }
                        }
                    }
                    if (idx === -1) idx = 0;
                    const snippetStart = Math.max(0, idx - 20);
                    const snippetEnd = Math.min(text.length, idx + query.length + 30);
                    let snippet = text.substring(snippetStart, snippetEnd).replace(/\s+/g, ' ').trim();
                    if (snippetStart > 0) snippet = '...' + snippet;
                    if (snippetEnd < text.length) snippet = snippet + '...';
                    results.push({ type: 'content', name: displayName, path: filePath, matchText: snippet, score: m.score });
                }
            }
        }
    }

    treeContainer.classList.add('search-mode');
    treeContainer.innerHTML = '';

    if (results.length === 0) {
        weLog.info('filetree', 'executeSearch: 无搜索结果', { query });
        treeContainer.innerHTML = `<div class="search-empty">${t('ui.search_no_results') || 'No results found'}</div>`;
        return;
    }

    // 排序：先按分数，再按类型
    const typeOrder = { file: 0, folder: 1, tag: 2, content: 3 };
    results.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return typeOrder[a.type] - typeOrder[b.type] || a.name.localeCompare(b.name);
    });

    const typeIcons = {
        file: '<svg viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M3 2h7l3 3v9H3V2zm7 0v3h3"/></svg>',
        folder: '<svg viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M2 4h4l1 1h7v8H2V4z"/></svg>',
        tag: '<svg viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M2 2h6l6 6-6 6-6-6V2z"/></svg>',
        content: '<svg viewBox="0 0 16 16" width="14" height="14"><path fill="none" stroke="currentColor" stroke-width="1.5" d="M3 3h10v10H3zM5 6h6M5 9h6M5 12h4"/></svg>'
    };
    const typeLabels = {
        file: t('ui.search_file') || 'File',
        folder: t('ui.search_folder') || 'Folder',
        tag: t('ui.search_tag') || 'Tag',
        content: t('ui.search_content') || 'Content'
    };

    const resultList = document.createElement('div');
    resultList.className = 'search-results';

    // 结果计数
    const countBar = document.createElement('div');
    countBar.className = 'search-result-count';
    countBar.textContent = `${results.length} ${t('ui.search_results') || 'results'}`;
    treeContainer.appendChild(countBar);

    for (const r of results) {
        const item = document.createElement('div');
        item.className = 'search-result-item';

        const left = document.createElement('div');
        left.className = 'search-result-left';
        left.innerHTML = `<span class="search-result-icon">${typeIcons[r.type]}</span>`;

        const info = document.createElement('div');
        info.className = 'search-result-info';

        const nameEl = document.createElement('div');
        nameEl.className = 'search-result-name';
        nameEl.textContent = r.name;

        const matchEl = document.createElement('div');
        matchEl.className = 'search-result-match';
        if (r.type === 'tag') {
            matchEl.innerHTML = `<span class="mini-tag" style="background-color:${r.tagColor}">${r.tagEmoji || ''} ${r.tagLabel || ''}</span>`;
        } else if (r.type === 'content') {
            matchEl.textContent = r.matchText;
            matchEl.classList.add('content-snippet');
        } else {
            matchEl.textContent = r.path;
            matchEl.classList.add('result-path');
        }

        info.appendChild(nameEl);
        info.appendChild(matchEl);
        left.appendChild(info);

        const badge = document.createElement('span');
        badge.className = 'search-result-badge search-badge-' + r.type;
        badge.textContent = typeLabels[r.type];

        item.appendChild(left);
        item.appendChild(badge);

        item.addEventListener('click', () => {
            if (r.type === 'folder') {
                // 展开到该文件夹
                const tree = buildFileTree(tabs[safeId].fileList);
                treeContainer.innerHTML = '';
                treeContainer.classList.remove('search-mode');
                renderTreeNodes(treeContainer, tree);
                // 展开对应文件夹
                expandFolderPath(treeContainer, r.path);
            } else {
                // 打开文件
                openProjectFile(safeId, r.path);
                // 清除搜索
                const input = document.getElementById(`search-input-${safeId}`);
                if (input) { input.value = ''; searchState[safeId].query = ''; }
                const clearBtn = document.getElementById(`search-clear-${safeId}`);
                if (clearBtn) clearBtn.style.display = 'none';
                treeContainer.classList.remove('search-mode');
                treeContainer.innerHTML = '';
                const tree = buildFileTree(tabs[safeId].fileList);
                renderTreeNodes(treeContainer, tree);
            }
        });

        item.addEventListener('mouseenter', () => item.classList.add('hover'));
        item.addEventListener('mouseleave', () => item.classList.remove('hover'));

        resultList.appendChild(item);
    }

    treeContainer.appendChild(resultList);
}

function expandFolderPath(container, folderPath) {
    weLog.debug('filetree', '→ expandFolderPath 开始', { folderPath });
    const parts = folderPath.split('/');
    let current = container;
    for (const part of parts) {
        const folders = current.querySelectorAll(':scope > .tree-folder');
        for (const f of folders) {
            const name = f.querySelector('.folder-name')?.textContent;
            if (name === part) {
                const content = f.querySelector('.tree-folder-content');
                const arrow = f.querySelector('.tree-arrow');
                if (content && content.style.display === 'none') {
                    content.style.display = 'block';
                    if (arrow) arrow.innerHTML = ARROW_EXPANDED;
                }
                current = content;
                break;
            }
        }
    }
}
