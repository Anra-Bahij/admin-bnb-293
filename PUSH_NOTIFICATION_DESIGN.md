# Rancangan Web Push — BnB Cemilan (BELUM AKTIF)

Supabase Realtime hanya bekerja saat website terbuka. Agar pelanggan menerima pemberitahuan ketika website ditutup, dibutuhkan Web Push. Dokumen ini rancangannya; belum ada kode yang aktif untuk fitur ini, dan tidak ada tombol palsu di website.

## Yang dibutuhkan
| Komponen | Keterangan |
|---|---|
| Service Worker | `sw.js` sudah ada; tambahkan handler `push` dan `notificationclick`. |
| VAPID key pair | Buat sekali: `npx web-push generate-vapid-keys`. Public key boleh di frontend; **private key hanya di Environment Variable Vercel** (`VAPID_PRIVATE_KEY`), `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT=mailto:...`. |
| Backend pengirim | Fungsi Vercel `api/push-send.js` memakai paket `web-push` dan `SUPABASE_SERVICE_ROLE_KEY` (server saja). |
| Tabel langganan | `push_subscriptions` (SQL di bawah). Ditulis hanya oleh backend. |
| Pemicu | Supabase Database Webhook pada `UPDATE orders` (kolom `status`) → `POST /api/push-send` dengan header rahasia `x-webhook-secret`. |

## Alur
1. Pelanggan menekan tombol **"Aktifkan pemberitahuan"** (misalnya di panel Notifikasi). Izin diminta hanya dari tindakan ini, tidak saat website pertama dibuka.
2. Browser membuat `PushSubscription` (`registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`).
3. Frontend mengirim langganan + daftar id pesanan aktif ke `POST /api/push-subscribe`. Backend menyimpan ke `push_subscriptions` (service role). Id pesanan acak (UUID) berfungsi sebagai bukti kepemilikan, sama seperti di notifikasi Realtime.
4. Admin mengubah status → Database Webhook memanggil `/api/push-send` dengan `old_record`/`record`.
5. Backend memverifikasi `x-webhook-secret`, memetakan status ke tahap (aturan sama dengan `stageOf()` di `js/live.js`), memilih pesan (READY mengikuti `pickup_method`), lalu mengirim ke langganan milik pesanan itu saja.
6. Langganan yang dijawab 404/410 dihapus. `sw.js` menampilkan notifikasi; `notificationclick` membuka `/#pesanan`.

## SQL (jalankan saat fitur dikerjakan)
```sql
create table if not exists public.push_subscriptions (
  endpoint   text primary key,
  p256dh     text not null,
  auth       text not null,
  order_ids  uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
-- Tanpa policy untuk anon/authenticated: hanya service role (backend) yang bisa membaca/menulis.
create index if not exists push_subscriptions_order_ids_idx on public.push_subscriptions using gin (order_ids);
```

## Potongan sw.js
```js
self.addEventListener('push', (e) => {
  const d = e.data ? e.data.json() : {};
  e.waitUntil(self.registration.showNotification(d.title || 'BnB Cemilan', {
    body: d.body, icon: '/icons/icon-192-v2.png', badge: '/icons/favicon-32-v2.png', tag: d.tag, data: { url: '/#pesanan' }
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.openWindow((e.notification.data && e.notification.data.url) || '/'));
});
```
`tag: "<id-pesanan>:<tahap>"` mencegah notifikasi ganda untuk perubahan yang sama.

## Batasan yang perlu diketahui
- iPhone: Web Push hanya jalan bila website sudah **dipasang ke Layar Utama** (iOS/iPadOS 16.4+). Android/Chrome: jalan di browser biasa.
- Pelanggan harus mengizinkan notifikasi; bila ditolak, hanya notifikasi dalam website (Realtime) yang tersedia.
- Langganan bisa kedaluwarsa; backend menghapusnya saat push gagal.
- Pesan Push harus tidak memuat data pribadi (nama/kelas); cukup judul dan pesan tahap.
