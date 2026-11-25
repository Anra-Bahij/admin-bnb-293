-- =====================================================
-- BnB CEMILAN
-- DATABASE UTAMA
-- =====================================================

-- 1. TABEL PRODUK
CREATE TABLE IF NOT EXISTS public.products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    price INTEGER NOT NULL CHECK (price >= 0),
    variants JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TABEL PESANAN
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_name TEXT NOT NULL,
    class_code TEXT NOT NULL,
    pickup_method TEXT NOT NULL
        CHECK (pickup_method IN ('Ambil sendiri', 'Diantar')),
    note TEXT,
    items JSONB NOT NULL,
    subtotal INTEGER NOT NULL CHECK (subtotal >= 0),
    total INTEGER NOT NULL CHECK (total >= 0),
    status TEXT DEFAULT 'Baru',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. KOLOM TAMBAHAN PRODUK
-- Untuk mendukung cartName, SKU, dan grup variasi.

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS cart_name TEXT;

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS sku TEXT;

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS variant_groups JSONB
DEFAULT '[]'::jsonb;


-- =====================================================
-- 4. DATA PRODUK
-- =====================================================

INSERT INTO public.products
(id, name, category, description, price, cart_name, sku, variant_groups, is_active, sort_order)
VALUES

-- SERUNDENG
(
'srd-ayam-kecil',
'Ayam Serundeng Kecil (Paha/Dada)',
'serundeng',
'Ayam goreng taburan serundeng gurih. Pilih paha atau dada.',
10000,
'Ayam Serundeng Kecil',
NULL,
'[{"key":"bagianAyam","title":"Pilih Bagian Ayam","options":[{"id":"paha","label":"Paha","price":10000},{"id":"dada","label":"Dada","price":10000}]}]',
TRUE, 1
),

(
'srd-ayam-besar-paha',
'Ayam Serundeng Besar Paha',
'serundeng',
'Paha ayam ukuran besar dengan serundeng gurih.',
15000, NULL, NULL, '[]', TRUE, 2
),

(
'srd-ayam-besar-dada',
'Ayam Serundeng Besar Dada',
'serundeng',
'Dada ayam ukuran besar dengan serundeng gurih.',
16000, NULL, NULL, '[]', TRUE, 3
),

(
'srd-lele',
'Lele Serundeng',
'serundeng',
'Lele goreng renyah bertabur serundeng.',
10000, NULL, NULL, '[]', TRUE, 4
),

(
'srd-telur',
'Telur Dadar Serundeng',
'serundeng',
'Telur dadar dengan taburan serundeng.',
7000, NULL, NULL, '[]', TRUE, 5
),

(
'srd-ati',
'Ati Ampela Serundeng',
'serundeng',
'Ati ampela bumbu serundeng.',
7000, NULL, NULL, '[]', TRUE, 6
),

(
'srd-kepala',
'Kepala Ayam Serundeng',
'serundeng',
'Kepala ayam bumbu serundeng.',
7000, NULL, NULL, '[]', TRUE, 7
),

(
'srd-tahu',
'Tahu Serundeng',
'serundeng',
'Tahu goreng bertabur serundeng.',
2000, NULL, NULL, '[]', TRUE, 8
),

(
'srd-tempe',
'Tempe Goreng Serundeng',
'serundeng',
'Tempe goreng bertabur serundeng.',
2000, NULL, NULL, '[]', TRUE, 9
),

(
'srd-nasi',
'Nasi',
'serundeng',
'Pilih nasi putih, tutug oncom, atau daun jeruk.',
5000,
'Nasi',
'nasi',
'[{"key":"jenisNasi","title":"Pilih Jenis Nasi","asName":true,"options":[{"id":"putih","label":"Nasi Putih","price":5000},{"id":"tutug","label":"Nasi Tutug Oncom","price":5000},{"id":"jeruk","label":"Nasi Daun Jeruk","price":5000}]}]',
TRUE, 10
),

-- =====================================================
-- BUMBU KETUMBAR
-- =====================================================

(
'ktb-ayam-kecil',
'Ayam Ketumbar Kecil (Paha/Dada)',
'ketumbar',
'Ayam goreng bumbu ketumbar harum. Pilih paha atau dada.',
10000,
'Ayam Ketumbar Kecil',
NULL,
'[{"key":"bagianAyam","title":"Pilih Bagian Ayam","options":[{"id":"paha","label":"Paha","price":10000},{"id":"dada","label":"Dada","price":10000}]}]',
TRUE, 11
),

(
'ktb-ayam-besar-paha',
'Ayam Ketumbar Besar Paha',
'ketumbar',
'Paha ayam ukuran besar bumbu ketumbar.',
15000, NULL, NULL, '[]', TRUE, 12
),

(
'ktb-ayam-besar-dada',
'Ayam Ketumbar Besar Dada',
'ketumbar',
'Dada ayam ukuran besar bumbu ketumbar.',
16000, NULL, NULL, '[]', TRUE, 13
),

