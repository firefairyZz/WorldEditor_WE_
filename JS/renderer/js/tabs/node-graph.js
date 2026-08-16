// ========== 节点关系图（Node Graph）标签页 ==========
// 纯 SVG/CSS + 原生 JS 实现，不依赖任何第三方图库
// 数据格式：{ version:2, viewport:{scale,tx,ty}, nodes:[{id,type,x,y,width,height,text,properties}],
//            edges:[{id,type,sourcePortId,targetPortId,sourceNodeId,targetNodeId,text,properties}] }
// 端口 ID 规则：{nodeId}_{1|2|3|4|t|l|b|r}  其中 1=t=上  2=l=左  3=b=下  4=r=右

// ========== 端口（Port）工具函数 ==========
const NG_PORT_SIDE_TOP    = 'top';
const NG_PORT_SIDE_LEFT   = 'left';
const NG_PORT_SIDE_BOTTOM = 'bottom';
const NG_PORT_SIDE_RIGHT  = 'right';
// side → {数字key, 字母key, 标签}
const NG_PORT_DEFS = [
    { side: NG_PORT_SIDE_TOP,    num: '1', letter: 't', label: '上' },
    { side: NG_PORT_SIDE_LEFT,   num: '2', letter: 'l', label: '左' },
    { side: NG_PORT_SIDE_BOTTOM, num: '3', letter: 'b', label: '下' },
    { side: NG_PORT_SIDE_RIGHT,  num: '4', letter: 'r', label: '右' },
];
const NG_SIDE_TO_DEF = NG_PORT_DEFS.reduce((m, d) => (m[d.side] = d, m), {});
const NG_PORT_KEY_TO_SIDE = NG_PORT_DEFS.reduce((m, d) => (m[d.num] = d.side, m[d.letter] = d.side, m), {});
// 构建端口 ID（数字格式优先，即 nodeId_1/2/3/4）
function buildPortId(nodeId, sideOrKey, opts) {
    if (!nodeId) return '';
    let side = sideOrKey;
    if (NG_PORT_KEY_TO_SIDE[sideOrKey]) side = NG_PORT_KEY_TO_SIDE[sideOrKey];
    const def = NG_SIDE_TO_DEF[side]; if (!def) return '';
    const useLetter = opts && opts.letter === true;
    return nodeId + '_' + (useLetter ? def.letter : def.num);
}
// 解析端口ID → { nodeId, side, num, letter }，解析失败返回 null
function parsePortId(portId) {
    if (!portId || typeof portId !== 'string') return null;
    const idx = portId.lastIndexOf('_');
    if (idx <= 0) return null;
    const nodeId = portId.slice(0, idx);
    const key = portId.slice(idx + 1);
    const side = NG_PORT_KEY_TO_SIDE[key];
    if (!side) return null;
    const def = NG_SIDE_TO_DEF[side];
    return { nodeId, side, num: def.num, letter: def.letter, label: def.label };
}
// 边的端口ID兼容：如果有 sourcePortId 优先解析，否则回退 sourceNodeId（默认右端口=4）
function edgeSourcePort(edge) {
    if (edge && edge.sourcePortId) return parsePortId(edge.sourcePortId);
    if (edge && edge.sourceNodeId) return { nodeId: edge.sourceNodeId, side: NG_PORT_SIDE_RIGHT, num: '4', letter: 'r', label: '右' };
    return null;
}
function edgeTargetPort(edge) {
    if (edge && edge.targetPortId) return parsePortId(edge.targetPortId);
    if (edge && edge.targetNodeId) return { nodeId: edge.targetNodeId, side: NG_PORT_SIDE_LEFT, num: '2', letter: 'l', label: '左' };
    return null;
}

// 活跃的节点图实例映射：tabId → engine
const nodeGraphInstances = {};
// 嵌入节点图实例：safeId → engine
var embeddedNodeGraphs = (typeof embeddedNodeGraphs !== 'undefined') ? embeddedNodeGraphs : {};
// 节点图默认设置（可被 settings.json 覆盖）
var ngDefaultSettings = (typeof ngDefaultSettings !== 'undefined') ? ngDefaultSettings : { hideArrowByDefault: false };

// ========== 节点/连线 类型定义（UI 显示用） ==========
const NG_NODE_TYPES = {
    character: { label: '角色', shape: 'rect',    color: '#ff6b6b', stroke: '#ff4d4f', radius: 8, width: 180, height: 50 },
    scene:     { label: '场景', shape: 'rect',    color: '#4a90d9', stroke: '#2f7dd6', radius: 4, width: 160, height: 50 },
    event:     { label: '事件', shape: 'ellipse', color: '#52c41a', stroke: '#389e0d', radius: 0, width: 160, height: 70 },
    setting:   { label: '设定', shape: 'diamond', color: '#722ed1', stroke: '#531dab', radius: 0, width: 160, height: 80 },
    chapter:   { label: '章节', shape: 'rect',    color: '#fa8c16', stroke: '#d46b08', radius: 4, width: 160, height: 50 },
    // 流程模式特殊节点
    start:     { label: '起点',  shape: 'rounded',  color: '#52c41a', stroke: '#389e0d', radius: 20, width: 120, height: 44 },
    end:       { label: '终点',    shape: 'rounded',  color: '#ff4d4f', stroke: '#cf1322', radius: 20, width: 120, height: 44 },
    condition: { label: '条件判断', shape: 'diamond', color: '#faad14', stroke: '#d48806', radius: 0, width: 140, height: 80 },
    process:   { label: '处理',  shape: 'rect',    color: '#4a90d9', stroke: '#2f7dd6', radius: 4, width: 150, height: 50 },
    subprocess:{ label: '子流程',shape: 'rect',   color: '#5b8def', stroke: '#3d6dcf', radius: 4, width: 150, height: 50 },
    merge:     { label: '合并',   shape: 'diamond',  color: '#8c8c8c', stroke: '#595959', radius: 0, width: 120, height: 60 },
};
const LF_SHAPE_TO_NG = { ellipse: 'event', diamond: 'setting', circle: 'character', rect: 'character' };
function resolveNGType(node) {
    const p = node.properties || {};
    if (p.ngType) return p.ngType;
    if (NG_NODE_TYPES[node.type]) return node.type;
    return LF_SHAPE_TO_NG[node.type] || 'character';
}
// 连线类型
const NG_EDGE_TYPES = {
    relation:  { label: '关系', color: '#4a90d9', dash: null,    arrow: true,  desc: '角色↔角色：朋友/敌人/亲属' },
    timeline:  { label: '时序', color: '#52c41a', dash: null,    arrow: true,  desc: '事件→事件：之前/之后/并行' },
    causality: { label: '因果', color: '#fa8c16', dash: '6,4',   arrow: true,  desc: '原因→结果' },
    contain:   { label: '所属', color: '#722ed1', dash: null,    arrow: false, desc: '场景包含角色' },
};
// 暴露到全局，供 quill-blots.js 缩略图生成使用
window.NG_EDGE_TYPES = NG_EDGE_TYPES;
// 旧类型名映射（向后兼容）
const OLD_EDGE_TYPE_MAP = {
    cause: 'causality', causal: 'causality', sequence: 'timeline',
    time: 'timeline', containment: 'contain', belongsTo: 'contain',
    associate: 'relation', friend: 'relation', relation: 'relation',
};

// ========== 数据迁移 / 格式兼容 ==========
function migrateNodeGraphData(data) {
    if (!data || !data.nodes) return { version: 2, viewport: { scale: 1, tx: 0, ty: 0 }, nodes: [], edges: [] };
    let _migSeq = 0; // 自增序列，确保迁移时生成的 ID 不重复
    const result = {
        version: 2,
        viewport: data.viewport || { scale: 1, tx: 0, ty: 0 },
        nodes: data.nodes.map(n => {
            const ngType = resolveNGType(n);
            const def = NG_NODE_TYPES[ngType];
            const props = { ...(n.properties || {}) };
            props.ngType = ngType;
            if (!props.color) props.color = def.color;
            if (!props.width) props.width = def.width;
            if (!props.height) props.height = def.height;
            const width = n.width || props.width || def.width;
            const height = n.height || props.height || def.height;
            return {
                id: n.id,
                type: ngType,
                mode: n.mode || 'relation',
                x: n.x, y: n.y,
                width, height,
                text: typeof n.text === 'object' ? (n.text.value || n.label || '') : (n.text || n.label || ''),
                properties: props,
            };
        }),
        edges: (data.edges || []).map(e => {
            const rawType = (e.properties && e.properties.edgeType) || e.type || 'relation';
            const edgeType = OLD_EDGE_TYPE_MAP[rawType] || rawType;
            const def = NG_EDGE_TYPES[edgeType] || NG_EDGE_TYPES.relation;
            const props = { ...(e.properties || {}) };
            props.edgeType = edgeType;
            // 仅在缺失时填充类型默认值，保留用户自定义的颜色/虚线/箭头设置
            if (!props.color) props.color = def.color;
            if (props.dash === undefined) props.dash = def.dash;
            if (props.showArrow === undefined) props.showArrow = def.arrow;

            // 兼容旧格式：优先解析已有 sourcePortId/targetPortId，否则由 sourceNodeId/targetNodeId 推导默认端口
            let srcNodeId = e.sourceNodeId || e.source || null;
            let tgtNodeId = e.targetNodeId || e.target || null;
            let sourcePortId = e.sourcePortId || null;
            let targetPortId = e.targetPortId || null;
            const srcParsed = parsePortId(sourcePortId);
            const tgtParsed = parsePortId(targetPortId);
            if (srcParsed) srcNodeId = srcParsed.nodeId;
            if (tgtParsed) tgtNodeId = tgtParsed.nodeId;
            if (srcNodeId && !sourcePortId) sourcePortId = buildPortId(srcNodeId, NG_PORT_SIDE_RIGHT); // 默认 右(4) 出
            if (tgtNodeId && !targetPortId) targetPortId = buildPortId(tgtNodeId, NG_PORT_SIDE_LEFT);  // 默认 左(2) 入
            return {
                id: e.id || ('e_' + Date.now() + '_' + (++_migSeq) + '_' + Math.random().toString(36).slice(2, 7)),
                type: edgeType,
                sourcePortId, targetPortId,
                sourceNodeId: srcNodeId, targetNodeId: tgtNodeId,
                text: typeof e.text === 'object' ? (e.text.value || e.label || '') : (e.text || e.label || ''),
                properties: props,
            };
        }),
    };
    return result;
}
// 保存时统一用引擎格式（version=2，含端口ID）
function toSaveFormat(engine) {
    // 保存当前视口 + 画布尺寸（用于缩略图还原摄像机位置）
    const vp = { ...engine.data.viewport };
    if (engine.container) {
        vp.canvasWidth = engine.container.clientWidth;
        vp.canvasHeight = engine.container.clientHeight;
    }
    return {
        version: 2,
        viewport: vp,
        nodes: engine.data.nodes.map(n => ({ ...n })),
        edges: engine.data.edges.map(e => ({
            ...e,
            sourcePortId: e.sourcePortId, targetPortId: e.targetPortId,
            sourceNodeId: e.sourceNodeId, targetNodeId: e.targetNodeId,
        })),
    };
}

// ========== NGEngine：纯 SVG 节点图引擎 ==========
class NGEngine {
    constructor(container, options = {}) {
        this.container = container;
        this.data = { version: 1, viewport: { scale: 1, tx: 0, ty: 0 }, nodes: [], edges: [] };
        this.selectedNodeIds = new Set();
        this.selectedEdgeIds = new Set();
        this.onChange = options.onChange || (() => {});
        this.onSelectionChange = options.onSelectionChange || (() => {});
        this.undoStack = [];
        this.redoStack = [];
        this.activeTool = null; // node type: character/scene/... or null (select)
        this.activeEdgeType = null; // edge type or null
        this.continuousDraw = false; // 连续绘制模式：创建后不自动返回选择
        this.onToolChange = null; // 工具/线型变化时的回调（供工具栏同步 UI）

        // Hover 高亮状态
        this._hoveredNodeId = null; // 当前悬停的节点 ID
        this._hoveredEdgeIds = new Set(); // 与悬停节点相连的连线 ID

        // 图模式：'relation' (关系图 - 全端口，自由连接) | 'flow' (流程 - 只有左入右出，单向拓扑)
        this.mode = 'relation';
        if (options.mode) this.mode = options.mode === 'flow' ? 'flow' : 'relation';

        // ========== 执行模拟状态 ==========
        this.simState = 'idle'; // 'idle' | 'running' | 'waiting' | 'finished'
        this.simHighlightedNodeIds = new Set();
        this.simHighlightedEdgeIds = new Set();
        this.simActiveNodes = [];      // 当前正在执行的节点 ID 列表
        this.simVisitedNodes = new Set(); // 已访问节点（防循环）
        this.simTotalSteps = 0;       // 总执行步数
        this.simPendingChoice = null; // 条件节点选择分支：{ nodeId, edgeIds: [...] }
        // 模拟回调
        this.onSimUpdate = options.onSimUpdate || null;
        this._t = options.t || null; // 翻译函数引用
        // ========== 执行模拟状态 END ==========

        // 内部状态（交互时使用）
        this._creatingEdge = null; // { fromNodeId, fromPort, tempPathEl }

        this._id = 'nge_' + Math.random().toString(36).slice(2, 9);
        this._build();
        this._bindGlobal();
    }

    destroy() {
        if (this._ro) this._ro.disconnect();
        document.removeEventListener('mousemove', this._docMouseMove, true);
        document.removeEventListener('mouseup', this._docMouseUp, true);
        document.removeEventListener('keydown', this._docKeydown);
        window.removeEventListener('resize', this._winResize);
        if (this.root.parentNode) this.root.parentNode.removeChild(this.root);
        if (this.overlayHost && this.overlayHost.parentNode) this.overlayHost.parentNode.removeChild(this.overlayHost);
    }

    // ========== Public API ==========

    loadData(rawData) {
        this.data = migrateNodeGraphData(rawData);
        this._dedupeIds(); // 确保 ID 唯一，冲突时重新生成
        this.selectedNodeIds.clear();
        this.selectedEdgeIds.clear();
        this.undoStack.length = 0;
        this.redoStack.length = 0;
        this._snapshot();
        this._applyViewport();
        this._renderAll();
    }

    // 确保 nodes/edges 的 ID 唯一。冲突时重新生成 ID，并同步更新 edges 中的 nodeId 与 portId
    _dedupeIds() {
        const seenNodeIds = new Set();
        const idMap = {}; // oldId → newId
        let _idSeq = 0; // 自增序列，确保同一批次内生成的 ID 不重复
        for (const n of this.data.nodes) {
            if (!n.id || seenNodeIds.has(n.id)) {
                let newId;
                do {
                    newId = 'n_' + Date.now() + '_' + (++_idSeq) + '_' + Math.random().toString(36).slice(2, 7);
                } while (seenNodeIds.has(newId) || this.data.nodes.some(x => x.id === newId && x !== n));
                if (n.id) idMap[n.id] = newId;
                n.id = newId;
            }
            seenNodeIds.add(n.id);
        }
        const seenEdgeIds = new Set();
        for (const e of this.data.edges) {
            // 同步 sourceNodeId/targetNodeId
            if (idMap[e.sourceNodeId]) e.sourceNodeId = idMap[e.sourceNodeId];
            if (idMap[e.targetNodeId]) e.targetNodeId = idMap[e.targetNodeId];
            // 同步 sourcePortId/targetPortId 中的 nodeId 段
            if (e.sourcePortId) {
                const sp = parsePortId(e.sourcePortId);
                if (sp && idMap[sp.nodeId]) e.sourcePortId = buildPortId(idMap[sp.nodeId], sp.side);
            }
            if (e.targetPortId) {
                const tp = parsePortId(e.targetPortId);
                if (tp && idMap[tp.nodeId]) e.targetPortId = buildPortId(idMap[tp.nodeId], tp.side);
            }
            // 兜底：如果缺 portId，补齐（按 sourceNodeId/targetNodeId 的默认 右出左入）
            if (!e.sourcePortId && e.sourceNodeId) e.sourcePortId = buildPortId(e.sourceNodeId, NG_PORT_SIDE_RIGHT);
            if (!e.targetPortId && e.targetNodeId) e.targetPortId = buildPortId(e.targetNodeId, NG_PORT_SIDE_LEFT);
            if (!e.id || seenEdgeIds.has(e.id)) {
                let newId;
                do {
                    newId = 'e_' + Date.now() + '_' + (++_idSeq) + '_' + Math.random().toString(36).slice(2, 7);
                } while (seenEdgeIds.has(newId) || this.data.edges.some(x => x.id === newId && x !== e));
                e.id = newId;
            }
            seenEdgeIds.add(e.id);
        }
    }

    getData() { return toSaveFormat(this); }

    undo() {
        if (this.undoStack.length <= 1) return;
        // 将当前状态保存到 redo 栈
        this.redoStack.push(JSON.parse(JSON.stringify({
            nodes: this.data.nodes,
            edges: this.data.edges,
            viewport: this.data.viewport,
        })));
        // 弹出并恢复上一个状态
        const snap = this.undoStack.pop();
        this._restoreSnapshot(snap);
    }
    redo() {
        if (this.redoStack.length === 0) return;
        // 将当前状态保存到 undo 栈
        this.undoStack.push(JSON.parse(JSON.stringify({
            nodes: this.data.nodes,
            edges: this.data.edges,
            viewport: this.data.viewport,
        })));
        if (this.undoStack.length > 50) this.undoStack.shift();
        // 弹出并恢复 redo 状态
        const snap = this.redoStack.pop();
        this._restoreSnapshot(snap);
    }

    setActiveTool(toolType) {
        this.activeTool = toolType;
        // 只在切换到"具体节点创建工具"时才清空连线类型；toolType=null（取消工具）保留连线类型
        // 之前的错误：任何情况下都清空，导致工具栏 setActiveEdge 刚设完 activeEdgeType 就被 setActiveTool(null) 冲掉
        if (toolType) this.activeEdgeType = null;
        this._updateCursor();
        this._updateOverlayMode();
        if (this.onToolChange) try { this.onToolChange(); } catch (_) {}
    }
    setActiveEdge(edgeType) {
        this.activeEdgeType = edgeType;
        if (edgeType) {
            this.activeTool = null; // 切换到连线模式时，节点工具模式取消（此时 toolType=null，不会反向冲掉 activeEdgeType）
            if (this._creatingEdge) this._abortCreatingEdge();
        }
        this._updateCursor();
        this._updateOverlayMode();
        this._renderNodes(); // 立即刷新端口显示（连线模式所有节点显示端口）
        if (this.onToolChange) try { this.onToolChange(); } catch (_) {}
    }

    getSelectedNodeIds() { return [...this.selectedNodeIds]; }
    getSelectedNodeId() { return this.selectedNodeIds.size === 1 ? [...this.selectedNodeIds][0] : null; }
    getSelectedEdgeIds() { return [...this.selectedEdgeIds]; }
    getSelectedEdgeId() { return this.selectedEdgeIds.size === 1 ? [...this.selectedEdgeIds][0] : null; }
    getNode(id) { return this.data.nodes.find(n => n.id === id) || null; }
    // 根据端口ID（或 side + nodeId）返回端口在 graph 坐标系中的坐标 {x,y,side}，失败返回 null
    getPortPosition(nodeIdOrPortId, sideKey) {
        let nodeId, side;
        if (sideKey === undefined || sideKey === null) {
            const parsed = parsePortId(nodeIdOrPortId);
            if (!parsed) return null;
            nodeId = parsed.nodeId; side = parsed.side;
        } else {
            nodeId = nodeIdOrPortId;
            side = NG_PORT_KEY_TO_SIDE[sideKey] || sideKey;
        }
        const node = this.getNode(nodeId); if (!node) return null;
        const ports = this._nodePorts(node);
        if (!ports[side]) return null;
        return { side, ...ports[side] };
    }

    deleteSelected() {
        if (this.selectedNodeIds.size === 0 && this.selectedEdgeIds.size === 0) return;
        this._snapshot();
        this.data.nodes = this.data.nodes.filter(n => !this.selectedNodeIds.has(n.id));
        // 移除连接已删节点的边
        this.data.edges = this.data.edges.filter(e => {
            if (this.selectedEdgeIds.has(e.id)) return false;
            if (this.selectedNodeIds.has(e.sourceNodeId)) return false;
            if (this.selectedNodeIds.has(e.targetNodeId)) return false;
            return true;
        });
        this.selectedNodeIds.clear();
        this.selectedEdgeIds.clear();
        this._renderAll();
        this._emitChange();
        this._emitSelection();
    }

    duplicateSelected() {
        if (this.selectedNodeIds.size === 0) return;
        this._snapshot();
        const oldIds = new Set(this.selectedNodeIds);
        const offset = 30;
        let _dupSeq = 0;
        const newNodes = [];
        this.data.nodes.forEach(n => {
            if (oldIds.has(n.id)) {
                const copy = JSON.parse(JSON.stringify(n));
                copy.id = 'n_' + Date.now() + '_' + (++_dupSeq) + '_' + Math.random().toString(36).slice(2, 7);
                copy.x += offset;
                copy.y += offset;
                newNodes.push(copy);
            }
        });
        this.data.nodes.push(...newNodes);
        this.selectedNodeIds.clear();
        this.selectedEdgeIds.clear();
        newNodes.forEach(n => this.selectedNodeIds.add(n.id));
        this._renderAll();
        this._emitChange();
        this._emitSelection();
    }

    get zoom() { return this.data.viewport.scale; }
    get tx() { return this.data.viewport.tx; }
    get ty() { return this.data.viewport.ty; }
    zoomTo(scale, center) {
        scale = Math.max(0.2, Math.min(4, scale));
        const oldScale = this.data.viewport.scale;
        if (Math.abs(scale - oldScale) < 1e-4) return; // 无变化跳过，避免无谓重渲染
        const ratio = scale / oldScale;
        let cx, cy;
        if (center) {
            const rect = this.container.getBoundingClientRect();
            cx = center.x - rect.left; cy = center.y - rect.top;
        } else {
            cx = this.container.offsetWidth / 2; cy = this.container.offsetHeight / 2;
        }
        // 保持中心点位置不变
        this.data.viewport.tx = cx - (cx - this.tx) * ratio;
        this.data.viewport.ty = cy - (cy - this.ty) * ratio;
        this.data.viewport.scale = scale;
        this._applyViewport();
        // 【修复滚轮缩放文字不更新】文字/标签/连线的 font-size / 命中带 都跟当前 zoom 绑定，必须重渲染
        this._renderAll();
        // 通知外部（若绑定了 zoomLabel 显示百分比）
        if (typeof this.onZoomChange === 'function') {
            try { this.onZoomChange(Math.round(this.zoom * 100)); } catch (_) {}
        }
    }
    zoomReset() {
        this.data.viewport.scale = 1;
        this.data.viewport.tx = 0;
        this.data.viewport.ty = 0;
        this._applyViewport();
        this._renderAll(); // 同上，文字字号需要重算
    }

    clientToGraph(clientX, clientY) {
        const rect = this.container.getBoundingClientRect();
        const lx = clientX - rect.left;
        const ly = clientY - rect.top;
        return {
            x: (lx - this.data.viewport.tx) / this.data.viewport.scale,
            y: (ly - this.data.viewport.ty) / this.data.viewport.scale,
        };
    }
    graphToLocal(gx, gy) {
        return {
            x: gx * this.data.viewport.scale + this.data.viewport.tx,
            y: gy * this.data.viewport.scale + this.data.viewport.ty,
        };
    }

