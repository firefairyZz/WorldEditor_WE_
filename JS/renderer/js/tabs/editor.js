var tocPanel = null;
let wordCountTimer = null;
let editorStats = { words: 0, chars: 0, headings: 0 };
let markdownEditor = null;
let markdownPreviewVisible = true;

// updateEditorStats 的防抖版本：减少打字过程中的布局抖动
let _debouncedStatsTimer = null;
function debouncedUpdateEditorStats() {
    if (_debouncedStatsTimer) clearTimeout(_debouncedStatsTimer);
    _debouncedStatsTimer = setTimeout(() => {
        updateEditorStats();
        _debouncedStatsTimer = null;
    }, 250);
}
let isSaving = false;
let pendingSave = false;

// ====== 跳转链接 Blot ======
// 继承 Quill 标准 Link，额外支持 data-jump 属性存储项目内跳转信息
const LinkBlot = Quill.import('formats/link');

class ProjectLinkBlot extends LinkBlot {
    static blotName = 'projectLink';
    static tagName = 'a';

    static create(value) {
        // 字符串：普通 URL，交给父类
        if (typeof value === 'string') {
            return super.create(value);
        }
        // 对象：项目内跳转
        if (value && value.project) {
            const node = super.create('#');
            node.setAttribute('data-jump', JSON.stringify({
                project: value.project,
                file: value.file || '',
                heading: value.heading || ''
            }));
            node.classList.add('jump-link');
            node.removeAttribute('href');
            if (value.text) node.textContent = value.text;
            return node;
        }
        // 对象：外部 URL + 自定义文字
        if (value && value.url) {
            const node = super.create(value.url);
            if (value.text) node.textContent = value.text;
            return node;
        }
        return super.create(value || '');
    }

    // Quill 解析 HTML → Delta 时调用，返回假值会导致格式丢失
    static formats(node) {
        const jumpData = node.getAttribute('data-jump');
        if (jumpData) {
            try {
                const parsed = JSON.parse(jumpData);
                return { project: parsed.project, file: parsed.file, heading: parsed.heading };
            } catch(e) {}
        }
        return node.getAttribute('href') || '';
    }

    static value(node) {
        const jumpData = node.getAttribute('data-jump');
        if (jumpData) {
            try {
                const parsed = JSON.parse(jumpData);
                return { ...parsed, text: node.textContent };
            } catch(e) {}
        }
        return node.getAttribute('href') || '';
    }
}

Quill.register(ProjectLinkBlot, true);
// 同时注册为 link 格式的替代，让 Quill 工具栏的链接按钮也走这个 Blot
Quill.register('formats/link', ProjectLinkBlot, true);

function positionDialog(dialog) {
    const titleBar = document.getElementById('title-bar');
    let topOffset = 0;
    if (titleBar) topOffset += titleBar.offsetHeight;
    dialog.style.top = topOffset + 'px';
}

// 从富文本编辑器 DOM 读取标题列表
function getHeadingsFromEditor() {
    if (!quill) return [];
    const els = quill.root.querySelectorAll('h1, h2, h3');
    return Array.from(els).map(el => {
        const text = el.textContent.trim();
        return {
            level: parseInt(el.tagName.substring(1)),
            text: text,
            anchor: text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fa5-]/g, '')
        };
    }).filter(h => h.text);
}

// 从 Markdown 文本读取标题列表
function getHeadingsFromMarkdown(text) {
    const headings = [];
    text.split('\n').forEach(line => {
        const match = line.match(/^(#{1,3})\s+(.+)/);
        if (match) {
            headings.push({
                level: match[1].length,
                text: match[2].trim(),
                anchor: match[2].trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fa5-]/g, '')
            });
        }
    });
    return headings;
}

