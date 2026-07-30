# World Editor

A lightweight world-building editor built with Electron, designed for creators. Supports project management, multi-tab editing, rich text / Markdown dual-mode, file tree browsing, tag systems, and more.

## Features

### Editor
- Quill-based rich text editor
- Real-time Markdown rendering and export
- Live editing statistics (word count, character count, paragraph count, estimated reading time)
- Auto-save
- Customizable font family and size

### Project Management
- Create, open, and manage projects
- File tree browsing (resizable sidebar)
- File drag-and-drop import (supports .txt, .md, .doc, .docx, .rtf, .log, .csv, .json, .xml, .html, .css, .js)
- Project-level search (filename, tag, content search with wildcards and fuzzy matching)
- Colored file tags and thumbnails

### Tabs
- Multi-tab editing
- Tab context menu (pin / close / close others / close to the right / rename)
- Keyboard tab switching (Ctrl+Tab / Ctrl+1~9)

### Keyboard Shortcuts
- Global shortcut support (F1, Ctrl+S, Ctrl+N, Ctrl+O, Ctrl+W, etc.)
- Customizable shortcuts (key capture + conflict detection)
- Shortcut help panel

### UI
- Frameless window with custom title bar
- Dark / Light theme switching
- Multi-language support (Chinese / English)
- Always-on-top window
- Splash screen

## Tech Stack

| Technology | Purpose |
|------------|---------|
| Electron | Cross-platform desktop framework |
| Quill | Rich text editor |
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

Build output is placed in `JS/dist/`.

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
│   │   │   ├── filetree.js    # File tree
│   │   │   ├── settings.js    # Settings page
│   │   │   ├── shortcuts.js   # Shortcut system
│   │   │   ├── tab-manager.js # Tab management
│   │   │   ├── tab-context-menu.js  # Tab context menu
│   │   │   ├── file-drop.js   # File drag-and-drop
│   │   │   ├── i18n.js        # Internationalization
│   │   │   └── ...
│   │   └── lib/               # Third-party libraries
│   ├── resources/             # Resources
│   │   ├── UPDATE_INF/        # Version update logs
│   │   └── icon.png
│   └── User/                  # User data
│       ├── lang/              # Language files
│       └── settings.json      # User settings
├── Python_Vision/             # Python version (early prototype)
└── README.md
```

## Version History

### v0.3.0
- Keyboard shortcut system with customization
- Tab context menu (pin / close / rename)
- Live editing statistics
- File drag-and-drop import
- Window resizing and theme background fixes

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
