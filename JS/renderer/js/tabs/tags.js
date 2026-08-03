const TAG_COLORS = [
    '#ff6b6b', '#feca57', '#48dbfb', '#1dd1a1',
    '#5f27cd', '#ff9ff3', '#54a0ff', '#5f27cd',
    '#2ecc71', '#e67e22', '#3498db', '#9b59b6'
];

const TAG_EMOJIS = [
    '📝', '📖', '📚', '✨', '⭐', '🌟',
    '👤', '👥', '🎭', '⚔️', '🛡️', '🏰',
    '🌍', '🗺️', '📜', '💡', '🔮', '🎨',
    '⚡', '🔥', '💎', '🌸', '🌙', '☀️'
];

const tagModule = {
    metadata: {},
    currentProjectId: null,
    currentProjectPath: null,
    availableImages: [],
    pinnedTags: [],       // 固定标签（全局，来自设置）
    frequentTags: {},     // 常用标签 { 'label|color|emoji': count }

    normalizeTag(tag) {
        if (!tag || typeof tag !== 'object') return null;
        return {
            label: tag.label || '',
            color: tag.color || TAG_COLORS[0],
            emoji: tag.emoji || ''
        };
    },

    async loadPinnedAndFrequentTags() {
        try {
            const s = await weAPI.getSettings();
            this.pinnedTags = Array.isArray(s.pinnedTags)
                ? s.pinnedTags.map(tag => this.normalizeTag(tag)).filter(Boolean)
                : [];
            this.frequentTags = s.frequentTags && typeof s.frequentTags === 'object' ? s.frequentTags : {};
        } catch(e) {
            console.error('Failed to load pinned/frequent tags:', e);
        }
    },

    async savePinnedTags() {
        const s = await weAPI.getSettings();
        s.pinnedTags = this.pinnedTags;
        await weAPI.setSettings(s);
    },

    async saveFrequentTags() {
        const s = await weAPI.getSettings();
        s.frequentTags = this.frequentTags;
        await weAPI.setSettings(s);
    },

    _tagKey(tag) {
        return `${tag.label}|${tag.color}|${tag.emoji}`;
    },

    async trackTagUsage(tag) {
        if (!tag || !tag.label) return;
        const key = this._tagKey(tag);
        this.frequentTags[key] = (this.frequentTags[key] || 0) + 1;
        await this.saveFrequentTags();
    },

    getFrequentTagsList(limit = 8) {
        return Object.entries(this.frequentTags)
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([key]) => {
                const [label, color, emoji] = key.split('|');
                return { label, color, emoji };
            });
    },

    async loadProjectMetadata(safeId, projectPath) {
        this.currentProjectId = safeId;
        this.currentProjectPath = projectPath;
        try {
            const result = await weAPI.readMetadata(projectPath);
            if (result.success) {
                this.metadata = result.metadata;
                this.loadAvailableImages();
                if (tabs[safeId]) tabs[safeId].metadata = this.metadata;
            }
        } catch (e) {
            console.error('Failed to load metadata:', e);
            this.metadata = { tags: {}, thumbnails: {}, images: {} };
            if (tabs[safeId]) tabs[safeId].metadata = this.metadata;
        }
    },

    async saveMetadata() {
        const projectPath = this.currentProjectPath;
        const metadata = this.metadata;
        if (!projectPath) return;
        try {
            await weAPI.saveMetadata(projectPath, metadata);
        } catch (e) {
            console.error('Failed to save metadata:', e);
        }
    },

    loadAvailableImages() {
        this.availableImages = Object.keys(this.metadata.images || {});
    },

    getTagsForFile(filePath) {
        return this.metadata.tags?.[filePath] || [];
    },

    async addTag(filePath, label, color, emoji) {
        if (!this.metadata.tags) this.metadata.tags = {};
        if (!this.metadata.tags[filePath]) this.metadata.tags[filePath] = [];
        const tag = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2),
            label: label || '',
            color: color || TAG_COLORS[0],
            emoji: emoji || ''
        };
        this.metadata.tags[filePath].push(tag);
        await this.saveMetadata();
        await this.trackTagUsage(tag);
        return tag;
    },

    async removeTag(filePath, tagId) {
        if (!this.metadata.tags?.[filePath]) return;
        this.metadata.tags[filePath] = this.metadata.tags[filePath].filter(t => t.id !== tagId);
        await this.saveMetadata();
    },

    async updateTag(filePath, tagId, updates) {
        if (!this.metadata.tags?.[filePath]) return;
        const tag = this.metadata.tags[filePath].find(t => t.id === tagId);
        if (tag) {
            Object.assign(tag, updates);
            await this.saveMetadata();
            await this.trackTagUsage(tag);
        }
    },

    getThumbnail(filePath) {
        return this.metadata.thumbnails?.[filePath] || null;
    },

    async setThumbnail(filePath, imageData) {
        if (!this.metadata.thumbnails) this.metadata.thumbnails = {};
        this.metadata.thumbnails[filePath] = imageData;
        await this.saveMetadata();
    },

    async clearThumbnail(filePath) {
        if (this.metadata.thumbnails?.[filePath]) {
            delete this.metadata.thumbnails[filePath];
            await this.saveMetadata();
        }
    },

    async storeImage(imageName, imageData) {
        if (!this.metadata.images) this.metadata.images = {};
        this.metadata.images[imageName] = true;
        await weAPI.storeImage(this.currentProjectPath, imageName, imageData);
        this.loadAvailableImages();
    },

    async deleteImage(imageName) {
        if (this.metadata.images?.[imageName]) {
            delete this.metadata.images[imageName];
            await weAPI.deleteImage(this.currentProjectPath, imageName);
            this.loadAvailableImages();
            if (this.metadata.thumbnails) {
                for (const [filePath, thumb] of Object.entries(this.metadata.thumbnails)) {
                    if (thumb === imageName) {
                        delete this.metadata.thumbnails[filePath];
                    }
                }
            }
            await this.saveMetadata();
        }
    },

    createTagSelector(filePath, onTagChange) {
        const container = document.createElement('div');
        container.className = 'tag-selector';

        const tags = this.getTagsForFile(filePath);
        tags.forEach(tag => {
            const tagEl = this.createTagElement(tag, filePath, onTagChange);
            container.appendChild(tagEl);
        });

        const addBtn = document.createElement('button');
        addBtn.className = 'tag-add-btn';
        addBtn.textContent = '+';
        addBtn.title = t('ui.add_tag') || 'Add Tag';
        addBtn.onclick = () => {
            this.openTagPicker(filePath, (tag) => {
                container.insertBefore(this.createTagElement(tag, filePath, onTagChange), addBtn);
                onTagChange?.();
            });
        };
        container.appendChild(addBtn);

        return container;
    },

    createTagElement(tag, filePath, onTagChange) {
        const el = document.createElement('span');
        el.className = 'tag-item';
        el.style.backgroundColor = tag.color;
        el.innerHTML = `<span class="tag-emoji">${tag.emoji || ''}</span><span class="tag-label">${tag.label}</span><span class="tag-remove">✕</span>`;

        const removeBtn = el.querySelector('.tag-remove');
        removeBtn.onclick = async (e) => {
            e.stopPropagation();
            await this.removeTag(filePath, tag.id);
            el.remove();
            onTagChange?.();
        };

        el.ondblclick = () => {
            this.openTagPicker(filePath, (updatedTag) => {
                el.style.backgroundColor = updatedTag.color;
                el.querySelector('.tag-emoji').textContent = updatedTag.emoji || '';
                el.querySelector('.tag-label').textContent = updatedTag.label;
                onTagChange?.();
            }, tag);
        };

        return el;
    },

    _createOverlayHost() {
        const overlay = document.createElement('div');
        overlay.className = 'tag-picker-overlay';
        overlay.dataset.overlay = 'true';
        return overlay;
    },

    _syncOverlayHost(overlay) {
        // 遮罩由 CSS 控制范围（标题栏以下全窗口），此处仅确保存在
    },

    openTagPicker(filePath, onSave, existingTag = null) {
        const overlay = this._createOverlayHost();
        overlay.innerHTML = `<div class="tag-picker">
            <div class="tag-picker-header">
                <h3>${t('ui.tag_settings') || 'Tag Settings'}</h3>
                <button class="tag-picker-close" type="button" aria-label="Close">×</button>
            </div>
            <div class="tag-picker-body">
                <div class="tag-quick-section" id="tag-pinned-section">
                    <label>${t('ui.pinned_tags') || '固定标签'}</label>
                    <div class="tag-quick-list" id="tag-pinned-list"></div>
                </div>
                <div class="tag-quick-section" id="tag-frequent-section">
                    <label>${t('ui.frequent_tags') || '常用标签'}</label>
                    <div class="tag-quick-list" id="tag-frequent-list"></div>
                </div>
                <div class="tag-row">
                    <label>${t('ui.tag_label') || 'Label'}</label>
                    <input type="text" id="tag-label-input" maxlength="10" placeholder="${t('ui.tag_label_placeholder') || 'Tag label'}" />
                </div>
                <div class="tag-row">
                    <label>${t('ui.tag_emoji') || 'Emoji'}</label>
                    <div class="emoji-picker"></div>
                </div>
                <div class="tag-row">
                    <label>${t('ui.tag_color') || 'Color'}</label>
                    <div class="color-picker-row">
                        <div class="color-picker"></div>
                        <div class="color-picker-custom">
                            <span class="custom-color-label">${t('ui.custom_color') || '自定义'}</span>
                            <input type="color" id="tag-custom-color" value="${existingTag?.color || TAG_COLORS[0]}" />
                        </div>
                    </div>
                </div>
                <div class="tag-preview">
                    <span class="tag-item" id="tag-preview-item"></span>
                </div>
            </div>
            <div class="tag-actions">
                <button class="btn-cancel" type="button">${t('ui.cancel')}</button>
                <button class="btn-save" type="button">${t('ui.save')}</button>
            </div>
        </div>`;

        document.body.appendChild(overlay);
        this._syncOverlayHost(overlay);

        const resizeHandler = () => this._syncOverlayHost(overlay);
        window.addEventListener('resize', resizeHandler);
        window.addEventListener('orientationchange', resizeHandler);

        let selectedColor = existingTag?.color || TAG_COLORS[0];
        let selectedEmoji = existingTag?.emoji || '';
        let selectedLabel = existingTag?.label || '';

        const labelInput = overlay.querySelector('#tag-label-input');
        labelInput.value = selectedLabel;

        const emojiPicker = overlay.querySelector('.emoji-picker');
        TAG_EMOJIS.forEach(emoji => {
            const btn = document.createElement('button');
            btn.className = 'emoji-btn' + (emoji === selectedEmoji ? ' active' : '');
            btn.textContent = emoji;
            btn.onclick = () => {
                selectedEmoji = emoji;
                emojiPicker.querySelectorAll('.emoji-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                updatePreview();
            };
            emojiPicker.appendChild(btn);
        });

        const noEmojiBtn = document.createElement('button');
        noEmojiBtn.className = 'emoji-btn' + (selectedEmoji === '' ? ' active' : '');
        noEmojiBtn.textContent = '∅';
        noEmojiBtn.title = t('ui.no_emoji') || 'No emoji';
        noEmojiBtn.onclick = () => {
            selectedEmoji = '';
            emojiPicker.querySelectorAll('.emoji-btn').forEach(b => b.classList.remove('active'));
            noEmojiBtn.classList.add('active');
            updatePreview();
        };
        emojiPicker.appendChild(noEmojiBtn);

        const colorPicker = overlay.querySelector('.color-picker');
        const customColorInput = overlay.querySelector('#tag-custom-color');
        TAG_COLORS.forEach(color => {
            const btn = document.createElement('button');
            btn.className = 'color-btn' + (color === selectedColor ? ' active' : '');
            btn.style.backgroundColor = color;
            btn.onclick = () => {
                selectedColor = color;
                colorPicker.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                customColorInput.value = color;
                updatePreview();
            };
            colorPicker.appendChild(btn);
        });
        customColorInput.oninput = () => {
            selectedColor = customColorInput.value;
            colorPicker.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
            updatePreview();
        };

        const previewItem = overlay.querySelector('#tag-preview-item');
        function updatePreview() {
            previewItem.style.backgroundColor = selectedColor;
            previewItem.innerHTML = `<span class="tag-emoji">${selectedEmoji}</span><span class="tag-label">${selectedLabel}</span>`;
        }
        updatePreview();

        labelInput.oninput = () => {
            selectedLabel = labelInput.value;
            updatePreview();
        };

        // 渲染固定标签和常用标签快捷区
        const renderQuickTags = (containerId, tags) => {
            const container = overlay.querySelector('#' + containerId);
            if (!container) return;
            container.innerHTML = '';
            if (!tags || tags.length === 0) {
                container.innerHTML = `<span class="tag-quick-empty">${t('ui.no_quick_tags') || '暂无'}</span>`;
                return;
            }
            tags.forEach(tag => {
                const btn = document.createElement('span');
                btn.className = 'tag-quick-item';
                btn.style.backgroundColor = tag.color || TAG_COLORS[0];
                btn.innerHTML = `<span class="tag-emoji">${tag.emoji || ''}</span><span class="tag-label">${tag.label || ''}</span>`;
                btn.onclick = () => {
                    selectedLabel = tag.label || '';
                    selectedColor = tag.color || TAG_COLORS[0];
                    selectedEmoji = tag.emoji || '';
                    labelInput.value = selectedLabel;
                    emojiPicker.querySelectorAll('.emoji-btn').forEach(b => {
                        b.classList.toggle('active', b.textContent === selectedEmoji);
                    });
                    colorPicker.querySelectorAll('.color-btn').forEach(b => {
                        b.classList.toggle('active', b.style.backgroundColor === selectedColor);
                    });
                    customColorInput.value = selectedColor;
                    updatePreview();
                };
                container.appendChild(btn);
            });
        };

        renderQuickTags('tag-pinned-list', this.pinnedTags);
        renderQuickTags('tag-frequent-list', this.getFrequentTagsList());
        // 隐藏空区域
        if (!this.pinnedTags.length) overlay.querySelector('#tag-pinned-section').style.display = 'none';
        if (!Object.keys(this.frequentTags).length) overlay.querySelector('#tag-frequent-section').style.display = 'none';

        const closeOverlay = () => {
            window.removeEventListener('resize', resizeHandler);
            window.removeEventListener('orientationchange', resizeHandler);
            overlay.remove();
        };
        overlay.onclick = (e) => {
            if (e.target === overlay) closeOverlay();
        };
        overlay.querySelector('.tag-picker-close').onclick = closeOverlay;
        overlay.querySelector('.btn-cancel').onclick = closeOverlay;
        overlay.querySelector('.btn-save').onclick = async () => {
            if (existingTag) {
                const updatedTag = { ...existingTag, label: selectedLabel, color: selectedColor, emoji: selectedEmoji };
                await this.updateTag(filePath, existingTag.id, {
                    label: selectedLabel,
                    color: selectedColor,
                    emoji: selectedEmoji
                });
                await this.trackTagUsage(updatedTag);
                onSave(updatedTag);
            } else {
                const tag = await this.addTag(filePath, selectedLabel, selectedColor, selectedEmoji);
                onSave(tag);
            }
            closeOverlay();
        };
    },

    openThumbnailPicker(filePath, onSave) {
        const overlay = this._createOverlayHost();
        overlay.innerHTML = `<div class="tag-picker">
            <div class="tag-picker-header">
                <h3>${t('ui.thumbnail_settings') || 'Thumbnail Settings'}</h3>
                <button class="tag-picker-close" type="button" aria-label="Close">×</button>
            </div>
            <div class="tag-picker-body">
                <div class="thumb-section">
                    <label>${t('ui.current_thumbnail') || 'Current Thumbnail'}</label>
                    <div class="current-thumb"></div>
                </div>
                <div class="thumb-section">
                    <label>${t('ui.select_image') || 'Select Image'}</label>
                    <div class="thumb-list"></div>
                </div>
                <div class="thumb-section">
                    <label>${t('ui.upload_image') || 'Upload Image'}</label>
                    <input type="file" accept="image/*" class="thumb-upload" />
                    <p class="hint">${t('ui.upload_hint') || 'PNG, JPG, GIF, WEBP supported'}</p>
                </div>
            </div>
            <div class="tag-actions">
                <button class="btn-cancel" type="button">${t('ui.cancel')}</button>
                <button class="btn-save" type="button">${t('ui.save')}</button>
            </div>
        </div>`;

        document.body.appendChild(overlay);
        this._syncOverlayHost(overlay);

        const resizeHandler = () => this._syncOverlayHost(overlay);
        window.addEventListener('resize', resizeHandler);
        window.addEventListener('orientationchange', resizeHandler);

        const currentThumbContainer = overlay.querySelector('.current-thumb');
        const currentThumb = this.getThumbnail(filePath);
        if (currentThumb) {
            currentThumbContainer.innerHTML = `<img src="${currentThumb}" />`;
        } else {
            currentThumbContainer.innerHTML = `<span class="no-thumb">${t('ui.no_thumbnail') || 'No thumbnail'}</span>`;
        }

        const thumbList = overlay.querySelector('.thumb-list');
        this.availableImages.forEach(imgName => {
            const item = document.createElement('div');
            item.className = 'thumb-item';
            item.textContent = imgName;
            item.onclick = async () => {
                const imageData = await weAPI.readFile(this.currentProjectPath, '_images/' + imgName);
                if (imageData.success) {
                    const dataUri = imageData.content;
                    await this.setThumbnail(filePath, dataUri);
                    currentThumbContainer.innerHTML = `<img src="${dataUri}" />`;
                    onSave?.(dataUri);
                }
            };
            thumbList.appendChild(item);
        });

        const uploadInput = overlay.querySelector('.thumb-upload');
        uploadInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async () => {
                const dataUri = reader.result;
                const imageName = 'thumb_' + Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9.]/g, '_');
                await this.storeImage(imageName, dataUri);
                await this.setThumbnail(filePath, dataUri);
                currentThumbContainer.innerHTML = `<img src="${dataUri}" />`;
                onSave?.(dataUri);
                thumbList.innerHTML = '';
                this.availableImages.forEach(imgName => {
                    const item = document.createElement('div');
                    item.className = 'thumb-item';
                    item.textContent = imgName;
                    item.onclick = async () => {
                        const imageData = await weAPI.readFile(this.currentProjectPath, '_images/' + imgName);
                        if (imageData.success) {
                            const imgUri = imageData.content;
                            await this.setThumbnail(filePath, imgUri);
                            currentThumbContainer.innerHTML = `<img src="${imgUri}" />`;
                            onSave?.(imgUri);
                        }
                    };
                    thumbList.appendChild(item);
                });
            };
            reader.readAsDataURL(file);
        };

        const closeOverlay = () => {
            window.removeEventListener('resize', resizeHandler);
            window.removeEventListener('orientationchange', resizeHandler);
            overlay.remove();
        };
        overlay.onclick = (e) => {
            if (e.target === overlay) closeOverlay();
        };
        overlay.querySelector('.tag-picker-close').onclick = closeOverlay;
        overlay.querySelector('.btn-cancel').onclick = closeOverlay;
        overlay.querySelector('.btn-save').onclick = closeOverlay;
    }
};

window.addEventListener('DOMContentLoaded', () => {
    void tagModule.loadPinnedAndFrequentTags();
});

window.tagModule = tagModule;
