/* ==========================================================================
   BnB Cemilan — DATA TOKO
   Semua nama produk, harga, kategori, dan pilihan variasi ada DI FILE INI SAJA.
   Untuk menambah / mengubah menu, cukup edit file ini (lihat README.md).
   ========================================================================== */

/* ---------- Pengaturan toko ---------- */
const STORE = {
  name: 'BnB Cemilan',
  tagline: 'JAJANAN FAVORIT',
  logo: 'icons/logo-512-v2.webp',  // versi ringan dari assets/logo.png
  // Nomor WhatsApp penerima pesanan, format internasional tanpa "+" atau spasi.
  whatsappNumber: '6287722011556'
};

/* ---------- Daftar kelas resmi SMA Negeri 33 Jakarta ----------
   Hanya kelas di daftar ini yang diterima kolom Kelas saat checkout. */
const KELAS_RESMI = [
  'X-E1', 'X-E2', 'X-E3', 'X-E4', 'X-E5', 'X-E6', 'X-E7', 'X-E8',
  'XI-F1', 'XI-F2', 'XI-F3', 'XI-F4', 'XI-F5', 'XI-F6',
  'XII-F1', 'XII-F2', 'XII-F3', 'XII-F4', 'XII-F5', 'XII-F6', 'XII-F7'
];

/* ---------- Grup variasi (dipakai ulang oleh banyak produk) ----------
   price pada setiap opsi = harga satuan final untuk opsi tersebut.
   Opsi tanpa price memakai harga produk (dipakai bila satu produk punya beberapa grup).
   asName: true  → nama opsi dipakai sebagai nama item di keranjang. */
const VARIANT_GROUPS = {
  bagianAyam: {
    title: 'Pilih Bagian Ayam',
    hint: 'Harga sama untuk kedua pilihan.',
    options: [
      { id: 'paha', label: 'Paha', price: 10000, icon: '🍗' },
      { id: 'dada', label: 'Dada', price: 10000, icon: '🍗' }
    ]
  },
  jenisNasi: {
    title: 'Pilih Jenis Nasi',
    hint: 'Pilih salah satu jenis nasi.',
    asName: true,
    options: [
      { id: 'putih',  label: 'Nasi Putih',       price: 5000, icon: '🍚' },
      { id: 'tutug',  label: 'Nasi Tutug Oncom', price: 5000, icon: '🍚' },
      { id: 'jeruk',  label: 'Nasi Daun Jeruk',  price: 5000, icon: '🍚' }
    ]
  },
  masakan: {
    title: 'Jenis Masakan',
    options: [
      { id: 'goreng', label: 'Goreng', icon: '🍳' },
      { id: 'kuah',   label: 'Kuah',   icon: '🍜' }
    ]
  },
  kepedasan: {
    title: 'Tingkat Kepedasan',
    options: [
      { id: 'tidak-pedas', label: 'Tidak Pedas', icon: '🙂' },
      { id: 'sedang',      label: 'Sedang',      icon: '🌶️' },
      { id: 'pedas',       label: 'Pedas',       icon: '🔥' }
    ]
  }
};

/* ---------- Kategori (urutan = urutan tampil; "All" otomatis di depan) ---------- */
// Cadangan bila tabel categories belum bisa dibaca; kategori utama dimuat dari Supabase (diatur lewat halaman admin).
let CATEGORIES = [
  { id: 'serundeng', name: 'Serundeng',      emoji: '🍚', color: '#556B2F' },
  { id: 'ketumbar',  name: 'Bumbu Ketumbar', emoji: '🌿', color: '#8B5E3C' },
  { id: 'bakar',     name: 'Bakar-bakaran',  emoji: '🔥', color: '#D97706' },
  { id: 'special',   name: 'Special',        emoji: '🍛', color: '#556B2F' },
  { id: 'camilan',   name: 'Camilan',        emoji: '🍟', color: '#D97706' }
];

/* ---------- Produk ----------
   id            : unik, jangan diubah setelah dipakai pelanggan
   category      : id kategori di atas
   name          : nama yang tampil di kartu produk
   cartName      : (opsional) nama pendek di keranjang
   desc          : deskripsi singkat
   price         : harga (Rp)
   variantGroup  : (opsional) kunci di VARIANT_GROUPS → pelanggan wajib memilih
   sku           : (opsional) produk dengan sku sama digabung di keranjang
   variantGroups : (opsional) beberapa grup sekaligus, mis. ['masakan', 'kepedasan'];
                   pelanggan wajib memilih satu opsi di setiap grup
   Kartu produk hanya menampilkan teks: nama, deskripsi, harga, tombol tambah.
------------------------------------------------------------------------ */
// Produk dimuat dari Supabase melalui /api/products.
// PRODUCTS sengaja dimulai kosong agar database menjadi sumber data utama.
let PRODUCTS = [];
