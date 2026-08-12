// ====== editor/links.js — 跳转链接对话框与处理 ======
// 源文件: editor.js (行1382-1699)

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
    // 过滤出 .node.json 文件用于节点图卡片
    const nodeFiles = files.filter(f => f.endsWith('.node.json'));

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
                    <button class="link-type-btn" data-type="filecard">${t('ui.insert_file_card') || '插入文件链接'}</button>
                    <button class="link-type-btn" data-type="nodecard">${t('ui.insert_node_card') || '插入节点图链接'}</button>
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
                <div class="link-input-row" id="filecard-row" style="display:none">
                    <label>${t('ui.select_file') || '选择文件'}</label>
                    <select id="filecard-target-file">
                        <option value="">-- ${t('ui.select_file') || '选择文件'} --</option>
                        ${files.map(f => `<option value="${f}">${stripExt(f.split('/').pop())}</option>`).join('')}
                    </select>
                </div>
                <div class="link-input-row" id="nodecard-row" style="display:none">
                    <label>${t('ui.select_file') || '选择节点图'}</label>
                    <select id="nodecard-target-file">
                        <option value="">-- ${t('ui.select_file') || '选择节点图'} --</option>
                        ${nodeFiles.map(f => `<option value="${f}">${stripExt(f.split('/').pop().replace('.node.json', ''))}</option>`).join('')}
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
    const filecardRow = dialog.querySelector('#filecard-row');
    const nodecardRow = dialog.querySelector('#nodecard-row');
    const fileSelect = dialog.querySelector('#target-file');
    const headingSelect = dialog.querySelector('#target-heading');
    const filecardSelect = dialog.querySelector('#filecard-target-file');
    const nodecardSelect = dialog.querySelector('#nodecard-target-file');
    let currentType = 'url';

    function updateRows() {
        urlRow.style.display = 'none';
        fileRow.style.display = 'none';
        filecardRow.style.display = 'none';
        nodecardRow.style.display = 'none';
        if (currentType === 'url') urlRow.style.display = '';
        else if (currentType === 'file') fileRow.style.display = '';
        else if (currentType === 'filecard') filecardRow.style.display = '';
        else if (currentType === 'nodecard') nodecardRow.style.display = '';
    }

    typeBtns.forEach(btn => {
        btn.onclick = () => {
            typeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentType = btn.dataset.type;
            updateRows();
            // 切到文件模式时，自动选中当前文件并加载标题
            if (currentType === 'file') {
                const currentFile = project.currentFile;
                if (currentFile && files.includes(currentFile)) {
                    fileSelect.value = currentFile;
                    loadHeadingsForFile(dialog, project, currentFile, safeId);
                }
            }
            // 切到文件卡片模式时，自动选中当前文件
            if (currentType === 'filecard') {
                const currentFile = project.currentFile;
                if (currentFile && files.includes(currentFile)) {
                    filecardSelect.value = currentFile;
                }
            }
        };
    });

    fileSelect.onchange = () => {
        loadHeadingsForFile(dialog, project, fileSelect.value, safeId);
    };

    dialog.querySelector('.btn-cancel').onclick = () => dialog.remove();
    dialog.querySelector('.dialog-overlay').onclick = () => dialog.remove();

    dialog.querySelector('.btn-confirm').onclick = async () => {
        if (currentType === 'filecard') {
            const filename = filecardSelect.value;
            if (!filename) { showNotification(t('ui.select_file') || '请选择目标文件'); return; }
            weLog.info('editor', 'showJumpLinkDialog confirm: 插入文件链接卡片', { filename });
            const sel = quill.getSelection(true);
            const index = (sel && sel.index !== undefined) ? sel.index : quill.getLength();
            var filePayload = {
                file: filename,
                project: project.title || safeId,
                text: stripExt(filename.split('/').pop()),
                desc: ''
            };
            // 异步加载文件简介
            if (window.tagModule && typeof window.tagModule.getDesc === 'function') {
                try {
                    filePayload.desc = (await window.tagModule.getDesc(filename)) || '';
                } catch(e) {}
            }
            quill.insertEmbed(index, 'fileLinkCard', filePayload, Quill.sources.USER);
            quill.setSelection(index + 1, 0, Quill.sources.USER);
            dialog.remove();
            weLog.info('editor', '← showJumpLinkDialog 文件卡片完成');
            return;
        }

        if (currentType === 'nodecard') {
            const filename = nodecardSelect.value;
            if (!filename) { showNotification(t('ui.select_file') || '请选择节点图'); return; }
            weLog.info('editor', 'showJumpLinkDialog confirm: 插入节点图链接卡片', { filename });
            const sel = quill.getSelection(true);
            const index = (sel && sel.index !== undefined) ? sel.index : quill.getLength();
            var nodePayload = {
                file: filename,
                project: project.title || safeId,
                text: stripExt(filename.split('/').pop().replace('.node.json', '')),
                thumbnail: '',
                desc: ''
            };
            // 异步加载节点图数据生成缩略图
            try {
                const result = await weAPI.readFile(project.projectPath, filename);
                if (result.success && result.content) {
                    var ngData = JSON.parse(result.content);
                    if (typeof generateNodeGraphThumbnail === 'function') {
                        nodePayload.thumbnail = generateNodeGraphThumbnail(ngData, 200, 120);
                    }
                    nodePayload.desc = (ngData.properties && ngData.properties.description) || '';
                }
            } catch(e) {}
            quill.insertEmbed(index, 'nodeGraphCard', nodePayload, Quill.sources.USER);
            quill.setSelection(index + 1, 0, Quill.sources.USER);
            dialog.remove();
            weLog.info('editor', '← showJumpLinkDialog 节点图卡片完成');
            return;
        }

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
                // 节点图：跳转到目标节点（居中显示）
                if (data.targetNode && data.file.endsWith('.node.json')) {
                    setTimeout(function centerOnNode() {
                        try {
                            var inst = (typeof embeddedNodeGraphs !== 'undefined') ? embeddedNodeGraphs[safeId] : null;
                            if (!inst || !inst.engine) { setTimeout(centerOnNode, 200); return; }
                            var node = inst.engine.data.nodes.find(function (n) { return n.id === data.targetNode; });
                            if (!node) return;
                            var cx = node.x + (node.width || 80) / 2;
                            var cy = node.y + (node.height || 40) / 2;
                            var canvasEl = inst.engine.container;
                            if (canvasEl) {
                                inst.engine.data.viewport.tx = canvasEl.clientWidth / 2 - cx * inst.engine.zoom;
                                inst.engine.data.viewport.ty = canvasEl.clientHeight / 2 - cy * inst.engine.zoom;
                                inst.engine._renderAll();
                            }
                        } catch (e) {
                            weLog && weLog.warn('editor', 'handleJumpLinkClick: 居中节点失败', { targetNode: data.targetNode, error: e.message });
                        }
                    }, 300);
                    return;
                }
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