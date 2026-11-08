# World Editor v0.6.0

## New Features
- **Project Pinning**: The welcome page now has a "Pinned Projects" section. Pin frequently used projects to the top (with pin icon and last-modified time). A pin button is added next to the project name in the editor sidebar for quick pin/unpin. New projects can be pinned at creation via a checkbox.
- **First-Run Tutorial**: On first launch, the "Tutorial" is automatically pinned to the welcome page. In packaged builds, the tutorial is copied from app resources to the user data directory.
- **Rich Text Color & Alignment**: The Quill toolbar now supports text color, background color, and text alignment (left/center/right/justify).
- **File Multi-Select & Batch Operations**: The file tree supports Ctrl+Click multi-select, Shift+Click range select, and Ctrl+A select all. A toolbar appears at the bottom when items are selected, supporting batch add tags, batch remove tags, and batch delete.
- **Folder Tags**: Folders now support adding and managing tags. A "Manage Tags" option is added to the folder context menu, with tags displayed next to the folder name.
- **Batch Remove Tags**: A tag selection panel shows each tag's hit count across selected items; check tags and remove them in one click.

## Shortcuts
- Added **Ctrl+A** (Select All Files) and **Ctrl+T** (Batch Add Tags) shortcuts, customizable in Settings.

## Improvements
- `recent.json` structure upgraded to `{ pinned, recent }`, backward compatible with the old flat array format.
- Pinned projects are no longer overwritten by the "Recent" list; pin status stays in sync between the welcome page and the editor.
