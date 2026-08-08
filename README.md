# World Editor

一个基于 Electron 的轻量级世界构建编辑器，专为创作者设计。支持项目管理、富文本/Markdown 双模式编辑、文件树浏览、标签系统、多主题、账户系统等功能。

当前版本：**v0.7.0**

## 功能特性

### 编辑器
- 基于 Quill 的富文本编辑器，支持文字颜色、背景颜色、文本对齐（左/居中/右/两端）
- 纯 Markdown 模式（创建项目时可选，带可折叠实时预览面板）
- 多格式导出：Markdown / HTML / PDF / ZIP（PDF 保留背景色，ZIP 打包整个项目）
- 实时编辑统计（字数、字符数、段落数、预计阅读时间）
- 自动保存与保存防抖（重复请求自动排队补存）
- 字体与字号自定义
- 文档目录（TOC）自动生成
- 文件内跳转与外部 URL 跳转
- **节点图编辑器**：纯 SVG/CSS 引擎（NGEngine），5 种节点类型、4 种连线样式、贝塞尔端口、属性面板、撤销/重做、缩放/平移
- **全局/局部撤销系统**：PS 风格历史记录面板，支持拖拽与窗口边界限制

### 项目管理
- 项目创建、打开与管理
- **项目固定**：启程页置顶常用项目，编辑器侧边栏可快速固定/取消
- 首次运行自动固定使用教程
- 文件树浏览（可调宽侧边栏 140-500px）
- 文件拖放导入（支持 .txt, .md, .doc, .docx, .rtf, .log, .csv, .json, .xml, .html, .css, .js）
- 项目级搜索（文件名、标签、内容搜索，通配符与模糊查找）
- 文件彩色标签与缩略图（支持自定义取色器）
- **文件夹标签**：文件夹支持添加和管理标签
- 文件多选与批量操作（Ctrl+点击 / Shift+点击 / Ctrl+A 全选）
  - 批量加标签 / 批量删标签（显示命中数）/ 批量删除

### 标签页
- 多标签页编辑
- 标签右键菜单（固定/关闭/关闭其他/关闭右侧/重命名）
- 快捷键切换标签（Ctrl+Tab / Ctrl+1~9）

### 界面与主题
- 无边框窗口，自定义标题栏
- **三态模式系统**：OA 启程页 / 目录独占 / 完整 TA 双区域编辑，侧边栏平滑过渡动画
- **多主题系统**：13 种预设主题（含 GitHub、Dracula、Monokai、Nord、Solarized 等）+ 自定义配色
- **背景材质系统**（仅 Windows 11）：云母 (Mica) / 亚克力 (Acrylic) / 标签式 (Tabbed)，支持内容区/遮罩/标题栏三层透明度调节
- 深色 / 浅色主题切换
- **多语言支持**：中文 / English / 日本語 / Русский
- 窗口置顶
- 启动画面
- 命令面板（Ctrl+P 快速搜索命令和设置）

### 账户系统
- 本地账户（数据存储于 `User/account.json`，不随打包发布）
- 账户头像上传（限 2MB）与首字母头像自动生成
- 账户信息同步至项目所有者字段
- 设置页行内编辑（回车/失焦确认，Esc 取消）

### 快捷键系统
- 全局快捷键（F1, Ctrl+S, Ctrl+N, Ctrl+O, Ctrl+W, Ctrl+A, Ctrl+T 等）
- 快捷键自定义设置（按键捕获 + 冲突检测）
- 快捷键帮助面板
- 调试模式（Ctrl+Shift+D）

## 技术栈

| 技术 | 用途 |
|------|------|
| Electron | 跨平台桌面应用框架 |
| Quill 1.3.6 | 富文本编辑器 |
| KaTeX | 数学公式渲染 |
| Lucide | 图标库 |
| archiver / unzipper | ZIP 打包与解压 |
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

构建产物输出至项目根目录的 `WE-Release/`。

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
│   │   │   ├── filetree.js    # 文件树与多选
│   │   │   ├── settings.js    # 设置页面
│   │   │   ├── shortcuts.js   # 快捷键系统
│   │   │   ├── tab-manager.js # 标签管理
│   │   │   ├── tags.js        # 标签系统
│   │   │   ├── account.js     # 账户系统
│   │   │   ├── welcome.js     # 启程页
│   │   │   ├── command-palette.js  # 命令面板
│   │   │   ├── i18n.js        # 国际化
│   │   │   └── ...
│   │   └── lib/               # 第三方库（Quill, KaTeX, Lucide）
│   ├── resources/             # 资源文件
│   │   ├── UPDATE_INF/        # 版本更新日志
│   │   ├── Tutorial/          # 使用教程
│   │   └── icon.png
│   └── User/                  # 用户数据（运行时生成）
│       ├── lang/              # 语言文件（zh_CN, en, ja, ru）
│       ├── account.json       # 账户信息
│       └── settings.json      # 用户设置
├── Python_Vision/             # Python 版本（早期原型，已停止维护）
└── README.md
```

## 版本历史

### v0.7.0
- **节点图编辑器**：纯 SVG/CSS 引擎（NGEngine），5 节点类型、4 连线样式、贝塞尔端口、属性面板
- **全局/局部撤销系统**：PS 风格历史记录面板，支持拖拽与窗口边界限制
- **界面布局重构**：三态 OA/TA 模式、Lucide 图标导航、平滑过渡动画
- **设置页用户信息卡片**：头像、签名编辑、折叠动画
- 设置-通用新增"默认打开第一项"开关
- 国际化补全（bio/history/default_open_first 等翻译）
- 多项节点图、设置页、历史记录面板的 Bug 修复

### v0.6.0
- 项目固定（启程页 + 编辑器侧边栏）、首次运行教程自动固定
- 富文本上色与对齐（文字颜色、背景颜色、左/居中/右/两端对齐）
- 文件多选与批量操作（批量加标签、批量删标签、批量删除）
- 文件夹标签支持
- `recent.json` 结构升级为 `{ pinned, recent }`

### v0.5.0
- 多格式导出（Markdown / HTML / PDF / ZIP）
- 背景材质系统增强（Tabbed 类型 + 三层透明度滑块）
- 新增日语、俄语语言包
- 标签自定义颜色取色器
- 保存防抖与启动优化

### v0.4.2
- 国际化翻译完善
- 标签系统重构（常用标签追踪、固定标签管理面板）

### v0.4.0
- 多主题系统（13 种预设 + 自定义配色）
- 账户系统（头像、本地存储、行内编辑）
- 纯 Markdown 模式
- 文件跳转功能
- 调试模式（Ctrl+Shift+D）

### v0.3.0
- 快捷键系统与自定义设置
- 标签右键菜单（固定/关闭/重命名）
- 实时编辑统计
- 文件拖放导入

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
