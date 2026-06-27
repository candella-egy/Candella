// js/pages/shop.js
// Moved verbatim out of the TWO <script> blocks in pages/shop.html (one
// classic for product rendering/cart, one type="module" for Supabase
// setup) and combined into one file, loaded as
// <script type="module" src="../js/pages/shop.js"></script>.
//
// cart / saveCart / removeFromCartByIndex / changeQtyByIndex / goCheckout
// come from js/shared/cart.js (loaded in <head>) — not duplicated here.
// showToast comes from js/shared/toast.js. openMenu/closeMenu come from
// js/shared/nav.js.

var CANDLE_SCENTS = ['Rose','Lavender','Jasmine','Sandalwood','Vanilla','Oud','Cinnamon','Mint'];
var products = [];
var bestSellerIds = new Set();
var selectedVariants = {};
var currentFilter = 'all';

// Read filter from URL
var urlFilter = new URLSearchParams(window.location.search).get('filter') || 'all';
currentFilter = urlFilter;

// Read search query from URL (set by the nav search box on home.html) —
// when present, it takes over rendering: shows matching products by name
// across all categories, ignoring the filter tabs.
var searchQuery = (new URLSearchParams(window.location.search).get('search') || '').trim();

// ── Product card overlay (bag icon) on touch ──
// .img-overlay only showed via the CSS :hover rule, which works fine with
// a mouse on PC but isn't reliable on touch devices — a tap doesn't
// register as :hover the same way, so the overlay only ever appeared
// after an actual press. Mirrors the same touchstart pattern already used
// for the home carousel: touching a card shows it immediately, touching
// anywhere else hides it again — no press/click needed.
(function setupProductCardTouchOverlay(){
  document.addEventListener('touchstart', function(e){
    var card = e.target.closest && e.target.closest('.product-card');
    document.querySelectorAll('.product-card.touch-hover').forEach(function(c){
      if (c !== card) c.classList.remove('touch-hover');
    });
    if (card) card.classList.add('touch-hover');
  }, { passive: true });
})();

// ── Render Products ──
function renderProducts(filter) {
  filter = filter || 'all';
  currentFilter = filter;

  document.querySelectorAll('.tab').forEach(function(t){
    t.classList.toggle('active', t.getAttribute('data-filter') === filter);
  });

  var titles = { all:'Our Collection', best:'Best Sellers', candles:'Scented Candles', unscented:'Unscented Candles', containers:'Containers & Accessories', offers:'Limited Edition' };
  var titleEl = document.getElementById('shopTitle');

  var list = document.getElementById('productList');
  var filtered;
  if (searchQuery) {
    var q = searchQuery.toLowerCase();
    filtered = products.filter(function(p){ return (p.name||'').toLowerCase().indexOf(q) !== -1; });
    if(titleEl) titleEl.textContent = 'Search results for "' + searchQuery + '"';
  } else if(filter === 'best') {
    filtered = products.filter(function(p){ return bestSellerIds.has(p.id); });
    if(filtered.length === 0) filtered = products.slice(0, 6);
    if(titleEl) titleEl.textContent = titles[filter] || 'Our Collection';
  } else if(filter === 'all') {
    var bs = products.filter(function(p){ return bestSellerIds.has(p.id); });
    var rest = products.filter(function(p){ return !bestSellerIds.has(p.id); });
    filtered = bs.concat(rest);
    if(titleEl) titleEl.textContent = titles[filter] || 'Our Collection';
  } else {
    filtered = products.filter(function(p){ return p.category === filter; });
    if(titleEl) titleEl.textContent = titles[filter] || 'Our Collection';
  }

  if(filtered.length === 0){
    list.innerHTML = searchQuery
      ? '<div class="products-empty">No products found for "' + searchQuery + '".</div>'
      : '<div class="products-empty">No products in this category yet.</div>';
    return;
  }

  list.innerHTML = filtered.map(function(p){
    var variantHTML = '';
    if(p.category === 'candles') {
      var curScent = (selectedVariants[p.id] && selectedVariants[p.id].scent) || CANDLE_SCENTS[0];
      variantHTML = '<div class="variant-label">Scent</div>'
        + '<div class="variant-select-wrap"><select class="variant-select" id="scent_' + p.id + '" onchange="selectScent(\'' + p.id + '\',this.value)">'
        + CANDLE_SCENTS.map(function(sc){ return '<option value="' + sc + '"' + (sc===curScent?' selected':'') + '>' + sc + '</option>'; }).join('')
        + '</select><i class="fa-solid fa-chevron-down variant-arrow"></i></div>';
    }
    var soldOut = typeof p.stock === 'number' && p.stock <= 0;
    var bestBadge = bestSellerIds.has(p.id) ? '<div class="best-seller-badge">🔥 Best Seller</div>' : '';
    var disabledAttr = soldOut ? ' disabled' : '';
    return '<div class="product-card' + (soldOut?' sold-out':'') + '">'
      + '<div class="product-img-wrap"><img src="' + p.img + '" alt="' + p.name + '" loading="lazy" />'
      + bestBadge
      + (soldOut ? '<div class="sold-out-badge">Sold Out</div>' : '')
      + '<div class="img-overlay"><button class="overlay-cart-btn" onclick="addToCart(\'' + p.id + '\')"' + disabledAttr + ' title="Add to Cart"><i class="fa-solid fa-bag-shopping"></i></button></div>'
      + '</div>'
      + '<div class="product-info"><h3>' + p.name + '</h3><p>' + p.desc + '</p>'
      + variantHTML
      + '<div class="product-footer">'
      + '<span class="price">EGP ' + p.price + '</span>'
      + '<div class="btn-group">'
      + '<button class="add-btn" onclick="addToCart(\'' + p.id + '\')"' + disabledAttr + '>' + (soldOut ? 'Sold Out' : '+ Cart') + '</button>'
      + '<button class="buy-now-btn" onclick="buyNow(\'' + p.id + '\')"' + disabledAttr + '>Buy Now</button>'
      + '</div></div></div></div>';
  }).join('');

  // Animate cards in
  setTimeout(function(){
    var observer = new IntersectionObserver(function(entries){
      entries.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('visible'); observer.unobserve(e.target); } });
    }, { threshold: 0.08 });
    document.querySelectorAll('.product-card').forEach(function(c, i){
      c.style.transitionDelay = (i * 0.06) + 's';
      observer.observe(c);
    });
  }, 50);
}

