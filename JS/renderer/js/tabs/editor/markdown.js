// ====== editor/markdown.js — Markdown 编辑器功能 ======
// 源文件: editor.js (行1701-2273)

async function openMarkdownFile(safeId, filename) {
    weLog.info('editor', '→ openMarkdownFile 开始', { safeId, filename });
    const project = tabs[safeId];
    if (!project) {
        weLog.warn('editor', 'openMarkdownFile: project 不存在', { safeId });
        return;
    }

    // 暂存当前文件
    if (project.currentFile && project.currentFile !== filename && project.dirty && markdownEditor
        && !project.currentFile.endsWith('.node.json')) {
        weLog.info('editor', 'openMarkdownFile: 暂存当前 Markdown 文件', { prevFile: project.currentFile });
        project.fileCache = project.fileCache || {};
        project.fileCache[project.currentFile] = _fcWrap('md', markdownEditor.value);
    }

    // 读取文件内容
    let content;
    let fromCache = false;
    if (project.fileCache) {
        const cached = _fcUnwrap('md', project.fileCache[filename]);
        if (cached !== undefined) {
            weLog.info('editor', 'openMarkdownFile: 从缓存读取内容', { filename });
            content = cached;
            fromCache = true;
        }
    }
    if (!fromCache) {
        weLog.info('editor', 'openMarkdownFile: 从磁盘读取文件', { filename });
        const result = await weAPI.readFile(project.projectPath, filename);
        if (!result.success) {
            weLog.error('editor', 'openMarkdownFile: 读取文件失败', { filename, error: result.error });
            showNotification(t('ui.read_failed') + ': ' + result.error);
            return;
        }
        content = result.content;
    }

    const quillWrapper = document.getElementById(`quill-${safeId}`);
    if (!quillWrapper) {
        weLog.warn('editor', 'openMarkdownFile: quillWrapper 不存在', { safeId });
        return;
    }

    // 清理旧内容
    quillWrapper.innerHTML = '';
    quill = null;
    weLog.debug('editor', 'openMarkdownFile: 已清理旧 Quill 内容');

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
            <button class="custom-btn btn-md-history" title="${t('ui.ng_history') || '历史记录 (Ctrl+H)'}">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/></svg>
            </button>
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
    weLog.info('editor', 'openMarkdownFile: Markdown 编辑器已初始化', { contentLen: content.length });

    // ====== GlobalUndoManager 接入：Markdown ======
    // 方案：beforeinput 记录 prev；input 时 push(prev, next) 到全局栈
    // 配合 GlobalUndoManager 400ms debounce 合并连续打字步骤
    const guMD = ensureGlobalUndo(safeId);
    let prevMdSnapshot = textarea.value;
    textarea.addEventListener('beforeinput', () => {
        if (guMD && guMD.suppress > 0) return; // undo/redo 期间不更新 prev，保持 op.prev 稳定
        prevMdSnapshot = textarea.value;
    });

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
        weLog.debug('editor', 'openMarkdownFile textarea input: 触发实时预览/统计');
        project.fileCache = project.fileCache || {};
        project.fileCache[filename] = _fcWrap('md', textarea.value);
        project.dirty = true;
        project.currentFile = filename;
        renderMarkdownPreview(textarea.value, preview);
        updateMarkdownStats(textarea.value);
        // 全局撤回：push 快照（suppress 期间跳过；prev/next 一样跳过）
        if (guMD && guMD.suppress === 0) {
            const next = textarea.value;
            if (prevMdSnapshot !== next) {
                guMD.push({
                    type: 'markdown',
                    file: filename,
                    label: '编辑 Markdown',
                    prev: prevMdSnapshot,
                    next: next,
                });
                prevMdSnapshot = next;
            }
        }
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
        weLog.info('editor', 'openMarkdownFile: 点击 MD 链接按钮');
        showPrompt(t('ui.enter_url') || 'Enter URL:', 'https://...').then(url => {
            if (url) wrapMarkdownTextarea(textarea, '[', `](${url})`);
        });
    };

    mdToolbar.querySelector('.btn-md-jump').onclick = () => {
        weLog.info('editor', 'openMarkdownFile: 点击 MD 跳转链接按钮');
        showMarkdownJumpDialog(safeId, textarea, preview);
    };

    mdToolbar.querySelector('.btn-md-image').onclick = () => {
        weLog.info('editor', 'openMarkdownFile: 点击 MD 图片按钮');
        showPrompt(t('ui.enter_image_url') || 'Enter image URL:', 'https://...').then(url => {
            if (url) wrapMarkdownTextarea(textarea, '![', `](${url})`);
        });
    };

    mdToolbar.querySelector('.btn-md-export').onclick = (e) => {
        weLog.info('editor', 'openMarkdownFile: 点击 MD 导出按钮');
        showExportMenu(mdToolbar.querySelector('.btn-md-export'));
    };

    mdToolbar.querySelector('.btn-md-preview-toggle').onclick = () => {
        markdownPreviewVisible = !markdownPreviewVisible;
        weLog.info('editor', 'openMarkdownFile: 切换预览可见性', { visible: markdownPreviewVisible });
        const previewPane = mdContainer.querySelector('.md-preview-pane');
        if (markdownPreviewVisible) {
            previewPane.classList.remove('md-hidden');
        } else {
            previewPane.classList.add('md-hidden');
        }
    };

    const mdHistBtn = mdToolbar.querySelector('.btn-md-history');
    if (mdHistBtn) mdHistBtn.onclick = () => toggleHistoryPanel(safeId);

    // 预览区点击跳转处理
    const previewEl = mdContainer.querySelector('.md-preview-content');
    if (previewEl) {
        previewEl.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (!link) return;
            const href = link.getAttribute('href') || '';
            if (href.startsWith('project:')) {
                e.preventDefault();
                weLog.debug('editor', 'openMarkdownFile 预览点击: 项目内跳转', { href });
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
                } catch (err) {
                    weLog.error('editor', 'openMarkdownFile 预览点击: 解析 data-jump 失败', err && err.stack ? err.stack : String(err));
                }
            } else if (href && (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:'))) {
                e.preventDefault();
                weLog.debug('editor', 'openMarkdownFile 预览点击: 外部链接', { href });
                weAPI.openExternalLink(href);
            }
        });
    }
    weLog.info('editor', '← openMarkdownFile 完成', { filename, fromCache });
}

