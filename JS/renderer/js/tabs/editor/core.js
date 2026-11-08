// ====== editor/core.js — 核心编辑器操作 ======
// 源文件: editor.js (行762-1135 + 行2584-2782)
// 编辑器路由: 直接使用 getFileMetadata 进行类型检测，避免 EditorRegistry 开销

// 将 data URL 转换为 Blob URL（更可靠的图片加载方式）
function _showFileLoading(safeId) {
    const container = document.getElementById(`quill-${safeId}`)?.parentElement;
    if (!container) return;
    // 如果已存在就激活，否则创建
    let overlay = container.querySelector('.file-loading-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'file-loading-overlay';
        overlay.innerHTML = '<div class="file-loading-spinner"></div>';
        container.style.position = container.style.position || 'relative';
        container.appendChild(overlay);
    }
    requestAnimationFrame(() => overlay.classList.add('active'));
}
function _hideFileLoading(safeId) {
    const container = document.getElementById(`quill-${safeId}`)?.parentElement;
    if (!container) return;
    const overlay = container.querySelector('.file-loading-overlay');
    if (!overlay) return;
    overlay.classList.remove('active');
    setTimeout(() => overlay.remove(), 200);
}

// ====== Quill 下拉菜单 overflow 修复（v2）======
// 用 position:fixed 跳出 overflow 容器，**不移 DOM**避免 Quill 事件检测出错
function _teleportPickerOptions(picker) {
    if (!picker || !picker.classList.contains('ql-expanded')) return;
    const options = picker.querySelector(':scope > .ql-picker-options');
    if (!options) return;

    if (options.style.position === 'fixed') {
        _positionTeleportedPicker(picker, options);
        return;
    }

    options.style.position = 'fixed';
    options.style.zIndex = '999999';
    _positionTeleportedPicker(picker, options);

    const closeObserver = new MutationObserver(() => {
        if (!picker.classList.contains('ql-expanded')) {
            closeObserver.disconnect();
            options.style.position = '';
            options.style.left = '';
            options.style.top = '';
            options.style.width = '';
            options.style.zIndex = '';
        }
    });
    closeObserver.observe(picker, { attributes: true, attributeFilter: ['class'] });
}

function _positionTeleportedPicker(picker, options) {
    const rect = picker.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;
    const optH = options.offsetHeight || 200;
    const optW = options.offsetWidth || rect.width;
    options.style.left = Math.max(4, rect.left) + 'px';
    options.style.width = optW + 'px';
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < optH + 10 && rect.top > optH + 10;
    options.style.top = openUp ? (rect.top - optH) + 'px' : rect.bottom + 'px';
}

function _repositionTeleportedPickers() {
    document.querySelectorAll('.ql-picker-options').forEach(options => {
        if (options.style.position === 'fixed') {
            const parent = options.closest('.ql-picker');
            if (parent && parent.classList.contains('ql-expanded')) {
                _positionTeleportedPicker(parent, options);
            }
        }
    });
}


function dataUrlToBlobUrl(dataUrl) {
    if (!dataUrl || !dataUrl.startsWith('data:')) {
        weLog.warn('editor', 'dataUrlToBlobUrl: 无效的 data URL');
        return null;
    }
    
    try {
        // 解析 data URL: data:mimeType;base64,base64Data
        const commaIdx = dataUrl.indexOf(',');
        if (commaIdx < 0) {
            weLog.warn('editor', 'dataUrlToBlobUrl: data URL 格式错误');
            return null;
        }
        
        const metaPart = dataUrl.slice(0, commaIdx);
        const base64Data = dataUrl.slice(commaIdx + 1);
        
        // 提取 MIME 类型
        const mimeMatch = metaPart.match(/^data:([^;]+)/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
        
        // 解码 base64 数据
        const binaryString = atob(base64Data);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        // 创建 Blob 并生成 URL
        const blob = new Blob([bytes], { type: mimeType });
        const blobUrl = URL.createObjectURL(blob);
        
        weLog.info('editor', 'dataUrlToBlobUrl: 转换成功', { mimeType, size: len });
        return blobUrl;
    } catch (e) {
        weLog.error('editor', 'dataUrlToBlobUrl: 转换失败', e);
        return null;
    }
}

// 存储文件前缀定义（与 filetree.js 保持一致）
const EDITOR_STORAGE_PREFIXES = {
    '__img_': 6,
    '__bin_': 6,
    '__media_': 8
};

// 去除存储前缀和扩展名，获取用户可见的干净文件名
function getCleanFileName(filename) {
    if (!filename) return '未知文件';
    let name = filename.split('/').pop(); // 移除路径
    for (const [prefix, length] of Object.entries(EDITOR_STORAGE_PREFIXES)) {
        if (name.startsWith(prefix)) {
            name = name.slice(length);
            break;
        }
    }
    // 移除扩展名
    const extIdx = name.lastIndexOf('.');
    if (extIdx > 0) {
        name = name.slice(0, extIdx);
    }
    return name || '未知文件';
}

// 仅去除存储前缀（保留扩展名），用于卡片显示
function getCleanNameForCard(filename) {
    if (!filename) return '';
    let name = filename.split('/').pop(); // 移除路径
    for (const [prefix, length] of Object.entries(EDITOR_STORAGE_PREFIXES)) {
        if (name.startsWith(prefix)) {
            name = name.slice(length);
            break;
        }
    }
    return name;
}

// ====== 编辑器空状态显示 ======
function showEditorEmptyState(safeId, filename, reason) {
    const quillWrapper = document.getElementById(`quill-${safeId}`);
    if (!quillWrapper) return;
    
    // 恢复容器显示状态
    quillWrapper.style.display = '';
    quillWrapper.classList.remove('has-viewer');
    const embedEl = document.getElementById(`ng-embed-${safeId}`);
    if (embedEl) embedEl.style.display = 'none';
    
    // 清空现有内容
    quillWrapper.innerHTML = '';
    
    // 创建空状态界面
    const emptyState = document.createElement('div');
    emptyState.className = 'editor-empty-state';
    emptyState.innerHTML = `
        <div class="empty-state-icon">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
            </svg>
        </div>
        <div class="empty-state-text">
            <div class="empty-state-title">${escapeHtml(getCleanFileName(filename))}</div>
            <div class="empty-state-desc">
                ${reason === 'unsupported-type' 
                    ? '此类型文件暂不支持查看' 
                    : reason === 'read-error' 
                        ? '文件加载失败，请尝试重新打开' 
                        : '文件内容为空'}
            </div>
        </div>
        <div class="empty-state-actions" data-reason="${reason}">
            <button class="empty-state-btn retry-btn">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="23 4 23 10 17 10"/>
                    <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
                </svg>
                重新加载
            </button>
            <button class="empty-state-btn create-btn">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"/>
                    <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                创建新文件
            </button>
        </div>
    `;
    
    quillWrapper.appendChild(emptyState);
    
    // 根据原因调整按钮显示
    const actionsDiv = emptyState.querySelector('.empty-state-actions');
    const currentReason = actionsDiv ? actionsDiv.getAttribute('data-reason') : '';
    if (currentReason === 'unsupported-type') {
        // 不支持的文件：隐藏重试和创建按钮，显示关闭按钮
        if (actionsDiv) {
            actionsDiv.innerHTML = '<button class="empty-state-btn close-btn">关闭</button>';
        }
    }
    
    // 绑定按钮事件
    const retryBtn = emptyState.querySelector('.retry-btn');
    const createBtn = emptyState.querySelector('.create-btn');
    const closeBtn = emptyState.querySelector('.close-btn');
    
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            // 关闭不支持的文件（从完整 TA 回目录独占）
            if (window.closeProjectFile && safeId) {
                window.closeProjectFile(safeId);
            } else {
                quillWrapper.innerHTML = '';
            }
        });
    }
    
    if (retryBtn) {
        retryBtn.addEventListener('click', () => {
            if (safeId && filename) {
                openProjectFile(safeId, filename);
            }
        });
    }
    
    if (createBtn) {
        createBtn.addEventListener('click', () => {
            // 创建新文件
            if (typeof createFileInCurrentProject === 'function') {
                createFileInCurrentProject();
            } else {
                showNotification('创建新文件功能暂未实现');
            }
        });
    }
}

/**
 * 显示"此文件不支持查看"的提示界面
 * @param {string} safeId
 * @param {string} filename
 * @param {object} meta - 文件元数据
 */
function showEditorUnsupportedState(safeId, filename, meta) {
    const quillWrapper = document.getElementById(`quill-${safeId}`);
    if (!quillWrapper) return;
    
    // 移除加载提示 overlay
    const loadingOverlay = quillWrapper.querySelector('.file-loading-overlay');
    if (loadingOverlay) loadingOverlay.remove();
    
    // 恢复容器显示状态
    quillWrapper.style.display = '';
    
    // 隐藏编辑器相关区域
    const embedEl = document.getElementById(`ng-embed-${safeId}`);
    if (embedEl) embedEl.style.display = 'none';
    quillWrapper.classList.add('has-viewer');
    const quillToolbar = quillWrapper.querySelector('#quill-toolbar');
    const quillEditor = quillWrapper.querySelector('#quill-editor');
    if (quillToolbar) quillToolbar.style.display = 'none';
    if (quillEditor) quillEditor.style.display = 'none';
    
    // 清理旧内容
    const existingUnsupported = quillWrapper.querySelector('.unsupported-file-state');
    if (existingUnsupported) existingUnsupported.remove();
    
    // 去除所有存储前缀
    let displayName = filename || '未知文件';
    if (displayName.startsWith('__img_')) displayName = displayName.slice(6);
    else if (displayName.startsWith('__bin_')) displayName = displayName.slice(6);
    else if (displayName.startsWith('__media_')) displayName = displayName.slice(8);
    const baseName = displayName ? displayName.replace(/\\.[^.]+$/, '').replace(/^.*[\\/]/, '') : '未知文件';
    const extInfo = meta && meta.ext ? ` (${meta.ext})` : '';
    
    const unsupportedDiv = document.createElement('div');
    unsupportedDiv.className = 'unsupported-file-state';
    unsupportedDiv.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 20px;color:var(--text-secondary);text-align:center;';
    
    unsupportedDiv.innerHTML = `
        <div class="unsupported-icon" style="margin-bottom:24px;">
            <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-secondary);opacity:0.6;">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
            </svg>
        </div>
        <div class="unsupported-title" style="font-size:18px;font-weight:600;color:var(--text);margin-bottom:8px;">此文件不支持查看</div>
        <div class="unsupported-filename" style="font-size:14px;margin-bottom:4px;opacity:0.8;">${escapeHtml(baseName)}${extInfo}</div>
        <div class="unsupported-desc" style="font-size:13px;max-width:320px;line-height:1.6;margin-bottom:24px;opacity:0.7;">
            ${escapeHtml(meta && meta.ext 
                ? `该文件类型 (${meta.ext}) 暂未注册对应编辑器。` 
                : '该文件类型暂不支持在线预览。')}
        </div>
        <div class="unsupported-actions" style="display:flex;gap:12px;">
            <button class="unsupported-btn unsupported-close-btn" style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border:1px solid var(--border);border-radius:8px;background:var(--bg-sidebar);color:var(--text);cursor:pointer;font-size:13px;">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
                返回文件树
            </button>
            <button class="unsupported-btn unsupported-download-btn" style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border:none;border-radius:8px;background:var(--accent);color:#fff;cursor:pointer;font-size:13px;">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                下载文件
            </button>
        </div>
    `;
    
    quillWrapper.appendChild(unsupportedDiv);
    
    // 绑定事件
    const closeBtn = unsupportedDiv.querySelector('.unsupported-close-btn');
    const downloadBtn = unsupportedDiv.querySelector('.unsupported-download-btn');
    
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            if (window.closeProjectFile && safeId) {
                window.closeProjectFile(safeId);
            }
        });
    }
    
    if (downloadBtn) {
        downloadBtn.addEventListener('click', async () => {
            const project = tabs[safeId];
            if (!project) return;
            try {
                const result = await weAPI.readFile(project.projectPath, filename);
                if (result.success) {
                    const ext = meta ? meta.ext : '';
                    const mimeTypes = {
                        '.txt': 'text/plain', '.md': 'text/markdown',
                        '.json': 'application/json', '.xml': 'application/xml',
                        '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript'
                    };
                    const mime = mimeTypes[ext] || 'application/octet-stream';
                    const blob = new Blob([result.content], { type: mime });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = baseName;
                    a.click();
                    URL.revokeObjectURL(url);
                } else {
                    showNotification('下载失败：' + (result.error || '无法读取文件'));
                }
            } catch (e) {
                showNotification('下载失败：' + String(e));
            }
        });
    }
    
    // 更新状态栏
    if (project) {
        project.currentFile = filename;
        project.dirty = false;
        updateStatusBar();
    }
}

// ====== 文件查看器（图片/视频/PDF/音频/归档/二进制预览） ======
var _activeViewer = null; // { safeId, container, blobUrl, imageBlobUrl, tempPaths }

function closeFileViewer(safeId) {
    if (_activeViewer && _activeViewer.safeId === safeId) {
        // 清理媒体文件 Blob URL
        if (_activeViewer.blobUrl) {
            try {
                URL.revokeObjectURL(_activeViewer.blobUrl);
            } catch (e) { /* ignore */ }
            _activeViewer.blobUrl = null;
        }
        
        // 清理图片 Blob URL
        if (_activeViewer.imageBlobUrl) {
            try {
                URL.revokeObjectURL(_activeViewer.imageBlobUrl);
            } catch (e) { /* ignore */ }
            _activeViewer.imageBlobUrl = null;
        }
        
        // 清理临时图片文件
        if (_activeViewer.tempPaths && _activeViewer.tempPaths.length > 0) {
            try {
                weAPI.cleanupImageTemp(_activeViewer.tempPaths);
            } catch (e) { /* ignore */ }
            _activeViewer.tempPaths = [];
        }
        
        const container = _activeViewer.container;
        if (container && container.parentNode) {
            container.parentNode.removeChild(container);
        }
        _activeViewer = null;
    }
    // 恢复编辑器可见
    const quillWrapper = document.getElementById(`quill-${safeId}`);
    if (quillWrapper) {
        quillWrapper.classList.remove('has-viewer');
        const quillToolbar = quillWrapper.querySelector('#quill-toolbar');
        const quillEditor = quillWrapper.querySelector('#quill-editor');
        if (quillToolbar) quillToolbar.style.display = '';
        if (quillEditor) quillEditor.style.display = '';
    }
}