window.selectScent = function(pid, scent) {
  selectedVariants[pid] = selectedVariants[pid] || {};
  selectedVariants[pid].scent = scent;
};

function addToCart(id) {
  var p = products.find(function(x){ return x.id === id; });
  if(!p) return;
  if(typeof p.stock === 'number' && p.stock <= 0){ showToast('❌ Sold Out'); return; }
  var scent = (p.category === 'candles') ? ((selectedVariants[id] && selectedVariants[id].scent) || CANDLE_SCENTS[0]) : '';
  var cartKey = id + '_' + scent.replace(/\s/g,'');
  var existing = cart.find(function(c){ return c.cartKey === cartKey; });
  if(existing) { existing.qty++; }
  else { cart.push({ cartKey:cartKey, id:p.id, name:p.name, price:p.price, img:p.img, category:p.category, qty:1, scent:scent }); }
  saveCart(); updateCartUI();
  showToast('✅ ' + p.name + (scent ? ' · ' + scent : '') + ' added!');
}
window.addToCart = addToCart;

function buyNow(id) { addToCart(id); if(cart.length > 0) window.location.href = 'checkout.html'; }
window.buyNow = buyNow;

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
  var components = (item.giftComponents && item.giftComponents.length)
    ? item.giftComponents
    : imgs.map(function(url){ return { name: '', price: null, img: url }; });
  var shown = imgs.slice(0, 4);
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
  cart.forEach(function(c){ total += c.price * c.qty; count += c.qty; });
  if(badge){ badge.textContent = count; badge.style.display = count > 0 ? 'flex' : 'none'; }
  var totalEl = document.getElementById('cartTotal');
  if(totalEl) totalEl.textContent = total;
  var itemsEl = document.getElementById('cartItems');
  if(!itemsEl) return;
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
        + '</div>'
        + '<button class="remove-btn" onclick="removeFromCartByIndex(' + idx + ')">&#10005;</button>'
        + '</div>';
    }
    return '<div class="cart-item"><img src="' + c.img + '" alt="' + c.name + '" loading="lazy" />'
      + '<div class="cart-item-info"><span class="cart-item-name">' + c.name + '</span>'
      + (c.scent ? '<span style="font-size:10px;color:#aaa;">Scent: ' + c.scent + '</span><br>' : '')
      + '<span class="cart-item-price">EGP ' + (c.price * c.qty) + '</span>'
      + '<div class="qty-ctrl"><button onclick="changeQtyByIndex(' + idx + ',-1)">&#8722;</button><span>' + c.qty + '</span><button onclick="changeQtyByIndex(' + idx + ',1)">+</button></div>'
      + '</div><button class="remove-btn" onclick="removeFromCartByIndex(' + idx + ')">&#10005;</button></div>';
  }).join('');
}
window.updateCartUI = updateCartUI;
var cartOpen = false;
function toggleCart(){ cartOpen=!cartOpen; document.getElementById('cartSidebar').classList.toggle('open',cartOpen); document.getElementById('cartOverlay').classList.toggle('show',cartOpen); }
window.toggleCart = toggleCart;
// showToast (js/shared/toast.js) and openMenu/closeMenu (js/shared/nav.js)
// now come from shared scripts loaded in <head>.

