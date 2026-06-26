# Services Ownership Map

What each shared service in `js/services/` is responsible for, its full
public API, and every page that currently calls into it. If you're adding
new logic and it fits one of these responsibilities, put it here instead
of inline in a page — that's the whole point of this layer.

---

## CartService — `js/services/cartService.js`

**Responsibility:** single place that touches `localStorage` for the cart.
No DOM, no business rules.

- `loadCart()` — reads `candella_cart` from localStorage, returns parsed array (or `[]`)
- `saveCart(cart)` — writes the cart array back to localStorage
- `clearCart()` — removes the cart key entirely (after a successful order)

**Used by:**
- `js/shared/cart.js` (wraps it — `home.js`, `shop.js`, `track.js` all go through this wrapper, not CartService directly)
- `js/custom.js` (Custom Builder reads/writes the cart directly)
- `js/pages/checkout.js` (`loadCart` on page load, `clearCart` after order success)

---

## OrderService — `js/services/orderService.js`

**Responsibility:** order-number generation. Does NOT build the order
object itself or perform the insert — that logic intentionally stays in
`checkout.js` (tightly coupled to form fields and the success UI).

- `generateShortId(sb)` — generates a unique 4-digit order number, retries up to 20 times on collision, falls back to a timestamp-derived digit string

**Used by:**
- `js/pages/checkout.js` (`submitOrder()` → `generateShortId()`)

---

## StockService (`window.CandellaStock`) — `js/services/stockService.js`

**Responsibility:** the ONLY place that decrements, restores, validates,
or migrates stock for both regular products and Custom Gift Builder
items. Organized internally into 4 sections: Validation Logic, Custom
Builder Stock, Migration Logic, Regular Product Stock.

- `slug(s)` — string → id-safe slug
- `findCandle/findContainer/findAccessory(giftData, id)` — id-based lookups
- `buildInventoryIndex(giftData)` — O(1) lookup maps by id
- `checkCatalogIntegrity(giftData)` — scans for missing/empty/duplicate ids
- `validateCatalogBeforeSave(items)` — the one save-time gate (duplicate/empty id check)
- `logInventoryHealth(giftData)` — one-time console summary
- `validateStock(giftData, giftItem)` — pre-checkout/pre-selection stock check
- `adjustCustomGiftStock(sb, giftItem, direction)` — stock decrement/restore for gift-set items (stable-id RPC path + legacy label-matching fallback — see Legacy Fallback section in the architecture report)
- `adjustProductStock(sb, productId, qty, direction)` — stock decrement/restore for regular products (atomic RPC)

**Used by:**
- `js/pages/checkout.js` — decrement on order submit, validate before insert
- `js/pages/track.js` — restore on customer-initiated cancel
- `js/pages/dashboard.js` — restore on admin-initiated cancel
- `js/pages/homeEditor.js` — `slug`, `validateCatalogBeforeSave`, `checkCatalogIntegrity`
- `js/custom.js` — `logInventoryHealth` on page load

> The one-time migration tool (`runCustomBuilderMigration`) was removed
> after confirming all candles/containers/accessories were already
> migrated and no active workflow depended on it.
- `js/pages/products.js` — referenced in comments only (no direct call; cost/stock edits there go straight through `settings.giftSet`, not through this service — see Architecture Risks in the final report)

---

## CustomGiftService — `js/services/customGiftService.js`

**Responsibility:** the single source of truth for Custom Gift Builder
pricing math. One function, one shape, used identically everywhere a
gift-set total is shown or calculated.

- `DISC_TIERS` — the volume-discount threshold/percentage table
- `calculateCustomGiftTotals(input)` — takes `{sizePrice, candlePrice, selectedContainers, selectedAccessories}`, returns `{subtotal, discountPct, discountAmount, finalTotal}`

**Used by:**
- `js/custom.js` — sticky bar, order summary, cart-add, checkout-redirect — every gift-set total in the builder

---

## Services that do NOT exist yet (candidates, not built)

These were flagged as future refactors in prior phases — listed here so
the gap is documented, not because they exist:

- **OrderRepository / OrderService extension** — `orders.insert/update/select`
  is currently duplicated (with slightly different field selections) across
  `checkout.js`, `track.js`, and `dashboard.js`.
- **UploadService** (Cloudinary) — duplicated upload logic between `home.js`
  and `homeEditor.js`.
- **ExportService** (Excel/xlsx helpers) — `xlsxStyle()` and friends live
  only inside `dashboard.js`.