async function openProjectFile(safeId, filename) {
    const project = tabs[safeId];
    if (!project) return;

    // 清除旧的 TOC 面板（可能在其他标签页中）
    if (tocPanel) {
        tocPanel.remove();
        tocPanel = null;
    }
    
    // 清理旧的 Markdown 编辑器前暂存未保存内容
    if (markdownEditor) {
        if (project.currentFile && project.currentFile !== filename && project.dirty) {
            project.fileCache = project.fileCache || {};
            project.fileCache[project.currentFile] = markdownEditor.value;
        }
        markdownEditor = null;
    }
    
    // 清理旧的 Quill
    if (quill && project.projectMode !== 'markdown') {
        // 保存当前文件
    }
    
    const projectMode = project.projectMode || 'rich';
    
    if (projectMode === 'markdown') {
        await openMarkdownFile(safeId, filename);
        return;
    }
    
    // 富文本模式继续原有逻辑
    if (projectMode !== 'markdown') {
        // 暂存当前文件的未保存内容
        if (project.currentFile && project.currentFile !== filename && project.dirty && quill) {
            project.fileCache = project.fileCache || {};
            project.fileCache[project.currentFile] = quill.root.innerHTML;
        }
    }

    // 优先使用缓存的未保存内容，否则从磁盘读取
    let content;
    let fromCache = false;
    if (project.fileCache && project.fileCache[filename] !== undefined) {
        content = project.fileCache[filename];
        fromCache = true;
    } else {
        const result = await weAPI.readFile(project.projectPath, filename);
        if (!result.success) { showNotification(t('ui.read_failed') + ': ' + result.error); return; }
        content = result.content;
    }

    const quillWrapper = document.getElementById(`quill-${safeId}`);
    if (!quillWrapper) return;

    if (!quill) {
        quillWrapper.innerHTML = '';
        const toolbarEl = editorToolbar();
        quillWrapper.appendChild(toolbarEl);

        const editorDiv = document.createElement('div');
        editorDiv.id = 'quill-editor';
        quillWrapper.appendChild(editorDiv);

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
        const jumpBtn = toolbarEl.querySelector('.btn-jump-link');
        if (jumpBtn) jumpBtn.onclick = () => showJumpLinkDialog(safeId);

        quill.on('text-change', updateEditorStats);
        quill.root.style.fontFamily = savedFontFamily;
        quill.root.style.fontSize = savedFontSize + 'px';
        currentQuillProjectId = safeId;
    } else {
        const toolbar = quill.container.previousElementSibling;
        const editor = quill.container;
        if (editor.parentElement !== quillWrapper) {
            if (toolbar && toolbar.classList.contains('ql-toolbar')) {
                quillWrapper.appendChild(toolbar);
            }
            quillWrapper.appendChild(editor);
        }
        if (toolbar && toolbar.classList.contains('ql-toolbar')) {
            toolbar.style.display = '';
        }
        editor.style.display = '';
        currentQuillProjectId = safeId;
    }

    // 全局链接点击处理（document级别，捕获所有链接点击，只注册一次）
    if (!window._globalLinkHandler) {
        window._globalLinkHandler = true;
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (!link) return;
            const href = link.getAttribute('href') || '';

            // 项目内跳转链接
            if (link.classList.contains('jump-link') || link.hasAttribute('data-jump')) {
                e.preventDefault();
                e.stopPropagation();
                const data = JSON.parse(link.getAttribute('data-jump') || '{}');
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

    quill.root.innerHTML = '';
    // 检测内容类型：HTML 还是纯文本
    const isHtml = /<[a-z][\s\S]*>/i.test(content);
    if (isHtml) {
        // HTML 内容：通过 Quill clipboard 解析为正确的 Delta blocks
        quill.clipboard.dangerouslyPasteHTML(0, content, Quill.sources.SILENT);
    } else {
        // 纯文本：setText 会将 \n 正确转为独立的 block
        quill.setText(content, Quill.sources.SILENT);
    }
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
    updateStatusBar();
    updateEditorStats();

    quill.off('text-change', project._changeHandler);
    project._changeHandler = () => { project.dirty = true; updateStatusBar(); debouncedUpdateEditorStats(); };
    quill.on('text-change', project._changeHandler);

    const tree = document.getElementById(`file-tree-${safeId}`);
    tree?.querySelectorAll('.tree-file').forEach(el => el.classList.remove('active'));
    tree?.querySelector(`[data-file="${filename}"]`)?.classList.add('active');
}

function editorToolbar() {
    const toolbar = document.createElement('div');
    toolbar.className = 'ql-toolbar ql-snow editor-toolbar';
    toolbar.id = 'quill-toolbar';
    toolbar.innerHTML = `
        <span class="ql-formats">
            <select class="ql-header">
                <option value="false" selected>${t('ui.normal') || 'Normal'}</option>
                <option value="1">${t('ui.heading1') || 'Heading 1'}</option>
                <option value="2">${t('ui.heading2') || 'Heading 2'}</option>
                <option value="3">${t('ui.heading3') || 'Heading 3'}</option>
            </select>
        </span>
        <span class="ql-formats">
            <button class="ql-bold" title="${t('ui.bold') || 'Bold'}"></button>
            <button class="ql-italic" title="${t('ui.italic') || 'Italic'}"></button>
            <button class="ql-underline" title="${t('ui.underline') || 'Underline'}"></button>
            <button class="ql-strike" title="${t('ui.strike') || 'Strikethrough'}"></button>
        </span>
        <span class="ql-formats">
            <select class="ql-color" title="${t('ui.text_color') || 'Text Color'}"></select>
            <select class="ql-background" title="${t('ui.background_color') || 'Background Color'}"></select>
        </span>
        <span class="ql-formats">
            <button class="ql-list" value="ordered" title="${t('ui.ordered_list') || 'Ordered List'}"></button>
            <button class="ql-list" value="bullet" title="${t('ui.bullet_list') || 'Bullet List'}"></button>
            <button class="ql-list" value="check" title="${t('ui.check_list') || 'Check List'}"></button>
        </span>
        <span class="ql-formats">
            <button class="ql-blockquote" title="${t('ui.quote') || 'Quote'}"></button>
            <button class="ql-code-block" title="${t('ui.code_block') || 'Code Block'}"></button>
        </span>
        <span class="ql-formats">
            <select class="ql-align" title="${t('ui.align') || 'Alignment'}"></select>
        </span>
        <span class="ql-formats last-format">
            <button class="ql-link" title="${t('ui.link') || 'Link'}"></button>
            <button class="custom-btn btn-jump-link" title="${t('ui.jump_link') || 'Jump Link'}">
                <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
            </button>
            <button class="ql-image" title="${t('ui.image') || 'Image'}"></button>
        </span>
        <span class="editor-actions">
            <button class="custom-btn btn-export-md" title="${t('ui.export') || 'Export'}">
                <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 7V3.5L18.5 9H13zM6 15h2l2-3 2 3h2v-5H6v5z"/></svg>
            </button>
            <button class="custom-btn btn-toggle-toc" title="${t('ui.toggle_toc') || 'Toggle TOC'}">
                <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M3 9h14V7H3v2zm0 4h14v-2H3v2zm0 4h14v-2H3v2zm16-4h2v-2h-2v2zm0 4h2v-2h-2v2zm0-8h2V7h-2v2z"/></svg>
            </button>
        </span>
    `;
    return toolbar;
}

function handleExportMarkdown() {
    const project = tabs[activeTabId];
    let markdown;
    if (project && project.projectMode === 'markdown') {
        const textarea = document.querySelector('#md-textarea');
        markdown = textarea ? textarea.value : '';
    } else {
        if (!quill) return;
        const delta = quill.getContents();
        markdown = deltaToMarkdown(delta);
    }
    downloadText(markdown, getCurrentFileName() + '.md', 'text/markdown');
}

// 构建导出用的完整 HTML 文档（PDF / HTML 共用）
function buildExportDocument() {
    const project = tabs[activeTabId];
    let bodyHtml = '';
    if (project && project.projectMode === 'markdown') {
        const textarea = document.querySelector('#md-textarea');
        bodyHtml = textarea ? markdownToHtmlString(textarea.value) : '';
    } else if (quill) {
        bodyHtml = quill.root.innerHTML;
    }
    const title = escapeHtml(getCurrentFileName());
    return `<!DOCTYPE html>
<html lang="auto">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
* { box-sizing: border-box; }
body { font-family: 'Microsoft YaHei', 'Segoe UI', sans-serif; max-width: 760px; margin: 40px auto; padding: 0 24px; color: #222; line-height: 1.75; }
h1 { font-size: 1.8em; border-bottom: 1px solid #eee; padding-bottom: 8px; line-height: 1.3; }
h2 { font-size: 1.4em; line-height: 1.3; }
h3 { font-size: 1.15em; line-height: 1.3; }
p { margin: 12px 0; }
img { max-width: 100%; height: auto; }
pre { background: #f5f5f5; padding: 12px 14px; border-radius: 4px; overflow-x: auto; font-size: 13px; }
code { background: #f5f5f5; padding: 2px 5px; border-radius: 3px; font-family: Consolas, 'Courier New', monospace; font-size: 0.92em; }
pre code { background: none; padding: 0; }
blockquote { border-left: 4px solid #ddd; margin: 12px 0; padding: 4px 16px; color: #555; }
li { margin: 4px 0; }
a { color: #0a84ff; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #ddd; padding: 6px 10px; }
</style>
</head>
<body>${bodyHtml}</body>
</html>`;
}

// 显示导出下拉菜单
function showExportMenu(anchorEl) {
    if (!anchorEl) return;
    document.querySelectorAll('.export-menu').forEach(m => m.remove());

    const menu = document.createElement('div');
    menu.className = 'export-menu';
    menu.innerHTML = `
        <div class="export-menu-item" data-fmt="md"><span class="export-menu-fmt">Markdown</span><span class="export-menu-desc">.md</span></div>
        <div class="export-menu-item" data-fmt="html"><span class="export-menu-fmt">HTML</span><span class="export-menu-desc">.html</span></div>
        <div class="export-menu-item" data-fmt="pdf"><span class="export-menu-fmt">PDF</span><span class="export-menu-desc">.pdf</span></div>
        <div class="export-menu-item" data-fmt="zip"><span class="export-menu-fmt">ZIP</span><span class="export-menu-desc">${escapeHtml(t('ui.export_zip_desc') || '项目打包')}</span></div>
    `;
    document.body.appendChild(menu);

    const rect = anchorEl.getBoundingClientRect();
    let left = rect.left;
    const menuWidth = menu.offsetWidth;
    if (left + menuWidth > window.innerWidth - 8) left = window.innerWidth - menuWidth - 8;
    menu.style.top = (rect.bottom + 4) + 'px';
    menu.style.left = left + 'px';

    menu.querySelectorAll('.export-menu-item').forEach(item => {
        item.onclick = () => {
            const fmt = item.dataset.fmt;
            menu.remove();
            document.removeEventListener('mousedown', outsideHandler);
            handleExport(fmt);
        };
    });

    const outsideHandler = (e) => {
        if (!menu.contains(e.target) && e.target !== anchorEl) {
            menu.remove();
            document.removeEventListener('mousedown', outsideHandler);
        }
    };
    setTimeout(() => document.addEventListener('mousedown', outsideHandler), 0);
}

function handleExport(fmt) {
    if (fmt === 'md') return handleExportMarkdown();
    if (fmt === 'html') return handleExportHtml();
    if (fmt === 'pdf') return handleExportPdf();
    if (fmt === 'zip') return handleExportZip();
}

function handleExportHtml() {
    const html = buildExportDocument();
    downloadText(html, getCurrentFileName() + '.html', 'text/html');
}

async function handleExportPdf() {
    const project = tabs[activeTabId];
    if (!project) {
        showNotification(t('ui.need_open_project') || '请先打开一个项目');
        return;
    }
    const html = buildExportDocument();
    showNotification(t('ui.exporting_pdf') || '正在导出 PDF...');
    const result = await weAPI.exportPdf(html, getCurrentFileName());
    if (result.success) {
        showNotification(t('ui.export_success') || '导出成功');
    } else if (!result.canceled) {
        showNotification((t('ui.export_failed') || '导出失败') + ': ' + (result.error || ''));
    }
}

async function handleExportZip() {
    const project = tabs[activeTabId];
    if (!project || !project.projectPath) {
        showNotification(t('ui.need_open_project') || '请先打开一个项目');
        return;
    }
    const name = project.title || getCurrentFileName() || 'project';
    const result = await weAPI.exportZip(project.projectPath, name);
    if (result.success) {
        showNotification(t('ui.export_success') || '导出成功');
    } else if (!result.canceled) {
        showNotification((t('ui.export_failed') || '导出失败') + ': ' + (result.error || ''));
    }
}

function toggleTableOfContents() {
    if (tocPanel && tocPanel.isConnected) {
        tocPanel.remove();
        tocPanel = null;
        return;
    }
    generateTableOfContents();
}

async function showJumpLinkDialog(safeId) {
    const project = tabs[safeId];
    if (!project) return;

    const selection = quill.getSelection();
    if (!selection || selection.length === 0) {
        showNotification(t('ui.select_text_for_link') || '请先选择要设置跳转链接的文字');
        return;
    }

    const filesResult = await weAPI.listFiles(project.projectPath);
    const files = filesResult.files || [];

    const dialog = document.createElement('div');
    dialog.className = 'jump-link-dialog';
    dialog.innerHTML = `
        <div class="dialog-overlay"></div>
        <div class="dialog-box">
            <div class="dialog-header">
                <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
                <h3>${t('ui.jump_link') || '跳转链接'}</h3>
            </div>
            <div class="dialog-body">
                <div class="link-type-select">
                    <button class="link-type-btn active" data-type="url">${t('ui.external_link') || '外部链接'}</button>
                    <button class="link-type-btn" data-type="file">${t('ui.project_file') || '项目内文件'}</button>
                </div>
                <div class="link-input-row" id="url-row">
                    <input type="text" id="external-url" placeholder="https://...">
                </div>
                <div class="link-input-row" id="file-row" style="display:none">
                    <label>${t('ui.select_file') || '选择文件'}</label>
                    <select id="target-file">
                        <option value="">-- ${t('ui.select_file') || '选择文件'} --</option>
                        ${files.map(f => `<option value="${f}">${stripExt(f.split('/').pop())}</option>`).join('')}
                    </select>
                    <label>${t('ui.select_heading') || '选择标题'}</label>
                    <select id="target-heading">
                        <option value="">-- ${t('ui.no_heading') || '（无标题）'} --</option>
                    </select>
                </div>
            </div>
            <div class="dialog-actions">
                <button class="btn-cancel">${t('ui.cancel') || '取消'}</button>
                <button class="btn-confirm">${t('ui.confirm') || '确定'}</button>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);
    positionDialog(dialog);

    const typeBtns = dialog.querySelectorAll('.link-type-btn');
    const urlRow = dialog.querySelector('#url-row');
    const fileRow = dialog.querySelector('#file-row');
    const fileSelect = dialog.querySelector('#target-file');
    const headingSelect = dialog.querySelector('#target-heading');
    let currentType = 'url';

    typeBtns.forEach(btn => {
        btn.onclick = () => {
            typeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentType = btn.dataset.type;
            urlRow.style.display = currentType === 'url' ? '' : 'none';
            fileRow.style.display = currentType === 'url' ? 'none' : '';
            // 切到文件模式时，自动选中当前文件并加载标题
            if (currentType === 'file') {
                const currentFile = project.currentFile;
                if (currentFile && files.includes(currentFile)) {
                    fileSelect.value = currentFile;
                    loadHeadingsForFile(dialog, project, currentFile, safeId);
                }
            }
        };
    });

    fileSelect.onchange = () => {
        loadHeadingsForFile(dialog, project, fileSelect.value, safeId);
    };

    dialog.querySelector('.btn-cancel').onclick = () => dialog.remove();
    dialog.querySelector('.dialog-overlay').onclick = () => dialog.remove();

    dialog.querySelector('.btn-confirm').onclick = () => {
        const sel = quill.getSelection(true);
        if (!sel || sel.length === 0) {
            showNotification(t('ui.select_text_for_link') || '请先选择文字');
            return;
        }

        if (currentType === 'url') {
            const url = dialog.querySelector('#external-url').value.trim();
            if (!url) { showNotification(t('ui.enter_url') || '请输入链接地址'); return; }
            // formatText：直接在选中文字上应用 link 格式，不删除任何文字
            quill.formatText(sel.index, sel.length, 'link', url, Quill.sources.USER);
        } else {
            const filename = fileSelect.value;
            if (!filename) { showNotification(t('ui.select_file') || '请选择目标文件'); return; }
            const heading = headingSelect.value;
            // formatText：直接在选中文字上应用 projectLink 格式
            quill.formatText(sel.index, sel.length, 'projectLink', {
                project: safeId,
                file: filename,
                heading: heading
            }, Quill.sources.USER);
        }
        dialog.remove();
    };
}

// 为文件选择加载标题列表
async function loadHeadingsForFile(dialog, project, filename, safeId) {
    const headingSelect = dialog.querySelector('#target-heading');
    headingSelect.innerHTML = '<option value="">-- ' + (t('ui.loading') || '加载中...') + ' --</option>';
    if (!filename) {
        headingSelect.innerHTML = '<option value="">-- ' + (t('ui.no_heading') || '（无标题）') + ' --</option>';
        return;
    }

    // 如果选的是当前已打开的文件，直接从编辑器 DOM 读取（实时、准确）
    if (filename === project.currentFile && quill) {
        const headings = getHeadingsFromEditor();
        headingSelect.innerHTML = '<option value="">-- ' + (t('ui.no_heading') || '（无标题）') + ' --</option>' +
            headings.map(h => `<option value="${h.anchor}">${'　'.repeat(h.level - 1)}${h.text}</option>`).join('');
        return;
    }

    // 否则从磁盘读取文件内容
    const result = await weAPI.readFile(project.projectPath, filename);
    if (result.success) {
        const isHtml = project.projectMode !== 'markdown';
        let headings;
        if (isHtml) {
            // HTML 文件：用 DOMParser 解析
            const parser = new DOMParser();
            const doc = parser.parseFromString(result.content, 'text/html');
            headings = Array.from(doc.querySelectorAll('h1, h2, h3')).map(el => {
                const text = el.textContent.trim();
                return {
                    level: parseInt(el.tagName.substring(1)),
                    text: text,
                    anchor: text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fa5-]/g, '')
                };
            }).filter(h => h.text);
        } else {
            headings = getHeadingsFromMarkdown(result.content);
        }
        headingSelect.innerHTML = '<option value="">-- ' + (t('ui.no_heading') || '（无标题）') + ' --</option>' +
            headings.map(h => `<option value="${h.anchor}">${'　'.repeat(h.level - 1)}${h.text}</option>`).join('');
    }
}

function handleJumpLinkClick(data) {
    if (data.url) {
        weAPI.openExternalLink(data.url);
    } else if (data.file) {
        const safeId = data.project;
        if (safeId && tabs[safeId]) {
            // 切换到目标项目（使用 switchTab 直接切换）
            if (typeof switchTab === 'function') {
                switchTab(safeId);
            } else {
                window.dispatchEvent(new CustomEvent('switch-project', { detail: { safeId: safeId } }));
            }
            // 打开目标文件
            setTimeout(async () => {
                await openProjectFile(safeId, data.file);
                if (!data.heading) return;
                setTimeout(() => {
                    const project = tabs[safeId];
                    if (!project) return;
                    const projectMode = project.projectMode || 'rich';
                    if (projectMode === 'markdown') {
                        // Markdown 模式：在预览区滚动定位
                        const previewEl = document.querySelector('.md-preview-content');
                        if (previewEl) {
                            const headingEls = previewEl.querySelectorAll('h1, h2, h3');
                            for (const el of headingEls) {
                                const anchor = el.textContent.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fa5-]/g, '');
                                if (anchor === data.heading) {
                                    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                    break;
                                }
                            }
                        }
                    } else {
                        // 富文本模式：在 Quill 编辑器中滚动定位
                        const headingEls = quill?.root?.querySelectorAll(`h1, h2, h3`);
                        if (headingEls) {
                            for (const el of headingEls) {
                                const anchor = el.textContent.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fa5-]/g, '');
                                if (anchor === data.heading) {
                                    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                    break;
                                }
                            }
                        }
                    }
                }, 300);
            }, 100);
        } else {
            showNotification(t('ui.project_not_found') || '目标项目未打开');
        }
    }
}

async function openMarkdownFile(safeId, filename) {
    const project = tabs[safeId];
    if (!project) return;

    // 暂存当前文件
    if (project.currentFile && project.currentFile !== filename && project.dirty && markdownEditor) {
        project.fileCache = project.fileCache || {};
        project.fileCache[project.currentFile] = markdownEditor.value;
    }

    // 读取文件内容
    let content;
    let fromCache = false;
    if (project.fileCache && project.fileCache[filename] !== undefined) {
        content = project.fileCache[filename];
        fromCache = true;
    } else {
        const result = await weAPI.readFile(project.projectPath, filename);
        if (!result.success) { showNotification(t('ui.read_failed') + ': ' + result.error); return; }
        content = result.content;
    }

    const quillWrapper = document.getElementById(`quill-${safeId}`);
    if (!quillWrapper) return;

    // 清理旧内容
    quillWrapper.innerHTML = '';
    quill = null;

    // 创建 Markdown 编辑器
    const mdToolbar = document.createElement('div');
    mdToolbar.className = 'ql-toolbar ql-snow editor-toolbar md-toolbar';
    mdToolbar.id = 'quill-toolbar';
    mdToolbar.innerHTML = `
        <span class="ql-formats">
            <select class="md-format">
                <option value="">${t('ui.normal') || 'Normal'}</option>
                <option value="# ">${t('ui.heading1') || 'Heading 1'}</option>
                <option value="## ">${t('ui.heading2') || 'Heading 2'}</option>
                <option value="### ">${t('ui.heading3') || 'Heading 3'}</option>
            </select>
        </span>
        <span class="ql-formats">
            <button class="md-format-btn" data-format="**" title="${t('ui.bold') || 'Bold'}"><b>B</b></button>
            <button class="md-format-btn" data-format="*" title="${t('ui.italic') || 'Italic'}"><i>I</i></button>
            <button class="md-format-btn" data-format="~~" title="${t('ui.strike') || 'Strike'}"><s>S</s></button>
        </span>
        <span class="ql-formats">
            <button class="md-list-btn" data-list="ordered" title="${t('ui.ordered_list') || 'Ordered List'}">1.</button>
            <button class="md-list-btn" data-list="bullet" title="${t('ui.bullet_list') || 'Bullet List'}">•</button>
            <button class="md-list-btn" data-list="check" title="${t('ui.check_list') || 'Check List'}">☑</button>
        </span>
        <span class="ql-formats">
            <button class="md-format-btn" data-format="> " title="${t('ui.quote') || 'Quote'}">"</button>
            <button class="md-format-btn" data-format="\`\`\`\n\n\`\`\`" title="${t('ui.code_block') || 'Code Block'}">{ }</button>
        </span>
        <span class="ql-formats last-format">
            <button class="custom-btn btn-md-link" title="${t('ui.link') || 'Link'}">
                <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
            </button>
            <button class="custom-btn btn-md-jump" title="${t('ui.jump_link') || 'Jump Link'}">
                <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
            </button>
            <button class="custom-btn btn-md-image" title="${t('ui.image') || 'Image'}">
                <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
            </button>
        </span>
        <span class="editor-actions">
            <button class="custom-btn btn-md-export" title="${t('ui.export') || 'Export'}">
                <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 7V3.5L18.5 9H13zM6 15h2l2-3 2 3h2v-5H6v5z"/></svg>
            </button>
            <button class="custom-btn btn-md-preview-toggle" title="${t('ui.toggle_preview') || 'Toggle Preview'}">
                <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
            </button>
        </span>
    `;
    quillWrapper.appendChild(mdToolbar);

    // 创建编辑器容器
    const mdContainer = document.createElement('div');
    mdContainer.className = 'md-editor-container';
    mdContainer.innerHTML = `
        <div class="md-editor-pane">
            <textarea id="md-textarea" spellcheck="false" placeholder="${t('ui.start_writing') || 'Compose an epic...'}"></textarea>
        </div>
        <div class="md-preview-pane ${markdownPreviewVisible ? '' : 'md-hidden'}">
            <div class="md-preview-header">${t('ui.preview') || 'Preview'}</div>
            <div class="md-preview-content"></div>
        </div>
    `;
    quillWrapper.appendChild(mdContainer);

    // 初始化编辑器
    const textarea = mdContainer.querySelector('#md-textarea');
    const preview = mdContainer.querySelector('.md-preview-content');
    
    textarea.value = content;
    markdownEditor = textarea;

    // 初始预览
    renderMarkdownPreview(content, preview);

    // 更新统计
    updateMarkdownStats(content);

    // 设置当前文件
    project.currentFile = filename;
    project.dirty = !fromCache;
    document.querySelectorAll('.tree-file').forEach(el => el.classList.remove('active'));
    document.querySelectorAll(`[data-file="${filename}"]`).forEach(el => el.classList.add('active'));

    // 实时预览和统计
    textarea.addEventListener('input', () => {
        project.fileCache = project.fileCache || {};
        project.fileCache[filename] = textarea.value;
        project.dirty = true;
        project.currentFile = filename;
        renderMarkdownPreview(textarea.value, preview);
        updateMarkdownStats(textarea.value);
    });
    // 智能括号/引号自动补全
    textarea.addEventListener('keydown', handleSmartBracketsTextarea);

    // 工具栏事件
    mdToolbar.querySelector('.md-format').onchange = (e) => {
        const prefix = e.target.value;
        if (prefix) {
            wrapMarkdownTextarea(textarea, prefix, '');
            e.target.value = '';
        }
    };

    mdToolbar.querySelectorAll('.md-format-btn').forEach(btn => {
        btn.onclick = () => {
            const format = btn.dataset.format;
            wrapMarkdownTextarea(textarea, format, format);
        };
    });

    mdToolbar.querySelectorAll('.md-list-btn').forEach(btn => {
        btn.onclick = () => {
            const listType = btn.dataset.list;
            insertMarkdownList(textarea, listType);
        };
    });

    mdToolbar.querySelector('.btn-md-link').onclick = () => {
        showPrompt(t('ui.enter_url') || 'Enter URL:', 'https://...').then(url => {
            if (url) wrapMarkdownTextarea(textarea, '[', `](${url})`);
        });
    };

    mdToolbar.querySelector('.btn-md-jump').onclick = () => {
        showMarkdownJumpDialog(safeId, textarea, preview);
    };

    mdToolbar.querySelector('.btn-md-image').onclick = () => {
        showPrompt(t('ui.enter_image_url') || 'Enter image URL:', 'https://...').then(url => {
            if (url) wrapMarkdownTextarea(textarea, '![', `](${url})`);
        });
    };

    mdToolbar.querySelector('.btn-md-export').onclick = (e) => {
        showExportMenu(mdToolbar.querySelector('.btn-md-export'));
    };

    mdToolbar.querySelector('.btn-md-preview-toggle').onclick = () => {
        markdownPreviewVisible = !markdownPreviewVisible;
        const previewPane = mdContainer.querySelector('.md-preview-pane');
        if (markdownPreviewVisible) {
            previewPane.classList.remove('md-hidden');
        } else {
            previewPane.classList.add('md-hidden');
        }
    };

    // 预览区点击跳转处理
    const previewEl = mdContainer.querySelector('.md-preview-content');
    if (previewEl) {
        previewEl.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (!link) return;
            const href = link.getAttribute('href') || '';
            if (href.startsWith('project:')) {
                e.preventDefault();
                const rest = href.slice('project:'.length);
                const [file, heading] = rest.split('#');
                handleJumpLinkClick({
                    project: safeId,
                    file: decodeURIComponent(file || ''),
                    heading: heading ? decodeURIComponent(heading) : ''
                });
            } else if (link.dataset.jump) {
                e.preventDefault();
                try {
                    const data = JSON.parse(link.dataset.jump);
                    handleJumpLinkClick(data);
                } catch (err) {}
            } else if (href && (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:'))) {
                e.preventDefault();
                weAPI.openExternalLink(href);
            }
        });
    }
}

async function showMarkdownJumpDialog(safeId, textarea, preview) {
    const project = tabs[safeId];
    if (!project) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.substring(start, end) || t('text') || 'text';

    const filesResult = await weAPI.listFiles(project.projectPath);
    const files = filesResult.files || [];

    const dialog = document.createElement('div');
    dialog.className = 'jump-link-dialog';
    dialog.innerHTML = `
        <div class="dialog-overlay"></div>
        <div class="dialog-box">
            <div class="dialog-header">
                <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
                <h3>${t('ui.jump_link') || 'Jump Link'}</h3>
            </div>
            <div class="dialog-body">
                <div class="link-type-select">
                    <button class="link-type-btn active" data-type="url">${t('ui.external_link') || 'External Link'}</button>
                    <button class="link-type-btn" data-type="file">${t('ui.project_file') || 'Project File'}</button>
                </div>
                <div class="link-input-row" id="url-row">
                    <input type="text" id="external-url" placeholder="https://...">
                </div>
                <div class="link-input-row" id="file-row" style="display:none">
                    <label>${t('ui.select_file') || 'Select File'}</label>
                    <select id="target-file">
                        <option value="">-- ${t('ui.select_file') || 'Select File'} --</option>
                        ${files.map(f => `<option value="${f}">${stripExt(f.split('/').pop())}</option>`).join('')}
                    </select>
                    <label>${t('ui.select_heading') || 'Select Heading'}</label>
                    <select id="target-heading">
                        <option value="">-- ${t('ui.no_heading') || '(no heading)'} --</option>
                    </select>
                </div>
                <div class="link-text-row">
                    <label>${t('ui.link_text') || 'Link Text'}</label>
                    <input type="text" id="link-text" value="${selected}" placeholder="${t('ui.link_text_placeholder') || 'Display text'}">
                </div>
            </div>
            <div class="dialog-actions">
                <button class="btn-cancel">${t('ui.cancel') || 'Cancel'}</button>
                <button class="btn-confirm">${t('ui.confirm') || 'OK'}</button>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);
    positionDialog(dialog);

    const typeBtns = dialog.querySelectorAll('.link-type-btn');
    const urlRow = dialog.querySelector('#url-row');
    const fileRow = dialog.querySelector('#file-row');
    const fileSelect = dialog.querySelector('#target-file');
    const headingSelect = dialog.querySelector('#target-heading');
    let currentType = 'url';

    typeBtns.forEach(btn => {
        btn.onclick = () => {
            typeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentType = btn.dataset.type;
            urlRow.style.display = currentType === 'url' ? '' : 'none';
            fileRow.style.display = currentType === 'url' ? 'none' : '';
            if (currentType === 'file') {
                const currentFile = project.currentFile;
                if (currentFile && files.includes(currentFile)) {
                    fileSelect.value = currentFile;
                    fileSelect.dispatchEvent(new Event('change'));
                }
            }
        };
    });

    fileSelect.onchange = async () => {
        headingSelect.innerHTML = '<option value="">-- ' + (t('ui.loading') || 'Loading...') + ' --</option>';
        const filename = fileSelect.value;
        if (!filename) {
            headingSelect.innerHTML = '<option value="">-- ' + (t('ui.no_heading') || '(no heading)') + ' --</option>';
            return;
        }
        // 当前文件：直接从 textarea 读取
        if (filename === project.currentFile && textarea) {
            const headings = getHeadingsFromMarkdown(textarea.value);
            headingSelect.innerHTML = '<option value="">-- ' + (t('ui.no_heading') || '(no heading)') + ' --</option>' +
                headings.map(h => `<option value="${h.anchor}">${'　'.repeat(h.level - 1)}${h.text}</option>`).join('');
            return;
        }
        // 其他文件：从磁盘读取
        const result = await weAPI.readFile(project.projectPath, filename);
        if (result.success) {
            const headings = getHeadingsFromMarkdown(result.content);
            headingSelect.innerHTML = '<option value="">-- ' + (t('ui.no_heading') || '(no heading)') + ' --</option>' +
                headings.map(h => `<option value="${h.anchor}">${'　'.repeat(h.level - 1)}${h.text}</option>`).join('');
        }
    };

    dialog.querySelector('.btn-cancel').onclick = () => dialog.remove();
    dialog.querySelector('.dialog-overlay').onclick = () => dialog.remove();

    dialog.querySelector('.btn-confirm').onclick = () => {
        const isUrl = currentType === 'url';
        const linkText = dialog.querySelector('#link-text').value || selected;

        if (isUrl) {
            const url = dialog.querySelector('#external-url').value.trim();
            if (!url) { showNotification(t('ui.enter_url') || 'Please enter URL'); return; }
            wrapMarkdownTextarea(textarea, '[', `](${url})`, linkText);
        } else {
            const filename = fileSelect.value;
            const heading = headingSelect.value;
            if (!filename) { showNotification(t('ui.select_file') || 'Please select target file'); return; }
            const anchorPart = heading ? '#' + heading : '';
            wrapMarkdownTextarea(textarea, '[', `](project:${encodeURIComponent(filename)}${anchorPart})`, linkText);
        }
        dialog.remove();
        if (preview) renderMarkdownPreview(textarea.value, preview);
    };
}

