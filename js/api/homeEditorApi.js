// js/api/homeEditorApi.js
// Home Editor Settings domain API layer (Architecture Phase 3.6). Owns
// homeImages / carouselOrder / carouselSlides persistence only. Each
// function is a thin wrapper around a query that previously lived inline
// in js/pages/home.js / js/pages/homeEditor.js — query construction only,
// no business logic, no rendering.
//
// mergeHomeImagesPatch performs a read-merge-write sequence (read the
// current value, shallow-merge in the patch, write it back), scoped to
// the 'homeImages' key only.
//
// Same calling convention as the rest of js/api/*: `sb` is passed in
// explicitly by the caller, never assumed to be a global.
(function (global) {

  // Owns ONLY 'homeImages'.
  async function getHomeImages(sb) {
    return await sb.from('settings').select('value').eq('key', 'homeImages').maybeSingle();
  }

  // Owns ONLY 'carouselOrder'.
  async function getCarouselOrder(sb) {
    return await sb.from('settings').select('value').eq('key', 'carouselOrder').maybeSingle();
  }

  // Owns ONLY 'carouselSlides' (legacy, one-time migration read).
  async function getLegacyCarouselSlides(sb) {
    return await sb.from('settings').select('value').eq('key', 'carouselSlides').maybeSingle();
  }

  // Owns ONLY 'carouselOrder'. Full replace (not a merge) — matches the
  // original window._fbSaveCarouselOrder behavior exactly.
  async function saveCarouselOrder(sb, order, imagesHidden) {
    return await sb.from('settings').upsert({ key: 'carouselOrder', value: { order: order, imagesHidden: !!imagesHidden } });
  }

  // Owns ONLY 'homeImages'. Read-merge-write.
  async function mergeHomeImagesPatch(sb, patch) {
    const { data: row } = await sb.from('settings').select('value').eq('key', 'homeImages').maybeSingle();
    const current = (row && row.value) ? row.value : {};
    const updated = Object.assign({}, current, patch);
    const { error } = await sb.from('settings').upsert({ key: 'homeImages', value: updated });
    if (error) throw error;
  }

  global.HomeEditorApi = {
    getHomeImages: getHomeImages,
    getCarouselOrder: getCarouselOrder,
    getLegacyCarouselSlides: getLegacyCarouselSlides,
    saveCarouselOrder: saveCarouselOrder,
    mergeHomeImagesPatch: mergeHomeImagesPatch
  };
})(window);
