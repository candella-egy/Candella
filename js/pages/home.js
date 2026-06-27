// js/pages/home.js
// Moved verbatim out of the THREE <script> blocks in pages/home.html (two
// classic, one type="module") and combined into one file, loaded as
// <script type="module" src="../js/pages/home.js"></script> at the end of
// <body>. Safe as a module: every onclick/onchange handler in this page
// calls a function (never mutates a bare global variable directly), and
// every one of those functions is already exposed via window.X — confirmed
// by grep before merging, so module scoping changes nothing observable.
//
// cart / saveCart / removeFromCartByIndex / changeQtyByIndex / goCheckout
// come from js/shared/cart.js (loaded in <head>) — not duplicated here.
// showToast comes from js/shared/toast.js. openMenu/closeMenu come from
// js/shared/nav.js. None of this page's own logic duplicates anything in
// js/services/*.

// ── Carousel ──
// Overlay (name/price/Shop button) shows on hover (mouse, PC) or touch
// (finger, phone) — no click/press needed — and hides as soon as the
// mouse leaves or the finger touches anywhere else. Uses event delegation
// on the track itself (rather than per-slide listeners) so it keeps
// working after renderCarousel() rebuilds the slides' innerHTML.
function carouselOverlayFor(target) {
  var wrap = target.closest && target.closest('.carousel-hover-wrap');
  return wrap ? wrap.querySelector('.carousel-overlay') : null;
}
(function setupCarouselHoverOverlays(){
  var track = document.getElementById('carouselTrack');
  if (!track) return;
  track.addEventListener('mouseover', function(e){
    var overlay = carouselOverlayFor(e.target);
    if (overlay) {
      overlay.style.display = 'flex';
      if (carouselInterval) { clearInterval(carouselInterval); carouselInterval = null; }
    }
  });
  track.addEventListener('mouseout', function(e){
    var wrap = e.target.closest && e.target.closest('.carousel-hover-wrap');
    if (!wrap) return;
    var stillInside = e.relatedTarget && wrap.contains(e.relatedTarget);
    if (!stillInside) {
      var overlay = wrap.querySelector('.carousel-overlay');
      if (overlay) { overlay.style.display = 'none'; resumeCarousel(); }
    }
  });
  track.addEventListener('touchstart', function(e){
    var overlay = carouselOverlayFor(e.target);
    if (overlay) {
      e.stopPropagation();
      overlay.style.display = 'flex';
      if (carouselInterval) { clearInterval(carouselInterval); carouselInterval = null; }
    }
  }, { passive:true });
  document.addEventListener('touchstart', function(e){
    document.querySelectorAll('.carousel-hover-wrap').forEach(function(wrap){
      if (!wrap.contains(e.target)) {
        var overlay = wrap.querySelector('.carousel-overlay');
        if (overlay && overlay.style.display === 'flex') { overlay.style.display = 'none'; resumeCarousel(); }
      }
    });
  }, { passive:true });
})();
var carouselInterval = null;
var carouselIndex = 0;
// Indices of slides that are videos — the 5s auto-advance simply skips its
// tick while sitting on one of these, instead of cutting the video off
// mid-playback. Manually clicking a different thumbnail still works as
// normal; auto-advance just resumes once the customer moves off the video
// slide themselves.
var carouselVideoIndices = new Set();
function resumeCarousel() {
  if (carouselInterval) return;
  var track = document.getElementById('carouselTrack');
  if (!track) return;
  var total = track.children.length;
  if (total <= 1) return;
  carouselInterval = setInterval(function(){
    if (carouselVideoIndices.has(carouselIndex)) return; // stay put on a video slide
    carouselIndex = (carouselIndex + 1) % total;
    track.style.transition = 'transform 0.6s ease-in-out';
    track.style.transform = 'translateX(-' + (carouselIndex * 100) + '%)';
    updateThumbActive(carouselIndex);
  }, 5000);
}
function updateThumbActive(idx) {
  document.querySelectorAll('.carousel-thumb').forEach(function(t, i){
    t.style.opacity = i === idx ? '1' : '0.45';
    t.style.outline = i === idx ? '2px solid #c9a24d' : '2px solid transparent';
  });
}
function goToSlide(idx) {
  carouselIndex = idx;
  var track = document.getElementById('carouselTrack');
  if (track) { track.style.transition = 'transform 0.5s ease-in-out'; track.style.transform = 'translateX(-' + (idx * 100) + '%)'; }
  updateThumbActive(idx);
}
window.goToSlide = goToSlide;

// ── Products + Carousel Order (merged: products + admin custom images) ──
var products = [];
var bestSellerIds = new Set();
var homeImagesCache = {}; // latest settings/homeImages doc, so we know if admin uploaded a manual "best" thumbnail
var carouselOrder = null; // [{type:'product',id}|{type:'custom',url}] from settings/carouselOrder, or null = not set yet
var carouselImagesHidden = false; // admin-side display toggle — see buildCarouselList()

