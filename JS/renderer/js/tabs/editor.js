var tocPanel = null;
let wordCountTimer = null;
let editorStats = { words: 0, chars: 0, headings: 0 };
let markdownEditor = null;
let markdownPreviewVisible = true;
// 嵌入项目编辑区的节点图实例：safeId -> { engine, graphFile, dirty }
var embeddedNodeGraphs = (typeof embeddedNodeGraphs !== 'undefined') ? embeddedNodeGraphs : {};

// updateEditorStats 的防抖版本：减少打字过程中的布局抖动
let _debouncedStatsTimer = null;
function debouncedUpdateEditorStats() {
    if (_debouncedStatsTimer) clearTimeout(_debouncedStatsTimer);
    _debouncedStatsTimer = setTimeout(() => {
        weLog.debug('editor', 'debouncedUpdateEditorStats: 触发延迟统计更新');
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
        weLog.debug('editor', 'ProjectLinkBlot.create 开始', { valueType: typeof value });
        // 字符串：普通 URL，交给父类
        if (typeof value === 'string') {
            weLog.debug('editor', 'ProjectLinkBlot.create: 走了字符串URL分支');
            return super.create(value);
        }
        // 对象：项目内跳转
        if (value && value.project) {
            weLog.debug('editor', 'ProjectLinkBlot.create: 走了项目内跳转分支', { project: value.project, file: value.file });
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
            weLog.debug('editor', 'ProjectLinkBlot.create: 走了外部URL对象分支', { url: value.url });
            const node = super.create(value.url);
            if (value.text) node.textContent = value.text;
            return node;
        }
        weLog.debug('editor', 'ProjectLinkBlot.create: 走了默认分支');
        return super.create(value || '');
    }

    // Quill 解析 HTML → Delta 时调用，返回假值会导致格式丢失
    static formats(node) {
        const jumpData = node.getAttribute('data-jump');
        if (jumpData) {
            try {
                const parsed = JSON.parse(jumpData);
                return { project: parsed.project, file: parsed.file, heading: parsed.heading };
            } catch(e) {
                weLog.error('editor', 'ProjectLinkBlot.formats 解析 data-jump 失败', e && e.stack ? e.stack : String(e));
            }
        }
        return node.getAttribute('href') || '';
    }

    static value(node) {
        const jumpData = node.getAttribute('data-jump');
        if (jumpData) {
            try {
                const parsed = JSON.parse(jumpData);
                return { ...parsed, text: node.textContent };
            } catch(e) {
                weLog.error('editor', 'ProjectLinkBlot.value 解析 data-jump 失败', e && e.stack ? e.stack : String(e));
            }
        }
        return node.getAttribute('href') || '';
    }
}

Quill.register(ProjectLinkBlot, true);
// 同时注册为 link 格式的替代，让 Quill 工具栏的链接按钮也走这个 Blot
Quill.register('formats/link', ProjectLinkBlot, true);

function positionDialog(dialog) {
    weLog.debug('editor', '→ positionDialog 开始');
    const titleBar = document.getElementById('title-bar');
    let topOffset = 0;
    if (titleBar) topOffset += titleBar.offsetHeight;
    dialog.style.top = topOffset + 'px';
    weLog.debug('editor', '← positionDialog 完成', { topOffset });
}

// 从富文本编辑器 DOM 读取标题列表
function getHeadingsFromEditor() {
    weLog.debug('editor', '→ getHeadingsFromEditor 开始');
    if (!quill) {
        weLog.warn('editor', 'getHeadingsFromEditor: quill 不存在');
        return [];
    }
    const els = quill.root.querySelectorAll('h1, h2, h3');
    const result = Array.from(els).map(el => {
        const text = el.textContent.trim();
        return {
            level: parseInt(el.tagName.substring(1)),
            text: text,
            anchor: text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fa5-]/g, '')
        };
    }).filter(h => h.text);
    weLog.debug('editor', '← getHeadingsFromEditor 完成', { count: result.length });
    return result;
}

// 从 Markdown 文本读取标题列表
function getHeadingsFromMarkdown(text) {
    weLog.debug('editor', '→ getHeadingsFromMarkdown 开始');
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
    weLog.debug('editor', '← getHeadingsFromMarkdown 完成', { count: headings.length });
    return headings;
}

