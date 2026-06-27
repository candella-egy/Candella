// js/pages/homeEditor.js
// Moved verbatim out of the TWO <script> blocks in pages/home-editor.html
// (one classic, one type="module") and combined into a single file.
//
// IMPORTANT — loaded as a CLASSIC script (<script src="../js/pages/homeEditor.js">),
// NOT type="module". The original first block was already classic on purpose:
// dynamically-rendered table rows use bare global references like
// onchange="sizesData[3].label=this.value" / "candlesBySizeData['size_0'][2].name=..."
// / "containersData[5].price=..." / "accsData[1].img=...". Those inline attribute
// handlers execute in the real global scope, so sizesData/candlesBySizeData/
// containersData/accsData (and every function called bare, not via window.X) MUST
// remain real globals — which only happens with top-level var/function declarations
// in a classic script. Making this a module would silently break every editable
// cell in every table on this page. The original second block was already
// type="module" but never relied on bare-global access itself (everything it
// exposes uses explicit window.X = ...), so merging it into the same classic
// scope changes nothing for it.
//
// Every function invoked from onclick="" / onchange="" / oninput="" is still
// reachable exactly as before — either as a real global (classic top-level
// function/var) or via explicit window.X assignment.
//
// Stock/ID helpers (slug, validateCatalogBeforeSave, checkCatalogIntegrity)
// come from window.CandellaStock (js/services/stockService.js), loaded
// before this file — not duplicated here.

var CLOUDINARY_CLOUD  = 'ddlrab3yk';
var CLOUDINARY_PRESET = 'candella_reviews';
var currentUploadKey  = null;

function showEditor() {
  document.getElementById('loginSection').style.display = 'none';
  document.getElementById('mainSection').style.display = 'block';
}

/* ── Shop Dropdown Upload ── */
function triggerUpload(key) {
  currentUploadKey = key;
  document.getElementById('fileInput').value = '';
  document.getElementById('fileInput').click();
}
window.triggerUpload = triggerUpload;

async function handleFileSelect(input) {
  var file = input.files[0];
  if (!file || !currentUploadKey) return;
  var key = currentUploadKey;
  var overlay = document.getElementById('uploading_' + key);
  if (overlay) overlay.style.display = 'flex';
  try {
    var fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', CLOUDINARY_PRESET);
    var res = await fetch('https://api.cloudinary.com/v1_1/' + CLOUDINARY_CLOUD + '/image/upload', { method:'POST', body:fd });
    var data = await res.json();
    var url = data.secure_url;
    if (!url) throw new Error('Upload failed');
    await saveImageToFirebase(key, url);
    updateDropPreview(key, url);
    showToast('Image updated!');
  } catch(e) {
    showToast('Upload failed. Try again.');
  }
  if (overlay) overlay.style.display = 'none';
}

function updateDropPreview(key, url) {
  var img = document.getElementById('preview_' + key);
  var ph  = document.getElementById('ph_' + key);
  if (img) { img.src = url; img.style.display = url ? 'block' : 'none'; }
  if (ph)  { ph.style.display = url ? 'none' : 'flex'; }
}

window.removeDropImage = function(key) {
  if (!confirm('Remove this image?')) return;
  saveImageToFirebase(key, '');
  updateDropPreview(key, '');
  showToast('Image removed');
};

/* ── Carousel Order: merged products + custom images ── */
var carouselOrder = undefined; // undefined = not yet received from Firestore; null = doc missing/empty; array = loaded
var legacyCarouselSlidesCache = null; // null = not yet loaded; array once the old carouselSlides doc has been read
// Pure display toggle for the home page — hides every image-kind slide
// from actually rendering there without touching carouselOrder, best
// seller calculation, or anything else that already runs the same way
// regardless of this flag. Videos are unaffected by it either way.
var carouselImagesHidden = false;
var editorProducts = [];
var editorProductsMap = {};
var editorBestSellerIds = new Set();
var ordDragFromIdx = null;

function entryKey(e) { return e.type + ':' + (e.type === 'product' ? e.id : e.url); }

function getVisibleOrderEntries() {
  if (!carouselOrder) return [];
  return carouselOrder.filter(function(e){
    if (e.type === 'custom') return true;
    var p = editorProductsMap[e.id];
    return !!(p && p.stock > 0);
  });
}

// Images and videos are two fully separate grids/lists in the editor UI
// (and always end up images-first/videos-last in the saved order) — these
// just split the one combined visible list by type for that purpose.
function getVisibleImageEntries() {
  return getVisibleOrderEntries().filter(function(e){ return !(e.type === 'custom' && e.isVideo); });
}
function getVisibleVideoEntries() {
  return getVisibleOrderEntries().filter(function(e){ return e.type === 'custom' && e.isVideo; });
}

// Re-inserts hidden (out-of-stock) entries back into the array, right after whichever
// visible entry they used to follow, so dragging the visible cards never loses their place.
function mergeHiddenBack(oldOrder, newVisibleOrder) {
  var visibleKeys = {};
  newVisibleOrder.forEach(function(e){ visibleKeys[entryKey(e)] = true; });
  var hiddenAfter = {};
  var lastVisibleKey = '';
  oldOrder.forEach(function(e){
    var k = entryKey(e);
    if (visibleKeys[k]) { lastVisibleKey = k; }
    else { (hiddenAfter[lastVisibleKey] = hiddenAfter[lastVisibleKey] || []).push(e); }
  });
  var result = [];
  if (hiddenAfter['']) result = result.concat(hiddenAfter['']);
  newVisibleOrder.forEach(function(e){
    result.push(e);
    var k = entryKey(e);
    if (hiddenAfter[k]) result = result.concat(hiddenAfter[k]);
  });
  return result;
}

