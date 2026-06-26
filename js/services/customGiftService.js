// js/services/customGiftService.js
// Pure business logic for pricing a Custom Gift Set — no DOM access.
// Moved out of js/custom.js verbatim (same formulas, same field names,
// same DISC_TIERS thresholds/percentages, same console.log) — only the
// input is now passed in explicitly instead of reading custom.js's global
// `sel`/`_selectedContainers`/`_selectedAccessories` state directly, so
// this file has zero dependency on the page it's used from.
(function (global) {
  var DISC_TIERS = [
    { threshold: 500,  pct: 5  },
    { threshold: 700,  pct: 10 },
    { threshold: 1000, pct: 15 }
  ];

  // input: { sizePrice, candlePrice, selectedContainers: {id:{price,qty}}, selectedAccessories: {idx:{price}} }
  // returns: { subtotal, discountPct, discountAmount, finalTotal }
  function calculateCustomGiftTotals(input) {
    input = input || {};
    var selectedContainers = input.selectedContainers || {};
    var selectedAccessories = input.selectedAccessories || {};

    var contTotal = Object.values(selectedContainers).reduce(function(s,c){ return s + (c.price||0) * (c.qty||1); }, 0);
    var accTotal = Object.values(selectedAccessories).reduce(function(s,a){ return s + (a.price||0); }, 0);
    var subtotal = (input.sizePrice || 0) + (input.candlePrice || 0) + contTotal + accTotal;

    var discountPct = 0;
    for (var i = 0; i < DISC_TIERS.length; i++) {
      if (subtotal >= DISC_TIERS[i].threshold) discountPct = DISC_TIERS[i].pct;
    }
    var finalTotal = discountPct > 0 ? Math.round(subtotal * (1 - discountPct/100)) : subtotal;
    var discountAmount = subtotal - finalTotal;

    var result = { subtotal: subtotal, discountPct: discountPct, discountAmount: discountAmount, finalTotal: finalTotal };
    // TEMPORARY — remove once every surface (sticky bar / order summary /
    // cart / checkout) is confirmed showing identical numbers in production.
    console.log('[summary]', result);
    return result;
  }

  global.CustomGiftService = {
    DISC_TIERS: DISC_TIERS,
    calculateCustomGiftTotals: calculateCustomGiftTotals
  };
})(window);