function toggleNewShopDrop(){
  var menu=document.getElementById('newShopDropMenu');
  var icon=document.getElementById('shopRowIcon');
  if(!menu)return;
  var isOpen=menu.style.maxHeight && menu.style.maxHeight!=='0px';
  menu.style.maxHeight=isOpen?'0px':'400px';
  if(icon) icon.textContent=isOpen?'+':'×';
}
window.toggleNewShopDrop = toggleNewShopDrop;

// ── More / Contact rows in the side menu (ported from home.js so
// shop.html's side menu matches home.html's exactly) ──
function toggleMoreDrop() {
  var menu = document.getElementById('moreDropMenu');
  var icon = document.getElementById('moreRowIcon');
  if (!menu) return;
  var isOpen = menu.style.maxHeight && menu.style.maxHeight !== '0px';
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

// ── More menu (mobile side menu), editable from home-editor ──
// DEFAULT_MORE_SECTIONS data now lives in js/shared/moreSections.js
// (loaded before this module) — aliased locally since this file is a
// module and bare identifiers don't fall back to window.X automatically.
var DEFAULT_MORE_SECTIONS = window.DEFAULT_MORE_SECTIONS;

function renderMoreSectionsShop(sections) {
  var mobile = document.getElementById('moreDropMenu');
  if (mobile) {
    mobile.innerHTML = sections.map(function(s){
      return '<a href="more.html?section=' + encodeURIComponent(s.key) + '" class="new-side-sub">' + s.label + '</a>';
    }).join('');
  }
}

// ── Filter Tabs ──
document.querySelectorAll('.tab').forEach(function(tab){
  tab.addEventListener('click', function(){
    var f = this.getAttribute('data-filter');
    renderProducts(f);
    window.history.replaceState(null,'','shop.html?filter='+f);
  });
});

updateCartUI();

// ════════════════════════════════════════════
// SUPABASE SETUP (second original block — was already type="module")
// ════════════════════════════════════════════
const sb = window.createSupabaseClient();

// ── Dynamic Categories ──
var DEFAULT_CATS = [
  { key:'candles', label:'Scented Candles' },
  { key:'unscented', label:'Unscented' },
  { key:'containers', label:'Containers & Accessories' },
  { key:'offers', label:'Limited Edition' }
];

function buildCategories(cats) {
  // Update filter tabs
  var tabsWrap = document.getElementById('filterTabs');
  if (tabsWrap) {
    tabsWrap.innerHTML = '<button class="tab" data-filter="all">All</button>'
      + '<button class="tab" data-filter="best">Best Sellers</button>'
      + cats.map(function(c){
        return '<button class="tab" data-filter="' + c.key + '">' + c.label.replace(/^[^\w]+\s*/u,'').trim() + '</button>';
      }).join('');
    // re-mark active
    tabsWrap.querySelectorAll('.tab').forEach(function(t){
      t.classList.toggle('active', t.getAttribute('data-filter') === currentFilter);
      t.addEventListener('click', function(){
        var f = this.getAttribute('data-filter');
        renderProducts(f);
        window.history.replaceState(null,'','shop.html?filter='+f);
      });
    });
  }
  // Update side menu
  var drop = document.getElementById('newShopDropMenu');
  if (drop) {
    drop.innerHTML = '<a href="shop.html?filter=all" class="new-side-sub" data-filter="all">All Products</a>'
      + '<a href="shop.html?filter=best" class="new-side-sub" data-filter="best">Best Sellers</a>'
      + cats.map(function(c){
        var plain = c.label.replace(/^[^\w]+\s*/u,'').trim() || c.label;
        return '<a href="shop.html?filter=' + c.key + '" class="new-side-sub" data-filter="' + c.key + '">' + plain + '</a>';
      }).join('');
  }
}

(async function loadCategoriesForShop(){
  try {
    const { data: row, error } = await sb.from('settings').select('value').eq('key', 'categories').maybeSingle();
    if (error) throw error;
    var cats = (row && row.value && row.value.list && row.value.list.length > 0)
      ? row.value.list : DEFAULT_CATS;
    buildCategories(cats);
  } catch(e) { buildCategories(DEFAULT_CATS); }
})();

// Read+fallback logic now comes from window.fetchMoreSections
// (js/shared/moreSections.js).
(async function loadMoreSectionsForShop(){
  try {
    var result = await window.fetchMoreSections(sb);
    renderMoreSectionsShop(result.sections);
  } catch(e) { renderMoreSectionsShop(DEFAULT_MORE_SECTIONS); }
})();

// ── Best Sellers ──
// Calculation now comes from OrderService.calculateBestSellerIds
// (js/services/orderService.js).
(async function(){
  try {
    bestSellerIds = await window.OrderService.calculateBestSellerIds(sb);
  } catch(e){ console.warn('Best sellers failed', e); }
})();

// ── Products ──
(async function loadProductsForShop(){
  try {
    const { data, error } = await sb.from('products').select('*');
    if (error) throw error;
    products = (data || []).map(function(row){
      return { id:row.id, name:row.name||'', desc:row.description||'', price:row.price||0, category:row.category||'candles', img:row.img||'', stock:typeof row.stock==='number'?row.stock:0, order:typeof row.order==='number'?row.order:0 };
    }).sort(function(a,b){ return a.order - b.order; });
    products.forEach(function(p){ if(p.category==='candles' && !selectedVariants[p.id]) selectedVariants[p.id]={scent:'Rose'}; });
    renderProducts(currentFilter);
  } catch(e){
    console.error('Failed to load products:', e);
    document.getElementById('productList').innerHTML = '<div class="products-empty">Failed to load products. Please refresh.</div>';
  }
})();

// ── Auth ──
window.sideSignIn = async function(){
  try {
    await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.href } });
  } catch(e){ console.error(e); }
};
window.sideSignOut = async function(){
  await sb.auth.signOut();
  renderShopAuth(null);
};

