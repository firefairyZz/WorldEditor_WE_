// ========== 账户管理模块 ==========
let currentAccount = null;

async function loadAccount() {
    try {
        const result = await weAPI.getAccount();
        if (result.success && result.account) {
            currentAccount = result.account;
            await loadAccountAvatar();
        }
        return currentAccount;
    } catch (e) {
        console.error('Failed to load account:', e);
        return null;
    }
}

async function loadAccountAvatar() {
    if (!currentAccount) return;
    try {
        const result = await weAPI.getAccountAvatar(currentAccount);
        if (result.success) {
            currentAccount.avatarDataUrl = result.dataUrl;
        }
    } catch (e) {}
}

function updateAccountUI() {
    if (!currentAccount) {
        updateAvatarButton(null);
        updateOwnerDisplay(null);
        return;
    }
    updateAvatarButton(currentAccount);
    updateOwnerDisplay(currentAccount);
}

function updateAvatarButton(account) {
    const avatarEl = document.getElementById('account-avatar');
    if (!avatarEl) return;

    if (account && account.avatarDataUrl) {
        avatarEl.innerHTML = `<img src="${account.avatarDataUrl}" alt="avatar" />`;
    } else if (account && account.name) {
        avatarEl.textContent = account.name.charAt(0).toUpperCase();
    } else {
        avatarEl.textContent = '?';
    }
}