(
'ktb-lele',
'Lele Ketumbar',
'ketumbar',
'Lele goreng bumbu ketumbar.',
10000, NULL, NULL, '[]', TRUE, 14
),

(
'ktb-telur',
'Telur Dadar Ketumbar',
'ketumbar',
'Telur dadar bumbu ketumbar.',
7000, NULL, NULL, '[]', TRUE, 15
),

(
'ktb-ati',
'Ati Ampela Ketumbar',
'ketumbar',
'Ati ampela bumbu ketumbar.',
7000, NULL, NULL, '[]', TRUE, 16
),

(
'ktb-kepala',
'Kepala Ayam Ketumbar',
'ketumbar',
'Kepala ayam bumbu ketumbar.',
7000, NULL, NULL, '[]', TRUE, 17
),

(
'ktb-tahu',
'Tahu Goreng Ketumbar',
'ketumbar',
'Tahu goreng bumbu ketumbar.',
2000, NULL, NULL, '[]', TRUE, 18
),

(
'ktb-tempe',
'Tempe Goreng Ketumbar',
'ketumbar',
'Tempe goreng bumbu ketumbar.',
2000, NULL, NULL, '[]', TRUE, 19
),

(
'ktb-nasi',
'Nasi',
'ketumbar',
'Pilih nasi putih, tutug oncom, atau daun jeruk.',
5000,
'Nasi',
'nasi',
'[{"key":"jenisNasi","title":"Pilih Jenis Nasi","asName":true,"options":[{"id":"putih","label":"Nasi Putih","price":5000},{"id":"tutug","label":"Nasi Tutug Oncom","price":5000},{"id":"jeruk","label":"Nasi Daun Jeruk","price":5000}]}]',
TRUE, 20
),

-- =====================================================
-- BAKAR-BAKARAN
-- =====================================================

(
'bkr-ayam-kecil',
'Ayam Bakar Kecil (Paha/Dada)',
'bakar',
'Ayam bakar bumbu khas. Pilih paha atau dada.',
10000,
'Ayam Bakar Kecil',
NULL,
'[{"key":"bagianAyam","title":"Pilih Bagian Ayam","options":[{"id":"paha","label":"Paha","price":10000},{"id":"dada","label":"Dada","price":10000}]}]',
TRUE, 21
),

(
'bkr-ayam-besar-paha',
'Ayam Bakar Besar Paha',
'bakar',
'Paha ayam ukuran besar, dibakar harum.',
15000, NULL, NULL, '[]', TRUE, 22
),

(
'bkr-ayam-besar-dada',
'Ayam Bakar Besar Dada',
'bakar',
'Dada ayam ukuran besar, dibakar harum.',
16000, NULL, NULL, '[]', TRUE, 23
),

(
'bkr-telur',
'Telur Dadar Bakar',
'bakar',
'Telur dadar versi bakar.',
7000, NULL, NULL, '[]', TRUE, 24
),

(
'bkr-tahu',
'Tahu Bakar',
'bakar',
'Tahu dibakar dengan bumbu.',
2000, NULL, NULL, '[]', TRUE, 25
),

(
'bkr-tempe',
'Tempe Bakar',
'bakar',
'Tempe dibakar dengan bumbu.',
2000, NULL, NULL, '[]', TRUE, 26
),

(
'bkr-nasi',
'Nasi',
'bakar',
'Pilih nasi putih, tutug oncom, atau daun jeruk.',
5000,
'Nasi',
'nasi',
'[{"key":"jenisNasi","title":"Pilih Jenis Nasi","asName":true,"options":[{"id":"putih","label":"Nasi Putih","price":5000},{"id":"tutug","label":"Nasi Tutug Oncom","price":5000},{"id":"jeruk","label":"Nasi Daun Jeruk","price":5000}]}]',
TRUE, 27
),

-- =====================================================
-- SPECIAL
-- Harga mengikuti data.js terakhir: Rp10.000
-- =====================================================

(
'spc-nasi-goreng',
'Nasi Goreng Special',
'special',
'Toping: ayam, telur, bakso, sosis, acar, kerupuk',
10000, NULL, NULL, '[]', TRUE, 28
),

(
'spc-mie',
'Mie Goreng/Kuah Special',
'special',
'Toping: ayam, telur, bakso, sosis, acar, kerupuk',
10000,
'Mie Special',
NULL,
'[{"key":"masakan","title":"Jenis Masakan","options":[{"id":"goreng","label":"Goreng"},{"id":"kuah","label":"Kuah"}]},{"key":"kepedasan","title":"Tingkat Kepedasan","options":[{"id":"tidak-pedas","label":"Tidak Pedas"},{"id":"sedang","label":"Sedang"},{"id":"pedas","label":"Pedas"}]}]',
TRUE, 29
),

