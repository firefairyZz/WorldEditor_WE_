// ========== 账户管理模块 ==========
let currentAccount = null;

async function loadAccount() {
    weLog.info('account', '→ loadAccount 开始');
    try {
        const result = await weAPI.getAccount();
        if (result.success && result.account) {
            weLog.info('account', 'loadAccount: 获取账户成功', { name: result.account.name });
            currentAccount = result.account;
            await loadAccountAvatar();
        } else {
            weLog.info('account', 'loadAccount: 无账户或获取失败');
        }
        return currentAccount;
    } catch (e) {
        weLog.error('account', 'loadAccount 失败', e && e.stack ? e.stack : String(e));
        return null;
    }
}

async function loadAccountAvatar() {
    weLog.info('account', '→ loadAccountAvatar');
    if (!currentAccount) { weLog.warn('account', 'loadAccountAvatar: currentAccount 不存在'); return; }
    try {
        const result = await weAPI.getAccountAvatar(currentAccount);
        if (result.success) {
            currentAccount.avatarDataUrl = result.dataUrl;
            weLog.info('account', '← loadAccountAvatar 完成');
        } else {
            weLog.warn('account', 'loadAccountAvatar: 获取头像失败');
        }
    } catch (e) {
        weLog.error('account', 'loadAccountAvatar 失败', e && e.stack ? e.stack : String(e));
    }
}

function updateAccountUI() {
    weLog.info('account', '→ updateAccountUI', { hasAccount: !!currentAccount });
    if (!currentAccount) {
        updateAvatarButton(null);
        updateOwnerDisplay(null);
        return;
    }
    updateAvatarButton(currentAccount);
    updateOwnerDisplay(currentAccount);
}

function updateAvatarButton(account) {
    weLog.debug('account', '→ updateAvatarButton', { hasAccount: !!account });
    const avatarEl = document.getElementById('account-avatar');
    if (!avatarEl) { weLog.warn('account', 'updateAvatarButton: account-avatar 元素不存在'); return; }

    if (account && account.avatarDataUrl) {
        avatarEl.innerHTML = `<img src="${account.avatarDataUrl}" alt="avatar" />`;
    } else if (account && account.name) {
        avatarEl.textContent = account.name.charAt(0).toUpperCase();
    } else {
        avatarEl.textContent = '?';
    }
}

function updateOwnerDisplay(account) {
    weLog.debug('account', '→ updateOwnerDisplay', { hasAccount: !!account });
    const nameEl = document.getElementById('owner-name');
    const avatarEl = document.getElementById('owner-avatar');
    if (!nameEl) { weLog.warn('account', 'updateOwnerDisplay: owner-name 元素不存在'); return; }

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
    weLog.debug('account', '→ getAccount');
    return currentAccount;
}

// 生成首字母头像 (data URL)
function generateInitialAvatar(name, color) {
    weLog.info('account', '→ generateInitialAvatar', { name });
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
    weLog.info('account', '→ createAccountTab 开始');
    const id = 'account';
    if (tabs[id]) { weLog.info('account', 'createAccountTab: 已存在 account 标签，切换过去'); switchTab(id); return; }
    const content = document.createElement('div');
    content.className = 'account-page';

    const isNew = !currentAccount;
    const accountName = currentAccount?.name || '';
    const accountDisplayName = currentAccount?.displayName || '';
    const avatarDataUrl = currentAccount?.avatarDataUrl || '';
    weLog.info('account', 'createAccountTab', { isNew, accountName });

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
    content.querySelector('#account-btn-upload').onclick = () => { weLog.info('account', 'createAccountTab: 点击上传头像'); fileInput.click(); };
    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        weLog.info('account', 'createAccountTab: 选择头像文件', { name: file.name, size: file.size });
        if (file.size > 2 * 1024 * 1024) {
            weLog.warn('account', 'createAccountTab: 头像超过2MB', { size: file.size });
            alert(t('ui.avatar_too_large') || '头像不能超过2MB');
            return;
        }
        const reader = new FileReader();
        reader.onload = (evt) => {
            tempAvatarDataUrl = evt.target.result;
            const preview = content.querySelector('#account-avatar-preview');
            preview.innerHTML = `<img src="${tempAvatarDataUrl}" alt="avatar" />`;
            content.querySelector('#account-btn-remove').disabled = false;
            weLog.info('account', 'createAccountTab: 头像读取完成');
        };
        reader.readAsDataURL(file);
    };

    // 移除头像
    content.querySelector('#account-btn-remove').onclick = () => {
        weLog.info('account', 'createAccountTab: 点击移除头像');
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
        weLog.info('account', 'createAccountTab: 点击保存', { name, displayName, isNew });

        if (!name) {
            weLog.warn('account', 'createAccountTab: 账户名称为空');
            alert(t('ui.account_name_required') || '请输入账户名称');
            return;
        }
        if (name.length < 2) {
            weLog.warn('account', 'createAccountTab: 账户名称过短', { length: name.length });
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
            weLog.info('account', 'createAccountTab: 保存账户成功', { name });
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
            weLog.error('account', 'createAccountTab: 保存账户失败', result.error);
            alert(t('ui.save_failed') + ': ' + result.error);
        }
    };

    // 删除账户
    const deleteBtn = content.querySelector('#account-btn-delete');
    if (deleteBtn) {
        deleteBtn.onclick = () => {
            if (!currentAccount) return;
            weLog.info('account', 'createAccountTab: 点击删除账户');
            if (!confirm(t('ui.account_delete_confirm') || '确定要删除账户吗？此操作不可撤销。')) return;
            if (!confirm(t('ui.account_delete_confirm_2') || '真的要删除吗？所有账户数据将被清除。')) return;
            weAPI.deleteAccount().then(result => {
                if (result.success) {
                    weLog.info('account', 'createAccountTab: 删除账户成功');
                    currentAccount = null;
                    updateAccountUI();
                    closeTab(id);
                    showNotification(t('ui.account_deleted') || '账户已删除');
                } else {
                    weLog.error('account', 'createAccountTab: 删除账户失败', result.error);
                    alert(t('ui.delete_failed') + ': ' + result.error);
                }
            });
        };
    }

    addTab(id, t('ui.account') || '账户', content, true);
    weLog.info('account', '← createAccountTab 完成');
}