function updateOwnerDisplay(account) {
    const nameEl = document.getElementById('owner-name');
    const avatarEl = document.getElementById('owner-avatar');
    if (!nameEl) return;

    if (account) {
        nameEl.textContent = account.name;
        if (account.avatarDataUrl && avatarEl) {
            avatarEl.innerHTML = `<img src="${account.avatarDataUrl}" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
        } else if (avatarEl) {
            avatarEl.textContent = account.name.charAt(0).toUpperCase();
        }
    } else {
        nameEl.textContent = '';
        if (avatarEl) avatarEl.textContent = '?';
    }
}

function getAccount() {
    return currentAccount;
}

// 生成首字母头像 (data URL)
function generateInitialAvatar(name, color) {
    const initial = (name || '?').charAt(0).toUpperCase();
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    if (!color) {
        const colors = ['#00897B', '#36F4E4', '#4DEE57', '#0078d4', '#88c0d0', '#5e81ac', '#bd93f9', '#ff79c6'];
        color = colors[initial.charCodeAt(0) % colors.length];
    }
    
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(32, 32, 32, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 32px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initial, 32, 34);
    
    return canvas.toDataURL('image/png');
}

// ========== 账户标签页 ==========
function createAccountTab() {
    const id = 'account';
    if (tabs[id]) { switchTab(id); return; }
    const content = document.createElement('div');
    content.className = 'account-page';

    const isNew = !currentAccount;
    const accountName = currentAccount?.name || '';
    const accountDisplayName = currentAccount?.displayName || '';
    const avatarDataUrl = currentAccount?.avatarDataUrl || '';

    content.innerHTML = `
        <div class="account-page-wrapper">
            <div class="account-page-scroll">
                <div class="account-page-inner">
                    <h2>${isNew ? (t('ui.account_register') || '注册账户') : (t('ui.account_settings') || '账户设置')}</h2>
                    <div class="account-page-avatar">
                        <div class="account-page-avatar-preview" id="account-avatar-preview">
                            ${avatarDataUrl ? `<img src="${avatarDataUrl}" alt="avatar" />` : `<span>${accountName.charAt(0).toUpperCase() || '?'}</span>`}
                        </div>
                    </div>
                    <div class="account-page-avatar-actions">
                        <button class="account-page-link" id="account-btn-upload">${t('ui.upload_avatar') || '上传头像'}</button>
                        <span class="account-page-link-sep">|</span>
                        <button class="account-page-link" id="account-btn-remove" ${avatarDataUrl ? '' : 'disabled'}>${t('ui.remove_avatar') || '移除头像'}</button>
                    </div>
                    <div class="account-page-form">
                        <div class="account-page-field">
                            <label>${t('ui.account_name') || '账户名称'} <span class="required">*</span></label>
                            <input type="text" id="account-name-input" value="${accountName}" placeholder="${t('ui.account_name_placeholder') || '请输入账户名称'}" maxlength="20" />
                            <p class="field-hint">${t('ui.account_name_hint') || '仅支持英文、数字、下划线、连字符'}</p>
                        </div>
                        <div class="account-page-field">
                            <label>${t('ui.display_name') || '显示名称'}</label>
                            <input type="text" id="account-display-input" value="${accountDisplayName}" placeholder="${t('ui.display_name_placeholder') || '请输入显示名称'}" maxlength="30" />
                        </div>
                    </div>
                </div>
            </div>
            <div class="account-page-footer">
                ${!isNew ? `<button class="btn-account-danger" id="account-btn-delete">${t('ui.delete_account') || '删除账户'}</button>` : ''}
                <button class="btn-account-submit" id="account-btn-submit">${t('ui.confirm') || '确认'}</button>
            </div>
        </div>
        <input type="file" id="account-avatar-file" accept="image/*" style="display:none" />
    `;

    let tempAvatarDataUrl = avatarDataUrl;

    // 上传头像
    const fileInput = content.querySelector('#account-avatar-file');
    content.querySelector('#account-btn-upload').onclick = () => fileInput.click();
    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
            alert(t('ui.avatar_too_large') || '头像不能超过2MB');
            return;
        }
        const reader = new FileReader();
        reader.onload = (evt) => {
            tempAvatarDataUrl = evt.target.result;
            const preview = content.querySelector('#account-avatar-preview');
            preview.innerHTML = `<img src="${tempAvatarDataUrl}" alt="avatar" />`;
            content.querySelector('#account-btn-remove').disabled = false;
        };
        reader.readAsDataURL(file);
    };

    // 移除头像
    content.querySelector('#account-btn-remove').onclick = () => {
        tempAvatarDataUrl = '';
        const nameInput = content.querySelector('#account-name-input');
        const preview = content.querySelector('#account-avatar-preview');
        const initial = (nameInput.value || '?').charAt(0).toUpperCase();
        preview.innerHTML = `<span>${initial}</span>`;
        content.querySelector('#account-btn-remove').disabled = true;
    };

    // 名称输入：实时过滤非法字符 + 更新首字母预览
    content.querySelector('#account-name-input').oninput = (e) => {
        // 仅允许英文、数字、下划线、连字符
        const filtered = e.target.value.replace(/[^a-zA-Z0-9_-]/g, '');
        if (filtered !== e.target.value) e.target.value = filtered;
        if (tempAvatarDataUrl) return;
        const preview = content.querySelector('#account-avatar-preview');
        const initial = (filtered || '?').charAt(0).toUpperCase();
        preview.innerHTML = `<span>${initial}</span>`;
    };

    // 确认保存
    content.querySelector('#account-btn-submit').onclick = async () => {
        const name = content.querySelector('#account-name-input').value.trim();
        const displayName = content.querySelector('#account-display-input').value.trim();

        if (!name) {
            alert(t('ui.account_name_required') || '请输入账户名称');
            return;
        }
        if (name.length < 2) {
            alert(t('ui.account_name_too_short') || '账户名称至少2个字符');
            return;
        }

        const accountData = {
            name,
            displayName: displayName || name,
            avatarDataUrl: tempAvatarDataUrl || generateInitialAvatar(name),
            createdAt: currentAccount?.createdAt || new Date().toISOString()
        };

        const result = await weAPI.saveAccount(accountData);
        if (result.success) {
            currentAccount = result.account || accountData;
            if (tempAvatarDataUrl) {
                currentAccount.avatarDataUrl = tempAvatarDataUrl;
            } else {
                currentAccount.avatarDataUrl = accountData.avatarDataUrl;
            }
            updateAccountUI();
            closeTab(id);
            showNotification(isNew ? (t('ui.account_created') || '账户创建成功') : (t('ui.account_updated') || '账户已更新'));
        } else {
            alert(t('ui.save_failed') + ': ' + result.error);
        }
    };

    // 删除账户
    const deleteBtn = content.querySelector('#account-btn-delete');
    if (deleteBtn) {
        deleteBtn.onclick = () => {
            if (!currentAccount) return;
            if (!confirm(t('ui.account_delete_confirm') || '确定要删除账户吗？此操作不可撤销。')) return;
            if (!confirm(t('ui.account_delete_confirm_2') || '真的要删除吗？所有账户数据将被清除。')) return;
            weAPI.deleteAccount().then(result => {
                if (result.success) {
                    currentAccount = null;
                    updateAccountUI();
                    closeTab(id);
                    showNotification(t('ui.account_deleted') || '账户已删除');
                } else {
                    alert(t('ui.delete_failed') + ': ' + result.error);
                }
            });
        };
    }

    addTab(id, t('ui.account') || '账户', content, true);
}
