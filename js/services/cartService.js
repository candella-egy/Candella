// js/services/cartService.js
// Single place that touches localStorage for the cart. Every page that used
// to read/write `localStorage.candella_cart` directly (js/shared/cart.js,
// js/custom.js, checkout.html) now goes through this instead — same key,
// same JSON shape, same behavior. No DOM, no business rules changed here.
(function (global) {
  var CART_KEY = 'candella_cart';

  function loadCart() {
    return JSON.parse(localStorage.getItem(CART_KEY) || '[]');
  }

  function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }

  function clearCart() {
    localStorage.removeItem(CART_KEY);
  }

  global.CartService = {
    loadCart: loadCart,
    saveCart: saveCart,
    clearCart: clearCart
  };
})(window);
