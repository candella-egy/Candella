// js/api/customBuilderApi.js
// Custom Builder domain API layer (Architecture Phase 3.5). Owns giftSet
// persistence only. Each function is a thin wrapper around a query that
// previously lived inline in a page file — query construction only, no
// business logic, no validation, no rendering.
//
// mergeGiftSetPatch performs a read-merge-write sequence (read the
// current value, shallow-merge in the patch, write it back, throw on
// error), scoped to the 'giftSet' key only.
//
// Same calling convention as the rest of js/api/*: `sb` is passed in
// explicitly by the caller, never assumed to be a global.
(function (global) {

  async function getGiftSetData(sb) {
    return await sb.from('settings').select('value').eq('key', 'giftSet').maybeSingle();
  }

  async function saveGiftSetData(sb, giftData) {
    return await sb.from('settings').upsert({ key: 'giftSet', value: giftData });
  }

  async function mergeGiftSetPatch(sb, patch) {
    const { data: row } = await sb.from('settings').select('value').eq('key', 'giftSet').maybeSingle();
    const current = (row && row.value) ? row.value : {};
    const updated = Object.assign({}, current, patch);
    const { error } = await sb.from('settings').upsert({ key: 'giftSet', value: updated });
    if (error) throw error;
  }

  global.CustomBuilderApi = {
    getGiftSetData: getGiftSetData,
    saveGiftSetData: saveGiftSetData,
    mergeGiftSetPatch: mergeGiftSetPatch
  };
})(window);
