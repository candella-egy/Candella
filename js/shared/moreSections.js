// js/shared/moreSections.js
// Shared default data for the "More" page's section list. Identical to
// the arrays previously duplicated in js/pages/home.js, js/pages/shop.js,
// js/pages/homeEditor.js (as DEFAULT_MORE_SECTIONS) and js/pages/more.js
// (as DEFAULT_SECTIONS) — extracted verbatim, same keys/labels/order.
// Used as the fallback whenever settings.morePages._meta.sections hasn't
// been customized yet.
var DEFAULT_MORE_SECTIONS = [
  { key: 'why_candella',  label: 'Why Candella?' },
  { key: 'about_scents',  label: 'About Candella Scents' },
  { key: 'blog',          label: 'Blog' },
  { key: 'wholesale',     label: 'Wholesale' },
  { key: 'how_much',      label: 'How Much Candella Do I Need?' },
  { key: 'about_us',      label: 'About Us' },
  { key: 'plant_based',   label: 'Plant-Based Candles' },
  { key: 'refillable',    label: 'Refillable, Reusable Candles' },
  { key: 'instructions',  label: 'Instructions' },
  { key: 'press',         label: 'Press' },
];
window.DEFAULT_MORE_SECTIONS = DEFAULT_MORE_SECTIONS;

// Previously duplicated identically (same query, same _meta.sections
// fallback check) in js/pages/home.js, js/pages/shop.js,
// js/pages/homeEditor.js, and js/pages/more.js. Returns both the raw
// settings value (homeEditor.js/more.js need the full morePages content,
// not just the section list) and the resolved sections array — un-sliced,
// so each caller keeps deciding for itself whether to copy the array
// before mutating it, exactly as each one did before this extraction.
async function fetchMoreSections(sb) {
  const { data: row, error } = await sb.from('settings').select('value').eq('key', 'morePages').maybeSingle();
  if (error) throw error;
  var value = (row && row.value) ? row.value : {};
  var sections = (value._meta && Array.isArray(value._meta.sections) && value._meta.sections.length)
    ? value._meta.sections : window.DEFAULT_MORE_SECTIONS;
  return { value: value, sections: sections };
}
window.fetchMoreSections = fetchMoreSections;
