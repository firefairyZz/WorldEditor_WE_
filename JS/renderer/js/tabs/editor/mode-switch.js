// ====== editor/mode-switch.js — 切换编辑器模式（单向转化） ======
// 源文件: editor.js (行3121-3415)

// ========== 切换编辑器模式（单向转化） ==========

async function switchEditorMode() {
    weLog.info('editor', '→ switchEditorMode 开始');
    // 找到当前打开的项目标签
    const project = tabs[activeTabId];
    if (!project || !project.projectPath) {
        weLog.warn('editor', 'switchEditorMode: project 或 projectPath 不存在');
        showNotification(t('ui.need_open_project') || '请先打开一个项目');
        return;
    }

    const currentMode = project.projectMode || 'rich';
    const targetMode = currentMode === 'rich' ? 'markdown' : 'rich';
    weLog.info('editor', 'switchEditorMode: 模式切换计划', { currentMode, targetMode });
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
        weLog.info('editor', 'switchEditorMode: 用户确认切换', { fromMode: currentMode, toMode: targetMode });
        closeDialog();
        await performModeSwitch(project.projectPath, currentMode, targetMode);
    };
}

async function performModeSwitch(projectPath, fromMode, toMode) {
    weLog.info('editor', '→ performModeSwitch 开始', { projectPath, fromMode, toMode });
    showNotification(t('ui.mode_switch_converting') || '正在转换...');

    // 获取所有文件列表
    const listResult = await weAPI.listFiles(projectPath);
    if (!listResult.success) {
        weLog.error('editor', 'performModeSwitch: 读取文件列表失败', { error: listResult.error });
        showNotification(t('ui.mode_switch_failed') || '转换失败：无法读取文件列表');
        return;
    }
    const files = listResult.files || [];
    weLog.info('editor', 'performModeSwitch: 待转换文件数', { count: files.length });

    // 转换每个文件
    let convertedCount = 0;
    for (const filename of files) {
        if (filename.startsWith('_')) continue; // 跳过元数据和图片文件
        const readResult = await weAPI.readFile(projectPath, filename);
        if (!readResult.success) {
            weLog.warn('editor', 'performModeSwitch: 跳过读取失败的文件', { filename, error: readResult.error });
            continue;
        }

        const originalContent = readResult.content;
        let newContent;

        if (fromMode === 'rich' && toMode === 'markdown') {
            weLog.debug('editor', 'performModeSwitch: HTML→Markdown', { filename });
            newContent = convertHtmlToMarkdown(originalContent);
        } else if (fromMode === 'markdown' && toMode === 'rich') {
            weLog.debug('editor', 'performModeSwitch: Markdown→HTML', { filename });
            newContent = convertMarkdownToHtml(originalContent);
        } else {
            continue;
        }

        await weAPI.saveFile(projectPath, filename, newContent);
        convertedCount++;
    }
    weLog.info('editor', 'performModeSwitch: 文件转换完成', { convertedCount });

    // 更新项目元数据
    const modeResult = await weAPI.setProjectMode(projectPath, toMode);
    if (!modeResult.success) {
        weLog.error('editor', 'performModeSwitch: 元数据更新失败', { error: modeResult.error });
        showNotification(t('ui.mode_switch_meta_failed') || '元数据更新失败');
        return;
    }

    // 关闭当前项目标签并重新打开
    const projectName = tabs[activeTabId]?.title || projectPath.split(/[\\/]/).pop();
    if (activeTabId && tabs[activeTabId]) {
        weLog.info('editor', 'performModeSwitch: 关闭旧项目标签', { activeTabId, projectName });
        closeTab(activeTabId, true);
    }

    // 重新打开项目
    setTimeout(async () => {
        weLog.info('editor', 'performModeSwitch: 重新打开项目', { projectPath });
        const result = await weAPI.openProject(projectPath);
        if (result.success) {
            openProjectDirectly(result);
            showNotification(t('ui.mode_switch_done') || '编辑器模式已切换');
            weLog.info('editor', '← performModeSwitch 完成: 模式切换成功');
        } else {
            weLog.error('editor', 'performModeSwitch: 重新打开项目失败', { error: result.error });
        }
    }, 200);
}

// 富文本 HTML → Markdown 纯文本
function convertHtmlToMarkdown(html) {
    weLog.debug('editor', '→ convertHtmlToMarkdown 开始', { htmlLen: html ? html.length : 0 });
    if (!html || !html.trim()) return '';
    const temp = document.createElement('div');
    temp.innerHTML = html;
    const result = domToMarkdown(temp).replace(/\n{3,}/g, '\n\n').trim();
    weLog.debug('editor', '← convertHtmlToMarkdown 完成', { mdLen: result.length });
    return result;
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
    weLog.debug('editor', '→ convertMarkdownToHtml 开始', { mdLen: md ? md.length : 0 });
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

    weLog.debug('editor', '← convertMarkdownToHtml 完成', { blockCount: blocks.length });
    return blocks.join('');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}