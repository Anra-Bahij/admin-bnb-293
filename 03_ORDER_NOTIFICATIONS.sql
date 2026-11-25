-- =====================================================================
-- BnB CEMILAN — NOTIFIKASI STATUS PESANAN (REALTIME)
-- Jalankan di Supabase → SQL Editor. Aman dijalankan berulang.
-- Tidak mengubah tabel/kolom/data/policy yang sudah ada. Tidak membuka akses SELECT ke tabel orders.
--
-- Cara kerja:
--   1. Admin mengubah orders.status (cara lama, tidak berubah).
--   2. Trigger di bawah mengirim sinyal Realtime (Broadcast) ke kanal "order:<id-pesanan>".
--      Isinya hanya id + status, tanpa nama/kelas/item/total.
--   3. Browser pelanggan yang memegang id pesanan itu (id acak UUID, didapat saat checkout)
--      menerima sinyal, lalu membaca status resmi lewat fungsi get_orders_status().
--   4. Pelanggan lain tidak punya id tersebut → tidak bisa membaca/menerima apa pun.
--
-- Prasyarat: Supabase Dashboard → Realtime → Settings → "Allow public access" harus AKTIF (bawaan: aktif).
-- =====================================================================

BEGIN;

-- 1) Baca status pesanan tertentu. Hanya mengembalikan 3 kolom dan hanya untuk id yang diminta (maks. 20).
--    Tabel orders tetap tertutup untuk anon; fungsi ini satu-satunya jalan baca, dan butuh id acak yang hanya diketahui pemesan.
CREATE OR REPLACE FUNCTION public.get_orders_status(p_ids uuid[])
RETURNS TABLE (id uuid, status text, pickup_method text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.status, o.pickup_method
  FROM public.orders o
  WHERE o.id = ANY (p_ids[1:20]);
$$;

REVOKE ALL ON FUNCTION public.get_orders_status(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_orders_status(uuid[]) TO anon, authenticated;

-- 2) Kirim sinyal saat status berubah. Kegagalan Realtime TIDAK boleh menggagalkan perubahan status oleh admin.
CREATE OR REPLACE FUNCTION public.notify_order_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM realtime.send(
      jsonb_build_object('id', NEW.id, 'status', NEW.status),
      'status',
      'order:' || NEW.id::text,
      false
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;   -- Realtime belum tersedia: pelanggan tetap mendapat status lewat sinkronisasi berkala.
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS orders_notify_status ON public.orders;
CREATE TRIGGER orders_notify_status
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.notify_order_status();

COMMIT;

-- =====================================================================
-- PEMERIKSAAN (hanya membaca)
-- =====================================================================
-- a) Nilai status yang benar-benar dipakai admin. Website memetakan: Baru/Pending → PENDING,
--    Diproses/Processing → PROCESSING, Siap/Ready → READY, Selesai/Completed → COMPLETED.
SELECT status, count(*) FROM public.orders GROUP BY status ORDER BY 2 DESC;

-- b) Trigger terpasang
SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.orders'::regclass AND tgname = 'orders_notify_status';

-- c) anon TIDAK boleh membaca tabel orders langsung (harus 0 baris / error izin)
-- SET ROLE anon; SELECT * FROM public.orders LIMIT 1; RESET ROLE;

-- =====================================================================
-- ROLLBACK (manual):
-- DROP TRIGGER IF EXISTS orders_notify_status ON public.orders;
-- DROP FUNCTION IF EXISTS public.notify_order_status();
-- DROP FUNCTION IF EXISTS public.get_orders_status(uuid[]);
-- =====================================================================
