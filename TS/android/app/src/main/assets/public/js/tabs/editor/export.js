// ====== editor/export.js — 导出与统计功能 ======
// 源文件: editor.js (行1195-1381 + 行2274-2583)

function handleExportMarkdown() {
    weLog.info('editor', '→ handleExportMarkdown 开始');
    const project = tabs[activeTabId];
    let markdown;
    if (project && project.projectMode === 'markdown') {
        weLog.info('editor', 'handleExportMarkdown: 走了 Markdown 模式分支');
        const textarea = document.querySelector('#md-textarea');
        markdown = textarea ? textarea.value : '';
    } else {
        weLog.info('editor', 'handleExportMarkdown: 走了富文本模式分支');
        if (!quill) {
            weLog.warn('editor', 'handleExportMarkdown: quill 不存在');
            return;
        }
        const delta = quill.getContents();
        markdown = deltaToMarkdown(delta);
    }
    downloadText(markdown, getCurrentFileName() + '.md', 'text/markdown');
    weLog.info('editor', '← handleExportMarkdown 完成', { length: markdown.length });
}

// 构建导出用的完整 HTML 文档（PDF / HTML 共用）
function buildExportDocument() {
    weLog.debug('editor', '→ buildExportDocument 开始');
    const project = tabs[activeTabId];
    let bodyHtml = '';
    if (project && project.projectMode === 'markdown') {
        weLog.debug('editor', 'buildExportDocument: 走了 Markdown 模式分支');
        const textarea = document.querySelector('#md-textarea');
        bodyHtml = textarea ? markdownToHtmlString(textarea.value) : '';
    } else if (quill) {
        weLog.debug('editor', 'buildExportDocument: 走了富文本模式分支');
        bodyHtml = quill.root.innerHTML;
    }
    const title = escapeHtml(getCurrentFileName());
    weLog.debug('editor', '← buildExportDocument 完成', { bodyLen: bodyHtml.length });
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
    weLog.info('editor', '→ showExportMenu 开始');
    if (!anchorEl) {
        weLog.warn('editor', 'showExportMenu: anchorEl 不存在');
        return;
    }
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
    weLog.info('editor', '← showExportMenu 完成');
}

function handleExport(fmt) {
    weLog.info('editor', '→ handleExport 开始', { fmt });
    if (fmt === 'md') return handleExportMarkdown();
    if (fmt === 'html') return handleExportHtml();
    if (fmt === 'pdf') return handleExportPdf();
    if (fmt === 'zip') return handleExportZip();
}

function handleExportHtml() {
    weLog.info('editor', '→ handleExportHtml 开始');
    const html = buildExportDocument();
    downloadText(html, getCurrentFileName() + '.html', 'text/html');
    weLog.info('editor', '← handleExportHtml 完成', { length: html.length });
}

async function handleExportPdf() {
    weLog.info('editor', '→ handleExportPdf 开始');
    const project = tabs[activeTabId];
    if (!project) {
        weLog.warn('editor', 'handleExportPdf: project 不存在');
        showNotification(t('ui.need_open_project') || '请先打开一个项目');
        return;
    }
    const html = buildExportDocument();
    showNotification(t('ui.exporting_pdf') || '正在导出 PDF...');
    try {
        const result = await weAPI.exportPdf(html, getCurrentFileName());
        if (result.success) {
            weLog.info('editor', '← handleExportPdf 完成: 导出成功');
            showNotification(t('ui.export_success') || '导出成功');
        } else if (!result.canceled) {
            weLog.error('editor', 'handleExportPdf: 导出失败', { error: result.error });
            showNotification((t('ui.export_failed') || '导出失败') + ': ' + (result.error || ''));
        } else {
            weLog.info('editor', 'handleExportPdf: 用户取消导出');
        }
    } catch (e) {
        weLog.error('editor', 'handleExportPdf 失败', e && e.stack ? e.stack : String(e));
        showNotification((t('ui.export_failed') || '导出失败') + ': ' + e.message);
    }
}

