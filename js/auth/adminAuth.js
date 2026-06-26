// Shared admin access-control logic, extracted from the near-identical
// initAccess()/login()/logout() blocks previously duplicated in
// products.html and home-editor.html.
//
// Only the parts that were byte-for-byte (or functionally identical) are
// moved here. Each page keeps its own UI wiring (element IDs, what happens
// on success, restricted-admin UI tweaks) inline, calling these helpers.
//
// Access rule (unchanged): the super admin can log in directly on this page
// with email/password from anywhere. Anyone else must arrive via dashboard.html,
// which stores an access token + role in sessionStorage before redirecting here.

// Resolves how the current visitor is allowed in. Returns one of:
//   { status: 'dashboard-granted', adminRow }   - valid token from dashboard.html
//   { status: 'dashboard-invalid' }              - token present but invalid/not-admin
//   { status: 'direct-granted', adminRow }       - already-signed-in super admin session
//   { status: 'no-session' }                     - show the login form
async function resolveAdminAccess(sb) {
  const tokenFromDashboard = sessionStorage.getItem('candella_admin_token');

  if (tokenFromDashboard) {
    // Arrived via the dashboard — trust it directly, no extra password needed.
    try {
      const { data: userData, error: userErr } = await sb.auth.getUser(tokenFromDashboard);
      if (userErr || !userData.user) throw new Error('Invalid session');

      const { data: adminRow, error: adminErr } = await sb
        .from('admins')
        .select('role')
        .eq('id', userData.user.id)
        .single();

      if (adminErr || !adminRow) throw new Error('Not an admin');

      return { status: 'dashboard-granted', adminRow: adminRow };
    } catch (e) {
      console.error('Dashboard session invalid:', e);
      return { status: 'dashboard-invalid' };
    }
  }

  // No dashboard token — only the super admin may proceed here, via direct login.
  const { data: { session } } = await sb.auth.getSession();
  if (session && session.user) {
    try {
      const { data: adminRow } = await sb.from('admins').select('role').eq('id', session.user.id).single();
      if (adminRow && adminRow.role === 'super') {
        return { status: 'direct-granted', adminRow: adminRow };
      }
    } catch (e) { console.error(e); }
    await sb.auth.signOut();
  }
  return { status: 'no-session' };
}

// Direct super-admin login with email/password.
// Returns { ok: true, adminRow } or { ok: false, reason: 'denied' | 'error' }.
// Does not catch unexpected exceptions (e.g. a network error) — callers keep
// their own outer try/catch exactly as before, so an unexpected throw still
// surfaces as the page's original generic "Wrong email or password" message.
async function adminDirectLogin(sb, email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email: email, password: password });
  if (error) throw error;

  const { data: adminRow, error: adminErr } = await sb
    .from('admins')
    .select('role')
    .eq('id', data.user.id)
    .single();

  if (adminErr || !adminRow || adminRow.role !== 'super') {
    await sb.auth.signOut();
    return { ok: false, reason: 'denied' };
  }
  return { ok: true, adminRow: adminRow };
}

// Full logout: sign out of Supabase, clear the dashboard-issued session
// markers, and return to the calling page's own login screen.
// redirectTo defaults to 'dashboard.html' only as a safety fallback for
// any caller that doesn't pass one — every current caller does.
async function adminLogout(sb, redirectTo) {
  try { await sb.auth.signOut(); } catch (e) {}
  sessionStorage.removeItem('candella_admin_token');
  sessionStorage.removeItem('candella_admin_role');
  window.location.href = redirectTo || 'dashboard.html';
}

// The token handed to home-editor.html/products.html via sessionStorage is
// only checked ONCE, when the page first loads. Supabase keeps the
// underlying session alive by silently rotating the access token in the
// background — but that rotation never touched the static string we
// stashed in sessionStorage, so after the original token's lifetime
// (commonly ~1 hour) expires, a page refresh fails resolveAdminAccess()
// even though the session is still perfectly valid, and bounces the admin
// back to dashboard.html. This listener keeps the stashed token in sync
// with Supabase's own refreshes so a refresh only kicks you out when the
// session has actually ended.
function attachTokenRefreshListener(sb) {
  sb.auth.onAuthStateChange(function (event, session) {
    if (event === 'TOKEN_REFRESHED' && session) {
      sessionStorage.setItem('candella_admin_token', session.access_token);
    }
  });
}

window.resolveAdminAccess = resolveAdminAccess;
window.adminDirectLogin = adminDirectLogin;
window.adminLogout = adminLogout;
window.attachTokenRefreshListener = attachTokenRefreshListener;
