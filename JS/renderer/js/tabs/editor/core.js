// ====== editor/core.js — 核心编辑器操作 ======
// 源文件: editor.js (行762-1135 + 行2584-2782)

async function openProjectFile(safeId, filename) {
    weLog.info('editor', '→ openProjectFile 开始', { safeId, filename });
    const project = tabs[safeId];
    if (!project) {
        weLog.warn('editor', 'openProjectFile: project 不存在', { safeId });
        return;
    }
    // 点击文件即切完整 TA（从目录独占进入正式编辑模式），即使后续加载失败也保留 TA
    if (window.setTaState) window.setTaState(safeId, 'ta');
    // 【全局撤回：文件切换 step】记录 oldFile，等两个分支（嵌入 or 富文本/md）成功后各调用 commit
    const oldFile = project.currentFile || null;

    // === 节点图文件：在右侧嵌入节点图编辑区 ===
    if (filename.endsWith('.node.json')) {
        weLog.info('editor', 'openProjectFile: 检测到节点图文件，走嵌入分支', { filename });
        await openEmbeddedNodeGraph(safeId, filename);
        _commitFileSwitchOp(safeId, oldFile, filename);
        return;
    }

    // === 普通文本文件：隐藏节点图，显示 Quill ===
    const embedEl = document.getElementById(`ng-embed-${safeId}`);
    const quillWrapper = document.getElementById(`quill-${safeId}`);
    if (embedEl) embedEl.style.display = 'none';
    if (quillWrapper) quillWrapper.style.display = '';
    // 清理已嵌入的节点图实例（暂存脏状态后释放）
    if (embeddedNodeGraphs[safeId]) {
        weLog.debug('editor', 'openProjectFile: 销毁前一个嵌入节点图', { prevFile: embeddedNodeGraphs[safeId].graphFile });
        destroyEmbeddedNodeGraph(safeId);
    }

    // 清除旧的 TOC 面板（可能在其他标签页中）
    if (tocPanel) {
        weLog.debug('editor', 'openProjectFile: 清理旧 TOC 面板');
        tocPanel.remove();
        tocPanel = null;
    }

    // 清理旧的 Markdown 编辑器前暂存未保存内容
    if (markdownEditor) {
        // 【防御】project.currentFile 必须不是 .node.json，防止 key 串到节点图缓存上
        if (project.currentFile && project.currentFile !== filename && project.dirty
            && !project.currentFile.endsWith('.node.json')) {
            weLog.info('editor', 'openProjectFile: 暂存 Markdown 未保存内容', { prevFile: project.currentFile });
            project.fileCache = project.fileCache || {};
            project.fileCache[project.currentFile] = _fcWrap('md', markdownEditor.value);
        }
        markdownEditor = null;
    }

    // 清理旧的 Quill
    if (quill && project.projectMode !== 'markdown') {
        // 保存当前文件
    }

    const projectMode = project.projectMode || 'rich';
    weLog.info('editor', 'openProjectFile: 项目模式', { projectMode });

    if (projectMode === 'markdown') {
        weLog.info('editor', 'openProjectFile: 走了 Markdown 模式分支');
        await openMarkdownFile(safeId, filename);
        _commitFileSwitchOp(safeId, oldFile, filename);
        return;
    }

    // 富文本模式继续原有逻辑
    if (projectMode !== 'markdown') {
        // 暂存当前文件的未保存内容
        // 【防御】project.currentFile 必须不是 .node.json（上一次可能是在编辑节点图，然后切另一个 README，
        //    此时 quill 是旧实例、project.dirty=true、currentFile=节点图文件名 → 三个条件都满足会把 Quill HTML
        //    写进 fileCache[节点图文件名]，直接覆盖 destroyEmbeddedNodeGraph 刚写好的节点图 JSON，导致
        //    下次切回来 JSON.parse 失败渲染空画布）。
        if (project.currentFile && project.currentFile !== filename && project.dirty && quill
            && !project.currentFile.endsWith('.node.json')) {
            weLog.info('editor', 'openProjectFile: 暂存 Quill 未保存内容', { prevFile: project.currentFile });
            project.fileCache = project.fileCache || {};
            project.fileCache[project.currentFile] = _fcWrap('quill', quill.root.innerHTML);
        }
    }

    // 优先使用缓存的未保存内容，否则从磁盘读取
    let content;
    let fromCache = false;
    if (project.fileCache) {
        // 先按 quill 类型解包（类型不匹配返回 undefined，然后 fallback 再按 text 解一次兼容纯文本旧缓存）
        let cached = _fcUnwrap('quill', project.fileCache[filename]);
        if (cached === undefined) cached = _fcUnwrap('text', project.fileCache[filename]);
        if (cached !== undefined) {
            weLog.info('editor', 'openProjectFile: 从缓存读取内容', { filename });
            content = cached;
            fromCache = true;
        }
    }
    if (!fromCache) {
        weLog.info('editor', 'openProjectFile: 从磁盘读取文件', { filename });
        const result = await weAPI.readFile(project.projectPath, filename);
        if (!result.success) {
            weLog.error('editor', 'openProjectFile: 读取文件失败', { filename, error: result.error });
            showNotification(t('ui.read_failed') + ': ' + result.error);
            return;
        }
        content = result.content;
    }

    if (!quillWrapper) {
        weLog.warn('editor', 'openProjectFile: quillWrapper 元素不存在', { safeId });
        return;
    }

    if (!quill) {
        weLog.info('editor', 'openProjectFile: 首次初始化 Quill 实例');
        quillWrapper.innerHTML = '';
        const toolbarEl = editorToolbar();
        quillWrapper.appendChild(toolbarEl);

        const editorDiv = document.createElement('div');
        editorDiv.id = 'quill-editor';
        quillWrapper.appendChild(editorDiv);

        quill = new Quill(editorDiv, {
            theme: 'snow',
            modules: {
                toolbar: {
                    container: toolbarEl,
                }
            },
            placeholder: t('ui.start_writing') || 'Compose an epic...',
        });

        // 占位符：用户首次交互后永久隐藏
        let placeholderHidden = false;
        const origQuillUpdate = quill.update.bind(quill);
        quill.update = function(source) {
            const result = origQuillUpdate(source);
            if (placeholderHidden) {
                this.root.classList.remove('ql-blank');
            }
            return result;
        };
        function hidePlaceholder() {
            if (placeholderHidden) return;
            placeholderHidden = true;
            quill.root.classList.remove('ql-blank');
        }
        quill.root.addEventListener('mousedown', hidePlaceholder);
        quill.root.addEventListener('keydown', hidePlaceholder);
        // 智能括号/引号自动补全
        quill.root.addEventListener('keydown', handleSmartBrackets);

        // 点击空白区域：光标定位到最近行
        editorDiv.addEventListener('click', (e) => {
            // 空编辑器：点击任何位置都聚焦并定位光标
            if (quill.root.classList.contains('ql-blank') || quill.getText().trim() === '') {
                quill.focus();
                quill.setSelection(0, 0, Quill.sources.USER);
                hidePlaceholder();
                return;
            }

            // 只处理编辑器空白区域的点击（非文本节点）
            if (e.target !== editorDiv && e.target !== quill.root) return;
            const y = e.clientY;

            // 遍历所有块级元素，找到最近的行
            const blocks = quill.root.children;
            let nearestIndex = null;
            let nearestDist = Infinity;

            for (let i = 0; i < blocks.length; i++) {
                const blockRect = blocks[i].getBoundingClientRect();
                if (y >= blockRect.top && y <= blockRect.bottom) {
                    const midY = blockRect.top + blockRect.height / 2;
                    const dist = Math.abs(y - midY);
                    if (dist < nearestDist) { nearestDist = dist; nearestIndex = i; }
                }
                if (y > blockRect.bottom) {
                    const dist = y - blockRect.bottom;
                    if (dist < nearestDist) { nearestDist = dist; nearestIndex = i; }
                }
                if (y < blockRect.top && i > 0) {
                    const dist = blockRect.top - y;
                    if (dist < nearestDist) { nearestDist = dist; nearestIndex = i - 1; }
                }
            }

            if (nearestIndex !== null) {
                const block = blocks[nearestIndex];
                const blot = Quill.find(block);
                if (blot) {
                    const offset = blot.offset(quill.scroll);
                    const blockRect = block.getBoundingClientRect();
                    if (y > blockRect.bottom - blockRect.height / 2) {
                        quill.setSelection(offset + blot.length() - 1, 0, Quill.sources.USER);
                    } else {
                        quill.setSelection(offset, 0, Quill.sources.USER);
                    }
                }
            }
        });

        const exportBtn = toolbarEl.querySelector('.btn-export-md');
        if (exportBtn) exportBtn.onclick = () => showExportMenu(exportBtn);
        const tocBtn = toolbarEl.querySelector('.btn-toggle-toc');
        if (tocBtn) tocBtn.onclick = toggleTableOfContents;
        const insertCardBtn = toolbarEl.querySelector('.btn-insert-card');
        if (insertCardBtn) insertCardBtn.onclick = () => showInsertCardDialog(safeId);
        const histBtn = toolbarEl.querySelector('.btn-history');
        if (histBtn) histBtn.onclick = () => toggleHistoryPanel(safeId);
        // 图片卡片按钮使用委托事件（注册在全局模块底部，避免 inside if(!quill) 未执行）

        quill.on('text-change', updateEditorStats);
        quill.root.style.fontFamily = savedFontFamily;
        quill.root.style.fontSize = savedFontSize + 'px';
        currentQuillProjectId = safeId;
        weLog.info('editor', 'openProjectFile: Quill 初始化完成');
    } else {
        weLog.debug('editor', 'openProjectFile: 复用已有 Quill 实例');
        const toolbar = quill.container.previousElementSibling;
        const editor = quill.container;
        if (editor.parentElement !== quillWrapper) {
            if (toolbar && toolbar.classList.contains('ql-toolbar')) {
                quillWrapper.appendChild(toolbar);
            }
            quillWrapper.appendChild(editor);
        }
        if (toolbar && toolbar.classList.contains('ql-toolbar')) {
            toolbar.style.display = '';
        }
        editor.style.display = '';
        currentQuillProjectId = safeId;
    }

    // 全局链接点击处理（document级别，捕获所有链接点击，只注册一次）
    if (!window._globalLinkHandler) {
        weLog.info('editor', 'openProjectFile: 注册全局链接点击处理器');
        window._globalLinkHandler = true;
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (!link) return;
            const href = link.getAttribute('href') || '';

            // 项目内跳转链接
            if (link.classList.contains('jump-link') || link.hasAttribute('data-jump')) {
                e.preventDefault();
                e.stopPropagation();
                let data = {};
                const jumpAttr = link.getAttribute('data-jump');
                if (jumpAttr) {
                    try { data = JSON.parse(jumpAttr); } catch {
                        weLog.warn('editor', 'openProjectFile 全局点击: data-jump 解析失败', { jumpAttr });
                    }
                } else if (href.startsWith('project:')) {
                    // Markdown 预览链接格式：project:filename#heading
                    const rest = href.substring('project:'.length);
                    const [file, heading] = rest.split('#');
                    data = { file: decodeURIComponent(file || ''), heading: heading || '' };
                }
                handleJumpLinkClick(data);
                return;
            }

            // 外部链接：在系统浏览器中打开
            if (href && (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:') || href.startsWith('tel:'))) {
                e.preventDefault();
                e.stopPropagation();
                weAPI.openExternalLink(href);
                return;
            }
        }, true);
    }

    // ======== 0.7.0_alpha 全局撤回/重做 + 模式切换 快捷键（document 级，只注册一次）========
    if (!window._globalShortcutRegistered) {
        window._globalShortcutRegistered = true;
        document.addEventListener('keydown', (e) => {
            const mod = e.ctrlKey || e.metaKey;     // Ctrl 或 ⌘
            if (!mod) return;
            const key = e.key.toLowerCase();
            let action = null;
            if (key === 'z' && !e.shiftKey) action = 'undo';
            else if ((key === 'z' && e.shiftKey) || key === 'y') action = 'redo';
            else if (key === 'u') action = 'toggleUndoMode';   // Ctrl+U 切换局部/全局
            else if (key === 'h') action = 'toggleHistoryPanel'; // Ctrl+H 历史/撤回面板
            if (!action) return;
            e.preventDefault();
            e.stopPropagation();
            if (action === 'toggleUndoMode') {
                if (typeof activeTabId !== 'undefined' && activeTabId && typeof ensureGlobalUndo === 'function') {
                    const gu = ensureGlobalUndo(activeTabId);
                    if (gu) gu.setMode(gu.mode === 'global' ? 'local' : 'global');
                }
                return;
            }
            if (action === 'toggleHistoryPanel') {
                if (typeof activeTabId !== 'undefined' && activeTabId && typeof toggleHistoryPanel === 'function') {
                    toggleHistoryPanel(activeTabId);
                }
                return;
            }
            if (typeof handleEditAction === 'function') handleEditAction(action);
        }, true);

        // Esc：关闭弹出的历史面板
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && _historyPanelVisible) {
                hideHistoryPanel();
            }
        });
    }

    quill.root.innerHTML = '';
    // 检测内容类型：HTML 还是纯文本
    const isHtml = /<[a-z][\s\S]*>/i.test(content);
    if (isHtml) {
        weLog.info('editor', 'openProjectFile: 内容为 HTML，使用 dangerouslyPasteHTML', { contentLen: content.length });
        // HTML 内容：通过 Quill clipboard 解析为正确的 Delta blocks
        quill.clipboard.dangerouslyPasteHTML(0, content, Quill.sources.SILENT);
    } else {
        weLog.info('editor', 'openProjectFile: 内容为纯文本，使用 setText', { contentLen: content.length });
        // 纯文本：setText 会将 \n 正确转为独立的 block
        quill.setText(content, Quill.sources.SILENT);
    }
    if (savedFontFamily) quill.root.style.fontFamily = savedFontFamily;
    if (savedFontSize) quill.root.style.fontSize = savedFontSize + 'px';

    // 应用工具栏显示与字数统计设置
    const tb = document.getElementById('quill-toolbar');
    if (tb && typeof toolbarShow !== 'undefined') tb.style.display = toolbarShow === false ? 'none' : '';
    const wc = document.getElementById('word-count');
    if (wc && typeof wordCountShow !== 'undefined') wc.style.display = wordCountShow === false ? 'none' : '';

    project.currentFile = filename;
    project.dirty = fromCache;
    project.savedContent = fromCache ? content : content;
    updateStatusBar();
    updateEditorStats();

    // 确保编辑器获得焦点，使键盘事件（如 Backspace）正常工作
    setTimeout(function () { quill && quill.focus(); }, 200);

    // 加载内容后刷新节点图卡片缩略图（确保始终显示最新数据）
    if (typeof refreshNodeGraphThumbnails === 'function') {
        // 延迟执行，等待 Quill 渲染完成
        setTimeout(function () { refreshNodeGraphThumbnails(safeId); }, 100);
    }

    // ====== GlobalUndoManager 接入：Quill ======
    // 维护上一次 HTML 快照；只在 user 变更时 push；suppress>0 时跳过
    ensureGlobalUndo(safeId);  // lazy init
    if (project._quillLastHtml === undefined) project._quillLastHtml = null;
    // 用 AFTER text-change 的时候取最新 HTML
    quill.off('text-change', project._changeHandler);
    quill.off('text-change', project._globalQuillHandler);
    project._changeHandler = () => { project.dirty = true; updateStatusBar(); debouncedUpdateEditorStats(); };
    project._globalQuillHandler = (delta, oldDelta, source) => {
        const gu = project.globalUndo;
        if (!gu) return;
        if (source !== 'user') return;               // 程序/初始化改动不入栈
        if (gu.suppress > 0) return;                 // undo/redo 触发的 change 不入栈
        const prev = project._quillLastHtml;
        const next = quill.root.innerHTML;
        if (prev === next) return;                   // 无变化跳过
        gu.push({
            type: 'quill',
            file: project.currentFile || filename,
            label: '编辑文本',
            prev: prev == null ? '' : prev,
            next: next,
        });
        project._quillLastHtml = next;
    };
    quill.on('text-change', project._changeHandler);
    quill.on('text-change', project._globalQuillHandler);
    // 初始快照（确保第一次 undo 时有 prev 可用）
    project._quillLastHtml = quill.root.innerHTML;

    const tree = document.getElementById(`file-tree-${safeId}`);
    tree?.querySelectorAll('.tree-file').forEach(el => el.classList.remove('active'));
    tree?.querySelector(`[data-file="${filename}"]`)?.classList.add('active');
    // 【全局撤回：文件切换 step】富文本/Markdown 分支尾部 commit
    _commitFileSwitchOp(safeId, oldFile, filename);
    weLog.info('editor', '← openProjectFile 完成', { filename, fromCache });
}

