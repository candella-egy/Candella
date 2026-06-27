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
