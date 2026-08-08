# World Editor v0.7.0

## New Features
- **Node Graph Editor**: A brand-new pure SVG/CSS node graph engine (NGEngine) with 5 node types (Character·rounded rect red / Scene·rect blue / Event·ellipse green / Setting·diamond purple / Chapter·rect orange), 4-directional Bezier connection ports, 4 connection styles (Relation·solid blue / Timeline·solid green / Causality·dashed orange / Belonging·arrowless purple); supports drag-to-create nodes, Shift+drag marquee selection, wheel zoom (20%-400%), real-time coordinate display; property panel for node/edge attribute editing, layer management, and type switching; automatic migration of legacy LogicFlow/G6 data.
- **Global/Local Undo/Redo System**: A Photoshop-style history panel supporting both global (cross-file) and local (single-file) undo modes, with up to 50 steps of operation history. The panel is draggable and automatically clamped to the viewport on window resize.
- **UI Layout Refactor**: Introduced a three-state mode system (OA welcome page / directory-only / full TA), with a unified .only-left toggle mechanism shared between settings and project pages. Sidebar background smoothly transitions between OA and TA modes. Settings navigation now features Lucide icons (General/Tags/Account/Appearance/Editor/Shortcuts/About).
- **Settings User Profile Card**: Added user avatar, display name, and bio/signature area above the settings navigation. Supports editing the signature in the Account tab, with a smooth collapse animation when switching OA/TA modes.
- **"Default Open First Item" Toggle**: Added to Settings > General. When enabled, settings/editor always open in TA mode (dual-pane). Default: off.
- **i18n Completion**: Added missing translations for ui.bio, ui.bio_placeholder, ui.bio_empty, ui.history, ui.default_open_first, covering Chinese, English, Japanese, and Russian.

## Improvements
- Settings page now has a draggable split bar, using the same .area-resizer logic as the project file tree.
- Editor toolbar (rich text) and node graph toolbar now share a unified minimum height (44px) and button size (32×32).
- Node graph property panel inputs, dropdowns, and color pickers use the --bg-input CSS variable for consistent theme adaptation.
- Enhanced save debounce logic; node graph content uses dual-key caching (full path + filename) to prevent data loss when switching files.

## Bug Fixes
- Fixed settings navigation highlight overflowing rounded corners (added overflow: hidden to .settings-nav-items).
- Fixed node graph edge color validation (regex ^#(3/6 hex)$) and single-edge rendering error tolerance.
- Fixed node graph edge hit detection using a 28px wide transparent hit path for easy selection of small edges.
- Fixed node graph text scaling after zoom (SVG_fontSize = clamp(MIN, base×zoom, MAX)/zoom).
- Fixed node graph camera movement bounds, accounting for zoom factor and dynamic padding.
- Fixed history panel exceeding viewport boundaries during drag and window resize.
- Fixed Quill editor residual display issue (moved to #quill-storage container when closing tabs).