    addNode(ngType, x, y, text, width, height) {
        const def = NG_NODE_TYPES[ngType];
        if (!def) return null;
        this._snapshot();
        const id = 'n_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        const node = {
            id, type: ngType, mode: this.mode,
            x, y,
            width: width || def.width,
            height: height || def.height,
            text: text || (t ? t('ui.ng_node_type_' + ngType) : null) || def.label,
            properties: { ngType, color: def.color, description: '', tags: [], linkedFiles: [] },
        };
        this.data.nodes.push(node);
        this._renderAll();
        this._emitChange();
        return id;
    }

    updateNode(id, patch, opts) {
        const node = this.getNode(id);
        if (!node) return;
        if (!opts || !opts.skipSnapshot) this._snapshot();
        Object.assign(node, patch);
        if (patch.properties) node.properties = { ...node.properties, ...patch.properties };
        this._renderAll();
        this._emitChange();
    }

    getEdge(id) { return this.data.edges.find(e => e.id === id) || null; }

    updateEdge(id, patch, opts) {
        const edge = this.getEdge(id);
        if (!edge) return;
        if (!opts || !opts.skipSnapshot) this._snapshot();
        Object.assign(edge, patch);
        if (patch.properties) edge.properties = { ...edge.properties, ...patch.properties };
        this._renderAll();
        this._emitChange();
    }

    // ========== 力导向布局（关系模式） ==========
    _forceLayout() {
        const nodes = this.data.nodes;
        const edges = this.data.edges;
        if (nodes.length === 0) return;
        this._snapshot();
        // 初始化：如果节点位置重合，在中心附近随机散布
        const cx = nodes.reduce((s, n) => s + n.x, 0) / nodes.length || 0;
        const cy = nodes.reduce((s, n) => s + n.y, 0) / nodes.length || 0;
        const hasOverlap = nodes.some(n => {
            return nodes.some(m => m !== n && Math.abs(m.x - n.x) < 5 && Math.abs(m.y - n.y) < 5);
        });
        if (hasOverlap) {
            const spread = Math.max(200, nodes.length * 40);
            nodes.forEach((n, i) => {
                const angle = (2 * Math.PI * i) / nodes.length;
                n.x = cx + spread * Math.cos(angle);
                n.y = cy + spread * Math.sin(angle);
            });
        }
        // 力导向参数
        const repulsion = 8000;    // 节点间斥力
        const attraction = 0.005;  // 边的弹簧引力
        const gravity = 0.002;     // 引力（向中心聚拢）
        const damping = 0.85;      // 速度衰减
        const minDist = 30;        // 最小距离防止爆炸
        const iterations = 120;
        // 初始化速度
        const vel = nodes.map(() => ({ vx: 0, vy: 0 }));
        for (let iter = 0; iter < iterations; iter++) {
            const temp = 1 - iter / iterations; // 温度：随迭代递减
            // 斥力：所有节点对
            for (let i = 0; i < nodes.length; i++) {
                for (let j = i + 1; j < nodes.length; j++) {
                    const a = nodes[i], b = nodes[j];
                    let dx = b.x - a.x, dy = b.y - a.y;
                    let dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < minDist) { dist = minDist; dx = (dx || 1) * minDist; dy = (dy || 1) * minDist; }
                    const force = repulsion / (dist * dist);
                    const fx = (dx / dist) * force;
                    const fy = (dy / dist) * force;
                    vel[i].vx -= fx; vel[i].vy -= fy;
                    vel[j].vx += fx; vel[j].vy += fy;
                }
            }
            // 引力：沿边的弹簧
            for (const e of edges) {
                const src = nodes.find(n => n.id === e.sourceNodeId);
                const tgt = nodes.find(n => n.id === e.targetNodeId);
                if (!src || !tgt) continue;
                const dx = tgt.x - src.x, dy = tgt.y - src.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const force = attraction * (dist - 200); // 理想长度 200px
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;
                vel[src.id] = vel[src.id] || vel[nodes.findIndex(n => n.id === src.id)];
                vel[tgt.id] = vel[tgt.id] || vel[nodes.findIndex(n => n.id === tgt.id)];
                const si = nodes.indexOf(src), ti = nodes.indexOf(tgt);
                if (si >= 0) { vel[si].vx += fx; vel[si].vy += fy; }
                if (ti >= 0) { vel[ti].vx -= fx; vel[ti].vy -= fy; }
            }
            // 中心引力
            const centerX = cx, centerY = cy;
            for (let i = 0; i < nodes.length; i++) {
                const dx = centerX - nodes[i].x, dy = centerY - nodes[i].y;
                vel[i].vx += dx * gravity * temp;
                vel[i].vy += dy * gravity * temp;
            }
            // 更新位置
            for (let i = 0; i < nodes.length; i++) {
                vel[i].vx *= damping;
                vel[i].vy *= damping;
                // 速度限制
                const maxSpeed = 50 * temp;
                const speed = Math.sqrt(vel[i].vx * vel[i].vx + vel[i].vy * vel[i].vy);
                if (speed > maxSpeed) {
                    vel[i].vx = (vel[i].vx / speed) * maxSpeed;
                    vel[i].vy = (vel[i].vy / speed) * maxSpeed;
                }
                nodes[i].x += vel[i].vx;
                nodes[i].y += vel[i].vy;
            }
        }
        // 自动缩放适配全部节点
        this._zoomToFit();
        this._renderAll();
        this._emitChange();
    }

    // ========== 分层布局（流程模式：从左到右） ==========
    _hierarchicalLayout() {
        const nodes = this.data.nodes;
        const edges = this.data.edges;
        if (nodes.length === 0) return;
        this._snapshot();

        // 1. 构建邻接表
        const outgoing = {}; // nodeId → [targetNodeId]
        const incoming = {}; // nodeId → [sourceNodeId]
        for (const n of nodes) {
            outgoing[n.id] = [];
            incoming[n.id] = [];
        }
        for (const e of edges) {
            if (e.sourceNodeId && e.targetNodeId) {
                if (outgoing[e.sourceNodeId]) outgoing[e.sourceNodeId].push(e.targetNodeId);
                if (incoming[e.targetNodeId]) incoming[e.targetNodeId].push(e.sourceNodeId);
            }
        }

        // 2. 最长路径法分配层级（从源节点出发）
        const layer = {};
        const queue = [];
        for (const n of nodes) {
            if (incoming[n.id].length === 0) {
                layer[n.id] = 0;
                queue.push(n.id);
            }
        }
        // 没有源节点（全有入边），从第一个节点开始
        if (queue.length === 0 && nodes.length > 0) {
            layer[nodes[0].id] = 0;
            queue.push(nodes[0].id);
        }

        const visited = new Set();
        while (queue.length > 0) {
            const cur = queue.shift();
            if (visited.has(cur)) continue;
            visited.add(cur);
            for (const tgt of (outgoing[cur] || [])) {
                layer[tgt] = Math.max(layer[tgt] || 0, layer[cur] + 1);
                if (!visited.has(tgt)) queue.push(tgt);
            }
        }

        // 未分配层级的孤立节点归入第 0 层
        let maxLayer = 0;
        for (const n of nodes) {
            if (layer[n.id] === undefined) layer[n.id] = 0;
            maxLayer = Math.max(maxLayer, layer[n.id]);
        }

        // 3. 按层级分组
        const layers = {};
        for (const n of nodes) {
            const l = layer[n.id];
            if (!layers[l]) layers[l] = [];
            layers[l].push(n.id);
        }

        // 4. 计算每层最大节点尺寸
        const hGap = 80, vGap = 50;
        const defW = 140, defH = 50;
        const layerMaxW = {}, layerMaxH = {};
        for (let l = 0; l <= maxLayer; l++) {
            let mw = 0, mh = 0;
            for (const nid of (layers[l] || [])) {
                const n = this.getNode(nid);
                if (n) { mw = Math.max(mw, n.width || defW); mh = Math.max(mh, n.height || defH); }
            }
            layerMaxW[l] = mw || defW;
            layerMaxH[l] = mh || defH;
        }

        // 5. 定位节点（居中布局）
        let totalW = 0;
        for (let l = 0; l <= maxLayer; l++) totalW += layerMaxW[l];
        totalW += maxLayer * hGap;
        let startX = -totalW / 2;
        for (let l = 0; l <= maxLayer; l++) {
            const layerNodes = layers[l] || [];
            const nodeH = layerMaxH[l] || defH;
            const totalH = layerNodes.length * nodeH + (layerNodes.length - 1) * vGap;
            let startY = -totalH / 2 + nodeH / 2;
            for (let i = 0; i < layerNodes.length; i++) {
                const n = this.getNode(layerNodes[i]);
                if (!n) continue;
                n.x = startX + layerMaxW[l] / 2;
                n.y = startY + i * (nodeH + vGap);
            }
            startX += layerMaxW[l] + hGap;
        }

        // 6. 自动缩放适配
        this._zoomToFit();
        this._renderAll();
        this._emitChange();
    }

    // ========== 自动排版入口（按模式分发） ==========
    autoLayout(layoutType) {
        if (this._isReadonly()) return;
        // 默认（手动拖拽）：跳过排版
        if (layoutType === 'manual') return;
        if (layoutType === 'force' || (!layoutType && this.mode !== 'flow' && this.mode !== 'timeline')) {
            this._forceLayout();
        } else if (layoutType === 'chapter' || layoutType === 'timestamp' || this.mode === 'timeline') {
            this._timelineLayout(layoutType);
        } else if (this.mode === 'flow') {
            this._hierarchicalLayout();
        } else {
            this._forceLayout();
        }
    }

    // ========== 时间线布局 ==========
    _timelineLayout(sortBy) {
        const nodes = this.data.nodes || [];
        const edges = this.data.edges || [];
        if (nodes.length === 0) return;

        // 收集节点的时间线属性
        const headNodeId = this._timelineHeadId || null;
        const nodeTimeline = {};
        for (const n of nodes) {
            const p = n.properties || {};
            nodeTimeline[n.id] = {
                order: p.timelineOrder != null ? parseInt(p.timelineOrder, 10) : null,
                timestamp: p.timestamp || '',
                chapterRef: p.chapterRef || '',
                isHead: p.isHead === true,
                isTail: p.isTail === true,
            };
        }

        // 确定头节点
        const isChapterSort = sortBy === 'chapter';
        const isTimestampSort = sortBy === 'timestamp';

        let orderedNodes = [];
        if (headNodeId && this.getNode(headNodeId)) {
            orderedNodes.push(headNodeId);
        } else {
            const headCandidates = nodes.filter(n => (n.properties && n.properties.isHead) === true);
            if (headCandidates.length > 0) {
                orderedNodes = headCandidates.map(n => n.id);
            } else if (isChapterSort) {
                // 按章节排序：拥有章节引用的节点优先，无章节引用的排后面
                const withChapter = nodes.filter(n => nodeTimeline[n.id].chapterRef);
                const withoutChapter = nodes.filter(n => !nodeTimeline[n.id].chapterRef);
                orderedNodes = withChapter.concat(withoutChapter).map(n => n.id);
            } else if (isTimestampSort) {
                // 按时间戳排序：拥有时间戳的节点优先
                const withTs = nodes.filter(n => nodeTimeline[n.id].timestamp);
                const withoutTs = nodes.filter(n => !nodeTimeline[n.id].timestamp);
                orderedNodes = withTs.concat(withoutTs).map(n => n.id);
            } else {
                // 找入度为 0 的节点
                const targetIds = new Set();
                for (const e of edges) {
                    if (e.targetNodeId) targetIds.add(e.targetNodeId);
                }
                const startNodes = nodes.filter(n => !targetIds.has(n.id));
                orderedNodes = startNodes.length > 0 ? startNodes.map(n => n.id) : [nodes[0].id];
            }
        }

        // 排序逻辑
        if (isChapterSort) {
            // 按章节引用排序
            orderedNodes.sort((a, b) => {
                const refA = nodeTimeline[a].chapterRef;
                const refB = nodeTimeline[b].chapterRef;
                if (!refA && !refB) return 0;
                if (!refA) return 1;
                if (!refB) return -1;
                return refA.localeCompare(refB, 'zh-CN');
            });
        } else if (isTimestampSort) {
            // 按时间戳排序
            orderedNodes.sort((a, b) => {
                const tsA = nodeTimeline[a].timestamp;
                const tsB = nodeTimeline[b].timestamp;
                if (!tsA && !tsB) return 0;
                if (!tsA) return 1;
                if (!tsB) return -1;
                return tsA.localeCompare(tsB);
            });
        } else {
            // 广度优先遍历：从已排序的节点出发，沿连线收集后续节点
            const visited = new Set(orderedNodes);
            const queue = [...orderedNodes];
            while (queue.length > 0) {
                const cur = queue.shift();
                for (const e of edges) {
                    if (e.sourceNodeId === cur && e.targetNodeId && !visited.has(e.targetNodeId)) {
                        visited.add(e.targetNodeId);
                        orderedNodes.push(e.targetNodeId);
                        queue.push(e.targetNodeId);
                    }
                }
            }
            // 追加未访问到的孤立节点
            for (const n of nodes) {
                if (!visited.has(n.id)) {
                    orderedNodes.push(n.id);
                    visited.add(n.id);
                }
            }
            // 按用户指定的 order 排序（如果有）
            const hasOrder = orderedNodes.some(id => nodeTimeline[id] && nodeTimeline[id].order != null);
            if (hasOrder) {
                orderedNodes.sort((a, b) => {
                    const oa = nodeTimeline[a] && nodeTimeline[a].order;
                    const ob = nodeTimeline[b] && nodeTimeline[b].order;
                    if (oa == null && ob == null) return 0;
                    if (oa == null) return 1;
                    if (ob == null) return -1;
                    return oa - ob;
                });
            }
        }

        // 将节点分为章节节点和时间节点两列
        const chapterNodes = []; // type === 'chapter'
        const timeNodes = [];    // 有 timestamp 的节点
        const otherNodes = [];   // 其他节点
        for (const id of orderedNodes) {
            const n = this.getNode(id);
            if (!n) continue;
            if (n.type === 'chapter') {
                chapterNodes.push(id);
            } else if (nodeTimeline[id] && nodeTimeline[id].timestamp) {
                timeNodes.push(id);
            } else {
                otherNodes.push(id);
            }
        }

        // 布局参数
        const hGap = 60, vGap = 40;
        const defW = 160, defH = 50;
        const colW = Math.max(defW, 180);

        // 计算列数：章节列 + 时间列 + 其他列
        const columns = [];
        if (chapterNodes.length > 0) columns.push({ label: '章节', ids: chapterNodes });
        if (timeNodes.length > 0) columns.push({ label: '时间', ids: timeNodes });
        if (otherNodes.length > 0) columns.push({ label: '其他', ids: otherNodes });

        // 定位节点
        let startX = -(columns.length * colW + (columns.length - 1) * hGap) / 2 + colW / 2;
        for (const col of columns) {
            const ids = col.ids;
            const totalH = ids.length * defH + (ids.length - 1) * vGap;
            let startY = -totalH / 2 + defH / 2;
            for (const id of ids) {
                const n = this.getNode(id);
                if (!n) continue;
                n.x = startX;
                n.y = startY;
                n.width = colW;
                n.height = defH;
                startY += defH + vGap;
            }
            startX += colW + hGap;
        }

        // 自动缩放适配
        this._zoomToFit();
        this._renderAll();
        this._emitChange();
    }

    // ========== 执行模拟（同步状态机） ==========

    // 开始模拟：初始化状态机，识别起点
    startSimulation() {
        try {
            if (this.mode !== 'flow') return;
            if (this.data.nodes.length === 0) {
                console.warn('[NG] 流程模拟：图为空');
                return;
            }
            console.log('[NG] 模拟: 开始');
            // 清空之前状态
            this.simState = 'idle';
            this.simHighlightedNodeIds.clear();
            this.simHighlightedEdgeIds.clear();
            // 当前正在执行的节点队列
            this.simActiveNodes = [];
            // 已执行过的节点（防循环）
            this.simVisitedNodes = new Set();
            // 总步数
            this.simTotalSteps = 0;

            // 收集入度信息
            const targetIds = new Set();
            for (const e of this.data.edges) {
                if (e.targetNodeId) targetIds.add(e.targetNodeId);
            }
            // 查找起点
            let startNodes = this.data.nodes.filter(n => n.type === 'start');
            if (startNodes.length === 0) {
                startNodes = this.data.nodes.filter(n => !targetIds.has(n.id));
                if (startNodes.length === 0) startNodes = [this.data.nodes[0]];
            }
            console.log('[NG] 起点:', startNodes.map(n => n.text || n.id));

            // 初始化：标记起点为当前执行
            this.simActiveNodes = startNodes.map(n => n.id);
            this.simVisitedNodes = new Set(startNodes.map(n => n.id));
            // 起点高亮（已执行）
            for (const n of startNodes) {
                this.simHighlightedNodeIds.add(n.id);
            }

            this.simState = 'running';
            this._renderAll();
            this._emitSimUpdate();
        } catch (e) {
            console.error('[NG] 模拟启动失败:', e);
        }
    }

    // 执行一步：从当前活跃节点沿连线流转到下一个节点
    // 遇到条件节点时暂停，等待用户点击分支选择
    stepSimulation() {
        try {
            if (this.simState !== 'running') return;
            this.simTotalSteps++;

            const nextActiveNodes = [];

            for (const nodeId of this.simActiveNodes) {
                const outEdges = this.data.edges.filter(e => e.sourceNodeId === nodeId);
                if (outEdges.length === 0) continue; // 无出度，流程终止

                const node = this.getNode(nodeId);
                const isCondition = node && node.type === 'condition';

                // 条件节点且有多个分支 → 暂停，等待用户选择
                if (isCondition && outEdges.length > 1) {
                    this.simPendingChoice = {
                        nodeId,
                        edgeIds: outEdges.map(e => e.id),
                    };
                    this.simState = 'waiting';
                    // 高亮条件节点的出口边供选择
                    for (const edge of outEdges) {
                        this.simHighlightedEdgeIds.add(edge.id);
                    }
                    this._renderAll();
                    this._emitSimUpdate();
                    console.log('[NG] 模拟: 条件节点', nodeId, '等待选择分支，可用边:', outEdges.map(e => e.id));
                    return;
                }

                // 单出口或非条件节点：直接走所有出口
                for (const edge of outEdges) {
                    const targetId = edge.targetNodeId;
                    if (!this.simVisitedNodes.has(targetId)) {
                        this.simVisitedNodes.add(targetId);
                        nextActiveNodes.push(targetId);
                        this.simHighlightedNodeIds.add(targetId);
                    }
                    this.simHighlightedEdgeIds.add(edge.id);
                }
            }

            // 当前活跃节点变成下一节点
            this.simActiveNodes = nextActiveNodes;

            // 如果没有活跃节点，流程结束
            if (this.simActiveNodes.length === 0) {
                this.simState = 'finished';
                console.log('[NG] 模拟完成，共', this.simTotalSteps, '步');
            }

            this._renderAll();
            this._emitSimUpdate();
        } catch (e) {
            console.error('[NG] 模拟步骤执行失败:', e);
        }
    }

    // 用户选择条件分支后调用。edgeId 为 null 表示取消选择（点击空白）
    chooseSimBranch(edgeId) {
        try {
            if (this.simState !== 'waiting' || !this.simPendingChoice) return;
            if (edgeId === null) {
                // 取消选择：回到上一步状态
                console.log('[NG] 模拟: 取消分支选择');
                this.simPendingChoice = null;
                this.simState = 'running';
                this.simTotalSteps = Math.max(0, this.simTotalSteps - 1);
                // 不前进，保持当前活跃节点不变
                this._renderAll();
                this._emitSimUpdate();
                return;
            }
            if (!this.simPendingChoice.edgeIds.includes(edgeId)) return;

            console.log('[NG] 模拟: 选择分支', edgeId);
            const edge = this.getEdge(edgeId);
            if (!edge) return;

            // 清理选择状态
            this.simPendingChoice = null;
            this.simState = 'running';

            // 走选中的分支
            const targetId = edge.targetNodeId;
            if (!this.simVisitedNodes.has(targetId)) {
                this.simVisitedNodes.add(targetId);
                this.simActiveNodes = [targetId];
                this.simHighlightedNodeIds.add(targetId);
            } else {
                this.simActiveNodes = [];
            }

            this._renderAll();
            this._emitSimUpdate();
        } catch (e) {
            console.error('[NG] 选择分支失败:', e);
        }
    }

    // 重置模拟
    resetSimulation() {
        try {
            this.simState = 'idle';
            this.simHighlightedNodeIds.clear();
            this.simHighlightedEdgeIds.clear();
            this.simActiveNodes = [];
            this.simVisitedNodes = new Set();
            this.simTotalSteps = 0;
            this.simPendingChoice = null;
            this._renderAll();
            this._emitSimUpdate();
            console.log('[NG] 模拟已重置');
        } catch (e) {
            console.error('[NG] 模拟重置失败:', e);
        }
    }

    // 获取当前模拟步骤描述
    getSimStepLabel() {
        if (this.simState === 'idle') return '';
        if (this.simState === 'finished') return '模拟完成';
        if (this.simState === 'waiting') {
            const nodeId = this.simPendingChoice ? this.simPendingChoice.nodeId : '';
            const node = this.getNode(nodeId);
            return `${this._t ? this._t('ui.ng_sim_choose') || '选择分支' : '选择分支'}${node ? ': ' + (node.text || node.id) : ''}`;
        }
        return `第 ${this.simTotalSteps} 步 · 运行中`;
    }

    _emitSimUpdate() {
        if (this.onSimUpdate) {
            try { this.onSimUpdate(this.simState, this.simTotalSteps, 0, this.getSimStepLabel()); } catch (_) {}
        }
    }

    // 自动缩放以适配所有节点
    _zoomToFit() {
        const nodes = this.data.nodes;
        if (nodes.length === 0) return;
        const bbox = this._getContentBBox();
        if (!bbox) return;
        const cw = this.container.clientWidth;
        const ch = this.container.clientHeight;
        if (cw <= 0 || ch <= 0) return;
        const contentW = bbox.maxX - bbox.minX + 100;
        const contentH = bbox.maxY - bbox.minY + 100;
        const scale = Math.min(cw / contentW, ch / contentH, 2);
        const clampedScale = Math.max(0.2, Math.min(4, scale));
        this.data.viewport.scale = clampedScale;
        this.data.viewport.tx = (cw - (bbox.minX + bbox.maxX) / 2 * clampedScale) / 2;
        this.data.viewport.ty = (ch - (bbox.minY + bbox.maxY) / 2 * clampedScale) / 2;
        this._applyViewport();
    }

    // ========== Internal: DOM Build ==========

    _build() {
        const c = this.container;
        c.style.position = 'relative';
        c.style.overflow = 'hidden';
        c.style.userSelect = 'none';

        // SVG 根
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'nge-svg');
        svg.style.position = 'absolute';
        svg.style.left = '0'; svg.style.top = '0';
        svg.style.width = '100%'; svg.style.height = '100%';
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        c.appendChild(svg);
        this.svg = svg;
        this.root = svg;

        // 定义区（动态箭头标记，按颜色创建）
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        defs.innerHTML = '';
        svg.appendChild(defs);
        this._defs = defs;
        this._arrowMarkerCache = {}; // color → markerId

        // 视口变换层（所有节点和连线都放在这里，应用平移缩放）
        const viewport = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        viewport.setAttribute('class', 'nge-viewport');
        svg.appendChild(viewport);
        this.viewportEl = viewport;

        // 子层顺序：gridLayer 在 svg 层（屏幕坐标，不受视口缩放影响，避免缩放变小时点数爆炸卡顿）
        this.gridLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this.gridLayer.setAttribute('class', 'nge-grid');
        svg.appendChild(this.gridLayer);

        // viewport 内部图层顺序（后面的在上层，事件优先命中后面的元素）：
        //  1) edgesVisualLayer : 连线视觉（path/label/highlight），pointer-events 全关 → 不拦截
        //  2) nodesLayer       : 节点层（背景、文字、端口、resize手柄）
        //  3) edgesHitLayer    : 连线命中命中层，放在节点层上面 → 100% 先收到事件；
        //                        handler 内部用 elementFromPoint 反向判定，若点在节点/端口上就手动转发给下层，
        //                        只有在"两节点之间的空白曲线段"才真正处理连线选中。彻底解决"点不中连线"。
        //  4) tempEdgeLayer    : 临时拉线预览，最最上层（不能被拦截）
        this.edgesVisualLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this.edgesVisualLayer.setAttribute('class', 'nge-edges-visual');
        viewport.appendChild(this.edgesVisualLayer);

        this.nodesLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this.nodesLayer.setAttribute('class', 'nge-nodes');
        viewport.appendChild(this.nodesLayer);

        this.edgesHitLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this.edgesHitLayer.setAttribute('class', 'nge-edges-hit');
        viewport.appendChild(this.edgesHitLayer);

        // 兼容别名：旧代码用 this.edgesLayer 渲染视觉部分
        this.edgesLayer = this.edgesVisualLayer;

        this.tempEdgeLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this.tempEdgeLayer.setAttribute('class', 'nge-temp-edges');
        viewport.appendChild(this.tempEdgeLayer);

        // 创建模式遮罩 + 坐标显示 + 选框（放在容器里，用 HTML 定位，坐标用 local/client）
        this.coordsEl = document.createElement('div');
        this.coordsEl.style.cssText = 'position:absolute;left:8px;bottom:8px;font-size:11px;font-family:monospace;color:var(--text-secondary,#888);pointer-events:none;z-index:3;background:rgba(0,0,0,0.03);padding:2px 6px;border-radius:3px;';
        c.appendChild(this.coordsEl);

        // HTML 覆盖层（选框、创建预览矩形）
        this.overlayHost = document.createElement('div');
        this.overlayHost.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:4;';
        c.appendChild(this.overlayHost);

        this.selectionRectEl = null;
        this.createRectEl = null;
        this.creationOverlay = null;

        // 事件绑定
        this._bindSvgEvents();

        // 观察尺寸变化
        this._ro = new ResizeObserver(() => { /* nothing needed now, SVG is 100% */ });
        this._ro.observe(c);
    }

    _bindGlobal() {
        // 全局鼠标事件：拖拽时仍会在文档上移动/抬起
        this._docMouseMove = (e) => this._onMouseMove(e);
        this._docMouseUp = (e) => this._onMouseUp(e);
        document.addEventListener('mousemove', this._docMouseMove, true);
        document.addEventListener('mouseup', this._docMouseUp, true);

        this._docKeydown = (e) => this._onKeydown(e);
        document.addEventListener('keydown', this._docKeydown);

        this._winResize = () => { /* 暂不特殊处理 */ };
        window.addEventListener('resize', this._winResize);
    }

    _bindSvgEvents() {
        const c = this.container;
        // 滚轮缩放（在容器上，passive=false 阻止页面滚动）
        c.addEventListener('wheel', (e) => {
            if (e.ctrlKey || e.metaKey || true) {
                e.preventDefault();
                const delta = -e.deltaY;
                const factor = delta > 0 ? 1.1 : 1 / 1.1;
                this.zoomTo(this.zoom * factor, { x: e.clientX, y: e.clientY });
                this._onCoordsUpdate(e.clientX, e.clientY);
            }
        }, { passive: false });

        // 鼠标移动（用于坐标显示）
        c.addEventListener('mousemove', (e) => this._onCoordsUpdate(e.clientX, e.clientY));
        c.addEventListener('mouseleave', () => { if (this.coordsEl) this.coordsEl.textContent = ''; });

        // 容器级 mousedown（画布空白 → 平移 或 框选 或 创建节点起点）
        this.svg.addEventListener('mousedown', (e) => this._onCanvasMouseDown(e));
        this.svg.addEventListener('dblclick', (e) => this._onCanvasDblClick(e));

        // 上下文菜单
        this.svg.addEventListener('contextmenu', (e) => { e.preventDefault(); });
        c.addEventListener('contextmenu', (e) => { e.preventDefault(); });
    }

    _onCoordsUpdate(clientX, clientY) {
        if (!this.coordsEl) return;
        try {
            const p = this.clientToGraph(clientX, clientY);
            this.coordsEl.textContent = `${Math.round(p.x)}, ${Math.round(p.y)}`;
        } catch {}
    }

    _updateCursor() {
        let cursor = 'grab';
        if (this.activeTool) cursor = 'crosshair';
        else if (this.activeEdgeType) cursor = 'crosshair';
        this.container.style.cursor = cursor;
        if (this.nodesLayer) this.nodesLayer.style.cursor = this.activeEdgeType ? 'crosshair' : 'move';
    }

    _updateOverlayMode() {
        // 创建模式：加一层 overlay 拦截 SVG 内部的节点点击（我们自己处理 mousedown 画矩形）
        if (this.activeTool && !this.creationOverlay) {
            const ov = document.createElement('div');
            ov.style.cssText = 'position:absolute;inset:0;z-index:5;cursor:crosshair;';
            ov.addEventListener('mousedown', (e) => this._onCreateStart(e));
            ov.addEventListener('mousemove', (e) => this._onCoordsUpdate(e.clientX, e.clientY));
            this.container.appendChild(ov);
            this.creationOverlay = ov;
        } else if (!this.activeTool && this.creationOverlay) {
            if (this.creationOverlay.parentNode) this.creationOverlay.parentNode.removeChild(this.creationOverlay);
            this.creationOverlay = null;
            if (this.createRectEl) { this.createRectEl.remove(); this.createRectEl = null; }
        }
    }

    // ========== Internal: Viewport / Render ==========

    _applyViewport() {
        const vp = this.data.viewport;

        // 【限制摄像机平移范围】基于节点 AABB + 动态 padding，阻止视口无限飞到 (99999,99999)
        // —— 坐标语义（由 clientToGraph 反推确认）：g = (l - t) / s
        //    屏幕左上角 0,0 → 世界 = (-tx/s , -ty/s)
        //    屏幕右下角 w,h → 世界 = ((w-tx)/s , (h-ty)/s)
        //    视口世界矩形：[ -tx/s , (w-tx)/s ] × [ -ty/s , (h-ty)/s ]
        //    与 paddedBBox [minX,maxX]×[minY,maxY] 相交 ⇔ 4 个不等式：
        //      -tx/s < maxX     → tx > -s·maxX
        //      (w-tx)/s > minX  → tx < w - s·minX
        //      -ty/s < maxY     → ty > -s·maxY
        //      (h-ty)/s > minY  → ty < h - s·minY
        const bounds = this._getPaddedBounds();
        const w = this.container ? this.container.offsetWidth : 0;
        const h = this.container ? this.container.offsetHeight : 0;
        if (w > 0 && h > 0 && bounds && isFinite(vp.scale) && vp.scale > 0) {
            const s = vp.scale;
            let txMin = -s * bounds.maxX;
            let txMax = w - s * bounds.minX;
            let tyMin = -s * bounds.maxY;
            let tyMax = h - s * bounds.minY;
            // 内容比视口小 → min>max，强行取中点把内容居中（不给乱跑空间）
            if (txMin > txMax) { const m = (txMin + txMax) * 0.5; txMin = txMax = m; }
            if (tyMin > tyMax) { const m = (tyMin + tyMax) * 0.5; tyMin = tyMax = m; }
            if      (vp.tx < txMin) vp.tx = txMin;
            else if (vp.tx > txMax) vp.tx = txMax;
            if      (vp.ty < tyMin) vp.ty = tyMin;
            else if (vp.ty > tyMax) vp.ty = tyMax;
        }

        const { scale, tx, ty } = vp;
        this.viewportEl.setAttribute('transform', `translate(${tx},${ty}) scale(${scale})`);
        this._renderGrid();
    }

    _renderGrid() {
        // gridLayer 在 svg 层（屏幕坐标），用 <pattern> 平铺网格点。
        // pattern 跟随视口平移（tx/ty）但不缩放，保证点大小恒定、数量恒定（始终 1 个 pattern rect），
        // 彻底解决"缩放越小渲染越多越卡"的问题。
        const c = this.container;
        const w = c.offsetWidth, h = c.offsetHeight;
        if (w <= 0 || h <= 0) { this.gridLayer.innerHTML = ''; return; }
        const step = 20; // 屏幕像素间距（固定）
        const dotSize = 1.5;
        const { tx, ty } = this.data.viewport;
        // pattern 的 x/y 跟随平移，使网格点视觉上随画布平移而移动
        const patX = ((tx % step) + step) % step;
        const patY = ((ty % step) + step) % step;
        this.gridLayer.innerHTML = `
            <defs>
                <pattern id="nge-grid-pat-${this._id}" x="${patX}" y="${patY}" width="${step}" height="${step}" patternUnits="userSpaceOnUse">
                    <rect x="${(step - dotSize) / 2}" y="${(step - dotSize) / 2}" width="${dotSize}" height="${dotSize}" fill="rgba(128,128,128,0.3)" style="pointer-events:none"/>
                </pattern>
            </defs>
            <rect x="0" y="0" width="${w}" height="${h}" fill="url(#nge-grid-pat-${this._id})" style="pointer-events:none"/>
        `;
    }

    _renderAll() {
        this._applyViewport();
        this._renderEdges();
        this._renderNodes();
    }

    _nodeBBox(n) {
        // 返回 {left,right,top,bottom} in graph coords
        const hw = n.width / 2, hh = n.height / 2;
        return { left: n.x - hw, right: n.x + hw, top: n.y - hh, bottom: n.y + hh };
    }

    // 节点的 4 个连接端口（中心在边上）
    _nodePorts(n) {
        const b = this._nodeBBox(n);
        const isFlow = (n.mode || 'relation') === 'flow';
        if (isFlow) {
            return {
                left: { x: b.left, y: n.y },
                right: { x: b.right, y: n.y },
            };
        }
        return {
            left: { x: b.left, y: n.y },
            right: { x: b.right, y: n.y },
            top: { x: n.x, y: b.top },
            bottom: { x: n.x, y: b.bottom },
        };
    }

    // 计算所有节点的合并 AABB（世界坐标），没节点返回 null
    _getContentBBox() {
        const nodes = this.data.nodes;
        let minX = +Infinity, minY = +Infinity, maxX = -Infinity, maxY = -Infinity;
        for (let i = 0, L = nodes.length; i < L; i++) {
            const b = this._nodeBBox(nodes[i]);
            if (b.left   < minX) minX = b.left;
            if (b.right  > maxX) maxX = b.right;
            if (b.top    < minY) minY = b.top;
            if (b.bottom > maxY) maxY = b.bottom;
        }
        if (!isFinite(minX)) return null;
        return { minX, minY, maxX, maxY };
    }

    // 内容包围盒 + 动态 padding → 允许视口移动的范围
    //  - 有内容：padding = max(1500px, max(宽,高)×1.5)，小图给足空间，大图也跟随扩展
    //  - 无内容：默认 3200×2400 工作区 + padding，足够画 2-3 个节点
    _getPaddedBounds() {
        const bbox = this._getContentBBox();
        let minX, minY, maxX, maxY;
        if (bbox) {
            ({ minX, minY, maxX, maxY } = bbox);
        } else {
            minX = -800; minY = -600; maxX = 2400; maxY = 1800;
        }
        const bw = maxX - minX;
        const bh = maxY - minY;
        const pad = Math.max(1500, Math.max(bw, bh) * 1.5);
        return {
            minX: minX - pad,
            minY: minY - pad,
            maxX: maxX + pad,
            maxY: maxY + pad,
        };
    }
    _getArrowMarkerId(color) {
        if (this._arrowMarkerCache[color]) return this._arrowMarkerCache[color];
        const id = `${this._id}-arrow-${color.replace('#', '')}`;
        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        marker.setAttribute('id', id);
        marker.setAttribute('viewBox', '0 0 10 10');
        marker.setAttribute('refX', '9');
        marker.setAttribute('refY', '5');
        marker.setAttribute('markerWidth', '8');
        marker.setAttribute('markerHeight', '8');
        marker.setAttribute('orient', 'auto-start-reverse');
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M0,0 L10,5 L0,10 z');
        path.setAttribute('fill', color);
        marker.appendChild(path);
        this._defs.appendChild(marker);
        this._arrowMarkerCache[color] = id;
        return id;
    }

    _pickPort(node, targetPoint) {
        // 返回离 targetPoint 最近的端口 {side, x, y}
        const ports = this._nodePorts(node);
        let best = null, bestD = Infinity;
        for (const side in ports) {
            const p = ports[side];
            const d = (p.x - targetPoint.x) ** 2 + (p.y - targetPoint.y) ** 2;
            if (d < bestD) { bestD = d; best = { side, ...p }; }
        }
        return best;
    }

    // 连线中点（graph 坐标），用于框选命中测试
    _edgeMidpoint(edge) {
        const sp = edgeSourcePort(edge);
        const tp = edgeTargetPort(edge);
        if (!sp || !tp) return null;
        const p1 = this.getPortPosition(sp.nodeId, sp.side);
        const p2 = this.getPortPosition(tp.nodeId, tp.side);
        if (!p1 || !p2) return null;
        return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    }

    // ========== 图层管理：调整节点在 data.nodes 数组中的顺序（SVG 绘制顺序=层级） ==========
    _moveLayer(nodeId, action) {
        const idx = this.data.nodes.findIndex(n => n.id === nodeId);
        if (idx < 0) return;
        const node = this.data.nodes[idx];
        this.data.nodes.splice(idx, 1);
        if (action === 'top') this.data.nodes.push(node);
        else if (action === 'bottom') this.data.nodes.unshift(node);
        else if (action === 'up') this.data.nodes.splice(Math.min(idx + 1, this.data.nodes.length), 0, node);
        else if (action === 'down') this.data.nodes.splice(Math.max(idx - 1, 0), 0, node);
        this._renderAll();
        this._emitChange();
    }
    moveLayerUp(nodeId) { this._snapshot(); this._moveLayer(nodeId, 'up'); }
    moveLayerDown(nodeId) { this._snapshot(); this._moveLayer(nodeId, 'down'); }
    moveLayerTop(nodeId) { this._snapshot(); this._moveLayer(nodeId, 'top'); }
    moveLayerBottom(nodeId) { this._snapshot(); this._moveLayer(nodeId, 'bottom'); }

    _edgePath(edge) {
        const sp = edgeSourcePort(edge);
        const tp = edgeTargetPort(edge);
        if (!sp || !tp) return null;
        const p1 = this.getPortPosition(sp.nodeId, sp.side);
        const p2 = this.getPortPosition(tp.nodeId, tp.side);
        if (!p1 || !p2) return null;
        // 贝塞尔控制点：距离 1/3（按端口方向向外引出）
        const dx = Math.abs(p2.x - p1.x) * 0.5 + 40;
        let c1x, c1y, c2x, c2y;
        if (p1.side === 'left') { c1x = p1.x - dx; c1y = p1.y; }
        else if (p1.side === 'right') { c1x = p1.x + dx; c1y = p1.y; }
        else if (p1.side === 'top') { c1x = p1.x; c1y = p1.y - dx; }
        else { c1x = p1.x; c1y = p1.y + dx; }
        if (p2.side === 'left') { c2x = p2.x - dx; c2y = p2.y; }
        else if (p2.side === 'right') { c2x = p2.x + dx; c2y = p2.y; }
        else if (p2.side === 'top') { c2x = p2.x; c2y = p2.y - dx; }
        else { c2x = p2.x; c2y = p2.y + dx; }
        const d = `M${p1.x},${p1.y} C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
        return { d, labelX: (p1.x + p2.x) / 2, labelY: (p1.y + p2.y) / 2, sourcePoint: p1, targetPoint: p2 };
    }

    // 校验颜色值：确保是合法 #RRGGBB，非法/空时回退默认色
    _normalizeColor(candidate, fallback) {
        if (typeof candidate === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(candidate)) return candidate;
        return fallback || '#4a90d9';
    }

    // 流程模式循环检测：从 targetNodeId 出发沿边方向 BFS，是否能到达 sourceNodeId
    _hasCycle(sourceNodeId, targetNodeId) {
        const visited = new Set();
        const queue = [targetNodeId];
        while (queue.length > 0) {
            const cur = queue.shift();
            if (cur === sourceNodeId) return true;
            if (visited.has(cur)) continue;
            visited.add(cur);
            for (const e of this.data.edges) {
                if (e.sourceNodeId === cur) {
                    queue.push(e.targetNodeId);
                }
            }
        }
        return false;
    }

    // 辅助：临时隐藏"最上层"的覆盖层（edgesHitLayer + tempEdgeLayer）
    // 用 document.elementFromPoint 找到坐标 (clientX,clientY) 处真正属于 nodesLayer 的元素
    _findTopmostNodeElement(clientX, clientY) {
        if (!this.edgesHitLayer || !this.nodesLayer) return null;
        const hitSaved = this.edgesHitLayer.style.display;
        const tempSaved = this.tempEdgeLayer.style.display;
        this.edgesHitLayer.style.display = 'none';
        if (this.tempEdgeLayer) this.tempEdgeLayer.style.display = 'none';
        let el = null;
        try { el = document.elementFromPoint(clientX, clientY); } catch (e) { el = null; }
        this.edgesHitLayer.style.display = hitSaved;
        if (this.tempEdgeLayer) this.tempEdgeLayer.style.display = tempSaved;
        if (!el) return null;
        // 必须是 nodesLayer 内部（或其子孙）的元素：节点 g / 子元素 / 端口 / resize
        try {
            if (el.nodeType !== 1) return null;
            // 向上找 data-node-id 或 data-port-side
            if (el.closest('[data-node-id]')) return el;
            if (el.closest('[data-port-side]')) return el;
            // 或者就在 nodesLayer 本身（不太可能）
            if (el === this.nodesLayer) return el;
        } catch (e) {}
        return null;
    }

    // 辅助：对底层元素（节点/端口/resize）手动派发与原始事件等价的 MouseEvent
    _dispatchMouseEventToElement(targetEl, type, originalEv) {
        if (!targetEl) return;
        try {
            const MouseEvt = window.MouseEvent || window.Event;
            const ev = new MouseEvt(type, {
                bubbles: true,
                cancelable: true,
                view: window,
                detail: 1,
                screenX: originalEv.screenX, screenY: originalEv.screenY,
                clientX: originalEv.clientX, clientY: originalEv.clientY,
                ctrlKey: !!originalEv.ctrlKey, altKey: !!originalEv.altKey,
                shiftKey: !!originalEv.shiftKey, metaKey: !!originalEv.metaKey,
                button: originalEv.button || 0,
                buttons: originalEv.buttons || 1,
                relatedTarget: originalEv.relatedTarget || null,
            });
            // 兼容老浏览器：补充非标准属性
            try { ev._original = originalEv; } catch (e) {}
            targetEl.dispatchEvent(ev);
        } catch (e) {
            // 某些浏览器不支持 new MouseEvent；退化为 click() 或直接触发父级节点 mousedown（兼容）
            try {
                if (typeof targetEl.fireEvent === 'function') targetEl.fireEvent('on' + type, document.createEventObject());
            } catch (e2) {}
        }
    }

    _renderEdges() {
        const doc = document;
        // 清空视觉层 + 命中层（两层）
        this.edgesVisualLayer.innerHTML = '';
        this.edgesHitLayer.innerHTML = '';
        const zoom = Math.max(0.1, this.zoom || 1);
        // ========== 字号跟随缩放（屏幕像素地板/天花板保护） ==========
        // 整个 viewport 已经 scale(zoom)，所以 screenFs = svgFs × zoom
        // 我们要求 屏幕上看到的字 screenFs 在 [10, 18] 内，随 base×zoom 线性变化
        // → 反推 SVG 内应设 svgFs = screenFs / zoom
        const EDGE_BASE = 12, EDGE_MIN = 10, EDGE_MAX = 18;
        const edgeScreenFs = Math.min(EDGE_MAX, Math.max(EDGE_MIN, EDGE_BASE * zoom));
        const edgeFontSize = edgeScreenFs / zoom;
        for (const e of this.data.edges) {
            let result = null;
            try { result = this._edgePath(e); } catch (err) { console.warn('[NG] _edgePath error', err, e); continue; }
            if (!result) continue;
            const def = NG_EDGE_TYPES[e.type] || NG_EDGE_TYPES.relation;
            const isSel = this.selectedEdgeIds.has(e.id);
            const hasHover = this._hoveredNodeId !== null;
            const isConnected = hasHover ? this._hoveredEdgeIds.has(e.id) : true;
            // ========== 视觉层：颜色、高亮、标签；全部 pointer-events:none（不拦截交互，不盖住节点） ==========
            const visG = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
            visG.setAttribute('data-edge-id', e.id);
            visG.style.pointerEvents = 'none'; // 整层视觉不拦截事件
            // Hover 高亮：非关联连线半透明
            if (hasHover && !isConnected) {
                visG.style.opacity = '0.15';
                visG.style.transition = 'opacity 0.15s ease';
            }
            // 连线颜色：优先自定义颜色 → 类型默认色 → 兜底蓝
            const rawColor = (e.properties && e.properties.color) || def.color;
            const color = this._normalizeColor(rawColor, def.color || '#4a90d9');
            // 模拟高亮：覆盖边颜色
            const isSimHighlighted = this.simState !== 'idle' && this.simHighlightedEdgeIds.has(e.id);
            const isPendingChoice = this.simState === 'waiting' && this.simPendingChoice && this.simPendingChoice.edgeIds.includes(e.id);
            const simColor = isPendingChoice ? '#ff9800' : (isSimHighlighted ? '#00e676' : color);
            // 连线样式：优先使用自定义 dash，否则使用类型默认
            const dash = (e.properties && e.properties.dash != null) ? e.properties.dash : def.dash;
            // 箭头显示：优先使用 showArrow 属性，否则使用类型默认（双保险 + 日志）
            const userShowArrow = e.properties && e.properties.showArrow;
            const showArrow = (userShowArrow != null) ? !!userShowArrow : !!def.arrow;
            const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', result.d);
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke', simColor);
            path.setAttribute('stroke-width', isSel ? 3 : (isPendingChoice ? 4 : (isSimHighlighted ? 3.5 : 2)));
            if (isPendingChoice) {
                // 待选择分支：橙色虚线加脉冲动画
                path.setAttribute('stroke-dasharray', '10,5');
                path.setAttribute('class', 'ng-sim-edge-choice');
            } else if (isSimHighlighted) {
                // 模拟高亮边：使用流动的虚线
                path.setAttribute('stroke-dasharray', '8,4');
                path.setAttribute('class', 'ng-sim-edge-flow');
            } else if (dash) {
                path.setAttribute('stroke-dasharray', dash);
            } else {
                path.removeAttribute('stroke-dasharray');
            }
            // 模拟高亮：在边下方添加发光层
            if (isPendingChoice) {
                const glowPath = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
                glowPath.setAttribute('d', result.d);
                glowPath.setAttribute('fill', 'none');
                glowPath.setAttribute('stroke', 'rgba(255,152,0,0.4)');
                glowPath.setAttribute('stroke-width', 14);
                glowPath.setAttribute('stroke-linecap', 'round');
                glowPath.setAttribute('stroke-linejoin', 'round');
                glowPath.style.pointerEvents = 'none';
                visG.insertBefore(glowPath, visG.firstChild);
            } else if (isSimHighlighted) {
                const glowPath = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
                glowPath.setAttribute('d', result.d);
                glowPath.setAttribute('fill', 'none');
                glowPath.setAttribute('stroke', 'rgba(0,230,118,0.3)');
                glowPath.setAttribute('stroke-width', 10);
                glowPath.setAttribute('stroke-linecap', 'round');
                glowPath.setAttribute('stroke-linejoin', 'round');
                glowPath.style.pointerEvents = 'none';
                visG.insertBefore(glowPath, visG.firstChild);
            }
            // 【修复隐藏箭头】先显式移除 marker-end，再按需设置（防止浏览器缓存/残留属性导致箭头消不掉）
            path.removeAttribute('marker-end');
            path.removeAttribute('marker-start');
            path.removeAttribute('marker-mid');
            if (showArrow) {
                const markerId = this._getArrowMarkerId(simColor);
                path.setAttribute('marker-end', `url(#${markerId})`);
            }
            if (isSel && this.selectedEdgeIds.size === 1) {
                console.debug('[NG] edge render showArrow:', {
                    id: e.id, type: e.type,
                    raw_userShowArrow: userShowArrow, def_arrow: def.arrow,
                    final_showArrow: showArrow,
                    hasMarkerEnd: path.hasAttribute('marker-end')
                });
            }
            visG.appendChild(path);
            // 选中时高亮边框（视觉）——高亮本身不画箭头，避免 showArrow=false 时高亮还带箭头
            if (isSel) {
                const hl = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
                hl.setAttribute('d', result.d);
                hl.setAttribute('fill', 'none');
                hl.setAttribute('stroke', '#4a90d9');
                hl.setAttribute('stroke-opacity', '0.4');
                hl.setAttribute('stroke-width', 6);
                hl.setAttribute('stroke-linecap', 'round');
                hl.removeAttribute('marker-end'); // 高亮绝不能带箭头
                visG.insertBefore(hl, path);
            }
            // 标签（视觉）—— 字号与描边宽度都按固定比例随 SVG fontSize 缩放
            if (e.text) {
                const label = doc.createElementNS('http://www.w3.org/2000/svg', 'text');
                label.setAttribute('x', result.labelX);
                label.setAttribute('y', result.labelY - 6);
                label.setAttribute('text-anchor', 'middle');
                label.setAttribute('font-size', edgeFontSize);
                label.setAttribute('fill', 'var(--text,#333)');
                // 【修复描边不跟随缩放 & 适配主题颜色】
                // stroke-width = SVG字号/4，屏幕上永远是 edgeScreenFs/4 → 描边占字高的比例恒定
                // stroke 颜色用 --bg-main（主题背景色）的 CSS 变量：
                //   暗色主题：--text=浅灰(#ccc)字 + 深色(#1e1e1e)描边 → 高对比分离
                //   浅色主题：--text=深黑(#111)字 + 白色(#fff)描边     → 高对比分离
                // 因为 var() 在 SVG 属性中支持 fallback，这里给一个半透白兜底
                const strokeW = Math.max(0.5, edgeFontSize / 4);
                label.setAttribute('paint-order', 'stroke');
                label.setAttribute('stroke', 'var(--bg-main, rgba(255,255,255,0.95))');
                label.setAttribute('stroke-width', strokeW);
                label.setAttribute('stroke-linejoin', 'round');
                label.setAttribute('stroke-linecap', 'round');
                label.textContent = e.text;
                visG.appendChild(label);
            }
            this.edgesVisualLayer.appendChild(visG);

            // ========== 命中层：放在 nodesLayer 上层 → 100% 先收到事件
            // 命中区 stroke-width=28px 超大命中带（越缩小越容易点中）
            // 但会在 handler 内用 elementFromPoint 反向判定：若点在节点/端口上就手动把事件转发给下层节点元素
            // 只有在"两节点之间空白曲线段"才真正处理连线选中
            const hitPath = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
            hitPath.setAttribute('d', result.d);
            hitPath.setAttribute('data-edge-id', e.id); // 让 canvas mousedown 防御命中能识别
            hitPath.setAttribute('fill', 'none');
            // 模拟等待分支选择：高亮命中区，方便点击（复用上方已声明的 isPendingChoice）
            if (isPendingChoice) {
                hitPath.setAttribute('stroke', 'rgba(0,230,118,0.15)');
                hitPath.setAttribute('stroke-width', 40);
            } else {
                hitPath.setAttribute('stroke', 'rgba(0,0,0,0.001)'); // 几乎透明（视觉上不影响）
                hitPath.setAttribute('stroke-width', 28); // 命中区大幅加宽
            }
            hitPath.setAttribute('stroke-linecap', 'round');
            hitPath.setAttribute('stroke-linejoin', 'round');
            hitPath.setAttribute('pointer-events', 'stroke');
            hitPath.style.cursor = isPendingChoice ? 'pointer' : 'pointer';
            // ⚠️ mousedown：先判定是不是点在节点/端口上，是则转发；否则才处理连线选中
            hitPath.addEventListener('mousedown', (ev) => {
                if (ev.button !== 0) return;
                const cx = ev.clientX, cy = ev.clientY;
                const nodeEl = this._findTopmostNodeElement(cx, cy);
                if (nodeEl) {
                    // 用户点的是节点层元素（节点背景/文字/端口/resize）→ 手动转发，不拦截连线不选
                    ev.preventDefault(); ev.stopPropagation(); ev.cancelBubble = true;
                    this._dispatchMouseEventToElement(nodeEl, 'mousedown', ev);
                    return;
                }
                // 纯空白连线命中 → 正常处理
                this._onEdgeMouseDown(ev, e.id);
            });
            hitPath.addEventListener('click', (ev) => this._onEdgeClick(ev, e.id));
            this.edgesHitLayer.appendChild(hitPath);
        }
    }

    _renderNodes() {
        const doc = document;
        this.nodesLayer.innerHTML = '';
        const zoom = Math.max(0.1, this.zoom || 1);
        // ========== 字号跟随缩放（屏幕像素地板/天花板保护） ==========
        // 整个 viewport 已经 scale(zoom)，所以 screenFs = svgFs × zoom
        // 反推 SVG 内应设 svgFs = screenFs / zoom
        // NODE_MIN=11：在 20%~78% 缩放下屏幕字固定在 11px（防糊/防消失的底线）
        const NODE_BASE = 14, NODE_MIN = 11, NODE_MAX = 22;
        const nodeScreenFs = Math.min(NODE_MAX, Math.max(NODE_MIN, NODE_BASE * zoom));
        const nodeFontSize = nodeScreenFs / zoom;
        // 字符宽度估算（按屏幕像素）：每个中文字/英文字符屏幕占 8~10px（线性插值随屏幕字号，对应更粗的 NODE_MIN=11）
        const charScreenPx = 8 + (10 - 8) * Math.min(1, Math.max(0, (nodeScreenFs - NODE_MIN) / Math.max(1, NODE_MAX - NODE_MIN)));
        // 转成 SVG 内部字符宽度（因为 SVG 内的 n.width 乘 zoom 才是屏幕宽度）
        // maxChars = 节点屏幕像素宽 / 每字屏幕像素 = (n.width * zoom) / charScreenPx
        // 所以在 SVG 单位下计算：maxChars ≈ n.width / (charScreenPx / zoom)
        const charSvgPx = charScreenPx / zoom;
        for (const n of this.data.nodes) {
            // 渲染所有节点，不因模式隐藏（mode 仅为数据标记）
            const def = NG_NODE_TYPES[n.type] || NG_NODE_TYPES.character;
            const color = (n.properties && n.properties.color) || def.color;
            const stroke = (n.properties && n.properties.color) || def.stroke;
            const isSel = this.selectedNodeIds.has(n.id);
            const isHovered = this._hoveredNodeId === n.id;
            const hasHover = this._hoveredNodeId !== null;
            // 流程模式下，非流程节点（关系节点）淡化显示且不可交互
            // 观察模式下，所有节点不可交互
            const isReadonly = this._isReadonly();
            const isCrossMode = isReadonly || ((n.mode || 'relation') !== this.mode);
            const b = this._nodeBBox(n);
            const g = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
            g.setAttribute('data-node-id', n.id);
            g.style.cursor = isCrossMode ? 'default' : 'move';
            // 流程模式下的关系节点淡化（观察模式不淡化）
            if (isCrossMode && !isReadonly) {
                g.style.opacity = '0.35';
                g.style.pointerEvents = 'none';
            }
            // 观察模式：所有节点不可交互
            if (isReadonly) {
                g.style.pointerEvents = 'none';
            }
            // Hover 高亮：非悬停节点半透明
            if (hasHover && !isHovered) {
                g.style.opacity = '0.3';
                g.style.transition = 'opacity 0.15s ease';
            }

            let shape;
            if (def.shape === 'rect' || def.shape === 'rounded') {
                shape = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
                shape.setAttribute('x', b.left); shape.setAttribute('y', b.top);
                shape.setAttribute('width', n.width); shape.setAttribute('height', n.height);
                shape.setAttribute('rx', def.radius); shape.setAttribute('ry', def.radius);
            } else if (def.shape === 'ellipse') {
                shape = doc.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
                shape.setAttribute('cx', n.x); shape.setAttribute('cy', n.y);
                shape.setAttribute('rx', n.width / 2); shape.setAttribute('ry', n.height / 2);
            } else { // diamond
                shape = doc.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                const points = `${n.x},${b.top} ${b.right},${n.y} ${n.x},${b.bottom} ${b.left},${n.y}`;
                shape.setAttribute('points', points);
            }
            const isSimHighlighted = this.simState !== 'idle' && this.simHighlightedNodeIds.has(n.id);
            const isSimCurrent = this.simActiveNodes && this.simActiveNodes.includes(n.id);

            // 模拟高亮：在节点下方添加发光覆盖层
            if (isSimHighlighted) {
                const glow = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
                const pad = isSimCurrent ? 12 : 6;
                glow.setAttribute('x', b.left - pad);
                glow.setAttribute('y', b.top - pad);
                glow.setAttribute('width', n.width + pad * 2);
                glow.setAttribute('height', n.height + pad * 2);
                glow.setAttribute('rx', (def.radius || 4) + pad);
                glow.setAttribute('ry', (def.radius || 4) + pad);
                if (isSimCurrent) {
                    glow.setAttribute('fill', 'rgba(0,230,118,0.35)');
                    glow.setAttribute('stroke', '#00e676');
                    glow.setAttribute('stroke-width', 4);
                    glow.setAttribute('stroke-dasharray', 'none');
                    glow.setAttribute('class', 'ng-sim-glow-current');
                } else {
                    glow.setAttribute('fill', 'rgba(105,240,174,0.12)');
                    glow.setAttribute('stroke', '#69f0ae');
                    glow.setAttribute('stroke-width', 2);
                    glow.setAttribute('stroke-dasharray', '6,3');
                }
                glow.style.pointerEvents = 'none';
                g.insertBefore(glow, g.firstChild);
            }
            shape.setAttribute('fill', color);
            shape.setAttribute('stroke', isSel ? '#4a90d9' : stroke);
            shape.setAttribute('stroke-width', isSel ? 2.5 : 1.2);
            shape.style.pointerEvents = 'none';
            g.appendChild(shape);

            // 子流程节点：左侧双竖线装饰
            if (n.type === 'subprocess') {
                const lineGap = 4;
                const lineH = n.height * 0.5;
                const lineY = b.top + (n.height - lineH) / 2;
                const lineX1 = b.left + 10;
                const lineX2 = b.left + 10 + lineGap + 2;
                for (const lx of [lineX1, lineX2]) {
                    const line = doc.createElementNS('http://www.w3.org/2000/svg', 'line');
                    line.setAttribute('x1', lx); line.setAttribute('y1', lineY);
                    line.setAttribute('x2', lx); line.setAttribute('y2', lineY + lineH);
                    line.setAttribute('stroke', 'rgba(255,255,255,0.7)');
                    line.setAttribute('stroke-width', 2);
                    line.setAttribute('stroke-linecap', 'round');
                    line.style.pointerEvents = 'none';
                    g.appendChild(line);
                }
            }
            // 合并节点：菱形内加水平线标记
            if (n.type === 'merge') {
                const mergeLine = doc.createElementNS('http://www.w3.org/2000/svg', 'line');
                mergeLine.setAttribute('x1', b.left + 10);
                mergeLine.setAttribute('y1', n.y);
                mergeLine.setAttribute('x2', b.right - 10);
                mergeLine.setAttribute('y2', n.y);
                mergeLine.setAttribute('stroke', 'rgba(255,255,255,0.6)');
                mergeLine.setAttribute('stroke-width', 2);
                mergeLine.setAttribute('stroke-linecap', 'round');
                mergeLine.style.pointerEvents = 'none';
                g.appendChild(mergeLine);
            }

            // 节点图片 + 描述
            const nodeImage = (n.properties && n.properties.image) || '';
            const nodeDesc = (n.properties && n.properties.description) || '';
            const hasImage = !!nodeImage;
            const hasDesc = !!nodeDesc;

            // 如果有图片，渲染图片（用 clipPath 裁剪到节点形状）
            if (hasImage) {
                const clipId = 'clip_' + n.id.replace(/[^a-zA-Z0-9_-]/g, '_');
                let clipPath = doc.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
                clipPath.setAttribute('id', clipId);
                let clipShape;
                if (def.shape === 'rect' || def.shape === 'rounded') {
                    clipShape = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
                    clipShape.setAttribute('x', b.left); clipShape.setAttribute('y', b.top);
                    clipShape.setAttribute('width', n.width); clipShape.setAttribute('height', n.height);
                    clipShape.setAttribute('rx', def.radius); clipShape.setAttribute('ry', def.radius);
                } else if (def.shape === 'ellipse') {
                    clipShape = doc.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
                    clipShape.setAttribute('cx', n.x); clipShape.setAttribute('cy', n.y);
                    clipShape.setAttribute('rx', n.width / 2); clipShape.setAttribute('ry', n.height / 2);
                } else { // diamond
                    clipShape = doc.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                    const pts = `${n.x},${b.top} ${b.right},${n.y} ${n.x},${b.bottom} ${b.left},${n.y}`;
                    clipShape.setAttribute('points', pts);
                }
                clipPath.appendChild(clipShape);
                const existing = this._defs.querySelector('#' + clipId);
                if (!existing) this._defs.appendChild(clipPath);

                const img = doc.createElementNS('http://www.w3.org/2000/svg', 'image');
                img.setAttribute('x', b.left);
                img.setAttribute('y', b.top);
                img.setAttribute('width', n.width);
                img.setAttribute('height', n.height);
                img.setAttribute('href', nodeImage);
                img.setAttribute('preserveAspectRatio', 'xMidYMid slice');
                img.setAttribute('clip-path', 'url(#' + clipId + ')');
                img.style.pointerEvents = 'none';
                g.appendChild(img);

                // 底部半透明文字区（防止文字在图片上看不清）
                const textOverlay = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
                textOverlay.setAttribute('x', b.left);
                textOverlay.setAttribute('y', b.top + n.height * 0.60);
                textOverlay.setAttribute('width', n.width);
                textOverlay.setAttribute('height', n.height * 0.40);
                textOverlay.setAttribute('fill', 'rgba(0,0,0,0.5)');
                textOverlay.setAttribute('clip-path', 'url(#' + clipId + ')');
                textOverlay.style.pointerEvents = 'none';
                g.appendChild(textOverlay);
            }

            // 计算文字 Y 坐标：有图片时文字在底部 1/3 区域，否则居中
            const textAreaTop = hasImage ? b.top + n.height * 0.62 : b.top;
            const textAreaHeight = hasImage ? n.height * 0.38 : n.height;
            const textCenterY = textAreaTop + textAreaHeight / 2 - (hasDesc ? nodeFontSize * 0.3 : 0);

            // 节点标题文字
            if (n.text) {
                const text = doc.createElementNS('http://www.w3.org/2000/svg', 'text');
                text.setAttribute('x', n.x); text.setAttribute('y', textCenterY);
                text.setAttribute('text-anchor', 'middle');
                text.setAttribute('dominant-baseline', 'central');
                text.setAttribute('font-size', nodeFontSize);
                text.setAttribute('fill', '#ffffff');
                text.setAttribute('font-weight', '500');
                text.setAttribute('pointer-events', 'none');
                const maxChars = Math.max(3, Math.floor(n.width / charSvgPx));
                let display = n.text;
                if (display.length > maxChars) display = display.slice(0, maxChars - 1) + '…';
                text.textContent = display;
                g.appendChild(text);
            }

            // 节点描述文字（标题下方，更小字号）
            if (hasDesc) {
                const descFontSize = Math.max(8, Math.min(14, nodeFontSize * 0.7));
                const descText = doc.createElementNS('http://www.w3.org/2000/svg', 'text');
                descText.setAttribute('x', n.x);
                descText.setAttribute('y', textCenterY + nodeFontSize * 0.7 + 2);
                descText.setAttribute('text-anchor', 'middle');
                descText.setAttribute('dominant-baseline', 'central');
                descText.setAttribute('font-size', descFontSize);
                descText.setAttribute('fill', 'rgba(255,255,255,0.65)');
                descText.setAttribute('font-weight', '400');
                descText.setAttribute('pointer-events', 'none');
                const descMaxChars = Math.max(3, Math.floor(n.width / (charSvgPx * 0.75)));
                let descDisplay = nodeDesc.replace(/\n.*$/, ''); // 只取第一行
                if (descDisplay.length > descMaxChars) descDisplay = descDisplay.slice(0, descMaxChars - 1) + '…';
                descText.textContent = descDisplay;
                g.appendChild(descText);
            }

            // 点击命中层（整个节点区域）—— 必须在手柄之前，这样手柄在上层能接收事件
            if (!isCrossMode) {
                const hit = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
                hit.setAttribute('x', b.left); hit.setAttribute('y', b.top);
                hit.setAttribute('width', n.width); hit.setAttribute('height', n.height);
                hit.setAttribute('fill', 'rgba(0,0,0,0.001)');
                hit.style.pointerEvents = 'all';
                hit.style.cursor = 'move';
                hit.addEventListener('mousedown', (ev) => this._onNodeMouseDown(ev, n.id));
                hit.addEventListener('click', (ev) => this._onNodeClick(ev, n.id));
                // Hover 高亮
                hit.addEventListener('mouseenter', (ev) => this._onNodeMouseEnter(ev, n.id));
                hit.addEventListener('mouseleave', (ev) => this._onNodeMouseLeave(ev));
                g.appendChild(hit);
            }

            // 流程模式：渲染输入/输出端口
            if (!isCrossMode) this._renderFlowPorts(g, n);

            // 选中：画 4 个角缩放手柄
            if (isSel && !isCrossMode) {
                const handleSize = 9; // in local pixels
                const cornerHandles = [
                    { k: 'nw', x: b.left, y: b.top, dx: -1, dy: -1 },
                    { k: 'ne', x: b.right, y: b.top, dx: 1, dy: -1 },
                    { k: 'sw', x: b.left, y: b.bottom, dx: -1, dy: 1 },
                    { k: 'se', x: b.right, y: b.bottom, dx: 1, dy: 1 },
                ];
                for (const h of cornerHandles) {
                    const r = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
                    r.setAttribute('x', h.x - handleSize / 2);
                    r.setAttribute('y', h.y - handleSize / 2);
                    r.setAttribute('width', handleSize); r.setAttribute('height', handleSize);
                    r.setAttribute('fill', '#ffffff');
                    r.setAttribute('stroke', '#4a90d9');
                    r.setAttribute('stroke-width', 1.5);
                    r.setAttribute('class', 'nge-handle nge-corner');
                    r.style.cursor = h.dx * h.dy === 1 ? 'nwse-resize' : 'nesw-resize';
                    r.style.pointerEvents = 'auto';
                    r.addEventListener('mousedown', (ev) => this._onResizeStart(ev, n.id, h));
                    g.appendChild(r);
                }
            }
            // 4 个边连接口：选中 OR 连线模式（activeEdgeType）下显示（跨模式节点不显示）
            const showPorts = (isSel || !!this.activeEdgeType) && !isCrossMode;
            if (showPorts) {
                // 流程节点始终只显示左右（输入/输出）端口，关系节点显示全部 4 方向
                const isNodeFlow = (n.mode || 'relation') === 'flow';
                const portHandles = isNodeFlow
                    ? [
                        { k: 'left', x: b.left, y: n.y },
                        { k: 'right', x: b.right, y: n.y },
                      ]
                    : [
                        { k: 'left', x: b.left, y: n.y },
                        { k: 'right', x: b.right, y: n.y },
                        { k: 'top', x: n.x, y: b.top },
                        { k: 'bottom', x: n.x, y: b.bottom },
                      ];
                for (const p of portHandles) {
                    const r = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
                    r.setAttribute('cx', p.x); r.setAttribute('cy', p.y);
                    r.setAttribute('r', 5);
                    r.setAttribute('fill', '#ffffff');
                    r.setAttribute('stroke', '#4a90d9');
                    r.setAttribute('stroke-width', 1.5);
                    r.setAttribute('class', 'nge-port');
                    r.style.cursor = 'crosshair';
                    r.style.pointerEvents = 'auto';
                    r.addEventListener('mousedown', (ev) => this._onPortMouseDown(ev, n.id, p.k));
                    g.appendChild(r);
                }
            }

            this.nodesLayer.appendChild(g);
        }
    }

    // ========== Interaction: Mouse Handlers ==========

    _onKeydown(e) {
        // 只有当当前容器可见时才响应
        if (!this._containerIsFocused()) return;
        const tag = (document.activeElement && document.activeElement.tagName) || '';
        const isInput = tag === 'INPUT' || tag === 'TEXTAREA';
        // 观察模式：跳过所有快捷键
        if (this._isReadonly()) return;
        if (e.key === 'Escape') {
            if (isInput) return; // 输入框中 Esc 不清空选择
            if (this.activeTool) { this.setActiveTool(null); }
            if (this.activeEdgeType) { this.setActiveEdge(null); }
            if (this._creatingEdge) this._abortCreatingEdge();
            this.selectedNodeIds.clear();
            this.selectedEdgeIds.clear();
            this._renderAll();
            this._emitSelection();
        }
        // Tab：切换连续绘制模式
        if (e.key === 'Tab' && !isInput) {
            e.preventDefault();
            this.continuousDraw = !this.continuousDraw;
            if (this.onToolChange) try { this.onToolChange(); } catch (_) {}
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (this.activeTool || this.activeEdgeType) return;
            if (isInput) return; // 不删除属性面板正在输入的内容
            e.preventDefault();
            this.deleteSelected();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
            if (isInput) return; // 输入框中用原生撤销
            e.preventDefault();
            this.undo();
        }
        if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
            if (isInput) return;
            e.preventDefault();
            this.redo();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
            if (isInput) return; // 输入框中用原生全选
            e.preventDefault();
            this.selectedNodeIds.clear();
            this.data.nodes.forEach(n => this.selectedNodeIds.add(n.id));
            this.selectedEdgeIds.clear();
            this._renderAll();
            this._emitSelection();
        }
    }

    _containerIsFocused() {
        // 容器是否可见 & 在 DOM 中
        const c = this.container;
        if (!c || !c.isConnected) return false;
        // 简单但更可靠的判断：检查容器的可见矩形面积
        try {
            const rect = c.getBoundingClientRect();
            if (rect.width < 10 || rect.height < 10) return false;
            // 如果元素完全在视口外，也认为不活跃
            if (rect.right < 0 || rect.bottom < 0 || rect.left > window.innerWidth || rect.top > window.innerHeight) return false;
        } catch (e) { return false; }
        return true;
    }

    // 设置历史变化回调（prevSnap, nextSnap, kind: 'push'|'undo'|'redo'）
    // 给 GlobalUndoManager 用来同步全局撤回栈
    setOnHistoryChange(cb) {
        this._onHistoryChange = typeof cb === 'function' ? cb : null;
    }

    _snapshot() {
        const prevSnap = this.undoStack.length > 0
            ? JSON.parse(JSON.stringify(this.undoStack[this.undoStack.length - 1]))
            : null;
        const snap = JSON.parse(JSON.stringify({
            nodes: this.data.nodes,
            edges: this.data.edges,
            viewport: this.data.viewport,
        }));
        this.undoStack.push(snap);
        if (this.undoStack.length > 50) this.undoStack.shift();
        this.redoStack.length = 0;
        // 【0.7.0_alpha 全局撤回】回调通知 GlobalUndoManager push 一个 nodegraph op
        if (this._onHistoryChange) {
            try { this._onHistoryChange(prevSnap, snap, 'push'); } catch (err) { console.warn('[NG] onHistoryChange(push) error:', err); }
        }
    }
    _restoreSnapshot(snap) {
        this.data.nodes = JSON.parse(JSON.stringify(snap.nodes));
        this.data.edges = JSON.parse(JSON.stringify(snap.edges));
        this.data.viewport = JSON.parse(JSON.stringify(snap.viewport));
        this.selectedNodeIds.clear();
        this.selectedEdgeIds.clear();
        this._applyViewport();
        this._renderAll();
        this._emitChange();
        this._emitSelection();
    }

    _emitChange() { this.onChange(); }
    _emitSelection() { this.onSelectionChange(); }

    // ========== 模式切换 ==========
    setMode(newMode) {
        if (newMode !== 'relation' && newMode !== 'flow' && newMode !== 'view' && newMode !== 'timeline') return;
        if (this.mode === newMode) return;
        this.mode = newMode;
        this._renderAll();
        this._syncModeUI();
        // 观察模式不触发变更事件
        if (newMode !== 'view') this._emitChange();
    }
    _isReadonly() { return this.mode === 'view' || this.simState === 'waiting'; }

    // 聚焦到指定节点（保持当前缩放，平移画布使节点居中）
    _zoomToNode(nodeId) {
        const node = this.getNode(nodeId);
        if (!node) return;
        const rect = this.container.getBoundingClientRect();
        // 直接修改 data.viewport 而非只读的 tx/ty getter
        this.data.viewport.tx = rect.width / 2 - node.x * this.zoom;
        this.data.viewport.ty = rect.height / 2 - node.y * this.zoom;
        this._applyViewport();
    }

    // 画布双击事件：跨模式节点双击跳转
    _onCanvasDblClick(e) {
        if (e.button !== 0) return;
        // 将客户端坐标转为图坐标
        const g = this.clientToGraph(e.clientX, e.clientY);
        // 查找命中节点
        for (const n of this.data.nodes) {
            const b = this._nodeBBox(n);
            if (g.x >= b.left && g.x <= b.right && g.y >= b.top && g.y <= b.bottom) {
                // 检查是否为跨模式节点
                const nodeMode = n.mode || 'relation';
                if (nodeMode !== this.mode) {
                    this._onCrossModeDblClick(n.id);
                }
                break;
            }
        }
    }

    // 双击跨模式节点：跳转到对应模式并聚焦
    _onCrossModeDblClick(nodeId) {
        const node = this.getNode(nodeId);
        if (!node) return;
        const targetMode = node.mode || 'relation';
        if (targetMode === this.mode) return;
        this.setMode(targetMode);
        this._zoomToNode(nodeId);
        this.selectedNodeIds.clear();
        this.selectedEdgeIds.clear();
        this.selectedNodeIds.add(nodeId);
        this._renderAll();
        this._emitSelection();
    }
    _syncModeUI() {
        // 使用存储的引用更新工具栏下拉框（工具栏在 canvas 容器外部，不能通过 this.container 查找）
        if (this._modeSelectEl) {
            this._modeSelectEl.value = this.mode;
        }
    }

    // ========== 流程模式端口渲染（纯视觉，交互由 showPorts 端口处理） ==========
    _renderFlowPorts(g, node) {
        if (this.mode !== 'flow') return;
        const doc = this.nodesLayer ? this.nodesLayer.ownerDocument : document;
        const b = this._nodeBBox(node);
        const portR = 5; // 端口小圆点半径（屏幕像素）
        const portColor = 'var(--text-secondary, #888)';
        const portHoverColor = 'var(--active-text, #4a9eff)';
        // 输入端口（左侧）
        const inPort = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
        inPort.setAttribute('cx', b.left);
        inPort.setAttribute('cy', b.top + node.height / 2);
        inPort.setAttribute('r', portR);
        inPort.setAttribute('fill', portColor);
        inPort.setAttribute('data-port', 'input');
        inPort.setAttribute('data-node-id', node.id);
        inPort.setAttribute('data-side', 'left');
        inPort.style.cursor = 'default';
        inPort.style.pointerEvents = 'none';
        // hover 高亮
        inPort.addEventListener('mouseenter', () => { inPort.setAttribute('fill', portHoverColor); inPort.setAttribute('r', portR + 2); });
        inPort.addEventListener('mouseleave', () => { inPort.setAttribute('fill', portColor); inPort.setAttribute('r', portR); });
        g.appendChild(inPort);
        // 输出端口（右侧）
        const outPort = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
        outPort.setAttribute('cx', b.right);
        outPort.setAttribute('cy', b.top + node.height / 2);
        outPort.setAttribute('r', portR);
        outPort.setAttribute('fill', portColor);
        outPort.setAttribute('data-port', 'output');
        outPort.setAttribute('data-node-id', node.id);
        outPort.setAttribute('data-side', 'right');
        outPort.style.cursor = 'crosshair';
        outPort.style.pointerEvents = 'none';
        outPort.addEventListener('mouseenter', () => { outPort.setAttribute('fill', portHoverColor); outPort.setAttribute('r', portR + 2); });
        outPort.addEventListener('mouseleave', () => { outPort.setAttribute('fill', portColor); outPort.setAttribute('r', portR); });
        g.appendChild(outPort);
    }

    // 画布空白 mousedown
    _onCanvasMouseDown(e) {
        if (e.button !== 0) return;
        if (this.activeTool) return; // 创建模式有自己的 overlay
        // 模拟等待分支选择：点击空白区域取消选择，回到上一步
        if (this.simState === 'waiting') {
            this.chooseSimBranch(null); // 取消等待
            return;
        }
        // 观察模式：允许平移，禁止框选和其他交互
        if (this._isReadonly()) {
            const clientX = e.clientX, clientY = e.clientY;
            this._interactState = { type: 'pan', startClient: { x: clientX, y: clientY }, startTx: this.tx, startTy: this.ty };
            this._interactStart = { x: clientX, y: clientY };
            return;
        }
        // ⚠️ 连线模式（activeEdgeType）下仍允许空白拖拽平移 / Shift 框选；
        // 端口命中会 stopPropagation，不会走到这里，不会误触发 pan
        if (this._creatingEdge) this._abortCreatingEdge();
        // 防御：如果点击来自连线或节点（有 stopPropagation 但做双重保险），不处理
        const tgt = e.target;
        if (tgt && (tgt.closest('[data-edge-id]') || tgt.closest('[data-node-id]'))) return;
        const clientX = e.clientX, clientY = e.clientY;
        const startLocal = this._toLocalXY(clientX, clientY);
        const shift = e.shiftKey;
        if (shift) {
            // Shift+拖拽 = 框选
            this._interactState = { type: 'marquee', startClient: { x: clientX, y: clientY }, additive: true };
            this._showSelectionRect(startLocal, { x: 0, y: 0 });
            // 框选时也取消 hover 高亮
            this._hoveredNodeId = null;
            this._hoveredEdgeIds.clear();
            this._renderAll();
        } else {
            // 普通拖拽 = 平移画布
            this._interactState = { type: 'pan', startClient: { x: clientX, y: clientY }, startTx: this.tx, startTy: this.ty };
            // 点击空白取消选择
            this.selectedNodeIds.clear();
            this.selectedEdgeIds.clear();
            // 点击空白取消 hover 高亮
            this._hoveredNodeId = null;
            this._hoveredEdgeIds.clear();
            this._renderAll();
            this._emitSelection();
        }
        this._interactStart = { x: clientX, y: clientY };
    }

    _shouldMarquee() { return false; } // 必须 shift，否则是平移

    _toLocalXY(clientX, clientY) {
        const rect = this.container.getBoundingClientRect();
        return { x: clientX - rect.left, y: clientY - rect.top };
    }

    _onCreateStart(e) {
        if (!this.activeTool) return;
        if (e.button !== 0) return;
        e.preventDefault(); e.stopPropagation();
        const clientX = e.clientX, clientY = e.clientY;
        const startGraph = this.clientToGraph(clientX, clientY);
        const startLocal = this._toLocalXY(clientX, clientY);
        this._interactState = {
            type: 'create-node',
            ngType: this.activeTool,
            startGraph,
            startLocal,
            startClient: { x: clientX, y: clientY },
        };
        this._showCreateRect(startLocal, startLocal);
    }

    _onNodeMouseDown(e, nodeId) {
        if (e.button !== 0) return;
        if (this.activeTool) return;
        // 连线模式：在节点上按下 = 从该节点开始拉线（通过端口命中，不会到这里，端口 handler 会拦截）
        if (this.activeEdgeType) return;
        // 模拟等待分支选择：节点不可交互，只能点边
        if (this.simState === 'waiting') return;
        // 跨模式节点不可交互
        const node = this.getNode(nodeId); if (!node) return;
        if ((node.mode || 'relation') !== this.mode) return;
        e.preventDefault(); e.stopPropagation();
        e.cancelBubble = true; // SVG 事件兼容性后备，防止冒泡到 canvas 清空选择
        // 点击节点时取消 hover 高亮
        if (this._hoveredNodeId !== null) {
            this._hoveredNodeId = null;
            this._hoveredEdgeIds.clear();
        }
        const shift = e.shiftKey;
        const g = this.clientToGraph(e.clientX, e.clientY);
        const offset = { x: g.x - node.x, y: g.y - node.y };
        if (!shift && !this.selectedNodeIds.has(nodeId)) {
            this.selectedNodeIds.clear();
            this.selectedEdgeIds.clear();
            this.selectedNodeIds.add(nodeId);
            this._renderAll();
            this._emitSelection();
        }
        // 如果已经选中（或 multiselect），进入拖拽移动
        this._interactState = { type: 'move-nodes', nodeIds: [...this.selectedNodeIds], startOffset: offset, didMove: false };
    }

    _onNodeClick(e, nodeId) {
        // click 事件在 mouseup 之后
        if (this.activeEdgeType) return; // 连线模式下 click 交给端口处理
        // 模拟等待分支选择：节点不可点击，只能点边
        if (this.simState === 'waiting') return;
        // 跨模式节点不可交互
        const node = this.getNode(nodeId);
        if (node && (node.mode || 'relation') !== this.mode) return;
        const shift = e.shiftKey;
        if (shift) {
            if (this.selectedNodeIds.has(nodeId)) this.selectedNodeIds.delete(nodeId);
            else this.selectedNodeIds.add(nodeId);
            this.selectedEdgeIds.clear();
            this._renderAll();
            this._emitSelection();
        } else if (!this.selectedNodeIds.has(nodeId)) {
            // 单选
            this.selectedNodeIds.clear();
            this.selectedEdgeIds.clear();
            this.selectedNodeIds.add(nodeId);
            this._renderAll();
            this._emitSelection();
        } else if (this._interactState && this._interactState.type === 'move-nodes' && !this._interactState.didMove) {
            this._emitSelection(); // 重新触发显示
        }
    }

    // ========== Hover 高亮 ==========
    _onNodeMouseEnter(e, nodeId) {
        if (this.activeTool || this.activeEdgeType) return; // 创建/连线模式下不启用 hover 高亮
        if (this._interactState) return; // 拖拽中不处理 hover
        this._hoveredNodeId = nodeId;
        // 计算与悬停节点相连的所有边
        this._hoveredEdgeIds.clear();
        for (const edge of this.data.edges) {
            if (edge.sourceNodeId === nodeId || edge.targetNodeId === nodeId) {
                this._hoveredEdgeIds.add(edge.id);
            }
        }
        this._renderAll();
    }

    _onNodeMouseLeave(e) {
        if (this._hoveredNodeId === null) return;
        this._hoveredNodeId = null;
        this._hoveredEdgeIds.clear();
        this._renderAll();
    }

    _onEdgeClick(e, edgeId) {
        e.stopPropagation();
        e.cancelBubble = true;
        const shift = e.shiftKey;
        if (shift) {
            // Shift+click: 切换选中
            if (this.selectedEdgeIds.has(edgeId)) this.selectedEdgeIds.delete(edgeId);
            else this.selectedEdgeIds.add(edgeId);
            this.selectedNodeIds.clear();
            this._renderAll();
            this._emitSelection();
        }
    }
    _onEdgeMouseDown(e, edgeId) {
        // 模拟等待分支选择：点击边即选择分支
        if (this.simState === 'waiting' && this.simPendingChoice && this.simPendingChoice.edgeIds.includes(edgeId)) {
            e.stopPropagation(); e.preventDefault(); e.cancelBubble = true;
            this.chooseSimBranch(edgeId);
            return;
        }
        // 阻止事件冒泡到画布（否则会清空选择并进入平移模式）
        e.stopPropagation();
        e.preventDefault();
        e.cancelBubble = true;
        // 记录交互状态，防止后续 mousemove 触发 pan 导致界面"假死"
        this._interactState = { type: 'edge-select', startX: e.clientX, startY: e.clientY, edgeId };
        const shift = e.shiftKey;
        if (shift) {
            // Shift + 按下：切换选中
            if (this.selectedEdgeIds.has(edgeId)) this.selectedEdgeIds.delete(edgeId);
            else this.selectedEdgeIds.add(edgeId);
            this.selectedNodeIds.clear();
        } else {
            // 非多选：清空并选中此连线
            this.selectedNodeIds.clear();
            this.selectedEdgeIds.clear();
            this.selectedEdgeIds.add(edgeId);
        }
        this._renderAll();
        // 双重 + 延迟触发：确保 onSelectionChange / 属性面板刷新一定执行
        try { this._emitSelection(); } catch (err) { console.warn('[NG] _emitSelection error (sync):', err); }
        const _self = this;
        // ============== 暴力兜底：直接强制刷新所有可见属性面板（绕过 onSelectionChange 回调链问题） ==============
        function forceRefreshPanels() {
            try {
                const nid = _self.getSelectedNodeId();
                const eid = _self.getSelectedEdgeId();
                console.info('[NG] forceRefreshPanels: nodeId=', nid, 'edgeId=', eid);
                if (typeof updateNodeGraphPropertyPanel !== 'function') return;
                // 1) 独立 tab：nodeGraphInstances 里找
                if (typeof nodeGraphInstances !== 'undefined') {
                    for (const tabId in nodeGraphInstances) {
                        const inst = nodeGraphInstances[tabId];
                        if (!inst || inst.engine !== _self) continue;
                        const tabContent = document.getElementById(`tab-content-${tabId}`);
                        if (!tabContent) continue;
                        const panel = tabContent.querySelector('.ng-property-panel');
                        if (panel && panel.offsetParent !== null) {  // 可见才刷新
                            try { updateNodeGraphPropertyPanel(panel, _self, nid, eid); } catch (err) { console.warn(err); }
                        }
                    }
                }
                // 2) 嵌入 tab：embeddedNodeGraphs 里找
                if (typeof embeddedNodeGraphs !== 'undefined') {
                    for (const safeId in embeddedNodeGraphs) {
                        const inst = embeddedNodeGraphs[safeId];
                        if (!inst || inst.engine !== _self) continue;
                        const tabContent = document.getElementById(`tab-content-${safeId}`);
                        if (!tabContent) continue;
                        const panel = tabContent.querySelector('.ng-property-panel');
                        if (panel) {
                            try { updateNodeGraphPropertyPanel(panel, _self, nid, eid); } catch (err) { console.warn(err); }
                        }
                    }
                }
                // 3) 全局扫描兜底：找当前视口内所有可见的 .ng-property-panel
                const allPanels = document.querySelectorAll('.ng-property-panel');
                allPanels.forEach(panel => {
                    // 跳过已经处理过的（data- 标记）
                    if (panel.dataset._forceRefreshed === edgeId) return;
                    // offsetParent === null 代表 display:none
                    if (panel.offsetParent === null && getComputedStyle(panel).display === 'none') return;
                    panel.dataset._forceRefreshed = edgeId;
                    try { updateNodeGraphPropertyPanel(panel, _self, nid, eid); } catch (err) { console.warn(err); }
                });
                // 清理标记
                setTimeout(() => {
                    document.querySelectorAll('.ng-property-panel').forEach(p => delete p.dataset._forceRefreshed);
                }, 100);
            } catch (outerErr) {
                console.error('[NG] forceRefreshPanels THROWN:', outerErr);
            }
        }
        // 同步立即执行一次
        forceRefreshPanels();
        // 下一帧再执行一次（防止 DOM 还没准备好）
        setTimeout(() => {
            try {
                _self._renderAll();
                _self._emitSelection();
                console.debug('[NG] edge selected:', edgeId,
                    'selectedEdgeIds:', [..._self.selectedEdgeIds],
                    'hasEngineCb:', typeof _self.onSelectionChange === 'function');
            } catch (err) { console.warn('[NG] _emitSelection error (deferred):', err); }
            forceRefreshPanels();
        }, 0);
        // 100ms 后再兜底执行一次（防止某些极端时序）
        setTimeout(forceRefreshPanels, 100);
    }

    // 端口按下：开始创建连线（记录源端口ID：{nodeId}_{1|2|3|4}）
    _onPortMouseDown(e, nodeId, portSide) {
        if (e.button !== 0) return;
        e.preventDefault(); e.stopPropagation();
        e.cancelBubble = true; // 防止冒泡到节点 mousedown 触发拖拽
        // 流程模式：禁止从输入端口（左侧）拖拽连线
        if (this.mode === 'flow' && portSide === 'left') return;
        // 跨模式节点禁止拖拽连线
        const node = this.getNode(nodeId); if (!node) return;
        if ((node.mode || 'relation') !== this.mode) return;
        // 如果当前没有指定连线类型，默认 relation
        if (!this.activeEdgeType) this.activeEdgeType = 'relation';
        const target = this.clientToGraph(e.clientX, e.clientY);
        const port = this._nodePorts(node)[portSide];
        const sourcePortId = buildPortId(nodeId, portSide);
        this._creatingEdge = {
            fromNodeId: nodeId, fromPort: port, fromSide: portSide,
            fromPortId: sourcePortId,
            mouseGraph: target,
        };
        this._interactState = { type: 'create-edge' };
        this._renderTempEdge(target);
    }

    _onResizeStart(e, nodeId, corner) {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        e.cancelBubble = true; // 防止冒泡到节点 mousedown 触发拖拽
        const node = this.getNode(nodeId); if (!node) return;
        if (!this.selectedNodeIds.has(nodeId)) {
            this.selectedNodeIds.clear(); this.selectedEdgeIds.clear();
            this.selectedNodeIds.add(nodeId);
            this._renderAll();
            this._emitSelection();
        }
        const startClient = { x: e.clientX, y: e.clientY };
        const startGraph = this.clientToGraph(e.clientX, e.clientY);
        this._snapshot();
        this._interactState = {
            type: 'resize-node', nodeId, corner,
            orig: { x: node.x, y: node.y, w: node.width, h: node.height },
            startClient, startGraph, didMove: false,
            shiftPressed: e.shiftKey,
        };
    }

    // ========== 全局鼠标移动/抬起 ==========
    _onMouseMove(e) {
        if (!this._interactState) return;
        const state = this._interactState;

        if (state.type === 'pan') {
            const dx = e.clientX - state.startClient.x;
            const dy = e.clientY - state.startClient.y;
            this.data.viewport.tx = state.startTx + dx;
            this.data.viewport.ty = state.startTy + dy;
            this._applyViewport();
            this._onCoordsUpdate(e.clientX, e.clientY);
            return;
        }

        if (state.type === 'marquee') {
            const l1 = this._toLocalXY(state.startClient.x, state.startClient.y);
            const l2 = this._toLocalXY(e.clientX, e.clientY);
            this._showSelectionRect(l1, l2);
            return;
        }

        if (state.type === 'create-node') {
            const l1 = state.startLocal;
            const l2 = this._toLocalXY(e.clientX, e.clientY);
            this._showCreateRect(l1, l2, e.shiftKey);
            this._onCoordsUpdate(e.clientX, e.clientY);
            return;
        }

        if (state.type === 'move-nodes') {
            const g = this.clientToGraph(e.clientX, e.clientY);
            const refId = state.nodeIds[0];
            const refNode = this.getNode(refId);
            if (!refNode) return;
            const gx = g.x - state.startOffset.x;
            const gy = g.y - state.startOffset.y;
            const dx = gx - refNode.x;
            const dy = gy - refNode.y;
            if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && !state.didMove) return;
            state.didMove = true;
            if (!state._snapshotted) { this._snapshot(); state._snapshotted = true; }
            for (const id of state.nodeIds) {
                const n = this.getNode(id);
                if (!n) continue;
                n.x += dx; n.y += dy;
            }
            this._renderAll();
            this._emitChange();
            return;
        }

        if (state.type === 'resize-node') {
            // 拖拽阈值（客户端像素），避免微小移动导致跳变
            const cx = e.clientX - state.startClient.x;
            const cy = e.clientY - state.startClient.y;
            if (!state.didMove && (Math.abs(cx) < 3 && Math.abs(cy) < 3)) return;
            const g = this.clientToGraph(e.clientX, e.clientY);
            const orig = state.orig;
            const corner = state.corner;
            const hw = orig.w / 2, hh = orig.h / 2;
            const rightEdge = orig.x + hw;
            const leftEdge = orig.x - hw;
            const topEdge = orig.y - hh;
            const bottomEdge = orig.y + hh;
            let newW = orig.w, newH = orig.h, newX = orig.x, newY = orig.y;
            if (corner.k === 'se') { newW = Math.max(40, (g.x - leftEdge)); newH = Math.max(30, (g.y - topEdge)); newX = leftEdge + newW / 2; newY = topEdge + newH / 2; }
            else if (corner.k === 'sw') { newW = Math.max(40, (rightEdge - g.x)); newH = Math.max(30, (g.y - topEdge)); newX = g.x + newW / 2; newY = topEdge + newH / 2; }
            else if (corner.k === 'ne') { newW = Math.max(40, (g.x - leftEdge)); newH = Math.max(30, (bottomEdge - g.y)); newX = leftEdge + newW / 2; newY = g.y + newH / 2; }
            else if (corner.k === 'nw') { newW = Math.max(40, (rightEdge - g.x)); newH = Math.max(30, (bottomEdge - g.y)); newX = g.x + newW / 2; newY = g.y + newH / 2; }
            // Shift 键锁定比例：宽 = 高（正方形）
            if (e.shiftKey) {
                const s = Math.max(newW, newH);
                newW = s; newH = s;
                if (corner.k === 'se') { newX = leftEdge + newW / 2; newY = topEdge + newH / 2; }
                else if (corner.k === 'sw') { newX = rightEdge - newW / 2; newY = topEdge + newH / 2; }
                else if (corner.k === 'ne') { newX = leftEdge + newW / 2; newY = bottomEdge - newH / 2; }
                else if (corner.k === 'nw') { newX = rightEdge - newW / 2; newY = bottomEdge - newH / 2; }
            }
            const node = this.getNode(state.nodeId);
            if (!node) return;
            if (node.width !== newW || node.height !== newH || node.x !== newX || node.y !== newY) {
                state.didMove = true;
                node.width = newW; node.height = newH; node.x = newX; node.y = newY;
                if (node.properties) { node.properties.width = newW; node.properties.height = newH; }
                this._renderAll();
                this._emitChange();
            }
            return;
        }

        if (state.type === 'create-edge') {
            const g = this.clientToGraph(e.clientX, e.clientY);
            if (this._creatingEdge) this._creatingEdge.mouseGraph = g;
            this._renderTempEdge(g);
            return;
        }
    }

    _onMouseUp(e) {
        const state = this._interactState;
        if (!state) return;
        this._interactState = null;

        if (state.type === 'marquee') {
            const l1 = this._toLocalXY(state.startClient.x, state.startClient.y);
            const l2 = this._toLocalXY(e.clientX, e.clientY);
            this._hideSelectionRect();
            const x1 = Math.min(l1.x, l2.x), y1 = Math.min(l1.y, l2.y);
            const x2 = Math.max(l1.x, l2.x), y2 = Math.max(l1.y, l2.y);
            const dist = Math.abs(x2 - x1) + Math.abs(y2 - y1);
            if (dist > 6) {
                // 框选只改变选择，不修改数据，不需要撤销快照
                const g1 = this.clientToGraph(state.startClient.x, state.startClient.y);
                const g2 = this.clientToGraph(e.clientX, e.clientY);
                const gx1 = Math.min(g1.x, g2.x), gy1 = Math.min(g1.y, g2.y);
                const gx2 = Math.max(g1.x, g2.x), gy2 = Math.max(g1.y, g2.y);
                if (!e.shiftKey) { this.selectedNodeIds.clear(); this.selectedEdgeIds.clear(); }
                else { this.selectedEdgeIds.clear(); }
                // 框选节点：bbox 与选框相交
                for (const n of this.data.nodes) {
                    const b = this._nodeBBox(n);
                    if (b.right >= gx1 && b.left <= gx2 && b.bottom >= gy1 && b.top <= gy2) {
                        this.selectedNodeIds.add(n.id);
                    }
                }
                // 框选连线：连线中点在选框内
                for (const ed of this.data.edges) {
                    const mid = this._edgeMidpoint(ed);
                    if (mid && mid.x >= gx1 && mid.x <= gx2 && mid.y >= gy1 && mid.y <= gy2) {
                        this.selectedEdgeIds.add(ed.id);
                    }
                }
                this._renderAll();
                this._emitSelection();
            }
            return;
        }

        if (state.type === 'create-node') {
            const startG = state.startGraph;
            const endG = this.clientToGraph(e.clientX, e.clientY);
            this._hideCreateRect();
            const dx = endG.x - startG.x;
            const dy = endG.y - startG.y;
            let w = Math.abs(dx), h = Math.abs(dy);
            // Shift 键：约束为正方形（宽 = 高）
            if (e.shiftKey) { const s = Math.max(w, h); w = s; h = s; }
            const x = (dx >= 0) ? startG.x : (startG.x - w);
            const y = (dy >= 0) ? startG.y : (startG.y - h);
            const def = NG_NODE_TYPES[state.ngType] || NG_NODE_TYPES.character;
            const MIN = 20;
            const finalW = w >= MIN ? w : def.width;
            const finalH = h >= MIN ? h : def.height;
            const cx = x + finalW / 2, cy = y + finalH / 2;
            const newId = this.addNode(state.ngType, cx, cy, t('ui.ng_node_type_' + state.ngType) || def.label, finalW, finalH);
            // 非连续绘制模式：创建后自动返回选择模式
            if (!this.continuousDraw) {
                this.setActiveTool(null);
            }
            // 选中刚创建的节点
            if (newId) {
                this.selectedNodeIds.clear();
                this.selectedEdgeIds.clear();
                this.selectedNodeIds.add(newId);
                this._renderAll();
                this._emitSelection();
            }
            return;
        }

        if (state.type === 'resize-node') {
            // resize 结束（修改属性面板的尺寸值需要 onChange 触发，已在 mousemove 中触发）
            if (state.didMove) {
                this._emitChange();
                this._emitSelection();
            }
            return;
        }

        if (state.type === 'create-edge') {
            this._finalizeCreatingEdge(e.clientX, e.clientY);
            return;
        }

        if (state.type === 'move-nodes') {
            if (state.didMove) this._emitChange();
            return;
        }
    }

    _finalizeCreatingEdge(clientX, clientY) {
        if (!this._creatingEdge) return;
        const fromNodeId = this._creatingEdge.fromNodeId;
        const sourcePortId = this._creatingEdge.fromPortId || buildPortId(fromNodeId, this._creatingEdge.fromSide);
        const sourceParsed = parsePortId(sourcePortId);
        const g = this.clientToGraph(clientX, clientY);
        // 流程模式：只吸附到左侧（输入）端口
        const onlyLeft = this.mode === 'flow';
        // 放大端口命中：先找离鼠标最近的端口（graph 距离 <= SNAP_RADIUS 像素）
        // 先把屏幕像素半径换算为 graph 半径
        const snapPx = 42; // 屏幕像素吸附半径（约 2.5 倍端口圆点，很宽容）
        const snapGraph = snapPx / Math.max(0.1, this.zoom);
        let bestPort = null; // {nodeId, side, dist, x, y}
        let bestDist = Infinity;
        for (const n of this.data.nodes) {
            if (n.id === fromNodeId) continue; // 不能连自己
            // 不能连接到跨模式节点（流程节点不能连关系节点，反之亦然）
            if ((n.mode || 'relation') !== this.mode) continue;
            const ports = this._nodePorts(n);
            for (const side in ports) {
                // 流程模式：只匹配左侧输入端口
                if (onlyLeft && side !== 'left') continue;
                const p = ports[side];
                const dx = p.x - g.x, dy = p.y - g.y;
                const d2 = dx * dx + dy * dy;
                if (d2 < bestDist) {
                    bestDist = d2;
                    bestPort = { nodeId: n.id, side, x: p.x, y: p.y, distSq: d2 };
                }
            }
        }
        let targetNode = null;
        let targetSide = null;
        const snapGraphSq = snapGraph * snapGraph;
        if (bestPort && bestPort.distSq <= snapGraphSq) {
            targetNode = this.getNode(bestPort.nodeId);
            targetSide = bestPort.side;
        } else {
            // 端口吸附未命中：回退到节点 bbox 内，自动选最近端口
            for (const n of this.data.nodes) {
                if (n.id === fromNodeId) continue;
                // 不能连接到跨模式节点
                if ((n.mode || 'relation') !== this.mode) continue;
                const b = this._nodeBBox(n);
                // 再给 bbox 也加个宽容的外部扩展区域（18px screen），贴边就能连
                const pad = 18 / Math.max(0.1, this.zoom);
                if (g.x >= b.left - pad && g.x <= b.right + pad && g.y >= b.top - pad && g.y <= b.bottom + pad) {
                    targetNode = n;
                    if (onlyLeft) {
                        // 流程模式：强制吸附到左侧端口
                        targetSide = 'left';
                    } else {
                        const picked = this._pickPort(n, g);
                        targetSide = picked.side;
                    }
                    break;
                }
            }
        }
        this._abortCreatingEdge();
        if (targetNode && targetSide && targetNode.id !== fromNodeId && sourceParsed) {
            // 流程模式：检查是否形成循环
            if (this.mode === 'flow' && this._hasCycle(fromNodeId, targetNode.id)) {
                return; // 不能创建循环连线
            }
            const targetPortId = buildPortId(targetNode.id, targetSide);
            this._snapshot();
            const edgeType = this.activeEdgeType || 'relation';
            const def = NG_EDGE_TYPES[edgeType] || NG_EDGE_TYPES.relation;
            // 检查全局设置：默认是否隐藏箭头
            const defaultHideArrow = (typeof ngDefaultSettings !== 'undefined' && ngDefaultSettings.hideArrowByDefault) || false;
            const edge = {
                id: 'e_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                type: edgeType,
                sourcePortId, targetPortId,
                sourceNodeId: sourceParsed.nodeId,
                targetNodeId: targetNode.id,
                text: '',
                properties: {
                    edgeType,
                    showArrow: defaultHideArrow ? false : def.arrow,
                    color: def.color,
                    dash: def.dash,
                },
            };
            this.data.edges.push(edge);
            this._renderAll();
            this._emitChange();
            // 非连续绘制模式：创建后自动返回选择模式
            if (!this.continuousDraw) {
                this.setActiveEdge(null);
            }
            // 选中刚创建的连线
            this.selectedNodeIds.clear();
            this.selectedEdgeIds.clear();
            this.selectedEdgeIds.add(edge.id);
            this._renderAll();
            this._emitSelection();
        }
    }
    _abortCreatingEdge() {
        this._creatingEdge = null;
        this.tempEdgeLayer.innerHTML = '';
    }
    _renderTempEdge(targetGraph) {
        if (!this._creatingEdge) return;
        const p1 = this._creatingEdge.fromPort;
        const p2 = targetGraph;
        const edgeType = this.activeEdgeType || 'relation';
        const def = NG_EDGE_TYPES[edgeType] || NG_EDGE_TYPES.relation;
        const color = this._normalizeColor(def.color, '#4a90d9');
        const dash = (def.dash != null) ? def.dash : '';
        const showArrow = !!def.arrow;
        // 简单直线先
        const dx = Math.abs(p2.x - p1.x) * 0.5 + 40;
        let c1x, c1y;
        if (this._creatingEdge.fromSide === 'left') { c1x = p1.x - dx; c1y = p1.y; }
        else if (this._creatingEdge.fromSide === 'right') { c1x = p1.x + dx; c1y = p1.y; }
        else if (this._creatingEdge.fromSide === 'top') { c1x = p1.x; c1y = p1.y - dx; }
        else { c1x = p1.x; c1y = p1.y + dx; }
        const c2x = p2.x, c2y = p2.y;
        const d = `M${p1.x},${p1.y} C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
        const markerAttr = showArrow ? `marker-end="url(#${this._getArrowMarkerId(color)})"` : '';
        const dashAttr = dash ? `stroke-dasharray="${dash}"` : '';
        this.tempEdgeLayer.innerHTML = `
            <path d="${d}" fill="none" stroke="${color}" stroke-width="2" ${dashAttr} stroke-linecap="round" ${markerAttr}/>
            <circle cx="${p2.x}" cy="${p2.y}" r="6" fill="#fff" stroke="${color}" stroke-width="1.5"/>
        `;
    }

    _showSelectionRect(l1, l2) {
        if (!this.selectionRectEl) {
            const d = document.createElement('div');
            d.style.cssText = 'position:absolute;border:1px dashed #4a90d9;background:rgba(74,144,217,0.1);z-index:5;pointer-events:none;';
            this.overlayHost.appendChild(d);
            this.selectionRectEl = d;
        }
        const x = Math.min(l1.x, l2.x), y = Math.min(l1.y, l2.y);
        const w = Math.abs(l2.x - l1.x), h = Math.abs(l2.y - l1.y);
        this.selectionRectEl.style.left = x + 'px';
        this.selectionRectEl.style.top = y + 'px';
        this.selectionRectEl.style.width = w + 'px';
        this.selectionRectEl.style.height = h + 'px';
    }
    _hideSelectionRect() {
        if (this.selectionRectEl) {
            this.selectionRectEl.remove();
            this.selectionRectEl = null;
        }
    }
    _showCreateRect(l1, l2, isSquare) {
        if (!this.createRectEl) {
            const d = document.createElement('div');
            d.style.cssText = 'position:absolute;border:2px dashed #4a90d9;background:rgba(74,144,217,0.1);z-index:5;pointer-events:none;';
            this.overlayHost.appendChild(d);
            this.createRectEl = d;
        }
        let x = Math.min(l1.x, l2.x), y = Math.min(l1.y, l2.y);
        let w = Math.abs(l2.x - l1.x), h = Math.abs(l2.y - l1.y);
        if (isSquare) { const s = Math.max(w, h); w = s; h = s; }
        this.createRectEl.style.left = x + 'px';
        this.createRectEl.style.top = y + 'px';
        this.createRectEl.style.width = w + 'px';
        this.createRectEl.style.height = h + 'px';
    }
    _hideCreateRect() {
        if (this.createRectEl) { this.createRectEl.remove(); this.createRectEl = null; }
    }

    setCoordsEl(el) { this.coordsEl = el; }
}

// ========== 与主程序对接的函数（保持原 API 名，供 editor.js 和主程序调用） ==========

function getG6Class() { return null; } // 不再需要 G6
function createNGNode(engine, ngType, x, y, text, w, h) {
    if (!(engine instanceof NGEngine)) return null;
    return engine.addNode(ngType, x, y, text, w, h);
}
// buildEdgeModel：
//  source/target 可以是 端口ID (abc_1/abc_t)，也可以是 节点ID（此时默认 右出=4 / 左入=2）
function buildEdgeModel(id, type, source, target, text) {
    const def = NG_EDGE_TYPES[type] || NG_EDGE_TYPES.relation;
    let sourceNodeId = null, targetNodeId = null;
    let sourcePortId = null, targetPortId = null;
    const sp = parsePortId(source);
    const tp = parsePortId(target);
    if (sp) { sourceNodeId = sp.nodeId; sourcePortId = source; }
    else if (source) { sourceNodeId = source; sourcePortId = buildPortId(source, NG_PORT_SIDE_RIGHT); }
    if (tp) { targetNodeId = tp.nodeId; targetPortId = target; }
    else if (target) { targetNodeId = target; targetPortId = buildPortId(target, NG_PORT_SIDE_LEFT); }
    return {
        id: id || ('e_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)),
        type, source, target, text,
        sourcePortId, targetPortId, sourceNodeId, targetNodeId,
        properties: { edgeType: type, showArrow: def.arrow, color: def.color, dash: def.dash },
        style: def,
    };
}
function clientToGraph(engine, containerEl, clientX, clientY) {
    if (engine instanceof NGEngine) return engine.clientToGraph(clientX, clientY);
    const rect = containerEl.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
}

// 构建工具栏（Lucide 风格图标）
// 根据模式获取可用的节点类型键列表
function getNodeTypesForMode(mode) {
    const relationTypes = ['character', 'scene', 'event', 'setting', 'chapter'];
    const flowTypes = ['start', 'end', 'condition', 'process', 'subprocess', 'merge'];
    if (mode === 'flow') return flowTypes;
    if (mode === 'timeline') return relationTypes; // 时间线模式使用关系图节点类型
    return relationTypes;
}
// 生成节点按钮 SVG
function buildNodeButtonSVG(type) {
    const def = NG_NODE_TYPES[type];
    if (!def) return '';
    let content;
    const W = 'stroke="rgba(255,255,255,0.9)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"';
    if (def.shape === 'ellipse') {
        content = `<ellipse cx="12" cy="12" rx="9" ry="6" fill="${def.color}" stroke="${def.stroke}" stroke-width="1"/>`;
    } else if (def.shape === 'diamond') {
        if (type === 'condition') {
            // 条件判断：菱形 + "?" 号
            content = `<path d="M12 4l8 8-8 8-8-8z" fill="${def.color}" stroke="${def.stroke}" stroke-width="1"/>
                <text x="12" y="15" text-anchor="middle" fill="rgba(255,255,255,0.9)" font-size="11" font-weight="bold">?</text>`;
        } else if (type === 'merge') {
            // 合并：菱形 + 水平线
            content = `<path d="M12 4l8 8-8 8-8-8z" fill="${def.color}" stroke="${def.stroke}" stroke-width="1"/>
                <line x1="8" y1="12" x2="16" y2="12" ${W}/>`;
        } else {
            content = `<path d="M12 4l8 8-8 8-8-8z" fill="${def.color}" stroke="${def.stroke}" stroke-width="1"/>`;
        }
    } else if (def.shape === 'rounded') {
        if (type === 'start') {
            // 起点：圆角矩形 + 播放三角
            content = `<rect x="4" y="6" width="16" height="12" rx="${def.radius}" fill="${def.color}" stroke="${def.stroke}" stroke-width="1"/>
                <polygon points="10,8 10,16 16,12" fill="rgba(255,255,255,0.9)" stroke="none"/>`;
        } else if (type === 'end') {
            // 终点：圆角矩形 + 停止方块
            content = `<rect x="4" y="6" width="16" height="12" rx="${def.radius}" fill="${def.color}" stroke="${def.stroke}" stroke-width="1"/>
                <rect x="9" y="9" width="6" height="6" rx="1" fill="rgba(255,255,255,0.9)" stroke="none"/>`;
        } else {
            content = `<rect x="4" y="6" width="16" height="12" rx="${def.radius}" fill="${def.color}" stroke="${def.stroke}" stroke-width="1"/>`;
        }
    } else {
        // rect
        if (type === 'subprocess') {
            // 子流程：矩形 + 左侧双竖线
            content = `<rect x="4" y="6" width="16" height="12" rx="${def.radius}" fill="${def.color}" stroke="${def.stroke}" stroke-width="1"/>
                <line x1="8.5" y1="8" x2="8.5" y2="16" ${W}/>
                <line x1="11" y1="8" x2="11" y2="16" ${W}/>`;
        } else {
            // 处理：纯矩形
            content = `<rect x="4" y="6" width="16" height="12" rx="${def.radius}" fill="${def.color}" stroke="${def.stroke}" stroke-width="1"/>`;
        }
    }
    const label = t('ui.ng_node_type_' + type) || def.label;
    return `<button class="ng-btn" data-tool="${type}" title="${label}"><svg viewBox="0 0 24 24" width="14" height="14">${content}</svg></button>`;
}
// 重建工具栏中的节点按钮（模式切换时调用）
function rebuildToolbarNodeButtons(toolbar, mode) {
    if (!toolbar) return;
    const divider = toolbar.querySelectorAll('.ng-toolbar-divider');
    // 找到第一个分隔符（节点按钮位于第一个和第二个分隔符之间）
    if (divider.length < 2) return;
    const firstDiv = divider[0];
    const secondDiv = divider[1];
    // 移除 firstDiv 和 secondDiv 之间的所有节点按钮
    let el = firstDiv.nextSibling;
    while (el && el !== secondDiv) {
        const next = el.nextSibling;
        if (el.tagName === 'BUTTON' && el.dataset && el.dataset.tool && !el.dataset.action && !el.dataset.edge) {
            el.remove();
        }
        el = next;
    }
    // 插入新节点按钮
    const types = getNodeTypesForMode(mode);
    const fragment = document.createDocumentFragment();
    types.forEach(type => {
        const html = buildNodeButtonSVG(type);
        if (html) {
            const temp = document.createElement('div');
            temp.innerHTML = html;
            const btn = temp.firstElementChild;
            if (btn) fragment.appendChild(btn);
        }
    });
    if (firstDiv.nextSibling) {
        firstDiv.parentNode.insertBefore(fragment, firstDiv.nextSibling);
    } else {
        firstDiv.parentNode.appendChild(fragment);
    }
}

function buildNodeGraphToolbarHTML(statusId, mode) {
    mode = mode || 'relation';
    const ICON = {
        select: '<path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>',
        trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
        rotateCCW: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
        rotateCW: '<path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
        zoomOut: '<circle cx="11" cy="11" r="8"/><line x1="8" y1="11" x2="14" y2="11"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
        zoomIn: '<circle cx="11" cy="11" r="8"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
        zoomReset: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
        save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
        continuous: '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>',
        autoLayout: '<path d="M4 20h4v-4H4v4z"/><path d="M16 4h4v4h-4V4z"/><path d="M4 8h4V4H4v4z"/><path d="M16 16h4v-4h-4v4z"/><path d="M8 10l4-4 4 4"/><path d="M8 14l4 4 4-4"/>',
    };
    const S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

    const nodeTypes = getNodeTypesForMode(mode);
    const nodeButtons = nodeTypes.map((type) => buildNodeButtonSVG(type)).join('');

    const edgeButtons = Object.entries(NG_EDGE_TYPES).map(([type, def]) => {
        const dash = def.dash ? `stroke-dasharray="${def.dash}"` : '';
        const arrow = def.arrow ? `<path d="M18 12l4 0M20 10l2 2-2 2" stroke="${def.color}" stroke-width="1.5" fill="none"/>` : '';
        const label = t('ui.ng_edge_type_' + type) || def.label;
        const desc = t('ui.ng_edge_type_' + type + '_desc') || def.desc;
        return `<button class="ng-btn" data-edge="${type}" title="${label}：${desc}"><svg viewBox="0 0 24 24" width="20" height="14" fill="none"><line x1="2" y1="7" x2="16" y2="7" stroke="${def.color}" stroke-width="2" ${dash}/>${arrow}</svg></button>`;
    }).join('');

    const iconBtn = (action, title, path) =>
        `<button class="ng-btn"${action ? ` data-action="${action}"` : ''} title="${title}"><svg viewBox="0 0 24 24" width="15" height="15" ${S}>${path}</svg></button>`;

    return `
        <div class="node-graph-toolbar">
            <select class="ng-mode-select" title="${t('ui.ng_mode') || '图模式'}">
                <option value="relation">${t('ui.ng_mode_relation') || '关系图模式'}</option>
                <option value="flow">${t('ui.ng_mode_flow') || '流程模式'}</option>
                <option value="timeline">${t('ui.ng_mode_timeline') || '时间线模式'}</option>
                <option value="view">${t('ui.ng_mode_view') || '观察模式'}</option>
            </select>
            <div class="ng-toolbar-divider"></div>
            <button class="ng-btn active" data-tool="select" title="${t('ui.ng_select') || '选择/拖拽'}"><svg viewBox="0 0 24 24" width="15" height="15" ${S}>${ICON.select}</svg></button>
            <div class="ng-toolbar-divider"></div>
            ${nodeButtons}
            <div class="ng-toolbar-divider"></div>
            ${edgeButtons}
            <div class="ng-toolbar-divider"></div>
            ${iconBtn('continuous', t('ui.ng_continuous_draw') || '连续绘制 (Tab)', ICON.continuous)}
            <div class="ng-toolbar-divider"></div>
            <!-- 执行模拟按钮组 -->
            <div class="ng-sim-buttons" style="display:${mode === 'flow' ? '' : 'none'}">
                ${iconBtn('sim-start', t('ui.ng_sim_start') || '开始模拟',
                    '<path d="M5 3l14 9-14 9V3z"/>')}
                ${iconBtn('sim-step', t('ui.ng_sim_step') || '下一步',
                    '<path d="M5 4h4v16H5V4z"/><path d="M19 12l-8 7V5l8 7z"/>')}
                ${iconBtn('sim-auto', t('ui.ng_sim_auto') || '自动执行',
                    '<polygon points="5 3 19 12 5 21 5 3"/><rect x="15" y="4" width="4" height="16" rx="1"/>')}
                ${iconBtn('sim-reset', t('ui.ng_sim_reset') || '重置',
                    '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>')}
                <span class="ng-sim-label" id="ng-sim-label">${t('ui.ng_sim_idle') || '待模拟'}</span>
            </div>
            <div class="ng-toolbar-divider"></div>
            ${iconBtn('delete', t('ui.ng_delete') || '删除选中', ICON.trash)}
            <div class="ng-toolbar-divider"></div>
            ${iconBtn('undo', t('ui.ng_undo') || '撤销 (Ctrl+Z)', ICON.rotateCCW)}
            ${iconBtn('redo', t('ui.ng_redo') || '重做 (Ctrl+Shift+Z)', ICON.rotateCW)}
            <div class="ng-toolbar-divider"></div>
            ${iconBtn('zoom-out', t('ui.ng_zoom_out') || '缩小', ICON.zoomOut)}
            <span class="ng-zoom-label" id="ng-zoom-label">100%</span>
            ${iconBtn('zoom-in', t('ui.ng_zoom_in') || '放大', ICON.zoomIn)}
            ${iconBtn('zoom-reset', t('ui.ng_zoom_reset') || '重置缩放', ICON.zoomReset)}
            <div class="ng-toolbar-divider"></div>
            <div class="ng-layout-selector-wrap">
                <button class="ng-btn" data-action="layout-selector" title="${t('ui.ng_layout') || '排版'}">
                    <svg viewBox="0 0 24 24" width="15" height="15" ${S}><path d="M4 20h4v-4H4v4z"/><path d="M16 4h4v4h-4V4z"/><path d="M4 8h4V4H4v4z"/><path d="M16 16h4v-4h-4v4z"/><path d="M8 10l4-4 4 4"/><path d="M8 14l4 4 4-4"/></svg>
                    <svg viewBox="0 0 24 24" width="10" height="10" ${S}><path d="M6 9l6 6 6-6"/></svg>
                </button>
                <div class="ng-layout-menu" style="display:none">
                    <div class="ng-layout-option" data-layout="manual">${t('ui.ng_layout_manual') || '默认（手动拖拽）'}</div>
                    <div class="ng-layout-option" data-layout="force">${t('ui.ng_layout_force') || '力度图'}</div>
                    <div class="ng-layout-option" data-layout="chapter">${t('ui.ng_layout_chapter') || '按章节顺序'}</div>
                    <div class="ng-layout-option" data-layout="timestamp">${t('ui.ng_layout_timestamp') || '按时间戳顺序'}</div>
                </div>
            </div>
            <div class="ng-toolbar-divider"></div>
            ${iconBtn('save', t('ui.save') || '保存', ICON.save)}
            <div class="ng-toolbar-divider"></div>
            <button class="ng-btn" data-action="history" title="${t('ui.ng_history') || '历史记录 (Ctrl+H)'}"><svg viewBox="0 0 24 24" width="15" height="15" ${S}><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/></svg></button>
            ${iconBtn('export', t('ui.ng_export_html') || '导出为HTML', '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>')}
            ${iconBtn('export-archive', t('ui.ng_export_archive') || '导出角色档案', '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>')}
            <div class="ng-toolbar-spacer"></div>
            <span class="ng-status"${statusId ? ` id="${statusId}"` : ''}></span>
        </div>
    `;
}

// 右键菜单
function setupNodeGraphContextMenu(engine, markDirty) {
    if (!(engine instanceof NGEngine)) return;
    let menu = document.getElementById('ng-context-menu');
    if (!menu) {
        menu = document.createElement('div');
        menu.id = 'ng-context-menu';
        menu.className = 'ng-context-menu';
        menu.style.display = 'none';
        document.body.appendChild(menu);
    }
    function buildMenuHTML(targetType) {
        if (targetType === 'node') {
            return `
                <div class="ng-ctx-item" data-action="delete">${t('ui.ng_delete') || '删除'}</div>
                <div class="ng-ctx-item" data-action="duplicate">${t('ui.ng_duplicate') || '复制节点'}</div>
                <div class="ng-ctx-sep"></div>
                <div class="ng-ctx-item" data-action="layer_top">${t('ui.ng_layer_top') || '移到最顶'}</div>
                <div class="ng-ctx-item" data-action="layer_up">${t('ui.ng_layer_up') || '上移一层'}</div>
                <div class="ng-ctx-item" data-action="layer_down">${t('ui.ng_layer_down') || '下移一层'}</div>
                <div class="ng-ctx-item" data-action="layer_bottom">${t('ui.ng_layer_bottom') || '移到最底'}</div>
            `;
        }
        // canvas
        return `
            <div class="ng-ctx-item" data-action="select_all">${t('ui.ng_select_all') || '全选'}</div>
            <div class="ng-ctx-sep"></div>
            <div class="ng-ctx-item" data-action="undo">${t('ui.ng_undo') || '撤销'}</div>
            <div class="ng-ctx-item" data-action="redo">${t('ui.ng_redo') || '重做'}</div>
        `;
    }

    function show(x, y, targetType, targetId) {
        menu.dataset.targetType = targetType;
        menu.dataset.targetId = targetId;
        menu.innerHTML = buildMenuHTML(targetType);
        menu.style.display = 'block';
        const r = menu.getBoundingClientRect();
        menu.style.left = Math.min(x, window.innerWidth - r.width - 4) + 'px';
        menu.style.top = Math.min(y, window.innerHeight - r.height - 4) + 'px';
    }
    function hide() { menu.style.display = 'none'; }

    engine.container.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        // 右键时取消 hover 高亮
        if (engine._hoveredNodeId !== null) {
            engine._hoveredNodeId = null;
            engine._hoveredEdgeIds.clear();
            engine._renderAll();
        }
        const p = engine.clientToGraph(e.clientX, e.clientY);
        // 节点命中
        for (const n of engine.data.nodes) {
            const b = engine._nodeBBox(n);
            if (p.x >= b.left && p.x <= b.right && p.y >= b.top && p.y <= b.bottom) {
                if (!engine.selectedNodeIds.has(n.id)) {
                    engine.selectedNodeIds.clear();
                    engine.selectedEdgeIds.clear();
                    engine.selectedNodeIds.add(n.id);
                    engine._renderAll();
                    engine._emitSelection();
                }
                show(e.clientX, e.clientY, 'node', n.id);
                return;
            }
        }
        show(e.clientX, e.clientY, 'canvas', null);
    });

    menu.addEventListener('click', (e) => {
        const item = e.target.closest('.ng-ctx-item');
        if (!item) return;
        const action = item.dataset.action;
        if (action === 'delete') {
            engine.deleteSelected();
            if (markDirty) markDirty();
        } else if (action === 'duplicate') {
            engine.duplicateSelected();
            if (markDirty) markDirty();
        } else if (action === 'layer_top') {
            const nid = engine.getSelectedNodeId();
            if (nid) { engine.moveLayerTop(nid); if (markDirty) markDirty(); }
        } else if (action === 'layer_up') {
            const nid = engine.getSelectedNodeId();
            if (nid) { engine.moveLayerUp(nid); if (markDirty) markDirty(); }
        } else if (action === 'layer_down') {
            const nid = engine.getSelectedNodeId();
            if (nid) { engine.moveLayerDown(nid); if (markDirty) markDirty(); }
        } else if (action === 'layer_bottom') {
            const nid = engine.getSelectedNodeId();
            if (nid) { engine.moveLayerBottom(nid); if (markDirty) markDirty(); }
        } else if (action === 'select_all') {
            engine.selectedNodeIds.clear();
            engine.selectedEdgeIds.clear();
            engine.data.nodes.forEach(n => engine.selectedNodeIds.add(n.id));
            engine.data.edges.forEach(e => engine.selectedEdgeIds.add(e.id));
            engine._renderAll();
            engine._emitSelection();
        } else if (action === 'undo') {
            engine.undo();
        } else if (action === 'redo') {
            engine.redo();
        }
        hide();
    });
    document.addEventListener('click', hide, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
}

// 属性面板 HTML
function buildNodeGraphPropertyPanelHTML() {
    const S = 'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';
    return `
        <aside class="ng-property-panel">
            <div class="ng-panel-header">
                <span class="ng-panel-title">${t('ui.ng_properties') || '属性面板'}</span>
                <button class="ng-panel-toggle" title="${t('ui.ng_collapse') || '收起面板'}">‹</button>
            </div>
            <div class="ng-panel-empty">
                <div class="ng-panel-empty-icon">
                    <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.4">
                        <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
                    </svg>
                </div>
                <div>${t('ui.ng_select_node_hint') || '选中节点或连线查看属性'}</div>
            </div>
            <div class="ng-panel-content" style="display:none">
                <!-- 节点属性 -->
                <div class="ng-prop-section" data-ng-prop-section="node">
                    <div class="ng-prop-section-title">
                        <svg viewBox="0 0 24 24" width="14" height="14" ${S}><circle cx="12" cy="12" r="4"/><path d="M12 2v6"/><path d="M12 16v6"/><path d="M2 12h6"/><path d="M16 12h6"/></svg>
                        ${t('ui.ng_node_properties') || '节点属性'}
                    </div>
                    <div class="ng-panel-row ng-prop-id-row"><label>${t('ui.ng_id') || 'ID'}</label><span class="ng-prop-id" title="${t('ui.ng_id_copy') || '点击复制'}"></span></div>
                    <div class="ng-panel-row"><label>${t('ui.ng_name') || '名称'}</label><input type="text" class="ng-prop-name" placeholder="${t('ui.ng_name_ph') || '节点名称'}"></div>
                    <div class="ng-panel-row"><label>${t('ui.ng_type') || '类型'}</label>
                        <select class="ng-prop-type">
                            ${Object.entries(NG_NODE_TYPES).map(([type, def]) => `<option value="${type}">${t('ui.ng_node_type_' + type) || def.label}</option>`).join('')}
                        </select>
                    </div>
                    <div class="ng-panel-row ng-prop-layer-row"><label>${t('ui.ng_layer') || '图层'}</label>
                        <div class="ng-prop-layer-btns">
                            <button class="ng-btn ng-layer-btn" data-layer="top" title="${t('ui.ng_layer_top') || '移到最顶'}">⤒</button>
                            <button class="ng-btn ng-layer-btn" data-layer="up" title="${t('ui.ng_layer_up') || '上移一层'}">↑</button>
                            <button class="ng-btn ng-layer-btn" data-layer="down" title="${t('ui.ng_layer_down') || '下移一层'}">↓</button>
                            <button class="ng-btn ng-layer-btn" data-layer="bottom" title="${t('ui.ng_layer_bottom') || '移到最底'}">⤓</button>
                        </div>
                    </div>
                    <div class="ng-panel-row ng-prop-size-row"><label>${t('ui.ng_size') || '尺寸'}</label>
                        <div class="ng-prop-size-inputs">
                            <input type="number" class="ng-prop-width" min="40" max="1000" step="10" title="${t('ui.ng_width') || '宽度'}">
                            <span class="ng-prop-size-x">×</span>
                            <input type="number" class="ng-prop-height" min="30" max="500" step="10" title="${t('ui.ng_height') || '高度'}">
                        </div>
                    </div>
                    <div class="ng-panel-row"><label>${t('ui.ng_desc') || '描述'}</label><textarea class="ng-prop-desc" rows="3" placeholder="${t('ui.ng_desc_ph') || '描述...'}"></textarea></div>
                    <!-- 流程节点特殊属性 -->
                    <div class="ng-prop-flow-section" data-ng-prop-flow="condition" style="display:none">
                        <div class="ng-panel-row"><label>${t('ui.ng_condition_expr') || '条件'}</label><input type="text" class="ng-prop-condition-expr" placeholder="${t('ui.ng_condition_expr_ph') || '例如: count > 10'}"></div>
                        <div class="ng-panel-row"><label>${t('ui.ng_condition_branches') || '分支'}</label><div class="ng-prop-condition-branches"><span class="ng-file-empty">${t('ui.ng_condition_branch_hint') || '编辑连线标签设置分支条件'}</span></div></div>
                    </div>
                    <div class="ng-prop-flow-section" data-ng-prop-flow="process" style="display:none">
                        <div class="ng-panel-row"><label>${t('ui.ng_process_duration') || '耗时'}</label><input type="text" class="ng-prop-process-duration" placeholder="${t('ui.ng_process_duration_ph') || '例如: 5s / 30min'}"></div>
                    </div>
                    <div class="ng-panel-row"><label>${t('ui.ng_image') || '图片'}</label>
                        <div class="ng-prop-image-wrap">
                            <input type="text" class="ng-prop-image" placeholder="${t('ui.ng_image_ph') || '图片URL或Data URL'}">
                            <button class="ng-btn ng-prop-image-btn" title="${t('ui.ng_image_upload') || '上传图片'}"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg></button>
                            <button class="ng-btn ng-prop-image-clear" title="${t('ui.ng_image_clear') || '清除图片'}"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                        </div>
                    </div>
                    <div class="ng-panel-row"><label>${t('ui.ng_color') || '颜色'}</label>
                        <div class="ng-prop-color-wrap"><input type="color" class="ng-prop-color"><button class="ng-prop-color-reset" title="${t('ui.ng_reset_color') || '重置默认色'}">↺</button></div>
                    </div>
                    <div class="ng-panel-row"><label>${t('ui.ng_tags') || '标签'}</label><div class="ng-prop-tags"></div><input type="text" class="ng-prop-tag-input" placeholder="${t('ui.ng_tag_add') || '回车添加'}"></div>
                    <div class="ng-panel-row"><label>${t('ui.ng_linked_files') || '关联文件'}</label><div class="ng-prop-files"></div><button class="ng-btn ng-add-file-btn" title="${t('ui.ng_add_file_link') || '添加关联文件'}">+ ${t('ui.ng_add_file_link') || '添加关联文件'}</button></div>
                    <!-- 时间线模式特殊属性 -->
                    <div class="ng-prop-timeline-section" data-ng-prop-timeline style="display:none">
                        <div class="ng-panel-row"><label>${t('ui.ng_timeline_order') || '排序序号'}</label><input type="number" class="ng-prop-timeline-order" min="0" step="1" placeholder="${t('ui.ng_timeline_order_ph') || '0'}"></div>
                        <div class="ng-panel-row"><label>${t('ui.ng_timestamp') || '时间戳'}</label><input type="text" class="ng-prop-timestamp" placeholder="${t('ui.ng_timestamp_ph') || '例如: 2024-01-01 或 纪元元年'}"></div>
                        <div class="ng-panel-row"><label>${t('ui.ng_chapter_ref') || '章节引用'}</label><input type="text" class="ng-prop-chapter-ref" placeholder="${t('ui.ng_chapter_ref_ph') || '例如: 第三章'}"></div>
                        <div class="ng-panel-row ng-prop-row-toggle">
                            <label>${t('ui.ng_is_head') || '设为头节点'}</label>
                            <label class="toggle-switch"><input type="checkbox" class="ng-prop-is-head"><span class="toggle-slider"></span></label>
                        </div>
                        <div class="ng-panel-row ng-prop-row-toggle">
                            <label>${t('ui.ng_is_tail') || '设为尾节点'}</label>
                            <label class="toggle-switch"><input type="checkbox" class="ng-prop-is-tail"><span class="toggle-slider"></span></label>
                        </div>
                    </div>
                </div>
                <!-- 连线属性 -->
                <div class="ng-prop-section" data-ng-prop-section="edge" style="display:none">
                    <div class="ng-prop-section-title">
                        <svg viewBox="0 0 24 24" width="14" height="14" ${S}><line x1="4" y1="20" x2="20" y2="4"/><circle cx="4" cy="20" r="2"/><circle cx="20" cy="4" r="2"/></svg>
                        ${t('ui.ng_edge_properties') || '连线属性'}
                    </div>
                    <div class="ng-panel-row ng-prop-id-row"><label>${t('ui.ng_id') || 'ID'}</label><span class="ng-prop-id ng-prop-edge-id" title="${t('ui.ng_id_copy') || '点击复制'}"></span></div>
                    <div class="ng-panel-row ng-prop-id-row">
                        <label class="ng-prop-port-label">${t('ui.ng_source_port') || '源端口'}<span class="ng-prop-port-badge ng-prop-source-port-id" title="${t('ui.ng_id_copy') || '点击复制'}"></span></label>
                        <span class="ng-prop-node-name ng-prop-source-node-name"></span>
                    </div>
                    <div class="ng-panel-row ng-prop-id-row">
                        <label class="ng-prop-port-label">${t('ui.ng_target_port') || '目标端口'}<span class="ng-prop-port-badge ng-prop-target-port-id" title="${t('ui.ng_id_copy') || '点击复制'}"></span></label>
                        <span class="ng-prop-node-name ng-prop-target-node-name"></span>
                    </div>
                    <div class="ng-panel-row"><label>${t('ui.ng_edge_label') || '标签'}</label><input type="text" class="ng-prop-edge-label" placeholder="${t('ui.ng_edge_label_ph') || '连线标签文字'}"></div>
                    <div class="ng-panel-row"><label>${t('ui.ng_edge_type') || '类型'}</label>
                        <select class="ng-prop-edge-type">
                            ${Object.entries(NG_EDGE_TYPES).map(([type, def]) => `<option value="${type}">${t('ui.ng_edge_type_' + type) || def.label}</option>`).join('')}
                        </select>
                    </div>
                    <div class="ng-panel-row"><label>${t('ui.ng_edge_color') || '颜色'}</label>
                        <div class="ng-prop-color-wrap"><input type="color" class="ng-prop-edge-color"><button class="ng-prop-edge-color-reset" title="${t('ui.ng_reset_color') || '重置默认色'}">↺</button></div>
                    </div>
                    <div class="ng-panel-row ng-prop-row-toggle">
                        <label>${t('ui.ng_show_arrow') || '箭头'}</label>
                        <label class="toggle-switch"><input type="checkbox" class="ng-prop-edge-arrow"><span class="toggle-slider"></span></label>
                    </div>
                    <div class="ng-panel-row ng-prop-row-toggle">
                        <label>${t('ui.ng_dashed_line') || '虚线'}</label>
                        <label class="toggle-switch"><input type="checkbox" class="ng-prop-edge-dash"><span class="toggle-slider"></span></label>
                    </div>
                </div>
            </div>
        </aside>
    `;
}

function updateNodeGraphPropertyPanel(panelEl, engine, nodeId, edgeId) {
    if (!panelEl) { console.warn('[NG] updatePanel called but panelEl is null'); return; }
    console.info('[NG] ╔══════════════════════════════════╗');
    console.info('[NG] ║  updateNodeGraphPropertyPanel    ║');
    console.info('[NG] ╠══════════════════════════════════╣');
    console.info('[NG] ║  nodeId:', nodeId || '(空)');
    console.info('[NG] ║  edgeId:', edgeId || '(空)');
    console.info('[NG] ║  engine OK:', !!(engine && engine instanceof NGEngine));
    console.info('[NG] ╚══════════════════════════════════╝');
    try {
        // 查找关键元素，若模板结构不匹配则降级查找
        let emptyEl = panelEl.querySelector('.ng-panel-empty');
        let contentEl = panelEl.querySelector('.ng-panel-content');
        let nodeSection = panelEl.querySelector('[data-ng-prop-section="node"]');
        let edgeSection = panelEl.querySelector('[data-ng-prop-section="edge"]');
        let missingInfo = [];
        if (!emptyEl) missingInfo.push('emptyEl');
        if (!contentEl) missingInfo.push('contentEl');
        if (!nodeSection) missingInfo.push('nodeSection');
        if (!edgeSection) missingInfo.push('edgeSection');
        if (missingInfo.length) {
            console.warn('[NG] updatePanel key elements missing, try fallback lookup:', missingInfo);
            // 兜底：在全局同 tab 范围内查找同结构元素（防止 panelEl 传错层级）
            const scope = panelEl.closest('.node-graph-body') || panelEl.parentElement || document;
            if (!emptyEl) emptyEl = scope.querySelector('.ng-panel-empty');
            if (!contentEl) contentEl = scope.querySelector('.ng-panel-content');
            if (!nodeSection) nodeSection = scope.querySelector('[data-ng-prop-section="node"]');
            if (!edgeSection) edgeSection = scope.querySelector('[data-ng-prop-section="edge"]');
            missingInfo = [];
            if (!emptyEl) missingInfo.push('emptyEl');
            if (!contentEl) missingInfo.push('contentEl');
            if (!nodeSection) missingInfo.push('nodeSection');
            if (!edgeSection) missingInfo.push('edgeSection');
            if (missingInfo.length) {
                console.error('[NG] updatePanel fallback still missing:', missingInfo);
                console.error('[NG] panelEl outerHTML (head):', panelEl.outerHTML ? panelEl.outerHTML.slice(0, 500) : '(empty)');
            } else {
                console.warn('[NG] updatePanel fallback lookup success');
            }
        }
        let node = null, edge = null;
        if (engine instanceof NGEngine) {
            if (nodeId) { node = engine.getNode(nodeId); console.info('[NG] node lookup:', nodeId, '→', node ? 'FOUND' : 'NOT FOUND (not in data.nodes)'); }
            if (edgeId) { edge = engine.getEdge(edgeId); console.info('[NG] edge lookup:', edgeId, '→', edge ? 'FOUND (type=' + edge.type + ')' : 'NOT FOUND (not in data.edges)'); if (edge) console.info('[NG] edge detail:', JSON.stringify(edge)); }
        }
        // 清空之前的选择
        panelEl.dataset.nodeId = '';
        panelEl.dataset.edgeId = '';
        if (!node && !edge) {
            console.info('[NG] → hide panel (no selection)');
            panelEl.style.display = 'none';
            if (emptyEl) emptyEl.style.display = 'none';
            if (contentEl) contentEl.style.display = 'none';
            if (nodeSection) nodeSection.style.display = 'none';
            if (edgeSection) edgeSection.style.display = 'none';
            return;
        }
        console.info('[NG] → show CONTENT panel (node:' + !!node + ', edge:' + !!edge + ')');
        panelEl.style.display = '';
        if (emptyEl) emptyEl.style.display = 'none';
        if (contentEl) contentEl.style.display = '';

        // 节点属性
        if (node) {
            panelEl.dataset.nodeId = nodeId;
            if (nodeSection) nodeSection.style.display = '';
            else console.warn('[NG] nodeSection missing, cannot display node props');
            const idSpan = panelEl.querySelector('.ng-prop-id:not(.ng-prop-edge-id)');
            if (idSpan) { idSpan.textContent = node.id; idSpan.title = (t('ui.ng_id_copy') || '点击复制') + '：' + node.id; }
            const nameInput = panelEl.querySelector('.ng-prop-name'); if (nameInput) nameInput.value = node.text || '';
            const typeSpan = panelEl.querySelector('.ng-prop-type');
            if (typeSpan) typeSpan.value = node.type;
            const widthInput = panelEl.querySelector('.ng-prop-width'); if (widthInput) widthInput.value = Math.round(node.width);
            const heightInput = panelEl.querySelector('.ng-prop-height'); if (heightInput) heightInput.value = Math.round(node.height);
            const desc = panelEl.querySelector('.ng-prop-desc'); if (desc) desc.value = (node.properties && node.properties.description) || '';
            const imageInput = panelEl.querySelector('.ng-prop-image'); if (imageInput) imageInput.value = (node.properties && node.properties.image) || '';
            const colorInput = panelEl.querySelector('.ng-prop-color');
            const nodeDef = NG_NODE_TYPES[node.type] || NG_NODE_TYPES.character;
            const nodeColor = (node.properties && node.properties.color) || nodeDef.color;
            if (colorInput) colorInput.value = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(nodeColor) ? nodeColor : nodeDef.color;
            const tagsDiv = panelEl.querySelector('.ng-prop-tags');
            if (tagsDiv) {
                const tags = (node.properties && node.properties.tags) || [];
                tagsDiv.innerHTML = tags.map(tag => `<span class="ng-tag">${escapeHtml(tag)}<i class="ng-tag-remove" data-tag="${escapeHtml(tag)}">×</i></span>`).join('');
            }
            const filesDiv = panelEl.querySelector('.ng-prop-files');
            if (filesDiv) {
                const files = (node.properties && node.properties.linkedFiles) || [];
                filesDiv.innerHTML = files.length > 0
                    ? files.map(f => `<div class="ng-file">${escapeHtml(f)}</div>`).join('')
                    : `<span class="ng-file-empty">${t('ui.ng_no_files') || '无关联文件'}</span>`;
            }
            // 流程节点特殊属性：根据类型显示对应的面板
            if (panelEl.querySelector('.ng-prop-flow-section')) {
                // 隐藏所有特殊面板
                panelEl.querySelectorAll('.ng-prop-flow-section').forEach(sec => {
                    sec.style.display = 'none';
                });
                // condition 节点显示条件表达式输入
                if (node.type === 'condition') {
                    const condSec = panelEl.querySelector('[data-ng-prop-flow="condition"]');
                    const condInput = panelEl.querySelector('.ng-prop-condition-expr');
                    if (condSec) condSec.style.display = '';
                    if (condInput) condInput.value = (node.properties && node.properties.conditionExpr) || '';
                    // 更新分支列表
                    const branchDiv = panelEl.querySelector('.ng-prop-condition-branches');
                    if (branchDiv) {
                        const outEdges = engine.data.edges.filter(e => e.sourceNodeId === node.id);
                        if (outEdges.length > 0) {
                            branchDiv.innerHTML = outEdges.map(e => {
                                const target = engine.getNode(e.targetNodeId);
                                const label = e.text || (target ? (target.text || target.id) : e.id);
                                return `<div class="ng-file">${escapeHtml(label)}</div>`;
                            }).join('');
                        } else {
                            branchDiv.innerHTML = `<span class="ng-file-empty">${t('ui.ng_condition_no_out') || '未连接任何分支'}</span>`;
                        }
                    }
                }
                // process 节点显示执行耗时
                if (node.type === 'process' || node.type === 'subprocess') {
                    const procSec = panelEl.querySelector('[data-ng-prop-flow="process"]');
                    const procInput = panelEl.querySelector('.ng-prop-process-duration');
                    if (procSec) procSec.style.display = '';
                    if (procInput) procInput.value = (node.properties && node.properties.duration) || '';
                }
            }
            // 时间线模式特殊属性同步
            const timelineSection = panelEl.querySelector('[data-ng-prop-timeline]');
            if (timelineSection) {
                const isTimelineMode = engine && engine.mode === 'timeline';
                timelineSection.style.display = isTimelineMode ? '' : 'none';
                if (isTimelineMode) {
                    const p = node.properties || {};
                    const orderInput = panelEl.querySelector('.ng-prop-timeline-order');
                    if (orderInput) orderInput.value = p.timelineOrder != null ? p.timelineOrder : '';
                    const tsInput = panelEl.querySelector('.ng-prop-timestamp');
                    if (tsInput) tsInput.value = p.timestamp || '';
                    const crInput = panelEl.querySelector('.ng-prop-chapter-ref');
                    if (crInput) crInput.value = p.chapterRef || '';
                    const headCheck = panelEl.querySelector('.ng-prop-is-head');
                    if (headCheck) headCheck.checked = p.isHead === true;
                    const tailCheck = panelEl.querySelector('.ng-prop-is-tail');
                    if (tailCheck) tailCheck.checked = p.isTail === true;
                }
            }
        } else {
            if (nodeSection) nodeSection.style.display = 'none';
        }

        // 连线属性
        if (edge) {
            console.info('[NG] → filling EDGE properties for:', edge.id, 'type=' + edge.type);
            panelEl.dataset.edgeId = edgeId;
            if (edgeSection) edgeSection.style.display = '';
            else console.warn('[NG] edgeSection missing, cannot display edge props');
            const def = NG_EDGE_TYPES[edge.type] || NG_EDGE_TYPES.relation;
            const idSpan = panelEl.querySelector('.ng-prop-edge-id');
            if (idSpan) { idSpan.textContent = edge.id; idSpan.title = (t('ui.ng_id_copy') || '点击复制') + '：' + edge.id; } else console.warn('[NG] .ng-prop-edge-id element missing');
            const srcP = edgeSourcePort(edge);
            const tgtP = edgeTargetPort(edge);
            const sourcePortIdText = srcP ? buildPortId(srcP.nodeId, srcP.side) : '-';
            const targetPortIdText = tgtP ? buildPortId(tgtP.nodeId, tgtP.side) : '-';
            const srcSpan = panelEl.querySelector('.ng-prop-source-port-id');
            if (srcSpan) { srcSpan.textContent = sourcePortIdText; srcSpan.title = (t('ui.ng_id_copy') || '点击复制') + '：' + sourcePortIdText; }
            const tgtSpan = panelEl.querySelector('.ng-prop-target-port-id');
            if (tgtSpan) { tgtSpan.textContent = targetPortIdText; tgtSpan.title = (t('ui.ng_id_copy') || '点击复制') + '：' + targetPortIdText; }
            // 显示源/目标节点名称
            const srcNode = srcP ? engine.getNode(srcP.nodeId) : null;
            const tgtNode = tgtP ? engine.getNode(tgtP.nodeId) : null;
            const srcNameSpan = panelEl.querySelector('.ng-prop-source-node-name');
            if (srcNameSpan) { srcNameSpan.textContent = srcNode ? (srcNode.text || srcNode.id || '-') : '-'; srcNameSpan.title = srcNode ? srcNode.id || '' : ''; }
            const tgtNameSpan = panelEl.querySelector('.ng-prop-target-node-name');
            if (tgtNameSpan) { tgtNameSpan.textContent = tgtNode ? (tgtNode.text || tgtNode.id || '-') : '-'; tgtNameSpan.title = tgtNode ? tgtNode.id || '' : ''; }
            const labelInput = panelEl.querySelector('.ng-prop-edge-label');
            if (labelInput) labelInput.value = edge.text || '';
            const typeSelect = panelEl.querySelector('.ng-prop-edge-type');
            if (typeSelect) typeSelect.value = edge.type;
            const rawEdgeColor = (edge.properties && edge.properties.color) || def.color;
            const edgeColor = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(rawEdgeColor) ? rawEdgeColor : def.color;
            const colorInput = panelEl.querySelector('.ng-prop-edge-color');
            if (colorInput) { console.info('[NG] edge color input value:', edgeColor); colorInput.value = edgeColor; } else console.warn('[NG] .ng-prop-edge-color element missing');
            const arrowToggle = panelEl.querySelector('.ng-prop-edge-arrow');
            if (arrowToggle) { arrowToggle.checked = (edge.properties && edge.properties.showArrow != null) ? !!edge.properties.showArrow : !!def.arrow; } else console.warn('[NG] .ng-prop-edge-arrow element missing');
            const dashToggle = panelEl.querySelector('.ng-prop-edge-dash');
            if (dashToggle) {
                const isDashed = (edge.properties && edge.properties.dash != null) ? !!edge.properties.dash : !!def.dash;
                dashToggle.checked = isDashed;
            } else console.warn('[NG] .ng-prop-edge-dash element missing');
            console.info('[NG] → edge properties filled successfully');
        } else {
            if (edgeSection) edgeSection.style.display = 'none';
        }
    } catch (err) {
        console.error('[NG] ⚠️ updateNodeGraphPropertyPanel THROWN:', err && err.stack ? err.stack : String(err));
        // 暴力兜底：不管抛什么错，尽量让对应分区至少显示出来（防止用户看到永远空）
        try {
            if (nodeId && panelEl) {
                const ns = panelEl.querySelector('[data-ng-prop-section="node"]');
                if (ns) ns.style.display = '';
                const ce = panelEl.querySelector('.ng-panel-empty'); if (ce) ce.style.display = 'none';
                const cc = panelEl.querySelector('.ng-panel-content'); if (cc) cc.style.display = '';
            }
            if (edgeId && panelEl) {
                const es = panelEl.querySelector('[data-ng-prop-section="edge"]');
                if (es) es.style.display = '';
                const ce = panelEl.querySelector('.ng-panel-empty'); if (ce) ce.style.display = 'none';
                const cc = panelEl.querySelector('.ng-panel-content'); if (cc) cc.style.display = '';
                // 至少把 edgeId 写进 dataset，bind 函数还能救
                panelEl.dataset.edgeId = edgeId;
            }
        } catch (e2) { /* 彻底放弃 */ }
    }
}

function bindNodeGraphPropertyPanel(panelEl, engine, markDirty) {
    if (!(engine instanceof NGEngine) || !panelEl) return;

    const getNodeId = () => panelEl.dataset.nodeId;
    const getEdgeId = () => panelEl.dataset.edgeId;
    const getNode = () => engine.getNode(getNodeId());
    const getEdge = () => engine.getEdge(getEdgeId());

    // ID 行点击复制
    function bindIdCopy(spanEl) {
        if (!spanEl) return;
        spanEl.style.cursor = 'copy';
        spanEl.style.userSelect = 'all';
        spanEl.addEventListener('click', async () => {
            const v = (spanEl.textContent || '').trim();
            if (!v) return;
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(v);
                } else {
                    const ta = document.createElement('textarea');
                    ta.value = v; ta.style.position = 'fixed'; ta.style.opacity = '0';
                    document.body.appendChild(ta); ta.select();
                    try { document.execCommand('copy'); } catch (e) {}
                    document.body.removeChild(ta);
                }
                const old = spanEl.textContent;
                spanEl.textContent = (t('ui.ng_id_copied') || '已复制') + ' ✓';
                setTimeout(() => { spanEl.textContent = old; }, 900);
            } catch (e) {}
        });
    }
    bindIdCopy(panelEl.querySelector('.ng-prop-id:not(.ng-prop-edge-id)'));
    bindIdCopy(panelEl.querySelector('.ng-prop-edge-id'));
    bindIdCopy(panelEl.querySelector('.ng-prop-source-port-id'));
    bindIdCopy(panelEl.querySelector('.ng-prop-target-port-id'));
    // 端口ID现在使用 ng-prop-port-badge 样式，设置 cursor:copy 由 CSS 负责

    // 输入类控件：focus 时快照，input 时跳过快照（避免每按键产生撤销记录）
    function bindTextInput(inputEl, patchFn) {
        if (!inputEl) return;
        inputEl.addEventListener('focus', () => { engine._snapshot(); });
        inputEl.addEventListener('input', e => {
            const n = getNode(); if (!n) return;
            engine.updateNode(n.id, patchFn(e.target.value), { skipSnapshot: true });
            if (markDirty) markDirty();
        });
    }

    bindTextInput(panelEl.querySelector('.ng-prop-name'), v => ({ text: v }));
    bindTextInput(panelEl.querySelector('.ng-prop-desc'), v => ({ properties: { description: v } }));
    bindTextInput(panelEl.querySelector('.ng-prop-image'), v => ({ properties: { image: v } }));
    // 流程节点特殊属性绑定
    bindTextInput(panelEl.querySelector('.ng-prop-condition-expr'), v => ({ properties: { conditionExpr: v } }));
    bindTextInput(panelEl.querySelector('.ng-prop-process-duration'), v => ({ properties: { duration: v } }));

    // 图片上传按钮（压缩大图片，防止卡顿）
    const imageBtn = panelEl.querySelector('.ng-prop-image-btn');
    if (imageBtn) {
        imageBtn.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = function (e) {
                const file = e.target.files && e.target.files[0];
                if (!file) return;
                // 小文件直接读取，大文件用 canvas 压缩
                var maxUncompressed = 50 * 1024; // 50KB 以下不压缩
                if (file.size <= maxUncompressed) {
                    var r = new FileReader();
                    r.onload = function (ev) { applyImageDataUrl(ev.target.result); };
                    r.readAsDataURL(file);
                } else {
                    var img = new Image();
                    img.onload = function () {
                        try {
                            var canvas = document.createElement('canvas');
                            var MAX = 400; // 最大边长 400px（节点通常 160~180px）
                            var w = img.width, h = img.height;
                            if (w > MAX || h > MAX) {
                                if (w > h) { h = h * MAX / w; w = MAX; }
                                else { w = w * MAX / h; h = MAX; }
                            }
                            canvas.width = Math.round(w);
                            canvas.height = Math.round(h);
                            var ctx = canvas.getContext('2d');
                            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                            var dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                            applyImageDataUrl(dataUrl);
                        } catch (ex) {
                            // 压缩失败时回退原始读取
                            var r2 = new FileReader();
                            r2.onload = function (ev) { applyImageDataUrl(ev.target.result); };
                            r2.readAsDataURL(file);
                        }
                    };
                    img.onerror = function () {
                        var r3 = new FileReader();
                        r3.onload = function (ev) { applyImageDataUrl(ev.target.result); };
                        r3.readAsDataURL(file);
                    };
                    img.src = URL.createObjectURL(file);
                }
            };
            input.click();
        });
    }

    function applyImageDataUrl(dataUrl) {
        var imgInput = panelEl.querySelector('.ng-prop-image');
        if (!imgInput) return;
        engine._snapshot();
        imgInput.value = dataUrl;
        var n = getNode(); if (!n) return;
        engine.updateNode(n.id, { properties: { image: dataUrl } }, { skipSnapshot: true });
        if (markDirty) markDirty();
    }

    // 图片清除按钮
    const imageClear = panelEl.querySelector('.ng-prop-image-clear');
    if (imageClear) {
        imageClear.addEventListener('click', () => {
            const imgInput = panelEl.querySelector('.ng-prop-image');
            if (imgInput) {
                engine._snapshot();
                imgInput.value = '';
                const n = getNode(); if (!n) return;
                engine.updateNode(n.id, { properties: { image: '' } });
                if (markDirty) markDirty();
            }
        });
    }

    const wI = panelEl.querySelector('.ng-prop-width');
    const hI = panelEl.querySelector('.ng-prop-height');
    function applySize() {
        const n = getNode(); if (!n) return;
        let w = parseInt(wI.value, 10), h = parseInt(hI.value, 10);
        if (!(w >= 40 && h >= 30)) return;
        // 上限校验
        w = Math.min(w, 1000); h = Math.min(h, 500);
        wI.value = w; hI.value = h;
        engine.updateNode(n.id, { width: w, height: h, properties: { width: w, height: h } });
        if (markDirty) markDirty();
    }
    if (wI) {
        wI.addEventListener('change', applySize);
        wI.addEventListener('blur', applySize);
    }
    if (hI) {
        hI.addEventListener('change', applySize);
        hI.addEventListener('blur', applySize);
    }

    const colorInput = panelEl.querySelector('.ng-prop-color');
    if (colorInput) {
        colorInput.addEventListener('focus', () => { engine._snapshot(); });
        colorInput.addEventListener('input', e => {
            const n = getNode(); if (!n) return;
            engine.updateNode(n.id, { properties: { color: e.target.value } }, { skipSnapshot: true });
            if (markDirty) markDirty();
        });
    }

    const resetBtn = panelEl.querySelector('.ng-prop-color-reset');
    if (resetBtn) resetBtn.addEventListener('click', () => {
        const n = getNode(); if (!n) return;
        const def = NG_NODE_TYPES[n.type] || NG_NODE_TYPES.character;
        colorInput.value = def.color;
        engine.updateNode(n.id, { properties: { color: def.color } });
        if (markDirty) markDirty();
    });

    const tagInput = panelEl.querySelector('.ng-prop-tag-input');
    if (tagInput) tagInput.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const val = e.target.value.trim(); if (!val) return;
        const n = getNode(); if (!n) return;
        const tags = (n.properties && n.properties.tags) || [];
        if (!tags.includes(val)) {
            engine.updateNode(n.id, { properties: { tags: [...tags, val] } });
            updateNodeGraphPropertyPanel(panelEl, engine, n.id);
            if (markDirty) markDirty();
        }
        e.target.value = '';
    });

    const tagsDiv = panelEl.querySelector('.ng-prop-tags');
    if (tagsDiv) tagsDiv.addEventListener('click', e => {
        const r = e.target.closest('.ng-tag-remove'); if (!r) return;
        const n = getNode(); if (!n) return;
        const tags = (n.properties && n.properties.tags) || [];
        engine.updateNode(n.id, { properties: { tags: tags.filter(t => t !== r.dataset.tag) } });
        updateNodeGraphPropertyPanel(panelEl, engine, n.id);
        if (markDirty) markDirty();
    });

    // ===== 时间线模式属性绑定 =====
    function bindTimelineInput(inputEl, propKey, parseFn) {
        if (!inputEl) return;
        inputEl.addEventListener('focus', () => { engine._snapshot(); });
        inputEl.addEventListener('input', e => {
            const n = getNode(); if (!n) return;
            const val = parseFn ? parseFn(e.target.value) : e.target.value;
            engine.updateNode(n.id, { properties: { [propKey]: val } }, { skipSnapshot: true });
            if (markDirty) markDirty();
        });
    }
    bindTimelineInput(panelEl.querySelector('.ng-prop-timeline-order'), 'timelineOrder', v => v !== '' ? parseInt(v, 10) : null);
    bindTimelineInput(panelEl.querySelector('.ng-prop-timestamp'), 'timestamp');
    bindTimelineInput(panelEl.querySelector('.ng-prop-chapter-ref'), 'chapterRef');

    // 头/尾节点复选框
    function bindTimelineToggle(checkboxEl, propKey) {
        if (!checkboxEl) return;
        checkboxEl.addEventListener('change', () => {
            const n = getNode(); if (!n) return;
            engine._snapshot();
            if (propKey === 'isHead' && checkboxEl.checked) {
                // 设为头节点时，自动取消其他节点的头节点标记
                for (const other of engine.data.nodes) {
                    if (other.id !== n.id && other.properties && other.properties.isHead) {
                        engine.updateNode(other.id, { properties: { isHead: false } }, { skipSnapshot: true });
                    }
                }
            }
            engine.updateNode(n.id, { properties: { [propKey]: checkboxEl.checked } }, { skipSnapshot: true });
            if (markDirty) markDirty();
        });
    }
    bindTimelineToggle(panelEl.querySelector('.ng-prop-is-head'), 'isHead');
    bindTimelineToggle(panelEl.querySelector('.ng-prop-is-tail'), 'isTail');

    // ===== 关联文件绑定 =====
    const addFileBtn = panelEl.querySelector('.ng-add-file-btn');
    if (addFileBtn) {
        addFileBtn.addEventListener('click', () => {
            const n = getNode(); if (!n) return;
            const files = (n.properties && n.properties.linkedFiles) || [];
            // 弹出输入框让用户输入文件路径或链接
            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = t('ui.ng_add_file_ph') || '输入文件章节名或外部链接（如: 第三章 或 https://...）';
            input.style.cssText = 'width:100%;box-sizing:border-box;padding:4px 6px;border:1px solid var(--border-color,#ccc);border-radius:4px;background:var(--bg-color,#fff);color:var(--text-color,#333);';
            const container = addFileBtn.parentElement;
            if (container) {
                const wrapper = document.createElement('div');
                wrapper.style.cssText = 'display:flex;gap:4px;margin-top:4px;';
                wrapper.appendChild(input);
                const confirmBtn = document.createElement('button');
                confirmBtn.className = 'ng-btn';
                confirmBtn.textContent = t('ui.confirm') || '确定';
                confirmBtn.addEventListener('click', () => {
                    const val = input.value.trim();
                    if (!val) return;
                    if (!files.includes(val)) {
                        engine._snapshot();
                        engine.updateNode(n.id, { properties: { linkedFiles: [...files, val] } }, { skipSnapshot: true });
                        updateNodeGraphPropertyPanel(panelEl, engine, n.id);
                        if (markDirty) markDirty();
                    }
                    wrapper.remove();
                });
                wrapper.appendChild(confirmBtn);
                container.appendChild(wrapper);
                input.focus();
            }
        });
    }

    // 关联文件点击跳转
    const filesDiv = panelEl.querySelector('.ng-prop-files');
    if (filesDiv) {
        filesDiv.addEventListener('click', (e) => {
            const fileEl = e.target.closest('.ng-file');
            if (!fileEl) return;
            const filePath = fileEl.textContent.trim();
            if (!filePath) return;
            // 判断是否为外部链接
            if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
                window.open(filePath, '_blank');
                return;
            }
            // 尝试跳转到文件（章节名）
            navigateToLinkedFile(engine, filePath);
        });
    }

    // 节点类型切换：改变形状/颜色/尺寸默认值
    const nodeTypeSelect = panelEl.querySelector('.ng-prop-type');
    if (nodeTypeSelect) nodeTypeSelect.addEventListener('change', () => {
        const n = getNode(); if (!n) return;
        const newType = nodeTypeSelect.value;
        const def = NG_NODE_TYPES[newType] || NG_NODE_TYPES.character;
        engine.updateNode(n.id, {
            type: newType,
            properties: { ngType: newType, color: def.color },
        });
        updateNodeGraphPropertyPanel(panelEl, engine, n.id);
        if (markDirty) markDirty();
    });

    // 图层管理按钮
    const layerBtns = panelEl.querySelectorAll('.ng-layer-btn');
    layerBtns.forEach(btn => btn.addEventListener('click', () => {
        const n = getNode(); if (!n) return;
        const action = btn.dataset.layer;
        if (action === 'top') engine.moveLayerTop(n.id);
        else if (action === 'up') engine.moveLayerUp(n.id);
        else if (action === 'down') engine.moveLayerDown(n.id);
        else if (action === 'bottom') engine.moveLayerBottom(n.id);
        if (markDirty) markDirty();
    }));

    // ===== 连线属性绑定 =====
    const edgeLabelInput = panelEl.querySelector('.ng-prop-edge-label');
    if (edgeLabelInput) {
        edgeLabelInput.addEventListener('focus', () => { engine._snapshot(); });
        edgeLabelInput.addEventListener('input', e => {
            const edge = getEdge(); if (!edge) return;
            engine.updateEdge(edge.id, { text: e.target.value }, { skipSnapshot: true });
            if (markDirty) markDirty();
        });
    }

    const edgeTypeSelect = panelEl.querySelector('.ng-prop-edge-type');
    if (edgeTypeSelect) {
        edgeTypeSelect.addEventListener('change', () => {
            const edge = getEdge(); if (!edge) return;
            const newType = edgeTypeSelect.value;
            const def = NG_EDGE_TYPES[newType] || NG_EDGE_TYPES.relation;
            engine.updateEdge(edge.id, {
                type: newType,
                properties: { edgeType: newType, color: def.color, dash: def.dash, showArrow: def.arrow }
            });
            updateNodeGraphPropertyPanel(panelEl, engine, getNodeId(), edge.id);
            if (markDirty) markDirty();
        });
    }

    const edgeColorInput = panelEl.querySelector('.ng-prop-edge-color');
    if (edgeColorInput) {
        edgeColorInput.addEventListener('focus', () => { engine._snapshot(); });
        edgeColorInput.addEventListener('input', e => {
            const edge = getEdge(); if (!edge) return;
            engine.updateEdge(edge.id, { properties: { color: e.target.value } }, { skipSnapshot: true });
            if (markDirty) markDirty();
        });
    }

    const edgeColorResetBtn = panelEl.querySelector('.ng-prop-edge-color-reset');
    if (edgeColorResetBtn) edgeColorResetBtn.addEventListener('click', () => {
        const edge = getEdge(); if (!edge) return;
        const def = NG_EDGE_TYPES[edge.type] || NG_EDGE_TYPES.relation;
        engine.updateEdge(edge.id, { properties: { color: def.color } });
        updateNodeGraphPropertyPanel(panelEl, engine, getNodeId(), edge.id);
        if (markDirty) markDirty();
    });

    const edgeArrowToggle = panelEl.querySelector('.ng-prop-edge-arrow');
    if (edgeArrowToggle) {
        edgeArrowToggle.addEventListener('change', () => {
            const edge = getEdge(); if (!edge) return;
            engine.updateEdge(edge.id, { properties: { showArrow: edgeArrowToggle.checked } });
            if (markDirty) markDirty();
        });
    }

    const edgeDashToggle = panelEl.querySelector('.ng-prop-edge-dash');
    if (edgeDashToggle) {
        edgeDashToggle.addEventListener('change', () => {
            const edge = getEdge(); if (!edge) return;
            const dashValue = edgeDashToggle.checked ? '6,4' : null;
            engine.updateEdge(edge.id, { properties: { dash: dashValue } });
            if (markDirty) markDirty();
        });
    }
}

function setupPropertyPanelToggle(panelEl) {
    if (!panelEl) return;
    const btn = panelEl.querySelector('.ng-panel-toggle');
    const titleEl = panelEl.querySelector('.ng-panel-title');
    function apply(collapsed) {
        if (collapsed) {
            panelEl.classList.add('collapsed');
            panelEl.style.width = '32px';
            if (btn) { btn.textContent = '›'; btn.title = t('ui.ng_expand') || '展开属性面板'; }
            if (titleEl) titleEl.style.display = 'none';
        } else {
            panelEl.classList.remove('collapsed');
            panelEl.style.width = '';
            if (btn) { btn.textContent = '‹'; btn.title = t('ui.ng_collapse') || '收起属性面板'; }
            if (titleEl) titleEl.style.display = '';
        }
    }
    try { if (localStorage.getItem('ng-panel-collapsed') === 'true') apply(true); } catch (e) {}
    if (btn) btn.addEventListener('click', () => {
        const c = !panelEl.classList.contains('collapsed');
        apply(c);
        try { localStorage.setItem('ng-panel-collapsed', c ? 'true' : 'false'); } catch (e) {}
    });
}

// ========== 创建节点图标签页（主程序入口） ==========
function createNodeGraphTab(graphId, title, projectFolder) {
    weLog.info('node-graph', '→ createNodeGraphTab', { graphId, title, hasFolder: !!projectFolder });
    const tabId = 'nodegraph-' + sanitizeId(graphId);
    if (tabs[tabId]) { switchTab(tabId); return; }

    // OA 模板：area-root.oa > 单个 area-card > node-graph-layout(inner)
    const root = document.createElement('div');
    root.className = 'area-root oa';
    const block = document.createElement('div');
    block.className = 'area-card';

    const content = document.createElement('div');
    content.className = 'node-graph-layout';
    content.innerHTML = `
        ${buildNodeGraphToolbarHTML()}
        <div class="node-graph-body">
            <div class="node-graph-canvas-wrapper" style="position:relative;flex:1;overflow:hidden;">
                <div class="node-graph-canvas" id="ng-canvas-${tabId}"></div>
            </div>
            ${buildNodeGraphPropertyPanelHTML()}
        </div>
    `;
    block.appendChild(content);
    root.appendChild(block);
    addTab(tabId, title || graphId, root, true);

    const canvasEl = content.querySelector(`#ng-canvas-${tabId}`);
    const wrapperEl = content.querySelector('.node-graph-canvas-wrapper');
    const toolbar = content.querySelector('.node-graph-toolbar');
    const panelEl = content.querySelector('.ng-property-panel');
    const coordsEl = document.createElement('div');
    coordsEl.className = 'ng-coords';
    coordsEl.id = `ng-coords-${tabId}`;
    coordsEl.style.cssText = 'position:absolute;left:8px;bottom:8px;font-size:11px;font-family:monospace;color:var(--text-secondary,#888);pointer-events:none;z-index:3;background:rgba(0,0,0,0.03);padding:2px 6px;border-radius:3px;';
    wrapperEl.appendChild(coordsEl);

    let engine = null;
    try {
        engine = new NGEngine(canvasEl, {
            onChange: () => markDirty(),
            onSelectionChange: () => {
                const nid = engine.getSelectedNodeId();
                const eid = engine.getSelectedEdgeId();
                updateNodeGraphPropertyPanel(panelEl, engine, nid, eid);
            },
            t: typeof t === 'function' ? t : null,
        });
        engine.setCoordsEl(coordsEl);
    } catch (e) {
        weLog.error('node-graph', 'NGEngine 初始化失败', e && e.stack ? e.stack : String(e));
        return;
    }

    nodeGraphInstances[tabId] = { engine, graphId, title, projectFolder, dirty: false };

    function markDirty() {
        nodeGraphInstances[tabId].dirty = true;
        if (tabs[tabId]) tabs[tabId].dirty = true;
        const status = content.querySelector('.ng-status');
        if (status) status.textContent = '●';
    }

    bindNodeGraphPropertyPanel(panelEl, engine, markDirty);
    setupPropertyPanelToggle(panelEl);
    setupNodeGraphContextMenu(engine, markDirty);

    // 初始化：无选中节点/边 → 隐藏属性面板（用户要求"空选时面板完全隐藏，刚打开文件不显示")
    // 同步立即执行一次，确保进入 DOM 前就设好 display:none；再在下一轮事件循环兜底执行一次，
    // 防止 addTab 后 DOM 挂载过程中样式被重置。
    try { updateNodeGraphPropertyPanel(panelEl, engine, null, null); } catch (_) {}
    setTimeout(() => {
        try { updateNodeGraphPropertyPanel(panelEl, engine, null, null); } catch (_) {}
    }, 0);

    // ========== 工具栏交互 ==========
    const zoomLabel = toolbar.querySelector('.ng-zoom-label');
    function updateZoomLabel() {
        if (zoomLabel) zoomLabel.textContent = Math.round(engine.zoom * 100) + '%';
    }
    engine.data.viewport = engine.data.viewport || { scale: 1, tx: 0, ty: 0 };
    const ogZoomTo = engine.zoomTo.bind(engine);
    engine.zoomTo = (s, c) => { ogZoomTo(s, c); updateZoomLabel(); };
    engine.zoomReset = () => { const orig = NGEngine.prototype.zoomReset; orig.call(engine); updateZoomLabel(); };

    // 选择工具 / 节点工具
    function setActiveTool(tool) {
        engine.setActiveTool(tool === 'select' ? null : tool);
        syncToolbarButtons();
    }
    function setActiveEdge(edgeType) {
        engine.setActiveEdge(edgeType);
        syncToolbarButtons();
    }
    // 同步工具栏按钮高亮状态（供 onToolChange 回调和手动切换共用）
    function syncToolbarButtons() {
        toolbar.querySelectorAll('.ng-btn[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === (engine.activeTool || 'select')));
        toolbar.querySelectorAll('.ng-btn[data-edge]').forEach(b => b.classList.toggle('active', b.dataset.edge === engine.activeEdgeType));
    }
    // 引擎内部工具变化时（如创建后自动返回选择）同步工具栏 UI
    engine.onToolChange = syncToolbarButtons;
    setActiveTool('select');

    toolbar.addEventListener('click', async (e) => {
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
        const tool = btn.dataset.tool, edge = btn.dataset.edge, action = btn.dataset.action;
        // 观察模式：只允许缩放和模式切换
        if (engine._isReadonly()) {
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
            const btn = toolbar.querySelector('[data-action="continuous"]');
            if (btn) btn.classList.toggle('active', engine.continuousDraw);
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
            await saveNodeGraph(tabId);
        } else if (action === 'layout-selector') {
            // 切换排版下拉菜单
            let menu = document.querySelector('.ng-layout-menu');
            // 如果菜单还在 toolbar 内部，移到 body 并使用 fixed 定位（避免被 toolbar 的 overflow 裁剪）
            if (menu && menu.parentNode !== document.body) {
                document.body.appendChild(menu);
            }
            if (menu) {
                const isVisible = menu.style.display !== 'none';
                // 关闭所有排版菜单
                document.querySelectorAll('.ng-layout-menu').forEach(m => m.style.display = 'none');
                if (!isVisible) {
                    // 根据按钮位置计算 fixed 定位坐标
                    var br = btn.getBoundingClientRect();
                    menu.style.position = 'fixed';
                    menu.style.top = (br.bottom + 4) + 'px';
                    menu.style.left = br.left + 'px';
                    menu.style.display = 'block';
                }
            }
        } else if (action === 'export') {
            exportNodeGraphHTML(engine, tabId);
        } else if (action === 'export-archive') {
            console.log('→ 导出角色档案被触发');
            try {
                exportNodeGraphArchive(engine);
            } catch (e) {
                console.error('导出角色档案失败:', e);
                showNotification('导出失败: ' + (e.message || String(e)));
            }
        } else if (action === 'sim-start') {
            engine.startSimulation();
            updateSimLabel();
            // 停止自动执行
            if (window._ngSimTimer) { clearInterval(window._ngSimTimer); window._ngSimTimer = null; }
            const autoBtn = toolbar.querySelector('[data-action="sim-auto"]');
            if (autoBtn) autoBtn.classList.remove('active');
        } else if (action === 'sim-step') {
            // 等待分支选择时，step 按钮不生效（需点击连线选择分支）
            if (engine.simState === 'waiting') return;
            engine.stepSimulation();
            updateSimLabel();
            // 如果自动执行中到达终点，停止自动执行
            if (engine.simState === 'finished' && window._ngSimTimer) {
                clearInterval(window._ngSimTimer); window._ngSimTimer = null;
                const autoBtn = toolbar.querySelector('[data-action="sim-auto"]');
                if (autoBtn) autoBtn.classList.remove('active');
            }
        } else if (action === 'sim-auto') {
            // 自动执行：切换开关
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

    // 排版下拉菜单选项
    toolbar.addEventListener('click', (e) => {
        if (!e || !e.target) return;
        var target = e.target;
        var opt = (typeof target.closest === 'function') ? target.closest('.ng-layout-option') : null;
        if (!opt) return;
        const layout = opt.dataset.layout;
        if (!layout) return;
        // 关闭菜单
        const menu = document.querySelector('.ng-layout-menu');
        if (menu) menu.style.display = 'none';
        // 执行排版
        engine.autoLayout(layout);
        markDirty();
    });
    // 点击其他区域关闭排版菜单
    document.addEventListener('click', (e) => {
        var menu = document.querySelector('.ng-layout-menu');
        if (!menu || menu.style.display === 'none') return;
        // 点击菜单内部不关闭
        if (menu.contains(e.target)) return;
        // 点击排版按钮本身不关闭（由 toolbar 处理切换）
        if (e.target && (typeof e.target.closest === 'function') && e.target.closest('[data-action="layout-selector"]')) return;
        // 点击排版按钮的 SVG 子元素（兼容性回溯）
        if (e.target) {
            var el = e.target;
            while (el && el !== document.body) {
                if (el.nodeType === 1 && el.getAttribute && el.getAttribute('data-action') === 'layout-selector') return;
                el = el.parentElement || (el.parentNode && el.parentNode.nodeType === 1 ? el.parentNode : null);
            }
        }
        menu.style.display = 'none';
    });

    // 模拟标签更新
    function updateSimLabel() {
        const label = toolbar.querySelector('.ng-sim-label');
        if (label) {
            if (engine.simState === 'idle') label.textContent = t('ui.ng_sim_idle') || '待模拟';
            else if (engine.simState === 'finished') label.textContent = t('ui.ng_sim_finished') || '模拟完成';
            else label.textContent = engine.getSimStepLabel();
        }
    }
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
                // 流程模式：自动取消连线工具，改用默认选择
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

    // 观察容器尺寸，确保 SVG 正确铺满
    const ro = new ResizeObserver(() => {});
    ro.observe(wrapperEl);
    updateZoomLabel();

    // 加载已有数据
    if (projectFolder) loadNodeGraph(tabId, projectFolder, graphId);
    weLog.info('node-graph', '← createNodeGraphTab 完成', { tabId });
    return tabId;
}

// 加载/保存
async function loadNodeGraph(tabId, projectFolder, graphId) {
    weLog.info('node-graph', '→ loadNodeGraph', { tabId, graphId });
    const inst = nodeGraphInstances[tabId];
    if (!inst) return;
    const filename = graphId + '.node.json';
    try {
        const r = await weAPI.readFile(projectFolder, filename);
        if (r.success && r.content) {
            const raw = JSON.parse(r.content);
            inst.engine.loadData(raw);
        }
        inst.dirty = false;
    } catch (e) {
        weLog.error('node-graph', 'loadNodeGraph 失败', e && e.stack ? e.stack : String(e));
    }
}
async function saveNodeGraph(tabId) {
    weLog.info('node-graph', '→ saveNodeGraph', { tabId });
    const inst = nodeGraphInstances[tabId];
    if (!inst) return;
    const filename = inst.graphId + '.node.json';
    // 保存前确保 ID 唯一，防止因多次保存累积重复 ID
    inst.engine._dedupeIds();
    const json = JSON.stringify(inst.engine.getData(), null, 2);
    try {
        const r = await weAPI.saveFile(inst.projectFolder, filename, json);
        if (r.success) {
            inst.dirty = false;
            if (tabs[tabId]) tabs[tabId].dirty = false;
            const status = document.getElementById(`ng-canvas-${tabId}`)?.closest('.node-graph-layout')?.querySelector('.ng-status');
            if (status) status.textContent = '';
            showNotification(t('ui.saved') || '已保存');
            // 刷新所有关联项目中的节点图卡片缩略图
            if (typeof refreshNodeGraphThumbnails === 'function' && inst.projectFolder) {
                for (var sid in tabs) {
                    if (tabs[sid] && tabs[sid].projectPath === inst.projectFolder) {
                        refreshNodeGraphThumbnails(sid);
                    }
                }
            }
            weLog.info('node-graph', '← saveNodeGraph 完成');
        } else {
            showNotification((t('ui.save_failed') || '保存失败') + ': ' + r.error);
        }
    } catch (e) {
        weLog.error('node-graph', 'saveNodeGraph 异常', e && e.stack ? e.stack : String(e));
        showNotification((t('ui.save_failed') || '保存失败') + ': ' + e.message);
    }
}

// ========== 关联文件导航 ==========
/**
 * 尝试跳转到关联文件（章节名匹配）
 */
function navigateToLinkedFile(engine, filePath) {
    if (!engine || !filePath) return;
    // 尝试在当前项目文件中查找匹配的文件名
    const inst = findNodeGraphInstance(engine);
    if (!inst) return;
    const projectFolder = inst.projectFolder;
    const tabId = inst._tabId;
    if (!projectFolder || !tabId) return;
    // 使用 weAPI 列出项目文件，匹配文件名
    (async () => {
        try {
            const r = await weAPI.listFiles(projectFolder);
            if (r.success && r.files) {
                // 匹配文件名（不区分扩展名）
                const lowerTarget = filePath.toLowerCase();
                const match = r.files.find(f => {
                    const name = (f.name || f).toLowerCase();
                    return name.includes(lowerTarget) || name.startsWith(lowerTarget) || name.replace(/\.[^.]+$/, '') === lowerTarget;
                });
                if (match) {
                    const fileName = match.name || match;
                    if (typeof openProjectFile === 'function') {
                        openProjectFile(tabId, fileName);
                    }
                    return;
                }
            }
            showNotification((t('ui.ng_file_not_found') || '未找到文件') + ': ' + filePath);
        } catch (e) {
            weLog.warn('node-graph', 'navigateToLinkedFile 失败', e);
            showNotification((t('ui.ng_file_not_found') || '未找到文件') + ': ' + filePath);
        }
    })();
}
// 工具函数：根据 engine 实例查找对应的 nodeGraphInstances 条目
function findNodeGraphInstance(engine) {
    for (const key in nodeGraphInstances) {
        if (nodeGraphInstances[key].engine === engine) {
            nodeGraphInstances[key]._tabId = key;
            return nodeGraphInstances[key];
        }
    }
    for (const key in embeddedNodeGraphs) {
        if (embeddedNodeGraphs[key].engine === engine) {
            embeddedNodeGraphs[key]._tabId = key;
            return embeddedNodeGraphs[key];
        }
    }
    return null;
}

// ========== 导出角色档案 Markdown ==========
function exportNodeGraphArchive(engine) {
    if (!engine) return;
    const data = engine.getData();
    const nodes = data.nodes || [];
    const edges = data.edges || [];

    // 建立节点 ID → 节点映射
    const nodeMap = {};
    for (const n of nodes) nodeMap[n.id] = n;

    // 建立关系映射：nodeId → { outgoing: [{targetId, edge}], incoming: [{sourceId, edge}] }
    const relMap = {};
    for (const n of nodes) {
        relMap[n.id] = { outgoing: [], incoming: [] };
    }
    for (const e of edges) {
        if (e.sourceNodeId && e.targetNodeId && relMap[e.sourceNodeId]) {
            relMap[e.sourceNodeId].outgoing.push({ targetId: e.targetNodeId, edge: e });
        }
        if (e.targetNodeId && e.sourceNodeId && relMap[e.targetNodeId]) {
            relMap[e.targetNodeId].incoming.push({ sourceId: e.sourceNodeId, edge: e });
        }
    }

    // 节点类型标签
    const typeLabels = {
        character: '角色',
        scene: '场景',
        event: '事件',
        setting: '设定',
        chapter: '章节',
        start: '起点',
        end: '终点',
        condition: '条件判断',
        process: '处理',
        subprocess: '子流程',
        merge: '合并',
    };

    // 连线类型描述模板
    function getEdgeDesc(edge) {
        const def = NG_EDGE_TYPES[edge.type] || NG_EDGE_TYPES.relation;
        return def.label || edge.type;
    }

    // 生成角色/事件档案
    let md = '# 角色/事件档案\n\n';
    md += '> 由节点图自动生成\n\n';
    md += '---\n\n';

    // 先处理角色类节点，再处理其他节点
    const priorityTypes = ['character', 'event'];
    const orderedNodes = [...nodes].sort((a, b) => {
        const ai = priorityTypes.indexOf(a.type);
        const bi = priorityTypes.indexOf(b.type);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return 0;
    });

    for (const n of orderedNodes) {
        const p = n.properties || {};
        const typeLabel = typeLabels[n.type] || n.type || '未知';
        const desc = p.description || '';
        const tags = p.tags || [];
        const linkedFiles = p.linkedFiles || [];
        const rel = relMap[n.id];

        md += `## ${n.text || n.id}\n\n`;
        md += `- **类型**：${typeLabel}\n`;
        if (desc) md += `- **描述**：${desc}\n`;
        if (tags.length > 0) md += `- **标签**：${tags.join('、')}\n`;
        if (linkedFiles.length > 0) {
            md += `- **关联文档**：${linkedFiles.join('、')}\n`;
        }
        // 时间线属性
        const tlOrder = p.timelineOrder;
        const timestamp = p.timestamp;
        const chapterRef = p.chapterRef;
        if (tlOrder != null || timestamp || chapterRef) {
            const parts = [];
            if (tlOrder != null) parts.push(`排序序号: ${tlOrder}`);
            if (timestamp) parts.push(`时间戳: ${timestamp}`);
            if (chapterRef) parts.push(`章节引用: ${chapterRef}`);
            md += `- **时间线属性**：${parts.join(' | ')}\n`;
        }

        // 关系
        if (rel) {
            const relations = [];
            // 出边：A → B 的关系
            for (const out of rel.outgoing) {
                const target = nodeMap[out.targetId];
                if (!target) continue;
                const targetName = target.text || target.id;
                const edgeDesc = getEdgeDesc(out.edge);
                const edgeLabel = out.edge.text || '';
                const relStr = edgeLabel ? `：${edgeLabel}` : '';
                relations.push(`与 ${targetName}：${edgeDesc}${relStr}`);
            }
            // 入边：A ← B 的关系（反向描述）
            for (const inc of rel.incoming) {
                const source = nodeMap[inc.sourceId];
                if (!source) continue;
                const sourceName = source.text || source.id;
                const edgeDesc = getEdgeDesc(inc.edge);
                const edgeLabel = inc.edge.text || '';
                const relStr = edgeLabel ? `：${edgeLabel}` : '';
                // 避免重复（双向关系只显示一次）
                const alreadyAdded = rel.outgoing.some(out => out.targetId === inc.sourceId);
                if (!alreadyAdded) {
                    relations.push(`与 ${sourceName}：${edgeDesc}${relStr}`);
                }
            }
            if (relations.length > 0) {
                md += `- **与其他${typeLabel}的关系**：\n`;
                for (const r of relations) {
                    md += `  - ${r}\n`;
                }
            }
        }

        md += '\n---\n\n';
    }

    // 使用系统保存对话框导出
    const suggestedName = (data.title || '角色档案').replace(/[<>:"/\\|?*]/g, '_');
    if (typeof weAPI !== 'undefined' && weAPI.exportArchive) {
        weAPI.exportArchive(md, suggestedName).then(function(result) {
            if (result.success) {
                showNotification(t('ui.ng_export_archive_done') || '角色档案已导出');
                weLog.info('node-graph', '导出角色档案成功', { suggestedName });
            } else if (!result.canceled) {
                showNotification('导出失败: ' + (result.error || ''));
                weLog.error('node-graph', '导出角色档案失败', result.error);
            }
        }).catch(function(err) {
            showNotification('导出失败');
            weLog.error('node-graph', '导出角色档案异常', err);
        });
    } else {
        // 回退：Blob 下载
        try {
            const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = suggestedName + '.md';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function() { URL.revokeObjectURL(url); }, 10000);
            showNotification(t('ui.ng_export_archive_done') || '角色档案已导出');
            weLog.info('node-graph', '导出角色档案成功(回退)', { suggestedName });
        } catch (err) {
            showNotification('导出失败');
            weLog.error('node-graph', '导出角色档案完全失败', err);
        }
    }
}

// ========== 共享的 SVG 生成（导出 + 缩略图共用） ==========
function generateNodeGraphSVG(data, options) {
    options = options || {};
    const nodes = data.nodes || [];
    const edges = data.edges || [];
    const vb = options.viewBox || { l: 0, t: 0, w: 100, h: 100 };
    const bgColor = options.bgColor || 'transparent';
    const showGrid = options.showGrid || false;
    const nodeOpacity = options.nodeOpacity != null ? options.nodeOpacity : 1;
    const edgeStrokeWidth = options.edgeStrokeWidth || 2;
    const includeNodeData = options.includeNodeData || false;
    const nonScalingStroke = options.nonScalingStroke || false;
    const gridSize = 40;

    if (!nodes.length) {
        return '<svg viewBox="' + vb.l + ' ' + vb.t + ' ' + vb.w + ' ' + vb.h + '" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">' +
            '<rect x="' + vb.l + '" y="' + vb.t + '" width="' + vb.w + '" height="' + vb.h + '" fill="' + bgColor + '"/>' +
            '</svg>';
    }

    function escapeHtml(s) {
        if (typeof s !== 'string') return '';
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // 节点类型定义（与 NGEngine 保持一致）
    const NG_NODE_TYPES_LOCAL = {
        character: { label: '角色', shape: 'rect', color: '#ff6b6b', stroke: '#ff4d4f', radius: 8 },
        scene:     { label: '场景', shape: 'rect', color: '#4a90d9', stroke: '#2f7dd6', radius: 4 },
        event:     { label: '事件', shape: 'ellipse', color: '#52c41a', stroke: '#389e0d', radius: 0 },
        setting:   { label: '设定', shape: 'diamond', color: '#722ed1', stroke: '#531dab', radius: 0 },
        chapter:   { label: '章节', shape: 'rect', color: '#fa8c16', stroke: '#d46b08', radius: 4 },
    };
    const NG_EDGE_TYPES_LOCAL = {
        relation:  { label: '关系', color: '#4a90d9', dash: null,    arrow: true },
        timeline:  { label: '时序', color: '#52c41a', dash: null,    arrow: true },
        causality: { label: '因果', color: '#fa8c16', dash: '6,4',   arrow: true },
        contain:   { label: '所属', color: '#722ed1', dash: null,    arrow: false },
    };

    // 端口解析
    function parsePortId(portId) {
        if (!portId || typeof portId !== 'string') return null;
        const idx = portId.lastIndexOf('_');
        if (idx <= 0) return null;
        const nodeId = portId.slice(0, idx);
        const key = portId.slice(idx + 1);
        const map = { '1': 'top', 't': 'top', '2': 'left', 'l': 'left', '3': 'bottom', 'b': 'bottom', '4': 'right', 'r': 'right' };
        const side = map[key];
        if (!side) return null;
        return { nodeId, side };
    }

    function getPortPos(node, side) {
        const hw = (node.width || 80) / 2, hh = (node.height || 40) / 2;
        const l = node.x - hw, r = node.x + hw, t = node.y - hh, b = node.y + hh;
        if (side === 'left') return { x: l, y: node.y, side: 'left' };
        if (side === 'right') return { x: r, y: node.y, side: 'right' };
        if (side === 'top') return { x: node.x, y: t, side: 'top' };
        if (side === 'bottom') return { x: node.x, y: b, side: 'bottom' };
        return { x: node.x, y: node.y, side: 'right' };
    }

    function normalizeColor(c, fallback) {
        if (typeof c === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c)) return c;
        return fallback || '#4a90d9';
    }

    let svg = '<svg viewBox="' + vb.l + ' ' + vb.t + ' ' + vb.w + ' ' + vb.h + '" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">';

    // 背景
    svg += '<rect x="' + vb.l + '" y="' + vb.t + '" width="' + vb.w + '" height="' + vb.h + '" fill="' + bgColor + '"/>';

    // 网格
    if (showGrid) {
        svg += '<defs><pattern id="ng-shared-grid" width="' + gridSize + '" height="' + gridSize + '" patternUnits="userSpaceOnUse">' +
            '<path d="M ' + gridSize + ' 0 L 0 0 0 ' + gridSize + '" fill="none" stroke="#e0e0e0" stroke-width="0.5" opacity="0.5"/>' +
            '</pattern></defs><rect width="100%" height="100%" fill="url(#ng-shared-grid)"/>';
    }

    // 边
    const defEdgeColor = '#999';
    for (const e of edges) {
        try {
            const sp = parsePortId(e.sourcePortId);
            const tp = parsePortId(e.targetPortId);
            const srcNode = nodes.find(n => n.id === (sp ? sp.nodeId : e.sourceNodeId));
            const tgtNode = nodes.find(n => n.id === (tp ? tp.nodeId : e.targetNodeId));
            if (!srcNode || !tgtNode) continue;
            const p1 = getPortPos(srcNode, sp ? sp.side : 'right');
            const p2 = getPortPos(tgtNode, tp ? tp.side : 'left');
            const eTypeDef = NG_EDGE_TYPES_LOCAL[e.type] || null;
            const edgeColor = normalizeColor((e.properties && e.properties.color) || (eTypeDef ? eTypeDef.color : null), defEdgeColor);
            const dash = (e.properties && e.properties.dash != null) ? e.properties.dash : (eTypeDef ? eTypeDef.dash : null);
            const showArrow = (e.properties && e.properties.showArrow != null) ? !!e.properties.showArrow : (eTypeDef ? !!eTypeDef.arrow : false);

            // 贝塞尔控制点
            const dx = Math.abs(p2.x - p1.x) * 0.5 + 40;
            let c1x, c1y, c2x, c2y;
            if (p1.side === 'left') { c1x = p1.x - dx; c1y = p1.y; }
            else if (p1.side === 'right') { c1x = p1.x + dx; c1y = p1.y; }
            else if (p1.side === 'top') { c1x = p1.x; c1y = p1.y - dx; }
            else { c1x = p1.x; c1y = p1.y + dx; }
            if (p2.side === 'left') { c2x = p2.x - dx; c2y = p2.y; }
            else if (p2.side === 'right') { c2x = p2.x + dx; c2y = p2.y; }
            else if (p2.side === 'top') { c2x = p2.x; c2y = p2.y - dx; }
            else { c2x = p2.x; c2y = p2.y + dx; }

            const d = 'M' + p1.x + ',' + p1.y + ' C' + c1x + ',' + c1y + ' ' + c2x + ',' + c2y + ' ' + p2.x + ',' + p2.y;
            const dashStr = dash ? ' stroke-dasharray="' + dash + '"' : '';
            const nsStr = nonScalingStroke ? ' vector-effect="non-scaling-stroke"' : '';

            if (showArrow) {
                const markerId = 'ng_arr_' + (e.id || Math.random().toString(36).slice(2, 8)).replace(/[^a-zA-Z0-9_-]/g, '_');
                svg += '<defs><marker id="' + markerId + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="' + edgeColor + '"/></marker></defs>';
                svg += '<path d="' + d + '" fill="none" stroke="' + edgeColor + '" stroke-width="' + edgeStrokeWidth + '"' + dashStr + ' marker-end="url(#' + markerId + ')" stroke-linecap="round" opacity="0.8"' + nsStr + '/>';
            } else {
                svg += '<path d="' + d + '" fill="none" stroke="' + edgeColor + '" stroke-width="' + edgeStrokeWidth + '"' + dashStr + ' stroke-linecap="round" opacity="0.8"' + nsStr + '/>';
            }

            // 连线标签
            if (e.text) {
                svg += '<text x="' + ((p1.x + p2.x) / 2) + '" y="' + ((p1.y + p2.y) / 2 - 6) + '" text-anchor="middle" font-size="12" fill="#333" stroke="#fff" stroke-width="2" paint-order="stroke" pointer-events="none">' + escapeHtml(e.text) + '</text>';
            }
        } catch (err) { /* skip */ }
    }

    // 节点
    for (const n of nodes) {
        try {
            const def = NG_NODE_TYPES_LOCAL[n.type] || NG_NODE_TYPES_LOCAL.character;
            const color = (n.properties && n.properties.color) || def.color;
            const stroke = (n.properties && n.properties.color) || def.stroke;
            const hw = (n.width || 80) / 2, hh = (n.height || 40) / 2;
            const l = n.x - hw, r = n.x + hw, t = n.y - hh, b = n.y + hh;
            const nodeImage = (n.properties && n.properties.image) || '';
            const nodeDesc = (n.properties && n.properties.description) || '';

            // 数据属性（用于导出 HTML 悬停提示）
            if (includeNodeData) {
                svg += '<g data-node-id="' + escapeHtml(n.id) + '" data-node-name="' + escapeHtml(n.text || '') + '" data-node-desc="' + escapeHtml(nodeDesc) + '" style="cursor:pointer">';
            }

            // 形状
            if (def.shape === 'rect') {
                svg += '<rect x="' + l + '" y="' + t + '" width="' + (n.width || 80) + '" height="' + (n.height || 40) + '" rx="' + def.radius + '" ry="' + def.radius + '" fill="' + color + '" stroke="' + stroke + '" stroke-width="1.5" opacity="' + nodeOpacity + '"/>';
            } else if (def.shape === 'ellipse') {
                svg += '<ellipse cx="' + n.x + '" cy="' + n.y + '" rx="' + hw + '" ry="' + hh + '" fill="' + color + '" stroke="' + stroke + '" stroke-width="1.5" opacity="' + nodeOpacity + '"/>';
            } else {
                svg += '<polygon points="' + n.x + ',' + t + ' ' + r + ',' + n.y + ' ' + n.x + ',' + b + ' ' + l + ',' + n.y + '" fill="' + color + '" stroke="' + stroke + '" stroke-width="1.5" opacity="' + nodeOpacity + '"/>';
            }

            // 图片
            if (nodeImage) {
                let clipShape = '';
                if (def.shape === 'rect') {
                    clipShape = '<rect x="' + l + '" y="' + t + '" width="' + (n.width || 80) + '" height="' + (n.height || 40) + '" rx="' + def.radius + '" ry="' + def.radius + '"/>';
                } else if (def.shape === 'ellipse') {
                    clipShape = '<ellipse cx="' + n.x + '" cy="' + n.y + '" rx="' + hw + '" ry="' + hh + '"/>';
                } else {
                    clipShape = '<polygon points="' + n.x + ',' + t + ' ' + r + ',' + n.y + ' ' + n.x + ',' + b + ' ' + l + ',' + n.y + '"/>';
                }
                const clipId = 'ng_img_' + (n.id || Math.random().toString(36).slice(2, 8)).replace(/[^a-zA-Z0-9_-]/g, '_');
                svg += '<clipPath id="' + clipId + '">' + clipShape + '</clipPath>';
                svg += '<image x="' + l + '" y="' + t + '" width="' + (n.width || 80) + '" height="' + (n.height || 40) + '" href="' + escapeHtml(nodeImage) + '" preserveAspectRatio="xMidYMid slice" clip-path="url(#' + clipId + ')" opacity="' + nodeOpacity + '"/>';

                // 底部半透明文字区
                svg += '<rect x="' + l + '" y="' + (t + (n.height || 40) * 0.60) + '" width="' + (n.width || 80) + '" height="' + (n.height || 40) * 0.40 + '" fill="rgba(0,0,0,0.5)" clip-path="url(#' + clipId + ')" opacity="' + nodeOpacity + '"/>';
            }

            // 文字
            const textAreaTop = nodeImage ? t + (n.height || 40) * 0.62 : t;
            const textAreaHeight = nodeImage ? (n.height || 40) * 0.38 : (n.height || 40);
            const textCenterY = textAreaTop + textAreaHeight / 2 - (nodeDesc ? 7 : 0);
            if (n.text) {
                svg += '<text x="' + n.x + '" y="' + textCenterY + '" text-anchor="middle" dominant-baseline="central" font-size="14" fill="#ffffff" font-weight="500" pointer-events="none">' + escapeHtml(n.text) + '</text>';
            }
            if (nodeDesc) {
                const descDisplay = nodeDesc.replace(/\n.*$/, '');
                if (descDisplay) {
                    svg += '<text x="' + n.x + '" y="' + (textCenterY + 12) + '" text-anchor="middle" dominant-baseline="central" font-size="10" fill="rgba(255,255,255,0.65)" font-weight="400" pointer-events="none">' + escapeHtml(descDisplay) + '</text>';
                }
            }

            if (includeNodeData) {
                svg += '</g>';
            }
        } catch (err) { /* skip */ }
    }

    svg += '</svg>';
    return svg;
}
window.generateNodeGraphSVG = generateNodeGraphSVG;

// ========== 导出为独立 HTML 展示页 ==========
function exportNodeGraphHTML(engine, tabId) {
    if (!engine || !engine.data) return;
    const data = engine.data;
    const nodes = data.nodes || [];
    const edges = data.edges || [];
    if (nodes.length === 0) {
        weLog.warn('node-graph', '导出失败：没有节点');
        return;
    }

    // 计算 AABB
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
        const hw = (n.width || 80) / 2, hh = (n.height || 40) / 2;
        if (n.x - hw < minX) minX = n.x - hw;
        if (n.x + hw > maxX) maxX = n.x + hw;
        if (n.y - hh < minY) minY = n.y - hh;
        if (n.y + hh > maxY) maxY = n.y + hh;
    }
    const pad = 100;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    const svgW = maxX - minX, svgH = maxY - minY;

    // 使用共享的 generateNodeGraphSVG 生成 SVG 内容
    const svgContent = generateNodeGraphSVG(data, {
        viewBox: { l: minX, t: minY, w: svgW, h: svgH },
        bgColor: '#fafafa',
        showGrid: true,
        includeNodeData: true,
    });

    function escapeHtml(s) {
        if (typeof s !== 'string') return '';
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // 生成完整 HTML
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(data.title || '节点图')} - 展示页</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; overflow: hidden; background: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
#container { width: 100%; height: 100%; position: relative; overflow: hidden; }
#toolbar { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); display: flex; gap: 8px; padding: 8px 16px; background: rgba(255,255,255,0.95); border-radius: 8px; box-shadow: 0 2px 12px rgba(0,0,0,0.15); z-index: 100; }
#toolbar button { padding: 6px 14px; border: 1px solid #ddd; border-radius: 6px; background: #fff; cursor: pointer; font-size: 13px; color: #333; transition: all 0.15s; }
#toolbar button:hover { background: #4a90d9; color: #fff; border-color: #4a90d9; }
#zoom-label { display: inline-flex; align-items: center; min-width: 48px; justify-content: center; font-size: 13px; color: #666; font-weight: 500; }
#tooltip { position: fixed; display: none; background: rgba(0,0,0,0.85); color: #fff; padding: 8px 12px; border-radius: 6px; font-size: 13px; max-width: 280px; pointer-events: none; z-index: 200; line-height: 1.5; box-shadow: 0 2px 8px rgba(0,0,0,0.3); }
#tooltip .tip-name { font-weight: 600; font-size: 14px; margin-bottom: 2px; }
#tooltip .tip-desc { color: rgba(255,255,255,0.7); font-size: 12px; }
#info { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); background: rgba(255,255,255,0.9); padding: 6px 16px; border-radius: 6px; font-size: 13px; color: #666; box-shadow: 0 1px 4px rgba(0,0,0,0.1); z-index: 100; pointer-events: none; }
</style>
</head>
<body>
<div id="container">
${svgContent}
</div>
<div id="tooltip"></div>
<div id="info">${nodes.length} 个节点 · ${edges.length} 条连线 · 滚轮缩放 · 拖拽平移</div>
<div id="toolbar">
<button id="zoom-out">− 缩小</button>
<span id="zoom-label">100%</span>
<button id="zoom-in">+ 放大</button>
<button id="zoom-reset">重置</button>
</div>
<script>
(function() {
    var container = document.getElementById('container');
    var svg = container.querySelector('svg');
    var tooltip = document.getElementById('tooltip');
    var zoomLabel = document.getElementById('zoom-label');
    var scale = 1, tx = 0, ty = 0;
    var isPanning = false, startX, startY, startTx, startTy;

    // 设置 SVG 的 cursor 样式
    svg.style.cursor = 'grab';

    function updateTransform() {
        svg.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')';
        svg.style.transformOrigin = '0 0';
        zoomLabel.textContent = Math.round(scale * 100) + '%';
    }

    // 滚轮缩放（以鼠标位置为中心）
    container.addEventListener('wheel', function(e) {
        e.preventDefault();
        var rect = container.getBoundingClientRect();
        var mx = e.clientX - rect.left, my = e.clientY - rect.top;
        var gx = (mx - tx) / scale, gy = (my - ty) / scale;
        var factor = e.deltaY > 0 ? 0.9 : 1.1;
        var newScale = Math.max(0.2, Math.min(4, scale * factor));
        tx = mx - gx * newScale;
        ty = my - gy * newScale;
        scale = newScale;
        updateTransform();
    }, { passive: false });

    // 拖拽平移
    container.addEventListener('mousedown', function(e) {
        if (e.target.closest && e.target.closest('#toolbar')) return;
        if (e.target.tagName === 'BUTTON') return;
        svg.style.cursor = 'grabbing';
        isPanning = true;
        startX = e.clientX; startY = e.clientY;
        startTx = tx; startTy = ty;
    });
    document.addEventListener('mousemove', function(e) {
        if (!isPanning) return;
        tx = startTx + (e.clientX - startX);
        ty = startTy + (e.clientY - startY);
        updateTransform();
    });
    document.addEventListener('mouseup', function() {
        if (isPanning) {
            isPanning = false;
            svg.style.cursor = 'grab';
        }
    });

    // 缩放按钮
    document.getElementById('zoom-in').addEventListener('click', function() {
        scale = Math.min(4, scale * 1.2);
        updateTransform();
    });
    document.getElementById('zoom-out').addEventListener('click', function() {
        scale = Math.max(0.2, scale / 1.2);
        updateTransform();
    });
    document.getElementById('zoom-reset').addEventListener('click', function() {
        scale = 1; tx = 0; ty = 0;
        updateTransform();
    });

    // 节点悬停提示
    var hoverEls = svg.querySelectorAll('[data-node-id]');
    for (var i = 0; i < hoverEls.length; i++) {
        hoverEls[i].addEventListener('mouseenter', function(e) {
            var el = e.currentTarget;
            var name = el.getAttribute('data-node-name');
            var desc = el.getAttribute('data-node-desc');
            if (name || desc) {
                var html = '';
                if (name) html += '<div class="tip-name">' + name + '</div>';
                if (desc) html += '<div class="tip-desc">' + desc + '</div>';
                tooltip.innerHTML = html;
                tooltip.style.display = 'block';
            }
        });
        hoverEls[i].addEventListener('mousemove', function(e) {
            tooltip.style.left = (e.clientX + 16) + 'px';
            tooltip.style.top = (e.clientY + 16) + 'px';
        });
        hoverEls[i].addEventListener('mouseleave', function() {
            tooltip.style.display = 'none';
        });
    }
})();
</script>
</body>
</html>`;

    showNotification('正在导出HTML...');
    // 使用 Electron 系统保存对话框
    if (typeof weAPI !== 'undefined' && weAPI.exportHtml) {
        weAPI.exportHtml(html, data.title || 'nodegraph').then(function(result) {
            if (result.success) {
                showNotification('HTML 已导出');
                weLog.info('node-graph', '导出HTML成功', { tabId, nodeCount: nodes.length, edgeCount: edges.length });
            } else if (!result.canceled) {
                showNotification('导出HTML失败: ' + (result.error || ''));
                weLog.error('node-graph', '导出HTML失败', result.error);
            }
        }).catch(function(err) {
            showNotification('导出HTML失败');
            weLog.error('node-graph', '导出HTML异常', err);
        });
    } else {
        // 回退：直接下载（无 weAPI 时）
        try {
            var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = (data.title || 'nodegraph') + '_export.html';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function() { URL.revokeObjectURL(url); }, 10000);
            showNotification('HTML 已导出: ' + (data.title || 'nodegraph') + '_export.html');
            weLog.info('node-graph', '导出HTML成功(回退)', { tabId, nodeCount: nodes.length, edgeCount: edges.length });
        } catch (err) {
            showNotification('导出HTML失败');
            weLog.error('node-graph', '导出HTML完全失败', err);
        }
    }
}

function refreshNodeGraphTheme() {
    // 纯 SVG 不受主题影响，除非使用了 css var。这里无需操作
    let count = 0;
    for (const tabId in nodeGraphInstances) {
        const inst = nodeGraphInstances[tabId];
        if (inst && inst.engine) { try { inst.engine._renderAll(); count++; } catch (e) {} }
    }
    if (typeof embeddedNodeGraphs !== 'undefined') {
        for (const safeId in embeddedNodeGraphs) {
            const inst = embeddedNodeGraphs[safeId];
            if (inst && inst.engine) { try { inst.engine._renderAll(); count++; } catch (e) {} }
        }
    }
    if (count > 0) weLog.debug('node-graph', 'refreshNodeGraphTheme 完成', { count });
}

// 给 editor.js 暴露的帮助函数
function toG6Data() { return null; }
function fromG6Data(d) { return d; }
function getLogicFlowClass() { return null; }
function getLogicFlowEx() { return null; }

weLog.info('node-graph', '节点图模块已加载（纯 SVG 引擎）');