async function openFileViewer(safeId, filename, options) {
    const project = tabs[safeId];
    if (!project) return;
    
    const quillWrapper = document.getElementById(`quill-${safeId}`);
    if (!quillWrapper) return;
    
    // 恢复容器显示状态
    quillWrapper.style.display = '';
    quillWrapper.classList.remove('has-viewer');
    const embedEl = document.getElementById(`ng-embed-${safeId}`);
    if (embedEl) embedEl.style.display = 'none';
    
    // 先关闭已存在的查看器
    closeFileViewer(safeId);
    
    // 隐藏已有的编辑器内容（不销毁，保留引用）
    quillWrapper.classList.add('has-viewer');
    const quillToolbar = quillWrapper.querySelector('#quill-toolbar');
    const quillEditor = quillWrapper.querySelector('#quill-editor');
    if (quillToolbar) quillToolbar.style.display = 'none';
    if (quillEditor) quillEditor.style.display = 'none';
    
    // 处理显示名称（去掉路径和特殊前缀）
    let displayName = filename;
    // 去掉路径前缀（只保留文件名部分）
    const lastSlashIdx = Math.max(displayName.lastIndexOf('/'), displayName.lastIndexOf('\\'));
    if (lastSlashIdx >= 0) displayName = displayName.slice(lastSlashIdx + 1);
    // 去掉 __img_、__bin_ 和 __media_ 前缀
    if (displayName.startsWith('__img_')) displayName = displayName.slice(6);
    else if (displayName.startsWith('__bin_')) displayName = displayName.slice(6);
    else if (displayName.startsWith('__media_')) displayName = displayName.slice(8);
    const ext = options.ext || '';
    
    // 判断是否是媒体文件（使用 ArrayBuffer 存储）
    // 提取文件名部分再检查前缀（避免路径干扰）
    const fileNameOnly = filename ? filename.split(/[\\/]/).pop() : '';
    const isMediaPrefix = fileNameOnly.startsWith('__media_');
    const isImagePrefix = fileNameOnly.startsWith('__img_');
    
    // 从文件名提取实际扩展名（去除存储前缀）
    let actualExt = '';
    let nameForExt = fileNameOnly;
    if (isImagePrefix) nameForExt = fileNameOnly.slice(6);
    else if (isMediaPrefix) nameForExt = fileNameOnly.slice(8);
    const lastDot = nameForExt.lastIndexOf('.');
    if (lastDot >= 0) actualExt = nameForExt.substring(lastDot).toLowerCase();
    
    // 判断实际文件类型（基于扩展名，而不是存储前缀）
    const actualIsImage = ['png','jpg','jpeg','gif','bmp','webp','ico','tiff','tif'].includes(actualExt.replace('.', ''));
    const actualIsVideo = ['mp4','webm','mov'].includes(actualExt.replace('.', ''));
    const actualIsAudio = ['mp3','wav','flac','aac','m4'].includes(actualExt.replace('.', ''));
    
    // 对于不可预览的文件类型（归档/二进制/Office），跳过读取，直接显示信息卡片
    const skipRead = options.isArchive || options.isBinary || options.isOffice;
    let fileContent = '';
    let mediaBlobUrl = null;
    let mediaMime = '';
    let imageTempPath = null; // 图片临时文件路径（优化用）
    
    if (!skipRead) {
        // 图片文件：使用 data URL（最稳定可靠的方案）
        if (options.isImage || actualIsImage) {
            try {
                const imgResult = await weAPI.readImageFile(project.projectPath, filename);
                if (imgResult.success && imgResult.dataUrl) {
                    imageTempPath = imgResult.filePath;
                    fileContent = imgResult.dataUrl;
                    weLog.info('editor', 'openFileViewer: 图片加载成功', { 
                        filename, 
                        size: imgResult.size,
                        dataUrlLen: imgResult.dataUrl.length
                    });
                } else if (imgResult.success && imgResult.filePath) {
                    // 回退：使用本地文件路径
                    imageTempPath = imgResult.filePath;
                    const normalizedPath = imgResult.filePath.replace(/\\/g, '/');
                    fileContent = `file:///${normalizedPath}`;
                    weLog.info('editor', 'openFileViewer: 图片使用本地路径回退', { 
                        filename, 
                        size: imgResult.size
                    });
                } else {
                    throw new Error(imgResult.error || '图片数据为空');
                }
            } catch (e) {
                weLog.error('editor', 'openFileViewer: 图片加载失败', e);
                showFileViewerError(safeId, quillWrapper, filename, e.message || '图片加载失败');
                return;
            }
        } else if ((isMediaPrefix || actualIsVideo || actualIsAudio) && (options.isVideo || options.isAudio || actualIsVideo || actualIsAudio)) {
            // 媒体文件使用专门的 API 读取
            weLog.info('editor', 'openFileViewer: 读取媒体文件', { filename });
            try {
                const mediaResult = await weAPI.readMediaFile(project.projectPath, filename);
                if (mediaResult.success) {
                    mediaMime = mediaResult.mimeType;
                    
                    // 如果返回了 fileUrl（大文件），直接使用本地路径
                    if (mediaResult.useFilePath && mediaResult.fileUrl) {
                        fileContent = mediaResult.fileUrl;
                        weLog.info('editor', 'openFileViewer: 使用本地文件路径', { 
                            filename, 
                            size: mediaResult.size 
                        });
                    } else if (mediaResult.dataUrl) {
                        // 小文件使用 data URL
                        fileContent = mediaResult.dataUrl;
                        weLog.info('editor', 'openFileViewer: 媒体文件 data URL 获取成功', { 
                            filename, 
                            size: mediaResult.size 
                        });
                    } else {
                        throw new Error('媒体文件数据为空');
                    }
                } else {
                    showFileViewerError(safeId, quillWrapper, filename, mediaResult.error || '媒体文件读取失败');
                    return;
                }
            } catch (e) {
                weLog.error('editor', 'openFileViewer: 读取媒体文件失败', e);
                showFileViewerError(safeId, quillWrapper, filename, '媒体文件读取失败');
                return;
            }
        } else {
            // 普通文件使用 readFile 读取
            const timeoutMs = (options.isVideo || options.isAudio) ? 30000 : 10000;
            
            let contentResult;
            try {
                contentResult = await Promise.race([
                    weAPI.readFile(project.projectPath, filename),
                    new Promise((_, reject) => setTimeout(() => reject(new Error(`读取超时`)), timeoutMs))
                ]);
            } catch (e) {
                weLog.error('editor', 'openFileViewer: 读取文件失败', e);
                if (e.message && e.message.includes('超时')) {
                    showFileViewerError(safeId, quillWrapper, filename, '文件过大，加载超时');
                } else {
                    showFileViewerError(safeId, quillWrapper, filename, '读取文件失败');
                }
                return;
            }
            
            if (!contentResult.success) {
                showFileViewerError(safeId, quillWrapper, filename, contentResult.error || '无法读取文件');
                return;
            }
            fileContent = contentResult.content;
            
            // 对于非 __media_ 前缀但以 data: 开头的视频/音频，创建 Blob URL
            if ((options.isVideo || options.isAudio) && fileContent && fileContent.startsWith('data:')) {
                try {
                    const [metaPart, base64Data] = fileContent.split(',');
                    const mimeMatch = metaPart.match(/data:([^;]+)/);
                    mediaMime = mimeMatch ? mimeMatch[1] : (options.isVideo ? 'video/mp4' : 'audio/mpeg');
                    const binaryString = window.atob(base64Data);
                    const len = binaryString.length;
                    const bytes = new Uint8Array(len);
                    for (let i = 0; i < len; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    const blob = new Blob([bytes], { type: mediaMime });
                    mediaBlobUrl = URL.createObjectURL(blob);
                } catch (e) {
                    weLog.warn('editor', 'openFileViewer: 创建 Blob URL 失败', e);
                }
            }
        }
    }
    
    // 构建查看器 UI（作为独立容器，不破坏原编辑器）
    const viewerContainer = document.createElement('div');
    viewerContainer.className = 'file-viewer-container';
    viewerContainer.style.cssText = 'flex:1;display:flex;flex-direction:column;min-height:0;overflow:hidden;';
    
    const viewer = document.createElement('div');
    viewer.className = 'file-viewer';
    viewer.style.cssText = 'flex:1;display:flex;flex-direction:column;min-height:0;overflow:hidden;';
    
    // mediaBlobUrl 已在上面创建（__media_ 文件）
    // 对于从 readFile 读取的旧格式媒体文件，Blob URL 也已在上面创建
    
    if (options.isImage) {
        // 使用 fileContent 作为图片源（已经是 data URL 或 file:// URL 格式）
        viewer.innerHTML = buildImageViewer(displayName, fileContent);
        // 记录临时文件路径用于清理
        if (imageTempPath) {
            viewer.dataset.tempPath = imageTempPath;
        }
    } else if (options.isVideo) {
        viewer.innerHTML = buildVideoViewer(displayName, fileContent, ext, mediaBlobUrl);
    } else if (options.isAudio) {
        viewer.innerHTML = buildAudioViewer(displayName, fileContent, ext, mediaBlobUrl);
    } else if (options.isPdf) {
        viewer.innerHTML = buildPdfViewer(displayName, fileContent);
    } else if (options.isArchive) {
        viewer.innerHTML = buildArchiveViewer(displayName, ext);
    } else if (options.isBinary) {
        viewer.innerHTML = buildBinaryViewer(displayName, ext);
    } else if (options.isOffice) {
        viewer.innerHTML = buildOfficeViewer(displayName, ext);
    } else {
        viewer.innerHTML = buildGenericViewer(displayName, ext);
    }
    
    viewerContainer.appendChild(viewer);
    quillWrapper.appendChild(viewerContainer);
    setTimeout(function(){ if(typeof _setupImageViewerZoom==="function") _setupImageViewerZoom(); }, 10);
    
    // 收集临时文件路径用于清理
    const tempPaths = [];
    if (imageTempPath) tempPaths.push(imageTempPath);
    // 从 viewer 数据属性中收集
    const tempPathAttr = viewer.querySelectorAll('[data-temp-path]');
    tempPathAttr.forEach(el => {
        if (el.dataset.tempPath) tempPaths.push(el.dataset.tempPath);
    });
    
    // 存储 Blob URL 用于清理
    let imageBlobUrl = null;
    if (fileContent && fileContent.startsWith('blob:')) {
        imageBlobUrl = fileContent;
    }
    
    _activeViewer = { safeId: safeId, container: viewerContainer, blobUrl: mediaBlobUrl, imageBlobUrl, tempPaths };
    
    // 绑定事件
    const downloadBtn = viewer.querySelector('.viewer-download-btn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', async () => {
            // 对于跳过读取的文件类型，下载时再读取
            let content = fileContent;
            if (skipRead && !content) {
                try {
                    const result = await weAPI.readFile(project.projectPath, filename);
                    if (result.success) {
                        content = result.content;
                    } else {
                        showNotification('下载失败：' + (result.error || '无法读取文件'));
                        return;
                    }
                } catch (e) {
                    showNotification('下载失败：无法读取文件');
                    return;
                }
            }
            downloadFile(displayName, content, ext);
        });
    }
    
    // 更新项目状态
    project.currentFile = filename;
    project.dirty = false;
    updateStatusBar();
}

// 恢复编辑器（关闭查看器后调用）
function restoreEditorFromViewer(safeId) {
    const quillWrapper = document.getElementById(`quill-${safeId}`);
    if (!quillWrapper) return;
    closeFileViewer(safeId);
    const quillToolbar = quillWrapper.querySelector('#quill-toolbar');
    const quillEditor = quillWrapper.querySelector('#quill-editor');
    if (quillToolbar) quillToolbar.style.display = '';
    if (quillEditor) quillEditor.style.display = '';
}

