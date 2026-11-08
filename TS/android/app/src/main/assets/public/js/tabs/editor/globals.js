// ====== editor/globals.js — 全局变量与工具函数 ======
// 源文件: editor.js (行1-20 + 行94-166)

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