async function handleExportZip() {
    weLog.info('editor', '→ handleExportZip 开始');
    const project = tabs[activeTabId];
    if (!project || !project.projectPath) {
        weLog.warn('editor', 'handleExportZip: project 或 projectPath 不存在');
        showNotification(t('ui.need_open_project') || '请先打开一个项目');
        return;
    }
    const name = project.title || getCurrentFileName() || 'project';
    try {
        const result = await weAPI.exportZip(project.projectPath, name);
        if (result.success) {
            weLog.info('editor', '← handleExportZip 完成: 导出成功');
            showNotification(t('ui.export_success') || '导出成功');
        } else if (!result.canceled) {
            weLog.error('editor', 'handleExportZip: 导出失败', { error: result.error });
            showNotification((t('ui.export_failed') || '导出失败') + ': ' + (result.error || ''));
        } else {
            weLog.info('editor', 'handleExportZip: 用户取消导出');
        }
    } catch (e) {
        weLog.error('editor', 'handleExportZip 失败', e && e.stack ? e.stack : String(e));
        showNotification((t('ui.export_failed') || '导出失败') + ': ' + e.message);
    }
}

function toggleTableOfContents() {
    weLog.info('editor', '→ toggleTableOfContents 开始');
    if (tocPanel && tocPanel.isConnected) {
        weLog.info('editor', 'toggleTableOfContents: 关闭已有 TOC 面板');
        tocPanel.remove();
        tocPanel = null;
        return;
    }
    generateTableOfContents();
}

function generateTableOfContents() {
    weLog.info('editor', '→ generateTableOfContents 开始');
    if (!quill) {
        weLog.warn('editor', 'generateTableOfContents: quill 不存在');
        return;
    }

    if (!tocPanel) {
        weLog.debug('editor', 'generateTableOfContents: 创建新的 TOC 面板');
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
        weLog.debug('editor', 'generateTableOfContents: 用户关闭 TOC 面板');
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
        weLog.info('editor', 'generateTableOfContents: 没有标题，显示空提示');
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
            weLog.debug('editor', 'generateTableOfContents: 点击 TOC 项跳转', { level: h.level, index: h.index });
            quill.setSelection(h.index, 0);
            const range = quill.getBounds(h.index);
            quill.root.scrollTo({ top: range.top - 50, behavior: 'smooth' });
        };
        tocList.appendChild(li);
    });
    tocPanel.appendChild(tocList);
    weLog.info('editor', '← generateTableOfContents 完成', { count: headings.length });
}

function updateEditorStats() {
    if (!quill) {
        weLog.warn('editor', 'updateEditorStats: quill 不存在');
        return;
    }
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
    weLog.debug('editor', '← updateEditorStats 完成', { words: editorStats.words, chars: editorStats.chars });
}

// 暴露到 window 以供其他模块包装
window.updateEditorStats = updateEditorStats;

function getCurrentFileName() {
    weLog.debug('editor', '→ getCurrentFileName 开始');
    const project = tabs[activeTabId];
    const f = project?.currentFile || 'document';
    const name = stripExt(f.split('/').pop());
    weLog.debug('editor', '← getCurrentFileName 完成', { name });
    return name;
}

function downloadText(text, filename, mimeType) {
    weLog.info('editor', '→ downloadText 开始', { filename, mimeType, length: text.length });
    const blob = new Blob([text], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    weLog.info('editor', '← downloadText 完成', { filename });
}

function deltaToMarkdown(delta) {
    weLog.debug('editor', '→ deltaToMarkdown 开始', { opsCount: delta && delta.ops ? delta.ops.length : 0 });
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
        } else if (op.insert && op.insert.fileLinkCard) {
            closeCodeBlock();
            resetListCounter();
            flushText();
            const card = op.insert.fileLinkCard;
            md += `[${card.text || card.file}](${card.project ? 'project:' + card.project + '/' : ''}${card.file})\n`;
        } else if (op.insert && op.insert.nodeGraphCard) {
            closeCodeBlock();
            resetListCounter();
            flushText();
            const card = op.insert.nodeGraphCard;
            md += `[节点图: ${card.text || card.file}](${card.project ? 'project:' + card.project + '/' : ''}${card.file})\n`;
        }
    });

    closeCodeBlock();
    flushText();
    weLog.debug('editor', '← deltaToMarkdown 完成', { mdLen: md.length });
    return md.trim();
}