# BnB Cemilan — Panel Admin

Web admin **terpisah** dari web pelanggan. HTML/CSS/JavaScript murni (tanpa build), terhubung langsung ke Supabase (Auth + Database + Realtime), siap deploy ke Vercel sebagai project baru.

## Fitur

1. **Jenis Menu**: tambah, edit (nama, emoji, warna), hapus, urutkan, sembunyikan.
2. **Menu**: tambah, edit, hapus, urutkan; termasuk deskripsi, harga, variasi pilihan (grup + opsi + harga opsi), nama keranjang, SKU.
3. **Tandai "Belum tersedia"**: satu ketukan pada saklar di tiap menu. Di web pelanggan menu tampil redup dengan label "Belum tersedia", tombol + hilang, dan tidak bisa dipesan.
4. **Live Laporan & Live Order**:
   - Pesanan baru muncul seketika (Supabase Realtime) dengan notifikasi dan bunyi opsional (ikon lonceng).
   - Status pesanan: Baru → Diproses → Selesai, atau Dibatalkan (tidak dihitung pendapatan).
   - Laporan: pendapatan hari ini, 7 hari, bulan ini, pesanan aktif, rata-rata per pesanan, grafik 14 hari, menu terlaris bulan ini. Semua ikut berubah live.
   - Jika Realtime terputus, panel otomatis cek ulang tiap 15 detik (indikator di pojok kanan atas).

## Struktur

```
bnb-cemilan-admin/
├── index.html
├── ADMIN_SETUP.sql      ← SQL hak akses admin + Realtime
├── vercel.json
├── css/admin.css
├── api/config.js        ← membaca Environment Variables Vercel
├── js/app.js
└── assets/logo.png
```

## Langkah pemasangan (urut)

1. **SQL web pelanggan dulu.** Supabase → SQL Editor → jalankan `SUPABASE_SETUP.sql` dari zip pelanggan versi terbaru (menambah kolom `is_sold`, tabel `categories`, kolom `created_at` pada `orders`).
2. **SQL admin.** Jalankan `ADMIN_SETUP.sql` dari zip ini (tabel `admin_users`, fungsi `is_admin()`, kebijakan RLS admin, Realtime pada `orders`).
3. **Buat akun admin.** Supabase → Authentication → Users → *Add user* → isi email + kata sandi (centang Auto Confirm). Disarankan menonaktifkan pendaftaran publik: Authentication → Sign In / Providers → matikan *Allow new users to sign up*.
4. **Daftarkan email admin.** Di SQL Editor:
   ```sql
   INSERT INTO public.admin_users (email) VALUES ('emailadmin@contoh.com') ON CONFLICT DO NOTHING;
   ```
   Hanya email di tabel ini yang boleh mengelola data. Akun lain yang bisa login tetap ditolak oleh panel dan oleh database (RLS).
5. **Deploy ke Vercel** sebagai project baru (Framework Preset: Other, kosongkan Build/Output).
6. **Isi Environment Variables** di Vercel → Settings → Environment Variables, lalu **Redeploy**:

   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | `https://PROJECT-REF.supabase.co` |
   | `SUPABASE_ANON_KEY` | publishable key (`sb_publishable_...`) |

   Jangan memakai `sb_secret_`/`service_role` (otomatis ditolak). Uji lokal memakai `vercel dev` dengan file `.env.local` berisi dua variabel yang sama.
7. Deploy ulang web pelanggan (zip pelanggan v2) agar membaca jenis menu & status "Belum tersedia".

## Catatan

- **Keamanan:** kunci publishable tetap terbaca browser (memang begitu cara kerja Supabase di sisi klien). Perlindungan ada pada login Supabase + RLS: pengunjung biasa hanya bisa membaca menu aktif dan membuat pesanan; membaca pesanan, mengubah menu, dan mengubah status hanya untuk email di `admin_users`.
- **Hapus jenis menu** ditolak bila masih ada menu di dalamnya (agar menu tidak "hilang"); pindahkan/hapus menunya dulu, atau sembunyikan jenisnya.
- **Menu ID:** bila kolom `products.id` Anda bertipe `uuid`, panel otomatis mengirim tanpa id sehingga database yang membuatnya.
- **Zona waktu laporan:** `Asia/Jakarta` (ubah lewat env opsional `ADMIN_TIMEZONE`). Laporan memakai pesanan 60 hari terakhir (maks. 2000 pesanan).
- Pesanan lama yang dibuat sebelum `created_at` ditambahkan akan memakai waktu saat SQL dijalankan.
