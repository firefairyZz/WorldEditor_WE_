// ====== editor/toolbar.js — 编辑器工具栏 ======
// 源文件: editor.js (行1136-1194)

function editorToolbar() {
    weLog.debug('editor', '→ editorToolbar 开始');
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
            <button class="custom-btn btn-insert-card" title="${t('ui.insert_card') || '插入卡片'}">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/></svg>
            </button>
        </span>
        <span class="editor-actions">
            <button class="custom-btn btn-history" title="${t('ui.ng_history') || '历史记录 (Ctrl+H)'}">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/></svg>
            </button>
            <button class="custom-btn btn-export-md" title="${t('ui.export') || 'Export'}">
                <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 7V3.5L18.5 9H13zM6 15h2l2-3 2 3h2v-5H6v5z"/></svg>
            </button>
            <button class="custom-btn btn-toggle-toc" title="${t('ui.toggle_toc') || 'Toggle TOC'}">
                <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M3 9h14V7H3v2zm0 4h14v-2H3v2zm0 4h14v-2H3v2zm16-4h2v-2h-2v2zm0 4h2v-2h-2v2zm0-8h2V7h-2v2z"/></svg>
            </button>
        </span>
    `;
    weLog.debug('editor', '← editorToolbar 完成');
    return toolbar;
}