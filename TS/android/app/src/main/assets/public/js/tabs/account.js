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
        updateUserProfileCards(null);
        return;
    }
    updateAvatarButton(currentAccount);
    updateOwnerDisplay(currentAccount);
    updateUserProfileCards(currentAccount);
}

function createUserProfileCard(options = {}) {
    const card = document.createElement('div');
    card.className = 'sidebar-user-profile';
    if (options.id) card.id = options.id;
    card.innerHTML = `
        <div class="sidebar-user-profile-avatar" data-profile-avatar></div>
        <div class="sidebar-user-profile-name" data-profile-name></div>
        <div class="sidebar-user-profile-bio" data-profile-bio></div>
        <hr class="sidebar-divider">
    `;
    updateUserProfileCard(card, getAccount());
    return card;
}

function updateUserProfileCard(card, account) {
    if (!card) return;
    const avatarEl = card.querySelector('[data-profile-avatar]');
    const nameEl = card.querySelector('[data-profile-name]');
    const bioEl = card.querySelector('[data-profile-bio]');
    if (!avatarEl || !nameEl || !bioEl) return;

    if (!account || !account.name) {
        avatarEl.innerHTML = '<span>?</span>';
        nameEl.textContent = t('ui.not_set') || '未设置';
        bioEl.textContent = t('ui.bio_edit_hint') || '在「账户」选项卡内可编辑签名';
        bioEl.classList.add('is-placeholder');
        return;
    }

    const displayName = (account.displayName || account.name).replace(/[<>]/g, '');
    if (account.avatarDataUrl) {
        avatarEl.innerHTML = `<img src="${account.avatarDataUrl}" alt="avatar" />`;
    } else {
        avatarEl.innerHTML = `<span>${(account.name[0] || '?').toUpperCase()}</span>`;
    }
    nameEl.textContent = displayName;

    const bio = (account.bio || '').trim();
    if (bio) {
        bioEl.textContent = bio.replace(/[<>]/g, '');
        bioEl.classList.remove('is-placeholder');
    } else {
        bioEl.textContent = t('ui.bio_edit_hint') || '在「账户」选项卡内可编辑签名';
        bioEl.classList.add('is-placeholder');
    }
}