// ========== fileCache 类型包裹工具 ==========
// 【切回内容消失终极修复】不同文件类型（Quill / Markdown / 节点图 JSON）共用一个 fileCache 会互串 key，
// 导致节点图 JSON 被写成 Quill HTML（"<p>...</p>"），再解析时 JSON.parse 直接失败渲染空画布。
// 统一用 { __type, __content } 包裹，读取时校验类型，类型不匹配就当作没缓存。
// 兼容旧缓存（纯字符串）：unwrap 时如果 value 是字符串就按 wantType 判断是否放行（用开头特征判断）。
function _fcWrap(type, content) {
    return { __type: type, __content: content };
}
function _fcUnwrap(wantType, value) {
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'object' && value.__type) {
        return value.__type === wantType ? value.__content : undefined;
    }
    // 兼容旧缓存（纯字符串）：用开头特征判断是不是 wantType 期望的内容，判断失败返回 undefined
    if (typeof value === 'string') {
        if (wantType === 'ngjson') {
            const s = value.trimStart();
            return (s[0] === '{' || s[0] === '[') ? value : undefined;
        }
        if (wantType === 'md') return value;    // md 纯文本，不强制判断（md 可以任何文本）
        if (wantType === 'quill') return value; // quill HTML，不强制判断
        if (wantType === 'text') return value;
        return value;
    }
    return undefined;
}

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
                    // Quill 最稳妥：用 setContents(delta)；这里存的是 HTML 快照 → setContents(Quill.import('delta').importFromHTML)
                    try {
                        const Delta = window.Quill && window.Quill.imports && window.Quill.imports.delta;
                        // 兜底：如果拿不到 Delta，就先 setHTML，虽然会丢失一步精细历史，但内容对
                        if (typeof quill.clipboard === 'object' && quill.clipboard.dangerouslyPasteHTML) {
                            quill.clipboard.dangerouslyPasteHTML(0, String(op.prev));
                        } else if (Delta) {
                            const d = new Delta().insert('');
                            // TODO: 升级时换成 HTML → Delta 的标准转换
                            quill.setContents(d);
                        }
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
                        if (typeof quill.clipboard === 'object' && quill.clipboard.dangerouslyPasteHTML) {
                            quill.clipboard.dangerouslyPasteHTML(0, String(op.next));
                        }
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
}

function hideHistoryPanel() {
    _historyPanelVisible = false;
    const panel = document.getElementById('ng-history-panel');
    if (panel) panel.classList.add('hidden');
}

function _makeHistoryPanelDraggable(panel) {
    const header = panel.querySelector('.ng-history-header');
    if (!header) return;
    let dragging = false, offsetX = 0, offsetY = 0;
    header.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('ng-history-mode-badge')) return;
        dragging = true;
        const rect = panel.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        panel.style.left = (e.clientX - offsetX) + 'px';
        panel.style.top = (e.clientY - offsetY) + 'px';
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
            <span class="ng-history-mode-badge ${mode === 'global' ? 'global' : ''}" title="点击切换 全局/局部 模式">${mode === 'global' ? '🌐 全局' : '📄 局部'}</span>
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
            html += `<div class="ng-history-item ${cls}" data-step="${i}" title="${op.label} · ${fileShort}">`;
            html += `<span class="ng-history-icon">${icon}</span>`;
            html += `${op.label}`;
            if (fileShort) html += ` <span style="opacity:0.6;font-size:10px">${fileShort}</span>`;
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
        gu.stack.length = 0;
        gu.cursor = 0;
        gu._pendingOp = null;
        renderHistoryPanel(safeId);
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
    gu.push({
        type: 'file_switch',
        file: newFile,
        label: `切换到 ${newFile}`,
        prev: oldFile,
        next: newFile,
    });
    gu.flush(true); // 文件切换立即入账
}

