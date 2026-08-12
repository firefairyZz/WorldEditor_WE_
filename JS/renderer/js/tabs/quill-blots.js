// ====== Quill 自定义卡片 Blot（图片卡片 / 网址卡片 / 文件链接卡片 / 节点图链接卡片）=====
// 依赖 Quill 1.3.6，必须在 quill.js 之后加载

(function () {
    'use strict';

    if (typeof Quill === 'undefined') {
        console.warn('[quill-blots] Quill 未加载，跳过自定义 Blot 注册');
        return;
    }

    var BlockEmbed = Quill.import('blots/block/embed');
    var Embed = Quill.import('blots/embed');

    // 继承工具：正确设置原型链，使子类可继承 transpiled ES6 class 的静态属性和原型方法
    function inheritBlot(Child, Parent) {
        Child.prototype = Object.create(Parent.prototype, {
            constructor: { value: Child, writable: true, configurable: true }
        });
        if (Object.setPrototypeOf) {
            Object.setPrototypeOf(Child, Parent);
        } else {
            Child.__proto__ = Parent;
        }
    }

    // ================================================================
    // 工具：生成 SVG 图标 HTML（Lucide 图标）
    // ================================================================
    var SVG_ATTRS = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

    // Lucide: file-text
    function fileIcon() {
        return '<svg viewBox="0 0 24 24" width="20" height="20" ' + SVG_ATTRS + '>' +
            '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
            '<polyline points="14 2 14 8 20 8"/>' +
            '<line x1="16" y1="13" x2="8" y2="13"/>' +
            '<line x1="16" y1="17" x2="8" y2="17"/>' +
            '<polyline points="10 9 9 9 8 9"/>' +
            '</svg>';
    }

    // Lucide: share-2 (network/graph)
    function nodeGraphIcon() {
        return '<svg viewBox="0 0 24 24" width="20" height="20" ' + SVG_ATTRS + '>' +
            '<circle cx="18" cy="5" r="3"/>' +
            '<circle cx="6" cy="12" r="3"/>' +
            '<circle cx="18" cy="19" r="3"/>' +
            '<line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>' +
            '<line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>' +
            '</svg>';
    }

    // Lucide: image
    function imageIcon() {
        return '<svg viewBox="0 0 24 24" width="20" height="20" ' + SVG_ATTRS + '>' +
            '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>' +
            '<circle cx="8.5" cy="8.5" r="1.5"/>' +
            '<polyline points="21 15 16 10 5 21"/>' +
            '</svg>';
    }

    // Lucide: package (用于卡片右下角标识)
    function boxIcon() {
        return '<svg viewBox="0 0 24 24" width="14" height="14" ' + SVG_ATTRS + '>' +
            '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>' +
            '<polyline points="3.27 6.96 12 12.01 20.73 6.96"/>' +
            '<line x1="12" y1="22.08" x2="12" y2="12"/>' +
            '</svg>';
    }

    // Lucide: git-branch (用于节点卡片左下角)
    function gitBranchIcon() {
        return '<svg viewBox="0 0 24 24" width="20" height="20" ' + SVG_ATTRS + '>' +
            '<line x1="6" y1="3" x2="6" y2="15"/>' +
            '<circle cx="18" cy="6" r="3"/>' +
            '<circle cx="6" cy="18" r="3"/>' +
            '<path d="M18 9a9 9 0 0 1-9 9"/>' +
            '</svg>';
    }

    // Lucide: move-diagonal-2 (尺寸调节)
    function moveDiagonal2Icon() {
        return '<svg viewBox="0 0 24 24" width="14" height="14" ' + SVG_ATTRS + '>' +
            '<polyline points="5 7 5 5 7 5"/>' +
            '<polyline points="17 19 19 19 19 17"/>' +
            '<line x1="5" y1="5" x2="19" y2="19"/>' +
            '</svg>';
    }

    // Lucide: link (用于网址卡片)
    function linkIcon() {
        return '<svg viewBox="0 0 24 24" width="14" height="14" ' + SVG_ATTRS + '>' +
            '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>' +
            '<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>' +
            '</svg>';
    }

    // Lucide: alert-circle
    function fallbackIcon() {
        return '<svg viewBox="0 0 24 24" width="16" height="16" ' + SVG_ATTRS + '>' +
            '<circle cx="12" cy="12" r="10"/>' +
            '<line x1="12" y1="8" x2="12" y2="12"/>' +
            '<line x1="12" y1="16" x2="12.01" y2="16"/>' +
            '</svg>';
    }

    // ================================================================
    // 获取主题 CSS 变量值（用于备用 fallback 颜色）
    // ================================================================
    function getCSSVar(name, fallback) {
        try {
            return getComputedStyle(document.body).getPropertyValue(name).trim() || fallback;
        } catch (e) {
            return fallback || '#333';
        }
    }

    // ================================================================
    // 创建卡片通用 DOM 结构（block 级卡片）
    // ================================================================
    function createCardDOM(className, iconHtml, titleText, hintText, boxIconHtml) {
        var node = document.createElement('div');
        node.className = className;
        node.contentEditable = 'false';

        // 左侧大图标
        var iconEl = document.createElement('div');
        iconEl.className = 'ql-card-icon';
        iconEl.innerHTML = iconHtml;
        node.appendChild(iconEl);

        // 中间信息区
        var infoEl = document.createElement('div');
        infoEl.className = 'ql-card-info';

        var titleEl = document.createElement('span');
        titleEl.className = 'ql-card-title';
        titleEl.textContent = titleText;
        infoEl.appendChild(titleEl);

        if (hintText) {
            var hintEl = document.createElement('span');
            hintEl.className = 'ql-card-hint';
            hintEl.textContent = hintText;
            infoEl.appendChild(hintEl);
        }

        node.appendChild(infoEl);

        // 右下角 box 图标
        if (boxIconHtml !== false) {
            var boxEl = document.createElement('div');
            boxEl.className = 'ql-card-box-icon';
            boxEl.innerHTML = boxIconHtml || boxIcon();
            node.appendChild(boxEl);
        }

        return node;
    }

    // ================================================================
    // 备用降级节点（纯文本块，可选中删除）
    // ================================================================
    function createFallbackNode(message) {
        var node = document.createElement('div');
        node.className = 'ql-card-fallback';
        node.contentEditable = 'false';
        node.textContent = message;
        return node;
    }

    // ================================================================
    // 1. 图片卡片 Blot — 独立格式 imageCard（不覆盖默认 image）
    //    支持外框缩放（拖拽调整大小）和内容缩放（object-fit）
    // ================================================================
    var ImageCardBlot = function (_BlockEmbed) {
        function ImageCard() {
            return _BlockEmbed.apply(this, arguments);
        }
        inheritBlot(ImageCard, _BlockEmbed);
        ImageCard.blotName = 'imageCard';
        ImageCard.tagName = 'div';
        ImageCard.className = 'ql-image-card';

        ImageCard.create = function create(value) {
            try {
                var src = typeof value === 'string' ? value : (value && value.src);
                if (!src) throw new Error('图片地址为空');

                var node = _BlockEmbed.create.call(this, value);
                node.contentEditable = 'false';

                // 读取保存的尺寸和 object-fit 设置
                var w = (value && value.width) || '';
                var h = (value && value.height) || '';
                var fit = (value && value.objectFit) || 'contain';

                // 创建图片容器（外框）
                var wrapper = document.createElement('div');
                wrapper.className = 'ql-image-card-wrapper';
                if (w) wrapper.style.width = w;
                if (h) wrapper.style.height = h;
                wrapper.setAttribute('data-object-fit', fit);

                var img = document.createElement('img');
                img.setAttribute('src', src);
                img.setAttribute('alt', (value && value.alt) || '');
                img.draggable = false;
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.objectFit = fit;
                img.style.display = 'block';

                // 图片加载失败时降级
                img.onerror = function () {
                    try {
                        var fallback = createFallbackNode((typeof t === 'function' && t('ui.image_lost')) || '[图片已丢失]');
                        node.parentNode && node.parentNode.replaceChild(fallback, node);
                    } catch (e) {
                        console.warn('[quill-blots] 图片加载失败回调出错', e);
                    }
                };

                wrapper.appendChild(img);

                // 四角缩放手柄
                var positions = ['nw', 'ne', 'sw', 'se'];
                for (var i = 0; i < positions.length; i++) {
                    var handle = document.createElement('div');
                    handle.className = 'ql-image-resize-handle ql-image-resize-' + positions[i];
                    wrapper.appendChild(handle);
                }

                node.appendChild(wrapper);

                // 图片底部信息栏
                var footer = document.createElement('div');
                footer.className = 'ql-image-card-footer';
                var descSpan = document.createElement('span');
                descSpan.className = 'ql-image-card-desc';
                var hasDesc = value && value.desc && value.desc.trim();
                if (hasDesc) {
                    descSpan.textContent = value.desc;
                    descSpan.title = (typeof t === 'function' && t('ui.click_edit_desc')) || '点击修改注释';
                } else {
                    descSpan.textContent = (typeof t === 'function' && t('ui.click_add_desc')) || '点击添加注释';
                    descSpan.classList.add('ql-image-card-desc-empty');
                }
                // 点击编辑注释
                descSpan.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var blot = Quill.find(node);
                    if (!blot) return;
                    var currentDesc = descSpan.classList.contains('ql-image-card-desc-empty') ? '' : (descSpan.textContent || '');
                    // 使用自定义对话框代替 prompt()
                    if (typeof showTextInputDialog === 'function') {
                        showTextInputDialog({
                            title: (typeof t === 'function' && t('ui.edit_image_desc')) || '修改图片注释',
                            value: currentDesc,
                            placeholder: (typeof t === 'function' && t('ui.image_desc_ph')) || '可选：为图片添加描述',
                            onConfirm: function(newDesc) {
                                newDesc = (newDesc || '').trim();
                                descSpan.textContent = newDesc || ((typeof t === 'function' && t('ui.click_add_desc')) || '点击添加注释');
                                descSpan.title = newDesc ? ((typeof t === 'function' && t('ui.click_edit_desc')) || '点击修改注释') : '';
                                descSpan.classList.toggle('ql-image-card-desc-empty', !newDesc);
                                var val = blot.value();
                                val.desc = newDesc;
                                blot.update(Quill.sources.USER);
                            }
                        });
                    }
                });
                footer.appendChild(descSpan);
                var boxFooter = document.createElement('span');
                boxFooter.className = 'ql-image-card-box';
                boxFooter.innerHTML = boxIcon();
                footer.appendChild(boxFooter);
                node.appendChild(footer);

                return node;
            } catch (e) {
                console.warn('[quill-blots] ImageCardBlot.create 降级:', e);
                return createFallbackNode((typeof t === 'function' && t('ui.image_lost')) || '[图片已丢失]');
            }
        };

        ImageCard.value = function value(node) {
            try {
                var img = node && node.querySelector('img');
                var wrapper = node && node.querySelector('.ql-image-card-wrapper');
                var src = img ? img.getAttribute('src') || '' : '';
                var width = wrapper ? wrapper.style.width || '' : '';
                var height = wrapper ? wrapper.style.height || '' : '';
                var objectFit = wrapper ? wrapper.getAttribute('data-object-fit') || 'contain' : 'contain';
                var desc = node ? (node.querySelector('.ql-image-card-desc') ? node.querySelector('.ql-image-card-desc').textContent : '') : '';
                return {
                    src: src,
                    width: width,
                    height: height,
                    objectFit: objectFit,
                    desc: desc
                };
            } catch (e) {
                return { src: '', width: '', height: '', objectFit: 'contain', desc: '' };
            }
        };

        // 显式静态 formats（Quill 内部通过 this.statics.formats 调用，ES5 不会自动继承 EmbedBlot 的静态方法）
        ImageCard.formats = function formats(node) {
            var img = node && node.querySelector('img');
            var wrapper = node && node.querySelector('.ql-image-card-wrapper');
            return {
                src: img ? img.getAttribute('src') || '' : '',
                width: wrapper ? wrapper.style.width || '' : '',
                height: wrapper ? wrapper.style.height || '' : '',
                objectFit: wrapper ? wrapper.getAttribute('data-object-fit') || 'contain' : 'contain',
                desc: node ? (node.querySelector('.ql-image-card-desc') ? node.querySelector('.ql-image-card-desc').textContent : '') : ''
            };
        };

        return ImageCard;
    }(BlockEmbed);

    // ================================================================
    // 2. 网址卡片 Blot（内联级，可与文字同行）
    //    渲染： [box] https://www.example.com  网址
    // ================================================================
    var UrlCardBlot = function (_Embed) {
        function UrlCard() {
            return _Embed.apply(this, arguments);
        }
        inheritBlot(UrlCard, _Embed);
        UrlCard.blotName = 'urlCard';
        UrlCard.tagName = 'span';
        UrlCard.className = 'ql-url-card';

        UrlCard.create = function create(value) {
            try {
                var url = typeof value === 'string' ? value : (value && value.url);
                if (!url) throw new Error('URL 为空');

                var node = _Embed.create.call(this, value);
                node.contentEditable = 'false';
                node.setAttribute('data-url', url);

                // [link图标] https://example.com  [网址]  [box]
                var iconSpan = document.createElement('span');
                iconSpan.className = 'ql-url-card-icon';
                iconSpan.innerHTML = linkIcon();

                var urlSpan = document.createElement('span');
                urlSpan.className = 'ql-url-card-url';
                urlSpan.textContent = url;

                var labelSpan = document.createElement('span');
                labelSpan.className = 'ql-url-card-label';
                labelSpan.textContent = (typeof t === 'function' && t('ui.url')) || '网址';

                var boxSpan = document.createElement('span');
                boxSpan.className = 'ql-url-card-box';
                boxSpan.innerHTML = boxIcon();

                node.appendChild(iconSpan);
                node.appendChild(urlSpan);
                node.appendChild(labelSpan);
                node.appendChild(boxSpan);

                return node;
            } catch (e) {
                console.warn('[quill-blots] UrlCardBlot.create 降级:', e);
                // 降级：返回一个纯文本 span
                var fallback = _Embed.create.call(this, value);
                fallback.textContent = (typeof t === 'function' && t('ui.url_lost')) || '[链接无效]';
                fallback.className = 'ql-url-card ql-url-card-fallback';
                return fallback;
            }
        };

        UrlCard.value = function value(node) {
            try {
                return { url: node.getAttribute('data-url') || '' };
            } catch (e) {
                return { url: '' };
            }
        };

        UrlCard.formats = function formats(node) {
            var url = node.getAttribute('data-url') || '';
            return { url: url };
        };

        UrlCard.format = function format(node, format, value) {
            if (format === 'url' && value) {
                node.setAttribute('data-url', value);
                var urlSpan = node.querySelector('.ql-url-card-url');
                if (urlSpan) urlSpan.textContent = value;
            }
        };

        return UrlCard;
    }(Embed);

    // ================================================================
    // 3. 文件链接卡片 Blot — 富文本文件卡片
    //    设计：大图标 + 文件名 + 简介 + box 图标
    // ================================================================
    var FileLinkCardBlot = function (_BlockEmbed2) {
        function FileLinkCard() {
            return _BlockEmbed2.apply(this, arguments);
        }
        inheritBlot(FileLinkCard, _BlockEmbed2);
        FileLinkCard.blotName = 'fileLinkCard';
        FileLinkCard.tagName = 'div';
        FileLinkCard.className = 'ql-file-card';

        FileLinkCard.create = function create(value) {
            try {
                if (!value || !value.file) throw new Error('文件路径为空');

                var node = _BlockEmbed2.create.call(this, value);
                node.contentEditable = 'false';

                // 左侧图标（缩略图或默认 Lucide 图标）
                var iconEl = document.createElement('div');
                iconEl.className = 'ql-card-icon';
                var thumb = null;
                try { thumb = window.tagModule?.getThumbnail(value.file); } catch (e) { /* ignore */ }
                if (thumb) {
                    iconEl.classList.add('ql-card-icon-thumb');
                    iconEl.innerHTML = '<img src="' + thumb + '" alt="" />';
                } else {
                    iconEl.innerHTML = fileIcon();
                }
                node.appendChild(iconEl);

                // 中间信息区
                var infoEl = document.createElement('div');
                infoEl.className = 'ql-card-info';
                var titleEl = document.createElement('span');
                titleEl.className = 'ql-card-title';
                titleEl.textContent = value.text || value.file.split('/').pop() || value.file;
                infoEl.appendChild(titleEl);
                // 显示目标标题（如果有）
                if (value.headingText) {
                    var targetSpan = document.createElement('span');
                    targetSpan.className = 'ql-card-target';
                    targetSpan.textContent = '§ ' + value.headingText;
                    infoEl.appendChild(targetSpan);
                }
                // 如果有简介则显示简介，否则显示"双击打开文件"提示
                if (value.desc) {
                    var descSpan = document.createElement('span');
                    descSpan.className = 'ql-card-file-desc';
                    descSpan.textContent = value.desc;
                    infoEl.appendChild(descSpan);
                } else {
                    var hintEl = document.createElement('span');
                    hintEl.className = 'ql-card-hint';
                    hintEl.textContent = (typeof t === 'function' && t('ui.double_click_open')) || '双击打开文件';
                    infoEl.appendChild(hintEl);
                }
                node.appendChild(infoEl);

                // 右下角 box 图标
                var boxEl = document.createElement('div');
                boxEl.className = 'ql-card-box-icon';
                boxEl.innerHTML = boxIcon();
                node.appendChild(boxEl);

                node.setAttribute('data-file', value.file);
                node.setAttribute('data-project', value.project || '');
                node.setAttribute('data-heading-text', value.headingText || '');
                node.setAttribute('data-desc', value.desc || '');
                return node;
            } catch (e) {
                console.warn('[quill-blots] FileLinkCardBlot.create 降级:', e);
                return createFallbackNode((typeof t === 'function' && t('ui.file_not_found')) || '[文件未找到]');
            }
        };

        FileLinkCard.value = function value(node) {
            try {
                return {
                    file: node.getAttribute('data-file') || '',
                    project: node.getAttribute('data-project') || '',
                    text: node.querySelector('.ql-card-title') ? node.querySelector('.ql-card-title').textContent : '',
                    headingText: node.getAttribute('data-heading-text') || '',
                    desc: node.getAttribute('data-desc') || ''
                };
            } catch (e) {
                return { file: '', project: '', text: '', headingText: '', desc: '' };
            }
        };

        // 显式静态 formats
        FileLinkCard.formats = function formats(node) {
            return {
                file: node.getAttribute('data-file') || '',
                project: node.getAttribute('data-project') || '',
                text: node.querySelector('.ql-card-title') ? node.querySelector('.ql-card-title').textContent : '',
                headingText: node.getAttribute('data-heading-text') || '',
                desc: node.getAttribute('data-desc') || ''
            };
        };

        return FileLinkCard;
    }(BlockEmbed);

    // ================================================================
    // 4. 节点图链接卡片 Blot
    //    设计：缩略图 + git-branch 图标 + 节点图名 + box 图标
    // ================================================================

    // --- 辅助：生成节点图缩略图 SVG（根据节点边界框自适应视口，确保节点居中）---
