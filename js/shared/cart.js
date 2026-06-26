// Shared cart state + the cart operations that were byte-for-byte identical
// between home.html and shop.html.
//
// NOTE: updateCartUI() and toggleCart() are intentionally NOT included here —
// their rendering/signature differ slightly between home.html and shop.html
// (home.html's cart sidebar does not render gift-set items the way shop.html's
// does, and shop.html's toggleCart() takes no forceOpen argument). Moving them
// would change existing behavior, so they remain inline on each page exactly
// as before. Those page-local functions call the shared helpers below.

var cart = window.CartService.loadCart();

function saveCart() {
  window.CartService.saveCart(cart);
}

function removeFromCartByIndex(idx) {
  cart.splice(idx, 1);
  saveCart();
  updateCartUI();
}

function changeQtyByIndex(idx, delta) {
  if (!cart[idx]) return;
  cart[idx].qty += delta;
  if (cart[idx].qty <= 0) cart.splice(idx, 1);
  saveCart();
  updateCartUI();
}

function goCheckout() {
  if (cart.length === 0) { alert('Your cart is empty!'); return; }
  window.location.href = 'checkout.html';
}
