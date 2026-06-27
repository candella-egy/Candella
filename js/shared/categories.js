// js/shared/categories.js
// Shared default data + loader for the product category list. Identical
// to the data previously duplicated in js/pages/home.js, js/pages/shop.js,
// and js/pages/homeEditor.js (inlined there, no named constant) — same
// keys/labels/order.
//
// js/pages/products.js intentionally does NOT use DEFAULT_CATEGORIES —
// its admin dropdown uses its own emoji-prefixed labels for visual
// distinction, which is a deliberate UI difference, not a duplicate to
// merge. It still uses fetchCategories() below (passing its own array as
// the fallback override), so the read+fallback *logic* is unified while
// its visual output stays exactly as it was.
var DEFAULT_CATEGORIES = [
  { key: 'candles',    label: 'Scented Candles' },
  { key: 'unscented',  label: 'Unscented' },
  { key: 'containers', label: 'Containers & Accessories' },
  { key: 'offers',     label: 'Limited Edition' }
];
window.DEFAULT_CATEGORIES = DEFAULT_CATEGORIES;

// Previously duplicated identically (same query, same "is row.value.list
// valid?" check) in home.js, shop.js, and homeEditor.js. `fallback` is
// optional — defaults to DEFAULT_CATEGORIES above; products.js passes its
// own emoji-labeled array instead so its dropdown is unaffected.
async function fetchCategories(sb, fallback) {
  var fallbackList = fallback || window.DEFAULT_CATEGORIES;
  const { data: row, error } = await sb.from('settings').select('value').eq('key', 'categories').maybeSingle();
  if (error) throw error;
  return (row && row.value && row.value.list && row.value.list.length > 0)
    ? row.value.list : fallbackList;
}
window.fetchCategories = fetchCategories;