function renderCarouselGrid() {
  var grid = document.getElementById('carouselGrid');
  var videoGrid = document.getElementById('carouselVideoGrid');
  var hideBtn = document.getElementById('toggleImagesHiddenBtn');
  if (hideBtn) {
    hideBtn.innerHTML = carouselImagesHidden
      ? '<i class="fa-solid fa-eye"></i> Show Images on Home'
      : '<i class="fa-solid fa-eye-slash"></i> Hide Images from Home';
    hideBtn.style.opacity = carouselImagesHidden ? '1' : '0.85';
  }
  if (!grid) return;
  if (!carouselOrder) {
    grid.innerHTML = '<div style="color:#aaa;font-size:13px;grid-column:1/-1;"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>';
    if (videoGrid) videoGrid.innerHTML = grid.innerHTML;
    return;
  }
  var images = getVisibleImageEntries();
  var videos = getVisibleVideoEntries();
  var hiddenCount = carouselOrder.filter(function(e){ return e.type==='product' && !(editorProductsMap[e.id] && editorProductsMap[e.id].stock > 0); }).length;
  var hintHtml = hiddenCount > 0
    ? '<div style="grid-column:1/-1;font-size:11px;color:#b8912a;background:rgba(201,162,77,0.1);padding:8px 12px;border-radius:8px;margin-bottom:4px;"><i class="fa-solid fa-circle-info"></i> ' + hiddenCount + ' out-of-stock product(s) are hidden here — they keep their place and come back once restocked.</div>'
    : '';
  grid.innerHTML = (images.length === 0)
    ? hintHtml + '<div style="color:#aaa;font-size:13px;grid-column:1/-1;text-align:center;padding:32px 0;">No image slides yet. Paste a URL above, or add products with stock.</div>'
    : hintHtml + images.map(function(entry, i){
        if (entry.type === 'custom') {
          return '<div class="slide-card" draggable="true" ondragstart="ordDragStart(event,' + i + ',\'images\')" ondragover="event.preventDefault()" ondrop="ordDrop(event,' + i + ',\'images\')">'
            + '<img src="' + entry.url + '" onerror="this.style.opacity=\'0.3\'" />'
            + '<div class="slide-num">' + (i+1) + '</div>'
            + '<div class="slide-card-footer">Custom Image'
              + '<div style="display:flex;gap:6px;">'
                + '<button title="Copy URL" onclick="copySlideUrl(' + i + ',\'images\')" class="slide-remove" style="color:var(--gold);"><i class="fa-solid fa-copy"></i></button>'
                + '<button onclick="removeCarouselSlide(' + i + ',\'images\')" class="slide-remove"><i class="fa-solid fa-trash"></i></button>'
              + '</div>'
            + '</div>'
            + '<button onclick="removeCarouselSlide(' + i + ',\'images\')" class="slide-remove" style="width:100%;text-align:center;padding:6px 0 10px;"><i class="fa-solid fa-trash"></i></button>'
          + '</div>';
        }
        var p = editorProductsMap[entry.id] || {};
        var bestTag = editorBestSellerIds.has(entry.id) ? ' <i class="fa-solid fa-star" title="Best Seller" style="color:var(--gold);"></i>' : '';
        return '<div class="slide-card" draggable="true" ondragstart="ordDragStart(event,' + i + ',\'images\')" ondragover="event.preventDefault()" ondrop="ordDrop(event,' + i + ',\'images\')" style="' + (entry.hidden ? 'opacity:0.45;' : '') + '">'
          + '<img src="' + (p.img||'') + '" onerror="this.style.opacity=\'0.3\'" />'
          + '<div class="slide-num">' + (i+1) + '</div>'
          + '<div class="slide-card-footer" style="flex-wrap:wrap;gap:4px;">' + (p.name || 'Product') + bestTag
            + '<span style="color:#999;font-weight:600;">EGP ' + (p.price||0) + '</span>'
          + '</div>'
          + '<button onclick="toggleProductSlideHidden(' + i + ')" class="slide-remove" title="' + (entry.hidden ? 'Show on Home carousel' : 'Remove from Home carousel') + '" style="width:100%;text-align:center;padding:6px 0 10px;">'
            + (entry.hidden ? '<i class="fa-solid fa-rotate-left"></i>' : '<i class="fa-solid fa-trash"></i>')
          + '</button>'
        + '</div>';
      }).join('');

  if (videoGrid) {
    videoGrid.innerHTML = (videos.length === 0)
      ? '<div style="color:#aaa;font-size:13px;grid-column:1/-1;text-align:center;padding:32px 0;">No videos yet. Paste a video URL (.mp4/.webm/.mov) above.</div>'
      : videos.map(function(entry, i){
          // pointer-events:none on the <video> itself stops Chrome's own
          // hover overlay (the shrink/fullscreen + play icons) from ever
          // appearing — there's no "controls" attribute here, but newer
          // Chrome still shows that overlay on hover regardless unless the
          // element can't receive pointer events at all. Our own play/pause
          // button sits on top and is the only thing actually clickable.
          return '<div class="slide-card" draggable="true" ondragstart="ordDragStart(event,' + i + ',\'videos\')" ondragover="event.preventDefault()" ondrop="ordDrop(event,' + i + ',\'videos\')">'
            + '<video src="' + entry.url + '" muted loop playsinline disablePictureInPicture controlsList="nodownload nofullscreen noremoteplayback" style="pointer-events:none;"></video>'
            + '<div class="slide-num">' + (i+1) + '</div>'
            + '<div class="slide-card-footer">Custom Video'
              + '<div style="display:flex;gap:6px;">'
                + '<button title="Copy URL" onclick="copySlideUrl(' + i + ',\'videos\')" class="slide-remove" style="color:var(--gold);"><i class="fa-solid fa-copy"></i></button>'
                + '<button onclick="removeCarouselSlide(' + i + ',\'videos\')" class="slide-remove"><i class="fa-solid fa-trash"></i></button>'
              + '</div>'
            + '</div>'
            + '<button class="add-row-btn" onclick="toggleVideoHiddenFromHome(' + i + ')" style="width:100%;justify-content:center;margin:8px 12px 12px;padding:6px 14px;font-size:11px;">'
              + (entry.hidden ? '<i class="fa-solid fa-eye"></i> Show on Home' : '<i class="fa-solid fa-eye-slash"></i> Hide from Home')
            + '</button>'
          + '</div>';
        }).join('');
  }
}

var ordDragPool = null;
window.ordDragStart = function(e, i, pool) { ordDragFromIdx = i; ordDragPool = pool; };
window.ordDrop = function(e, toIdx, pool) {
  e.preventDefault();
  // Dragging is confined to within the same grid — an image card dropped
  // onto the videos grid (or vice versa) is ignored rather than merging
  // the two, since the whole point here is keeping them fully separate.
  if (ordDragFromIdx === null || ordDragPool !== pool || ordDragFromIdx === toIdx) { ordDragFromIdx = null; ordDragPool = null; return; }
  var images = getVisibleImageEntries();
  var videos = getVisibleVideoEntries();
  var list = pool === 'videos' ? videos : images;
  var moved = list.splice(ordDragFromIdx, 1)[0];
  list.splice(toIdx, 0, moved);
  ordDragFromIdx = null;
  ordDragPool = null;
  // Images always saved before videos — that's the "separate sections"
  // rule applied to the actual home-page playback order too, not just
  // how they're displayed here.
  carouselOrder = mergeHiddenBack(carouselOrder, images.concat(videos));
  renderCarouselGrid();
  saveCarouselOrder();
};

