/* ==========================================================================
   BnB Cemilan — PANEL ADMIN
   Vanilla JS + Supabase (Auth, Postgres, Realtime). Konfigurasi: js/config.js
   Bagian: util · auth · data · realtime · laporan · pesanan · menu · jenis menu · modal
   ========================================================================== */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cfg = window.ADMIN_CONFIG || {};
  const TZ = cfg.TIMEZONE || 'Asia/Jakarta';
  const rp = (n) => 'Rp' + Math.round(Number(n) || 0).toLocaleString('id-ID');
  const rpShort = (n) => n >= 1e6 ? (n / 1e6).toFixed(n % 1e6 ? 1 : 0).replace('.', ',') + 'jt' : n >= 1e3 ? Math.round(n / 1e3) + 'rb' : String(n);
  const slug = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'item';
  const STATUS = ['Baru', 'Diproses', 'Selesai', 'Dibatalkan'];
  // Pembayaran: tombol yang tersedia untuk tiap metode + status. [status baru, label, kelas tombol]
  const PAY_ACTS = {
    QRIS: {
      'Menunggu Verifikasi': [['Terverifikasi', 'Verifikasi ✓', 'btn--olive'], ['Ditolak', 'Tolak', 'btn--ghost']],
      'Terverifikasi': [['Ditolak', 'Tolak', 'btn--ghost']],
      'Ditolak': [['Terverifikasi', 'Verifikasi ✓', 'btn--olive'], ['Menunggu Verifikasi', 'Kembalikan ke menunggu', 'btn--ghost']]
    },
    Cash: {
      'Belum Dibayar': [['Sudah Dibayar', 'Tandai Sudah Dibayar ✓', 'btn--olive']],
      'Sudah Dibayar': [['Belum Dibayar', 'Batalkan pelunasan', 'btn--ghost']]
    }
  };
  const PAY_BUCKET = 'payment-proofs';
  const awaitingProof = (o) => o.payment_status === 'Menunggu Verifikasi' && o.status !== 'Dibatalkan';

  const dayKey = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: TZ });          // YYYY-MM-DD di zona waktu toko
  const fmtTime = (d) => new Date(d).toLocaleString('id-ID', { timeZone: TZ, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  function ago(d) {
    const s = Math.max(0, (Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return 'baru saja';
    if (s < 3600) return Math.floor(s / 60) + ' mnt lalu';
    if (s < 86400) return Math.floor(s / 3600) + ' jam lalu';
    return fmtTime(d);
  }

  const state = { user: null, categories: [], products: [], orders: [], tab: 'dashboard', orderFilter: 'aktif', menuCat: 'all', menuQ: '', fresh: new Set(), newCount: 0, realtimeOk: false };
  let sb = null, channel = null, pollTimers = [];

  /* ------------------------------------------------------------------ UI helpers */
  const toastEl = $('#toast'); let toastTimer;
  function toast(msg, isError) {
    toastEl.textContent = msg; toastEl.classList.toggle('is-error', !!isError); toastEl.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.hidden = true; }, isError ? 5000 : 2600);
  }
  const errMsg = (e) => (e && (e.message || e.details)) || 'Terjadi kesalahan.';

  /* ---- modal tunggal ---- */
  const modal = $('#modal'), backdrop = $('#backdrop'), modalForm = $('#modalForm');
  let modalSubmit = null;
  function openModal({ title, body, okText = 'Simpan', cancelText = 'Batal', danger = false, onSubmit, hideOk = false }) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = body;
    $('#modalFoot').innerHTML = `<button type="button" class="btn btn--ghost" data-close>${esc(cancelText)}</button>` +
      (hideOk ? '' : `<button type="submit" class="btn ${danger ? 'btn--danger' : 'btn--primary'}" id="modalOk">${esc(okText)}</button>`);
    modalSubmit = onSubmit; modal.hidden = false; backdrop.hidden = false;
    const first = $('#modalBody input:not([type=hidden]):not([type=checkbox]), #modalBody textarea');
    if (first && !hideOk && window.innerWidth >= 900) first.focus();
  }
  function closeModal() { modal.hidden = true; backdrop.hidden = true; modalSubmit = null; }
  modal.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeModal(); });
  backdrop.addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });
  modalForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!modalSubmit) return;
    const ok = $('#modalOk'); if (ok) ok.disabled = true;
    try { const keepOpen = await modalSubmit(); if (keepOpen !== false) closeModal(); }
    catch (err) { showFormError(errMsg(err)); }
    finally { if (ok) ok.disabled = false; }
  });
  function showFormError(msg) {
    let box = $('#formError');
    if (!box) { box = document.createElement('p'); box.id = 'formError'; box.className = 'form-error'; box.setAttribute('role', 'alert'); $('#modalBody').prepend(box); }
    box.textContent = msg; box.scrollIntoView({ block: 'nearest' });
  }
  function confirmDialog({ title, body, okText = 'Ya', danger = true }) {
    return new Promise((resolve) => {
      let done = false;
      openModal({ title, body: `<p>${body}</p>`, okText, danger, onSubmit: () => { done = true; resolve(true); } });
      const obs = new MutationObserver(() => { if (modal.hidden) { obs.disconnect(); if (!done) resolve(false); } });
      obs.observe(modal, { attributes: true, attributeFilter: ['hidden'] });
    });
  }
  const inspectDialog = (title, body) => openModal({ title, body: `<p>${body}</p>`, hideOk: true, cancelText: 'Mengerti' });

  /* ------------------------------------------------------------------ Auth */
  const loginEl = $('#login'), shellEl = $('#shell');
  const configured = () => !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && !cfg.error);

  function showLogin(msg) {
    shellEl.hidden = true; loginEl.hidden = false;
    const box = $('#loginError');
    box.hidden = !msg; box.textContent = msg || '';
  }

  async function checkAdmin() {
    const { data, error } = await sb.rpc('is_admin');
    if (error) throw new Error('Gagal memeriksa hak admin. Pastikan ADMIN_SETUP.sql sudah dijalankan. (' + errMsg(error) + ')');
    return data === true;
  }

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#loginBtn'); btn.disabled = true; btn.textContent = 'Masuk…';
    try {
      const { error } = await sb.auth.signInWithPassword({ email: $('#loginEmail').value.trim(), password: $('#loginPass').value });
      if (error) throw new Error(/invalid/i.test(error.message) ? 'Email atau kata sandi salah.' : error.message);
      await enter();
    } catch (err) { showLogin(errMsg(err)); }
    finally { btn.disabled = false; btn.textContent = 'Masuk'; }
  });
  $('#logoutBtn').addEventListener('click', async () => { await sb.auth.signOut(); teardown(); showLogin(); });

  async function enter() {
    const { data } = await sb.auth.getSession();
    if (!data.session) return showLogin();
    if (!(await checkAdmin())) {
      await sb.auth.signOut();
      return showLogin('Akun ini belum terdaftar sebagai admin. Tambahkan emailnya ke tabel admin_users (lihat ADMIN_SETUP.sql).');
    }
    state.user = data.session.user;
    $('#whoami').textContent = state.user.email || '';
    loginEl.hidden = true; shellEl.hidden = false;
    $('#loginPass').value = '';
    await boot();
  }

  /* ------------------------------------------------------------------ Data */
  async function loadCategories() {
    const { data, error } = await sb.from('categories').select('*').order('sort_order', { ascending: true });
    if (error) throw error; state.categories = data || [];
  }
  async function loadProducts() {
    const { data, error } = await sb.from('products').select('*').order('sort_order', { ascending: true });
    if (error) throw error; state.products = data || [];
  }
  async function loadOrders(silent) {
    const since = new Date(Date.now() - 60 * 864e5).toISOString();
    const { data, error } = await sb.from('orders').select('*').gte('created_at', since).order('created_at', { ascending: false }).limit(2000);
    if (error) { if (!silent) throw error; return; }
    const known = new Set(state.orders.map((o) => String(o.id)));
    const incoming = data || [];
    if (silent && state.orders.length) incoming.filter((o) => !known.has(String(o.id)) && o.status === 'Baru').forEach(onNewOrder);
    state.orders = incoming;
    renderOrdersViews();
  }

  async function boot() {
    renderSkeleton();
    try { await Promise.all([loadCategories(), loadProducts(), loadOrders()]); }
    catch (err) { toast('Gagal memuat data: ' + errMsg(err), true); }
    renderAll();
    startRealtime();
    switchTab(state.tab);
  }
  function teardown() {
    if (channel) { sb.removeChannel(channel); channel = null; }
    pollTimers.forEach(clearInterval); pollTimers = [];
    Object.assign(state, { user: null, categories: [], products: [], orders: [], newCount: 0 });
  }
  function renderSkeleton() { $('#menuList').innerHTML = $('#catList').innerHTML = '<div class="skeleton"></div>'.repeat(3); }

  /* ------------------------------------------------------------------ Realtime */
  const liveEl = $('#liveState');
  function setLive(mode) {
    liveEl.className = 'live ' + ({ on: 'is-on', poll: 'is-poll', off: 'is-off' }[mode] || '');
    $('span', liveEl).textContent = { on: 'Live', poll: 'Cek tiap 15 dtk', off: 'Terputus', wait: 'Menyambung…' }[mode] || '';
  }
  function startRealtime() {
    setLive('wait');
    if (channel) sb.removeChannel(channel);
    channel = sb.channel('bnb-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, onOrderChange)
      .subscribe((status) => {
        state.realtimeOk = status === 'SUBSCRIBED';
        setLive(status === 'SUBSCRIBED' ? 'on' : (status === 'CLOSED' ? 'off' : 'poll'));
      });
    pollTimers.forEach(clearInterval);
    pollTimers = [
      setInterval(() => { if (!state.realtimeOk) loadOrders(true); }, 15000),   // cadangan bila realtime gagal
      setInterval(() => loadOrders(true), 60000),                                // sinkron berkala
      setInterval(() => { renderOrdersViews(true); }, 30000)                     // "x menit lalu" ikut bergerak
    ];
  }
  function onOrderChange(p) {
    const row = p.new, id = String((p.new && p.new.id) ?? (p.old && p.old.id));
    if (p.eventType === 'DELETE') state.orders = state.orders.filter((o) => String(o.id) !== id);
    else if (state.orders.some((o) => String(o.id) === id)) state.orders = state.orders.map((o) => String(o.id) === id ? row : o);
    else { state.orders.unshift(row); if (row.status === 'Baru') onNewOrder(row); }
    renderOrdersViews();
  }
  function onNewOrder(o) {
    state.fresh.add(String(o.id)); setTimeout(() => state.fresh.delete(String(o.id)), 6000);
    state.newCount += 1; document.title = `(${state.newCount}) Pesanan baru — BnB Cemilan Admin`;
    toast(`🔔 Pesanan baru: ${o.customer_name} (${o.class_code}) — ${rp(o.total)}${o.payment_method ? ' · ' + o.payment_method : ''}`);
    beep();
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { state.newCount = 0; document.title = 'BnB Cemilan — Admin'; } });

  /* bunyi notifikasi */
  let soundOn = false, audioCtx = null;
  try { soundOn = localStorage.getItem('bnb_admin_sound') === '1'; } catch (e) { /* diabaikan */ }
  function paintSound() { const b = $('#soundBtn'); b.textContent = soundOn ? '🔔' : '🔕'; b.setAttribute('aria-pressed', soundOn); }
  function beep() {
    if (!soundOn) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      [660, 880].forEach((f, i) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain(), t = audioCtx.currentTime + i * 0.18;
        o.frequency.value = f; o.type = 'sine'; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
        o.connect(g); g.connect(audioCtx.destination); o.start(t); o.stop(t + 0.18);
      });
    } catch (e) { /* diabaikan */ }
  }
  $('#soundBtn').addEventListener('click', () => {
    soundOn = !soundOn; try { localStorage.setItem('bnb_admin_sound', soundOn ? '1' : '0'); } catch (e) { /* diabaikan */ }
    paintSound(); if (soundOn) { beep(); toast('Bunyi pesanan baru aktif'); } else toast('Bunyi dimatikan');
  });

  /* ------------------------------------------------------------------ Navigasi */
  const TITLES = { dashboard: 'Laporan', orders: 'Pesanan', menu: 'Menu', categories: 'Jenis Menu' };
  function switchTab(tab) {
    state.tab = tab;
    $$('.panel').forEach((p) => { p.hidden = p.id !== 'tab-' + tab; });
    $$('#nav button').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === tab));
    $('#pageTitle').textContent = TITLES[tab];
    window.scrollTo({ top: 0 });
    if (tab === 'menu') loadProducts().then(renderMenu).catch(() => {});
    if (tab === 'categories') loadCategories().then(() => { renderCategories(); renderMenu(); }).catch(() => {});
    if (tab === 'orders') { state.newCount = 0; document.title = 'BnB Cemilan — Admin'; }
  }
  $('#nav').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) switchTab(b.dataset.tab); });
  document.addEventListener('click', (e) => { const g = e.target.closest('[data-goto]'); if (g) switchTab(g.dataset.goto); });

  // Geser kiri/kanan untuk pindah tab (mobile). Dilewati saat menyentuh elemen ber-data-no-swipe, input, chip, atau modal.
  const TAB_ORDER = ['dashboard', 'orders', 'menu', 'categories'];
  let swX = 0, swY = 0, swOn = false;
  document.addEventListener('touchstart', (e) => {
    swOn = !e.target.closest('[data-no-swipe], .filters, .modal, .backdrop, input, textarea, select');
    swX = e.touches[0].clientX; swY = e.touches[0].clientY;
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (!swOn || window.innerWidth >= 900 || $('#shell').hidden || !$('#modal').hidden) return;
    const dx = e.changedTouches[0].clientX - swX, dy = e.changedTouches[0].clientY - swY;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const i = TAB_ORDER.indexOf(state.tab);
    const next = TAB_ORDER[dx < 0 ? i + 1 : i - 1];
    if (next) switchTab(next);
  }, { passive: true });

  function renderAll() { renderDashboard(); renderOrders(); renderMenu(); renderCategories(); paintSound(); }
  function renderOrdersViews() { renderDashboard(); renderOrders(); }

  /* ------------------------------------------------------------------ Laporan */
  const active = (o) => o.status !== 'Dibatalkan' && o.payment_status !== 'Ditolak';   // pembayaran ditolak tidak dihitung sebagai pendapatan
  const sum = (list) => list.reduce((s, o) => s + (Number(o.total) || 0), 0);
  let lastHeroValue = null;

  function renderDashboard() {
    const today = dayKey(Date.now()), monthKey = today.slice(0, 7);
    const dayKeys = (n) => Array.from({ length: n }, (_, i) => dayKey(Date.now() - (n - 1 - i) * 864e5));
    const last7 = new Set(dayKeys(7));
    const live = state.orders.filter(active);
    const todayAll = state.orders.filter((o) => dayKey(o.created_at) === today);
    const todayLive = todayAll.filter(active);
    const week = live.filter((o) => last7.has(dayKey(o.created_at)));
    const month = live.filter((o) => dayKey(o.created_at).startsWith(monthKey));
    const pending = state.orders.filter((o) => o.status === 'Baru' || o.status === 'Diproses').length;
    const done = todayAll.filter((o) => o.status === 'Selesai');
    const cancelled = todayAll.filter((o) => o.status === 'Dibatalkan').length;
    const heroVal = sum(todayLive);

    $('#stats').innerHTML = `
      <div class="stat stat--hero"><div class="stat__label">Pendapatan hari ini</div><div class="stat__val${lastHeroValue !== null && lastHeroValue !== heroVal ? ' bump' : ''}">${rp(heroVal)}</div><div class="stat__sub">${todayLive.length} pesanan</div></div>
      <div class="stat"><div class="stat__label">7 hari terakhir</div><div class="stat__val">${rp(sum(week))}</div><div class="stat__sub">${week.length} pesanan</div></div>
      <div class="stat"><div class="stat__label">Bulan ini</div><div class="stat__val">${rp(sum(month))}</div><div class="stat__sub">${month.length} pesanan</div></div>
      <div class="stat"><div class="stat__label">Pesanan aktif</div><div class="stat__val">${pending}</div><div class="stat__sub">Baru + Diproses</div></div>
      <div class="stat"><div class="stat__label">Selesai hari ini</div><div class="stat__val">${done.length}</div><div class="stat__sub">${rp(sum(done))}</div></div>
      <div class="stat"><div class="stat__label">Rata-rata / pesanan</div><div class="stat__val">${rp(todayLive.length ? heroVal / todayLive.length : 0)}</div><div class="stat__sub">hari ini</div></div>
      <div class="stat"><div class="stat__label">Dibatalkan hari ini</div><div class="stat__val">${cancelled}</div><div class="stat__sub">tidak dihitung</div></div>`;
    lastHeroValue = heroVal;

    // grafik 14 hari
    const keys = dayKeys(14), perDay = Object.fromEntries(keys.map((k) => [k, 0]));
    live.forEach((o) => { const k = dayKey(o.created_at); if (k in perDay) perDay[k] += Number(o.total) || 0; });
    const max = Math.max(1, ...Object.values(perDay));
    $('#chart').innerHTML = keys.map((k) => {
      const v = perDay[k], h = Math.max(2, Math.round((v / max) * 100));
      return `<div class="bar${k === today ? ' is-today' : ''}" title="${esc(k)}: ${rp(v)}" tabindex="0">
        <span class="bar__val">${v ? rpShort(v) : ''}</span><div class="bar__fill" style="height:${v ? h : 2}%"></div><span class="bar__x">${Number(k.slice(8))}</span></div>`;
    }).join('');

    // menu terlaris bulan ini
    const tally = new Map();
    month.forEach((o) => (Array.isArray(o.items) ? o.items : []).forEach((it) => {
      const name = it.name || 'Menu'; tally.set(name, (tally.get(name) || 0) + (Number(it.quantity) || 0));
    }));
    const top = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    $('#topItems').innerHTML = top.length
      ? top.map(([n, q], i) => `<li><span class="top__n">${i + 1}</span><span class="top__name">${esc(n)}</span><span class="top__q">${q}×</span></li>`).join('')
      : '<li class="muted small">Belum ada penjualan bulan ini.</li>';

    // pesanan terbaru
    const recent = state.orders.slice(0, 4);
    $('#recent').innerHTML = recent.length ? recent.map(orderHtml).join('') : '<div class="empty">Belum ada pesanan.</div>';

    const nNew = state.orders.filter((o) => o.status === 'Baru').length;
    const badge = $('#newBadge'); badge.hidden = nNew === 0; badge.textContent = nNew > 99 ? '99+' : nNew;
  }

  /* ------------------------------------------------------------------ Pesanan */
  function payHtml(o) {
    if (!o.payment_method) return '<div class="pay pay--legacy">Pembayaran tidak tercatat (pesanan lama)</div>';
    const st = o.payment_status || '';
    const acts = (PAY_ACTS[o.payment_method] || {})[st] || [];
    let detail;
    if (o.payment_method === 'QRIS') {
      detail = o.payment_proof
        ? '<button type="button" class="btn btn--sm btn--ghost" data-pay-view>🖼️ Lihat bukti</button>'
        : '<span class="muted small">Bukti tidak tersedia</span>';
    } else {
      const got = Number(o.cash_received) || 0, chg = Number(o.change_amount) || 0;
      detail = got && chg === 0 && got === Number(o.total)
        ? `<span class="pay__cash">Uang pas <b>${rp(got)}</b></span>`
        : `<span class="pay__cash">Uang diberikan <b>${rp(got)}</b> · Kembalian <b>${rp(chg)}</b></span>`;
    }
    return `
        <div class="pay">
          <div class="pay__row"><span class="pay__method">${o.payment_method === 'QRIS' ? '📱' : '💵'} ${esc(o.payment_method)}</span><span class="pbadge" data-ps="${esc(st)}">${esc(st || '—')}</span></div>
          <div class="pay__row pay__row--detail">${detail}</div>
          ${acts.length ? `<div class="pay__acts">${acts.map(([to, label, cls]) => `<button type="button" class="btn btn--sm ${cls}" data-pay-act="${esc(to)}">${esc(label)}</button>`).join('')}</div>` : ''}
        </div>`;
  }

  function orderHtml(o) {
    const items = Array.isArray(o.items) ? o.items : [];
    const acts = {
      Baru: [['Diproses', 'Proses', 'btn--olive'], ['Dibatalkan', 'Batalkan', 'btn--ghost']],
      Diproses: [['Selesai', 'Selesai ✓', 'btn--olive'], ['Dibatalkan', 'Batalkan', 'btn--ghost']],
      Selesai: [['Diproses', 'Buka lagi', 'btn--ghost']],
      Dibatalkan: [['Baru', 'Pulihkan', 'btn--ghost']]
    }[o.status] || [['Baru', 'Set Baru', 'btn--ghost']];
    return `
      <article class="order${state.fresh.has(String(o.id)) ? ' is-fresh' : ''}" data-status="${esc(o.status)}" data-id="${esc(o.id)}">
        <div class="order__top">
          <div><div class="order__who">${esc(o.customer_name)} · ${esc(o.class_code)}</div>
            <div class="order__meta">${esc(o.pickup_method)} · ${esc(ago(o.created_at))}</div></div>
          <span class="badge badge--${esc(o.status)}">${esc(o.status)}</span>
        </div>
        <ul class="order__items">${items.map((it) => `<li><span>${esc(it.quantity)}× ${esc(it.name)}${it.variant ? ` <small>(${esc(it.variant)})</small>` : ''}</span><span>${rp(it.subtotal)}</span></li>`).join('') || '<li class="muted">—</li>'}</ul>
        ${o.note ? `<div class="order__note">📝 ${esc(o.note)}</div>` : ''}
        ${payHtml(o)}
        <div class="order__foot"><span class="order__total">${rp(o.total)}</span>
          <div class="order__acts">${acts.map(([to, label, cls]) => `<button type="button" class="btn btn--sm ${cls}" data-order-act="${esc(to)}">${esc(label)}</button>`).join('')}</div></div>
      </article>`;
  }

  function renderOrders() {
    const counts = { aktif: 0, semua: state.orders.length };
    STATUS.forEach((s) => { counts[s] = state.orders.filter((o) => o.status === s).length; });
    counts.aktif = counts.Baru + counts.Diproses;
    counts.verifikasi = state.orders.filter(awaitingProof).length;
    const filters = [['aktif', 'Aktif'], ['verifikasi', 'Perlu Verifikasi'], ['Baru', 'Baru'], ['Diproses', 'Diproses'], ['Selesai', 'Selesai'], ['Dibatalkan', 'Dibatalkan'], ['semua', 'Semua']];
    $('#orderFilters').innerHTML = filters.map(([k, l]) => `<button type="button" class="chip${state.orderFilter === k ? ' is-active' : ''}" data-ofilter="${k}">${l}<small>${counts[k]}</small></button>`).join('');
    let list = state.orders;
    if (state.orderFilter === 'aktif') list = list.filter((o) => o.status === 'Baru' || o.status === 'Diproses');
    else if (state.orderFilter === 'verifikasi') list = list.filter(awaitingProof);
    else if (state.orderFilter !== 'semua') list = list.filter((o) => o.status === state.orderFilter);
    if (state.orderFilter === 'aktif' || state.orderFilter === 'verifikasi') list = [...list].reverse();   // pesanan aktif: yang paling lama dulu (antrean)
    $('#orders').innerHTML = list.length ? list.slice(0, 120).map(orderHtml).join('') : '<div class="empty">Tidak ada pesanan di sini.</div>';
  }

  $('#orderFilters').addEventListener('click', (e) => { const b = e.target.closest('[data-ofilter]'); if (b) { state.orderFilter = b.dataset.ofilter; renderOrders(); } });
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-order-act]'); if (!btn) return;
    const card = btn.closest('.order'), id = card.dataset.id, to = btn.dataset.orderAct;
    if (to === 'Dibatalkan' && !(await confirmDialog({ title: 'Batalkan pesanan?', body: 'Pesanan ini tidak lagi dihitung dalam pendapatan.', okText: 'Ya, batalkan' }))) return;
    btn.disabled = true;
    const { data, error } = await sb.from('orders').update({ status: to }).eq('id', id).select();
    if (error || !data || !data.length) { btn.disabled = false; return toast(error ? errMsg(error) : 'Gagal mengubah status (tidak ada izin).', true); }
    state.orders = state.orders.map((o) => String(o.id) === String(id) ? data[0] : o);
    renderOrdersViews();
  });

  /* ---- pembayaran: ubah status (hanya admin; dijaga juga oleh RLS) & lihat bukti ---- */
  async function changePayment(id, to, btn) {
    const o = state.orders.find((x) => String(x.id) === String(id));
    if (!o || !o.payment_method) return;
    const who = `${esc(o.customer_name)} (${esc(o.class_code)}) — ${rp(o.total)}`;
    const ask = {
      'Terverifikasi': { title: 'Verifikasi pembayaran?', body: `Pastikan uang <b>${rp(o.total)}</b> dari <b>${who}</b> benar-benar sudah masuk sebelum memverifikasi.`, okText: 'Ya, verifikasi', danger: false },
      'Ditolak': { title: 'Tolak pembayaran?', body: `Pembayaran ${who} akan ditandai <b>Ditolak</b> dan tidak dihitung sebagai pendapatan. Hubungi pelanggan bila perlu.`, okText: 'Ya, tolak' },
      'Sudah Dibayar': { title: 'Tandai sudah dibayar?', body: `Pastikan uang tunai dari <b>${who}</b> sudah diterima${Number(o.change_amount) > 0 ? `, kembalian <b>${rp(o.change_amount)}</b>` : ''}.`, okText: 'Ya, sudah dibayar', danger: false },
      'Belum Dibayar': { title: 'Batalkan pelunasan?', body: `Status ${who} dikembalikan ke <b>Belum Dibayar</b>.`, okText: 'Ya, kembalikan' },
      'Menunggu Verifikasi': { title: 'Kembalikan ke menunggu?', body: `Status ${who} dikembalikan ke <b>Menunggu Verifikasi</b>.`, okText: 'Ya, kembalikan', danger: false }
    }[to];
    if (ask && !(await confirmDialog(ask))) return;
    if (btn) btn.disabled = true;
    // Syarat metode & status lama: bila admin lain sudah mengubahnya, perubahan ini tidak menimpa diam-diam.
    const { data, error } = await sb.from('orders').update({ payment_status: to })
      .eq('id', id).eq('payment_method', o.payment_method).eq('payment_status', o.payment_status).select();
    if (error) { if (btn) btn.disabled = false; return toast(errMsg(error), true); }
    if (!data || !data.length) {
      if (btn) btn.disabled = false;
      loadOrders(true);
      return toast('Status pembayaran sudah berubah atau Anda tidak punya izin. Data dimuat ulang.', true);
    }
    state.orders = state.orders.map((x) => String(x.id) === String(id) ? data[0] : x);
    renderOrdersViews();
    toast(`Pembayaran: ${to}`);
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pay-act]'); if (!btn) return;
    const holder = btn.closest('[data-id], [data-oid]');
    changePayment(holder && (holder.dataset.id || holder.dataset.oid), btn.dataset.payAct, btn);
  });

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-pay-view]'); if (!btn) return;
    const card = btn.closest('.order'); if (!card) return;
    const o = state.orders.find((x) => String(x.id) === card.dataset.id);
    if (!o || !o.payment_proof) return;
    btn.disabled = true;
    // URL bertanda tangan berumur pendek, dibuat saat dibutuhkan; bucket tetap private.
    const { data, error } = await sb.storage.from(PAY_BUCKET).createSignedUrl(o.payment_proof, 300);
    btn.disabled = false;
    if (error || !data || !data.signedUrl) return toast('Bukti tidak bisa dibuka: ' + (error ? errMsg(error) : 'file tidak ditemukan') + '. Pastikan 01_PAYMENT_MIGRATION.sql sudah dijalankan.', true);
    const acts = (PAY_ACTS.QRIS[o.payment_status] || []).map(([to, label, cls]) => `<button type="button" class="btn btn--sm ${cls}" data-pay-act="${esc(to)}">${esc(label)}</button>`).join('');
    openModal({
      title: 'Bukti pembayaran QRIS',
      hideOk: true, cancelText: 'Tutup',
      body: `<div data-oid="${esc(o.id)}">
        <div class="proof__info"><div><b>${esc(o.customer_name)}</b> · ${esc(o.class_code)}</div>
          <div>Nominal pesanan: <b>${rp(o.total)}</b></div>
          <div>Status: <span class="pbadge" data-ps="${esc(o.payment_status || '')}">${esc(o.payment_status || '—')}</span></div></div>
        <a href="${esc(data.signedUrl)}" target="_blank" rel="noopener noreferrer"><img class="proof__img" src="${esc(data.signedUrl)}" alt="Bukti pembayaran ${esc(o.customer_name)}"></a>
        <p class="muted small">Cocokkan nominal pada bukti dengan nominal pesanan. Ketuk gambar untuk membuka ukuran penuh. Tautan berlaku ±5 menit.</p>
        ${acts ? `<div class="pay__acts proof__acts">${acts}</div>` : ''}
      </div>`
    });
  });

  /* ------------------------------------------------------------------ Menu */
  const catName = (id) => (state.categories.find((c) => c.id === id) || {}).name || id || 'Tanpa jenis';
  const catById = (id) => state.categories.find((c) => c.id === id);

  function renderMenu() {
    const chips = [['all', 'Semua']].concat(state.categories.map((c) => [c.id, c.name]));
    $('#menuFilters').innerHTML = chips.map(([id, n]) => `<button type="button" class="chip${state.menuCat === id ? ' is-active' : ''}" data-mfilter="${esc(id)}">${esc(n)}</button>`).join('');
    const q = state.menuQ.trim().toLowerCase();
    const known = new Set(state.categories.map((c) => c.id));
    const groups = state.categories.map((c) => ({ cat: c, list: [] }));
    const orphan = { cat: { id: '__x', name: 'Tanpa jenis' }, list: [] };
    state.products.forEach((p) => {
      if (q && !`${p.name} ${p.description || ''}`.toLowerCase().includes(q)) return;
      (known.has(p.category) ? groups.find((g) => g.cat.id === p.category) : orphan).list.push(p);
    });
    if (orphan.list.length) groups.push(orphan);
    const shown = groups.filter((g) => (state.menuCat === 'all' || g.cat.id === state.menuCat) && (g.list.length || (state.menuCat !== 'all' && !q)));
    $('#menuList').innerHTML = shown.length ? shown.map((g) => `
      <h3 class="group-title">${esc(g.cat.emoji || '')} ${esc(g.cat.name)} <small>${g.list.length} menu</small></h3>
      <div class="list">${g.list.map((p, i) => productRow(p, i, g.list.length)).join('') || '<div class="empty">Belum ada menu di jenis ini.</div>'}</div>`).join('')
      : `<div class="empty">${q ? 'Menu tidak ditemukan.' : 'Belum ada menu. Tekan “+ Tambah Menu”.'}</div>`;
  }

  function productRow(p, i, n) {
    const vg = Array.isArray(p.variant_groups) ? p.variant_groups : [];
    return `
      <div class="item${p.is_active === false ? ' is-off' : ''}" data-pid="${esc(p.id)}">
        <div class="item__main" style="grid-column:1/-1">
          <div style="display:flex;justify-content:space-between;gap:10px"><span class="item__name">${esc(p.name)}</span><span class="item__price">${rp(p.price)}</span></div>
          <div class="item__desc">${esc(p.description || '—')}</div>
          <div class="tags">
            ${p.is_sold ? '<span class="tag tag--sold">Belum tersedia</span>' : ''}
            ${p.is_active === false ? '<span class="tag tag--hide">Disembunyikan</span>' : ''}
            ${vg.length ? `<span class="tag">${vg.length} grup variasi</span>` : ''}
          </div>
        </div>
        <div class="item__acts">
          <button type="button" class="menu-sw ${p.is_sold ? 'is-sold' : 'is-on'}" data-pact="sold" aria-pressed="${!p.is_sold}" title="Tandai tersedia / belum tersedia"><span class="sw"></span><span>${p.is_sold ? 'Belum tersedia' : 'Tersedia'}</span></button>
          <span class="sp"></span>
          <button type="button" class="icon-btn" data-pact="up" aria-label="Naik" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="icon-btn" data-pact="down" aria-label="Turun" ${i === n - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" class="btn btn--ghost btn--sm" data-pact="edit">Edit</button>
          <button type="button" class="btn btn--ghost btn--sm" data-pact="del" style="color:var(--red)">Hapus</button>
        </div>
      </div>`;
  }

  $('#menuFilters').addEventListener('click', (e) => { const b = e.target.closest('[data-mfilter]'); if (b) { state.menuCat = b.dataset.mfilter; renderMenu(); } });
  $('#menuSearch').addEventListener('input', (e) => { state.menuQ = e.target.value; renderMenu(); });
  $('#addMenuBtn').addEventListener('click', () => productForm(null));

  $('#menuList').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-pact]'); if (!b) return;
    const p = state.products.find((x) => String(x.id) === b.closest('[data-pid]').dataset.pid); if (!p) return;
    const act = b.dataset.pact;
    if (act === 'edit') return productForm(p);
    if (act === 'sold') return setSold(p);
    if (act === 'up' || act === 'down') return moveItem('products', state.products.filter((x) => x.category === p.category), p, act === 'up' ? -1 : 1);
    if (act === 'del') {
      if (await confirmDialog({ title: 'Hapus menu?', body: `<b>${esc(p.name)}</b> akan dihapus permanen dari menu pelanggan. Pesanan lama tidak terpengaruh. Hanya ingin menyembunyikan sementara? Gunakan “Belum tersedia”.`, okText: 'Hapus menu' })) {
        const { error } = await sb.from('products').delete().eq('id', p.id);
        if (error) return toast(errMsg(error), true);
        state.products = state.products.filter((x) => x !== p); renderMenu(); toast('Menu dihapus');
      }
    }
  });

  async function setSold(p) {
    const next = !p.is_sold, prev = p.is_sold;
    p.is_sold = next; renderMenu();                                    // optimistis
    const { error } = await sb.from('products').update({ is_sold: next }).eq('id', p.id);
    if (error) { p.is_sold = prev; renderMenu(); return toast(errMsg(error), true); }
    toast(next ? `${p.name} ditandai belum tersedia` : `${p.name} tersedia kembali`);
  }

  /* urutan: tukar posisi lalu tulis ulang sort_order bagian yang berubah */
  async function moveItem(table, group, item, dir) {
    const sorted = [...group].sort((a, b) => (a.sort_order - b.sort_order) || 0);
    const i = sorted.indexOf(item), j = i + dir;
    if (i < 0 || j < 0 || j >= sorted.length) return;
    [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
    const base = Math.min(...group.map((x) => Number(x.sort_order) || 0));
    const changes = sorted.map((x, k) => [x, base + k]).filter(([x, v]) => x.sort_order !== v);
    const old = changes.map(([x]) => x.sort_order);
    changes.forEach(([x, v]) => { x.sort_order = v; });
    table === 'products' ? (state.products.sort((a, b) => a.sort_order - b.sort_order), renderMenu()) : (state.categories.sort((a, b) => a.sort_order - b.sort_order), renderCategories(), renderMenu());
    const results = await Promise.all(changes.map(([x, v]) => sb.from(table).update({ sort_order: v }).eq('id', x.id)));
    const failed = results.find((r) => r.error);
    if (failed) { changes.forEach(([x], k) => { x.sort_order = old[k]; }); renderMenu(); renderCategories(); toast(errMsg(failed.error), true); }
  }

  /* ---- form menu ---- */
  let vgModel = [];
  function productForm(p) {
    if (!state.categories.length) return inspectDialog('Buat jenis menu dulu', 'Belum ada jenis menu. Buka tab “Jenis Menu” lalu tambahkan minimal satu jenis.');
    const isNew = !p;
    vgModel = JSON.parse(JSON.stringify(p && Array.isArray(p.variant_groups) ? p.variant_groups : []));
    const defCat = p ? p.category : (state.menuCat !== 'all' && catById(state.menuCat) ? state.menuCat : state.categories[0].id);
    const catOptions = state.categories.map((c) => `<option value="${esc(c.id)}"${c.id === defCat ? ' selected' : ''}>${esc(c.emoji || '')} ${esc(c.name)}</option>`).join('') +
      (p && !catById(p.category) ? `<option value="${esc(p.category)}" selected>${esc(p.category)} (tidak terdaftar)</option>` : '');
    openModal({
      title: isNew ? 'Tambah Menu' : 'Edit Menu',
      body: `
        <label class="field"><span>Nama menu *</span><input id="pfName" required maxlength="80" value="${esc(p ? p.name : '')}" placeholder="mis. Ayam Bakar Madu"></label>
        <div class="row2">
          <label class="field"><span>Jenis menu *</span><select id="pfCat">${catOptions}</select></label>
          <label class="field"><span>Harga (Rp) *</span><input id="pfPrice" type="number" inputmode="numeric" min="0" step="500" required value="${p ? esc(p.price) : ''}" placeholder="15000"></label>
        </div>
        <label class="field"><span>Deskripsi</span><textarea id="pfDesc" rows="2" maxlength="200" placeholder="Opsional">${esc(p ? p.description || '' : '')}</textarea></label>
        <label class="check"><input type="checkbox" id="pfAvail" ${p && p.is_sold ? '' : 'checked'}> Tersedia (hapus centang = “Belum tersedia” di web pelanggan)</label>
        <label class="check"><input type="checkbox" id="pfActive" ${p && p.is_active === false ? '' : 'checked'}> Tampilkan di web pelanggan</label>
        <div class="sec-title"><span>Variasi pilihan (opsional)</span><button type="button" class="btn btn--ghost btn--sm" id="vgAdd">+ Grup variasi</button></div>
        <p class="muted small" style="margin-bottom:8px">Contoh: “Pilih Bagian Ayam” → Paha, Dada. Pelanggan wajib memilih satu opsi di tiap grup. Harga opsi dikosongkan = pakai harga menu.</p>
        <div id="vgBox"></div>
        <details class="adv"><summary>Pengaturan lanjutan</summary>
          <label class="field"><span>Nama pendek di keranjang</span><input id="pfCart" maxlength="60" value="${esc(p ? p.cart_name || '' : '')}"></label>
          <label class="field"><span>SKU (gabungkan item sama di keranjang)</span><input id="pfSku" maxlength="40" value="${esc(p ? p.sku || '' : '')}"><small>Menu ber-SKU sama digabung jadi satu baris di keranjang.</small></label>
        </details>`,
      okText: isNew ? 'Tambah' : 'Simpan',
      onSubmit: () => saveProduct(p)
    });
    renderVg();
  }

  function renderVg() {
    $('#vgBox').innerHTML = vgModel.map((g, gi) => `
      <div class="vg" data-gi="${gi}">
        <div class="vg__head"><input data-vg="title" placeholder="Judul grup, mis. Pilih Jenis Nasi" value="${esc(g.title || '')}"><button type="button" class="icon-btn" data-vgact="delgroup" aria-label="Hapus grup">🗑</button></div>
        <label class="check"><input type="checkbox" data-vg="asName" ${g.asName ? 'checked' : ''}> Nama opsi dipakai sebagai nama item di keranjang</label>
        ${(g.options || []).map((o, oi) => `
          <div class="vo" data-oi="${oi}"><input data-vo="label" placeholder="Nama opsi" value="${esc(o.label || '')}"><input data-vo="price" type="number" inputmode="numeric" min="0" placeholder="Harga" value="${typeof o.price === 'number' ? o.price : ''}"><button type="button" class="icon-btn" data-vgact="delopt" aria-label="Hapus opsi">×</button></div>`).join('')}
        <button type="button" class="btn btn--ghost btn--sm" data-vgact="addopt">+ Opsi</button>
      </div>`).join('') || '<p class="muted small">Tidak ada variasi.</p>';
  }
  document.addEventListener('input', (e) => {
    const gEl = e.target.closest('.vg'); if (!gEl) return;
    const g = vgModel[+gEl.dataset.gi]; if (!g) return;
    if (e.target.dataset.vg === 'title') g.title = e.target.value;
    else if (e.target.dataset.vg === 'asName') g.asName = e.target.checked;
    else if (e.target.dataset.vo) {
      const o = g.options[+e.target.closest('.vo').dataset.oi];
      if (e.target.dataset.vo === 'label') o.label = e.target.value;
      else if (e.target.value === '') delete o.price; else o.price = Math.max(0, Math.round(Number(e.target.value)));
    }
  });
  document.addEventListener('click', (e) => {
    if (e.target.id === 'vgAdd') { vgModel.push({ title: '', asName: false, options: [{ label: '' }, { label: '' }] }); return renderVg(); }
    const b = e.target.closest('[data-vgact]'); if (!b) return;
    const gi = +b.closest('.vg').dataset.gi;
    if (b.dataset.vgact === 'delgroup') vgModel.splice(gi, 1);
    else if (b.dataset.vgact === 'addopt') vgModel[gi].options.push({ label: '' });
    else if (b.dataset.vgact === 'delopt') vgModel[gi].options.splice(+b.closest('.vo').dataset.oi, 1);
    renderVg();
  });

  function cleanVariants() {
    const out = [];
    for (const [gi, g] of vgModel.entries()) {
      const title = (g.title || '').trim();
      const opts = (g.options || []).filter((o) => (o.label || '').trim());
      if (!title && !opts.length) continue;                                  // grup kosong dibuang
      if (!title) throw new Error(`Grup variasi #${gi + 1} belum diberi judul.`);
      if (!opts.length) throw new Error(`Grup “${title}” belum punya opsi.`);
      const used = new Set();
      const options = opts.map((o) => {
        let id = o.id || slug(o.label), n = 2; const base = id;
        while (used.has(id)) id = base + '-' + n++;
        used.add(id);
        const clean = { ...o, id, label: o.label.trim() };
        if (typeof clean.price !== 'number') delete clean.price;
        return clean;
      });
      const group = { ...g, title, options }; if (!group.asName) delete group.asName;
      out.push(group);
    }
    return out;
  }

  async function saveProduct(p) {
    const name = $('#pfName').value.trim(), priceRaw = $('#pfPrice').value;
    if (!name) throw new Error('Nama menu wajib diisi.');
    if (priceRaw === '' || Number(priceRaw) < 0) throw new Error('Harga wajib diisi (minimal 0).');
    const category = $('#pfCat').value;
    const row = {
      name, category, price: Math.round(Number(priceRaw)),
      description: $('#pfDesc').value.trim() || null,
      cart_name: $('#pfCart').value.trim() || null,
      sku: $('#pfSku').value.trim() || null,
      variant_groups: cleanVariants(),
      is_sold: !$('#pfAvail').checked,
      is_active: $('#pfActive').checked
    };
    if (p) {
      if (category !== p.category) row.sort_order = Math.max(0, ...state.products.filter((x) => x.category === category).map((x) => Number(x.sort_order) || 0)) + 1;
      const { data, error } = await sb.from('products').update(row).eq('id', p.id).select();
      if (error) throw error;
      if (!data || !data.length) throw new Error('Perubahan tidak tersimpan (tidak ada izin). Pastikan akun terdaftar di admin_users.');
      Object.assign(p, data[0]);
      toast('Menu diperbarui');
    } else {
      row.sort_order = Math.max(0, ...state.products.map((x) => Number(x.sort_order) || 0)) + 1;
      let res = await sb.from('products').insert({ id: slug(name) + '-' + Math.random().toString(36).slice(2, 6), ...row }).select().single();
      // Jika kolom id bertipe uuid / otomatis, ulangi tanpa mengirim id.
      if (res.error && /uuid|invalid input syntax/i.test(res.error.message || '')) res = await sb.from('products').insert(row).select().single();
      if (res.error) throw res.error;
      state.products.push(res.data);
      toast('Menu ditambahkan');
    }
    state.products.sort((a, b) => a.sort_order - b.sort_order);
    renderMenu();
  }

  /* ------------------------------------------------------------------ Jenis menu */
  function renderCategories() {
    const count = (id) => state.products.filter((p) => p.category === id).length;
    $('#catList').innerHTML = state.categories.length ? `<div class="list">${state.categories.map((c, i) => `
      <div class="item${c.is_active === false ? ' is-off' : ''}" data-cid="${esc(c.id)}">
        <span class="swatch" style="--c:${esc(c.color || '#556B2F')}">${esc(c.emoji || '🍽️')}</span>
        <div class="item__main"><div class="item__name">${esc(c.name)}</div>
          <div class="item__desc">${count(c.id)} menu${c.is_active === false ? ' · disembunyikan' : ''} · id: ${esc(c.id)}</div></div>
        <div class="item__acts">
          <button type="button" class="menu-sw ${c.is_active === false ? '' : 'is-on'}" data-cact="toggle" aria-pressed="${c.is_active !== false}"><span class="sw"></span><span>${c.is_active === false ? 'Tersembunyi' : 'Tampil'}</span></button>
          <span class="sp"></span>
          <button type="button" class="icon-btn" data-cact="up" aria-label="Naik" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="icon-btn" data-cact="down" aria-label="Turun" ${i === state.categories.length - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" class="btn btn--ghost btn--sm" data-cact="edit">Edit</button>
          <button type="button" class="btn btn--ghost btn--sm" data-cact="del" style="color:var(--red)">Hapus</button>
        </div>
      </div>`).join('')}</div>` : '<div class="empty">Belum ada jenis menu. Tekan “+ Tambah Jenis”.</div>';
  }
  $('#addCatBtn').addEventListener('click', () => categoryForm(null));
  $('#catList').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-cact]'); if (!b) return;
    const c = state.categories.find((x) => x.id === b.closest('[data-cid]').dataset.cid); if (!c) return;
    const act = b.dataset.cact;
    if (act === 'edit') return categoryForm(c);
    if (act === 'up' || act === 'down') return moveItem('categories', state.categories, c, act === 'up' ? -1 : 1);
    if (act === 'toggle') {
      const next = c.is_active === false; c.is_active = next; renderCategories();
      const { error } = await sb.from('categories').update({ is_active: next }).eq('id', c.id);
      if (error) { c.is_active = !next; renderCategories(); toast(errMsg(error), true); }
      return;
    }
    if (act === 'del') {
      const n = state.products.filter((p) => p.category === c.id).length;
      if (n) return inspectDialog('Jenis masih dipakai', `<b>${esc(c.name)}</b> masih memiliki ${n} menu. Pindahkan atau hapus menunya terlebih dulu (tab Menu), lalu hapus jenis ini. Atau gunakan tombol “Tampil” untuk menyembunyikannya.`);
      if (await confirmDialog({ title: 'Hapus jenis menu?', body: `<b>${esc(c.name)}</b> akan dihapus dari web pelanggan.`, okText: 'Hapus jenis' })) {
        const { error } = await sb.from('categories').delete().eq('id', c.id);
        if (error) return toast(errMsg(error), true);
        state.categories = state.categories.filter((x) => x !== c);
        if (state.menuCat === c.id) state.menuCat = 'all';
        renderCategories(); renderMenu(); toast('Jenis menu dihapus');
      }
    }
  });

  function categoryForm(c) {
    const isNew = !c;
    openModal({
      title: isNew ? 'Tambah Jenis Menu' : 'Edit Jenis Menu',
      body: `
        <label class="field"><span>Nama jenis *</span><input id="cfName" required maxlength="40" value="${esc(c ? c.name : '')}" placeholder="mis. Minuman"></label>
        <div class="row2">
          <label class="field"><span>Emoji</span><input id="cfEmoji" maxlength="4" value="${esc(c ? c.emoji || '' : '🍽️')}"></label>
          <label class="field"><span>Warna tab</span><div class="color-row"><input type="color" id="cfColor" value="${esc(c && /^#[0-9a-f]{6}$/i.test(c.color || '') ? c.color : '#556B2F')}"><span class="muted small">Warna chip kategori</span></div></label>
        </div>
        <label class="check"><input type="checkbox" id="cfActive" ${c && c.is_active === false ? '' : 'checked'}> Tampilkan di web pelanggan</label>`,
      okText: isNew ? 'Tambah' : 'Simpan',
      onSubmit: async () => {
        const name = $('#cfName').value.trim(); if (!name) throw new Error('Nama jenis wajib diisi.');
        const row = { name, emoji: $('#cfEmoji').value.trim() || '🍽️', color: $('#cfColor').value, is_active: $('#cfActive').checked };
        if (c) {
          const { data, error } = await sb.from('categories').update(row).eq('id', c.id).select();
          if (error) throw error;
          if (!data || !data.length) throw new Error('Perubahan tidak tersimpan (tidak ada izin).');
          Object.assign(c, data[0]); toast('Jenis menu diperbarui');
        } else {
          let id = slug(name), n = 2; const base = id;
          while (state.categories.some((x) => x.id === id)) id = base + '-' + n++;
          row.id = id; row.sort_order = Math.max(0, ...state.categories.map((x) => Number(x.sort_order) || 0)) + 1;
          const { data, error } = await sb.from('categories').insert(row).select().single();
          if (error) throw error;
          state.categories.push(data); toast('Jenis menu ditambahkan');
        }
        state.categories.sort((a, b) => a.sort_order - b.sort_order);
        renderCategories(); renderMenu();
      }
    });
  }

  /* ------------------------------------------------------------------ Start */
  (async function start() {
    paintSound();
    if (!window.supabase || !window.supabase.createClient) return showLogin('Pustaka Supabase gagal dimuat. Periksa koneksi internet lalu muat ulang.');
    if (!configured()) return showLogin(cfg.error || 'Konfigurasi belum diisi: tambahkan Environment Variables SUPABASE_URL dan SUPABASE_ANON_KEY di Vercel, lalu Redeploy.');
    sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
    sb.auth.onAuthStateChange((evt) => { if (evt === 'SIGNED_OUT' && state.user) { teardown(); showLogin('Sesi berakhir. Silakan masuk lagi.'); } });
    try { await enter(); } catch (err) { showLogin(errMsg(err)); }
  })();
})();
