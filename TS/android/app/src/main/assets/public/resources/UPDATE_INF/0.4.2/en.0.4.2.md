# World Editor v0.4.2

## Features & Improvements
- **Improved i18n Support**: Fixed untranslated keys in the UI and restructured the update log directory to support bilingual versions (`vx.y.z/cn.md` and `vx.y.z/en.md`).
- **Tag System Refactoring**: Overhauled the underlying link logic. Added automatic tracking for **Common Tags**, and introduced a new **Pinned Tags** management panel in the settings for quick access.
- **Editor UX Enhancements**: Optimized the document Table of Contents (TOC) reading logic. Fixed a bug in Rich Text mode where adding tags could accidentally erase text.

## Bug Fixes
- Fixed tag popup positioning and background overlay resize issues.
- Improved bottom button bar layout to ensure action buttons remain fixed to the bottom of the popup, separate from the scrollable content.
- Unified the card visual style of the tag panel with the main Settings page for a consistent experience.