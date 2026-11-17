# JURO

JURO is a browser-based messaging UI demo with local chats, contacts, groups, status updates, call history, and settings.

## Run locally

For normal use, open `index.html` in a modern browser. Data is stored in that browser's local storage; messages and calls are not sent to other devices.

## Install from Chrome

JURO is an installable Progressive Web App. To enable installation and offline use, serve this folder from `localhost` while developing or publish it to a site using HTTPS. Opening `index.html` directly as a `file://` URL does not enable Chrome app installation or service workers.

### Publish the app

Upload this folder, including `manifest.webmanifest`, `service-worker.js`, and `icons/`, to any static web host that provides HTTPS (for example, GitHub Pages, Netlify, or Cloudflare Pages). Then share the host's public URL. Installation is not available from a local `file://` URL.

### Install on phones and computers

- **Android:** Open the HTTPS URL in Chrome and choose **Install app** from the address bar or menu. JURO also shows an install button when Chrome makes installation available.
- **iPhone/iPad:** Open the HTTPS URL in Safari, tap **Share**, then choose **Add to Home Screen**.
- **Windows/macOS:** Open the HTTPS URL in a PWA-capable browser such as Chrome or Edge and use its **Install app** option.

JURO includes home-screen icons and standalone display settings. The service worker caches the app shell for offline access. This version is a local demo: each person’s chats and settings stay on that device and are not shared or synced.

## Files

- `index.html` — app layout
- `style.css` — responsive styling and themes
- `script.js` — demo interactions and local storage
- `manifest.webmanifest` — app name, icons, and install display settings
- `service-worker.js` — offline app-shell caching
- `icons/` — app icons used by Chrome