// 查看器图标（Lucide 风格 SVG）
const VIEWER_ICONS = {
    presentation: '<svg class="viewer-icon-svg" viewBox="0 0 24 24" width="18" height="18"><path d="M2 3h20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 21h10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 16v5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    video: '<svg class="viewer-icon-svg" viewBox="0 0 24 24" width="18" height="18"><path d="m22 8-6 4 6 4V8Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    audio: '<svg class="viewer-icon-svg" viewBox="0 0 24 24" width="18" height="18"><path d="M9 18V5l12-2v13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="18" r="3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="18" cy="16" r="3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    fileText: '<svg class="viewer-icon-svg" viewBox="0 0 24 24" width="18" height="18"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><polyline points="14 2 14 8 20 8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><line x1="16" y1="13" x2="8" y2="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><line x1="16" y1="17" x2="8" y2="17" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><polyline points="10 9 9 9 8 9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    archive: '<svg class="viewer-icon-svg" viewBox="0 0 24 24" width="18" height="18"><rect width="18" height="18" x="3" y="3" rx="2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 3v18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 9h18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 15h18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    binary: '<svg class="viewer-icon-svg" viewBox="0 0 24 24" width="18" height="18"><path d="M12 2a10 10 0 0 0-3.16 19.49" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 2a10 10 0 0 1 3.16 19.49" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 2a10 10 0 0 0-3.16 19.49" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 2a10 10 0 0 1 3.16 19.49" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><line x1="2" y1="12" x2="22" y2="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

function buildImageViewer(name, src) {
    weLog.info('editor', 'buildImageViewer', { 
        name, 
        srcLength: src ? src.length : 0, 
        isDataUrl: src ? src.startsWith('data:') : false, 
        isFileUrl: src ? src.startsWith('file:') : false,
        isWeFileUrl: src ? src.startsWith('we-file:') : false,
        isBlobUrl: src ? src.startsWith('blob:') : false
    });
    
    // 正确处理不同类型的 URL：data URL、file:// URL、blob URL、we-file:// URL 等
    let finalSrc = src;
    if (src && !src.startsWith('data:') && !src.startsWith('file:') && !src.startsWith('blob:') && !src.startsWith('we-file:')) {
        // 假设是纯 base64 数据
        finalSrc = `data:image/png;base64,${src}`;
    }
    
    // we-file:// URL 和 blob: URL 直接使用，不需要额外处理
    // file:// URL 也直接使用
    // data: URL 直接使用
    
    return `
        <div class="viewer-header">
            <div class="viewer-header-left">
                <span class="viewer-title">${escapeHtml(name)}</span>
            </div>
            <div class="viewer-header-right">
                <button class="viewer-download-btn" data-download="${escapeHtml(name)}" title="下载文件">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    <span>下载</span>
                </button>
                <button class="viewer-close-btn" title="关闭查看器 (Esc)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
            </div>
        </div>
        <div class="viewer-body viewer-image-body" id="viewer-img-body">
            <img src="${finalSrc}" alt="${escapeHtml(name)}" class="viewer-image" id="viewer-img"
                 style="object-fit: contain; width: 100%; height: 100%; max-width: 100%; max-height: 100%;"
                 onerror="console.error('Image load error:', this.src.substring(0, 100))" />
        </div>
        <div class="viewer-zoom-bar" id="viewer-zoom-bar">
            <button data-fit="contain" title="适应 (保持比例，完整显示)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
            </button>
            <button data-fit="cover" title="填充 (裁剪)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>
            </button>
            <button data-fit="fill" title="拉伸">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="m9 12 3-3 3 3"/><path d="M12 9v6"/></svg>
            </button>
            <button data-fit="none" title="原始大小 (1:1)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>
            </button>
            <div class="zoom-sep"></div>
            <button data-zoom="out" title="缩小">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M8 11h6"/></svg>
            </button>
            <span class="zoom-level" id="zoom-level">100%</span>
            <button data-zoom="in" title="放大">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M11 8v6"/><path d="M8 11h6"/></svg>
            </button>
            <button data-zoom="reset" title="重置">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>
            </button>
        </div>
    `;
}

// Image viewer zoom interaction setup
function _setupImageViewerZoom() {
    var img = document.getElementById('viewer-img');
    var bar = document.getElementById('viewer-zoom-bar');
    var body = document.getElementById('viewer-img-body');
    if (!img || !bar) return;
    var scale = 1;
    var fitMode = 'contain';

    function updateZoomAvailability() {
        var is1to1 = fitMode === 'none';
        var zoomBtns = bar.querySelectorAll('[data-zoom="in"], [data-zoom="out"]');
        zoomBtns.forEach(function(b) { b.disabled = !is1to1; });
        var level = bar.querySelector('#zoom-level');
        if (level) {
            level.style.opacity = is1to1 ? '1' : '0.4';
        }
    }

    function apply() {
        var level = bar.querySelector('#zoom-level');
        if (level) level.textContent = Math.round(scale * 100) + '%';
        if (fitMode === 'contain') {
            img.style.objectFit = 'contain';
            img.style.width = '100%'; img.style.height = '100%';
            img.style.maxWidth = '100%'; img.style.maxHeight = '100%';
            img.style.transform = '';
        } else if (fitMode === 'cover') {
            img.style.objectFit = 'cover';
            img.style.width = '100%'; img.style.height = '100%';
            img.style.transform = 'scale(' + scale + ')';
        } else if (fitMode === 'fill') {
            img.style.objectFit = 'fill';
            img.style.width = '100%'; img.style.height = '100%';
            img.style.transform = 'scale(' + scale + ')';
        } else {
            img.style.objectFit = 'none';
            img.style.width = 'auto'; img.style.height = 'auto';
            img.style.maxWidth = 'none'; img.style.maxHeight = 'none';
            img.style.transform = 'scale(' + scale + ')';
        }
        bar.querySelectorAll('[data-fit]').forEach(function(b) {
            b.classList.toggle('active', b.dataset.fit === fitMode);
        });
        updateZoomAvailability();
    }

    // 适应模式切换 → 重置 scale 为 1
    bar.querySelectorAll('[data-fit]').forEach(function(b) {
        b.onclick = function() { fitMode = b.dataset.fit; scale = 1; apply(); };
    });
    bar.querySelectorAll('[data-zoom]').forEach(function(b) {
        b.onclick = function() {
            var a = b.dataset.zoom;
            if (a === 'in') scale = Math.min(scale * 1.25, 10);
            else if (a === 'out') scale = Math.max(scale / 1.25, 0.1);
            else { scale = 1; fitMode = 'contain'; }
            apply();
        };
    });

    // 滚轮 = 缩放（自动切到 1:1 模式）
    if (body) {
        body.addEventListener('wheel', function(e) {
            // Ctrl/Cmd+滚轮 → 浏览器/系统默认缩放页面，我们不拦截
            if (e.ctrlKey || e.metaKey) return;
            e.preventDefault();
            scale = e.deltaY < 0 ? Math.min(scale * 1.15, 10) : Math.max(scale / 1.15, 0.1);
            fitMode = 'none';
            apply();
        }, { passive: false });
    }

    // 按住拖动 = 平移图像（只有 1:1 模式且内容溢出时生效）
    if (body) {
        var dragging = false;
        var lastX = 0, lastY = 0;
        img.addEventListener('mousedown', function(e) {
            if (fitMode !== 'none') return;
            dragging = true;
            lastX = e.clientX;
            lastY = e.clientY;
            e.preventDefault();
        });
        document.addEventListener('mousemove', function(e) {
            if (!dragging || !body) return;
            var dx = e.clientX - lastX;
            var dy = e.clientY - lastY;
            body.scrollLeft -= dx;
            body.scrollTop -= dy;
            lastX = e.clientX;
            lastY = e.clientY;
        });
        document.addEventListener('mouseup', function() { dragging = false; });
    }

    // 双击 = contain ↔ 1:1 切换
    img.addEventListener('dblclick', function() {
        if (fitMode === 'contain') { fitMode = 'none'; scale = 1; }
        else { fitMode = 'contain'; scale = 1; }
        apply();
    });
    apply();
}


function buildVideoViewer(name, src, ext, blobUrl) {
    const mimeMap = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogg': 'video/ogg', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo' };
    const mime = mimeMap[ext] || 'video/mp4';
    // 优先使用 Blob URL，然后是 we-file:// URL，然后是 file:// URL，最后是 data URL
    let finalSrc;
    if (blobUrl) {
        finalSrc = blobUrl;
    } else if (src && (src.startsWith('we-file:') || src.startsWith('file:') || src.startsWith('blob:'))) {
        finalSrc = src; // 直接使用 we-file://、file:// 或 blob: URL
    } else if (src && src.startsWith('data:')) {
        finalSrc = src;
    } else {
        // 假设是 base64 数据
        finalSrc = `data:${mime};base64,${src}`;
    }
    return `
        <div class="viewer-header">
            <div class="viewer-header-left">
                <span class="viewer-title">${escapeHtml(name)}</span>
            </div>
            <div class="viewer-header-right">
                <button class="viewer-download-btn" data-download="${escapeHtml(name)}" title="下载文件">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    <span>下载</span>
                </button>
                <button class="viewer-close-btn" title="关闭查看器 (Esc)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
            </div>
        </div>
        <div class="viewer-body viewer-media-body">
            <video controls class="viewer-video" preload="metadata" playsinline>
                <source src="${finalSrc}" type="${mime}">
                您的浏览器不支持视频播放
            </video>
        </div>
    `;
}

function buildAudioViewer(name, src, ext, blobUrl) {
    const mimeMap = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.flac': 'audio/flac', '.ogg': 'audio/ogg', '.aac': 'audio/aac', '.m4a': 'audio/mp4' };
    const mime = mimeMap[ext] || 'audio/mpeg';
    let finalSrc;
    if (blobUrl) {
        finalSrc = blobUrl;
    } else if (src && (src.startsWith('we-file:') || src.startsWith('file:') || src.startsWith('blob:'))) {
        finalSrc = src;
    } else if (src && src.startsWith('data:')) {
        finalSrc = src;
    } else {
        finalSrc = `data:${mime};base64,${src}`;
    }
    return `
        <div class="viewer-header">
            <div class="viewer-header-left">
                <span class="viewer-title">${escapeHtml(name)}</span>
            </div>
            <div class="viewer-header-right">
                <button class="viewer-download-btn" data-download="${escapeHtml(name)}" title="下载文件">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    <span>下载</span>
                </button>
                <button class="viewer-close-btn" title="关闭查看器 (Esc)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
            </div>
        </div>
        <div class="viewer-body viewer-media-body viewer-audio-body">
            <div class="audio-visualizer">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
            </div>
            <audio controls class="viewer-audio" preload="metadata">
                <source src="${finalSrc}" type="${mime}">
                您的浏览器不支持音频播放
            </audio>
        </div>
    `;
}

function buildPdfViewer(name, dataUrl) {
    const src = dataUrl.startsWith('data:') ? dataUrl : `data:application/pdf;base64,${dataUrl}`;
    return `
        <div class="viewer-header">
            <span class="viewer-title">${VIEWER_ICONS.fileText} ${escapeHtml(name)}</span>
            <button class="viewer-download-btn">⬇ 下载</button>
        </div>
        <div class="viewer-body viewer-pdf-body">
            <iframe src="${src}" class="viewer-pdf" title="${escapeHtml(name)}"></iframe>
            <div class="viewer-pdf-fallback" style="display:none;">
                <p>浏览器内嵌 PDF 查看器不可用</p>
                <button class="viewer-download-btn">⬇ 下载 PDF 文件</button>
            </div>
        </div>
    `;
}

function buildArchiveViewer(name, ext) {
    return `
        <div class="viewer-header">
            <span class="viewer-title">${VIEWER_ICONS.archive} ${escapeHtml(name)}</span>
            <button class="viewer-download-btn">⬇ 下载文件</button>
        </div>
        <div class="viewer-body viewer-info-body">
            <div class="viewer-icon">${VIEWER_ICONS.archive}</div>
            <div class="viewer-info-text">
                <h3>压缩文件</h3>
                <p>类型: ${ext}</p>
                <p>此压缩包格式暂不支持在线预览</p>
                <p>请下载后使用解压软件打开</p>
            </div>
        </div>
    `;
}

function buildBinaryViewer(name, ext) {
    return `
        <div class="viewer-header">
            <span class="viewer-title">${VIEWER_ICONS.binary} ${escapeHtml(name)}</span>
            <button class="viewer-download-btn">⬇ 下载文件</button>
        </div>
        <div class="viewer-body viewer-info-body">
            <div class="viewer-icon">${VIEWER_ICONS.binary}</div>
            <div class="viewer-info-text">
                <h3>二进制文件</h3>
                <p>类型: ${ext}</p>
                <p>此类型文件为二进制格式，暂不支持在线预览</p>
                <p>请根据文件类型使用对应的软件打开</p>
            </div>
        </div>
    `;
}

function buildGenericViewer(name, ext) {
    return `
        <div class="viewer-header">
            <span class="viewer-title">${VIEWER_ICONS.fileText} ${escapeHtml(name)}</span>
            <button class="viewer-download-btn">⬇ 下载文件</button>
        </div>
        <div class="viewer-body viewer-info-body">
            <div class="viewer-icon">${VIEWER_ICONS.fileText}</div>
            <div class="viewer-info-text">
                <h3>未知文件类型</h3>
                <p>类型: ${ext || '未知'}</p>
                <p>此文件类型暂不支持在线预览</p>
                <p>请下载后使用对应软件打开</p>
            </div>
        </div>
    `;
}

function buildOfficeViewer(name, ext) {
    const officeNames = { '.doc': 'Word 文档', '.docx': 'Word 文档', '.xls': 'Excel 表格', '.xlsx': 'Excel 表格', '.ppt': 'PowerPoint 演示', '.pptx': 'PowerPoint 演示' };
    const typeName = officeNames[ext] || 'Office 文档';
    return `
        <div class="viewer-header">
            <span class="viewer-title">${VIEWER_ICONS.fileText} ${escapeHtml(name)}</span>
            <button class="viewer-download-btn">⬇ 下载文件</button>
        </div>
        <div class="viewer-body viewer-info-body">
            <div class="viewer-icon">${VIEWER_ICONS.fileText}</div>
            <div class="viewer-info-text">
                <h3>${escapeHtml(typeName)}</h3>
                <p>此文件类型暂不支持在线预览</p>
                <p>请下载后使用 Microsoft Office 或 WPS 打开</p>
            </div>
        </div>
    `;
}

function showFileViewerError(safeId, quillWrapper, filename, errorMsg) {
    // 先关闭已有查看器
    closeFileViewer(safeId);
    const viewerContainer = document.createElement('div');
    viewerContainer.className = 'file-viewer-container';
    viewerContainer.style.cssText = 'flex:1;display:flex;flex-direction:column;min-height:0;overflow:hidden;';
    const viewer = document.createElement('div');
    viewer.className = 'file-viewer';
    viewer.style.cssText = 'flex:1;display:flex;flex-direction:column;min-height:0;overflow:hidden;';
    viewer.innerHTML = `
        <div class="viewer-header">
            <span class="viewer-title">${VIEWER_ICONS.fileText} ${escapeHtml(filename)}</span>
        </div>
        <div class="viewer-body viewer-info-body">
            <div class="viewer-icon">${VIEWER_ICONS.fileText}</div>
            <div class="viewer-info-text">
                <h3>加载失败</h3>
                <p>${escapeHtml(errorMsg)}</p>
            </div>
        </div>
    `;
    viewerContainer.appendChild(viewer);
    quillWrapper.appendChild(viewerContainer);
    _activeViewer = { safeId: safeId, container: viewerContainer, tempPaths: [] };
}

