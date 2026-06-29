// js/api/reviewsApi.js
// First file in the new js/api/ layer (Architecture Phase 3.2). Sits
// between pages and Supabase for the Reviews domain only — each function
// is a thin wrapper around the exact same query that previously lived
// inline in js/pages/home.js / js/pages/homeEditor.js. No business logic,
// no validation, no rendering — those all stay exactly where they were.
//
// Same calling convention as the existing js/services/*.js files: `sb` is
// passed in explicitly by the caller (never assumed to be a global), so
// this works identically whether the caller's own client is named `sb`
// (homeEditor.js, a classic script) or `window._sb`/a module-scoped `sb`
// (home.js, a module — both already point to the same client instance
// there via `window._sb = sb;`).
(function (global) {

  // Previously inline in js/pages/home.js's review-submit handler.
  // reviewData: { id, name, rating, text, product, media }
  async function submitReview(sb, reviewData) {
    return await sb.from('reviews').insert(reviewData);
  }

  // Previously inline in js/pages/home.js's loadReviews() — public,
  // unfiltered, no moderation step.
  async function getAllReviews(sb) {
    return await sb.from('reviews').select('*');
  }

  // Previously inline in js/pages/homeEditor.js's loadReviewsManageList()
  // — same table, but newest-first for the admin moderation list. Kept
  // separate from getAllReviews() rather than parameterized, since the
  // two call sites serve genuinely different purposes (public display
  // order vs admin review queue).
  async function getAllReviewsForModeration(sb) {
    return await sb.from('reviews').select('*').order('id', { ascending: false });
  }

  // Previously inline in js/pages/homeEditor.js's window.deleteReview.
  async function deleteReview(sb, id) {
    return await sb.from('reviews').delete().eq('id', id);
  }

  global.ReviewsApi = {
    submitReview: submitReview,
    getAllReviews: getAllReviews,
    getAllReviewsForModeration: getAllReviewsForModeration,
    deleteReview: deleteReview
  };
})(window);
