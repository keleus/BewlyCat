# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BewlyCat is a browser extension that enhances the Bilibili homepage experience. Based on BewlyBewly, this fork adds personalized features and optimizations for individual usage patterns. The extension transforms the Bilibili interface with a modern design, custom features, and improved user experience.

## Development Environment

### Package Manager
- Uses `pnpm` as the package manager

### Key Development Commands
- `pnpm dev` - Start development mode for Chrome/Edge
- `pnpm dev-firefox` - Start development mode for Firefox
- `pnpm build` - Build for production (Chrome/Edge)
- `pnpm build-firefox` - Build for Firefox
- `pnpm build-safari` - Build for Safari
- `pnpm lint` - Run ESLint
- `pnpm lint:fix` - Run ESLint with auto-fix
- `pnpm typecheck` - Run TypeScript type checking
- `pnpm test` - Run tests with Vitest
- `pnpm start:chromium` - Run extension in Chromium browser
- `pnpm start:firefox` - Run extension in Firefox browser

### Build Process
The project uses a multi-target build system:
- Chrome/Edge: builds to `extension/` directory
- Firefox: builds to `extension-firefox/` directory
- Safari: builds to `extension-safari/` directory

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
- The relevant Bilibili API documentation can be found in `context7`’s `Bilibili API Collect`(`socialsisteryi/bilibili-api-collect`)
- Uses Vue 3 with Composition API and TypeScript
- Vite for build tooling with multiple config files for different targets
- UnoCSS for utility-first styling
- Auto-imports for Vue and webextension-polyfill
- Extensive use of Shadow DOM for style isolation
- Platform-specific builds with conditional manifest generation
