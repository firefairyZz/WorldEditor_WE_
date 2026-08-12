// ====== editor/smart-brackets.js — 智能括号/引号自动补全 ======
// 源文件: editor.js (行3417-3595)

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