# RLS Regression Report

Full audit of every workflow listed in the task, tracing each one against
the actual deployed policies (`docs/rls-policies.sql`, with the `::text`
cast fix already applied). **No policy was removed, disabled, weakened,
or widened in this pass.** One genuine application-code bug was found and
fixed; everything else traced clean.

## Summary of what was wrong

There are **two distinct, unrelated root causes** behind "admin login
fails" / "products and home editor have regressions" — easy to conflate
because they produce the same user-facing symptom, but they live in
different code and need different fixes.

1. **Already fixed in the previous pass**: the `text` vs `uuid` mismatch
   between `admins.id` and `auth.uid()`. This affected every direct
   admin login (dashboard.js's own sign-in flow). If the corrected SQL
   (with `::text` casts) has been run, this one is resolved — see
   Issue 1 below for the trace confirming why.
2. **New in this pass**: `js/auth/adminAuth.js`'s dashboard→home-editor/
   products **token relay never actually authenticates the database
   client with the relayed token** — it only validates the token's
   *existence*, then queries `admins` using a client that's still
   talking to Postgres as `anon`. This is a real, separate application
   bug, fixed in this pass (Issue 2 below).

---

## Issue 1 — Direct admin login (dashboard.js)

**File / function:** `js/pages/dashboard.js`, `window.login()` (and the
identical pattern in `restoreSession()`)

**Failing query:**
```js
const { data: adminRow, error: adminErr } = await sb
  .from('admins')
  .select('role, permissions')
  .eq('id', data.user.id)
  .single();
```

**Policy involved:** `admins_select_own` —
`USING (id = auth.uid()::text)` (post-fix; was `auth.uid()` with no cast
before the previous pass).

**Why it worked before RLS:** RLS was disabled entirely — `admins` had
no row-level restriction at all, so the query returned the row regardless
of any type mismatch in a policy that didn't exist yet.

**Why it failed right after RLS went on (before the `::text` fix):**
`admins.id` is `text`; `auth.uid()` returns `uuid`. Postgres has no
`text = uuid` operator, so the policy itself raised
`operator does not exist: text = uuid` — PostgREST surfaces that as a
query error, `adminErr` becomes truthy, and `dashboard.js` shows
*"This account is not authorized for admin access"* even for a real
admin. This is exactly the symptom reported.

**Fix applied:** none needed in *this* pass — already fixed in
`docs/rls-policies.sql` (the `::text` cast). **Confirming it's actually
correct now, not re-deriving it:** `sb` in `dashboard.js` is a single
client that calls `signInWithPassword()` directly on itself, which
properly establishes a real session — so once the cast is correct, the
subsequent `auth.uid()` resolves to the signed-in user's id as `uuid`,
cast to `text`, and matches `admins.id` correctly.

**Action required if this is still failing:** confirm the corrected SQL
(with `::text`) is the version that was actually run against the
database — re-deploying the same file twice is harmless (every statement
is `CREATE POLICY`, which would error "already exists" if so — if you see
that error, the fix is already live and this specific issue is resolved).

**Security impact:** none — no change made here, this section exists to
document why the issue is already covered.

---

## Issue 2 — Home Editor / Products pages via the dashboard token relay

**Files / functions:**
- `js/auth/adminAuth.js`, `resolveAdminAccess()` (the bug)
- `js/pages/homeEditor.js`, `js/pages/products.js` (top-of-file client
  creation — where the fix actually lands)

**How an employee reaches these pages:** per `adminAuth.js`'s own header
comment, anyone other than the super admin "must arrive via
dashboard.html, which stores an access token + role in sessionStorage
before redirecting here." `dashboard.js` stores only the **access token
string** (`sessionStorage.setItem('candella_admin_token', currentUserToken)`
— no refresh token, just the bearer string).

**Failing query (after navigating from the dashboard):**
```js
// js/auth/adminAuth.js, resolveAdminAccess()
const { data: userData } = await sb.auth.getUser(tokenFromDashboard); // ✅ succeeds
const { data: adminRow, error: adminErr } = await sb
  .from('admins')
  .select('role')
  .eq('id', userData.user.id)
  .single(); // ❌ fails under RLS
```

**Policy involved:** `admins_select_own` — `USING (id = auth.uid()::text)`.
The policy itself is correct (and was already proven correct in Issue 1).

**Root cause — this is the actual new bug:** `sb` on these two pages is
created with `window.createSupabaseClient()` — **no arguments** — before
`resolveAdminAccess()` is ever called. That factory (unmodified at the
time) always builds a plain anon-context client. Passing
`tokenFromDashboard` into `sb.auth.getUser(tokenFromDashboard)` validates
that the token is a real, currently-valid JWT (a stateless call to
Supabase's Auth API — it doesn't need the *client* to be authenticated to
verify someone else's token), **but it does not attach that token to the
client for any other request.** Every later query — including the
`.from('admins')` lookup two lines down, and every `products`/`settings`
query for the rest of the page's lifetime — still goes out with the
client's actual identity, which is anon (no session was ever established
on this particular client instance).

**Why it worked before RLS:** anon could read any row in `admins`
(no RLS at all), so the mismatch between "token says you're an admin" and
"the actual DB request is anon" never mattered — the query succeeded
regardless of which identity it was sent as.

**Why it fails now:** `admins_select_own` requires
`auth.uid()::text = id`. An anon request has no `auth.uid()` (it's
`NULL`), so the policy evaluates false, the SELECT returns zero rows,
`.single()` errors, and `resolveAdminAccess` throws `'Not an admin'` —
even though the employee genuinely is one. This is not a policy
bug — the policy is doing exactly what it's supposed to (only let an
*actually authenticated* matching user through). The bug is that the
client making the request was never actually authenticated as that user
in the first place.

