// ====== editor/embed.js — 嵌入模式节点图 ======
// 源文件: editor.js (行2783-3120)

// ========== 嵌入模式节点图 ==========

function destroyEmbeddedNodeGraph(safeId) {
    weLog.info('editor', '→ destroyEmbeddedNodeGraph', { safeId });
    const inst = embeddedNodeGraphs[safeId];
    if (!inst) return;
    const project = tabs[safeId];
    try {
        if (inst.engine) {
            // 【修复切回内容消失 #1】不管 dirty 与否，一律把当前引擎数据写入 fileCache 暂存
            // （dirty 标记可能因某些操作漏触发，宁可缓存一份"至少比磁盘旧内容新"的状态，
            //  也不能直接丢内存数据去读磁盘）
            if (project) {
                project.fileCache = project.fileCache || {};
                try {
                    const data = inst.engine.getData();
                    const jsonStr = JSON.stringify(data, null, 2);
                    // 【修复切回内容消失 #2】fileCache key 双写：graphFile 和 basename(graphFile) 都存一份
                    // 因为 openEmbeddedNodeGraph 的 filename 参数有时带 subpath，有时是纯文件名
                    // 【终极修复 #类型包裹】用 _fcWrap('ngjson', ...) 包裹，防止 Quill HTML 覆盖 key
                    const wrapped = _fcWrap('ngjson', jsonStr);
                    project.fileCache[inst.graphFile] = wrapped;
                    const base = inst.graphFile.includes('/') || inst.graphFile.includes('\\')
                        ? inst.graphFile.split(/[\\/]/).pop()
                        : inst.graphFile;
                    if (base !== inst.graphFile) { project.fileCache[base] = wrapped; }
                    weLog.debug('editor', 'destroyEmbeddedNodeGraph: 数据已缓存',
                        { graphFile: inst.graphFile, base, dirty: inst.dirty, nodes: data.nodes.length, edges: data.edges.length });
                } catch (e) {
                    // 【修复切回内容消失 #3】不再静默吞异常，打印便于定位
                    weLog.error('editor', 'destroyEmbeddedNodeGraph: 缓存写入失败', e && e.stack ? e.stack : String(e));
                }
            }
            inst.engine.destroy?.();
        }
    } catch (e) {
        weLog.warn('editor', 'destroyEmbeddedNodeGraph: 销毁异常', e && e.stack ? e.stack : String(e));
    }
    const embedEl = document.getElementById(`ng-embed-${safeId}`);
    if (embedEl) embedEl.innerHTML = '';
    delete embeddedNodeGraphs[safeId];
}

/**
 * 关闭当前打开的文件，清空编辑器，回到目录独占模式（only-left）。
 * 用于右键菜单"关闭文件"、删除当前文件等场景。
 */
function closeProjectFile(safeId) {
    weLog.info('editor', '→ closeProjectFile', { safeId });
    const project = tabs[safeId];
    if (!project) return;
    // 销毁节点图实例（会缓存脏数据）
    if (embeddedNodeGraphs[safeId]) destroyEmbeddedNodeGraph(safeId);
    // 清空 Quill / Markdown
    if (quill) { try { quill.setText(''); } catch (e) {} }
    if (markdownEditor) { markdownEditor.value = ''; }
    // 清理 TOC 面板
    if (typeof tocPanel !== 'undefined' && tocPanel) { tocPanel.remove(); tocPanel = null; }
    // 隐藏编辑区容器（避免空白编辑器残留显示）
    const embedEl = document.getElementById(`ng-embed-${safeId}`);
    const quillWrapper = document.getElementById(`quill-${safeId}`);
    if (embedEl) embedEl.style.display = 'none';
    if (quillWrapper) quillWrapper.style.display = '';
    // 清除当前文件标记
    project.currentFile = null;
    // 切回目录独占模式
    if (window.setTaState) window.setTaState(safeId, 'only-left');
    weLog.debug('editor', 'closeProjectFile: 已清空编辑器，切回 only-left', { safeId });
}
window.closeProjectFile = closeProjectFile;

