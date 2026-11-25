/* ==========================================================================
   BnB Cemilan — LOGIKA TAMPILAN
   Bergantung pada data.js dan cart.js.
   ========================================================================== */
/* ==========================================================================
   NIGHT LOCK SYSTEM — website terkunci 01.00–05.59 WIB, buka kembali 06.00 WIB.
   Memakai zona Asia/Jakarta (UTC+7, tanpa DST), bukan zona jam perangkat.
   Jam dikoreksi dengan header Date dari server bila jam perangkat meleset.
   ========================================================================== */
(() => {
  'use strict';
  const LOCK_FROM = 1, OPEN_AT = 6, WIB = 7 * 3600e3;
  let skew = 0;                                   // selisih jam server – jam perangkat (ms)
  const wib = () => new Date(Date.now() + skew + WIB);   // getUTC* pada objek ini = waktu WIB
  const isLocked = () => { const h = wib().getUTCHours(); return h >= LOCK_FROM && h < OPEN_AT; };
  const msToOpen = () => {
    const n = wib();
    const t = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), OPEN_AT);
    return Math.max(0, t - n.getTime());
  };
  const pad = (n) => String(n).padStart(2, '0');

  let el = null, ticker = null, opening = false;
  const root = document.documentElement;
  const others = () => Array.from(document.body.children).filter((n) => n !== el);

  function build() {
    el = document.createElement('div');
    el.className = 'nightlock';
    el.setAttribute('role', 'alertdialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'nlTitle');
    el.innerHTML = `
      <div class="nl__card">
        <img class="nl__logo" alt="BnB Cemilan" hidden>
        <div class="nl__lock" aria-hidden="true">
          <span class="nl__shackle"></span>
          <span class="nl__body"><span class="nl__key"></span></span>
          <span class="nl__zz nl__zz--1">z</span><span class="nl__zz nl__zz--2">Z</span>
        </div>
        <h2 class="nl__title" id="nlTitle">BnB Cemilan lagi istirahat 🌙</h2>
        <p class="nl__text" id="nlText">Pemesanan tutup pukul 01.00–05.59 WIB.<br>Kami buka lagi pukul <strong>06.00 WIB</strong>.</p>
        <div class="nl__count" role="timer" aria-label="Waktu menuju buka">
          <div><b id="nlH">00</b><small>Jam</small></div><span>:</span>
          <div><b id="nlM">00</b><small>Menit</small></div><span>:</span>
          <div><b id="nlS">00</b><small>Detik</small></div>
        </div>
      </div>`;
    const img = el.querySelector('.nl__logo');
    if (typeof STORE !== 'undefined' && STORE.logo) {
      img.src = STORE.logo;
      img.onload = () => { img.hidden = false; };
    }
    document.body.appendChild(el);
  }

  function lock() {
    if (el) return;
    build();
    root.classList.remove('has-intro');             // animasi pembuka tidak diputar di belakang layar kunci
    root.classList.add('night-locked');
    others().forEach((n) => { n.inert = true; n.setAttribute('aria-hidden', 'true'); });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));   // tutup modal/keranjang yang sedang terbuka
    tick();
    ticker = setInterval(tick, 250);
  }

  function unlock() {
    if (!el || opening) return;
    opening = true;
    clearInterval(ticker);
    el.classList.add('is-opening');
    el.querySelector('#nlTitle').textContent = 'Kami sudah buka! 🎉';
    el.querySelector('#nlText').textContent = 'Selamat pagi, Sobat Cemilan. Yuk jajan!';
    setTimeout(() => el.classList.add('is-leaving'), 1900);
    setTimeout(() => {
      others().forEach((n) => { n.inert = false; n.removeAttribute('aria-hidden'); });
      root.classList.remove('night-locked');
      el.remove(); el = null; opening = false;
    }, 2700);
  }

  function tick() {
    if (!el || opening) return;
    if (!isLocked()) return unlock();
    const s = Math.ceil(msToOpen() / 1000);
    el.querySelector('#nlH').textContent = pad(Math.floor(s / 3600));
    el.querySelector('#nlM').textContent = pad(Math.floor((s % 3600) / 60));
    el.querySelector('#nlS').textContent = pad(s % 60);
  }

  function check() { if (isLocked()) lock(); else if (el) unlock(); }

  check();                                          // langsung, sebelum halaman sempat dipakai
  setInterval(check, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });

  // Koreksi jam perangkat memakai jam server (senyap bila gagal).
  fetch(location.pathname, { method: 'HEAD', cache: 'no-store' }).then((r) => {
    const d = Date.parse(r.headers.get('date') || '');
    if (!isNaN(d)) { skew = d - Date.now(); check(); }
  }).catch(() => {});
})();

