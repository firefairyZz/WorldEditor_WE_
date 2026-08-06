// ============================================================
// 统一日志工具（所有渲染进程模块共享）
// 日志同时输出到 DevTools console 和 ./log/JS/renderer.log
// 使用方式：
//   weLog.info('init', '描述信息', { key: value });
//   weLog.error('editor', '插入图片失败', err);
// 级别：DEBUG < INFO < WARN < ERROR
// ============================================================

const weLog = {
    // 当前最低输出级别（DEBUG=0 INFO=1 WARN=2 ERROR=3）
    // 通过 URL 参数 ?logLevel=error 可动态调高门槛
    _minLevel: 0,

    _style: {
        DEBUG: 'color:#888;font-weight:bold',
        INFO: 'color:#0078d4;font-weight:bold',
        WARN: 'color:#d68a00;font-weight:bold',
        ERROR: 'color:#d13438;font-weight:bold;background:#fdf2f2'
    },

    _formatData(data) {
        if (data === undefined || data === null) return '';
        if (typeof data === 'string') return data;
        try {
            return JSON.stringify(data);
        } catch (e) {
            try { return String(data); } catch (_) { return '[unserializable]'; }
        }
    },

    _write(level, module, message, data) {
        const levelNum = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 }[level] || 0;
        if (levelNum < this._minLevel) return;

        const tag = `[${module}]`;
        const dataStr = this._formatData(data);
        // console 输出包含完整信息（message + data）
        const consoleMsg = dataStr ? `${tag} ${message} | ${dataStr}` : `${tag} ${message}`;

        // 1. 输出到 console（带样式）
        const fn = level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : level === 'DEBUG' ? 'debug' : 'log';
        console[fn](`%c[${level}]%c ${consoleMsg}`, this._style[level], 'color:inherit');

        // 2. 通过 IPC 写入文件（传原始 message + 独立 dataStr，由 main.js 负责拼接）
        try {
            if (window.weAPI && typeof window.weAPI.writeLog === 'function') {
                window.weAPI.writeLog(level, module, message, dataStr);
            }
        } catch (e) { /* 防止日志本身抛错中断业务流程 */ }
    },

    debug(module, message, data) { this._write('DEBUG', module, message, data); },
    info(module, message, data)  { this._write('INFO', module, message, data); },
    warn(module, message, data)  { this._write('WARN', module, message, data); },
    error(module, message, data) { this._write('ERROR', module, message, data); },

    // 便捷方法：包裹一个函数，自动记录进入/完成/异常
    trace(module, label, fn) {
        this.info(module, `→ ${label} 开始`);
        const t0 = performance.now();
        try {
            const r = fn();
            if (r && typeof r.then === 'function') {
                return r.then(v => {
                    this.info(module, `← ${label} 完成 (${Math.round(performance.now() - t0)}ms)`);
                    return v;
                }).catch(e => {
                    this.error(module, `✗ ${label} 失败`, e && e.stack ? e.stack : String(e));
                    throw e;
                });
            }
            this.info(module, `← ${label} 完成 (${Math.round(performance.now() - t0)}ms)`);
            return r;
        } catch (e) {
            this.error(module, `✗ ${label} 失败`, e && e.stack ? e.stack : String(e));
            throw e;
        }
    }
};

// 解析 URL 参数 ?logLevel=xxx 动态调整门槛
try {
    const params = new URLSearchParams(window.location.search);
    const lv = (params.get('logLevel') || '').toUpperCase();
    if (lv === 'INFO') weLog._minLevel = 1;
    else if (lv === 'WARN') weLog._minLevel = 2;
    else if (lv === 'ERROR') weLog._minLevel = 3;
} catch (e) {}

// 暴露到全局
window.weLog = weLog;
