// Minimal service worker — satisfies Chrome's PWA installability check.
// No caching strategy; all requests go to network.
self.addEventListener('fetch', () => {})
