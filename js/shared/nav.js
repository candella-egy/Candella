// Shared side-menu open/close, identical in home.html and shop.html.
// Dropdown toggles (toggleNewShopDrop, toggleMoreDrop, toggleContactDrop) are
// page-specific and remain inline — not duplicated identically across pages.

function openMenu() {
  document.getElementById('sideMenu').classList.add('open');
  document.getElementById('menuOverlay').classList.add('show');
}

function closeMenu() {
  document.getElementById('sideMenu').classList.remove('open');
  document.getElementById('menuOverlay').classList.remove('show');
}
