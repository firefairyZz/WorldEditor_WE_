# World Editor v0.5.0

## Features & Improvements
- **Multi-format Export**: The "Export Markdown" button is upgraded to a dropdown menu supporting **Markdown / HTML / PDF / ZIP**. PDF is generated via a hidden window's `printToPDF` (A4, no margins, preserves background); ZIP packages the entire project.
- **Background Material System**: Adds a new **Tabbed** material type, plus three transparency sliders for **content / overlay / title bar** (defaults 78% / 30% / 100%) with live preview in Settings; sliders auto-disable when material is "None".
- **New Language Packs**: Full **Japanese** and **Russian** translations added, with corresponding options in the language dropdown.
- **Tag Custom Colors**: A color picker is added beside the preset palette, supporting any custom color with two-way sync.
- **Save Debouncing**: Repeated save requests during an in-flight save are queued and flushed automatically; a persistent "Saving..." notification is shown and switched to "Saved" on completion.
- **Startup Optimization**: The main window now waits for `ready-to-show` before displaying, eliminating the startup white flash.
- **Pin Icon**: Switched to a `pin.svg` resource; activation state distinguished via `rotate(45deg)`.
- **Layout & Styling**: The page is restructured into a title-bar / tab-bar / #main three-section layout; `html`/`body` are always transparent with opacity handled by child blocks; the tag selector dialog gains a frosted-glass overlay and slide-up animation.
- **i18n Refresh**: Completed multi-language refresh for the tags, account, and appearance (material + color preset) sections.

## Bug Fixes
- Fixed garbled line breaks and formatting when loading rich-text content (HTML via `dangerouslyPasteHTML`, plain text via `setText`).
- Fixed body formatting anomaly caused by the Quill header dropdown default value (changed from `""` to `"false"`).
- Fixed old semi-transparent colors polluting the new theme after switching color presets (theme-color cache is cleared and material reapplied on switch).
- Fixed opaque window background overriding material effects (window is always transparent; rounded corners handled by CSS `clip-path`).
- Normalized filename display: jump dialog, tag titles, and export filenames now consistently strip extensions and paths.
