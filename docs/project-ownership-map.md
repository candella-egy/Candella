# Project Ownership Map

Which page owns which JS file, and which Services that file calls into.
Generated as part of the architecture-hardening pass — keep this updated
whenever a page's script file or its service dependencies change.

---

**Home**
`pages/home.html`
→ `js/pages/home.js`
→ `js/shared/cart.js` (wraps `CartService`)
→ `js/shared/toast.js`, `js/shared/nav.js`
→ No direct Service calls inside `home.js` itself — cart reads/writes go
  through the shared `cart`/`saveCart` globals from `js/shared/cart.js`,
  which themselves call `window.CartService.loadCart/saveCart`.

**Shop**
`pages/shop.html`
→ `js/pages/shop.js`
→ `js/shared/cart.js` (wraps `CartService`)
→ `js/shared/toast.js`, `js/shared/nav.js`
→ Same indirect `CartService` usage pattern as Home.

**Custom Builder**
`pages/custom.html`
→ `js/custom.js` (pre-existing, externalized before this phase — kept in
  `js/`, not renamed into `js/pages/` per this phase's "no extra refactor"
  rule)
→ `js/pages/custom.js` (the one inline block that remained directly in
  `custom.html` — Supabase gift-set settings loader only)
→ `CartService` (load/save cart)
→ `CustomGiftService` (`calculateCustomGiftTotals`, `DISC_TIERS`)
→ `CandellaStock` (`logInventoryHealth` on page load)

**Checkout**
`pages/checkout.html`
→ `js/pages/checkout.js`
→ `CartService` (`loadCart`, `clearCart`)
→ `OrderService` (`generateShortId`)
→ `CandellaStock` (`adjustProductStock`, `adjustCustomGiftStock`, `validateStock`)

**Track**
`pages/track.html`
→ `js/pages/track.js`
→ `CandellaStock` (`adjustProductStock`, `adjustCustomGiftStock`) — restore-on-cancel only

**More**
`pages/more.html`
→ `js/pages/more.js`
→ No Services — reads `settings.morePages` directly via Supabase

**Dashboard**
`pages/dashboard.html`
→ `js/pages/dashboard.js`
→ `CandellaStock` (`adjustProductStock`, `adjustCustomGiftStock`) — restore-on-cancel for admin order management
→ Reads `orders`/`products`/`admins` tables directly (no Order/Product service layer exists yet — see services-map.md)

**Products (Admin)**
`pages/products.html`
→ `js/pages/products.js`
→ No Services — reads/writes `products` table and `settings.giftSet` (cost/stock fields only) directly

**Home Editor (Admin)**
`pages/home-editor.html`
→ `js/pages/homeEditor.js`
→ `CandellaStock` (`slug`, `validateCatalogBeforeSave`, `checkCatalogIntegrity`)
→ Loaded as a **classic script** (not a module) on purpose — see the
  warning comment at the top of `homeEditor.js`: dynamically-rendered
  table rows mutate bare globals like `sizesData[i].label=this.value`
  directly from `onchange=""`, which requires real (non-module) globals.

---

## Pages with no JS file of their own (out of this phase's scope)

None remaining — every page now has either an external `js/pages/*.js`
file or (for Custom Builder) an external `js/custom.js` plus a small
`js/pages/custom.js` for the one leftover inline block.
