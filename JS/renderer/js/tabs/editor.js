let tocPanel = null;
let wordCountTimer = null;
let editorStats = { words: 0, chars: 0, headings: 0 };

async function openProjectFile(safeId, filename) {
    const project = tabs[safeId];
    if (!project) return;
    const result = await weAPI.readFile(project.projectPath, filename);
    if (!result.success) { alert(t('ui.read_failed') + ': ' + result.error); return; }

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

        const exportBtn = toolbarEl.querySelector('.btn-export-md');
        if (exportBtn) exportBtn.onclick = handleExportMarkdown;
        const tocBtn = toolbarEl.querySelector('.btn-toggle-toc');
        if (tocBtn) tocBtn.onclick = toggleTableOfContents;

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

    quill.root.innerHTML = result.content;
    if (savedFontFamily) quill.root.style.fontFamily = savedFontFamily;
    if (savedFontSize) quill.root.style.fontSize = savedFontSize + 'px';

    // 应用工具栏显示与字数统计设置
    const tb = document.getElementById('quill-toolbar');
    if (tb && typeof toolbarShow !== 'undefined') tb.style.display = toolbarShow === false ? 'none' : '';
    const wc = document.getElementById('word-count');
    if (wc && typeof wordCountShow !== 'undefined') wc.style.display = wordCountShow === false ? 'none' : '';

    project.currentFile = filename;
    project.dirty = false;
    project.savedContent = result.content;
    updateStatusBar();
    updateEditorStats();

    quill.off('text-change', project._changeHandler);
    project._changeHandler = () => { project.dirty = true; updateStatusBar(); updateEditorStats(); };
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
                <option value="1">${t('ui.heading1') || 'Heading 1'}</option>
                <option value="2">${t('ui.heading2') || 'Heading 2'}</option>
                <option value="3">${t('ui.heading3') || 'Heading 3'}</option>
                <option value="false">${t('ui.normal') || 'Normal'}</option>
            </select>
        </span>
        <span class="ql-formats">
            <button class="ql-bold" title="${t('ui.bold') || 'Bold'}"></button>
            <button class="ql-italic" title="${t('ui.italic') || 'Italic'}"></button>
            <button class="ql-underline" title="${t('ui.underline') || 'Underline'}"></button>
            <button class="ql-strike" title="${t('ui.strike') || 'Strikethrough'}"></button>
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
        <span class="ql-formats last-format">
            <button class="ql-link" title="${t('ui.link') || 'Link'}"></button>
            <button class="ql-image" title="${t('ui.image') || 'Image'}"></button>
        </span>
        <span class="editor-actions">
            <button class="custom-btn btn-export-md" title="${t('ui.export_markdown') || 'Export as Markdown'}">
                <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 7V3.5L18.5 9H13zM6 15h2l2-3 2 3h2v-5H6v5z"/></svg>
            </button>
            <button class="custom-btn btn-toggle-toc" title="${t('ui.toggle_toc') || 'Toggle TOC'}">
                <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M3 9h14V7H3v2zm0 4h14v-2H3v2zm0 4h14v-2H3v2zm16-4h2v-2h-2v2zm0 4h2v-2h-2v2zm0-8h2V7h-2v2z"/></svg>
            </button>
        </span>
        <span class="editor-stats">
            <span class="stat-item" title="${t('ui.word_count') || 'Word Count'}">
                <span class="stat-label">${t('ui.words') || 'Words'}:</span>
                <span class="stat-value" id="stat-words">0</span>
            </span>
            <span class="stat-item" title="${t('ui.char_count') || 'Character Count'}">
                <span class="stat-label">${t('ui.chars') || 'Chars'}:</span>
                <span class="stat-value" id="stat-chars">0</span>
            </span>
        </span>
    `;
    return toolbar;
}

function handleExportMarkdown() {
    if (!quill) return;
    const delta = quill.getContents();
    const markdown = deltaToMarkdown(delta);
    downloadText(markdown, getCurrentFileName() + '.md', 'text/markdown');
}

function toggleTableOfContents() {
    if (tocPanel && tocPanel.isConnected) {
        tocPanel.remove();
        tocPanel = null;
        return;
    }
    generateTableOfContents();
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
        if (op.insert && typeof op.insert === 'string') {
            textBuffer += op.insert;
            docIndex += op.insert.length;
        } else if (op.insert === '\n') {
            if (op.attributes && op.attributes.header) {
                const level = op.attributes.header;
                headings.push({
                    level: level,
                    text: textBuffer.trim(),
                    index: docIndex - textBuffer.length
                });
            }
            docIndex += 1;
            textBuffer = '';
        }
    });

    if (headings.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'toc-empty';
        emptyMsg.textContent = t('ui.no_headings') || 'No headings found. Use the Heading format to create sections.';
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
    editorStats.chars = text.length;
    editorStats.words = text.trim() ? text.trim().split(/\s+/).length : 0;

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
    return project?.currentFile || 'document';
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

    delta.ops.forEach(op => {
        if (op.insert && typeof op.insert === 'string') {
            if (op.attributes) {
                let text = op.insert;
                if (op.attributes.link) {
                    text = `[${text}](${op.attributes.link})`;
                }
                if (op.attributes.bold) text = `**${text}**`;
                if (op.attributes.italic) text = `*${text}*`;
                if (op.attributes.strike) text = `~~${text}~~`;
                if (op.attributes.code) text = '`' + text + '`';
                textBuffer += text;
            } else {
                textBuffer += op.insert;
            }
        } else if (op.insert === '\n') {
            if (op.attributes) {
                if (op.attributes.header) {
                    closeCodeBlock();
                    md += '\n' + '#'.repeat(op.attributes.header) + ' ' + textBuffer + '\n';
                    textBuffer = '';
                } else if (op.attributes.list === 'ordered') {
                    closeCodeBlock();
                    flushText();
                    md += '\n1. ';
                } else if (op.attributes.list === 'bullet') {
                    closeCodeBlock();
                    flushText();
                    md += '\n- ';
                } else if (op.attributes.list === 'check') {
                    closeCodeBlock();
                    flushText();
                    md += op.attributes.checked ? '\n- [x] ' : '\n- [ ] ';
                } else if (op.attributes.blockquote) {
                    closeCodeBlock();
                    flushText();
                    md += '\n> ';
                } else if (op.attributes['code-block']) {
                    if (!inCodeBlock) {
                        flushText();
                        md += '\n```\n';
                        inCodeBlock = true;
                    }
                    md += textBuffer + '\n';
                    textBuffer = '';
                } else {
                    closeCodeBlock();
                    flushText();
                    md += '\n';
                }
            } else {
                closeCodeBlock();
                flushText();
                md += '\n';
            }
        } else if (op.insert && op.insert.image) {
            closeCodeBlock();
            flushText();
            md += `![image](${op.insert.image})\n`;
        }
    });

    closeCodeBlock();
    flushText();
    return md.trim();
}

async function saveCurrentFile(silent) {
    const project = tabs[activeTabId];
    if (!project || !project.currentFile || !quill) return;
    const content = quill.root.innerHTML;
    const res = await weAPI.saveFile(project.projectPath, project.currentFile, content);
    if (res.success) {
        project.dirty = false;
        project.savedContent = content;
        updateStatusBar();
        if (!silent) showNotification(t('ui.saved') || '已保存');
    } else if (!silent) {
        showNotification(t('ui.save_failed') + ': ' + res.error);
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
            alert((t('ui.create_failed') || '创建失败') + ': ' + res.error);
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
            alert((t('ui.add_failed') || '添加失败') + ': ' + res.error);
        }
    }
}
