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

  // Previously duplicated identically in js/pages/home.js and
  // js/pages/shop.js — given the aggregated stats from the
  // get_order_item_stats() RPC (no customer data, anon-safe), returns the
  // Set of product ids tied at the highest total_qty. Pure data
  // transformation, no DOM, no page-specific follow-up here — each
  // caller still does its own follow-up actions after awaiting this.
  async function calculateBestSellerIds(sb) {
    var salesMap = {};
    const { data: stats, error } = await sb.rpc('get_order_item_stats');
    if (error) throw error;
    (stats || []).forEach(function (row) {
      if (!row.item_key || row.item_key.indexOf('name:') === 0) return; // gift sets have no product id — not eligible here
      salesMap[row.item_key] = Number(row.total_qty) || 0;
    });
    var maxQty = 0;
    Object.keys(salesMap).forEach(function (id) { if (salesMap[id] > maxQty) maxQty = salesMap[id]; });
    return new Set(Object.keys(salesMap).filter(function (id) { return salesMap[id] === maxQty && maxQty > 0; }));
  }

  // Previously duplicated identically in js/pages/dashboard.js and
  // js/pages/track.js — maps a raw `orders` table row to the common
  // camelCase shape both pages already built. Each page still adds its
  // own extra/renamed fields on top of this (dashboard: _id +
  // statusHistory + shortId/createdAt fallbacks it already had; track:
  // firestoreId) — that part stays at the call site, unchanged.
  // NOTE: shortId and createdAt are passed through bare here (no
  // fallback) because track.js's original never had one for either —
  // only dashboard.js did. Adding a fallback here would change track.js's
  // behavior, so each page keeps applying (or not applying) it itself,
  // exactly as before.
  function normalizeOrderRow(row) {
    return {
      shortId:       row.short_id,
      customer:      row.customer      || {},
      items:         row.items         || [],
      subtotal:      row.subtotal      || 0,
      discount:      row.discount      || 0,
      shipping:      row.shipping      || 0,
      total:         row.total         || 0,
      promoCode:     row.promo_code    || '',
      paymentMethod: row.payment_method || 'cash',
      status:        row.status        || 'new',
      cancelReason:  row.cancel_reason || '',
      createdAt:     row.created_at
    };
  }

  global.OrderService = {
    generateShortId: generateShortId,
    calculateBestSellerIds: calculateBestSellerIds,
    normalizeOrderRow: normalizeOrderRow
  };
})(window);
