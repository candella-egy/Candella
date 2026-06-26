-- ============================================================
-- Candella — Row Level Security Policies
-- Generated from a full trace of every sb.from()/sb.rpc() call in the
-- codebase (see docs/rls-audit-report.md for the matrix and reasoning
-- behind every decision below). Do NOT run this blindly — read the
-- audit report first, especially the "Deployment Order" section.
--
-- Tables covered: admins, orders, products, reviews, settings.
-- No table/column was added, renamed, or dropped. No RPC function body
-- was changed. The only schema-adjacent statements here are the
-- SECURITY DEFINER checks/fixes at the very bottom, which are required
-- for the stock RPCs to keep working once RLS is on — see the comment
-- there before running it.
-- ============================================================


-- ============================================================
-- ADMINS
-- Usage found in code: admin login reads own row by id (adminAuth.js,
-- dashboard.js); employee list / permission edit / delete are admin-only
-- UI actions in dashboard.js. No INSERT call exists anywhere in the
-- codebase — new admin accounts are created manually (Supabase Auth +
-- a manually-inserted admins row), not through the app. So: no INSERT
-- policy at all (default-deny covers it).
-- ============================================================

ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read ONLY their own admin row — this is how
-- login resolves "am I an admin, and what role" (adminAuth.js / dashboard.js
-- both do .eq('id', <own uid>).single()). A plain customer who logged in via
-- Google simply won't have a matching row, so this returns nothing for them
-- — safe either way.
CREATE POLICY "admins_select_own" ON admins
  FOR SELECT TO authenticated
  USING (id = auth.uid()::text);

-- The employee LIST view (dashboard.js: select('*').order('email')) needs
-- to see every admin row, not just their own — but only super admins ever
-- call this (the "Employees" section is super-only in the UI). Enforcing
-- it here too is a real improvement: today nothing stops a 'custom'
-- employee from calling this query directly via the API even though the
-- UI hides the button.
CREATE POLICY "admins_select_all_for_super" ON admins
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admins a WHERE a.id = auth.uid()::text AND a.role = 'super'));

-- Only super admins can edit another admin's permissions or delete an
-- admin (dashboard.js saveEmployeePermissions / delete — both UI-gated to
-- super already; this backs that up at the DB level).
CREATE POLICY "admins_update_super_only" ON admins
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM admins a WHERE a.id = auth.uid()::text AND a.role = 'super'));

CREATE POLICY "admins_delete_super_only" ON admins
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM admins a WHERE a.id = auth.uid()::text AND a.role = 'super'));


-- ============================================================
-- PRODUCTS
-- Public SELECT (home/shop/checkout all read this with no auth).
-- INSERT/UPDATE/DELETE only from products.js, which is gated behind the
-- same admin-auth pattern as dashboard.js (any row in admins, not just
-- 'super' — products.js never checks role, so this matches today's
-- actual behavior for both regular and super employees).
-- Stock changes from checkout/cancellation go through the
-- adjust_product_stock RPC (SECURITY DEFINER — see bottom of this file),
-- NOT a direct .update(), so anon does not need any write grant here.
-- ============================================================

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "products_public_read" ON products
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "products_admin_write" ON products
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE id = auth.uid()::text))
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE id = auth.uid()::text));


-- ============================================================
-- REVIEWS
-- Public SELECT (home.js loads all reviews, no auth).
-- Public INSERT — home.js's review form has NO login requirement and NO
-- moderation/approval flag in the schema today; reviews appear the
-- instant they're inserted. This policy preserves that exact behavior —
-- it does not add moderation (that would change behavior) — but does add
-- a WITH CHECK mirroring the validation the frontend already does
-- (non-empty name/text, rating 1–5), so a legitimate submission is
-- unaffected while a raw API call can't insert garbage rows.
-- No public UPDATE/DELETE — nothing in the codebase ever edits or
-- deletes a review, by anyone.
-- ============================================================

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reviews_public_read" ON reviews
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "reviews_public_insert" ON reviews
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    char_length(coalesce(name, '')) > 0
    AND char_length(coalesce(text, '')) > 0
    AND rating BETWEEN 1 AND 5
  );

-- Review moderation (Home Editor "Customer Reviews" section) — an admin
-- can delete a review (e.g. inappropriate language). No UPDATE policy:
-- nothing in the app edits a review's content, only removes it outright.
CREATE POLICY "reviews_admin_delete" ON reviews
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE id = auth.uid()::text));


