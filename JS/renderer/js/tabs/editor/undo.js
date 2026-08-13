// ====== editor/undo.js — GlobalUndoManager 与历史记录面板 ======
// 源文件: editor.js (行168-760)

// ==================== GlobalUndoManager (0.7.0_alpha 全局撤回系统) ====================
// 设计目标：
//  - 全局时间线：同个项目内所有编辑器动作 + 文件操作 + 文件切换 按时间串联
//  - 局部模式（默认）：交给当前编辑器内部 undo/redo（与之前行为一致）
//  - 全局模式：走本 manager 的 stack，跨文件撤回（undo 时自动切回对应文件）
//  - Debounce 合并：400ms 内同文件同类型连续打字合并为一个 step
//  - 防重入：suppress 标记在 undo/redo 期间不 push 新 step
class GlobalUndoManager {
    constructor(project, safeId) {
        this.project = project;
        this.safeId = safeId;
        this.mode = 'local';    // 'local' | 'global'
        this.stack = [];        // IUndoOp[]，按时间线递增
        this.cursor = 0;        // 下一个 undo 会操作 stack[cursor-1]；redo 会操作 stack[cursor]
        this._mergeMs = 400;    // 合并窗口
        this._mergeTimer = null;
        this._pendingOp = null; // 还在合并窗口内、等待 flush 的 op
        this.suppress = 0;      // >0 期间 onchange 回调不准 push（防 undo 触发的 onchange 又入栈）
        this._lastTs = 0;       // 递增 id 用
    }

    _uid() { this._lastTs = Math.max(this._lastTs + 1, Date.now()); return 'u_' + this._lastTs.toString(36); }

    // ============= 公共 API：设置模式 =============
    setMode(mode) {
        this.mode = mode === 'global' ? 'global' : 'local';
        this._flushPending(true);
        weLog.info('editor', `GlobalUndoManager.setMode → ${this.mode}`,
            { stackSize: this.stack.length, cursor: this.cursor });
        // 更新 UI 按钮状态（如果存在）
        this._refreshToolbarToggle();
    }

    _refreshToolbarToggle() {
        const root = document.getElementById(`tb-${this.safeId}`)
            || document.getElementById(`ng-toolbar-${this.safeId}`)
            || document.body;
        root.querySelectorAll('[data-undo-mode]').forEach(el => {
            el.dataset.undoMode = this.mode;
            el.classList.toggle('active', el.dataset.undoModeTarget === this.mode);
            if (el.dataset.undoModeTarget === 'global') {
                el.textContent = this.mode === 'global' ? '🌐 全局撤回' : '📄 局部撤回';
                el.title = this.mode === 'global'
                    ? 'Ctrl+Z 按全局时间线撤回（跨文件）'
                    : 'Ctrl+Z 只撤回当前文件的动作';
            }
        });
    }

    get canUndo() {
        if (this.mode === 'local') return false; // 局部不在这里判断
        this._flushPending(true);
        return this.cursor > 0;
    }
    get canRedo() {
        if (this.mode === 'local') return false;
        this._flushPending(true);
        return this.cursor < this.stack.length;
    }

    // ============= 公共 API：push 一条动作 =============
    // 如果 400ms 内同文件同类型，会合并（prev 保留第一条，next 更新为最新）
    push(opInput) {
        if (this.suppress > 0) return;
        const { type, file, label, prev, next, undo, redo } = opInput;
        if (!type) return;
        // 如果用户提供自定义 undo/redo 函数，就直接用
        const op = {
            id: this._uid(),
            time: Date.now(),
            type: type || 'custom',
            file: file || null,
            label: label || type,
            prev: (prev !== undefined) ? prev : null,
            next: (next !== undefined) ? next : null,
            undo: undo || null,
            redo: redo || null,
        };
        // 合并窗口
        if (this._pendingOp
            && this._pendingOp.type === op.type
            && this._pendingOp.file === op.file
            && Date.now() - this._pendingOp.time < this._mergeMs) {
            // 合并：保留 prev，更新 next 为最新
            this._pendingOp.next = op.next;
            this._pendingOp.redo = op.redo || this._pendingOp.redo;
            this._pendingOp.label = op.label || this._pendingOp.label;
        } else {
            this._flushPending(true);
            this._pendingOp = op;
        }
        // 启动 flush 定时器
        clearTimeout(this._mergeTimer);
        this._mergeTimer = setTimeout(() => this._flushPending(false), this._mergeMs + 20);
    }

