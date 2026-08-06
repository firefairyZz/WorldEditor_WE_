// ========== 节点关系图（Node Graph）标签页 ==========
// 基于 LogicFlow 2.x UMD 构建，支持矩形/圆形/菱形/椭圆四种基础节点
// 数据格式：{ nodes: [{id, type, x, y, text}], edges: [{id, sourceNodeId, targetNodeId, type}] }

// 活跃的节点图实例映射：tabId → { lf, graphId, title, dirty }
const nodeGraphInstances = {};

// 获取 LogicFlow 主类（UMD 全局变量 window.Core）
function getLogicFlowClass() {
    if (typeof window.Core === 'undefined') {
        weLog.error('node-graph', 'getLogicFlowClass: window.Core 未定义，logicflow-core.js 未加载');
        return null;
    }
    if (window.Core.LogicFlow) return window.Core.LogicFlow;
    if (window.Core.default && window.Core.default.LogicFlow) return window.Core.default.LogicFlow;
    weLog.error('node-graph', 'getLogicFlowClass: Core.LogicFlow 不存在', Object.keys(window.Core));
    return null;
}

// 从 CSS 变量读取主题色，构建 LogicFlow theme 配置
function buildLogicFlowTheme() {
    const style = getComputedStyle(document.documentElement);
    const getVar = (name, fallback) => (style.getPropertyValue(name).trim() || fallback);
    return {
        // 节点样式
        rect: {
            fill: getVar('--bg-card', '#ffffff'),
            stroke: getVar('--border', '#cccccc'),
            strokeWidth: 1,
        },
        circle: {
            fill: getVar('--bg-card', '#ffffff'),
            stroke: getVar('--accent', '#4a90d9'),
            strokeWidth: 2,
        },
        ellipse: {
            fill: getVar('--bg-card', '#ffffff'),
            stroke: getVar('--border', '#cccccc'),
            strokeWidth: 1,
        },
        diamond: {
            fill: getVar('--bg-card', '#ffffff'),
            stroke: getVar('--accent', '#4a90d9'),
            strokeWidth: 1,
        },
        // 节点文字
        nodeText: {
            color: getVar('--text', '#333333'),
            fontSize: 14,
        },
        // 连线样式
        line: {
            stroke: getVar('--text-soft', '#888888'),
            strokeWidth: 2,
        },
        polyline: {
            stroke: getVar('--text-soft', '#888888'),
            strokeWidth: 2,
        },
        // 连线文字
        edgeText: {
            color: getVar('--text', '#333333'),
            background: {
                fill: getVar('--bg-card', '#ffffff'),
                stroke: 'transparent',
                radius: 4,
            },
        },
        // 选中态
        outline: {
            stroke: getVar('--accent', '#4a90d9'),
            strokeWidth: 2,
            strokeDasharray: '4 4',
        },
    };
}

// 创建节点图标签页
function createNodeGraphTab(graphId, title, projectFolder) {
    weLog.info('node-graph', '→ createNodeGraphTab', { graphId, title, hasFolder: !!projectFolder });
    const LogicFlow = getLogicFlowClass();
    if (!LogicFlow) {
        weLog.error('node-graph', 'createNodeGraphTab: LogicFlow 类未加载，无法创建标签页');
        showNotification('节点图库未加载，请重启应用');
        return;
    }

    const tabId = 'nodegraph-' + sanitizeId(graphId);
    if (tabs[tabId]) {
        weLog.info('node-graph', 'createNodeGraphTab: 标签已存在，切换', { tabId });
        switchTab(tabId);
        return;
    }

    // 构建标签页内容
    const content = document.createElement('div');
    content.className = 'node-graph-layout';
    content.innerHTML = `
        <div class="node-graph-toolbar">
            <button class="ng-btn" data-action="add-rect" title="矩形">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="6" width="16" height="12" rx="1"/></svg>
            </button>
            <button class="ng-btn" data-action="add-circle" title="圆形">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="7"/></svg>
            </button>
            <button class="ng-btn" data-action="add-diamond" title="菱形">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4l8 8-8 8-8-8z"/></svg>
            </button>
            <button class="ng-btn" data-action="add-ellipse" title="椭圆">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="12" rx="9" ry="6"/></svg>
            </button>
            <div class="ng-toolbar-divider"></div>
            <button class="ng-btn" data-action="delete" title="删除选中">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M6 6l1 14a2 2 0 002 2h6a2 2 0 002-2l1-14"/></svg>
            </button>
            <div class="ng-toolbar-divider"></div>
            <button class="ng-btn" data-action="save" title="保存">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>
            </button>
            <div class="ng-toolbar-spacer"></div>
            <span class="ng-status"></span>
        </div>
        <div class="node-graph-canvas-wrapper">
            <div class="node-graph-canvas" id="ng-canvas-${tabId}"></div>
        </div>
    `;

    addTab(tabId, title || graphId, content, true);

    // 初始化 LogicFlow 实例
    const canvasEl = content.querySelector('#ng-canvas-' + tabId);
    let lf = null;
    try {
        lf = new LogicFlow({
            container: canvasEl,
            grid: {
                size: 20,
                type: 'dot',
                config: { color: '#aaa', opacity: 0.3 },
            },
            background: { color: 'transparent' },
            keyboard: { enabled: true },
            style: buildLogicFlowTheme(),
            edgeType: 'polyline',
        });
        weLog.info('node-graph', 'LogicFlow 实例已创建', { tabId });
    } catch (e) {
        weLog.error('node-graph', 'LogicFlow 初始化失败', e && e.stack ? e.stack : String(e));
        return;
    }

    // 注册实例
    nodeGraphInstances[tabId] = { lf, graphId, title, projectFolder, dirty: false };

    // 标记为已修改
    function markDirty() {
        nodeGraphInstances[tabId].dirty = true;
        const status = content.querySelector('.ng-status');
        if (status) status.textContent = '●';
    }

    // 监听数据变化
    lf.on('node:add,node:delete,node:dnd-add,edge:add,edge:delete,node:text-update,edge:text-update', markDirty);

    // 工具栏事件
    const toolbar = content.querySelector('.node-graph-toolbar');
    toolbar.addEventListener('click', async (e) => {
        const btn = e.target.closest('.ng-btn');
        if (!btn) return;
        const action = btn.dataset.action;
        weLog.debug('node-graph', '工具栏点击', { action });

        if (action === 'add-rect' || action === 'add-circle' || action === 'add-diamond' || action === 'add-ellipse') {
            const type = action.replace('add-', '');
            try {
                // 在画布中心添加节点
                const rect = canvasEl.getBoundingClientRect();
                const center = lf.getPointByClient(rect.width / 2, rect.height / 2);
                lf.addNode({
                    type: type,
                    x: center.x,
                    y: center.y,
                    text: '节点',
                });
                markDirty();
            } catch (err) {
                weLog.error('node-graph', '添加节点失败', { type, error: String(err) });
            }
        } else if (action === 'delete') {
            const { nodes, edges } = lf.getSelectElements(true);
            if (nodes.length > 0) lf.deleteNode(nodes[0].id);
            if (edges.length > 0) lf.deleteEdge(edges[0].id);
            markDirty();
        } else if (action === 'save') {
            await saveNodeGraph(tabId);
        }
    });

    // 键盘删除快捷键
    lf.on('node:delete,edge:delete', markDirty);

    // 加载已有数据
    if (projectFolder) {
        loadNodeGraph(tabId, projectFolder, graphId);
    }

    weLog.info('node-graph', '← createNodeGraphTab 完成', { tabId });
    return tabId;
}

