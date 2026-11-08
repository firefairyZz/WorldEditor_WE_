// lib/index.js — JS wrapper for we-window native addon
// Provides clean API that integrates with Electron BrowserWindow lifecycle

const path = require('path');
const fs = require('fs');

// Try to load native binding from prebuilt or build output
let native = null;
function loadNative() {
    if (native) return native;

    // Paths to try (in order)
    const candidates = [
        // Prebuild output
        path.join(__dirname, '..', 'prebuilds', 'win32-x64', 'we_window.node'),
        // node-gyp Release output
        path.join(__dirname, '..', 'build', 'Release', 'we_window.node'),
        // node-gyp Debug output
        path.join(__dirname, '..', 'build', 'Debug', 'we_window.node'),
    ];

    for (const p of candidates) {
        if (fs.existsSync(p)) {
            try {
                native = require(p);
                return native;
            } catch (e) {
                console.warn('[we-window] Failed to load', p, e.message);
            }
        }
    }

    throw new Error('[we-window] Native binding not found. Run "npm run build:electron" first.');
}

// Material name → native value
const MATERIAL_MAP = {
    auto: 0, none: 1, mica: 2, acrylic: 3, 'tabbed-mica': 4,
};

// ========== WeWindow class ==========

class WeWindow {
    /**
     * Attach we-window native control to an Electron BrowserWindow
     * @param {BrowserWindow} win - Electron BrowserWindow instance
     * @param {Object} options
     * @param {string} options.material - 'mica' | 'acrylic' | 'tabbed-mica' | 'none' | 'auto'
     * @param {string} options.theme - 'auto' | 'dark' | 'light'
     * @param {boolean} options.nativeControls - Enable WS_THICKFRAME for native resize/Aero snap
     */
    constructor(win, options = {}) {
        this.win = win;
        this.options = Object.assign({
            material: 'mica',
            theme: 'auto',
            nativeControls: true,
        }, options);

        this._attached = false;
        this._onMaximize = () => this._native && this._native.onMaximized(this.win.getNativeWindowHandle());
        this._onUnmaximize = () => this._native && this._native.onRestored(this.win.getNativeWindowHandle());
        this._onClosed = () => this.detach();
    }

    attach() {
        if (this._attached) return true;
        try {
            const native = loadNative();
            this._native = native;

            const hwnd = this.win.getNativeWindowHandle();

            // 1. Attach subclass
            if (!native.attach(hwnd)) {
                console.warn('[we-window] attach() returned false');
                return false;
            }

            // 2. Enable native controls (WS_THICKFRAME)
            if (this.options.nativeControls) {
                native.enableNativeControls(hwnd);
            }

            // 3. Apply material
            const matVal = MATERIAL_MAP[this.options.material] ?? 0;
            native.setMaterial(hwnd, matVal);

            // 4. Apply theme
            const themeMap = { auto: 0, light: 1, dark: 2 };
            native.setTheme(hwnd, themeMap[this.options.theme] ?? 0);

            // 5. Listen to Electron events → sync DWM corner state
            this.win.on('maximize', this._onMaximize);
            this.win.on('unmaximize', this._onUnmaximize);
            this.win.on('closed', this._onClosed);

            // 6. Initial corner
            if (this.win.isMaximized()) {
                native.setCorner(hwnd, native.Corner.DONOTROUND);
            } else {
                native.setCorner(hwnd, native.Corner.ROUND);
            }

            this._attached = true;
            console.log('[we-window] ✅ attached successfully');
            return true;
        } catch (e) {
            console.error('[we-window] attach failed:', e.message);
            return false;
        }
    }

    detach() {
        if (!this._attached) return;
        try {
            this._native?.detach(this.win.getNativeWindowHandle());
        } catch (e) {}
        try {
            this.win.removeListener('maximize', this._onMaximize);
            this.win.removeListener('unmaximize', this._onUnmaximize);
            this.win.removeListener('closed', this._onClosed);
        } catch (e) {}
        this._attached = false;
    }

    setMaterial(name) {
        const val = MATERIAL_MAP[name];
        if (val !== undefined && this._native) {
            this._native.setMaterial(this.win.getNativeWindowHandle(), val);
        }
    }

    setTheme(name) {
        const map = { auto: 0, light: 1, dark: 2 };
        const val = map[name];
        if (val !== undefined && this._native) {
            this._native.setTheme(this.win.getNativeWindowHandle(), val);
        }
    }
}

// ========== Standalone API ==========

/**
 * Quick attach — create WeWindow and attach immediately
 */
function attach(win, options) {
    const w = new WeWindow(win, options);
    w.attach();
    return w;
}

module.exports = {
    WeWindow,
    attach,
    MATERIAL_MAP,
    // Re-export native enums for direct access
    get Material() { return loadNative().Material; },
    get Corner() { return loadNative().Corner; },
    get Theme() { return loadNative().Theme; },
};
