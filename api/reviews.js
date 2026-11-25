// Rating & ulasan. Semua aturan (pesanan selesai, item milik pesanan, rating 1–5) dijaga fungsi database
// di 04_REVIEWS.sql; di sini hanya pemeriksaan bentuk data dan penerjemahan pesan. Memakai anon key (bukan service role).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MESSAGES = {
  RATING_INVALID: [400, 'Pilih rating 1 sampai 5 bintang.'],
  COMMENT_TOO_LONG: [400, 'Komentar maksimal 500 karakter.'],
  ORDER_NOT_FOUND: [404, 'Pesanan tidak ditemukan.'],
  ORDER_NOT_COMPLETED: [403, 'Penilaian baru bisa diberikan setelah pesanan selesai.'],
  ITEM_NOT_IN_ORDER: [403, 'Produk ini tidak ada dalam pesananmu.']
};

module.exports = async function handler(req, res) {
  const base = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const key = (process.env.SUPABASE_ANON_KEY || '').trim();
  if (!base || !key) return res.status(500).json({ error: 'Konfigurasi Supabase di Vercel belum lengkap.' });
  res.setHeader('Cache-Control', 'no-store');

  const rpc = async (name, args) => {
    const r = await fetch(`${base}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    });
    return { ok: r.ok, data: await r.json().catch(() => null) };
  };

  try {
    if (req.method === 'GET') {
      const q = req.query || {};
      let out;
      if (q.order_id) {
        if (!UUID.test(String(q.order_id))) return res.status(400).json({ error: 'Pesanan tidak valid.' });
        out = await rpc('get_order_reviews', { p_order_id: q.order_id });
      } else if (q.product_id && String(q.product_id).length <= 100) {
        out = await rpc('get_product_reviews', { p_product_id: String(q.product_id), p_limit: 30 });
      } else return res.status(400).json({ error: 'Parameter tidak valid.' });
      if (!out.ok || !Array.isArray(out.data)) return res.status(503).json({ error: 'Ulasan belum bisa dimuat.' });
      return res.status(200).json({ reviews: out.data });
    }

    if (req.method === 'POST') {
      const b = req.body && typeof req.body === 'object' ? req.body : {};
      if (!UUID.test(String(b.order_id)) || !b.product_id || String(b.product_id).length > 100) {
        return res.status(400).json({ error: 'Data penilaian tidak valid.' });
      }
      if (!Number.isInteger(b.rating) || b.rating < 1 || b.rating > 5) return res.status(400).json({ error: MESSAGES.RATING_INVALID[1] });
      const comment = typeof b.comment === 'string' ? b.comment : null;
      const out = await rpc('submit_review', { p_order_id: b.order_id, p_product_id: String(b.product_id), p_rating: b.rating, p_comment: comment });
      if (!out.ok) {
        const m = MESSAGES[(out.data && out.data.message) || ''];
        return m ? res.status(m[0]).json({ error: m[1] }) : res.status(503).json({ error: 'Penilaian belum bisa disimpan. Coba lagi sebentar.' });
      }
      return res.status(200).json({ success: true, review: out.data });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: 'Terjadi kesalahan.' });
  }
};
