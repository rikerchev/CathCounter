// Imported first and on its own, before React does anything: it attaches
// the `beforeinstallprompt` listener at the very moment this script runs,
// so we can never miss the event just because a component's useEffect
// attached its own listener too late. See the file itself for why.
import '@/lib/pwaInstallBus.js'

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)

// Registers the PWA shell cache (public/sw.js) so the app can be installed
// from the browser on Android/desktop and still opens when offline. Only in
// production — a service worker caching the dev server just causes stale
// reloads while iterating locally.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}
