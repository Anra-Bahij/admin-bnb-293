-- =====================================================================
-- BnB CEMILAN — PENGUNCIAN AKHIR PEMBAYARAN                LANGKAH 2 dari 2
-- JALANKAN HANYA SETELAH:
--   1. 01_PAYMENT_MIGRATION.sql sudah dijalankan,
--   2. Environment Variable SUPABASE_SERVICE_ROLE_KEY sudah diisi di Vercel
--      (project web PELANGGAN) dan sudah Redeploy,
--   3. Pesanan uji lewat web (QRIS dan Cash) sudah berhasil tersimpan.
--
-- Efek: pesanan hanya bisa dibuat lewat backend /api/orders. Siapa pun yang
-- memegang anon/publishable key (yang memang terbaca di browser) TIDAK lagi bisa
-- menyisipkan pesanan langsung ke database untuk memalsukan nominal atau status bayar.
-- Aman dijalankan berulang. Tidak menghapus data.
-- =====================================================================

BEGIN;

DROP POLICY IF EXISTS "Public can create orders" ON public.orders;
REVOKE INSERT ON public.orders FROM anon;
REVOKE INSERT ON public.orders FROM authenticated;
-- service_role (dipakai backend) melewati RLS dan tidak terpengaruh.
-- Admin tetap bisa SELECT/UPDATE pesanan lewat policy "Admin read orders" / "Admin update orders".

COMMIT;

-- Pemeriksaan: tidak boleh ada policy INSERT pada orders untuk anon
SELECT policyname, cmd, roles FROM pg_policies WHERE schemaname = 'public' AND tablename = 'orders' ORDER BY policyname;

-- =====================================================================
-- ROLLBACK (bila perlu kembali ke kondisi LANGKAH 1) — jalankan manual:
--
-- GRANT INSERT ON public.orders TO anon, authenticated;
-- CREATE POLICY "Public can create orders" ON public.orders FOR INSERT TO anon, authenticated
--   WITH CHECK (
--     status = 'Baru' AND (
--       (payment_method IS NULL AND payment_status IS NULL)
--       OR (payment_method = 'QRIS' AND payment_status = 'Menunggu Verifikasi')
--       OR (payment_method = 'Cash' AND payment_status = 'Belum Dibayar')));
-- =====================================================================