    // force：立即（鼠标抬起/文件切换/非连续操作）
    flush(force = true) { this._flushPending(force); }

    _flushPending(force) {
        if (!this._pendingOp) return;
        if (!force && Date.now() - this._pendingOp.time < this._mergeMs) return;
        const op = this._pendingOp;
        this._pendingOp = null;
        clearTimeout(this._mergeTimer);
        this._mergeTimer = null;
        // 如果 cursor 不在末尾（说明用户之前 undo 过、然后又 push 新操作）→ 砍掉 redo 分支
        if (this.cursor < this.stack.length) this.stack.length = this.cursor;
        this.stack.push(op);
        if (this.stack.length > 500) { this.stack.shift(); this.cursor = Math.max(0, this.cursor - 1); }
        this.cursor = this.stack.length;
        weLog.debug('editor', 'GlobalUndoManager.push', { type: op.type, file: op.file, label: op.label, cursor: this.cursor });
        if (typeof _refreshHistoryPanelIfVisible === 'function') _refreshHistoryPanelIfVisible(this.safeId);
    }

    // ============= 公共 API：撤回 =============
    async undo() {
        this._flushPending(true);
        if (this.mode === 'local' || this.cursor <= 0) return false;
        const op = this.stack[this.cursor - 1];
        if (!op) { this.cursor = Math.min(this.cursor, this.stack.length); return false; }
        weLog.info('editor', 'GlobalUndoManager.undo →', { type: op.type, file: op.file, label: op.label });
        // 先切回对应文件
        if (op.file && op.file !== this.project.currentFile) {
            try { await openProjectFile(this.safeId, op.file); } catch (e) { /* ignore */ }
        }
        this.suppress++;
        try {
            if (typeof op.undo === 'function') { await op.undo(this.project, op); }
            else { await this._defaultUndo(op); }
        } catch (e) {
            weLog.error('editor', 'GlobalUndoManager.undo 失败', e && e.stack ? e.stack : String(e));
        } finally {
            this.suppress--;
        }
        this.cursor--;
        if (typeof _refreshHistoryPanelIfVisible === 'function') _refreshHistoryPanelIfVisible(this.safeId);
        return true;
    }

    // ============= 公共 API：重做 =============
    async redo() {
        this._flushPending(true);
        if (this.mode === 'local' || this.cursor >= this.stack.length) return false;
        const op = this.stack[this.cursor];
        if (!op) { this.cursor = Math.min(this.cursor, this.stack.length); return false; }
        weLog.info('editor', 'GlobalUndoManager.redo →', { type: op.type, file: op.file, label: op.label });
        if (op.file && op.file !== this.project.currentFile) {
            try { await openProjectFile(this.safeId, op.file); } catch (e) { /* ignore */ }
        }
        this.suppress++;
        try {
            if (typeof op.redo === 'function') { await op.redo(this.project, op); }
            else { await this._defaultRedo(op); }
        } catch (e) {
            weLog.error('editor', 'GlobalUndoManager.redo 失败', e && e.stack ? e.stack : String(e));
        } finally {
            this.suppress--;
        }
        this.cursor++;
        if (typeof _refreshHistoryPanelIfVisible === 'function') _refreshHistoryPanelIfVisible(this.safeId);
        return true;
    }

