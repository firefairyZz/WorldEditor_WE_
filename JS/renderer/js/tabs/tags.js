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

    openTagPicker(filePath, onSave, existingTag = null) {
        const overlay = document.createElement('div');
        overlay.className = 'tag-picker-overlay';
        overlay.innerHTML = `<div class="tag-picker">
            <h3>${t('ui.tag_settings') || 'Tag Settings'}</h3>
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
                <div class="color-picker"></div>
            </div>
            <div class="tag-preview">
                <span class="tag-item" id="tag-preview-item"></span>
            </div>
            <div class="tag-actions">
                <button class="btn-cancel">${t('ui.cancel')}</button>
                <button class="btn-save">${t('ui.save')}</button>
            </div>
        </div>`;

        document.body.appendChild(overlay);

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
        TAG_COLORS.forEach(color => {
            const btn = document.createElement('button');
            btn.className = 'color-btn' + (color === selectedColor ? ' active' : '');
            btn.style.backgroundColor = color;
            btn.onclick = () => {
                selectedColor = color;
                colorPicker.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                updatePreview();
            };
            colorPicker.appendChild(btn);
        });

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

        const closeOverlay = () => overlay.remove();
        overlay.querySelector('.btn-cancel').onclick = closeOverlay;
        overlay.querySelector('.btn-save').onclick = async () => {
            if (existingTag) {
                await this.updateTag(filePath, existingTag.id, {
                    label: selectedLabel,
                    color: selectedColor,
                    emoji: selectedEmoji
                });
                onSave({ ...existingTag, label: selectedLabel, color: selectedColor, emoji: selectedEmoji });
            } else {
                const tag = await this.addTag(filePath, selectedLabel, selectedColor, selectedEmoji);
                onSave(tag);
            }
            closeOverlay();
        };
    },

    openThumbnailPicker(filePath, onSave) {
        const overlay = document.createElement('div');
        overlay.className = 'tag-picker-overlay';
        overlay.innerHTML = `<div class="tag-picker">
            <h3>${t('ui.thumbnail_settings') || 'Thumbnail Settings'}</h3>
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
            <div class="tag-actions">
                <button class="btn-cancel">${t('ui.cancel')}</button>
                <button class="btn-save">${t('ui.save')}</button>
            </div>
        </div>`;

        document.body.appendChild(overlay);

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

        const closeOverlay = () => overlay.remove();
        overlay.querySelector('.btn-cancel').onclick = closeOverlay;
        overlay.querySelector('.btn-save').onclick = closeOverlay;
    }
};

window.tagModule = tagModule;