// Detected purely from the file extension — no separate "is this a video"
// checkbox needed in the UI. Covers every format the <video> tag plays.
function isVideoUrl(url) {
  return /\.(mp4|webm|mov|m4v|ogg)(\?|#|$)/i.test(url || '');
}

window.addCarouselSlide = function() {
  var inp = document.getElementById('carouselUrlInput');
  var url = (inp.value || '').trim();
  if (!url) { showToast('Paste an image or video URL first'); return; }
  if (!carouselOrder) carouselOrder = [];
  var customCount = carouselOrder.filter(function(e){ return e.type === 'custom'; }).length;
  if (customCount >= 10) { showToast('Max 10 custom slides'); return; }
  var entry = { type: 'custom', url: url };
  if (isVideoUrl(url)) entry.isVideo = true;
  if (entry.isVideo) {
    carouselOrder.push(entry); // videos always go after every existing video
  } else {
    // Images must stay ahead of every video in the saved order — insert
    // right before the first video entry instead of always appending,
    // so a fresh image never lands after an existing video by accident.
    var firstVideoIdx = carouselOrder.findIndex(function(e){ return e.type === 'custom' && e.isVideo; });
    if (firstVideoIdx === -1) carouselOrder.push(entry);
    else carouselOrder.splice(firstVideoIdx, 0, entry);
  }
  inp.value = '';
  renderCarouselGrid();
  saveCarouselOrder();
  showToast(entry.isVideo ? 'Video added!' : 'Image added!');
};

window.removeCarouselSlide = function(i, pool) {
  var visible = pool === 'videos' ? getVisibleVideoEntries() : getVisibleImageEntries();
  var entry = visible[i];
  if (!entry || entry.type !== 'custom') return;
  if (!confirm('Remove this ' + (entry.isVideo ? 'video' : 'image') + '?')) return;
  var idx = carouselOrder.indexOf(entry);
  if (idx > -1) carouselOrder.splice(idx, 1);
  renderCarouselGrid();
  saveCarouselOrder();
  showToast(entry.isVideo ? 'Video removed' : 'Image removed');
};

// For a PRODUCT slide this can't be a real removal the way it is for a
// custom image — reconcileCarouselOrder() auto re-adds any product that
// isn't already referenced in carouselOrder, so deleting the entry would
// just bring it right back on the next save/reload. Flagging it `hidden`
// instead keeps the entry (so reconcile sees it as already accounted for
// and leaves it alone) while home.js skips rendering it — the product
// itself is completely untouched everywhere else on the site (Shop,
// stock, etc.), this only ever affects whether it shows in the Home
// carousel.
window.toggleProductSlideHidden = function(i) {
  var visible = getVisibleImageEntries();
  var entry = visible[i];
  if (!entry || entry.type !== 'product') return;
  entry.hidden = !entry.hidden;
  renderCarouselGrid();
  saveCarouselOrder();
  showToast(entry.hidden ? 'Removed from Home carousel' : 'Back on Home carousel');
};

// Per-video "Hide from Home" toggle — same button style as the bulk
// "Hide Images from Home" toggle, just scoped to one specific video.
// Stored directly on that video's own carouselOrder entry (`hidden`), so
// it survives reordering and saves alongside everything else.
window.toggleVideoHiddenFromHome = function(i) {
  var videos = getVisibleVideoEntries();
  var entry = videos[i];
  if (!entry) return;
  entry.hidden = !entry.hidden;
  renderCarouselGrid();
  saveCarouselOrder();
  showToast(entry.hidden ? 'Video hidden from Home' : 'Video visible on Home again');
};

window.copySlideUrl = function(i, pool) {
  var visible = pool === 'videos' ? getVisibleVideoEntries() : getVisibleImageEntries();
  var entry = visible[i];
  if (!entry) return;
  var url = entry.type === 'custom' ? entry.url : ((editorProductsMap[entry.id] && editorProductsMap[entry.id].img) || '');
  navigator.clipboard.writeText(url).then(function(){ showToast('URL copied!'); });
};

async function saveCarouselOrder() {
  if (window._fbSaveCarouselOrder && carouselOrder) await window._fbSaveCarouselOrder(carouselOrder, carouselImagesHidden);
}

// Single switch for every image slide at once — leaves carouselOrder,
// best-seller calculation, and ordering completely untouched, so turning
// images back on shows them exactly where they already were.
window.toggleCarouselImagesHidden = function() {
  carouselImagesHidden = !carouselImagesHidden;
  renderCarouselGrid();
  saveCarouselOrder();
  showToast(carouselImagesHidden ? 'Images hidden from Home' : 'Images visible on Home again');
};

// Keeps the stored order in sync with reality: drops deleted products, auto-inserts brand-new
// ones (best sellers right after the current best-seller block, others at the end), and on first
// run ever builds the initial order (best sellers first, then the rest, then any legacy slides).
function reconcileCarouselOrder() {
  if (carouselOrder === undefined) return; // still waiting on Firestore
  if (carouselOrder === null) {
    if (legacyCarouselSlidesCache === null) return; // still waiting on the legacy doc read
    if (!editorProducts.length) { renderCarouselGrid(); return; }
    var bestArr  = editorProducts.filter(function(p){ return editorBestSellerIds.has(p.id); });
    var otherArr = editorProducts.filter(function(p){ return !editorBestSellerIds.has(p.id); });
    var initial = bestArr.concat(otherArr).map(function(p){ return { type:'product', id:p.id }; });
    if (legacyCarouselSlidesCache.length) {
      initial = initial.concat(legacyCarouselSlidesCache.map(function(url){ return { type:'custom', url:url }; }));
    }
    carouselOrder = initial;
    renderCarouselGrid();
    saveCarouselOrder();
    return;
  }
  if (!editorProducts.length) { renderCarouselGrid(); return; }
  var changed = false;
  var filtered = carouselOrder.filter(function(e){
    if (e.type !== 'product') return true;
    var keep = !!editorProductsMap[e.id];
    if (!keep) changed = true;
    return keep;
  });
  var referenced = {};
  filtered.forEach(function(e){ if (e.type === 'product') referenced[e.id] = true; });
  var newOnes = editorProducts.filter(function(p){ return !referenced[p.id]; });
  if (newOnes.length) {
    changed = true;
    newOnes.forEach(function(p){
      var entry = { type:'product', id:p.id };
      if (editorBestSellerIds.has(p.id)) {
        var insertAt = 0;
        for (var i = 0; i < filtered.length; i++) {
          if (filtered[i].type === 'product' && editorBestSellerIds.has(filtered[i].id)) insertAt = i + 1;
          else break;
        }
        filtered.splice(insertAt, 0, entry);
      } else {
        // Insert before the first video rather than always appending —
        // a brand-new (non-best-seller) product must still land in the
        // images section, never after an existing video.
        var firstVideoIdx = filtered.findIndex(function(e){ return e.type === 'custom' && e.isVideo; });
        if (firstVideoIdx === -1) filtered.push(entry);
        else filtered.splice(firstVideoIdx, 0, entry);
      }
    });
  }
  carouselOrder = filtered;
  renderCarouselGrid();
  if (changed) saveCarouselOrder();
}

window.setEditorProducts = function(arr) {
  editorProducts = arr;
  editorProductsMap = {};
  arr.forEach(function(p){ editorProductsMap[p.id] = p; });
  reconcileCarouselOrder();
};
window.setEditorBestSellers = function(idsArray) {
  editorBestSellerIds = new Set(idsArray);
  reconcileCarouselOrder();
};
window.setCarouselOrderFromFirestore = function(orderOrNull) {
  carouselOrder = orderOrNull;
  reconcileCarouselOrder();
};
window.setLegacyCarouselSlides = function(arr) {
  legacyCarouselSlidesCache = arr;
  reconcileCarouselOrder();
};

/* ── Gift Hero ── */
window.saveGiftHero = async function() {
  var url = (document.getElementById('giftHeroUrlInput').value || '').trim();
  if (!url) { showToast('Paste a URL first'); return; }
  if (window._fbSaveGiftHero) await window._fbSaveGiftHero(url);
  var pv = document.getElementById('giftHeroPreview');
  var pi = document.getElementById('giftHeroPreviewImg');
  pi.src = url; pv.style.display = 'block';
  showToast('Hero image saved!');
};

/* ── Sizes table ── */
var sizesData = [];
function renderSizesTable() {
  var tbody = document.getElementById('sizesTbody');
  tbody.innerHTML = sizesData.map(function(s, i){
    return '<tr>'
      + '<td><input value="' + esc(s.label) + '" onchange="sizesData[' + i + '].label=this.value" /></td>'
      + '<td><input value="' + esc(s.weight||'') + '" placeholder="e.g. 750g" onchange="sizesData[' + i + '].weight=this.value" /></td>'
      + '<td><input value="' + esc(s.img||'') + '" placeholder="https://…" onchange="sizesData[' + i + '].img=this.value" /></td>'
      + '<td><button class="row-del-btn" onclick="sizesData.splice(' + i + ',1);renderSizesTable()"><i class="fa-solid fa-xmark"></i></button></td>'
    + '</tr>';
  }).join('');
}
window.addSizeRow = function() { sizesData.push({label:'',weight:'',price:0,img:''}); renderSizesTable(); };
window.saveSizes = async function() {
  if (window._fbSaveSizes) await window._fbSaveSizes(sizesData);
  buildSizeTabsBar();
  showToast('Sizes saved!');
};

/* ── Candles per Size ── */
var candlesBySizeData = {};   // { sizeKey: [{name, scent, price, img}, ...] }
var activeSizeKey = null;
var activeSizeLabelText = '';

function buildSizeTabsBar() {
  var bar = document.getElementById('sizeTabsBar');
  if (!sizesData || sizesData.length === 0) {
    bar.innerHTML = '<span style="color:#aaa;font-size:13px;">Add sizes first (section above)</span>';
    document.getElementById('candlesForSizeWrap').style.display = 'none';
    return;
  }
  bar.innerHTML = sizesData.map(function(s, i) {
    var key = 'size_' + i;
    var isActive = (key === activeSizeKey);
    return '<button onclick="selectSizeTab(\'' + key + '\',\'' + esc(s.label) + '\')" style="padding:8px 18px;border-radius:8px;border:1.5px solid ' + (isActive ? 'var(--gold)' : '#ddd') + ';background:' + (isActive ? 'rgba(201,162,77,0.12)' : '#fff') + ';color:' + (isActive ? 'var(--gold)' : '#555') + ';font-family:Montserrat,sans-serif;font-size:12px;font-weight:700;cursor:pointer;letter-spacing:1px;">'
      + esc(s.label) + (s.weight ? ' (' + esc(s.weight) + ')' : '') + '</button>';
  }).join('');
}

window.selectSizeTab = function(key, label) {
  activeSizeKey = key;
  activeSizeLabelText = label;
  document.getElementById('activeSizeLabel').textContent = label;
  document.getElementById('candlesForSizeWrap').style.display = 'block';
  if (!candlesBySizeData[key]) candlesBySizeData[key] = [];
  renderCandlesTable();
  buildSizeTabsBar();
};

function renderCandlesTable() {
  if (!activeSizeKey) return;
  var data = candlesBySizeData[activeSizeKey] || [];
  var tbody = document.getElementById('candlesTbody');
  tbody.innerHTML = data.map(function(c, i) {
    return '<tr>'
      + '<td><input value="' + esc(c.name||'') + '" placeholder="e.g. Black Candle" onchange="candlesBySizeData[\'' + activeSizeKey + '\'][' + i + '].name=this.value" /></td>'
      + '<td><input value="' + esc(c.scent||'') + '" placeholder="e.g. Oud" onchange="candlesBySizeData[\'' + activeSizeKey + '\'][' + i + '].scent=this.value" /></td>'
      + '<td><input type="number" value="' + (c.price||0) + '" onchange="candlesBySizeData[\'' + activeSizeKey + '\'][' + i + '].price=+this.value" style="max-width:90px;" /></td>'
      + '<td><input value="' + esc(c.img||'') + '" placeholder="https://…" onchange="candlesBySizeData[\'' + activeSizeKey + '\'][' + i + '].img=this.value" /></td>'
      + '<td><button class="row-del-btn" onclick="candlesBySizeData[\'' + activeSizeKey + '\'].splice(' + i + ',1);renderCandlesTable()"><i class="fa-solid fa-xmark"></i></button></td>'
    + '</tr>';
  }).join('');
}

window.addCandleRow = function() {
  if (!activeSizeKey) { showToast('Select a size tab first'); return; }
  if (!candlesBySizeData[activeSizeKey]) candlesBySizeData[activeSizeKey] = [];
  candlesBySizeData[activeSizeKey].push({name:'', scent:'', price:0, img:''});
  renderCandlesTable();
};

window.saveCandles = async function() {
  if (!activeSizeKey) return;

  // Auto-assign a stable id to any brand-new candle (one without an id
  // yet) before saving — same pattern as container shapes. Existing
  // ids are NEVER touched or regenerated.
  var allCandles = [];
  Object.keys(candlesBySizeData).forEach(function(skey) {
    (candlesBySizeData[skey] || []).forEach(function(c) { allCandles.push({ c: c, skey: skey }); });
  });
  var usedIds = {};
  var generatedIds = [];
  allCandles.forEach(function(entry) { if (entry.c.id) usedIds[entry.c.id] = true; });
  allCandles.forEach(function(entry) {
    var c = entry.c;
    if (c.id || !(c.name||'').trim()) return;
    var si = entry.skey.replace('size_', '');
    var base = 'candle_' + si + '_' + window.CandellaStock.slug(c.name) + (c.scent ? '_' + window.CandellaStock.slug(c.scent) : '');
    var id = base, n = 2;
    while (usedIds[id]) { id = base + '_' + n; n++; }
    usedIds[id] = true;
    c.id = id;
    generatedIds.push(id);
  });

  var validation = window.CandellaStock.validateCatalogBeforeSave(allCandles.map(function(e){ return e.c; }));
  if (!validation.ok) { showToast('❌ ' + validation.message); return; }

  // TEMPORARY — remove once the id system is confirmed stable in production.
  console.log('Generated IDs:', generatedIds);
  console.log('Validation Passed');

  if (window._fbSaveCandles) {
    await window._fbSaveCandles(candlesBySizeData);
    showToast('Candles saved for ' + activeSizeLabelText + '!');
  }
};

/* ── Containers — flat shapes grouped by type (no variants) ── */
var containersData = [];      // full flat list, all types together
var activeContType = 'wood';

function renderContTypeTabs() {
  ['wood','glass','concrete','uncategorized'].forEach(function(t) {
    var btn = document.getElementById('contTypeTab_' + t);
    if (btn) btn.style.background = (t === activeContType) ? 'var(--gold)' : '';
  });
  var labelMap = { wood: 'Wood', glass: 'Glass', concrete: 'Concrete', uncategorized: 'Other / Uncategorized' };
  document.getElementById('activeContTypeLabel').textContent = labelMap[activeContType] || activeContType;
}

window.selectContType = function(type) {
  activeContType = type;
  renderContTypeTabs();
  renderContShapesTable();
};

function renderContShapesTable() {
  var tbody = document.getElementById('contShapesTbody');
  var shapes = containersData.filter(function(c) { return (c.type || 'uncategorized') === activeContType; });
  if (!shapes.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="color:#aaa;text-align:center;padding:14px 0;">No shapes yet for this type. Click "Add Shape".</td></tr>';
    return;
  }
  tbody.innerHTML = shapes.map(function(c) {
    var realIdx = containersData.indexOf(c);
    return '<tr>'
      + '<td><input value="' + esc(c.name||'') + '" placeholder="e.g. Round Wood Bowl" onchange="containersData[' + realIdx + '].name=this.value" /></td>'
      + '<td><input type="number" value="' + (c.price||0) + '" onchange="containersData[' + realIdx + '].price=+this.value" style="max-width:90px;" /></td>'
      + '<td><input value="' + esc(c.image||'') + '" placeholder="https://…" onchange="containersData[' + realIdx + '].image=this.value" /></td>'
      + '<td><button class="row-del-btn" onclick="deleteContShape(' + realIdx + ')"><i class="fa-solid fa-xmark"></i></button></td>'
    + '</tr>';
  }).join('');
}

window.addContShapeRow = function() {
  containersData.push({ id: null, type: activeContType, name: '', image: '', price: 0 });
  renderContShapesTable();
};

window.deleteContShape = function(realIdx) {
  if (!confirm('Delete this shape?')) return;
  containersData.splice(realIdx, 1);
  renderContShapesTable();
};

window.saveContShapes = async function() {
  // Assign a stable id to any brand-new shape (one without an id yet)
  // before saving, the same way candles/accessories get one via the
  // migration — so it's usable for stock tracking immediately.
  var generatedIds = [];
  containersData.forEach(function(c) {
    if (!c.id && (c.name||'').trim()) {
      var base = 'container_' + window.CandellaStock.slug(c.type||'uncategorized') + '_' + window.CandellaStock.slug(c.name);
      var id = base, n = 2;
      while (containersData.some(function(x) { return x !== c && x.id === id; })) { id = base + '_' + n; n++; }
      c.id = id;
      generatedIds.push(id);
    }
  });

  var validation = window.CandellaStock.validateCatalogBeforeSave(containersData);
  if (!validation.ok) { showToast('❌ ' + validation.message); return; }

  // TEMPORARY — remove once the id system is confirmed stable in production.
  console.log('Generated IDs:', generatedIds);
  console.log('Validation Passed');

  if (window._fbSaveContainers) await window._fbSaveContainers(containersData);
  renderContShapesTable();
  showToast('Shapes saved for ' + activeContType + '!');
};

window.saveContTypeImages = async function() {
  var images = {
    wood: document.getElementById('contTypeImg_wood').value.trim(),
    glass: document.getElementById('contTypeImg_glass').value.trim(),
    concrete: document.getElementById('contTypeImg_concrete').value.trim()
  };
  if (window._fbSaveContainerTypeImages) await window._fbSaveContainerTypeImages(images);
  showToast('Type cover images saved!');
};

/* ── Accessories table ── */
var accsData = [];
function renderAccsTable() {
  var tbody = document.getElementById('accsTbody');
  tbody.innerHTML = accsData.map(function(a, i){
    return '<tr>'
      + '<td><input value="' + esc(a.name) + '" onchange="accsData[' + i + '].name=this.value" /></td>'
      + '<td><input type="number" value="' + (a.price||0) + '" onchange="accsData[' + i + '].price=+this.value" style="max-width:90px;" /></td>'
      + '<td><input value="' + esc(a.img||'') + '" placeholder="https://…" onchange="accsData[' + i + '].img=this.value" /></td>'
      + '<td><button class="row-del-btn" onclick="accsData.splice(' + i + ',1);renderAccsTable()"><i class="fa-solid fa-xmark"></i></button></td>'
    + '</tr>';
  }).join('');
}
window.addAccRow = function() { accsData.push({name:'',price:0,img:''}); renderAccsTable(); };
window.saveAccs = async function() {
  // Auto-assign a stable id to any brand-new accessory (one without an
  // id yet) before saving — same pattern as container shapes/candles.
  // Existing ids are NEVER touched or regenerated.
  var usedIds = {};
  var generatedIds = [];
  accsData.forEach(function(a) { if (a.id) usedIds[a.id] = true; });
  accsData.forEach(function(a) {
    if (a.id || !(a.name||'').trim()) return;
    var base = 'acc_' + window.CandellaStock.slug(a.name);
    var id = base, n = 2;
    while (usedIds[id]) { id = base + '_' + n; n++; }
    usedIds[id] = true;
    a.id = id;
    generatedIds.push(id);
  });

  var validation = window.CandellaStock.validateCatalogBeforeSave(accsData);
  if (!validation.ok) { showToast('❌ ' + validation.message); return; }

  // TEMPORARY — remove once the id system is confirmed stable in production.
  console.log('Generated IDs:', generatedIds);
  console.log('Validation Passed');

  if (window._fbSaveAccs) await window._fbSaveAccs(accsData);
  renderAccsTable();
  showToast('Accessories saved!');
};

/* ── More Pages Editor ── */
// DEFAULT_MORE_SECTIONS data now lives in js/shared/moreSections.js
// (loaded before this classic script) — this file isn't a module, so the
// bare identifier already resolves to that shared window.X global as-is.
var MORE_SECTIONS   = DEFAULT_MORE_SECTIONS.slice();
var morePagesData   = {};  // key → { img, text }
var moreActiveKey   = null;

function buildMoreTabs() {
  var bar = document.getElementById('morePagesTabsBar');
  if (!bar) return;
  bar.innerHTML = MORE_SECTIONS.map(function(s) {
    var isActive = s.key === moreActiveKey;
    return '<span style="display:inline-flex;align-items:center;border-radius:999px;border:1px solid '
      + (isActive ? 'var(--gold)' : '#ddd') + ';background:' + (isActive ? 'var(--gold)' : '#fff') + ';overflow:hidden;">'
      + '<button onclick="openMoreSection(\'' + s.key + '\')" style="'
      + 'padding:8px 6px 8px 16px;border:none;background:transparent;'
      + 'color:' + (isActive ? '#fff' : '#555') + ';'
      + 'font-family:\'Montserrat\',sans-serif;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;letter-spacing:0.5px;'
      + '">' + esc(s.label) + '</button>'
      + '<i class="fa-solid fa-pen" onclick="renameMoreSection(\'' + s.key + '\')" title="Edit name" style="'
      + 'padding:8px 6px;cursor:pointer;font-size:10px;color:' + (isActive ? '#fff' : '#999') + ';"></i>'
      + '<i class="fa-solid fa-trash" onclick="deleteMoreSection(\'' + s.key + '\')" title="Delete page" style="'
      + 'padding:8px 12px 8px 6px;cursor:pointer;font-size:10px;color:' + (isActive ? '#fff' : '#c0392b') + ';"></i>'
      + '</span>';
  }).join('');
}

window.renameMoreSection = function(key) {
  var s = MORE_SECTIONS.find(function(x){ return x.key === key; });
  if (!s) return;
  var newLabel = prompt('اسم الصفحة الجديد:', s.label);
  if (newLabel === null) return;
  newLabel = newLabel.trim();
  if (!newLabel) return;
  s.label = newLabel;
  buildMoreTabs();
  if (moreActiveKey === key) document.getElementById('moreActiveLabel').textContent = newLabel;
  saveMoreSections();
};

window.deleteMoreSection = function(key) {
  var s = MORE_SECTIONS.find(function(x){ return x.key === key; });
  if (!s) return;
  if (!confirm('تأكيد حذف صفحة "' + s.label + '"؟ هتختفي من قائمة More.')) return;
  MORE_SECTIONS = MORE_SECTIONS.filter(function(x){ return x.key !== key; });
  if (moreActiveKey === key) {
    moreActiveKey = null;
    document.getElementById('morePageEditor').style.display = 'none';
  }
  buildMoreTabs();
  saveMoreSections();
};

window.addMoreSection = function() {
  var label = prompt('اسم الصفحة الجديدة:');
  if (label === null) return;
  label = label.trim();
  if (!label) return;
  var key = label.toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, '_').replace(/^_+|_+$/g, '') || ('page_' + Date.now());
  var baseKey = key, n = 1;
  while (MORE_SECTIONS.some(function(x){ return x.key === key; })) { key = baseKey + '_' + (++n); }
  MORE_SECTIONS.push({ key: key, label: label });
  buildMoreTabs();
  saveMoreSections();
};