function generateNodeGraphThumbnail(data, maxW, maxH) {
    maxW = maxW || 200;
    maxH = maxH || 120;
    try {
        if (!data || !data.nodes || !data.nodes.length) {
            return '<svg viewBox="0 0 ' + maxW + ' ' + maxH + '" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">' +
                '<rect width="' + maxW + '" height="' + maxH + '" fill="' + getCSSVar('--bg-sidebar', '#252526') + '" rx="4"/>' +
                '<text x="' + (maxW / 2) + '" y="' + (maxH / 2) + '" text-anchor="middle" fill="' + getCSSVar('--text-secondary', '#999') + '" font-size="12">' +
                ((typeof t === 'function' && t('ui.ng_no_nodes')) || '无节点') +
                '</text></svg>';
        }
        var nodes = data.nodes;
        // 计算所有节点的边界框（AABB）
        // 注意：NGEngine 使用中心坐标，n.x/n.y 是节点中心，需用 n.x ± halfWidth 计算边缘
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        nodes.forEach(function (n) {
            var nx = n.x || 0;
            var ny = n.y || 0;
            var hw = (n.width || 80) / 2;
            var hh = (n.height || 40) / 2;
            if (nx - hw < minX) minX = nx - hw;
            if (ny - hh < minY) minY = ny - hh;
            if (nx + hw > maxX) maxX = nx + hw;
            if (ny + hh > maxY) maxY = ny + hh;
        });
        // 如果没有指定目标节点，显示所有节点（AABB + 边距）
        // 目标节点通过参数传入（data.targetNodeId）
        var targetNodeId = data.targetNodeId || null;
        var bboxL, bboxT, bboxR, bboxB, bboxW, bboxH;
        if (targetNodeId) {
            // 居中显示目标节点
            var tn = nodes.find(function (n) { return n.id === targetNodeId; });
            if (tn) {
                var cx = tn.x || 0;
                var cy = tn.y || 0;
                // 卡片宽高比 (maxW/maxH) 决定显示范围
                var aspect = maxW / maxH;
                var halfW = Math.max(200, (maxX - minX || 200) * 0.6) / 2;
                var halfH = halfW / aspect;
                bboxL = cx - halfW;
                bboxT = cy - halfH;
                bboxR = cx + halfW;
                bboxB = cy + halfH;
            } else {
                targetNodeId = null;
            }
        }
        if (!targetNodeId) {
            // 边距：20% 确保节点完整可见
            var pad = Math.max(20, (maxX - minX) * 0.2, (maxY - minY) * 0.2);
            bboxL = minX - pad;
            bboxT = minY - pad;
            bboxR = maxX + pad;
            bboxB = maxY + pad;
        }
        bboxW = bboxR - bboxL;
        bboxH = bboxB - bboxT;

        // 使用共享的 generateNodeGraphSVG 生成缩略图（与导出 HTML 使用相同渲染技术）
        var bgColor = getCSSVar('--bg-sidebar', '#252526');
        var result = '';
        if (typeof window.generateNodeGraphSVG === 'function') {
            result = window.generateNodeGraphSVG(data, {
                viewBox: { l: bboxL, t: bboxT, w: bboxW, h: bboxH },
                bgColor: bgColor,
                showGrid: false,
                nodeOpacity: 0.8,
                edgeStrokeWidth: 3,
                nonScalingStroke: true,
            });
        }
        if (!result) {
            // 降级：空 SVG
            result = '<svg viewBox="' + bboxL + ' ' + bboxT + ' ' + bboxW + ' ' + bboxH + '" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">' +
                '<rect x="' + bboxL + '" y="' + bboxT + '" width="' + bboxW + '" height="' + bboxH + '" fill="' + bgColor + '" rx="4"/>' +
                '</svg>';
        }
        return result;
    } catch (e) {
        console.warn('[quill-blots] 生成缩略图失败', e);
        return '';
    }
}

