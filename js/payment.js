/* ==========================================================================
   BnB Cemilan — PEMBAYARAN (QRIS + Cash): konfigurasi & fungsi bantu (tanpa UI)
   Dimuat setelah cart.js (memakai formatRp) dan sebelum app.js.
   Catatan: semua hitungan di sini hanya untuk TAMPILAN. Nominal, kembalian, dan status
   dihitung ulang & ditetapkan oleh server (api/orders.js).
   ========================================================================== */
const PAYMENT = (() => {
  const CONFIG = {
    // Letakkan gambar QRIS BnB Cemilan di file ini (PNG/JPG). Ganti path bila namanya berbeda.
    qrisImage: './qris.png',
    // Pecahan uang yang ditawarkan pada "Uang Kembali" (hanya yang lebih besar dari total yang tampil).
    cashDenominations: [5000, 10000, 20000, 50000, 100000, 150000, 200000],
    maxCash: 10000000,
    maxPickBytes: 20 * 1024 * 1024,     // batas file yang dipilih pelanggan sebelum dikecilkan
    maxProofBytes: 1500000,             // target ukuran setelah dikecilkan (server menerima s.d. 2 MB)
    maxSide: 1600                       // sisi terpanjang gambar (px) setelah dikecilkan
  };

  /* ------------------------------------------------------------- Cash */
  // Pilihan nominal cepat: pecahan yang LEBIH BESAR dari total (uang pas punya tombol sendiri), maks. 4.
  function quickAmounts(total) {
    return CONFIG.cashDenominations.filter((d) => d > total).slice(0, 4);
  }

  // mode: 'exact' | 'change'. Mengembalikan { ok, received, change, error }.
  function cashCalc(total, mode, received) {
    if (mode === 'exact') return { ok: true, received: total, change: 0, error: '' };
    if (mode !== 'change') return { ok: false, received: 0, change: 0, error: 'Pilih Uang Pas atau Uang Kembali.' };
    if (!Number.isInteger(received) || received <= 0) return { ok: false, received: 0, change: 0, error: 'Pilih atau isi nominal uang yang akan Anda berikan.' };
    if (received > CONFIG.maxCash) return { ok: false, received, change: 0, error: 'Nominal terlalu besar.' };
    if (received < total) return { ok: false, received, change: 0, error: `Nominal kurang ${formatRp(total - received)} dari total pesanan.` };
    return { ok: true, received, change: received - total, error: '' };
  }

  // Ambil angka dari ketikan bebas ("50.000", "Rp 50000") → integer, atau null.
  function parseMoney(text) {
    const digits = String(text || '').replace(/\D/g, '').slice(0, 9);
    return digits ? parseInt(digits, 10) : null;
  }

  /* ------------------------------------------------------- Bukti QRIS */
  // Memuat gambar (memperhatikan orientasi foto HP), lalu dikecilkan menjadi JPEG supaya ringan dikirim.
  async function decodeImage(file) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { /* coba cara lain */ }
    }
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
      img.src = url;
    });
  }

  const toBlob = (canvas, quality) => new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
      fr.onerror = () => reject(new Error('read'));
      fr.readAsDataURL(blob);
    });
  }

  // Mengembalikan { blob, base64, url }. Melempar Error berisi pesan ramah untuk pelanggan.
  async function prepareProof(file) {
    if (!file) throw new Error('Pilih foto bukti pembayaran.');
    if (file.type && !/^image\//.test(file.type)) throw new Error('File harus berupa gambar (JPG atau PNG).');
    if (file.size > CONFIG.maxPickBytes) throw new Error('Ukuran foto terlalu besar (maksimal 20 MB).');
    let src;
    try { src = await decodeImage(file); }
    catch (e) { throw new Error('Foto tidak bisa dibaca. Gunakan screenshot atau foto berformat JPG/PNG.'); }

    const w0 = src.width || src.naturalWidth, h0 = src.height || src.naturalHeight;
    if (!w0 || !h0) throw new Error('Foto tidak bisa dibaca. Gunakan screenshot atau foto berformat JPG/PNG.');
    let scale = Math.min(1, CONFIG.maxSide / Math.max(w0, h0));
    let blob = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w0 * scale));
      canvas.height = Math.max(1, Math.round(h0 * scale));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';                      // PNG transparan → latar putih
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
      blob = await toBlob(canvas, attempt === 0 ? 0.85 : 0.72);
      if (blob && blob.size <= CONFIG.maxProofBytes) break;
      scale *= 0.75;
    }
    if (src.close) src.close();
    if (!blob || blob.size > CONFIG.maxProofBytes) throw new Error('Foto terlalu besar. Coba screenshot bukti pembayaran saja.');
    return { blob, base64: await blobToBase64(blob), url: URL.createObjectURL(blob) };
  }

  return { CONFIG, quickAmounts, cashCalc, parseMoney, prepareProof };
})();
