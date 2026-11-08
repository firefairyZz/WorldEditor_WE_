// ========== 文件拖放功能 ==========
let dragOverlay = null;
let dropIndicator = null;      // 编辑器内的插入指示线
let isDragging = false;
let currentDragTarget = null;
let internalDragActive = false;
let dragStartElement = null;
let dragWatchdog = null;

// 图片文件扩展名
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.webp', '.ico', '.tiff', '.tif'];
// 文本/代码文件扩展名
const TEXT_EXTENSIONS = ['.txt', '.md', '.doc', '.docx', '.rtf', '.log', '.csv', '.json', '.xml', '.html', '.css', '.js'];

// 检测是否有真实的外部文件拖入（区别于内部拖拽）
// 关键区分：外部文件拖放时 dataTransfer.types 包含 'Files'
function hasExternalFiles(dataTransfer) {
    weLog.debug('file-drop', '→ hasExternalFiles');
    if (!dataTransfer) return false;
    if (dataTransfer.types && Array.from(dataTransfer.types).includes('Files')) {
        return true;
    }
    if (dataTransfer.files && dataTransfer.files.length > 0) {
        for (let i = 0; i < dataTransfer.files.length; i++) {
            if (dataTransfer.files[i].size > 0) return true;
        }
    }
    return false;
}

// 初始化文件拖放
function initFileDragDrop() {
    weLog.info('file-drop', '→ initFileDragDrop 开始');
    const contentContainer = document.getElementById('content-container');
    if (!contentContainer) { weLog.warn('file-drop', 'initFileDragDrop: content-container 元素不存在'); return; }

    // 检测内部拖拽开始（用于区分外部/内部拖放）
    // 关键原理：外部文件拖放不会触发 dragstart，只有内部元素拖拽才会触发
    document.addEventListener('dragstart', (e) => {
        weLog.debug('file-drop', 'dragstart: 内部拖拽开始');
        internalDragActive = true;
        dragStartElement = e.target;
    });

    // 全局拖放监听（仅处理外部文件）
    document.addEventListener('dragenter', (e) => {
        if (internalDragActive) return;
        if (!hasExternalFiles(e.dataTransfer)) return;
        e.preventDefault();
        isDragging = true;
        resetDragWatchdog();

        const targetArea = getDropTargetArea(e.target);
        weLog.debug('file-drop', 'dragenter', { targetArea });
        if (targetArea === 'editor') {
            // 编辑器区域：显示插入指示线，不显示大覆盖层
            hideDragOverlay();
            showDropIndicatorAt(e.clientX, e.clientY);
        } else if (targetArea) {
            hideDropIndicator();
            showDragOverlay(targetArea);
        }
    });

    document.addEventListener('dragover', (e) => {
        if (internalDragActive) return;
        if (!hasExternalFiles(e.dataTransfer)) return;
        e.preventDefault();
        resetDragWatchdog();

        if (isDragging) {
            const targetArea = getDropTargetArea(e.target);

            if (targetArea === 'editor') {
                // 编辑器区域：更新指示线位置
                hideDragOverlay();
                showDropIndicatorAt(e.clientX, e.clientY);
            } else {
                // 非编辑器区域：隐藏指示线，显示覆盖层
                hideDropIndicator();
                if (targetArea && targetArea !== currentDragTarget) {
                    showDragOverlay(targetArea);
                }
            }
        }
    });

    // 鼠标离开文档时隐藏
    document.addEventListener('mouseleave', (e) => {
        if (!e.relatedTarget || !document.contains(e.relatedTarget)) {
            clearDragState();
        }
    });

    window.addEventListener('dragleave', (e) => {
        if (!e.relatedTarget) {
            clearDragState();
        }
    });

    window.addEventListener('dragend', () => {
        clearDragState();
    });

    window.addEventListener('blur', () => {
        clearDragState();
    });

    document.addEventListener('drop', async (e) => {
        const wasInternalDrag = internalDragActive;
        clearDragState();

        // 内部拖拽：不处理
        if (wasInternalDrag) { weLog.debug('file-drop', 'drop: 内部拖拽，忽略'); return; }

        e.preventDefault();

        if (!hasExternalFiles(e.dataTransfer)) return;

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const targetArea = getDropTargetArea(e.target);
            const onEditor = targetArea === 'editor';
            weLog.info('file-drop', 'drop: 外部文件拖放', { fileCount: files.length, targetArea, onEditor });

            // 编辑器区域：在 drop 位置插入
            let insertIndex = null;
            if (onEditor && quill) {
                insertIndex = getQuillIndexFromPoint(e.clientX, e.clientY);
            }

            await handleDroppedFiles(files, onEditor, insertIndex);
        }
    });
    weLog.info('file-drop', '← initFileDragDrop 完成');
}

