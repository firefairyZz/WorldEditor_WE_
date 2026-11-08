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
    weLog.info('utils', '→ showPrompt 开始', { title, hasTypeSwitch: !!options.typeSwitch, showImport: !!options.showImport });
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'we-dialog-overlay';
        overlay.innerHTML = `<div class="we-dialog-box we-dialog-box--compact">
            <h3 class="we-dialog-title">${escapeHtml(title)}</h3>
            ${options.typeSwitch ? `
            <div class="we-dialog-type-switch">
                <button class="we-dialog-type-btn active" data-type="file">${t('ui.file') || '文件'}</button>
                <button class="we-dialog-type-btn" data-type="folder">${t('ui.folder') || '文件夹'}</button>
                <button class="we-dialog-type-btn" data-type="nodegraph">${t('ui.nodegraph') || '节点图'}</button>
                ${options.showImport ? `<button class="we-dialog-type-btn we-dialog-type-btn--import" data-type="import" title="${t('ui.import_file') || '从外部导入'}">📥</button>` : ''}
            </div>` : ''}
            ${options.showImport && !options.typeSwitch ? `
            <div class="we-dialog-import-section">
                <button class="we-dialog-import-btn" id="we-dialog-import">📥 ${t('ui.import_file') || '从外部导入'}</button>
            </div>` : ''}
            <input id="we-dialog-input" type="text" placeholder="${escapeHtml(placeholder)}" class="we-dialog-input" />
            <div class="we-dialog-actions">
                <button id="we-dialog-cancel" class="we-dialog-btn we-dialog-btn-cancel">${t('ui.cancel')}</button>
                <button id="we-dialog-ok" class="we-dialog-btn we-dialog-btn-ok">${t('ui.ok')}</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);

        const input = overlay.querySelector('#we-dialog-input');
        input.focus();
        let selectedType = options.defaultType || 'file';

        // 类型切换
        if (options.typeSwitch) {
            const buttons = overlay.querySelectorAll('.we-dialog-type-btn');
            buttons.forEach(btn => {
                btn.onclick = () => {
                    const type = btn.dataset.type;
                    if (type === 'import') {
                        // 触发导入
                        overlay.remove();
                        resolve({ type: 'import', value: null });
                        return;
                    }
                    buttons.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    selectedType = type;
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

        // 独立导入按钮
        if (options.showImport && !options.typeSwitch) {
            const importBtn = overlay.querySelector('#we-dialog-import');
            if (importBtn) {
                importBtn.onclick = () => {
                    overlay.remove();
                    resolve({ type: 'import', value: null });
                };
            }
        }

        overlay.querySelector('#we-dialog-cancel').onclick = () => { weLog.info('utils', 'showPrompt: 用户取消'); overlay.remove(); resolve(null); };
        overlay.querySelector('#we-dialog-ok').onclick = () => {
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

// ====== 统一 CSS 弹窗系统 ======

/**
 * 通用弹窗基础：创建 overlay + box 结构
 */
function _createDialog(options) {
    var type = options.type || 'alert'; // 'alert' | 'confirm' | 'prompt' | 'info'
    var title = options.title || '';
    var message = options.message || '';
    var placeholder = options.placeholder || '';
    var value = options.value || '';
    var confirmText = options.confirmText || (t('ui.ok') || '确定');
    var cancelText = options.cancelText || (t('ui.cancel') || '取消');
    var variant = options.variant || ''; // 'danger' | 'success' | ''
    
    var overlay = document.createElement('div');
    overlay.className = 'we-dialog-overlay';
    if (type === 'alert') overlay.classList.add('we-dialog-overlay--alert');
    if (type === 'confirm') overlay.classList.add('we-dialog-overlay--confirm');
    if (type === 'prompt') overlay.classList.add('we-dialog-overlay--prompt');
    if (variant) overlay.classList.add('we-dialog-overlay--' + variant);
    
    var boxClasses = ['we-dialog-box'];
    if (variant) boxClasses.push('we-dialog-box--' + variant);
    
    var innerHTML = '<div class="' + boxClasses.join(' ') + '">';
    if (title) innerHTML += '<h3 class="we-dialog-title">' + escapeHtml(title) + '</h3>';
    if (message) innerHTML += '<div class="we-dialog-message">' + escapeHtml(message) + '</div>';
    
    if (type === 'prompt') {
        innerHTML += '<input class="we-dialog-input" type="text" placeholder="' + escapeHtml(placeholder) + '" value="' + escapeHtml(value) + '" />';
    }
    
    innerHTML += '<div class="we-dialog-actions">';
    if (type !== 'alert') {
        innerHTML += '<button class="we-dialog-btn we-dialog-btn-cancel">' + escapeHtml(cancelText) + '</button>';
    }
    innerHTML += '<button class="we-dialog-btn we-dialog-btn-ok' + (variant === 'danger' ? ' we-dialog-btn-danger' : '') + '">' + escapeHtml(confirmText) + '</button>';
    innerHTML += '</div></div>';
    
    overlay.innerHTML = innerHTML;
    document.body.appendChild(overlay);
    
    // 禁用背景滚动
    var prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    
    function close() {
        document.body.style.overflow = prevOverflow;
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }
    
    return { overlay: overlay, close: close };
}

/**
 * Alert 弹窗（替代 alert()）
 * @param {string|object} msg 消息内容或 { title, message, variant }
 */
function showAlert(msg) {
    var config = {};
    if (typeof msg === 'object') {
        config = msg;
    } else {
        config.message = msg;
    }
    config.type = 'alert';
    
    var result = _createDialog(config);
    var overlay = result.overlay;
    var close = result.close;
    
    var okBtn = overlay.querySelector('.we-dialog-btn-ok');
    if (okBtn) okBtn.focus();
    okBtn.onclick = close;
    
    // Enter 关闭
    overlay.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === 'Escape') close();
    });
    
    return new Promise(function(resolve) {
        var observer = new MutationObserver(function() {
            if (!document.body.contains(overlay)) {
                observer.disconnect();
                resolve();
            }
        });
        observer.observe(document.body, { childList: true });
    });
}

/**
 * Confirm 弹窗（替代 confirm()）
 * @param {string|object} msg 消息内容或 { title, message, confirmText, cancelText, variant }
 * @returns {Promise<boolean>}
 */
function showConfirm(msg) {
    var config = {};
    if (typeof msg === 'object') {
        config = msg;
    } else {
        config.message = msg;
    }
    config.type = 'confirm';
    
    var result = _createDialog(config);
    var overlay = result.overlay;
    var close = result.close;
    var confirmed = false;
    
    return new Promise(function(resolve) {
        var okBtn = overlay.querySelector('.we-dialog-btn-ok');
        var cancelBtn = overlay.querySelector('.we-dialog-btn-cancel');
        var box = overlay.querySelector('.we-dialog-box');
        
        okBtn.onclick = function() {
            confirmed = true;
            close();
        };
        cancelBtn.onclick = function() {
            confirmed = false;
            close();
        };
        
        // 点击背景关闭
        overlay.onclick = function(e) {
            if (e.target === overlay) {
                confirmed = false;
                close();
            }
        };
        box.onclick = function(e) { e.stopPropagation(); };
        
        okBtn.focus();
        
        overlay.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                confirmed = true;
                close();
            } else if (e.key === 'Escape') {
                confirmed = false;
                close();
            }
        });
        
        var observer = new MutationObserver(function() {
            if (!document.body.contains(overlay)) {
                observer.disconnect();
                resolve(confirmed);
            }
        });
        observer.observe(document.body, { childList: true });
    });
}

/**
 * Simple Prompt 弹窗（替代 prompt()）
 * @param {string|object} msg 消息内容或 { title, message, value, placeholder, confirmText, cancelText }
 * @returns {Promise<string|null>}
 */
function showInputDialog(msg) {
    var config = {};
    if (typeof msg === 'object') {
        config = msg;
    } else {
        config.message = msg;
    }
    config.type = 'prompt';
    
    var result = _createDialog(config);
    var overlay = result.overlay;
    var close = result.close;
    var inputEl = overlay.querySelector('.we-dialog-input');
    var confirmed = false;
    var resultValue = null;
    
    return new Promise(function(resolve) {
        var okBtn = overlay.querySelector('.we-dialog-btn-ok');
        var cancelBtn = overlay.querySelector('.we-dialog-btn-cancel');
        var box = overlay.querySelector('.we-dialog-box');
        
        okBtn.onclick = function() {
            confirmed = true;
            resultValue = inputEl.value;
            close();
        };
        cancelBtn.onclick = function() {
            confirmed = false;
            close();
        };
        
        // 点击背景关闭
        overlay.onclick = function(e) {
            if (e.target === overlay) {
                confirmed = false;
                close();
            }
        };
        box.onclick = function(e) { e.stopPropagation(); };
        
        inputEl.focus();
        if (inputEl.value) inputEl.select();
        
        inputEl.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                confirmed = true;
                resultValue = inputEl.value;
                close();
            } else if (e.key === 'Escape') {
                confirmed = false;
                close();
            }
        });
        
        var observer = new MutationObserver(function() {
            if (!document.body.contains(overlay)) {
                observer.disconnect();
                resolve(confirmed ? resultValue : null);
            }
        });
        observer.observe(document.body, { childList: true });
    });
}

/**
 * 向后兼容：旧的 showTextInputDialog（基于回调）
 */
function showTextInputDialog(options) {
    if (!options) return;
    showInputDialog({
        title: options.title,
        message: options.message || '',
        value: options.value,
        placeholder: options.placeholder,
        confirmText: options.confirmText,
        cancelText: options.cancelText
    }).then(function(val) {
        if (val !== null && val !== undefined) {
            if (options.onConfirm) options.onConfirm(val);
        } else {
            if (options.onCancel) options.onCancel();
        }
    });
}