async function downloadFile(filename, content, ext) {
    try {
        // Blob URL 可以直接下载（无需 fetch）
        if (content && content.startsWith('blob:')) {
            weLog.info('editor', 'downloadFile: Blob URL 直接下载', { filename });
            const a = document.createElement('a');
            a.href = content;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            return;
        }
        
        let blob;
        
        // 处理 we-file:// URL（通过 fetch 获取文件内容）
        if (content && content.startsWith('we-file:')) {
            weLog.info('editor', 'downloadFile: 通过 we-file URL 下载', { filename, url: content });
            const response = await fetch(content);
            const arrayBuffer = await response.arrayBuffer();
            const mime = response.headers.get('Content-Type') || 'application/octet-stream';
            blob = new Blob([arrayBuffer], { type: mime });
        } else if (content && content.startsWith('data:')) {
            // 已经是 data URL，直接解码
            const parts = content.split(',');
            const mime = parts[0].split(';')[0].split(':')[1] || 'application/octet-stream';
            const base64Data = parts[1] || '';
            try {
                const binary = atob(base64Data);
                const array = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
                blob = new Blob([array], { type: mime });
            } catch (decodeErr) {
                weLog.warn('editor', 'downloadFile: base64 解码失败，使用原始内容', decodeErr);
                blob = new Blob([content], { type: mime });
            }
        } else if (content && content.startsWith('file:')) {
            // file:// URL，通过 fetch 获取
            const response = await fetch(content);
            const arrayBuffer = await response.arrayBuffer();
            const mime = response.headers.get('Content-Type') || 'application/octet-stream';
            blob = new Blob([arrayBuffer], { type: mime });
        } else {
            // 原始 base64 或文本
            const mimeMap = {
                '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
                '.mp4': 'video/mp4', '.webm': 'video/webm',
                '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
                '.pdf': 'application/pdf',
                '.zip': 'application/zip', '.rar': 'application/x-rar', '.7z': 'application/x-7z',
                '.json': 'application/json', '.js': 'application/javascript',
                '.txt': 'text/plain', '.md': 'text/markdown', '.html': 'text/html',
                '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            };
            const mime = mimeMap[ext] || 'application/octet-stream';
            try {
                const binary = atob(content);
                const array = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
                blob = new Blob([array], { type: mime });
            } catch (e) {
                // 如果不是 base64，当作文本处理
                blob = new Blob([content || ''], { type: mime });
            }
        }
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
        weLog.error('editor', 'downloadFile: 下载失败', e);
        showNotification('下载失败：' + (e.message || '未知错误'));
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}

/**
 * 确保 Quill 库已加载
 * 等待 Quill 全局变量可用，最多等待 5 秒
 * @returns {Promise<boolean>} Quill 是否可用
 */
async function ensureQuillReady() {
    // 如果 Quill 已经可用，直接返回
    if (typeof Quill !== 'undefined') {
        weLog.debug('editor', 'ensureQuillReady: Quill 已可用');
        return true;
    }
    
    weLog.info('editor', 'ensureQuillReady: 等待 Quill 加载...');
    
    // 等待最多 5 秒
    const maxWaitMs = 5000;
    const checkIntervalMs = 100;
    let elapsed = 0;
    
    while (elapsed < maxWaitMs) {
        await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
        elapsed += checkIntervalMs;
        
        if (typeof Quill !== 'undefined') {
            weLog.info('editor', `ensureQuillReady: Quill 在 ${elapsed}ms 后可用`);
            return true;
        }
    }
    
    // 超时，Quill 仍然不可用
    weLog.error('editor', `ensureQuillReady: Quill 在 ${maxWaitMs}ms 内未加载`);
    console.error('[ensureQuillReady] Quill library failed to load within timeout');
    return false;
}

/**
 * 确保编辑器容器存在
 * 如果不存在，尝试创建或重建
 * @param {string} safeId - 项目 ID
 * @returns {HTMLElement|null} 编辑器容器
 */
function ensureEditorContainer(safeId) {
    let quillWrapper = document.getElementById(`quill-${safeId}`);
    
    if (quillWrapper) {
        return quillWrapper;
    }
    
    weLog.warn('editor', `ensureEditorContainer: quill-${safeId} 不存在，尝试创建`);
    
    // 尝试在项目的 tab 元素中查找
    const tabElement = document.querySelector(`[data-tab-id="${safeId}"]`);
    if (tabElement) {
        const editorArea = tabElement.querySelector('.project-editor');
        if (editorArea) {
            quillWrapper = document.createElement('div');
            quillWrapper.className = 'quill-wrapper';
            quillWrapper.id = `quill-${safeId}`;
            editorArea.appendChild(quillWrapper);
            weLog.info('editor', `ensureEditorContainer: 已创建 quill-${safeId}`);
            return quillWrapper;
        }
    }
    
    // 如果无法创建，尝试查找其他可能的位置
    const contentContainer = document.getElementById('content-container');
    if (contentContainer) {
        weLog.warn('editor', `ensureEditorContainer: 无法为 ${safeId} 创建容器`);
    }
    
    return null;
}

/**
 * 设置 Quill 编辑器（初始化 + 加载内容 + 撤销管理）
 * 异步版本：等待 Quill 库加载，确保容器存在
 */
async function setupQuillEditor(safeId, filename, content, fromCache) {
    weLog.info('editor', `setupQuillEditor: 开始初始化 ${filename}`);
    
    // 1. 等待 Quill 库加载完成
    const quillReady = await ensureQuillReady();
    if (!quillReady) {
        weLog.error('editor', 'setupQuillEditor: Quill 库加载失败');
        console.error('[setupQuillEditor] Quill library not available');
        showNotification('编辑器库加载失败，请刷新页面重试');
        // 显示错误状态
        let quillWrapper = document.getElementById(`quill-${safeId}`);
        if (!quillWrapper) {
            quillWrapper = ensureEditorContainer(safeId);
        }
        if (quillWrapper) {
            quillWrapper.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-secondary);"><p>编辑器加载失败</p><p style="font-size:12px;margin-top:8px;">Quill 库未正确加载，请重启应用</p></div>';
            quillWrapper.style.display = '';
        }
        return false;
    }
    
    // 2. 确保编辑器容器存在
    let quillWrapper = ensureEditorContainer(safeId);
    if (!quillWrapper) {
        weLog.error('editor', `setupQuillEditor: 无法获取 quill-${safeId} 容器`);
        console.error('[setupQuillEditor] quill wrapper not found and cannot be created:', safeId);
        showNotification('编辑器容器创建失败');
        return false;
    }
    
    // 3. 检查项目
    const project = tabs[safeId];
    if (!project) {
        console.warn('[setupQuillEditor] project not found:', safeId);
        return false;
    }

    // --- 恢复容器显示状态 ---
    quillWrapper.style.display = '';
    quillWrapper.classList.remove('has-viewer');
    const embedEl = document.getElementById(`ng-embed-${safeId}`);
    if (embedEl) embedEl.style.display = 'none';
    
    // 移除加载提示 overlay
    const loadingOverlay = quillWrapper.querySelector('.file-loading-overlay');
    if (loadingOverlay) {
        console.log('[setupQuillEditor] 移除加载提示 overlay');
        loadingOverlay.remove();
    }

    // 确保 content 是字符串类型
    if (content === undefined || content === null) {
        console.warn('[setupQuillEditor] content is null/undefined, using empty string');
        content = '';
    }
    if (typeof content !== 'string') {
        console.warn('[setupQuillEditor] content is not string, converting:', typeof content);
        content = String(content);
    }

    console.log('[setupQuillEditor] 初始化编辑器:', filename, 'contentLength:', content.length, 'hasQuill:', !!quill);

    // --- 初始化 Quill（如果不存在）---
    if (!quill) {
        console.log('[setupQuillEditor] 创建新 Quill 实例');
        quillWrapper.innerHTML = '';
        const toolbarEl = editorToolbar();
        quillWrapper.appendChild(toolbarEl);
        const editorDiv = document.createElement('div');
        editorDiv.id = 'quill-editor';
        quillWrapper.appendChild(editorDiv);

        try {
            quill = new Quill(editorDiv, {
                theme: 'snow',
                modules: { toolbar: { container: toolbarEl } },
                placeholder: t('ui.start_writing') || '开始写作...',
            });
            
            // 覆盖 Quill 默认 prompt() 调用为 CSS 弹窗
            const originalLinkHandler = quill.theme?.keyboard?.bindKey?.['Enter']?.handler;
            // 覆盖 link 格式的 prompt 调用（Quill 默认用 prompt() 输入链接）
            if (quill.theme && quill.theme.modules && quill.theme.modules.toolbar) {
                const toolbarModule = quill.theme.modules.toolbar;
                if (toolbarModule.handlers && toolbarModule.handlers.link) {
                    const origLinkHandler = toolbarModule.handlers.link;
                    toolbarModule.addHandler('link', function(value) {
                        if (value) {
                            // 调用默认行为（设置链接）
                            origLinkHandler.call(this, value);
                        } else {
                            showInputDialog({
                                title: t('ui.enter_link') || '输入链接',
                                placeholder: 'https://...'
                            }).then(function(url) {
                                if (url) origLinkHandler.call(this, url);
                            }.bind(this));
                        }
                    });
                }
            }
        } catch (e) {
            console.error('[setupQuillEditor] Quill 初始化失败:', e);
            showEditorEmptyState(safeId, filename, 'read-error');
            showNotification('编辑器初始化失败：' + e.message);
            return false;
        }

        // --- 修复 Quill 下拉菜单被祖先 overflow:hidden 裁剪 ---
        // 把 .ql-expanded 里的 .ql-picker-options teleport 到 body，用 fixed 定位
        if (!window._quillPickerFixInstalled) {
            window._quillPickerFixInstalled = true;
            document.body.addEventListener('click', (e) => {
                // 当任何 picker 被点击展开时，处理它的 options
                const expanded = e.target.closest('.ql-picker');
                if (expanded) {
                    requestAnimationFrame(() => _teleportPickerOptions(expanded));
                }
            }, true);
            // 滚动/resize 时重新计算已 teleport 元素的位置
            window.addEventListener('scroll', _repositionTeleportedPickers, true);
            window.addEventListener('resize', _repositionTeleportedPickers);
        }
        // 立即处理当前已展开的（防止 Quill 程序式展开）
        document.querySelectorAll('.ql-toolbar .ql-picker.ql-expanded').forEach(_teleportPickerOptions);

        // 调试：确保工具栏正确显示
        console.log('[setupQuillEditor] Quill 初始化完成，工具栏调试信息:');
        console.log('  - toolbarEl:', toolbarEl ? toolbarEl.outerHTML.substring(0, 200) : 'null');
        console.log('  - toolbarEl children:', toolbarEl ? toolbarEl.children.length : 0);
        console.log('  - quill.root:', quill.root ? quill.root.className : 'null');
        
        // 强制确保工具栏可见（使用 !important 防止 CSS 覆盖）
        if (toolbarEl) {
            toolbarEl.style.setProperty('display', 'flex', 'important');
            toolbarEl.style.setProperty('visibility', 'visible', 'important');
            toolbarEl.style.setProperty('opacity', '1', 'important');
            toolbarEl.style.setProperty('height', 'auto', 'important');
            toolbarEl.style.setProperty('min-height', '44px', 'important');
            toolbarEl.style.setProperty('position', 'relative', 'important');
            toolbarEl.style.setProperty('top', '0', 'important');
            toolbarEl.style.setProperty('flex-shrink', '0', 'important');
            console.log('[setupQuillEditor] 工具栏样式已强制设置（含 !important）');
            
            // 强制设置工具栏内按钮可见
            const buttons = toolbarEl.querySelectorAll('button');
            buttons.forEach(btn => {
                btn.style.setProperty('display', 'inline-flex', 'important');
                btn.style.setProperty('visibility', 'visible', 'important');
                btn.style.setProperty('float', 'none', 'important');
            });
            
            // 强制设置工具栏内 select 可见
        const selects = toolbarEl.querySelectorAll('select');
        selects.forEach(sel => {
            sel.style.setProperty('display', 'inline-flex', 'important');
            sel.style.setProperty('visibility', 'visible', 'important');
            sel.style.setProperty('float', 'none', 'important');
        });

        // 滚动箭头 + 滚轮（tab-manager.js 已先加载 addScrollArrows 到全局）
        if (typeof addScrollArrows === 'function') {
            addScrollArrows(toolbarEl);
            // 滚轮 → 横向滚动
            toolbarEl.addEventListener('wheel', (e) => {
                if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                    e.preventDefault();
                    toolbarEl.scrollLeft += e.deltaY;
                }
            }, { passive: false });
        }
        }
        
        // 修复父容器高度链 - 确保编辑器在移动端正确显示
        if (quillWrapper) {
            // 修复向上遍历，确保每个父元素都有明确高度
            let el = quillWrapper;
            let depth = 0;
            while (el && depth < 10) {
                const tag = el.tagName;
                if (tag && (tag === 'DIV' || tag === 'SECTION' || tag === 'ARTICLE')) {
                    const rect = el.getBoundingClientRect();
                    if (rect.height === 0 || rect.height < 50) {
                        // 设置最小高度
                        el.style.setProperty('min-height', '100px', 'important');
                        el.style.setProperty('height', '100%', 'important');
                        el.style.setProperty('display', 'flex', 'important');
                        el.style.setProperty('flex-direction', 'column', 'important');
                    }
                }
                el = el.parentElement;
                depth++;
            }
            console.log('[setupQuillEditor] 父容器高度链已修复');
            
            // 移动端后初始化修复 - 延迟执行确保 Quill 完全初始化
            const isMobile = !document.body.classList.contains('is-desktop');
            if (isMobile) {
                setTimeout(() => {
                    weLog.info('editor', '移动端编辑器后初始化修复');
                    const toolbar = document.getElementById('quill-toolbar');
                    if (toolbar) {
                        // 重新应用工具栏样式
                        toolbar.style.setProperty('display', 'flex', 'important');
                        toolbar.style.setProperty('visibility', 'visible', 'important');
                        toolbar.style.setProperty('opacity', '1', 'important');
                        toolbar.style.setProperty('height', 'auto', 'important');
                        toolbar.style.setProperty('min-height', '48px', 'important');
                        toolbar.style.setProperty('position', 'relative', 'important');
                        toolbar.style.setProperty('top', '0', 'important');
                        toolbar.style.setProperty('flex-shrink', '0', 'important');
                        toolbar.style.setProperty('z-index', '1000', 'important');
                        
                        // 重新应用按钮样式
                        const buttons = toolbar.querySelectorAll('button');
                        buttons.forEach(btn => {
                            btn.style.setProperty('display', 'inline-flex', 'important');
                            btn.style.setProperty('visibility', 'visible', 'important');
                            btn.style.setProperty('float', 'none', 'important');
                            btn.style.setProperty('width', '40px', 'important');
                            btn.style.setProperty('height', '40px', 'important');
                        });
                        
                        // 重新应用 select 样式
                        const selects = toolbar.querySelectorAll('select');
                        selects.forEach(sel => {
                            sel.style.setProperty('display', 'inline-flex', 'important');
                            sel.style.setProperty('visibility', 'visible', 'important');
                            sel.style.setProperty('float', 'none', 'important');
                            sel.style.setProperty('height', '40px', 'important');
                        });
                        
                        // 重新应用格式分组样式
                        const formats = toolbar.querySelectorAll('.ql-formats');
                        formats.forEach(fmt => {
                            fmt.style.setProperty('display', 'inline-flex', 'important');
                            fmt.style.setProperty('visibility', 'visible', 'important');
                            fmt.style.setProperty('float', 'none', 'important');
                        });
                        
                        console.log('[setupQuillEditor] 移动端工具栏后初始化修复完成');
                    }
                    
                    // 再次修复高度链
                    let el2 = quillWrapper;
                    let depth2 = 0;
                    while (el2 && depth2 < 10) {
                        if (el2.tagName === 'DIV' || el2.tagName === 'SECTION') {
                            const rect2 = el2.getBoundingClientRect();
                            if (rect2.height === 0 || rect2.height < 50) {
                                el2.style.setProperty('min-height', '100px', 'important');
                                el2.style.setProperty('height', '100%', 'important');
                                el2.style.setProperty('display', 'flex', 'important');
                                el2.style.setProperty('flex-direction', 'column', 'important');
                            }
                        }
                        el2 = el2.parentElement;
                        depth2++;
                    }
                }, 100);
            }
        }

        // 占位符处理
        let placeholderHidden = false;
        const origQuillUpdate = quill.update.bind(quill);
        quill.update = function(source) {
            const result = origQuillUpdate(source);
            if (placeholderHidden) this.root.classList.remove('ql-blank');
            return result;
        };
        const hidePlaceholder = () => {
            if (placeholderHidden) return;
            placeholderHidden = true;
            quill.root.classList.remove('ql-blank');
        };
        quill.root.addEventListener('mousedown', hidePlaceholder);
        quill.root.addEventListener('keydown', hidePlaceholder);
        quill.root.addEventListener('keydown', handleSmartBrackets);

        // 工具栏按钮
        const toolbarButtons = [
            ['.btn-export-md', 'showExportMenu'],
            ['.btn-toggle-toc', 'toggleTableOfContents'],
            ['.btn-insert-card', 'showInsertCardDialog'],
            ['.btn-history', 'toggleHistoryPanel']
        ];
        toolbarButtons.forEach(([sel, fn]) => {
            const btn = toolbarEl.querySelector(sel);
            if (btn && typeof window[fn] === 'function') btn.onclick = () => window[fn](btn);
        });

        // 事件监听
        quill.on('text-change', () => { project.dirty = true; updateStatusBar(); updateEditorStats(); });
        
        // 字体设置
        if (savedFontFamily) quill.root.style.fontFamily = savedFontFamily;
        if (savedFontSize) quill.root.style.fontSize = savedFontSize + 'px';
        currentQuillProjectId = safeId;
    } else {
        console.log('[setupQuillEditor] 复用已有 Quill 实例');
        // 复用已有 Quill 实例：确保容器正确
        // 注意：加载提示可能已经用 innerHTML 覆盖了 quillWrapper 的内容
        // 所以需要确保 Quill 的 DOM 元素被正确重新挂载
        
        const editor = quill.container;
        const toolbar = editor.previousElementSibling && editor.previousElementSibling.classList.contains('ql-toolbar') 
            ? editor.previousElementSibling 
            : null;
        
        // 检查 editor 是否还在 quillWrapper 中
        if (editor.parentElement !== quillWrapper) {
            console.log('[setupQuillEditor] Quill 容器不在 wrapper 中，重新挂载');
            // 清空 wrapper 中的加载提示等内容
            quillWrapper.innerHTML = '';
            // 重新添加 toolbar 和 editor
            if (toolbar) {
                toolbar.style.display = '';
                quillWrapper.appendChild(toolbar);
            }
            editor.style.display = '';
            quillWrapper.appendChild(editor);
        } else {
            console.log('[setupQuillEditor] Quill 容器已在 wrapper 中');
            if (toolbar) toolbar.style.display = '';
            editor.style.display = '';
        }
        currentQuillProjectId = safeId;
    }

    // --- 验证 quill.root 存在 ---
    if (!quill.root) {
        console.error('[setupQuillEditor] quill.root 不存在');
        showEditorEmptyState(safeId, filename, 'read-error');
        return;
    }

    // --- 加载内容（带错误处理）---
    quill.root.innerHTML = '';

    if (!content || content.trim() === '') {
        // 空内容，直接跳过加载逻辑，下面统一做状态标记
        console.log('[setupQuillEditor] 内容为空');
    } else {
        // 1. 优先检测 Quill delta JSON 格式
        let loaded = false;
        try {
            const parsed = JSON.parse(content);
            let delta = null;
            if (parsed && parsed.__wfmt === 'quill-delta' && Array.isArray(parsed.ops)) {
                delta = parsed;
            } else if (parsed && Array.isArray(parsed.ops) && typeof quill.setContents === 'function') {
                delta = parsed;
            }
            if (delta) {
                console.log('[setupQuillEditor] 检测到 Quill delta 格式，用 setContents 加载');
                quill.setContents(delta, Quill.sources.SILENT);
                loaded = true;
            }
        } catch (e) { /* 不是合法 JSON 或 delta 加载失败，继续走下面 */ }

        // 2. HTML 或纯文本
        if (!loaded) {
            const isHtml = /<[a-z][\s\S]*>/i.test(content);
            console.log('[setupQuillEditor] 加载内容, isHtml:', isHtml, 'contentLength:', content.length);
            if (isHtml) {
                quill.clipboard.dangerouslyPasteHTML(0, content, Quill.sources.SILENT);
            } else {
                quill.setText(content, Quill.sources.SILENT);
            }
        }
        console.log('[setupQuillEditor] 内容加载成功');
    }

    // 应用字体
    if (savedFontFamily) quill.root.style.fontFamily = savedFontFamily;
    if (savedFontSize) quill.root.style.fontSize = savedFontSize + 'px';

    // --- 状态标记 ---
    project.currentFile = filename;
    project.dirty = fromCache;
    project.savedContent = content;
    updateStatusBar();
    updateEditorStats();

    // --- 撤销管理 ---
    ensureGlobalUndo(safeId);
    project._quillLastHtml = null;
    quill.off('text-change', project._changeHandler);
    quill.off('text-change', project._globalQuillHandler);
    
    project._changeHandler = () => { project.dirty = true; updateStatusBar(); };
    project._globalQuillHandler = (delta, oldDelta, source) => {
        const gu = project.globalUndo;
        if (!gu || source !== 'user' || gu.suppress > 0) return;
        const prev = project._quillLastHtml;
        const next = quill.root.innerHTML;
        if (prev === next) return;
        
        // 分析操作类型并生成详细 label
        let opLabel = '编辑文本';
        let opSubtype = 'input'; // 用于合并判断
        
        if (delta && delta.ops) {
            const ops = delta.ops;
            // 判断操作类型
            const hasInsert = ops.some(o => o.insert != null);
            const hasDelete = ops.some(o => o.delete != null);
            const hasRetain = ops.some(o => o.retain != null);
            const hasFormat = ops.some(o => o.attributes != null);
            
            if (hasDelete && !hasInsert) {
                opLabel = '删除文字';
                opSubtype = 'delete';
            } else if (hasInsert) {
                // 检查插入的内容类型
                const insertedText = ops.filter(o => o.insert != null).map(o => {
                    if (typeof o.insert === 'string') return o.insert;
                    return '';
                }).join('');
                
                if (insertedText === '\n') {
                    opLabel = '换行';
                    opSubtype = 'newline';
                } else if (insertedText.includes('\n')) {
                    opLabel = '输入（含换行）';
                    opSubtype = 'input-newline';
                } else if (hasFormat) {
                    opLabel = '插入并格式化';
                    opSubtype = 'format';
                } else {
                    opLabel = '输入文字';
                    opSubtype = 'input';
                }
            } else if (hasFormat && hasRetain && !hasInsert && !hasDelete) {
                opLabel = '格式化文本';
                opSubtype = 'format';
            }
        }
        
        gu.push({
            type: 'quill',
            file: project.currentFile || filename,
            label: opLabel,
            subtype: opSubtype,
            prev: prev == null ? '' : prev,
            next: next,
        });
        project._quillLastHtml = next;
    };
    quill.on('text-change', project._changeHandler);
    quill.on('text-change', project._globalQuillHandler);
    project._quillLastHtml = quill.root.innerHTML;

    // 高亮文件树
    const tree = document.getElementById(`file-tree-${safeId}`);
    tree?.querySelectorAll('.tree-file').forEach(el => {
        el.classList.remove('active');
        el.classList.remove('selected');
    });
    tree?.querySelector(`[data-file="${filename}"]`)?.classList.add('active');

    // 聚焦编辑器
    setTimeout(() => { if (quill) quill.focus(); }, 100);
    
    weLog.info('editor', `setupQuillEditor: 初始化完成 ${filename}`);
    return true;
}