async function saveCurrentFile(silent) {
    weLog.info('editor', '→ saveCurrentFile 开始', { silent, isSaving });
    if (isSaving) {
        weLog.info('editor', 'saveCurrentFile: 已在保存中，标记 pendingSave');
        pendingSave = true;
        return;
    }

    const project = tabs[activeTabId];
    if (!project || !project.currentFile) {
        weLog.warn('editor', 'saveCurrentFile: project 或 currentFile 不存在');
        return;
    }

    isSaving = true;
    pendingSave = false;

    // 独立节点图标签页（非嵌入式）
    if (activeTabId && activeTabId.startsWith('nodegraph-') && typeof nodeGraphInstances !== 'undefined' && nodeGraphInstances[activeTabId]) {
        weLog.info('editor', 'saveCurrentFile: 走独立节点图保存分支', { tabId: activeTabId });
        try {
            if (typeof saveNodeGraph === 'function') await saveNodeGraph(activeTabId);
        } catch (e) {
            weLog.error('editor', 'saveCurrentFile: 独立节点图保存异常', e && e.stack ? e.stack : String(e));
        } finally {
            isSaving = false;
            if (pendingSave) { setTimeout(() => { pendingSave = false; saveCurrentFile(silent); }, 0); }
        }
        return;
    }

    // 嵌入节点图：走节点图保存逻辑
    if (embeddedNodeGraphs[activeTabId] && project.currentFile.endsWith('.node.json')) {
        weLog.info('editor', 'saveCurrentFile: 走嵌入节点图保存分支', { file: project.currentFile });
        try {
            const inst = embeddedNodeGraphs[activeTabId];
            // 保存前确保 ID 唯一，防止因多次保存累积重复 ID
            inst.engine._dedupeIds();
            const data = inst.engine.getData();
            const content = JSON.stringify(data, null, 2);
            showNotification(t('ui.saving') || '正在保存...', 0);
            const res = await weAPI.saveFile(project.projectPath, project.currentFile, content);
            if (res.success) {
                inst.dirty = false;
                project.dirty = false;
                // 【修复切回内容消失 #7】保存成功后双 key 清理缓存（完整路径 + basename）
                // 不然下次切回来如果 basename key 还在，fromCache=true 会误标 dirty，给用户"未保存"假象
                if (project.fileCache) {
                    const cf = project.currentFile;
                    delete project.fileCache[cf];
                    if (cf.includes('/') || cf.includes('\\')) {
                        delete project.fileCache[cf.split(/[\\/]/).pop()];
                    }
                }
                const status = document.getElementById(`ng-status-${activeTabId}`);
                if (status) status.textContent = '';
                updateStatusBar();
                showNotification(t('ui.saved') || '已保存');
            } else {
                showNotification((t('ui.save_failed') || '保存失败') + ': ' + res.error);
            }
        } catch (e) {
            weLog.error('editor', 'saveCurrentFile: 节点图保存异常', e && e.stack ? e.stack : String(e));
            showNotification((t('ui.save_failed') || '保存失败') + ': ' + e.message);
        } finally {
            isSaving = false;
            if (pendingSave) { setTimeout(() => { pendingSave = false; saveCurrentFile(silent); }, 0); }
        }
        return;
    }

    const projectMode = project.projectMode || 'rich';
    let content;
    if (projectMode === 'markdown') {
        if (!markdownEditor) {
            weLog.warn('editor', 'saveCurrentFile: markdownEditor 不存在');
            isSaving = false;
            return;
        }
        content = markdownEditor.value;
    } else {
        if (!quill) {
            weLog.warn('editor', 'saveCurrentFile: quill 不存在');
            isSaving = false;
            return;
        }
        content = quill.root.innerHTML;
    }
    weLog.info('editor', 'saveCurrentFile: 准备保存', { projectMode, file: project.currentFile, contentLen: content.length });

    // 通知用户正在保存（持久显示，直到保存完成）
    showNotification(t('ui.saving') || '正在保存...', 0);

    try {
        const res = await weAPI.saveFile(project.projectPath, project.currentFile, content);
        if (res.success) {
            weLog.info('editor', '← saveCurrentFile 完成: 保存成功');
            project.dirty = false;
            project.savedContent = content;
            if (project.fileCache) {
                delete project.fileCache[project.currentFile];
            }
            updateStatusBar();
            showNotification(t('ui.saved') || '已保存');
        } else {
            weLog.error('editor', 'saveCurrentFile: 保存失败', { error: res.error });
            showNotification((t('ui.save_failed') || '保存失败') + ': ' + res.error);
        }
    } catch (e) {
        weLog.error('editor', 'saveCurrentFile 失败', e && e.stack ? e.stack : String(e));
        showNotification((t('ui.save_failed') || '保存失败') + ': ' + e.message);
    } finally {
        isSaving = false;
        // 如果保存期间有新的保存请求，立即再执行一次
        if (pendingSave) {
            weLog.info('editor', 'saveCurrentFile: 检测到 pendingSave，递归再保存一次');
            pendingSave = false;
            saveCurrentFile(silent);
        }
    }
}

