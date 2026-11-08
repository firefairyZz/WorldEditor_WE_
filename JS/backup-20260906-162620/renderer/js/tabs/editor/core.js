// ====== editor/core.js — 核心编辑器操作 ======
// 源文件: editor.js (行762-1135 + 行2584-2782)

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
            <span class="viewer-title">${VIEWER_ICONS.presentation} ${escapeHtml(name)}</span>
            <button class="viewer-download-btn" data-download="${escapeHtml(name)}">⬇ 下载</button>
        </div>
        <div class="viewer-body viewer-image-body">
            <img src="${finalSrc}" alt="${escapeHtml(name)}" class="viewer-image" 
                 onerror="console.error('Image load error:', this.src.substring(0, 100))"
                 onload="console.log('Image loaded successfully')" />
        </div>
    `;
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
            <span class="viewer-title">${VIEWER_ICONS.video} ${escapeHtml(name)}</span>
            <button class="viewer-download-btn">⬇ 下载</button>
        </div>
        <div class="viewer-body viewer-media-body">
            <video controls class="viewer-video" preload="metadata">
                <source src="${finalSrc}" type="${mime}">
                您的浏览器不支持视频播放
            </video>
        </div>
    `;
}

function buildAudioViewer(name, src, ext, blobUrl) {
    const mimeMap = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.flac': 'audio/flac', '.ogg': 'audio/ogg', '.aac': 'audio/aac', '.m4a': 'audio/mp4' };
    const mime = mimeMap[ext] || 'audio/mpeg';
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
            <span class="viewer-title">${VIEWER_ICONS.audio} ${escapeHtml(name)}</span>
            <button class="viewer-download-btn">⬇ 下载</button>
        </div>
        <div class="viewer-body viewer-media-body">
            <div class="audio-visualizer">🎵</div>
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

async function openProjectFile(safeId, filename) {
    const __t0 = performance.now();
    weLog.info('editor', '→ openProjectFile 开始', { safeId, filename });
    const project = tabs[safeId];
    if (!project) {
        weLog.warn('editor', 'openProjectFile: project 不存在', { safeId });
        return;
    }

    // =====================================================================
    // ⚠️  MOBILE DEVIATION POINT — 移动端分流入口
    // ---------------------------------------------------------------------
    // 手机端不执行本函数后续所有代码，由 mobile-nav.js 的
    //     enterMobileEditor(filename)
    // 通过 file-selected 事件触发。
    // 桌面端代码严禁加入任何移动端条件分支。
    // 回退移动端：删除本注释块和紧接着的 if 块即可。
    // =====================================================================
    if (!document.body.classList.contains('is-desktop')) {
        return;
    }
    // =====================================================================
    // ⬇️⬇️⬇️ 下面是纯桌面端代码，不要混入移动端逻辑 ⬇️⬇️⬇️
    // =====================================================================

    // === 显示加载动画 ===
    _showFileLoading(safeId);

    try {
    // === 冲突检测：文件已在独立标签页打开 → 跳转 ===
    const existingTabId = getOpenFileTabId(project.projectPath, filename);
    if (existingTabId && existingTabId !== safeId) {
        weLog.info('editor', `openProjectFile: 文件已在独立标签 ${existingTabId} 打开，跳转`);
        showNotification((t('ui.file_already_open') || '文件已在其他标签页打开') + ' — ' + (t('ui.jump_to') || '正在跳转...'));
        switchTab(existingTabId);
        return;
    }
    // 如果文件就在本项目页打开但没有 currentFile 记录（比如刚启动），先注销旧位置
    if (project.currentFile && project.currentFile !== filename) {
        unregisterOpenFile(project.projectPath, project.currentFile);
    }

    // 点击文件即切完整 TA（从目录独占进入正式编辑模式）
    if (window.setTaState) {
        window.setTaState(safeId, 'ta');
    }
    // 【全局撤回：文件切换 step】记录 oldFile，等两个分支（嵌入 or 富文本/md）成功后各调用 commit
    const oldFile = project.currentFile || null;

    // === 节点图文件：调用 createNodeGraphTab 嵌入模式（塞到 TA 右区域）===
    if (filename.endsWith('.node.json')) {
        weLog.info('editor', 'openProjectFile: 检测到节点图文件，嵌入到 TA 右区域', { filename });
        const embedEl = document.getElementById(`ng-embed-${safeId}`);
        const quillWrapper = document.getElementById(`quill-${safeId}`);
        if (!embedEl) { weLog.warn('editor', 'openProjectFile: ng-embed 容器不存在'); return; }
        // 切换显示：隐藏 Quill，显示节点图容器
        embedEl.style.display = 'flex';
        if (quillWrapper) quillWrapper.style.display = 'none';
        // 清理之前的嵌入实例
        if (typeof destroyEmbeddedNodeGraph === 'function') destroyEmbeddedNodeGraph(safeId);

        const baseName = filename.split('/').pop().replace(/\.node\.json$/, '');
        const projectFolder = project.projectPath;
        const embedTabId = 'nodegraph-embed-' + safeId;

        if (typeof createNodeGraphTab !== 'function') {
            weLog.error('editor', 'createNodeGraphTab 未加载，请重启');
            embedEl.innerHTML = '<div style="padding:20px;color:var(--text-muted,#999)">节点图引擎未加载</div>';
            return;
        }
        createNodeGraphTab(baseName, baseName, projectFolder, {
            container: embedEl,
            tabId: embedTabId,
            canvasId: `ng-canvas-embed-${safeId}`,
            coordsId: `ng-coords-embed-${safeId}`,
        });
        _commitFileSwitchOp(safeId, oldFile, filename);
        project.currentFile = filename;
        registerOpenFile(project.projectPath, filename, safeId);
        // 同步文件树高亮（节点图分支早退，不会走到函数末尾的高亮更新）
        const _tree = document.getElementById(`file-tree-${safeId}`);
        _tree?.querySelectorAll('.tree-file').forEach(el => el.classList.remove('active'));
        _tree?.querySelector(`[data-file="${filename}"]`)?.classList.add('active');
        updateStatusBar();
        return;
    }

    // === 查看器路由（图片/视频/音频/PDF）===
    {
        // 从文件名提取实际扩展名（去除存储前缀）
        let cleanName = filename;
        const lastSlash = Math.max(cleanName.lastIndexOf('/'), cleanName.lastIndexOf('\\'));
        if (lastSlash >= 0) cleanName = cleanName.slice(lastSlash + 1);
        if (cleanName.startsWith('__img_')) cleanName = cleanName.slice(6);
        else if (cleanName.startsWith('__bin_')) cleanName = cleanName.slice(6);
        else if (cleanName.startsWith('__media_')) cleanName = cleanName.slice(8);
        const dot = cleanName.lastIndexOf('.');
        const ext = dot >= 0 ? cleanName.substring(dot).toLowerCase() : '';
        const extName = ext.replace('.', '').toLowerCase();

        const VIEWER_IMAGE_EXT = ['png','jpg','jpeg','gif','bmp','webp','ico','tiff','tif'];
        const VIEWER_VIDEO_EXT = ['mp4','webm','mov'];
        const VIEWER_AUDIO_EXT = ['mp3','wav','flac','aac','m4','ogg'];
        const VIEWER_PDF_EXT = ['pdf'];

        const isViewerImage = VIEWER_IMAGE_EXT.includes(extName);
        const isViewerVideo = VIEWER_VIDEO_EXT.includes(extName);
        const isViewerAudio = VIEWER_AUDIO_EXT.includes(extName);
        const isViewerPdf = VIEWER_PDF_EXT.includes(extName);

        if (isViewerImage || isViewerVideo || isViewerAudio || isViewerPdf) {
            weLog.info('editor', 'openProjectFile: → 查看器', { filename, ext, isViewerImage, isViewerVideo, isViewerAudio, isViewerPdf });
            try {
                await openFileViewer(safeId, filename, {
                    isImage: isViewerImage, isVideo: isViewerVideo,
                    isAudio: isViewerAudio, isPdf: isViewerPdf,
                    ext
                });
                _commitFileSwitchOp(safeId, oldFile, filename);
                project.currentFile = filename;
                registerOpenFile(project.projectPath, filename, safeId);
                // 同步文件树高亮（查看器分支早退，不会走到函数末尾的高亮更新）
                const _treeV = document.getElementById(`file-tree-${safeId}`);
                _treeV?.querySelectorAll('.tree-file').forEach(el => el.classList.remove('active'));
                _treeV?.querySelector(`[data-file="${filename}"]`)?.classList.add('active');
                updateStatusBar();
                return;
            } catch (viewerErr) {
                weLog.error('editor', 'openProjectFile: 查看器打开失败', viewerErr);
                showNotification('查看器打开失败：' + (viewerErr.message || '未知错误'));
                _hideFileLoading(safeId);
                return;
            }
        }
    }

    // === 普通文本文件：隐藏节点图，显示 Quill ===
    const embedEl = document.getElementById(`ng-embed-${safeId}`);
    const quillWrapper = document.getElementById(`quill-${safeId}`);
    if (embedEl) embedEl.style.display = 'none';
    if (quillWrapper) quillWrapper.style.display = '';
    // 清理已嵌入的节点图实例（暂存脏状态后释放）
    if (embeddedNodeGraphs[safeId]) {
        weLog.debug('editor', 'openProjectFile: 销毁前一个嵌入节点图', { prevFile: embeddedNodeGraphs[safeId].graphFile });
        destroyEmbeddedNodeGraph(safeId);
    }

    // 清除旧的 TOC 面板（可能在其他标签页中）
    if (tocPanel) {
        weLog.debug('editor', 'openProjectFile: 清理旧 TOC 面板');
        tocPanel.remove();
        tocPanel = null;
    }

    // 清理旧的 Markdown 编辑器前暂存未保存内容
    if (markdownEditor) {
        // 【防御】project.currentFile 必须不是 .node.json，防止 key 串到节点图缓存上
        if (project.currentFile && project.currentFile !== filename && project.dirty
            && !project.currentFile.endsWith('.node.json')) {
            weLog.info('editor', 'openProjectFile: 暂存 Markdown 未保存内容', { prevFile: project.currentFile });
            project.fileCache = project.fileCache || {};
            project.fileCache[project.currentFile] = _fcWrap('md', markdownEditor.value);
        }
        markdownEditor = null;
    }

    // 清理旧的 Quill
    if (quill && project.projectMode !== 'markdown') {
        // 保存当前文件
    }

    const projectMode = project.projectMode || 'rich';
    weLog.info('editor', 'openProjectFile: 项目模式', { projectMode });

    if (projectMode === 'markdown') {
        weLog.info('editor', 'openProjectFile: 走了 Markdown 模式分支');
        weLog.info('editor', '[PERF] before markdown open', { dt: Math.round(performance.now() - __t0) + 'ms' });await openMarkdownFile(safeId, filename);
        weLog.info('editor', '[PERF] after markdown open', { dt: Math.round(performance.now() - __t0) + 'ms' });
        _commitFileSwitchOp(safeId, oldFile, filename);
        // 同步文件树高亮（Markdown 分支早退，不会走到函数末尾的高亮更新）
        const _tree = document.getElementById(`file-tree-${safeId}`);
        _tree?.querySelectorAll('.tree-file').forEach(el => el.classList.remove('active'));
        _tree?.querySelector(`[data-file="${filename}"]`)?.classList.add('active');
        updateStatusBar();
        return;
    }

    // 富文本模式继续原有逻辑
    if (projectMode !== 'markdown') {
        // 暂存当前文件的未保存内容
        // 【防御】project.currentFile 必须不是 .node.json（上一次可能是在编辑节点图，然后切另一个 README，
        //    此时 quill 是旧实例、project.dirty=true、currentFile=节点图文件名 → 三个条件都满足会把 Quill HTML
        //    写进 fileCache[节点图文件名]，直接覆盖 destroyEmbeddedNodeGraph 刚写好的节点图 JSON，导致
        //    下次切回来 JSON.parse 失败渲染空画布）。
        if (project.currentFile && project.currentFile !== filename && project.dirty && quill
            && !project.currentFile.endsWith('.node.json')) {
            weLog.info('editor', 'openProjectFile: 暂存 Quill 未保存内容', { prevFile: project.currentFile });
            project.fileCache = project.fileCache || {};
            project.fileCache[project.currentFile] = _fcWrap('quill', JSON.stringify({ __wfmt: 'quill-delta', ops: quill.getContents().ops }));
        }
    }

    // 优先使用缓存的未保存内容，否则从磁盘读取
    let content;
    let fromCache = false;
    if (project.fileCache) {
        // 先按 quill 类型解包（类型不匹配返回 undefined，然后 fallback 再按 text 解一次兼容纯文本旧缓存）
        let cached = _fcUnwrap('quill', project.fileCache[filename]);
        if (cached === undefined) cached = _fcUnwrap('text', project.fileCache[filename]);
        if (cached !== undefined) {
            weLog.info('editor', 'openProjectFile: 从缓存读取内容', { filename });
            content = cached;
            fromCache = true;
        }
    }
    if (!fromCache) {
        weLog.info('editor', 'openProjectFile: 从磁盘读取文件', { filename });
        const result = await weAPI.readFile(project.projectPath, filename);
        if (!result.success) {
            weLog.error('editor', 'openProjectFile: 读取文件失败', { filename, error: result.error });
            showNotification(t('ui.read_failed') + ': ' + result.error);
            return;
        }
        content = result.content;
    }
    weLog.info('editor', '[PERF] file read/cache done', { dt: Math.round(performance.now() - __t0) + 'ms' });

    if (!quillWrapper) {
        weLog.warn('editor', 'openProjectFile: quillWrapper 元素不存在', { safeId });
        return;
    }

    if (!quill) {
        weLog.info('editor', 'openProjectFile: 首次初始化 Quill 实例');
        quillWrapper.innerHTML = '';
        const toolbarEl = editorToolbar();
        quillWrapper.appendChild(toolbarEl);

        const editorDiv = document.createElement('div');
        editorDiv.id = 'quill-editor';
        quillWrapper.appendChild(editorDiv);

        // 扩展 Quill Size 支持自定义 px 值
        try {
            var Size = Quill.import('formats/size');
            Size.whitelist = ['small', 'large', 'huge',
                '7px', '8px', '9px', '10px', '11px', '12px', '13px', '14px', '15px',
                '16px', '19px', '20px', '21px',
                '24px', '27px', '29px', '32px', '35px', '37px', '40px',
                '48px', '56px', '64px', '72px', '80px', '96px'];
            // 扩展 Font 支持自定义字体
            var Font = Quill.import('formats/font');
            Font.whitelist = ['sans-serif', 'serif', 'monospace',
                'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
                "'Microsoft YaHei', 'PingFang SC', sans-serif",
                "'Source Han Sans SC', 'Noto Sans SC', sans-serif",
                "SimSun, '宋体', serif",
                "SimHei, '黑体', sans-serif",
                "KaiTi, '楷体', serif",
                "FangSong, '仿宋', serif",
                "Georgia, 'Times New Roman', serif",
                "Monaco, Consolas, 'Courier New', monospace"
            ];
        } catch (e) {}

        quill = new Quill(editorDiv, {
            theme: 'snow',
            modules: {
                toolbar: {
                    container: toolbarEl,
                }
            },
            placeholder: t('ui.start_writing') || 'Compose an epic...',
        });

        // 占位符：用户首次交互后永久隐藏
        let placeholderHidden = false;
        const origQuillUpdate = quill.update.bind(quill);
        quill.update = function(source) {
            const result = origQuillUpdate(source);
            if (placeholderHidden) {
                this.root.classList.remove('ql-blank');
            }
            return result;
        };
        function hidePlaceholder() {
            if (placeholderHidden) return;
            placeholderHidden = true;
            quill.root.classList.remove('ql-blank');
        }
        quill.root.addEventListener('mousedown', hidePlaceholder);
        quill.root.addEventListener('keydown', hidePlaceholder);
        // 智能括号/引号自动补全
        quill.root.addEventListener('keydown', handleSmartBrackets);

        // 点击空白区域：光标定位到最近行
        editorDiv.addEventListener('click', (e) => {
            // 空编辑器：点击任何位置都聚焦并定位光标
            if (quill.root.classList.contains('ql-blank') || quill.getText().trim() === '') {
                quill.focus();
                quill.setSelection(0, 0, Quill.sources.USER);
                hidePlaceholder();
                return;
            }

            // 只处理编辑器空白区域的点击（非文本节点）
            if (e.target !== editorDiv && e.target !== quill.root) return;
            const y = e.clientY;

            // 遍历所有块级元素，找到最近的行
            const blocks = quill.root.children;
            let nearestIndex = null;
            let nearestDist = Infinity;

            for (let i = 0; i < blocks.length; i++) {
                const blockRect = blocks[i].getBoundingClientRect();
                if (y >= blockRect.top && y <= blockRect.bottom) {
                    const midY = blockRect.top + blockRect.height / 2;
                    const dist = Math.abs(y - midY);
                    if (dist < nearestDist) { nearestDist = dist; nearestIndex = i; }
                }
                if (y > blockRect.bottom) {
                    const dist = y - blockRect.bottom;
                    if (dist < nearestDist) { nearestDist = dist; nearestIndex = i; }
                }
                if (y < blockRect.top && i > 0) {
                    const dist = blockRect.top - y;
                    if (dist < nearestDist) { nearestDist = dist; nearestIndex = i - 1; }
                }
            }

            if (nearestIndex !== null) {
                const block = blocks[nearestIndex];
                const blot = Quill.find(block);
                if (blot) {
                    const offset = blot.offset(quill.scroll);
                    const blockRect = block.getBoundingClientRect();
                    if (y > blockRect.bottom - blockRect.height / 2) {
                        quill.setSelection(offset + blot.length() - 1, 0, Quill.sources.USER);
                    } else {
                        quill.setSelection(offset, 0, Quill.sources.USER);
                    }
                }
            }
        });

        const exportBtn = toolbarEl.querySelector('.btn-export-md');
        if (exportBtn) exportBtn.onclick = () => showExportMenu(exportBtn);
        const tocBtn = toolbarEl.querySelector('.btn-toggle-toc');
        if (tocBtn) tocBtn.onclick = toggleTableOfContents;
        const insertCardBtn = toolbarEl.querySelector('.btn-insert-card');
        if (insertCardBtn) insertCardBtn.onclick = () => showInsertCardDialog(safeId);
        const histBtn = toolbarEl.querySelector('.btn-history');
        if (histBtn) histBtn.onclick = () => toggleHistoryPanel(safeId);
        // 图片卡片按钮使用委托事件（注册在全局模块底部，避免 inside if(!quill) 未执行）

        quill.on('text-change', updateEditorStats);
        quill.root.style.fontFamily = savedFontFamily;
        quill.root.style.fontSize = savedFontSize + 'px';
        currentQuillProjectId = safeId;
        weLog.info('editor', 'openProjectFile: Quill 初始化完成');

        // --- picker 弹窗 fix：展开时 position: fixed 避免被 overflow-x: auto 裁剪 ---
        (function() {
            if (!toolbarEl) return;
            // 先把所有可能残留的 fixed 样式清掉（防重复初始化）
            toolbarEl.querySelectorAll('.ql-picker-options').forEach(function(opts) {
                opts.style.position = '';
                opts.style.left = '';
                opts.style.top = '';
            });
            // 用事件委托，一个 handler 搞定所有 picker
            toolbarEl.addEventListener('click', function(e) {
                var label = e.target.closest('.ql-picker-label');
                if (!label) return;
                var picker = label.parentElement;
                var opts = picker.querySelector('.ql-picker-options');
                if (!opts) return;
                // 延迟一帧等 Quill 切好 ql-expanded 类
                requestAnimationFrame(function() {
                    if (picker.classList.contains('ql-expanded')) {
                        // 先不设 fixed，让浏览器算出自然宽度
                        var naturalWidth = opts.offsetWidth || 140;
                        var r = label.getBoundingClientRect();
                        opts.style.position = 'fixed';
                        opts.style.width = naturalWidth + 'px';
                        opts.style.left = Math.round(r.left) + 'px';
                        opts.style.top = Math.round(r.bottom + 2) + 'px';
                        // 边界保护：不超出右侧屏幕
                        var or = opts.getBoundingClientRect();
                        if (or.right > window.innerWidth - 8) {
                            opts.style.left = Math.round(window.innerWidth - or.width - 8) + 'px';
                        }
                    } else {
                        opts.style.position = '';
                        opts.style.width = '';
                        opts.style.left = '';
                        opts.style.top = '';
                    }
                });
            });
        })();

        // --- 鼠标滚轮纵向 → 横向滚动 ---
        // 但在下拉弹窗（.ql-picker-options）上滚时跳过，让弹窗自己滚
        toolbarEl.addEventListener('wheel', function(e) {
            // 事件目标在展开的下拉里 → 不拦截，让弹窗内部滚
            if (e.target.closest && e.target.closest('.ql-picker-options')) return;
            // 滚动工具栏时，自动收起所有展开的下拉
            toolbarEl.querySelectorAll('.ql-picker.ql-expanded').forEach(p => p.classList.remove('ql-expanded'));
            if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                e.preventDefault();
                toolbarEl.scrollLeft += e.deltaY;
            }
        }, { passive: false });
        // 左右滚动箭头（如果 addScrollArrows 已定义）
        if (typeof addScrollArrows === 'function') addScrollArrows(toolbarEl);
    } else {
        weLog.info('editor', 'openProjectFile: 复用已有 Quill 实例', { quillExists: !!quill });
        const editor = quill.container;
        // editor 和 scroll-arrow-wrap 是平级兄弟，wrap 在 editor 前面
        let wrap = editor.previousElementSibling;
        if (wrap && !wrap.classList.contains('scroll-arrow-wrap')) wrap = null;
        let toolbarEl = wrap ? wrap.querySelector('.ql-toolbar') : null;
        if (!toolbarEl) {
            const sib = editor.previousElementSibling;
            if (sib && sib.classList.contains('ql-toolbar')) { toolbarEl = sib; wrap = null; }
        }
        weLog.info('editor', 'openProjectFile else: 搬之前', {
            wrapExists: !!wrap, toolbarElExists: !!toolbarEl,
            quillWrapperChildren: quillWrapper.children.length,
            editorPrevSibling: editor.previousElementSibling?.className,
            editorParent: editor.parentElement?.id || editor.parentElement?.className
        });

        // 先清掉 quillWrapper 里的残留旧内容（switchTab 已经搬过一次可能堆积）
        quillWrapper.innerHTML = '';

        // 搬运顺序：wrap 先 editor 后
        if (wrap && toolbarEl) {
            quillWrapper.appendChild(wrap);
            quillWrapper.appendChild(editor);
        } else if (toolbarEl) {
            quillWrapper.appendChild(toolbarEl);
            quillWrapper.appendChild(editor);
        } else {
            quillWrapper.appendChild(editor);
        }

        if (toolbarEl) toolbarEl.style.display = '';
        editor.style.display = '';
        currentQuillProjectId = safeId;

        weLog.info('editor', 'openProjectFile else: 搬完后', {
            quillWrapperChildren: quillWrapper.children.length,
            finalToolbar: !!quillWrapper.querySelector('.ql-toolbar'),
            finalWrap: !!quillWrapper.querySelector('.scroll-arrow-wrap'),
            quillRootOffsetHeight: quill.root.offsetHeight
        });
    }

    // 全局链接点击处理（document级别，捕获所有链接点击，只注册一次）
    if (!window._globalLinkHandler) {
        weLog.info('editor', 'openProjectFile: 注册全局链接点击处理器');
        window._globalLinkHandler = true;
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (!link) return;
            const href = link.getAttribute('href') || '';

            // 项目内跳转链接
            if (link.classList.contains('jump-link') || link.hasAttribute('data-jump')) {
                e.preventDefault();
                e.stopPropagation();
                let data = {};
                const jumpAttr = link.getAttribute('data-jump');
                if (jumpAttr) {
                    try { data = JSON.parse(jumpAttr); } catch {
                        weLog.warn('editor', 'openProjectFile 全局点击: data-jump 解析失败', { jumpAttr });
                    }
                } else if (href.startsWith('project:')) {
                    // Markdown 预览链接格式：project:filename#heading
                    const rest = href.substring('project:'.length);
                    const [file, heading] = rest.split('#');
                    data = { file: decodeURIComponent(file || ''), heading: heading || '' };
                }
                handleJumpLinkClick(data);
                return;
            }

            // 外部链接：在系统浏览器中打开
            if (href && (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:') || href.startsWith('tel:'))) {
                e.preventDefault();
                e.stopPropagation();
                weAPI.openExternalLink(href);
                return;
            }
        }, true);
    }

    // ======== 0.7.0_alpha 全局撤回/重做 + 模式切换 快捷键（document 级，只注册一次）========
    if (!window._globalShortcutRegistered) {
        window._globalShortcutRegistered = true;
        document.addEventListener('keydown', (e) => {
            const mod = e.ctrlKey || e.metaKey;     // Ctrl 或 ⌘
            if (!mod) return;
            const key = e.key.toLowerCase();
            let action = null;
            if (key === 'z' && !e.shiftKey) action = 'undo';
            else if ((key === 'z' && e.shiftKey) || key === 'y') action = 'redo';
            else if (key === 'u') action = 'toggleUndoMode';   // Ctrl+U 切换局部/全局
            else if (key === 'h') action = 'toggleHistoryPanel'; // Ctrl+H 历史/撤回面板
            if (!action) return;
            e.preventDefault();
            e.stopPropagation();
            if (action === 'toggleUndoMode') {
                if (typeof activeTabId !== 'undefined' && activeTabId && typeof ensureGlobalUndo === 'function') {
                    const gu = ensureGlobalUndo(activeTabId);
                    if (gu) gu.setMode(gu.mode === 'global' ? 'local' : 'global');
                }
                return;
            }
            if (action === 'toggleHistoryPanel') {
                if (typeof activeTabId !== 'undefined' && activeTabId && typeof toggleHistoryPanel === 'function') {
                    toggleHistoryPanel(activeTabId);
                }
                return;
            }
            if (typeof handleEditAction === 'function') handleEditAction(action);
        }, true);

        // Esc：关闭弹出的历史面板
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && _historyPanelVisible) {
                hideHistoryPanel();
            }
        });
    }

    quill.root.innerHTML = '';
    weLog.info('editor', '[PERF] before content insert', { dt: Math.round(performance.now() - __t0) + 'ms' });

    // 1️⃣ 新格式：Delta JSON → setContents（最快，绕过 HTML→Delta 解析）
    let loaded = false;
    try {
        const trimmed = content.trim();
        if (trimmed.startsWith('{')) {
            const obj = JSON.parse(trimmed);
            if (obj && obj.__wfmt === 'quill-delta' && Array.isArray(obj.ops)) {
                weLog.info('editor', 'openProjectFile: Delta JSON 格式，使用 setContents', { opsCount: obj.ops.length });
                quill.setContents(obj.ops, Quill.sources.SILENT);
                loaded = true;
            }
        }
    } catch (e) {}

    // 2️⃣ 旧格式兼容：HTML / 纯文本
    if (!loaded) {
        const isHtml = /<[a-z][\s\S]*>/i.test(content);
        if (isHtml) {
            weLog.info('editor', 'openProjectFile: 旧 HTML 格式，使用 dangerouslyPasteHTML', { contentLen: content.length });
            quill.clipboard.dangerouslyPasteHTML(0, content, Quill.sources.SILENT);
        } else {
            weLog.info('editor', 'openProjectFile: 纯文本格式，使用 setText', { contentLen: content.length });
            quill.setText(content, Quill.sources.SILENT);
        }
    }

    weLog.info('editor', '[PERF] after content insert', { dt: Math.round(performance.now() - __t0) + 'ms' });
    if (savedFontFamily) quill.root.style.fontFamily = savedFontFamily;
    if (savedFontSize) quill.root.style.fontSize = savedFontSize + 'px';

    // 应用工具栏显示与字数统计设置
    const tb = document.getElementById('quill-toolbar');
    if (tb && typeof toolbarShow !== 'undefined') tb.style.display = toolbarShow === false ? 'none' : '';
    const wc = document.getElementById('word-count');
    if (wc && typeof wordCountShow !== 'undefined') wc.style.display = wordCountShow === false ? 'none' : '';

    project.currentFile = filename;
    project.dirty = fromCache;
    project.savedContent = fromCache ? content : content;
    // 注册项目页文件打开位置到 openFileMap
    registerOpenFile(project.projectPath, filename, safeId);
    updateStatusBar();
    updateEditorStats();

    // 确保编辑器获得焦点，使键盘事件（如 Backspace）正常工作
    setTimeout(function () { quill && quill.focus(); }, 200);

    // 加载内容后刷新节点图卡片缩略图（确保始终显示最新数据）
    if (typeof refreshNodeGraphThumbnails === 'function') {
        // 延迟执行，等待 Quill 渲染完成
        setTimeout(function () { refreshNodeGraphThumbnails(safeId); }, 100);
    }

    // ====== GlobalUndoManager 接入：Quill ======
    // 维护上一次 HTML 快照；只在 user 变更时 push；suppress>0 时跳过
    ensureGlobalUndo(safeId);  // lazy init
    if (project._quillLastHtml === undefined) project._quillLastHtml = null;
    // 用 AFTER text-change 的时候取最新 HTML
    quill.off('text-change', project._changeHandler);
    quill.off('text-change', project._globalQuillHandler);
    // 清理可能来自独立文件 tab 的 handler（从独立 tab 切回项目页时）
    Object.values(tabs).forEach(t => {
        if (t._standaloneChangeHandler) quill.off('text-change', t._standaloneChangeHandler);
    });
    project._changeHandler = () => { project.dirty = true; updateStatusBar(); debouncedUpdateEditorStats(); };
    project._globalQuillHandler = (delta, oldDelta, source) => {
        const gu = project.globalUndo;
        if (!gu) return;
        if (source !== 'user') return;               // 程序/初始化改动不入栈
        if (gu.suppress > 0) return;                 // undo/redo 触发的 change 不入栈
        const prev = project._quillLastHtml;
        const next = quill.root.innerHTML;
        if (prev === next) return;                   // 无变化跳过
        gu.push({
            type: 'quill',
            file: project.currentFile || filename,
            label: '编辑文本',
            prev: prev == null ? '' : prev,
            next: next,
        });
        project._quillLastHtml = next;
    };
    quill.on('text-change', project._changeHandler);
    quill.on('text-change', project._globalQuillHandler);
    // 初始快照（确保第一次 undo 时有 prev 可用）
    project._quillLastHtml = quill.root.innerHTML;

    const tree = document.getElementById(`file-tree-${safeId}`);
    tree?.querySelectorAll('.tree-file').forEach(el => el.classList.remove('active'));
    tree?.querySelector(`[data-file="${filename}"]`)?.classList.add('active');
    // 【全局撤回：文件切换 step】富文本/Markdown 分支尾部 commit
    _commitFileSwitchOp(safeId, oldFile, filename);
    weLog.info('editor', '← openProjectFile 完成', { filename, fromCache, totalMs: Math.round(performance.now() - __t0) });
    } finally {
        _hideFileLoading(safeId);
    }
}

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
        // 优先用 tab 自己的 markdownEditor（独立文件 tab 的 textarea），否则用全局
        const mdEl = project.markdownEditor || markdownEditor;
        if (!mdEl) {
            weLog.warn('editor', 'saveCurrentFile: markdownEditor 不存在');
            isSaving = false;
            return;
        }
        content = mdEl.value;
    } else {
        if (!quill) {
            weLog.warn('editor', 'saveCurrentFile: quill 不存在');
            isSaving = false;
            return;
        }
        content = JSON.stringify({ __wfmt: 'quill-delta', ops: quill.getContents().ops });
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

async function addFileToProject(safeId) {
    weLog.info('editor', '→ addFileToProject 开始', { safeId });
    const project = tabs[safeId];
    if (!project) {
        weLog.warn('editor', 'addFileToProject: project 不存在', { safeId });
        return;
    }
    const result = await showPrompt(t('ui.new_item') || '新建', t('ui.file_name') || '文件名', { typeSwitch: true, defaultType: 'file' });
    if (!result) {
        weLog.debug('editor', 'addFileToProject: 用户取消输入');
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
            const updated = await weAPI.openProject(project.projectPath);
            if (updated.success) {
                project.fileList = updated.fileList;
                refreshFileTree(safeId, updated.fileList);
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
            const updated = await weAPI.openProject(project.projectPath);
            if (updated.success) {
                project.fileList = updated.fileList;
                refreshFileTree(safeId, updated.fileList);
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
            const updated = await weAPI.openProject(project.projectPath);
            if (updated.success) {
                project.fileList = updated.fileList;
                refreshFileTree(safeId, updated.fileList);
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
                // 文件选项卡（统一显示所有文件）
                '<div class="card-input-row" id="card-file-row" style="display:none">' +
                    '<label>' + (t('ui.select_file') || '选择文件') + '</label>' +
                    '<select id="card-file-select"><option value="">-- ' + (t('ui.select_file') || '选择文件') + ' --</option></select>' +
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

    function populateFileSelect() {
        var fileSelect = dialog.querySelector('#card-file-select');
        fileSelect.innerHTML = '<option value="">-- ' + (t('ui.select_file') || '选择文件') + ' --</option>' +
            allFiles.map(function (f) {
                var label = f.split('/').pop().replace(/\.[^.]+$/, '') || f;
                // 节点图文件加标记
                if (f.endsWith('.node.json')) label += ' (节点图)';
                return '<option value="' + f.replace(/"/g, '&quot;') + '">' + label + '</option>';
            }).join('');
        // 自动选中当前文件
        if (project && project.currentFile && allFiles.indexOf(project.currentFile) >= 0) {
            fileSelect.value = project.currentFile;
            onFileSelectChange(project.currentFile);
        }
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

    // ===== 文件选择变化事件 =====
    dialog.querySelector('#card-file-select').onchange = function () {
        onFileSelectChange(this.value);
    };

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
    dialog.querySelector('.dialog-overlay').onclick = function () { dialog.remove(); };

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
            var filename = dialog.querySelector('#card-file-select').value;
            if (!filename) { showNotification((t('ui.select_file') || '请选择目标文件')); return; }
            var displayName = filename.split('/').pop().replace(/\.node\.json$/, '').replace(/\.[^.]+$/, '') || filename;

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

// ================================================================
// 移动端编辑器函数（由 mobile-nav.js 调用，与 desktop 完全隔离）
// ================================================================

/**
 * 移动端：打开富文本/Markdown 编辑器
 * @param {string} safeId - 项目 tab id
 * @param {string} filename - 文件路径
 * @param {HTMLElement} wrapper - quill-wrapper 容器（由 mobile-nav.js 创建）
 */
window.openMobileEditorFile = async function(safeId, filename, wrapper) {
    weLog.info('editor', '→ openMobileEditorFile', { safeId, filename });
    const project = tabs[safeId];
    if (!project) return;

    project.currentFile = filename;
    project.lastFile = filename;

    const projectFolder = project.projectPath;
    const filePath = filename.startsWith('/') ? filename : (projectFolder + '/' + filename);

    // 读取文件内容
    let content = '';
    try {
        const result = await weAPI.readFile(filePath);
        if (result.success) {
            content = result.content;
        } else {
            weLog.warn('editor', 'openMobileEditorFile: 读取文件失败', { error: result.error });
        }
    } catch (e) {
        weLog.warn('editor', 'openMobileEditorFile: 读取文件异常', e && e.stack ? e.stack : String(e));
    }

    const projectMode = project.projectMode || 'rich';

    if (projectMode === 'markdown') {
        // Markdown 模式（移动端简化：暂用 textarea）
        wrapper.innerHTML = '';
        const ta = document.createElement('textarea');
        ta.className = 'markdown-editor-mobile';
        ta.value = content;
        wrapper.appendChild(ta);
        project.markdownEditor = ta;
        return;
    }

    // 富文本模式：在 wrapper 里初始化 Quill
    wrapper.innerHTML = '';
    const toolbarEl = editorToolbar();
    wrapper.appendChild(toolbarEl);

    const editorDiv = document.createElement('div');
    editorDiv.className = 'ql-editor-container';
    wrapper.appendChild(editorDiv);

    try {
        var Size = Quill.import('formats/size');
        Size.whitelist = ['small', 'large', 'huge',
            '7px', '8px', '9px', '10px', '11px', '12px', '13px', '14px', '15px',
            '16px', '19px', '20px', '21px',
            '24px', '27px', '29px', '32px', '35px', '37px', '40px',
            '48px', '56px', '64px', '72px', '80px', '96px'];
    } catch (e) {}

    const mobileQuill = new Quill(editorDiv, {
        theme: 'snow',
        modules: { toolbar: { container: toolbarEl } },
        placeholder: t('ui.start_writing') || 'Compose an epic...',
    });

    // 先尝试 Delta 格式，fallback HTML/text
    let loaded = false;
    try {
        if (!filename.endsWith('.md') && content.trim().startsWith('{')) {
            const obj = JSON.parse(content.trim());
            if (obj && obj.__wfmt === 'quill-delta' && Array.isArray(obj.ops)) {
                mobileQuill.setContents(obj.ops, Quill.sources.SILENT);
                loaded = true;
            }
        }
    } catch (e) {}
    if (!loaded) {
        let html = content;
        if (filename.endsWith('.md')) {
            try { html = stripMarkdown(content); } catch (e2) {}
        }
        if (html && html.trim()) {
            if (/<[a-z][\s\S]*>/i.test(html)) {
                mobileQuill.clipboard.dangerouslyPasteHTML(0, html, Quill.sources.SILENT);
            } else {
                mobileQuill.setText(html, Quill.sources.SILENT);
            }
        }
    }

    // 保存实例到 project 上（避免污染全局 quill）
    project._mobileQuill = mobileQuill;
    project._mobileQuillWrapper = wrapper;

    // 移动端：简单 touch 事件适配
    mobileQuill.root.addEventListener('touchstart', () => {
        mobileQuill.focus();
    }, { passive: true });

    weLog.info('editor', 'openMobileEditorFile: Quill 初始化完成', { safeId });
};

/**
 * 移动端：销毁编辑器实例
 */
window.destroyMobileEditorFile = function(safeId) {
    weLog.info('editor', '→ destroyMobileEditorFile', { safeId });
    const project = tabs[safeId];
    if (!project) return;

    // 清理 Quill
    if (project._mobileQuill) {
        try {
            const q = project._mobileQuill;
            if (q.container && q.container.parentNode) {
                q.container.parentNode.innerHTML = '';
            }
        } catch (e) {}
        project._mobileQuill = null;
        project._mobileQuillWrapper = null;
    }

    // 清理 Markdown textarea
    if (project.markdownEditor && !project.markdownEditor.closest('.area-root.ta')) {
        project.markdownEditor = null;
    }
};

// =====================================================================
// 独立文件标签页（OA 模式） — openFileInNewTab 相关
// =====================================================================

/** 生成 openFileMap 的统一 key */
function _fileOpenKey(projectPath, filePath) {
    return projectPath + '|' + filePath;
}

/** 查询某文件当前在哪个 tab 打开（返回 tabId 或 null） */
function getOpenFileTabId(projectPath, filePath) {
    return openFileMap[_fileOpenKey(projectPath, filePath)] || null;
}

/** 注册文件打开位置 */
function registerOpenFile(projectPath, filePath, tabId) {
    openFileMap[_fileOpenKey(projectPath, filePath)] = tabId;
}

/** 注销文件打开位置 */
function unregisterOpenFile(projectPath, filePath) {
    delete openFileMap[_fileOpenKey(projectPath, filePath)];
}

/**
 * 在独立标签页中打开文件（OA 模式，纯编辑器界面）
 * @param {string} projectPath - 项目文件夹绝对路径
 * @param {string} filePath - 相对于项目的文件路径（如 "notes/chapter1.md"）
 * @param {string} [projectMode] - "rich" | "markdown"，默认从文件扩展名推断
 * @returns {string|null} 成功返回 tabId，冲突时 switchTab 后返回 null
 */
async function openFileInNewTab(projectPath, filePath, projectMode) {
    weLog.info('editor', '→ openFileInNewTab 开始', { projectPath, filePath });

    // DEBUG: 打印 openFileMap 全部内容，排查冲突检测问题
    console.log('[DEBUG openFileInNewTab] openFileMap =', JSON.stringify(openFileMap));
    console.log('[DEBUG openFileInNewTab] query key =', projectPath + '|' + filePath);
    console.log('[DEBUG openFileInNewTab] getOpenFileTabId =', getOpenFileTabId(projectPath, filePath));
    console.log('[DEBUG openFileInNewTab] projectPath type =', typeof projectPath, 'filePath type =', typeof filePath);
    console.log('[DEBUG openFileInNewTab] all tabs =', Object.keys(tabs));

    // === 冲突检测 ===
    const existingTabId = getOpenFileTabId(projectPath, filePath);
    if (existingTabId && tabs[existingTabId]) {
        weLog.info('editor', `openFileInNewTab: 文件已在 tab ${existingTabId} 打开，跳转`);
        showNotification((t('ui.file_already_open') || '文件已在其他标签页打开') + ' — ' + (t('ui.jump_to') || '正在跳转...'));
        switchTab(existingTabId);
        return existingTabId;
    }

    // 从扩展名推断项目模式
    let mode = projectMode;
    if (!mode) {
        if (filePath.endsWith('.md') || filePath.endsWith('.markdown')) mode = 'markdown';
        else mode = 'rich';
    }

    const fileName = filePath.split('/').pop();
    const baseName = fileName.replace(/\.node\.json$/, '').replace(/\.[^.]+$/, '');
    const isNodeGraph = fileName.endsWith('.node.json');

    // 为节点图复用已有的独立标签页机制
    if (isNodeGraph) {
        if (typeof createNodeGraphTab !== 'function') {
            weLog.error('editor', 'openFileInNewTab: createNodeGraphTab 未加载');
            showNotification(t('ui.ng_file_not_found') || '节点图引擎未加载');
            return null;
        }
        const tabId = createNodeGraphTab(baseName, baseName, projectPath);
        if (tabId) {
            registerOpenFile(projectPath, filePath, tabId);
            weLog.info('editor', `← openFileInNewTab 节点图完成: tabId=${tabId}`);
        }
        return tabId;
    }

    // === 富文本 / Markdown ===
    // 生成唯一 tabId（基于 projectPath 和 filePath 的 hash）
    const tabId = 'file-' + Math.abs(hashString(projectPath + '|' + filePath)).toString(36);
    if (tabs[tabId]) {
        weLog.info('editor', `openFileInNewTab: tabId ${tabId} 已存在，切换过去`);
        registerOpenFile(projectPath, filePath, tabId);
        switchTab(tabId);
        return tabId;
    }

    // 创建 OA 布局 DOM
    const layout = document.createElement('div');
    layout.className = 'project-layout area-root oa file-tab-layout';

    const card = document.createElement('div');
    card.className = 'area-card file-tab-card';

    // 顶部工具栏（极简：仅文件名 + 脏状态标记）
    const headerBar = document.createElement('div');
    headerBar.className = 'file-tab-header';
    headerBar.innerHTML = `
        <span class="file-tab-name" title="${fileName}">${escapeHtml(fileName)}</span>
    `;
    card.appendChild(headerBar);

    // 编辑器容器
    if (mode === 'markdown') {
        const mdWrapper = document.createElement('div');
        mdWrapper.className = 'markdown-editor-wrapper';
        mdWrapper.id = 'md-wrapper-' + tabId;
        card.appendChild(mdWrapper);
    } else {
        const quillWrapper = document.createElement('div');
        quillWrapper.className = 'quill-wrapper';
        quillWrapper.id = 'quill-' + tabId;
        card.appendChild(quillWrapper);
    }

    layout.appendChild(card);

    // 注册 tab
    addTab(tabId, fileName, layout, true);

    // 在 tab 对象上标记这是独立文件标签
    tabs[tabId].fileTab = true;
    tabs[tabId].projectPath = projectPath;
    tabs[tabId].currentFile = filePath;
    tabs[tabId].projectMode = mode;
    tabs[tabId].dirty = false;

    // 注册到 openFileMap
    registerOpenFile(projectPath, filePath, tabId);

    // 读取文件内容并初始化编辑器
    let content = '';
    try {
        const result = await weAPI.readFile(projectPath, filePath);
        if (result.success) content = result.content;
        else {
            weLog.warn('editor', 'openFileInNewTab: 读取文件失败', { error: result.error });
            showNotification((t('ui.read_failed') || '读取失败') + ': ' + result.error);
        }
    } catch (e) {
        weLog.warn('editor', 'openFileInNewTab: 读取文件异常', e && e.stack ? e.stack : String(e));
    }

    if (mode === 'markdown') {
        const wrapper = card.querySelector('.markdown-editor-wrapper');
        wrapper.innerHTML = '';
        const ta = document.createElement('textarea');
        ta.className = 'markdown-editor';
        ta.id = 'md-' + tabId;
        ta.value = content;
        ta.addEventListener('input', () => {
            tabs[tabId].dirty = true;
        });
        wrapper.appendChild(ta);
        tabs[tabId].markdownEditor = ta;
    } else {
        // 富文本：复用全局 Quill 实例，switchTab 时会自动搬过来
        const quillWrapper = card.querySelector('.quill-wrapper');
        const tab = tabs[tabId];

        if (quill) {
            // 已有 Quill，先切到本 tab 让 switchTab 搬过来
            switchTab(tabId);
            // 设置内容：先尝试 Delta 格式，fallback HTML/text
            let html = content;
            if (filePath.endsWith('.md')) {
                try { html = stripMarkdown(content); } catch (e) {}
                quill.root.innerHTML = html || '';
            } else {
                quill.root.innerHTML = '';
                try {
                    if (content.trim().startsWith('{')) {
                        const obj = JSON.parse(content.trim());
                        if (obj && obj.__wfmt === 'quill-delta' && Array.isArray(obj.ops)) {
                            quill.setContents(obj.ops, Quill.sources.SILENT);
                        } else throw 'not delta';
                    } else throw 'not json';
                } catch (e) {
                    if (/<[a-z][\s\S]*>/i.test(content)) {
                        quill.clipboard.dangerouslyPasteHTML(0, content, Quill.sources.SILENT);
                    } else {
                        quill.setText(content, Quill.sources.SILENT);
                    }
                }
            }
            tab.dirty = false;
        } else {
            // 还没有 Quill 实例——先在这个 tab 里创建
            quillWrapper.innerHTML = '';
            const toolbarEl = editorToolbar();
            quillWrapper.appendChild(toolbarEl);
            const editorDiv = document.createElement('div');
            editorDiv.id = 'quill-editor';
            quillWrapper.appendChild(editorDiv);

            try {
                var Size = Quill.import('formats/size');
                Size.whitelist = ['small', 'large', 'huge',
                    '7px', '8px', '9px', '10px', '11px', '12px', '13px', '14px', '15px',
                    '16px', '19px', '20px', '21px',
                    '24px', '27px', '29px', '32px', '35px', '37px', '40px',
                    '48px', '56px', '64px', '72px', '80px', '96px'];
            } catch (e) {}

            quill = new Quill(editorDiv, {
                theme: 'snow',
                modules: { toolbar: { container: toolbarEl } },
                placeholder: t('ui.start_writing') || 'Compose an epic...',
            });

            // 横向滚动箭头
            if (typeof addScrollArrows === 'function') addScrollArrows(toolbarEl);
            quill.root.innerHTML = '';
            try {
                if (!filePath.endsWith('.md') && content.trim().startsWith('{')) {
                    const obj = JSON.parse(content.trim());
                    if (obj && obj.__wfmt === 'quill-delta' && Array.isArray(obj.ops)) {
                        quill.setContents(obj.ops, Quill.sources.SILENT);
                    } else throw 'not delta';
                } else throw 'not json';
            } catch (e) {
                let html = content;
                if (filePath.endsWith('.md')) {
                    try { html = stripMarkdown(content); } catch (e2) {}
                }
                if (html && html.trim()) {
                    if (/<[a-z][\s\S]*>/i.test(html)) {
                        quill.clipboard.dangerouslyPasteHTML(0, html, Quill.sources.SILENT);
                    } else {
                        quill.setText(html, Quill.sources.SILENT);
                    }
                }
            }
        }

        // 统一绑定独立文件 tab 的 change handler（覆盖之前项目页的 handler）
        // 先清掉旧的 handler（避免多个独立 tab 互相污染）
        if (tab._standaloneChangeHandler) {
            quill.off('text-change', tab._standaloneChangeHandler);
        }
        // 清掉可能来自项目页的旧 handler（如果是从项目页切过来）
        Object.values(tabs).forEach(t => {
            if (t._changeHandler) quill.off('text-change', t._changeHandler);
            if (t._globalQuillHandler) quill.off('text-change', t._globalQuillHandler);
        });
        tab._standaloneChangeHandler = () => {
            if (tabs[activeTabId] === tab) {
                tab.dirty = true;
                if (typeof updateStatusBar === 'function') updateStatusBar();
            }
        };
        quill.on('text-change', tab._standaloneChangeHandler);
        currentQuillProjectId = tabId;
        tab.dirty = false;
    }

    weLog.info('editor', `← openFileInNewTab 完成: tabId=${tabId} mode=${mode}`);
    return tabId;
}

/** 简易字符串 hash（DJB2），用于生成唯一 tabId */
function hashString(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) + str.charCodeAt(i);
        hash = hash & hash;
    }
    return hash;
}