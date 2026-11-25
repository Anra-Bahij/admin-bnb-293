/* ==========================================================================
   BnB Cemilan — LOGIKA KERANJANG (tanpa UI)
   Bergantung pada data.js (PRODUCTS, VARIANT_GROUPS).
   Yang disimpan di Local Storage hanya {key, productId, optionId, qty};
   nama & harga selalu dibaca dari data.js, jadi perubahan harga langsung berlaku.
   ========================================================================== */

const formatRp = (n) => 'Rp' + Math.round(n).toLocaleString('id-ID');

const Catalog = {
  product(id) { return PRODUCTS.find((p) => p.id === id) || null; },
  // Daftar grup variasi milik produk: variantGroup: 'x' (satu grup) atau variantGroups: ['x', 'y'] (beberapa grup)
  groups(product) {
    if (!product) return [];
    const keys = product.variantGroups || (product.variantGroup ? [product.variantGroup] : []);
    return keys.map((item) => typeof item === 'string' ? VARIANT_GROUPS[item] : item).filter(Boolean);
  },
  group(product) { return Catalog.groups(product)[0] || null; },
  // Satu grup: optionId = id opsi. Beberapa grup: optionId = id opsi tiap grup digabung "+", mis. "goreng+pedas"
  option(product, optionId) {
    const gs = Catalog.groups(product);
    if (!gs.length) return null;
    if (gs.length === 1) return gs[0].options.find((o) => o.id === optionId) || null;
    const ids = String(optionId || '').split('+');
    if (ids.length !== gs.length) return null;
    const parts = gs.map((g, i) => g.options.find((o) => o.id === ids[i]) || null);
    if (parts.some((p) => !p)) return null;
    return {
      id: optionId,
      label: parts.map((p) => p.label).join(', '),
      price: product.price + parts.reduce((s, p) => s + (p.extra || 0), 0),
      parts
    };
  },
  unitPrice(product, option) { return option && typeof option.price === 'number' ? option.price : product.price; }
};

const Cart = (() => {
  const KEY = 'bnbcemilan_cart_v1';
  const listeners = [];
  let items = load();

  function makeKey(product, optionId) { return (product.sku || product.id) + ':' + (optionId || '-'); }

  function resolve(entry) {
    const product = Catalog.product(entry.productId);
    if (!product || product.isSold) return null;   // menu habis dikeluarkan dari keranjang
    const hasGroup = !!Catalog.group(product);
    const option = hasGroup ? Catalog.option(product, entry.optionId) : null;
    if (hasGroup && !option) return null;
    return { product, option };
  }

  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(KEY) || '[]');
      if (!Array.isArray(data)) return [];
      return data.filter((e) => e && Number.isInteger(e.qty) && e.qty > 0 && resolve(e));
    } catch (err) { return []; }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (err) { /* penyimpanan penuh / diblokir */ }
    listeners.forEach((fn) => fn());
  }

  function add(productId, optionId) {
    const product = Catalog.product(productId);
    if (!product || product.isSold) return false;
    const group = Catalog.group(product);
    if (group && !Catalog.option(product, optionId)) return false;   // variasi wajib
    const key = makeKey(product, group ? optionId : null);
    const found = items.find((i) => i.key === key);
    if (found) found.qty += 1;
    else items.push({ key, productId, optionId: group ? optionId : null, qty: 1 });
    save();
    return true;
  }

  function setQty(key, qty) {
    const idx = items.findIndex((i) => i.key === key);
    if (idx < 0) return;
    if (qty <= 0) items.splice(idx, 1); else items[idx].qty = qty;
    save();
  }

  function change(key, delta) {
    const it = items.find((i) => i.key === key);
    if (it) setQty(key, it.qty + delta);
  }

  function lines() {
    return items.map((e) => {
      const r = resolve(e);
      if (!r) return null;
      const { product, option } = r;
      const group = Catalog.group(product);
      const unitPrice = Catalog.unitPrice(product, option);
      const base = product.cartName || product.name;
      const name = option && group.asName ? option.label : base;
      const variantLabel = option && !group.asName ? option.label : '';
      // baseName & variantText dipakai untuk struk WhatsApp (variasi selalu ditulis terpisah dari nama produk)
      return { key: e.key, product, option, name, variantLabel, baseName: base, variantText: option ? option.label : '',
               unitPrice, qty: e.qty, subtotal: unitPrice * e.qty };
    }).filter(Boolean);
  }

  return {
    add,
    inc: (key) => change(key, 1),
    dec: (key) => change(key, -1),
    remove: (key) => setQty(key, 0),
    clear() { items = []; save(); },
    lines,
    count: () => items.reduce((s, i) => s + i.qty, 0),
    total: () => lines().reduce((s, l) => s + l.subtotal, 0),
    subscribe(fn) { listeners.push(fn); },
    _reload() { items = load(); }   // dipakai untuk pengujian
  };
})();