**Fix applied (application code only):**

1. `js/config/supabase.js` — `createSupabaseClient()` now accepts an
   *optional* access-token argument. When provided, it's set as a static
   `Authorization: Bearer <token>` header on every request that client
   makes (`global.headers` option at client-creation time). When omitted
   — every other existing call site in the project — behavior is
   byte-for-byte unchanged.
2. `js/pages/homeEditor.js` and `js/pages/products.js` — changed
   `const sb = window.createSupabaseClient();` to
   `const sb = window.createSupabaseClient(sessionStorage.getItem('candella_admin_token'));`
   so that *if* a relayed token exists, this client is authenticated with
   it from the moment it's created — covering the admin check **and**
   every products/settings query the rest of the page makes, not just
   the first one. If no token exists (the super admin reaching the page
   directly and signing in with their own password right there), this
   evaluates to `createSupabaseClient(null)`, identical to before — the
   direct-login path was never broken and isn't touched by this fix.

**Security impact:**
- *Before this fix:* a legitimate admin was incorrectly denied access —
  a functional regression, not a security hole (RLS was, if anything,
  being too strict due to a code gap, not too loose).
- *After this fix:* the exact same token that `resolveAdminAccess()`
  already validates via `getUser()` is now also the one carrying every
  subsequent request's identity — no new capability is granted to
  anyone who doesn't already hold a valid, dashboard-issued admin token.
  No policy was changed; this only makes the application correctly
  *present* its existing, already-verified credential to the database.

---

## Verification — every workflow in the task, traced against current code + policy

| Workflow | Code path | RLS-relevant? | Status |
|---|---|---|---|
| **Admin login** (super, direct) | `dashboard.js login()` — own session via `signInWithPassword` | `admins_select_own` | ✅ Fixed in prior pass (`::text`); confirmed correct (Issue 1) |
| **Admin login** (via dashboard relay → Home Editor/Products) | `adminAuth.js resolveAdminAccess()` | `admins_select_own` | ✅ Fixed this pass (Issue 2) |
| **Dashboard access / order list** | `dashboard.js loadOrders()` — `.from('orders').select('*')` | `orders_public_read_by_anyone` (unconditional `USING(true)`) | ✅ Never depended on `admins` — unaffected by either bug |
| **Dashboard — employee permissions (list/edit/delete)** | `dashboard.js` lines 216/280/340 — same authenticated `sb` as login | `admins_select_all_for_super` / `admins_update_super_only` / `admins_delete_super_only` | ✅ Same client as Issue 1 — correct once `::text` is live |
| **Products CRUD** | `products.js` insert/update/delete/select on `products` | `products_admin_write` / `products_public_read` | ✅ Fixed this pass — `sb` now carries the relayed token when applicable (Issue 2 fix covers this directly, not just the login check) |
| **Settings CRUD (Home Editor)** | `homeEditor.js` — multiple `settings` upserts | `settings_admin_write` | ✅ Same fix as above |
| **Order tracking** | `track.js` — `.from('orders').select('*').eq('short_id', ...)`, always anon | `orders_public_read_by_anyone` | ✅ No admin auth involved at all — never affected |
| **Checkout** | `checkout.js` — insert with `status:'new'`, always anon | `orders_public_insert` | ✅ Unaffected — no admin context involved |
| **Stock updates** | `stockService.js` → `adjust_product_stock` / `adjust_custom_gift_stock` RPCs | Requires RPCs to be `SECURITY DEFINER` (verified/flagged in the prior pass, untouched here) | ✅ Unaffected by this pass — re-confirm the RPC security-definer check from the previous report if not already done |
| **Review submission** | `home.js` — `.from('reviews').insert(...)`, always anon | `reviews_public_insert` | ✅ Unaffected — no admin context involved |

## What was NOT changed (confirming compliance with the constraints)

- No `ALTER TABLE ... DISABLE ROW LEVEL SECURITY`.
- No `DROP POLICY` / no policy logic changed, widened, or removed.
- No new public/anon GRANTs added anywhere.
- No `SECURITY DEFINER` setting touched.
- `docs/rls-policies.sql` is unmodified by this pass — Issue 2 is purely
  an application-code fix in `js/config/supabase.js`, `js/pages/homeEditor.js`,
  and `js/pages/products.js`.

## Files modified this pass

`js/config/supabase.js`, `js/pages/homeEditor.js`, `js/pages/products.js`,
`docs/rls-regression-report.md` (new).
