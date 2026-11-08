// ====== editor/toolbar.js — 编辑器工具栏 ======

function editorToolbar() {
    const toolbar = document.createElement('div');
    toolbar.className = 'ql-toolbar ql-snow editor-toolbar';
    toolbar.id = 'quill-toolbar';

    // 判断是否中文用户：看翻译结果里有没有汉字
    const _sample = t('ui.size_wuhao') || '';
    const isZh = /[\u4e00-\u9fff]/.test(_sample);

    // === 字号：WPS 风格两段式 ===
    // 汉字段（纯汉字显示，从大到小，实际 value 用 px）
    const CN_SIZES = isZh ? [
        ['56px',  t('ui.size_chuhao')  || '初号'],
        ['48px',  t('ui.size_xiaochu') || '小初'],
        ['35px',  t('ui.size_yihao')   || '一号'],
        ['32px',  t('ui.size_xiaoyi')  || '小一'],
        ['29px',  t('ui.size_erhao')   || '二号'],
        ['24px',  t('ui.size_xiaoer')  || '小二'],
        ['21px',  t('ui.size_sanhao')  || '三号'],
        ['20px',  t('ui.size_xiaosan') || '小三'],
        ['19px',  t('ui.size_sihao')   || '四号'],
        ['16px',  t('ui.size_xiaosi')  || '小四'],
        ['14px',  t('ui.size_wuhao')   || '五号'],
        ['12px',  t('ui.size_xiaowu')  || '小五'],
        ['10px',  t('ui.size_liuhao')  || '六号'],
        ['9px',   t('ui.size_xiaoliu') || '小六'],
        ['7px',   t('ui.size_qihao')   || '七号'],
    ] : [];

    // pt 数字段（WPS 风格：显示纯数字 pt 值，5-72）
    // pt→px 换算: px = pt * 4/3
    // WPS 里数字段完整列出所有 pt，不过滤与汉字段重复的
    const PT_NUMBERS = [5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 60, 72];
    const PT_SIZES = PT_NUMBERS.map(pt => {
        const px = Math.round(pt * 4 / 3);
        return [px + 'px', String(pt)];
    });

    // 合并输出
    let sizeOptions = CN_SIZES.map(s => `<option value="${s[0]}">${s[1]}</option>`).join('');
    if (CN_SIZES.length > 0 && PT_SIZES.length > 0) {
        sizeOptions += `<option disabled>──</option>`;
    }
    PT_SIZES.forEach(s => {
        sizeOptions += `<option value="${s[0]}">${s[1]}</option>`;
    });
    // 默认值：14px 五号
    sizeOptions = sizeOptions.replace('value="14px"', 'value="14px" selected');

    toolbar.innerHTML = `
        <span class="ql-formats">
            <select class="ql-header">
                <option value="false" selected>${t('ui.heading_normal') || '正文'}</option>
                <option value="1">${t('ui.heading1') || '标题 1'}</option>
                <option value="2">${t('ui.heading2') || '标题 2'}</option>
                <option value="3">${t('ui.heading3') || '标题 3'}</option>
                <option value="4">${t('ui.heading4') || '标题 4'}</option>
                <option value="5">${t('ui.heading5') || '标题 5'}</option>
                <option value="6">${t('ui.heading6') || '标题 6'}</option>
            </select>
        </span>
        <span class="ql-formats">
            <select class="ql-font">
                <option value="false" selected>${t('ui.font_default') || '默认'}</option>
                <option value="sans-serif">Sans Serif</option>
                <option value="'Microsoft YaHei', 'PingFang SC', sans-serif">${t('ui.font_yahai') || '微软雅黑'}</option>
                <option value="'Source Han Sans SC', 'Noto Sans SC', sans-serif">${t('ui.font_source_han') || '思源黑体'}</option>
                <option value="SimSun, '宋体', serif">${t('ui.font_simsun') || '宋体'}</option>
                <option value="SimHei, '黑体', sans-serif">${t('ui.font_simhei') || '黑体'}</option>
                <option value="KaiTi, '楷体', serif">${t('ui.font_kaiti') || '楷体'}</option>
                <option value="FangSong, '仿宋', serif">${t('ui.font_fangsong') || '仿宋'}</option>
                <option value="serif">Serif</option>
                <option value="monospace">Monospace</option>
            </select>
        </span>
        <span class="ql-formats">
            <select class="ql-size">${sizeOptions}</select>
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
            <button class="ql-indent" value="-1" title="${t('ui.outdent') || 'Outdent'}"></button>
            <button class="ql-indent" value="+1" title="${t('ui.indent') || 'Indent'}"></button>
        </span>
        <span class="ql-formats">
            <button class="ql-blockquote" title="${t('ui.quote') || 'Quote'}"></button>
            <button class="ql-code-block" title="${t('ui.code_block') || 'Code Block'}"></button>
        </span>
        <span class="ql-formats">
            <select class="ql-align" title="${t('ui.align') || 'Alignment'}"></select>
        </span>
        <span class="ql-formats">
            <button class="ql-link" title="${t('ui.link') || 'Link'}"></button>
            <button class="ql-clean" title="${t('ui.clean') || 'Clear Format'}"></button>
        </span>
        <span class="ql-formats last-format">
            <button class="custom-btn btn-insert-card" title="${t('ui.insert_card') || 'Insert Card'}">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
            </button>
        </span>
        <span class="editor-actions">
            <button class="custom-btn btn-history" title="${t('ui.ng_history') || 'History (Ctrl+H)'}">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/></svg>
            </button>
            <button class="custom-btn btn-export-md" title="${t('ui.export') || 'Export'}">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </button>
            <button class="custom-btn btn-toggle-toc" title="${t('ui.toggle_toc') || 'Table of Contents'}">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="12" y2="18"/><circle cx="17" cy="18" r="3"/><path d="M16 18l1 1 2-2"/></svg>
            </button>
        </span>
    `;
    return toolbar;
}
