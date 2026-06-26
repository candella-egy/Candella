# Debug Trace Map

When something breaks, start here. Each trace lists the exact files and
functions involved, in the order execution actually flows through them —
so you can jump straight to the right file instead of grepping the whole
project.

---

## Bug in Stock (wrong stock count, decrement/restore not happening)

```
Checkout (pages/checkout.html / js/pages/checkout.js)
  submitOrder() → saveAndShowSuccess()
→ Order inserted directly into Supabase `orders` table
→ StockService (js/services/stockService.js)
    window.CandellaStock.adjustProductStock(sb, item.id, qty, -1)
    window.CandellaStock.adjustCustomGiftStock(sb, giftItem, -1)
→ Supabase RPC
    adjust_product_stock(p_id, p_delta)        — regular products
    adjust_custom_gift_stock(p_candle_id, ...)  — gift-set items (stable-id path)
```

Cancel/restore path (same StockService, opposite direction, +1):

```
Track (js/pages/track.js: confirmCancelWithReason)
  or Dashboard (js/pages/dashboard.js: quickStatus / updateStatus)
→ orders.update({status:'cancelled'})
→ StockService.adjustProductStock(..., +1) / .adjustCustomGiftStock(..., +1)
→ Same Supabase RPCs as above, direction +1
```

**If stock numbers look wrong:** check `js/services/stockService.js` first —
it is the ONLY file allowed to call these two RPCs (confirmed: grep
`rpc('adjust_product_stock'` / `rpc('adjust_custom_gift_stock'` across the
whole repo — zero hits outside this file). If a page-level file seems to
be touching stock directly, that itself is the bug.

**If a gift-set item's stock isn't restoring:** check whether the cart/order
item actually carries `giftCandleId`/`giftContainerIds`/`giftAccessoryIds`.
If those are missing (only possible for orders placed before the stable-id
system existed), `adjustCustomGiftStock` falls through to the Legacy
Fallback branch (label-matching against `settings.customCosts`/`giftSet` —
see `js/services/stockService.js` lines ~271-368). That branch is
intentionally still present; do not assume it's the new path.

---

## Bug in Custom Gift (wrong price, wrong discount, item not added to cart)

```
custom.html (js/custom.js — builder UI, selection state)
→ CustomGiftService (js/services/customGiftService.js)
    calculateCustomGiftTotals({sizePrice, candlePrice, selectedContainers, selectedAccessories})
    → {subtotal, discountPct, discountAmount, finalTotal}
→ CartService (js/services/cartService.js)
    CartService.saveCart(cart)  — item shape includes giftCandleId/giftContainerIds/giftAccessoryIds
→ Checkout (js/pages/checkout.js)
    CartService.loadCart() reads the same shape back, unmodified
    renderSummaryItems() / recalcTotals() display it
    submitOrder() inserts it into `orders.items` as-is
```

**If the displayed price is wrong:** the only place the math can be wrong
is `customGiftService.js::calculateCustomGiftTotals()` — every consumer
(sticky bar, order summary, cart, checkout) calls this same function with
the same inputs. Check there first, not in the page files.

**If an item is missing `giftCandleId`/etc:** check `js/custom.js` around
lines 710-773 (`addCustomGiftToCart()` and the checkout-redirect builder)
— those are the only two places that construct a gift-set cart item.

---

## Bug in Order Status (status not updating, wrong badge, stuck "new")

```
Dashboard (js/pages/dashboard.js)
  quickStatus(id, newStatus) or updateStatus(id)
→ orders.update({status: newStatus}).eq('id', id)   — direct Supabase write, no service layer
→ if newStatus === 'cancelled': restoreStockForOrder(o) → StockService (see Stock trace above)
→ renderOrders() / updateStats() re-render from the in-memory `allOrders` array
```

Customer-facing status view:

```
Track (js/pages/track.js)
  trackOrder() → orders.select('*').eq('short_id', num)
→ Realtime subscription: sb.channel('track-order-'+num).on('postgres_changes', ...)
  re-fetches and re-renders automatically when Dashboard updates the row
```

**If status changes in Dashboard but Track doesn't reflect it:** the
realtime channel filter in `track.js` (`filter: 'short_id=eq.'+trackNum`)
is the first thing to check — if the subscription silently failed, polling
won't happen and the customer sees a stale status until they search again.

**There is no `OrderService` write path yet** — `orders.insert`/`.update`
are called directly from `checkout.js`, `track.js`, and `dashboard.js` with
slightly different field selections in each. This is a known architecture
gap (see `docs/services-map.md` → "Services that do NOT exist yet").

---

## Bug in IDs (duplicate ID, empty ID, candle/container/accessory not saving)

```
Home Editor (js/pages/homeEditor.js)
  saveCandles() / saveContShapes() / saveAccs()
→ auto-generates an id ONLY for items missing one (existing ids never touched)
→ StockService.validateCatalogBeforeSave(items)   — the one save-time gate
  if invalid: showToast('❌ ' + message); return;  — save is blocked, nothing written
→ if valid: window._fbSaveCandles/_fbSaveContainers/_fbSaveAccs → settings.giftSet upsert
```

**If a save silently fails or shows a validation error:** the message
comes verbatim from `StockService.validateCatalogBeforeSave()` — it will
say exactly which item has a duplicate or empty id. Don't look anywhere
else for the validation logic; there is only one gate.

The one-time migration tool (`runStockMigration()` /
`StockService.runCustomBuilderMigration`) has been removed — all candles,
containers, and accessories were already migrated, so the three `save*()`
functions above are now the only place ids get created.