async function addFileToProject(safeId) {
    weLog.info('editor', '→ addFileToProject 开始', { safeId });
    const project = tabs[safeId];
    if (!project) {
        weLog.warn('editor', 'addFileToProject: project 不存在', { safeId });
        return;
    }
    const result = await showPrompt(t('ui.new_item') || '新建', t('ui.file_name') || '文件名', { typeSwitch: true, defaultType: 'file' });
    if (!result) {
        weLog.debug('editor', 'addFileToProject: 用户取消输入');
        return;
    }
    const name = result.value;
    if (!name) {
        weLog.debug('editor', 'addFileToProject: 文件名为空');
        return;
    }
    weLog.info('editor', 'addFileToProject: 用户输入', { name, type: result.type });

    if (result.type === 'folder') {
        weLog.info('editor', 'addFileToProject: 走了创建文件夹分支', { name });
        const res = await weAPI.addFolder(project.projectPath, name);
        if (res.success) {
            const updated = await weAPI.openProject(project.projectPath);
            if (updated.success) {
                project.fileList = updated.fileList;
                refreshFileTree(safeId, updated.fileList);
            }
            showNotification(t('ui.folder_created') || '文件夹已创建');
        } else {
            weLog.error('editor', 'addFileToProject: 创建文件夹失败', { error: res.error });
            showNotification((t('ui.create_failed') || '创建失败') + ': ' + res.error);
        }
    } else if (result.type === 'nodegraph') {
        weLog.info('editor', 'addFileToProject: 走了创建节点图分支', { name });
        // 自动补全后缀（如果用户未加）
        let graphFileName = name.trim();
        if (!graphFileName.endsWith('.node.json')) {
            // 如果已经以 .json 结尾但不以 .node.json 结尾则替换，否则追加
            if (graphFileName.endsWith('.json')) {
                graphFileName = graphFileName.replace(/\.json$/, '.node.json');
            } else {
                graphFileName = graphFileName + '.node.json';
            }
        }
        // 创建空节点图文件（空 JSON：nodes+edges）
        const emptyJson = JSON.stringify({ nodes: [], edges: [] }, null, 2);
        const createRes = await weAPI.saveFile(project.projectPath, graphFileName, emptyJson);
        if (createRes.success) {
            const updated = await weAPI.openProject(project.projectPath);
            if (updated.success) {
                project.fileList = updated.fileList;
                refreshFileTree(safeId, updated.fileList);
            }
            showNotification(t('ui.nodegraph_created') || '节点图已创建');
            // 立即在右侧编辑区打开
            openProjectFile(safeId, graphFileName);
        } else {
            weLog.error('editor', 'addFileToProject: 创建节点图文件失败', { error: createRes.error });
            showNotification((t('ui.create_failed') || '创建失败') + ': ' + createRes.error);
        }
    } else {
        weLog.info('editor', 'addFileToProject: 走了创建文件分支', { name });
        const res = await weAPI.addFile(project.projectPath, name);
        if (res.success) {
            const updated = await weAPI.openProject(project.projectPath);
            if (updated.success) {
                project.fileList = updated.fileList;
                refreshFileTree(safeId, updated.fileList);
            }
            openProjectFile(safeId, name);
        } else {
            weLog.error('editor', 'addFileToProject: 添加文件失败', { error: res.error });
            showNotification((t('ui.add_failed') || '添加失败') + ': ' + res.error);
        }
    }
    weLog.info('editor', '← addFileToProject 完成');
}

