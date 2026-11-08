// ====== editor/embed.js — 嵌入模式节点图 ======
// 源文件: editor.js (行2783-3120)

// ========== 嵌入模式节点图 ==========

function destroyEmbeddedNodeGraph(safeId) {
    weLog.info('editor', '→ destroyEmbeddedNodeGraph', { safeId });
    const project = tabs[safeId];

    // === 新路径：node-graph.js createNodeGraphTab(嵌入模式) ===
    const ngEmbedTabId = 'nodegraph-embed-' + safeId;
    if (typeof nodeGraphInstances !== 'undefined' && nodeGraphInstances[ngEmbedTabId]) {
        const ngInst = nodeGraphInstances[ngEmbedTabId];
        try {
            if (ngInst.engine && project && ngInst.graphId) {
                project.fileCache = project.fileCache || {};
                try {
                    const data = ngInst.engine.getData();
                    const wrapped = _fcWrap('ngjson', JSON.stringify(data, null, 2));
                    const filename = ngInst.graphId + '.node.json';
                    project.fileCache[filename] = wrapped;
                    const base = filename.split(/[\\/]/).pop();
                    if (base !== filename) project.fileCache[base] = wrapped;
                } catch (e) {}
                ngInst.engine.destroy?.();
            }
        } catch (e) {
            weLog.warn('editor', 'destroyEmbeddedNodeGraph(node-graph): 销毁异常', String(e));
        }
        delete nodeGraphInstances[ngEmbedTabId];
    }

    // === 旧路径：embed.js openEmbeddedNodeGraph（兼容）===
    const inst = embeddedNodeGraphs[safeId];
    if (inst) {
        try {
            if (inst.engine) {
                if (project) {
                    project.fileCache = project.fileCache || {};
                    try {
                        const data = inst.engine.getData();
                        const wrapped = _fcWrap('ngjson', JSON.stringify(data, null, 2));
                        project.fileCache[inst.graphFile] = wrapped;
                        const base = inst.graphFile.split(/[\\/]/).pop();
                        if (base !== inst.graphFile) project.fileCache[base] = wrapped;
                    } catch (e) {}
                }
                inst.engine.destroy?.();
            }
        } catch (e) {
            weLog.warn('editor', 'destroyEmbeddedNodeGraph(embed): 销毁异常', String(e));
        }
        delete embeddedNodeGraphs[safeId];
    }

    const embedEl = document.getElementById(`ng-embed-${safeId}`);
    if (embedEl) embedEl.innerHTML = '';
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
        console.log('[NG] 工具栏点击', e.target.tagName, e.target.className, e.target.nodeType);
        if (!e || !e.target) return;
        // SVG 元素在旧版 Electron 中可能没有 closest 方法，用安全调用
        var target = e.target;
        var closestBtn = (typeof target.closest === 'function') ? target.closest('.ng-btn') : null;
        // 兜底：通过 parentElement 回溯查找
        if (!closestBtn) {
            var el = target;
            while (el && el !== toolbar) {
                if (el.nodeType === 1 && el.classList && el.classList.contains('ng-btn')) { closestBtn = el; break; }
                el = el.parentElement || (el.parentNode && el.parentNode.nodeType === 1 ? el.parentNode : null);
            }
        }
        if (!closestBtn) { console.log('[NG] 未找到 .ng-btn 父元素', e.target); return; }
        const btn = closestBtn;
        const tool = btn.dataset.tool;
        const edge = btn.dataset.edge;
        const action = btn.dataset.action;
        // 观察模式：只允许缩放和模式切换
        if (engine._isReadonly && engine._isReadonly()) {
            if (action === 'zoom-in' || action === 'zoom-out' || action === 'zoom-reset') {
                // 放行
            } else { return; }
        }
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
        } else if (action === 'auto-layout') {
            engine.autoLayout();
            markDirty();
        } else if (action === 'save') {
            saveEmbeddedNodeGraph(safeId);
        } else if (action === 'history') {
            toggleHistoryPanel(safeId);
        } else if (action === 'layout-selector') {
            // 切换排版下拉菜单（菜单已被 append 到 body 做 fixed 定位）
            let menu = document.querySelector('.ng-layout-menu[data-for-embed="' + safeId + '"]');
            if (!menu) menu = document.querySelector('.ng-layout-menu');
            if (!menu) { weLog.warn('editor', 'embed layout-selector: menu not found'); return; }
            // 把 engine/markDirty 直接挂到 menu DOM 上
            menu._ngEngine = engine;
            menu._ngMarkDirty = markDirty;
            if (!menu.dataset.forEmbed) menu.dataset.forEmbed = safeId;
            const isVisible = menu.style.display !== 'none';
            // 关闭其他 tab 残留的 menu
            document.querySelectorAll('.ng-layout-menu').forEach(m => { if (m !== menu) m.style.display = 'none'; });
            if (!isVisible) {
                var br = btn.getBoundingClientRect();
                menu.style.position = 'fixed';
                menu.style.top = (br.bottom + 4) + 'px';
                menu.style.left = br.left + 'px';
                menu.style.display = 'block';
            } else {
                menu.style.display = 'none';
            }
        } else if (action === 'export') {
            if (typeof exportNodeGraphHTML === 'function') exportNodeGraphHTML(engine, safeId);
        } else if (action === 'export-archive') {
            console.log('→ 导出角色档案被触发');
            try {
                if (typeof exportNodeGraphArchive === 'function') exportNodeGraphArchive(engine);
            } catch (e) {
                console.error('导出角色档案失败:', e);
                showNotification('导出失败: ' + (e.message || String(e)));
            }
        } else if (action === 'sim-start') {
            engine.startSimulation();
            updateSimLabel();
            if (window._ngSimTimer) { clearInterval(window._ngSimTimer); window._ngSimTimer = null; }
            const autoBtn = toolbar.querySelector('[data-action="sim-auto"]');
            if (autoBtn) autoBtn.classList.remove('active');
        } else if (action === 'sim-step') {
            if (engine.simState === 'waiting') return;
            engine.stepSimulation();
            updateSimLabel();
            if (engine.simState === 'finished' && window._ngSimTimer) {
                clearInterval(window._ngSimTimer); window._ngSimTimer = null;
                const autoBtn = toolbar.querySelector('[data-action="sim-auto"]');
                if (autoBtn) autoBtn.classList.remove('active');
            }
        } else if (action === 'sim-auto') {
            if (window._ngSimTimer) {
                clearInterval(window._ngSimTimer); window._ngSimTimer = null;
                btn.classList.remove('active');
            } else {
                if (engine.simState !== 'running') {
                    engine.startSimulation();
                    updateSimLabel();
                }
                btn.classList.add('active');
                window._ngSimTimer = setInterval(() => {
                    if (engine.simState === 'finished' || engine.simState === 'waiting') {
                        clearInterval(window._ngSimTimer); window._ngSimTimer = null;
                        const ab = toolbar.querySelector('[data-action="sim-auto"]');
                        if (ab) ab.classList.remove('active');
                        return;
                    }
                    engine.stepSimulation();
                    updateSimLabel();
                }, 800);
            }
        } else if (action === 'sim-reset') {
            engine.resetSimulation();
            updateSimLabel();
            if (window._ngSimTimer) { clearInterval(window._ngSimTimer); window._ngSimTimer = null; }
            const autoBtn = toolbar.querySelector('[data-action="sim-auto"]');
            if (autoBtn) autoBtn.classList.remove('active');
        }
    });

    // 工具栏隐藏滚动条后的滚轮横向滚动
    let _toolbarHover = false;
    toolbar.addEventListener('mouseenter', () => { _toolbarHover = true; });
    toolbar.addEventListener('mouseleave', () => { _toolbarHover = false; });

    // 左右滚动箭头
    if (typeof addScrollArrows === 'function') addScrollArrows(toolbar);

    function _handleToolbarWheel(e) {
        if (!_toolbarHover) return;
        const openMenu = document.querySelector('.ng-layout-menu');
        if (openMenu && openMenu.style.display === 'none') { /* closed, fine */ }
        else if (openMenu) return; // menu open, don't scroll toolbar
        const dy = e.deltaY != null ? e.deltaY : (e.wheelDelta != null ? -e.wheelDelta : 0);
        const dx = e.deltaX != null ? e.deltaX : 0;
        const step = Math.abs(dx) > Math.abs(dy) ? dx : dy;
        if (step === 0) return;
        e.preventDefault();
        toolbar.scrollLeft += step;
    }
    document.addEventListener('wheel', _handleToolbarWheel, { passive: false });
    document.addEventListener('mousewheel', _handleToolbarWheel, { passive: false });

    // 排版下拉菜单选项 + 关闭：改用 document capture（menu 在 body 上，toolbar 监听不到）
    document.addEventListener('mousedown', (e) => {
        const menus = document.querySelectorAll('.ng-layout-menu');
        menus.forEach(function(menu) {
            if (!menu || menu.style.display === 'none') return;
            if (menu.contains(e.target)) {
                var opt = (typeof e.target.closest === 'function') ? e.target.closest('.ng-layout-option') : null;
                if (!opt && e.target.classList && e.target.classList.contains('ng-layout-option')) opt = e.target;
                if (opt) {
                    const layout = opt.dataset.layout;
                    const eng = menu._ngEngine;
                    const md = menu._ngMarkDirty;
                    menu.style.display = 'none';
                    if (layout && eng) {
                        try { eng.autoLayout(layout); if (md) md(); weLog.info('editor', 'embed autoLayout', { layout }); } catch (err) { weLog.error('editor', 'embed autoLayout 失败', err && err.stack ? err.stack : String(err)); }
                    }
                }
                return;
            }
            if (e.target && (typeof e.target.closest === 'function') && e.target.closest('[data-action="layout-selector"]')) return;
            menu.style.display = 'none';
        });
    }, true);

    // 模拟标签更新
    function updateSimLabel() {
        const label = toolbar.querySelector('.ng-sim-label');
        if (label) {
            if (engine.simState === 'idle') label.textContent = t('ui.ng_sim_idle') || '待模拟';
            else if (engine.simState === 'finished') label.textContent = t('ui.ng_sim_finished') || '模拟完成';
            else label.textContent = engine.getSimStepLabel();
        }
    }
    // 注册模拟回调
    engine.onSimUpdate = (state, step, total, stepLabel) => {
        const label = toolbar.querySelector('.ng-sim-label');
        if (label) {
            if (state === 'idle') label.textContent = t('ui.ng_sim_idle') || '待模拟';
            else if (state === 'finished') label.textContent = t('ui.ng_sim_finished') || '模拟完成';
            else label.textContent = stepLabel;
        }
    };

    // 模式切换
    const modeSelect = toolbar.querySelector('.ng-mode-select');
    if (modeSelect) {
        modeSelect.value = engine.mode;
        engine._modeSelectEl = modeSelect; // 存储引用，供 _syncModeUI 更新
        modeSelect.addEventListener('change', (e) => {
            engine.setMode(e.target.value);
            // 重建节点按钮组
            rebuildToolbarNodeButtons(toolbar, engine.mode);
            if (engine.mode === 'flow') {
                setActiveEdge(null);
                if (engine.activeTool) setActiveTool('select');
            }
            // 切换模式时显示/隐藏模拟按钮
            const simBtns = toolbar.querySelector('.ng-sim-buttons');
            if (simBtns) {
                simBtns.style.display = engine.mode === 'flow' ? '' : 'none';
            }
            // 离开流程模式时重置模拟
            if (engine.mode !== 'flow') engine.resetSimulation();
            markDirty();
        });
    }

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