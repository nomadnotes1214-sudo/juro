# JURO

JURO is an installable messaging PWA. Without Supabase configuration it runs as a device-local demo. With Supabase configured it supports phone OTP sign-in and real-time one-to-one/group text chats.

The app opens on the phone sign-up screen. If Supabase is not configured, SMS verification is unavailable; the screen explains what is needed and offers an explicit local-demo option.

## Run locally

Serve the folder from `localhost` while developing. Opening `index.html` directly shows the phone sign-up screen and local-demo option, but service workers and phone authentication require a secure origin.

## Enable phone sign-in and real chats

1. Create a Supabase project and run [`supabase/schema.sql`](./supabase/schema.sql) in its SQL Editor.
2. In Supabase Auth, enable Phone sign-in and configure an SMS provider. SMS delivery and billing are controlled by that provider.
3. Copy the project URL and public anon/publishable key into `supabase-config.js`. Never put a `service_role` key in browser code.
4. Add the local and deployed HTTPS URLs to Supabase Auth's allowed site/redirect URL settings.
5. Serve or deploy the folder over HTTPS. Users can register or sign in with their phone, verify the SMS code, and start chats by phone number. Group creation accepts member phone numbers.

The app cannot send real OTPs until a Supabase project and SMS provider are configured. The public anon key is designed for browser use; access to profiles, chats, memberships, and messages is restricted by the schema's row-level security policies.

## Install from Chrome

JURO is an installable Progressive Web App. To enable installation and offline use, serve this folder from `localhost` while developing or publish it to a site using HTTPS. Opening `index.html` directly as a `file://` URL does not enable Chrome app installation or service workers.

### Publish the app

Upload this folder, including `manifest.webmanifest`, `service-worker.js`, `supabase-config.js`, and `icons/`, to a static web host that provides HTTPS (for example, GitHub Pages, Netlify, or Cloudflare Pages). Configure `supabase-config.js` before deployment, then share the host's public URL. Installation is not available from a local `file://` URL.

### Install on phones and computers

- **Android:** Open the HTTPS URL in Chrome and choose **Install app** from the address bar or menu. JURO also shows an install button when Chrome makes installation available.
- **iPhone/iPad:** Open the HTTPS URL in Safari, tap **Share**, then choose **Add to Home Screen**.
- **Windows/macOS:** Open the HTTPS URL in a PWA-capable browser such as Chrome or Edge and use its **Install app** option.

JURO includes home-screen icons and standalone display settings. The service worker caches the app shell for offline access. In demo mode, data stays on the device; in Supabase mode, text chats are shared between authenticated users. Voice/video calls, media upload, and WhatsApp interoperability are not included.

## Files

- `index.html` — app layout
- `style.css` — responsive styling and themes
- `script.js` — demo interactions and local storage
- `manifest.webmanifest` — app name, icons, and install display settings
- `service-worker.js` — offline app-shell caching
- `supabase-config.js` — public Supabase URL and anon-key placeholders
- `supabase/schema.sql` — profiles, chats, RLS policies, and chat RPCs
- `icons/` — app icons used by Chrome