// 刷新编辑器内所有节点图卡片的缩略图（从磁盘重新读取 .node.json 数据生成）
function refreshNodeGraphThumbnails(safeId) {
    try {
        var project = typeof tabs !== 'undefined' ? tabs[safeId] : null;
        if (!project || !project.projectPath) {
            weLog && weLog.debug('quill-blots', 'refreshNodeGraphThumbnails: 无 project', { safeId });
            return;
        }
        // 收集所有可能包含卡片的容器
        var containers = [];
        var activeEditor = document.querySelector('#quill-editor');
        if (activeEditor) containers.push(activeEditor);
        var storage = document.getElementById('quill-storage');
        if (storage) containers.push(storage);
        // 从项目标签页元素中查找（兼容非活跃 tab 的编辑器内容）
        var tabEl = document.getElementById('tab-content-' + safeId);
        if (tabEl) containers.push(tabEl);
        // 去重后查找卡片
        var cards = [];
        var seen = new Set();
        containers.forEach(function (c) {
            var found = c.querySelectorAll('.ql-node-card');
            found.forEach(function (card) {
                if (!seen.has(card)) {
                    seen.add(card);
                    cards.push(card);
                }
            });
        });
        if (!cards.length) return;
        weLog && weLog.info('quill-blots', 'refreshNodeGraphThumbnails: 发现 ' + cards.length + ' 个节点图卡片');
        cards.forEach(function (card) {
            var file = card.getAttribute('data-file');
            if (!file) return;
            // 读取卡片的目标节点（如果有则居中显示该节点）
            var targetNode = card.getAttribute('data-target-node') || '';
            // 异步读取文件并更新缩略图
            if (typeof weAPI !== 'undefined' && weAPI.readFile) {
                weAPI.readFile(project.projectPath, file).then(function (result) {
                    try {
                        if (!result.success || !result.content) return;
                        var ngData = JSON.parse(result.content);
                        // 传入目标节点ID，让缩略图居中显示该节点
                        if (targetNode) ngData.targetNodeId = targetNode;
                        var thumb = generateNodeGraphThumbnail(ngData, 200, 120);
                        if (!thumb) return;
                        var thumbDiv = card.querySelector('.ql-node-card-thumb');
                        if (thumbDiv) {
                            thumbDiv.innerHTML = thumb;
                            card.setAttribute('data-thumbnail', thumb);
                        }
                    } catch (e) {
                        weLog && weLog.warn('quill-blots', 'refreshNodeGraphThumbnails: 更新失败', { file: file, error: e.message });
                    }
                });
            }
        });
    } catch (e) {
        weLog && weLog.warn('quill-blots', 'refreshNodeGraphThumbnails 异常', e);
    }
}

    function escapeXml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // --- 节点图卡片 Blot ---
    var NodeGraphCardBlot = function (_BlockEmbed3) {
        function NodeGraphCard() {
            return _BlockEmbed3.apply(this, arguments);
        }
        inheritBlot(NodeGraphCard, _BlockEmbed3);
        NodeGraphCard.blotName = 'nodeGraphCard';
        NodeGraphCard.tagName = 'div';
        NodeGraphCard.className = 'ql-node-card';

        NodeGraphCard.create = function create(value) {
            try {
                if (!value || !value.file) throw new Error('节点文件路径为空');

                var node = _BlockEmbed3.create.call(this, value);
                node.contentEditable = 'false';

                // 缩略图区域（顶部）
                var thumbDiv = document.createElement('div');
                thumbDiv.className = 'ql-node-card-thumb';
                var thumbData = value.thumbnail || '';
                if (thumbData) {
                    thumbDiv.innerHTML = thumbData;
                } else {
                    thumbDiv.innerHTML = '<div class="ql-node-card-thumb-placeholder">' +
                        ((typeof t === 'function' && t('ui.ng_no_nodes')) || '无节点') + '</div>';
                }
                node.appendChild(thumbDiv);

                // 底部信息栏（与文件卡片相同布局）
                var footer = document.createElement('div');
                footer.className = 'ql-node-card-footer';

                // 左侧图标
                var iconEl = document.createElement('div');
                iconEl.className = 'ql-card-icon';
                iconEl.innerHTML = gitBranchIcon();
                footer.appendChild(iconEl);

                // 中间信息区
                var infoEl = document.createElement('div');
                infoEl.className = 'ql-card-info';
                var nameSpan = document.createElement('span');
                nameSpan.className = 'ql-card-title';
                nameSpan.textContent = value.text || value.file.split('/').pop().replace('.node.json', '') || value.file;
                infoEl.appendChild(nameSpan);

                // 显示目标节点（如果有）
                if (value.targetNodeText) {
                    var targetSpan = document.createElement('span');
                    targetSpan.className = 'ql-card-target';
                    targetSpan.textContent = '→ ' + value.targetNodeText + ' (' + value.targetNode + ')';
                    infoEl.appendChild(targetSpan);
                }

                // 如果有简介则显示简介
                if (value.desc) {
                    var descSpan = document.createElement('span');
                    descSpan.className = 'ql-card-file-desc';
                    descSpan.textContent = value.desc;
                    infoEl.appendChild(descSpan);
                }

                footer.appendChild(infoEl);

                // 右下角 box 图标
                var boxEl = document.createElement('div');
                boxEl.className = 'ql-card-box-icon';
                boxEl.innerHTML = boxIcon();
                footer.appendChild(boxEl);

                node.appendChild(footer);

                node.setAttribute('data-file', value.file);
                node.setAttribute('data-project', value.project || '');
                node.setAttribute('data-target-node', value.targetNode || '');
                node.setAttribute('data-target-node-text', value.targetNodeText || '');
                node.setAttribute('data-desc', value.desc || '');
                node.setAttribute('data-thumbnail', value.thumbnail || '');

                return node;
            } catch (e) {
                console.warn('[quill-blots] NodeGraphCardBlot.create 降级:', e);
                return createFallbackNode((typeof t === 'function' && t('ui.node_not_found')) || '[节点未找到]');
            }
        };

        NodeGraphCard.value = function value(node) {
            try {
                return {
                    file: node.getAttribute('data-file') || '',
                    project: node.getAttribute('data-project') || '',
                    text: node.querySelector('.ql-card-title') ? node.querySelector('.ql-card-title').textContent : '',
                    targetNode: node.getAttribute('data-target-node') || '',
                    targetNodeText: node.getAttribute('data-target-node-text') || '',
                    desc: node.getAttribute('data-desc') || '',
                    thumbnail: node.getAttribute('data-thumbnail') || ''
                };
            } catch (e) {
                return { file: '', project: '', text: '', targetNode: '', targetNodeText: '', desc: '', thumbnail: '' };
            }
        };

        // 显式静态 formats
        NodeGraphCard.formats = function formats(node) {
            return {
                file: node.getAttribute('data-file') || '',
                project: node.getAttribute('data-project') || '',
                text: node.querySelector('.ql-card-title') ? node.querySelector('.ql-card-title').textContent : '',
                targetNode: node.getAttribute('data-target-node') || '',
                targetNodeText: node.getAttribute('data-target-node-text') || '',
                desc: node.getAttribute('data-desc') || '',
                thumbnail: node.getAttribute('data-thumbnail') || ''
            };
        };

        return NodeGraphCard;
    }(BlockEmbed);

    // ================================================================
    // 注册 Blot
    // ================================================================
    // Quill.register 会自动调用 Parchment.register，无需额外注册
    Quill.register(ImageCardBlot, true);
    Quill.register(UrlCardBlot, true);
    Quill.register(FileLinkCardBlot, true);
    Quill.register(NodeGraphCardBlot, true);

    // ================================================================
    // 全局双击卡片事件处理
    // ================================================================
    if (!window._quillCardHandlerRegistered) {
        window._quillCardHandlerRegistered = true;

        // 单击卡片选中（支持多选）
        document.addEventListener('click', function(e) {
            var card = e.target.closest('.ql-image-card, .ql-url-card, .ql-file-card, .ql-node-card');
            if (!card) return;

            // 不触发选择的内部元素
            if (e.target.closest('.ql-image-card-desc')) return;

            e.stopPropagation();
            var isMulti = e.shiftKey || e.ctrlKey || e.metaKey;

            if (isMulti) {
                card.classList.toggle('ql-card-selected');
            } else {
                // 单选模式：取消其他选中
                var editorRoot = card.closest('.ql-editor');
                if (editorRoot) {
                    editorRoot.querySelectorAll('.ql-card-selected').forEach(function(el) {
                        if (el !== card) el.classList.remove('ql-card-selected');
                    });
                }
                card.classList.add('ql-card-selected');
            }
        });

        // ESC 取消所有选中
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                document.querySelectorAll('.ql-card-selected').forEach(function(el) {
                    el.classList.remove('ql-card-selected');
                });
            }
            // Delete / Backspace 删除选中卡片
            if (e.key === 'Delete' || e.key === 'Backspace') {
                // 仅在事件源在编辑器内时处理卡片删除，避免干扰 Quill 文本编辑
                var editorRoot = e.target.closest('.ql-editor');
                if (!editorRoot) return;
                var selected = Array.from(document.querySelectorAll('.ql-card-selected'));
                if (selected.length > 0) {
                    // 只在编辑器内生效
                    if (!selected[0].closest('.ql-editor')) return;
                    e.preventDefault();
                    // 收集所有 blot 的索引和对应的 quill 实例
                    var deleteOps = [];
                    // 收集所有 blot 的索引和对应的 quill 实例
                    var deleteOps = [];
                    selected.forEach(function(card) {
                        try {
                            var blot = Quill.find(card);
                            if (blot && blot.quill) {
                                var index = blot.quill.getIndex(blot);
                                if (index !== undefined && index >= 0) {
                                    deleteOps.push({ index: index, quill: blot.quill });
                                }
                            }
                        } catch (err) {}
                    });
                    // 按 quill 分组，每组内降序删除
                    var grouped = {};
                    deleteOps.forEach(function(op) {
                        var key = op.quill.root ? op.quill.root.id || 'default' : 'default';
                        if (!grouped[key]) grouped[key] = { quill: op.quill, indices: [] };
                        grouped[key].indices.push(op.index);
                    });
                    Object.keys(grouped).forEach(function(key) {
                        var g = grouped[key];
                        g.indices.sort(function(a, b) { return b - a; }); // 降序
                        g.indices.forEach(function(idx) {
                            try {
                                g.quill.deleteText(idx, 1, Quill.sources.USER);
                            } catch (err) {
                                console.warn('[quill-blots] 删除卡片失败', err);
                            }
                        });
                    });
                }
            }
        });

        // 双击卡片打开
        document.addEventListener('dblclick', function (e) {
            // 网址卡片：双击打开 URL
            var urlCard = e.target.closest('.ql-url-card');
            if (urlCard) {
                var url = urlCard.getAttribute('data-url');
                if (url && typeof weAPI !== 'undefined' && typeof weAPI.openExternalLink === 'function') {
                    weAPI.openExternalLink(url);
                }
                return;
            }

            // 文件链接卡片
            var fileCard = e.target.closest('.ql-file-card');
            if (fileCard) {
                var file = fileCard.getAttribute('data-file');
                var project = fileCard.getAttribute('data-project');
                if (file && typeof handleJumpLinkClick === 'function') {
                    handleJumpLinkClick({ file: file, project: project });
                }
                return;
            }

            // 节点图链接卡片
            var nodeCard = e.target.closest('.ql-node-card');
            if (nodeCard) {
                var nFile = nodeCard.getAttribute('data-file');
                var nProject = nodeCard.getAttribute('data-project');
                var targetNode = nodeCard.getAttribute('data-target-node');
                if (nFile && typeof handleJumpLinkClick === 'function') {
                    handleJumpLinkClick({ file: nFile, project: nProject, targetNode: targetNode });
                }
                return;
            }
        });
    }

    // ================================================================
    // 辅助：从 Quill 内容中扫描并替换现有 <img> 为 ImageCard（兼容旧内容）
    // ================================================================
    function upgradeExistingImages(quill) {
        if (!quill || !quill.root) return;
        try {
            var imgs = quill.root.querySelectorAll('img:not(.ql-image-card img)');
            imgs.forEach(function (img) {
                try {
                    var src = img.getAttribute('src');
                    if (!src) return;
                    var blot = Quill.find(img);
                    if (!blot) return;
                    var index = quill.getIndex(blot);
                    if (index === undefined || index < 0) return;
                    quill.deleteText(index, 1);
                    quill.insertEmbed(index, 'imageCard', { src: src, width: '', height: '', objectFit: 'contain' });
                } catch (e) {
                    console.warn('[quill-blots] 升级图片失败:', e);
                }
            });
        } catch (e) {
            console.warn('[quill-blots] upgradeExistingImages 出错:', e);
        }
    }

    // 暴露到全局
    window.ImageCardBlot = ImageCardBlot;
    window.UrlCardBlot = UrlCardBlot;
    window.FileLinkCardBlot = FileLinkCardBlot;
    window.NodeGraphCardBlot = NodeGraphCardBlot;
    window.upgradeExistingImages = upgradeExistingImages;
    window.generateNodeGraphThumbnail = generateNodeGraphThumbnail;
    window.refreshNodeGraphThumbnails = refreshNodeGraphThumbnails;

    console.info('[quill-blots] 自定义卡片 Blot 注册完成 (ImageCard/UrlCard/FileLinkCard/NodeGraphCard)');
})();