// ── Account popup (same one used on home.html) — triggered from the side
// menu's logged-in row, since shop.html has no separate top-bar icon. ──
var _currentAuthUser = null;
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

function renderShopAuth(user) {
  _currentAuthUser = user;
  var authArea = document.getElementById('sideAuthArea');
  var userArea = document.getElementById('sideUserArea');
  if(user){
    var meta = user.user_metadata || {};
    document.getElementById('sideUserName').textContent = meta.full_name || meta.name || '';
    document.getElementById('sideUserEmail').textContent = user.email||'';
    var photoURL = meta.avatar_url || meta.picture || '';
    if(photoURL) document.getElementById('sideUserPhoto').src = photoURL;
    authArea.style.display='none'; userArea.style.display='block';
  } else {
    authArea.style.display='block'; userArea.style.display='none';
  }
}

(async function initShopAuth(){
  const { data: { session } } = await sb.auth.getSession();
  renderShopAuth(session ? session.user : null);
})();
sb.auth.onAuthStateChange(function(event, session) {
  renderShopAuth(session ? session.user : null);
  // See the matching comment in js/pages/home.js — strips the leftover
  // #access_token=... hash Supabase leaves in the URL after the Google
  // redirect, which otherwise breaks every later sideSignIn() call from
  // the same tab (it sends window.location.href, including the stale
  // hash, as redirectTo — Google then rejects it as a mismatched URI).
  if (window.location.hash && window.location.hash.indexOf('access_token') !== -1) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
});
