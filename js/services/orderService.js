// js/services/orderService.js
// Order-related helpers that don't touch the DOM. Moved out of
// checkout.html verbatim (same retry count, same fallback, same format).
//
// NOTE: building `orderData` itself (reading customer name/phone/address/etc.
// from form fields) and the actual submit/insert flow in checkout.html stay
// where they are for this pass — they're tightly coupled to DOM form fields
// and the success/error UI, so extracting them now would risk changing
// behavior. That's flagged as follow-up work, not done here.
(function (global) {

  // Generates a unique 4-digit order number by checking it doesn't already
  // exist in `orders`. Falls back to the last 4 digits of the current
  // timestamp if 20 random attempts all collide (extremely unlikely).
  async function generateShortId(sb) {
    for (var i = 0; i < 20; i++) {
      var c = String(Math.floor(1000 + Math.random() * 9000));
      try {
        const { data, error } = await sb.from('orders').select('id').eq('short_id', c);
        if (!error && (!data || data.length === 0)) return c;
      } catch (e) { return c; }
    }
    return String(Date.now()).slice(-4);
  }

  global.OrderService = {
    generateShortId: generateShortId
  };
})(window);
