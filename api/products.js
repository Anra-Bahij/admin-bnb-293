// Nilai is_sold dari Supabase bisa boolean true, atau teks/angka ('true', 'TRUE', 't', '1', 1) bila kolom bertipe text/int.
const toBool = (v) => v === true || v === 1 || (typeof v === 'string' && ['true', 't', '1', 'yes', 'y'].includes(v.trim().toLowerCase()));

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return res.status(500).json({ error: 'Konfigurasi Supabase di Vercel belum lengkap.' });
  }

  try {
    const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/products?select=id,name,category,description,price,cart_name,sku,variant_groups,is_active,is_sold,sort_order&is_active=eq.true&order=sort_order.asc`;
    const headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };
    const catUrl = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/categories?select=id,name,emoji,color,sort_order&is_active=eq.true&order=sort_order.asc`;
    // Rata-rata rating dari ulasan asli (04_REVIEWS.sql). Bila fungsinya belum ada, produk tampil tanpa baris rating.
    const statsReq = fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/get_product_rating_stats`, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}'
    }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const [response, catResponse, stats] = await Promise.all([fetch(url, { headers }), fetch(catUrl, { headers }), statsReq]);
    const statsById = Array.isArray(stats) ? new Map(stats.map((s) => [String(s.product_id), s])) : null;
    const rows = await response.json();
    // Jenis menu: bila tabel categories belum ada / kosong, website memakai kategori cadangan di data.js.
    const catRows = catResponse.ok ? await catResponse.json().catch(() => []) : [];
    if (!response.ok) {
      return res.status(response.status).json({ error: rows.message || 'Gagal mengambil produk dari Supabase.' });
    }

    const products = (Array.isArray(rows) ? rows : []).map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      desc: row.description || '',
      price: Number(row.price),
      cartName: row.cart_name || undefined,
      sku: row.sku || undefined,
      isSold: toBool(row.is_sold),
      ...(statsById ? { rating: { avg: Number((statsById.get(String(row.id)) || {}).avg_rating) || 0, count: Number((statsById.get(String(row.id)) || {}).review_count) || 0 } } : {}),
      variantGroups: Array.isArray(row.variant_groups) ? row.variant_groups : []
    }));

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ products, categories: Array.isArray(catRows) ? catRows : [] });
  } catch (error) {
    return res.status(500).json({ error: 'Tidak dapat terhubung ke Supabase.' });
  }
};