function buildCarouselList() {
  if (!products.length) return [];
  var pmap = {};
  products.forEach(function(p){ pmap[p.id] = p; });
  var list = [];
  if (carouselOrder && carouselOrder.length) {
    var referencedIds = {};
    carouselOrder.forEach(function(e){
      if (e.type === 'custom') {
        if (e.isVideo && e.hidden) return; // this specific video is hidden from Home — skip it entirely
        list.push({ kind:'custom', url: e.url, isVideo: !!e.isVideo });
        return;
      }
      referencedIds[e.id] = true;
      if (e.hidden) return; // admin removed this specific product from the Home carousel (product itself is untouched everywhere else)
      var p = pmap[e.id];
      if (p) list.push({ kind:'product', product: p }); // deleted products are simply skipped
    });
    // Brand-new products not yet reconciled into the saved order (still shown live, not persisted from here)
    products.forEach(function(p){ if (!referencedIds[p.id]) list.push({ kind:'product', product: p }); });
  } else {
    // Fallback (admin hasn't opened the home editor yet): old behavior — in-stock products, best sellers first
    var ordered = products.filter(function(p){ return p.stock > 0; }).slice().sort(function(a,b){
      return (bestSellerIds.has(b.id) ? 1 : 0) - (bestSellerIds.has(a.id) ? 1 : 0);
    });
    list = ordered.map(function(p){ return { kind:'product', product: p }; });
  }
  // Pure display filter — applied last, after every other computation
  // above (best-seller sort, product/order merging) has already run
  // exactly as it always does. Hiding images never changes any of that;
  // it only removes image-kind slides from what actually gets rendered.
  // Videos are never affected by this flag.
  if (carouselImagesHidden) {
    list = list.filter(function(item){ return item.kind === 'custom' && item.isVideo; });
  }
  return list;
}

function renderCarousel() {
  var track = document.getElementById('carouselTrack');
  var thumbsWrap = document.getElementById('carouselThumbs');
  if (!track) return;
  var list = buildCarouselList();
  if (list.length === 0) return;
  carouselVideoIndices = new Set();
  list.forEach(function(item, i){ if (item.kind === 'custom' && item.isVideo) carouselVideoIndices.add(i); });
  track.innerHTML = list.map(function(item){
    if (item.kind === 'custom') {
      var media = item.isVideo
        ? '<video src="' + item.url + '" autoplay muted loop playsinline disablePictureInPicture controlsList="nodownload nofullscreen noremoteplayback" style="width:100%;height:100%;object-fit:cover;display:block;pointer-events:none;"></video>'
        : '<img src="' + item.url + '" loading="eager" style="width:100%;height:100%;object-fit:cover;display:block;" />';
      return '<div style="min-width:100%;height:100%;position:relative;display:flex;align-items:center;justify-content:center;box-sizing:border-box;background:var(--navy);">'
        + media
        + '</div>';
    }
    var p = item.product;
    var soldOut = !(p.stock > 0);
    // min(300px, 70vw) — same 300px on desktop, but shrinks on narrow
    // phone viewports instead of overflowing (no JS/business logic change,
    // pure CSS sizing function).
    var imgStyle = 'width:min(300px,70vw);height:min(300px,70vw);object-fit:cover;border-radius:16px;display:block;box-shadow:0 8px 32px rgba(0,0,0,0.5);' + (soldOut ? 'filter:grayscale(55%) brightness(0.55);' : '');
    var soldOutBadge = soldOut
      ? '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-8deg);background:rgba(24,33,50,0.85);color:#fff;padding:8px 22px;border:1px solid rgba(255,255,255,0.4);border-radius:4px;font-family:\'Montserrat\',sans-serif;font-size:13px;font-weight:700;letter-spacing:3px;text-transform:uppercase;white-space:nowrap;pointer-events:none;">Sold Out</div>'
      : '';
    var overlay = soldOut ? '' :
      '<div class="carousel-overlay" style="display:none;position:absolute;inset:0;border-radius:16px;background:rgba(24,33,50,0.75);backdrop-filter:blur(2px);flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:14px;color:#fff;">'
      + '<div style="font-family:\'Cormorant Garamond\',serif;font-size:18px;font-weight:600;margin-bottom:6px;">' + p.name + '</div>'
      + '<div style="font-size:11px;color:#ddd;margin-bottom:8px;line-height:1.5;">' + (p.desc || '') + '</div>'
      + '<div style="font-size:15px;font-weight:700;color:#c9a24d;margin-bottom:12px;">EGP ' + p.price + '</div>'
      + '<button onclick="event.stopPropagation();window.location.href=\'shop.html?filter=all\'" style="padding:7px 22px;background:#c9a24d;color:#fff;border:none;border-radius:999px;font-family:\'Montserrat\',sans-serif;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;cursor:pointer;">Shop</button>'
      + '</div>';
    var wrapClass = soldOut ? '' : ' class="carousel-hover-wrap"';
    return '<div style="min-width:100%;height:100%;position:relative;display:flex;align-items:center;justify-content:center;box-sizing:border-box;background:var(--navy);" onclick="window.location.href=\'shop.html?filter=all\'">'
      + '<div style="position:relative;flex-shrink:0;"' + wrapClass + '>'
      + '<img src="' + p.img + '" alt="' + p.name + '" loading="eager" fetchpriority="high" style="' + imgStyle + '" />'
      + soldOutBadge
      + overlay
      + '</div></div>';
  }).join('');
  if (thumbsWrap) {
    // When images are hidden and only the video is showing to the
    // customer, there's nothing left to navigate between — the thumbnail
    // strip (whose whole purpose is jumping to a different slide) just
    // hides itself. Re-enabling images brings it straight back.
    thumbsWrap.style.display = carouselImagesHidden ? 'none' : '';
    thumbsWrap.innerHTML = list.map(function(item, i){
      var thumbStyle = 'width:52px;height:52px;object-fit:cover;border-radius:8px;cursor:pointer;flex-shrink:0;transition:opacity 0.2s,outline 0.2s;opacity:' + (i===0?'1':'0.45') + ';outline:' + (i===0?'2px solid #c9a24d':'2px solid transparent') + ';outline-offset:2px;';
      // A video file can't be used as its own thumbnail image (an <img
      // src="video.mp4"> just shows a broken-image icon) — show a small
      // play-icon tile instead, same size/behavior as every other thumb.
      if (item.kind === 'custom' && item.isVideo) {
        return '<div class="carousel-thumb" onclick="goToSlide(' + i + ')" style="' + thumbStyle + 'background:var(--navy);display:flex;align-items:center;justify-content:center;color:#fff;font-size:16px;"><i class="fa-solid fa-play"></i></div>';
      }
      var thumbUrl = item.kind === 'custom' ? item.url : item.product.img;
      return '<img src="' + thumbUrl + '" class="carousel-thumb" loading="' + (i===0?'eager':'lazy') + '" onclick="goToSlide(' + i + ')" style="' + thumbStyle + '" />';
    }).join('');
  }
  carouselIndex = 0;
  track.style.transition = 'none';
  track.style.transform = 'translateX(0%)';
  if (carouselInterval) clearInterval(carouselInterval);
  if (list.length > 1) {
    carouselInterval = setInterval(function(){
      carouselIndex = (carouselIndex + 1) % list.length;
      track.style.transition = 'transform 0.6s ease-in-out';
      track.style.transform = 'translateX(-' + (carouselIndex * 100) + '%)';
      updateThumbActive(carouselIndex);
    }, 5000);
  }
}

