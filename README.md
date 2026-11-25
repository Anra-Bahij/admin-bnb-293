# BnB Cemilan — Website Pemesanan Makanan

Website HTML/CSS/JavaScript murni dengan Supabase sebagai database utama. Tampilan dan alur website dipertahankan; katalog dibaca dari Supabase dan pesanan disimpan ke Supabase sebelum WhatsApp dibuka.

## 1. Struktur folder

```
bnb-cemilan/
├── index.html              ← halaman utama (struktur HTML)
├── sw.js                   ← service worker (cache, offline); VERSION naik tiap rilis
├── manifest.webmanifest    ← manifest PWA
├── offline.html            ← halaman saat offline
├── vercel.json             ← pengaturan Vercel
├── api/                    ← fungsi serverless (Vercel)
│   ├── products.js         ← katalog dari Supabase
│   ├── orders.js           ← penyimpanan pesanan
│   ├── reviews.js          ← rating & ulasan (v4)
│   └── realtime-config.js  ← URL & anon key Supabase untuk Realtime (v3)
├── SUPABASE_SETUP.sql      ← skema dasar (kolom, kebijakan akses)
├── 01_PAYMENT_MIGRATION.sql
├── 02_PAYMENT_LOCKDOWN.sql
├── 03_ORDER_NOTIFICATIONS.sql  ← trigger & RPC status pesanan (v3)
├── 04_REVIEWS.sql          ← tabel product_reviews + fungsi ulasan (v4)
├── PETUNJUK_PEMBAYARAN.md, PETUNJUK_PWA.md, PUSH_NOTIFICATION_DESIGN.md
├── css/
│   ├── style.css           ← tampilan utama, animasi pembuka, responsif
│   ├── liquid.css          ← tab bar kaca, notifikasi, ulasan (v3–v4)
│   ├── home.css, payment.css, pwa.css
├── js/
│   ├── data.js             ← ★ konfigurasi toko, kelas, kategori, variasi, nomor WhatsApp
│   ├── app.js              ← tampilan: tab bar, swipe, pencarian, menu, keranjang, checkout
│   ├── cart.js             ← logika keranjang + Local Storage (tanpa tampilan)
│   ├── live.js             ← riwayat pesanan, notifikasi, Supabase Realtime (v3)
│   ├── payment.js, pwa.js
│   └── vendor/supabase.js  ← salinan lokal supabase-js (UMD)
├── icons/                  ← ikon, splash (versi *-v2 yang dipakai)
└── assets/
    ├── logo.png            ← logo transparan (sumber logo di website)
    ├── cara-pesan/         ← gambar panduan cara pesan
    ├── source/             ← logo asli, diarsipkan, tidak diubah
    └── products/           ← cadangan (kartu produk saat ini hanya teks)
```

Prinsip: **Supabase adalah sumber utama nama produk, deskripsi, harga, variasi, status aktif, dan urutan menu.** `js/data.js` menyimpan konfigurasi tampilan toko, daftar kelas, dan kategori.

## 2. Cara menjalankan

Cukup buka `index.html` di browser (klik dua kali). Untuk uji di HP pada jaringan Wi-Fi yang sama:

```
cd bnb-cemilan
python3 -m http.server 8000
```
lalu buka `http://<IP-komputer>:8000` di HP.

> Animasi pembuka hanya tampil sekali per sesi browser. Untuk melihatnya lagi: tutup tab lalu buka kembali, atau buka di jendela Incognito. Tombol "Lewati" tersedia di pojok kanan bawah.

## 3. WhatsApp pesanan

Nomor penerima sudah diatur di `js/data.js` (`whatsappNumber: '6287722011556'`, format internasional tanpa "+" atau spasi). Alur pelanggan:

1. Tekan bar keranjang di bawah → muncul kerangka pemuatan (skeleton shimmer ± 0,75 detik) → halaman **Detail Pesanan**.
2. Isi **Nama pemesan**, pilih **Kelas** lewat keyboard khusus (lihat bawah), pilih **Ambil sendiri / Diantar** (tanpa kolom alamat), **Catatan** opsional.
3. Tombol **PESAN SEKARANG** membuka WhatsApp (Click to Chat `wa.me`) dengan struk pesanan yang sudah tersusun, memuat nama, kelas, pengambilan, catatan, daftar pesanan lengkap dengan variasi, dan total.