// ================================================================
// 图片卡片辅助函数
// ================================================================

// 插入图片卡片（供 btn-image-card 委托事件调用）
function quillInsertImageCard(url) {
    try {
        var sel = quill.getSelection(true);
        var idx = (sel && sel.index !== undefined) ? sel.index : quill.getLength();
        quill.insertEmbed(idx, 'imageCard', { src: url, width: '', height: '', objectFit: 'contain' }, Quill.sources.USER);
        quill.setSelection(idx + 1, 0, Quill.sources.USER);
    } catch (e) {
        console.warn('[core] quillInsertImageCard 失败:', e);
    }
}

// ================================================================
// 图片卡片选择 / 缩放 / 内容缩放工具栏
// ================================================================

var _selectedImageCard = null;  // 当前选中的图片卡片 DOM
var _imageFitToolbar = null;    // 浮动工具栏 DOM
var _imageResizing = false;     // 是否正在拖拽缩放

// 创建或获取浮动工具栏
function _getImageFitToolbar() {
    if (!_imageFitToolbar) {
        _imageFitToolbar = document.createElement('div');
        _imageFitToolbar.className = 'ql-image-fit-toolbar';
        _imageFitToolbar.innerHTML =
            '<button data-fit="cover">' + (t('ui.img_fit_cover') || '铺满') + '</button>' +
            '<button data-fit="contain">' + (t('ui.img_fit_contain') || '适应') + '</button>' +
            '<button data-fit="fill">' + (t('ui.img_fit_fill') || '拉伸') + '</button>' +
            '<button data-fit="none">' + (t('ui.img_fit_none') || '原尺寸') + '</button>';
        document.body.appendChild(_imageFitToolbar);

        // 点击 fit 选项
        _imageFitToolbar.addEventListener('click', function (e) {
            var btn = e.target.closest('button');
            if (!btn || !_selectedImageCard) return;
            var fit = btn.getAttribute('data-fit');
            if (!fit) return;
            _applyImageFit(_selectedImageCard, fit);
        });
    }
    return _imageFitToolbar;
}