// 清理所有拖拽状态
function clearDragState() {
    weLog.debug('file-drop', '→ clearDragState');
    clearDragWatchdog();
    isDragging = false;
    internalDragActive = false;
    dragStartElement = null;
    hideDragOverlay();
    hideDropIndicator();
}

// 获取拖放目标区域
// 返回: 'editor' | 'content' | 'filetree' | null
function getDropTargetArea(target) {
    weLog.debug('file-drop', '→ getDropTargetArea');
    if (!target || !target.closest) return null;
    if (target.closest('.ql-editor, .quill-wrapper')) return 'editor';
    if (target.closest('.project-sidebar, .file-tree-wrapper')) return 'filetree';
    if (target.closest('#content-container')) return 'content';
    return null;
}

// ===== 编辑器插入指示线 =====

// 在指定坐标处显示插入指示线
function showDropIndicatorAt(clientX, clientY) {
    weLog.debug('file-drop', '→ showDropIndicatorAt', { clientX, clientY });
    if (!quill) { weLog.warn('file-drop', 'showDropIndicatorAt: quill 不存在'); return; }

    if (!dropIndicator) {
        dropIndicator = document.createElement('div');
        dropIndicator.className = 'drop-indicator';
        document.body.appendChild(dropIndicator);
    }

    const editor = quill.root;
    const editorRect = editor.getBoundingClientRect();

    let top = editorRect.top + 4;

    // 用 caretRangeFromPoint 获取鼠标位置对应的文本位置
    const range = document.caretRangeFromPoint(clientX, clientY);
    if (range && editor.contains(range.startContainer)) {
        const rect = range.getBoundingClientRect();
        if (rect.height > 0) {
            // 判断鼠标在行的上半还是下半
            const midY = rect.top + rect.height / 2;
            if (clientY > midY) {
                // 下半行：指示线显示在行下方
                top = rect.bottom - 1;
            } else {
                // 上半行：指示线显示在行上方
                top = rect.top - 1;
            }
        }
    } else {
        // 鼠标在编辑器空白区域：遍历块级元素找到最近位置
        const blocks = editor.children;
        let lastBottom = editorRect.top;
        for (let i = 0; i < blocks.length; i++) {
            const blockRect = blocks[i].getBoundingClientRect();
            if (clientY >= blockRect.top && clientY <= blockRect.bottom) {
                // 鼠标在某个块内
                const midY = blockRect.top + blockRect.height / 2;
                top = clientY > midY ? blockRect.bottom - 1 : blockRect.top - 1;
                lastBottom = blockRect.bottom;
                break;
            }
            if (clientY < blockRect.top) {
                // 鼠标在块上方
                top = blockRect.top - 1;
                lastBottom = blockRect.bottom;
                break;
            }
            lastBottom = blockRect.bottom;
        }
        // 鼠标在所有块下方
        if (clientY >= lastBottom) {
            top = lastBottom - 1;
        }
    }

    // 限制在编辑器可见范围内
    if (top < editorRect.top) top = editorRect.top;
    if (top > editorRect.bottom - 2) top = editorRect.bottom - 2;

    dropIndicator.style.display = 'block';
    dropIndicator.style.left = editorRect.left + 'px';
    dropIndicator.style.width = editorRect.width + 'px';
    dropIndicator.style.top = top + 'px';
}

function hideDropIndicator() {
    if (dropIndicator) {
        dropIndicator.style.display = 'none';
    }
}

// 根据坐标获取 Quill 的插入 index
function getQuillIndexFromPoint(x, y) {
    weLog.debug('file-drop', '→ getQuillIndexFromPoint', { x, y });
    if (!quill) { weLog.warn('file-drop', 'getQuillIndexFromPoint: quill 不存在'); return null; }

    const editor = quill.root;
    const range = document.caretRangeFromPoint(x, y);

    if (!range || !editor.contains(range.startContainer)) {
        // 鼠标在空白区域：插入到文档末尾
        weLog.debug('file-drop', 'getQuillIndexFromPoint: 空白区域，插入到末尾');
        return quill.getLength();
    }

    const rect = range.getBoundingClientRect();
    // 如果鼠标明显在光标位置下方（空白区域），插入到文档末尾
    if (rect.height > 0 && y > rect.bottom + rect.height) {
        return quill.getLength();
    }

    // 保存当前 selection
    const sel = window.getSelection();
    const savedRange = sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;

    // 临时设置 selection 到鼠标位置
    sel.removeAllRanges();
    sel.addRange(range);

    // 获取 Quill index
    const quillSel = quill.getSelection();

    // 恢复原来的 selection
    if (savedRange) {
        sel.removeAllRanges();
        sel.addRange(savedRange);
    } else {
        sel.removeAllRanges();
    }

    // 如果鼠标在行下半部分，插入到该行之后
    if (quillSel && rect.height > 0) {
        const midY = rect.top + rect.height / 2;
        if (y > midY) {
            // 插入到当前行末尾之后
            return quillSel.index + (quillSel.length || 0);
        }
    }

    return quillSel ? quillSel.index : quill.getLength();
}