window.initProducts = function(arr) {
  products = arr;
  // Preload carousel images
  arr.forEach(function(p){ if(p.img){ var i=new Image(); i.src=p.img; } });
  renderCarousel();
  window.applyBestSellerImage();
};

// ── Best Sellers dropdown thumbnail: falls back to the real top-selling product's photo
//    whenever the admin hasn't uploaded a manual image for it in the Home Editor ──
window.applyBestSellerImage = function() {
  var img = document.getElementById('dropImg_best');
  var ph  = document.getElementById('dropImgPlaceholder_best');
  if (!img) return;
  if (homeImagesCache && homeImagesCache.best) return; // manual image takes priority, already applied
  var bestProduct = products.find(function(p){ return bestSellerIds.has(p.id) && p.img; });
  if (bestProduct) {
    img.src = bestProduct.img;
    img.style.display = 'block';
    if (ph) ph.style.display = 'none';
  }
};

// ── Gift-set "fanned" image stack — shows every selected component's
// photo (candle/containers/accessories) overlapping like a hand of cards,
// instead of just one image. Falls back to the single `img` field for
// older cart/order items saved before these per-component fields existed. ──
function giftImageStack(item, size) {
  size = size || 52;
  var imgs = [];
  if (item.giftCandleImg) imgs.push(item.giftCandleImg);
  if (item.giftContainerImgs) imgs = imgs.concat(item.giftContainerImgs);
  if (item.giftAccessoryImgs) imgs = imgs.concat(item.giftAccessoryImgs);
  if (!imgs.length && item.img) imgs.push(item.img);
  if (!imgs.length) {
    return '<div style="width:' + size + 'px;height:' + size + 'px;background:#f0ede8;border-radius:6px;flex-shrink:0;"></div>';
  }
  // Prefer the richer {name, price, img} list for the enlarged gallery —
  // falls back to bare images (no label/price) for older orders saved
  // before giftComponents existed.
  var components = (item.giftComponents && item.giftComponents.length)
    ? item.giftComponents
    : imgs.map(function(url){ return { name: '', price: null, img: url }; });
  var shown = imgs.slice(0, 4); // cap so the fan stays readable
  var stackWidth = size + (shown.length - 1) * Math.round(size * 0.2);
  var enc = encodeURIComponent(JSON.stringify(components));
  return '<div onclick="event.stopPropagation();openGiftGallery(\'' + enc + '\')" style="cursor:zoom-in;position:relative;width:' + stackWidth + 'px;height:' + size + 'px;flex-shrink:0;">'
    + shown.map(function(url, i) {
        var rot = (i - (shown.length - 1) / 2) * 8;
        return '<img src="' + url + '" loading="lazy" style="position:absolute;left:' + (i * Math.round(size * 0.2)) + 'px;top:0;width:' + size + 'px;height:' + size + 'px;object-fit:cover;border-radius:6px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.18);transform:rotate(' + rot + 'deg);z-index:' + i + ';" />';
      }).join('')
    + '</div>';
}
// openGiftGallery now comes from js/shared/giftGallery.js (loaded before
// this file) — same defaults this page already used (z-index 9999, lazy
// thumbnails), so this call site didn't need to change.