function saveMoreSections() {
  if (window._fbSaveMoreSections) window._fbSaveMoreSections(MORE_SECTIONS);
}

window.openMoreSection = function(key) {
  moreActiveKey = key;
  buildMoreTabs();
  var s = MORE_SECTIONS.find(function(x){ return x.key === key; });
  document.getElementById('moreActiveLabel').textContent = s ? s.label : key;
  var d = morePagesData[key] || {};
  // image
  var img    = document.getElementById('moreImgPreview');
  var ph     = document.getElementById('moreImgPlaceholder');
  var urlInp = document.getElementById('moreImgUrlInput');
  if (d.img) {
    img.src = d.img; img.style.display = 'block'; ph.style.display = 'none';
    urlInp.value = d.img;
  } else {
    img.style.display = 'none'; ph.style.display = 'flex'; urlInp.value = '';
  }
  // text
  document.getElementById('moreTextInput').value = d.text || '';
  document.getElementById('morePageEditor').style.display = 'block';
};

window.setMoreImgFromUrl = function() {
  var url = (document.getElementById('moreImgUrlInput').value || '').trim();
  if (!url || !moreActiveKey) return;
  var img = document.getElementById('moreImgPreview');
  var ph  = document.getElementById('moreImgPlaceholder');
  img.src = url; img.style.display = 'block'; ph.style.display = 'none';
  if (!morePagesData[moreActiveKey]) morePagesData[moreActiveKey] = {};
  morePagesData[moreActiveKey].img = url;
};

