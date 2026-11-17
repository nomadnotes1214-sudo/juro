# JURO

JURO is a browser-based messaging UI demo with local chats, contacts, groups, status updates, call history, and settings.

## Run locally

For normal use, open `index.html` in a modern browser. Data is stored in that browser's local storage; messages and calls are not sent to other devices.

## Install from Chrome

JURO is an installable Progressive Web App. To enable installation and offline use, serve this folder from `localhost` while developing or publish it to a site using HTTPS. Opening `index.html` directly as a `file://` URL does not enable Chrome app installation or service workers.

On a supported Chrome browser, open the served site and use Chrome's **Install JURO** option in the address bar or menu. The in-app install button appears in Settings when Chrome makes installation available.

The service worker caches the app shell for offline access. User data remains in the browser's local storage.

## Files

- `index.html` — app layout
- `style.css` — responsive styling and themes
- `script.js` — demo interactions and local storage
- `manifest.webmanifest` — app name, icons, and install display settings
- `service-worker.js` — offline app-shell caching
- `icons/` — app icons used by Chrome
