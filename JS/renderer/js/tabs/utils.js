function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 防抖：高频事件合并为最后一次触发后执行，常用于 text-change/resize 等场景以减少布局抖动
function debounce(fn, wait = 250) {
    let timer = null;
    const debounced = function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => { fn.apply(this, args); timer = null; }, wait);
    };
    debounced.cancel = () => { clearTimeout(timer); timer = null; };
    return debounced;
}

function showPrompt(title, placeholder = '', options = {}) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'prompt-overlay';
        overlay.innerHTML = `<div class="prompt-box">
            <h3 class="prompt-title">${escapeHtml(title)}</h3>
            ${options.typeSwitch ? `
            <div class="prompt-type-switch">
                <button class="prompt-type-btn active" data-type="file">${t('ui.file') || '文件'}</button>
                <button class="prompt-type-btn" data-type="folder">${t('ui.folder') || '文件夹'}</button>
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
                    const label = selectedType === 'file' ? (t('ui.file_name') || '文件名') : (t('ui.folder_name') || '文件夹名');
                    input.placeholder = label;
                };
            });
            input.placeholder = options.defaultType === 'folder' ? (t('ui.folder_name') || '文件夹名') : (t('ui.file_name') || '文件名');
        }

        overlay.querySelector('#prompt-cancel').onclick = () => { overlay.remove(); resolve(null); };
        overlay.querySelector('#prompt-ok').onclick = () => {
            const val = input.value.trim();
            overlay.remove();
            resolve(options.typeSwitch ? { value: val, type: selectedType } : (val || null));
        };
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const val = input.value.trim();
                overlay.remove();
                resolve(options.typeSwitch ? { value: val, type: selectedType } : (val || null));
            }
            if (e.key === 'Escape') { overlay.remove(); resolve(null); }
        });
    });
}

function sanitizeId(path) { return path.replace(/[^a-zA-Z0-9_-]/g, '_'); }