### Kolom Kelas & keyboard kustom

Kolom Kelas tidak memakai keyboard bawaan HP. Saat ditekan, muncul keyboard buatan BnB Cemilan (tombol X, I, E, F, 1-8, ⌫, Selesai) dan tanda hubung ditambahkan otomatis (X + E + 4 → `X-E4`, X + I + I + F + 1 → `XII-F1`). Tombol yang tidak mungkin membentuk kelas resmi dinonaktifkan, sehingga input tidak bisa melewati format.

Kelas yang diterima hanya yang ada di daftar `KELAS_RESMI` pada `js/data.js` (21 kelas SMA Negeri 33 Jakarta). Untuk menambah atau menghapus kelas, ubah daftar itu; bila muncul huruf/angka baru, tambahkan juga tombolnya pada `KELAS_KEYS` di `js/app.js`. Kelas di luar daftar ditolak dengan pesan "Kelas tidak ditemukan. Silakan periksa kembali penulisan kelas Anda."

## 4. Logo

Website hanya memakai **satu** file: `assets/logo.png` (transparan, tanpa pola kotak-kotak). Untuk menggantinya, timpa file itu (atau ubah `logo:` di `js/data.js`) dengan PNG berlatar transparan. Logo asli tetap tersimpan di `assets/source/logo-original.jpg`.

## 5. Kartu produk

Kartu produk hanya berisi teks: nama, deskripsi, harga, dan tombol +. Tidak ada kolom foto, emoji, atau ikon pada produk.

## 6. Menambah produk baru

Tambahkan satu objek di array `PRODUCTS` pada `js/data.js`:

```js
{ id: 'cml-risol', category: 'camilan', name: 'Risol Mayo', desc: 'Risol isi mayones dan sayur.',
  price: 12000 },
```

- `id` harus unik dan sebaiknya tidak diubah setelah dipakai.
- `category` adalah id kategori (`serundeng`, `ketumbar`, `bakar`, `special`, `camilan`, atau kategori baru).
- Kategori **Special** sudah berisi produk; **Camilan sudah siap**; produk yang Anda tambahkan langsung muncul.
- Agar produk punya pilihan wajib, tambahkan `variantGroup: 'bagianAyam'` atau `'jenisNasi'`.

## 7. Mengubah harga

Ubah angka `price` pada produk di `js/data.js` (tanpa titik, mis. `16000`). Untuk produk dengan variasi, harga yang dipakai di keranjang adalah `price` pada setiap opsi di `VARIANT_GROUPS`, jadi ubah di sana juga (mis. harga nasi: `jenisNasi` → setiap opsi). Keranjang pelanggan selalu membaca harga terbaru dari data.

## 8. Menambah kategori

Tambahkan satu baris di `CATEGORIES` (urutan = urutan tampil di navigasi, "All" otomatis di depan):

```js
{ id: 'minuman', name: 'Minuman', emoji: '🥤', color: '#556B2F' },
```

Lalu beri produk `category: 'minuman'`. Kategori tanpa produk menampilkan pesan "segera hadir".

## 9. Membuat variasi baru

Di `VARIANT_GROUPS` buat grup baru, mis. tingkat pedas:

```js
tingkatPedas: {
  title: 'Pilih Level Pedas',
  options: [
    { id: 'sedang', label: 'Sedang', price: 10000, icon: '🌶️' },
    { id: 'pedas',  label: 'Pedas',  price: 10000, icon: '🔥' }
  ]
}
```
dan pasang di produk dengan `variantGroup: 'tingkatPedas'`.

**Beberapa grup sekaligus** (seperti Mie/Kwetiau/Bihun Special): tulis `variantGroups: ['masakan', 'kepedasan']`. Pelanggan wajib memilih satu opsi di setiap grup; opsi tanpa `price` memakai harga produk. Pelanggan wajib memilih sebelum produk masuk keranjang; variasi berbeda dihitung sebagai item berbeda.

Catatan: produk dengan `sku` yang sama (mis. `sku: 'nasi'`) digabung di keranjang walau berasal dari kategori berbeda, sehingga "Nasi Putih" dari Serundeng dan dari Bakar-bakaran menjadi satu baris.

## 10. Deploy ke Vercel

