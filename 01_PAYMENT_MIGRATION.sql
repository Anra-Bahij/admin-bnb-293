-- =====================================================================
-- BnB CEMILAN — MIGRASI PEMBAYARAN (QRIS + CASH)          LANGKAH 1 dari 2
-- Jalankan di Supabase → SQL Editor, SEBELUM men-deploy kode baru.
--
-- Sifat skrip ini:
--   • Aman dijalankan berulang (IF NOT EXISTS / DROP POLICY IF EXISTS).
--   • TIDAK menghapus tabel, kolom, atau data. Tidak mengubah menu/kategori/harga.
--   • Pesanan lama tidak diubah: kolom baru bernilai NULL pada pesanan lama.
--   • Seluruh skrip berjalan dalam satu transaksi: jika ada yang gagal, semuanya dibatalkan.
--   • Kompatibel mundur: web pelanggan versi lama masih bisa membuat pesanan
--     sampai kode baru ter-deploy.
--
-- Prasyarat: SUPABASE_SETUP.sql (pelanggan) dan ADMIN_SETUP.sql (admin) sudah pernah
-- dijalankan (fungsi public.is_admin() harus ada).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0) Pemeriksaan prasyarat
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public.is_admin()') IS NULL THEN
    RAISE EXCEPTION 'Fungsi public.is_admin() belum ada. Jalankan ADMIN_SETUP.sql (admin) lebih dulu.';
  END IF;
  IF to_regclass('public.orders') IS NULL THEN
    RAISE EXCEPTION 'Tabel public.orders tidak ditemukan.';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1) Kolom pembayaran pada tabel orders (tanpa duplikat)
--    Dari hasil pemeriksaan struktur: kelima kolom ini BELUM ada.
-- ---------------------------------------------------------------------
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method text;     -- 'QRIS' | 'Cash'
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_status text;     -- lihat constraint di bawah
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_proof  text;     -- path file di bucket payment-proofs (BUKAN URL)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cash_received  integer;  -- uang yang diberikan pelanggan (Cash)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS change_amount  integer;  -- kembalian (Cash)

-- ---------------------------------------------------------------------
-- 2) Aturan konsistensi data pembayaran (pertahanan lapis kedua di database)
--    • Pesanan lama (semua kolom pembayaran NULL) tetap valid.
--    • QRIS : status ∈ {Menunggu Verifikasi, Terverifikasi, Ditolak}, WAJIB ada payment_proof.
--    • Cash : status ∈ {Belum Dibayar, Sudah Dibayar}, uang diterima ≥ total,
--             kembalian = uang diterima − total.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_payment_consistency_chk' AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_payment_consistency_chk CHECK (
        (
          payment_method IS NULL AND payment_status IS NULL AND payment_proof IS NULL
          AND cash_received IS NULL AND change_amount IS NULL
        )
        OR (
          payment_method = 'QRIS'
          AND payment_status IN ('Menunggu Verifikasi', 'Terverifikasi', 'Ditolak')
          AND payment_proof IS NOT NULL
          AND payment_proof ~ '^[A-Za-z0-9][A-Za-z0-9/_.-]{0,200}$'
          AND cash_received IS NULL AND change_amount IS NULL
        )
        OR (
          payment_method = 'Cash'
          AND payment_status IN ('Belum Dibayar', 'Sudah Dibayar')
          AND payment_proof IS NULL
          AND cash_received IS NOT NULL AND change_amount IS NOT NULL
          AND cash_received >= total
          AND change_amount = cash_received - total
        )
      );
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 3) Bucket Storage PRIVATE "payment-proofs"
--    private (public = false), maks. 2 MB per file, hanya gambar JPG/PNG/WebP.
-- ---------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('payment-proofs', 'payment-proofs', false, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------------------------------------------------------------------
-- 4) Storage policy (storage.objects)
--    • SELECT  : hanya admin terdaftar (public.is_admin()) → untuk melihat bukti (signed URL).
--    • INSERT / UPDATE / DELETE : TIDAK ada policy untuk anon maupun authenticated.
--      Artinya hanya backend (/api/orders, memakai service role di server) yang bisa mengunggah.
--    • Tidak ada akses publik/anonim sama sekali ke bucket ini.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "payment-proofs admin read" ON storage.objects;
CREATE POLICY "payment-proofs admin read"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'payment-proofs' AND public.is_admin());

-- ---------------------------------------------------------------------
-- 5) RLS orders — INSERT dari klien dipersempit
--    Klien (anon key) tidak boleh menyisipkan pesanan dengan status pembayaran
--    "Terverifikasi"/"Sudah Dibayar" atau status pesanan selain "Baru".
--    Cabang "pembayaran NULL" dipertahankan sementara agar web lama tidak putus;
--    ditutup di LANGKAH 2 (02_PAYMENT_LOCKDOWN.sql) setelah kode baru berjalan.
--    UPDATE (mengubah status bayar) tetap hanya untuk admin lewat policy
--    "Admin update orders" yang sudah ada — tidak diubah.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can create orders" ON public.orders;
CREATE POLICY "Public can create orders"
  ON public.orders
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    status = 'Baru'
    AND (
      (payment_method IS NULL AND payment_status IS NULL)
      OR (payment_method = 'QRIS' AND payment_status = 'Menunggu Verifikasi')
      OR (payment_method = 'Cash' AND payment_status = 'Belum Dibayar')
    )
  );

COMMIT;

-- =====================================================================
-- PEMERIKSAAN (hanya membaca) — jalankan setelah COMMIT
-- =====================================================================

-- a) Kolom pembayaran harus muncul tepat satu kali masing-masing
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'orders'
  AND column_name IN ('payment_method', 'payment_status', 'payment_proof', 'cash_received', 'change_amount')
ORDER BY column_name;

-- b) Bucket: public harus false
SELECT id, name, public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'payment-proofs';

-- c) Policy yang menyangkut payment-proofs: hanya satu (SELECT, admin)
SELECT policyname, cmd, roles FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname ILIKE '%payment-proofs%';

-- d) Pesanan lama tidak berubah: kolom pembayaran masih NULL
SELECT count(*) AS pesanan_lama_tanpa_data_bayar FROM public.orders WHERE payment_method IS NULL;
