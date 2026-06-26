// js/shared/img.js
// One place for the rules every <img> on the site should follow, so new
// images added later (new product, new candle, new carousel slide, a new
// page) automatically get lazy-loading + explicit sizing without anyone
// having to remember to type loading="lazy" by hand.
//
// Usage in any page's template-string code:
//   imgTag({ src: p.img, alt: p.name, width: 64, height: 64, className: 'cart-item-img' })
// Returns a ready-to-insert <img> HTML string.
//
// Set critical: true ONLY for the single hero/first-carousel-slide image
// that must paint immediately — everything else should stay lazy.
function imgTag(opts) {
  opts = opts || {};
  var src = opts.src || '';
  var alt = (opts.alt || '').replace(/"/g, '&quot;');
  var loading = opts.critical ? 'eager' : 'lazy';
  var fetchpriority = opts.critical ? ' fetchpriority="high"' : '';
  var width = opts.width ? ' width="' + opts.width + '"' : '';
  var height = opts.height ? ' height="' + opts.height + '"' : '';
  var cls = opts.className ? ' class="' + opts.className + '"' : '';
  var id = opts.id ? ' id="' + opts.id + '"' : '';
  var style = opts.style ? ' style="' + opts.style + '"' : '';
  var onclick = opts.onclick ? ' onclick="' + opts.onclick + '"' : '';
  return '<img' + id + cls + ' src="' + src + '" alt="' + alt + '"' +
    width + height + ' loading="' + loading + '"' + fetchpriority + style + onclick + ' />';
}
window.imgTag = imgTag;
