// ====== editor/registry.js — 文件类型检测 & 编辑器注册 ======
// 优先级: 节点图 > 展示 > 不支持 > 富文本
//
// 文件分类:
//   nodegraph  - .node.json
//   viewer     - 图片、视频、音频、PDF 等可展示文件
//   unsupported- 不可识别、二进制、归档等
//   text       - .txt, .md 及其他可编辑文本

// --- 扩展名表 ---
const NODEGRAPH_EXT = ['.node.json'];  // 节点图（特殊：双扩展名）

const TEXT_EXT = ['.txt', '.md'];      // 富文本（用户指定：只有这两种）

const VIEWER_IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.ico', '.tiff', '.tif'];
const VIEWER_VIDEO_EXT = ['.mp4', '.webm', '.mov'];
const VIEWER_AUDIO_EXT = ['.mp3', '.wav', '.flac', '.aac', '.m4a'];
const VIEWER_PDF_EXT = ['.pdf'];

const UNSUPPORTED_EXT = [
    '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2',    // 归档
    '.exe', '.dll', '.so', '.dylib', '.jar', '.class', '.apk', '.ipa', '.iso', '.img',  // 二进制
    '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'   // Office
];

/**
 * 从文件名提取不含路径的基本名
 */
function getBaseName(filename) {
    if (!filename) return '';
    const lastSlash = Math.max(filename.lastIndexOf('/'), filename.lastIndexOf('\\'));
    return lastSlash >= 0 ? filename.substring(lastSlash + 1) : filename;
}

/**
 * 获取文件扩展名（小写，含点号）
 */
function getExtension(filename) {
    const base = getBaseName(filename);
    const lastDot = base.lastIndexOf('.');
    if (lastDot < 0) return '';
    return base.substring(lastDot).toLowerCase();
}

/**
 * 判断文件是否为节点图
 * .node.json 是特殊的双扩展名，必须在文本检测之前判断
 */
function isNodeGraphFile(filename) {
    const base = getBaseName(filename);
    return base.endsWith('.node.json');
}

/**
 * 判断是否为存储图片（__img_ 前缀）
 * 先提取文件名（去除路径），再检查前缀
 */
function isStoredImage(filename) {
    if (!filename) return false;
    const baseName = getBaseName(filename);
    return baseName.startsWith('__img_');
}

/**
 * 判断是否为存储二进制（__bin_ 前缀）
 */
function isStoredBinary(filename) {
    if (!filename) return false;
    const baseName = getBaseName(filename);
    return baseName.startsWith('__bin_');
}

/**
 * 判断是否为存储媒体文件（__media_ 前缀）
 */
function isStoredMedia(filename) {
    if (!filename) return false;
    const baseName = getBaseName(filename);
    return baseName.startsWith('__media_');
}

/**
 * 从存储媒体文件名提取实际文件扩展名
 */
function getMediaFileExt(filename) {
    if (!filename) return '';
    const baseName = getBaseName(filename);
    if (!baseName.startsWith('__media_')) return '';
    const realName = baseName.substring(8); // 移除 '__media_' 前缀
    const lastDot = realName.lastIndexOf('.');
    return lastDot >= 0 ? realName.substring(lastDot).toLowerCase() : '';
}

/**
 * 核心函数: 获取文件元数据
 * 按优先级检测: 节点图 > 展示 > 不支持 > 富文本
 *
 * @param {string} filename - 文件名或路径（如 '文件夹/流程图.node.json'）
 * @returns {{
 *   category: 'nodegraph'|'viewer'|'unsupported'|'text',
 *   ext: string,
 *   isNodeGraph: boolean,
 *   isImage: boolean,
 *   isVideo: boolean,
 *   isAudio: boolean,
 *   isPdf: boolean,
 *   isArchive: boolean,
 *   isBinary: boolean,
 *   isText: boolean,
 *   isStoredImage: boolean,
 *   isStoredBinary: boolean
 * }}
 */