// ── Cart ──
// cart / saveCart / removeFromCartByIndex / changeQtyByIndex / goCheckout
// now come from js/shared/cart.js (loaded in <head>).
function updateCartUI() {
  var badge = document.getElementById('cartBadge');
  var total = 0, count = 0;
  for(var i=0;i<cart.length;i++){ total += cart[i].price * cart[i].qty; count += cart[i].qty; }
  if (badge) { badge.textContent = count; badge.style.display = count > 0 ? 'flex' : 'none'; }
  var totalEl = document.getElementById('cartTotal');
  if (totalEl) totalEl.textContent = total;
  var itemsEl = document.getElementById('cartItems');
  if (!itemsEl) return;
  if(cart.length === 0){ itemsEl.innerHTML = '<p class="cart-empty">Your cart is empty 🛒</p>'; return; }
  itemsEl.innerHTML = cart.map(function(c, idx){
    if (c.isGiftSet) {
      return '<div class="cart-item">' + giftImageStack(c)
        + '<div class="cart-item-info">'
        + '<span class="cart-item-name">Custom Gift Set</span>'
        + '<span style="font-size:10px;color:#aaa;display:block;line-height:1.6;">'
        + (c.giftSize ? 'Size: ' + c.giftSize + '<br>' : '')
        + (c.giftCandle ? 'Candle: ' + c.giftCandle + '<br>' : '')
        + (c.giftContainer && c.giftContainer !== '—' ? 'Container: ' + c.giftContainer + '<br>' : '')
        + (c.giftAccessories && c.giftAccessories !== '—' && c.giftAccessories !== 'None' ? 'Accessories: ' + c.giftAccessories : '')
        + '</span>'
        + '<span class="cart-item-price">EGP ' + (c.price * c.qty) + '</span>'
        + '<div class="qty-ctrl"><button onclick="changeQtyByIndex(' + idx + ',-1)">&#8722;</button><span>' + c.qty + '</span><button onclick="changeQtyByIndex(' + idx + ',1)">+</button></div>'
        + '</div><button class="remove-btn" onclick="removeFromCartByIndex(' + idx + ')">&#10005;</button></div>';
    }
    var sub = '';
    if(c.scent) sub += '<span style="font-size:10px;color:#aaa;">Scent: ' + c.scent + '</span><br>';
    return '<div class="cart-item"><img src="' + c.img + '" alt="' + c.name + '" loading="lazy" />'
      + '<div class="cart-item-info"><span class="cart-item-name">' + c.name + '</span>' + sub
      + '<span class="cart-item-price">EGP ' + (c.price * c.qty) + '</span>'
      + '<div class="qty-ctrl"><button onclick="changeQtyByIndex(' + idx + ',-1)">&#8722;</button><span>' + c.qty + '</span><button onclick="changeQtyByIndex(' + idx + ',1)">+</button></div>'
      + '</div><button class="remove-btn" onclick="removeFromCartByIndex(' + idx + ')">&#10005;</button></div>';
  }).join('');
}
window.updateCartUI = updateCartUI;
var cartOpen = false;
function toggleCart(forceOpen) {
  cartOpen = forceOpen !== undefined ? forceOpen : !cartOpen;
  document.getElementById('cartSidebar').classList.toggle('open', cartOpen);
  document.getElementById('cartOverlay').classList.toggle('show', cartOpen);
}
window.toggleCart = toggleCart;
// showToast (js/shared/toast.js) and openMenu/closeMenu (js/shared/nav.js)
// now come from shared scripts loaded in <head>.

function toggleNewShopDrop() {
  var menu = document.getElementById('newShopDropMenu');
  var icon = document.getElementById('shopRowIcon');
  if (!menu) return;
  var isOpen = menu.style.maxHeight && menu.style.maxHeight !== '0px';
  menu.style.maxHeight = isOpen ? '0px' : '400px';
  if (icon) icon.textContent = isOpen ? '+' : '×';
}
window.toggleNewShopDrop = toggleNewShopDrop;

function toggleMoreDrop() {
  var menu = document.getElementById('moreDropMenu');
  var icon = document.getElementById('moreRowIcon');
  if (!menu) return;
  var isOpen = menu.style.maxHeight && menu.style.maxHeight !== '0px';
  // Fixed 600px clipped the list whenever there were more "More" sections
  // than that could fit (the div has overflow:hidden, no scrollbar of its
  // own). Using the real content height instead means every section
  // always shows, no matter how many are configured in Home Editor.
  menu.style.maxHeight = isOpen ? '0px' : (menu.scrollHeight + 'px');
  if (icon) icon.textContent = isOpen ? '+' : '×';
}
window.toggleMoreDrop = toggleMoreDrop;

function toggleContactDrop() {
  var menu = document.getElementById('contactDropMenu');
  var icon = document.getElementById('contactRowIcon');
  if (!menu) return;
  var isOpen = menu.style.maxHeight && menu.style.maxHeight !== '0px';
  menu.style.maxHeight = isOpen ? '0px' : '200px';
  if (icon) icon.textContent = isOpen ? '+' : '×';
}
window.toggleContactDrop = toggleContactDrop;

// ── Cloudinary ──
var CLOUDINARY_CLOUD = 'ddlrab3yk';
var CLOUDINARY_PRESET = 'candella_reviews';
var selectedMediaFiles = [];

// ── Reviews ──
var selectedRating = 0;
document.querySelectorAll('.star-pick').forEach(function(star){
  star.addEventListener('mouseover', function(){
    var val = parseInt(this.getAttribute('data-val'));
    document.querySelectorAll('.star-pick').forEach(function(s){ s.classList.toggle('hovered', parseInt(s.getAttribute('data-val')) <= val); });
  });
  star.addEventListener('mouseout', function(){
    document.querySelectorAll('.star-pick').forEach(function(s){ s.classList.remove('hovered'); });
  });
  star.addEventListener('click', function(){
    selectedRating = parseInt(this.getAttribute('data-val'));
    document.getElementById('rRating').value = selectedRating;
    document.querySelectorAll('.star-pick').forEach(function(s){ s.classList.toggle('selected', parseInt(s.getAttribute('data-val')) <= selectedRating); });
  });
});

window.handleMediaSelect = function(input) {
  Array.from(input.files).forEach(function(file) {
    if(file.size > 20 * 1024 * 1024) { showToast('❌ ' + file.name + ' too large (max 20MB)'); return; }
    var idx = selectedMediaFiles.length;
    selectedMediaFiles.push(file);
    var reader = new FileReader();
    reader.onload = function(e) {
      var previews = document.getElementById('mediaPreviews');
      var isVideo = file.type.startsWith('video/');
      var div = document.createElement('div');
      div.className = 'media-preview-item';
      div.setAttribute('data-idx', idx);
      div.innerHTML = (isVideo
        ? '<video src="' + e.target.result + '" class="media-thumb" muted playsinline></video><div class="media-type-badge">VIDEO</div>'
        : '<img src="' + e.target.result + '" class="media-thumb" />')
        + '<button class="media-remove-btn" onclick="removeMedia(' + idx + ')"><i class="fa-solid fa-xmark"></i></button>';
      previews.appendChild(div);
    };
    reader.readAsDataURL(file);
  });
  input.value = '';
};

