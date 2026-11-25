const crypto = require('crypto');

const toBool = (v) => v === true || v === 1 || (typeof v === 'string' && ['true', 't', '1', 'yes', 'y'].includes(v.trim().toLowerCase()));

/* ---------------------------------------------------------------------------
   Pembayaran: SEMUA nilai uang & status dihitung/ditetapkan di sini (server).
   Nilai dari browser hanya dipakai sebagai pembanding, tidak pernah dipercaya.
   --------------------------------------------------------------------------- */
const BUCKET = 'payment-proofs';
const MAX_LINES = 50;                 // maksimal baris menu per pesanan
const MAX_QTY = 99;                   // maksimal jumlah per baris
const MAX_PROOF_BYTES = 2000000;      // < batas bucket 2 MB (2.097.152 byte)
const MAX_PROOF_B64 = Math.ceil(MAX_PROOF_BYTES / 3) * 4 + 8;
const MAX_CASH = 10000000;            // batas kewajaran uang tunai

const fail = (res, status, error, code) => res.status(status).json(code ? { error, code } : { error });

// Kunci Supabase: JWT lama dikirim di apikey + Authorization; kunci baru (sb_...) cukup di apikey.
function authHeaders(key) {
  const h = { apikey: key };
  if (/^eyJ/.test(key)) h.Authorization = `Bearer ${key}`;
  return h;
}

