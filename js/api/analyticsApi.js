// js/api/analyticsApi.js
// Analytics domain API layer (Architecture Phase 3.4). Owns Monthly
// Closing persistence only — not a generic Dashboard API. Each function
// is a thin wrapper around the exact same query that previously lived
// inline in js/pages/dashboard.js. No rendering, no calculations, no
// defaulting/backfill logic — those all stay exactly where they were.
//
// Same calling convention as js/api/reviewsApi.js / js/api/productsApi.js:
// `sb` is passed in explicitly by the caller, never assumed to be a global.
(function (global) {

  // Previously inline in js/pages/dashboard.js's window.loadMonthlyClosing.
  async function getMonthlyClosing(sb, month) {
    return await sb.from('settings').select('value').eq('key', 'monthlyClosing_' + month).maybeSingle();
  }

  // Previously inline in js/pages/dashboard.js's window.saveMonthlyClosing.
  async function saveMonthlyClosing(sb, month, closingData) {
    return await sb.from('settings').upsert({ key: 'monthlyClosing_' + month, value: closingData });
  }

  global.AnalyticsApi = {
    getMonthlyClosing: getMonthlyClosing,
    saveMonthlyClosing: saveMonthlyClosing
  };
})(window);
