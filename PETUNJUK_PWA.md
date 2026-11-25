# Petunjuk — BnB Cemilan sebagai PWA

## Penempatan file (project PELANGGAN saja; admin tidak berubah)
Baru: `manifest.webmanifest` · `sw.js` · `offline.html` · `js/pwa.js` · `css/pwa.css` · `icons/` (ikon, logo ringan, 18 gambar `icons/splash/`)
Ganti: `index.html` (sudah memuat perubahan pembayaran QRIS/Cash) · `vercel.json` · `js/data.js` (hanya 1 baris: `logo`)
`assets/logo.png` tetap dipertahankan (tidak dihapus).

## Setelah deploy
1. Buka website di HP (HTTPS) → muncul banner "Pasang Aplikasi" (Android/Chrome) atau "Cara Pasang" (iPhone).
2. Cek di Chrome DevTools → Application → Manifest / Service Workers (tanpa error).
3. iPhone: Safari → Bagikan → Tambah ke Layar Utama. (iOS tidak punya tombol install otomatis; panduan sudah disediakan.)

## Setiap rilis berikutnya
Ubah `VERSION` di `sw.js` (mis. `v1.0.1`). Pengguna akan melihat tombol "Perbarui". Perubahan pada index/JS/CSS juga terdeteksi otomatis saat aplikasi dibuka kembali.

## Yang TIDAK pernah di-cache
`/api/*` (produk, harga, stok, pesanan, pembayaran), `js/data.js`, HTML, CSS, JS aplikasi, foto produk, bukti bayar. Yang disimpan hanya halaman offline + logo/ikon.

## Catatan
- Warna splash/ikon: krem `#F8F5F0` (sama dengan tema web). Ubah di `manifest.webmanifest` (`background_color`, `theme_color`) bila ingin warna lain; gambar splash iOS dibuat ulang bila ingin ikut berubah.
- Saat dibuka sebagai aplikasi terpasang, animasi pembuka 6 detik diganti splash ringan (±0,7 dtk). Di browser biasa animasi lama tetap ada.
- Logo header/intro memakai `icons/logo-512-v2.webp` (65 KB, tampilan sama) menggantikan `logo.png` 886 KB agar lebih cepat dimuat.
- Splash iOS tersedia untuk iPhone SE s.d. 16 Pro Max dan iPad umum; perangkat lain tetap memakai splash sistem (putih sesaat).