window.removeMedia = function(idx) {
  selectedMediaFiles[idx] = null;
  var item = document.querySelector('.media-preview-item[data-idx="' + idx + '"]');
  if(item) item.remove();
};

async function uploadToCloudinary(file) {
  var fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', CLOUDINARY_PRESET);
  var type = file.type.startsWith('video/') ? 'video' : 'image';
  var res = await fetch('https://api.cloudinary.com/v1_1/' + CLOUDINARY_CLOUD + '/' + type + '/upload', { method:'POST', body:fd });
  var data = await res.json();
  return { url: data.secure_url, type: type };
}

function openReviewModal() { document.getElementById('reviewModal').classList.add('open'); }
function closeReviewModal() { document.getElementById('reviewModal').classList.remove('open'); }
window.openReviewModal = openReviewModal;
window.closeReviewModal = closeReviewModal;

function starsHTML(n) {
  var s = '';
  for(var i=1;i<=5;i++) s += '<span style="color:' + (i<=n ? '#c9a24d' : '#ddd') + ';">★</span>';
  return s;
}

window.renderReviews = function(reviews) {
  var scroll = document.getElementById('reviewsScroll');
  if (!scroll) return;
  if (!reviews || reviews.length === 0) {
    scroll.innerHTML = '<div style="padding:40px;color:#aaa;font-size:13px;text-align:center;letter-spacing:1px;">No reviews yet. Be the first!</div>';
    return;
  }
  var sorted = reviews.slice().sort(function(a,b){ return (b.createdAt||0) - (a.createdAt||0); });
  scroll.innerHTML = sorted.map(function(r){
    var date = r.createdAt ? new Date(r.createdAt.toMillis ? r.createdAt.toMillis() : r.createdAt).toLocaleDateString('en-GB') : '';
    var mediaHTML = '';
    if(r.media && r.media.length > 0) {
      mediaHTML = '<div class="rc-media">' + r.media.map(function(m){
        if(m.type === 'video') return '<video src="' + m.url + '" class="rc-media-item" controls muted playsinline></video>';
        return '<img src="' + m.url + '" class="rc-media-item" loading="lazy" onclick="openLightbox(\'' + m.url + '\')" />';
      }).join('') + '</div>';
    }
    return '<div class="review-card">'
      + '<div class="rc-top"><div class="rc-stars">' + starsHTML(r.rating||0) + '</div><div class="rc-date">' + date + '</div></div>'
      + '<div class="rc-name">' + (r.name||'Anonymous') + '</div>'
      + (r.product ? '<div class="rc-product">' + r.product + '</div>' : '')
      + '<div class="rc-text">' + (r.text||'') + '</div>'
      + mediaHTML + '</div>';
  }).join('');

  var total = reviews.length, sum = 0, counts = {1:0,2:0,3:0,4:0,5:0};
  reviews.forEach(function(r){ var rt=r.rating||0; sum+=rt; if(counts[rt]!==undefined) counts[rt]++; });
  var avg = total > 0 ? (sum/total) : 0;
  var avgEl = document.getElementById('avgScore'), starsEl = document.getElementById('avgStars'), countEl = document.getElementById('reviewCount');
  if(avgEl) avgEl.textContent = avg.toFixed(1);
  if(starsEl) starsEl.innerHTML = starsHTML(Math.round(avg));
  if(countEl) countEl.textContent = 'Based on ' + total + ' review' + (total!==1?'s':'');
  var max = Math.max(counts[1],counts[2],counts[3],counts[4],counts[5],1);
  for(var i=1;i<=5;i++){
    var bar=document.getElementById('bar'+i), cnt=document.getElementById('cnt'+i);
    if(bar) bar.style.width = Math.round((counts[i]/max)*100)+'%';
    if(cnt) cnt.textContent = counts[i];
  }
};

window.openLightbox = function(url) {
  var lb = document.createElement('div');
  lb.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:zoom-out;';
  lb.onclick = function(){ lb.remove(); };
  lb.innerHTML = '<img src="' + url + '" style="max-width:90vw;max-height:90vh;object-fit:contain;border-radius:4px;" />';
  document.body.appendChild(lb);
};

window.submitReview = async function() {
  var name = document.getElementById('rName').value.trim();
  var rating = parseInt(document.getElementById('rRating').value);
  var text = document.getElementById('rText').value.trim();
  var product = document.getElementById('rProduct').value.trim();
  if(!name) { showToast('❌ Please enter your name.'); return; }
  if(!rating) { showToast('❌ Please select a rating.'); return; }
  if(!text) { showToast('❌ Please write your review.'); return; }
  if(!window._sb) { showToast('❌ Please wait and try again.'); return; }

  var btn = document.getElementById('rSubmitBtn');
  btn.disabled = true; btn.textContent = 'Submitting...';

  var mediaToUpload = selectedMediaFiles.filter(function(f){ return f !== null; });
  var uploadedMedia = [];
  if(mediaToUpload.length > 0) {
    var progressWrap = document.getElementById('uploadProgress');
    var progressBar = document.getElementById('uploadProgressBar');
    progressWrap.style.display = 'block';
    for(var i=0; i<mediaToUpload.length; i++) {
      try {
        var result = await uploadToCloudinary(mediaToUpload[i]);
        uploadedMedia.push(result);
        progressBar.style.width = Math.round(((i+1)/mediaToUpload.length)*100) + '%';
      } catch(e) { showToast('❌ Upload failed for one file.'); }
    }
    progressWrap.style.display = 'none';
  }

  try {
    const { error } = await window._sb.from('reviews').insert({
      id: crypto.randomUUID(),
      name: name, rating: rating, text: text, product: product,
      media: uploadedMedia
    });
    if (error) throw error;
    closeReviewModal();
    document.getElementById('rName').value = '';
    document.getElementById('rText').value = '';
    document.getElementById('rProduct').value = '';
    document.getElementById('rRating').value = '0';
    document.getElementById('mediaPreviews').innerHTML = '';
    selectedMediaFiles = []; selectedRating = 0;
    document.querySelectorAll('.star-pick').forEach(function(s){ s.classList.remove('selected'); });
    showToast('✅ Review submitted! Thank you.');
  } catch(e) { console.error(e); showToast('❌ Failed to submit. Try again.'); }

  btn.disabled = false; btn.textContent = 'Submit Review';
};