async function renderMarkdownPreview(text, previewEl) {
    if (!previewEl) return;
    previewEl.innerHTML = markdownToHtmlString(text);
    // 渲染 KaTeX 公式
    if (window.katex) {
        previewEl.querySelectorAll('.katex-render').forEach(el => {
            try {
                window.katex.render(el.dataset.formula || '', el, {
                    displayMode: el.dataset.display === 'true',
                    throwOnError: false
                });
            } catch (e) { el.textContent = el.dataset.formula || ''; }
        });
    }
}

function markdownToHtmlString(text) {
    // 先处理表格：需要识别表头分隔行，链式 replace 难以处理，单独提取
    const renderTable = (tableText) => {
        const lines = tableText.trim().split('\n');
        if (lines.length < 2) return tableText;
        // 第二行必须是分隔行 |---|---|
        if (!/^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(lines[1])) return tableText;
        const parseRow = (line) => {
            const cells = line.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
            return cells;
        };
        const headerCells = parseRow(lines[0]);
        let html = '<table class="md-table"><thead><tr>';
        headerCells.forEach(c => html += `<th>${inlineMd(c)}</th>`);
        html += '</tr></thead><tbody>';
        for (let i = 2; i < lines.length; i++) {
            const cells = parseRow(lines[i]);
            html += '<tr>';
            cells.forEach(c => html += `<td>${inlineMd(c)}</td>`);
            html += '</tr>';
        }
        html += '</tbody></table>';
        return html;
    };
    // 行内格式（粗体/斜体/代码/链接等），供表格单元格使用
    const inlineMd = (s) => {
        return s
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/~~(.*?)~~/g, '<s>$1</s>');
    };

    // 提取表格块（连续以 | 开头或含 | 分隔的行）
    const tableBlocks = [];
    let processed = text.replace(/((?:^\|.*(?:\n|$))+)/gm, (block) => {
        const idx = tableBlocks.length;
        tableBlocks.push(renderTable(block));
        return `\u0000TABLE_${idx}\u0000`;
    });

    let html = processed
        // 代码块
        .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="lang-$1">$2</code></pre>')
        // 块级公式 $$...$$
        .replace(/\$\$([\s\S]+?)\$\$/g, (_, formula) =>
            `<span class="katex-render" data-formula="${formula.replace(/"/g, '&quot;').trim()}" data-display="true"></span>`)
        // 行内公式 $...$
        .replace(/\$([^\$\n]+?)\$/g, (_, formula) =>
            `<span class="katex-render" data-formula="${formula.replace(/"/g, '&quot;').trim()}" data-display="false"></span>`)
        // 行内代码
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        // 图片
        .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;max-height:300px" />')
        // 项目内跳转链接
        .replace(/\[([^\]]+)\]\(project:([^)\s]+)\)/g, (_, t, rest) => {
            const [file, heading] = rest.split('#');
            const anchorAttr = heading ? ` data-heading="${heading}"` : '';
            return `<a href="project:${rest}" class="jump-link"${anchorAttr}>${t}</a>`;
        })
        // 外部链接
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
        // 粗体
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        // 斜体
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        // 删除线
        .replace(/~~(.*?)~~/g, '<s>$1</s>')
        // 标题
        .replace(/^### (.*$)/gm, '<h3>$1</h3>')
        .replace(/^## (.*$)/gm, '<h2>$1</h2>')
        .replace(/^# (.*$)/gm, '<h1>$1</h1>')
        // 引用
        .replace(/^> (.*$)/gm, '<blockquote>$1</blockquote>')
        // 无序列表
        .replace(/^[-*] (.*$)/gm, '<li>$1</li>')
        // 有序列表
        .replace(/^\d+\. (.*$)/gm, '<li>$1</li>')
        // 段落
        .replace(/\n\n/g, '</p><p>')
        // 换行
        .replace(/\n/g, '<br>')
        // 还原表格占位符
        .replace(/\u0000TABLE_(\d+)\u0000/g, (_, idx) => tableBlocks[parseInt(idx)]);

    return `<p>${html}</p>`;
}

function wrapMarkdownTextarea(textarea, before, after, customText) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.substring(start, end);
    const replacement = selected || customText || t('text') || 'text';

    textarea.value = textarea.value.substring(0, start) + before + replacement + (after || '') + textarea.value.substring(end);
    textarea.selectionStart = start + before.length;
    textarea.selectionEnd = start + before.length + replacement.length;
    textarea.focus();
    textarea.dispatchEvent(new Event('input'));
}

function insertMarkdownList(textarea, listType) {
    const start = textarea.selectionStart;
    const lineStart = textarea.value.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = textarea.value.indexOf('\n', start);
    if (lineEnd === -1) lineEnd = textarea.value.length;
    
    const line = textarea.value.substring(lineStart, lineEnd);
    let prefix;
    if (listType === 'ordered') prefix = '1. ';
    else if (listType === 'bullet') prefix = '- ';
    else prefix = '- [ ] ';
    
    textarea.value = textarea.value.substring(0, lineStart) + prefix + line + textarea.value.substring(lineEnd);
    textarea.selectionStart = textarea.selectionEnd = lineStart + prefix.length;
    textarea.focus();
    textarea.dispatchEvent(new Event('input'));
}

function updateMarkdownStats(text) {
    const cleanText = text.replace(/\n$/, '');
    const chars = cleanText.length;
    
    let words = 0;
    if (cleanText.trim()) {
        const chineseChars = (cleanText.match(/[\u4e00-\u9fa5]/g) || []).length;
        const nonChineseText = cleanText.replace(/[\u4e00-\u9fa5]/g, ' ').trim();
        const nonChineseWords = nonChineseText ? nonChineseText.split(/\s+/).filter(Boolean).length : 0;
        words = chineseChars + nonChineseWords;
    }
    
    const wordsEl = document.getElementById('stat-words');
    const charsEl = document.getElementById('stat-chars');
    if (wordsEl) wordsEl.textContent = words;
    if (charsEl) charsEl.textContent = chars;
}

function generateTableOfContents() {
    if (!quill) return;

    if (!tocPanel) {
        tocPanel = document.createElement('div');
        tocPanel.className = 'toc-panel';
        const wrapper = quill.container.closest('.quill-wrapper') || quill.container.parentElement;
        wrapper.parentElement.insertBefore(tocPanel, wrapper.nextSibling);
    }

    tocPanel.innerHTML = '';
    const tocHeader = document.createElement('div');
    tocHeader.className = 'toc-header';
    tocHeader.innerHTML = `<span>${t('ui.table_of_contents') || 'Table of Contents'}</span><button class="toc-close">✕</button>`;
    tocHeader.querySelector('.toc-close').onclick = () => {
        tocPanel.remove();
        tocPanel = null;
    };
    tocPanel.appendChild(tocHeader);

    const delta = quill.getContents();
    const headings = [];
    let textBuffer = '';
    let docIndex = 0;

    delta.ops.forEach((op) => {
        if (op.insert === '\n') {
            // 独立换行符，带属性
            if (op.attributes && op.attributes.header) {
                headings.push({
                    level: op.attributes.header,
                    text: textBuffer.trim(),
                    index: docIndex - textBuffer.length
                });
            }
            docIndex += 1;
            textBuffer = '';
        } else if (op.insert && typeof op.insert === 'string') {
            if (op.insert.includes('\n')) {
                // 文本中包含换行符（Quill 有时会合并 text+\n 到同一个 op）
                // 此时属性（如 header）作用于换行符前的文本
                const segments = op.insert.split('\n');
                for (let i = 0; i < segments.length; i++) {
                    if (segments[i]) {
                        textBuffer += segments[i];
                        docIndex += segments[i].length;
                    }
                    // 每段之后（除了最后一段）都是一个 \n
                    if (i < segments.length - 1) {
                        if (op.attributes && op.attributes.header) {
                            headings.push({
                                level: op.attributes.header,
                                text: textBuffer.trim(),
                                index: docIndex - textBuffer.length
                            });
                        }
                        docIndex += 1;
                        textBuffer = '';
                    }
                }
            } else {
                textBuffer += op.insert;
                docIndex += op.insert.length;
            }
        }
    });

    if (headings.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'toc-empty';
        emptyMsg.textContent = t('ui.no_headings') || 'No headings yet. Select Heading 1/2/3 from the toolbar dropdown to create sections.';
        tocPanel.appendChild(emptyMsg);
        return;
    }

    const tocList = document.createElement('ul');
    tocList.className = 'toc-list';
    headings.forEach((h) => {
        const li = document.createElement('li');
        li.className = `toc-level-${h.level}`;
        li.textContent = h.text;
        li.onclick = () => {
            quill.setSelection(h.index, 0);
            const range = quill.getBounds(h.index);
            quill.root.scrollTo({ top: range.top - 50, behavior: 'smooth' });
        };
        tocList.appendChild(li);
    });
    tocPanel.appendChild(tocList);
}

function updateEditorStats() {
    if (!quill) return;
    const text = quill.getText();
    // 去除 Quill 末尾自动添加的换行符
    const cleanText = text.replace(/\n$/, '');
    editorStats.chars = cleanText.length;
    // 字数统计：中文字符按字计数，英文按单词计数
    if (cleanText.trim()) {
        const chineseChars = cleanText.match(/[\u4e00-\u9fa5]/g) || [];
        const nonChineseText = cleanText.replace(/[\u4e00-\u9fa5]/g, ' ').trim();
        const nonChineseWords = nonChineseText ? nonChineseText.split(/\s+/).length : 0;
        editorStats.words = chineseChars.length + nonChineseWords;
    } else {
        editorStats.words = 0;
    }

    const wordsEl = document.getElementById('stat-words');
    const charsEl = document.getElementById('stat-chars');
    if (wordsEl) wordsEl.textContent = editorStats.words;
    if (charsEl) charsEl.textContent = editorStats.chars;

    if (tocPanel && tocPanel.isConnected) {
        generateTableOfContents();
    }

    // 更新扩展的统计信息
    if (typeof updateStatusBarStats === 'function') {
        updateStatusBarStats();
    }
}

// 暴露到 window 以供其他模块包装
window.updateEditorStats = updateEditorStats;

function getCurrentFileName() {
    const project = tabs[activeTabId];
    const f = project?.currentFile || 'document';
    return stripExt(f.split('/').pop());
}

function downloadText(text, filename, mimeType) {
    const blob = new Blob([text], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function deltaToMarkdown(delta) {
    let md = '';
    let textBuffer = '';
    let inCodeBlock = false;
    // 列表编号追踪
    let listCounter = 0;
    let prevListType = null;

    function flushText() {
        if (textBuffer) {
            md += textBuffer;
            textBuffer = '';
        }
    }

    function closeCodeBlock() {
        if (inCodeBlock) {
            md += '```';
            inCodeBlock = false;
        }
    }

    function resetListCounter() {
        listCounter = 0;
        prevListType = null;
    }

    // 处理一个换行符（带属性）的通用逻辑
    function processNewline(attributes) {
        if (!attributes) {
            closeCodeBlock();
            resetListCounter();
            flushText();
            md += '\n';
            return;
        }
        if (attributes.header) {
            closeCodeBlock();
            resetListCounter();
            md += '\n' + '#'.repeat(attributes.header) + ' ' + textBuffer + '\n';
            textBuffer = '';
        } else if (attributes.list === 'ordered') {
            closeCodeBlock();
            if (prevListType !== 'ordered') { listCounter = 0; }
            prevListType = 'ordered';
            listCounter++;
            md += `\n${listCounter}. ${textBuffer}`;
            textBuffer = '';
        } else if (attributes.list === 'bullet') {
            closeCodeBlock();
            if (prevListType !== 'bullet') { listCounter = 0; }
            prevListType = 'bullet';
            md += `\n- ${textBuffer}`;
            textBuffer = '';
        } else if (attributes.list === 'check') {
            closeCodeBlock();
            if (prevListType !== 'check') { listCounter = 0; }
            prevListType = 'check';
            md += attributes.checked ? `\n- [x] ${textBuffer}` : `\n- [ ] ${textBuffer}`;
            textBuffer = '';
        } else if (attributes.blockquote) {
            closeCodeBlock();
            resetListCounter();
            md += `\n> ${textBuffer}`;
            textBuffer = '';
        } else if (attributes['code-block']) {
            if (!inCodeBlock) {
                resetListCounter();
                md += '\n```\n';
                inCodeBlock = true;
            }
            md += textBuffer + '\n';
            textBuffer = '';
        } else {
            closeCodeBlock();
            resetListCounter();
            flushText();
            md += '\n';
        }
    }

    delta.ops.forEach(op => {
        if (op.insert === '\n') {
            // 独立换行符
            processNewline(op.attributes);
        } else if (op.insert && typeof op.insert === 'string') {
            if (op.insert.includes('\n')) {
                // 文本中包含换行符（Quill 有时会合并 text+\n 到同一个 op）
                const segments = op.insert.split('\n');
                for (let i = 0; i < segments.length; i++) {
                    if (segments[i]) {
                        if (op.attributes) {
                            let text = segments[i];
                            if (op.attributes.link) text = `[${text}](${op.attributes.link})`;
                            if (op.attributes.bold) text = `**${text}**`;
                            if (op.attributes.italic) text = `*${text}*`;
                            if (op.attributes.strike) text = `~~${text}~~`;
                            if (op.attributes.code) text = '`' + text + '`';
                            textBuffer += text;
                        } else {
                            textBuffer += segments[i];
                        }
                    }
                    // 每段之后（除了最后一段）都是一个 \n
                    if (i < segments.length - 1) {
                        processNewline(op.attributes);
                    }
                }
            } else {
                // 普通文本
                if (op.attributes) {
                    let text = op.insert;
                    if (op.attributes.link) text = `[${text}](${op.attributes.link})`;
                    if (op.attributes.bold) text = `**${text}**`;
                    if (op.attributes.italic) text = `*${text}*`;
                    if (op.attributes.strike) text = `~~${text}~~`;
                    if (op.attributes.code) text = '`' + text + '`';
                    textBuffer += text;
                } else {
                    textBuffer += op.insert;
                }
            }
        } else if (op.insert && op.insert.image) {
            closeCodeBlock();
            resetListCounter();
            flushText();
            md += `![image](${op.insert.image})\n`;
        }
    });

    closeCodeBlock();
    flushText();
    return md.trim();
}

async function saveCurrentFile(silent) {
    if (isSaving) {
        pendingSave = true;
        return;
    }

    const project = tabs[activeTabId];
    if (!project || !project.currentFile) return;

    isSaving = true;
    pendingSave = false;

    const projectMode = project.projectMode || 'rich';
    let content;
    if (projectMode === 'markdown') {
        if (!markdownEditor) { isSaving = false; return; }
        content = markdownEditor.value;
    } else {
        if (!quill) { isSaving = false; return; }
        content = quill.root.innerHTML;
    }

    // 通知用户正在保存（持久显示，直到保存完成）
    showNotification(t('ui.saving') || '正在保存...', 0);

    try {
        const res = await weAPI.saveFile(project.projectPath, project.currentFile, content);
        if (res.success) {
            project.dirty = false;
            project.savedContent = content;
            if (project.fileCache) {
                delete project.fileCache[project.currentFile];
            }
            updateStatusBar();
            showNotification(t('ui.saved') || '已保存');
        } else {
            showNotification((t('ui.save_failed') || '保存失败') + ': ' + res.error);
        }
    } catch (e) {
        showNotification((t('ui.save_failed') || '保存失败') + ': ' + e.message);
    } finally {
        isSaving = false;
        // 如果保存期间有新的保存请求，立即再执行一次
        if (pendingSave) {
            pendingSave = false;
            saveCurrentFile(silent);
        }
    }
}

async function addFileToProject(safeId) {
    const project = tabs[safeId];
    if (!project) return;
    const result = await showPrompt(t('ui.new_item') || '新建', t('ui.file_name') || '文件名', { typeSwitch: true, defaultType: 'file' });
    if (!result) return;
    const name = result.value;
    if (!name) return;

    if (result.type === 'folder') {
        const res = await weAPI.addFolder(project.projectPath, name);
        if (res.success) {
            const updated = await weAPI.openProject(project.projectPath);
            if (updated.success) {
                project.fileList = updated.fileList;
                refreshFileTree(safeId, updated.fileList);
            }
            showNotification(t('ui.folder_created') || '文件夹已创建');
        } else {
            showNotification((t('ui.create_failed') || '创建失败') + ': ' + res.error);
        }
    } else {
        const res = await weAPI.addFile(project.projectPath, name);
        if (res.success) {
            const updated = await weAPI.openProject(project.projectPath);
            if (updated.success) {
                project.fileList = updated.fileList;
                refreshFileTree(safeId, updated.fileList);
            }
            openProjectFile(safeId, name);
        } else {
            showNotification((t('ui.add_failed') || '添加失败') + ': ' + res.error);
        }
    }
}

// ========== 切换编辑器模式（单向转化） ==========

async function switchEditorMode() {
    // 找到当前打开的项目标签
    const project = tabs[activeTabId];
    if (!project || !project.projectPath) {
        showNotification(t('ui.need_open_project') || '请先打开一个项目');
        return;
    }

    const currentMode = project.projectMode || 'rich';
    const targetMode = currentMode === 'rich' ? 'markdown' : 'rich';
    const currentModeName = currentMode === 'rich'
        ? (t('ui.rich_text_mode') || '富文本模式')
        : (t('ui.markdown_mode') || 'Markdown 模式');
    const targetModeName = targetMode === 'rich'
        ? (t('ui.rich_text_mode') || '富文本模式')
        : (t('ui.markdown_mode') || 'Markdown 模式');

    // 强警告对话框
    const dialog = document.createElement('div');
    dialog.className = 'jump-link-dialog mode-switch-dialog';
    dialog.innerHTML = `
        <div class="dialog-overlay"></div>
        <div class="dialog-box mode-switch-box">
            <div class="warning-icon">⚠</div>
            <h3>${t('ui.mode_switch_title') || '切换编辑器模式'}</h3>
            <div class="warning-text">
                ${t('ui.mode_switch_warning') || '警告：此操作不可逆！'}
            </div>
            <div class="mode-switch-detail">
                <div class="mode-arrow">
                    <span class="mode-badge mode-from">${currentModeName}</span>
                    <span class="arrow">→</span>
                    <span class="mode-badge mode-to">${targetModeName}</span>
                </div>
                <p class="warning-detail">${currentMode === 'rich'
                    ? (t('ui.mode_switch_rich_to_md') || '将把本项目的富文本/HTML 格式转为纯 Markdown 源码。切换后将无法无损退回原模式，所有跳转链接将变为普通文字，格式标记（**粗体**、# 标题等）将被保留。')
                    : (t('ui.mode_switch_md_to_rich') || '将把本项目的 Markdown 源码转为富文本/HTML 格式。切换后将无法无损退回原模式，所有项目内跳转链接将变为普通文字，格式将被解析为富文本。')
                }</p>
                <p class="warning-confirm-text">${t('ui.mode_switch_confirm') || '您确定要继续吗？'}</p>
            </div>
            <div class="dialog-actions">
                <button class="btn-cancel">${t('ui.cancel') || '取消'}</button>
                <button class="btn-confirm btn-danger">${t('ui.mode_switch_confirm_btn') || '确认切换（不可撤销）'}</button>
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
        await performModeSwitch(project.projectPath, currentMode, targetMode);
    };
}

async function performModeSwitch(projectPath, fromMode, toMode) {
    showNotification(t('ui.mode_switch_converting') || '正在转换...');

    // 获取所有文件列表
    const listResult = await weAPI.listFiles(projectPath);
    if (!listResult.success) {
        showNotification(t('ui.mode_switch_failed') || '转换失败：无法读取文件列表');
        return;
    }
    const files = listResult.files || [];

    // 转换每个文件
    for (const filename of files) {
        if (filename.startsWith('_')) continue; // 跳过元数据和图片文件
        const readResult = await weAPI.readFile(projectPath, filename);
        if (!readResult.success) continue;

        const originalContent = readResult.content;
        let newContent;

        if (fromMode === 'rich' && toMode === 'markdown') {
            newContent = convertHtmlToMarkdown(originalContent);
        } else if (fromMode === 'markdown' && toMode === 'rich') {
            newContent = convertMarkdownToHtml(originalContent);
        } else {
            continue;
        }

        await weAPI.saveFile(projectPath, filename, newContent);
    }

    // 更新项目元数据
    const modeResult = await weAPI.setProjectMode(projectPath, toMode);
    if (!modeResult.success) {
        showNotification(t('ui.mode_switch_meta_failed') || '元数据更新失败');
        return;
    }

    // 关闭当前项目标签并重新打开
    const projectName = tabs[activeTabId]?.title || projectPath.split(/[\\/]/).pop();
    if (activeTabId && tabs[activeTabId]) {
        closeTab(activeTabId, true);
    }

    // 重新打开项目
    setTimeout(async () => {
        const result = await weAPI.openProject(projectPath);
        if (result.success) {
            openProjectDirectly(result);
            showNotification(t('ui.mode_switch_done') || '编辑器模式已切换');
        }
    }, 200);
}

// 富文本 HTML → Markdown 纯文本
function convertHtmlToMarkdown(html) {
    if (!html || !html.trim()) return '';
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return domToMarkdown(temp).replace(/\n{3,}/g, '\n\n').trim();
}

function domToMarkdown(node) {
    let result = '';
    for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
            result += child.textContent;
            continue;
        }
        if (child.nodeType !== Node.ELEMENT_NODE) continue;

        const tag = child.tagName.toLowerCase();
        const content = domToMarkdown(child);

        switch (tag) {
            case 'h1': result += '\n# ' + content + '\n'; break;
            case 'h2': result += '\n## ' + content + '\n'; break;
            case 'h3': result += '\n### ' + content + '\n'; break;
            case 'strong': case 'b': result += '**' + content + '**'; break;
            case 'em': case 'i': result += '*' + content + '*'; break;
            case 's': case 'strike': case 'del': result += '~~' + content + '~~'; break;
            case 'u': result += content; break; // 下划线在MD中无对应，保留纯文本
            case 'a':
                if (child.classList.contains('jump-link')) {
                    result += content; // 跳转链接 → 纯文字
                } else {
                    result += '[' + content + '](' + (child.getAttribute('href') || '') + ')';
                }
                break;
            case 'img':
                result += '![' + (child.alt || '') + '](' + (child.src || '') + ')';
                break;
            case 'ol':
                child.querySelectorAll(':scope > li').forEach((li, i) => {
                    result += '\n' + (i + 1) + '. ' + domToMarkdown(li);
                });
                result += '\n';
                break;
            case 'ul':
                child.querySelectorAll(':scope > li').forEach(li => {
                    const checked = li.getAttribute('data-checked');
                    if (checked === 'true') result += '\n- [x] ' + domToMarkdown(li);
                    else if (checked === 'false') result += '\n- [ ] ' + domToMarkdown(li);
                    else result += '\n- ' + domToMarkdown(li);
                });
                result += '\n';
                break;
            case 'li': result += content; break;
            case 'blockquote': result += '\n> ' + content + '\n'; break;
            case 'pre':
                result += '\n```\n' + child.textContent + '\n```\n';
                break;
            case 'code': result += '`' + content + '`'; break;
            case 'br': result += '\n'; break;
            case 'p': result += '\n' + content + '\n'; break;
            case 'div': result += content; break;
            default: result += content;
        }
    }
    return result;
}

// Markdown 纯文本 → 富文本 HTML（Quill 兼容）
function convertMarkdownToHtml(md) {
    if (!md || !md.trim()) return '';

    let html = md;
    // 代码块
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
        return '<pre>' + escapeHtml(code.trim()) + '</pre>';
    });
    // 行内代码
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    // 图片（在链接前处理）
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
    // 项目内跳转链接 → 纯文字（去掉链接功能）
    html = html.replace(/\[([^\]]+)\]\(project:[^)\s]+\)/g, '$1');
    // 外部链接
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    // 粗体
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // 斜体
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    // 删除线
    html = html.replace(/~~(.*?)~~/g, '<s>$1</s>');

    // 按行处理块级元素
    const lines = html.split('\n');
    const blocks = [];
    let inList = null; // 'ol' | 'ul' | null
    let listItems = [];
    let paragraph = [];

    function flushParagraph() {
        if (paragraph.length > 0) {
            blocks.push('<p>' + paragraph.join('<br>') + '</p>');
            paragraph = [];
        }
    }
    function flushList() {
        if (inList && listItems.length > 0) {
            blocks.push('<' + inList + '>' + listItems.map(li => '<li>' + li + '</li>').join('') + '</' + inList + '>');
            listItems = [];
            inList = null;
        }
    }

    for (const line of lines) {
        const trimmed = line.trim();
        // 标题
        const h3 = trimmed.match(/^###\s+(.+)/);
        const h2 = trimmed.match(/^##\s+(.+)/);
        const h1 = trimmed.match(/^#\s+(.+)/);
        if (h1) { flushParagraph(); flushList(); blocks.push('<h1>' + h1[1] + '</h1>'); continue; }
        if (h2) { flushParagraph(); flushList(); blocks.push('<h2>' + h2[1] + '</h2>'); continue; }
        if (h3) { flushParagraph(); flushList(); blocks.push('<h3>' + h3[1] + '</h3>'); continue; }
        // 引用
        const quote = trimmed.match(/^>\s*(.*)/);
        if (quote) { flushParagraph(); flushList(); blocks.push('<blockquote>' + quote[1] + '</blockquote>'); continue; }
        // 有序列表
        const ol = trimmed.match(/^\d+\.\s+(.+)/);
        if (ol) { flushParagraph(); if (inList !== 'ol') { flushList(); inList = 'ol'; } listItems.push(ol[1]); continue; }
        // 无序列表 / 任务列表
        const ulChecked = trimmed.match(/^-\s+\[x\]\s+(.+)/i);
        const ulUnchecked = trimmed.match(/^-\s+\[\s\]\s+(.+)/);
        const ul = trimmed.match(/^[-*]\s+(.+)/);
        if (ulChecked) { flushParagraph(); if (inList !== 'ul') { flushList(); inList = 'ul'; } listItems.push('<span data-list="check" data-checked="true">' + ulChecked[1] + '</span>'); continue; }
        if (ulUnchecked) { flushParagraph(); if (inList !== 'ul') { flushList(); inList = 'ul'; } listItems.push('<span data-list="check" data-checked="false">' + ulUnchecked[1] + '</span>'); continue; }
        if (ul) { flushParagraph(); if (inList !== 'ul') { flushList(); inList = 'ul'; } listItems.push(ul[1]); continue; }
        // 空行
        if (trimmed === '') { flushParagraph(); flushList(); continue; }
        // 代码块（已处理为 <pre>，跳过内部）
        if (trimmed.startsWith('<pre>')) { flushParagraph(); flushList(); blocks.push(trimmed); continue; }
        // 普通文本行
        flushList();
        paragraph.push(trimmed);
    }
    flushParagraph();
    flushList();

    return blocks.join('');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ====== 智能括号/引号自动补全 ======
const PAIRS = {
    '(': ')',
    '[': ']',
    '{': '}',
};
const QUOTES = new Set(['"', "'"]);
const CLOSE_BRACKETS = new Set([')', ']', '}']);

// 判断光标前一个字符是否为字母/数字/下划线（用于判断是否应跳过引号补全）
function isWordChar(ch) {
    return ch && /\w/.test(ch);
}

// Quill 富文本编辑器：智能括号/引号补全
function handleSmartBrackets(e) {
    if (!smartBracketsEnabled) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const key = e.key;

    // 括号补全
    if (PAIRS[key]) {
        e.preventDefault();
        const range = quill.getSelection();
        if (!range) return;
        const close = PAIRS[key];
        if (range.length > 0) {
            // 选中文本：用括号包裹
            const selected = quill.getText(range.index, range.length);
            quill.deleteText(range.index, range.length, Quill.sources.USER);
            quill.insertText(range.index, key + selected + close, Quill.sources.USER);
            quill.setSelection(range.index + 1, selected.length, Quill.sources.USER);
        } else {
            // 无选中：插入成对括号，光标居中
            quill.insertText(range.index, key + close, Quill.sources.USER);
            quill.setSelection(range.index + 1, 0, Quill.sources.USER);
        }
        return;
    }

    // 引号补全
    if (QUOTES.has(key)) {
        const range = quill.getSelection();
        if (!range) return;
        // 光标前是字母/数字时不补全（可能是缩写如 don't）
        const beforeText = range.index > 0 ? quill.getText(range.index - 1, 1) : '';
        if (isWordChar(beforeText)) return;

        e.preventDefault();
        if (range.length > 0) {
            // 选中文本：用引号包裹
            const selected = quill.getText(range.index, range.length);
            quill.deleteText(range.index, range.length, Quill.sources.USER);
            quill.insertText(range.index, key + selected + key, Quill.sources.USER);
            quill.setSelection(range.index + 1, selected.length, Quill.sources.USER);
        } else {
            // 无选中：插入成对引号，光标居中
            quill.insertText(range.index, key + key, Quill.sources.USER);
            quill.setSelection(range.index + 1, 0, Quill.sources.USER);
        }
        return;
    }

    // 输入右括号/右引号时，若已存在配对，跳过（光标自动右移）
    if (CLOSE_BRACKETS.has(key) || QUOTES.has(key)) {
        const range = quill.getSelection();
        if (!range || range.length > 0) return;
        const nextChar = quill.getText(range.index, 1);
        if (nextChar === key) {
            e.preventDefault();
            quill.setSelection(range.index + 1, 0, Quill.sources.USER);
            return;
        }
    }

    // Backspace 删除成对空括号/引号
    if (e.key === 'Backspace') {
        const range = quill.getSelection();
        if (!range || range.length > 0) return;
        if (range.index < 2) return;
        const before = quill.getText(range.index - 1, 1);
        const after = quill.getText(range.index, 1);
        // 匹配成对
        const isPair = (PAIRS[before] && PAIRS[before] === after) ||
                       (QUOTES.has(before) && before === after);
        if (isPair) {
            e.preventDefault();
            quill.deleteText(range.index - 1, 2, Quill.sources.USER);
            quill.setSelection(range.index - 1, 0, Quill.sources.USER);
        }
    }
}

// Markdown 编辑器（textarea）：智能括号/引号补全
function handleSmartBracketsTextarea(e) {
    if (!smartBracketsEnabled) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const ta = e.target;
    const key = e.key;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const val = ta.value;

    // 括号补全
    if (PAIRS[key]) {
        e.preventDefault();
        const close = PAIRS[key];
        if (start !== end) {
            // 选中文本：用括号包裹
            const selected = val.substring(start, end);
            ta.value = val.substring(0, start) + key + selected + close + val.substring(end);
            ta.selectionStart = start + 1;
            ta.selectionEnd = end + 1;
        } else {
            ta.value = val.substring(0, start) + key + close + val.substring(start);
            ta.selectionStart = ta.selectionEnd = start + 1;
        }
        ta.dispatchEvent(new Event('input'));
        return;
    }

    // 引号补全
    if (QUOTES.has(key)) {
        const beforeChar = start > 0 ? val[start - 1] : '';
        if (isWordChar(beforeChar)) return;

        e.preventDefault();
        if (start !== end) {
            const selected = val.substring(start, end);
            ta.value = val.substring(0, start) + key + selected + key + val.substring(end);
            ta.selectionStart = start + 1;
            ta.selectionEnd = end + 1;
        } else {
            ta.value = val.substring(0, start) + key + key + val.substring(start);
            ta.selectionStart = ta.selectionEnd = start + 1;
        }
        ta.dispatchEvent(new Event('input'));
        return;
    }

    // 跳过已有的右括号/右引号
    if (CLOSE_BRACKETS.has(key) || QUOTES.has(key)) {
        if (start === end && val[start] === key) {
            e.preventDefault();
            ta.selectionStart = ta.selectionEnd = start + 1;
        }
        return;
    }

    // Backspace 删除成对空括号/引号
    if (e.key === 'Backspace' && start === end && start > 0) {
        const before = val[start - 1];
        const after = val[start];
        const isPair = (PAIRS[before] && PAIRS[before] === after) ||
                       (QUOTES.has(before) && before === after);
        if (isPair) {
            e.preventDefault();
            ta.value = val.substring(0, start - 1) + val.substring(start + 1);
            ta.selectionStart = ta.selectionEnd = start - 1;
            ta.dispatchEvent(new Event('input'));
        }
    }
}