// 加载节点图数据
async function loadNodeGraph(tabId, projectFolder, graphId) {
    weLog.info('node-graph', '→ loadNodeGraph', { tabId, graphId });
    const inst = nodeGraphInstances[tabId];
    if (!inst || !inst.lf) return;

    const filename = graphId + '.node.json';
    try {
        const result = await weAPI.readFile(projectFolder, filename);
        if (result.success && result.content) {
            const data = JSON.parse(result.content);
            weLog.info('node-graph', 'loadNodeGraph: 数据已读取', { nodes: data.nodes?.length || 0, edges: data.edges?.length || 0 });
            inst.lf.render(data);
        } else {
            weLog.info('node-graph', 'loadNodeGraph: 文件为空或不存在，渲染空画布');
            inst.lf.render({ nodes: [], edges: [] });
        }
        inst.dirty = false;
    } catch (e) {
        weLog.error('node-graph', 'loadNodeGraph 失败', e && e.stack ? e.stack : String(e));
        inst.lf.render({ nodes: [], edges: [] });
    }
}

// 保存节点图数据
async function saveNodeGraph(tabId) {
    weLog.info('node-graph', '→ saveNodeGraph', { tabId });
    const inst = nodeGraphInstances[tabId];
    if (!inst || !inst.lf) return;

    const data = inst.lf.getGraphData();
    const json = JSON.stringify(data, null, 2);
    const filename = inst.graphId + '.node.json';

    try {
        const result = await weAPI.saveFile(inst.projectFolder, filename, json);
        if (result.success) {
            inst.dirty = false;
            const status = document.querySelector('#ng-canvas-' + tabId)?.closest('.node-graph-layout')?.querySelector('.ng-status');
            if (status) status.textContent = '';
            weLog.info('node-graph', '← saveNodeGraph 完成', { filename, nodes: data.nodes?.length || 0, edges: data.edges?.length || 0 });
            showNotification('节点图已保存');
        } else {
            weLog.error('node-graph', 'saveNodeGraph: IPC 返回失败', result.error);
            showNotification('保存失败: ' + (result.error || '未知错误'));
        }
    } catch (e) {
        weLog.error('node-graph', 'saveNodeGraph 异常', e && e.stack ? e.stack : String(e));
        showNotification('保存失败: ' + e.message);
    }
}

// 主题切换时更新所有节点图实例的样式
function refreshNodeGraphTheme() {
    const theme = buildLogicFlowTheme();
    let count = 0;
    for (const tabId in nodeGraphInstances) {
        const inst = nodeGraphInstances[tabId];
        if (inst && inst.lf) {
            try {
                inst.lf.setTheme(theme);
                count++;
            } catch (e) {
                weLog.error('node-graph', 'refreshNodeGraphTheme 失败', { tabId, error: String(e) });
            }
        }
    }
    if (count > 0) weLog.debug('node-graph', 'refreshNodeGraphTheme 完成', { count });
}

weLog.info('node-graph', '节点图模块已加载');