updateCartUI();

// If we just arrived here from custom.html's "Add to Cart" (gift set),
// auto-open the cart sidebar once, then clear the flag.
if (sessionStorage.getItem('candella_open_cart_on_load')) {
  sessionStorage.removeItem('candella_open_cart_on_load');
  toggleCart(true);
}

// ── Nav cream → white on hover (mouse, PC) or touch (finger, phone).
// Layout/position untouched — sticky nav stays exactly where it was.
// Plain two-color toggle (no transparency/overlay involved). ──
var mainNav = document.getElementById('mainNav');
function navTurnWhite(){
  mainNav.style.setProperty('background', '#fff', 'important');
  mainNav.style.boxShadow = '0 2px 16px rgba(0,0,0,0.08)';
  mainNav.style.borderBottom = '1px solid rgba(0,0,0,0.06)';
}
function navTurnCream(){
  mainNav.style.setProperty('background', '#faf8f5', 'important');
  mainNav.style.boxShadow = 'none';
  mainNav.style.borderBottom = 'none';
}
mainNav.addEventListener('mouseenter', navTurnWhite);
mainNav.addEventListener('mouseleave', navTurnCream);
mainNav.addEventListener('touchstart', navTurnWhite, { passive:true });
document.addEventListener('touchstart', function(e){
  if (!mainNav.contains(e.target)) navTurnCream();
}, { passive:true });

// Shop dropdown hover
var shopWrap = document.getElementById('shopNavWrap');
var shopDrop = document.getElementById('shopDropdown');
var dropTimer;
shopWrap.addEventListener('mouseenter', function(){ clearTimeout(dropTimer); shopDrop.style.display='block'; });
shopWrap.addEventListener('mouseleave', function(){ dropTimer=setTimeout(function(){ shopDrop.style.display='none'; },200); });
shopDrop.addEventListener('mouseenter', function(){ clearTimeout(dropTimer); });
shopDrop.addEventListener('mouseleave', function(){ dropTimer=setTimeout(function(){ shopDrop.style.display='none'; },200); });

// More dropdown hover
var moreNavWrap = document.getElementById('moreNavWrap');
var moreNavDrop = document.getElementById('moreNavDropdown');
var moreDropTimer;
moreNavWrap.addEventListener('mouseenter', function(){ clearTimeout(moreDropTimer); moreNavDrop.style.display='block'; });
moreNavWrap.addEventListener('mouseleave', function(){ moreDropTimer=setTimeout(function(){ moreNavDrop.style.display='none'; },200); });
moreNavDrop.addEventListener('mouseenter', function(){ clearTimeout(moreDropTimer); });
moreNavDrop.addEventListener('mouseleave', function(){ moreDropTimer=setTimeout(function(){ moreNavDrop.style.display='none'; },200); });

// Contact dropdown hover
var contactNavWrap = document.getElementById('contactNavWrap');
var contactNavDrop = document.getElementById('contactNavDropdown');
var contactDropTimer;
contactNavWrap.addEventListener('mouseenter', function(){ clearTimeout(contactDropTimer); contactNavDrop.style.display='block'; });
contactNavWrap.addEventListener('mouseleave', function(){ contactDropTimer=setTimeout(function(){ contactNavDrop.style.display='none'; },200); });
contactNavDrop.addEventListener('mouseenter', function(){ clearTimeout(contactDropTimer); });
contactNavDrop.addEventListener('mouseleave', function(){ contactDropTimer=setTimeout(function(){ contactNavDrop.style.display='none'; },200); });

// Inject More dropdown item styles
var moreStyle = document.createElement('style');
moreStyle.textContent = '.more-nav-drop-item { display:block; padding:13px 24px; font-family:\'Montserrat\',sans-serif; font-size:11px; font-weight:500; letter-spacing:0.5px; color:#333; text-decoration:none; border-left:3px solid transparent; transition:all 0.15s; } .more-nav-drop-item:hover { background:#f8f6f2; color:var(--navy); border-left-color:var(--gold); }';
document.head.appendChild(moreStyle);

// ════════════════════════════════════════════
// SUPABASE SETUP (third original block — was already type="module")
// ════════════════════════════════════════════
const sb = window.createSupabaseClient();
window._sb = sb;

// ── Dropdown image loader ──
window.loadDropdownImages = async function() {
  try {
    const { data: row } = await sb.from('settings').select('value').eq('key', 'homeImages').maybeSingle();
    var data = (row && row.value) ? row.value : {};
    homeImagesCache = data;
    Object.keys(data).forEach(function(key){
      var img = document.getElementById('dropImg_' + key);
      var ph  = document.getElementById('dropImgPlaceholder_' + key);
      if (img && data[key]) {
        img.src = data[key];
        img.style.display = 'block';
        if (ph) ph.style.display = 'none';
      }
    });
    window.applyBestSellerImage();
  } catch(e){ console.warn('Dropdown images failed', e); }
};