**Cara A — lewat GitHub (disarankan):**
1. Buat repository baru di GitHub, unggah seluruh isi folder `bnb-cemilan`.
2. Buka vercel.com → *Add New… → Project* → pilih repository tersebut.
3. *Framework Preset*: **Other**. Kosongkan *Build Command* dan *Output Directory*. Klik **Deploy**.

**Cara B — lewat Vercel CLI:**
```
npm i -g vercel
cd bnb-cemilan
vercel --prod
```

Setiap perubahan yang Anda push ke GitHub otomatis ter-deploy ulang. Domain sendiri dapat dipasang di *Project → Settings → Domains*.

## Catatan teknis

- Keranjang disimpan di Local Storage (`bnbcemilan_cart_v1`) dan bertahan setelah halaman dimuat ulang.
- Header, pencarian, dan kategori memakai `position: sticky`; kategori dapat digeser horizontal di HP.
- Responsif: 2 kolom (HP), 3 kolom (≥700 px), 4 kolom (≥1100 px).
- Pengguna dengan pengaturan "kurangi gerakan" otomatis melewati animasi pembuka.


## 11. Integrasi Supabase (database utama)

Website mengambil produk dari `GET /api/products` dan menyimpan pesanan melalui `POST /api/orders`. Keranjang tetap berada di Local Storage. Setelah pesanan berhasil tersimpan, website membuka WhatsApp seperti alur sebelumnya.

### A. Environment Variables di Vercel

Buka **Vercel → Project BnB Cemilan → Settings → Environment Variables**, lalu tambahkan:

| Name | Value |
|---|---|
| `SUPABASE_URL` | `https://PROJECT-REF.supabase.co` |
| `SUPABASE_ANON_KEY` | Publishable key (`sb_publishable_...`) |

Pilih environment **Production**, **Preview**, dan **Development** sesuai kebutuhan, lalu Save. Setelah itu lakukan **Redeploy** agar environment variables terbaca.

**Jangan** memasukkan `sb_secret_...` atau `service_role` ke frontend maupun environment yang dipakai browser. Endpoint ini hanya menggunakan publishable/anon key.

### B. Siapkan kolom dan kebijakan database

Buka Supabase → SQL Editor, lalu jalankan `SUPABASE_SETUP.sql`. File tersebut tidak menghapus tabel atau data. Pastikan tabel `products` memiliki kolom `cart_name`, `sku`, dan `variant_groups`.

### C. Bentuk data variasi

Kolom `variant_groups` bertipe JSONB. Contoh satu grup:

```json
[
  {
    "title": "Pilih Bagian Ayam",
    "options": [
      {"id": "paha", "label": "Paha", "price": 10000},
      {"id": "dada", "label": "Dada", "price": 10000}
    ]
  }
]
```

Produk tanpa variasi menggunakan `[]`. Untuk produk dengan dua grup (misalnya jenis masakan dan kepedasan), isi dua objek di dalam array tersebut.

### D. Deploy dan tes

1. Commit/push seluruh isi folder ini ke GitHub.
2. Pastikan Environment Variables sudah disimpan di Vercel.
3. Redeploy.
4. Buka website dan periksa apakah daftar menu muncul.
5. Buat pesanan uji. Periksa Supabase → Table Editor → `orders`.
6. Pesanan yang berhasil disimpan akan dilanjutkan ke WhatsApp.

Catatan: kebijakan insert publik pada tahap awal ini mengizinkan pengunjung mengirim pesanan. Sebelum dipakai untuk transaksi publik skala besar, validasi harga dan isi keranjang perlu diperketat di sisi server/database. Jangan membuka akses SELECT publik ke tabel `orders`.


## 12. Pembaruan v2: jenis menu dari database & status "Belum tersedia"

Dikelola lewat web admin terpisah (`bnb-cemilan-admin`).

- **Jenis menu (kategori)** kini dibaca dari tabel `categories` melalui `GET /api/products` (bersama produk). Jika tabel kosong/belum ada, website memakai daftar cadangan `CATEGORIES` di `js/data.js`.
- **Menu belum tersedia**: produk dengan `is_sold = true` tetap tampil, redup, dengan label "Belum tersedia" dan tanpa tombol +. Produk itu tidak bisa masuk keranjang, otomatis keluar dari keranjang bila admin menandainya habis, dan ditolak oleh `POST /api/orders` (HTTP 409).
- Daftar menu diperbarui otomatis setiap 30 detik dan saat tab dibuka kembali, tanpa muat ulang.

