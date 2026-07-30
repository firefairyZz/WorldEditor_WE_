# World Editor

一个基于 Electron 的轻量级世界构建编辑器，专为创作者设计。支持项目管理、多标签编辑、富文本/Markdown 双模式、文件树浏览、标签系统等功能。

## 功能特性

### 编辑器
- 基于 Quill 的富文本编辑器
- Markdown 实时渲染与导出
- 实时编辑统计（字数、字符数、段落数、预计阅读时间）
- 自动保存
- 字体与字号自定义

### 项目管理
- 项目创建、打开与管理
- 文件树浏览（可调宽侧边栏）
- 文件拖放导入（支持 .txt, .md, .doc, .docx, .rtf, .log, .csv, .json, .xml, .html, .css, .js）
- 项目级搜索（文件名、标签、内容搜索，通配符与模糊查找）
- 文件彩色标签与缩略图

### 标签页
- 多标签页编辑
- 标签右键菜单（固定/关闭/关闭其他/关闭右侧/重命名）
- 快捷键切换标签（Ctrl+Tab / Ctrl+1~9）

### 快捷键系统
- 全局快捷键支持（F1, Ctrl+S, Ctrl+N, Ctrl+O, Ctrl+W 等）
- 快捷键自定义设置（按键捕获 + 冲突检测）
- 快捷键帮助面板

### 界面
- 无边框窗口，自定义标题栏
- 深色 / 浅色主题切换
- 多语言支持（中文 / English）
- 窗口置顶
- 启动画面

## 技术栈

| 技术 | 用途 |
|------|------|
| Electron | 跨平台桌面应用框架 |
| Quill | 富文本编辑器 |
| 原生 JavaScript | 渲染进程逻辑 |
| CSS 变量 | 主题系统 |

## 快速开始

### 环境要求

- Node.js >= 16
- npm

### 安装与运行

```bash
cd JS
npm install
npm start
```

### 构建

```bash
cd JS
npx electron-builder --win
```

构建产物输出至 `JS/dist/` 目录。

## 项目结构

```
World Editor/
├── JS/                        # Electron 版本（主力开发）
│   ├── main.js                # 主进程
│   ├── preload.js             # 预加载脚本
│   ├── package.json
│   ├── electron-builder.yml   # 构建配置
│   ├── renderer/              # 渲染进程
│   │   ├── main.html
│   │   ├── splash.html
│   │   ├── css/style.css      # 全局样式
│   │   ├── js/tabs/           # 功能模块
│   │   │   ├── editor.js      # 编辑器
│   │   │   ├── project.js     # 项目管理
│   │   │   ├── filetree.js    # 文件树
│   │   │   ├── settings.js    # 设置页面
│   │   │   ├── shortcuts.js   # 快捷键系统
│   │   │   ├── tab-manager.js # 标签管理
│   │   │   ├── tab-context-menu.js  # 标签右键菜单
│   │   │   ├── file-drop.js   # 文件拖放
│   │   │   ├── i18n.js        # 国际化
│   │   │   └── ...
│   │   └── lib/               # 第三方库
│   ├── resources/             # 资源文件
│   │   ├── UPDATE_INF/        # 版本更新日志
│   │   └── icon.png
│   └── User/                  # 用户数据
│       ├── lang/              # 语言文件
│       └── settings.json      # 用户设置
├── Python_Vision/             # Python 版本（早期原型）
└── README.md
```

## 版本历史

### v0.3.0
- 快捷键系统与自定义设置
- 标签右键菜单（固定/关闭/重命名）
- 实时编辑统计
- 文件拖放导入
- 窗口缩放与主题底色修复

### v0.2.0
- 文件彩色标签与缩略图
- 项目搜索功能
- Markdown 导出
- 文件树侧边栏优化

### v0.1.0
- 基础编辑功能
- 项目创建与管理
- 主题切换与多语言支持

详细更新日志见 [JS/resources/UPDATE_INF/](JS/resources/UPDATE_INF/)。

## 开发者

[firefairyZz](https://github.com/firefairyZz)

## License

MIT
