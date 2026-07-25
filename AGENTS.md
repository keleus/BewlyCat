# AGENTS.md

This file provides guidance to coding agents working in this repository.

## Project Overview

BewlyCat is a browser extension that enhances the Bilibili homepage experience. Based on BewlyBewly, this fork adds personalized features and optimizations for individual usage patterns. The extension transforms the Bilibili interface with a modern design, custom features, and improved user experience.

## Development Environment

### Package Manager
- Uses `pnpm` as the package manager

### Key Development Commands
- `pnpm lint` - Run ESLint
- `pnpm lint:fix` - Run ESLint with auto-fix
- `pnpm typecheck` - Run TypeScript type checking

### Verification Requirement (MANDATORY)
After **every** code change—no matter how small—agents MUST run both commands below and ensure they pass before considering the work complete:
```powershell
pnpm lint
pnpm typecheck
```
This is non-negotiable. A "one-line cosmetic change" can still break TypeScript (e.g. a component prop that became `required` upstream) or trip ESLint rules. Local `typecheck` passing is the leading indicator for CI; skipping it lets failures reach the PR and wastes a CI cycle.

### Build Process
The project uses a multi-target build system:
- Chrome/Edge: builds to `extension/` directory
- Firefox: builds to `extension-firefox/` directory

## Architecture Overview

### Extension Structure
- **Background Script** (`src/background/`) - Handles API calls, messaging, and browser events
- **Content Scripts** (`src/contentScripts/`) - Main app logic that runs on Bilibili pages
- **Popup** (`src/popup/`) - Extension popup interface
- **Options** (`src/options/`) - Settings page
- **Inject Scripts** (`src/inject/`) - Scripts injected into page context

### Key Components
- **TopBar** (`src/components/TopBar/`) - Custom navigation bar with search, notifications, user panel
- **Dock** (`src/components/Dock/`) - Sidebar navigation with customizable app pages
- **VideoCard** (`src/components/VideoCard/`) - Enhanced video cards with additional features
- **Settings** (`src/components/Settings/`) - Comprehensive settings interface
- **App Views** (`src/contentScripts/views/`) - Page-specific components (Home, Anime, History, etc.)

### State Management
- **Pinia Stores** (`src/stores/`) - State management for settings, top bar, main app
- **Settings Store** - Manages user preferences and extension configuration
- **Local Storage** - Persistent settings storage using browser storage API

### API Integration
- **Bilibili API** (`src/models/`) - Data models for videos, anime, favorites, etc.
- **Message Listeners** (`src/background/messageListeners/`) - Handle background API requests
- **Auth Provider** (`src/utils/authProvider.ts`) - Authentication and session management

### Key Features Architecture
- **Shadow DOM** - Main app runs in Shadow DOM for style isolation
- **Multi-platform Support** - Chrome, Firefox, Safari with platform-specific optimizations
- **Internationalization** - Vue i18n for multi-language support
- **Dark Mode** - Custom dark mode with user-configurable base colors
- **Video Player Controls** - Enhanced player with custom modes and shortcuts
- **Wallpaper System** - Local and remote wallpaper support

## Important Files
- `src/contentScripts/index.ts` - Main entry point, handles page initialization
- `src/background/index.ts` - Background service worker setup
- `src/manifest.ts` - Extension manifest configuration
- `src/logic/storage.ts` - Settings management
- `src/utils/shortcuts.ts` - Keyboard shortcuts handling
- `src/utils/player.ts` - Video player enhancements
- `src/background/messageListeners/api` - Bilibili API definitions directory
- `src/_locales` - I18n

## Development Notes
- Uses Vue 3 with Composition API and TypeScript
- Vite for build tooling with multiple config files for different targets
- UnoCSS for utility-first styling
- Auto-imports for Vue and webextension-polyfill
- Extensive use of Shadow DOM for style isolation
- Platform-specific builds with conditional manifest generation

## 提交规范
- 提交信息使用 Conventional Commits 格式，如 `feat:`、`fix:`、`refactor:`、`docs:`、`chore:`。
- 冒号后的提交说明使用中文，并准确概括本次修改。
- 禁止PR提交tests文件和AGENTS.md
- 如果在[issues](https://github.com/keleus/BewlyCat/issues)存在对应的issue，commit信息后通过`#{issue}`关联对应的issue
