// ========== 文件拖放功能 ==========
let dragOverlay = null;

// 初始化文件拖放
function initFileDragDrop() {
    const contentContainer = document.getElementById('content-container');
    if (!contentContainer) return;

    // 全局拖放监听
    document.addEventListener('dragenter', (e) => {
        if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            showDragOverlay();
        }
    });

    document.addEventListener('dragover', (e) => {
        if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
        }
    });

    document.addEventListener('dragleave', (e) => {
        if (e.target === document.documentElement || e.target === document.body) {
            e.preventDefault();
            hideDragOverlay();
        }
    });

    document.addEventListener('drop', async (e) => {
        e.preventDefault();
        hideDragOverlay();
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            await handleDroppedFiles(files);
        }
    });
}

// 显示拖放覆盖层
function showDragOverlay() {
    if (dragOverlay) {
        dragOverlay.style.display = 'flex';
        return;
    }

    dragOverlay = document.createElement('div');
    dragOverlay.className = 'drag-overlay';
    dragOverlay.style.display = 'flex';
    dragOverlay.innerHTML = `
        <div class="drag-overlay-content">
            <div class="drag-overlay-icon">📥</div>
            <div class="drag-overlay-text">${t('ui.drop_files_here') || '释放以导入文件'}</div>
            <div class="drag-overlay-subtext">${t('ui.drop_files_subtext') || '支持 .txt, .md 等文本文件'}</div>
        </div>
    `;
    document.body.appendChild(dragOverlay);
}

// 隐藏拖放覆盖层
function hideDragOverlay() {
    if (dragOverlay) {
        dragOverlay.style.display = 'none';
    }
}

// 处理拖放的文件
async function handleDroppedFiles(fileList) {
    const project = tabs[activeTabId];
    if (!project || !project.projectPath) {
        showNotification(t('ui.open_project_first') || '请先打开一个项目');
        return;
    }

    const validExtensions = ['.txt', '.md', '.doc', '.docx', '.rtf', '.log', '.csv', '.json', '.xml', '.html', '.css', '.js'];
    const droppedFiles = [];
    const skippedFiles = [];

    for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const name = file.name;
        const lastDot = name.lastIndexOf('.');
        const ext = lastDot >= 0 ? name.substring(lastDot).toLowerCase() : '';
        
        // 检查文件扩展名
        if (validExtensions.includes(ext) || !ext) {
            droppedFiles.push(file);
        } else {
            skippedFiles.push(file.name);
        }
    }

    if (droppedFiles.length === 0) {
        showNotification(t('ui.no_valid_files') || '没有可导入的文件');
        return;
    }

    // 显示导入进度
    showNotification(`${t('ui.importing') || '正在导入'} ${droppedFiles.length} ${t('ui.files') || '个文件'}...`);

    let importedCount = 0;
    let failedCount = 0;

    for (const file of droppedFiles) {
        try {
            // 读取文件内容
            const content = await readFileAsText(file);
            const filename = file.name;
            
            // 检查是否已存在
            if (project.fileList && project.fileList.includes(filename)) {
                // 询问是否覆盖
                if (!confirm(`${t('ui.file_exists') || '文件'} "${filename}" ${t('ui.already_exists') || '已存在，是否覆盖？'}`)) {
                    continue;
                }
            }

            // 保存文件
            const res = await weAPI.saveFile(project.projectPath, filename, content);
            if (res.success) {
                importedCount++;
            } else {
                failedCount++;
            }
        } catch (err) {
            console.error('Import file error:', err);
            failedCount++;
        }
    }

    // 更新项目文件列表
    if (importedCount > 0) {
        const updated = await weAPI.openProject(project.projectPath);
        if (updated.success) {
            project.fileList = updated.fileList;
            if (typeof refreshFileTree === 'function') {
                refreshFileTree(activeTabId, updated.fileList);
            }
        }
    }

    // 显示结果
    let message = `${t('ui.imported') || '已导入'} ${importedCount} ${t('ui.files') || '个文件'}`;
    if (failedCount > 0) {
        message += `, ${t('ui.failed') || '失败'} ${failedCount} ${t('ui.files') || '个'}`;
    }
    if (skippedFiles.length > 0) {
        message += `, ${t('ui.skipped') || '跳过'} ${skippedFiles.length} ${t('ui.files') || '个'}`;
    }
    showNotification(message);
}

// 读取文件为文本
function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsText(file, 'UTF-8');
    });
}

// 初始化拖放支持（需要在 window.onload 中调用）
// initFileDragDrop() 会在 init.js 中被调用