window.removeMoreImg = function() {
  if (!moreActiveKey) return;
  var img = document.getElementById('moreImgPreview');
  var ph  = document.getElementById('moreImgPlaceholder');
  img.src = ''; img.style.display = 'none'; ph.style.display = 'flex';
  document.getElementById('moreImgUrlInput').value = '';
  if (morePagesData[moreActiveKey]) morePagesData[moreActiveKey].img = '';
};

window.triggerMoreImgUpload = function() {
  document.getElementById('moreFileInput').value = '';
  document.getElementById('moreFileInput').click();
};

window.handleMoreFileSelect = async function(input) {
  var file = input.files[0];
  if (!file || !moreActiveKey) return;
  var uploading = document.getElementById('moreImgUploading');
  uploading.style.display = 'flex';
  try {
    var fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', CLOUDINARY_PRESET);
    var res  = await fetch('https://api.cloudinary.com/v1_1/' + CLOUDINARY_CLOUD + '/image/upload', { method:'POST', body:fd });
    var data = await res.json();
    var url  = data.secure_url;
    if (!url) throw new Error('Upload failed');
    var img = document.getElementById('moreImgPreview');
    var ph  = document.getElementById('moreImgPlaceholder');
    img.src = url; img.style.display = 'block'; ph.style.display = 'none';
    document.getElementById('moreImgUrlInput').value = url;
    if (!morePagesData[moreActiveKey]) morePagesData[moreActiveKey] = {};
    morePagesData[moreActiveKey].img = url;
    showToast('Image uploaded!');
  } catch(e) { showToast('Upload failed. Try again.'); }
  uploading.style.display = 'none';
};

