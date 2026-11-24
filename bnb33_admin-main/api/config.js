// Mengirim konfigurasi publik Supabase ke browser dari Environment Variables Vercel.
// Hanya URL + publishable/anon key. Kunci rahasia (sb_secret_ / service_role) ditolak.
module.exports = function handler(req, res) {
  const url = (process.env.SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_ANON_KEY || '').trim();
  const looksSecret = /^sb_secret_/.test(key) || (key.split('.').length === 3 && (() => {
    try { return JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'service_role'; } catch (e) { return false; }
  })());

  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (looksSecret) {
    return res.status(200).send('window.ADMIN_CONFIG={error:"SUPABASE_ANON_KEY berisi kunci rahasia. Pakai publishable/anon key saja."};');
  }
  const cfg = { SUPABASE_URL: url, SUPABASE_ANON_KEY: key, TIMEZONE: process.env.ADMIN_TIMEZONE || 'Asia/Jakarta' };
  res.status(200).send('window.ADMIN_CONFIG=' + JSON.stringify(cfg) + ';');
};