// ── Categories live sync ──
// DEFAULT_CATS data now lives in js/shared/categories.js (loaded before
// this module) as DEFAULT_CATEGORIES — aliased locally under this file's
// existing name since it's a module and bare identifiers don't fall back
// to window.X automatically.
var DEFAULT_CATS = window.DEFAULT_CATEGORIES;

function buildCategories(cats) {
  // Side menu
  var sideMenu = document.getElementById('newShopDropMenu');
  if (sideMenu) {
    sideMenu.innerHTML = '<a href="shop.html?filter=all" class="new-side-sub">All Products</a>'
      + '<a href="shop.html?filter=best" class="new-side-sub">Best Sellers</a>'
      + cats.map(function(c){
        var plain = c.label.replace(/^[^\w]+\s*/u,'').trim() || c.label;
        return '<a href="shop.html?filter=' + c.key + '" class="new-side-sub">' + plain + '</a>';
      }).join('');
  }
  // Dropdown
  var dropInner = document.getElementById('shopDropInner');
  if (dropInner) {
    var html = '<div class="drop-cat" onclick="window.location.href=\'shop.html?filter=best\'" style="cursor:pointer;flex:1;min-width:110px;">'
      + '<div style="width:100%;aspect-ratio:1;background:#f0ede8;border-radius:4px;overflow:hidden;margin-bottom:10px;position:relative;">'
      + '<img id="dropImg_best" src="" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:none;" />'
      + '<div id="dropImgPlaceholder_best" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-fire" style="color:var(--gold);font-size:24px;"></i></div>'
      + '</div><div style="font-family:\'Montserrat\',sans-serif;font-size:9px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--navy);white-space:normal;line-height:1.4;text-align:center;">Best Sellers</div></div>';
    cats.forEach(function(c){
      var plain = c.label.replace(/^[^\w]+\s*/u,'').trim() || c.label;
      html += '<div class="drop-cat" onclick="window.location.href=\'shop.html?filter=' + c.key + '\'" style="cursor:pointer;flex:1;min-width:110px;">'
        + '<div style="width:100%;aspect-ratio:1;background:#f0ede8;border-radius:4px;overflow:hidden;margin-bottom:10px;position:relative;">'
        + '<img id="dropImg_' + c.key + '" src="" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:none;" />'
        + '<div id="dropImgPlaceholder_' + c.key + '" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-image" style="color:#ccc;font-size:22px;"></i></div>'
        + '</div><div style="font-family:\'Montserrat\',sans-serif;font-size:9px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--navy);white-space:normal;line-height:1.4;text-align:center;">' + plain + '</div></div>';
    });
    dropInner.innerHTML = html;
    window.loadDropdownImages();
  }
}

// ── More menu (desktop dropdown + mobile side menu), editable from home-editor ──
// DEFAULT_MORE_SECTIONS data now lives in js/shared/moreSections.js
// (loaded before this module) — aliased locally since this file is a
// module and bare identifiers don't fall back to window.X automatically.
var DEFAULT_MORE_SECTIONS = window.DEFAULT_MORE_SECTIONS;

function renderMoreSections(sections) {
  var desktop = document.getElementById('moreNavDropdown');
  var mobile  = document.getElementById('moreDropMenu');
  if (desktop) {
    desktop.innerHTML = sections.map(function(s){
      return '<a href="more.html?section=' + encodeURIComponent(s.key) + '" class="more-nav-drop-item">' + s.label + '</a>';
    }).join('');
  }
  if (mobile) {
    mobile.innerHTML = sections.map(function(s){
      return '<a href="more.html?section=' + encodeURIComponent(s.key) + '" class="new-side-sub">' + s.label + '</a>';
    }).join('');
  }
}
renderMoreSections(DEFAULT_MORE_SECTIONS);

renderMoreSections(DEFAULT_MORE_SECTIONS);

// Read+fallback logic now comes from window.fetchMoreSections
// (js/shared/moreSections.js).
(async function loadMoreSections(){
  try {
    var result = await window.fetchMoreSections(sb);
    renderMoreSections(result.sections);
  } catch(e) { renderMoreSections(DEFAULT_MORE_SECTIONS); }
})();

// Read+fallback logic now comes from window.fetchCategories
// (js/shared/categories.js).
(async function loadCategoriesForHome(){
  try {
    var cats = await window.fetchCategories(sb);
    buildCategories(cats);
  } catch(e) { buildCategories(DEFAULT_CATS); }
})();

// ── Home Images (brand + dropdown) — load first since other steps depend on its result ──
var homeImagesLoaded = (async function loadHomeImages(){
  try {
    const { data: row, error } = await sb.from('settings').select('value').eq('key', 'homeImages').maybeSingle();
    if (error) throw error;
    var data = (row && row.value) ? row.value : {};
    homeImagesCache = data;
    var brandImg = document.getElementById('brandMainImg');
    if (brandImg && data.brandMain) { brandImg.src = data.brandMain; brandImg.style.display = 'block'; }
    Object.keys(data).forEach(function(key){
      var img = document.getElementById('dropImg_' + key);
      var ph  = document.getElementById('dropImgPlaceholder_' + key);
      if (!img) return;
      if (data[key]) { img.src = data[key]; img.style.display='block'; if(ph) ph.style.display='none'; }
      else { img.style.display='none'; if(ph) ph.style.display='flex'; }
    });
  } catch(e) { console.warn('Home images load failed', e); homeImagesCache = {}; }
})();

// ── Carousel Order (merged products + custom images, managed from home-editor) ──
(async function loadCarouselOrderForHome(){
  try {
    const { data: row, error } = await sb.from('settings').select('value').eq('key', 'carouselOrder').maybeSingle();
    if (error) throw error;
    carouselOrder = (row && row.value && row.value.order && row.value.order.length > 0) ? row.value.order : null;
    carouselImagesHidden = !!(row && row.value && row.value.imagesHidden);
    renderCarousel();
  } catch(e) { carouselOrder = null; renderCarousel(); }
})();

