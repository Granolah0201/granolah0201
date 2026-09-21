import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { useStore } from './store';
import './index.css';

// A debugging handle during `vite dev`; it is stripped from production builds.
if (import.meta.env.DEV) {
  (window as unknown as { __rw: typeof useStore }).__rw = useStore;
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// The service worker makes the installed app open offline. It is registered
// after load so it never competes with the first paint.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* offline support is optional */
    });
  });
}