/**
 * 销毁当前标签页的所有编辑器实例
 * 必须在打开新文件之前调用
 */
function destroyCurrentEditors(safeId) {
    const project = tabs[safeId];
    if (!project) return;

    // 1. 保存并销毁节点图实例
    if (embeddedNodeGraphs[safeId]) {
        try { destroyEmbeddedNodeGraph(safeId); } catch (e) { /* ignore */ }
    }

    // 2. 关闭文件查看器
    try { closeFileViewer(safeId); } catch (e) { /* ignore */ }

    // 3. 隐藏节点图容器
    const embedEl = document.getElementById(`ng-embed-${safeId}`);
    if (embedEl) embedEl.style.display = 'none';

    // 4. 保存并销毁 Quill 实例（如果是当前项目的编辑器）
    const quillWrapper = document.getElementById(`quill-${safeId}`);
    if (quillWrapper) {
        // 4a. 暂存当前 Quill 内容（如果有未保存的）
        if (project.currentFile && quill 
            && !project.currentFile.endsWith('.node.json')) {
            project.fileCache = project.fileCache || {};
            const cacheKey = project.currentFile;
            if (project.dirty) {
                project.fileCache[cacheKey] = _fcWrap('quill', quill.root.innerHTML);
            }
        }
        
        // 4b. 销毁 Quill 实例（如果这是当前激活的编辑器）
        if (currentQuillProjectId === safeId && quill) {
            try {
                // 移除事件监听
                quill.off('text-change');
                // 清空内容
                quill.setText('');
                // 手动销毁 Quill 实例（Quill 没有原生 destroy 方法）
                // 移除所有事件监听器
                if (quill.theme && quill.theme.modules) {
                    Object.keys(quill.theme.modules).forEach(key => {
                        try {
                            const mod = quill.theme.modules[key];
                            if (mod && mod.handlers) {
                                Object.keys(mod.handlers).forEach(h => {
                                    try { mod.removeHandler(h); } catch (e) {}
                                });
                            }
                        } catch (e) {}
                    });
                }
                // 移除编辑器根元素的所有子节点
                if (quill.root && quill.root.parentNode) {
                    // 清空编辑器内容
                    quill.root.innerHTML = '';
                }
            } catch (e) {
                weLog.warn('editor', 'destroyCurrentEditors: Quill销毁异常', e);
            }
            quill = null;
            currentQuillProjectId = null;
        }
        
        // 4c. 清空容器内容并隐藏
        quillWrapper.innerHTML = '';
        quillWrapper.style.display = 'none';
        quillWrapper.classList.add('has-viewer');
    }

    // 5. 暂存 Markdown 内容
    if (markdownEditor && project.currentFile && project.dirty
        && !project.currentFile.endsWith('.node.json')) {
        project.fileCache = project.fileCache || {};
        project.fileCache[project.currentFile] = _fcWrap('md', markdownEditor.value);
    }
    
    // 6. 销毁 Markdown 编辑器
    if (markdownEditor && currentQuillProjectId === safeId) {
        try {
            markdownEditor.remove();
        } catch (e) { /* ignore */ }
        markdownEditor = null;
    }

    // 7. 清除 TOC 面板
    if (tocPanel) {
        tocPanel.remove();
        tocPanel = null;
    }
}

// 辅助函数：移除加载提示 overlay
function removeLoadingOverlay(safeId) {
    const quillWrapper = document.getElementById(`quill-${safeId}`);
    if (quillWrapper) {
        const overlay = quillWrapper.querySelector('.file-loading-overlay');
        if (overlay) {
            console.log('[removeLoadingOverlay] 移除加载提示');
            overlay.remove();
        }
    }
}

