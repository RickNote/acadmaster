# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AcadMaster (学术大拿) is a Chrome extension (Manifest V3) for academic translation. It supports text selection translation, full-document translation (with bilingual comparison mode), OCR-based image translation, and an embedded PDF viewer. Written in vanilla JavaScript with no build system or package manager.

## Development Commands

### Loading the Extension
1. Open Chrome -> `chrome://extensions/` -> Enable "Developer mode"
2. Click "Load unpacked" -> select the `acadmaster` folder
3. After code changes, click the refresh icon on the extension card to reload

### Testing
No automated tests exist. Manual testing:
- Select text on any webpage -> click the translation icon or right-click -> "Translate Selection"
- `Alt+Shift+X` -- translate selection
- `Alt+Shift+D` -- translate full document
- Right-click an image -> confirm OCR translation
- Open a local PDF file to test the embedded viewer
- Click extension icon -> open settings page (`options.html`)
- Settings -> test API keys with the "测试" button next to each key input
- Settings -> "翻译历史" tab to view/search/clear translation history

### Packaging
Zip the `acadmaster` folder for Chrome Web Store submission. No build step required.

## Architecture

### Extension Layers

**Background (Service Worker)** -- `src/background/service-worker.js`
- Single file acting as the API gateway for all translation requests
- Message types: `REQUEST_TRANSLATE`, `REQUEST_STREAM_TRANSLATE`, `REQUEST_BATCH_TRANSLATE`, `REQUEST_OCR_TRANSLATE`, `REQUEST_DOCUMENT_TRANSLATE`, `TEST_API_KEY`, `GET_TRANSLATION_HISTORY`, `CLEAR_TRANSLATION_HISTORY`, `SETTINGS_UPDATED`
- Uses `chrome.alarms` API (not `setInterval`) for periodic cache cleanup -- MV3 service workers are terminated after ~30s idle
- LRU translation cache (max 200 entries) keyed by full-text djb2 hash via `simpleHash()`
- All API calls go through `safeFetch()` which throws on non-2xx HTTP status
- `buildPrompt()` centralizes prompt construction for all 7 domain profiles (default, academic, medical, legal, technical, literature, business)
- `translateSingle()` core translation function with auto-fallback to Google Translate when the configured engine fails, and auto language direction detection via `detectLanguageQuick()`
- `translateBatch()` uses 5-worker concurrency pool for parallel document translation
- `fuseResults()` selects the best result purely by `ENGINE_WEIGHTS` -- no hardcoded engine preference
- Streaming protocol: `TRANSLATION_START` -> `TRANSLATION_CHUNK`* -> `TRANSLATION_END`
- `saveToHistory()` persists last 50 translations to `chrome.storage.local`
- Returns `{ text, detectedLang, fallbackEngine }` from translation functions so UI can show source language and fallback notices
- API keys stored in `chrome.storage.local` (not `sync`) to avoid syncing secrets to Google account

**Content Scripts** -- `src/content/`
- All modules attach to `window` globals (e.g., `window.TranslatorUI`, `window.ContentAdapter`)
- Loaded synchronously in this exact order (defined in `manifest.json`):
  1. `tesseract-full.js` -- vendored Tesseract.js OCR library
  2. `full-ocr-implementation.js` -- OCR engine wrapper
  3. `utils.js` -- shared helpers (`simpleHash`, `validateAndSanitize`, `getSettings`/`setSettings`)
  4. `styles.js` -- ShadowDOM CSS definitions (includes responsive card styles and `:host(.dark-mode)` toggle)
  5. `drag.js` -- draggable card behavior
  6. `ui.js` -- ShadowDOM-isolated translation card UI
  7. `adapter.js` -- site-specific content extraction configs
  8. `context-processor.js` -- surrounding paragraph/heading context extraction
  9. `document-translator.js` -- full-page batch translation with bilingual mode
  10. `ocr-translator.js` -- OCR pipeline
  11. `main.js` -- entry point that instantiates and wires everything together

