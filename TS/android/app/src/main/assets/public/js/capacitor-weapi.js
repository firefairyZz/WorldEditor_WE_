// weAPI Capacitor Adapter
// Replaces Electron preload.js bridge with Capacitor-compatible APIs
// Must be loaded before all other app scripts

(function() {
    const isCapacitor = typeof window !== 'undefined' && window.Capacitor !== undefined;
    const isAndroid = /Android/i.test(navigator.userAgent || '');
    const isElectron = /Electron/i.test(navigator.userAgent || '') || !!(window.require && window.require('electron'));

    function $id(tag) { return document.getElementById(tag); }

    function getPlugin(name) {
        if (isCapacitor && window.Capacitor && window.Capacitor.Plugins) {
            return window.Capacitor.Plugins[name] || null;
        }
        return null;
    }

    const Filesystem = getPlugin('Filesystem');
    const StatusBar = getPlugin('StatusBar');
    const Preferences = getPlugin('Preferences');

    // === Storage Helpers ===
    async function prefsGet(key, defaultValue) {
        try {
            if (Preferences && Preferences.get) {
                const result = await Preferences.get({ key });
                if (result && result.value !== undefined && result.value !== null) {
                    return result.value;
                }
            }
        } catch (e) {}
        try {
            const v = localStorage.getItem(key);
            return v !== null ? v : defaultValue;
        } catch (e) { return defaultValue; }
    }

    async function prefsSet(key, value) {
        try {
            if (Preferences && Preferences.set) {
                await Preferences.set({ key, value: String(value) });
                return true;
            }
        } catch (e) {}
        try {
            localStorage.setItem(key, String(value));
            return true;
        } catch (e) { return false; }
    }

    async function prefsRemove(key) {
        try {
            if (Preferences && Preferences.remove) {
                await Preferences.remove({ key });
                return true;
            }
        } catch (e) {}
        try {
            localStorage.removeItem(key);
            return true;
        } catch (e) { return false; }
    }

    // === Filesystem Helpers ===
    const FS_PREFIX = 'we_fs_v1_';
    const MIGRATION_FLAG = '__path_migrated__'; // 迁移完成标记
    
    // 文件列表缓存（减少重复遍历 localStorage）
    let fileListCache = null;
    let fileListCacheKey = null;
    const CACHE_TTL = 5000; // 5秒缓存有效期
    let fileListCacheTime = 0;
    
    function invalidateCache() {
        fileListCache = null;
        fileListCacheKey = null;
        fileListCacheTime = 0;
    }
    
    // 路径规范化：统一使用小写（Windows 路径大小写不敏感，但浏览器存储区分大小写）
    function normalizePath(path) {
        if (!path) return path;
        // 替换反斜杠为正斜杠，并转为小写
        return path.replace(/\\/g, '/').toLowerCase();
    }
    
    // === IndexedDB for large files ===
    let iddbInstance = null;
    const IDDB_NAME = 'weeditor_storage';
    const IDDB_STORE = 'files';
    const IDDB_LIMIT = 50 * 1024 * 1024; // localStorage 上限 50MB，超过则用 IndexedDB
    
    async function getIDDB() {
        if (iddbInstance) return iddbInstance;
        return new Promise((resolve, reject) => {
            try {
                const request = indexedDB.open(IDDB_NAME, 1);
                request.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(IDDB_STORE)) {
                        db.createObjectStore(IDDB_STORE);
                    }
                };
                request.onsuccess = (e) => {
                    iddbInstance = e.target.result;
                    resolve(iddbInstance);
                };
                request.onerror = () => reject(new Error('IndexedDB 打开失败'));
            } catch (e) {
                reject(e);
            }
        });
    }
    
    async function iddbPut(key, value) {
        const db = await getIDDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IDDB_STORE, 'readwrite');
            const store = tx.objectStore(IDDB_STORE);
            store.put(value, key);
            tx.oncomplete = () => resolve({ success: true });
            tx.onerror = () => reject(new Error('IndexedDB 写入失败'));
        });
    }
    
    async function iddbGet(key) {
        const db = await getIDDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IDDB_STORE, 'readonly');
            const store = tx.objectStore(IDDB_STORE);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(new Error('IndexedDB 读取失败'));
        });
    }
    
    async function iddbDelete(key) {
        const db = await getIDDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IDDB_STORE, 'readwrite');
            const store = tx.objectStore(IDDB_STORE);
            store.delete(key);
            tx.oncomplete = () => resolve({ success: true });
            tx.onerror = () => reject(new Error('IndexedDB 删除失败'));
        });
    }

    async function fsRead(path) {
        const normalizedPath = normalizePath(path);
        
        if (Filesystem && Filesystem.readFile) {
            try {
                const result = await Filesystem.readFile({ path, directory: 'DOCUMENTS' });
                return { success: true, content: result.data };
            } catch (e) {
                if (e.message && e.message.includes('does not exist')) {
                    return { success: false, content: '' };
                }
            }
        }
        
        // 先尝试规范化路径
        let key = FS_PREFIX + normalizedPath;
        let raw = localStorage.getItem(key);
        
        // 回退：尝试原始路径（兼容旧数据）
        if (raw === null) {
            const originalKey = FS_PREFIX + path;
            if (originalKey !== key) {
                raw = localStorage.getItem(originalKey);
                if (raw !== null) {
                    // 找到旧格式数据，迁移到新格式
                    localStorage.setItem(key, raw);
                    weLog.debug('fsRead', '路径格式迁移完成', { oldPath: path, newPath: normalizedPath });
                }
            }
        }
        
        if (raw === null) return { success: false, content: '' };
        
        // 检查是否在 IndexedDB 中
        if (raw === '__iddb__' || raw === '__media__') {
            try {
                const content = await iddbGet(key);
                if (content !== undefined && content !== null) {
                    return { success: true, content };
                }
                return { success: false, content: '', error: 'IndexedDB 中未找到文件' };
            } catch (e) {
                return { success: false, content: '', error: 'IndexedDB 读取失败' };
            }
        }
        
        // localStorage 中的小文件
        try {
            // 先尝试 UTF-8 解码（使用 encodeURIComponent 编码的内容）
            const decoded = decodeURIComponent(escape(atob(raw)));
            return { success: true, content: decoded };
        } catch (decodeErr) {
            // 回退：尝试普通 atob（处理旧版 Latin-1 编码内容）
            try {
                const decoded = atob(raw);
                return { success: true, content: decoded };
            } catch (e2) {
                // 最终回退：直接返回原始内容
                return { success: true, content: raw || '' };
            }
        }
    }

    async function fsWrite(path, content) {
        const normalizedPath = normalizePath(path);
        const contentSize = content ? content.length : 0;
        
        // 小文件（<1MB）直接跳过日志
        if (contentSize < 1024 * 1024) {
            // 跳过日志以提高性能
        } else {
            weLog.info('fsWrite', '开始写入大文件', { path: normalizedPath, sizeMB: (contentSize / 1024 / 1024).toFixed(2) });
        }
        
        if (Filesystem && Filesystem.writeFile) {
            try {
                await Filesystem.writeFile({
                    path,
                    data: content,
                    directory: 'DOCUMENTS',
                    recursive: true
                });
                weLog.info('fsWrite', 'Filesystem 写入成功', { path: normalizedPath });
                return { success: true };
            } catch (e) {
                console.warn('FS write failed, using localStorage/IndexedDB:', e.message);
            }
        }
        
        // 判断文件大小，大文件使用 IndexedDB
        const storageKey = FS_PREFIX + normalizedPath;
        
        // 如果内容超过限制，使用 IndexedDB
        if (contentSize > IDDB_LIMIT) {
            weLog.info('fsWrite', '使用 IndexedDB 存储大文件', { path: normalizedPath, contentSize });
            const startTime = Date.now();
            try {
                await iddbPut(storageKey, content);
                weLog.info('fsWrite', 'IndexedDB 写入完成', { path: normalizedPath, timeMs: Date.now() - startTime });
                // 同时在 localStorage 存一个标记
                localStorage.setItem(storageKey, '__iddb__');
                return { success: true, storage: 'indexeddb' };
            } catch (e) {
                weLog.error('fsWrite', 'IndexedDB 写入失败', { path: normalizedPath, error: e.message });
                return { success: false, error: 'IndexedDB 写入失败，文件可能过大' };
            }
        }
        
        // 小文件使用 localStorage
        try {
            // 优先使用 UTF-8 兼容的编码方式（支持中文等非 ASCII 字符）
            const encoded = btoa(unescape(encodeURIComponent(content)));
            localStorage.setItem(storageKey, encoded);
            // 如果之前在 IndexedDB 有备份，删除
            try { await iddbDelete(storageKey); } catch (e) {}
            return { success: true, storage: 'localstorage' };
        } catch (e) {
            try {
                // 回退：直接存储原始内容
                localStorage.setItem(storageKey, content);
                return { success: true, storage: 'localstorage' };
            } catch (e2) {
                // localStorage 也失败（可能是编码问题），尝试 IndexedDB
                try {
                    await iddbPut(storageKey, content);
                    localStorage.setItem(storageKey, '__iddb__');
                    return { success: true, storage: 'indexeddb' };
                } catch (e3) {
                    return { success: false, error: '存储失败' };
                }
            }
        }
    }

    async function fsDelete(path) {
        const normalizedPath = normalizePath(path);
        
        if (Filesystem && Filesystem.deleteFile) {
            try {
                await Filesystem.deleteFile({ path, directory: 'DOCUMENTS' });
                return { success: true };
            } catch (e) {}
        }
        try {
            const key = FS_PREFIX + normalizedPath;
            // 检查是否在 IndexedDB 中（__iddb__ 或 __media__）
            const raw = localStorage.getItem(key);
            if (raw === '__iddb__' || raw === '__media__') {
                try { await iddbDelete(key); } catch (e) {}
            }
            localStorage.removeItem(key);
            return { success: true };
        } catch (e) { return { success: false }; }
    }

    async function fsMkdir(path) {
        if (Filesystem && Filesystem.mkdir) {
            try {
                await Filesystem.mkdir({ path, directory: 'DOCUMENTS', recursive: true });
                return { success: true };
            } catch (e) {}
        }
        return { success: true };
    }

    async function fsRmdir(path) {
        if (Filesystem && Filesystem.rmdir) {
            try {
                await Filesystem.rmdir({ path, directory: 'DOCUMENTS' });
                return { success: true };
            } catch (e) {}
        }
        return { success: true };
    }

    // === Project Helper ===
    function projectMetaKey(folder) { return FS_PREFIX + '_meta_' + normalizePath(folder); }

    async function loadProjectMeta(folder) {
        try {
            // 尝试新格式（规范化路径）
            const normalizedMetaKey = projectMetaKey(folder);
            let raw = await prefsGet(normalizedMetaKey, null);
            
            // 回退：尝试旧格式（原始路径）
            if (!raw) {
                const originalMetaKey = FS_PREFIX + '_meta_' + folder;
                if (originalMetaKey !== normalizedMetaKey) {
                    raw = await prefsGet(originalMetaKey, null);
                    if (raw) {
                        // 迁移到新格式
                        await prefsSet(normalizedMetaKey, raw);
                        weLog.debug('loadProjectMeta', '元数据路径格式迁移完成', { folder });
                    }
                }
            }
            
            if (raw) return JSON.parse(raw);
        } catch (e) {}
        return {};
    }

    async function saveProjectMeta(folder, meta) {
        await prefsSet(projectMetaKey(folder), JSON.stringify(meta));
    }

    // === Minimal ZIP extractor (for .wep files) ===
    async function extractZip(content) {
        const files = [];
        try {
            const bytes = new Uint8Array(content);
            const view = new DataView(content);
            const decoder = new TextDecoder('utf-8');

            for (let i = 0; i < bytes.length - 30;) {
                const sig = view.getUint32(i, true);
                if (sig !== 0x04034b50) { i++; continue; }

                const fileNameLen = view.getUint16(i + 26, true);
                const extraLen = view.getUint16(i + 28, true);
                const compressedSize = view.getUint32(i + 18, true);
                const uncompressedSize = view.getUint32(i + 22, true);
                const method = view.getUint16(i + 8, true);
                const flags = view.getUint16(i + 6, true);

                const fileName = decoder.decode(bytes.slice(i + 30, i + 30 + fileNameLen));

                let fileData = null;
                const dataStart = i + 30 + fileNameLen + extraLen;

                if (method === 0) {
                    fileData = bytes.slice(dataStart, dataStart + uncompressedSize);
                } else if (method === 8 && compressedSize > 0) {
                    try {
                        const compressedData = bytes.slice(dataStart, dataStart + compressedSize);
                        if (typeof DecompressionStream !== 'undefined') {
                            const ds = new DecompressionStream('deflate-raw');
                            const stream = new Response(new Blob([compressedData]).stream().pipeThrough(ds));
                            fileData = new Uint8Array(await stream.arrayBuffer());
                        } else {
                            fileData = compressedData;
                        }
                    } catch (e) {
                        fileData = compressedSize > 0 ? bytes.slice(dataStart, dataStart + compressedSize) : new Uint8Array(0);
                    }
                } else if (compressedSize === 0 && uncompressedSize === 0) {
                    fileData = new Uint8Array(0);
                } else {
                    fileData = bytes.slice(dataStart, dataStart + compressedSize);
                }

                if (!fileName.endsWith('/')) {
                    let textContent = null;
                    try { textContent = decoder.decode(fileData); } catch (e) {}
                    // 检查是否为文本文件（无 null 字节）
                    if (textContent !== null && !textContent.includes('\u0000') && fileData.length > 0) {
                        files.push({ path: fileName, content: textContent, binary: false });
                    } else {
                        // 二进制文件：将二进制数据编码为 base64 存储
                        const binaryStr = String.fromCharCode.apply(null, fileData);
                        const base64 = btoa(binaryStr);
                        files.push({ path: fileName, content: base64, binary: true });
                    }
                }

                i = dataStart + compressedSize;
                if (i >= bytes.length - 30) break;
            }
        } catch (e) {
            console.warn('ZIP extraction failed:', e);
        }
        return files;
    }

    // === Minimal ZIP creator (for .bwep export) ===
    async function createZipFromFiles(files) {
        // Build ZIP file from array of { path, content, binary } objects
        // Returns a Blob containing the ZIP data
        
        const localParts = [];
        const centralParts = [];
        let offset = 0;
        const entries = [];
        const encoder = new TextEncoder();
        
        for (const file of files) {
            if (!file.path || file.path.endsWith('/')) continue;
            
            const nameBytes = encoder.encode(file.path);
            let contentBytes;
            
            if (file.binary) {
                // content is a binary string (from atob()), convert to Uint8Array
                const binaryStr = file.content || '';
                contentBytes = new Uint8Array(binaryStr.length);
                for (let j = 0; j < binaryStr.length; j++) {
                    contentBytes[j] = binaryStr.charCodeAt(j);
                }
            } else {
                // content is a text string, encode as UTF-8
                contentBytes = encoder.encode(file.content || '');
            }
            
            const crc32 = calcCRC32(contentBytes);
            const size = contentBytes.length;
            const dosDateTime = getDosDateTime(new Date());
            
            // Local file header: 30 bytes + filename
            const header = new Uint8Array(30 + nameBytes.length);
            const view = new DataView(header.buffer);
            
            // Local file header signature
            view.setUint32(0, 0x04034b50, true);
            // Version needed (2.0)
            view.setUint16(4, 20, true);
            // General purpose bit flag
            view.setUint16(6, 0, true);
            // Compression method (stored = 0)
            view.setUint16(8, 0, true);
            // File last modification time
            view.setUint16(10, dosDateTime.time, true);
            // File last modification date
            view.setUint16(12, dosDateTime.date, true);
            // CRC-32
            view.setUint32(14, crc32, true);
            // Compressed size
            view.setUint32(18, size, true);
            // Uncompressed size
            view.setUint32(22, size, true);
            // File name length
            view.setUint16(26, nameBytes.length, true);
            // Extra field length
            view.setUint16(28, 0, true);
            // File name
            header.set(nameBytes, 30);
            
            localParts.push(header);
            localParts.push(contentBytes);
            
            // Central directory file header: 46 bytes + filename
            const centralHeader = new Uint8Array(46 + nameBytes.length);
            const centralView = new DataView(centralHeader.buffer);
            
            // Central file header signature
            centralView.setUint32(0, 0x02014b50, true);
            // Version made by (2.0)
            centralView.setUint16(4, 20, true);
            // Version needed
            centralView.setUint16(6, 20, true);
            // Flags
            centralView.setUint16(8, 0, true);
            // Method
            centralView.setUint16(10, 0, true);
            // Last mod time
            centralView.setUint16(12, dosDateTime.time, true);
            // Last mod date
            centralView.setUint16(14, dosDateTime.date, true);
            // CRC-32
            centralView.setUint32(16, crc32, true);
            // Compressed size
            centralView.setUint32(20, size, true);
            // Uncompressed size
            centralView.setUint32(24, size, true);
            // File name length
            centralView.setUint16(28, nameBytes.length, true);
            // Extra field length
            centralView.setUint16(30, 0, true);
            // File comment length
            centralView.setUint16(32, 0, true);
            // Disk number start
            centralView.setUint16(34, 0, true);
            // Internal file attributes
            centralView.setUint32(36, 0, true);
            // External file attributes
            centralView.setUint32(40, 0, true);
            // Relative offset of local header
            centralView.setUint32(44, offset, true);
            // File name
            centralHeader.set(nameBytes, 46);
            
            centralParts.push(centralHeader);
            
            entries.push({ size: centralHeader.length });
            offset += header.length + contentBytes.length;
        }
        
        // End of central directory record
        const centralSize = centralParts.reduce((sum, p) => sum + p.length, 0);
        const endRecord = new Uint8Array(22);
        const endView = new DataView(endRecord.buffer);
        
        // End of central directory signature
        endView.setUint32(0, 0x06054b50, true);
        // Number of this disk
        endView.setUint16(4, 0, true);
        // Number of disks with central directory
        endView.setUint16(6, 0, true);
        // Total entries on this disk
        endView.setUint16(8, entries.length, true);
        // Total entries overall
        endView.setUint16(10, entries.length, true);
        // Size of central directory
        endView.setUint32(12, centralSize, true);
        // Offset of central directory
        endView.setUint32(16, offset, true);
        // Comment length
        endView.setUint16(20, 0, true);
        
        // Combine all parts
        const allParts = [...localParts, ...centralParts, endRecord];
        const totalLength = allParts.reduce((sum, p) => sum + p.length, 0);
        const result = new Uint8Array(totalLength);
        let pos = 0;
        for (const part of allParts) {
            result.set(part, pos);
            pos += part.length;
        }
        
        return new Blob([result], { type: 'application/zip' });
    }
    
    // Helper: CRC-32 calculation (IEEE 802.3 polynomial)
    function calcCRC32(data) {
        let crc = 0xFFFFFFFF;
        for (let i = 0; i < data.length; i++) {
            crc ^= data[i];
            for (let j = 0; j < 8; j++) {
                crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
            }
        }
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }
    
    // Helper: DOS date/time encoding
    function getDosDateTime(date) {
        const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
        const dateVal = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
        return { time, date: dateVal };
    }

    // === Read resource text (with fallback paths) ===
    async function readResourceText(relPath) {
        const bases = ['', './', 'renderer/', '../renderer/', '/', './'];
        for (const base of bases) {
            try {
                const resp = await fetch(base + relPath);
                if (resp.ok) {
                    const text = await resp.text();
                    if (text) return text;
                }
            } catch (e) {}
        }
        return null;
    }

    const weAPI = {
        _isMobile: null,
        _backHandler: null,
        _splashOverlay: null,
        _detectMobile: function() {
            if (this._isMobile !== null) return this._isMobile;
            // Electron 桌面端：只通过真实 Capacitor Native Bridge 判断
            // （必须有 Plugins 注册，空对象不算）
            if (isElectron) {
                const realCapacitor = !!(
                    isCapacitor &&
                    window.Capacitor &&
                    window.Capacitor.Plugins &&
                    Object.keys(window.Capacitor.Plugins).length > 0
                );
                this._isMobile = realCapacitor;
                return this._isMobile;
            }
            const ua = navigator.userAgent || '';
            const mobileByUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
            const mobileByCapacitor = !!(
                isCapacitor &&
                window.Capacitor &&
                window.Capacitor.Plugins &&
                Object.keys(window.Capacitor.Plugins).length > 0
            );
            const mobileByWidth = window.innerWidth < 768;
            this._isMobile = mobileByUA || mobileByCapacitor || mobileByWidth;
            return this._isMobile;
        },

        supportsFeature: (feature) => {
            const mobile = weAPI._detectMobile();
            const mobileUnsupported = [
                'window-control', 'minimize', 'maximize', 'always-on-top',
                'background-material', 'transparency', 'mica', 'acrylic',
                'command-palette', 'keyboard-shortcuts',
                'drag-drop', 'auto-update', 'system-tray', 'multiple-windows'
            ];
            if (mobile && mobileUnsupported.includes(feature)) return false;
            if (feature === 'file-system-picker') return mobile;
            return true;
        },

        minimize: () => {},
        maximize: () => {},
        unmaximize: () => {},
        close: () => { window.close(); },
        onMaximizedChanged: (cb) => { cb(false); },
        isMaximized: () => Promise.resolve(false),
        restoreForDrag: () => Promise.resolve({ grabX: 0, grabY: 0 }),
        moveWindowTo: () => {},
        aeroSnap: () => Promise.resolve(),
        setAlwaysOnTop: () => {},
        isAlwaysOnTop: () => Promise.resolve(false),
        toggleDevTools: () => {},
        setBackgroundMaterial: () => {},

        getSafeArea: () => {
            const style = getComputedStyle(document.documentElement);
            return {
                top: parseFloat(style.getPropertyValue('--safe-top')) || 0,
                bottom: parseFloat(style.getPropertyValue('--safe-bottom')) || 0,
                left: parseFloat(style.getPropertyValue('--safe-left')) || 0,
                right: parseFloat(style.getPropertyValue('--safe-right')) || 0,
                viewportWidth: window.innerWidth,
                viewportHeight: window.innerHeight
            };
        },

        // === Status Bar (enhanced for OPPO/ColorOS) ===
        setStatusBarColor: async (color) => {
            if (StatusBar && StatusBar.setBackgroundColor) {
                try {
                    await StatusBar.setBackgroundColor({ color: color || '#1a1a2e' });
                } catch (e) {}
            }
            if (StatusBar && StatusBar.setStyle) {
                try {
                    const hex = (color || '#1a1a2e').toLowerCase();
                    const r = parseInt(hex.slice(1, 3), 16);
                    const g = parseInt(hex.slice(3, 5), 16);
                    const b = parseInt(hex.slice(5, 7), 16);
                    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
                    await StatusBar.setStyle({ style: brightness > 128 ? 'DARK' : 'LIGHT' });
                } catch (e) {}
            }
            try {
                let meta = document.querySelector('meta[name="theme-color"]');
                if (!meta) {
                    meta = document.createElement('meta');
                    meta.name = 'theme-color';
                    document.head.appendChild(meta);
                }
                meta.content = color || '#1a1a2e';
            } catch (e) {}
            try {
                if (isCapacitor && window.Capacitor && window.Capacitor.Plugins) {
                    const plugin = window.Capacitor.Plugins.StatusBar;
                    if (plugin && plugin.setOverlaysWebView) {
                        await plugin.setOverlaysWebView({ overlay: true });
                    }
                }
            } catch (e) {}
        },

        setStatusBarStyle: async (style) => {
            if (StatusBar && StatusBar.setStyle) {
                try {
                    await StatusBar.setStyle({ style: style || 'DARK' });
                } catch (e) {}
            }
        },

        getStatusBarInfo: async () => {
            if (StatusBar && StatusBar.getInfo) {
                try {
                    return await StatusBar.getInfo();
                } catch (e) {}
            }
            return { height: 24, overlaysWebView: false };
        },

        // === Back Button Handling ===
        registerBackButtonHandler: (handler) => {
            weAPI._backHandler = handler;

            // Expose synchronous entry point for the native (MainActivity.java)
            // OnBackPressedCallback.evaluateJavascript("window.WeNativeBack.handle()")
            window.WeNativeBack = {
                handle: function() {
                    try {
                        if (weAPI._backHandler) {
                            const handled = weAPI._backHandler();
                            return !!handled;
                        }
                    } catch (e) {
                        console.warn('WeNativeBack.handle error:', e);
                    }
                    return false; // not handled → native will finish activity
                }
            };

            // Path 1: @capacitor/app plugin (if installed). Its internal
            // OnBackPressedCallback will fire this JS event. We still route it
            // through the same _backHandler so behavior is identical.
            if (isCapacitor && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
                try {
                    window.Capacitor.Plugins.App.addListener('backButton', () => {
                        if (weAPI._backHandler) {
                            const handled = weAPI._backHandler();
                            if (handled) return;
                        }
                        // Let the native fallback (or Capacitor) finish the activity.
                        // Because our native callback runs first and consumes the event,
                        // we call evaluateJavascript above only to decide; here we
                        // simply do nothing — the native side will decide based on
                        // window.WeNativeBack.handle() state.
                    });
                } catch (e) {}
            }

            // Path 2: Browser popstate fallback (for desktop / non-Capacitor preview)
            window.addEventListener('popstate', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (weAPI._backHandler) {
                    const handled = weAPI._backHandler();
                    if (handled) return;
                }
                // Not handled — attempt close
                try { window.close(); } catch (_) {}
            });
            try {
                window.history.pushState({ page: 'app' }, '');
            } catch (_) {}
        },

        exitApp: async () => {
            if (isCapacitor && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
                try {
                    window.Capacitor.Plugins.App.exitApp();
                    return;
                } catch (e) {}
            }
            if (await showConfirm('退出应用？')) {
                window.close();
            }
        },

        // === Splash Overlay (custom splash with Load_image.png) ===
        showSplashOverlay: () => {
            if (weAPI._splashOverlay) return;
            const overlay = document.createElement('div');
            overlay.id = 'we-splash-overlay';
            overlay.innerHTML = `
                <div class="we-splash-content">
                    <img src="resources/Load_image.png" alt="World Editor" />
                </div>
            `;
            const style = document.createElement('style');
            style.textContent = `
                #we-splash-overlay {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    width: 100vw; height: 100vh;
                    background: #1a1a2e;
                    z-index: 99999;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    overflow: hidden;
                    transition: opacity 0.4s ease;
                }
                #we-splash-overlay .we-splash-content {
                    width: 100%;
                    height: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                #we-splash-overlay img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    object-position: center;
                }
                #we-splash-overlay.fade-out {
                    opacity: 0;
                    pointer-events: none;
                }
            `;
            document.head.appendChild(style);
            document.body.appendChild(overlay);
            weAPI._splashOverlay = overlay;
        },

        hideSplashOverlay: () => {
            if (!weAPI._splashOverlay) return;
            const overlay = weAPI._splashOverlay;
            overlay.classList.add('fade-out');
            setTimeout(() => {
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                weAPI._splashOverlay = null;
            }, 450);
        },

        // === Immersive System Bars ===
        setImmersiveMode: async (enabled) => {
            if (StatusBar && StatusBar.setOverlaysWebView) {
                try {
                    await StatusBar.setOverlaysWebView({ overlay: !!enabled });
                } catch (e) {}
            }
            try {
                if (isCapacitor && window.Capacitor && window.Capacitor.Plugins) {
                    const plugin = window.Capacitor.Plugins.StatusBar;
                    if (plugin) {
                        if (enabled) {
                            await plugin.setStyle({ style: 'LIGHT' });
                        }
                    }
                }
            } catch (e) {}
        },

        getSystemTheme: () => {
            return Promise.resolve(
                window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
                    ? 'dark' : 'light'
            );
        },

        _themeListeners: [],
        onSystemThemeChanged: (callback) => {
            if (!callback) return;
            if (!weAPI._systemThemeMedia) {
                weAPI._systemThemeMedia = window.matchMedia('(prefers-color-scheme: dark)');
                weAPI._systemThemeMedia.addEventListener('change', (e) => {
                    const isDark = e.matches;
                    weAPI._themeListeners.forEach(cb => {
                        try { cb(isDark ? 'dark' : 'light'); } catch (err) { console.error('theme listener error:', err); }
                    });
                });
            }
            weAPI._themeListeners.push(callback);
        },

        isMobileMode: () => Promise.resolve(weAPI._detectMobile()),
        enterMobileMode: () => {
            document.body.classList.add('is-mobile');
            document.body.classList.remove('is-desktop');
        },

        // === Version & Update ===
        getVersion: () => Promise.resolve('0.9.0-beta'),

        checkUpdate: async () => {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 8000);
                const resp = await fetch('https://api.github.com/repos/huoxi/World-Editor/releases/latest', {
                    method: 'GET',
                    headers: { 'Accept': 'application/vnd.github.v3+json' },
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                if (!resp.ok) throw new Error('Network error');
                const data = await resp.json();
                return {
                    available: true,
                    latestVersion: data.tag_name?.replace(/^v/, '') || '0.0.0',
                    downloadUrl: data.html_url || '',
                    releaseNotes: data.body || ''
                };
            } catch (e) {
                const currentVersion = '0.9.0-beta';
                try {
                    const notes = await weAPI.getUpdateNotes();
                    if (notes && notes.notes && notes.notes.length > 0) {
                        return { available: false, error: e.message, offline: true, latestVersion: currentVersion, releaseNotes: notes.notes };
                    }
                } catch (_) {}
                return { available: false, error: e.message };
            }
        },

        getUpdateNotes: async (lang) => {
            try {
                const langPrefix = (lang === 'zh_CN' || lang === 'zh-TW') ? 'cn' : (lang === 'ja' ? 'ja' : (lang === 'ru' ? 'ru' : 'en'));
                const notes = [];
                const versions = ['0.9.0', '0.8.0', '0.7.0', '0.6.0', '0.5.0', '0.4.2', '0.4.0', '0.3.0', '0.2.0', '0.1.0'];
                for (const ver of versions) {
                    const verNum = ver.split('.').map(Number).join('.');
                    const tryFiles = [
                        `resources/UPDATE_INF/${ver}/${langPrefix}.${ver}.md`,
                        `resources/UPDATE_INF/${ver}/en.${ver}.md`,
                        `resources/UPDATE_INF/${ver}/cn.${ver}.md`
                    ];
                    let found = false;
                    for (const file of tryFiles) {
                        try {
                            const text = await readResourceText(file);
                            if (text && text.trim()) {
                                notes.push({ version: verNum, content: text });
                                found = true;
                                break;
                            }
                        } catch (e) {}
                    }
                    if (!found) continue;
                }
                return { success: true, notes };
            } catch (e) {
                return { success: true, notes: [] };
            }
        },

        getUpdateNotesText: () => Promise.resolve(''),

        openExternalLink: (url) => {
            if (isCapacitor && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser) {
                window.Capacitor.Plugins.Browser.open({ url });
            } else {
                window.open(url, '_blank');
            }
        },

        onSplashStatus: () => {},

        // === System File Picker ===
        selectFolder: () => {
            return new Promise((resolve) => {
                const input = document.createElement('input');
                input.type = 'file';
                if (isAndroid) {
                    input.setAttribute('webkitdirectory', '');
                    input.setAttribute('directory', '');
                } else {
                    input.webkitdirectory = true;
                }
                input.multiple = true;
                input.style.display = 'none';
                document.body.appendChild(input);

                let resolved = false;
                const cleanup = () => {
                    if (input.parentNode) input.parentNode.removeChild(input);
                };

                input.onchange = () => {
                    if (resolved) return;
                    resolved = true;
                    const files = Array.from(input.files || []);
                    cleanup();
                    if (files.length === 0) {
                        resolve({ success: false, path: null, files: [] });
                        return;
                    }
                    resolve({
                        success: true,
                        path: '/selected-folder',
                        files: files.map(f => ({
                            name: f.name,
                            path: f.webkitRelativePath || f.name,
                            size: f.size,
                            file: f
                        }))
                    });
                };

                input.onerror = () => {
                    if (resolved) return;
                    resolved = true;
                    cleanup();
                    resolve({ success: false, path: null });
                };

                setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        cleanup();
                        resolve({ success: false, path: null, timeout: true });
                    }
                }, 30000);

                input.click();
            });
        },

        selectFile: (accept) => {
            return new Promise((resolve) => {
                const input = document.createElement('input');
                input.type = 'file';
                if (accept) input.accept = accept;
                input.style.display = 'none';
                document.body.appendChild(input);

                input.onchange = () => {
                    const file = input.files && input.files[0];
                    document.body.removeChild(input);
                    if (!file) {
                        resolve({ success: false });
                        return;
                    }
                    resolve({ success: true, file });
                };

                input.onerror = () => {
                    document.body.removeChild(input);
                    resolve({ success: false });
                };

                input.click();
            });
        },

        // === File System ===
        readFile: async (folder, filename) => {
            const path = `${folder}/${filename}`;
            weLog.debug('capacitor-weapi', 'readFile', { folder, filename, path });
            
            // 对于 __bin_ 文件和二进制文件类型，直接走 localStorage，跳过 Filesystem API（可能触发 Electron .exe 错误）
            const isBinaryFile = filename.startsWith('__bin_') || 
                /\.(exe|dll|so|dylib|jar|war|class|apk|ipa|iso|img|bin|dat|com|sys|o|obj|msi)$/i.test(filename);
            
            if (!isBinaryFile && Filesystem && Filesystem.readFile) {
                try {
                    const result = await Filesystem.readFile({ path, directory: 'DOCUMENTS' });
                    weLog.debug('capacitor-weapi', 'readFile: Filesystem success', { path });
                    return { success: true, content: result.data };
                } catch (e) {
                    weLog.debug('capacitor-weapi', 'readFile: Filesystem failed, trying localStorage', { path, error: e.message });
                    // Filesystem 失败，继续尝试 localStorage
                }
            }
            
            // localStorage 后备
            try {
                const key = FS_PREFIX + path;
                const raw = localStorage.getItem(key);
                if (raw === null) {
                    weLog.debug('capacitor-weapi', 'readFile: file not found in localStorage', { path });
                    return { success: false, content: '' };
                }
                // 使用 UTF-8 兼容解码（与 fsWrite 的 encodeURIComponent 编码对应）
                try {
                    const decoded = decodeURIComponent(escape(atob(raw)));
                    weLog.debug('capacitor-weapi', 'readFile: localStorage UTF-8 decoded', { path });
                    return { success: true, content: decoded };
                } catch (e) {
                    // 直接存储的文本
                    weLog.debug('capacitor-weapi', 'readFile: localStorage plain text', { path });
                    return { success: true, content: raw };
                }
            } catch (e) {
                weLog.error('capacitor-weapi', 'readFile: localStorage error', { path, error: e.message });
                return { success: false, content: '' };
            }
        },

        listFiles: async (folder) => {
            const normalizedFolder = normalizePath(folder);
            const cacheKey = normalizedFolder;
            const now = Date.now();
            
            // 缓存命中检查
            if (fileListCacheKey === cacheKey && fileListCache && (now - fileListCacheTime) < CACHE_TTL) {
                return { success: true, files: fileListCache };
            }
            
            // 先尝试 localStorage（主要存储方式）
            const prefix = FS_PREFIX + normalizedFolder + '/';
            const originalPrefix = FS_PREFIX + folder + '/';
            const localFiles = [];
            const localDirs = new Set();
            let allLocalFiles = [];  // 修复：声明变量（之前遗漏导致 ReferenceError）
            
            // 快速路径：如果已经迁移过，直接使用规范化前缀
            const migrationDone = localStorage.getItem(MIGRATION_FLAG);
            const needMigration = !migrationDone && originalPrefix !== prefix;
            
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (!key) continue;
                
                // 快速匹配：检查规范化前缀
                if (key.startsWith(prefix)) {
                    const name = key.substring(prefix.length);
                    const fileName = name.split('/').pop();
                    if ((fileName.startsWith('_') && !fileName.startsWith('__img_') && !fileName.startsWith('__bin_') && !fileName.startsWith('__media_')) || fileName.startsWith('.')) continue;
                    const parts = name.split('/');
                    if (parts.length > 1) {
                        if (parts.slice(0, -1).join('/')) {
                            localDirs.add(parts.slice(0, -1).join('/'));
                        }
                    } else {
                        localFiles.push(name);
                    }
                    continue;
                }
                
                // 回退：检查原始路径前缀（仅在需要迁移时）
                if (needMigration && key.startsWith(originalPrefix)) {
                    const name = key.substring(originalPrefix.length);
                    const fileName = name.split('/').pop();
                    if ((fileName.startsWith('_') && !fileName.startsWith('__img_') && !fileName.startsWith('__bin_') && !fileName.startsWith('__media_')) || fileName.startsWith('.')) continue;
                    const parts = name.split('/');
                    if (parts.length > 1) {
                        if (parts.slice(0, -1).join('/')) {
                            localDirs.add(parts.slice(0, -1).join('/'));
                        }
                    } else {
                        localFiles.push(name);
                    }
                }
            }
            
            // 只在首次运行时执行迁移（一次性操作）
            if (needMigration && localFiles.length > 0) {
                weLog.info('capacitor-weapi', 'listFiles: 执行一次性路径迁移', { count: localFiles.length });
                // 迁移已发现的键到新格式
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith(originalPrefix)) {
                        const value = localStorage.getItem(key);
                        const relativePath = key.substring(originalPrefix.length);
                        const newKey = prefix + relativePath;
                        if (value !== null && newKey !== key) {
                            localStorage.setItem(newKey, value);
                        }
                    }
                }
                // 标记迁移完成
                localStorage.setItem(MIGRATION_FLAG, '1');
                weLog.info('capacitor-weapi', 'listFiles: 路径迁移完成');
            }
            
            // 收集子目录中的文件（只在首次遍历未找到时才遍历子目录）
            // 先把根目录文件加入结果
            allLocalFiles = [...localFiles];
            if (localDirs.size > 0) {
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (!key || !key.startsWith(prefix)) continue;
                    
                    const subName = key.substring(prefix.length);
                    // 只检查子目录中的文件
                    if (subName.includes('/')) {
                        const subFileName = subName.split('/').pop();
                        if ((subFileName.startsWith('_') && !subFileName.startsWith('__img_') && !subFileName.startsWith('__bin_') && !subFileName.startsWith('__media_')) || subFileName.startsWith('.')) continue;
                        allLocalFiles.push(subName);
                    }
                }
            }
            
            if (allLocalFiles.length > 0) {
                // 保存缓存
                fileListCache = allLocalFiles;
                fileListCacheKey = cacheKey;
                fileListCacheTime = now;
                return { success: true, files: allLocalFiles };
            }
            
            // localStorage 为空，尝试 Filesystem API
            if (Filesystem && Filesystem.readdir) {
                try {
                    const result = await Filesystem.readdir({ path: folder, directory: 'DOCUMENTS' });
                    const fileList = [];
                    const dirs = [];
                    (result.files || []).forEach(f => {
                        if (f.type === 'directory') {
                            dirs.push(f.name);
                        } else {
                            fileList.push(f.name);
                        }
                    });
                    // 递归读取子目录
                    for (const dir of dirs) {
                        try {
                            const sub = await Filesystem.readdir({ path: `${folder}/${dir}`, directory: 'DOCUMENTS' });
                            (sub.files || []).forEach(sf => {
                                if (sf.type !== 'directory') {
                                    fileList.push(`${dir}/${sf.name}`);
                                }
                            });
                        } catch (e) {}
                    }
                    weLog.debug('capacitor-weapi', 'listFiles: Filesystem found', { count: fileList.length });
                    return { success: true, files: fileList };
                } catch (e) {
                    weLog.debug('capacitor-weapi', 'listFiles: Filesystem failed', { error: e.message });
                }
            }
            
            weLog.debug('capacitor-weapi', 'listFiles: no files found', { folder });
            return { success: true, files: [] };
        },

        saveFile: async (folder, filename, content) => {
            const path = `${folder}/${filename}`;
            const result = await fsWrite(path, content);
            if (result.success) {
                const meta = await loadProjectMeta(folder);
                meta[filename] = { modified: Date.now(), size: content ? content.length : 0 };
                await saveProjectMeta(folder, meta);
                invalidateCache(); // 使缓存失效
            }
            return result;
        },
        
        // 保存媒体文件（ArrayBuffer 直接存储到 IndexedDB）
        saveMediaFile: async (folder, filename, arrayBuffer, mimeType) => {
            const path = `${folder}/${filename}`;
            const normalizedPath = normalizePath(path);
            const storageKey = FS_PREFIX + normalizedPath;
            const size = arrayBuffer ? arrayBuffer.byteLength : 0;
            
            weLog.info('saveMediaFile', '开始保存媒体文件', { path: normalizedPath, size, mimeType });
            
            try {
                // 直接存储 ArrayBuffer 到 IndexedDB（大文件更高效）
                await iddbPut(storageKey, {
                    __type: 'media',
                    mime: mimeType,
                    data: arrayBuffer,
                    size: size
                });
                // 在 localStorage 存标记
                localStorage.setItem(storageKey, '__media__');
                
                const meta = await loadProjectMeta(folder);
                meta[filename] = { 
                    modified: Date.now(), 
                    size: size,
                    mime: mimeType,
                    type: 'media'
                };
                await saveProjectMeta(folder, meta);
                invalidateCache(); // 使缓存失效
                
                weLog.info('saveMediaFile', '媒体文件保存成功', { path: normalizedPath, size });
                return { success: true, storage: 'indexeddb' };
            } catch (e) {
                weLog.error('saveMediaFile', '媒体文件保存失败', { path: normalizedPath, error: e.message });
                return { success: false, error: e.message };
            }
        },
        
        // 读取媒体文件（返回 ArrayBuffer）
        readMediaFile: async (folder, filename) => {
            const path = `${folder}/${filename}`;
            const normalizedPath = normalizePath(path);
            const storageKey = FS_PREFIX + normalizedPath;
            
            try {
                const stored = await iddbGet(storageKey);
                if (stored && stored.__type === 'media') {
                    return { 
                        success: true, 
                        data: stored.data, 
                        mimeType: stored.mime,
                        size: stored.size 
                    };
                }
                return { success: false, error: '未找到媒体文件' };
            } catch (e) {
                return { success: false, error: e.message };
            }
        },

        addFile: (folder, filename) => {
            return weAPI.saveFile(folder, filename, '');
        },

        addFolder: async (folder, folderPath) => {
            return fsMkdir(folderPath);
        },

        renameFile: async (folder, oldPath, newPath) => {
            const oldFullPath = `${folder}/${oldPath}`;
            const newFullPath = `${folder}/${newPath}`;
            const readResult = await fsRead(oldFullPath);
            if (!readResult.success) return { success: false };
            const writeResult = await fsWrite(newFullPath, readResult.content);
            if (writeResult.success) {
                await fsDelete(oldFullPath);
                const meta = await loadProjectMeta(folder);
                if (meta[oldPath]) {
                    meta[newPath] = meta[oldPath];
                    delete meta[oldPath];
                    await saveProjectMeta(folder, meta);
                }
            }
            return writeResult;
        },

        renameFolder: async (folder, oldPath, newPath) => {
            const meta = await loadProjectMeta(oldPath);
            if (!meta || Object.keys(meta).length === 0) return { success: false };
            await saveProjectMeta(newPath, meta);
            await prefsRemove(projectMetaKey(oldPath));
            return { success: true };
        },

        deleteFile: async (folder, filePath) => {
            const path = `${folder}/${filePath}`;
            const result = await fsDelete(path);
            if (result.success) {
                const meta = await loadProjectMeta(folder);
                if (meta[filePath]) {
                    delete meta[filePath];
                    await saveProjectMeta(folder, meta);
                }
                invalidateCache(); // 使缓存失效
            }
            return result;
        },

        deleteFolder: async (folder, folderPath) => {
            return fsRmdir(folderPath);
        },

        // === WEP Archive Support ===
        // 从 .wep/.bwep 文件导入项目（解压到 localStorage）
        importWepFile: async (folder, wepFilePath) => {
            weLog.info('capacitor-weapi', '→ importWepFile', { folder, wepFilePath });
            try {
                // 读取 .wep 文件内容
                let fileBuffer;
                if (wepFilePath.startsWith('data:')) {
                    // Data URL
                    const base64 = wepFilePath.split(',')[1];
                    fileBuffer = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
                } else if (Filesystem && Filesystem.readFile) {
                    const result = await Filesystem.readFile({
                        path: wepFilePath,
                        directory: 'DOCUMENTS'
                    });
                    if (result.data) {
                        if (typeof result.data === 'string') {
                            // Base64 string
                            const binary = atob(result.data);
                            fileBuffer = new Uint8Array(binary.length);
                            for (let i = 0; i < binary.length; i++) {
                                fileBuffer[i] = binary.charCodeAt(i);
                            }
                        } else {
                            fileBuffer = new Uint8Array(result.data);
                        }
                    }
                }

                if (!fileBuffer || fileBuffer.length === 0) {
                    return { success: false, error: '无法读取 .wep 文件' };
                }

                // 解压
                const extracted = await extractZip(fileBuffer);
                weLog.info('capacitor-weapi', 'importWepFile: 解压完成', { fileCount: extracted.length });

                // 存储到 localStorage
                let fileCount = 0;
                for (const f of extracted) {
                    if (f.path.endsWith('/')) continue; // 跳过目录
                    if (f.binary) {
                        // 二进制文件：extractZip 已将其编码为 base64
                        // 直接存储到 localStorage（绕过 fsWrite 的 base64 编码）
                        const binName = '__bin_' + f.path;
                        localStorage.setItem(FS_PREFIX + folder + '/' + binName, f.content || '');
                        fileCount++;
                    } else {
                        // 文本文件：通过 fsWrite 存储（会自动 base64 编码）
                        await fsWrite(`${folder}/${f.path}`, f.content || '');
                        fileCount++;
                    }
                }

                // 保存项目元数据（如果没有）
                const existingMeta = await loadProjectMeta(folder);
                if (!existingMeta.name) {
                    await saveProjectMeta(folder, {
                        name: folder.split('/').pop() || 'Imported Project',
                        projectMode: 'rich',
                        importedFrom: wepFilePath,
                        importedAt: Date.now(),
                        created: Date.now()
                    });
                }

                weLog.info('capacitor-weapi', '← importWepFile 完成', { fileCount });
                return { success: true, fileCount };
            } catch (e) {
                weLog.error('capacitor-weapi', 'importWepFile 失败', e && e.stack ? e.stack : String(e));
                return { success: false, error: e.message };
            }
        },

        // 导出项目为 .bwep 文件（从 localStorage 打包）
        exportToBwep: async (folder, outputPath) => {
            weLog.info('capacitor-weapi', '→ exportToBwep', { folder, outputPath });
            try {
                const prefix = FS_PREFIX + folder + '/';
                const files = [];

                // 收集所有文件
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith(prefix)) {
                        const name = key.substring(prefix.length);
                        const fileName = name.split('/').pop();
                        // 跳过元数据文件，但允许 __img_、__bin_、__media_ 开头的存储文件
                        if ((fileName.startsWith('_') && !fileName.startsWith('__img_') && !fileName.startsWith('__bin_') && !fileName.startsWith('__media_')) || fileName.startsWith('.')) continue;
                        // 跳过 .wep/.bwep 占位符文件（避免压缩包嵌套）
                        if (/\.wep$/i.test(fileName) || /\.bwep$/i.test(fileName)) continue;

                        const raw = localStorage.getItem(key);
                        let content = '';
                        let isBinary = false;

                        if (fileName.startsWith('__bin_') || fileName.startsWith('__img_') || fileName.startsWith('__media_')) {
                            // 存储文件（二进制、图片、媒体）：保持原始 data URL 内容
                            isBinary = true;
                            const prefixLength = fileName.startsWith('__media_') ? 8 : 6;
                            const cleanName = fileName.slice(prefixLength);
                            // 保持原始 data URL 格式，不做转换
                            content = raw || '';
                            files.push({ path: cleanName, content, binary: true });
                        } else {
                            // 文本文件
                            try {
                                const decoded = decodeURIComponent(escape(atob(raw || '')));
                                content = decoded;
                            } catch (e) {
                                content = raw || '';
                            }
                            files.push({ path: name, content, binary: false });
                        }
                    }
                }

                // 创建 ZIP 文件
                const zipBlob = await createZipFromFiles(files);

                // 保存到文件系统
                if (outputPath && Filesystem && Filesystem.writeFile) {
                    const reader = new FileReader();
                    reader.readAsArrayBuffer(zipBlob);
                    await new Promise((resolve, reject) => {
                        reader.onload = async () => {
                            try {
                                const base64 = btoa(String.fromCharCode.apply(null, new Uint8Array(reader.result)));
                                await Filesystem.writeFile({
                                    path: outputPath,
                                    data: base64,
                                    directory: 'DOCUMENTS'
                                });
                                resolve();
                            } catch (e) {
                                reject(e);
                            }
                        };
                        reader.onerror = reject;
                    });
                } else {
                    // 返回 Blob
                    return { success: true, blob: zipBlob, files };
                }

                weLog.info('capacitor-weapi', '← exportToBwep 完成', { fileCount: files.length });
                return { success: true, fileCount: files.length };
            } catch (e) {
                weLog.error('capacitor-weapi', 'exportToBwep 失败', e && e.stack ? e.stack : String(e));
                return { success: false, error: e.message };
            }
        },

        // 检查并自动导入 .wep 文件（如果项目中只有 .wep 文件）
        checkAndImportWep: async (folder) => {
            weLog.info('capacitor-weapi', '→ checkAndImportWep', { folder });
            try {
                // 检查 localStorage 中是否有有效文件（排除 .wep/.bwep 占位符）
                const prefix = FS_PREFIX + folder + '/';
                let hasLocalFiles = false;
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith(prefix)) {
                        const name = key.substring(prefix.length);
                        const fileName = name.split('/').pop();
                        // 跳过元数据文件，但允许 __img_、__bin_、__media_ 开头的存储文件
                        if ((fileName.startsWith('_') && !fileName.startsWith('__img_') && !fileName.startsWith('__bin_') && !fileName.startsWith('__media_')) || fileName.startsWith('.')) continue;
                        // 跳过 .wep/.bwep 占位符文件（这些是压缩包，不是真正的项目文件）
                        if (/\.wep$/i.test(fileName) || /\.bwep$/i.test(fileName)) continue;
                        hasLocalFiles = true;
                        break;
                    }
                }

                if (hasLocalFiles) {
                    return { success: true, imported: false };
                }

                // localStorage 为空，检查文件系统
                if (Filesystem && Filesystem.readdir) {
                    try {
                        const result = await Filesystem.readdir({ path: folder, directory: 'DOCUMENTS' });
                        const wepFile = (result.files || []).find(f =>
                            f.type !== 'directory' && /\.(wep|bwep)$/i.test(f.name)
                        );

                        if (wepFile) {
                            weLog.info('capacitor-weapi', 'checkAndImportWep: 找到 .wep 文件', { name: wepFile.name });
                            const importResult = await weAPI.importWepFile(folder, `${folder}/${wepFile.name}`);
                            return { success: true, imported: true, result: importResult };
                        }
                    } catch (e) {
                        weLog.debug('capacitor-weapi', 'checkAndImportWep: Filesystem 检查失败', { error: e.message });
                    }
                }

                return { success: true, imported: false };
            } catch (e) {
                weLog.error('capacitor-weapi', 'checkAndImportWep 失败', e && e.stack ? e.stack : String(e));
                return { success: false, error: e.message };
            }
        },

        // === Project Management ===
        getDefaultProjectPath: (name) => {
            return Promise.resolve(`/projects/${name}`);
        },

        createProject: async (folder, name, desc, template, projectMode) => {
            const projectPath = folder || `/projects/${name}`;
            await fsMkdir(projectPath);
            const meta = {
                name,
                desc: desc || '',
                template: template || '',
                projectMode: projectMode || 'document',
                created: Date.now()
            };
            await saveProjectMeta(projectPath, meta);
            await weAPI.addFile(projectPath, 'project.wep');
            return { success: true, folder: projectPath, fileList: ['project.wep'], projectMode: meta.projectMode };
        },

        openProject: async (folder) => {
            try {
                const meta = await loadProjectMeta(folder);
                const fileListResult = await weAPI.listFiles(folder);
                const fileList = fileListResult.files || [];
                const projectName = meta.name || folder.split('/').pop() || 'Untitled';
                const projectMode = meta.projectMode || 'rich';
                const owner = meta.owner || null;
                return {
                    success: true,
                    folder,
                    name: projectName,
                    fileList,
                    projectMode,
                    owner
                };
            } catch (e) {
                return { success: false, folder, error: e.message };
            }
        },

        renameProject: async (oldFolder, newName) => {
            const newPath = oldFolder.replace(/\/[^/]+$/, '/' + newName);
            const meta = await loadProjectMeta(oldFolder);
            if (meta) {
                meta.name = newName;
                await saveProjectMeta(newPath, meta);
                await prefsRemove(projectMetaKey(oldFolder));
            }
            const recentRaw = await prefsGet('we_recent_projects', '[]');
            try {
                const recent = JSON.parse(recentRaw);
                for (const p of recent) {
                    if (p.path === oldFolder) p.path = newPath;
                }
                await prefsSet('we_recent_projects', JSON.stringify(recent));
            } catch (e) {}
            return { success: true };
        },

        deleteProject: async (folder) => {
            await fsRmdir(folder);
            await prefsRemove(projectMetaKey(folder));
            const recentRaw = await prefsGet('we_recent_projects', '[]');
            try {
                const recent = JSON.parse(recentRaw);
                const filtered = recent.filter(p => p.path !== folder);
                await prefsSet('we_recent_projects', JSON.stringify(filtered));
            } catch (e) {}
            const pinnedRaw = await prefsGet('we_pinned_projects', '[]');
            try {
                const pinned = JSON.parse(pinnedRaw);
                const filtered = pinned.filter(p => p !== folder);
                await prefsSet('we_pinned_projects', JSON.stringify(filtered));
            } catch (e) {}
            return { success: true };
        },

        getRecentProjects: async () => {
            try {
                const recentRaw = await prefsGet('we_recent_projects', '[]');
                const recent = JSON.parse(recentRaw || '[]');
                const pinnedRaw = await prefsGet('we_pinned_projects', '[]');
                const pinnedPaths = JSON.parse(pinnedRaw || '[]');

                const pinnedProjects = [];
                for (const p of pinnedPaths) {
                    try {
                        const meta = await loadProjectMeta(p);
                        const existing = recent.find(r => r.path === p);
                        pinnedProjects.push({
                            path: p,
                            name: meta.name || (existing && existing.name) || p.split('/').pop(),
                            modified: existing ? existing.modified : (meta.created || Date.now())
                        });
                    } catch (e) {
                        pinnedProjects.push({ path: p, name: p.split('/').pop(), modified: Date.now() });
                    }
                }

                return { success: true, projects: recent, recent, pinned: pinnedProjects };
            } catch (e) {
                return { success: true, projects: [], recent: [], pinned: [] };
            }
        },

        addProjectFolder: async (folder) => {
            try {
                const name = folder.split('/').pop() || folder;
                await saveProjectMeta(folder, {
                    name,
                    created: Date.now(),
                    projectMode: 'rich'
                });

                const recentRaw = await prefsGet('we_recent_projects', '[]');
                const recent = JSON.parse(recentRaw || '[]');
                const existing = recent.find(r => r.path === folder);
                if (!existing) {
                    recent.unshift({ path: folder, name, modified: Date.now() });
                    await prefsSet('we_recent_projects', JSON.stringify(recent));
                }
                return { success: true };
            } catch (e) {
                return { success: false, error: e.message };
            }
        },

        togglePinProject: async (folder) => {
            try {
                const raw = await prefsGet('we_pinned_projects', '[]');
                const pinned = JSON.parse(raw || '[]');
                const idx = pinned.indexOf(folder);
                if (idx >= 0) pinned.splice(idx, 1);
                else pinned.push(folder);
                await prefsSet('we_pinned_projects', JSON.stringify(pinned));

                const recentRaw = await prefsGet('we_recent_projects', '[]');
                try {
                    const recent = JSON.parse(recentRaw || '[]');
                    const existing = recent.find(r => r.path === folder);
                    const meta = await loadProjectMeta(folder);
                    const name = meta.name || (existing && existing.name) || folder.split('/').pop();
                    if (idx < 0) {
                        recent.unshift({ path: folder, name, modified: Date.now() });
                        await prefsSet('we_recent_projects', JSON.stringify(recent));
                    }
                } catch (e) {}

                return { success: true, pinned: idx < 0 };
            } catch (e) {
                return { success: false };
            }
        },

        isProjectPinned: async (folder) => {
            try {
                const raw = await prefsGet('we_pinned_projects', '[]');
                const pinned = JSON.parse(raw || '[]');
                return pinned.includes(folder);
            } catch (e) { return false; }
        },

        readMetadata: async (folder) => {
            const meta = await loadProjectMeta(folder);
            return { success: true, metadata: meta };
        },

        saveMetadata: async (folder, metadata) => {
            await saveProjectMeta(folder, metadata);
            return { success: true };
        },

        getProjectStats: async (folder) => {
            const meta = await loadProjectMeta(folder);
            const fileCount = Object.keys(meta).filter(k => !k.startsWith('_')).length;
            return { success: true, fileCount, lastModified: Date.now() };
        },

        setProjectMode: async (folder, newMode) => {
            const meta = await loadProjectMeta(folder);
            meta.projectMode = newMode;
            await saveProjectMeta(folder, meta);
            return { success: true };
        },

        storeImage: async (folder, imageName, imageData, mimeType) => {
            const path = `${folder}/__img_${imageName}`;
            // 如果有 mimeType，构造完整的 data URL
            // imageData 可能是 raw base64 或完整 data URL
            let content = imageData;
            if (mimeType && !imageData.startsWith('data:')) {
                content = `data:${mimeType};base64,${imageData}`;
            }
            return fsWrite(path, content);
        },

        deleteImage: async (folder, imageName) => {
            const path = `${folder}/__img_${imageName}`;
            return fsDelete(path);
        },

        getBackgroundImage: (name) => Promise.resolve(null),
        clearBackgroundImage: () => Promise.resolve({ success: true }),
        selectBackgroundImage: () => weAPI.selectFile('image/*'),

        // === Account (fixed return format, dual persistence) ===
        getAccount: async () => {
            try {
                const raw = await prefsGet('we_account', null);
                if (raw && raw !== 'null') {
                    const account = JSON.parse(raw);
                    return { success: true, account };
                }
                try {
                    const localRaw = localStorage.getItem('we_account');
                    if (localRaw && localRaw !== 'null') {
                        const account = JSON.parse(localRaw);
                        if (account) {
                            try { await prefsSet('we_account', localRaw); } catch(e) {}
                            return { success: true, account };
                        }
                    }
                } catch(e) {}
                return { success: true, account: null };
            } catch (e) {
                return { success: true, account: null };
            }
        },

        saveAccount: async (account) => {
            try {
                const json = JSON.stringify(account);
                try { await prefsSet('we_account', json); } catch (e) {}
                try { localStorage.setItem('we_account', json); } catch (e) {}
                return { success: true };
            } catch (e) {
                return { success: false };
            }
        },

        deleteAccount: async () => {
            await prefsRemove('we_account');
            try { localStorage.removeItem('we_account'); } catch (e) {}
            return { success: true };
        },

        deleteUserConfig: async () => {
            await prefsRemove('we_settings');
            await prefsRemove('we_account');
            try { localStorage.removeItem('we_settings'); } catch (e) {}
            try { localStorage.removeItem('we_account'); } catch (e) {}
            return { success: true };
        },

        getAccountAvatar: (account) => Promise.resolve(null),

        getSettings: async () => {
            try {
                let raw = await prefsGet('we_settings', null);
                if (!raw || raw === 'null') {
                    try {
                        const localRaw = localStorage.getItem('we_settings');
                        if (localRaw) {
                            raw = localRaw;
                            try { await prefsSet('we_settings', localRaw); } catch(e) {}
                        }
                    } catch(e) {}
                }
                return JSON.parse(raw || '{}');
            } catch (e) { return {}; }
        },

        setSettings: async (settings) => {
            try {
                const json = JSON.stringify(settings);
                try { await prefsSet('we_settings', json); } catch (e) {}
                try { localStorage.setItem('we_settings', json); } catch (e) {}
                return { success: true };
            } catch (e) {
                return { success: false };
            }
        },

        loadLang: (lang) => {
            return new Promise((resolve) => {
                const tryPaths = [
                    `lang/${lang}.lib`,
                    `./lang/${lang}.lib`,
                    `resources/lang/${lang}.lib`,
                    `User/lang/${lang}.lib`
                ];
                let tryIndex = 0;
                const tryNext = () => {
                    if (tryIndex >= tryPaths.length) {
                        resolve({});
                        return;
                    }
                    const path = tryPaths[tryIndex++];
                    fetch(path)
                        .then(r => {
                            if (r.ok) return r.text();
                            throw new Error('Not found: ' + path);
                        })
                        .then(text => {
                            const result = {};
                            const lines = text.split(/\r?\n/);
                            for (let line of lines) {
                                line = line.trim();
                                if (!line || line.startsWith('#')) continue;
                                const idx = line.indexOf('=');
                                if (idx === -1) continue;
                                const key = line.substring(0, idx).trim();
                                const value = line.substring(idx + 1).trim();
                                if (key.startsWith('ui.')) {
                                    result[key] = value;
                                }
                            }
                            resolve(result);
                        })
                        .catch(() => tryNext());
                };
                tryNext();
            });
        },

        exportPdf: (html, filename) => {
            const blob = new Blob([html], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename || 'export.pdf';
            a.click();
            URL.revokeObjectURL(url);
            return Promise.resolve({ success: true });
        },

        exportHtml: (html, filename) => {
            const blob = new Blob([html], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename || 'export.html';
            a.click();
            URL.revokeObjectURL(url);
            return Promise.resolve({ success: true });
        },

        exportZip: (folder, filename) => Promise.resolve({ success: true }),
        exportArchive: (content, filename) => {
            const blob = new Blob([content], { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename || 'archive.zip';
            a.click();
            URL.revokeObjectURL(url);
            return Promise.resolve({ success: true });
        },

        saveFileFromPath: async (folder, filePath) => ({ success: true }),
        
        // === 性能测试工具 ===
        perfTest: async (folder) => {
            const results = {};
            const start = performance.now();
            
            // 测试 listFiles
            const listStart = performance.now();
            const listResult = await weAPI.listFiles(folder);
            results.listFiles = performance.now() - listStart;
            results.fileCount = listResult.files ? listResult.files.length : 0;
            
            // 测试读取第一个文件
            if (listResult.files && listResult.files.length > 0) {
                const testFile = listResult.files[0];
                const readStart = performance.now();
                const readResult = await weAPI.readFile(folder, testFile);
                results.readFile = performance.now() - readStart;
                results.readSuccess = readResult.success;
                results.contentSize = readResult.content ? readResult.content.length : 0;
                results.testFile = testFile;
            }
            
            // 测试缓存命中
            const cacheStart = performance.now();
            await weAPI.listFiles(folder);
            results.listFilesCached = performance.now() - cacheStart;
            
            results.totalTime = performance.now() - start;
            results.timestamp = new Date().toISOString();
            
            console.log('[PerfTest] 性能测试结果:', results);
            return results;
        },

        // ============ 日志系统增强 ============
        
        // 日志缓存（内存）
        _logBuffer: [],
        _logBufferMax: 100,
        _logFlushTimer: null,
        _logFilePath: '/we_logs.txt',
        _logPublicDir: null, // 公共目录引用
        _logSessionStart: null, // 当前会话开始时间
        _logPublicExportPath: null, // 公共导出路径缓存
        
        // 初始化日志系统
        initLogSystem: async () => {
            try {
                // 记录会话开始时间
                weAPI._logSessionStart = new Date().toISOString();
                
                // 创建日志目录（应用私有）
                if (Filesystem && Filesystem.mkdir) {
                    await Filesystem.mkdir({
                        path: 'logs',
                        directory: window.Capacitor.FilesystemDirectory.Data
                    }).catch(() => {}); // 忽略目录已存在的错误
                    
                    // 尝试在公共目录创建日志文件夹
                    // 在 Android 上使用 ExternalStorage 或 Documents
                    // 在 iOS 上使用 Documents 目录
                    const publicDirs = [
                        { name: 'Documents', path: 'logs' },
                        { name: 'Downloads', path: 'WorldEditorLogs' }
                    ];
                    
                    for (const dir of publicDirs) {
                        try {
                            if (window.Capacitor.FilesystemDirectory && 
                                window.Capacitor.FilesystemDirectory[dir.name]) {
                                await Filesystem.mkdir({
                                    path: dir.path,
                                    directory: window.Capacitor.FilesystemDirectory[dir.name]
                                }).catch(() => {});
                                weAPI._logPublicDir = { name: dir.name, path: dir.path };
                                break;
                            }
                        } catch (e) {}
                    }
                }
                
                // 同时在 localStorage 中保存日志元信息，便于 LogViewer 读取
                try {
                    const logMeta = {
                        initialized: true,
                        startTime: weAPI._logSessionStart,
                        appVersion: weAPI.version || '1.0.0',
                        platform: /Android/i.test(navigator.userAgent) ? 'android' : 
                                  /iPhone|iPad/i.test(navigator.userAgent) ? 'ios' : 'web',
                        publicDir: weAPI._logPublicDir
                    };
                    localStorage.setItem('we_log_meta', JSON.stringify(logMeta));
                } catch (e) {}
                
                weLog.info('logger', '日志系统初始化完成', JSON.stringify({
                    publicDir: weAPI._logPublicDir,
                    sessionStart: weAPI._logSessionStart
                }));
            } catch (e) {
                console.warn('日志系统初始化失败:', e);
            }
        },
        
        // 写入日志（带缓冲区，批量写入）
        writeLog: (level, module, message, dataStr) => {
            const timestamp = new Date().toISOString();
            const entry = {
                time: timestamp,
                level: level,
                module: module,
                message: message,
                data: dataStr || '',
                stack: level === 'ERROR' ? new Error().stack : undefined
            };
            
            // 添加到内存缓存
            weAPI._logBuffer.push(entry);
            
            // 限制缓存大小
            if (weAPI._logBuffer.length > weAPI._logBufferMax * 2) {
                weAPI._logBuffer = weAPI._logBuffer.slice(-weAPI._logBufferMax);
            }
            
            // 同时保存到 localStorage（快速访问）
            try {
                const logs = JSON.parse(localStorage.getItem('we_logs') || '[]');
                logs.push(entry);
                // 限制 localStorage 日志数量
                if (logs.length > 1000) logs.splice(0, logs.length - 1000);
                localStorage.setItem('we_logs', JSON.stringify(logs));
            } catch (e) {}
            
            // 批量写入文件（防抖）
            if (!weAPI._logFlushTimer) {
                weAPI._logFlushTimer = setTimeout(() => {
                    weAPI._flushLogsToFile();
                }, 2000); // 2秒防抖
            }
        },
        
        // 立即刷新日志到文件
        _flushLogsToFile: async () => {
            weAPI._logFlushTimer = null;
            try {
                if (weAPI._logBuffer.length === 0) return;
                
                const logsToFlush = weAPI._logBuffer.splice(0, weAPI._logBuffer.length);
                const logLines = logsToFlush.map(entry => {
                    let line = `[${entry.time}] [${entry.level}] [${entry.module}] ${entry.message}`;
                    if (entry.data) line += ` | ${entry.data}`;
                    return line;
                }).join('\n') + '\n';
                
                // 1. 写入应用私有目录
                if (Filesystem && Filesystem.appendFile) {
                    try {
                        const result = await Filesystem.appendFile({
                            path: 'logs/we_app.log',
                            data: btoa(unescape(encodeURIComponent(logLines))),
                            directory: window.Capacitor.FilesystemDirectory.Data
                        });
                    } catch (appendErr) {
                        // appendFile 可能不支持，尝试 read + write
                        try {
                            let existingContent = '';
                            try {
                                const readResult = await Filesystem.readFile({
                                    path: 'logs/we_app.log',
                                    directory: window.Capacitor.FilesystemDirectory.Data
                                });
                                existingContent = decodeURIComponent(escape(atob(readResult.data)));
                            } catch (readErr) {
                                // 文件不存在，新建
                            }
                            await Filesystem.writeFile({
                                path: 'logs/we_app.log',
                                data: btoa(unescape(encodeURIComponent(existingContent + logLines))),
                                directory: window.Capacitor.FilesystemDirectory.Data
                            });
                        } catch (writeErr) {
                            console.warn('日志写入文件失败:', writeErr);
                        }
                    }
                }
                
                // 2. 同时写入公共目录（便于外部读取）
                if (weAPI._logPublicDir && Filesystem) {
                    try {
                        const pubPath = weAPI._logPublicDir.path + '/we_app_public.log';
                        let existingContent = '';
                        try {
                            const readResult = await Filesystem.readFile({
                                path: pubPath,
                                directory: window.Capacitor.FilesystemDirectory[weAPI._logPublicDir.name]
                            });
                            existingContent = decodeURIComponent(escape(atob(readResult.data)));
                        } catch (readErr) {
                            // 文件不存在
                        }
                        await Filesystem.writeFile({
                            path: pubPath,
                            data: btoa(unescape(encodeURIComponent(existingContent + logLines))),
                            directory: window.Capacitor.FilesystemDirectory[weAPI._logPublicDir.name]
                        });
                    } catch (pubErr) {
                        // 公共目录写入失败不影响主流程
                        console.debug('公共目录日志写入失败（可忽略）:', pubErr.message);
                    }
                }
                
                // 3. 更新 localStorage 中的日志（用于 LogViewer 实时读取）
                try {
                    const existingLogs = JSON.parse(localStorage.getItem('we_logs') || '[]');
                    const newEntries = logsToFlush.map(entry => ({
                        time: entry.time,
                        level: entry.level,
                        module: entry.module,
                        message: entry.message,
                        data: entry.data,
                        stack: entry.stack
                    }));
                    const merged = [...existingLogs, ...newEntries];
                    // 限制数量，保留最近 2000 条
                    if (merged.length > 2000) merged.splice(0, merged.length - 2000);
                    localStorage.setItem('we_logs', JSON.stringify(merged));
                } catch (e) {}
                
                // 检查日志文件大小，超过 1MB 时轮转
                try {
                    const statResult = await Filesystem.stat({
                        path: 'logs/we_app.log',
                        directory: window.Capacitor.FilesystemDirectory.Data
                    });
                    if (statResult && statResult.size > 1048576) { // 1MB
                        await weAPI._rotateLogFile();
                    }
                } catch (e) {}
                
            } catch (e) {
                console.warn('日志刷新失败:', e);
            }
        },
        
        // 日志文件轮转
        _rotateLogFile: async () => {
            try {
                if (Filesystem && Filesystem.readFile) {
                    const result = await Filesystem.readFile({
                        path: 'logs/we_app.log',
                        directory: window.Capacitor.FilesystemDirectory.Data
                    });
                    const content = decodeURIComponent(escape(atob(result.data)));
                    const lines = content.split('\n');
                    // 只保留最近 5000 行
                    const trimmed = lines.slice(-5000).join('\n');
                    await Filesystem.writeFile({
                        path: 'logs/we_app.log',
                        data: btoa(unescape(encodeURIComponent(trimmed))),
                        directory: window.Capacitor.FilesystemDirectory.Data
                    });
                    weLog.info('logger', '日志文件已轮转，保留最近 5000 行');
                }
            } catch (e) {
                console.warn('日志轮转失败:', e);
            }
        },
        
        // 获取日志（从 localStorage）
        getLogs: (options = {}) => {
            try {
                const logs = JSON.parse(localStorage.getItem('we_logs') || '[]');
                let result = logs;
                
                // 按级别筛选
                if (options.level) {
                    result = result.filter(log => log.level === options.level);
                }
                
                // 按模块筛选
                if (options.module) {
                    result = result.filter(log => log.module === options.module);
                }
                
                // 按关键词搜索
                if (options.search) {
                    const keyword = options.search.toLowerCase();
                    result = result.filter(log => 
                        log.message.toLowerCase().includes(keyword) ||
                        (log.data && log.data.toLowerCase().includes(keyword))
                    );
                }
                
                // 限制数量
                if (options.limit) {
                    result = result.slice(-options.limit);
                }
                
                return result;
            } catch (e) {
                return [];
            }
        },
        
        // 导出日志为文本
        exportLogs: async (options = {}) => {
            try {
                // 先刷新缓冲区
                if (weAPI._logFlushTimer) {
                    clearTimeout(weAPI._logFlushTimer);
                    weAPI._logFlushTimer = null;
                }
                await weAPI._flushLogsToFile();
                
                // 读取文件日志
                let fileContent = '';
                try {
                    if (Filesystem && Filesystem.readFile) {
                        const result = await Filesystem.readFile({
                            path: 'logs/we_app.log',
                            directory: window.Capacitor.FilesystemDirectory.Data
                        });
                        fileContent = decodeURIComponent(escape(atob(result.data)));
                    }
                } catch (e) {
                    // 文件不存在
                }
                
                // 合并 localStorage 日志
                const memLogs = weAPI.getLogs(options);
                const memLogText = memLogs.map(entry => {
                    let line = `[${entry.time}] [${entry.level}] [${entry.module}] ${entry.message}`;
                    if (entry.data) line += ` | ${entry.data}`;
                    return line;
                }).join('\n');
                
                const header = `# World Editor 日志导出\n# 导出时间: ${new Date().toISOString()}\n# 版本: ${weAPI.version || 'unknown'}\n# 平台: ${/Android/i.test(navigator.userAgent) ? 'Android' : /iPhone|iPad/i.test(navigator.userAgent) ? 'iOS' : 'Web'}\n\n`;
                const fullLog = header + (fileContent || '') + '\n# === 内存日志 ===\n' + memLogText;
                
                // 保存导出文件到应用私有目录
                const exportPath = `logs/export_${Date.now()}.log`;
                if (Filesystem && Filesystem.writeFile) {
                    await Filesystem.writeFile({
                        path: exportPath,
                        data: btoa(unescape(encodeURIComponent(fullLog))),
                        directory: window.Capacitor.FilesystemDirectory.Data
                    });
                }
                
                // 同时导出到公共目录（便于 LogViewer 读取）
                let publicExportPath = null;
                if (weAPI._logPublicDir && Filesystem && Filesystem.writeFile) {
                    try {
                        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                        publicExportPath = `${weAPI._logPublicDir.path}/we_export_${timestamp}.log`;
                        await Filesystem.writeFile({
                            path: publicExportPath,
                            data: btoa(unescape(encodeURIComponent(fullLog))),
                            directory: window.Capacitor.FilesystemDirectory[weAPI._logPublicDir.name]
                        });
                        weAPI._logPublicExportPath = publicExportPath;
                    } catch (pubErr) {
                        console.debug('公共目录导出失败:', pubErr.message);
                    }
                }
                
                // 保存导出记录到 localStorage
                try {
                    const exportRecord = {
                        time: new Date().toISOString(),
                        path: exportPath,
                        publicPath: publicExportPath,
                        size: fullLog.length,
                        lines: fullLog.split('\n').length
                    };
                    const records = JSON.parse(localStorage.getItem('we_log_exports') || '[]');
                    records.push(exportRecord);
                    if (records.length > 20) records.splice(0, records.length - 20);
                    localStorage.setItem('we_log_exports', JSON.stringify(records));
                } catch (e) {}
                
                return {
                    success: true,
                    content: fullLog,
                    filePath: exportPath,
                    publicPath: publicExportPath,
                    size: fullLog.length
                };
            } catch (e) {
                return {
                    success: false,
                    error: e.message
                };
            }
        },
        
        // 分享日志文件（通过系统分享）
        shareLogs: async () => {
            try {
                // 先导出
                const exportResult = await weAPI.exportLogs();
                if (!exportResult.success) {
                    return { success: false, error: '导出失败' };
                }
                
                // 尝试使用 Capacitor Share API
                if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Share) {
                    try {
                        await window.Capacitor.Plugins.Share.share({
                            title: 'World Editor 日志',
                            text: exportResult.content.substring(0, 500),
                            url: exportResult.publicPath ? 
                                `file://${exportResult.publicPath}` : 
                                `file://${exportResult.filePath}`
                        });
                        return { success: true };
                    } catch (shareErr) {
                        // 分享失败，继续尝试其他方式
                    }
                }
                
                // 如果有公共目录路径，返回给调用方
                if (exportResult.publicPath) {
                    return { 
                        success: true, 
                        message: `日志已导出到公共目录: ${exportResult.publicPath}`,
                        path: exportResult.publicPath
                    };
                }
                
                return { 
                    success: true, 
                    message: `日志已导出`,
                    content: exportResult.content
                };
            } catch (e) {
                return { success: false, error: e.message };
            }
        },
        
        // 获取日志导出历史
        getExportHistory: () => {
            try {
                return JSON.parse(localStorage.getItem('we_log_exports') || '[]');
            } catch (e) {
                return [];
            }
        },
        
        // 清理日志
        clearLogs: async () => {
            try {
                // 清空 localStorage
                localStorage.setItem('we_logs', '[]');
                weAPI._logBuffer = [];
                
                // 清空文件
                try {
                    if (Filesystem && Filesystem.writeFile) {
                        await Filesystem.writeFile({
                            path: 'logs/we_app.log',
                            data: btoa(''),
                            directory: window.Capacitor.FilesystemDirectory.Data
                        });
                    }
                } catch (e) {}
                
                weLog.info('logger', '日志已清理');
                return { success: true };
            } catch (e) {
                return { success: false, error: e.message };
            }
        },
        
        // 获取日志文件列表
        getLogFiles: async () => {
            try {
                if (Filesystem && Filesystem.readdir) {
                    const result = await Filesystem.readdir({
                        path: 'logs',
                        directory: window.Capacitor.FilesystemDirectory.Data
                    });
                    const files = (result.files || []).filter(f => 
                        typeof f === 'string' ? f.endsWith('.log') : f.name && f.name.endsWith('.log')
                    );
                    return { success: true, files };
                }
                return { success: true, files: [] };
            } catch (e) {
                return { success: false, error: e.message, files: [] };
            }
        },
        
        // 读取指定日志文件
        readLogFile: async (filename) => {
            try {
                if (Filesystem && Filesystem.readFile) {
                    const result = await Filesystem.readFile({
                        path: `logs/${filename}`,
                        directory: window.Capacitor.FilesystemDirectory.Data
                    });
                    const content = decodeURIComponent(escape(atob(result.data)));
                    return { success: true, content };
                }
                return { success: false, error: 'Filesystem 不可用' };
            } catch (e) {
                return { success: false, error: e.message };
            }
        }
    };

    // === Tutorial Init ===
    async function initTutorial() {
        const tutorialKey = 'we_tutorial_initialized';
        const initialized = await prefsGet(tutorialKey, null);
        if (initialized === '1') return;

        try {
            const tutorialSrc = 'resources/Tutorial/使用教程(CN)';
            const tutorialDest = '/Tutorial/使用教程(CN)';

            await fsMkdir(tutorialDest);

            let metaFound = false;
            let metaName = '使用教程(CN)';
            let metaData = {};

            const metaResp = await fetch(`${tutorialSrc}/.metadata`);
            if (metaResp.ok) {
                const metaText = await metaResp.text();
                try {
                    metaData = JSON.parse(metaText);
                    metaName = metaData.name || '使用教程(CN)';
                    metaFound = true;
                    await fsWrite(`${tutorialDest}/.metadata`, metaText);
                } catch (e) {
                    await fsWrite(`${tutorialDest}/.metadata`, metaText);
                }
            }

            await saveProjectMeta(tutorialDest, {
                name: metaName,
                desc: metaData.desc || '',
                projectMode: metaData.projectMode || 'rich',
                owner: metaData.owner || null,
                created: Date.now()
            });

            let fileCount = 0;
            const wepResp = await fetch(`${tutorialSrc}/project.wep`);
            if (wepResp.ok) {
                const wepBuffer = await wepResp.arrayBuffer();
                await fsWrite(`${tutorialDest}/project.wep`, 'PK');

                const extracted = await extractZip(wepBuffer);
                for (const f of extracted) {
                    try {
                        const dirPath = f.path.includes('/') ? f.path.substring(0, f.path.lastIndexOf('/')) : '';
                        if (dirPath) await fsMkdir(`${tutorialDest}/${dirPath}`);
                        if (!f.binary) {
                            await fsWrite(`${tutorialDest}/${f.path}`, f.content);
                            fileCount++;
                        }
                    } catch (e) {}
                }
            }

            if (fileCount === 0) {
                const sampleContent = `<h1>使用教程</h1><p>欢迎使用 World Editor！</p><h2>快速开始</h2><p>点击左侧的按钮创建新项目。</p>`;
                await fsWrite(`${tutorialDest}/欢迎页面.html`, sampleContent);
                fileCount = 1;
            }

            const existingPinned = JSON.parse(await prefsGet('we_pinned_projects', '[]'));
            if (!existingPinned.includes(tutorialDest)) {
                existingPinned.unshift(tutorialDest);
                await prefsSet('we_pinned_projects', JSON.stringify(existingPinned));
            }

            const existingRecent = JSON.parse(await prefsGet('we_recent_projects', '[]'));
            const hasTutorial = existingRecent.some(p => p.path === tutorialDest);
            if (!hasTutorial) {
                existingRecent.unshift({
                    path: tutorialDest,
                    name: metaName,
                    modified: Date.now()
                });
                await prefsSet('we_recent_projects', JSON.stringify(existingRecent));
            }

            await prefsSet(tutorialKey, '1');
        } catch (e) {
            console.warn('Tutorial init failed:', e);
        }
    }

    // === Early Native Back Bridge Setup ===
    // Make WeNativeBack available ASAP so that native back-press gestures
    // received before initMobileNav completes still route through JS.
    // The actual handler will be installed later via registerBackButtonHandler.
    window.WeNativeBack = {
        handle: function() {
            if (weAPI._backHandler) {
                try { return !!weAPI._backHandler(); } catch (e) {}
            }
            return false;
        }
    };

    // Auto-init
    setTimeout(async () => {
        try {
            const savedSettings = await prefsGet('we_settings', 'null');
            let themeColor = '#1a1a2e';
            if (savedSettings && savedSettings !== 'null') {
                try {
                    const settings = JSON.parse(savedSettings);
                    if (settings.theme === 'light') {
                        themeColor = '#f5f5f5';
                    }
                } catch (e) {}
            }
            await weAPI.setStatusBarColor(themeColor);
        } catch (e) {}

        if (weAPI._detectMobile()) {
            try {
                await initTutorial();
            } catch (e) {}
        }
    }, 500);

    // 在 Electron 环境中不覆盖已存在的 weAPI（由 preload.js 注入）
    if (!isElectron) {
        window.weAPI = weAPI;
    } else if (!window.weAPI) {
        window.weAPI = weAPI;
    }

    if (typeof window.Capacitor === 'undefined') {
        window.Capacitor = {};
    }
    if (!window.Capacitor.Plugins) {
        window.Capacitor.Plugins = {};
    }
})();

