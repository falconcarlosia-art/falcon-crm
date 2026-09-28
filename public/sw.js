// Service worker de Falcon CRM: permite instalar la app y abrirla rápido o sin
// señal. Nunca sirve una versión vieja si hay red: la página se pide primero a
// la red y solo sin conexión sale de la caché. Los datos van por Firestore, que
// tiene su propia caché offline; aquí solo se guarda la app (HTML, JS, CSS).
const PAGE = 'falcon-page-v1'
const ASSETS = 'falcon-assets-v1'
const MAX_ASSETS = 80

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== PAGE && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  // Firebase, Supabase, OpenRouter, fotos… pasan directo, sin caché.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/__/')) return

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(PAGE).then((c) => c.put('/', copy))
          }
          return res
        })
        .catch(() => caches.match('/', { cacheName: PAGE }).then((r) => r || Response.error())),
    )
    return
  }

  // /assets/ lleva un hash en el nombre: un archivo nunca cambia, así que caché primero.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(ASSETS).then(async (cache) => {
        const hit = await cache.match(req)
        if (hit) return hit
        const res = await fetch(req)
        if (res.ok) {
          await cache.put(req, res.clone())
          const keys = await cache.keys()
          await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_ASSETS)).map((k) => cache.delete(k)))
        }
        return res
      }),
    )
  }
})