// Jenis file ditentukan dari isi file (magic bytes), bukan dari klaim browser.
function sniffImage(buf) {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' };
  if (buf.length > 12 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', type: 'image/png' };
  if (buf.length > 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return { ext: 'webp', type: 'image/webp' };
  return null;
}

// Menghitung harga satuan dari data DATABASE. Aturannya sama persis dengan Catalog di js/cart.js.
function priceFromDb(product, optionId) {
  const base = Number(product.price);
  if (!Number.isFinite(base) || base < 0) return null;
  const groups = (Array.isArray(product.variant_groups) ? product.variant_groups : [])
    .filter((g) => g && Array.isArray(g.options));
  if (!groups.length) return { unitPrice: Math.round(base), variant: null };

  const id = String(optionId || '');
  if (groups.length === 1) {
    const opt = groups[0].options.find((o) => o && String(o.id) === id);
    if (!opt) return null;
    const unit = typeof opt.price === 'number' ? opt.price : base;
    return { unitPrice: Math.round(unit), variant: String(opt.label || '') || null };
  }
  const ids = id.split('+');
  if (ids.length !== groups.length) return null;
  const parts = groups.map((g, i) => g.options.find((o) => o && String(o.id) === ids[i]) || null);
  if (parts.some((p) => !p)) return null;
  const unit = base + parts.reduce((s, p) => s + (typeof p.extra === 'number' ? p.extra : 0), 0);
  return { unitPrice: Math.round(unit), variant: parts.map((p) => String(p.label || '')).join(', ') };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Night Lock: tolak pesanan pukul 01.00–05.59 WIB (Asia/Jakarta = UTC+7, tanpa DST), apa pun jam perangkat pelanggan.
  const hourWIB = new Date(Date.now() + 7 * 3600e3).getUTCHours();
  if (hourWIB >= 1 && hourWIB < 6) {
    return res.status(403).json({ error: 'Maaf, BnB Cemilan sedang tutup (01.00–05.59 WIB). Pesanan bisa dibuat lagi mulai pukul 06.00 WIB.' });
  }

  const supabaseUrl = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const anonKey = (process.env.SUPABASE_ANON_KEY || '').trim();
  // Kunci rahasia: HANYA di server (Environment Variable Vercel), tidak pernah dikirim ke browser.
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !anonKey) {
    return res.status(500).json({ error: 'Konfigurasi Supabase di Vercel belum lengkap.' });
  }
  const anonHeaders = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };   // sama seperti sebelumnya

  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const allowedPickup = ['Ambil sendiri', 'Diantar'];
    if (!body.customer_name || !body.class_code || !allowedPickup.includes(body.pickup_method) ||
        !Array.isArray(body.items) || body.items.length === 0 || body.items.length > MAX_LINES) {
      return fail(res, 400, 'Data pesanan belum lengkap atau tidak valid.');
    }

    /* ---------------- 1) Metode pembayaran (validasi bentuk) ---------------- */
    const pay = body.payment && typeof body.payment === 'object' ? body.payment : null;
    const method = pay ? pay.method : null;
    if (method !== 'QRIS' && method !== 'Cash') {
      return fail(res, 400, 'Pilih metode pembayaran (QRIS atau Cash). Jika sudah memilih, muat ulang halaman lalu coba lagi.');
    }

    let proof = null;   // { buf, ext, type }
    if (method === 'QRIS') {
      if (!serviceKey) return fail(res, 503, 'Pembayaran QRIS belum siap (konfigurasi server belum lengkap). Silakan pilih Cash atau hubungi penjual.');
      let b64 = pay.proof && typeof pay.proof.data === 'string' ? pay.proof.data : '';
      b64 = b64.replace(/^data:[^;,]+;base64,/, '').replace(/\s+/g, '');
      if (!b64) return fail(res, 400, 'Bukti pembayaran QRIS wajib diunggah.');
      if (b64.length > MAX_PROOF_B64) return fail(res, 413, 'Ukuran bukti pembayaran terlalu besar (maksimal 2 MB).');
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return fail(res, 400, 'Bukti pembayaran tidak valid. Unggah foto atau screenshot (JPG/PNG).');
      const buf = Buffer.from(b64, 'base64');
      if (!buf.length || buf.length > MAX_PROOF_BYTES) return fail(res, 413, 'Ukuran bukti pembayaran terlalu besar (maksimal 2 MB).');
      const kind = sniffImage(buf);
      if (!kind) return fail(res, 400, 'Bukti pembayaran harus berupa gambar JPG, PNG, atau WebP.');
      proof = { buf, ...kind };
    }

    /* ---------------- 2) Harga: dihitung ulang dari database ---------------- */
    const rawLines = body.items.map((i) => ({
      productId: String((i && i.product_id) || '').replace(/["\\,()]/g, ''),
      optionId: i && i.option_id != null ? String(i.option_id) : '',
      qty: i && i.quantity
    }));
    if (rawLines.some((l) => !l.productId || !Number.isInteger(l.qty) || l.qty < 1 || l.qty > MAX_QTY)) {
      return fail(res, 400, 'Data pesanan belum lengkap atau tidak valid.');
    }

    const ids = [...new Set(rawLines.map((l) => l.productId))];
    const check = await fetch(
      `${supabaseUrl}/rest/v1/products?select=id,name,cart_name,price,variant_groups,is_sold&id=in.(${ids.map((i) => `"${i}"`).join(',')})`,
      { headers: anonHeaders }
    );
    // Bila data menu tidak bisa diperiksa, pesanan ditolak.
    if (!check.ok) return fail(res, 503, 'Status menu belum bisa diperiksa. Coba lagi sebentar.');
    const found = await check.json().catch(() => []);
    const byId = new Map((Array.isArray(found) ? found : []).map((r) => [String(r.id), r]));

    const bad = ids.map((id) => byId.get(id)).find((r) => r && toBool(r.is_sold));
    if (bad) return fail(res, 409, `Maaf, "${bad.name}" belum tersedia. Hapus dari keranjang lalu coba lagi.`, 'MENU_UNAVAILABLE');
    if (ids.some((id) => !byId.has(id))) return fail(res, 409, 'Ada menu di keranjang yang sudah tidak tersedia. Muat ulang halaman lalu coba lagi.', 'MENU_UNAVAILABLE');

    const items = [];
    for (const l of rawLines) {
      const product = byId.get(l.productId);
      const priced = priceFromDb(product, l.optionId);
      if (!priced) return fail(res, 409, `Pilihan variasi "${product.name}" sudah berubah. Muat ulang halaman lalu coba lagi.`, 'MENU_CHANGED');
      items.push({
        product_id: String(product.id),
        name: String(product.cart_name || product.name),
        variant: priced.variant,
        quantity: l.qty,
        unit_price: priced.unitPrice,
        subtotal: priced.unitPrice * l.qty
      });
    }
    const total = items.reduce((s, i) => s + i.subtotal, 0);

    // Nominal dari browser hanya pembanding. Bila beda, harga menu berubah saat pelanggan memesan →
    // tolak, supaya pelanggan tidak membayar (QRIS) dengan nominal yang salah.
    if (body.subtotal !== total || body.total !== total) {
      return fail(res, 409, 'Harga menu baru saja berubah. Total diperbarui, silakan cek keranjang lalu pesan lagi.', 'PRICE_CHANGED');
    }

    /* ---------------- 3) Data pembayaran (status & kembalian dari server) ---------------- */
    let payment;
    if (method === 'QRIS') {
      payment = { payment_method: 'QRIS', payment_status: 'Menunggu Verifikasi', cash_received: null, change_amount: null };
    } else {
      let received;
      if (pay.cash_mode === 'exact') received = total;
      else if (pay.cash_mode === 'change') received = pay.cash_received;
      else return fail(res, 400, 'Pilih Uang Pas atau Uang Kembali.');
      if (!Number.isInteger(received) || received > MAX_CASH) return fail(res, 400, 'Nominal uang tidak valid.');
      if (received < total) return fail(res, 400, 'Nominal uang kurang dari total pesanan.');
      payment = { payment_method: 'Cash', payment_status: 'Belum Dibayar', cash_received: received, change_amount: received - total };
    }

    /* ---------------- 4) Simpan bukti (QRIS) lalu pesanan ---------------- */
    const orderId = crypto.randomUUID();
    let proofPath = null;
    if (proof) {
      const month = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 7);   // YYYY-MM (WIB)
      proofPath = `${month}/${orderId}.${proof.ext}`;
      const up = await fetch(`${supabaseUrl}/storage/v1/object/${BUCKET}/${proofPath}`, {
        method: 'POST',
        headers: { ...authHeaders(serviceKey), 'Content-Type': proof.type, 'x-upsert': 'false', 'Cache-Control': 'private, max-age=0' },
        body: proof.buf
      });
      if (!up.ok) return fail(res, 502, 'Bukti pembayaran gagal disimpan. Coba lagi sebentar.');
    }

    const order = {
      id: orderId,
      customer_name: String(body.customer_name).trim().slice(0, 60),
      class_code: String(body.class_code).trim().slice(0, 6),
      pickup_method: body.pickup_method,
      note: body.note ? String(body.note).slice(0, 200) : null,
      items,
      subtotal: total,
      total,
      status: 'Baru',
      ...payment,
      payment_proof: proofPath
    };

    // Penulisan pesanan memakai kunci server bila tersedia; bila belum diisi, kembali ke anon key
    // (diizinkan policy INSERT hanya untuk status 'Baru' + status bayar awal; lihat 01_PAYMENT_MIGRATION.sql).
    const writeHeaders = serviceKey ? authHeaders(serviceKey) : anonHeaders;
    const response = await fetch(`${supabaseUrl}/rest/v1/orders`, {
      method: 'POST',
      headers: {
        ...writeHeaders,
        'Content-Type': 'application/json',
        // return=minimal: INSERT tanpa RETURNING, jadi tidak butuh izin SELECT pada tabel orders (anon memang tidak boleh membaca pesanan).
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(order)
    });

    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      // Pesanan gagal: jangan tinggalkan berkas bukti yatim.
      if (proofPath) {
        await fetch(`${supabaseUrl}/storage/v1/object/${BUCKET}/${proofPath}`, { method: 'DELETE', headers: authHeaders(serviceKey) }).catch(() => {});
      }
      return res.status(response.status >= 400 && response.status < 600 ? response.status : 500)
        .json({ error: result.message || result.details || 'Pesanan gagal disimpan.' });
    }

    return res.status(201).json({
      success: true,
      order: {
        id: orderId,
        total,
        payment_method: payment.payment_method,
        payment_status: payment.payment_status,
        cash_received: payment.cash_received,
        change_amount: payment.change_amount
      }
    });
  } catch (error) {
    return res.status(500).json({ error: 'Terjadi kesalahan saat menyimpan pesanan.' });
  }
};
