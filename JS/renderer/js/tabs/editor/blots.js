// ====== editor/blots.js — 跳转链接 Blot ======
// 源文件: editor.js (行22-92)

// ====== 跳转链接 Blot ======
// 继承 Quill 标准 Link，额外支持 data-jump 属性存储项目内跳转信息
const LinkBlot = Quill.import('formats/link');

class ProjectLinkBlot extends LinkBlot {
    static blotName = 'projectLink';
    static tagName = 'a';

    static create(value) {
        weLog.debug('editor', 'ProjectLinkBlot.create 开始', { valueType: typeof value });
        // 字符串：普通 URL，交给父类
        if (typeof value === 'string') {
            weLog.debug('editor', 'ProjectLinkBlot.create: 走了字符串URL分支');
            return super.create(value);
        }
        // 对象：项目内跳转
        if (value && value.project) {
            weLog.debug('editor', 'ProjectLinkBlot.create: 走了项目内跳转分支', { project: value.project, file: value.file });
            const node = super.create('#');
            node.setAttribute('data-jump', JSON.stringify({
                project: value.project,
                file: value.file || '',
                heading: value.heading || ''
            }));
            node.classList.add('jump-link');
            node.removeAttribute('href');
            if (value.text) node.textContent = value.text;
            return node;
        }
        // 对象：外部 URL + 自定义文字
        if (value && value.url) {
            weLog.debug('editor', 'ProjectLinkBlot.create: 走了外部URL对象分支', { url: value.url });
            const node = super.create(value.url);
            if (value.text) node.textContent = value.text;
            return node;
        }
        weLog.debug('editor', 'ProjectLinkBlot.create: 走了默认分支');
        return super.create(value || '');
    }

    // Quill 解析 HTML → Delta 时调用，返回假值会导致格式丢失
    static formats(node) {
        const jumpData = node.getAttribute('data-jump');
        if (jumpData) {
            try {
                const parsed = JSON.parse(jumpData);
                return { project: parsed.project, file: parsed.file, heading: parsed.heading };
            } catch(e) {
                weLog.error('editor', 'ProjectLinkBlot.formats 解析 data-jump 失败', e && e.stack ? e.stack : String(e));
            }
        }
        return node.getAttribute('href') || '';
    }

    static value(node) {
        const jumpData = node.getAttribute('data-jump');
        if (jumpData) {
            try {
                const parsed = JSON.parse(jumpData);
                return { ...parsed, text: node.textContent };
            } catch(e) {
                weLog.error('editor', 'ProjectLinkBlot.value 解析 data-jump 失败', e && e.stack ? e.stack : String(e));
            }
        }
        return node.getAttribute('href') || '';
    }
}

Quill.register(ProjectLinkBlot, true);
// 同时注册为 link 格式的替代，让 Quill 工具栏的链接按钮也走这个 Blot
Quill.register('formats/link', ProjectLinkBlot, true);