async function openProjectFile(safeId, filename) {
    weLog.info('editor', '→ openProjectFile 开始', { safeId, filename });
    const project = tabs[safeId];
    if (!project) {
        weLog.warn('editor', 'openProjectFile: project 不存在', { safeId });
        return;
    }
    // 【全局撤回：文件切换 step】记录 oldFile，等两个分支（嵌入 or 富文本/md）成功后各调用 commit
    const oldFile = project.currentFile || null;

    // === 节点图文件：在右侧嵌入节点图编辑区 ===
    if (filename.endsWith('.node.json')) {
        weLog.info('editor', 'openProjectFile: 检测到节点图文件，走嵌入分支', { filename });
        await openEmbeddedNodeGraph(safeId, filename);
        _commitFileSwitchOp(safeId, oldFile, filename);
        return;
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
        await openMarkdownFile(safeId, filename);
        _commitFileSwitchOp(safeId, oldFile, filename);
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
            project.fileCache[project.currentFile] = _fcWrap('quill', quill.root.innerHTML);
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
        weLog.info('editor', 'openProjectFile: Quill 初始化完成');
    } else {
        weLog.debug('editor', 'openProjectFile: 复用已有 Quill 实例');
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
    }

    quill.root.innerHTML = '';
    // 检测内容类型：HTML 还是纯文本
    const isHtml = /<[a-z][\s\S]*>/i.test(content);
    if (isHtml) {
        weLog.info('editor', 'openProjectFile: 内容为 HTML，使用 dangerouslyPasteHTML', { contentLen: content.length });
        // HTML 内容：通过 Quill clipboard 解析为正确的 Delta blocks
        quill.clipboard.dangerouslyPasteHTML(0, content, Quill.sources.SILENT);
    } else {
        weLog.info('editor', 'openProjectFile: 内容为纯文本，使用 setText', { contentLen: content.length });
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

    // ====== GlobalUndoManager 接入：Quill ======
    // 维护上一次 HTML 快照；只在 user 变更时 push；suppress>0 时跳过
    ensureGlobalUndo(safeId);  // lazy init
    if (project._quillLastHtml === undefined) project._quillLastHtml = null;
    // 用 AFTER text-change 的时候取最新 HTML
    quill.off('text-change', project._changeHandler);
    quill.off('text-change', project._globalQuillHandler);
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
    weLog.info('editor', '← openProjectFile 完成', { filename, fromCache });
}

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
    weLog.debug('editor', '← editorToolbar 完成');
    return toolbar;
}

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

async function showJumpLinkDialog(safeId) {
    weLog.info('editor', '→ showJumpLinkDialog 开始', { safeId });
    const project = tabs[safeId];
    if (!project) {
        weLog.warn('editor', 'showJumpLinkDialog: project 不存在', { safeId });
        return;
    }

    const selection = quill.getSelection();
    if (!selection || selection.length === 0) {
        weLog.warn('editor', 'showJumpLinkDialog: 没有选中文本');
        showNotification(t('ui.select_text_for_link') || '请先选择要设置跳转链接的文字');
        return;
    }

    const filesResult = await weAPI.listFiles(project.projectPath);
    const files = filesResult.files || [];
    weLog.info('editor', 'showJumpLinkDialog: 获取文件列表', { count: files.length });

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
            weLog.warn('editor', 'showJumpLinkDialog confirm: 没有选中文本');
            showNotification(t('ui.select_text_for_link') || '请先选择文字');
            return;
        }

        if (currentType === 'url') {
            const url = dialog.querySelector('#external-url').value.trim();
            if (!url) { showNotification(t('ui.enter_url') || '请输入链接地址'); return; }
            weLog.info('editor', 'showJumpLinkDialog confirm: 应用外部链接', { url });
            // formatText：直接在选中文字上应用 link 格式，不删除任何文字
            quill.formatText(sel.index, sel.length, 'link', url, Quill.sources.USER);
        } else {
            const filename = fileSelect.value;
            if (!filename) { showNotification(t('ui.select_file') || '请选择目标文件'); return; }
            const heading = headingSelect.value;
            weLog.info('editor', 'showJumpLinkDialog confirm: 应用项目内跳转', { filename, heading });
            // formatText：直接在选中文字上应用 projectLink 格式
            quill.formatText(sel.index, sel.length, 'projectLink', {
                project: project.title || safeId,
                file: filename,
                heading: heading
            }, Quill.sources.USER);
        }
        dialog.remove();
        weLog.info('editor', '← showJumpLinkDialog 完成');
    };
}