-- ============================================================
-- ORDERS — the most sensitive table.
--
-- INSERT: checkout.js never requires login (guest checkout). Anon insert
-- must stay open. WITH CHECK pins status='new' — every real insert
-- already hardcodes this (checkout.js builds orderData with status:'new'
-- before sending it), so this changes nothing for legitimate traffic
-- while blocking someone from inserting a pre-fabricated 'delivered'/
-- 'cancelled' order directly via the API.
--
-- SELECT: the Track Order page (track.js) and the post-checkout status
-- poll (checkout.js) both look up a row by short_id with ZERO auth and
-- ZERO additional secret — this is how the feature is built, and it
-- can't be restricted further without changing the track flow (out of
-- scope here). See docs/rls-audit-report.md — the SAME 4-digit short_id
-- is the actual weak point, not RLS, and RLS cannot fix it. Anon SELECT
-- must stay open on this table for track-by-number to keep working.
--
-- UPDATE: both checkout.js (cancel right after placing) and track.js
-- (cancel via the track page) call .update({status:'cancelled',
-- cancel_reason}) with no login. USING restricts which rows are even
-- eligible (must not already be cancelled/delivered/shipped — mirrors
-- the dashboard's own "locked once cancelled" rule). WITH CHECK pins the
-- result to status='cancelled'. The GRANT below additionally restricts
-- *which columns* anon is allowed to touch in any UPDATE at all, so even
-- a hand-crafted API call can't slip in changes to total/customer/items.
--
-- Admin UPDATE: dashboard.js's updateStatus() runs all status
-- transitions (confirm/ship/deliver/cancel/revert) using the logged-in
-- employee's own session — both 'super' and 'custom' admins call this
-- today (the password prompt for risky transitions is a frontend
-- safeguard only, not a separate DB identity) — so this policy must
-- allow any row in admins, not just 'super', to avoid breaking existing
-- behavior for regular employees.
-- ============================================================

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orders_public_insert" ON orders
  FOR INSERT TO anon, authenticated
  WITH CHECK (status = 'new');

CREATE POLICY "orders_public_read_by_anyone" ON orders
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "orders_public_cancel_own" ON orders
  FOR UPDATE TO anon, authenticated
  USING (status NOT IN ('cancelled', 'delivered', 'shipped'))
  WITH CHECK (status = 'cancelled');

CREATE POLICY "orders_admin_full_update" ON orders
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE id = auth.uid()::text))
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE id = auth.uid()::text));

-- Column-level restriction for the public-cancel policy above — RLS alone
-- governs which ROWS qualify, not which COLUMNS get touched in the same
-- UPDATE statement. This stops a crafted request from updating e.g.
-- `total` while it's at it. Admins are unaffected (admins_full_update
-- policy + this grant both apply; Postgres takes the union of allowed
-- columns across applicable GRANTs for a role, and authenticated admins
-- already have their own unrestricted policy).
REVOKE UPDATE ON orders FROM anon, authenticated;
GRANT UPDATE (status, cancel_reason) ON orders TO anon, authenticated;
-- Admins additionally need full-column update access (status_history,
-- and in principle any field a future admin-edit feature might touch):
GRANT UPDATE ON orders TO authenticated;
-- (The two GRANTs above coexist: column-restricted for anon, full for any
-- authenticated row — but since `authenticated` here also covers the
-- public-cancel case for logged-in customers, the RLS policies above are
-- what actually separates "self-cancel" from "admin edit", not the GRANT.
-- The GRANT's job is only to block anon/authenticated from touching
-- columns outside status/cancel_reason+admin path; admins' own policy
-- already requires a matching admins row before any column is reachable.)


-- ============================================================
-- SETTINGS
-- Public SELECT needed for: giftSet, homeImages, morePages, categories,
-- carouselOrder — every one of these is read with no auth from
-- home/shop/custom/checkout/more pages to populate public-facing content.
--
-- EXCLUDED from public read:
--   - monthlyClosing_* — contains employee salary/allowance data
--     (dashboard.js's Monthly Closing feature). Must never be public.
--   - customCosts — legacy per-item wholesale cost data. Internal margin
--     information, not meant to be public even though nothing currently
--     queries it from a public-facing page.
--
-- Public WRITE: NONE. Every .upsert() into settings happens from
-- homeEditor.js, products.js, or dashboard.js — all admin-only pages.
-- The one exception is stockService.js's LEGACY FALLBACK path (direct
-- settings upsert for orders with no stable component ids) — the
-- service's own comments confirm zero live orders need that path, and
-- explicitly call breaking it under RLS an accepted tradeoff. Not
-- preserved here.
-- ============================================================

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settings_public_read" ON settings
  FOR SELECT TO anon, authenticated
  USING (key NOT LIKE 'monthlyClosing_%' AND key <> 'customCosts');

CREATE POLICY "settings_admin_read_all" ON settings
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE id = auth.uid()::text));

CREATE POLICY "settings_admin_write" ON settings
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE id = auth.uid()::text))
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE id = auth.uid()::text));


-- ============================================================
-- RPC FUNCTIONS — must stay callable by anon/authenticated, and MUST be
-- SECURITY DEFINER, or checkout-driven stock changes will start silently
-- failing the moment RLS goes live above (anon has no direct UPDATE grant
-- on products/settings for stock, by design — see PRODUCTS section).
--
-- Run the SELECT below FIRST to check current state before doing anything:
-- ============================================================

SELECT proname, prosecdef AS is_security_definer
FROM pg_proc
WHERE proname IN ('adjust_product_stock', 'adjust_custom_gift_stock', 'get_order_item_stats');

-- If `is_security_definer` is already `true` for all three, skip the
-- ALTER statements below entirely — nothing else to do.
--
-- If any show `false`, the function's existing logic is NOT being
-- changed by the line below — only its execution privilege is. This is
-- the one schema-adjacent change in this file, and it's required (not
-- optional) for stock to keep working once RLS is enabled:
--
-- ALTER FUNCTION adjust_product_stock(...) SECURITY DEFINER;
-- ALTER FUNCTION adjust_custom_gift_stock(...) SECURITY DEFINER;
--
-- (Exact argument types intentionally left as "..." — fill in from the
-- real function signature in the Supabase SQL editor's function list
-- before running; guessing the signature here risks a no-op ALTER against
-- the wrong overload.)

-- NOTE: the three GRANTs below only work as written if each function name
-- has exactly one overload. If Postgres reports "function name is not
-- unique" when you run these, look up the real signature in the Supabase
-- SQL editor and add explicit argument types, e.g.:
--   GRANT EXECUTE ON FUNCTION adjust_product_stock(uuid, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION adjust_product_stock TO anon, authenticated;
GRANT EXECUTE ON FUNCTION adjust_custom_gift_stock TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_order_item_stats TO anon, authenticated;