var productsLoaded = (async function loadProductsForHome(){
  try {
    const { data, error } = await sb.from('products').select('*');
    if (error) throw error;
    var arr = (data || []).map(function(row){
      return { id: row.id, name: row.name||'', desc: row.description||'', price: row.price||0, category: row.category||'candles', img: row.img||'', stock: typeof row.stock==='number'?row.stock:0, order: typeof row.order==='number'?row.order:0 };
    });
    arr.sort(function(a,b){ return a.order - b.order; });
    window.initProducts(arr);
  } catch(e) { console.error('Failed to load products:', e); window.initProducts([]); }
})();

// ── Best sellers ── (waits for products + homeImages so applyBestSellerImage has everything it needs)
// Calculation now comes from OrderService.calculateBestSellerIds
// (js/services/orderService.js) — this page still does its own
// follow-up (waiting on other loaders, re-rendering) after awaiting it.
(async function calcBestSellers(){
  try {
    bestSellerIds = await window.OrderService.calculateBestSellerIds(sb);
    await productsLoaded;
    await homeImagesLoaded;
    if (!carouselOrder) renderCarousel(); // only matters for the fallback (no admin-managed order yet)
    window.applyBestSellerImage();
  } catch(e){ console.warn('Best seller calc failed', e); }
})();

// ── Reviews ──
(async function loadReviews(){
  try {
    const { data, error } = await sb.from('reviews').select('*');
    if (error) throw error;
    window.renderReviews(data || []);
  } catch(e) { console.warn('Reviews load failed', e); }
})();


// ── Side menu auth ──
var _currentAuthUser = null;
function renderSideAuth(user) {
  _currentAuthUser = user;
  var authArea  = document.getElementById('sideAuthArea');
  var userArea  = document.getElementById('sideUserArea');
  if (user) {
    var meta = user.user_metadata || {};
    var displayName = meta.full_name || meta.name || '';
    var photoURL = meta.avatar_url || meta.picture || '';
    localStorage.setItem('candella_user', JSON.stringify({
      uid: user.id, name: displayName,
      email: user.email, photo: photoURL
    }));
    document.getElementById('sideUserName').textContent  = displayName;
    document.getElementById('sideUserEmail').textContent = user.email || '';
    if (photoURL) document.getElementById('sideUserPhoto').src = photoURL;
    authArea.style.display = 'none';
    userArea.style.display = 'block';
  } else {
    localStorage.removeItem('candella_user');
    authArea.style.display = 'block';
    userArea.style.display = 'none';
  }
}

window.sideSignIn = async function() {
  try {
    await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href }
    });
  } catch(e) { console.error(e); }
};
window.sideSignOut = async function() {
  await sb.auth.signOut();
  renderSideAuth(null);
};

// ── Desktop nav account icon (next to cart) ──
// Not signed in → straight to Google sign-in (no popup).
// Signed in → open a small styled popup (under the icon on desktop,
// centered on screen on mobile via the .nav-popup media query) showing
// which account they're on, with Sign out / Cancel buttons — this is the
// only way to switch accounts, since this is a Supabase session, not just
// a browser-level Google session.
window.navAccountClick = function() {
  if (_currentAuthUser) {
    document.getElementById('navAccountEmailText').textContent =
      'أنت مسجّل دخول بحساب Google: ' + (_currentAuthUser.email || '');
    document.getElementById('navAccountBox').style.display = 'block';
  } else {
    window.sideSignIn();
  }
};
window.closeNavAccountBox = function() {
  document.getElementById('navAccountBox').style.display = 'none';
};
window.navAccountSignOut = async function() {
  await window.sideSignOut();
  window.closeNavAccountBox();
  showToast('تم تسجيل الخروج');
};

// ── Desktop/mobile nav search box ──
window.toggleNavSearch = function() {
  var box = document.getElementById('navSearchBox');
  if (!box) return;
  var isOpen = box.style.display === 'block';
  box.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) document.getElementById('navSearchInput').focus();
};
window.submitNavSearch = function() {
  var input = document.getElementById('navSearchInput');
  var q = (input.value || '').trim();
  if (!q) return;
  window.location.href = 'shop.html?search=' + encodeURIComponent(q);
};
document.addEventListener('click', function(e){
  var searchBox = document.getElementById('navSearchBox');
  var searchWrap = document.getElementById('navSearchWrap');
  if (searchBox && searchBox.style.display === 'block' && !searchWrap.contains(e.target)) {
    searchBox.style.display = 'none';
  }
  var acctBox = document.getElementById('navAccountBox');
  var acctWrap = document.getElementById('navAccountWrap');
  if (acctBox && acctBox.style.display === 'block' && !acctWrap.contains(e.target)) {
    acctBox.style.display = 'none';
  }
});

// Check current session on load + listen for future auth changes
(async function initSideAuth(){
  const { data: { session } } = await sb.auth.getSession();
  renderSideAuth(session ? session.user : null);
})();
sb.auth.onAuthStateChange(function(event, session) {
  renderSideAuth(session ? session.user : null);
  // After Google redirects back, Supabase reads the access token from the
  // URL hash (#access_token=...) but leaves it sitting in the address bar.
  // If that leftover hash is still there the next time sideSignIn() runs
  // (it uses redirectTo: window.location.href), Google rejects the
  // request as malformed because the URL no longer matches the registered
  // redirect URI. Stripping the hash once the SDK has consumed it fixes
  // every subsequent login attempt from the same tab.
  if (window.location.hash && window.location.hash.indexOf('access_token') !== -1) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
});