    // ============= 类型化默认 undo/redo（不需要每次 push 都传 undo/redo 函数）=============
    async _defaultUndo(op) {
        const p = this.project;
        switch (op.type) {
            case 'nodegraph': {
                const inst = embeddedNodeGraphs[this.safeId];
                if (inst && inst.engine && op.prev !== null && op.prev !== undefined) {
                    inst.engine.loadData(JSON.parse(JSON.stringify(op.prev)));
                    if (typeof inst.markDirty === 'function') inst.markDirty();
                }
                break;
            }
            case 'markdown': {
                if (markdownEditor && (p.currentFile === op.file || !op.file)) {
                    markdownEditor.value = op.prev == null ? '' : String(op.prev);
                    markdownEditor.dispatchEvent(new Event('input', { bubbles: true }));
                }
                break;
            }
            case 'quill': {
                if (quill && (p.currentFile === op.file || !op.file) && op.prev != null) {
                    try {
                        // 先清空编辑器内容，再插入 prev，避免 dangerouslyPasteHTML(0, ...) 叠加重复
                        quill.deleteText(0, quill.getLength());
                        quill.clipboard.dangerouslyPasteHTML(0, String(op.prev));
                        // 更新快照，防止后续文本变更时 prev 错位
                        p._quillLastHtml = quill.root.innerHTML;
                    } catch (e) { /* ignore */ }
                }
                break;
            }
            case 'file_switch': {
                if (op.prev && typeof openProjectFile === 'function') {
                    await openProjectFile(this.safeId, String(op.prev));
                }
                break;
            }
            case 'file_create': {
                // 撤回创建 → 删除（但要留着内容用于 redo）
                if (op.file) {
                    const content = typeof op.next === 'string' ? op.next : null;
                    // 把内容存在 fileCache 以便 redo 时恢复
                    p.fileCache = p.fileCache || {};
                    if (content != null) p.fileCache[`__deleted_${op.file}`] = _fcWrap('text', content);
                    try { await weAPI.deleteFile(p.projectPath, op.file); } catch (e) { /* ignore */ }
                    // 如果删的是当前打开的文件，跳空
                    if (p.currentFile === op.file) p.currentFile = null;
                    // 通知文件树刷新
                    if (typeof refreshFileTree === 'function') refreshFileTree(this.safeId);
                }
                break;
            }
            case 'file_delete': {
                // 撤回删除 → 重新创建
                if (op.file) {
                    const cached = p.fileCache ? _fcUnwrap('text', p.fileCache[`__deleted_${op.file}`]) : undefined;
                    const content = (op.prev != null && typeof op.prev === 'string') ? op.prev
                        : (cached != null ? cached : '');
                    try { await weAPI.saveFile(p.projectPath, op.file, content); } catch (e) { /* ignore */ }
                    if (typeof refreshFileTree === 'function') refreshFileTree(this.safeId);
                }
                break;
            }
            case 'file_rename': {
                // op.prev = 旧名, op.next = 新名；undo: new→old
                if (op.next && op.prev) {
                    try { await weAPI.renameFile(p.projectPath, op.next, op.prev); } catch (e) { /* ignore */ }
                    if (p.currentFile === op.next) p.currentFile = op.prev;
                    if (typeof refreshFileTree === 'function') refreshFileTree(this.safeId);
                }
                break;
            }
        }
    }

    async _defaultRedo(op) {
        const p = this.project;
        switch (op.type) {
            case 'nodegraph': {
                const inst = embeddedNodeGraphs[this.safeId];
                if (inst && inst.engine && op.next !== null && op.next !== undefined) {
                    inst.engine.loadData(JSON.parse(JSON.stringify(op.next)));
                    if (typeof inst.markDirty === 'function') inst.markDirty();
                }
                break;
            }
            case 'markdown': {
                if (markdownEditor && (p.currentFile === op.file || !op.file)) {
                    markdownEditor.value = op.next == null ? '' : String(op.next);
                    markdownEditor.dispatchEvent(new Event('input', { bubbles: true }));
                }
                break;
            }
            case 'quill': {
                if (quill && (p.currentFile === op.file || !op.file) && op.next != null) {
                    try {
                        quill.deleteText(0, quill.getLength());
                        quill.clipboard.dangerouslyPasteHTML(0, String(op.next));
                        p._quillLastHtml = quill.root.innerHTML;
                    } catch (e) { /* ignore */ }
                }
                break;
            }
            case 'file_switch': {
                if (op.next && typeof openProjectFile === 'function') {
                    await openProjectFile(this.safeId, String(op.next));
                }
                break;
            }
            case 'file_create': {
                if (op.file) {
                    const cached = p.fileCache ? _fcUnwrap('text', p.fileCache[`__deleted_${op.file}`]) : undefined;
                    const content = (op.next != null && typeof op.next === 'string') ? op.next
                        : (cached != null ? cached : '');
                    try { await weAPI.saveFile(p.projectPath, op.file, content); } catch (e) { /* ignore */ }
                    if (typeof refreshFileTree === 'function') refreshFileTree(this.safeId);
                }
                break;
            }
            case 'file_delete': {
                if (op.file) {
                    try { await weAPI.deleteFile(p.projectPath, op.file); } catch (e) { /* ignore */ }
                    if (p.currentFile === op.file) p.currentFile = null;
                    if (typeof refreshFileTree === 'function') refreshFileTree(this.safeId);
                }
                break;
            }
            case 'file_rename': {
                // redo: old→new
                if (op.prev && op.next) {
                    try { await weAPI.renameFile(p.projectPath, op.prev, op.next); } catch (e) { /* ignore */ }
                    if (p.currentFile === op.prev) p.currentFile = op.next;
                    if (typeof refreshFileTree === 'function') refreshFileTree(this.safeId);
                }
                break;
            }
        }
    }
}