// ===== 大覆盖层（文件树/主内容区使用）=====

function showDragOverlay(targetArea) {
    weLog.info('file-drop', '→ showDragOverlay', { targetArea });
    currentDragTarget = targetArea;

    if (!dragOverlay) {
        dragOverlay = document.createElement('div');
        dragOverlay.className = 'drag-overlay';
        dragOverlay.style.display = 'none';
        dragOverlay.innerHTML = `
            <div class="drag-overlay-content">
                <div class="drag-overlay-icon"><svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></div>
                <div class="drag-overlay-text">${t('ui.drop_files_here') || '释放以导入文件'}</div>
                <div class="drag-overlay-subtext">${t('ui.drop_files_subtext') || '支持 .txt, .md, .png 等文件'}</div>
            </div>
        `;
    }

    let container = null;
    if (targetArea === 'filetree') {
        const activeSidebar = document.querySelector('.project-sidebar:not([style*="display: none"])');
        container = activeSidebar || document.querySelector('.project-sidebar') || document.querySelector('.file-tree-wrapper');
    } else {
        container = document.getElementById('content-container');
    }

    if (container) {
        const cs = window.getComputedStyle(container);
        if (cs.position === 'static') {
            container.style.position = 'relative';
        }
        if (dragOverlay.parentElement !== container) {
            container.appendChild(dragOverlay);
        }
        dragOverlay.style.position = 'absolute';
        dragOverlay.style.top = '0';
        dragOverlay.style.left = '0';
        dragOverlay.style.right = '0';
        dragOverlay.style.bottom = '0';
        dragOverlay.style.width = '';
        dragOverlay.style.height = '';
    } else {
        dragOverlay.style.position = 'fixed';
        dragOverlay.style.top = '0';
        dragOverlay.style.left = '0';
        dragOverlay.style.right = '0';
        dragOverlay.style.bottom = '0';
        if (dragOverlay.parentElement !== document.body) {
            document.body.appendChild(dragOverlay);
        }
    }

    // 更新样式和文案
    dragOverlay.classList.remove('filetree-mode');
    if (targetArea === 'filetree') {
        dragOverlay.classList.add('filetree-mode');
        const text = dragOverlay.querySelector('.drag-overlay-text');
        const subtext = dragOverlay.querySelector('.drag-overlay-subtext');
        const icon = dragOverlay.querySelector('.drag-overlay-icon');
        if (text) text.textContent = t('ui.drop_to_save') || '释放以保存到项目';
        if (subtext) subtext.textContent = t('ui.drop_to_save_subtext') || '文件将保存到当前项目目录';
        if (icon) icon.innerHTML = '<svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="var(--accent, #4a90d9)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
    } else {
        const text = dragOverlay.querySelector('.drag-overlay-text');
        const subtext = dragOverlay.querySelector('.drag-overlay-subtext');
        const icon = dragOverlay.querySelector('.drag-overlay-icon');
        if (text) text.textContent = t('ui.drop_files_here') || '释放以导入文件';
        if (subtext) subtext.textContent = t('ui.drop_files_subtext') || '支持 .txt, .md, .png 等文件';
        if (icon) icon.textContent = '📥';
    }

    dragOverlay.style.display = 'flex';
}

function hideDragOverlay() {
    weLog.debug('file-drop', '→ hideDragOverlay');
    if (dragOverlay) {
        dragOverlay.style.display = 'none';
    }
    currentDragTarget = null;
}

// ===== 文件处理 =====

function isImageFile(file) {
    weLog.debug('file-drop', '→ isImageFile', { name: file && file.name });
    const ext = getFileExt(file.name);
    if (IMAGE_EXTENSIONS.includes(ext)) return true;
    if (file.type && file.type.startsWith('image/')) return true;
    return false;
}

function getFileExt(filename) {
    weLog.debug('file-drop', '→ getFileExt', { filename });
    const lastDot = filename.lastIndexOf('.');
    return lastDot >= 0 ? filename.substring(lastDot).toLowerCase() : '';
}

