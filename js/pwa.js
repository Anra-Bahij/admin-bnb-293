/* ==========================================================================
   BnB Cemilan — PWA: service worker, tombol install, panduan pasang (Android/iPhone),
   pembaruan aplikasi, pemberitahuan koneksi, dan penutup splash.
   Tidak menyentuh pemesanan, pembayaran, Supabase, maupun data produk.
   ========================================================================== */
(() => {
  'use strict';

  const SNOOZE_KEY = 'bnb_pwa_snooze';            // waktu (ms) banner install disembunyikan
  const SNOOZE_MS = 7 * 24 * 3600e3;               // 7 hari
  const SW_CHECK_MS = 30 * 60e3;                   // cek pembaruan tiap 30 menit saat terbuka
  const WATCH = ['/', '/js/app.js', '/js/payment.js', '/js/cart.js', '/js/data.js', '/js/live.js', '/css/style.css', '/css/payment.css', '/css/home.css', '/css/liquid.css', '/css/pwa.css', '/js/pwa.js'];

  const doc = document, root = doc.documentElement;
  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const inAppBrowser = /FBAN|FBAV|Instagram|Line\/|MicroMessenger|TikTok|; wv\)/i.test(ua);

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* abaikan */ } }
  };
  const el = (html) => { const t = doc.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ------------------------------------------------------------ Splash ringan */
  (function splash() {
    const s = doc.getElementById('pwaSplash');
    if (!s) return;
    if (!root.classList.contains('pwa-splash-on')) { s.remove(); return; }
    const started = (window.performance && performance.now()) || 0;
    let done = false;
    const hide = () => {
      if (done) return; done = true;
      s.classList.add('is-out');
      setTimeout(() => { s.remove(); root.classList.remove('pwa-splash-on'); }, 400);
    };
    const ready = () => setTimeout(hide, Math.max(0, 650 - started));   // tampil minimal ±0,65 dtk supaya tidak berkedip
    if (doc.readyState === 'complete') ready(); else window.addEventListener('load', ready, { once: true });
    setTimeout(hide, 3000);                                              // batas aman bila ada sumber daya yang lambat
  })();

  /* ------------------------------------------------------------ Bar atas (koneksi / pembaruan) */
  let bar = null;
  function showBar(kind, text, actionLabel, onAction, autoHideMs) {
    if (bar) bar.remove();
    bar = el(`<div class="pwa-bar pwa-bar--${kind}" role="status" aria-live="polite"><span>${esc(text)}</span>${actionLabel ? `<button type="button">${esc(actionLabel)}</button>` : ''}</div>`);
    if (actionLabel) bar.querySelector('button').addEventListener('click', onAction);
    doc.body.appendChild(bar);
    const mine = bar;
    if (autoHideMs) setTimeout(() => { if (bar === mine) { bar.remove(); bar = null; } }, autoHideMs);
  }
  const hideBar = () => { if (bar) { bar.remove(); bar = null; } };

  /* ------------------------------------------------------------ Koneksi */
  let wasOffline = !navigator.onLine;
  if (wasOffline) showBar('warn', 'Kamu sedang offline. Pesanan butuh internet.');
  window.addEventListener('offline', () => { wasOffline = true; showBar('warn', 'Kamu sedang offline. Pesanan butuh internet.'); });
  window.addEventListener('online', () => {
    if (!wasOffline) return;
    wasOffline = false;
    // Muat ulang bersifat pilihan agar isian checkout tidak hilang mendadak.
    showBar('ok', 'Koneksi kembali. Muat ulang untuk data terbaru?', 'Muat ulang', () => location.reload(), 12000);
  });

  /* ------------------------------------------------------------ Pembaruan aplikasi */
  let acceptedUpdate = false;
  function offerUpdate(worker) {
    showBar('ok', 'Versi baru BnB Cemilan tersedia.', 'Perbarui', () => {
      acceptedUpdate = true;
      if (worker) worker.postMessage({ type: 'SKIP_WAITING' }); else location.reload();
      setTimeout(() => location.reload(), 1500);   // cadangan bila controllerchange tidak datang
    });
  }

  // Deteksi perubahan berkas aplikasi (tanpa perlu menaikkan VERSION) lewat ETag/Last-Modified.
  const baseline = {};
  async function fingerprint(path) {
    try {
      const r = await fetch(path, { method: 'HEAD', cache: 'no-store' });
      if (!r.ok) return null;
      return r.headers.get('etag') || r.headers.get('last-modified') || null;
    } catch (e) { return null; }
  }
  async function checkAssets(init) {
    let changed = false;
    for (const p of WATCH) {
      const f = await fingerprint(p);
      if (!f) continue;
      if (init || !(p in baseline)) baseline[p] = f;
      else if (baseline[p] !== f) changed = true;
    }
    if (changed) offerUpdate(null);
  }

  /* ------------------------------------------------------------ Service worker */
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          if (!w) return;
          w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(w); });
        });
        const check = () => { reg.update().catch(() => {}); };
        setInterval(check, SW_CHECK_MS);
        let hiddenAt = 0;
        doc.addEventListener('visibilitychange', () => {
          if (doc.hidden) { hiddenAt = Date.now(); return; }
          if (Date.now() - hiddenAt > 5 * 60e3) { check(); checkAssets(false); }   // kembali setelah >5 menit
        });
      }).catch(() => { /* aplikasi tetap berjalan tanpa service worker */ });
      setTimeout(() => checkAssets(true), 4000);     // catat "sidik jari" versi yang sedang berjalan
      setInterval(() => { if (!doc.hidden) checkAssets(false); }, SW_CHECK_MS);
    });
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!acceptedUpdate || reloaded) return;       // instalasi pertama tidak memicu muat ulang
      reloaded = true; location.reload();
    });
  }

  /* ------------------------------------------------------------ Install & panduan */
  let deferred = null, banner = null, guide = null;

  const SHARE_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m8 7 4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';
  const DOTS_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>';

  function openGuide(tab) {
    if (guide) return;
    tab = tab || (isIOS ? 'ios' : 'android');
    guide = el(`
      <div class="pwa-guide" role="dialog" aria-modal="true" aria-labelledby="pwaGuideTitle">
        <div class="pwa-guide__card">
          <div class="pwa-guide__head"><h2 id="pwaGuideTitle">Pasang BnB Cemilan di HP</h2><button type="button" class="pwa-guide__close" aria-label="Tutup">×</button></div>
          <div class="pwa-tabs" role="tablist">
            <button type="button" class="pwa-tab" role="tab" data-tab="android">🤖 Android</button>
            <button type="button" class="pwa-tab" role="tab" data-tab="ios">🍎 iPhone</button>
          </div>
          <div data-panel="android" role="tabpanel">
            <ol class="pwa-steps">
              <li><span>Buka website ini di <b>Chrome</b>.</span></li>
              <li><span>Ketuk menu ${DOTS_SVG} di pojok kanan atas.</span></li>
              <li><span>Pilih <b>“Instal aplikasi”</b> atau <b>“Tambahkan ke layar utama”</b>.</span></li>
              <li><span>Ketuk <b>Instal</b>. Ikon BnB Cemilan muncul di layar utama.</span></li>
            </ol>
          </div>
          <div data-panel="ios" role="tabpanel" hidden>
            <ol class="pwa-steps">
              <li><span>Buka website ini di <b>Safari</b>.</span></li>
              <li><span>Ketuk tombol <b>Bagikan</b> ${SHARE_SVG} di bilah bawah (iPad: di bagian atas).</span></li>
              <li><span>Gulir ke bawah, pilih <b>“Tambah ke Layar Utama”</b>.</span></li>
              <li><span>Ketuk <b>Tambah</b>. Ikon BnB Cemilan muncul di layar utama.</span></li>
            </ol>
          </div>
          <p class="pwa-guide__note" data-note></p>
          <button type="button" class="pwa-guide__ok">Mengerti</button>
        </div>
      </div>`);
    const note = guide.querySelector('[data-note]');
    note.textContent = inAppBrowser
      ? 'Kamu membuka dari dalam aplikasi lain (Instagram/WhatsApp/dll). Ketuk menu ⋯ lalu pilih “Buka di browser” (Chrome atau Safari) sebelum memasang.'
      : 'Sudah terpasang? Buka BnB Cemilan dari ikon di layar utama untuk tampilan layar penuh.';
    const select = (t) => {
      guide.querySelectorAll('.pwa-tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
      guide.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== t; });
    };
    select(tab);
    const close = () => { doc.removeEventListener('keydown', onKey); guide.remove(); guide = null; if (opener && opener.focus) opener.focus(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const opener = doc.activeElement;
    guide.addEventListener('click', (e) => {
      if (e.target === guide || e.target.closest('.pwa-guide__close') || e.target.closest('.pwa-guide__ok')) close();
      const t = e.target.closest('.pwa-tab'); if (t) select(t.dataset.tab);
    });
    doc.addEventListener('keydown', onKey);
    doc.body.appendChild(guide);
    guide.querySelector('.pwa-guide__close').focus();
  }

  async function runInstall() {
    if (!deferred) return openGuide();
    const p = deferred; deferred = null;
    try { p.prompt(); await p.userChoice; } catch (e) { /* abaikan */ }
    hideBanner();
  }

  function hideBanner(snooze) {
    if (banner) { banner.remove(); banner = null; }
    if (snooze) store.set(SNOOZE_KEY, String(Date.now()));
  }

  function showBanner() {
    if (banner || isStandalone()) return;
    const t = Number(store.get(SNOOZE_KEY) || 0);
    if (t && Date.now() - t < SNOOZE_MS) return;
    const label = deferred ? 'Install' : 'Cara Pasang';
    banner = el(`
      <div class="pwa-install" role="region" aria-label="Pasang aplikasi">
        <img class="pwa-install__logo" src="icons/icon-192-v2.png" alt="" width="46" height="46">
        <div class="pwa-install__text"><strong>Pasang Aplikasi BnB Cemilan</strong><span>Buka lebih cepat langsung dari layar utama</span></div>
        <button type="button" class="pwa-install__go">${label}</button>
        <button type="button" class="pwa-install__x" aria-label="Sembunyikan">×</button>
      </div>`);
    banner.querySelector('.pwa-install__go').addEventListener('click', () => { if (deferred) runInstall(); else { hideBanner(true); openGuide(); } });
    banner.querySelector('.pwa-install__x').addEventListener('click', () => hideBanner(true));
    doc.body.appendChild(banner);
  }

  if (!isStandalone()) {
    // Android/Chrome/Edge: perangkat menyatakan bisa memasang.
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault(); deferred = e;
      setTimeout(showBanner, 2500);
    });
    // iPhone/iPad (Safari tidak punya prompt otomatis): tawarkan panduan.
    if (isIOS && !inAppBrowser) setTimeout(showBanner, 4000);
    window.addEventListener('appinstalled', () => {
      deferred = null; hideBanner();
      showBar('ok', 'BnB Cemilan terpasang. Cari ikonnya di layar utama!', null, null, 5000);
      const f = doc.querySelector('.pwa-footlink'); if (f) f.remove();
    });

    // Tautan permanen di footer (tetap ada setelah banner ditutup).
    const addFootLink = () => {
      const foot = doc.querySelector('.footer'); if (!foot || foot.querySelector('.pwa-footlink')) return;
      const b = el('<button type="button" class="pwa-footlink">📲 Pasang Aplikasi di HP</button>');
      b.addEventListener('click', () => { if (deferred) runInstall(); else openGuide(); });
      foot.appendChild(b);
    };
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', addFootLink); else addFootLink();
  }
})();