window.saveMorePage = async function() {
  if (!moreActiveKey) return;
  var img  = (document.getElementById('moreImgUrlInput').value || '').trim();
  var text = (document.getElementById('moreTextInput').value || '').trim();
  if (!morePagesData[moreActiveKey]) morePagesData[moreActiveKey] = {};
  morePagesData[moreActiveKey].img  = img;
  morePagesData[moreActiveKey].text = text;
  if (window._fbSaveMorePage) {
    await window._fbSaveMorePage(moreActiveKey, { img, text });
    showToast('✅ Page saved!');
  }
};

/* ── Helpers ── */
function esc(s) { return (s||'').replace(/"/g,'&quot;'); }

function showToast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast show';
  setTimeout(function(){ t.className = 'toast'; }, 2800);
}

// ════════════════════════════════════════════
// SUPABASE SETUP (second original block — was type="module",
// never relied on bare-global access itself, so merging it into this
// classic scope changes nothing for it)
// ════════════════════════════════════════════
// If this page was reached via dashboard.html's token relay, authenticate
// this client with that token from the start — otherwise every query
// below (not just the initial admin check) would go out as anon and fail
// under RLS. See js/config/supabase.js for why.
const sb = window.createSupabaseClient(sessionStorage.getItem('candella_admin_token'));
window.attachTokenRefreshListener(sb);

// ===== READ-ONLY: show the raw id/name fields currently on every
// candle/container/accessory in giftSet, so we can see what an
// existing "id" field actually contains without opening DevTools.
// Makes NO changes to any data. =====
window.inspectGiftSetIds = async function() {
  var btn = document.getElementById('inspectIdsBtn');
  var box = document.getElementById('migrationReportBox');
  btn.disabled = true;
  box.style.display = 'block';
  box.textContent = 'Loading…';
  try {
    const { data: giftRow, error } = await sb.from('settings').select('value').eq('key', 'giftSet').maybeSingle();
    if (error) throw error;
    var giftData = (giftRow && giftRow.value) || {};

    var summary = { candles: [], containers: [], accessories: [] };

    var sizes = giftData.sizes || [];
    var candlesBySize = giftData.candlesBySize || {};
    Object.keys(candlesBySize).forEach(function(skey) {
      (candlesBySize[skey] || []).forEach(function(c, ci) {
        summary.candles.push({ sizeKey: skey, index: ci, name: c.name, scent: c.scent, id: c.id, cost: c.cost, stock: c.stock });
      });
    });

    (giftData.containers || []).forEach(function(c, ci) {
      summary.containers.push({ index: ci, name: c.name || c.label, id: c.id, type: c.type, cost: c.cost, stock: c.stock });
    });

    (giftData.accessories || []).forEach(function(a, ai) {
      summary.accessories.push({ index: ai, name: a.name, id: a.id, cost: a.cost, stock: a.stock });
    });

    box.textContent = JSON.stringify(summary, null, 2);
  } catch (e) {
    box.textContent = 'Error loading data: ' + e;
  } finally {
    btn.disabled = false;
  }
};

// ===== CUSTOM CATALOG INTEGRITY CHECK =====
window.runCatalogIntegrityCheck = async function() {
  var btn = document.getElementById('catalogCheckBtn');
  var box = document.getElementById('migrationReportBox');
  btn.disabled = true;
  box.style.display = 'block';
  box.textContent = 'Checking…';
  try {
    const { data: giftRow, error } = await sb.from('settings').select('value').eq('key', 'giftSet').maybeSingle();
    if (error) throw error;
    var giftData = (giftRow && giftRow.value) || {};

    var report = window.CandellaStock.checkCatalogIntegrity(giftData);

    if (report.ok) {
      box.textContent = '✔ Catalog Integrity Passed\n\n' + JSON.stringify(report.counts, null, 2);
    } else {
      box.textContent = '❌ Catalog Integrity FAILED\n\n' + JSON.stringify(report, null, 2);
    }
  } catch (e) {
    box.textContent = 'Error running integrity check: ' + e;
  } finally {
    btn.disabled = false;
  }
};

// ===== AUTH =====
// Same access rule as products.html: doosa (super) can log in directly with her
// own email/password from anywhere. Anyone else MUST arrive via the dashboard
// (which stores a token in sessionStorage before redirecting here) — there is no
// standalone login for non-super users.
window.doLogin = async function() {
  var u = document.getElementById('loginUser').value.trim();
  var p = document.getElementById('loginPass').value;
  var errEl = document.getElementById('loginError');
  var btn = document.querySelector('.login-btn');
  errEl.style.display = 'none';
  if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }
  try {
    const result = await window.adminDirectLogin(sb, u, p);
    if (!result.ok) {
      errEl.textContent = 'Direct access is restricted to the super admin only.';
      errEl.style.display = 'block';
      if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
      return;
    }
    showEditor();
  } catch(e) {
    errEl.textContent = 'Wrong email or password';
    errEl.style.display = 'block';
  }
  if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
};