async function handleDroppedFiles(fileList, onEditor, insertIndex) {
    weLog.info('file-drop', '→ handleDroppedFiles 开始', { fileCount: fileList.length, onEditor, insertIndex });
    const imageFiles = [];
    const textFiles = [];
    const skippedFiles = [];

    for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        if (isImageFile(file)) {
            imageFiles.push(file);
        } else {
            const ext = getFileExt(file.name);
            if (TEXT_EXTENSIONS.includes(ext) || !ext) {
                textFiles.push(file);
            } else {
                skippedFiles.push(file.name);
            }
        }
    }
    weLog.info('file-drop', 'handleDroppedFiles: 文件分类', { imageCount: imageFiles.length, textCount: textFiles.length, skippedCount: skippedFiles.length });

    const canInsertDirectly = onEditor && quill;
    const project = tabs[activeTabId];

    if (!canInsertDirectly && (!project || !project.projectPath)) {
        weLog.warn('file-drop', 'handleDroppedFiles: 未打开项目且无法直接插入');
        showNotification(t('ui.open_project_first') || '请先打开一个项目');
        return;
    }

    let importedCount = 0;
    let insertedCount = 0;
    let failedCount = 0;
    let insertedTextCount = 0;

    // 处理图片文件
    if (imageFiles.length > 0) {
        weLog.info('file-drop', 'handleDroppedFiles: 处理图片文件', { count: imageFiles.length, onEditor });
        if (onEditor && quill) {
            let currentIndex = insertIndex;
            for (const file of imageFiles) {
                try {
                    const dataUrl = await readFileAsDataURL(file);
                    insertImageIntoEditor(dataUrl, currentIndex);
                    insertedCount++;
                    if (currentIndex !== null && currentIndex !== undefined) currentIndex++;
                } catch (err) {
                    weLog.error('file-drop', 'handleDroppedFiles: 插入图片失败', err && err.stack ? err.stack : String(err));
                    failedCount++;
                }
            }
            if (insertedCount > 0) {
                showNotification(`${t('ui.inserted') || '已插入'} ${insertedCount} ${t('ui.images') || '张图片'}`);
            }
        } else {
            for (const file of imageFiles) {
                try {
                    const dataUrl = await readFileAsDataURL(file);
                    const base64Data = dataUrl.split(',')[1];
                    const imageName = file.name;
                    const res = await weAPI.storeImage(project.projectPath, imageName, base64Data);
                    if (res.success) {
                        importedCount++;
                    } else {
                        weLog.warn('file-drop', 'handleDroppedFiles: storeImage 返回失败', { imageName });
                        failedCount++;
                    }
                } catch (err) {
                    weLog.error('file-drop', 'handleDroppedFiles: 保存图片失败', err && err.stack ? err.stack : String(err));
                    failedCount++;
                }
            }
            if (importedCount > 0) {
                const updated = await weAPI.openProject(project.projectPath);
                if (updated.success) {
                    project.fileList = updated.fileList;
                    if (typeof refreshFileTree === 'function') {
                        refreshFileTree(activeTabId, updated.fileList);
                    }
                }
                showNotification(`${t('ui.imported') || '已导入'} ${importedCount} ${t('ui.images') || '张图片'}${t('ui.to_project') || '到项目'}`);
            }
        }
    }

    // 处理文本文件
    if (textFiles.length > 0) {
        weLog.info('file-drop', 'handleDroppedFiles: 处理文本文件', { count: textFiles.length, onEditor });
        if (onEditor && quill) {
            let currentIndex = insertIndex;
            for (const file of textFiles) {
                try {
                    const content = await readFileAsText(file);
                    insertTextIntoEditor(content, currentIndex);
                    insertedTextCount++;
                    if (currentIndex !== null && currentIndex !== undefined) {
                        currentIndex += content.length + 1;
                    }
                } catch (err) {
                    weLog.error('file-drop', 'handleDroppedFiles: 插入文本失败', err && err.stack ? err.stack : String(err));
                    failedCount++;
                }
            }
            if (insertedTextCount > 0) {
                showNotification(`${t('ui.inserted') || '已插入'} ${insertedTextCount} ${t('ui.files') || '个文件内容'}`);
            }
        } else {
            showNotification(`${t('ui.importing') || '正在导入'} ${textFiles.length} ${t('ui.files') || '个文件'}...`);

            for (const file of textFiles) {
                try {
                    const content = await readFileAsText(file);
                    const filename = file.name;

                    if (project.fileList && project.fileList.includes(filename)) {
                        weLog.info('file-drop', 'handleDroppedFiles: 文件已存在，询问覆盖', { filename });
                        if (!confirm(`${t('ui.file_exists') || '文件'} "${filename}" ${t('ui.already_exists') || '已存在，是否覆盖？'}`)) {
                            continue;
                        }
                    }

                    const res = await weAPI.saveFile(project.projectPath, filename, content);
                    if (res.success) {
                        importedCount++;
                    } else {
                        weLog.warn('file-drop', 'handleDroppedFiles: saveFile 返回失败', { filename });
                        failedCount++;
                    }
                } catch (err) {
                    weLog.error('file-drop', 'handleDroppedFiles: 导入文件失败', err && err.stack ? err.stack : String(err));
                    failedCount++;
                }
            }

            if (importedCount > 0) {
                const updated = await weAPI.openProject(project.projectPath);
                if (updated.success) {
                    project.fileList = updated.fileList;
                    if (typeof refreshFileTree === 'function') {
                        refreshFileTree(activeTabId, updated.fileList);
                    }
                }
            }
        }
    }

    // 汇总通知
    const parts = [];
    const totalInserted = insertedCount + insertedTextCount;
    if (totalInserted > 0) parts.push(`${t('ui.inserted') || '已插入'} ${totalInserted} ${t('ui.items') || '项'}`);
    if (importedCount > 0) parts.push(`${t('ui.imported') || '已导入'} ${importedCount} ${t('ui.files') || '个文件'}`);
    if (failedCount > 0) parts.push(`${t('ui.failed') || '失败'} ${failedCount} ${t('ui.files') || '个'}`);
    if (skippedFiles.length > 0) parts.push(`${t('ui.skipped') || '跳过'} ${skippedFiles.length} ${t('ui.files') || '个'}`);
    if (parts.length > 0) showNotification(parts.join(', '));
    weLog.info('file-drop', '← handleDroppedFiles 完成', { inserted: totalInserted, imported: importedCount, failed: failedCount, skipped: skippedFiles.length });
}

