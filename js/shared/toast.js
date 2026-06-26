// Shared toast notification helper.
// Identical to the implementations previously duplicated in home.html, shop.html,
// and home-editor.html. Default duration matches home.html/shop.html (2500ms);
// home-editor.html used 2800ms and passes that explicitly at its call site.
function showToast(msg, duration) {
  var t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast show';
  setTimeout(function () { t.className = 'toast'; }, duration || 2500);
}
window.showToast = showToast;
