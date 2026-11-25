-- =====================================================================
-- BnB CEMILAN — RATING & ULASAN PRODUK
-- Jalankan di Supabase → SQL Editor SETELAH 03_ORDER_NOTIFICATIONS.sql. Aman dijalankan berulang.
-- Hanya MENAMBAH: 1 tabel baru + 4 fungsi. Tidak mengubah/menghapus tabel, kolom, data, policy, atau trigger yang ada
-- (trigger notifikasi Realtime tidak disentuh).
--
-- Identitas pelanggan: belum ada akun, jadi "pemilik pesanan" = pemegang id pesanan (UUID acak yang hanya diterima
-- pemesan saat checkout; sama seperti notifikasi). Itu yang membatasi siapa boleh mengulas / mengedit ulasan.
--
-- Pesanan tidak punya tabel order_items: item disimpan di orders.items (JSONB, tiap elemen punya product_id).
-- Karena itu satu ulasan = satu (pesanan, produk); varian produk yang sama dalam satu pesanan dihitung satu item ulasan.
--
-- Semua validasi dilakukan di database (fungsi submit_review), bukan di browser:
--   • rating wajib 1–5          • komentar opsional (maks. 500 karakter; kosong → disimpan NULL)
--   • pesanan harus ada dan berstatus selesai (aturan sama dengan js/live.js: selesai/completed/done)
--   • produk harus benar-benar ada di orders.items pesanan itu
--   • satu ulasan per (pesanan, produk); mengirim lagi = mengedit ulasan sendiri
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.product_reviews (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   uuid NOT NULL REFERENCES public.orders(id)   ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  rating     smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment    text CHECK (comment IS NULL OR char_length(comment) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, product_id)
);
CREATE INDEX IF NOT EXISTS product_reviews_product_idx ON public.product_reviews (product_id, created_at DESC);

-- Tabel tertutup: anon/authenticated tidak punya akses langsung (RLS aktif, tanpa policy untuk mereka).
ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_reviews FROM anon, authenticated;

-- Admin (bila fungsi public.is_admin() ada) boleh melihat & menghapus ulasan (moderasi).
DO $$
BEGIN
  IF to_regprocedure('public.is_admin()') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, DELETE ON public.product_reviews TO authenticated';
    EXECUTE 'DROP POLICY IF EXISTS "Admin read reviews" ON public.product_reviews';
    EXECUTE 'CREATE POLICY "Admin read reviews" ON public.product_reviews FOR SELECT TO authenticated USING (public.is_admin())';
    EXECUTE 'DROP POLICY IF EXISTS "Admin delete reviews" ON public.product_reviews';
    EXECUTE 'CREATE POLICY "Admin delete reviews" ON public.product_reviews FOR DELETE TO authenticated USING (public.is_admin())';
  END IF;
END $$;

-- 1) Kirim / edit ulasan. Kode kesalahan dibaca oleh /api/reviews.
CREATE OR REPLACE FUNCTION public.submit_review(p_order_id uuid, p_product_id text, p_rating integer, p_comment text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status  text;
  v_items   jsonb;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
  v_row     public.product_reviews;
BEGIN
  IF p_rating IS NULL OR p_rating NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'RATING_INVALID' USING ERRCODE = 'PT400';
  END IF;
  IF v_comment IS NOT NULL AND char_length(v_comment) > 500 THEN
    RAISE EXCEPTION 'COMMENT_TOO_LONG' USING ERRCODE = 'PT400';
  END IF;

  SELECT o.status, o.items INTO v_status, v_items FROM public.orders o WHERE o.id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'PT404';
  END IF;
  IF v_status IS NULL OR v_status !~* '(selesai|complete|done)' THEN
    RAISE EXCEPTION 'ORDER_NOT_COMPLETED' USING ERRCODE = 'PT403';
  END IF;
  IF jsonb_typeof(v_items) IS DISTINCT FROM 'array'
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_items) e WHERE e->>'product_id' = p_product_id) THEN
    RAISE EXCEPTION 'ITEM_NOT_IN_ORDER' USING ERRCODE = 'PT403';
  END IF;

  INSERT INTO public.product_reviews (order_id, product_id, rating, comment)
  VALUES (p_order_id, p_product_id, p_rating::smallint, v_comment)
  ON CONFLICT (order_id, product_id)
  DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, updated_at = now()
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('product_id', v_row.product_id, 'rating', v_row.rating, 'comment', v_row.comment);
END;
$$;

-- 2) Ulasan yang sudah diberikan pada satu pesanan (untuk tombol "Beri Penilaian" / "Ubah").
CREATE OR REPLACE FUNCTION public.get_order_reviews(p_order_id uuid)
RETURNS TABLE (product_id text, rating smallint, comment text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT r.product_id, r.rating, r.comment FROM public.product_reviews r WHERE r.order_id = p_order_id;
$$;

-- 3) Rata-rata & jumlah ulasan per produk (kartu produk). Dihitung dari ulasan asli.
CREATE OR REPLACE FUNCTION public.get_product_rating_stats()
RETURNS TABLE (product_id text, avg_rating numeric, review_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT r.product_id, round(avg(r.rating)::numeric, 1), count(*) FROM public.product_reviews r GROUP BY r.product_id;
$$;

-- 4) Daftar ulasan satu produk (tanpa nama/pesanan pelanggan: hanya bintang, komentar, tanggal).
CREATE OR REPLACE FUNCTION public.get_product_reviews(p_product_id text, p_limit integer DEFAULT 30)
RETURNS TABLE (rating smallint, comment text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT r.rating, r.comment, r.created_at FROM public.product_reviews r
  WHERE r.product_id = p_product_id ORDER BY r.created_at DESC LIMIT least(greatest(coalesce(p_limit, 30), 1), 50);
$$;

REVOKE ALL ON FUNCTION public.submit_review(uuid, text, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_order_reviews(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_product_rating_stats() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_product_reviews(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_review(uuid, text, integer, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_order_reviews(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_product_rating_stats() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_product_reviews(text, integer) TO anon, authenticated;

COMMIT;

-- PEMERIKSAAN (hanya membaca)
-- SELECT * FROM public.get_product_rating_stats();
-- SET ROLE anon; SELECT * FROM public.product_reviews; RESET ROLE;   -- harus ditolak (permission denied)
-- ROLLBACK manual: DROP FUNCTION public.submit_review(uuid,text,integer,text), public.get_order_reviews(uuid),
--   public.get_product_rating_stats(), public.get_product_reviews(text,integer); DROP TABLE public.product_reviews;