// 为文件选择加载标题列表
async function loadHeadingsForFile(dialog, project, filename, safeId) {
    weLog.info('editor', '→ loadHeadingsForFile 开始', { filename });
    const headingSelect = dialog.querySelector('#target-heading');
    headingSelect.innerHTML = '<option value="">-- ' + (t('ui.loading') || '加载中...') + ' --</option>';
    if (!filename) {
        weLog.debug('editor', 'loadHeadingsForFile: filename 为空，重置标题列表');
        headingSelect.innerHTML = '<option value="">-- ' + (t('ui.no_heading') || '（无标题）') + ' --</option>';
        return;
    }

    // 如果选的是当前已打开的文件，直接从编辑器 DOM 读取（实时、准确）
    if (filename === project.currentFile && quill) {
        weLog.info('editor', 'loadHeadingsForFile: 从当前编辑器 DOM 读取标题');
        const headings = getHeadingsFromEditor();
        headingSelect.innerHTML = '<option value="">-- ' + (t('ui.no_heading') || '（无标题）') + ' --</option>' +
            headings.map(h => `<option value="${h.anchor}">${'　'.repeat(h.level - 1)}${h.text}</option>`).join('');
        return;
    }

    // 否则从磁盘读取文件内容
    weLog.info('editor', 'loadHeadingsForFile: 从磁盘读取文件标题', { filename });
    const result = await weAPI.readFile(project.projectPath, filename);
    if (result.success) {
        const isHtml = project.projectMode !== 'markdown';
        let headings;
        if (isHtml) {
            weLog.debug('editor', 'loadHeadingsForFile: HTML 文件用 DOMParser 解析');
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
            weLog.debug('editor', 'loadHeadingsForFile: Markdown 文件用正则解析');
            headings = getHeadingsFromMarkdown(result.content);
        }
        headingSelect.innerHTML = '<option value="">-- ' + (t('ui.no_heading') || '（无标题）') + ' --</option>' +
            headings.map(h => `<option value="${h.anchor}">${'　'.repeat(h.level - 1)}${h.text}</option>`).join('');
        weLog.info('editor', '← loadHeadingsForFile 完成', { count: headings.length });
    } else {
        weLog.error('editor', 'loadHeadingsForFile: 读取文件失败', { filename, error: result.error });
    }
}

function handleJumpLinkClick(data) {
    weLog.info('editor', '→ handleJumpLinkClick 开始', { url: data.url, file: data.file, heading: data.heading, project: data.project });
    if (data.url) {
        weLog.info('editor', 'handleJumpLinkClick: 打开外部链接', { url: data.url });
        weAPI.openExternalLink(data.url);
    } else if (data.file) {
        // 兼容：先按 safeId 精确匹配（旧链接），再按项目名匹配（可移植链接），最后回退到当前活跃项目
        let targetSafeId = data.project;
        if (!targetSafeId || !tabs[targetSafeId]) {
            weLog.debug('editor', 'handleJumpLinkClick: 按 title 匹配项目', { project: data.project });
            targetSafeId = Object.keys(tabs).find(id => tabs[id]?.title === data.project);
        }
        if (!targetSafeId) {
            weLog.debug('editor', 'handleJumpLinkClick: 回退到当前活跃项目');
            targetSafeId = (typeof activeTabId !== 'undefined' && activeTabId) || currentQuillProjectId;
        }
        const safeId = targetSafeId;
        if (safeId && tabs[safeId]) {
            weLog.info('editor', 'handleJumpLinkClick: 找到目标项目', { safeId });
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
                    if (!project) {
                        weLog.warn('editor', 'handleJumpLinkClick: 滚动定位时 project 不存在', { safeId });
                        return;
                    }
                    const projectMode = project.projectMode || 'rich';
                    if (projectMode === 'markdown') {
                        weLog.debug('editor', 'handleJumpLinkClick: Markdown 模式滚动定位');
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
                        weLog.debug('editor', 'handleJumpLinkClick: 富文本模式滚动定位');
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
            weLog.warn('editor', 'handleJumpLinkClick: 未找到目标项目', { safeId });
            showNotification(t('ui.project_not_found') || '未找到目标项目');
        }
    }
    weLog.info('editor', '← handleJumpLinkClick 完成');
}

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
        }
    });

    closeCodeBlock();
    flushText();
    weLog.debug('editor', '← deltaToMarkdown 完成', { mdLen: md.length });
    return md.trim();
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