async function openProjectFile(safeId, filename) {
    weLog.info('editor', '→ openProjectFile 开始', { safeId, filename });
    const project = tabs[safeId];
    if (!project) {
        weLog.warn('editor', 'openProjectFile: project 不存在', { safeId });
        return;
    }

    // 统一分发文件选中事件（更新文件树高亮）
    document.dispatchEvent(new CustomEvent('file-selected', { detail: { filename, safeId } }));

    // === STEP 0: 移除初始加载状态 ===
    const initialLoading = document.getElementById(`loading-${safeId}`);
    if (initialLoading) initialLoading.remove();

    // === STEP 1: 先销毁当前编辑器 ===
    destroyCurrentEditors(safeId);

    // === STEP 1.5: 显示加载提示 ===
    const quillWrapper = document.getElementById(`quill-${safeId}`);
    if (quillWrapper) {
        quillWrapper.style.display = '';
        quillWrapper.classList.remove('has-viewer');
        
        // 移除旧的加载提示 overlay
        const oldOverlay = quillWrapper.querySelector('.file-loading-overlay');
        if (oldOverlay) oldOverlay.remove();
        
        // 创建新的加载提示 overlay（使用 position:absolute 覆盖，不破坏原有 DOM）
        const loadingOverlay = document.createElement('div');
        loadingOverlay.className = 'file-loading-overlay';
        loadingOverlay.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:var(--bg-primary, #fff);z-index:100;display:flex;flex-direction:column;align-items:center;justify-content:center;';
        loadingOverlay.innerHTML = `
            <div class="loading-spinner" style="width:40px;height:40px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin 0.8s linear infinite;margin-bottom:16px;"></div>
            <div class="loading-text" style="font-size:14px;color:var(--text-secondary);">正在加载文件...</div>
            <style>
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            </style>
        `;
        quillWrapper.style.position = quillWrapper.style.position || 'relative';
        quillWrapper.appendChild(loadingOverlay);
    }

    // === STEP 2: 检测文件类型 ===
    const meta = (typeof window.getFileMetadata === 'function') 
        ? window.getFileMetadata(filename) 
        : { category: 'text', ext: '', isImage: false, isVideo: false, isAudio: false, isPdf: false, isArchive: false, isBinary: false, isOffice: false, isText: true, isNodeGraph: false };
    
    weLog.info('editor', 'openProjectFile: 文件类型', { filename, category: meta.category, ext: meta.ext });

    // 点击文件即切完整 TA（从目录独占进入正式编辑模式）
    if (window.setTaState && document.body.classList.contains('is-desktop')) {
        window.setTaState(safeId, 'ta');
    }

    const oldFile = project.currentFile || null;

    // === STEP 3: 按类型路由到对应编辑器 ===

    // --- 节点图 (.node.json) ---
    if (meta.category === 'nodegraph') {
        weLog.info('editor', 'openProjectFile: → 节点图编辑器', { filename });
        try {
            const ngResult = await openEmbeddedNodeGraph(safeId, filename);
            removeLoadingOverlay(safeId); // 移除加载提示
            if (ngResult === false) {
                weLog.warn('editor', 'openProjectFile: 节点图打开失败，显示不支持状态');
                showEditorUnsupportedState(safeId, filename, meta);
                return;
            }
            weLog.info('editor', 'openProjectFile: ← 节点图加载成功');
            _commitFileSwitchOp(safeId, oldFile, filename);
            if (typeof highlightFileInTree === 'function') highlightFileInTree(safeId, filename);
            return;
        } catch (ngErr) {
            removeLoadingOverlay(safeId); // 移除加载提示
            weLog.error('editor', 'openProjectFile: 节点图异常', ngErr);
            showEditorUnsupportedState(safeId, filename, meta);
            showNotification('节点图加载失败：' + (ngErr.message || '未知错误'));
            return;
        }
    }

    // --- 查看器（图片/视频/音频/PDF）---
    if (meta.category === 'viewer') {
        weLog.info('editor', 'openProjectFile: → 查看器', { filename, ext: meta.ext });
        try {
            await openFileViewer(safeId, filename, { 
                isImage: meta.isImage, isVideo: meta.isVideo, isAudio: meta.isAudio, 
                isPdf: meta.isPdf, isArchive: meta.isArchive, isBinary: meta.isBinary, 
                isOffice: meta.isOffice, ext: meta.ext 
            });
            removeLoadingOverlay(safeId); // 移除加载提示
            weLog.info('editor', 'openProjectFile: ← 查看器加载成功');
            _commitFileSwitchOp(safeId, oldFile, filename);
            if (typeof highlightFileInTree === 'function') highlightFileInTree(safeId, filename);
            return;
        } catch (viewerErr) {
            removeLoadingOverlay(safeId); // 移除加载提示
            weLog.error('editor', 'openProjectFile: 查看器打开失败', viewerErr);
            showEditorUnsupportedState(safeId, filename, meta);
            showNotification('查看器打开失败：' + (viewerErr.message || '未知错误'));
            return;
        }
    }

    // --- 不支持的文件（二进制/归档/不可识别）---
    if (meta.category === 'unsupported') {
        weLog.info('editor', 'openProjectFile: → 不支持提示', { filename, ext: meta.ext });
        removeLoadingOverlay(safeId); // 移除加载提示
        showEditorUnsupportedState(safeId, filename, meta);
        return;
    }

    // --- 富文本 (.txt, .md) ---
    if (meta.category === 'text') {
        weLog.info('editor', 'openProjectFile: → 富文本编辑器', { filename });

        // 添加超时保护
        let loadTimeout = null;
        const timeoutPromise = new Promise((_, reject) => {
            loadTimeout = setTimeout(() => {
                reject(new Error('文件加载超时（10秒）'));
            }, 10000);
        });

        try {
            // 读取文件内容
            let content;
            let fromCache = false;
            if (project.fileCache) {
                let cached = _fcUnwrap('quill', project.fileCache[filename]);
                if (cached === undefined) cached = _fcUnwrap('text', project.fileCache[filename]);
                if (cached !== undefined) {
                    content = cached;
                    fromCache = true;
                }
            }
            if (!fromCache) {
                weLog.info('editor', 'openProjectFile: 开始读取文件内容', { filename });
                const readStart = performance.now();
                const result = await Promise.race([
                    weAPI.readFile(project.projectPath, filename),
                    timeoutPromise
                ]);
                weLog.info('editor', 'openProjectFile: 文件读取完成', { 
                    filename, 
                    time: Math.round(performance.now() - readStart) + 'ms',
                    success: result.success,
                    contentLength: result.content ? result.content.length : 0
                });
                if (!result.success) {
                    showEditorEmptyState(safeId, filename, 'read-error');
                    showNotification(t('ui.read_failed') + ': ' + (result.error || '未知错误'));
                    return;
                }
                content = result.content;
            }

            weLog.info('editor', 'openProjectFile: 初始化编辑器', { filename, contentLength: content ? content.length : 0 });
            // 使用 setupQuillEditor 初始化并加载内容
            const editorReady = await setupQuillEditor(safeId, filename, content, fromCache);
            if (!editorReady) {
                weLog.warn('editor', 'openProjectFile: 编辑器初始化失败');
                return;
            }
            _commitFileSwitchOp(safeId, oldFile, filename);
            if (typeof highlightFileInTree === 'function') highlightFileInTree(safeId, filename);
            weLog.info('editor', 'openProjectFile: 完成', { filename });
            return;
        } catch (err) {
            console.error('[openProjectFile] 富文本加载异常:', err.message);
            showEditorEmptyState(safeId, filename, 'read-error');
            showNotification('文件加载失败：' + (err.message || '未知错误'));
            return;
        } finally {
            if (loadTimeout) clearTimeout(loadTimeout);
        }
    }

    // 兜底：未知类型
    removeLoadingOverlay(safeId); // 移除加载提示
    showEditorUnsupportedState(safeId, filename, meta);
}

// ====== 文件保存 ======

async function saveCurrentFile(silent) {
    weLog.info('editor', '→ saveCurrentFile 开始', { silent, isSaving });
    if (isSaving) {
        weLog.info('editor', 'saveCurrentFile: 已在保存中，标记 pendingSave');
        pendingSave = true;
        return;
    }

    const project = tabs[activeTabId];
    if (!project || !project.currentFile) {
        weLog.warn('editor', 'saveCurrentFile: project 或 currentFile 不存在');
        return;
    }

    isSaving = true;
    pendingSave = false;

    // 独立节点图标签页（非嵌入式）
    if (activeTabId && activeTabId.startsWith('nodegraph-') && typeof nodeGraphInstances !== 'undefined' && nodeGraphInstances[activeTabId]) {
        weLog.info('editor', 'saveCurrentFile: 走独立节点图保存分支', { tabId: activeTabId });
        try {
            if (typeof saveNodeGraph === 'function') await saveNodeGraph(activeTabId);
        } catch (e) {
            weLog.error('editor', 'saveCurrentFile: 独立节点图保存异常', e && e.stack ? e.stack : String(e));
        } finally {
            isSaving = false;
            if (pendingSave) { setTimeout(() => { pendingSave = false; saveCurrentFile(silent); }, 0); }
        }
        return;
    }

    // 嵌入节点图：走节点图保存逻辑
    if (embeddedNodeGraphs[activeTabId] && project.currentFile.endsWith('.node.json')) {
        weLog.info('editor', 'saveCurrentFile: 走嵌入节点图保存分支', { file: project.currentFile });
        try {
            const inst = embeddedNodeGraphs[activeTabId];
            // 保存前确保 ID 唯一，防止因多次保存累积重复 ID
            inst.engine._dedupeIds();
            const data = inst.engine.getData();
            const content = JSON.stringify(data, null, 2);
            showNotification(t('ui.saving') || '正在保存...', 0);
            const res = await weAPI.saveFile(project.projectPath, project.currentFile, content);
            if (res.success) {
                inst.dirty = false;
                project.dirty = false;
                // 【修复切回内容消失 #7】保存成功后双 key 清理缓存（完整路径 + basename）
                // 不然下次切回来如果 basename key 还在，fromCache=true 会误标 dirty，给用户"未保存"假象
                if (project.fileCache) {
                    const cf = project.currentFile;
                    delete project.fileCache[cf];
                    if (cf.includes('/') || cf.includes('\\')) {
                        delete project.fileCache[cf.split(/[\\/]/).pop()];
                    }
                }
                const status = document.getElementById(`ng-status-${activeTabId}`);
                if (status) status.textContent = '';
                updateStatusBar();
                showNotification(t('ui.saved') || '已保存');
            } else {
                showNotification((t('ui.save_failed') || '保存失败') + ': ' + res.error);
            }
        } catch (e) {
            weLog.error('editor', 'saveCurrentFile: 节点图保存异常', e && e.stack ? e.stack : String(e));
            showNotification((t('ui.save_failed') || '保存失败') + ': ' + e.message);
        } finally {
            isSaving = false;
            if (pendingSave) { setTimeout(() => { pendingSave = false; saveCurrentFile(silent); }, 0); }
        }
        return;
    }

    const projectMode = project.projectMode || 'rich';
    let content;
    if (projectMode === 'markdown') {
        if (!markdownEditor) {
            weLog.warn('editor', 'saveCurrentFile: markdownEditor 不存在');
            isSaving = false;
            return;
        }
        content = markdownEditor.value;
    } else {
        if (!quill) {
            weLog.warn('editor', 'saveCurrentFile: quill 不存在');
            isSaving = false;
            return;
        }
        content = quill.root.innerHTML;
    }
    weLog.info('editor', 'saveCurrentFile: 准备保存', { projectMode, file: project.currentFile, contentLen: content.length });

    // 通知用户正在保存（持久显示，直到保存完成）
    showNotification(t('ui.saving') || '正在保存...', 0);

    try {
        const res = await weAPI.saveFile(project.projectPath, project.currentFile, content);
        if (res.success) {
            weLog.info('editor', '← saveCurrentFile 完成: 保存成功');
            project.dirty = false;
            project.savedContent = content;
            if (project.fileCache) {
                delete project.fileCache[project.currentFile];
            }
            updateStatusBar();
            showNotification(t('ui.saved') || '已保存');
        } else {
            weLog.error('editor', 'saveCurrentFile: 保存失败', { error: res.error });
            showNotification((t('ui.save_failed') || '保存失败') + ': ' + res.error);
        }
    } catch (e) {
        weLog.error('editor', 'saveCurrentFile 失败', e && e.stack ? e.stack : String(e));
        showNotification((t('ui.save_failed') || '保存失败') + ': ' + e.message);
    } finally {
        isSaving = false;
        // 如果保存期间有新的保存请求，立即再执行一次
        if (pendingSave) {
            weLog.info('editor', 'saveCurrentFile: 检测到 pendingSave，递归再保存一次');
            pendingSave = false;
            saveCurrentFile(silent);
        }
    }
}

// 独立保存项目功能：不依赖打开的文件，直接打包项目
async function saveProjectOnly() {
    weLog.info('editor', '→ saveProjectOnly 开始');
    
    // 首先尝试保存当前打开的文件（如果有）
    if (activeTabId && tabs[activeTabId]?.currentFile) {
        weLog.info('editor', 'saveProjectOnly: 先保存当前文件');
        try {
            await saveCurrentFile(true);
        } catch (e) {
            weLog.warn('editor', 'saveProjectOnly: 保存当前文件失败', e);
        }
    }
    
    // 查找项目路径
    let projectPath = null;
    if (activeTabId && tabs[activeTabId]?.projectPath) {
        projectPath = tabs[activeTabId].projectPath;
    } else {
        // 从所有标签页中查找项目路径
        for (const id in tabs) {
            if (tabs[id]?.projectPath) {
                projectPath = tabs[id].projectPath;
                break;
            }
        }
    }
    
    if (!projectPath) {
        weLog.warn('editor', 'saveProjectOnly: 没有找到项目路径');
        showNotification(t('ui.no_project') || '没有打开的项目');
        return;
    }
    
    weLog.info('editor', 'saveProjectOnly: 保存项目', { projectPath });
    showNotification(t('ui.saving') || '正在保存...', 0);
    
    try {
        const result = await weAPI.saveProject(projectPath);
        if (result.success) {
            weLog.info('editor', '← saveProjectOnly 完成: 保存成功');
            showNotification(t('ui.saved') || '已保存');
        } else {
            weLog.error('editor', 'saveProjectOnly: 保存失败', { error: result.error });
            showNotification((t('ui.save_failed') || '保存失败') + ': ' + result.error);
        }
    } catch (e) {
        weLog.error('editor', 'saveProjectOnly 异常', e);
        showNotification((t('ui.save_failed') || '保存失败') + ': ' + e.message);
    }
}

// 将函数暴露到全局
window.saveProjectOnly = saveProjectOnly;

async function addFileToProject(safeId) {
    weLog.info('editor', '→ addFileToProject 开始', { safeId });
    const project = tabs[safeId];
    if (!project) {
        weLog.warn('editor', 'addFileToProject: project 不存在', { safeId });
        return;
    }
    const result = await showPrompt(t('ui.new_item') || '新建', t('ui.file_name') || '文件名', { typeSwitch: true, defaultType: 'file', showImport: true });
    if (!result) {
        weLog.debug('editor', 'addFileToProject: 用户取消输入');
        return;
    }
    
    // 处理从外部导入
    if (result.type === 'import') {
        weLog.info('editor', 'addFileToProject: 触发从外部导入');
        importFilesFromExternal(safeId, project.projectPath, '');
        return;
    }
    
    const name = result.value;
    if (!name) {
        weLog.debug('editor', 'addFileToProject: 文件名为空');
        return;
    }
    weLog.info('editor', 'addFileToProject: 用户输入', { name, type: result.type });

    if (result.type === 'folder') {
        weLog.info('editor', 'addFileToProject: 走了创建文件夹分支', { name });
        const res = await weAPI.addFolder(project.projectPath, name);
        if (res.success) {
            if (res.fileList) {
                project.fileList = res.fileList;
                refreshFileTree(safeId, res.fileList);
            }
            showNotification(t('ui.folder_created') || '文件夹已创建');
        } else {
            weLog.error('editor', 'addFileToProject: 创建文件夹失败', { error: res.error });
            showNotification((t('ui.create_failed') || '创建失败') + ': ' + res.error);
        }
    } else if (result.type === 'nodegraph') {
        weLog.info('editor', 'addFileToProject: 走了创建节点图分支', { name });
        // 自动补全后缀（如果用户未加）
        let graphFileName = name.trim();
        if (!graphFileName.endsWith('.node.json')) {
            // 如果已经以 .json 结尾但不以 .node.json 结尾则替换，否则追加
            if (graphFileName.endsWith('.json')) {
                graphFileName = graphFileName.replace(/\.json$/, '.node.json');
            } else {
                graphFileName = graphFileName + '.node.json';
            }
        }
        // 创建空节点图文件（空 JSON：nodes+edges）
        const emptyJson = JSON.stringify({ nodes: [], edges: [] }, null, 2);
        const createRes = await weAPI.saveFile(project.projectPath, graphFileName, emptyJson);
        if (createRes.success) {
            if (createRes.fileList) {
                project.fileList = createRes.fileList;
                refreshFileTree(safeId, createRes.fileList);
            }
            showNotification(t('ui.nodegraph_created') || '节点图已创建');
            // 立即在右侧编辑区打开
            openProjectFile(safeId, graphFileName);
        } else {
            weLog.error('editor', 'addFileToProject: 创建节点图文件失败', { error: createRes.error });
            showNotification((t('ui.create_failed') || '创建失败') + ': ' + createRes.error);
        }
    } else {
        weLog.info('editor', 'addFileToProject: 走了创建文件分支', { name });
        const res = await weAPI.addFile(project.projectPath, name);
        if (res.success) {
            if (res.fileList) {
                project.fileList = res.fileList;
                refreshFileTree(safeId, res.fileList);
            }
            openProjectFile(safeId, name);
        } else {
            weLog.error('editor', 'addFileToProject: 添加文件失败', { error: res.error });
            showNotification((t('ui.add_failed') || '添加失败') + ': ' + res.error);
        }
    }
    weLog.info('editor', '← addFileToProject 完成');
}

// ================================================================
// 辅助函数：文件读取
// ================================================================

// 读取文件为文本
function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsText(file, 'UTF-8');
    });
}

// 读取文件为 Data URL（base64）
function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(file);
    });
}

// 从外部导入文件（通用函数）
function importFilesFromExternal(safeId, projectPath, targetFolder = '') {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = true;
    fileInput.style.display = 'none';

    fileInput.onchange = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        showNotification((t('ui.importing') || '正在导入') + ' ' + files.length + ' ' + (t('ui.items') || '个文件') + '...', 3000);

        let importedCount = 0;
        let failedCount = 0;
        const textExts = (window.FILE_CATEGORIES && window.FILE_CATEGORIES.TEXT_EXTENSIONS) || [];

        for (const file of files) {
            try {
                const targetPath = targetFolder ? (targetFolder + '/' + file.name) : file.name;
                const ext = file.name.split('.').pop().toLowerCase();
                const isText = textExts.some(e => ('.' + ext).toLowerCase() === e) || (file.type && file.type.startsWith('text/'));

                if (isText) {
                    const content = await readFileAsText(file);
                    const res = await weAPI.saveFile(projectPath, targetPath, content);
                    if (res.success) importedCount++; else failedCount++;
                } else {
                    const dataUrl = await readFileAsDataURL(file);
                    const base64Data = dataUrl.split(',')[1];
                    const res = await weAPI.storeBinary(projectPath, targetPath, base64Data);
                    if (res.success) importedCount++; else failedCount++;
                }
            } catch (err) {
                weLog.error('editor', 'importFilesFromExternal fail', err && err.stack ? err.stack : String(err));
                failedCount++;
            }
        }

        const updated = await weAPI.openProject(projectPath);
        if (updated.success) {
            tabs[safeId].fileList = updated.fileList;
            refreshFileTree(safeId, updated.fileList);
        }

        showNotification((t('ui.import_done') || '导入完成') + ': ' + importedCount + (failedCount > 0 ? (' (' + (t('ui.failed') || '失败') + ' ' + failedCount + ')') : ''));
    };

    document.body.appendChild(fileInput);
    fileInput.click();
    setTimeout(() => fileInput.remove(), 1000);
}