// 应用 object-fit 到图片卡片
function _applyImageFit(card, fit) {
    if (!card) return;
    var wrapper = card.querySelector('.ql-image-card-wrapper');
    var img = wrapper && wrapper.querySelector('img');
    if (!img || !wrapper) return;
    img.style.objectFit = fit;
    wrapper.setAttribute('data-object-fit', fit);
    // 更新工具栏激活状态
    var tb = _getImageFitToolbar();
    tb.querySelectorAll('button').forEach(function (b) {
        b.classList.toggle('ql-image-fit-active', b.getAttribute('data-fit') === fit);
    });
}

// 选中图片卡片
function _selectImageCard(card) {
    // 取消旧选中
    if (_selectedImageCard && _selectedImageCard !== card) {
        _selectedImageCard.classList.remove('ql-image-card-selected');
    }
    _selectedImageCard = card;
    if (card) {
        card.classList.add('ql-image-card-selected');
        // 显示浮动工具栏（先显示才能获取 offsetWidth）
        var tb = _getImageFitToolbar();
        tb.classList.add('ql-image-fit-toolbar-visible');
        var wrapper = card.querySelector('.ql-image-card-wrapper');
        var fit = wrapper ? wrapper.getAttribute('data-object-fit') || 'contain' : 'contain';
        _applyImageFit(card, fit);
        // 定位工具栏到卡片上方，实时居中
        var rect = card.getBoundingClientRect();
        var tbW = tb.offsetWidth || 180; // fallback 宽度
        tb.style.top = (rect.top - 44) + 'px';
        tb.style.left = Math.max(8, (window.innerWidth - tbW) / 2) + 'px';
    } else {
        // 隐藏工具栏
        if (_imageFitToolbar) {
            _imageFitToolbar.classList.remove('ql-image-fit-toolbar-visible');
        }
    }
}

// 取消选中图片卡片
function _deselectImageCard() {
    if (_selectedImageCard) {
        _selectedImageCard.classList.remove('ql-image-card-selected');
        _selectedImageCard = null;
    }
    if (_imageFitToolbar) {
        _imageFitToolbar.classList.remove('ql-image-fit-toolbar-visible');
    }
}

// ================================================================
// 图片缩放拖拽逻辑
// ================================================================
function _initImageResizeDrag(handle, e) {
    e.preventDefault();
    e.stopPropagation();
    try {
        var card = handle.closest('.ql-image-card');
        if (!card) return;
        var wrapper = card.querySelector('.ql-image-card-wrapper');
        if (!wrapper) return;

        var startX = e.clientX;
        var startY = e.clientY;
        var startW = wrapper.offsetWidth || 200;
        var startH = wrapper.offsetHeight || 150;
        if (startW < 40) startW = 40;
        if (startH < 40) startH = 40;

        var isLeft = handle.classList.contains('ql-image-resize-nw') || handle.classList.contains('ql-image-resize-sw');
        var isTop = handle.classList.contains('ql-image-resize-nw') || handle.classList.contains('ql-image-resize-ne');

        _imageResizing = true;
        var _rafId = null;

        function onMove(ev) {
            if (_rafId) return; // 节流：只保留最后一帧
            _rafId = requestAnimationFrame(function () {
                _rafId = null;
            try {
                var dx = ev.clientX - startX;
                var dy = ev.clientY - startY;
                // 自由缩放：宽高独立计算，不锁定宽高比
                var newW = isLeft ? startW - dx : startW + dx;
                var newH = isTop ? startH - dy : startH + dy;
                // 最小尺寸限制
                if (newW < 40) newW = 40;
                if (newH < 40) newH = 40;
                // 限制最大宽度（基于编辑器宽度）
                var editorEl = wrapper.closest('.ql-editor') || wrapper.closest('#quill-editor');
                var editorW = editorEl ? editorEl.clientWidth - 24 : window.innerWidth - 40;
                if (editorW < 60) editorW = 60;
                if (newW > editorW) newW = editorW;
                // 限制最大高度：图片在最大宽度下显示的高度 + 信息区高度
                var imgEl = wrapper.querySelector('img');
                var footer = card.querySelector('.ql-image-card-footer');
                var footerH = footer ? (footer.offsetHeight || 28) : 28;
                if (imgEl && imgEl.naturalWidth && imgEl.naturalHeight) {
                    var maxHByAspect = Math.round(editorW * imgEl.naturalHeight / imgEl.naturalWidth) + footerH;
                    if (newH > maxHByAspect) newH = maxHByAspect;
                } else {
                    // 图片未加载时，用窗口高度 80% 作为兜底
                    var maxH = Math.floor(window.innerHeight * 0.8);
                    if (newH > maxH) newH = maxH;
                }
                // 确保数值有效再应用
                if (isFinite(newW) && isFinite(newH) && newW > 0 && newH > 0) {
                    wrapper.style.width = newW + 'px';
                    wrapper.style.height = newH + 'px';
                }
            } catch (e) {
                console.warn('[core] 图片缩放移动出错', e);
                onUp();
            }
            });
        }

        function onUp() {
            _imageResizing = false;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        }

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    } catch (e) {
        console.warn('[core] _initImageResizeDrag 初始化出错', e);
        _imageResizing = false;
    }
}

