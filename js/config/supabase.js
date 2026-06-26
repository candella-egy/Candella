// Shared Supabase config — single source of truth.
// Classic (non-module) script so it works identically under file:// and via a server,
// and so existing inline <script type="module"> blocks can read it off `window`
// without needing ES module imports (which file:// blocks in some browsers).
//
// Load this AFTER the supabase-js CDN script and BEFORE any page script that calls
// window.createSupabaseClient().
(function () {
  window.CANDELLA_SUPABASE_URL = "https://jepimvvjavgxkomqigrl.supabase.co";
  window.CANDELLA_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImplcGltdnZqYXZneGtvbXFpZ3JsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5MDM1MjYsImV4cCI6MjA5NzQ3OTUyNn0.VwWBfcB1SbO1MempYATCRNQH4WjZpIT_dy-yKAPraRc";

  // Optional accessToken: when a page is reached via the dashboard-issued
  // token relay (sessionStorage 'candella_admin_token' — see
  // js/auth/adminAuth.js) rather than its own direct sign-in, the client
  // otherwise has no session of its own and every request goes out as
  // anon. Passing the token here makes every request from this client
  // carry it as the Authorization header, so RLS policies that check
  // auth.uid() (e.g. the admins-table policies) evaluate against the
  // real signed-in identity instead of silently falling back to anon.
  // Omitted entirely for every existing call site — behavior for those is
  // unchanged.
  window.createSupabaseClient = function (accessToken) {
    var opts = accessToken
      ? { global: { headers: { Authorization: 'Bearer ' + accessToken } } }
      : undefined;
    return window.supabase.createClient(window.CANDELLA_SUPABASE_URL, window.CANDELLA_SUPABASE_ANON_KEY, opts);
  };
})();
