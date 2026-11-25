// Konfigurasi publik untuk Supabase Realtime di browser (URL + anon/publishable key).
// Kunci rahasia (service role) TIDAK PERNAH dikirim dari sini: bila yang terisi ternyata kunci rahasia, endpoint menolak.
function isSecretKey(key) {
  if (/^sb_secret_/.test(key)) return true;
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1] || '', 'base64url').toString('utf8'));
    return payload.role === 'service_role';
  } catch (e) { return false; }
}

module.exports = function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const url = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const anonKey = (process.env.SUPABASE_ANON_KEY || '').trim();
  if (!url || !anonKey) return res.status(500).json({ error: 'Konfigurasi Supabase di Vercel belum lengkap.' });
  if (isSecretKey(anonKey)) return res.status(500).json({ error: 'SUPABASE_ANON_KEY berisi kunci rahasia. Isi dengan anon/publishable key.' });
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ url, anonKey });
};
