/* ==========================================================================
   BnB Cemilan — BNB REAL-TIME ORDER NOTIFICATION
   • Riwayat pesanan pelanggan disimpan di perangkat ini (Local Storage) — tidak ada akun pelanggan.
   • Status pesanan datang dari Supabase: sinyal Realtime (Broadcast, kanal "order:<id>") lalu dibaca
     resmi lewat fungsi get_orders_status(). Tabel orders sendiri tetap tertutup untuk anon.
   • Cadangan bila Realtime putus/diblokir: sinkronisasi berkala + saat koneksi pulih / tab dibuka lagi.
   Butuh 03_ORDER_NOTIFICATIONS.sql dan /api/realtime-config. Bergantung pada app.js (window.BnbUI).
   ========================================================================== */
(() => {
  'use strict';

  const ORDERS_KEY = 'bnbcemilan_orders_v1', NOTIF_KEY = 'bnbcemilan_notifs_v1';
  const MAX_ORDERS = 20, MAX_NOTIFS = 50, POLL_MS = 30000, ACTIVE_MS = 2 * 24 * 3600e3;

  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rp = (n) => (typeof formatRp === 'function' ? formatRp(n) : 'Rp' + n);

  const read = (k) => { try { const v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* penyimpanan penuh / diblokir */ } };

  /* ------------------------------------------------ Status → tahap & pesan */
  // Satu status READY saja; pesannya mengikuti metode penerimaan yang dipilih pelanggan saat checkout.
  // Nilai status admin dipetakan longgar (Indonesia/Inggris). Urutan pengecekan penting: "disiapkan" ≠ "siap".
  const STAGES = ['PENDING', 'PROCESSING', 'READY', 'COMPLETED'];
  function stageOf(status) {
    const t = String(status || '').trim().toLowerCase();
    if (/selesai|complete|done/.test(t)) return 'COMPLETED';
    if (/proses|processing|disiapkan|dimasak/.test(t)) return 'PROCESSING';
    if (/^siap|ready/.test(t)) return 'READY';
    if (/^baru|pending|menunggu/.test(t)) return 'PENDING';
    return null;
  }
  function copyFor(stage, pickup) {
    switch (stage) {
      case 'PENDING': return { title: 'Menunggu Konfirmasi', body: 'Pesananmu sedang menunggu konfirmasi.' };
      case 'PROCESSING': return { title: 'Pesanan Diproses', body: 'Pesananmu sedang disiapkan oleh tim BnB Cemilan.' };
      case 'READY': return pickup === 'Diantar'
        ? { title: 'Pesanan Siap Diantar!', body: 'Pesananmu sudah selesai disiapkan dan siap diantar\nke alamat tujuan.' }
        : { title: 'Pesanan Siap Diambil!', body: 'Pesananmu sudah selesai disiapkan.\nSilakan datang untuk mengambil pesananmu.' };
      case 'COMPLETED': return { title: 'Pesanan Selesai!', body: 'Terima kasih sudah memesan di BnB Cemilan.\nSemoga kamu menikmati pesananmu!' };
      default: return null;
    }
  }
  function stageLabel(o) {
    if (o.stage === 'READY') return o.pickup === 'Diantar' ? 'Siap diantar' : 'Siap diambil';
    return { PENDING: 'Menunggu konfirmasi', PROCESSING: 'Disiapkan', COMPLETED: 'Selesai' }[o.stage] || o.status || 'Menunggu status';
  }
  const shortId = (id) => '#' + String(id).replace(/-/g, '').slice(0, 6).toUpperCase();

  /* ---------------------------------------------------------- Notifikasi */
  const bell = $('#bellBtn'), bellBadge = $('#bellBadge');
  const notifSheet = $('#notifSheet'), notifBody = $('#notifBody'), notifSub = $('#notifSub'), readAllBtn = $('#notifReadAll');
  let unreadPrev = read(NOTIF_KEY).filter((n) => !n.read).length;

  const unreadCount = () => read(NOTIF_KEY).filter((n) => !n.read).length;

  function pushNotif(order, stage, silent) {
    const copy = copyFor(stage, order.pickup);
    if (!copy) return;
    const list = read(NOTIF_KEY);
    const id = order.id + ':' + stage;                    // kunci anti-duplikat: satu notifikasi per pesanan per tahap
    if (list.some((n) => n.id === id)) return;
    list.unshift({ id, orderId: order.id, stage, title: copy.title, body: copy.body, name: order.name || '', ts: Date.now(), read: false });
    write(NOTIF_KEY, list.slice(0, MAX_NOTIFS));
    renderBell(true);
    renderNotifs();
    if (!silent && window.BnbUI) BnbUI.toast('🔔 ' + copy.title, 3500);
  }

  function renderBell(ring) {
    const n = unreadCount();
    bellBadge.textContent = n > 99 ? '99+' : n;
    bellBadge.hidden = n === 0;
    bell.setAttribute('aria-label', n ? `Notifikasi, ${n} belum dibaca` : 'Notifikasi');
    if (ring && n > unreadPrev) {
      [bell, bellBadge].forEach((el) => { el.classList.remove('is-ring'); void el.offsetWidth; el.classList.add('is-ring'); });
    }
    unreadPrev = n;
  }

  const ICON = { PENDING: '🕒', PROCESSING: '🍳', READY: '🛍️', COMPLETED: '🎉' };
  function rel(ts) {
    const s = Math.max(0, (Date.now() - ts) / 1000);
    if (s < 60) return 'Baru saja';
    if (s < 3600) return Math.floor(s / 60) + ' menit lalu';
    if (s < 86400) return Math.floor(s / 3600) + ' jam lalu';
    return new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function renderNotifs() {
    if (notifSheet.hidden) return;
    const list = read(NOTIF_KEY), n = list.filter((x) => !x.read).length;
    notifSub.textContent = n ? `${n} belum dibaca` : 'Semua sudah dibaca';
    readAllBtn.disabled = n === 0;
    notifBody.innerHTML = list.length
      ? `<ul class="notif-list">${list.map((x) => `
          <li class="notif${x.read ? '' : ' is-unread'}" data-nid="${esc(x.id)}">
            <span class="notif__icon" aria-hidden="true">${ICON[x.stage] || '🔔'}</span>
            <div class="notif__main">
              <p class="notif__title">${esc(x.title)}${x.read ? '' : '<i class="notif__dot" role="img" aria-label="Belum dibaca"></i>'}</p>
              <p class="notif__body">${esc(x.body)}</p>
              <p class="notif__meta">${x.name ? esc(x.name) + ' · ' : ''}${esc(shortId(x.orderId))} · <time title="${esc(new Date(x.ts).toLocaleString('id-ID'))}">${esc(rel(x.ts))}</time></p>
              ${x.read ? '' : '<button type="button" class="notif__read" data-read>Tandai sudah dibaca</button>'}
            </div>
          </li>`).join('')}</ul>`
      : `<div class="empty"><div class="empty__icon">🔔</div><strong>Belum ada notifikasi</strong>Status pesananmu akan muncul di sini.</div>`;
  }

  function markRead(nid) {
    const list = read(NOTIF_KEY);
    list.forEach((x) => { if (!nid || x.id === nid) x.read = true; });
    write(NOTIF_KEY, list);
    renderBell(false);
    renderNotifs();
  }

  bell.addEventListener('click', () => { renderBell(false); BnbUI.showSheet(notifSheet); renderNotifs(); });
  readAllBtn.addEventListener('click', () => markRead(null));
  notifBody.addEventListener('click', (e) => {
    const b = e.target.closest('[data-read]');
    if (b) markRead(b.closest('[data-nid]').dataset.nid);
  });
  setInterval(() => { if (!notifSheet.hidden) renderNotifs(); }, 60000);   // waktu relatif ("2 menit lalu")

  /* ------------------------------------------------------------- Pesanan */
  const getOrders = () => read(ORDERS_KEY);
  const isActive = (o) => o.stage !== 'COMPLETED' && Date.now() - o.createdAt < ACTIVE_MS;

  function applyStatus(id, status, pickup, silent) {
    const list = getOrders();
    const o = list.find((x) => x.id === id);
    if (!o) return;
    if (pickup === 'Ambil sendiri' || pickup === 'Diantar') o.pickup = pickup;   // metode dari server = acuan pesan READY
    o.status = status;
    o.stage = stageOf(status);
    write(ORDERS_KEY, list);
    if (o.stage) pushNotif(o, o.stage, silent);
    renderOrders();
    watchActive();
  }

  function addOrder(o) {
    const list = getOrders().filter((x) => x.id !== o.id);
    list.unshift({ ...o, status: 'Baru', stage: 'PENDING' });
    write(ORDERS_KEY, list.slice(0, MAX_ORDERS));
    applyStatus(o.id, 'Baru', o.pickup, true);       // status awal nyata: pesanan baru saja tersimpan di database
    watchActive();
    sync();
  }

  function renderOrders() {
    const box = $('#ordersList');
    if (!box || $('#ordersView').hidden) return;
    const list = getOrders();
    if (!list.length) {
      box.innerHTML = `<div class="empty"><div class="empty__icon">🧾</div><strong>Belum ada pesanan</strong>Pesanan yang kamu buat dari perangkat ini akan tampil di sini.
        <p style="margin-top:14px"><button type="button" class="btn btn--olive" data-goto="menu">Lihat Menu</button></p></div>`;
      return;
    }
    box.innerHTML = list.map((o) => {
      const cur = STAGES.indexOf(o.stage);
      const steps = ['Menunggu', 'Disiapkan', o.pickup === 'Diantar' ? 'Siap diantar' : 'Siap diambil', 'Selesai'];
      return `
        <article class="ord ord--${esc((o.stage || 'unknown').toLowerCase())}">
          <header class="ord__head">
            <div><strong>Pesanan ${esc(shortId(o.id))}</strong>
              <small>${esc(new Date(o.createdAt).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))} · ${o.pickup === 'Diantar' ? '🛵 Diantar' : '🛍️ Ambil sendiri'}</small></div>
            <span class="ord__status">${esc(stageLabel(o))}</span>
          </header>
          ${cur >= 0 ? `<ol class="ord__steps" aria-label="Tahap pesanan">${steps.map((s, i) =>
            `<li class="${i < cur ? 'is-done' : i === cur ? 'is-now' : ''}"${i === cur ? ' aria-current="step"' : ''}><i aria-hidden="true"></i><span>${s}</span></li>`).join('')}</ol>` : ''}
          ${o.stage === 'COMPLETED' ? rateHtml(o) : ''}
          <ul class="ord__items">${(o.items || []).map((i) => `<li>${Number(i.qty) || 1}× ${esc(i.name)}${i.variant ? ' <small>(' + esc(i.variant) + ')</small>' : ''}</li>`).join('')}</ul>
          <footer class="ord__foot"><span>Total</span><strong>${rp(o.total)}</strong></footer>
        </article>`;
    }).join('');
  }
  document.addEventListener('click', (e) => {
    const g = e.target.closest('[data-goto]'); if (g) BnbUI.goTo(g.dataset.goto);
    const r = e.target.closest('[data-rate]');
    if (r) { const v = r.dataset.rate, i = v.indexOf('|'); openReview(v.slice(0, i), v.slice(i + 1)); }
  });

  /* ------------------------------------------------------- Rating & ulasan */
  // Aturan (pesanan selesai, produk memang ada di pesanan, rating 1–5) dijaga database lewat /api/reviews → submit_review().
  const reviews = {};                              // id pesanan → { id produk: {rating, comment} } | 'loading' | 'error'
  const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
  const productOf = (it) => it.productId ||        // pesanan lama (sebelum fitur ulasan) belum menyimpan id produk → cocokkan lewat nama
    ((typeof PRODUCTS !== 'undefined' && PRODUCTS.find((p) => (p.cartName || p.name) === it.name)) || {}).id || null;
  function rateItems(o) {                          // satu baris per produk (varian berbeda dari produk yang sama = satu ulasan)
    const m = new Map();
    (o.items || []).forEach((it) => { const id = productOf(it); if (id && !m.has(id)) m.set(id, it.name); });
    return [...m];
  }
  async function loadReviews(orderId) {
    if (reviews[orderId]) return;
    reviews[orderId] = 'loading';
    try {
      const res = await fetch('/api/reviews?order_id=' + encodeURIComponent(orderId), { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error('load');
      reviews[orderId] = Object.fromEntries(j.reviews.map((x) => [x.product_id, x]));
    } catch (e) { reviews[orderId] = 'error'; }   // gagal memuat: tombol tetap ada, kirim ulang akan mengedit ulasan yang sama
    renderOrders();
  }
  function rateHtml(o) {
    const items = rateItems(o);
    if (!items.length) return '';
    loadReviews(o.id);
    const m = reviews[o.id];
    return `<div class="ord__rate"><p>Nilai pesananmu</p><ul>${items.map(([pid, name]) => {
      const r = m && typeof m === 'object' ? m[pid] : null, key = esc(o.id) + '|' + esc(pid);
      return `<li><span>${esc(name)}</span>${m === 'loading' ? '<small>Memuat…</small>'
        : r ? `<span class="stars" role="img" aria-label="Rating ${r.rating} dari 5">${stars(r.rating)}</span><button type="button" class="ord__rbtn ord__rbtn--ghost" data-rate="${key}">Ubah</button>`
        : `<button type="button" class="ord__rbtn" data-rate="${key}">Beri Penilaian</button>`}</li>`;
    }).join('')}</ul></div>`;
  }

  const rSheet = $('#reviewSheet'), starsEl = $('#starsInput'), rComment = $('#reviewComment'), rSubmit = $('#reviewSubmit');
  let rctx = null;
  function paintStars() {
    starsEl.querySelectorAll('button').forEach((b) => {
      const v = Number(b.dataset.v);
      b.classList.toggle('is-on', v <= rctx.rating);
      b.setAttribute('aria-checked', String(v === rctx.rating));
      b.tabIndex = v === (rctx.rating || 1) ? 0 : -1;
    });
    rSubmit.disabled = !rctx.rating;
    rSubmit.textContent = rctx.rating ? 'Kirim Penilaian' : 'Pilih bintang dulu';
  }
  function openReview(orderId, pid) {
    const o = getOrders().find((x) => x.id === orderId);
    if (!o) return;
    const m = reviews[orderId], ex = m && typeof m === 'object' ? m[pid] : null;
    rctx = { orderId, pid, rating: ex ? ex.rating : 0 };
    $('#reviewTitle').textContent = ex ? 'Ubah Penilaian' : 'Beri Penilaian';
    $('#reviewProduct').textContent = (rateItems(o).find(([id]) => id === pid) || [])[1] || '';
    rComment.value = (ex && ex.comment) || '';
    paintStars();
    BnbUI.showSheet(rSheet);
  }
  starsEl.addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) { rctx.rating = Number(b.dataset.v); paintStars(); } });
  starsEl.addEventListener('keydown', (e) => {
    const d = /^Arrow(Right|Up)$/.test(e.key) ? 1 : /^Arrow(Left|Down)$/.test(e.key) ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    rctx.rating = Math.min(5, Math.max(1, (rctx.rating || 0) + d)); paintStars();
    starsEl.querySelector(`[data-v="${rctx.rating}"]`).focus();
  });
  rSubmit.addEventListener('click', async () => {
    if (!rctx || !rctx.rating || rSubmit.disabled) return;
    const c = { ...rctx }, comment = rComment.value.trim() || null;   // komentar opsional: kosong tetap disimpan
    rSubmit.disabled = true; rSubmit.textContent = 'Mengirim…';
    try {
      const res = await fetch('/api/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: c.orderId, product_id: c.pid, rating: c.rating, comment }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Penilaian gagal dikirim.');
      const m = reviews[c.orderId];
      reviews[c.orderId] = { ...(m && typeof m === 'object' ? m : {}), [c.pid]: { product_id: c.pid, rating: c.rating, comment } };
      BnbUI.closeSheet();
      BnbUI.toast('Terima kasih atas penilaianmu! ⭐');
      renderOrders();
      BnbUI.refreshCatalog();                      // rating di kartu produk ikut diperbarui
    } catch (e) { BnbUI.toast(e.message || 'Penilaian gagal dikirim.', 4000); paintStars(); }
  });
  document.addEventListener('bnb:view', (e) => { if (e.detail === 'orders') { renderOrders(); sync(); } });

  /* ------------------------------------------------- Supabase Realtime */
  let client = null, clientPromise = null;
  const channels = new Map();

  function loadScript(src) {
    return new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = src; s.async = true; s.onload = ok; s.onerror = () => fail(new Error('script'));
      document.head.appendChild(s);
    });
  }
  // Dimuat hanya saat ada pesanan aktif, jadi pengunjung biasa tidak membuka koneksi Realtime sama sekali.
  function getClient() {
    if (client) return Promise.resolve(client);
    if (!clientPromise) {
      clientPromise = (async () => {
        const res = await fetch('/api/realtime-config', { cache: 'no-store' });
        const cfg = await res.json();
        if (!res.ok || !cfg.url || !cfg.anonKey) throw new Error('config');
        if (!window.supabase) await loadScript('js/vendor/supabase.js');
        client = window.supabase.createClient(cfg.url, cfg.anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
        return client;
      })().catch(() => { clientPromise = null; return null; });   // gagal → coba lagi pada sinkronisasi berikutnya
    }
    return clientPromise;
  }

  const activeIds = () => getOrders().filter(isActive).map((o) => o.id);

  let syncing = false, again = false;
  async function sync() {
    const ids = activeIds();
    if (!ids.length) return;
    if (syncing) { again = true; return; }          // sinyal datang saat sinkron berjalan → ulangi sekali setelahnya
    syncing = true;
    try {
      const c = await getClient();
      if (!c) return;
      const { data, error } = await c.rpc('get_orders_status', { p_ids: ids });
      if (error || !Array.isArray(data)) return;
      data.forEach((r) => {
        const o = getOrders().find((x) => x.id === r.id);
        if (o && o.status === r.status && o.pickup === r.pickup_method) return;   // tidak ada perubahan → tidak ada notifikasi
        applyStatus(r.id, r.status, r.pickup_method, false);
      });
    } catch (e) { /* jaringan putus: dicoba lagi oleh timer / saat koneksi pulih */ }
    finally { syncing = false; if (again) { again = false; sync(); } }
  }

  // Berlangganan kanal tiap pesanan aktif; berhenti untuk pesanan yang sudah selesai.
  async function watchActive() {
    const ids = new Set(activeIds());
    for (const [id, ch] of channels) {
      if (!ids.has(id)) { channels.delete(id); if (client) client.removeChannel(ch); }
    }
    const fresh = [...ids].filter((id) => !channels.has(id));
    if (!fresh.length) return;
    const c = await getClient();
    if (!c) return;
    fresh.forEach((id) => {
      if (channels.has(id)) return;
      const ch = c.channel('order:' + id)
        .on('broadcast', { event: 'status' }, () => sync())       // sinyal saja; status resmi dibaca ulang dari database
        .subscribe((st) => { if (st === 'SUBSCRIBED') sync(); }); // tersambung / tersambung kembali → sinkron ulang
      channels.set(id, ch);
    });
  }

  setInterval(() => { if (!document.hidden) sync(); }, POLL_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { sync(); renderBell(false); } });
  window.addEventListener('online', () => { sync(); watchActive(); });
  window.addEventListener('pagehide', () => { if (client) { try { client.removeAllChannels(); } catch (e) { /* abaikan */ } } channels.clear(); });
  window.addEventListener('pageshow', (e) => { if (e.persisted) { watchActive(); sync(); } });   // kembali dari bfcache
  // Tab lain di browser yang sama mengubah data → tampilan ikut diperbarui.
  window.addEventListener('storage', (e) => {
    if (e.key === NOTIF_KEY) { renderBell(true); renderNotifs(); }
    if (e.key === ORDERS_KEY) renderOrders();
  });

  /* ---------------------------------------------------------------- Start */
  renderBell(false);
  if (location.hash === '#pesanan') renderOrders();
  if (activeIds().length) { watchActive(); sync(); }

  window.BnbLive = { addOrder };
})();