// ========== 嵌入模式节点图 ==========

function destroyEmbeddedNodeGraph(safeId) {
    weLog.info('editor', '→ destroyEmbeddedNodeGraph', { safeId });
    const inst = embeddedNodeGraphs[safeId];
    if (!inst) return;
    const project = tabs[safeId];
    try {
        if (inst.engine) {
            // 【修复切回内容消失 #1】不管 dirty 与否，一律把当前引擎数据写入 fileCache 暂存
            // （dirty 标记可能因某些操作漏触发，宁可缓存一份"至少比磁盘旧内容新"的状态，
            //  也不能直接丢内存数据去读磁盘）
            if (project) {
                project.fileCache = project.fileCache || {};
                try {
                    const data = inst.engine.getData();
                    const jsonStr = JSON.stringify(data, null, 2);
                    // 【修复切回内容消失 #2】fileCache key 双写：graphFile 和 basename(graphFile) 都存一份
                    // 因为 openEmbeddedNodeGraph 的 filename 参数有时带 subpath，有时是纯文件名
                    // 【终极修复 #类型包裹】用 _fcWrap('ngjson', ...) 包裹，防止 Quill HTML 覆盖 key
                    const wrapped = _fcWrap('ngjson', jsonStr);
                    project.fileCache[inst.graphFile] = wrapped;
                    const base = inst.graphFile.includes('/') || inst.graphFile.includes('\\')
                        ? inst.graphFile.split(/[\\/]/).pop()
                        : inst.graphFile;
                    if (base !== inst.graphFile) { project.fileCache[base] = wrapped; }
                    weLog.debug('editor', 'destroyEmbeddedNodeGraph: 数据已缓存',
                        { graphFile: inst.graphFile, base, dirty: inst.dirty, nodes: data.nodes.length, edges: data.edges.length });
                } catch (e) {
                    // 【修复切回内容消失 #3】不再静默吞异常，打印便于定位
                    weLog.error('editor', 'destroyEmbeddedNodeGraph: 缓存写入失败', e && e.stack ? e.stack : String(e));
                }
            }
            inst.engine.destroy?.();
        }
    } catch (e) {
        weLog.warn('editor', 'destroyEmbeddedNodeGraph: 销毁异常', e && e.stack ? e.stack : String(e));
    }
    const embedEl = document.getElementById(`ng-embed-${safeId}`);
    if (embedEl) embedEl.innerHTML = '';
    delete embeddedNodeGraphs[safeId];
}

async function saveEmbeddedNodeGraph(safeId) {
    const inst = embeddedNodeGraphs[safeId];
    const project = tabs[safeId];
    if (!inst || !project) return;
    try {
        const data = inst.engine.getData();
        const json = JSON.stringify(data, null, 2);
        const res = await weAPI.saveFile(project.projectPath, inst.graphFile, json);
        if (res.success) {
            inst.dirty = false;
            const status = document.getElementById(`ng-status-${safeId}`);
            if (status) status.textContent = '';
            showNotification(t('ui.saved') || '已保存');
            weLog.info('editor', 'saveEmbeddedNodeGraph: 保存成功', { graphFile: inst.graphFile });
        } else {
            showNotification((t('ui.save_failed') || '保存失败') + ': ' + res.error);
        }
    } catch (e) {
        weLog.error('editor', 'saveEmbeddedNodeGraph: 异常', e && e.stack ? e.stack : String(e));
    }
}