// 暴露到全局，供 filetree.js 等其他模块调用
window.importFilesFromExternal = importFilesFromExternal;

// ================================================================
// 图片卡片辅助函数
// ================================================================

// 插入图片卡片（供 btn-image-card 委托事件调用）
function quillInsertImageCard(url) {
    try {
        var sel = quill.getSelection(true);
        var idx = (sel && sel.index !== undefined) ? sel.index : quill.getLength();
        quill.insertEmbed(idx, 'imageCard', { src: url, width: '', height: '', objectFit: 'contain' }, Quill.sources.USER);
        quill.setSelection(idx + 1, 0, Quill.sources.USER);
    } catch (e) {
        console.warn('[core] quillInsertImageCard 失败:', e);
    }
}

// ================================================================
// 图片卡片选择 / 缩放 / 内容缩放工具栏
// ================================================================

var _selectedImageCard = null;  // 当前选中的图片卡片 DOM
var _imageFitToolbar = null;    // 浮动工具栏 DOM
var _imageResizing = false;     // 是否正在拖拽缩放

// 创建或获取浮动工具栏
function _getImageFitToolbar() {
    if (!_imageFitToolbar) {
        _imageFitToolbar = document.createElement('div');
        _imageFitToolbar.className = 'ql-image-fit-toolbar';
        _imageFitToolbar.innerHTML =
            '<button data-fit="cover">' + (t('ui.img_fit_cover') || '铺满') + '</button>' +
            '<button data-fit="contain">' + (t('ui.img_fit_contain') || '适应') + '</button>' +
            '<button data-fit="fill">' + (t('ui.img_fit_fill') || '拉伸') + '</button>' +
            '<button data-fit="none">' + (t('ui.img_fit_none') || '原尺寸') + '</button>';
        document.body.appendChild(_imageFitToolbar);

        // 点击 fit 选项
        _imageFitToolbar.addEventListener('click', function (e) {
            var btn = e.target.closest('button');
            if (!btn || !_selectedImageCard) return;
            var fit = btn.getAttribute('data-fit');
            if (!fit) return;
            _applyImageFit(_selectedImageCard, fit);
        });
    }
    return _imageFitToolbar;
}

// 应用 object-fit 到图片卡片
function _applyImageFit(card, fit) {
    if (!card) return;
    var wrapper = card.querySelector('.ql-image-card-wrapper');
    var img = wrapper && wrapper.querySelector('img');
    if (!img || !wrapper) return;
    img.style.objectFit = fit;
    wrapper.setAttribute('data-object-fit', fit);
    // 更新工具栏激活状态
    var tb = _getImageFitToolbar();
    tb.querySelectorAll('button').forEach(function (b) {
        b.classList.toggle('ql-image-fit-active', b.getAttribute('data-fit') === fit);
    });
}

// 选中图片卡片
function _selectImageCard(card) {
    // 取消旧选中
    if (_selectedImageCard && _selectedImageCard !== card) {
        _selectedImageCard.classList.remove('ql-image-card-selected');
    }
    _selectedImageCard = card;
    if (card) {
        card.classList.add('ql-image-card-selected');
        // 显示浮动工具栏（先显示才能获取 offsetWidth）
        var tb = _getImageFitToolbar();
        tb.classList.add('ql-image-fit-toolbar-visible');
        var wrapper = card.querySelector('.ql-image-card-wrapper');
        var fit = wrapper ? wrapper.getAttribute('data-object-fit') || 'contain' : 'contain';
        _applyImageFit(card, fit);
        // 定位工具栏到卡片上方，实时居中
        var rect = card.getBoundingClientRect();
        var tbW = tb.offsetWidth || 180; // fallback 宽度
        tb.style.top = (rect.top - 44) + 'px';
        tb.style.left = Math.max(8, (window.innerWidth - tbW) / 2) + 'px';
    } else {
        // 隐藏工具栏
        if (_imageFitToolbar) {
            _imageFitToolbar.classList.remove('ql-image-fit-toolbar-visible');
        }
    }
}

// 取消选中图片卡片
function _deselectImageCard() {
    if (_selectedImageCard) {
        _selectedImageCard.classList.remove('ql-image-card-selected');
        _selectedImageCard = null;
    }
    if (_imageFitToolbar) {
        _imageFitToolbar.classList.remove('ql-image-fit-toolbar-visible');
    }
}

// ================================================================
// 图片缩放拖拽逻辑
// ================================================================
function _initImageResizeDrag(handle, e) {
    e.preventDefault();
    e.stopPropagation();
    try {
        var card = handle.closest('.ql-image-card');
        if (!card) return;
        var wrapper = card.querySelector('.ql-image-card-wrapper');
        if (!wrapper) return;

        var startX = e.clientX;
        var startY = e.clientY;
        var startW = wrapper.offsetWidth || 200;
        var startH = wrapper.offsetHeight || 150;
        if (startW < 40) startW = 40;
        if (startH < 40) startH = 40;

        var isLeft = handle.classList.contains('ql-image-resize-nw') || handle.classList.contains('ql-image-resize-sw');
        var isTop = handle.classList.contains('ql-image-resize-nw') || handle.classList.contains('ql-image-resize-ne');

        _imageResizing = true;
        var _rafId = null;

        function onMove(ev) {
            if (_rafId) return; // 节流：只保留最后一帧
            _rafId = requestAnimationFrame(function () {
                _rafId = null;
            try {
                var dx = ev.clientX - startX;
                var dy = ev.clientY - startY;
                // 自由缩放：宽高独立计算，不锁定宽高比
                var newW = isLeft ? startW - dx : startW + dx;
                var newH = isTop ? startH - dy : startH + dy;
                // 最小尺寸限制
                if (newW < 40) newW = 40;
                if (newH < 40) newH = 40;
                // 限制最大宽度（基于编辑器宽度）
                var editorEl = wrapper.closest('.ql-editor') || wrapper.closest('#quill-editor');
                var editorW = editorEl ? editorEl.clientWidth - 24 : window.innerWidth - 40;
                if (editorW < 60) editorW = 60;
                if (newW > editorW) newW = editorW;
                // 限制最大高度：图片在最大宽度下显示的高度 + 信息区高度
                var imgEl = wrapper.querySelector('img');
                var footer = card.querySelector('.ql-image-card-footer');
                var footerH = footer ? (footer.offsetHeight || 28) : 28;
                if (imgEl && imgEl.naturalWidth && imgEl.naturalHeight) {
                    var maxHByAspect = Math.round(editorW * imgEl.naturalHeight / imgEl.naturalWidth) + footerH;
                    if (newH > maxHByAspect) newH = maxHByAspect;
                } else {
                    // 图片未加载时，用窗口高度 80% 作为兜底
                    var maxH = Math.floor(window.innerHeight * 0.8);
                    if (newH > maxH) newH = maxH;
                }
                // 确保数值有效再应用
                if (isFinite(newW) && isFinite(newH) && newW > 0 && newH > 0) {
                    wrapper.style.width = newW + 'px';
                    wrapper.style.height = newH + 'px';
                }
            } catch (e) {
                console.warn('[core] 图片缩放移动出错', e);
                onUp();
            }
            });
        }

        function onUp() {
            _imageResizing = false;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        }

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    } catch (e) {
        console.warn('[core] _initImageResizeDrag 初始化出错', e);
        _imageResizing = false;
    }
}

// ================================================================
// 注册图片卡片交互（全局一次性）
// ================================================================
if (!window._imageCardInteractionRegistered) {
    window._imageCardInteractionRegistered = true;

    // 点击图片卡片：选中/取消
    document.addEventListener('mousedown', function (e) {
        // 如果在拖拽缩放手柄，不处理
        if (_imageResizing) return;

        var card = e.target.closest('.ql-image-card');
        // 点击缩放手柄时，不切换选中状态（由拖拽逻辑处理）
        if (e.target.classList.contains('ql-image-resize-handle')) {
            _initImageResizeDrag(e.target, e);
            return;
        }

        if (card) {
            // 点击已选中的卡片，取消选中
            if (card === _selectedImageCard) {
                _deselectImageCard();
            } else {
                _selectImageCard(card);
            }
        } else {
            // 点击其他地方，取消选中
            _deselectImageCard();
        }
    });

    // 点击工具栏按钮不取消选中
    document.addEventListener('mousedown', function (e) {
        if (e.target.closest('.ql-image-fit-toolbar')) {
            e.stopPropagation();
        }
    }, true);
}