function getFileMetadata(filename) {
    if (!filename) {
        return {
            category: 'text', ext: '',
            isNodeGraph: false, isImage: false, isVideo: false, isAudio: false,
            isPdf: false, isArchive: false, isBinary: false, isText: true,
            isStoredImage: false, isStoredBinary: false, isStoredMedia: false
        };
    }

    const baseName = getBaseName(filename);
    const ext = getExtension(filename);
    const storedImg = isStoredImage(filename);
    const storedBin = isStoredBinary(filename);
    const storedMedia = isStoredMedia(filename);

    // === 优先级 1: 节点图 ===
    if (isNodeGraphFile(filename)) {
        return {
            category: 'nodegraph', ext: '.node.json',
            isNodeGraph: true, isImage: false, isVideo: false, isAudio: false,
            isPdf: false, isArchive: false, isBinary: false, isText: false,
            isStoredImage: storedImg, isStoredBinary: storedBin, isStoredMedia: false
        };
    }

    // === 优先级 2: 展示（图片/视频/音频/PDF）===
    if (storedImg) {
        // 存储的图片
        return {
            category: 'viewer', ext: ext || '.png',
            isNodeGraph: false, isImage: true, isVideo: false, isAudio: false,
            isPdf: false, isArchive: false, isBinary: false, isText: false,
            isStoredImage: true, isStoredBinary: false, isStoredMedia: false
        };
    }

    if (storedMedia) {
        // 存储的媒体文件（视频/音频）
        const mediaExt = getMediaFileExt(filename);
        const isVideo = VIEWER_VIDEO_EXT.includes(mediaExt);
        const isAudio = VIEWER_AUDIO_EXT.includes(mediaExt);
        return {
            category: 'viewer', ext: mediaExt || ext,
            isNodeGraph: false, isImage: false, isVideo, isAudio,
            isPdf: false, isArchive: false, isBinary: false, isText: false,
            isStoredImage: false, isStoredBinary: false, isStoredMedia: true
        };
    }

    const isImage = VIEWER_IMAGE_EXT.includes(ext);
    const isVideo = VIEWER_VIDEO_EXT.includes(ext);
    const isAudio = VIEWER_AUDIO_EXT.includes(ext);
    const isPdf = VIEWER_PDF_EXT.includes(ext);

    if (isImage || isVideo || isAudio || isPdf) {
        return {
            category: 'viewer', ext,
            isNodeGraph: false, isImage, isVideo, isAudio, isPdf,
            isArchive: false, isBinary: false, isText: false,
            isStoredImage: storedImg, isStoredBinary: storedBin, isStoredMedia: false
        };
    }

    // === 优先级 3: 不支持（二进制/归档/不可识别）===
    if (storedBin) {
        return {
            category: 'unsupported', ext,
            isNodeGraph: false, isImage: false, isVideo: false, isAudio: false,
            isPdf: false, isArchive: false, isBinary: true, isText: false,
            isStoredImage: false, isStoredBinary: true, isStoredMedia: false
        };
    }

    const isArchive = ['.zip','.rar','.7z','.tar','.gz','.bz2'].includes(ext);
    const isBinary = UNSUPPORTED_EXT.includes(ext);

    if (isArchive || isBinary) {
        return {
            category: 'unsupported', ext,
            isNodeGraph: false, isImage: false, isVideo: false, isAudio: false,
            isPdf: false, isArchive, isBinary, isText: false,
            isStoredImage: storedImg, isStoredBinary: storedBin, isStoredMedia: false
        };
    }

    // === 优先级 4: 富文本（.txt, .md）===
    const isText = TEXT_EXT.includes(ext);
    if (isText) {
        return {
            category: 'text', ext,
            isNodeGraph: false, isImage: false, isVideo: false, isAudio: false,
            isPdf: false, isArchive: false, isBinary: false, isText: true,
            isStoredImage: storedImg, isStoredBinary: storedBin, isStoredMedia: false
        };
    }

    // === 兜底: 没有扩展名的文件也当作文本 ===
    if (!ext) {
        return {
            category: 'text', ext: '',
            isNodeGraph: false, isImage: false, isVideo: false, isAudio: false,
            isPdf: false, isArchive: false, isBinary: false, isText: true,
            isStoredImage: storedImg, isStoredBinary: storedBin, isStoredMedia: false
        };
    }

    // === 其他未识别扩展名: 不支持 ===
    return {
        category: 'unsupported', ext,
        isNodeGraph: false, isImage: false, isVideo: false, isAudio: false,
        isPdf: false, isArchive: false, isBinary: true, isText: false,
        isStoredImage: storedImg, isStoredBinary: storedBin, isStoredMedia: false
    };
}

// ====== 编辑器注册表 ======
class EditorRegistry {
    constructor() {
        this._editors = [];
    }

    register(editor) {
        if (!editor || !editor.id) return;
        if (this._editors.find(e => e.id === editor.id)) return;
        this._editors.push(editor);
    }

    find(filename) {
        const meta = getFileMetadata(filename);
        for (const editor of this._editors) {
            try {
                if (editor.supports(meta)) return editor;
            } catch (e) { /* ignore */ }
        }
        return null;
    }

    list() {
        return this._editors.map(e => ({ id: e.id, name: e.name }));
    }
}

// 预注册内置编辑器（用于查询）
const editorRegistry = new EditorRegistry();
editorRegistry.register({ id: 'rich-text', name: '富文本', supports: m => m.category === 'text' });
editorRegistry.register({ id: 'node-graph', name: '节点图', supports: m => m.category === 'nodegraph' });
editorRegistry.register({ id: 'viewer', name: '查看器', supports: m => m.category === 'viewer' });

// 导出到全局
window.getFileMetadata = getFileMetadata;
window.getBaseName = getBaseName;
window.getExtension = getExtension;
window.isNodeGraphFile = isNodeGraphFile;
window.editorRegistry = editorRegistry;

// 兼容旧代码（filetree.js 使用的 getFileCategory）
window.getFileCategory = function(filename) {
    const meta = getFileMetadata(filename);
    if (meta.category === 'viewer' && meta.isImage) return 'viewer-image';
    if (meta.category === 'viewer') return 'viewer';
    if (meta.category === 'nodegraph') return 'nodegraph';
    if (meta.category === 'unsupported') return 'unsupported';
    return 'text';
};
