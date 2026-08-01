# World Editor v0.4.0

## New Features

### Multi-Theme System
- Built-in 13 preset themes
  - Light: WE Exclusive, Default Light, GitHub Light, Solarized Light, Nord Light
  - Dark: Default Dark, Dracula, Monokai, Solarized Dark, Nord, GitHub Dark, One Dark
- Custom themes: Freely adjust 7 colors including main background, sidebar, editor, accent
- Real-time theme preview and one-click switch

### Account System
- New account avatar button in title bar (on the left of pin, with separator)
- Auto-opens registration tab when no account found on first launch
- Simple registration: only account name (required) and display name
- Auto-generate initial avatar when no photo uploaded (random color background)
- Local account data storage (`User/account.json`), not included in package
- Upload/remove custom avatar support (2MB limit)
- Account name validation: English, numbers, underscores, hyphens only (2-20 chars)
- Display name supports any character (up to 30 chars)
- Inline editing in settings account section (click "Edit", Enter/blur to confirm, Esc to cancel)
- Double confirmation for account deletion to prevent accidental operation
- Project creation page "Owner" dynamically displays current account name and avatar

### Pure Markdown Mode
- Optional pure Markdown mode when creating project (cannot be modified after creation)
- Collapsible real-time preview panel
- Markdown-exclusive toolbar
- Compatible with existing save and status bar features

### File Jump Feature
- Supports project-internal file + heading navigation (text anchors, stable)
- Supports external URL jumping
- Both rich text and Markdown toolbars provide jump buttons

### Debug Mode
- `Ctrl+Shift+D` to open debug panel
- Quick actions: create/delete test projects, list recent projects, export state, clear cache
- Real-time status display
- Operation log recording
- Quick DevTools access

## UI Improvements

- Text readability: WE Exclusive theme colors adjusted, deeper text, higher contrast
- Pin icon redesigned to clearer pushpin shape
- Settings account section uses vertical centered layout (avatar on top, name/nickname below)
- Settings bottom bar unified: delete account on left, apply button on right
- Centered layout for account registration page, consistent with new project page
- Global scrollbar beautified: rounded design, narrow style, hover highlight, theme color adaptive

## Project Creation Improvements

- Removed "Initialize Project" option to avoid conflicts with template/description fields
- Filling project description auto-creates README.txt
- Selecting template ensures README exists

## Bug Fixes

- Fixed settings page delete account button initially visible issue
- Fixed delete account button incorrectly opening edit dialog issue
- Fixed account info changes not syncing to title bar and project creation page in real-time