async function saveEmbeddedNodeGraph(safeId) {
    const inst = embeddedNodeGraphs[safeId];
    const project = tabs[safeId];
    if (!inst || !project) return;
    try {
        const data = inst.engine.getData();
        const json = JSON.stringify(data, null, 2);
        const res = await weAPI.saveFile(project.projectPath, inst.graphFile, json);
        if (res.success) {
            inst.dirty = false;
            const status = document.getElementById(`ng-status-${safeId}`);
            if (status) status.textContent = '';
            showNotification(t('ui.saved') || '已保存');
            weLog.info('editor', 'saveEmbeddedNodeGraph: 保存成功', { graphFile: inst.graphFile });
            // 刷新编辑器内该节点图对应的卡片缩略图
            if (typeof refreshNodeGraphThumbnails === 'function') {
                refreshNodeGraphThumbnails(safeId);
            }
        } else {
            showNotification((t('ui.save_failed') || '保存失败') + ': ' + res.error);
        }
    } catch (e) {
        weLog.error('editor', 'saveEmbeddedNodeGraph: 异常', e && e.stack ? e.stack : String(e));
    }
}

async function openEmbeddedNodeGraph(safeId, filename) {
    weLog.info('editor', '→ openEmbeddedNodeGraph', { safeId, filename });
    const project = tabs[safeId];
    const embedEl = document.getElementById(`ng-embed-${safeId}`);
    const quillWrapper = document.getElementById(`quill-${safeId}`);
    if (!embedEl || !project) {
        weLog.warn('editor', 'openEmbeddedNodeGraph: 容器或项目不存在');
        return;
    }

    // 切换显示：隐藏 Quill，显示节点图
    embedEl.style.display = 'flex';
    if (quillWrapper) quillWrapper.style.display = 'none';
    // 清理旧实例
    if (embeddedNodeGraphs[safeId]) destroyEmbeddedNodeGraph(safeId);

    // 检查 NGEngine 是否可用
    if (typeof NGEngine === 'undefined') {
        weLog.warn('editor', 'openEmbeddedNodeGraph: NGEngine 未加载');
        embedEl.innerHTML = `<div style="padding:20px;color:var(--text-muted,#999)">节点图引擎未加载，请重启应用</div>`;
        return;
    }

    // 构建内嵌节点图 UI
    embedEl.innerHTML = `
        ${typeof buildNodeGraphToolbarHTML === 'function' ? buildNodeGraphToolbarHTML(`ng-status-${safeId}`) : ''}
        <div class="node-graph-body">
            <div class="node-graph-canvas-wrapper" style="position:relative;flex:1;overflow:hidden;">
                <div class="node-graph-canvas" id="ng-canvas-embed-${safeId}"></div>
                <div class="ng-coords" id="ng-coords-${safeId}" style="position:absolute;left:8px;bottom:8px;font-size:11px;font-family:monospace;color:var(--text-secondary,#888);pointer-events:none;z-index:3;background:rgba(0,0,0,0.03);padding:2px 6px;border-radius:3px;">0, 0</div>
            </div>
            ${typeof buildNodeGraphPropertyPanelHTML === 'function' ? buildNodeGraphPropertyPanelHTML() : ''}
        </div>
    `;

    const canvasEl = embedEl.querySelector(`#ng-canvas-embed-${safeId}`);
    const wrapperEl = embedEl.querySelector('.node-graph-canvas-wrapper');
    const coordsEl = embedEl.querySelector(`#ng-coords-${safeId}`);
    const toolbar = embedEl.querySelector('.node-graph-toolbar');
    const panelEl = embedEl.querySelector('.ng-property-panel');
    const zoomLabel = toolbar.querySelector('.ng-zoom-label');

    // 创建 NGEngine 实例
    let engine;
    try {
        engine = new NGEngine(canvasEl, {
            onChange: () => markDirty(),
            onSelectionChange: () => {
                const nid = engine.getSelectedNodeId();
                const eid = engine.getSelectedEdgeId();
                if (typeof updateNodeGraphPropertyPanel === 'function') {
                    updateNodeGraphPropertyPanel(panelEl, engine, nid, eid);
                }
            },
        });
        if (coordsEl) engine.setCoordsEl(coordsEl);
    } catch (e) {
        weLog.error('editor', 'openEmbeddedNodeGraph: NGEngine 初始化失败', String(e));
        return;
    }

    embeddedNodeGraphs[safeId] = { engine, graphFile: filename, dirty: false };
    const inst = embeddedNodeGraphs[safeId];

    // ========== GlobalUndoManager 接入：NodeGraph ==========
    // engine._snapshot() 调 setOnHistoryChange(prev, next, 'push') 时
    // → 把 prev/next 快照 push 到全局撤回栈（同文件 debounce 合并：NG 每步操作一般 400ms 内只做一个动作，
    //   但拖动节点会连续触发 400ms 的 push → debounce 合并只取 first.prev+last.next，体验好）
    const gu = ensureGlobalUndo(safeId);
    engine.setOnHistoryChange((prevSnap, nextSnap, kind) => {
        if (!gu || kind !== 'push') return;
        if (gu.suppress > 0) return; // global undo/redo 期间自己 loadData 后不应该再入栈
        gu.push({
            type: 'nodegraph',
            file: filename,
            label: '节点图操作',
            prev: prevSnap,
            next: nextSnap,
        });
    });

    function markDirty() {
        inst.dirty = true;
        project.dirty = true;
        updateStatusBar();
        const status = document.getElementById(`ng-status-${safeId}`);
        if (status) status.textContent = '●';
    }

    // 属性面板绑定
    if (panelEl) {
        if (typeof bindNodeGraphPropertyPanel === 'function') bindNodeGraphPropertyPanel(panelEl, engine, markDirty);
        if (typeof setupPropertyPanelToggle === 'function') setupPropertyPanelToggle(panelEl);
        // 初始化：无选中节点/边 → 隐藏属性面板（同独立 tab 处理）
        // 同步立即执行一次 + 下一轮事件循环兜底触发，保证 panel 入 DOM 后 display:none 确实生效。
        if (typeof updateNodeGraphPropertyPanel === 'function') {
            try { updateNodeGraphPropertyPanel(panelEl, engine, null, null); } catch (_) {}
            setTimeout(() => {
                try { updateNodeGraphPropertyPanel(panelEl, engine, null, null); } catch (_) {}
            }, 0);
        }
    }

    // 右键菜单
    if (typeof setupNodeGraphContextMenu === 'function') setupNodeGraphContextMenu(engine, markDirty);

    // ========== 工具栏交互 ==========
    function syncToolbarButtons() {
        toolbar.querySelectorAll('.ng-btn[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === (engine.activeTool || 'select')));
        toolbar.querySelectorAll('.ng-btn[data-edge]').forEach(b => b.classList.toggle('active', b.dataset.edge === engine.activeEdgeType));
    }
    function setActiveTool(tool) {
        engine.setActiveTool(tool === 'select' ? null : tool);
        syncToolbarButtons();
    }
    function setActiveEdge(edgeType) {
        engine.setActiveEdge(edgeType);
        syncToolbarButtons();
    }
    engine.onToolChange = syncToolbarButtons;
    function updateZoomLabel() {
        if (zoomLabel) zoomLabel.textContent = Math.round(engine.zoom * 100) + '%';
    }

    // 包装 zoom 方法以更新标签
    const origZoomTo = engine.zoomTo.bind(engine);
    engine.zoomTo = (s, c) => { origZoomTo(s, c); updateZoomLabel(); };
    const origZoomReset = engine.zoomReset.bind(engine);
    engine.zoomReset = () => { origZoomReset(); updateZoomLabel(); };

    toolbar.addEventListener('click', async e => {
        const btn = e.target.closest('.ng-btn');
        if (!btn) return;
        const tool = btn.dataset.tool;
        const edge = btn.dataset.edge;
        const action = btn.dataset.action;
        if (tool) {
            setActiveTool(tool);
            if (tool !== 'select') setActiveEdge(null);
        } else if (edge) {
            setActiveEdge(engine.activeEdgeType === edge ? null : edge);
        } else if (action === 'continuous') {
            engine.continuousDraw = !engine.continuousDraw;
            const cBtn = toolbar.querySelector('[data-action="continuous"]');
            if (cBtn) cBtn.classList.toggle('active', engine.continuousDraw);
        } else if (action === 'delete') {
            engine.deleteSelected();
            markDirty();
        } else if (action === 'undo') {
            engine.undo();
            markDirty();
        } else if (action === 'redo') {
            engine.redo();
            markDirty();
        } else if (action === 'zoom-in') {
            const rect = canvasEl.getBoundingClientRect();
            engine.zoomTo(engine.zoom * 1.2, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
        } else if (action === 'zoom-out') {
            const rect = canvasEl.getBoundingClientRect();
            engine.zoomTo(engine.zoom / 1.2, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
        } else if (action === 'zoom-reset') {
            engine.zoomReset();
        } else if (action === 'save') {
            saveEmbeddedNodeGraph(safeId);
        } else if (action === 'history') {
            toggleHistoryPanel(safeId);
        } else if (action === 'export') {
            if (typeof exportNodeGraphHTML === 'function') exportNodeGraphHTML(engine, safeId);
        }
    });

    // 读取数据（【修复切回内容消失 #4】缓存优先，同时尝试 filename 和 basename(filename) 两个 key）
    // 【终极修复 #类型包裹】用 _fcUnwrap('ngjson') 解开，类型不匹配（比如是 Quill HTML）直接当作没缓存，
    //   这样即使以后 key 被不小心串到 HTML 上，也不会再 JSON.parse 失败渲染空画布
    let jsonStr = null;
    let fromCache = false;
    if (project.fileCache) {
        const base = (filename.includes('/') || filename.includes('\\'))
            ? filename.split(/[\\/]/).pop()
            : filename;
        const unwrappedA = _fcUnwrap('ngjson', project.fileCache[filename]);
        if (unwrappedA !== undefined) {
            jsonStr = unwrappedA;
            fromCache = true;
            weLog.debug('editor', 'openEmbeddedNodeGraph: 从缓存（完整路径）读取', { filename });
        } else if (base !== filename) {
            const unwrappedB = _fcUnwrap('ngjson', project.fileCache[base]);
            if (unwrappedB !== undefined) {
                jsonStr = unwrappedB;
                fromCache = true;
                weLog.debug('editor', 'openEmbeddedNodeGraph: 从缓存（basename）读取', { filename, base });
            }
        }
    }
    if (jsonStr === null || jsonStr === undefined) {
        // 如果上一步"读到了但类型不匹配/内容是 HTML"→此时 jsonStr 还是 null，去读磁盘最新内容（更安全）
        if (fromCache === false && project.fileCache && (project.fileCache[filename] !== undefined
            || ((filename.includes('/') || filename.includes('\\'))
                && project.fileCache[filename.split(/[\\/]/).pop()] !== undefined))) {
            weLog.warn('editor', 'openEmbeddedNodeGraph: 缓存存在但类型不匹配（可能是 Quill HTML），放弃缓存改读磁盘',
                { filename });
        }
        weLog.debug('editor', 'openEmbeddedNodeGraph: 从磁盘读取', { filename });
        const result = await weAPI.readFile(project.projectPath, filename);
        if (result.success) jsonStr = result.content || null;
    }

    let parsedData = null;
    try {
        if (jsonStr && jsonStr.trim()) {
            parsedData = JSON.parse(jsonStr);
            if (typeof migrateNodeGraphData === 'function') parsedData = migrateNodeGraphData(parsedData);
            weLog.debug('editor', 'openEmbeddedNodeGraph: 数据解析成功',
                { fromCache, nodes: parsedData.nodes && parsedData.nodes.length, edges: parsedData.edges && parsedData.edges.length });
        }
    } catch (e) {
        // 【修复切回内容消失 #5】详细打印解析失败的原因和 jsonStr 片段，方便定位
        weLog.error('editor', 'openEmbeddedNodeGraph: 数据解析失败，渲染空画布',
            { fromCache, err: e && e.stack ? e.stack : String(e), jsonPreview: jsonStr ? jsonStr.slice(0, 200) : null });
        parsedData = null;
    }
    engine.loadData(parsedData && (parsedData.nodes || parsedData.edges) ? parsedData : { nodes: [], edges: [] });

    // 初始化
    setActiveTool('select');
    updateZoomLabel();

    // 标记为当前文件
    project.currentFile = filename;
    // 【修复切回内容消失 #6】如果是从缓存加载，说明是上次切换时暂存的未保存状态 → 恢复 dirty=true
    // （即使之前 dirty=false，也只是没标脏而已，内容和磁盘内容相比未保存；用 fromCache 最准确）
    inst.dirty = fromCache && inst.dirty ? true : fromCache;
    project.dirty = inst.dirty || project.dirty;
    if (inst.dirty) {
        const status = document.getElementById(`ng-status-${safeId}`);
        if (status) status.textContent = '●';
    }

    // 高亮文件树
    const tree = document.getElementById(`file-tree-${safeId}`);
    tree?.querySelectorAll('.tree-file').forEach(el => el.classList.remove('active'));
    tree?.querySelector(`[data-file="${filename}"]`)?.classList.add('active');

    updateStatusBar();
    weLog.info('editor', '← openEmbeddedNodeGraph 完成', { filename });
}