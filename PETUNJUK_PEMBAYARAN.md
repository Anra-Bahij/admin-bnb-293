# Petunjuk Penerapan — Pembayaran QRIS + Cash (BnB Cemilan)

## Urutan (penting)
1. **Supabase → SQL Editor:** tinjau lalu jalankan `01_PAYMENT_MIGRATION.sql`. Aman diulang, tidak menghapus data, web lama tetap jalan. Cek hasil 4 query pemeriksaan di akhir file (kolom tidak duplikat, bucket `public = false`).
2. **Gambar QRIS:** simpan gambar QRIS asli BnB Cemilan sebagai `assets/qris.png` di project pelanggan (nama/path bisa diubah di `js/payment.js` → `CONFIG.qrisImage`). Gambar QRIS tidak ada di ZIP, jadi belum saya sertakan. Bila file tidak ada, QRIS menampilkan pesan "belum tersedia" dan tidak bisa dipesan.
3. **Vercel (project PELANGGAN) → Settings → Environment Variables:** tambahkan `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API Keys → *secret* / service_role). Hanya dibaca server `/api/orders`; jangan dimasukkan ke kode, GitHub, atau project admin. Variabel lama tidak diubah.
4. **Salin file** ke struktur folder masing-masing (lihat daftar), commit, lalu **Redeploy** pelanggan dan admin.
5. **Uji:** satu pesanan QRIS (dengan bukti) dan satu Cash. Di admin: tab Pesanan → "Lihat bukti", Verifikasi/Tolak, Tandai Sudah Dibayar.
6. **Setelah lulus uji:** jalankan `02_PAYMENT_LOCKDOWN.sql` agar pesanan hanya bisa dibuat lewat backend (menutup celah pemalsuan nominal lewat anon key).

## File
Pelanggan: `api/orders.js` (ganti) · `index.html` (ganti) · `js/app.js` (ganti) · `js/payment.js` (baru) · `css/payment.css` (baru) · `assets/qris.png` (Anda tambahkan)
Admin: `index.html` (ganti) · `js/app.js` (ganti) · `css/payment.css` (baru)

## Perilaku
- **Harga dihitung ulang di server** dari tabel `products` (termasuk variasi). Total dari browser hanya pembanding; bila beda, pesanan ditolak (409) dan katalog dimuat ulang.
- **QRIS:** foto bukti wajib; dikecilkan di browser (JPEG ≤1,5 MB), server memeriksa isi file (JPG/PNG/WebP), menyimpan ke bucket private `payment-proofs/YYYY-MM/<id-pesanan>.jpg`, path disimpan di `orders.payment_proof`. Status awal selalu `Menunggu Verifikasi`.
- **Cash:** Uang Pas atau Uang Kembali (pecahan cepat / nominal sendiri). Kembalian dihitung server; status awal `Belum Dibayar`.
- **Admin:** bukti dibuka lewat signed URL 5 menit (hanya `is_admin()`); Verifikasi/Tolak (QRIS) dan Sudah Dibayar (Cash) memakai konfirmasi dan update bersyarat. Filter baru "Perlu Verifikasi".
- Pembayaran `Ditolak` tidak dihitung sebagai pendapatan (perubahan kecil pada laporan; pesanan lama tidak terpengaruh).
- Pesan WhatsApp kini memuat satu baris metode pembayaran.

## Catatan
- Tanpa `SUPABASE_SERVICE_ROLE_KEY`, Cash tetap berjalan (lewat anon key + RLS), QRIS menolak dengan pesan jelas.
- Pesanan lama: kolom pembayaran NULL, tampil "Pembayaran tidak tercatat".
- Rollback LANGKAH 2 ada di akhir file `02_PAYMENT_LOCKDOWN.sql`.
