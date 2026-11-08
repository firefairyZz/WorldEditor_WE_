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
// 视频文件扩展名
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.flv', '.wmv'];
// 音频文件扩展名
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.wma'];
// 二进制文件扩展名（不可作为文本读取）
const BINARY_EXTENSIONS = ['.exe', '.dll', '.so', '.dylib', '.jar', '.war', '.class', '.apk', '.ipa', '.iso', '.img', '.bin', '.dat', '.com', '.sys', '.o', '.obj'];
// 文本/代码文件扩展名
const TEXT_EXTENSIONS = ['.txt', '.md', '.doc', '.docx', '.rtf', '.log', '.csv', '.json', '.xml', '.html', '.css', '.js'];

// 根据文件名推断 MIME 类型
function getMimeTypeFromName(filename) {
    const ext = filename.lastIndexOf('.') >= 0 ? filename.substring(filename.lastIndexOf('.') + 1).toLowerCase() : '';
    const mimeMap = {
        'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
        'gif': 'image/gif', 'bmp': 'image/bmp', 'webp': 'image/webp',
        'svg': 'image/svg+xml', 'ico': 'image/x-icon', 'tiff': 'image/tiff', 'tif': 'image/tiff',
        'pdf': 'application/pdf',
        'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'flac': 'audio/flac',
        'mp4': 'video/mp4', 'webm': 'video/webm', 'avi': 'video/x-msvideo', 'mov': 'video/quicktime'
    };
    return mimeMap[ext] || 'application/octet-stream';
}

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
                <div class="drag-overlay-icon"><svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></div>
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
    const videoFiles = [];
    const audioFiles = [];
    const textFiles = [];
    const binaryFiles = [];
    const skippedFiles = [];

    // 文件大小限制：媒体文件（视频/音频）500MB，其他文件50MB
    const MAX_MEDIA_SIZE = 500 * 1024 * 1024;  // 500MB
    const MAX_OTHER_SIZE = 50 * 1024 * 1024;   // 50MB

    for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const ext = getFileExt(file.name);
        const isMedia = VIDEO_EXTENSIONS.includes(ext) || AUDIO_EXTENSIONS.includes(ext) 
                       || (file.type && (file.type.startsWith('video/') || file.type.startsWith('audio/')));
        const maxSize = isMedia ? MAX_MEDIA_SIZE : MAX_OTHER_SIZE;
        
        weLog.debug('file-drop', '分类文件', { name: file.name, size: file.size, ext, type: file.type, isMedia, maxSize });
        
        if (file.size > maxSize) {
            const sizeMB = (file.size / 1024 / 1024).toFixed(1);
            const maxSizeMB = (maxSize / 1024 / 1024).toFixed(0);
            skippedFiles.push({
                name: file.name,
                size: file.size,
                sizeMB,
                reason: `文件过大 (${sizeMB}MB > ${maxSizeMB}MB限制)`
            });
            weLog.warn('file-drop', '文件过大被跳过', { name: file.name, size: file.size, sizeMB, maxSizeMB });
            continue;
        }
        if (isImageFile(file)) {
            imageFiles.push(file);
        } else if (VIDEO_EXTENSIONS.includes(ext) || (file.type && file.type.startsWith('video/'))) {
            videoFiles.push(file);
            weLog.info('file-drop', '识别为视频文件', { name: file.name, ext, type: file.type });
        } else if (AUDIO_EXTENSIONS.includes(ext) || (file.type && file.type.startsWith('audio/'))) {
            audioFiles.push(file);
            weLog.info('file-drop', '识别为音频文件', { name: file.name, ext, type: file.type });
        } else if (BINARY_EXTENSIONS.includes(ext)) {
            // 二进制文件：保存为 base64，不读取文本
            binaryFiles.push(file);
        } else {
            textFiles.push(file);
        }
    }
    weLog.info('file-drop', 'handleDroppedFiles: 文件分类', { 
        imageCount: imageFiles.length, 
        videoCount: videoFiles.length, 
        audioCount: audioFiles.length, 
        textCount: textFiles.length,
        binaryCount: binaryFiles.length
    });

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
                    const mimeType = file.type || getMimeTypeFromName(imageName);
                    const res = await weAPI.storeImage(project.projectPath, imageName, base64Data, mimeType);
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
                const updated = await weAPI.listFiles(project.projectPath);
                if (updated.success) {
                    project.fileList = updated.files;
                    if (typeof refreshFileTree === 'function') {
                        refreshFileTree(activeTabId, updated.files);
                    }
                }
                showNotification(`${t('ui.imported') || '已导入'} ${importedCount} ${t('ui.images') || '张图片'}${t('ui.to_project') || '到项目'}`);
            }
        }
    }

    // 处理视频/音频文件（使用 data URL 存储到 ZIP）
    const mediaFiles = [...videoFiles, ...audioFiles];
    if (mediaFiles.length > 0) {
        weLog.info('file-drop', 'handleDroppedFiles: 处理媒体文件', { count: mediaFiles.length });
        showNotification(`正在导入 ${mediaFiles.length} 个媒体文件...`, 3000);
        
        let mediaImported = 0;
        for (const file of mediaFiles) {
            try {
                const isVideo = VIDEO_EXTENSIONS.includes(getFileExt(file.name)) || (file.type && file.type.startsWith('video/'));
                weLog.info('file-drop', `读取${isVideo ? '视频' : '音频'}文件`, { name: file.name, size: file.size });
                
                // 使用 readAsDataURL 读取（简单可靠）
                const dataUrl = await readFileAsDataURL(file);
                const mediaName = file.name;
                const mimeType = file.type || (isVideo ? 'video/mp4' : 'audio/mpeg');
                
                // 使用 __media_ 前缀存储
                const mediaFilename = `__media_${mediaName}`;
                weLog.info('file-drop', `保存${isVideo ? '视频' : '音频'}文件`, { 
                    name: mediaName, 
                    dataUrlLength: dataUrl.length,
                    mimeType 
                });
                
                // 保存 data URL 字符串
                const res = await weAPI.saveMediaFile(project.projectPath, mediaFilename, dataUrl, mimeType);
                if (res.success) {
                    importedCount++;
                    mediaImported++;
                    weLog.info('file-drop', `${isVideo ? '视频' : '音频'}文件保存成功`, { 
                        name: mediaName
                    });
                } else {
                    weLog.warn('file-drop', `保存${isVideo ? '视频' : '音频'}文件失败`, { 
                        mediaName, 
                        error: res.error 
                    });
                    failedCount++;
                }
            } catch (err) {
                weLog.error('file-drop', '保存媒体文件失败', { 
                    name: file.name, 
                    error: err && err.stack ? err.stack : String(err) 
                });
                failedCount++;
            }
        }
        
        if (mediaImported > 0) {
            const updated = await weAPI.listFiles(project.projectPath);
            if (updated.success) {
                project.fileList = updated.files;
                if (typeof refreshFileTree === 'function') {
                    refreshFileTree(activeTabId, updated.files);
                }
            }
            showNotification(`媒体文件导入完成: ${mediaImported} 个`, 3000);
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
                        if (!await showConfirm(`${t('ui.file_exists') || '文件'} "${filename}" ${t('ui.already_exists') || '已存在，是否覆盖？'}`)) {
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
                const updated = await weAPI.listFiles(project.projectPath);
                if (updated.success) {
                    project.fileList = updated.files;
                    if (typeof refreshFileTree === 'function') {
                        refreshFileTree(activeTabId, updated.files);
                    }
                }
            }
        }
    }

    // 处理二进制文件（保存为 base64，避免文本编码损坏）
    if (binaryFiles.length > 0) {
        weLog.info('file-drop', 'handleDroppedFiles: 处理二进制文件', { count: binaryFiles.length });
        for (const file of binaryFiles) {
            try {
                const ext = getFileExt(file.name);
                const mimeType = getMimeTypeFromName(file.name) || 'application/octet-stream';
                const buffer = await file.arrayBuffer();
                const uint8 = new Uint8Array(buffer);
                let binary = '';
                const chunkSize = 0x8000;
                for (let j = 0; j < uint8.length; j += chunkSize) {
                    binary += String.fromCharCode.apply(null, uint8.subarray(j, j + chunkSize));
                }
                const base64 = btoa(binary);
                const dataUrl = `data:${mimeType};base64,${base64}`;
                
                // 存储为 __bin_ 前缀的 base64 文件
                const binFilename = `__bin_${file.name}`;
                const res = await weAPI.writeFile(project.projectPath, binFilename, dataUrl);
                if (res.success) {
                    importedCount++;
                } else {
                    weLog.warn('file-drop', 'handleDroppedFiles: saveFile 二进制文件失败', { filename: file.name });
                    failedCount++;
                }
            } catch (err) {
                weLog.error('file-drop', 'handleDroppedFiles: 保存二进制文件失败', err && err.stack ? err.stack : String(err));
                failedCount++;
            }
        }
        if (binaryFiles.length > 0) {
            const updated = await weAPI.listFiles(project.projectPath);
            if (updated.success) {
                project.fileList = updated.files;
                if (typeof refreshFileTree === 'function') {
                    refreshFileTree(activeTabId, updated.files);
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
    
    // 如果有跳过的文件
    const skipMessages = [];
    if (skippedFiles.length > 0) {
        const firstSkip = skippedFiles[0];
        const remaining = skippedFiles.length - 1;
        parts.push(`跳过 ${skippedFiles.length} 个文件 (${firstSkip.name}${remaining > 0 ? ` 等` : ''})`);
        
        // 构建详细信息
        for (const f of skippedFiles) {
            skipMessages.push(`• ${f.name}: ${f.reason}`);
        }
        weLog.warn('file-drop', '跳过的文件详情', skippedFiles);
        
        // 显示详细通知
        if (typeof window.showDetailedNotification === 'function') {
            window.showDetailedNotification(
                `${parts.join(', ')}`,
                `被跳过的文件:\n${skipMessages.join('\n')}`,
                5000
            );
        } else {
            // 如果没有详细通知函数，使用普通通知
            if (parts.length > 0) showNotification(parts.join(', '));
        }
    } else {
        // 没有跳过的文件，直接显示普通通知
        if (parts.length > 0) showNotification(parts.join(', '));
    }
    
    weLog.info('file-drop', '← handleDroppedFiles 完成', { 
        inserted: totalInserted, imported: importedCount, failed: failedCount, 
        skipped: skippedFiles.length, 
        skippedFiles: skippedFiles.map(f => ({ name: f.name, reason: f.reason }))
    });
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

// 读取文件为 ArrayBuffer（用于大文件存储）
function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsArrayBuffer(file);
    });
}

// 将 ArrayBuffer 转为 base64 data URL（仅在需要显示时转换）
function arrayBufferToDataUrl(buffer, mimeType) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const len = bytes.length;
    // 分块处理，避免栈溢出
    const chunkSize = 8192;
    for (let i = 0; i < len; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, chunk);
    }
    const base64 = btoa(binary);
    return `data:${mimeType};base64,${base64}`;
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
