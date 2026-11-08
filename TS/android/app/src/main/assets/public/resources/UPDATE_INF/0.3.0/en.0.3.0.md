# World Editor v0.3.0

## New Features

### Shortcut System
- `F1` or `Ctrl+/`: Show shortcut help panel
- `Ctrl+S`: Save current file
- `Ctrl+N`: New file/project
- `Ctrl+O`: Open project
- `Ctrl+W`: Close current tab
- `Ctrl+Tab` / `Ctrl+Shift+Tab`: Switch tabs
- `Ctrl+1~9`: Jump to specified tab

### Shortcut Customization
- New "Shortcuts" category in settings page
- Click input box then press key combination to modify
- Conflict detection to avoid duplicate bindings
- Each shortcut can be individually reset to default
- Settings persist and take effect after restart
- Shortcut help panel automatically syncs custom shortcuts

### Tab Right-Click Menu
- Pin/unpin tabs (pinned tabs move to front with indicator)
- Close tab
- Close other tabs
- Close tabs to the right
- Rename tab

### Real-time Editing Statistics
- Word count
- Character count
- Paragraph count
- Estimated reading time (based on 200 words/min)

### File Drag & Drop Import
- Support dragging files from system into app
- Supported formats: .txt, .md, .doc, .docx, .rtf, .log, .csv, .json, .xml, .html, .css, .js
- Import preview shown when dragging
- Auto file overwrite prompt

## UI Improvements

- Close button red corrected to Windows standard red `#e81123`
- Window resize background fixed, unified with interface background
- Progress bar contrast enhanced, track and fill colors clearly distinguished
- Shortcut help panel beautified design
- Tab right-click menu modernized style
- Status bar enhanced with real-time editing statistics display

## Bug Fixes

- Fixed window infinitely resizable issue (added minimum size 800x500)
- Fixed bottom background abruptness during window resize
- Fixed theme switch not updating window background color
- Fixed Quill toolbar show/hide compatibility issue
- Fixed some details in update notes Markdown rendering
