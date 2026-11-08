function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 防抖：高频事件合并为最后一次触发后执行，常用于 text-change/resize 等场景以减少布局抖动
function debounce(fn, wait = 250) {
    weLog.info('utils', '→ debounce 创建', { wait });
    let timer = null;
    const debounced = function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => { fn.apply(this, args); timer = null; }, wait);
    };
    debounced.cancel = () => { clearTimeout(timer); timer = null; };
    return debounced;
}

function showPrompt(title, placeholder = '', options = {}) {
    weLog.info('utils', '→ showPrompt 开始', { title, hasTypeSwitch: !!options.typeSwitch });
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'prompt-overlay';
        overlay.innerHTML = `<div class="prompt-box">
            <h3 class="prompt-title">${escapeHtml(title)}</h3>
            ${options.typeSwitch ? `
            <div class="prompt-type-switch">
                <button class="prompt-type-btn active" data-type="file">${t('ui.file') || '文件'}</button>
                <button class="prompt-type-btn" data-type="folder">${t('ui.folder') || '文件夹'}</button>
                <button class="prompt-type-btn" data-type="nodegraph">${t('ui.nodegraph') || '节点图'}</button>
            </div>` : ''}
            <input id="prompt-input" type="text" placeholder="${escapeHtml(placeholder)}" class="prompt-input" />
            <div class="prompt-actions">
                <button id="prompt-cancel" class="prompt-btn prompt-btn-cancel">${t('ui.cancel')}</button>
                <button id="prompt-ok" class="prompt-btn prompt-btn-ok">${t('ui.ok')}</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);

        const input = overlay.querySelector('#prompt-input');
        input.focus();
        let selectedType = options.defaultType || 'file';

        // 类型切换
        if (options.typeSwitch) {
            const buttons = overlay.querySelectorAll('.prompt-type-btn');
            buttons.forEach(btn => {
                btn.onclick = () => {
                    buttons.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    selectedType = btn.dataset.type;
                    weLog.debug('utils', 'showPrompt: 切换类型', { selectedType });
                    let label;
                    if (selectedType === 'file') label = t('ui.file_name') || '文件名';
                    else if (selectedType === 'folder') label = t('ui.folder_name') || '文件夹名';
                    else label = t('ui.nodegraph_name') || '节点图名称';
                    input.placeholder = label;
                };
            });
            input.placeholder = options.defaultType === 'folder' ? (t('ui.folder_name') || '文件夹名') : (t('ui.file_name') || '文件名');
        }

        overlay.querySelector('#prompt-cancel').onclick = () => { weLog.info('utils', 'showPrompt: 用户取消'); overlay.remove(); resolve(null); };
        overlay.querySelector('#prompt-ok').onclick = () => {
            const val = input.value.trim();
            weLog.info('utils', 'showPrompt: 用户确认', { value: val, type: options.typeSwitch ? selectedType : undefined });
            overlay.remove();
            resolve(options.typeSwitch ? { value: val, type: selectedType } : (val || null));
        };
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const val = input.value.trim();
                weLog.info('utils', 'showPrompt: Enter 确认', { value: val });
                overlay.remove();
                resolve(options.typeSwitch ? { value: val, type: selectedType } : (val || null));
            }
            if (e.key === 'Escape') { weLog.info('utils', 'showPrompt: Escape 取消'); overlay.remove(); resolve(null); }
        });
    });
}

function sanitizeId(path) {
    return path.replace(/[^a-zA-Z0-9_-]/g, '_');
}

// 文本输入对话框（替代 prompt()，支持翻译）
function showTextInputDialog(options) {
    if (!options) return;
    var title = options.title || '';
    var value = options.value || '';
    var placeholder = options.placeholder || '';
    var onConfirm = options.onConfirm || function() {};
    var onCancel = options.onCancel || function() {};

    var overlay = document.createElement('div');
    overlay.className = 'prompt-overlay';
    overlay.innerHTML = '<div class="prompt-box">' +
        '<h3 class="prompt-title">' + escapeHtml(title) + '</h3>' +
        '<input id="text-input-dialog-input" type="text" placeholder="' + escapeHtml(placeholder) + '" class="prompt-input" value="' + escapeHtml(value) + '" />' +
        '<div class="prompt-actions">' +
            '<button id="text-input-dialog-cancel" class="prompt-btn prompt-btn-cancel">' + (t('ui.cancel') || '取消') + '</button>' +
            '<button id="text-input-dialog-ok" class="prompt-btn prompt-btn-ok">' + (t('ui.ok') || '确定') + '</button>' +
        '</div></div>';
    document.body.appendChild(overlay);

    var input = overlay.querySelector('#text-input-dialog-input');
    input.focus();
    input.select();

    overlay.querySelector('#text-input-dialog-cancel').onclick = function() {
        overlay.remove();
        onCancel();
    };
    overlay.querySelector('#text-input-dialog-ok').onclick = function() {
        var val = input.value;
        overlay.remove();
        onConfirm(val);
    };
    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            var val = input.value;
            overlay.remove();
            onConfirm(val);
        }
        if (e.key === 'Escape') {
            overlay.remove();
            onCancel();
        }
    });
}