async function showMarkdownJumpDialog(safeId, textarea, preview) {
    weLog.info('editor', '→ showMarkdownJumpDialog 开始', { safeId });
    const project = tabs[safeId];
    if (!project) {
        weLog.warn('editor', 'showMarkdownJumpDialog: project 不存在', { safeId });
        return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.substring(start, end) || t('text') || 'text';

    const filesResult = await weAPI.listFiles(project.projectPath);
    const files = filesResult.files || [];
    weLog.info('editor', 'showMarkdownJumpDialog: 获取文件列表', { count: files.length });

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
            weLog.debug('editor', 'showMarkdownJumpDialog fileSelect.onchange: 当前文件，从 textarea 读取');
            const headings = getHeadingsFromMarkdown(textarea.value);
            headingSelect.innerHTML = '<option value="">-- ' + (t('ui.no_heading') || '(no heading)') + ' --</option>' +
                headings.map(h => `<option value="${h.anchor}">${'　'.repeat(h.level - 1)}${h.text}</option>`).join('');
            return;
        }
        // 其他文件：从磁盘读取
        weLog.info('editor', 'showMarkdownJumpDialog fileSelect.onchange: 从磁盘读取', { filename });
        const result = await weAPI.readFile(project.projectPath, filename);
        if (result.success) {
            const headings = getHeadingsFromMarkdown(result.content);
            headingSelect.innerHTML = '<option value="">-- ' + (t('ui.no_heading') || '(no heading)') + ' --</option>' +
                headings.map(h => `<option value="${h.anchor}">${'　'.repeat(h.level - 1)}${h.text}</option>`).join('');
        } else {
            weLog.error('editor', 'showMarkdownJumpDialog fileSelect.onchange: 读取失败', { filename, error: result.error });
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
            weLog.info('editor', 'showMarkdownJumpDialog confirm: 应用外部链接', { url });
            wrapMarkdownTextarea(textarea, '[', `](${url})`, linkText);
        } else {
            const filename = fileSelect.value;
            const heading = headingSelect.value;
            if (!filename) { showNotification(t('ui.select_file') || 'Please select target file'); return; }
            const anchorPart = heading ? '#' + heading : '';
            weLog.info('editor', 'showMarkdownJumpDialog confirm: 应用项目内跳转', { filename, heading });
            wrapMarkdownTextarea(textarea, '[', `](project:${encodeURIComponent(filename)}${anchorPart})`, linkText);
        }
        dialog.remove();
        if (preview) renderMarkdownPreview(textarea.value, preview);
        weLog.info('editor', '← showMarkdownJumpDialog 完成');
    };
}

async function renderMarkdownPreview(text, previewEl) {
    weLog.debug('editor', '→ renderMarkdownPreview 开始', { textLen: text ? text.length : 0 });
    if (!previewEl) {
        weLog.warn('editor', 'renderMarkdownPreview: previewEl 不存在');
        return;
    }
    previewEl.innerHTML = markdownToHtmlString(text);
    // 渲染 KaTeX 公式
    if (window.katex) {
        weLog.debug('editor', 'renderMarkdownPreview: 渲染 KaTeX 公式');
        previewEl.querySelectorAll('.katex-render').forEach(el => {
            try {
                window.katex.render(el.dataset.formula || '', el, {
                    displayMode: el.dataset.display === 'true',
                    throwOnError: false
                });
            } catch (e) {
                weLog.error('editor', 'renderMarkdownPreview: KaTeX 渲染失败', { formula: el.dataset.formula, error: e && e.stack ? e.stack : String(e) });
                el.textContent = el.dataset.formula || '';
            }
        });
    }
    weLog.debug('editor', '← renderMarkdownPreview 完成');
}

function markdownToHtmlString(text) {
    weLog.debug('editor', '→ markdownToHtmlString 开始', { textLen: text ? text.length : 0 });
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

    weLog.debug('editor', '← markdownToHtmlString 完成', { htmlLen: html.length });
    return `<p>${html}</p>`;
}

function wrapMarkdownTextarea(textarea, before, after, customText) {
    weLog.debug('editor', '→ wrapMarkdownTextarea 开始', { before, after });
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.substring(start, end);
    const replacement = selected || customText || t('text') || 'text';

    textarea.value = textarea.value.substring(0, start) + before + replacement + (after || '') + textarea.value.substring(end);
    textarea.selectionStart = start + before.length;
    textarea.selectionEnd = start + before.length + replacement.length;
    textarea.focus();
    textarea.dispatchEvent(new Event('input'));
    weLog.debug('editor', '← wrapMarkdownTextArea 完成', { replacementLen: replacement.length });
}

function insertMarkdownList(textarea, listType) {
    weLog.debug('editor', '→ insertMarkdownList 开始', { listType });
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
    weLog.debug('editor', '← insertMarkdownList 完成', { prefix });
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
    weLog.debug('editor', '← updateMarkdownStats 完成', { words, chars });
}