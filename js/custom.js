/* ============================================================
   js/custom.js — builder logic for custom.html ("Build Your Own Gift Set")
   ============================================================
   Moved verbatim out of custom.html's inline <script> block as part
   of infrastructure prep. No function was added, removed, or changed
   during the move — only this header and the section notes below.

   This file does NOT contain the product catalog (sizes, candles,
   containers, accessories) or images. Those are fetched at runtime
   from Supabase (settings.giftSet) by the small <script type="module">
   block still inline in custom.html, which calls buildSizeGrid(),
   buildContainerGrid(), buildAccessoriesGrid() defined below once the
   data has loaded.

   See docs/custom-builder-guide.md for how to add new candles,
   containers, accessories, sizes, and images going forward.
   ============================================================ */

/* ── State ── */
var sel = {
  size: null, sizeLabel: null, sizePrice: 0
};

var DEFAULT_SIZES = [
  {label:'Small', weight:'500g', price:150},
  {label:'Medium', weight:'1000g', price:250},
  {label:'Large', weight:'1500g', price:320}
];

function esc(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/* ============================================================
   STEP 1 — SIZES
   Rendered from window._currentSizes, set by the Supabase loader
   in custom.html from settings.giftSet.sizes. To add a new size,
   add an entry there — no changes needed in this file.
   ============================================================ */
function buildSizeGrid(sizes) {
  var grid = document.getElementById('sizeGrid');
  if (!grid) return;
  if (!sizes || sizes.length === 0) {
    grid.innerHTML = '<div style="color:#aaa;text-align:center;padding:30px;">No sizes configured yet.</div>';
    return;
  }
  grid.innerHTML = sizes.map(function(s, i) {
    var key = 'size_' + i;
    var label = esc(s.label);
    var imgHtml = s.img
      ? '<img src="' + esc(s.img) + '" alt="' + esc(s.label) + '" loading="lazy" />'
      : '<div class="size-card-placeholder">🕯️</div>';
    return '<div class="size-card" id="sc_' + key + '" onclick="selectSize(\'' + key + '\',' + (s.price||0) + ',\'' + label + '\')">'
      + imgHtml
      + '<button class="size-card-btn custom-add-btn">' + esc(s.label).toUpperCase()
        + (s.weight ? '<span style="display:block;font-size:12px;font-weight:600;letter-spacing:1px;color:#fff;opacity:1;margin-top:3px;">' + esc(s.weight) + '</span>' : '')
        + '</button>'
      + '</div>';
  }).join('');
}

function selectSize(key, price, label) {
  document.querySelectorAll('.size-card').forEach(function(c){ c.classList.remove('selected'); });
  var card = document.getElementById('sc_' + key);
  if (card) card.classList.add('selected');
  sel.size = key;
  sel.sizeLabel = label;
  // Size never adds to the price — only the candle/container/accessory
  // choices do. Ignoring whatever price is configured for this size.
  sel.sizePrice = 0;
  sel.sizeImg = (window._currentSizes && window._currentSizes[parseInt(key.replace('size_',''))] && window._currentSizes[parseInt(key.replace('size_',''))].img) || '';
  updateStickyBar();
  // Show progress bar + step 2
  document.getElementById('progBarWrap').classList.add('visible');
  document.getElementById('step2').classList.add('visible');
  buildCandleGrid(key);
  setTimeout(function(){
    document.getElementById('progBarWrap').scrollIntoView({behavior:'smooth', block:'start'});
  }, 100);
  if (document.getElementById('orderSummary').style.display === 'block') showOrderSummary();
}

function clearSummarySize() {
  if (sel.size) {
    var card = document.getElementById('sc_' + sel.size);
    if (card) card.classList.remove('selected');
  }
  sel.size = null; sel.sizeLabel = null; sel.sizePrice = 0; sel.sizeImg = '';
  updateStickyBar();
  // Take the customer back to the size step to pick again, instead of
  // forcing them onto the Order Summary screen.
  document.getElementById('orderSummary').style.display = 'none';
  setTimeout(function(){ document.getElementById('step1').scrollIntoView({behavior:'smooth'}); }, 100);
}

/* ============================================================
   STEP 2 — CANDLES
   Rendered from window._candlesBySize, set by the Supabase loader
   from settings.giftSet.candlesBySize. To add a new candle, add an
   entry there (under the right size_N key) — no changes needed here.
   ============================================================ */
function buildCandleGrid(sizeKey) {
  var grid = document.getElementById('candleGrid');
  var candles = (window._candlesBySize && window._candlesBySize[sizeKey]) || [];
  if (!candles.length) {
    grid.innerHTML = '<div style="color:#aaa;text-align:center;padding:40px;grid-column:1/-1;">No candles configured for this size yet.</div>';
    return;
  }
  grid.innerHTML = candles.map(function(c, i) {
    var key = sizeKey + '_c' + i;
    var label = esc(c.name||'Candle') + (c.scent ? ' - ' + esc(c.scent) : '');
    var outOfStock = c.stock != null && c.stock <= 0;
    var callStr = outOfStock ? '' : 'selectCandle(\'' + key + '\',' + (c.price||0) + ',\'' + esc(c.name||'') + '\',\'' + esc(c.scent||'') + '\')';
    return '<div class="candle-card' + (outOfStock ? ' out-of-stock' : '') + '" id="cc_' + key + '"' + (callStr ? ' onclick="' + callStr + '"' : '') + '>'
      + (outOfStock ? '<div class="out-of-stock-badge">Out of Stock</div>' : '')
      + '<div class="candle-card-img-wrap">'
        + (c.img
          ? '<img src="' + esc(c.img) + '" alt="' + esc(c.name||'') + '" loading="lazy" />'
          : '<div class="candle-card-placeholder">🕯️</div>')
        + '<div class="candle-selected-ring"></div>'
        + (outOfStock ? '' :
          '<div style="position:absolute;inset:0;display:flex;align-items:flex-end;justify-content:center;padding-bottom:12px;opacity:0;transition:opacity 0.2s;" class="candle-img-overlay">'
          + '<button class="custom-add-btn" style="width:auto;padding:8px 22px;pointer-events:none;">ADD</button>'
          + '</div>')
      + '</div>'
      + '<div class="candle-card-name">' + label + '</div>'
      + '<div class="candle-card-price">EGP ' + (c.price||0) + '</div>'
      + (outOfStock ? '<div class="custom-add-btn" style="opacity:0.6;cursor:not-allowed;background:#999;">Out of Stock</div>' : '')
    + '</div>';
  }).join('');
}

function selectCandle(key, price, name, scent) {
  var sizeKey = key.split('_c')[0];
  var idxInList = parseInt(key.split('_c')[1], 10);
  var candleData = (window._candlesBySize && window._candlesBySize[sizeKey] && window._candlesBySize[sizeKey][idxInList]) || null;

  document.querySelectorAll('.candle-card').forEach(function(c){ c.classList.remove('selected'); });
  var card = document.getElementById('cc_' + key);
  if (card) card.classList.add('selected');
  sel.candle = name + (scent ? ' · ' + scent : '');
  sel.candlePrice = price;
  sel.candleLabel = name + (scent ? ' - ' + scent : '');
  sel.candleKey = key;
  sel.candleId = candleData ? candleData.id : null;
  var ccEl = document.getElementById('cc_' + key);
  var ccImg = ccEl ? ccEl.querySelector('img') : null;
  sel.candleImg = ccImg ? ccImg.src : '';
  updateStickyBar();

  // Auto-advance to step 3 (containers) after candle selection
  var s3 = document.getElementById('step3');
  if (!s3.classList.contains('visible')) {
    s3.classList.add('visible');
    var p2 = document.getElementById('prog-2');
    if (p2) { p2.classList.add('done'); p2.classList.remove('active'); }
    var p3 = document.getElementById('prog-3');
    if (p3) p3.classList.add('active');
    setTimeout(function(){ s3.scrollIntoView({behavior:'smooth'}); }, 200);
  }
  if (document.getElementById('orderSummary').style.display === 'block') showOrderSummary();
}

function clearSummaryCandle() {
  if (sel.candleKey) {
    var card = document.getElementById('cc_' + sel.candleKey);
    if (card) card.classList.remove('selected');
  }
  sel.candle = null; sel.candlePrice = 0; sel.candleLabel = null; sel.candleImg = ''; sel.candleKey = null; sel.candleId = null;
  updateStickyBar();
  // Take the customer back to the candle step to pick again, instead of
  // forcing them onto the Order Summary screen.
  document.getElementById('orderSummary').style.display = 'none';
  var s2 = document.getElementById('step2');
  if (s2) s2.classList.add('visible');
  setTimeout(function(){ document.getElementById('step2').scrollIntoView({behavior:'smooth'}); }, 100);
}


/* ============================================================
   STEP 4 — ACCESSORIES
   Rendered from settings.giftSet.accessories. To add a new
   accessory, add an entry there — no changes needed here.
   ============================================================ */
var _accessoriesData = [];
var _selectedAccessories = {}; // { accIdx: {id, name, price, img} }

function buildAccessoriesGrid(accessories) {
  _accessoriesData = accessories || [];
  var grid = document.getElementById('accessoriesGrid');
  if (!accessories || !accessories.length) {
    grid.innerHTML = '<div style="color:#aaa;text-align:center;padding:40px;grid-column:1/-1;">No accessories configured yet.</div>';
    return;
  }
  grid.innerHTML = accessories.map(function(a, i) {
    var key = 'acc_' + i;
    var isSelected = _selectedAccessories[i] ? true : false;
    var outOfStock = a.stock != null && a.stock <= 0;
    var callStr = outOfStock ? '' : 'selectAccessory(' + i + ',\'' + esc(a.name||'') + '\',' + (a.price||0) + ')';
    return '<div class="candle-card' + (isSelected ? ' selected' : '') + (outOfStock ? ' out-of-stock' : '') + '" id="' + key + '"'
      + (callStr ? ' onclick="' + callStr + '"' : '') + '>'
      + (outOfStock ? '<div class="out-of-stock-badge">Out of Stock</div>' : '')
      + '<div class="candle-card-img-wrap">'
        + (a.img
          ? '<img src="' + esc(a.img) + '" alt="' + esc(a.name||'') + '" loading="lazy" />'
          : '<div class="candle-card-placeholder">🎁</div>')
        + '<div class="candle-selected-ring"></div>'
        + (outOfStock ? '' :
          '<div style="position:absolute;inset:0;display:flex;align-items:flex-end;justify-content:center;padding-bottom:12px;opacity:0;transition:opacity 0.2s;" class="candle-img-overlay">'
          + '<button class="custom-add-btn' + (isSelected ? ' added' : '') + '" style="width:auto;padding:8px 22px;pointer-events:none;">' + (isSelected ? 'ADDED' : 'ADD') + '</button>'
          + '</div>')
      + '</div>'
      + '<div class="candle-card-name">' + esc(a.name||'Accessory') + '</div>'
      + '<div class="candle-card-price">EGP ' + (a.price||0) + '</div>'
      + (outOfStock ? '<div class="custom-add-btn" style="opacity:0.6;cursor:not-allowed;background:#999;">Out of Stock</div>' : '')
    + '</div>';
  }).join('');
}

function selectAccessory(idx, name, price) {
  var aData = _accessoriesData[idx];
  if (!_selectedAccessories[idx] && aData && aData.stock != null && aData.stock <= 0) {
    showToast('هذا العنصر غير متوفر حاليًا');
    return;
  }
  // Clicking the card only ever adds. Removing is only ever done through
  // the dedicated Cancel/Remove button on the product in the order
  // summary (removeSummaryAccessory) — clicking the card again while
  // already selected does nothing, instead of toggling it back off.
  if (_selectedAccessories[idx]) {
    return;
  }
  var accImg = document.getElementById('acc_' + idx).querySelector('img');
  _selectedAccessories[idx] = {
    id: aData ? aData.id : null,
    name: name,
    price: price,
    img: accImg ? accImg.src : ''
  };
  showToast('تم إضافة ' + name + '!');
  buildAccessoriesGrid(_accessoriesData);
  updateStickyBar();
  if (document.getElementById('orderSummary').style.display === 'block') showOrderSummary();
}

function removeSummaryAccessory(idx) {
  if (!_selectedAccessories[idx]) return;
  delete _selectedAccessories[idx];
  buildAccessoriesGrid(_accessoriesData);
  updateStickyBar();
  // Take the customer back to the accessories step to pick again, instead
  // of forcing them onto the Order Summary screen.
  document.getElementById('orderSummary').style.display = 'none';
  var s4 = document.getElementById('step4');
  if (s4) s4.classList.add('visible');
  document.getElementById('stickyBar').classList.add('visible');
  setTimeout(function(){ document.getElementById('step4').scrollIntoView({behavior:'smooth'}); }, 100);
}



/* ============================================================
   STEP 3 — CONTAINERS
   Rendered from settings.giftSet.containers — a FLAT array, one
   independent record per shape: {id, type, name, image, price,
   cost, stock}. The grid shows one card per TYPE (Wood/Glass/
   Concrete/...). Clicking a type card's "Add" button opens a
   popup listing the shapes that belong to that type (dropdown +
   image + price), where the customer picks the exact shape.
   ============================================================ */
var _containersData = [];      // flat list of all container shapes
var _selectedContainers = {};  // { containerId: {id, name, price, img, type, qty} }
var _contModalType = null;
var _contModalShapes = [];

var CONTAINER_TYPE_LABELS = { wood: 'Wood', glass: 'Glass', concrete: 'Concrete', uncategorized: 'Other' };

function buildContainerGrid(containers) {
  _containersData = containers || [];
  var grid = document.getElementById('containerGrid');
  if (!_containersData.length) {
    grid.innerHTML = '<div style="color:#aaa;text-align:center;padding:40px;">No containers configured yet.</div>';
    return;
  }

  var types = [];
  _containersData.forEach(function(c) {
    var t = c.type || 'uncategorized';
    if (types.indexOf(t) === -1) types.push(t);
  });

  grid.innerHTML = types.map(function(t) {
    var shapes = _containersData.filter(function(c) { return (c.type || 'uncategorized') === t; });
    var typeImg = (window._containerTypeImages && window._containerTypeImages[t]) || '';
    var firstWithImg = shapes.find(function(c) { return c.image; });
    var cardImg = typeImg || (firstWithImg ? firstWithImg.image : '');
    var selectedCount = shapes.filter(function(c) { return !!_selectedContainers[c.id]; }).length;
    var allOutOfStock = shapes.every(function(c) { return c.stock != null && c.stock <= 0; });
    return '<div class="container-card' + (selectedCount ? ' has-selection' : '') + (allOutOfStock ? ' out-of-stock' : '') + '" id="contTypeCard_' + esc(t) + '"'
        + (allOutOfStock ? '' : ' onclick="openContTypeModal(\'' + esc(t) + '\')"') + '>'
      + (selectedCount ? '<div class="container-selected-badge" id="contTypeBadge_' + esc(t) + '">✓ ' + selectedCount + ' Added</div>' : '<div class="container-selected-badge" id="contTypeBadge_' + esc(t) + '"></div>')
      + (allOutOfStock ? '<div class="out-of-stock-badge">Out of Stock</div>' : '')
      + '<div class="container-card-img-wrap">'
        + (cardImg
          ? '<img src="' + esc(cardImg) + '" alt="' + esc(CONTAINER_TYPE_LABELS[t] || t) + '" loading="lazy" />'
          : '<div class="container-card-placeholder">📦</div>')
      + '</div>'
      + '<div class="container-card-name">' + esc(CONTAINER_TYPE_LABELS[t] || t) + '</div>'
    + '</div>';
  }).join('');
}

function openContTypeModal(type) {
  _contModalType = type;
  _contModalShapes = _containersData.filter(function(c) { return (c.type || 'uncategorized') === type; });
  if (!_contModalShapes.length) return;

  document.getElementById('contModalTitle').textContent = CONTAINER_TYPE_LABELS[type] || type;

  var sel = document.getElementById('contModalShapeSel');
  sel.innerHTML = _contModalShapes.map(function(c, i) {
    var outOfStock = c.stock != null && c.stock <= 0;
    return '<option value="' + i + '"' + (outOfStock ? ' disabled' : '') + '>' + esc(c.name||'Shape') + (outOfStock ? ' (Out of Stock)' : '') + '</option>';
  }).join('');

  // Default to the first in-stock shape, if any.
  var defaultIdx = _contModalShapes.findIndex(function(c) { return !(c.stock != null && c.stock <= 0); });
  sel.value = defaultIdx === -1 ? 0 : defaultIdx;

  contModalShapeChange();
  document.getElementById('contModalBackdrop').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function contModalShapeChange() {
  var idx = parseInt(document.getElementById('contModalShapeSel').value, 10);
  var c = _contModalShapes[idx];
  if (!c) return;

  var mainImgEl = document.getElementById('contModalMainImg');
  var mainPh = document.getElementById('contModalMainPlaceholder');
  if (c.image) {
    mainImgEl.src = c.image;
    mainImgEl.style.display = 'block';
    mainPh.style.display = 'none';
  } else {
    mainImgEl.style.display = 'none';
    mainPh.style.display = 'flex';
  }

  document.getElementById('contModalPrice').textContent = c.price || 0;

  var outOfStock = c.stock != null && c.stock <= 0;
  var addBtn = document.getElementById('contModalAddBtn');
  var qtyWrap = document.getElementById('contModalQtyWrap');
  var selected = _selectedContainers[c.id];

  if (outOfStock) {
    addBtn.style.display = 'block';
    addBtn.disabled = true;
    addBtn.textContent = 'Out of Stock';
    qtyWrap.style.display = 'none';
  } else if (selected) {
    addBtn.style.display = 'none';
    qtyWrap.style.display = 'flex';
    document.getElementById('contModalQtyVal').textContent = selected.qty || 1;
  } else {
    addBtn.style.display = 'block';
    addBtn.disabled = false;
    addBtn.textContent = 'Add';
    qtyWrap.style.display = 'none';
  }
}

function contModalAdd() {
  var idx = parseInt(document.getElementById('contModalShapeSel').value, 10);
  var c = _contModalShapes[idx];
  if (!c) return;
  if (c.stock != null && c.stock <= 0) { showToast('هذا الشكل غير متوفر حاليًا'); return; }

  _selectedContainers[c.id] = {
    id: c.id,
    name: c.name || 'Container',
    price: c.price || 0,
    img: c.image || '',
    type: c.type || 'uncategorized',
    qty: 1
  };
  showToast('تم إضافة ' + (c.name||'Container') + '!');

  contModalShapeChange();
  buildContainerGrid(_containersData);
  updateStickyBar();
  if (document.getElementById('orderSummary').style.display === 'block') showOrderSummary();
}

function contModalChangeQty(delta) {
  var idx = parseInt(document.getElementById('contModalShapeSel').value, 10);
  var c = _contModalShapes[idx];
  if (!c) return;
  var selected = _selectedContainers[c.id];
  if (!selected) return;

  var newQty = (selected.qty || 1) + delta;

  if (newQty <= 0) {
    delete _selectedContainers[c.id];
  } else {
    if (c.stock != null && newQty > c.stock) { showToast('الكمية المتاحة وصلت للحد الأقصى'); return; }
    selected.qty = newQty;
  }

  contModalShapeChange();
  buildContainerGrid(_containersData);
  updateStickyBar();
  if (document.getElementById('orderSummary').style.display === 'block') showOrderSummary();
}

function closeContModal(e) {
  if (e && e.target !== document.getElementById('contModalBackdrop')) return;
  document.getElementById('contModalBackdrop').classList.remove('open');
  document.body.style.overflow = '';

  // Auto-advance to step 4 (accessories) once the customer closes the
  // shapes modal with at least one container picked — same pattern as
  // selectCandle()'s auto-advance to step 3, just triggered on modal
  // close instead of on selection itself (since containers stay open
  // for picking multiple shapes/quantities before the customer is done).
  if (Object.keys(_selectedContainers).length > 0) {
    var s4 = document.getElementById('step4');
    if (s4 && !s4.classList.contains('visible')) {
      s4.classList.add('visible');
      var p3 = document.getElementById('prog-3');
      if (p3) { p3.classList.add('done'); p3.classList.remove('active'); }
      var p4 = document.getElementById('prog-4');
      if (p4) p4.classList.add('active');
      setTimeout(function(){ s4.scrollIntoView({behavior:'smooth'}); }, 200);
    }
  }
}

function removeSummaryContainer(containerId) {
  if (!_selectedContainers[containerId]) return;
  delete _selectedContainers[containerId];
  buildContainerGrid(_containersData);
  updateStickyBar();
  // Take the customer back to the container step to pick again, instead
  // of forcing them onto the Order Summary screen.
  document.getElementById('orderSummary').style.display = 'none';
  var s3 = document.getElementById('step3');
  if (s3) s3.classList.add('visible');
  setTimeout(function(){ document.getElementById('step3').scrollIntoView({behavior:'smooth'}); }, 100);
}

/* ── STICKY BAR ── */
// Threshold/pct data now lives in js/services/customGiftService.js — kept
// as one alias here so the "next milestone" UI logic below doesn't need
// to change, and there is still only one place these numbers are defined.
var DISC_TIERS = window.CustomGiftService.DISC_TIERS;
var MAX_THRESHOLD = 1000;

// Thin wrapper — the actual pricing formula now lives in
// js/services/customGiftService.js (pure business logic, no DOM). This
// just gathers the current selection state and passes it in, so every
// caller below keeps working unchanged.
function calculateCustomGiftTotals() {
  return window.CustomGiftService.calculateCustomGiftTotals({
    sizePrice: sel.sizePrice,
    candlePrice: sel.candlePrice,
    selectedContainers: _selectedContainers,
    selectedAccessories: _selectedAccessories
  });
}

function updateStickyBar() {
  var totals = calculateCustomGiftTotals();
  var total = totals.subtotal;
  if (total === 0 && !sel.size) return;

  document.getElementById('stickyBar').classList.add('visible');

  // ── One small removable card per selected item (size, candle, each
  // container, each accessory) — clicking X reuses the exact same
  // remove functions as the Order Summary, so there's one removal path. ──
  var itemsHtml = '';
  if (sel.sizeLabel) {
    itemsHtml += sbItemCard({ img: sel.sizeImg, price: null, onRemove: 'clearSummarySize()' });
  }
  if (sel.candleLabel) {
    itemsHtml += sbItemCard({ img: sel.candleImg, price: sel.candlePrice, onRemove: 'clearSummaryCandle()' });
  }
  Object.keys(_selectedContainers).forEach(function(cid) {
    var c = _selectedContainers[cid];
    var qty = c.qty || 1;
    var safeId = cid.replace(/'/g, "\\'");
    itemsHtml += sbItemCard({
      img: c.img, price: c.price * qty, qty: qty,
      onRemove: 'removeSummaryContainer(\'' + safeId + '\')',
      stepper: { onMinus: 'adjustContainerQtyDirect(\'' + safeId + '\',-1)', onPlus: 'adjustContainerQtyDirect(\'' + safeId + '\',1)' }
    });
  });
  Object.keys(_selectedAccessories).forEach(function(idx) {
    var a = _selectedAccessories[idx];
    itemsHtml += sbItemCard({ img: a.img, price: a.price, onRemove: 'removeSummaryAccessory(' + idx + ')' });
  });
  document.getElementById('sbItems').innerHTML = itemsHtml;

  // Discount tiers
  var pct = totals.discountPct;

  var progress = Math.min(100, Math.round((total / MAX_THRESHOLD) * 100));
  document.getElementById('sbProgressFill').style.width = progress + '%';

  // Single circle for the next achievable tier (or "max reached")
  var nextTier = null;
  for (var k = 0; k < DISC_TIERS.length; k++) {
    if (total < DISC_TIERS[k].threshold) { nextTier = DISC_TIERS[k]; break; }
  }
  var milestoneEl = document.getElementById('sbNextMilestone');
  var badgeEl = document.getElementById('sbDiscBadge');
  if (nextTier) {
    milestoneEl.innerHTML = 'Reach<br>' + nextTier.threshold + ' EGP,<br>save ' + nextTier.pct + '%';
    milestoneEl.classList.remove('reached');
    milestoneEl.style.display = 'flex';
    badgeEl.style.display = 'none';
  } else {
    milestoneEl.style.display = 'none';
    badgeEl.style.display = 'block';
    badgeEl.textContent = '🎉 خصم ' + pct + '% مطبق';
  }

  // Total — old (strikethrough) price only shown when a discount is active,
  // same number that's actually charged (cart item / checkout / order summary).
  var discounted = totals.finalTotal;
  var oldEl = document.getElementById('sbTotalOld');
  if (pct > 0) {
    oldEl.textContent = 'EGP ' + total;
    oldEl.style.display = 'inline';
  } else {
    oldEl.style.display = 'none';
  }
  document.getElementById('sbTotal').textContent = 'EGP ' + discounted;
}

function sbItemCard(opts) {
  var imgHtml = opts.img
    ? '<img class="sb-item-img" src="' + esc(opts.img) + '" alt="" loading="lazy" />'
    : '<div class="sb-item-placeholder">🕯️</div>';
  return '<div class="sb-item-card">'
    + imgHtml
    + (opts.price != null ? '<div class="sb-item-price">EGP ' + opts.price + (opts.qty > 1 ? ' x' + opts.qty : '') + '</div>' : '')
    + '<button class="sb-item-x" onclick="' + opts.onRemove + '" title="Remove">&#10005;</button>'
    + (opts.stepper
      ? '<div class="sb-item-stepper">'
        + '<button onclick="' + opts.stepper.onMinus + '">−</button>'
        + '<span>' + (opts.qty||1) + '</span>'
        + '<button onclick="' + opts.stepper.onPlus + '">+</button>'
        + '</div>'
      : '')
    + '</div>';
}

// Direct quantity adjustment for a container item from the sticky bar's
// own stepper — doesn't require the type modal to be open. Same selection
// state (_selectedContainers) and same stock guard as contModalChangeQty.
function adjustContainerQtyDirect(containerId, delta) {
  var selected = _selectedContainers[containerId];
  if (!selected) return;
  var c = _containersData.find(function(x) { return x.id === containerId; });
  var newQty = (selected.qty || 1) + delta;

  if (newQty <= 0) {
    delete _selectedContainers[containerId];
  } else {
    if (c && c.stock != null && newQty > c.stock) { showToast('الكمية المتاحة وصلت للحد الأقصى'); return; }
    selected.qty = newQty;
  }

  buildContainerGrid(_containersData);
  updateStickyBar();
  if (document.getElementById('orderSummary').style.display === 'block') showOrderSummary();
}

function sbGoNext() {
  // Determine which step to show next
  var s3 = document.getElementById('step3');
  var s4 = document.getElementById('step4');
  var summary = document.getElementById('orderSummary');

  if (!s3.classList.contains('visible')) {
    // Show step 3 (containers)
    s3.classList.add('visible');
    var p2 = document.getElementById('prog-2');
    if (p2) { p2.classList.add('done'); p2.classList.remove('active'); }
    var p3 = document.getElementById('prog-3');
    if (p3) p3.classList.add('active');
    setTimeout(function(){ s3.scrollIntoView({behavior:'smooth'}); }, 100);
  } else if (!s4.classList.contains('visible')) {
    // Show step 4 (accessories)
    s4.classList.add('visible');
    var p3 = document.getElementById('prog-3');
    if (p3) { p3.classList.add('done'); p3.classList.remove('active'); }
    var p4 = document.getElementById('prog-4');
    if (p4) p4.classList.add('active');
    setTimeout(function(){ s4.scrollIntoView({behavior:'smooth'}); }, 100);
  } else {
    // Show order summary
    showOrderSummary();
  }
}

function summaryItemRow(opts) {
  // opts: { img, name, price, onRemove }
  var imgHtml = opts.img
    ? '<img class="si-img" src="' + esc(opts.img) + '" alt="" loading="lazy" />'
    : '<div class="si-img-placeholder">🕯️</div>';
  return '<div class="summary-item-row">'
    + imgHtml
    + '<div class="si-name">' + esc(opts.name) + '</div>'
    + (opts.price != null ? '<div class="si-price">EGP ' + opts.price + '</div>' : '')
    + '<button class="si-remove-btn" onclick="' + opts.onRemove + '" title="Remove">&#10005;</button>'
    + '</div>';
}

function showOrderSummary() {
  var summary = document.getElementById('orderSummary');
  var s4 = document.getElementById('step4');

  // Hide step 4 and sticky bar
  s4.classList.remove('visible');
  document.getElementById('stickyBar').classList.remove('visible');

  var totals = calculateCustomGiftTotals();

  // ── Size ──
  document.getElementById('summarySize').innerHTML = sel.sizeLabel
    ? summaryItemRow({ img: sel.sizeImg, name: sel.sizeLabel, price: null, onRemove: 'clearSummarySize()' })
    : '<span class="summary-empty-text">—</span>';

  // ── Candle ──
  document.getElementById('summaryCandle').innerHTML = sel.candleLabel
    ? summaryItemRow({ img: sel.candleImg, name: sel.candleLabel, price: sel.candlePrice, onRemove: 'clearSummaryCandle()' })
    : '<span class="summary-empty-text">—</span>';

  // ── Containers ──
  var contEntries = Object.keys(_selectedContainers);
  document.getElementById('summaryContainer').innerHTML = contEntries.length
    ? contEntries.map(function(cid) {
        var c = _selectedContainers[cid];
        var qty = c.qty || 1;
        var name = c.name + (qty > 1 ? ' x' + qty : '');
        return summaryItemRow({ img: c.img, name: name, price: c.price * qty, onRemove: 'removeSummaryContainer(\'' + cid.replace(/'/g, "\\'") + '\')' });
      }).join('')
    : '<span class="summary-empty-text">—</span>';

  // ── Accessories ──
  var accEntries = Object.keys(_selectedAccessories);
  document.getElementById('summaryAccessories').innerHTML = accEntries.length
    ? accEntries.map(function(idx) {
        var a = _selectedAccessories[idx];
        return summaryItemRow({ img: a.img, name: a.name, price: a.price, onRemove: 'removeSummaryAccessory(' + idx + ')' });
      }).join('')
    : '<span class="summary-empty-text">None</span>';

  // ── Subtotal (before discount) → Discount → Total after discount ──
  var subtotalRow = document.getElementById('summarySubtotalRow');
  var discRow = document.getElementById('summaryDiscountRow');
  if (totals.discountPct > 0) {
    document.getElementById('summarySubtotalVal').textContent = 'EGP ' + totals.subtotal;
    subtotalRow.style.display = 'flex';

    document.getElementById('summaryDiscountPct').textContent = '-' + totals.discountPct + '%';
    document.getElementById('summaryDiscountVal').textContent = '-EGP ' + totals.discountAmount;
    discRow.style.display = 'flex';

    document.getElementById('summaryTotalLabel').textContent = 'Total after Discount';
  } else {
    subtotalRow.style.display = 'none';
    discRow.style.display = 'none';
    document.getElementById('summaryTotalLabel').textContent = 'Total';
  }

  // Same number the customer will actually be charged — identical to the
  // sticky bar and to what goCheckout()/addCustomGiftToCart() write into
  // the cart item's `price` field (both now derive from calculateCustomGiftTotals()).
  document.getElementById('summaryTotal').textContent = 'EGP ' + totals.finalTotal;

  // Show summary
  summary.style.display = 'block';
  setTimeout(function(){ summary.scrollIntoView({behavior:'smooth'}); }, 100);
}

function backToStep4() {
  var summary = document.getElementById('orderSummary');
  var s4 = document.getElementById('step4');

  summary.style.display = 'none';
  s4.classList.add('visible');
  document.getElementById('stickyBar').classList.add('visible');

  setTimeout(function(){ s4.scrollIntoView({behavior:'smooth'}); }, 100);
}

function sbGoBack() {
  var s3 = document.getElementById('step3');
  var s4 = document.getElementById('step4');

  if (s4 && s4.classList.contains('visible')) {
    // Go back from step 4 to step 3
    s4.classList.remove('visible');
    var p3 = document.getElementById('prog-3');
    var p4 = document.getElementById('prog-4');
    if (p3) { p3.classList.remove('done'); p3.classList.add('active'); }
    if (p4) { p4.classList.remove('active'); }
    setTimeout(function(){ s3.scrollIntoView({behavior:'smooth'}); }, 100);
  } else if (s3 && s3.classList.contains('visible')) {
    // Go back from step 3 to step 1
    s3.classList.remove('visible');
    var p2 = document.getElementById('prog-2');
    var p3 = document.getElementById('prog-3');
    if (p2) { p2.classList.remove('done'); p2.classList.add('active'); }
    if (p3) { p3.classList.remove('active'); }
    setTimeout(function(){ document.getElementById('step1').scrollIntoView({behavior:'smooth'}); }, 100);
  } else {
    document.getElementById('step1').scrollIntoView({behavior:'smooth'});
  }
}

// Builds one flat list of every selected component (candle + each
// container + each accessory) as {name, price, img} — used to show each
// item with its own label/price in the cart/checkout/track/dashboard
// "enlarged" gallery view. Additive data only; doesn't replace the
// existing giftCandle/giftContainer/giftAccessories display strings.
function buildGiftComponents() {
  var components = [];
  if (sel.candleLabel) {
    components.push({ name: 'Candle: ' + sel.candleLabel, price: sel.candlePrice || 0, img: sel.candleImg || '' });
  }
  Object.values(_selectedContainers).forEach(function(c) {
    var qty = c.qty || 1;
    components.push({ name: 'Container: ' + c.name + (qty > 1 ? ' x' + qty : ''), price: (c.price || 0) * qty, img: c.img || '' });
  });
  Object.values(_selectedAccessories).forEach(function(a) {
    components.push({ name: 'Accessory: ' + a.name, price: a.price || 0, img: a.img || '' });
  });
  return components;
}

function goCheckout() {
  var totals = calculateCustomGiftTotals();
  var total = totals.subtotal;
  var pct = totals.discountPct;
  var discountedTotal = totals.finalTotal;

  var containerNames = Object.values(_selectedContainers)
    .map(function(c){ return c.name + ((c.qty||1) > 1 ? ' x' + c.qty : ''); })
    .join(', ') || '—';
  var accessoryNames = Object.values(_selectedAccessories)
    .map(function(a){ return a.name; }).join(', ') || '—';

  var giftItem = {
    cartKey:           'giftset_' + Date.now(),
    isGiftSet:         true,
    name:              'Custom Gift Set',
    img:               sel.candleImg || sel.sizeImg || '',
    price:             discountedTotal,
    originalPrice:     total,
    volumeDiscountPct: pct,
    qty:               1,
    giftSize:          sel.sizeLabel         || '—',
    giftCandle:        sel.candleLabel        || '—',
    giftContainer:     containerNames,
    giftAccessories:   accessoryNames,
    // Individual image URLs per selected component, so the cart/dashboard
    // can show a "fanned" stack of every chosen item's photo instead of
    // just one image. Additive — old cart/order items without these
    // fields simply fall back to the single `img` above.
    giftCandleImg:     sel.candleImg || '',
    giftContainerImgs: Object.values(_selectedContainers).map(function(c){ return c.img || ''; }).filter(Boolean),
    giftAccessoryImgs: Object.values(_selectedAccessories).map(function(a){ return a.img || ''; }).filter(Boolean),
    // Flat list of {name, price, img} per selected component — used for
    // the labeled "enlarged" gallery view (cart/checkout/track/dashboard).
    giftComponents:    buildGiftComponents(),
    // Stable-id fields — used for stock tracking instead of the display
    // strings above (which stay only for human-readable summaries).
    giftCandleId:      sel.candleId || null,
    giftContainerIds:  Object.values(_selectedContainers).reduce(function(ids, c){
      for (var qi = 0; qi < (c.qty||1); qi++) ids.push(c.id);
      return ids;
    }, []),
    giftAccessoryIds:  Object.values(_selectedAccessories).map(function(a){ return a.id; }).filter(Boolean)
  };

  var cart = window.CartService.loadCart();
  cart.push(giftItem);
  window.CartService.saveCart(cart);
  window.location.href = 'checkout.html';
}

// Separate from goCheckout() — goCheckout() is still used unchanged by the
// top-nav cart icon. This builds the identical giftItem shape, but instead
// of jumping straight to checkout, it adds to the cart, opens the cart
// sidebar on home.html, and lets the user keep shopping or proceed from there.
function addCustomGiftToCart() {
  var btn = document.getElementById('addCustomGiftBtn');
  if (btn) {
    if (btn.disabled) return; // guard against double-clicks adding duplicate items
    btn.disabled = true;
    btn.style.opacity = '0.6';
    btn.style.cursor = 'default';
  }

  var totals = calculateCustomGiftTotals();
  var total = totals.subtotal;
  var pct = totals.discountPct;
  var discountedTotal = totals.finalTotal;

  var containerNames = Object.values(_selectedContainers)
    .map(function(c){ return c.name + ((c.qty||1) > 1 ? ' x' + c.qty : ''); })
    .join(', ') || '—';
  var accessoryNames = Object.values(_selectedAccessories)
    .map(function(a){ return a.name; }).join(', ') || '—';

  var giftItem = {
    cartKey:           'giftset_' + Date.now(),
    isGiftSet:         true,
    name:              'Custom Gift Set',
    img:               sel.candleImg || sel.sizeImg || '',
    price:             discountedTotal,
    originalPrice:     total,
    volumeDiscountPct: pct,
    qty:               1,
    giftSize:          sel.sizeLabel         || '—',
    giftCandle:        sel.candleLabel        || '—',
    giftContainer:     containerNames,
    giftAccessories:   accessoryNames,
    // Individual image URLs per selected component, so the cart/dashboard
    // can show a "fanned" stack of every chosen item's photo instead of
    // just one image. Additive — old cart/order items without these
    // fields simply fall back to the single `img` above.
    giftCandleImg:     sel.candleImg || '',
    giftContainerImgs: Object.values(_selectedContainers).map(function(c){ return c.img || ''; }).filter(Boolean),
    giftAccessoryImgs: Object.values(_selectedAccessories).map(function(a){ return a.img || ''; }).filter(Boolean),
    // Flat list of {name, price, img} per selected component — used for
    // the labeled "enlarged" gallery view (cart/checkout/track/dashboard).
    giftComponents:    buildGiftComponents(),
    // Stable-id fields — used for stock tracking instead of the display
    // strings above (which stay only for human-readable summaries).
    giftCandleId:      sel.candleId || null,
    giftContainerIds:  Object.values(_selectedContainers).reduce(function(ids, c){
      for (var qi = 0; qi < (c.qty||1); qi++) ids.push(c.id);
      return ids;
    }, []),
    giftAccessoryIds:  Object.values(_selectedAccessories).map(function(a){ return a.id; }).filter(Boolean)
  };

  var cart = window.CartService.loadCart();
  cart.push(giftItem);
  window.CartService.saveCart(cart);
  updateCartBadge();

  sessionStorage.setItem('candella_open_cart_on_load', '1');
  window.location.href = 'home.html';
}

function updateCartBadge() {
  var cart = window.CartService.loadCart();
  var count = cart.reduce(function(s,c){ return s + c.qty; }, 0);
  var badge = document.getElementById('cartBadge');
  badge.textContent = count;
  badge.style.display = count > 0 ? 'flex' : 'none';
}

function showToast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show';
  setTimeout(function(){ t.className = 'toast'; }, 2500);
}

updateCartBadge();