(
'spc-kwetiau',
'Kwetiau Goreng/Kuah Special',
'special',
'Toping: ayam, telur, bakso, sosis, acar, kerupuk',
10000,
'Kwetiau Special',
NULL,
'[{"key":"masakan","title":"Jenis Masakan","options":[{"id":"goreng","label":"Goreng"},{"id":"kuah","label":"Kuah"}]},{"key":"kepedasan","title":"Tingkat Kepedasan","options":[{"id":"tidak-pedas","label":"Tidak Pedas"},{"id":"sedang","label":"Sedang"},{"id":"pedas","label":"Pedas"}]}]',
TRUE, 30
),

(
'spc-bihun',
'Bihun Goreng/Kuah Special',
'special',
'Toping: ayam, telur, bakso, sosis, acar, kerupuk',
10000,
'Bihun Special',
NULL,
'[{"key":"masakan","title":"Jenis Masakan","options":[{"id":"goreng","label":"Goreng"},{"id":"kuah","label":"Kuah"}]},{"key":"kepedasan","title":"Tingkat Kepedasan","options":[{"id":"tidak-pedas","label":"Tidak Pedas"},{"id":"sedang","label":"Sedang"},{"id":"pedas","label":"Pedas"}]}]',
TRUE, 31
),

-- =====================================================
-- CAMILAN
-- =====================================================

(
'cml-burger',
'Burger Beef Slice',
'camilan',
'Burger dengan isian beef slice yang lezat.',
8000, NULL, NULL, '[]', TRUE, 32
),

(
'cml-hotdog',
'Hotdog',
'camilan',
'Roti hotdog dengan isian sosis.',
8000, NULL, NULL, '[]', TRUE, 33
),

(
'cml-sosis-jumbo',
'Sosis Bakar Jumbo',
'camilan',
'Sosis jumbo yang dibakar dengan bumbu.',
8000, NULL, NULL, '[]', TRUE, 34
),

(
'cml-sostel',
'Sostel',
'camilan',
'Sosis telur yang gurih dan nikmat.',
8000, NULL, NULL, '[]', TRUE, 35
),

(
'cml-kentang',
'Kentang Goreng',
'camilan',
'Kentang goreng renyah.',
8000, NULL, NULL, '[]', TRUE, 36
),

(
'cml-cireng',
'Cireng Bumbu Rujak',
'camilan',
'Cireng gurih dengan bumbu rujak.',
8000, NULL, NULL, '[]', TRUE, 37
),

(
'cml-roti-coklat',
'Roti Goreng Coklat',
'camilan',
'Roti goreng dengan isian cokelat.',
8000, NULL, NULL, '[]', TRUE, 38
),

(
'cml-donat',
'Donat Kentang Gula Halus',
'camilan',
'Donat kentang dengan taburan gula halus.',
8000, NULL, NULL, '[]', TRUE, 39
)

-- Dijalankan ulang tidak menimpa menu yang sudah diedit lewat halaman admin.
ON CONFLICT (id) DO NOTHING;


-- =====================================================
-- 5. KEAMANAN DATABASE
-- =====================================================

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view active products"
ON public.products;

CREATE POLICY "Public can view active products"
ON public.products
FOR SELECT
TO anon, authenticated
USING (is_active = TRUE);

DROP POLICY IF EXISTS "Public can create orders"
ON public.orders;

CREATE POLICY "Public can create orders"
ON public.orders
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

GRANT SELECT ON public.products TO anon, authenticated;
GRANT INSERT ON public.orders TO anon, authenticated;


-- =====================================================
-- 6. PEMBARUAN V2: STATUS "BELUM TERSEDIA" + JENIS MENU
-- =====================================================

-- ===== Tambahan v2: status "belum tersedia" + jenis menu (kategori) dari database =====
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_sold BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '🍽️',
  color TEXT NOT NULL DEFAULT '#556B2F',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.categories (id, name, emoji, color, sort_order) VALUES
  ('serundeng', 'Serundeng',      '🍚', '#556B2F', 1),
  ('ketumbar',  'Bumbu Ketumbar', '🌿', '#8B5E3C', 2),
  ('bakar',     'Bakar-bakaran',  '🔥', '#D97706', 3),
  ('special',   'Special',        '🍛', '#556B2F', 4),
  ('camilan',   'Camilan',        '🍟', '#D97706', 5)
ON CONFLICT (id) DO NOTHING;

-- Kategori yang sudah dipakai produk tetapi belum ada di tabel categories ikut dibuat.
INSERT INTO public.categories (id, name, sort_order)
SELECT DISTINCT p.category::text, initcap(p.category::text), 100
FROM public.products p
WHERE p.category IS NOT NULL
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view active categories" ON public.categories;
CREATE POLICY "Public can view active categories"
  ON public.categories
  FOR SELECT
  TO anon, authenticated
  USING (is_active = TRUE);
GRANT SELECT ON public.categories TO anon, authenticated;


-- =====================================================
-- 7. PEMERIKSAAN DATA
-- =====================================================

SELECT
    category,
    COUNT(*) AS jumlah_produk
FROM public.products
WHERE is_active = TRUE
GROUP BY category
ORDER BY MIN(sort_order);

SELECT
    id,
    name,
    category,
    price,
    is_active
FROM public.products
ORDER BY sort_order;