// 快捷：获取某个 tab 对应的 globalUndo（没有就 lazy 创建）
function ensureGlobalUndo(safeId) {
    const project = tabs[safeId];
    if (!project) return null;
    if (!project.globalUndo) {
        project.globalUndo = new GlobalUndoManager(project, safeId);
    }
    return project.globalUndo;
}

// 快捷：获取"当前活跃编辑器"，用于局部模式 undo/redo
// 返回 { type:'quill'|'markdown'|'nodegraph', instance, file }
function getActiveEditor(safeId) {
    const project = tabs[safeId];
    if (!project) return null;
    const inst = embeddedNodeGraphs[safeId];
    if (inst && inst.engine && inst.containerVisible !== false) {
        // 如果有可见的节点图容器，并且 focus 了（比 markdown 更优先）
        return { type: 'nodegraph', instance: inst.engine, file: inst.graphFile || project.currentFile };
    }
    const isMd = markdownEditor && markdownEditor.offsetParent !== null;
    if (isMd) return { type: 'markdown', instance: markdownEditor, file: project.currentFile };
    if (quill) return { type: 'quill', instance: quill, file: project.currentFile };
    return null;
}

// ==================== PS 风格历史记录面板 ====================
const _HISTORY_ICONS = {
    quill:      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
    markdown:   '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 15V9l3 3 3-3v6"/></svg>',
    nodegraph:  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="12" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><line x1="8.5" y1="10.5" x2="15.5" y2="7.5"/><line x1="8.5" y1="13.5" x2="15.5" y2="16.5"/></svg>',
    file_switch:'<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3v5h5"/><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="9 14 12 11 15 14"/></svg>',
    file_create:'<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3v5h5"/><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>',
    file_delete:'<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    file_rename:'<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
    custom:     '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>',
};

let _historyPanelVisible = false;
let _historyPanelSafeId = null;

function toggleHistoryPanel(safeId) {
    if (_historyPanelVisible && _historyPanelSafeId === safeId) {
        hideHistoryPanel();
    } else {
        showHistoryPanel(safeId);
    }
}

function showHistoryPanel(safeId) {
    _historyPanelVisible = true;
    _historyPanelSafeId = safeId;
    let panel = document.getElementById('ng-history-panel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'ng-history-panel';
        panel.className = 'ng-history-panel';
        document.body.appendChild(panel);
        // 拖拽
        _makeHistoryPanelDraggable(panel);
    }
    panel.classList.remove('hidden');
    renderHistoryPanel(safeId);
    // 窗口缩放时限制面板位置，防止移出可视区域
    window.addEventListener('resize', _clampHistoryPanelPosition);
}

function hideHistoryPanel() {
    _historyPanelVisible = false;
    const panel = document.getElementById('ng-history-panel');
    if (panel) panel.classList.add('hidden');
    window.removeEventListener('resize', _clampHistoryPanelPosition);
}

// 窗口缩放时限制历史记录面板位置，不超出可视区域
function _clampHistoryPanelPosition() {
    const panel = document.getElementById('ng-history-panel');
    if (!panel || panel.classList.contains('hidden')) return;
    const rect = panel.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let changed = false;
    // 如果面板有用户拖拽设定的 left，则限制 left 范围
    if (panel.style.left) {
        const left = parseFloat(panel.style.left) || rect.left;
        const clampedLeft = Math.max(4, Math.min(left, vw - rect.width - 4));
        if (clampedLeft !== left) { panel.style.left = clampedLeft + 'px'; changed = true; }
    }
    // 限制 top 范围
    const top = parseFloat(panel.style.top) || rect.top;
    const clampedTop = Math.max(4, Math.min(top, vh - rect.height - 4));
    if (clampedTop !== top) { panel.style.top = clampedTop + 'px'; changed = true; }
    // 如果面板使用的是 CSS 默认 right/top 定位（未拖拽过），也限制 right
    if (!panel.style.left) {
        const right = parseFloat(panel.style.right) || 0;
        const clampedRight = Math.max(4, Math.min(right, vw - rect.width - 4));
        if (clampedRight !== right) { panel.style.right = clampedRight + 'px'; changed = true; }
    }
}