// ================================================================
// 统一插入卡片对话框（3选项卡：图片 / 网址 / 文件）
// 文件选项卡统一显示所有文件（含 .node.json），根据选择自动识别卡片类型
// ================================================================
function _createInsertCardDialog(safeId) {
    var existing = document.getElementById('insert-card-dialog');
    if (existing) return existing;

    var project = tabs[safeId];
    var allFiles = [];

    var dialog = document.createElement('div');
    dialog.id = 'insert-card-dialog';
    dialog.className = 'insert-card-dialog';
    dialog.innerHTML =
        '<div class="dialog-overlay"></div>' +
        '<div class="dialog-box">' +
            '<div class="dialog-header">' +
                '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/></svg>' +
                '<h3>' + (t('ui.insert_card') || '插入卡片') + '</h3>' +
            '</div>' +
            '<div class="dialog-body">' +
                '<div class="card-type-select">' +
                    '<button class="card-type-btn active" data-type="image">' + (t('ui.image_card') || '图片卡片') + '</button>' +
                    '<button class="card-type-btn" data-type="url">' + (t('ui.url') || '网址') + '</button>' +
                    '<button class="card-type-btn" data-type="file">' + (t('ui.file') || '文件') + '</button>' +
                '</div>' +
                // 图片选项卡
                '<div class="card-input-row" id="card-image-row">' +
                    '<label>' + (t('ui.image_url') || '图片 URL') + '</label>' +
                    '<div class="card-image-input-group">' +
                        '<input type="text" id="card-image-url" placeholder="https://..." />' +
                        '<button id="card-image-local-btn" class="card-local-btn" title="' + (t('ui.select_image') || '选择本地图片') + '">' +
                            '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>' +
                            (t('ui.select_image') || '本地') +
                        '</button>' +
                    '</div>' +
                    '<input type="file" id="card-image-file-input" accept="image/*" style="display:none" />' +
                    '<label style="margin-top:8px">' + (t('ui.image_desc') || '图片注释') + '</label>' +
                    '<input type="text" id="card-image-desc" placeholder="' + (t('ui.image_desc_ph') || '可选：为图片添加描述') + '" />' +
                '</div>' +
                // 网址选项卡
                '<div class="card-input-row" id="card-url-row" style="display:none">' +
                    '<label>' + (t('ui.enter_url') || '网址') + '</label>' +
                    '<input type="text" id="card-url-input" placeholder="https://..." />' +
                '</div>' +
                // 文件选项卡（下拉弹窗选择文件）
                '<div class="card-input-row" id="card-file-row" style="display:none">' +
                    '<label>' + (t('ui.select_file') || '选择文件') + '</label>' +
                    '<div class="card-file-dropdown">' +
                        '<button id="card-file-dropdown-btn" class="card-file-dropdown-btn">' +
                            '<span class="card-file-dropdown-label">-- ' + (t('ui.select_file') || '选择文件') + ' --</span>' +
                            '<svg class="card-file-dropdown-arrow" viewBox="0 0 16 16" width="12" height="12"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
                        '</button>' +
                        '<div id="card-file-list" class="card-file-list"></div>' +
                    '</div>' +
                    '<div class="card-file-target-row" id="card-file-target-row" style="display:none">' +
                        '<label id="card-file-target-label">' + (t('ui.select_heading') || '选择标题/节点') + '</label>' +
                        '<select id="card-file-target-select"><option value="">--</option></select>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div class="dialog-actions">' +
                '<button class="btn-cancel">' + (t('ui.cancel') || '取消') + '</button>' +
                '<button class="btn-confirm">' + (t('ui.confirm') || '确定') + '</button>' +
            '</div>' +
        '</div>';

    document.body.appendChild(dialog);

    // ===== 状态 =====
    var currentType = 'image';

    // ===== 加载文件列表 =====
    function loadFiles() {
        if (!project) return;
        weAPI.listFiles(project.projectPath).then(function (result) {
            allFiles = result.files || [];
            populateFileSelect();
        });
    }

    // 当前选中的文件
    var _selectedFile = '';
    var _dropdownOpen = false;

    function populateFileSelect() {
        var fileList = dialog.querySelector('#card-file-list');
        var dropdownBtn = dialog.querySelector('#card-file-dropdown-btn');
        var dropdownLabel = dropdownBtn ? dropdownBtn.querySelector('.card-file-dropdown-label') : null;
        if (!fileList) return;

        // 按目录分组
        var grouped = {};
        allFiles.forEach(function (f) {
            var parts = f.split('/');
            var dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
            var file = parts.pop();
            if (!grouped[dir]) grouped[dir] = [];
            grouped[dir].push(f);
        });

        var html = '';
        if (allFiles.length === 0) {
            html = '<div class="card-file-empty">' + (t('ui.no_files') || '（无文件）') + '</div>';
        } else {
            Object.keys(grouped).sort().forEach(function (dir) {
                if (dir) {
                    html += '<div class="card-file-group">' + escapeHtml(dir) + '</div>';
                }
                grouped[dir].forEach(function (f) {
                    var label = f.split('/').pop();
                    var isNode = f.endsWith('.node.json');
                    // 去除存储前缀用于显示
                    var displayLabel = getCleanNameForCard(label);
                    if (isNode) displayLabel = displayLabel.replace('.node.json', '') + ' (节点图)';
                    var selected = (_selectedFile === f) ? ' selected' : '';
                    html += '<div class="card-file-item' + selected + '" data-value="' + f.replace(/"/g, '&quot;') + '">' +
                        '<span class="card-file-item-name">' + escapeHtml(displayLabel) + '</span>' +
                        '</div>';
                });
            });
        }

        fileList.innerHTML = html;

        // 绑定点击事件
        fileList.querySelectorAll('.card-file-item').forEach(function (item) {
            item.addEventListener('click', function (e) {
                e.stopPropagation();
                var val = item.getAttribute('data-value');
                _selectedFile = val;
                // 更新下拉按钮文字
                var itemName = item.querySelector('.card-file-item-name');
                if (dropdownLabel && itemName) {
                    dropdownLabel.textContent = itemName.textContent;
                }
                // 更新选中样式
                fileList.querySelectorAll('.card-file-item.selected').forEach(function (el) {
                    el.classList.remove('selected');
                });
                item.classList.add('selected');
                // 关闭下拉
                closeDropdown();
                onFileSelectChange(val);
            });
        });

        // 下拉按钮点击
        if (dropdownBtn) {
            dropdownBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                toggleDropdown();
            });
        }

        // 点击外部关闭
        document.addEventListener('click', function onDocClick(e) {
            if (!dialog.contains(e.target)) {
                document.removeEventListener('click', onDocClick);
                return;
            }
            var dd = dialog.querySelector('.card-file-dropdown');
            if (dd && !dd.contains(e.target)) {
                closeDropdown();
            }
        });

        // 自动选中当前文件
        if (project && project.currentFile && allFiles.indexOf(project.currentFile) >= 0) {
            _selectedFile = project.currentFile;
            var matchItem = fileList.querySelector('.card-file-item[data-value="' + project.currentFile.replace(/"/g, '&quot;') + '"]');
            if (matchItem) {
                matchItem.classList.add('selected');
                var itemName = matchItem.querySelector('.card-file-item-name');
                if (dropdownLabel && itemName) {
                    dropdownLabel.textContent = itemName.textContent;
                }
            }
            onFileSelectChange(project.currentFile);
        }
    }

    function toggleDropdown() {
        var dd = dialog.querySelector('.card-file-dropdown');
        if (!dd) return;
        if (_dropdownOpen) {
            closeDropdown();
        } else {
            openDropdown();
        }
    }

    function openDropdown() {
        var dd = dialog.querySelector('.card-file-dropdown');
        var list = dialog.querySelector('#card-file-list');
        var btn = dialog.querySelector('#card-file-dropdown-btn');
        if (!dd || !list) return;
        list.style.display = 'block';
        dd.classList.add('open');
        btn.classList.add('open');
        _dropdownOpen = true;
    }

    function closeDropdown() {
        var dd = dialog.querySelector('.card-file-dropdown');
        var list = dialog.querySelector('#card-file-list');
        var btn = dialog.querySelector('#card-file-dropdown-btn');
        if (!dd) return;
        if (list) list.style.display = 'none';
        dd.classList.remove('open');
        if (btn) btn.classList.remove('open');
        _dropdownOpen = false;
    }

    // ===== 文件选择变化：加载标题/节点列表 =====
    var _fileTargets = [];

    function onFileSelectChange(filename) {
        var targetRow = dialog.querySelector('#card-file-target-row');
        var targetSelect = dialog.querySelector('#card-file-target-select');
        var targetLabel = dialog.querySelector('#card-file-target-label');

        if (!filename) {
            targetRow.style.display = 'none';
            _fileTargets = [];
            return;
        }

        if (filename.endsWith('.node.json')) {
            // 节点图：加载节点列表
            targetLabel.textContent = (t('ui.ng_select_node') || '选择目标节点') + ':';
            targetRow.style.display = '';
            targetSelect.innerHTML = '<option value="">-- ' + (t('ui.no_heading') || '（无特定节点）') + ' --</option>';
            _fileTargets = [];
            if (project) {
                weAPI.readFile(project.projectPath, filename).then(function (result) {
                    if (!result.success) return;
                    try {
                        var data = JSON.parse(result.content);
                        var nodes = data.nodes || [];
                        nodes.forEach(function (n) {
                            var opt = document.createElement('option');
                            opt.value = n.id || '';
                            opt.textContent = (n.text || n.id || '') + ' (' + n.id + ')';
                            targetSelect.appendChild(opt);
                        });
                        _fileTargets = nodes.map(function (n) { return { id: n.id, text: n.text || n.id }; });
                    } catch (e) {
                        console.warn('[core] 解析节点图文件失败', e);
                    }
                });
            }
        } else {
            // 普通文件：加载标题列表
            targetLabel.textContent = (t('ui.select_heading') || '选择标题') + ':';
            targetRow.style.display = '';
            targetSelect.innerHTML = '<option value="">-- ' + (t('ui.no_heading') || '（无标题）') + ' --</option>';
            _fileTargets = [];
            if (project && project.projectMode !== 'markdown' && filename === project.currentFile && typeof quill !== 'undefined' && quill) {
                // 当前打开的文件，从编辑器读取标题
                if (typeof getHeadingsFromEditor === 'function') {
                    var headings = getHeadingsFromEditor();
                    headings.forEach(function (h) {
                        var opt = document.createElement('option');
                        opt.value = h.anchor || '';
                        opt.textContent = new Array(h.level).join('  ') + h.text;
                        targetSelect.appendChild(opt);
                    });
                    _fileTargets = headings;
                }
            } else if (project) {
                weAPI.readFile(project.projectPath, filename).then(function (result) {
                    if (!result.success) return;
                    var isHtml = project.projectMode !== 'markdown';
                    var headings = [];
                    if (isHtml) {
                        var parser = new DOMParser();
                        var doc = parser.parseFromString(result.content, 'text/html');
                        var els = doc.querySelectorAll('h1, h2, h3');
                        els.forEach(function (el) {
                            var text = el.textContent.trim();
                            if (text) {
                                headings.push({
                                    anchor: text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fa5-]/g, ''),
                                    text: text
                                });
                            }
                        });
                    } else if (typeof getHeadingsFromMarkdown === 'function') {
                        headings = getHeadingsFromMarkdown(result.content);
                    }
                    targetSelect.innerHTML = '<option value="">-- ' + (t('ui.no_heading') || '（无标题）') + ' --</option>' +
                        headings.map(function (h) { return '<option value="' + h.anchor + '">' + h.text + '</option>'; }).join('');
                    _fileTargets = headings;
                });
            }
        }
    }

    // ===== 选项卡切换 =====
    var typeBtns = dialog.querySelectorAll('.card-type-btn');
    var imageRow = dialog.querySelector('#card-image-row');
    var urlRow = dialog.querySelector('#card-url-row');
    var fileRow = dialog.querySelector('#card-file-row');

    function updateRows() {
        imageRow.style.display = 'none';
        urlRow.style.display = 'none';
        fileRow.style.display = 'none';
        if (currentType === 'image') imageRow.style.display = '';
        else if (currentType === 'url') urlRow.style.display = '';
        else if (currentType === 'file') fileRow.style.display = '';
    }

    typeBtns.forEach(function (btn) {
        btn.onclick = function () {
            typeBtns.forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');
            currentType = btn.dataset.type;
            updateRows();
        };
    });

    // ===== 文件选择变化事件已通过点击事件绑定在 populateFileSelect 中 =====

    // ===== 本地图片选择 =====
    dialog.querySelector('#card-image-local-btn').onclick = function () {
        dialog.querySelector('#card-image-file-input').click();
    };
    dialog.querySelector('#card-image-file-input').onchange = function (e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        // 大图片压缩，防止界面卡死
        var maxSize = 2 * 1024 * 1024; // 2MB 阈值
        var btn = dialog.querySelector('#card-image-local-btn');
        var originalText = btn.textContent;
        btn.textContent = (typeof t === 'function' && t('ui.loading')) || '加载中...';
        btn.disabled = true;
        // 使用 setTimeout 让 UI 先更新
        setTimeout(function () {
            if (file.size > maxSize) {
                // 压缩大图片
                var img = new Image();
                img.onload = function () {
                    try {
                        var canvas = document.createElement('canvas');
                        var MAX_W = 1920, MAX_H = 1080;
                        var w = img.width, h = img.height;
                        if (w > MAX_W) { h = h * MAX_W / w; w = MAX_W; }
                        if (h > MAX_H) { w = w * MAX_H / h; h = MAX_H; }
                        canvas.width = Math.round(w);
                        canvas.height = Math.round(h);
                        var ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                        var dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                        dialog.querySelector('#card-image-url').value = dataUrl;
                    } catch (ex) {
                        console.warn('[core] 图片压缩失败，回退原始读取', ex);
                        fallbackReadFile(file);
                    }
                    btn.textContent = originalText;
                    btn.disabled = false;
                };
                img.onerror = function () {
                    fallbackReadFile(file);
                    btn.textContent = originalText;
                    btn.disabled = false;
                };
                img.src = URL.createObjectURL(file);
            } else {
                fallbackReadFile(file);
                btn.textContent = originalText;
                btn.disabled = false;
            }
        }, 50);
    };
    function fallbackReadFile(file) {
        var reader = new FileReader();
        reader.onload = function (ev) {
            dialog.querySelector('#card-image-url').value = ev.target.result;
        };
        reader.readAsDataURL(file);
    }

    // ===== 按钮事件 =====
    dialog.querySelector('.btn-cancel').onclick = function () { dialog.remove(); };
    dialog.onclick = function (e) { if (e.target === dialog) dialog.remove(); };
    dialog.querySelector('.dialog-box').onclick = function (e) { e.stopPropagation(); };

    dialog.querySelector('.btn-confirm').onclick = function () {
        if (typeof quill === 'undefined' || !quill) {
            showNotification((t('ui.need_open_project') || '请先打开文件'));
            return;
        }
        // 获取光标位置（使用 try/catch 防止 getSelection 报错）
        var index = 0;
        try {
            var sel = quill.getSelection(true);
            index = (sel && sel.index !== undefined) ? sel.index : quill.getLength();
        } catch (e) {
            index = quill.getLength();
        }

        if (currentType === 'image') {
            var url = dialog.querySelector('#card-image-url').value.trim();
            if (!url) { showNotification((t('ui.enter_url') || '请输入图片 URL 或选择本地图片')); return; }
            var desc = dialog.querySelector('#card-image-desc') ? dialog.querySelector('#card-image-desc').value.trim() : '';
            quill.insertEmbed(index, 'imageCard', { src: url, width: '', height: '', objectFit: 'contain', desc: desc }, Quill.sources.USER);
            quill.setSelection(index + 1, 0, Quill.sources.USER);
            dialog.remove();
            return;
        }

        if (currentType === 'url') {
            var urlVal = dialog.querySelector('#card-url-input').value.trim();
            if (!urlVal) { showNotification((t('ui.enter_url') || '请输入网址')); return; }
            quill.insertEmbed(index, 'urlCard', { url: urlVal }, Quill.sources.USER);
            quill.setSelection(index + 1, 0, Quill.sources.USER);
            dialog.remove();
            return;
        }

        if (currentType === 'file') {
            var filename = _selectedFile;
            if (!filename) { showNotification((t('ui.select_file') || '请选择目标文件')); return; }
            var displayName = getCleanFileName(filename);

            if (filename.endsWith('.node.json')) {
                // 节点图卡片
                var targetNodeSelect = dialog.querySelector('#card-file-target-select');
                var targetNodeId = targetNodeSelect.value;
                var targetNodeText = targetNodeSelect.options[targetNodeSelect.selectedIndex] ? targetNodeSelect.options[targetNodeSelect.selectedIndex].textContent : '';
                var nodePayload = {
                    file: filename,
                    project: project ? (project.title || safeId) : safeId,
                    text: displayName,
                    targetNode: targetNodeId || '',
                    targetNodeText: targetNodeText || '',
                    thumbnail: '',
                    desc: ''
                };
                // 异步加载节点图数据生成缩略图
                if (project && project.projectPath) {
                    weAPI.readFile(project.projectPath, filename).then(function(result) {
                        if (result.success && result.content) {
                            try {
                                var ngData = JSON.parse(result.content);
                                // 传入目标节点ID，让缩略图居中显示该节点
                                if (targetNodeId) ngData.targetNodeId = targetNodeId;
                                if (typeof generateNodeGraphThumbnail === 'function') {
                                    nodePayload.thumbnail = generateNodeGraphThumbnail(ngData, 200, 120);
                                }
                                nodePayload.desc = (ngData.properties && ngData.properties.description) || '';
                            } catch (e) {
                                console.warn('[core] 解析节点图数据失败', e);
                            }
                        }
                        // 只有在 dialog 还存在时才插入（用户可能已关闭）
                        if (document.body.contains(dialog)) {
                            quill.insertEmbed(index, 'nodeGraphCard', nodePayload, Quill.sources.USER);
                            quill.setSelection(index + 1, 0, Quill.sources.USER);
                            dialog.remove();
                        }
                    });
                    return; // 异步处理，提前返回
                }
                quill.insertEmbed(index, 'nodeGraphCard', nodePayload, Quill.sources.USER);
            } else {
                // 文件链接卡片
                var headingSelect = dialog.querySelector('#card-file-target-select');
                var heading = headingSelect.value;
                var headingText = headingSelect.options[headingSelect.selectedIndex] ? headingSelect.options[headingSelect.selectedIndex].textContent : '';
                var filePayload = {
                    file: filename,
                    project: project ? (project.title || safeId) : safeId,
                    text: displayName,
                    heading: heading || '',
                    headingText: headingText || '',
                    desc: ''
                };
                // 异步加载文件简介
                var doInsert = function() {
                    quill.insertEmbed(index, 'fileLinkCard', filePayload, Quill.sources.USER);
                    quill.setSelection(index + 1, 0, Quill.sources.USER);
                    dialog.remove();
                };
                if (window.tagModule && typeof window.tagModule.getDesc === 'function') {
                    Promise.resolve(window.tagModule.getDesc(filename)).then(function(desc) {
                        filePayload.desc = desc || '';
                        doInsert();
                    });
                    return; // 异步处理，提前返回
                }
                doInsert();
            }
            quill.setSelection(index + 1, 0, Quill.sources.USER);
            dialog.remove();
            return;
        }
    };

    // ===== Esc 关闭 =====
    function onKeydown(e) {
        if (e.key === 'Escape') { dialog.remove(); document.removeEventListener('keydown', onKeydown); }
    }
    document.addEventListener('keydown', onKeydown);

    // 异步加载文件
    loadFiles();

    return dialog;
}

// 显示统一插入卡片对话框
function showInsertCardDialog(safeId) {
    _createInsertCardDialog(safeId);
}

// 保留旧函数别名（兼容旧代码）
function showImageCardDialog() {
    showInsertCardDialog(typeof activeTabId !== 'undefined' ? activeTabId : currentQuillProjectId);
}

// ================================================================
// btn-insert-card 委托事件（全局注册，不依赖 quill 初始化顺序）
// ================================================================
if (!window._insertCardDelegated) {
    window._insertCardDelegated = true;
    document.addEventListener('click', function (e) {
        var btn = e.target.closest('.btn-insert-card');
        if (!btn) return;
        e.preventDefault();
        showInsertCardDialog(typeof activeTabId !== 'undefined' ? activeTabId : currentQuillProjectId);
    });
}

// 移除旧的委托事件标记（避免冲突）
if (window._imgCardDelegated) {
    window._imgCardDelegated = false;
}