// ================================================================
// 注册图片卡片交互（全局一次性）
// ================================================================
if (!window._imageCardInteractionRegistered) {
    window._imageCardInteractionRegistered = true;

    // 点击图片卡片：选中/取消
    document.addEventListener('mousedown', function (e) {
        // 如果在拖拽缩放手柄，不处理
        if (_imageResizing) return;

        var card = e.target.closest('.ql-image-card');
        // 点击缩放手柄时，不切换选中状态（由拖拽逻辑处理）
        if (e.target.classList.contains('ql-image-resize-handle')) {
            _initImageResizeDrag(e.target, e);
            return;
        }

        if (card) {
            // 点击已选中的卡片，取消选中
            if (card === _selectedImageCard) {
                _deselectImageCard();
            } else {
                _selectImageCard(card);
            }
        } else {
            // 点击其他地方，取消选中
            _deselectImageCard();
        }
    });

    // 点击工具栏按钮不取消选中
    document.addEventListener('mousedown', function (e) {
        if (e.target.closest('.ql-image-fit-toolbar')) {
            e.stopPropagation();
        }
    }, true);
}

// ================================================================
// 统一插入卡片对话框（3选项卡：图片 / 网址 / 文件）
// 文件选项卡统一显示所有文件（含 .node.json），根据选择自动识别卡片类型
// ================================================================
function _createInsertCardDialog(safeId) {
    var existing = document.getElementById('insert-card-dialog');
    if (existing) return existing;

    var project = tabs[safeId];
    var allFiles = [];

    var dialog = document.createElement('div');
    dialog.id = 'insert-card-dialog';
    dialog.className = 'insert-card-dialog';
    dialog.innerHTML =
        '<div class="dialog-overlay"></div>' +
        '<div class="dialog-box">' +
            '<div class="dialog-header">' +
                '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/></svg>' +
                '<h3>' + (t('ui.insert_card') || '插入卡片') + '</h3>' +
            '</div>' +
            '<div class="dialog-body">' +
                '<div class="card-type-select">' +
                    '<button class="card-type-btn active" data-type="image">' + (t('ui.image_card') || '图片卡片') + '</button>' +
                    '<button class="card-type-btn" data-type="url">' + (t('ui.url') || '网址') + '</button>' +
                    '<button class="card-type-btn" data-type="file">' + (t('ui.file') || '文件') + '</button>' +
                '</div>' +
                // 图片选项卡
                '<div class="card-input-row" id="card-image-row">' +
                    '<label>' + (t('ui.image_url') || '图片 URL') + '</label>' +
                    '<div class="card-image-input-group">' +
                        '<input type="text" id="card-image-url" placeholder="https://..." />' +
                        '<button id="card-image-local-btn" class="card-local-btn" title="' + (t('ui.select_image') || '选择本地图片') + '">' +
                            '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>' +
                            (t('ui.select_image') || '本地') +
                        '</button>' +
                    '</div>' +
                    '<input type="file" id="card-image-file-input" accept="image/*" style="display:none" />' +
                    '<label style="margin-top:8px">' + (t('ui.image_desc') || '图片注释') + '</label>' +
                    '<input type="text" id="card-image-desc" placeholder="' + (t('ui.image_desc_ph') || '可选：为图片添加描述') + '" />' +
                '</div>' +
                // 网址选项卡
                '<div class="card-input-row" id="card-url-row" style="display:none">' +
                    '<label>' + (t('ui.enter_url') || '网址') + '</label>' +
                    '<input type="text" id="card-url-input" placeholder="https://..." />' +
                '</div>' +
                // 文件选项卡（统一显示所有文件）
                '<div class="card-input-row" id="card-file-row" style="display:none">' +
                    '<label>' + (t('ui.select_file') || '选择文件') + '</label>' +
                    '<select id="card-file-select"><option value="">-- ' + (t('ui.select_file') || '选择文件') + ' --</option></select>' +
                    '<div class="card-file-target-row" id="card-file-target-row" style="display:none">' +
                        '<label id="card-file-target-label">' + (t('ui.select_heading') || '选择标题/节点') + '</label>' +
                        '<select id="card-file-target-select"><option value="">--</option></select>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div class="dialog-actions">' +
                '<button class="btn-cancel">' + (t('ui.cancel') || '取消') + '</button>' +
                '<button class="btn-confirm">' + (t('ui.confirm') || '确定') + '</button>' +
            '</div>' +
        '</div>';

    document.body.appendChild(dialog);

    // ===== 状态 =====
    var currentType = 'image';

    // ===== 加载文件列表 =====
    function loadFiles() {
        if (!project) return;
        weAPI.listFiles(project.projectPath).then(function (result) {
            allFiles = result.files || [];
            populateFileSelect();
        });
    }

    function populateFileSelect() {
        var fileSelect = dialog.querySelector('#card-file-select');
        fileSelect.innerHTML = '<option value="">-- ' + (t('ui.select_file') || '选择文件') + ' --</option>' +
            allFiles.map(function (f) {
                var label = f.split('/').pop().replace(/\.[^.]+$/, '') || f;
                // 节点图文件加标记
                if (f.endsWith('.node.json')) label += ' (节点图)';
                return '<option value="' + f.replace(/"/g, '&quot;') + '">' + label + '</option>';
            }).join('');
        // 自动选中当前文件
        if (project && project.currentFile && allFiles.indexOf(project.currentFile) >= 0) {
            fileSelect.value = project.currentFile;
            onFileSelectChange(project.currentFile);
        }
    }

    // ===== 文件选择变化：加载标题/节点列表 =====
    var _fileTargets = [];

    function onFileSelectChange(filename) {
        var targetRow = dialog.querySelector('#card-file-target-row');
        var targetSelect = dialog.querySelector('#card-file-target-select');
        var targetLabel = dialog.querySelector('#card-file-target-label');

        if (!filename) {
            targetRow.style.display = 'none';
            _fileTargets = [];
            return;
        }

        if (filename.endsWith('.node.json')) {
            // 节点图：加载节点列表
            targetLabel.textContent = (t('ui.ng_select_node') || '选择目标节点') + ':';
            targetRow.style.display = '';
            targetSelect.innerHTML = '<option value="">-- ' + (t('ui.no_heading') || '（无特定节点）') + ' --</option>';
            _fileTargets = [];
            if (project) {
                weAPI.readFile(project.projectPath, filename).then(function (result) {
                    if (!result.success) return;
                    try {
                        var data = JSON.parse(result.content);
                        var nodes = data.nodes || [];
                        nodes.forEach(function (n) {
                            var opt = document.createElement('option');
                            opt.value = n.id || '';
                            opt.textContent = (n.text || n.id || '') + ' (' + n.id + ')';
                            targetSelect.appendChild(opt);
                        });
                        _fileTargets = nodes.map(function (n) { return { id: n.id, text: n.text || n.id }; });
                    } catch (e) {
                        console.warn('[core] 解析节点图文件失败', e);
                    }
                });
            }
        } else {
            // 普通文件：加载标题列表
            targetLabel.textContent = (t('ui.select_heading') || '选择标题') + ':';
            targetRow.style.display = '';
            targetSelect.innerHTML = '<option value="">-- ' + (t('ui.no_heading') || '（无标题）') + ' --</option>';
            _fileTargets = [];
            if (project && project.projectMode !== 'markdown' && filename === project.currentFile && typeof quill !== 'undefined' && quill) {
                // 当前打开的文件，从编辑器读取标题
                if (typeof getHeadingsFromEditor === 'function') {
                    var headings = getHeadingsFromEditor();
                    headings.forEach(function (h) {
                        var opt = document.createElement('option');
                        opt.value = h.anchor || '';
                        opt.textContent = new Array(h.level).join('  ') + h.text;
                        targetSelect.appendChild(opt);
                    });
                    _fileTargets = headings;
                }
            } else if (project) {
                weAPI.readFile(project.projectPath, filename).then(function (result) {
                    if (!result.success) return;
                    var isHtml = project.projectMode !== 'markdown';
                    var headings = [];
                    if (isHtml) {
                        var parser = new DOMParser();
                        var doc = parser.parseFromString(result.content, 'text/html');
                        var els = doc.querySelectorAll('h1, h2, h3');
                        els.forEach(function (el) {
                            var text = el.textContent.trim();
                            if (text) {
                                headings.push({
                                    anchor: text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fa5-]/g, ''),
                                    text: text
                                });
                            }
                        });
                    } else if (typeof getHeadingsFromMarkdown === 'function') {
                        headings = getHeadingsFromMarkdown(result.content);
                    }
                    targetSelect.innerHTML = '<option value="">-- ' + (t('ui.no_heading') || '（无标题）') + ' --</option>' +
                        headings.map(function (h) { return '<option value="' + h.anchor + '">' + h.text + '</option>'; }).join('');
                    _fileTargets = headings;
                });
            }
        }
    }

    // ===== 选项卡切换 =====
    var typeBtns = dialog.querySelectorAll('.card-type-btn');
    var imageRow = dialog.querySelector('#card-image-row');
    var urlRow = dialog.querySelector('#card-url-row');
    var fileRow = dialog.querySelector('#card-file-row');

    function updateRows() {
        imageRow.style.display = 'none';
        urlRow.style.display = 'none';
        fileRow.style.display = 'none';
        if (currentType === 'image') imageRow.style.display = '';
        else if (currentType === 'url') urlRow.style.display = '';
        else if (currentType === 'file') fileRow.style.display = '';
    }

    typeBtns.forEach(function (btn) {
        btn.onclick = function () {
            typeBtns.forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');
            currentType = btn.dataset.type;
            updateRows();
        };
    });

    // ===== 文件选择变化事件 =====
    dialog.querySelector('#card-file-select').onchange = function () {
        onFileSelectChange(this.value);
    };

    // ===== 本地图片选择 =====
    dialog.querySelector('#card-image-local-btn').onclick = function () {
        dialog.querySelector('#card-image-file-input').click();
    };
    dialog.querySelector('#card-image-file-input').onchange = function (e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        // 大图片压缩，防止界面卡死
        var maxSize = 2 * 1024 * 1024; // 2MB 阈值
        var btn = dialog.querySelector('#card-image-local-btn');
        var originalText = btn.textContent;
        btn.textContent = (typeof t === 'function' && t('ui.loading')) || '加载中...';
        btn.disabled = true;
        // 使用 setTimeout 让 UI 先更新
        setTimeout(function () {
            if (file.size > maxSize) {
                // 压缩大图片
                var img = new Image();
                img.onload = function () {
                    try {
                        var canvas = document.createElement('canvas');
                        var MAX_W = 1920, MAX_H = 1080;
                        var w = img.width, h = img.height;
                        if (w > MAX_W) { h = h * MAX_W / w; w = MAX_W; }
                        if (h > MAX_H) { w = w * MAX_H / h; h = MAX_H; }
                        canvas.width = Math.round(w);
                        canvas.height = Math.round(h);
                        var ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                        var dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                        dialog.querySelector('#card-image-url').value = dataUrl;
                    } catch (ex) {
                        console.warn('[core] 图片压缩失败，回退原始读取', ex);
                        fallbackReadFile(file);
                    }
                    btn.textContent = originalText;
                    btn.disabled = false;
                };
                img.onerror = function () {
                    fallbackReadFile(file);
                    btn.textContent = originalText;
                    btn.disabled = false;
                };
                img.src = URL.createObjectURL(file);
            } else {
                fallbackReadFile(file);
                btn.textContent = originalText;
                btn.disabled = false;
            }
        }, 50);
    };
    function fallbackReadFile(file) {
        var reader = new FileReader();
        reader.onload = function (ev) {
            dialog.querySelector('#card-image-url').value = ev.target.result;
        };
        reader.readAsDataURL(file);
    }

    // ===== 按钮事件 =====
    dialog.querySelector('.btn-cancel').onclick = function () { dialog.remove(); };
    dialog.querySelector('.dialog-overlay').onclick = function () { dialog.remove(); };

    dialog.querySelector('.btn-confirm').onclick = function () {
        if (typeof quill === 'undefined' || !quill) {
            showNotification((t('ui.need_open_project') || '请先打开文件'));
            return;
        }
        // 获取光标位置（使用 try/catch 防止 getSelection 报错）
        var index = 0;
        try {
            var sel = quill.getSelection(true);
            index = (sel && sel.index !== undefined) ? sel.index : quill.getLength();
        } catch (e) {
            index = quill.getLength();
        }

        if (currentType === 'image') {
            var url = dialog.querySelector('#card-image-url').value.trim();
            if (!url) { showNotification((t('ui.enter_url') || '请输入图片 URL 或选择本地图片')); return; }
            var desc = dialog.querySelector('#card-image-desc') ? dialog.querySelector('#card-image-desc').value.trim() : '';
            quill.insertEmbed(index, 'imageCard', { src: url, width: '', height: '', objectFit: 'contain', desc: desc }, Quill.sources.USER);
            quill.setSelection(index + 1, 0, Quill.sources.USER);
            dialog.remove();
            return;
        }

        if (currentType === 'url') {
            var urlVal = dialog.querySelector('#card-url-input').value.trim();
            if (!urlVal) { showNotification((t('ui.enter_url') || '请输入网址')); return; }
            quill.insertEmbed(index, 'urlCard', { url: urlVal }, Quill.sources.USER);
            quill.setSelection(index + 1, 0, Quill.sources.USER);
            dialog.remove();
            return;
        }

        if (currentType === 'file') {
            var filename = dialog.querySelector('#card-file-select').value;
            if (!filename) { showNotification((t('ui.select_file') || '请选择目标文件')); return; }
            var displayName = filename.split('/').pop().replace(/\.node\.json$/, '').replace(/\.[^.]+$/, '') || filename;

            if (filename.endsWith('.node.json')) {
                // 节点图卡片
                var targetNodeSelect = dialog.querySelector('#card-file-target-select');
                var targetNodeId = targetNodeSelect.value;
                var targetNodeText = targetNodeSelect.options[targetNodeSelect.selectedIndex] ? targetNodeSelect.options[targetNodeSelect.selectedIndex].textContent : '';
                var nodePayload = {
                    file: filename,
                    project: project ? (project.title || safeId) : safeId,
                    text: displayName,
                    targetNode: targetNodeId || '',
                    targetNodeText: targetNodeText || '',
                    thumbnail: '',
                    desc: ''
                };
                // 异步加载节点图数据生成缩略图
                if (project && project.projectPath) {
                    weAPI.readFile(project.projectPath, filename).then(function(result) {
                        if (result.success && result.content) {
                            try {
                                var ngData = JSON.parse(result.content);
                                // 传入目标节点ID，让缩略图居中显示该节点
                                if (targetNodeId) ngData.targetNodeId = targetNodeId;
                                if (typeof generateNodeGraphThumbnail === 'function') {
                                    nodePayload.thumbnail = generateNodeGraphThumbnail(ngData, 200, 120);
                                }
                                nodePayload.desc = (ngData.properties && ngData.properties.description) || '';
                            } catch (e) {
                                console.warn('[core] 解析节点图数据失败', e);
                            }
                        }
                        // 只有在 dialog 还存在时才插入（用户可能已关闭）
                        if (document.body.contains(dialog)) {
                            quill.insertEmbed(index, 'nodeGraphCard', nodePayload, Quill.sources.USER);
                            quill.setSelection(index + 1, 0, Quill.sources.USER);
                            dialog.remove();
                        }
                    });
                    return; // 异步处理，提前返回
                }
                quill.insertEmbed(index, 'nodeGraphCard', nodePayload, Quill.sources.USER);
            } else {
                // 文件链接卡片
                var headingSelect = dialog.querySelector('#card-file-target-select');
                var heading = headingSelect.value;
                var headingText = headingSelect.options[headingSelect.selectedIndex] ? headingSelect.options[headingSelect.selectedIndex].textContent : '';
                var filePayload = {
                    file: filename,
                    project: project ? (project.title || safeId) : safeId,
                    text: displayName,
                    heading: heading || '',
                    headingText: headingText || '',
                    desc: ''
                };
                // 异步加载文件简介
                var doInsert = function() {
                    quill.insertEmbed(index, 'fileLinkCard', filePayload, Quill.sources.USER);
                    quill.setSelection(index + 1, 0, Quill.sources.USER);
                    dialog.remove();
                };
                if (window.tagModule && typeof window.tagModule.getDesc === 'function') {
                    Promise.resolve(window.tagModule.getDesc(filename)).then(function(desc) {
                        filePayload.desc = desc || '';
                        doInsert();
                    });
                    return; // 异步处理，提前返回
                }
                doInsert();
            }
            quill.setSelection(index + 1, 0, Quill.sources.USER);
            dialog.remove();
            return;
        }
    };

    // ===== Esc 关闭 =====
    function onKeydown(e) {
        if (e.key === 'Escape') { dialog.remove(); document.removeEventListener('keydown', onKeydown); }
    }
    document.addEventListener('keydown', onKeydown);

    // 异步加载文件
    loadFiles();

    return dialog;
}

// 显示统一插入卡片对话框
function showInsertCardDialog(safeId) {
    _createInsertCardDialog(safeId);
}

// 保留旧函数别名（兼容旧代码）
function showImageCardDialog() {
    showInsertCardDialog(typeof activeTabId !== 'undefined' ? activeTabId : currentQuillProjectId);
}

// ================================================================
// btn-insert-card 委托事件（全局注册，不依赖 quill 初始化顺序）
// ================================================================
if (!window._insertCardDelegated) {
    window._insertCardDelegated = true;
    document.addEventListener('click', function (e) {
        var btn = e.target.closest('.btn-insert-card');
        if (!btn) return;
        e.preventDefault();
        showInsertCardDialog(typeof activeTabId !== 'undefined' ? activeTabId : currentQuillProjectId);
    });
}

// 移除旧的委托事件标记（避免冲突）
if (window._imgCardDelegated) {
    window._imgCardDelegated = false;
}