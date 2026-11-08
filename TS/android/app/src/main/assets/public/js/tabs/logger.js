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
        if (typeof data === 'string') {
            // 截断过长的字符串（>10KB）
            if (data.length > 10240) {
                return data.substring(0, 10240) + `... [截断，原长度 ${data.length}]`;
            }
            return data;
        }
        if (typeof data === 'object') {
            try {
                const str = JSON.stringify(data);
                // 截断过长的 JSON（>10KB）
                if (str.length > 10240) {
                    return str.substring(0, 10240) + `... [截断，原长度 ${str.length}]`;
                }
                return str;
            } catch (e) {
                try { return String(data).substring(0, 10240); } catch (_) { return '[unserializable]'; }
            }
        }
        return String(data);
    },

    _write(level, module, message, data) {
        const levelNum = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 }[level] || 0;
        if (levelNum < this._minLevel) return;

        const tag = `[${module}]`;
        const dataStr = this._formatData(data);
        const consoleMsg = dataStr ? `${tag} ${message} | ${dataStr}` : `${tag} ${message}`;

        // 1. 输出到 console（带样式）
        const fn = level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : level === 'DEBUG' ? 'debug' : 'log';
        console[fn](`%c[${level}]%c ${consoleMsg}`, this._style[level], 'color:inherit');

        // 2. 通过 IPC 写入文件（异步，不阻塞主流程）
        // 只记录 WARN 和 ERROR 级别，减少 IPC 调用
        if (levelNum >= 2) { // WARN 和 ERROR
            try {
                if (window.weAPI && typeof window.weAPI.writeLog === 'function') {
                    // 使用 setTimeout 让日志写入非阻塞
                    setTimeout(() => {
                        try {
                            window.weAPI.writeLog(level, module, message, dataStr);
                        } catch (e) { /* 忽略 */ }
                    }, 0);
                }
            } catch (e) { /* 防止日志本身抛错中断业务流程 */ }
        }
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