**Yang harus dilakukan:** jalankan ulang `SUPABASE_SETUP.sql` (versi terbaru) di Supabase SQL Editor, lalu deploy ulang. Tanpa SQL ini kolom `is_sold` belum ada dan `/api/products` akan gagal.

## Beranda (halaman pertama)
- Beranda (hero, Cara Pesan, Hubungi & Ikuti Kami, footer) dan katalog berada dalam satu `index.html`. Katalog terbuka lewat tombol **LIHAT DAFTAR MENU** (alamat `#menu`); tombol Beranda / logo / tombol Kembali browser kembali ke beranda. Keranjang tetap tersimpan karena tidak ada muat ulang halaman.
- Gaya beranda: `css/home.css`. Logika: bagian "Beranda ⇄ Katalog" dan "Carousel Cara Pesan" di `js/app.js`.
- Gambar Cara Pesan: `assets/cara-pesan/1..4-*.webp` (screenshot tampilan website). Bila menu/tampilan berubah, ganti keempat file ini dengan screenshot baru (nama sama).
- Nomor WhatsApp diambil dari `STORE.whatsappNumber` di `js/data.js`.
- `sw.js` VERSION dinaikkan ke v1.1.0 agar pengguna PWA mendapat tombol "Perbarui".

---

## 13. Pembaruan v3: Liquid Glass Experience + Notifikasi Real-time

**Tampilan**
- **Bottom Tab Bar** (kapsul kaca) dengan tepat 3 tab: BERANDA, MENU, PESANAN. Tidak ada tab Keranjang/Akun. Alamat `#menu` dan `#pesanan` agar tombol Kembali tetap menuju beranda.
- **Header** disederhanakan: logo, sapaan, dan "Mau jajan apa hari ini?" dipertahankan; tombol rumah dan tombol keranjang dihapus dari header; lonceng notifikasi ada di kanan atas.
- **(v3, digantikan di v4)** Floating Cart Button (`position: fixed`, kanan bawah, sejajar tab bar): badge jumlah item otomatis berubah, membuka keranjang yang sama seperti sebelumnya. Bar keranjang lama di bawah layar digantikan tombol ini.
- Gaya ada di `css/liquid.css`; warna memakai variabel yang sudah ada.

**Notifikasi pesanan (BNB REAL-TIME ORDER NOTIFICATION)**
- Pesanan yang dibuat dari sebuah perangkat dicatat di perangkat itu (Local Storage). Tab **Pesanan** menampilkan status dan riwayatnya. Tidak ada akun pelanggan, jadi riwayat tidak ikut berpindah ke perangkat lain.
- Admin mengubah `orders.status` → trigger database mengirim sinyal Realtime ke kanal `order:<id-pesanan>` → browser pelanggan membaca status resmi lewat fungsi `get_orders_status()` → notifikasi dibuat sesuai tahap. Satu notifikasi per pesanan per tahap (tidak berulang).
- Status READY memakai satu status; pesannya mengikuti pilihan checkout (Ambil sendiri → "Pesanan Siap Diambil!", Diantar → "Pesanan Siap Diantar!").
- Pemetaan nilai `orders.status` → tahap ada di `stageOf()` pada `js/live.js`: `Baru/Pending/Menunggu` → PENDING, `Diproses/Processing` → PROCESSING, `Siap/Ready` → READY, `Selesai/Completed` → COMPLETED. Status lain tidak memicu notifikasi (tab Pesanan menampilkan teks aslinya). Cek nilai yang dipakai admin Anda dengan query (a) di `03_ORDER_NOTIFICATIONS.sql`.
- Keamanan: tabel `orders` tetap tertutup untuk anon. Pelanggan hanya bisa membaca pesanan yang id acaknya (UUID) ia terima saat checkout. Sinyal Realtime tidak memuat nama/kelas/item/total. Hanya `anon key` yang dikirim ke browser (lewat `/api/realtime-config`, yang menolak bila yang terisi kunci rahasia).
- Realtime putus → sinkronisasi tiap 30 detik, saat tab dibuka lagi, dan saat koneksi pulih. Koneksi Realtime baru dibuka bila ada pesanan aktif.

