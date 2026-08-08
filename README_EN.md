# World Editor

A lightweight world-building editor built with Electron, designed for creators. Supports project management, rich text / Markdown dual-mode editing, file tree browsing, tag system, multi-theme, account system, and more.

Current version: **v0.7.0**

## Features

### Editor
- Quill-based rich text editor with text color, background color, and alignment (left/center/right/justify)
- Pure Markdown mode (optional at project creation, with collapsible live preview panel)
- Multi-format export: Markdown / HTML / PDF / ZIP (PDF preserves background colors, ZIP packages the entire project)
- Live editing statistics (word count, character count, paragraph count, estimated reading time)
- Auto-save with debounce (repeated requests queue automatically)
- Customizable font family and size
- Auto-generated Table of Contents (TOC)
- In-file jump and external URL navigation
- **Node Graph Editor**: Pure SVG/CSS engine (NGEngine) with 5 node types, 4 connection styles, Bezier ports, property panel, undo/redo, zoom/pan
- **Global/Local Undo/Redo System**: Photoshop-style history panel with drag support and viewport boundary clamping

### Project Management
- Project creation, opening, and management
- **Project Pinning**: Pin frequently used projects to the welcome page; quick pin/unpin via editor sidebar
- First-run tutorial auto-pin
- File tree browsing (resizable sidebar 140-500px)
- File drag-and-drop import (.txt, .md, .doc, .docx, .rtf, .log, .csv, .json, .xml, .html, .css, .js)
- Project-level search (filename, tag, content search with wildcards and fuzzy matching)
- Colored file tags and thumbnails (custom color picker)
- **Folder Tags**: Folders support adding and managing tags
- File multi-select and batch operations (Ctrl+Click / Shift+Click / Ctrl+A)
  - Batch add tags / batch remove tags (shows hit count) / batch delete

### Tabs
- Multi-tab editing
- Tab context menu (pin / close / close others / close to the right / rename)
- Keyboard tab switching (Ctrl+Tab / Ctrl+1~9)

### UI & Themes
- Frameless window with custom title bar
- **Three-State Mode System**: OA welcome page / directory-only mode / full TA dual-pane editing with smooth sidebar transitions
- **Multi-Theme System**: 13 preset themes (GitHub, Dracula, Monokai, Nord, Solarized, etc.) + custom color schemes
- **Background Material System** (Windows 11 only): Mica / Acrylic / Tabbed with 3-layer opacity sliders (content area/mask/title bar)
- Dark / Light theme switching
- **Multi-Language Support**: 中文 / English / 日本語 / Русский
- Always-on-top window
- Splash screen
- Command Palette (Ctrl+P for quick command and setting search)

### Account System
- Local account (data stored in `User/account.json`, not packaged with builds)
- Avatar upload (2MB limit) and auto-generated initial avatar
- Account info synced to project owner field
- Inline editing in settings (Enter/blur to confirm, Esc to cancel)
- Settings user profile card (avatar, display name, bio editing, collapse animation on OA/TA switch)

### Keyboard Shortcuts
- Global shortcuts (F1, Ctrl+S, Ctrl+N, Ctrl+O, Ctrl+W, Ctrl+A, Ctrl+T, etc.)
- Customizable shortcuts (key capture + conflict detection)
- Shortcut help panel
- Debug mode (Ctrl+Shift+D)

## Tech Stack

| Technology | Purpose |
|------------|---------|
| Electron | Cross-platform desktop framework |
| Quill 1.3.6 | Rich text editor |
| KaTeX | Math formula rendering |
| Lucide | Icon library |
| archiver / unzipper | ZIP packaging and extraction |
| Vanilla JavaScript | Renderer process logic |
| CSS Variables | Theme system |

## Quick Start

### Prerequisites

- Node.js >= 16
- npm

### Install & Run

```bash
cd JS
npm install
npm start
```

### Build

```bash
cd JS
npx electron-builder --win
```

Build output is placed in `WE-Release/` at the project root.

## Project Structure

```
World Editor/
├── JS/                        # Electron version (main development)
│   ├── main.js                # Main process
│   ├── preload.js             # Preload script
│   ├── package.json
│   ├── electron-builder.yml   # Build config
│   ├── renderer/              # Renderer process
│   │   ├── main.html
│   │   ├── splash.html
│   │   ├── css/style.css      # Global styles
│   │   ├── js/tabs/           # Feature modules
│   │   │   ├── editor.js      # Editor
│   │   │   ├── project.js     # Project management
│   │   │   ├── filetree.js    # File tree & multi-select
│   │   │   ├── settings.js    # Settings page
│   │   │   ├── shortcuts.js   # Shortcut system
│   │   │   ├── tab-manager.js # Tab management
│   │   │   ├── tags.js        # Tag system
│   │   │   ├── account.js     # Account system
│   │   │   ├── welcome.js     # Welcome page
│   │   │   ├── node-graph.js  # Node graph editor
│   │   │   ├── command-palette.js  # Command palette
│   │   │   ├── i18n.js        # Internationalization
│   │   │   └── ...
│   │   └── lib/               # Third-party libs (Quill, KaTeX, Lucide, G6)
│   ├── resources/             # Resources
│   │   ├── UPDATE_INF/        # Version update logs
│   │   ├── Tutorial/          # Tutorial files
│   │   └── icon.png
│   └── User/                  # User data (runtime-generated)
│       ├── lang/              # Language files (zh_CN, en, ja, ru)
│       ├── account.json       # Account info
│       └── settings.json      # User settings
├── Python_Vision/             # Python version (early prototype, unmaintained)
└── README.md
```

## Version History

### v0.7.0
- **Node Graph Editor**: Pure SVG/CSS engine (NGEngine) with 5 node types, 4 connection styles, Bezier ports, property panel
- **Global/Local Undo/Redo System**: PS-style history panel with drag and viewport clamping
- **UI Layout Refactor**: Three-state OA/TA mode, Lucide icon navigation, smooth transitions
- **Settings User Profile Card**: Avatar, bio editing, collapse animation
- "Default Open First Item" toggle in Settings > General
- i18n completion (bio/history/default_open_first translations)
- Multiple bug fixes for node graph, settings page, and history panel

### v0.6.0
- Project pinning (welcome page + editor sidebar), first-run tutorial auto-pin
- Rich text color & alignment (text color, background color, left/center/right/justify)
- File multi-select & batch operations (batch add/remove tags, batch delete)
- Folder tag support
- `recent.json` structure upgraded to `{ pinned, recent }`

### v0.5.0
- Multi-format export (Markdown / HTML / PDF / ZIP)
- Background material system enhancement (Tabbed type + 3-layer opacity sliders)
- Added Japanese and Russian language packs
- Custom color picker for tags
- Save debounce and startup optimization

### v0.4.2
- i18n translation improvements
- Tag system refactor (frequent tag tracking, pinned tag management panel)

### v0.4.0
- Multi-theme system (13 presets + custom colors)
- Account system (avatar, local storage, inline editing)
- Pure Markdown mode
- File jump functionality
- Debug mode (Ctrl+Shift+D)

### v0.3.0
- Keyboard shortcut system with customization
- Tab context menu (pin / close / rename)
- Live editing statistics
- File drag-and-drop import

### v0.2.0
- Colored file tags and thumbnails
- Project search functionality
- Markdown export
- File tree sidebar improvements

### v0.1.0
- Basic editing features
- Project creation and management
- Theme switching and multi-language support

Detailed changelogs: [JS/resources/UPDATE_INF/](JS/resources/UPDATE_INF/).

## Developer

[firefairyZz](https://github.com/firefairyZz)

## License

MIT