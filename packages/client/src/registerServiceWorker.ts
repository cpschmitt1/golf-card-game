/** Registers the service worker if the browser supports it. No-op (and no error) otherwise. */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;

  const register = () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('Service worker registration failed:', err);
    });
  };

  // The 'load' event can fire before this module even runs (it's a deferred module script),
  // in which case a plain addEventListener('load', ...) would silently never fire.
  if (document.readyState === 'complete') {
    register();
  } else {
    window.addEventListener('load', register);
  }
}