// 插入图片到 Quill 编辑器（支持指定 index，使用卡片格式）
function insertImageIntoEditor(dataUrl, index) {
    weLog.info('file-drop', '→ insertImageIntoEditor', { index });
    if (!quill) { weLog.warn('file-drop', 'insertImageIntoEditor: quill 不存在'); return; }

    if (index === undefined || index === null) {
        let range = quill.getSelection(true);
        if (!range) {
            const length = quill.getLength();
            range = { index: length, length: 0 };
        }
        index = range.index;
    }

    quill.insertEmbed(index, 'imageCard', dataUrl, Quill.sources.USER);
    quill.setSelection(index + 1, 0, Quill.sources.SILENT);
    weLog.info('file-drop', '← insertImageIntoEditor 完成');
}

// 插入文本到 Quill 编辑器（支持指定 index）
function insertTextIntoEditor(text, index) {
    weLog.info('file-drop', '→ insertTextIntoEditor', { index, textLength: text ? text.length : 0 });
    if (!quill) { weLog.warn('file-drop', 'insertTextIntoEditor: quill 不存在'); return; }

    if (index === undefined || index === null) {
        let range = quill.getSelection(true);
        if (!range) {
            const length = quill.getLength();
            range = { index: length, length: 0 };
        }
        index = range.index;
    }

    quill.insertText(index, text, Quill.sources.USER);
    quill.setSelection(index + text.length, 0, Quill.sources.SILENT);
    weLog.info('file-drop', '← insertTextIntoEditor 完成');
}

// 读取文件为文本
function readFileAsText(file) {
    weLog.debug('file-drop', '→ readFileAsText', { name: file && file.name });
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsText(file, 'UTF-8');
    });
}

// 读取文件为 Data URL（base64）
function readFileAsDataURL(file) {
    weLog.debug('file-drop', '→ readFileAsDataURL', { name: file && file.name });
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(file);
    });
}

// 拖拽看门狗：如果拖放事件中断，自动清理
function resetDragWatchdog() {
    weLog.debug('file-drop', '→ resetDragWatchdog');
    clearDragWatchdog();
    dragWatchdog = setTimeout(() => {
        clearDragState();
    }, 300);
}

function clearDragWatchdog() {
    weLog.debug('file-drop', '→ clearDragWatchdog');
    if (dragWatchdog) {
        clearTimeout(dragWatchdog);
        dragWatchdog = null;
    }
}

// 暴露到全局
window.isImageFile = isImageFile;
window.insertImageIntoEditor = insertImageIntoEditor;
window.insertTextIntoEditor = insertTextIntoEditor;