(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const state = { category: 'all', query: '' };

  /* ---------------------------------------------------------------- Logo */
  // Jika file logo belum ada, tampilkan teks biasa (bukan gambar ulang logo).
  document.querySelectorAll('img[data-logo]').forEach((img) => {
    img.src = STORE.logo;
    const showFallback = () => { img.hidden = true; const fb = img.parentElement.querySelector('.logo-fallback'); if (fb) fb.hidden = false; };
    img.addEventListener('error', showFallback);
    if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) img.dispatchEvent(new Event('error'));
  });

  /* ------------------------------------------------------- Animasi pembuka */
  function initIntro() {
    const root = document.documentElement;
    if (!root.classList.contains('has-intro')) return;
    const intro = $('#intro'), app = $('#app'), goo = $('#introGoo');
    try { sessionStorage.setItem('bnb_intro_seen', '1'); } catch (e) { /* abaikan */ }

    const timers = [];
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    const finish = () => { timers.forEach(clearTimeout); root.classList.remove('has-intro'); };

    later(() => goo.classList.add('is-merging'), 2600);   // efek menyatu dimulai saat titik hampir bertemu
    later(finish, 7100);

    $('#introSkip').addEventListener('click', () => {
      timers.forEach(clearTimeout);
      intro.style.animation = 'none';
      intro.style.transition = 'opacity .3s ease';
      app.style.animation = 'none';
      app.style.opacity = '0';
      void app.offsetWidth;
      app.style.transition = 'opacity .3s ease';
      app.style.opacity = '1';
      intro.style.opacity = '0';
      setTimeout(() => { root.classList.remove('has-intro'); app.style.cssText = ''; }, 320);
    });
  }

  /* ------------------------------------------------------------ Sapaan */
  function initGreeting() {
    const h = new Date().getHours();
    const part = h < 11 ? 'pagi' : h < 15 ? 'siang' : h < 18 ? 'sore' : 'malam';
    $('#greetHi').textContent = `Selamat ${part}, Sobat Cemilan! 👋`;
    $('#year').textContent = new Date().getFullYear();
  }

  /* -------------------------------------------- Tinggi sticky → CSS variable */
  const sticky = $('#stickyTop');
  function syncStickyHeight() {
    document.documentElement.style.setProperty('--sticky-h', sticky.offsetHeight + 'px');
  }
  if ('ResizeObserver' in window) new ResizeObserver(syncStickyHeight).observe(sticky);
  window.addEventListener('resize', syncStickyHeight);

  /* ------------------------------------------------------------ Kategori */
  const catsEl = $('#cats');

  function renderCategories() {
    const all = [{ id: 'all', name: 'All', emoji: '🍽️', color: '#2D2D2D' }, ...CATEGORIES];
    catsEl.innerHTML = all.map((c) => `
      <button type="button" class="chip${c.id === state.category ? ' is-active' : ''}" data-cat="${esc(c.id)}"
              style="--chip:${esc(c.color)}" aria-pressed="${c.id === state.category}">
        <span aria-hidden="true">${c.emoji}</span>${esc(c.name)}
      </button>`).join('');
  }

  catsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cat]');
    if (!btn || btn.dataset.cat === state.category) return;
    state.category = btn.dataset.cat;
    renderCategories();
    const active = catsEl.querySelector('.is-active');
    if (active) active.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    renderMenu();
    keepMenuInView();
  });

  // Jika pelanggan sudah scroll jauh, setelah ganti kategori/pencarian kembalikan ke awal daftar produk.
  function keepMenuInView() {
    const menu = $('#menu');
    const top = menu.getBoundingClientRect().top + window.scrollY - sticky.offsetHeight - 12;
    if (window.scrollY > top) window.scrollTo({ top: Math.max(top, 0), behavior: 'smooth' });
  }

  /* ------------------------------------------------------------- Produk */
  const menuEl = $('#menu');

  const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

  function matches(p, q) {
    if (!q) return true;
    const hay = norm(`${p.name} ${p.desc || ''}`);
    return q.split(' ').every((w) => hay.includes(w));
  }

  function cardHtml(p, i) {
    const action = p.isSold
      ? ''
      : `<button type="button" class="add-btn" data-add="${esc(p.id)}" aria-label="Tambah ${esc(p.name)}">+</button>`;
    return `
      <article class="card${p.isSold ? ' is-sold' : ''}" data-pid="${esc(p.id)}" style="animation-delay:${Math.min(i, 8) * 30}ms">
        ${p.isSold ? '<span class="sold-stamp" role="img" aria-label="Sold out, belum tersedia"><span class="sold-stamp__band">SOLD OUT</span></span>' : ''}
        <div class="card__body">
          <h3 class="card__name">${esc(p.name)}</h3>
          ${p.rating ? `<button type="button" class="card__rate" aria-label="Lihat ulasan ${esc(p.name)}">${ratingHtml(p)}</button>` : ''}
          <p class="card__desc">${esc(p.desc || '')}</p>
          <div class="card__foot">
            <span class="price">${formatRp(p.price)}</span>
            ${action}
          </div>
        </div>
      </article>`;
  }

  function renderMenu() {
    const q = norm(state.query);
    const cats = state.category === 'all' ? CATEGORIES : CATEGORIES.filter((c) => c.id === state.category);
    let html = '';
    let found = 0;

    cats.forEach((cat) => {
      const list = PRODUCTS.filter((p) => p.category === cat.id && matches(p, q));
      found += list.length;
      if (!list.length) return;
      html += `
        <section class="cat-section" data-section="${esc(cat.id)}">
          <h2 class="cat-title"><span aria-hidden="true">${cat.emoji}</span>${esc(cat.name)} <small>${list.length} menu</small></h2>
          <div class="grid">${list.map((p, i) => cardHtml(p, i)).join('')}</div>
        </section>`;
    });

    if (!found) {
      const current = CATEGORIES.find((c) => c.id === state.category);
      if (q) {
        html = `<div class="empty"><div class="empty__icon">🔍</div><strong>Produk tidak ditemukan</strong>
          Tidak ada menu untuk “${esc(state.query.trim())}”${current ? ` di kategori ${esc(current.name)}` : ''}. Coba kata lain atau pilih kategori All.</div>`;
      } else if (current) {
        html = `<div class="empty"><div class="empty__icon">${current.emoji}</div><strong>Menu ${esc(current.name)} segera hadir</strong>
          Sabar ya, kami sedang menyiapkan menu terbaik untukmu.</div>`;
      } else {
        html = `<div class="empty"><div class="empty__icon">🍽️</div><strong>Menu belum tersedia</strong></div>`;
      }
    }
    menuEl.innerHTML = html;
  }

  menuEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-add]');
    if (btn) { handleAdd(btn.dataset.add); return; }
    const card = e.target.closest('.card[data-pid]');          // ketuk kartu = detail produk + ulasan
    if (card) openDetail(card.dataset.pid);
  });

  /* -------------------------------------------- Rating & detail produk */
  // Data rating berasal dari Supabase (lewat /api/products); tanpa data → baris rating tidak ditampilkan.
  const starsText = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
  function ratingHtml(p) {
    const r = p.rating;
    return r && r.count > 0 ? `<span class="stars" aria-hidden="true">★</span> <b>${r.avg.toFixed(1)}</b> (${r.count} ulasan)` : 'Belum ada ulasan';
  }
  const productSheet = $('#productSheet'), productBody = $('#productBody'), productAdd = $('#productAdd');
  let detailId = null;

  function openDetail(id) {
    const p = Catalog.product(id);
    if (!p) return;
    detailId = id;
    $('#productTitle').textContent = p.name;
    $('#productSub').textContent = formatRp(p.price) + (p.desc ? ' · ' + p.desc : '');
    const r = p.rating;
    productBody.innerHTML = `${r ? `<div class="rev-sum"><strong>${r.count ? r.avg.toFixed(1) : '–'}</strong><div><span class="stars" aria-hidden="true">${starsText(r.count ? Math.round(r.avg) : 0)}</span><small>${r.count ? r.count + ' ulasan' : 'Belum ada ulasan'}</small></div></div>` : ''}
      <div id="revList" class="rev-list"><p class="hint">Memuat ulasan…</p></div>`;
    $('#productFoot').hidden = !!p.isSold;
    showSheet(productSheet);
    const fail = () => { const box = $('#revList'); if (detailId === id && box) box.innerHTML = '<p class="hint">Ulasan belum bisa dimuat.</p>'; };
    fetch('/api/reviews?product_id=' + encodeURIComponent(id), { cache: 'no-store' })
      .then((res) => res.json().then((j) => ({ ok: res.ok, j })))
      .then(({ ok, j }) => {
        const box = $('#revList');
        if (detailId !== id || !box) return;
        if (!ok) return fail();
        box.innerHTML = j.reviews.length ? j.reviews.map((rv) => `
          <article class="rev">
            <div class="rev__top"><span class="stars" role="img" aria-label="Rating ${rv.rating} dari 5">${starsText(rv.rating)}</span>
              <time>${esc(new Date(rv.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }))}</time></div>
            ${rv.comment ? `<p>${esc(rv.comment)}</p>` : ''}
          </article>`).join('') : '<p class="hint">Belum ada ulasan untuk produk ini.</p>';
      }).catch(fail);
  }
  productAdd.addEventListener('click', () => { if (detailId) handleAdd(detailId); });

  function handleAdd(productId) {
    const p = Catalog.product(productId);
    if (!p) return;
    if (p.isSold) { toast(`${p.cartName || p.name} belum tersedia`); return; }
    if (Catalog.group(p)) { openVariant(p); return; }
    Cart.add(p.id, null);
    toast(`${p.cartName || p.name} ditambahkan ✓`);
  }

  /* ------------------------------------------------------------ Pencarian */
  const searchInput = $('#searchInput'), searchClear = $('#searchClear');
  searchInput.addEventListener('input', () => {
    state.query = searchInput.value;
    searchClear.hidden = !state.query;
    renderMenu();
  });
  searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); searchInput.blur(); keepMenuInView(); } });
  searchClear.addEventListener('click', () => {
    searchInput.value = ''; state.query = ''; searchClear.hidden = true; renderMenu(); searchInput.focus();
  });
  $('#bannerCta').addEventListener('click', () => {
    const top = menuEl.getBoundingClientRect().top + window.scrollY - sticky.offsetHeight - 12;
    window.scrollTo({ top, behavior: 'smooth' });
  });

  /* ------------------------------------------- Overlay (modal & drawer) */
  const backdrop = $('#backdrop');
  const variantSheet = $('#variantSheet'), cartSheet = $('#cartSheet');
  let openSheet = null, lastFocus = null;

  function showSheet(sheet) {
    closeSheet(true);
    lastFocus = document.activeElement;
    toastEl.hidden = true;
    openSheet = sheet;
    if (sheet === cartSheet) { document.body.classList.add('cart-open'); paintTabs('cart'); }   // tab Keranjang aktif selama keranjang terbuka
    backdrop.hidden = false;
    sheet.hidden = false;
    document.body.classList.add('is-locked');
    sheet.tabIndex = -1;                       // fokus ke panel, bukan ke pilihan pertama (agar tidak terlihat "terpilih")
    setTimeout(() => sheet.focus({ preventScroll: true }), 50);
  }
  function closeSheet(silent) {
    if (!openSheet) return;
    const wasCart = openSheet === cartSheet;
    openSheet.hidden = true;
    backdrop.hidden = true;
    document.body.classList.remove('is-locked');
    openSheet = null;
    if (wasCart) { document.body.classList.remove('cart-open'); paintTabs(currentView); }
    updateCartIndicators();
    if (!silent && lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  backdrop.addEventListener('click', () => closeSheet());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => closeSheet()));

  /* ------------------------------------------------------ Modal variasi */
  // Satu produk dapat punya 1 grup (paha/dada, jenis nasi) atau beberapa grup (goreng/kuah + kepedasan).
  // Semua grup wajib dipilih; pilihan digabung menjadi satu optionId ("goreng+pedas").
  let variantProduct = null, variantGroups = [], variantSel = [];
  const variantOptions = $('#variantOptions'), variantAdd = $('#variantAdd');
  const variantChoice = () => (variantGroups.length && variantSel.every(Boolean) ? variantSel.join('+') : null);

  function optionHtml(o, name) {
    return `
      <label class="opt">
        <input type="radio" name="${name}" value="${esc(o.id)}">
        <span class="opt__icon" aria-hidden="true">${o.icon || ''}</span>
        <span class="opt__label">${esc(o.label)}</span>
        ${typeof o.price === 'number' ? `<span class="opt__price">${formatRp(o.price)}</span>` : ''}
        <span class="opt__check" aria-hidden="true">✓</span>
      </label>`;
  }

  function openVariant(p) {
    variantProduct = p; variantGroups = Catalog.groups(p); variantSel = variantGroups.map(() => null);
    const multi = variantGroups.length > 1;
    $('#variantTitle').textContent = multi ? 'Pilih Variasi' : variantGroups[0].title;
    $('#variantProduct').textContent = p.cartName || p.name;
    $('#variantHint').textContent = multi ? 'Pilih satu di setiap kelompok.' : (variantGroups[0].hint || '');
    variantOptions.innerHTML = variantGroups.map((g, gi) => multi
      ? `<div class="opt-group"><p class="opt-group__title">${esc(g.title)}</p><div class="options">${g.options.map((o) => optionHtml(o, 'variant-' + gi)).join('')}</div></div>`
      : g.options.map((o) => optionHtml(o, 'variant-0')).join('')).join('');
    updateVariantButton();
    showSheet(variantSheet);
  }

  function updateVariantButton() {
    variantOptions.querySelectorAll('.opt').forEach((l) => l.classList.toggle('is-selected', l.querySelector('input').checked));
    const choice = variantChoice();
    if (!choice) {
      variantAdd.disabled = true;
      variantAdd.textContent = variantGroups.length > 1 ? 'Pilih semua variasi dulu' : 'Pilih salah satu dulu';
    } else {
      const o = Catalog.option(variantProduct, choice);
      variantAdd.disabled = false;
      variantAdd.textContent = `Tambahkan ke Keranjang · ${formatRp(o.price)}`;
    }
  }

  variantOptions.addEventListener('change', (e) => {
    const m = /^variant-(\d+)$/.exec(e.target.name || '');
    if (m) { variantSel[Number(m[1])] = e.target.value; updateVariantButton(); }
  });

  variantAdd.addEventListener('click', () => {
    const choice = variantChoice();
    if (!variantProduct || !choice) return;                 // semua variasi wajib dipilih
    const p = variantProduct, o = Catalog.option(p, choice);
    if (Cart.add(p.id, choice)) {
      closeSheet(true);
      toast(`${Catalog.group(p).asName ? o.label : (p.cartName || p.name) + ' · ' + o.label} ditambahkan ✓`);
    }
  });

  /* --------------------------------------------------------------- Toast */
  const toastEl = $('#toast'); let toastTimer;
  function toast(msg, ms) {
    toastEl.textContent = msg; toastEl.hidden = false;
    toastEl.style.animation = 'none'; void toastEl.offsetWidth; toastEl.style.animation = '';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, ms || 1800);
  }

  /* ------------------------------------------- Badge & bar keranjang */
  const badge = $('#cartBadge'), fabCart = $('#cartBtn .tab__ico');
  let lastCount = Cart.count();

  // Badge Floating Cart Button: angka mengikuti isi keranjang; berdenyut saat jumlah bertambah/berkurang.
  function updateCartIndicators() {
    const n = Cart.count();
    badge.textContent = n > 99 ? '99+' : n;
    badge.hidden = n === 0;
    if (n !== lastCount) {
      [badge, fabCart].forEach((el) => { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); });
    }
    lastCount = n;
  }

  Cart.subscribe(() => {
    updateCartIndicators();
    if (openSheet === cartSheet && view === 'cart') renderCart();
  });

  /* ------------------------------------- Keranjang / Checkout / Sukses */
  let view = 'cart';                                  // 'cart' | 'skeleton' | 'checkout' | 'success'
  const form = { name: '', kelas: '', mode: 'pickup', note: '' };
  // Pembayaran (hanya untuk tampilan & input; server menetapkan nominal/kembalian/status).
  // cashChoice: angka (pecahan cepat) atau 'custom'.
  const pay = { method: '', cashMode: '', cashChoice: null, cashCustom: '' };
  let proof = null;            // { blob, base64, url, bytes } — bukti QRIS yang sudah dikecilkan
  let proofBusy = false, qrisFailed = false;
  let lastPay = null;          // ringkasan pembayaran untuk layar sukses & pesan WhatsApp
  let lastWaUrl = '';
  const cartBody = $('#cartBody'), cartFoot = $('#cartFoot'), cartTitle = $('#cartTitle'), cartBack = $('#cartBack');
  // ghost = tombol "Kembali" tetap menempati ruangnya tapi tak terlihat (dipakai skeleton agar layout tidak melompat)
  const setBack = (show, ghost) => { cartBack.hidden = !show; cartBack.style.visibility = ghost ? 'hidden' : ''; };

  /* ------------------------------------- Keyboard kelas (buatan sendiri) -----------------
     Kolom Kelas tidak memakai keyboard bawaan HP (input readonly + inputmode="none").
     Pelanggan menekan X / I / E / F / 1-8; tanda hubung ditambahkan otomatis.
     Tombol yang tidak mungkin membentuk kelas resmi dinonaktifkan, jadi input tak bisa melewati format. */
  const KELAS_KEYS = ['X', 'I', 'E', 'F', '1', '2', '3', '4', '5', '6', '7', '8'];
  const KELAS_RAW = KELAS_RESMI.map((c) => c.replace('-', ''));
  const kelasRaw = (s) => s.replace(/-/g, '');
  const kelasFormat = (raw) => raw.replace(/^(XI{0,2})(?=[EF])/, '$1-');
  const kelasCanAdd = (raw, k) => KELAS_RAW.some((c) => c.startsWith(raw + k));
  const isKelasValid = (v) => KELAS_RESMI.includes(v);
  const KELAS_ERR_EMPTY = 'Kelas wajib diisi.';
  const KELAS_ERR_NOTFOUND = 'Kelas tidak ditemukan. Silakan periksa kembali penulisan kelas Anda.';

  const kbd = document.createElement('div');
  kbd.className = 'kbd'; kbd.id = 'kelasKbd'; kbd.hidden = true;
  kbd.setAttribute('role', 'group'); kbd.setAttribute('aria-label', 'Keyboard kelas');
  kbd.innerHTML = `
    <div class="kbd__grid">
      ${KELAS_KEYS.map((k) => `<button type="button" class="kbd__key" data-k="${k}">${k}</button>`).join('')}
      <button type="button" class="kbd__key kbd__key--del" data-k="del" aria-label="Hapus">⌫</button>
      <button type="button" class="kbd__key kbd__key--done" data-k="done">Selesai</button>
    </div>`;
  cartSheet.appendChild(kbd);

  function showKelasError(bad, value) {
    const f = $('[data-field="kelas"]');
    if (!f) return;
    f.classList.toggle('has-error', bad);
    if (bad) f.querySelector('.err').textContent = value.trim() ? KELAS_ERR_NOTFOUND : KELAS_ERR_EMPTY;
  }

  function updateKelasKeys() {
    const raw = kelasRaw($('#fKelas').value);
    kbd.querySelectorAll('[data-k]').forEach((b) => {
      const k = b.dataset.k;
      if (k === 'del') b.disabled = !raw;
      else if (k !== 'done') b.disabled = !kelasCanAdd(raw, k);
    });
  }

  function showKelasKeyboard() {
    if (view !== 'checkout' || !kbd.hidden) return;
    kbd.hidden = false; cartFoot.hidden = true;
    $('[data-field="kelas"]').classList.add('is-typing');
    updateKelasKeys();
    $('#fKelas').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function hideKelasKeyboard() {
    kbd.hidden = true; cartFoot.hidden = false;
    const f = $('[data-field="kelas"]');
    if (f) f.classList.remove('is-typing');
  }

  function kelasKey(k) {
    const input = $('#fKelas');
    let raw = kelasRaw(input.value);
    if (k === 'done') {
      hideKelasKeyboard();
      if (input.value) showKelasError(!isKelasValid(input.value), input.value);   // kelas belum lengkap/tidak ada → beri tahu sekarang
      return;
    }
    if (k === 'del') raw = raw.slice(0, -1);
    else if (kelasCanAdd(raw, k)) raw += k;
    else return;
    input.value = form.kelas = kelasFormat(raw);
    showKelasError(false, '');
    updateKelasKeys();
  }

  kbd.addEventListener('click', (e) => {
    const b = e.target.closest('[data-k]');
    if (b && !b.disabled) kelasKey(b.dataset.k);
  });
  cartSheet.addEventListener('focusin', (e) => { if (e.target.id === 'fKelas') showKelasKeyboard(); });
  cartSheet.addEventListener('click', (e) => { if (e.target.id === 'fKelas') showKelasKeyboard(); });

  function openCart() {
    view = 'cart';
    renderCart();
    showSheet(cartSheet);
    updateCartIndicators();
  }

  function renderCart() {
    view = 'cart';
    hideKelasKeyboard();
    cartTitle.textContent = 'Keranjang';
    setBack(false);
    const lines = Cart.lines();

    if (!lines.length) {
      cartBody.innerHTML = `<div class="empty" style="margin-top:12px"><div class="empty__icon">🛒</div><strong>Keranjang masih kosong</strong>Yuk pilih jajanan favoritmu!</div>`;
      cartFoot.innerHTML = `<button type="button" class="btn btn--olive btn--block" data-act="close">Lihat Menu</button>`;
      return;
    }

    cartBody.innerHTML = lines.map((l) => `
      <div class="line" data-key="${esc(l.key)}">
        <div>
          <div class="line__name">${esc(l.name)}</div>
          ${l.variantLabel ? `<span class="line__variant">${esc(l.variantLabel)}</span>` : ''}
          <div class="line__unit">${formatRp(l.unitPrice)} / item</div>
        </div>
        <div class="line__sub">${formatRp(l.subtotal)}</div>
        <div class="line__ctrl">
          <div class="qty" role="group" aria-label="Jumlah ${esc(l.name)}">
            <button type="button" data-act="dec" aria-label="Kurangi">−</button>
            <span aria-live="polite">${l.qty}</span>
            <button type="button" data-act="inc" aria-label="Tambah">+</button>
          </div>
          <button type="button" class="rm-btn" data-act="rm">Hapus</button>
        </div>
      </div>`).join('');

    cartFoot.innerHTML = `
      <div class="total-row"><span>Total pembayaran (${Cart.count()} item)</span><strong>${formatRp(Cart.total())}</strong></div>
      <button type="button" class="btn btn--orange btn--block" data-act="checkout">Lanjut Pesan</button>`;
  }

  function renderCheckout() {
    view = 'checkout';
    hideKelasKeyboard();
    cartTitle.textContent = 'Detail Pesanan';
    setBack(true);
    const lines = Cart.lines();

    cartBody.innerHTML = `
      <form id="checkoutForm" novalidate>
        <div class="field" data-field="name">
          <label for="fName">Nama pemesan</label>
          <input type="text" id="fName" maxlength="60" autocomplete="name" placeholder="Nama kamu" value="${esc(form.name)}">
          <p class="err">Nama wajib diisi.</p>
        </div>
        <div class="field" data-field="kelas">
          <label for="fKelas">Kelas</label>
          <input type="text" id="fKelas" maxlength="6" autocomplete="off" readonly inputmode="none" placeholder="Contoh: X-E4" value="${esc(form.kelas)}">
          <p class="err">Kelas wajib diisi.</p>
        </div>
        <div class="field" data-field="mode">
          <span class="lbl">Pengambilan</span>
          <div class="seg" role="radiogroup" aria-label="Cara pengambilan">
            <label class="opt${form.mode === 'pickup' ? ' is-selected' : ''}"><input type="radio" name="mode" value="pickup" ${form.mode === 'pickup' ? 'checked' : ''}>🛍️ Ambil sendiri</label>
            <label class="opt${form.mode === 'delivery' ? ' is-selected' : ''}"><input type="radio" name="mode" value="delivery" ${form.mode === 'delivery' ? 'checked' : ''}>🛵 Diantar</label>
          </div>
          <p class="err">Pilih cara pengambilan.</p>
        </div>
        <div class="field">
          <label for="fNote">Catatan (opsional)</label>
          <textarea id="fNote" rows="2" maxlength="200" placeholder="Contoh: sambal dipisah">${esc(form.note)}</textarea>
        </div>
        <div class="field" data-field="payment">
          <span class="lbl">Metode pembayaran</span>
          <div class="seg" role="radiogroup" aria-label="Metode pembayaran">
            <label class="opt${pay.method === 'QRIS' ? ' is-selected' : ''}"><input type="radio" name="paymethod" value="QRIS" ${pay.method === 'QRIS' ? 'checked' : ''}>📱 QRIS</label>
            <label class="opt${pay.method === 'Cash' ? ' is-selected' : ''}"><input type="radio" name="paymethod" value="Cash" ${pay.method === 'Cash' ? 'checked' : ''}>💵 Cash</label>
          </div>
          <p class="err">Pilih metode pembayaran.</p>
        </div>
        <div class="pay-panel" id="payPanel"></div>
        <div class="summary">
          ${lines.map((l) => `<div class="summary__row"><span>${l.qty}× ${esc(l.name)}${l.variantLabel ? ' (' + esc(l.variantLabel) + ')' : ''}</span><span>${formatRp(l.subtotal)}</span></div>`).join('')}
        </div>
      </form>`;
    renderPayPanel();

    cartFoot.innerHTML = `
      <div class="total-row"><span>Total pembayaran</span><strong>${formatRp(Cart.total())}</strong></div>
      <button type="button" class="btn btn--orange btn--block" data-act="send">PESAN SEKARANG</button>`;
  }

  /* ------------------------------------------------------------ Pembayaran */
  const cashReceived = () => (pay.cashChoice === 'custom' ? PAYMENT.parseMoney(pay.cashCustom) : pay.cashChoice);
  const syncSelected = () => cartSheet.querySelectorAll('.seg .opt').forEach((l) => l.classList.toggle('is-selected', l.querySelector('input').checked));

  function renderPayPanel() {
    const el = $('#payPanel');
    if (!el) return;
    const total = Cart.total();

    if (pay.method === 'QRIS') {
      const src = PAYMENT.CONFIG.qrisImage;
      el.innerHTML = `
        <div class="pay-box qris">
          <div class="qris__amount"><span>Nominal yang harus dibayar</span><strong>${formatRp(total)}</strong></div>
          <div class="qris__frame">${qrisFailed
            ? '<p class="qris__missing">Gambar QRIS belum tersedia. Silakan pilih pembayaran Cash atau hubungi penjual.</p>'
            : `<img class="qris__img" id="qrisImg" src="${esc(src)}" alt="QRIS BnB Cemilan">`}</div>
          ${qrisFailed ? '' : `<a class="qris__save" href="${esc(src)}" download="QRIS-BnB-Cemilan">Simpan gambar QRIS</a>`}
          <p class="pay-note">Scan QRIS, bayar <strong>tepat ${formatRp(total)}</strong>, lalu unggah bukti pembayaran di bawah. Pembayaran akan dicek oleh admin.</p>
        </div>
        <div class="field pay-box upload" data-field="proof">
          <span class="lbl">Bukti pembayaran <span aria-hidden="true" style="color:#B3261E">*</span></span>
          <label class="btn btn--ghost btn--block upload__btn">📷 ${proof ? 'Ganti bukti pembayaran' : 'Unggah bukti pembayaran'}
            <input type="file" class="upload__input" id="fProof" accept="image/*"${proofBusy ? ' disabled' : ''}>
          </label>
          ${proofBusy ? '<p class="upload__busy" role="status">Memproses foto…</p>' : ''}
          ${proof && !proofBusy ? `<div class="upload__preview"><img class="upload__thumb" src="${proof.url}" alt="Bukti pembayaran"><div class="upload__meta"><strong>Bukti siap dikirim ✓</strong><span>${Math.max(1, Math.round(proof.bytes / 1024))} KB</span></div></div>` : ''}
          <p class="err">Bukti pembayaran wajib diunggah sebelum memesan.</p>
        </div>`;
      const img = $('#qrisImg');
      if (img) img.addEventListener('error', () => { qrisFailed = true; renderPayPanel(); });
    } else if (pay.method === 'Cash') {
      el.innerHTML = `
        <div class="field pay-box" data-field="cash">
          <span class="lbl">Cara membayar tunai</span>
          <div class="seg" role="radiogroup" aria-label="Cara membayar tunai">
            <label class="opt${pay.cashMode === 'exact' ? ' is-selected' : ''}"><input type="radio" name="cashmode" value="exact" ${pay.cashMode === 'exact' ? 'checked' : ''}>👌 Uang Pas</label>
            <label class="opt${pay.cashMode === 'change' ? ' is-selected' : ''}"><input type="radio" name="cashmode" value="change" ${pay.cashMode === 'change' ? 'checked' : ''}>🔄 Uang Kembali</label>
          </div>
          <div id="cashDetail"></div>
          <p class="err" id="cashErr">Pilih Uang Pas atau Uang Kembali.</p>
        </div>`;
      renderCashDetail(false);
    } else {
      el.innerHTML = '';
    }
  }

  function renderCashDetail(focusCustom) {
    const box = $('#cashDetail');
    if (!box) return;
    const total = Cart.total();
    if (pay.cashMode === 'exact') {
      box.innerHTML = `<p class="pay-note pay-note--ok">Siapkan uang pas ${formatRp(total)}. Pembayaran dilakukan saat pesanan diterima.</p>`;
    } else if (pay.cashMode === 'change') {
      const quick = PAYMENT.quickAmounts(total);
      if (typeof pay.cashChoice === 'number' && !quick.includes(pay.cashChoice)) pay.cashChoice = null;   // total berubah → pilihan lama tidak berlaku
      box.innerHTML = `
        <p class="pay-box__title" style="margin-top:12px">Uang yang akan Anda berikan</p>
        <div class="pay-chips" role="group" aria-label="Nominal uang">
          ${quick.map((a) => `<button type="button" class="pay-chip${pay.cashChoice === a ? ' is-selected' : ''}" data-cash="${a}" aria-pressed="${pay.cashChoice === a}">${formatRp(a)}</button>`).join('')}
          <button type="button" class="pay-chip${pay.cashChoice === 'custom' ? ' is-selected' : ''}" data-cash="custom" aria-pressed="${pay.cashChoice === 'custom'}">Nominal lain</button>
        </div>
        ${pay.cashChoice === 'custom' ? `<div class="pay-custom"><input type="text" id="fCashCustom" inputmode="numeric" autocomplete="off" maxlength="12" placeholder="Contoh: 50000" aria-label="Nominal uang yang diberikan" value="${esc(pay.cashCustom)}"></div>` : ''}
        <div id="cashCalc"></div>
        <p class="pay-note">Kembalian dihitung otomatis dan akan dicatat untuk penjual.</p>`;
      updateCashCalc();
      if (focusCustom) { const inp = $('#fCashCustom'); if (inp) inp.focus(); }
    } else {
      box.innerHTML = '';
    }
  }

  function updateCashCalc() {
    const el = $('#cashCalc');
    if (!el) return;
    const received = cashReceived();
    if (received == null) { el.innerHTML = ''; return; }
    const total = Cart.total();
    const r = PAYMENT.cashCalc(total, 'change', received);
    el.innerHTML = r.ok
      ? `<div class="pay-calc">
           <div class="pay-calc__row"><span>Total pesanan</span><span>${formatRp(total)}</span></div>
           <div class="pay-calc__row"><span>Uang diberikan</span><span>${formatRp(r.received)}</span></div>
           <div class="pay-calc__row pay-calc__row--big"><span>Kembalian</span><span>${formatRp(r.change)}</span></div>
         </div>`
      : `<div class="pay-calc is-bad" role="alert">${esc(r.error)}</div>`;
  }

  async function handleProofFile(file) {
    if (!file) return;
    proofBusy = true; renderPayPanel();
    try {
      const p = await PAYMENT.prepareProof(file);
      if (proof && proof.url) URL.revokeObjectURL(proof.url);
      proof = { blob: p.blob, base64: p.base64, url: p.url, bytes: p.blob.size };
    } catch (err) {
      toast(err.message || 'Foto tidak bisa diproses. Coba foto lain.', 4000);
    }
    proofBusy = false; renderPayPanel();
  }

  function resetPayment() {
    if (proof && proof.url) URL.revokeObjectURL(proof.url);
    proof = null; proofBusy = false;
    pay.method = ''; pay.cashMode = ''; pay.cashChoice = null; pay.cashCustom = '';
  }

  // Menandai kolom pembayaran yang belum benar; true = semua valid.
  function validatePayment() {
    const total = Cart.total();
    const fPay = $('[data-field="payment"]');
    const methodBad = pay.method !== 'QRIS' && pay.method !== 'Cash';
    if (fPay) fPay.classList.toggle('has-error', methodBad);
    if (methodBad) return { ok: false, el: fPay };

    if (pay.method === 'QRIS') {
      const fProof = $('[data-field="proof"]');
      if (qrisFailed) { toast('QRIS belum tersedia. Silakan pilih Cash atau hubungi penjual.', 4000); return { ok: false, el: fProof }; }
      if (proofBusy) { toast('Foto bukti sedang diproses, tunggu sebentar.'); return { ok: false, el: fProof }; }
      const bad = !proof;
      if (fProof) fProof.classList.toggle('has-error', bad);
      return { ok: !bad, el: fProof };
    }

    const fCash = $('[data-field="cash"]');
    const r = PAYMENT.cashCalc(total, pay.cashMode, cashReceived());
    if (fCash) {
      fCash.classList.toggle('has-error', !r.ok);
      const err = $('#cashErr'); if (err && !r.ok) err.textContent = r.error;
    }
    return { ok: r.ok, el: fCash };
  }

  /* Skeleton shimmer: kerangka Detail Pesanan sebelum konten asli tampil (±750 ms). */
  let skeletonTimer;
  function renderCheckoutSkeleton() {
    view = 'skeleton';
    hideKelasKeyboard();
    const field = (control) => `<div class="skel-field"><span class="skel skel--label"></span>${control}</div>`;
    const rows = Math.min(Math.max(Cart.lines().length, 1), 4);
    cartTitle.innerHTML = '<span class="skel skel--title"></span>';
    setBack(true, true);
    cartBody.innerHTML = `
      <div aria-hidden="true">
        ${field('<span class="skel skel--input"></span>')}
        ${field('<span class="skel skel--input"></span>')}
        ${field('<div class="skel-seg"><span class="skel skel--input"></span><span class="skel skel--input"></span></div>')}
        ${field('<span class="skel skel--area"></span>')}
        <div class="summary">
          ${Array.from({ length: rows }, () => '<div class="summary__row"><span class="skel skel--text" style="width:58%"></span><span class="skel skel--text" style="width:22%"></span></div>').join('')}
        </div>
      </div>`;
    cartFoot.innerHTML = `
      <div class="total-row" aria-hidden="true"><span class="skel skel--text" style="width:38%"></span><span class="skel skel--total"></span></div>
      <span class="skel skel--btn" aria-hidden="true"></span>`;
  }

  const fadeIn = (el) => {
    el.classList.remove('is-fading-in'); void el.offsetWidth;
    el.classList.add('is-fading-in');
    el.addEventListener('animationend', () => el.classList.remove('is-fading-in'), { once: true });
  };

  function openOrderDetail() {
    qrisFailed = false;                                // coba muat gambar QRIS lagi
    renderCheckoutSkeleton();
    showSheet(cartSheet);
    updateCartIndicators();
    clearTimeout(skeletonTimer);
    skeletonTimer = setTimeout(() => {
      if (openSheet !== cartSheet || view !== 'skeleton') return;   // panel ditutup / pindah tampilan saat memuat
      renderCheckout();
      [cartTitle, cartBody, cartFoot].forEach(fadeIn);
    }, 750);
  }

  function renderSuccess() {
    view = 'success';
    hideKelasKeyboard();
    cartTitle.textContent = 'Pesanan Dikirim';
    setBack(false);
    cartBody.innerHTML = `
      <div class="success">
        <div class="success__icon">🎉</div>
        <h3>Terima kasih, ${esc(form.name)}!</h3>
        <p>Pesananmu sudah disiapkan. Jika WhatsApp belum terbuka atau pesan belum terkirim, tekan tombol di bawah.</p>
        ${lastPay ? paySummaryHtml(lastPay) : ''}
        ${lastWaUrl ? '<button type="button" class="btn btn--olive btn--block" data-act="wa">Buka WhatsApp Lagi</button>' : ''}
        <button type="button" class="btn btn--ghost btn--block" data-act="close">Kembali ke Menu</button>
      </div>`;
    cartFoot.innerHTML = '';
  }

  function paySummaryHtml(p) {
    if (p.method === 'QRIS') {
      return `<div class="success__pay"><div><span>Pembayaran</span><strong>QRIS · ${formatRp(p.total)}</strong></div><div><span>Status</span><strong>Menunggu verifikasi admin</strong></div></div>`;
    }
    return `<div class="success__pay"><div><span>Pembayaran</span><strong>Cash · ${p.cashMode === 'exact' ? 'Uang pas' : 'Uang kembali'}</strong></div>
      <div><span>Uang diberikan</span><strong>${formatRp(p.received)}</strong></div>
      <div><span>Kembalian</span><strong>${formatRp(p.change)}</strong></div>
      <div><span>Status</span><strong>Belum dibayar</strong></div></div>`;
  }

  function payLineForMessage() {
    if (!lastPay) return '';
    if (lastPay.method === 'QRIS') return 'Pembayaran: QRIS (bukti sudah diunggah, menunggu verifikasi)';
    return lastPay.cashMode === 'exact'
      ? 'Pembayaran: Cash — Uang pas'
      : `Pembayaran: Cash — Uang diberikan ${formatRp(lastPay.received)}, kembalian ${formatRp(lastPay.change)}`;
  }

  function buildMessage() {
    const lines = Cart.lines();
    const out = [];
    out.push('*PESANAN BnB CEMILAN*', '');
    out.push(`Nama Pemesan: ${form.name.trim()}`);
    out.push(`Kelas: ${form.kelas.trim()}`);
    out.push(`Pengambilan: ${form.mode === 'delivery' ? 'Diantar' : 'Ambil sendiri'}`);
    out.push(`Catatan: ${form.note.trim() || '-'}`);
    out.push('', '*DAFTAR PESANAN*', '');
    lines.forEach((l, i) => {
      out.push(`${i + 1}. ${l.baseName}`);
      out.push(`   Variasi: ${l.variantText || '-'}`);
      out.push(`   Jumlah: ${l.qty}`);
      out.push(`   Harga: ${formatRp(l.unitPrice)}`);
      out.push(`   Subtotal: ${formatRp(l.subtotal)}`);
      out.push('');
    });
    out.push(`Total Pembayaran: ${formatRp(Cart.total())}`);
    const payLine = payLineForMessage();
    if (payLine) out.push(payLine);
    out.push('', `Terima kasih telah memesan di ${STORE.name}!`);
    return out.join('\n');
  }

  function collectForm() {
    const f = $('#checkoutForm');
    if (!f) return;
    form.name = $('#fName').value;
    form.kelas = $('#fKelas').value;
    form.mode = f.elements.mode.value;
    form.note = $('#fNote').value;
  }

  function validateForm() {
    collectForm();
    const nameBad = !form.name.trim();
    const kelasBad = !isKelasValid(form.kelas);
    const modeBad = form.mode !== 'pickup' && form.mode !== 'delivery';
    $('[data-field="name"]').classList.toggle('has-error', nameBad);
    showKelasError(kelasBad, form.kelas);
    $('[data-field="mode"]').classList.toggle('has-error', modeBad);
    const payCheck = validatePayment();
    if (nameBad) $('#fName').focus();
    else if (kelasBad) $('#fKelas').focus();
    else if (!payCheck.ok && payCheck.el) payCheck.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return !(nameBad || kelasBad || modeBad || !payCheck.ok);
  }

  // WhatsApp Click to Chat: nomor internasional tanpa "+", isi pesan = struk otomatis.
  async function sendOrder() {
    if (!Cart.count() || !validateForm()) return;

    const button = cartFoot.querySelector('[data-act="send"]');
    if (button) { button.disabled = true; button.textContent = pay.method === 'QRIS' ? 'MENGUNGGAH BUKTI...' : 'MENYIMPAN PESANAN...'; }

    const lines = Cart.lines();
    const total = Cart.total();
    const payload = {
      customer_name: form.name.trim(),
      class_code: form.kelas.trim(),
      pickup_method: form.mode === 'delivery' ? 'Diantar' : 'Ambil sendiri',
      note: form.note.trim() || null,
      items: lines.map((line) => ({
        product_id: line.product.id,
        name: line.baseName,
        variant: line.variantText || null,
        option_id: line.option ? line.option.id : null,   // dipakai server untuk menghitung ulang harga
        quantity: line.qty,
        unit_price: line.unitPrice,
        subtotal: line.subtotal
      })),
      subtotal: total,
      total,
      // Hanya pilihan pelanggan; server menghitung kembalian & menetapkan status pembayaran.
      payment: pay.method === 'QRIS'
        ? { method: 'QRIS', proof: { data: proof.base64 } }
        : { method: 'Cash', cash_mode: pay.cashMode, ...(pay.cashMode === 'change' ? { cash_received: cashReceived() } : {}) }
    };

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { const err = new Error(result.error || 'Pesanan gagal disimpan.'); err.code = result.code; throw err; }

      // Ringkasan pembayaran memakai angka dari server bila tersedia.
      const o = result.order || {};
      // Catat pesanan di perangkat ini supaya statusnya bisa dipantau (tab Pesanan + notifikasi).
      if (window.BnbLive && o.id) {
        BnbLive.addOrder({
          id: o.id, name: form.name.trim(), pickup: payload.pickup_method,
          total: Number.isInteger(o.total) ? o.total : total,
          items: lines.map((l) => ({ productId: l.product.id, name: l.baseName, variant: l.variantText || null, qty: l.qty })),
          createdAt: Date.now()
        });
      }
      lastPay = pay.method === 'QRIS'
        ? { method: 'QRIS', total: Number.isInteger(o.total) ? o.total : total }
        : {
            method: 'Cash', cashMode: pay.cashMode, total,
            received: Number.isInteger(o.cash_received) ? o.cash_received : (pay.cashMode === 'exact' ? total : cashReceived()),
            change: Number.isInteger(o.change_amount) ? o.change_amount : (pay.cashMode === 'exact' ? 0 : cashReceived() - total)
          };

      // Buka WhatsApp setelah database mengonfirmasi pesanan tersimpan.
      lastWaUrl = `https://wa.me/${STORE.whatsappNumber}?text=${encodeURIComponent(buildMessage())}`;
      window.open(lastWaUrl, '_blank', 'noopener');
      Cart.clear();
      form.note = '';
      resetPayment();
      renderSuccess();
    } catch (error) {
      if (button) { button.disabled = false; button.textContent = 'PESAN SEKARANG'; }
      toast(error.message || 'Tidak dapat menyimpan pesanan. Periksa koneksi lalu coba lagi.', 4500);
      // Harga/menu berubah di server: muat katalog terbaru lalu kembali ke keranjang agar total yang tampil benar.
      if (['PRICE_CHANGED', 'MENU_CHANGED', 'MENU_UNAVAILABLE'].includes(error.code)) {
        loadCatalogFromSupabase(true).then(() => { if (openSheet === cartSheet && view === 'checkout') renderCart(); });
      }
    }
  }

  cartBack.addEventListener('click', () => renderCart());

  // Pilihan nominal cepat pada "Uang Kembali"
  cartSheet.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-cash]');
    if (!chip) return;
    pay.cashChoice = chip.dataset.cash === 'custom' ? 'custom' : Number(chip.dataset.cash);
    const f = $('[data-field="cash"]'); if (f) f.classList.remove('has-error');
    renderCashDetail(pay.cashChoice === 'custom');
  });

  cartSheet.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const line = btn.closest('.line');
    const key = line && line.dataset.key;
    if (act === 'inc') Cart.inc(key);
    else if (act === 'dec') Cart.dec(key);
    else if (act === 'rm') Cart.remove(key);
    else if (act === 'checkout') renderCheckout();
    else if (act === 'send') sendOrder();
    else if (act === 'wa') window.open(lastWaUrl, '_blank', 'noopener');
    else if (act === 'close') closeSheet();
  });

  cartSheet.addEventListener('change', (e) => {
    if (e.target.name === 'mode') {
      collectForm();
      syncSelected();
    } else if (e.target.name === 'paymethod') {
      pay.method = e.target.value;
      syncSelected();
      const f = $('[data-field="payment"]'); if (f) f.classList.remove('has-error');
      renderPayPanel();
    } else if (e.target.name === 'cashmode') {
      pay.cashMode = e.target.value;
      syncSelected();
      const f = $('[data-field="cash"]'); if (f) f.classList.remove('has-error');
      renderCashDetail(pay.cashChoice === 'custom');
    } else if (e.target.id === 'fProof') {
      handleProofFile(e.target.files && e.target.files[0]);
    }
  });
  cartSheet.addEventListener('input', (e) => {
    if (e.target.id === 'fName') $('[data-field="name"]').classList.remove('has-error');
    else if (e.target.id === 'fCashCustom') {
      pay.cashCustom = e.target.value.replace(/\D/g, '').slice(0, 9);
      if (e.target.value !== pay.cashCustom) e.target.value = pay.cashCustom;
      const f = $('[data-field="cash"]'); if (f) f.classList.remove('has-error');
      updateCashCalc();
    }
  });
  // Pindah ke kolom lain (mis. Nama / Catatan) → keyboard kelas ditutup, keyboard bawaan dipakai di sana.
  cartSheet.addEventListener('focusin', (e) => {
    if (e.target.matches('input, textarea') && e.target.id !== 'fKelas') hideKelasKeyboard();
  });


  /* ------------------------------------ Beranda ⇄ Menu ⇄ Pesanan (Bottom Tab Bar) */
  // Tiga tampilan berada dalam satu halaman (tanpa muat ulang), sehingga keranjang tidak terhapus.
  // Menu memakai alamat #menu dan Pesanan memakai #pesanan agar tombol Kembali (browser / HP / APK) kembali ke beranda.
  const homeView = $('#homeView'), menuView = $('#menuView'), ordersView = $('#ordersView'), menuTools = $('#menuTools');
  const tabbar = $('#tabbar'), tabBlob = $('#tabBlob');
  const TAB_ORDER = ['home', 'menu', 'cart', 'orders'];   // Keranjang = tab ketiga (membuka panel keranjang)
  const VIEW_EL = { home: homeView, menu: menuView, orders: ordersView };
  let firstShow = true, currentView = 'home';
  const currentTab = () => (openSheet === cartSheet ? 'cart' : currentView);

  function paintTabs(name) {
    tabbar.querySelectorAll('.tab').forEach((t) => {
      if (t.dataset.tab === name) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
    });
    const prev = tabbar.style.getPropertyValue('--i');
    tabbar.style.setProperty('--i', TAB_ORDER.indexOf(name));
    if (!firstShow && prev !== String(TAB_ORDER.indexOf(name))) {   // efek cairan hanya saat indikator benar-benar berpindah
      tabBlob.classList.remove('is-flow'); void tabBlob.offsetWidth; tabBlob.classList.add('is-flow');
    }
  }

  function showView(name) {
    currentView = name;
    closeSheet(true);
    Object.keys(VIEW_EL).forEach((k) => { VIEW_EL[k].hidden = k !== name; });
    Object.values(VIEW_EL).forEach(resetEl);
    menuTools.hidden = name !== 'menu';
    ['home', 'menu', 'orders'].forEach((k) => document.body.classList.toggle('view-' + k, k === name));
    paintTabs(name);
    if (name === 'home') showPanel(PANELS[location.hash] || null);
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    syncStickyHeight();
    const el = VIEW_EL[name];                                    // perpindahan halaman yang halus
    el.classList.remove('view-in'); void el.offsetWidth; el.classList.add('view-in');
    firstShow = false;
    document.dispatchEvent(new CustomEvent('bnb:view', { detail: name }));
  }
  // Tiga panel beranda (Kontak Admin / Cara Pesan / Sosial Media): satu tampil, yang lain disembunyikan.
  const PANELS = { '#kontak': 'kontak', '#cara-pesan': 'cara', '#sosial': 'sosial' };
  const HASH_OF = { kontak: '#kontak', cara: '#cara-pesan', sosial: '#sosial' };
  const hub = $('#hub');
  function showPanel(name) {
    hub.hidden = !!name;
    document.querySelectorAll('.panel').forEach((pn) => { pn.hidden = pn.dataset.panel !== name; });
    if (name) window.dispatchEvent(new Event('resize'));   // carousel Cara Pesan dihitung ulang setelah tampil
  }
  function openPanel(name) { location.hash = HASH_OF[name].slice(1); }
  function closePanel() {
    if (history.state && history.state.bnbSub) { history.back(); return; }
    history.replaceState(null, '', location.pathname + location.search);
    showPanel(null);
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }
  document.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openPanel(b.dataset.open)));
  document.querySelectorAll('[data-hub-back]').forEach((b) => b.addEventListener('click', closePanel));

  const HASH_OF_VIEW = { menu: '#menu', orders: '#pesanan' };
  const viewFromHash = () => (location.hash === '#menu' ? 'menu' : location.hash === '#pesanan' ? 'orders' : 'home');

  function goTo(name) {
    if (name === 'cart') { if (openSheet !== cartSheet) openCart(); return; }
    const cur = viewFromHash();
    if (name === 'home') return goHome();
    if (cur === name) { showView(name); return; }
    if (cur === 'home') { location.hash = HASH_OF_VIEW[name].slice(1); return; }   // menambah riwayat → memicu hashchange
    // Menu ⇄ Pesanan: ganti entri riwayat (bukan menumpuk) supaya tombol Kembali tetap menuju beranda.
    try { history.replaceState({ bnbMenu: true }, '', HASH_OF_VIEW[name]); } catch (e) { /* abaikan */ }
    showView(name);
  }
  const goMenu = () => goTo('menu');
  function goHome() {
    if (viewFromHash() !== 'home') {
      if (history.length > 1 && history.state && history.state.bnbMenu) { history.back(); return; }
      history.replaceState(null, '', location.pathname + location.search);
    } else if (hub.hidden) { closePanel(); return; }   // sedang membuka panel Kontak/Cara Pesan/Sosial → tutup panel
    showView('home');
  }
  window.addEventListener('hashchange', () => {
    if (viewFromHash() !== 'home') { try { history.replaceState({ bnbMenu: true }, ''); } catch (e) { /* abaikan */ } }
    else if (PANELS[location.hash]) { try { history.replaceState({ bnbSub: true }, ''); } catch (e) { /* abaikan */ } }
    showView(viewFromHash());
  });
  window.addEventListener('popstate', () => showView(viewFromHash()));

  $('#heroCta').addEventListener('click', goMenu);
  tabbar.addEventListener('click', (e) => {
    if (swiped) return;                                        // klik semu setelah geseran tidak boleh membuka tab
    const t = e.target.closest('[data-tab]'); if (t) goTo(t.dataset.tab);
  });

  /* Geser (swipe) HANYA pada Bottom Tab Bar. Saat jari bergerak: halaman, indikator cair, dan ikon di bawah jari ikut bergerak.
     Saat jari diangkat di atas tab lain (atau geser cepat 1 pilihan): pindah ke tab itu, jika tidak kembali ke tab semula. Ikon lemparan selalu di tengah & di atas indikator.
     Kanan = maju satu tab, kiri = mundur satu tab, berhenti di ujung. Ketukan biasa tetap membuka tab langsung. */
  const DRAG_LOCK = 8, FLICK_PX = 20, FLICK_V = 0.5, ANIM_MS = 340;   // px; px/ms
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');
  let drag = null, swiped = false, busy = false, lifted = null;   // lifted: { idx, el, ox } ikon yang sedang naik
  const tabEls = () => TAB_ORDER.map((n) => tabbar.querySelector(`.tab[data-tab="${n}"]`));
  const tabIndexAt = (x) => {
    const r = tabbar.getBoundingClientRect();
    return Math.min(TAB_ORDER.length - 1, Math.max(0, Math.floor((x - r.left - 6) / ((r.width - 12) / TAB_ORDER.length))));
  };
  const stepPx = () => tabBlob.offsetWidth;                         // lebar satu tab = lebar indikator

  /* Posisi kiri indikator (px, dari sisi dalam kapsul) untuk posisi jari; dibatasi di dalam kapsul. */
  let blobPx = 0;
  const blobPosAt = (clientX) => {
    const barX = tabbar.getBoundingClientRect().left + 6, step = stepPx();
    return Math.max(0, Math.min((TAB_ORDER.length - 1) * step, clientX - step / 2 - barX));
  };

  /* Ikon di bawah jari naik keluar dari kapsul. Pusat ikon SELALU = pusat indikator (ikon mengunci di tengah & di atas indikator). */
  function liftAt(i, clientX) {
    const tab = tabEls()[i];
    const ox = clientX == null ? 0 : blobPosAt(clientX) - i * stepPx();
    if (!lifted || lifted.idx !== i) {
      dropLift();
      lifted = { idx: i, tab, el: tab.querySelector('.tab__ico'), ox: 0 };
      tab.classList.add('is-lift');
      lifted.el.style.transition = '';                               // naik dengan transisi CSS
    } else lifted.el.style.transition = 'none';                      // ikut indikator tanpa tertinggal
    lifted.ox = ox;
    lifted.el.style.transform = `translate3d(${ox}px,-26px,0) scale(1.12)`;
  }
  /* Ikon yang naik kembali ke kapsulnya (tanpa lemparan). */
  function dropLift() {
    if (!lifted) return;
    const { el, idx } = lifted; lifted = null;
    tabEls()[idx].classList.remove('is-lift');
    el.style.transition = ''; el.style.transform = '';
  }
  /* Lemparan ikon tab tujuan (idx): meluncur mendatar SEJALAN dengan indikator (durasi & kurva sama), tetap di tengah & di atas
     indikator, lalu turun mendarat di kapsul. Dipakai untuk klik, geser 1 pilihan, dan geser jauh. startOx = pusat indikator
     saat ini dikurangi pusat tab tujuan. */
  let flyEnd = null;
  function flyTo(idx, startOx, dur, ease) {
    if (flyEnd) flyEnd();
    const to = tabEls()[idx], real = to.querySelector('.tab__ico'), a = to.getBoundingClientRect();
    const fly = document.createElement('div');
    fly.className = 'tab ico-fly';
    fly.style.cssText = `left:${a.left}px;top:${a.top}px;width:${a.width}px;height:${a.height}px`;
    const ico = real.cloneNode(true);
    ico.style.cssText = ''; ico.classList.remove('bump');            // buang sisa transform/transisi dari ikon yang sempat naik
    fly.appendChild(ico);
    document.body.appendChild(fly);
    real.style.visibility = 'hidden';                                 // ikon asli disembunyikan selama melayang (tidak dobel)
    const slide = fly.animate(
      [{ transform: `translate3d(${startOx}px,0,0)` }, { transform: 'translate3d(0,0,0)' }],
      { duration: dur, easing: ease, fill: 'forwards' });             // sumbu X: kurva yang sama dengan indikator
    ico.animate([
      { transform: 'translate3d(0,-26px,0) scale(1.12)', easing: 'linear' },
      { transform: 'translate3d(0,-26px,0) scale(1.12)', offset: 0.7, easing: 'cubic-bezier(.4,0,.6,1)' },
      { transform: 'translate3d(0,0,0) scale(1)' }
    ], { duration: dur, fill: 'forwards' });                          // sumbu Y: tetap di atas indikator, lalu turun di akhir
    const end = () => { flyEnd = null; slide.onfinish = null; fly.remove(); real.style.visibility = ''; };
    flyEnd = end;
    slide.onfinish = () => { end(); real.classList.add('bump'); setTimeout(() => real.classList.remove('bump'), 450); };
  }
  /* Indikator cair mengikuti jari secara langsung (piksel); animate=true untuk meluncur ke posisi akhir. */
  // px = posisi kiri indikator (dihitung dari sisi dalam kapsul); translasi dihitung terhadap posisi dasar (--i)
  function moveBlob(px, animate) {
    blobPx = px;
    const base = (Number(tabbar.style.getPropertyValue('--i')) || 0) * stepPx();
    tabBlob.style.transition = animate ? 'transform .34s cubic-bezier(.2,.8,.2,1)' : 'none';
    tabBlob.style.transform = `translate3d(${px - base}px,0,0)`;
  }
  function moveEl(el, x, animate) {
    if (!el) return;
    el.style.transition = animate ? `transform ${ANIM_MS}ms cubic-bezier(.2,.8,.2,1)` : 'none';
    el.style.transform = `translate3d(${x}px,0,0)`;
  }
  function resetEl(el) { if (el) { el.style.transition = ''; el.style.transform = ''; } }

  tabbar.addEventListener('pointerdown', (e) => {
    if ((e.pointerType === 'mouse' && e.button !== 0) || busy) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), on: false, from: TAB_ORDER.indexOf(currentTab()) };
    liftAt(tabIndexAt(e.clientX));                                  // naik tepat di tengah tab (belum menggeser)
  });
  tabbar.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.on) {
      if (Math.abs(dy) > DRAG_LOCK && Math.abs(dy) > Math.abs(dx)) { drag = null; dropLift(); return; }   // gerak vertikal: bukan geser
      if (Math.abs(dx) < DRAG_LOCK) return;
      drag.on = true; try { tabbar.setPointerCapture(e.pointerId); } catch (err) { /* pointer sudah lepas */ }
      tabBlob.style.animation = 'none';                            // denyut cairan dimatikan selama indikator digeser/meluncur
      drag.from = TAB_ORDER.indexOf(currentTab());
      drag.srcEl = VIEW_EL[currentView];
      drag.target = drag.from;
    }
    liftAt(tabIndexAt(e.clientX), e.clientX);                      // ikon mengikuti pusat indikator
    drag.target = lifted.idx;
    // halaman TIDAK ikut digeser: tetap di tempatnya sampai jari diangkat
    moveBlob(blobPosAt(e.clientX), false);
  });
  function endDrag(e, cancelled) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    const step = stepPx(), W = window.innerWidth;

    if (!d.on) {                                                   // KETUKAN: ikon dilempar ke tab yang diketuk, sejalan dengan indikator
      const idx = tabIndexAt(e.clientX);
      dropLift();
      if (cancelled || idx === d.from) return;                     // tab yang sama: biarkan klik biasa
      swiped = true; setTimeout(() => { swiped = false; }, 350);   // klik semu setelah ketukan tidak boleh memproses dua kali
      if (!REDUCED.matches) flyTo(idx, d.from * step - idx * step, 550, 'cubic-bezier(.34,1.45,.5,1)');   // sama dengan transisi "left" indikator
      goTo(TAB_ORDER[idx]);
      return;
    }

    if (lifted) liftAt(tabIndexAt(e.clientX), e.clientX);          // titik lepas, bukan gerakan terakhir yang sempat tercatat
    const rel = blobPosAt(e.clientX);
    moveBlob(rel, false); void tabBlob.offsetWidth;                // indikator persis di titik lepas sebelum meluncur
    const dx = e.clientX - d.x, v = Math.abs(dx) / Math.max(1, performance.now() - d.t);
    const flick = Math.abs(dx) > FLICK_PX && v > FLICK_V;
    let target = lifted ? lifted.idx : d.target;
    if (target === d.from && flick)                                // geser cepat 1 pilihan walau jari belum keluar dari tab asal
      target = Math.max(0, Math.min(TAB_ORDER.length - 1, d.from + Math.sign(dx)));
    const commit = !cancelled && target !== d.from;                // lepas di atas tab lain = pindah (tidak perlu geser jauh)
    const dest = commit ? target : d.from, name = TAB_ORDER[dest], sgn = Math.sign(dest - d.from);
    const dstEl = commit && name !== 'cart' ? VIEW_EL[name] : null;
    swiped = true; setTimeout(() => { swiped = false; }, 350);
    busy = true;
    const lift = lifted; lifted = null;
    if (lift) { lift.el.style.transition = ''; lift.el.style.transform = ''; tabEls()[lift.idx].classList.remove('is-lift'); }
    if (!REDUCED.matches) flyTo(dest, rel - dest * step, ANIM_MS, 'cubic-bezier(.2,.8,.2,1)');   // sama dengan moveBlob(animate)
    if (commit && dstEl) {                                       // setelah jari diangkat: halaman lama keluar, halaman baru masuk
      dstEl.hidden = false; moveEl(dstEl, sgn * W, false); void dstEl.offsetWidth;
      moveEl(d.srcEl, -sgn * W, true); moveEl(dstEl, 0, true);
    }
    moveBlob(dest * step, true);                                  // indikator meluncur tepat ke tab tujuan
    setTimeout(() => {
      tabBlob.style.transition = 'none';                           // pindahkan posisi dasar tanpa animasi ganda
      tabBlob.style.animation = '';
      paintTabs(name);
      tabBlob.style.transform = ''; void tabBlob.offsetWidth; tabBlob.style.transition = '';
      if (commit) goTo(name);                                      // showView membereskan posisi halaman
      busy = false;
    }, ANIM_MS);
  }
  tabbar.addEventListener('pointerup', (e) => endDrag(e, false));
  tabbar.addEventListener('pointercancel', (e) => endDrag(e, true));
  document.querySelectorAll('a.brand').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); goHome(); }));
  window.BnbUI = { showSheet, closeSheet, toast, goTo, refreshCatalog: () => loadCatalogFromSupabase(true) };           // dipakai js/live.js (notifikasi & pesanan)

  // Mulai dari beranda (alamat #menu / panel dari tautan lama dibersihkan); #pesanan boleh dibuka langsung.
  if (location.hash === '#menu' || PANELS[location.hash]) history.replaceState(null, '', location.pathname + location.search);
  $('#homeYear').textContent = new Date().getFullYear();

  // WhatsApp admin: memakai nomor yang sudah terdaftar di data.js (STORE.whatsappNumber).
  $('#waLink').href = `https://wa.me/${STORE.whatsappNumber}?text=${encodeURIComponent('Halo Admin BnB Cemilan, saya ingin bertanya.')}`;

  /* ----------------------------------------------------- Carousel Cara Pesan */
  (function initHow() {
    const track = $('#howTrack'), nav = $('#howNav'), dots = $('#howDots');
    const prev = $('#howPrev'), next = $('#howNext');
    const slides = Array.from(track.children);
    dots.innerHTML = slides.map((_, i) => `<button type="button" class="how__dot" role="tab" aria-label="Langkah ${i + 1}" data-i="${i}"></button>`).join('');
    const dotEls = Array.from(dots.children);
    let cur = 0;
    const closest = () => {
      const c = track.scrollLeft + track.clientWidth / 2;
      let best = 0, bd = Infinity;
      slides.forEach((sl, i) => { const d = Math.abs(sl.offsetLeft + sl.offsetWidth / 2 - c); if (d < bd) { bd = d; best = i; } });
      return best;
    };
    function paint() {
      cur = closest();
      dotEls.forEach((d, i) => { d.classList.toggle('is-active', i === cur); d.setAttribute('aria-selected', i === cur); });
      prev.disabled = cur === 0; next.disabled = cur === slides.length - 1;
    }
    function go(i) {
      const sl = slides[Math.max(0, Math.min(slides.length - 1, i))];
      track.scrollTo({ left: sl.offsetLeft - (track.clientWidth - sl.offsetWidth) / 2, behavior: 'smooth' });
    }
    function overflowCheck() { nav.hidden = track.scrollWidth <= track.clientWidth + 4; }
    track.addEventListener('scroll', () => requestAnimationFrame(paint), { passive: true });
    prev.addEventListener('click', () => go(cur - 1));
    next.addEventListener('click', () => go(cur + 1));
    dots.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) go(Number(b.dataset.i)); });
    track.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(cur + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(cur - 1); }
    });
    window.addEventListener('resize', () => { overflowCheck(); paint(); });
    overflowCheck(); paint();
  })();

  /* ---------------------------------------------------------------- Start */
  initIntro();
  initGreeting();
  renderCategories();
  renderMenu();
  updateCartIndicators();
  syncStickyHeight();
  if (viewFromHash() === 'orders') showView('orders'); else paintTabs('home');
  firstShow = false;

  // Ambil katalog terbaru dari Supabase. Tampilan tetap memakai komponen yang sama.
  let catalogSignature = '';
  async function loadCatalogFromSupabase(isRefresh) {
    try {
      const response = await fetch('/api/products', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Gagal memuat menu.');

      // Pembaruan otomatis: render ulang hanya jika data berubah (admin mengubah menu / menandai habis).
      const signature = JSON.stringify(result);
      if (isRefresh && signature === catalogSignature) return;
      catalogSignature = signature;

      // Jenis menu dari Supabase (diatur lewat halaman admin). Jika kosong, pakai cadangan di data.js.
      if (Array.isArray(result.categories) && result.categories.length) {
        CATEGORIES = result.categories.map((c) => ({
          id: c.id, name: c.name, emoji: c.emoji || '🍽️', color: c.color || '#556B2F'
        }));
        if (state.category !== 'all' && !CATEGORIES.some((c) => c.id === state.category)) state.category = 'all';
        renderCategories();
      }

      PRODUCTS = Array.isArray(result.products) ? result.products : [];

      // Bentuk variasi dari database disesuaikan dengan format yang dipakai cart.js.
      PRODUCTS = PRODUCTS.map((product) => ({
        ...product,
        variantGroups: (product.variantGroups || []).map((group) => ({
          title: group.title,
          hint: group.hint || '',
          asName: Boolean(group.asName),
          options: (group.options || []).map((option) => ({
            ...option,
            extra: typeof option.extra === 'number' ? option.extra : undefined
          }))
        }))
      }));

      Cart._reload();
      renderMenu();
      updateCartIndicators();
      if (openSheet === cartSheet && view === 'cart') renderCart();
    } catch (error) {
      if (isRefresh) return;   // gagal refresh senyap: tampilan lama tetap dipakai
      menuEl.innerHTML = `<div class="empty"><strong>Menu belum dapat dimuat</strong><p>${esc(error.message || 'Periksa koneksi internet.')}</p><button class="btn btn--ghost" type="button" onclick="location.reload()">Coba lagi</button></div>`;
    }
  }
  loadCatalogFromSupabase(false);
  // Status menu (tersedia / belum tersedia) ikut diperbarui otomatis tanpa muat ulang halaman.
  setInterval(() => { if (!document.hidden) loadCatalogFromSupabase(true); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadCatalogFromSupabase(true); });
})();
