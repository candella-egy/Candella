# Phase 1 Refactor — Backup / Change Report

Scope: extraction of duplicated Supabase initialization and a small set of
byte-for-byte identical helper functions into shared `js/` files.
No security architecture, auth flow, database schema, RLS, UI, or business
logic was changed. `custom.html` was touched **only** for the Supabase
initialization line, per explicit approval.

## Files created

| File | Purpose |
|---|---|
| `js/config/supabase.js` | Single source of `SUPABASE_URL` / `SUPABASE_ANON_KEY` + `window.createSupabaseClient()` factory |
| `js/shared/toast.js` | `showToast(msg, duration)` — shared toast notification |
| `js/shared/cart.js` | Shared `cart` array + `saveCart`, `removeFromCartByIndex`, `changeQtyByIndex`, `goCheckout` |
| `js/shared/nav.js` | Shared `openMenu`, `closeMenu` |
| `js/auth/adminAuth.js` | Shared `resolveAdminAccess(sb)`, `adminDirectLogin(sb, email, password)`, `adminLogout(sb)` |
| `BACKUP_REPORT.md` | This report |

## Files modified

| File | Change |
|---|---|
| `checkout.html` | Supabase init → `window.createSupabaseClient()` |
| `track.html` | Supabase init → `window.createSupabaseClient()` |
| `more.html` | Supabase init → `window.createSupabaseClient()` |
| `custom.html` | Supabase init → `window.createSupabaseClient()` (init only — no functions moved) |
| `dashboard.html` | Supabase init → `window.createSupabaseClient()`; `tempClient` (used in `submitPwModal`) → `window.createSupabaseClient()` |
| `products.html` | Supabase init → `window.createSupabaseClient()`; `login`, `logout`, `initAccess` rewritten to call `adminAuth.js` helpers |
| `home-editor.html` | Supabase init → `window.createSupabaseClient()`; `doLogin`, `doLogout`, `initAccess` rewritten to call `adminAuth.js` helpers |
| `home.html` | Supabase init → `window.createSupabaseClient()`; removed local `cart`/`saveCart`/`removeFromCartByIndex`/`changeQtyByIndex`/`goCheckout`/`showToast`/`openMenu`/`closeMenu` (now from shared files); `updateCartUI` and `toggleCart` (page-specific, unchanged) remain inline |
| `shop.html` | Same pattern as `home.html` |

## Functions moved

| Function | Source file(s) / line range (pre-edit) | Destination |
|---|---|---|
| Supabase `createClient` init (9 occurrences) | checkout.html:134-136, track.html:82-84, more.html:45-47, custom.html:788-790, dashboard.html:420-422 & 1225, home-editor.html:919-921, home.html:780-782, products.html:157-159, shop.html:307-309 | `js/config/supabase.js` |
| `showToast(msg)` | home.html:556-561, shop.html:275 | `js/shared/toast.js` (as `showToast(msg, duration)`) |
| `cart` (state), `saveCart()`, `removeFromCartByIndex(idx)`, `changeQtyByIndex(idx, delta)`, `goCheckout()` | home.html:517-518, 539-545, 552-555; shop.html:231-232, 270-271, 274 | `js/shared/cart.js` |
| `openMenu()`, `closeMenu()` | home.html:564-571, shop.html:278-279 | `js/shared/nav.js` |
| `login`/`doLogin` core (signIn + admins-table role check), `logout`/`doLogout` core (signOut + sessionStorage clear + redirect), `initAccess` core (token/session resolution) | products.html:177-274, home-editor.html:928-1008 | `js/auth/adminAuth.js` (`adminDirectLogin`, `adminLogout`, `resolveAdminAccess`) |

## NOT moved (left inline intentionally — behavior differs per page)

| Function | Files | Reason |
|---|---|---|
| `updateCartUI()` | home.html, shop.html | shop.html's version renders gift-set cart items (`c.isGiftSet`); home.html's does not. Merging would change behavior. |
| `toggleCart()` | home.html, shop.html | home.html's accepts an optional `forceOpen` argument; shop.html's does not. |
| `toggleNewShopDrop`, `toggleMoreDrop`, `toggleContactDrop` | home.html, shop.html | Not identical across pages / not duplicated elsewhere. |
| Per-page success/UI handling after login (`isRestrictedAdmin`, `catBtn` hide, `loadProducts()` calls vs `showEditor()`) | products.html, home-editor.html | Page-specific UI reactions; only the Supabase/session-resolution core was shared. |
| All of `dashboard.html`'s `login`/`logout`/`restoreSession`/`hasPermission`/`applyRoleVisibility`/`requirePassword` | dashboard.html | Structurally different (role + granular permissions system) from products.html/home-editor.html — not touched, per instruction not to modify the authentication architecture. |
| Everything in `custom.html` except the Supabase init line | custom.html | Explicitly restricted to init-only extraction. |

## Global dependencies introduced

- `window.createSupabaseClient()` — depends on the Supabase CDN script (`@supabase/supabase-js@2`) being loaded **before** `js/config/supabase.js` runs its first actual call (definition-time order doesn't matter; call-time does — preserved in all files).
- `window.showToast(msg, duration)` — depends on an element with `id="toast"` existing in the page (already required before this change).
- Global `cart` variable + `window.saveCart`-equivalent — depends on `localStorage` key `candella_cart` (unchanged), and on each page still defining its own `updateCartUI()` (called internally by `removeFromCartByIndex`/`changeQtyByIndex` in `cart.js`).
- `window.openMenu()` / `window.closeMenu()` — depend on `#sideMenu` / `#menuOverlay` elements (already required before this change).
- `window.resolveAdminAccess`, `window.adminDirectLogin`, `window.adminLogout` — depend on the `admins` Supabase table and `sessionStorage` keys `candella_admin_token` / `candella_admin_role` (unchanged, pre-existing dependency).

## Load order added to each modified `<head>`

```
<script src=".../supabase-js@2"></script>   (pre-existing)
<script src="js/config/supabase.js"></script>
[<script src="js/shared/toast.js"></script>]   (home.html, shop.html only)
[<script src="js/shared/cart.js"></script>]    (home.html, shop.html only)
[<script src="js/shared/nav.js"></script>]     (home.html, shop.html only)
[<script src="js/auth/adminAuth.js"></script>] (products.html, home-editor.html only)
```