window.doLogout = async function() {
  await window.adminLogout(sb, 'home-editor.html');
};

// Entry point: check how the user got here.
async function initAccess() {
  const result = await window.resolveAdminAccess(sb);

  if (result.status === 'dashboard-invalid') {
    window.location.href = 'dashboard.html';
    return;
  }

  if (result.status === 'dashboard-granted' || result.status === 'direct-granted') {
    showEditor();
    return;
  }

  // result.status === 'no-session' — login form stays visible (default)
}
initAccess();

/* ── Expose Supabase savers ── */

// Reads the current jsonb value for a settings key, shallow-merges in `patch`,
// and writes it back. Mirrors Firestore's setDoc(..., {merge:true}) behaviour.
async function mergeSettingsKey(key, patch) {
  const { data: row } = await sb.from('settings').select('value').eq('key', key).maybeSingle();
  const current = (row && row.value) ? row.value : {};
  const updated = Object.assign({}, current, patch);
  const { error } = await sb.from('settings').upsert({ key: key, value: updated });
  if (error) throw error;
}

window.saveImageToFirebase = async function(key, url) {
  var upd = {}; upd[key] = url;
  await mergeSettingsKey('homeImages', upd);
};

window._fbSaveCarouselOrder = async function(order, imagesHidden) {
  // Not a merge in the original (merge:false) — fully replaces the document.
  const { error } = await sb.from('settings').upsert({ key: 'carouselOrder', value: { order: order, imagesHidden: !!imagesHidden } });
  if (error) throw error;
};

window._fbSaveGiftHero = async function(url) {
  await mergeSettingsKey('giftSet', { heroImg: url });
};

window._fbSaveSizes = async function(data) {
  await mergeSettingsKey('giftSet', { sizes: data });
};

window._fbSaveCandles = async function(data) {
  await mergeSettingsKey('giftSet', { candlesBySize: data });
};

window._fbSaveAccs = async function(data) {
  await mergeSettingsKey('giftSet', { accessories: data });
};

window._fbSaveContainers = async function(data) {
  await mergeSettingsKey('giftSet', { containers: data });
};

window._fbSaveContainerTypeImages = async function(images) {
  await mergeSettingsKey('giftSet', { containerTypeImages: images });
};

window._fbSaveMorePage = async function(key, pageData) {
  var upd = {}; upd[key] = pageData;
  await mergeSettingsKey('morePages', upd);
};

window._fbSaveMoreSections = async function(sections) {
  await mergeSettingsKey('morePages', { _meta: { sections: sections } });
};

/* ── Load everything live ── */

// Shop dropdown images + categories
var cats = [];
var images = {};

(async function loadCatsAndImages(){
  try {
    const { data: catRow } = await sb.from('settings').select('value').eq('key', 'categories').maybeSingle();
    cats = (catRow && catRow.value && catRow.value.list && catRow.value.list.length > 0)
      ? catRow.value.list
      : [{key:'candles',label:'Scented Candles'},{key:'unscented',label:'Unscented'},{key:'containers',label:'Containers & Accessories'},{key:'offers',label:'Limited Edition'}];
  } catch(e) {
    cats = [{key:'candles',label:'Scented Candles'},{key:'unscented',label:'Unscented'},{key:'containers',label:'Containers & Accessories'},{key:'offers',label:'Limited Edition'}];
  }

  try {
    const { data: imgRow } = await sb.from('settings').select('value').eq('key', 'homeImages').maybeSingle();
    images = (imgRow && imgRow.value) ? imgRow.value : {};
  } catch(e) { images = {}; }

  // نبني الشبكة بعد ما الاتنين (categories + images) يكونوا جاهزين، عشان الصور تظهر من أول مرة
  buildDropGrid();
})();

function buildDropGrid() {
  var grid = document.getElementById('dropImgGrid');
  if (!grid) return;
  var allKeys = [{key:'best', label:'Best Sellers'}].concat(cats.map(function(c){
    return { key: c.key, label: c.label.replace(/^[^\w]+\s*/u,'').trim() || c.label };
  }));
  grid.innerHTML = allKeys.map(function(item){
    var url = images[item.key] || '';
    var phIcon = item.key === 'best'
      ? '<i class="fa-solid fa-fire" style="font-size:24px;color:var(--gold);"></i>'
      : '<i class="fa-solid fa-image" style="font-size:24px;"></i>';
    return '<div class="img-card">'
      + '<div class="img-card-preview" onclick="triggerUpload(\'' + item.key + '\')" style="position:relative;">'
        + '<img id="preview_' + item.key + '" src="' + url + '" style="width:100%;height:100%;object-fit:cover;display:' + (url?'block':'none') + ';" />'
        + '<div id="ph_' + item.key + '" class="img-placeholder" style="display:' + (url?'none':'flex') + ';">' + phIcon + '<span>' + item.label + '</span></div>'
        + '<div class="upload-overlay"><i class="fa-solid fa-cloud-arrow-up" style="font-size:20px;"></i> Upload</div>'
        + '<div class="uploading-overlay" id="uploading_' + item.key + '" style="display:none;position:absolute;inset:0;background:rgba(0,0,0,0.6);align-items:center;justify-content:center;color:#fff;flex-direction:column;gap:8px;"><i class="fa-solid fa-spinner fa-spin" style="font-size:18px;"></i><span>Uploading...</span></div>'
      + '</div>'
      + '<div class="img-card-label">' + item.label + ' <button class="img-remove-btn" onclick="removeDropImage(\'' + item.key + '\')"><i class="fa-solid fa-trash"></i></button></div>'
    + '</div>';
  }).join('');
}

function applyDropImages() {
  Object.keys(images).forEach(function(key){
    var img = document.getElementById('preview_' + key);
    var ph  = document.getElementById('ph_' + key);
    if (img && images[key]) { img.src = images[key]; img.style.display='block'; if(ph) ph.style.display='none'; }
    else if (img) { img.style.display='none'; if(ph) ph.style.display='flex'; }
  });
}