Key module details:
- `main.js` -- instantiates all modules, registers event listeners (mouseup, keyboard shortcuts, `chrome.runtime.onMessage`); calls `ocrTranslator.destroy()` on `beforeunload`; listens to `chrome.storage.onChanged` for live settings sync across tabs; polls `documentTranslator.getProgress()` during document translation and updates UI progress bar; syncs dark mode to ShadowDOM host via `applyDarkMode()`
- `ui.js` -- `showResult()` accepts `detectedLang` and `fallbackEngine` to display source language badge and engine fallback notice; `showError()` renders error state with "open settings" action button; `updateProgress()` drives the document translation progress bar; `_autoResize` batched via `requestAnimationFrame`; `positionCard()` has full viewport collision detection (flips above selection when below would overflow); responsive card width via CSS `@media (max-width: 768px)`
- `utils.js` -- `validateAndSanitize()` uses `DOMParser` to strip dangerous tags and all `on*` event attributes; `getSettings`/`setSettings` wrap `chrome.storage.local` with `lastError` checks
- `adapter.js` -- uses semantic selectors for sites (not CSS-in-JS generated class hashes); `isLikelyUIElement()` handles SVG elements where `className` is `SVGAnimatedString`
- `context-processor.js` -- `findContainingBlockElement()` checks known block tag names first (fast path) before falling back to `getComputedStyle`; `findNearbyHeadings()` traverses at most 5 levels up
- `document-translator.js` -- uses `sendResponse` callback pattern; `extractTextSegments()` deduplicates elements via `Set`; supports bilingual mode (`applyTranslations` inserts styled translation node below original instead of replacing it); `restoreOriginalText()` removes bilingual nodes and restores `data-original-html`
- `ocr-translator.js` -- `initialize()` only sets `isInitialized = true` on actual success; `cleanOCRResult()` uses context-aware character fixes; `destroy()` terminates the web worker

**Popup** -- `src/popup/`
- Minimal: opens settings page or PDF viewer

**PDF Viewer** -- `src/pdf/`
- Vendored PDF.js build with custom academic viewer (`academic-viewer.js`)
- Character maps in `cmaps/`, locale files for 60+ languages

**Settings** -- `options.html` / `options.js`
- Configures: translation engine, API keys (with inline "测试" validation buttons), target language (12 languages), prompt profile, dark mode, bilingual mode
- All settings stored via `chrome.storage.local`
- On save, sends `SETTINGS_UPDATED` message to service worker to clear cached translations
- Translation history tab: loads history from service worker, supports search filtering and clearing
- System font stack (no external font loading)
- Responsive sidebar: collapses to horizontal tab bar on `<768px` screens

### Communication Flow

Content scripts send requests via `chrome.runtime.sendMessage()` with a callback for the response (`sendResponse` pattern). The service worker calls external APIs and returns results through the callback. Streaming translations bypass the callback and use the chunked message protocol instead. Settings changes propagate live to all open tabs via `chrome.storage.onChanged`.

### Translation Engines

| Engine | Key Required | Streaming | Auto-Fallback |
|--------|-------------|-----------|---------------|
| Google Translate | No | No | N/A (is the fallback) |
| DeepL | Yes | No | Yes -> Google |
| DeepSeek (V3) | Yes | Yes | Yes -> Google |
| OpenAI (GPT-4o) | Yes | Yes | Yes -> Google |
| Multi-Engine Fusion | Yes (multiple) | Yes | Per-engine |

### Key Conventions

- Script load order in `manifest.json` matters -- dependencies must come before dependents
- `all_frames: false` -- content scripts only run in the top frame, not iframes
- UI rendered inside ShadowDOM to avoid style conflicts with host pages; dark mode toggled via `:host(.dark-mode)` CSS class
- User-facing strings are in Chinese (zh-CN)
- No external dependencies beyond vendored PDF.js and Tesseract.js
- Cache keys always use full-text djb2 hash (never truncated) to prevent collisions
- All `chrome.storage` calls check `chrome.runtime.lastError`
- Translation results from OCR and document flows come back via `sendResponse` callback, not via separate `onMessage` events
- `translateSingle()` returns `{ text, detectedLang, fallbackEngine }` -- callers must extract `.text` for the translated string
- Auto language detection uses character-range heuristics (no API call) to flip translation direction when source matches target
