const CACHE = 'finora-v1'
self.addEventListener('install', e => { self.skipWaiting() })
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
))
// Network-first for pages, cache-first for hashed assets; everything falls back to cache when offline.
self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return
  const isPage = req.mode === 'navigate'
  e.respondWith((async () => {
    const cache = await caches.open(CACHE)
    const cached = await cache.match(isPage ? './index.html' : req)
    if (!isPage && cached) return cached
    try {
      const res = await fetch(req)
      if (res.ok) cache.put(isPage ? './index.html' : req, res.clone())
      return res
    } catch (err) {
      if (cached) return cached
      throw err
    }
  })())
})