**Langkah pasang (urut)**
1. Supabase → SQL Editor: jalankan `03_ORDER_NOTIFICATIONS.sql`.
2. Supabase → Realtime → Settings: pastikan **Allow public access** aktif (bawaan aktif).
3. Vercel (project pelanggan): tidak ada variabel baru. `SUPABASE_URL` dan `SUPABASE_ANON_KEY` yang sudah ada dipakai; `SUPABASE_SERVICE_ROLE_KEY` tetap hanya di server dan tidak dipakai fitur ini.
4. Salin file baru/berubah, commit, Redeploy. Pelanggan akan melihat banner "Versi baru tersedia" (versi service worker naik ke v1.3.0).
5. Uji: buat pesanan, ubah status di web admin, lihat lonceng berubah tanpa refresh.

**Push Notification** (saat web ditutup) belum aktif: lihat `PUSH_NOTIFICATION_DESIGN.md`.

---

## 14. Pembaruan v4: Swipe Tab Bar, Keranjang jadi Tab, Rating & Ulasan

**Bottom Tab Bar (4 tab)**: BERANDA · MENU · KERANJANG · PESANAN. Tombol keranjang mengambang dihapus; badge jumlah item kini ada di ikon tab Keranjang. Tab Keranjang membuka keranjang yang sama seperti sebelumnya (checkout tidak berubah); selama keranjang terbuka, tab bar tetap bisa dipakai dan indikator berada di tab ke-3.

**Swipe (mengikuti jari)**: hanya aktif bila jari menggeser Bottom Tab Bar (kode di `js/app.js`, `DRAG_LOCK`, `COMMIT_RATIO`, `FLICK_PX`, `FLICK_V`). Saat digeser, ikon di bawah jari naik keluar dari kapsul dan ikut bergerak horizontal; indikator cair selalu berada tepat di bawah ikon itu; halaman TIDAK ikut bergerak selama digeser. Tab tujuan = tab tempat ikon berada saat jari diangkat. Bila geseran lebih dari 20% lebar layar atau cepat (lebih dari 20 px dengan kecepatan di atas 0,5 px/ms), setelah jari diangkat halaman lama keluar dan halaman baru masuk, indikator meluncur ke tab tujuan, dan ikon kembali ke tengah tab asal lalu meluncur mendatar di dalam kapsul dan mendarat tepat di tengah tab tujuan; jika tidak, halaman dan indikator kembali dan ikon turun ke kapsulnya. Satu geseran bisa melewati lebih dari satu tab, sesuai posisi ikon. Area konten tidak terpengaruh. Layar yang sedang digeser dipotong (`overflow-x: clip` di `.app`) agar tidak melebarkan halaman. Dengan `prefers-reduced-motion`, lemparan ikon dilewati.

**Rating & ulasan**
- Pasang `04_REVIEWS.sql` (sesudah `03_ORDER_NOTIFICATIONS.sql`) di Supabase SQL Editor. Hanya menambah 1 tabel (`product_reviews`) dan 4 fungsi; tidak mengubah data/tabel/trigger yang ada. Tidak ada variabel baru di Vercel.
- Alur: pesanan berstatus selesai → tab Pesanan menampilkan "Beri Penilaian" per produk → bintang 1–5 (wajib), komentar opsional (maks. 500 karakter) → tersimpan di Supabase; mengirim lagi = mengedit ulasan sendiri.
- Validasi ada di database (`submit_review`): rating 1–5, pesanan harus selesai, produk harus ada di `orders.items` pesanan itu, satu ulasan per (pesanan, produk). Tabel ulasan tertutup untuk anon; hanya bisa lewat fungsi.
- Karena belum ada akun pelanggan, "pemilik ulasan" = pemegang id pesanan (UUID acak yang hanya diterima pemesan), sama seperti notifikasi.
- Kartu produk menampilkan "★ 4.8 (24 ulasan)" dari data Supabase, atau "Belum ada ulasan"; ketuk kartu untuk detail produk berisi rata-rata, jumlah, dan daftar ulasan (bintang, komentar bila ada, tanggal). Ulasan tidak memuat nama pelanggan.
- Admin: bila fungsi `public.is_admin()` ada, admin dapat melihat/menghapus ulasan lewat tabel `product_reviews` (moderasi). Halaman admin belum menampilkannya.