function _makeHistoryPanelDraggable(panel) {
    const header = panel.querySelector('.ng-history-header');
    if (!header) return;
    let dragging = false, offsetX = 0, offsetY = 0;
    header.addEventListener('mousedown', (e) => {
        // 点击模式徽章或关闭按钮时，不触发拖拽
        if (e.target.closest('.ng-history-mode-badge') || e.target.closest('.ng-history-close')) return;
        dragging = true;
        const rect = panel.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const pw = panel.offsetWidth;
        const ph = panel.offsetHeight;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const left = Math.max(0, Math.min(e.clientX - offsetX, vw - pw));
        const top = Math.max(0, Math.min(e.clientY - offsetY, vh - ph));
        panel.style.left = left + 'px';
        panel.style.top = top + 'px';
        panel.style.right = 'auto';
    });
    document.addEventListener('mouseup', () => { dragging = false; });
}

function renderHistoryPanel(safeId) {
    if (!_historyPanelVisible || _historyPanelSafeId !== safeId) return;
    const panel = document.getElementById('ng-history-panel');
    if (!panel) return;
    const gu = ensureGlobalUndo(safeId);
    if (!gu) return;
    gu.flush(true); // 先把 pending 的 op 入账

    const stack = gu.stack;
    const cursor = gu.cursor;
    const mode = gu.mode;

    // 头部 + 工具栏 + 列表
    let html = `
        <div class="ng-history-header">
            <span>📋 历史记录</span>
            <div class="ng-history-header-right">
                <span class="ng-history-mode-badge ${mode === 'global' ? 'global' : ''}" title="点击切换 全局/局部 模式">${mode === 'global' ? '🌐 全局' : '📄 局部'}</span>
                <button class="ng-history-close" title="关闭面板 (Esc)">×</button>
            </div>
        </div>
        <div class="ng-history-list">
    `;
    if (stack.length === 0) {
        html += `<div class="ng-history-empty">暂无操作记录<br>开始编辑后这里会列出所有动作</div>`;
    } else {
        for (let i = 0; i < stack.length; i++) {
            const op = stack[i];
            const isCurrent = (i === cursor - 1); // cursor 指向下一个 redo，所以 current = cursor-1
            const isFuture = (i >= cursor);
            const icon = _HISTORY_ICONS[op.type] || _HISTORY_ICONS.custom;
            const timeStr = new Date(op.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const fileShort = op.file ? op.file.split(/[\\/]/).pop() : '';
            const cls = isCurrent ? 'current' : (isFuture ? 'future' : '');
            // file_switch 类型：label 里已有文件名，不再重复显示右侧的 fileShort
            const showFileBadge = op.type !== 'file_switch' && !!fileShort;
            html += `<div class="ng-history-item ${cls}" data-step="${i}" title="${op.label}${showFileBadge ? ' · ' + fileShort : ''}">`;
            html += `<span class="ng-history-icon">${icon}</span>`;
            html += `<span class="ng-history-label">${op.label}${showFileBadge ? ` <span class="ng-history-file">${fileShort}</span>` : ''}</span>`;
            html += `<span class="ng-history-time">${timeStr}</span>`;
            html += `</div>`;
        }
    }
    html += `</div>`;
    // 底部工具栏
    html += `<div class="ng-history-toolbar">`;
    html += `<button data-hist-action="undo" title="撤回 (Ctrl+Z)" ${cursor <= 0 ? 'disabled style="opacity:0.4"' : ''}>↶ 撤回</button>`;
    html += `<button data-hist-action="redo" title="重做 (Ctrl+Y)" ${cursor >= stack.length ? 'disabled style="opacity:0.4"' : ''}>↷ 重做</button>`;
    html += `<button data-hist-action="clear" title="清空历史">🗑 清空</button>`;
    html += `<span class="ng-history-count">${cursor}/${stack.length}</span>`;
    html += `</div>`;

    panel.innerHTML = html;

    // 重新绑定拖拽（innerHTML 刷新后 header 是新元素）
    _makeHistoryPanelDraggable(panel);

    // 关闭按钮
    panel.querySelector('.ng-history-close')?.addEventListener('click', () => {
        hideHistoryPanel();
    });

    // 模式切换
    panel.querySelector('.ng-history-mode-badge')?.addEventListener('click', () => {
        gu.setMode(gu.mode === 'global' ? 'local' : 'global');
        renderHistoryPanel(safeId);
    });

    // 列表点击：跳转到指定步骤
    panel.querySelectorAll('.ng-history-item').forEach(item => {
        item.addEventListener('click', async () => {
            const targetStep = parseInt(item.dataset.step, 10);
            await jumpToHistoryStep(safeId, targetStep);
        });
    });

    // 工具栏按钮
    panel.querySelector('[data-hist-action="undo"]')?.addEventListener('click', () => {
        if (typeof handleEditAction === 'function') handleEditAction('undo');
        setTimeout(() => renderHistoryPanel(safeId), 50);
    });
    panel.querySelector('[data-hist-action="redo"]')?.addEventListener('click', () => {
        if (typeof handleEditAction === 'function') handleEditAction('redo');
        setTimeout(() => renderHistoryPanel(safeId), 50);
    });
    panel.querySelector('[data-hist-action="clear"]')?.addEventListener('click', () => {
        if (confirm('确定要清空所有历史记录吗？此操作不可撤销。')) {
            gu.stack.length = 0;
            gu.cursor = 0;
            gu._pendingOp = null;
            renderHistoryPanel(safeId);
        }
    });

    // 自动滚动到当前步骤
    const currentItem = panel.querySelector('.ng-history-item.current');
    if (currentItem) currentItem.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

// 跳转到历史栈的指定步骤（PS 风格：点哪一步就到哪一步）
async function jumpToHistoryStep(safeId, targetStep) {
    const gu = ensureGlobalUndo(safeId);
    if (!gu) return;
    gu.flush(true);
    if (gu.mode === 'local') {
        // 局部模式下不支持跳转（局部栈在各编辑器内部），提示用户切换全局模式
        showNotification('请先切换到全局撤回模式（点击右上角徽章或按 Ctrl+U）');
        return;
    }
    const cursor = gu.cursor;
    if (targetStep === cursor - 1) return; // 已经在目标步骤
    weLog.info('editor', 'jumpToHistoryStep', { from: cursor, to: targetStep + 1 });
    if (targetStep < cursor) {
        // 向回跳：连续 undo
        const steps = cursor - 1 - targetStep;
        for (let i = 0; i < steps; i++) {
            const ok = await gu.undo();
            if (!ok) break;
            renderHistoryPanel(safeId);
        }
    } else {
        // 向前跳：连续 redo
        const steps = targetStep + 1 - cursor;
        for (let i = 0; i < steps; i++) {
            const ok = await gu.redo();
            if (!ok) break;
            renderHistoryPanel(safeId);
        }
    }
    renderHistoryPanel(safeId);
}

// 给 GlobalUndoManager 在 push/undo/redo 后调用，自动刷新面板
function _refreshHistoryPanelIfVisible(safeId) {
    if (_historyPanelVisible && _historyPanelSafeId === safeId) {
        // 延迟一点点，等 DOM 稳定
        requestAnimationFrame(() => renderHistoryPanel(safeId));
    }
}

// 在新文件打开成功后 push 一个 file_switch 撤回操作（用于全局时间线切换文件）
// 仅在 oldFile !== newFile 时产生，并且立即 flush（文件切换是离散动作，不需要 debounce）
function _commitFileSwitchOp(safeId, oldFile, newFile) {
    if (!oldFile || oldFile === newFile) return;
    const gu = ensureGlobalUndo(safeId);
    if (!gu) return;
    const shortName = newFile.split(/[\\/]/).pop();
    gu.push({
        type: 'file_switch',
        file: newFile,
        label: `切换到 ${shortName}`,
        prev: oldFile,
        next: newFile,
    });
    gu.flush(true); // 文件切换立即入账
}