// js/shared/domUtils.js
// Shared DOM-safety helper. Identical to the implementations previously
// duplicated in js/pages/dashboard.js and js/pages/track.js — extracted
// verbatim (same escape set, same null-handling), no behavior change.
//
// Customer-submitted free-text fields (name/address/notes from the
// checkout form) get rendered into innerHTML on the dashboard and track
// pages. Without escaping, an order containing e.g. <img src=x
// onerror=...> in its name field would execute in the viewer's browser —
// escape before display, every time.
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
window.escapeHtml = escapeHtml;
