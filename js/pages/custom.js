// js/pages/custom.js
// Moved verbatim out of the one remaining inline <script type="module">
// block in pages/custom.html (the Supabase gift-set settings loader).
// Loaded as <script type="module" src="../js/pages/custom.js"></script>
// in the exact same position the inline block occupied.
//
// NOTE — scope of this move: the bulk of custom.html's page logic already
// lived in js/custom.js (a separate, already-externalized file loaded via
// <script src="../js/custom.js"></script>, predating this extraction
// phase). That file is NOT renamed or merged here — doing so would be an
// extra refactor beyond "move what's still inline," which this phase
// explicitly forbids. js/custom.js keeps exposing buildContainerGrid,
// buildAccessoriesGrid, buildSizeGrid, DEFAULT_SIZES, etc. as real globals
// (it's a classic, non-module script), which is exactly what this file
// calls into below — unchanged.

// ════════════════════════════════════════════
// SUPABASE SETUP
// ════════════════════════════════════════════
const sb = window.createSupabaseClient();

// Override hero image from Supabase if set
(async function loadGiftSetForCustomPage(){
  try {
    const { data: row, error } = await sb.from('settings').select('value').eq('key', 'giftSet').maybeSingle();
    if (error) throw error;
    var d = (row && row.value) ? row.value : {};

    // Step 2 title & subtitle
    if (d.step2Title) {
      var t = document.getElementById('step2Title');
      if (t) t.textContent = d.step2Title;
    }
    if (d.step2Subtitle !== undefined) {
      var s = document.getElementById('step2Subtitle');
      if (s) s.textContent = d.step2Subtitle;
    }

    // Hero image override
    if (d.heroImg) {
      document.getElementById('buildHero').style.backgroundImage = 'url(' + d.heroImg + ')';
    }

    // Store candles data globally
    window._candlesBySize = d.candlesBySize || {};
    var sizes = (d.sizes && d.sizes.length) ? d.sizes : DEFAULT_SIZES;
    window._currentSizes = sizes;
    window._containerTypeImages = d.containerTypeImages || {};
    buildContainerGrid(d.containers && d.containers.length ? d.containers : []);
    buildAccessoriesGrid(d.accessories && d.accessories.length ? d.accessories : []);

    // Build size grid
    buildSizeGrid(sizes);

    // One-time inventory health log for this page load.
    if (window.CandellaStock) window.CandellaStock.logInventoryHealth(d);
  } catch(e) { console.warn('Failed to load gift set settings:', e); }
})();
