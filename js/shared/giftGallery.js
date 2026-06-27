// js/shared/giftGallery.js
// Shared "enlarged gift gallery" modal — identical implementation
// previously duplicated in js/pages/{checkout,home,shop,track}.js
// (z-index:9999, thumbnail images with loading="lazy"). js/pages/dashboard.js
// had two small deliberate differences (z-index:99999 so the gallery sits
// above the dashboard's other modals, and no loading="lazy" on the
// thumbnails) — preserved here via optional parameters so its output is
// unchanged; every other call site keeps using the same defaults as before.
window.openGiftGallery = function (enc, opts) {
  opts = opts || {};
  var zIndex = opts.zIndex || 9999;
  var lazyAttr = opts.lazy === false ? '' : ' loading="lazy"';
  var components = JSON.parse(decodeURIComponent(enc));
  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:' + zIndex + ';display:flex;align-items:center;justify-content:center;padding:24px;overflow-y:auto;';
  overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };
  var cardsHtml = components.map(function (comp) {
    return '<div style="display:flex;align-items:center;gap:16px;background:#fff;border-radius:10px;padding:14px 20px;width:100%;max-width:440px;box-shadow:0 4px 16px rgba(0,0,0,0.25);">'
      + (comp.img ? '<img src="' + comp.img + '"' + lazyAttr + ' style="width:64px;height:64px;object-fit:cover;border-radius:8px;flex-shrink:0;" />' : '<div style="width:64px;height:64px;background:#f0ede8;border-radius:8px;flex-shrink:0;"></div>')
      + '<div style="flex:1;min-width:140px;font-family:Montserrat,sans-serif;font-size:13px;font-weight:600;color:#1a1a2e;">' + (comp.name || '') + '</div>'
      + (comp.price != null ? '<div style="font-family:\'Cormorant Garamond\',serif;font-size:15px;font-weight:700;color:#c9a24d;white-space:nowrap;">EGP ' + comp.price + '</div>' : '')
      + '</div>';
  }).join('');
  overlay.innerHTML =
    '<button onclick="this.parentElement.remove()" style="position:fixed;top:18px;right:18px;width:38px;height:38px;border-radius:50%;background:#fff;border:none;font-size:18px;color:#333;cursor:pointer;z-index:1;">&#10005;</button>' +
    '<div style="display:flex;flex-direction:column;gap:12px;align-items:center;max-width:90vw;">' + cardsHtml + '</div>';
  document.body.appendChild(overlay);
};
