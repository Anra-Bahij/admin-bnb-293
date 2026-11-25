/* ==========================================================================
   BnB Cemilan — Service Worker
   Prinsip: aplikasi selalu mengambil data TERBARU dari internet.
   • TIDAK ada cache untuk /api/* (produk, harga, stok, pesanan, pembayaran), js/data.js,
     HTML, CSS, maupun JS aplikasi, dan foto produk. Semuanya langsung ke jaringan.
   • Yang disimpan hanya: halaman offline + logo/ikon merek (tidak berisi data toko).
   • Saat internet putus ketika membuka aplikasi → tampil halaman /offline.

   CARA RILIS: ubah VERSION di bawah setiap kali men-deploy versi baru agar pengguna
   mendapat tombol "Perbarui". (Perubahan file lain juga terdeteksi otomatis oleh pwa.js.)
   ========================================================================== */
const VERSION = 'v1.11.0';
const CACHE = 'bnb-static-' + VERSION;
const OFFLINE_URL = '/offline';
const PRECACHE = [OFFLINE_URL, '/icons/logo-512-v2.webp', '/icons/icon-192-v2.png'];
// Hanya aset merek statis yang boleh di-cache (stale-while-revalidate).
const BRAND_ASSET = /^\/(icons\/|assets\/logo\.png$)/;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' }))))
  );
  // Tidak skipWaiting otomatis: versi baru menunggu sampai pengguna menekan "Perbarui".
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('bnb-') && k !== CACHE).map((k) => caches.delete(k)));
    if (self.registration.navigationPreload) { try { await self.registration.navigationPreload.enable(); } catch (e) { /* abaikan */ } }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;                       // pesanan/pembayaran (POST) tidak pernah disentuh
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;        // font Google dll. diurus browser
  if (url.pathname.startsWith('/api/')) return;           // data hidup: langsung ke jaringan

  if (req.mode === 'navigate') {
    event.respondWith(navigate(event));
    return;
  }
  if (BRAND_ASSET.test(url.pathname)) event.respondWith(staleWhileRevalidate(event));
  // selain itu: tidak ditangani → jaringan/HTTP cache biasa
});

async function navigate(event) {
  try {
    const preload = event.preloadResponse ? await event.preloadResponse : null;
    return preload || await fetch(event.request);
  } catch (err) {
    const cache = await caches.open(CACHE);
    return (await cache.match(OFFLINE_URL)) ||
      new Response('Tidak ada koneksi internet.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

async function staleWhileRevalidate(event) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(event.request);
  const refresh = fetch(event.request).then((res) => {
    if (res && res.status === 200 && res.type === 'basic') cache.put(event.request, res.clone());
    return res;
  }).catch(() => null);
  if (cached) { event.waitUntil(refresh); return cached; }
  return (await refresh) || Response.error();
}