// === 无条件扩展阶段（确保 perfTest 在所有环境可用）===
// 独立于上面的 IIFE，无条件地将 perfTest 注入到 window.weAPI
(function() {
    // 独立的 perfTest 函数（使用 window.weAPI，在调用时解析）
    async function perfTest(folder) {
        const results = {};
        const start = performance.now();
        
        // 测试 listFiles
        const listStart = performance.now();
        const listResult = await window.weAPI.listFiles(folder);
        results.listFiles = performance.now() - listStart;
        results.fileCount = listResult.files ? listResult.files.length : 0;
        
        // 测试读取第一个文件
        if (listResult.files && listResult.files.length > 0) {
            const testFile = listResult.files[0];
            const readStart = performance.now();
            const readResult = await window.weAPI.readFile(folder, testFile);
            results.readFile = performance.now() - readStart;
            results.readSuccess = readResult.success;
            results.contentSize = readResult.content ? readResult.content.length : 0;
            results.testFile = testFile;
        }
        
        // 测试缓存命中
        const cacheStart = performance.now();
        await window.weAPI.listFiles(folder);
        results.listFilesCached = performance.now() - cacheStart;
        
        results.totalTime = performance.now() - start;
        results.timestamp = new Date().toISOString();
        
        console.log('[PerfTest] 性能测试结果:', results);
        return results;
    }

    // 无条件包装 window.weAPI，确保 perfTest 可用
    // 如果 window.weAPI 已经有 perfTest，直接跳过
    if (typeof window.weAPI !== 'undefined' && typeof window.weAPI.perfTest !== 'function') {
        const originalAPI = window.weAPI;
        window.weAPI = new Proxy(originalAPI, {
            get(target, prop) {
                if (prop === 'perfTest') return perfTest;
                const value = Reflect.get(target, prop, target);
                return typeof value === 'function' ? value.bind(target) : value;
            },
            has(target, prop) {
                if (prop === 'perfTest') return true;
                return Reflect.has(target, prop);
            }
        });
    } else if (typeof window.weAPI === 'undefined') {
        // 极端情况：weAPI 不存在
        window.weAPI = { perfTest: perfTest };
    }
})();