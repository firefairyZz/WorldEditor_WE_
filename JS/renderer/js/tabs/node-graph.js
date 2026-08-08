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
// 旧类型名映射（向后兼容）
const OLD_EDGE_TYPE_MAP = {
    cause: 'causality', causal: 'causality', sequence: 'timeline',
    time: 'timeline', containment: 'contain', belongsTo: 'contain',
    associate: 'relation', friend: 'relation', relation: 'relation',
};

// ========== 数据迁移 / 格式兼容 ==========
function migrateNodeGraphData(data) {
    if (!data || !data.nodes) return { version: 2, viewport: { scale: 1, tx: 0, ty: 0 }, nodes: [], edges: [] };
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
                id: e.id || ('e_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)),
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
    return {
        version: 2,
        viewport: engine.data.viewport,
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
        for (const n of this.data.nodes) {
            if (!n.id || seenNodeIds.has(n.id)) {
                const newId = 'n_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
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
                e.id = 'e_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
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
            id, type: ngType,
            x, y,
            width: width || def.width,
            height: height || def.height,
            text: text || def.label,
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
            // ========== 视觉层：颜色、高亮、标签；全部 pointer-events:none（不拦截交互，不盖住节点） ==========
            const visG = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
            visG.setAttribute('data-edge-id', e.id);
            visG.style.pointerEvents = 'none'; // 整层视觉不拦截事件
            // 连线颜色：优先自定义颜色 → 类型默认色 → 兜底蓝
            const rawColor = (e.properties && e.properties.color) || def.color;
            const color = this._normalizeColor(rawColor, def.color || '#4a90d9');
            // 连线样式：优先使用自定义 dash，否则使用类型默认
            const dash = (e.properties && e.properties.dash != null) ? e.properties.dash : def.dash;
            // 箭头显示：优先使用 showArrow 属性，否则使用类型默认（双保险 + 日志）
            const userShowArrow = e.properties && e.properties.showArrow;
            const showArrow = (userShowArrow != null) ? !!userShowArrow : !!def.arrow;
            const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', result.d);
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke', color);
            path.setAttribute('stroke-width', isSel ? 3 : 2);
            if (dash) path.setAttribute('stroke-dasharray', dash);
            else path.removeAttribute('stroke-dasharray');
            // 【修复隐藏箭头】先显式移除 marker-end，再按需设置（防止浏览器缓存/残留属性导致箭头消不掉）
            path.removeAttribute('marker-end');
            path.removeAttribute('marker-start');
            path.removeAttribute('marker-mid');
            if (showArrow) {
                const markerId = this._getArrowMarkerId(color);
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
            hitPath.setAttribute('stroke', 'rgba(0,0,0,0.001)'); // 几乎透明（视觉上不影响）
            hitPath.setAttribute('stroke-width', 28); // 命中区大幅加宽
            hitPath.setAttribute('stroke-linecap', 'round');
            hitPath.setAttribute('stroke-linejoin', 'round');
            hitPath.setAttribute('pointer-events', 'stroke');
            hitPath.style.cursor = 'pointer';
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
            const def = NG_NODE_TYPES[n.type] || NG_NODE_TYPES.character;
            const color = (n.properties && n.properties.color) || def.color;
            const stroke = (n.properties && n.properties.color) || def.stroke;
            const isSel = this.selectedNodeIds.has(n.id);
            const b = this._nodeBBox(n);
            const g = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
            g.setAttribute('data-node-id', n.id);
            g.style.cursor = 'move';

            let shape;
            if (def.shape === 'rect') {
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
            shape.setAttribute('fill', color);
            shape.setAttribute('stroke', isSel ? '#4a90d9' : stroke);
            shape.setAttribute('stroke-width', isSel ? 2.5 : 1.2);
            shape.style.pointerEvents = 'none';
            g.appendChild(shape);

            // 节点文字 —— 跟随缩放，带最大最小限制
            if (n.text) {
                const text = doc.createElementNS('http://www.w3.org/2000/svg', 'text');
                text.setAttribute('x', n.x); text.setAttribute('y', n.y);
                text.setAttribute('text-anchor', 'middle');
                text.setAttribute('dominant-baseline', 'central');
                text.setAttribute('font-size', nodeFontSize);
                text.setAttribute('fill', '#ffffff');
                text.setAttribute('font-weight', '500');
                text.setAttribute('pointer-events', 'none');
                // 简单截断，按当前字号（SVG 单位）估算字符宽度
                const maxChars = Math.max(3, Math.floor(n.width / charSvgPx));
                let display = n.text;
                if (display.length > maxChars) display = display.slice(0, maxChars - 1) + '…';
                text.textContent = display;
                g.appendChild(text);
            }

            // 点击命中层（整个节点区域）—— 必须在手柄之前，这样手柄在上层能接收事件
            const hit = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
            hit.setAttribute('x', b.left); hit.setAttribute('y', b.top);
            hit.setAttribute('width', n.width); hit.setAttribute('height', n.height);
            hit.setAttribute('fill', 'rgba(0,0,0,0.001)');
            hit.style.pointerEvents = 'all';
            hit.style.cursor = 'move';
            hit.addEventListener('mousedown', (ev) => this._onNodeMouseDown(ev, n.id));
            hit.addEventListener('click', (ev) => this._onNodeClick(ev, n.id));
            g.appendChild(hit);

            // 选中：画 4 个角缩放手柄
            if (isSel) {
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
            // 4 个边连接口：选中 OR 连线模式（activeEdgeType）下显示
            const showPorts = isSel || !!this.activeEdgeType;
            if (showPorts) {
                const portHandles = [
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

    // 画布空白 mousedown
    _onCanvasMouseDown(e) {
        if (e.button !== 0) return;
        if (this.activeTool) return; // 创建模式有自己的 overlay
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
        } else {
            // 普通拖拽 = 平移画布
            this._interactState = { type: 'pan', startClient: { x: clientX, y: clientY }, startTx: this.tx, startTy: this.ty };
            // 点击空白取消选择
            this.selectedNodeIds.clear();
            this.selectedEdgeIds.clear();
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
        e.preventDefault(); e.stopPropagation();
        e.cancelBubble = true; // SVG 事件兼容性后备，防止冒泡到 canvas 清空选择
        const node = this.getNode(nodeId); if (!node) return;
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
        // 如果当前没有指定连线类型，默认 relation
        if (!this.activeEdgeType) this.activeEdgeType = 'relation';
        const node = this.getNode(nodeId); if (!node) return;
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
            this.addNode(state.ngType, cx, cy, def.label, finalW, finalH);
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
        // 放大端口命中：先找离鼠标最近的端口（graph 距离 <= SNAP_RADIUS 像素）
        // 先把屏幕像素半径换算为 graph 半径
        const snapPx = 42; // 屏幕像素吸附半径（约 2.5 倍端口圆点，很宽容）
        const snapGraph = snapPx / Math.max(0.1, this.zoom);
        let bestPort = null; // {nodeId, side, dist, x, y}
        let bestDist = Infinity;
        for (const n of this.data.nodes) {
            if (n.id === fromNodeId) continue; // 不能连自己
            const ports = this._nodePorts(n);
            for (const side in ports) {
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
                const b = this._nodeBBox(n);
                // 再给 bbox 也加个宽容的外部扩展区域（18px screen），贴边就能连
                const pad = 18 / Math.max(0.1, this.zoom);
                if (g.x >= b.left - pad && g.x <= b.right + pad && g.y >= b.top - pad && g.y <= b.bottom + pad) {
                    targetNode = n;
                    const picked = this._pickPort(n, g);
                    targetSide = picked.side;
                    break;
                }
            }
        }
        this._abortCreatingEdge();
        if (targetNode && targetSide && targetNode.id !== fromNodeId && sourceParsed) {
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
function buildNodeGraphToolbarHTML(statusId) {
    const ICON = {
        select: '<path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>',
        trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
        rotateCCW: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
        rotateCW: '<path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
        zoomOut: '<circle cx="11" cy="11" r="8"/><line x1="8" y1="11" x2="14" y2="11"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
        zoomIn: '<circle cx="11" cy="11" r="8"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
        zoomReset: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
        save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
    };
    const S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

    const nodeButtons = Object.entries(NG_NODE_TYPES).map(([type, def]) => {
        let shape;
        if (def.shape === 'ellipse') shape = `<ellipse cx="12" cy="12" rx="9" ry="6" fill="${def.color}" stroke="${def.stroke}" stroke-width="1"/>`;
        else if (def.shape === 'diamond') shape = `<path d="M12 4l8 8-8 8-8-8z" fill="${def.color}" stroke="${def.stroke}" stroke-width="1"/>`;
        else shape = `<rect x="4" y="6" width="16" height="12" rx="${type === 'character' ? 4 : 2}" fill="${def.color}" stroke="${def.stroke}" stroke-width="1"/>`;
        return `<button class="ng-btn" data-tool="${type}" title="${def.label}"><svg viewBox="0 0 24 24" width="14" height="14">${shape}</svg></button>`;
    }).join('');

    const edgeButtons = Object.entries(NG_EDGE_TYPES).map(([type, def]) => {
        const dash = def.dash ? `stroke-dasharray="${def.dash}"` : '';
        const arrow = def.arrow ? `<path d="M18 12l4 0M20 10l2 2-2 2" stroke="${def.color}" stroke-width="1.5" fill="none"/>` : '';
        return `<button class="ng-btn" data-edge="${type}" title="${def.label}：${def.desc}"><svg viewBox="0 0 24 24" width="20" height="14" fill="none"><line x1="2" y1="7" x2="16" y2="7" stroke="${def.color}" stroke-width="2" ${dash}/>${arrow}</svg></button>`;
    }).join('');

    const iconBtn = (action, title, path) =>
        `<button class="ng-btn"${action ? ` data-action="${action}"` : ''} title="${title}"><svg viewBox="0 0 24 24" width="15" height="15" ${S}>${path}</svg></button>`;

    return `
        <div class="node-graph-toolbar">
            <button class="ng-btn active" data-tool="select" title="${t('ui.ng_select') || '选择/拖拽'}"><svg viewBox="0 0 24 24" width="15" height="15" ${S}>${ICON.select}</svg></button>
            <div class="ng-toolbar-divider"></div>
            ${nodeButtons}
            <div class="ng-toolbar-divider"></div>
            ${edgeButtons}
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
            ${iconBtn('save', t('ui.save') || '保存', ICON.save)}
            <div class="ng-toolbar-divider"></div>
            <button class="ng-btn" data-action="history" title="${t('ui.ng_history') || '历史记录 (Ctrl+H)'}"><svg viewBox="0 0 24 24" width="15" height="15" ${S}><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/></svg></button>
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
    menu.innerHTML = `<div class="ng-ctx-item" data-action="delete">${t('ui.ng_delete') || '删除'}</div>`;

    function show(x, y, targetType, targetId) {
        menu.dataset.targetType = targetType;
        menu.dataset.targetId = targetId;
        menu.style.display = 'block';
        const r = menu.getBoundingClientRect();
        menu.style.left = Math.min(x, window.innerWidth - r.width - 4) + 'px';
        menu.style.top = Math.min(y, window.innerHeight - r.height - 4) + 'px';
    }
    function hide() { menu.style.display = 'none'; }

    engine.container.addEventListener('contextmenu', (e) => {
        e.preventDefault();
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
        if (item.dataset.action === 'delete') {
            engine.deleteSelected();
            if (markDirty) markDirty();
        }
        hide();
    });
    document.addEventListener('click', hide, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
}

// 属性面板 HTML
function buildNodeGraphPropertyPanelHTML() {
    return `
        <aside class="ng-property-panel">
            <div class="ng-panel-header">
                <span class="ng-panel-title">${t('ui.ng_properties') || '属性面板'}</span>
                <button class="ng-panel-toggle" title="${t('ui.ng_collapse') || '收起面板'}">‹</button>
            </div>
            <div class="ng-panel-empty">
                <div class="ng-panel-empty-icon">
                    <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
                    </svg>
                </div>
                <div>${t('ui.ng_select_node_hint') || '选中节点或连线查看属性'}</div>
            </div>
            <div class="ng-panel-content" style="display:none">
                <!-- 节点属性 -->
                <div class="ng-prop-section" data-ng-prop-section="node">
                    <div class="ng-prop-section-title">${t('ui.ng_node_properties') || '节点属性'}</div>
                    <div class="ng-panel-row ng-prop-id-row"><label>${t('ui.ng_id') || 'ID'}</label><span class="ng-prop-id" title="${t('ui.ng_id_copy') || '点击复制'}"></span></div>
                    <div class="ng-panel-row"><label>${t('ui.ng_name') || '名称'}</label><input type="text" class="ng-prop-name" placeholder="${t('ui.ng_name_ph') || '节点名称'}"></div>
                    <div class="ng-panel-row"><label>${t('ui.ng_type') || '类型'}</label>
                        <select class="ng-prop-type">
                            ${Object.entries(NG_NODE_TYPES).map(([type, def]) => `<option value="${type}">${def.label}</option>`).join('')}
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
                    <div class="ng-panel-row"><label>${t('ui.ng_color') || '颜色'}</label>
                        <div class="ng-prop-color-wrap"><input type="color" class="ng-prop-color"><button class="ng-prop-color-reset" title="${t('ui.ng_reset_color') || '重置为类型默认色'}">↺</button></div>
                    </div>
                    <div class="ng-panel-row"><label>${t('ui.ng_tags') || '标签'}</label><div class="ng-prop-tags"></div><input type="text" class="ng-prop-tag-input" placeholder="${t('ui.ng_tag_add') || '输入标签后回车'}"></div>
                    <div class="ng-panel-row"><label>${t('ui.ng_linked_files') || '关联文件'}</label><div class="ng-prop-files"></div></div>
                </div>
                <!-- 连线属性 -->
                <div class="ng-prop-section" data-ng-prop-section="edge" style="display:none">
                    <div class="ng-prop-section-title">${t('ui.ng_edge_properties') || '连线属性'}</div>
                    <div class="ng-panel-row ng-prop-id-row"><label>${t('ui.ng_id') || 'ID'}</label><span class="ng-prop-id ng-prop-edge-id" title="${t('ui.ng_id_copy') || '点击复制'}"></span></div>
                    <div class="ng-panel-row ng-prop-id-row"><label>${t('ui.ng_source_port') || '源端口'}</label><span class="ng-prop-id ng-prop-source-port-id" title="${t('ui.ng_id_copy') || '点击复制'}"></span></div>
                    <div class="ng-panel-row ng-prop-id-row"><label>${t('ui.ng_target_port') || '目标端口'}</label><span class="ng-prop-id ng-prop-target-port-id" title="${t('ui.ng_id_copy') || '点击复制'}"></span></div>
                    <div class="ng-panel-row"><label>${t('ui.ng_edge_label') || '连线标签'}</label><input type="text" class="ng-prop-edge-label" placeholder="${t('ui.ng_edge_label_ph') || '连线标签文字'}"></div>
                    <div class="ng-panel-row"><label>${t('ui.ng_edge_type') || '连线类型'}</label>
                        <select class="ng-prop-edge-type">
                            ${Object.entries(NG_EDGE_TYPES).map(([type, def]) => `<option value="${type}">${def.label}</option>`).join('')}
                        </select>
                    </div>
                    <div class="ng-panel-row"><label>${t('ui.ng_edge_color') || '连线颜色'}</label>
                        <div class="ng-prop-color-wrap"><input type="color" class="ng-prop-edge-color"><button class="ng-prop-edge-color-reset" title="${t('ui.ng_reset_color') || '重置为类型默认色'}">↺</button></div>
                    </div>
                    <div class="ng-panel-row ng-prop-row-toggle">
                        <label>${t('ui.ng_show_arrow') || '显示箭头'}</label>
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
            console.info('[NG] → show EMPTY panel');
            if (emptyEl) emptyEl.style.display = '';
            if (contentEl) contentEl.style.display = 'none';
            if (nodeSection) nodeSection.style.display = 'none';
            if (edgeSection) edgeSection.style.display = 'none';
            return;
        }
        console.info('[NG] → show CONTENT panel (node:' + !!node + ', edge:' + !!edge + ')');
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
    addTab(tabId, title || graphId, content, true);

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
        toolbar.querySelectorAll('.ng-btn[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === (tool || 'select')));
    }
    function setActiveEdge(edgeType) {
        engine.setActiveEdge(edgeType);
        toolbar.querySelectorAll('.ng-btn[data-edge]').forEach(b => b.classList.toggle('active', b.dataset.edge === edgeType));
        if (edgeType) {
            // 选择连线类型时，清除工具按钮高亮，恢复"选择"状态
            engine.setActiveTool(null);
            toolbar.querySelectorAll('.ng-btn[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === 'select'));
        }
    }
    setActiveTool('select');

    toolbar.addEventListener('click', async (e) => {
        const btn = e.target.closest('.ng-btn'); if (!btn) return;
        const tool = btn.dataset.tool, edge = btn.dataset.edge, action = btn.dataset.action;
        if (tool) {
            setActiveTool(tool);
            if (tool !== 'select') setActiveEdge(null);
        } else if (edge) {
            setActiveEdge(engine.activeEdgeType === edge ? null : edge);
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
        }
    });

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
    const json = JSON.stringify(inst.engine.getData(), null, 2);
    try {
        const r = await weAPI.saveFile(inst.projectFolder, filename, json);
        if (r.success) {
            inst.dirty = false;
            if (tabs[tabId]) tabs[tabId].dirty = false;
            const status = document.getElementById(`ng-canvas-${tabId}`)?.closest('.node-graph-layout')?.querySelector('.ng-status');
            if (status) status.textContent = '';
            showNotification(t('ui.saved') || '已保存');
            weLog.info('node-graph', '← saveNodeGraph 完成');
        } else {
            showNotification((t('ui.save_failed') || '保存失败') + ': ' + r.error);
        }
    } catch (e) {
        weLog.error('node-graph', 'saveNodeGraph 异常', e && e.stack ? e.stack : String(e));
        showNotification((t('ui.save_failed') || '保存失败') + ': ' + e.message);
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