// Products (feed the carousel order's product entries)
(async function loadEditorProducts(){
  try {
    const { data, error } = await sb.from('products').select('*');
    if (error) throw error;
    var arr = (data || []).map(function(row){
      return { id: row.id, name: row.name||'', price: row.price||0, img: row.img||'', stock: typeof row.stock==='number'?row.stock:0, order: typeof row.order==='number'?row.order:0 };
    });
    arr.sort(function(a,b){ return a.order - b.order; });
    window.setEditorProducts(arr);
  } catch(e) { console.error('Failed to load products:', e); }
})();

// Best sellers (used to position brand-new products by default)
// Calculation now comes from OrderService.calculateBestSellerIds
// (js/services/orderService.js) — that returns a Set; this page always
// wanted a plain array, so it's converted right back the same way the
// original filtered array was ordered (Set preserves insertion order, so
// the result is identical).
(async function calcEditorBestSellers(){
  try {
    var idsSet = await window.OrderService.calculateBestSellerIds(sb);
    window.setEditorBestSellers(Array.from(idsSet));
  } catch(e){ console.warn('Best seller calc failed', e); }
})();

// One-time read of the legacy custom-slides doc, used only to migrate old data into the new combined order
sb.from('settings').select('value').eq('key', 'carouselSlides').maybeSingle().then(function(res){
  var urls = (res.data && res.data.value && res.data.value.slides) ? res.data.value.slides : [];
  window.setLegacyCarouselSlides(urls);
}).catch(function(){ window.setLegacyCarouselSlides([]); });

// Carousel order (combined products + custom images, fully admin-managed)
(async function loadCarouselOrder(){
  try {
    const { data: row } = await sb.from('settings').select('value').eq('key', 'carouselOrder').maybeSingle();
    var order = (row && row.value && Array.isArray(row.value.order)) ? row.value.order : null;
    carouselImagesHidden = !!(row && row.value && row.value.imagesHidden);
    window.setCarouselOrderFromFirestore(order);
  } catch(e) { window.setCarouselOrderFromFirestore(null); }
})();

// Gift Set settings
(async function loadGiftSet(){
  try {
    const { data: row } = await sb.from('settings').select('value').eq('key', 'giftSet').maybeSingle();
    var d = (row && row.value) ? row.value : {};

    // Hero
    if (d.heroImg) {
      document.getElementById('giftHeroUrlInput').value = d.heroImg;
      document.getElementById('giftHeroPreviewImg').src = d.heroImg;
      document.getElementById('giftHeroPreview').style.display = 'block';
    }

    // Sizes
    sizesData = d.sizes || [
      {label:'Large', weight:'Sand 1500g', price:320}
    ];
    renderSizesTable();

    // Candles per size
    candlesBySizeData = d.candlesBySize || {};
    buildSizeTabsBar();
    if (activeSizeKey) renderCandlesTable();

    // Accessories
    accsData = d.accessories || [
      {name:'Cotton Wicks', price:55, img:''},
      {name:'Cotton Wicks Premium', price:75, img:''},
      {name:'Wooden Wicks × 15', price:100, img:''}
    ];
    renderAccsTable();

    // Containers (flat shapes, grouped by type)
    containersData = d.containers || [];
    renderContTypeTabs();
    renderContShapesTable();

    // Type cover images
    var typeImgs = d.containerTypeImages || {};
    document.getElementById('contTypeImg_wood').value = typeImgs.wood || '';
    document.getElementById('contTypeImg_glass').value = typeImgs.glass || '';
    document.getElementById('contTypeImg_concrete').value = typeImgs.concrete || '';
  } catch(e) { console.error('Failed to load giftSet:', e); }
})();

// More Pages
// ── Customer Reviews moderation ──
// home.js renders these straight from the `reviews` table with no
// approval step — this list is the only place a review can be removed
// from. Deleting here takes effect for everyone the next time they load
// the home page (home.js reads the table fresh every time, nothing is
// cached server-side).
function renderReviewsManageList(reviews) {
  var wrap = document.getElementById('reviewsManageList');
  if (!wrap) return;
  if (!reviews.length) {
    wrap.innerHTML = '<div style="color:#aaa;font-size:13px;">No reviews yet.</div>';
    return;
  }
  wrap.innerHTML = reviews.map(function(r){
    var mediaHtml = (r.media || []).map(function(m){
      return m.type === 'video'
        ? '<video src="' + m.url + '" muted style="width:56px;height:56px;object-fit:cover;border-radius:6px;flex-shrink:0;"></video>'
        : '<img src="' + m.url + '" style="width:56px;height:56px;object-fit:cover;border-radius:6px;flex-shrink:0;" />';
    }).join('');
    return '<div style="display:flex;gap:14px;align-items:flex-start;background:#f9f7f4;border-radius:10px;padding:14px 16px;">'
      + '<div style="flex:1;min-width:0;">'
        + '<div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;">'
          + '<strong style="color:var(--navy);font-size:14px;">' + (r.name || 'Anonymous') + '</strong>'
          + (r.product ? '<span style="font-size:11px;color:var(--gold);text-transform:uppercase;letter-spacing:1px;">' + r.product + '</span>' : '')
          + '<span style="font-size:11px;color:#c9a24d;">' + '★'.repeat(r.rating || 0) + '</span>'
        + '</div>'
        + '<div style="font-size:13px;color:#555;margin-top:6px;line-height:1.5;">' + (r.text || '') + '</div>'
        + (mediaHtml ? '<div style="display:flex;gap:8px;margin-top:10px;">' + mediaHtml + '</div>' : '')
      + '</div>'
      + '<button onclick="deleteReview(\'' + r.id + '\')" class="slide-remove" title="Delete review" style="flex-shrink:0;font-size:16px;"><i class="fa-solid fa-trash"></i></button>'
    + '</div>';
  }).join('');
}

async function loadReviewsManageList() {
  try {
    const { data, error } = await sb.from('reviews').select('*').order('id', { ascending: false });
    if (error) throw error;
    renderReviewsManageList(data || []);
  } catch(e) {
    var wrap = document.getElementById('reviewsManageList');
    if (wrap) wrap.innerHTML = '<div style="color:#e74c3c;font-size:13px;">Failed to load reviews.</div>';
  }
}

window.deleteReview = async function(id) {
  if (!confirm('Delete this review permanently? It will disappear from the home page for everyone.')) return;
  try {
    const { error } = await sb.from('reviews').delete().eq('id', id);
    if (error) throw error;
    showToast('Review deleted');
    loadReviewsManageList();
  } catch(e) {
    showToast('Failed to delete review');
    console.error(e);
  }
};

loadReviewsManageList();

// Read+fallback logic now comes from window.fetchMoreSections
// (js/shared/moreSections.js).
(async function loadMorePages(){
  try {
    var result = await window.fetchMoreSections(sb);
    morePagesData = result.value;
    MORE_SECTIONS = result.sections.slice();
    buildMoreTabs();
    if (moreActiveKey) window.openMoreSection(moreActiveKey);
  } catch(e) {
    morePagesData = {};
    MORE_SECTIONS = DEFAULT_MORE_SECTIONS.slice();
    buildMoreTabs();
  }
})();
