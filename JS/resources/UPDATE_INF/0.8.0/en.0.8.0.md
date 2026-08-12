# World Editor v0.8.0

## New Features

### Card System (Brand New)
- **Image Card (ImageCardBlot)**: Insert image cards in the rich text editor. Supports drag-to-resize, caption editing, selection/multi-selection/batch deletion. Legacy `<img>` tags are automatically upgraded to ImageCard.
- **URL Card (UrlCardBlot)**: Inline-level card displaying a link icon and URL. Double-click to open the external link directly.
- **File Link Card (FileLinkCardBlot)**: Displays file icon, filename, and description. Double-click to jump to the target file within the project.
- **Node Graph Card (NodeGraphCardBlot)**: Displays a real-time node graph thumbnail (SVG rendered). Double-click to open the embedded node graph editor. Supports centering on a specified target node.
- Cards support Shift/Ctrl+click multi-selection, Delete/Backspace batch deletion, and ESC to deselect.

### Node Graph HTML Export
- Node graphs can be exported as standalone HTML pages with full SVG rendering, Bezier connections, mouse drag-to-pan, wheel zoom (20%-400%), and node hover tooltips (name/description).
- Exported files work independently in any browser without the editor.

### Shared SVG Rendering Engine
- Extracted `generateNodeGraphSVG()` as a shared function, unifying the rendering pipeline for node graph HTML export and thumbnail generation, ensuring visual consistency.
- Supports customizable viewport, background color, grid, node opacity, edge stroke width, and non-scaling stroke options.

### File Description System
- New "Manage Description" entry in the file tree right-click menu, allowing multi-line text descriptions for files.
- Description text is displayed below the filename in the file tree.
- Description data is stored via `tagModule.getDesc()` / `setDesc()` in the metadata file.

### Smart Brackets
- Editor auto-completes paired brackets (`()`, `[]`, `{}`, `""`, `''`) with backspace support for deleting paired brackets.

## Architecture Refactor
- **CSS Architecture Refactor**: Split `style.css` into 5 modular CSS files (`base.css` / `layout.css` / `components.css` / `node-graph.css` / `quill.css`), improving maintainability and loading performance.
- **Editor Module Split**: Refactored `editor.js` into independent modules under `editor/` directory (`core.js` / `markdown.js` / `export.js` / `links.js` / `mode-switch.js` / `blots.js` / `globals.js` / `embed.js` / `undo.js` / `toolbar.js` / `smart-brackets.js`), reducing file coupling.

## Improvements
- **Settings nav i18n refresh optimization**: Preserves Lucide icon SVGs when refreshing navigation text, preventing icon loss.
- **Transparent mode solid color variables**: Added `--bg-sidebar-solid`, `--bg-main-solid`, `--border-solid` CSS variables to ensure toggle switches, inputs, and other components use solid backgrounds in transparent mode.
- **Node graph port direction propagation**: `getPortPos()` now returns the port side direction, ensuring correct Bezier control point calculation.
- **Node graph HTML export pan optimization**: Relaxed drag event restrictions to allow panning on any SVG area while excluding toolbar buttons.
- **Thumbnail AABB calculation fix**: Uses center coordinates (`n.x ± halfWidth`) for node bounds calculation, consistent with the NGEngine coordinate system.
- **Deselect cards on tab switch/close**: `_deselectImageCard()` ensures proper card selection state cleanup when switching tabs.
- **Dialog utility function**: Added `showTextInputDialog()` for translation-aware text input dialogs.

## Bug Fixes
- **Fixed all popup (warning/prompt/confirm) styling loss**: Truncated CSS selector at line 1220 in `components.css` invalidated all subsequent styles; `default-src 'self'` in CSP blocked CSS loading under `file://` protocol; added missing dialog button, confirmation box, and mode switch box styles.
- **Fixed non-Bezier curves in exported HTML**: Port direction was not propagated, causing incorrect control point calculation.
- **Fixed inability to pan in exported HTML**: Drag event restrictions were too strict.
- **Fixed rendering inconsistency between thumbnails and exported HTML**: Both used independent SVG generation logic — now unified via the shared rendering function.
- **Fixed node position misalignment**: Thumbnail AABB calculation incorrectly treated node center coordinates as top-left corner coordinates.
- Various file tree, tag system, and settings page fixes.