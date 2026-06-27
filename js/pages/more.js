// js/pages/more.js
// Moved verbatim out of the one <script type="module"> block in
// pages/more.html. Loaded as
// <script type="module" src="../js/pages/more.js"></script>.

// ════════════════════════════════════════════
// SUPABASE SETUP
// ════════════════════════════════════════════
const sb = window.createSupabaseClient();

// Same data as js/shared/moreSections.js (loaded before this module) —
// aliased under this file's existing local name since it's a module and
// bare identifiers don't fall back to window.X automatically.
const DEFAULT_SECTIONS = window.DEFAULT_MORE_SECTIONS;
var SECTIONS = DEFAULT_SECTIONS.slice();

var pagesData = {}; // key → { img, text }
var activeKey = SECTIONS[0].key;

// Check URL param ?section=key
var urlParams = new URLSearchParams(window.location.search);
var initSection = urlParams.get('section');
if (initSection) activeKey = initSection;

function buildNav() {
  var strip = document.getElementById('moreNavStrip');
  if (!strip) return;
  strip.innerHTML = SECTIONS.map(function(s) {
    return '<button class="more-nav-item' + (s.key === activeKey ? ' active' : '') + '" onclick="showSection(\'' + s.key + '\')">' + s.label + '</button>';
  }).join('');

  // Desktop sidebar: also populate directly (strip is inside sidebar on desktop)
}

function renderContent() {
  var content = document.getElementById('moreContent');
  if (!content) return;
  var s = SECTIONS.find(function(x){ return x.key === activeKey; });
  if (!s) { s = SECTIONS[0]; if (s) activeKey = s.key; }
  if (!s) { content.innerHTML = '<p class="more-page-empty">No pages available.</p>'; return; }
  var d = pagesData[activeKey] || {};
  var imgHtml = d.img
    ? '<img class="more-page-img" src="' + d.img + '" alt="' + s.label + '" />'
    : '<div class="more-page-img-placeholder"><i class="fa-solid fa-image"></i></div>';
  var textHtml = d.text
    ? '<p class="more-page-text">' + d.text.replace(/</g,'&lt;') + '</p>'
    : '<p class="more-page-empty">No content yet. Add it from the Home Editor.</p>';
  content.innerHTML = imgHtml
    + '<h1 class="more-page-title">' + s.label + '</h1>'
    + textHtml;
}

window.showSection = function(key) {
  activeKey = key;
  // update nav active state
  document.querySelectorAll('.more-nav-item').forEach(function(el) {
    el.classList.toggle('active', el.textContent.trim() === SECTIONS.find(function(s){ return s.key === key; }).label);
  });
  renderContent();
  // update URL without reload
  history.replaceState(null, '', '?section=' + key);
  // Jump straight to the content (was scrolling to the very top of the
  // page instead, which on mobile just re-showed the long sidebar list
  // the customer had to scroll past again).
  var content = document.getElementById('moreContent');
  if (content) content.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// Load from Supabase — read+fallback logic now comes from
// window.fetchMoreSections (js/shared/moreSections.js).
(async function loadMorePages() {
  try {
    var result = await window.fetchMoreSections(sb);
    pagesData = result.value;
    SECTIONS = result.sections.slice();
  } catch(e) {
    pagesData = {};
    SECTIONS = DEFAULT_SECTIONS.slice();
  }
  buildNav();
  renderContent();
})();