async function openEmbeddedNodeGraph(safeId, filename) {
    weLog.info('editor', '→ openEmbeddedNodeGraph', { safeId, filename });
    const project = tabs[safeId];
    const embedEl = document.getElementById(`ng-embed-${safeId}`);
    const quillWrapper = document.getElementById(`quill-${safeId}`);
    if (!embedEl || !project) {
        weLog.warn('editor', 'openEmbeddedNodeGraph: 容器或项目不存在');
        return;
    }

    // 切换显示：隐藏 Quill，显示节点图
    embedEl.style.display = 'flex';
    if (quillWrapper) quillWrapper.style.display = 'none';
    // 清理旧实例
    if (embeddedNodeGraphs[safeId]) destroyEmbeddedNodeGraph(safeId);

    // 检查 NGEngine 是否可用
    if (typeof NGEngine === 'undefined') {
        weLog.warn('editor', 'openEmbeddedNodeGraph: NGEngine 未加载');
        embedEl.innerHTML = `<div style="padding:20px;color:var(--text-muted,#999)">节点图引擎未加载，请重启应用</div>`;
        return;
    }

    // 构建内嵌节点图 UI
    embedEl.innerHTML = `
        ${typeof buildNodeGraphToolbarHTML === 'function' ? buildNodeGraphToolbarHTML(`ng-status-${safeId}`) : ''}
        <div class="node-graph-body">
            <div class="node-graph-canvas-wrapper" style="position:relative;flex:1;overflow:hidden;">
                <div class="node-graph-canvas" id="ng-canvas-embed-${safeId}"></div>
                <div class="ng-coords" id="ng-coords-${safeId}" style="position:absolute;left:8px;bottom:8px;font-size:11px;font-family:monospace;color:var(--text-secondary,#888);pointer-events:none;z-index:3;background:rgba(0,0,0,0.03);padding:2px 6px;border-radius:3px;">0, 0</div>
            </div>
            ${typeof buildNodeGraphPropertyPanelHTML === 'function' ? buildNodeGraphPropertyPanelHTML() : ''}
        </div>
    `;

    const canvasEl = embedEl.querySelector(`#ng-canvas-embed-${safeId}`);
    const wrapperEl = embedEl.querySelector('.node-graph-canvas-wrapper');
    const coordsEl = embedEl.querySelector(`#ng-coords-${safeId}`);
    const toolbar = embedEl.querySelector('.node-graph-toolbar');
    const panelEl = embedEl.querySelector('.ng-property-panel');
    const zoomLabel = toolbar.querySelector('.ng-zoom-label');

    // 创建 NGEngine 实例
    let engine;
    try {
        engine = new NGEngine(canvasEl, {
            onChange: () => markDirty(),
            onSelectionChange: () => {
                const nid = engine.getSelectedNodeId();
                const eid = engine.getSelectedEdgeId();
                if (typeof updateNodeGraphPropertyPanel === 'function') {
                    updateNodeGraphPropertyPanel(panelEl, engine, nid, eid);
                }
            },
        });
        if (coordsEl) engine.setCoordsEl(coordsEl);
    } catch (e) {
        weLog.error('editor', 'openEmbeddedNodeGraph: NGEngine 初始化失败', String(e));
        return;
    }

    embeddedNodeGraphs[safeId] = { engine, graphFile: filename, dirty: false };
    const inst = embeddedNodeGraphs[safeId];

    // ========== GlobalUndoManager 接入：NodeGraph ==========
    // engine._snapshot() 调 setOnHistoryChange(prev, next, 'push') 时
    // → 把 prev/next 快照 push 到全局撤回栈（同文件 debounce 合并：NG 每步操作一般 400ms 内只做一个动作，
    //   但拖动节点会连续触发 400ms 的 push → debounce 合并只取 first.prev+last.next，体验好）
    const gu = ensureGlobalUndo(safeId);
    engine.setOnHistoryChange((prevSnap, nextSnap, kind) => {
        if (!gu || kind !== 'push') return;
        if (gu.suppress > 0) return; // global undo/redo 期间自己 loadData 后不应该再入栈
        gu.push({
            type: 'nodegraph',
            file: filename,
            label: '节点图操作',
            prev: prevSnap,
            next: nextSnap,
        });
    });

    function markDirty() {
        inst.dirty = true;
        project.dirty = true;
        updateStatusBar();
        const status = document.getElementById(`ng-status-${safeId}`);
        if (status) status.textContent = '●';
    }

    // 属性面板绑定
    if (panelEl) {
        if (typeof bindNodeGraphPropertyPanel === 'function') bindNodeGraphPropertyPanel(panelEl, engine, markDirty);
        if (typeof setupPropertyPanelToggle === 'function') setupPropertyPanelToggle(panelEl);
    }

    // 右键菜单
    if (typeof setupNodeGraphContextMenu === 'function') setupNodeGraphContextMenu(engine, markDirty);

    // ========== 工具栏交互 ==========
    function setActiveTool(tool) {
        engine.setActiveTool(tool === 'select' ? null : tool);
        toolbar.querySelectorAll('.ng-btn[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === (tool || 'select')));
    }
    function setActiveEdge(edgeType) {
        engine.setActiveEdge(edgeType);
        toolbar.querySelectorAll('.ng-btn[data-edge]').forEach(b => b.classList.toggle('active', b.dataset.edge === edgeType));
        if (edgeType) {
            engine.setActiveTool(null);
            toolbar.querySelectorAll('.ng-btn[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === 'select'));
        }
    }
    function updateZoomLabel() {
        if (zoomLabel) zoomLabel.textContent = Math.round(engine.zoom * 100) + '%';
    }

    // 包装 zoom 方法以更新标签
    const origZoomTo = engine.zoomTo.bind(engine);
    engine.zoomTo = (s, c) => { origZoomTo(s, c); updateZoomLabel(); };
    const origZoomReset = engine.zoomReset.bind(engine);
    engine.zoomReset = () => { origZoomReset(); updateZoomLabel(); };

    toolbar.addEventListener('click', async e => {
        const btn = e.target.closest('.ng-btn');
        if (!btn) return;
        const tool = btn.dataset.tool;
        const edge = btn.dataset.edge;
        const action = btn.dataset.action;
        if (tool) {
            setActiveTool(tool);
            if (tool !== 'select') setActiveEdge(null);
        } else if (edge) {
            setActiveEdge(engine.activeEdgeType === edge ? null : edge);
        } else if (action === 'delete') {
            engine.deleteSelected();
            markDirty();
        } else if (action === 'undo') {
            engine.undo();
            markDirty();
        } else if (action === 'redo') {
            engine.redo();
            markDirty();
        } else if (action === 'zoom-in') {
            const rect = canvasEl.getBoundingClientRect();
            engine.zoomTo(engine.zoom * 1.2, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
        } else if (action === 'zoom-out') {
            const rect = canvasEl.getBoundingClientRect();
            engine.zoomTo(engine.zoom / 1.2, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
        } else if (action === 'zoom-reset') {
            engine.zoomReset();
        } else if (action === 'save') {
            saveEmbeddedNodeGraph(safeId);
        } else if (action === 'history') {
            toggleHistoryPanel(safeId);
        }
    });

    // 读取数据（【修复切回内容消失 #4】缓存优先，同时尝试 filename 和 basename(filename) 两个 key）
    // 【终极修复 #类型包裹】用 _fcUnwrap('ngjson') 解开，类型不匹配（比如是 Quill HTML）直接当作没缓存，
    //   这样即使以后 key 被不小心串到 HTML 上，也不会再 JSON.parse 失败渲染空画布
    let jsonStr = null;
    let fromCache = false;
    if (project.fileCache) {
        const base = (filename.includes('/') || filename.includes('\\'))
            ? filename.split(/[\\/]/).pop()
            : filename;
        const unwrappedA = _fcUnwrap('ngjson', project.fileCache[filename]);
        if (unwrappedA !== undefined) {
            jsonStr = unwrappedA;
            fromCache = true;
            weLog.debug('editor', 'openEmbeddedNodeGraph: 从缓存（完整路径）读取', { filename });
        } else if (base !== filename) {
            const unwrappedB = _fcUnwrap('ngjson', project.fileCache[base]);
            if (unwrappedB !== undefined) {
                jsonStr = unwrappedB;
                fromCache = true;
                weLog.debug('editor', 'openEmbeddedNodeGraph: 从缓存（basename）读取', { filename, base });
            }
        }
    }
    if (jsonStr === null || jsonStr === undefined) {
        // 如果上一步"读到了但类型不匹配/内容是 HTML"→此时 jsonStr 还是 null，去读磁盘最新内容（更安全）
        if (fromCache === false && project.fileCache && (project.fileCache[filename] !== undefined
            || ((filename.includes('/') || filename.includes('\\'))
                && project.fileCache[filename.split(/[\\/]/).pop()] !== undefined))) {
            weLog.warn('editor', 'openEmbeddedNodeGraph: 缓存存在但类型不匹配（可能是 Quill HTML），放弃缓存改读磁盘',
                { filename });
        }
        weLog.debug('editor', 'openEmbeddedNodeGraph: 从磁盘读取', { filename });
        const result = await weAPI.readFile(project.projectPath, filename);
        if (result.success) jsonStr = result.content || null;
    }

    let parsedData = null;
    try {
        if (jsonStr && jsonStr.trim()) {
            parsedData = JSON.parse(jsonStr);
            if (typeof migrateNodeGraphData === 'function') parsedData = migrateNodeGraphData(parsedData);
            weLog.debug('editor', 'openEmbeddedNodeGraph: 数据解析成功',
                { fromCache, nodes: parsedData.nodes && parsedData.nodes.length, edges: parsedData.edges && parsedData.edges.length });
        }
    } catch (e) {
        // 【修复切回内容消失 #5】详细打印解析失败的原因和 jsonStr 片段，方便定位
        weLog.error('editor', 'openEmbeddedNodeGraph: 数据解析失败，渲染空画布',
            { fromCache, err: e && e.stack ? e.stack : String(e), jsonPreview: jsonStr ? jsonStr.slice(0, 200) : null });
        parsedData = null;
    }
    engine.loadData(parsedData && (parsedData.nodes || parsedData.edges) ? parsedData : { nodes: [], edges: [] });

    // 初始化
    setActiveTool('select');
    updateZoomLabel();

    // 标记为当前文件
    project.currentFile = filename;
    // 【修复切回内容消失 #6】如果是从缓存加载，说明是上次切换时暂存的未保存状态 → 恢复 dirty=true
    // （即使之前 dirty=false，也只是没标脏而已，内容和磁盘内容相比未保存；用 fromCache 最准确）
    inst.dirty = fromCache && inst.dirty ? true : fromCache;
    project.dirty = inst.dirty || project.dirty;
    if (inst.dirty) {
        const status = document.getElementById(`ng-status-${safeId}`);
        if (status) status.textContent = '●';
    }

    // 高亮文件树
    const tree = document.getElementById(`file-tree-${safeId}`);
    tree?.querySelectorAll('.tree-file').forEach(el => el.classList.remove('active'));
    tree?.querySelector(`[data-file="${filename}"]`)?.classList.add('active');

    updateStatusBar();
    weLog.info('editor', '← openEmbeddedNodeGraph 完成', { filename });
}

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
        weLog.debug('editor', 'handleSmartBrackets: 括号补全', { key });
        e.preventDefault();
        const range = quill.getSelection();
        if (!range) {
            weLog.warn('editor', 'handleSmartBrackets: quill.getSelection 返回空');
            return;
        }
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
        if (!range) {
            weLog.warn('editor', 'handleSmartBrackets: 引号补全时 quill.getSelection 返回空');
            return;
        }
        // 光标前是字母/数字时不补全（可能是缩写如 don't）
        const beforeText = range.index > 0 ? quill.getText(range.index - 1, 1) : '';
        if (isWordChar(beforeText)) return;

        weLog.debug('editor', 'handleSmartBrackets: 引号补全', { key });
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
            weLog.debug('editor', 'handleSmartBrackets: 跳过已有右括号/右引号', { key });
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
            weLog.debug('editor', 'handleSmartBrackets: Backspace 删除成对空括号/引号', { before, after });
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
        weLog.debug('editor', 'handleSmartBracketsTextarea: 括号补全', { key });
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

        weLog.debug('editor', 'handleSmartBracketsTextarea: 引号补全', { key });
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
            weLog.debug('editor', 'handleSmartBracketsTextarea: 跳过已有右括号/右引号', { key });
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
            weLog.debug('editor', 'handleSmartBracketsTextarea: Backspace 删除成对空括号/引号', { before, after });
            e.preventDefault();
            ta.value = val.substring(0, start - 1) + val.substring(start + 1);
            ta.selectionStart = ta.selectionEnd = start - 1;
            ta.dispatchEvent(new Event('input'));
        }
    }
}
