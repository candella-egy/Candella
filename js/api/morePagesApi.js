// js/api/morePagesApi.js
// More Pages domain API layer (Architecture Phase 3.7). Owns morePages
// WRITE persistence only — the read side (fetchMoreSections) already
// lives correctly in js/shared/moreSections.js and is not duplicated
// here. Query construction only, no business logic, no rendering.
//
// mergeMorePagesPatch performs a read-merge-write sequence (read the
// current value, shallow-merge in the patch, write it back), scoped to
// the 'morePages' key only.
//
// Same calling convention as the rest of js/api/*: `sb` is passed in
// explicitly by the caller, never assumed to be a global.
(function (global) {

  // Owns ONLY 'morePages'.
  async function mergeMorePagesPatch(sb, patch) {
    const { data: row } = await sb.from('settings').select('value').eq('key', 'morePages').maybeSingle();
    const current = (row && row.value) ? row.value : {};
    const updated = Object.assign({}, current, patch);
    const { error } = await sb.from('settings').upsert({ key: 'morePages', value: updated });
    if (error) throw error;
  }

  global.MorePagesApi = {
    mergeMorePagesPatch: mergeMorePagesPatch
  };
})(window);