function updateUserProfileCards(account) {
    document.querySelectorAll('.sidebar-user-profile').forEach(card => {
        updateUserProfileCard(card, account);
    });
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

// ========== 账户标签页（两步向导：语言选择→账户注册） ==========
function createAccountTab(wizard) {
    weLog.info('account', '→ createAccountTab 开始', { wizard: !!wizard });
    const id = 'account';
    if (tabs[id]) { weLog.info('account', 'createAccountTab: 已存在 account 标签，切换过去'); switchTab(id); return; }
    
    // 移动端：作为启程页子页面打开
    if (window.mobileNavActive && !document.body.classList.contains('is-desktop')) {
        return createAccountAsWelcomeSubPage(wizard);
    }
    const root = document.createElement('div');
    root.className = 'area-root oa';
    const block = document.createElement('div');
    block.className = 'area-card';
    const content = document.createElement('div');
    content.className = 'account-page';

    const isNew = !currentAccount;
    const accountName = currentAccount?.name || '';
    const accountDisplayName = currentAccount?.displayName || '';
    const accountBio = currentAccount?.bio || '';
    const avatarDataUrl = currentAccount?.avatarDataUrl || '';
    weLog.info('account', 'createAccountTab', { isNew, accountName, wizard: !!wizard });

    // Lucide earth SVG（来自 lucide-static/icons/earth.svg）
    const EARTH_SVG = '<svg viewBox="0 0 24 24" width="96" height="96" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M21.54 15H17a2 2 0 0 0-2 2v4.54"/><path d="M7 3.34V5a3 3 0 0 0 3 3a2 2 0 0 1 2 2c0 1.1.9 2 2 2a2 2 0 0 0 2-2c0-1.1.9-2 2-2h3.17"/><path d="M11 21.95V18a2 2 0 0 0-2-2a2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2H2.05"/><circle cx="12" cy="12" r="10"/></svg>';

    // 构建步骤指示器
    function buildStepIndicator(currentStep) {
        return `
            <div class="wizard-steps">
                <span class="wizard-step ${currentStep === 1 ? 'active' : ''}">${t('ui.language') || '语言'}</span>
                <span class="wizard-step-sep">—</span>
                <span class="wizard-step ${currentStep === 2 ? 'active' : ''}">${t('ui.account') || '账户'}</span>
            </div>
        `;
    }

    if (wizard) {
        // 两步向导模式
        content.innerHTML = `
            <div class="account-page-wrapper">
                <div class="account-page-scroll">
                    <div class="wizard-step-header">
                        ${buildStepIndicator(1)}
                    </div>
                    <div class="wizard-step-body" id="wizard-step-1">
                        <div class="wizard-lang-icon">${EARTH_SVG}</div>
                        <div class="wizard-lang-field">
                            <label>${t('ui.language') || 'Language'}</label>
                            <select id="wizard-lang-select" class="wizard-lang-select">
                                <option value="en">English</option>
                                <option value="zh_CN">中文</option>
                                <option value="ja">日本語</option>
                                <option value="ru">Русский</option>
                            </select>
                        </div>
                    </div>
                    <div class="account-page-inner" id="wizard-step-2" style="display:none;">
                        ${buildStepIndicator(2)}
                        <h2>${t('ui.account_register') || '注册账户'}</h2>
                        <div class="account-page-avatar">
                            <div class="account-page-avatar-preview" id="account-avatar-preview">
                                <span>?</span>
                            </div>
                        </div>
                        <div class="account-page-avatar-actions">
                            <button class="account-page-link" id="account-btn-upload">${t('ui.upload_avatar') || '上传头像'}</button>
                            <span class="account-page-link-sep">|</span>
                            <button class="account-page-link" id="account-btn-remove" disabled>${t('ui.remove_avatar') || '移除头像'}</button>
                        </div>
                        <div class="account-page-form">
                            <div class="account-page-field">
                                <label>${t('ui.account_name') || '账户名称'} <span class="required">*</span></label>
                                <input type="text" id="account-name-input" value="" placeholder="${t('ui.account_name_placeholder') || '请输入账户名称'}" maxlength="20" />
                                <p class="field-hint">${t('ui.account_name_hint') || '仅支持英文、数字、下划线、连字符'}</p>
                            </div>
                            <div class="account-page-field">
                                <label>${t('ui.display_name') || '显示名称'}</label>
                                <input type="text" id="account-display-input" value="" placeholder="${t('ui.display_name_placeholder') || '请输入显示名称'}" maxlength="30" />
                            </div>
                            <div class="account-page-field">
                                <label>${t('ui.bio') || '简介'}</label>
                                <textarea id="account-bio-input" rows="2" maxlength="120" placeholder="${t('ui.bio_placeholder') || '写一句个人签名…'}"></textarea>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="account-page-footer" id="wizard-footer-1">
                    <button class="btn-account-submit" id="wizard-btn-next">${t('ui.next') || '下一步'}</button>
                </div>
                <div class="account-page-footer" id="wizard-footer-2" style="display:none;">
                    <button class="btn-account-back" id="wizard-btn-back">${t('ui.back') || '上一步'}</button>
                    <button class="btn-account-submit" id="account-btn-submit">${t('ui.confirm') || '确认'}</button>
                </div>
            </div>
            <input type="file" id="account-avatar-file" accept="image/*" style="display:none" />
        `;

        // 步骤1：语言选择（立即切换）
        let tempAvatarDataUrl = '';
        const langSelect = content.querySelector('#wizard-lang-select');
        langSelect.value = 'en';
        // 选择语言立即切换界面
        langSelect.addEventListener('change', async () => {
            const lang = langSelect.value;
            weLog.info('account', 'createAccountTab: 语言切换', { lang });
            try {
                await loadLanguage(lang);
                const settings = await weAPI.getSettings();
                settings.language = lang;
                await weAPI.setSettings(settings);
                updateFileMenuTexts();
                // 刷新当前界面文字
                if (typeof refreshAllUITexts === 'function') refreshAllUITexts();
                // 刷新步骤1中的文字
                const step1Indicator = content.querySelector('.wizard-step-header .wizard-steps');
                if (step1Indicator) step1Indicator.outerHTML = buildStepIndicator(1);
                const langLabel = content.querySelector('.wizard-lang-field label');
                if (langLabel) langLabel.textContent = t('ui.language') || 'Language';
                const nextBtn = content.querySelector('#wizard-btn-next');
                if (nextBtn) nextBtn.textContent = t('ui.next') || '下一步';
                // 刷新标签页标题
                const tabEl = tabs['account']?.tabElement;
                if (tabEl) {
                    const titleSpan = tabEl.querySelector('.tab-title');
                    if (titleSpan) titleSpan.textContent = t('ui.define_world') || '定义世界';
                }
            } catch (e) {
                weLog.error('account', 'createAccountTab: 语言切换失败', e && e.stack ? e.stack : String(e));
            }
        });
        // 下一步 → 切换到步骤2
        content.querySelector('#wizard-btn-next').onclick = () => {
            content.querySelector('.wizard-step-header').style.display = 'none';
            content.querySelector('#wizard-step-1').style.display = 'none';
            content.querySelector('#wizard-step-2').style.display = '';
            content.querySelector('#wizard-footer-1').style.display = 'none';
            content.querySelector('#wizard-footer-2').style.display = '';
            // 刷新步骤2中的文字
            const step2Indicator = content.querySelector('#wizard-step-2 .wizard-steps');
            if (step2Indicator) step2Indicator.outerHTML = buildStepIndicator(2);
            content.querySelector('#wizard-step-2 h2').textContent = t('ui.account_register') || '注册账户';
            // 刷新步骤2中的 label 和 placeholder
            const step2labels = content.querySelectorAll('#wizard-step-2 .account-page-field label');
            if (step2labels[0]) step2labels[0].innerHTML = (t('ui.account_name') || '账户名称') + ' <span class="required">*</span>';
            if (step2labels[1]) step2labels[1].textContent = t('ui.display_name') || '显示名称';
            if (step2labels[2]) step2labels[2].textContent = t('ui.bio') || '简介';
            const nameInput = content.querySelector('#account-name-input');
            if (nameInput) nameInput.placeholder = t('ui.account_name_placeholder') || '请输入账户名称';
            const displayInput = content.querySelector('#account-display-input');
            if (displayInput) displayInput.placeholder = t('ui.display_name_placeholder') || '请输入显示名称';
            const bioInput = content.querySelector('#account-bio-input');
            if (bioInput) bioInput.placeholder = t('ui.bio_placeholder') || '写一句个人签名…';
            const hint = content.querySelector('.field-hint');
            if (hint) hint.textContent = t('ui.account_name_hint') || '仅支持英文、数字、下划线、连字符';
            const backBtn = content.querySelector('#wizard-btn-back');
            if (backBtn) backBtn.textContent = t('ui.back') || '上一步';
            const submitBtn = content.querySelector('#account-btn-submit');
            if (submitBtn) submitBtn.textContent = t('ui.confirm') || '确认';
        };

        // 步骤2：账户注册
        const fileInput = content.querySelector('#account-avatar-file');
        content.querySelector('#account-btn-upload').onclick = () => { fileInput.click(); };
        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (file.size > 2 * 1024 * 1024) {
                showAlert(t('ui.avatar_too_large') || '头像不能超过2MB');
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

        content.querySelector('#account-btn-remove').onclick = () => {
            tempAvatarDataUrl = '';
            const nameInput = content.querySelector('#account-name-input');
            const preview = content.querySelector('#account-avatar-preview');
            const initial = (nameInput.value || '?').charAt(0).toUpperCase();
            preview.innerHTML = `<span>${initial}</span>`;
            content.querySelector('#account-btn-remove').disabled = true;
        };

        content.querySelector('#account-name-input').oninput = (e) => {
            const filtered = e.target.value.replace(/[^a-zA-Z0-9_-]/g, '');
            if (filtered !== e.target.value) e.target.value = filtered;
            if (tempAvatarDataUrl) return;
            const preview = content.querySelector('#account-avatar-preview');
            const initial = (filtered || '?').charAt(0).toUpperCase();
            preview.innerHTML = `<span>${initial}</span>`;
        };

        // 上一步 → 回到步骤1
        content.querySelector('#wizard-btn-back').onclick = () => {
            content.querySelector('.wizard-step-header').style.display = '';
            content.querySelector('#wizard-step-2').style.display = 'none';
            content.querySelector('#wizard-step-1').style.display = '';
            content.querySelector('#wizard-footer-2').style.display = 'none';
            content.querySelector('#wizard-footer-1').style.display = '';
            const step1Indicator = content.querySelector('.wizard-step-header .wizard-steps');
            if (step1Indicator) step1Indicator.outerHTML = buildStepIndicator(1);
        };

        // 确认保存
        content.querySelector('#account-btn-submit').onclick = async () => {
            const name = content.querySelector('#account-name-input').value.trim();
            const displayName = content.querySelector('#account-display-input').value.trim();
            const bio = content.querySelector('#account-bio-input').value.trim();
            if (!name) {
                showNotification(t('ui.account_name_required') || '请输入账户名称');
                return;
            }
            if (name.length < 2) {
                showNotification(t('ui.account_name_too_short') || '账户名称至少2个字符');
                return;
            }
            const accountData = {
                name,
                displayName: displayName || name,
                bio,
                avatarDataUrl: tempAvatarDataUrl || generateInitialAvatar(name),
                createdAt: new Date().toISOString()
            };
            const result = await weAPI.saveAccount(accountData);
            if (result.success) {
                currentAccount = result.account || accountData;
                if (tempAvatarDataUrl) currentAccount.avatarDataUrl = tempAvatarDataUrl;
                else currentAccount.avatarDataUrl = accountData.avatarDataUrl;
                updateAccountUI();
                closeTab(id);
                showNotification(t('ui.account_created') || '账户创建成功');
            } else {
                showAlert(t('ui.save_failed') + ': ' + result.error);
            }
        };
    } else {
        // 非向导模式（从设置打开）
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
                            <div class="account-page-field">
                                <label>${t('ui.bio') || '简介'}</label>
                                <textarea id="account-bio-input" rows="3" maxlength="120" placeholder="${t('ui.bio_placeholder') || '写一句个人签名…'}">${accountBio.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
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

        const fileInput = content.querySelector('#account-avatar-file');
        content.querySelector('#account-btn-upload').onclick = () => { fileInput.click(); };
        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (file.size > 2 * 1024 * 1024) {
                showAlert(t('ui.avatar_too_large') || '头像不能超过2MB');
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

        content.querySelector('#account-btn-remove').onclick = () => {
            tempAvatarDataUrl = '';
            const nameInput = content.querySelector('#account-name-input');
            const preview = content.querySelector('#account-avatar-preview');
            const initial = (nameInput.value || '?').charAt(0).toUpperCase();
            preview.innerHTML = `<span>${initial}</span>`;
            content.querySelector('#account-btn-remove').disabled = true;
        };

        content.querySelector('#account-name-input').oninput = (e) => {
            const filtered = e.target.value.replace(/[^a-zA-Z0-9_-]/g, '');
            if (filtered !== e.target.value) e.target.value = filtered;
            if (tempAvatarDataUrl) return;
            const preview = content.querySelector('#account-avatar-preview');
            const initial = (filtered || '?').charAt(0).toUpperCase();
            preview.innerHTML = `<span>${initial}</span>`;
        };

        content.querySelector('#account-btn-submit').onclick = async () => {
            const name = content.querySelector('#account-name-input').value.trim();
            const displayName = content.querySelector('#account-display-input').value.trim();
            const bio = content.querySelector('#account-bio-input').value.trim();
            if (!name) {
                showNotification(t('ui.account_name_required') || '请输入账户名称');
                return;
            }
            if (name.length < 2) {
                showNotification(t('ui.account_name_too_short') || '账户名称至少2个字符');
                return;
            }
            const accountData = {
                name,
                displayName: displayName || name,
                bio,
                avatarDataUrl: tempAvatarDataUrl || generateInitialAvatar(name),
                createdAt: currentAccount?.createdAt || new Date().toISOString()
            };
            const result = await weAPI.saveAccount(accountData);
            if (result.success) {
                currentAccount = result.account || accountData;
                if (tempAvatarDataUrl) currentAccount.avatarDataUrl = tempAvatarDataUrl;
                else currentAccount.avatarDataUrl = accountData.avatarDataUrl;
                updateAccountUI();
                closeTab(id);
                showNotification(isNew ? (t('ui.account_created') || '账户创建成功') : (t('ui.account_updated') || '账户已更新'));
            } else {
                showAlert(t('ui.save_failed') + ': ' + result.error);
            }
        };

        const deleteBtn = content.querySelector('#account-btn-delete');
        if (deleteBtn) {
            deleteBtn.onclick = async () => {
                if (!currentAccount) return;
                if (!await showConfirm(t('ui.account_delete_confirm') || '确定要删除账户吗？此操作不可撤销。')) return;
                if (!await showConfirm(t('ui.account_delete_confirm_2') || '真的要删除吗？所有账户数据将被清除。')) return;
                weAPI.deleteAccount().then(result => {
                    if (result.success) {
                        currentAccount = null;
                        updateAccountUI();
                        closeTab(id);
                        showNotification(t('ui.account_deleted') || '账户已删除');
                    } else {
                        showAlert(t('ui.delete_failed') + ': ' + result.error);
                    }
                });
            };
        }
    }

    block.appendChild(content);
    root.appendChild(block);
    addTab(id, t('ui.define_world') || '定义世界', root, true);
    weLog.info('account', '← createAccountTab 完成');
}

// ========== 检查是否为调试模式（用于跳过初始化） ==========
function isInitDebugMode() {
    // 1. URL 参数 ?debug=1 或 ?skip-init=1
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('debug') === '1' || urlParams.get('skip-init') === '1') {
        return true;
    }
    // 2. localStorage 标志
    try {
        if (localStorage.getItem('we_init_debug') === '1') {
            return true;
        }
    } catch (e) {}
    // 3. Capacitor 调试模式
    if (window.Capacitor && window.Capacitor.Plugins) {
        try {
            const result = window.Capacitor.Plugins.Preferences?.get({ key: 'debug_mode' });
            if (result && result.value === 'true') {
                return true;
            }
        } catch (e) {}
    }
    return false;
}

// ========== 手机端：账户全屏覆盖模式（强制初始化） ==========
function createAccountFullScreen(wizard) {
    weLog.info('account', '→ createAccountFullScreen', { wizard: !!wizard });

    // 检查调试模式
    if (wizard && isInitDebugMode()) {
        weLog.info('account', '调试模式：跳过强制初始化');
        // 调试模式下自动创建一个临时账户
        currentAccount = {
            name: 'debug_user',
            displayName: 'Debug User',
            bio: '调试模式',
            avatarDataUrl: '',
            createdAt: new Date().toISOString()
        };
        updateAccountUI();
        return false;
    }

    // 移除已存在的全屏覆盖
    const existing = document.getElementById('account-fullscreen-overlay');
    if (existing) existing.remove();

    // 创建全屏覆盖容器
    const overlay = document.createElement('div');
    overlay.id = 'account-fullscreen-overlay';
    overlay.className = 'account-fullscreen-overlay';
    overlay.innerHTML = `
        <div class="afo-header">
            <div class="afo-icon">
                <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            </div>
            <div class="afo-title">${t('ui.define_world') || '定义世界'}</div>
            <div class="afo-subtitle">${t('ui.define_world_desc') || '请完成初始设置以开始使用'}</div>
        </div>
        <div class="afo-body">
            <div class="afo-scroll">
                <div class="afo-inner" id="account-fullscreen-content">
                    <!-- 账户内容将动态填充 -->
                </div>
            </div>
        </div>
        <div class="afo-error-container" id="afo-error-container" style="display:none;"></div>
    `;

    // 设置全屏覆盖样式
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        width: 100vw;
        height: 100vh;
        background: var(--bg-main, #1a1a2e);
        z-index: 99999;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    `;

    document.body.appendChild(overlay);

    // 强制隐藏所有其他 UI 元素
    document.body.classList.add('force-init-mode');

    mobileCurrentPage = 'account';

    // 设置错误捕获
    const errorContainer = overlay.querySelector('#afo-error-container');
    const showError = (msg) => {
        if (errorContainer) {
            errorContainer.style.display = 'block';
            errorContainer.innerHTML = `
                <div style="padding: 12px 16px; background: #ff444420; color: #ff6666; border-radius: 8px; margin: 12px; font-size: 13px; white-space: pre-wrap; word-break: break-all;">
                    <strong>初始化错误：</strong><br>${msg}
                </div>
            `;
        }
        weLog.error('account', '全屏初始化错误', msg);
    };

    // 捕获可能的初始化错误
    try {
        const contentContainer = overlay.querySelector('#account-fullscreen-content');
        if (!contentContainer) {
            throw new Error('内容容器创建失败');
        }

        // 创建关闭全屏覆盖的回调
        const closeFullScreen = () => {
            overlay.remove();
            document.body.classList.remove('force-init-mode');
            weLog.info('account', '全屏覆盖已移除');
            showNotification(t('ui.account_created') || '账户创建成功');
        };

        // 调用 buildAccountContent 构建内容（全屏覆盖模式）
        buildAccountContent(contentContainer, wizard, closeFullScreen);

        weLog.info('account', '← createAccountFullScreen 完成');
        return true;
    } catch (e) {
        const errMsg = e && e.stack ? e.stack : String(e);
        showError(errMsg);
        return false;
    }
}

// ========== 手机端：账户作为启程页子页面（非强制模式） ==========
function createAccountAsWelcomeSubPage(wizard) {
    weLog.info('account', '→ createAccountAsWelcomeSubPage', { wizard: !!wizard });

    // 如果是强制初始化模式，使用全屏覆盖
    if (wizard) {
        return createAccountFullScreen(wizard);
    }

    // 确保启程页标签存在
    if (!tabs['welcome']) {
        if (typeof openWelcomeTab === 'function') openWelcomeTab();
    }
    if (tabs['welcome']) {
        switchTab('welcome');
    }

    const welcomeTab = tabs['welcome'];
    if (!welcomeTab || !welcomeTab.element) {
        weLog.warn('account', 'createAccountAsWelcomeSubPage: 启程页不可用');
        return;
    }

    // 移除已存在的账户子页面
    const existing = welcomeTab.element.querySelector('.mobile-account-subpage');
    if (existing) existing.remove();

    // 创建子页面容器
    const subpage = document.createElement('div');
    subpage.className = 'mobile-account-subpage';
    subpage.innerHTML = `
        <div class="mnp-header">
            <button class="mnp-back-btn" title="返回">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span class="mnp-title">${t('ui.define_world') || '定义世界'}</span>
            <div class="mnp-spacer"></div>
        </div>
        <div class="mnp-body">
            <div class="mnp-scroll">
                <div class="mnp-inner" id="mobile-account-content">
                    <!-- 账户内容将动态填充 -->
                </div>
            </div>
        </div>
    `;

    welcomeTab.element.appendChild(subpage);
    subpage.style.display = 'flex';

    mobileCurrentPage = 'account';

    // 关闭子页面的函数
    const closeSubpage = () => {
        subpage.remove();
        mobileCurrentPage = 'welcome';
        if (typeof updateMobileHeaderForPage === 'function') {
            updateMobileHeaderForPage('welcome');
        }
        window._activeAccountSubpage = null;
        return true;
    };

    const backBtn = subpage.querySelector('.mnp-back-btn');
    if (backBtn) {
        backBtn.onclick = closeSubpage;
    }

    // 将子页面引用暴露出去
    window._activeAccountSubpage = {
        close: closeSubpage,
        isActive: () => !!welcomeTab.element.querySelector('.mobile-account-subpage'),
        isWizard: () => false,
    };

    // 调用 buildAccountContent 构建内容
    buildAccountContent(subpage.querySelector('#mobile-account-content'), wizard, closeSubpage);

    // 更新移动端状态
    if (typeof updateMobileHeaderForPage === 'function') {
        updateMobileHeaderForPage('welcome');
    }

    return true;
}

// ========== 构建账户内容（供子页面、标签页和全屏覆盖共用） ==========
function buildAccountContent(container, wizard, closeCallback) {
    if (!container) return;

    // 如果没有提供 closeCallback，创建一个默认的
    if (!closeCallback) {
        closeCallback = () => {
            // 检查是否在全屏覆盖模式
            const overlay = document.getElementById('account-fullscreen-overlay');
            if (overlay) {
                overlay.remove();
                document.body.classList.remove('force-init-mode');
                weLog.info('account', '全屏覆盖已移除');
            }
            // 检查是否在子页面模式
            const subpage = document.querySelector('.mobile-account-subpage');
            if (subpage) {
                subpage.remove();
                mobileCurrentPage = 'welcome';
                if (typeof updateMobileHeaderForPage === 'function') {
                    updateMobileHeaderForPage('welcome');
                }
                window._activeAccountSubpage = null;
            }
        };
    }

    const isNew = !currentAccount;
    const accountName = currentAccount?.name || '';
    const accountDisplayName = currentAccount?.displayName || '';
    const accountBio = currentAccount?.bio || '';
    const avatarDataUrl = currentAccount?.avatarDataUrl || '';
    weLog.info('account', 'buildAccountContent', { isNew, accountName, wizard: !!wizard });

    // Lucide earth SVG
    const EARTH_SVG = '<svg viewBox="0 0 24 24" width="96" height="96" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M21.54 15H17a2 2 0 0 0-2 2v4.54"/><path d="M7 3.34V5a3 3 0 0 0 3 3a2 2 0 0 1 2 2c0 1.1.9 2 2 2a2 2 0 0 0 2-2c0-1.1.9-2 2-2h3.17"/><path d="M11 21.95V18a2 2 0 0 0-2-2a2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2H2.05"/><circle cx="12" cy="12" r="10"/></svg>';

    function buildStepIndicator(currentStep) {
        return `
            <div class="wizard-steps">
                <span class="wizard-step ${currentStep === 1 ? 'active' : ''}">${t('ui.language') || '语言'}</span>
                <span class="wizard-step-sep">—</span>
                <span class="wizard-step ${currentStep === 2 ? 'active' : ''}">${t('ui.account') || '账户'}</span>
            </div>
        `;
    }

    if (wizard) {
        // 两步向导模式
        container.innerHTML = `
            <div class="account-page-wrapper">
                <div class="account-page-scroll">
                    <div class="wizard-step-header">
                        ${buildStepIndicator(1)}
                    </div>
                    <div class="wizard-step-body" id="wizard-step-1">
                        <div class="wizard-lang-icon">${EARTH_SVG}</div>
                        <div class="wizard-lang-field">
                            <label>${t('ui.language') || 'Language'}</label>
                            <select id="wizard-lang-select" class="wizard-lang-select">
                                <option value="en">English</option>
                                <option value="zh_CN">中文</option>
                                <option value="ja">日本語</option>
                                <option value="ru">Русский</option>
                            </select>
                        </div>
                    </div>
                    <div class="account-page-inner" id="wizard-step-2" style="display:none;">
                        ${buildStepIndicator(2)}
                        <h2>${t('ui.account_register') || '注册账户'}</h2>
                        <div class="account-page-avatar">
                            <div class="account-page-avatar-preview" id="account-avatar-preview">
                                <span>?</span>
                            </div>
                        </div>
                        <div class="account-page-form">
                            <div class="account-page-field">
                                <label>${t('ui.account_name') || '账户名称'} <span class="required">*</span></label>
                                <input type="text" id="account-name-input" placeholder="${t('ui.account_name_placeholder') || '请输入账户名称'}" maxlength="20" />
                                <p class="field-hint">${t('ui.account_name_hint') || '仅支持英文、数字、下划线、连字符'}</p>
                            </div>
                            <div class="account-page-field">
                                <label>${t('ui.display_name') || '显示名称'} <span class="optional">${t('ui.optional') || '可选'}</span></label>
                                <input type="text" id="account-display-input" placeholder="${t('ui.display_name_placeholder') || '请输入显示名称'}" maxlength="20" />
                            </div>
                            <div class="account-page-field">
                                <label>${t('ui.bio') || '简介'} <span class="optional">${t('ui.optional') || '可选'}</span></label>
                                <textarea id="account-bio-input" rows="3" placeholder="${t('ui.bio_placeholder') || '写一句个人签名…'}"></textarea>
                            </div>
                        </div>
                        <div class="wizard-footer wizard-footer-2" id="wizard-footer-2" style="display:none">
                            <button id="wizard-btn-back" class="btn-secondary">${t('ui.back') || '上一步'}</button>
                            <button id="account-btn-submit" class="btn-primary">${t('ui.confirm') || '确认'}</button>
                        </div>
                    </div>
                    <div class="wizard-footer wizard-footer-1" id="wizard-footer-1">
                        <button id="wizard-btn-next" class="btn-primary">${t('ui.next') || '下一步'}</button>
                    </div>
                </div>
            </div>
        `;
        // 绑定向导事件
        bindWizardEvents(container, closeCallback);
    } else {
        // 非向导模式
        container.innerHTML = `
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
                                <label>${t('ui.display_name') || '显示名称'} <span class="optional">${t('ui.optional') || '可选'}</span></label>
                                <input type="text" id="account-display-input" value="${accountDisplayName}" placeholder="${t('ui.display_name_placeholder') || '请输入显示名称'}" maxlength="20" />
                            </div>
                            <div class="account-page-field">
                                <label>${t('ui.bio') || '简介'} <span class="optional">${t('ui.optional') || '可选'}</span></label>
                                <textarea id="account-bio-input" rows="3" placeholder="${t('ui.bio_placeholder') || '写一句个人签名…'}">${accountBio}</textarea>
                            </div>
                        </div>
                        <div class="account-page-actions">
                            <button id="account-btn-save" class="btn-primary">${t('ui.save') || '保存'}</button>
                            ${!isNew ? `<button id="account-btn-delete" class="btn-danger">${t('ui.delete_account') || '删除账户'}</button>` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
        // 绑定非向导事件
        bindNonWizardEvents(container, closeSubpage);
    }
}

// ========== 绑定向导模式事件 ==========
function bindWizardEvents(container, closeSubpage) {
    // 语言选择
    const langSelect = container.querySelector('#wizard-lang-select');
    if (langSelect) {
        langSelect.addEventListener('change', async () => {
            const lang = langSelect.value;
            weLog.info('account', '语言切换', { lang });
            try {
                await weAPI.setLanguage(lang);
                if (typeof setLanguage === 'function') await setLanguage(lang);
                document.documentElement.lang = lang;
                // 刷新步骤1中的文字
                const step1Indicator = container.querySelector('.wizard-step-header .wizard-steps');
                if (step1Indicator) step1Indicator.outerHTML = buildStepIndicator(1);
                const langLabel = container.querySelector('.wizard-lang-field label');
                if (langLabel) langLabel.textContent = t('ui.language') || 'Language';
                const nextBtn = container.querySelector('#wizard-btn-next');
                if (nextBtn) nextBtn.textContent = t('ui.next') || '下一步';
            } catch (e) {
                weLog.error('account', 'createAccountTab: 语言切换失败', e && e.stack ? e.stack : String(e));
            }
        });
    }

    // 下一步 → 切换到步骤2
    const nextBtn = container.querySelector('#wizard-btn-next');
    if (nextBtn) {
        nextBtn.onclick = () => {
            container.querySelector('#wizard-step-header').style.display = 'none';
            container.querySelector('#wizard-step-1').style.display = 'none';
            container.querySelector('#wizard-step-2').style.display = '';
            container.querySelector('#wizard-footer-1').style.display = 'none';
            container.querySelector('#wizard-footer-2').style.display = '';
        };
    }

    // 上一步
    const backBtn = container.querySelector('#wizard-btn-back');
    if (backBtn) {
        backBtn.onclick = () => {
            container.querySelector('#wizard-step-header').style.display = '';
            container.querySelector('#wizard-step-1').style.display = '';
            container.querySelector('#wizard-step-2').style.display = 'none';
            container.querySelector('#wizard-footer-2').style.display = 'none';
            container.querySelector('#wizard-footer-1').style.display = '';
        };
    }

    // 头像上传
    let tempAvatarDataUrl = null;
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            tempAvatarDataUrl = ev.target.result;
            const preview = container.querySelector('#account-avatar-preview');
            if (preview) {
                preview.innerHTML = `<img src="${tempAvatarDataUrl}" alt="avatar" />`;
            }
        };
        reader.readAsDataURL(file);
    };
    const uploadBtn = container.querySelector('#account-btn-upload');
    if (uploadBtn) uploadBtn.onclick = () => fileInput.click();

    // 确认保存
    const submitBtn = container.querySelector('#account-btn-submit');
    if (submitBtn) {
        submitBtn.onclick = async () => {
            const name = container.querySelector('#account-name-input').value.trim();
            const displayName = container.querySelector('#account-display-input').value.trim();
            const bio = container.querySelector('#account-bio-input').value.trim();
            if (!name) {
                showNotification(t('ui.account_name_required') || '请输入账户名称');
                return;
            }
            if (name.length < 2) {
                showNotification(t('ui.account_name_too_short') || '账户名称至少2个字符');
                return;
            }
            const accountData = {
                name,
                displayName: displayName || name,
                bio,
                avatarDataUrl: tempAvatarDataUrl || generateInitialAvatar(name),
                createdAt: new Date().toISOString()
            };
            const result = await weAPI.saveAccount(accountData);
            if (result.success) {
                currentAccount = result.account || accountData;
                if (tempAvatarDataUrl) currentAccount.avatarDataUrl = tempAvatarDataUrl;
                else currentAccount.avatarDataUrl = accountData.avatarDataUrl;
                updateAccountUI();
                if (closeSubpage) closeSubpage();
                showNotification(t('ui.account_created') || '账户创建成功');
            } else {
                showAlert(t('ui.save_failed') + ': ' + result.error);
            }
        };
    }
}

// ========== 绑定非向导模式事件 ==========
function bindNonWizardEvents(container, closeSubpage) {
    let tempAvatarDataUrl = null;
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            tempAvatarDataUrl = ev.target.result;
            const preview = container.querySelector('#account-avatar-preview');
            if (preview) {
                preview.innerHTML = `<img src="${tempAvatarDataUrl}" alt="avatar" />`;
            }
        };
        reader.readAsDataURL(file);
    };

    const uploadBtn = container.querySelector('#account-btn-upload');
    if (uploadBtn) uploadBtn.onclick = () => fileInput.click();

    const removeBtn = container.querySelector('#account-btn-remove');
    if (removeBtn) removeBtn.onclick = () => {
        tempAvatarDataUrl = null;
        const preview = container.querySelector('#account-avatar-preview');
        if (preview) {
            const initial = generateInitialAvatar(currentAccount?.name || '?');
            preview.innerHTML = `<span>${initial}</span>`;
        }
    };

    const saveBtn = container.querySelector('#account-btn-save');
    if (saveBtn) {
        saveBtn.onclick = async () => {
            const name = container.querySelector('#account-name-input').value.trim();
            const displayName = container.querySelector('#account-display-input').value.trim();
            const bio = container.querySelector('#account-bio-input').value.trim();
            if (!name) {
                showNotification(t('ui.account_name_required') || '请输入账户名称');
                return;
            }
            const accountData = {
                name,
                displayName: displayName || name,
                bio,
                avatarDataUrl: tempAvatarDataUrl || currentAccount?.avatarDataUrl || generateInitialAvatar(name),
                updatedAt: new Date().toISOString()
            };
            const result = await weAPI.saveAccount(accountData);
            if (result.success) {
                currentAccount = result.account || accountData;
                if (tempAvatarDataUrl) currentAccount.avatarDataUrl = tempAvatarDataUrl;
                updateAccountUI();
                showNotification(t('ui.account_saved') || '账户已保存');
                if (closeSubpage) closeSubpage();
            } else {
                showAlert(t('ui.save_failed') + ': ' + result.error);
            }
        };
    }

    const deleteBtn = container.querySelector('#account-btn-delete');
    if (deleteBtn) {
        deleteBtn.onclick = async () => {
            if (!await showConfirm(t('ui.delete_account_confirm') || '确定删除账户吗？此操作不可撤销。')) return;
            const result = await weAPI.deleteAccount();
            if (result.success) {
                currentAccount = null;
                updateAccountUI();
                if (closeSubpage) closeSubpage();
                showNotification(t('ui.account_deleted') || '账户已删除');
            } else {
                showAlert(t('ui.delete_failed') + ': ' + result.error);
            }
        };
    }
}

// 暴露给外部使用
window.createAccountAsWelcomeSubPage = createAccountAsWelcomeSubPage;
window.buildAccountContent = buildAccountContent;
