// js/pages/products.js
// Moved verbatim out of the <script type="module"> block in pages/products.html.
// Loaded as <script type="module" src="../js/pages/products.js"></script> at the
// end of <body> — module scripts are deferred until the DOM is fully parsed,
// so execution order relative to the catModalOverlay markup is unchanged.
//
// Every function invoked from onclick="" / onchange="" / oninput="" in
// products.html is exposed via window.functionName, unchanged from before.
//
// Auth helpers (adminDirectLogin/adminLogout/resolveAdminAccess/
// attachTokenRefreshListener) come from js/auth/adminAuth.js, loaded before
// this file — not duplicated here.

// ════════════════════════════════════════════
// SUPABASE SETUP
// ════════════════════════════════════════════
// If this page was reached via dashboard.html's token relay, authenticate
// this client with that token from the start — otherwise every query
// below (not just the initial admin check) would go out as anon and fail
// under RLS. See js/config/supabase.js for why.
const sb = window.createSupabaseClient(sessionStorage.getItem('candella_admin_token'));
window.attachTokenRefreshListener(sb);

let allProducts = [];
let editingId = null;
var isRestrictedAdmin = false;

// ===== ACCESS CONTROL =====
// doosa (super) can open this page directly with her own email/password, from anywhere.
// Anyone else MUST arrive here via the dashboard (which stores a token + role in
// sessionStorage right before redirecting). If that token is missing, we redirect
// straight back to the dashboard — there's no standalone login for non-super users.
window.toggleLoginPw = function() {
  var inp = document.getElementById('adminPass');
  var icon = document.getElementById('loginEyeIcon');
  if (inp.type === 'password') { inp.type = 'text'; icon.className = 'fa-solid fa-eye-slash'; }
  else { inp.type = 'password'; icon.className = 'fa-solid fa-eye'; }
};

window.login = async function() {
  const u = document.getElementById('adminUser').value.trim();
  const p = document.getElementById('adminPass').value.trim();
  const errEl = document.getElementById('loginErr');
  const btn = document.querySelector('.login-btn');
  errEl.textContent = '';
  if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }
  try {
    const result = await window.adminDirectLogin(sb, u, p);
    if (!result.ok) {
      errEl.textContent = '❌ Direct access is restricted to the super admin only.';
      if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
      return;
    }

    isRestrictedAdmin = false;
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('dashSection').style.display = 'block';
    loadCategoriesFromSupabase();
    loadProducts();
    loadAndRenderCustomItems();
  } catch(e) {
    errEl.textContent = '❌ Wrong email or password';
  }
  if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
};

window.logout = async function() {
  await window.adminLogout(sb, 'products.html');
};

// Entry point: check how the user got here.
async function initAccess() {
  const result = await window.resolveAdminAccess(sb);

  if (result.status === 'dashboard-invalid') {
    window.location.href = 'dashboard.html';
    return;
  }

  if (result.status === 'dashboard-granted') {
    isRestrictedAdmin = (result.adminRow.role !== 'super');
    if (isRestrictedAdmin) {
      var catBtn = document.getElementById('catManageBtn');
      if (catBtn) catBtn.style.display = 'none';
    }
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('dashSection').style.display = 'block';
    loadCategoriesFromSupabase().then(function(){ loadProducts(); loadAndRenderCustomItems(); });
    return;
  }

  if (result.status === 'direct-granted') {
    isRestrictedAdmin = false;
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('dashSection').style.display = 'block';
    loadCategoriesFromSupabase().then(function(){ loadProducts(); loadAndRenderCustomItems(); });
    return;
  }

  // result.status === 'no-session' — show the direct-login screen (super admin only)
  document.getElementById('loginSection').style.display = 'flex';
  document.getElementById('dashSection').style.display = 'none';
}
initAccess();

// ── Auto-refresh safety net ──
// Stock/cost/price can change from other places (an order being placed,
// dashboard cancel/restore, Home Editor cost edits) while this page is
// open — poll quietly in the background so the grid stays current
// without needing a manual refresh. Only re-renders the grid, never the
// Add/Edit form fields, so it never interrupts someone mid-edit. Only
// runs while actually logged in and the dashboard is visible.
setInterval(function () {
  if (document.getElementById('dashSection').style.display === 'block') {
    loadProducts();
    loadAndRenderCustomItems();
  }
}, 20000);

// ===== LIVE PREVIEW =====
window.updatePreview = function() {
  var name  = document.getElementById('f_name').value.trim() || 'Product name';
  var img   = document.getElementById('f_img').value.trim();
  var price = parseFloat(document.getElementById('f_price').value) || 0;
  var cost  = parseFloat(document.getElementById('f_cost').value) || 0;
  var stock = parseInt(document.getElementById('f_stock').value, 10);

  document.getElementById('previewName').textContent = name;
  document.getElementById('previewPrice').textContent = 'EGP ' + price;

  var wrap = document.getElementById('previewImgWrap');
  var soldBadge = (!isNaN(stock) && stock <= 0) ? '<div class="preview-sold-badge">Sold Out</div>' : '';
  if (img) {
    wrap.innerHTML = soldBadge + '<img src="' + img + '" alt="preview" onerror="this.style.display=\'none\'" />';
  } else {
    wrap.innerHTML = '<div class="ph"><i class="fa-solid fa-image" style="font-size:26px;"></i><br>Image preview</div>';
  }

  var profit = price - cost;
  var profitEl = document.getElementById('profitPreview');
  profitEl.textContent = 'EGP ' + profit.toFixed(2);
  profitEl.style.color = profit >= 0 ? '#198754' : '#e74c3c';
};

// ===== SAVE (ADD / UPDATE) =====
window.saveProduct = async function() {
  var msg = document.getElementById('formMsg');
  msg.className = 'form-msg'; msg.textContent = '';

  var name  = document.getElementById('f_name').value.trim();
  var desc  = document.getElementById('f_desc').value.trim();
  var category = document.getElementById('f_category').value;
  var img   = document.getElementById('f_img').value.trim();
  var cost  = parseFloat(document.getElementById('f_cost').value);
  var price = parseFloat(document.getElementById('f_price').value);
  var stock = parseInt(document.getElementById('f_stock').value, 10);

  if (!name || !img || isNaN(cost) || isNaN(price) || isNaN(stock)) {
    msg.className = 'form-msg err';
    msg.textContent = '⚠️ Please fill in all required fields (Name, Image URL, Cost, Price, Stock).';
    return;
  }

  var data = {
    name: name, description: desc, category: category, img: img,
    cost_price: cost, price: price, stock: stock
  };

  var btn = document.getElementById('saveBtn');
  btn.disabled = true;

  try {
    if (editingId) {
      const { error } = await sb.from('products').update(data).eq('id', editingId);
      if (error) throw error;
      msg.className = 'form-msg ok';
      msg.textContent = '✅ Product updated successfully.';
    } else {
      data.id = crypto.randomUUID();
      data.order = Date.now();
      const { error } = await sb.from('products').insert(data);
      if (error) throw error;
      msg.className = 'form-msg ok';
      msg.textContent = '✅ Product added — it’s now live on the website.';
    }
    cancelEdit();
    loadProducts();
  } catch (e) {
    console.error(e);
    msg.className = 'form-msg err';
    msg.textContent = '❌ Error saving product: ' + e.message;
  } finally {
    btn.disabled = false;
  }
};

window.cancelEdit = function() {
  editingId = null;
  document.getElementById('f_name').value = '';
  document.getElementById('f_desc').value = '';
  document.getElementById('f_category').value = 'candles';
  document.getElementById('f_img').value = '';
  document.getElementById('f_cost').value = '';
  document.getElementById('f_price').value = '';
  document.getElementById('f_stock').value = '';
  document.getElementById('formTitle').textContent = '➕ Add New Product';
  document.getElementById('saveBtn').innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Add Product';
  document.getElementById('cancelEditBtn').style.display = 'none';
  updatePreview();
};

window.editProduct = function(id) {
  if (isRestrictedAdmin) return;
  var p = allProducts.find(function(x){ return x.id === id; });
  if (!p) return;
  editingId = id;
  document.getElementById('f_name').value = p.name || '';
  document.getElementById('f_desc').value = p.desc || '';
  document.getElementById('f_category').value = p.category || 'candles';
  document.getElementById('f_img').value = p.img || '';
  document.getElementById('f_cost').value = (p.costPrice != null) ? p.costPrice : '';
  document.getElementById('f_price').value = (p.price != null) ? p.price : '';
  document.getElementById('f_stock').value = (p.stock != null) ? p.stock : '';
  document.getElementById('formTitle').textContent = '✏️ Edit Product';
  document.getElementById('saveBtn').innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Update Product';
  document.getElementById('cancelEditBtn').style.display = 'inline-block';
  updatePreview();
  document.querySelector('.form-card').scrollIntoView({ behavior: 'smooth' });
};

window.deleteProduct = async function(id) {
  if (isRestrictedAdmin) return;
  var p = allProducts.find(function(x){ return x.id === id; });
  if (!p) return;
  if (!confirm('Delete "' + p.name + '"? This cannot be undone.')) return;
  try {
    const { error } = await sb.from('products').delete().eq('id', id);
    if (error) throw error;
    if (editingId === id) cancelEdit();
    loadProducts();
  } catch (e) {
    alert('❌ Error deleting product: ' + e.message);
  }
};

// ===== LOAD & RENDER =====
async function loadProducts() {
  var grid = document.getElementById('productsGrid');
  grid.innerHTML = '<div style="text-align:center;padding:40px;color:#aaa;"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>';
  try {
    const { data, error } = await sb.from('products').select('*');
    if (error) throw error;
    allProducts = (data || []).map(function(row){
      return {
        id: row.id,
        name: row.name || '',
        desc: row.description || '',
        category: row.category || 'candles',
        img: row.img || '',
        costPrice: row.cost_price || 0,
        price: row.price || 0,
        stock: (typeof row.stock === 'number') ? row.stock : 0,
        order: (typeof row.order === 'number') ? row.order : 0
      };
    });
    allProducts.sort(function(a,b){ return b.order - a.order; });
    if (allProducts.length === 0) {
      grid.innerHTML = '<div class="empty-state"><i class="fa-solid fa-box-open empty-icon"></i><p>No products yet — add your first one above.</p></div>';
      return;
    }
    renderProducts();
  } catch(e) {
    console.error(e);
    grid.innerHTML = '<div class="empty-state"><i class="fa-solid fa-triangle-exclamation empty-icon"></i><p>Failed to load products.</p></div>';
  }
}

function renderProducts() {
  var grid = document.getElementById('productsGrid');
  var _cats = loadCategories();
  var CAT_LABELS = {};
  _cats.forEach(function(c){ CAT_LABELS[c.key] = c.label; });

  grid.innerHTML = allProducts.map(function(p){
    var profit = (p.price - p.costPrice);
    var stockClass = p.stock <= 0 ? 'out' : (p.stock <= 5 ? 'low' : 'ok');
    var stockLabel = p.stock <= 0 ? 'Sold Out' : (p.stock + ' in stock');
    var soldBadge = p.stock <= 0 ? '<div class="pcard-sold-badge">Sold Out</div>' : '';
    return (
      '<div class="pcard">' +
        '<div class="pcard-img-wrap">' + soldBadge +
          '<img src="' + p.img + '" alt="' + p.name + '" />' +
        '</div>' +
        '<div class="pcard-body">' +
          '<div class="pcard-cat">' + (CAT_LABELS[p.category] || p.category) + '</div>' +
          '<div class="pcard-name">' + p.name + '</div>' +
          '<div class="pcard-row"><span>Selling Price</span><b>EGP ' + p.price + '</b></div>' +
          '<div class="pcard-row"><span>Cost Price</span><b>EGP ' + p.costPrice + '</b></div>' +
          '<div class="pcard-row"><span>Profit / unit</span><b style="color:' + (profit>=0?'#198754':'#e74c3c') + ';">EGP ' + profit.toFixed(2) + '</b></div>' +
          '<div class="pcard-stock ' + stockClass + '">' + stockLabel + '</div>' +
          (isRestrictedAdmin ? '' :
          '<div class="pcard-actions">' +
            '<button class="edit-btn" onclick="editProduct(\'' + p.id + '\')"><i class="fa-solid fa-pen"></i> Edit</button>' +
            '<button class="delete-btn" onclick="deleteProduct(\'' + p.id + '\')"><i class="fa-solid fa-trash"></i> Delete</button>' +
          '</div>') +
        '</div>' +
      '</div>'
    );
  }).join('');
}


// ===== CUSTOM / GIFT SET ITEMS =====
// Cost/stock now live directly on each item inside settings.giftSet
// (embedded by the stable-id migration), addressed by the item's
// permanent `id` — not by index-based keys into a separate
// customCosts map. customCosts is left untouched/unread here; it
// only still exists for the legacy stock-resolution fallback in
// js/services/stockService.js for any pre-migration cart still in flight.

// Finds an item by id inside the current giftSet and writes cost/stock
// directly onto it, then upserts giftSet back. itemType: 'candle'|'container'|'acc'.
async function saveItemCostStock(itemType, itemId, cost, stock) {
  try {
    const { data: giftRow, error } = await sb.from('settings').select('value').eq('key', 'giftSet').maybeSingle();
    if (error) throw error;
    var giftData = giftRow.value || {};

    var found = false;
    if (itemType === 'candle') {
      var candlesBySize = giftData.candlesBySize || {};
      Object.keys(candlesBySize).forEach(function(skey) {
        (candlesBySize[skey] || []).forEach(function(c) {
          if (c.id === itemId) { c.cost = cost; c.stock = stock; found = true; }
        });
      });
    } else if (itemType === 'container') {
      (giftData.containers || []).forEach(function(c) {
        if (c.id === itemId) { c.cost = cost; c.stock = stock; found = true; }
      });
    } else if (itemType === 'acc') {
      (giftData.accessories || []).forEach(function(a) {
        if (a.id === itemId) { a.cost = cost; a.stock = stock; found = true; }
      });
    }

    if (!found) { alert('⚠️ Item not found by id — it may need the Home Editor migration run first.'); return; }

    const { error: upsertError } = await sb.from('settings').upsert({ key: 'giftSet', value: giftData });
    if (upsertError) throw upsertError;
  } catch(e) { alert('Error saving: ' + e.message); }
}

function makeCustomCard(opts) {
  // opts: { key, id, itemType, badge, name, img, sellingPrice, cost, stock }
  var cost  = opts.cost  != null ? opts.cost  : '';
  var stock = opts.stock != null ? opts.stock : '';

  var profit     = (cost !== '') ? (opts.sellingPrice - parseFloat(cost)) : null;
  var profitHtml = profit != null
    ? '<div class="ccard-profit ' + (profit >= 0 ? 'ok' : 'err') + '">Profit: EGP ' + profit.toFixed(2) + '</div>'
    : '<div class="ccard-profit" style="color:#bbb;">— أدخل سعر التكلفة</div>';

  var stockNum   = stock !== '' ? parseInt(stock, 10) : null;
  var stockClass = stockNum == null ? '' : (stockNum <= 0 ? 'out' : (stockNum <= 5 ? 'low' : 'ok'));
  var stockLabel = stockNum == null ? '— أدخل الكمية' : (stockNum <= 0 ? 'Sold Out' : stockNum + ' in stock');
  var stockHtml  = '<div class="ccard-stock ' + stockClass + '">' + stockLabel + '</div>';

  var imgHtml = opts.img
    ? '<img src="' + opts.img + '" alt="' + opts.name + '" onerror="this.style.display=\'none\'" />'
    : '<div class="ccard-img-ph"><i class="fa-solid fa-image"></i></div>';

  return '<div class="ccard" id="ccard_' + opts.key + '">'
    + '<div class="ccard-img-wrap">' + imgHtml + '</div>'
    + '<div class="ccard-body">'
      + '<div class="ccard-badge">' + opts.badge + '</div>'
      + '<div class="ccard-name">' + opts.name + '</div>'
      + '<div class="ccard-price-row"><span>Selling Price</span><b>EGP ' + opts.sellingPrice + '</b></div>'
      + '<div class="ccard-price-row"><span>Cost Price</span>'
        + '<b><input type="number" min="0" step="0.01" placeholder="التكلفة" value="' + cost + '" '
        + 'id="cost_' + opts.key + '" onchange="refreshCustomCard(\'' + opts.key + '\',' + opts.sellingPrice + ')" '
        + 'style="width:80px;padding:4px 8px;border:1.5px solid #ddd4c0;border-radius:6px;font-size:12px;font-family:Montserrat,sans-serif;background:#f5f0e8;outline:none;" /></b>'
      + '</div>'
      + profitHtml
      + stockHtml
      + '<div class="ccard-edit-row">'
        + '<label>Stock</label>'
        + '<input type="number" min="0" step="1" placeholder="الكمية" value="' + stock + '" id="stock_' + opts.key + '" '
        + 'onchange="refreshCustomCard(\'' + opts.key + '\',' + opts.sellingPrice + ')" '
        + 'style="max-width:90px;" />'
        + '<button class="ccard-save-btn" onclick="saveCustomCardData(\'' + opts.key + '\',\'' + opts.itemType + '\',\'' + opts.id + '\',' + opts.sellingPrice + ')">'
        + '<i class="fa-solid fa-floppy-disk"></i> Save</button>'
      + '</div>'
    + '</div>'
  + '</div>';
}

window.refreshCustomCard = function(key, sellingPrice) {
  var costInp  = document.getElementById('cost_'  + key);
  var stockInp = document.getElementById('stock_' + key);
  var card     = document.getElementById('ccard_' + key);
  if (!card || !costInp) return;
  var cost   = costInp.value !== '' ? parseFloat(costInp.value) : null;
  var stock  = stockInp && stockInp.value !== '' ? parseInt(stockInp.value, 10) : null;

  // update profit
  var profitEl = card.querySelector('.ccard-profit');
  if (profitEl) {
    if (cost != null) {
      var profit = sellingPrice - cost;
      profitEl.textContent = 'Profit: EGP ' + profit.toFixed(2);
      profitEl.className = 'ccard-profit ' + (profit >= 0 ? 'ok' : 'err');
    } else {
      profitEl.textContent = '— أدخل سعر التكلفة';
      profitEl.className = 'ccard-profit';
      profitEl.style.color = '#bbb';
    }
  }
  // update stock label
  var stockEl = card.querySelector('.ccard-stock');
  if (stockEl) {
    if (stock == null) {
      stockEl.textContent = '— أدخل الكمية';
      stockEl.className = 'ccard-stock';
    } else {
      stockEl.textContent = stock <= 0 ? 'Sold Out' : stock + ' in stock';
      stockEl.className = 'ccard-stock ' + (stock <= 0 ? 'out' : (stock <= 5 ? 'low' : 'ok'));
    }
  }
};

window.saveCustomCardData = async function(key, itemType, itemId, sellingPrice) {
  var costInp  = document.getElementById('cost_'  + key);
  var stockInp = document.getElementById('stock_' + key);
  var cost  = costInp  && costInp.value  !== '' ? parseFloat(costInp.value)  : null;
  var stock = stockInp && stockInp.value !== '' ? parseInt(stockInp.value, 10) : null;
  if (cost == null || stock == null) { alert('⚠️ أدخل سعر التكلفة والكمية'); return; }
  if (!itemId || itemId === 'undefined') { alert('⚠️ This item has no stable ID yet — run the migration in Home Editor first.'); return; }
  await saveItemCostStock(itemType, itemId, cost, stock);
  window.refreshCustomCard(key, sellingPrice);
  // flash button
  var btn = document.querySelector('#ccard_' + key + ' .ccard-save-btn');
  if (btn) { var orig = btn.innerHTML; btn.innerHTML = '✅ Saved'; btn.disabled = true; setTimeout(function(){ btn.innerHTML = orig; btn.disabled = false; }, 1500); }
};

async function loadAndRenderCustomItems() {
  var section = document.getElementById('customSection');

  try {
    const { data: row, error } = await sb.from('settings').select('value').eq('key', 'giftSet').maybeSingle();
    if (error || !row) return;
    var d = row.value || {};

    // ── Candles ── (id assigned by the Home Editor migration; items without one yet are skipped here — run migration first)
    var candlesBySize = d.candlesBySize || {};
    var sizes = d.sizes || [];
    var candlesHtml = '';
    sizes.forEach(function(s, si) {
      var skey = 'size_' + si;
      var candles = candlesBySize[skey] || [];
      candles.forEach(function(c) {
        if (!c.id) return;
        candlesHtml += makeCustomCard({
          key: c.id,
          id: c.id,
          itemType: 'candle',
          badge: (s.label || 'Size') + (s.weight ? ' · ' + s.weight : ''),
          name: (c.name || '—') + (c.scent ? ' · ' + c.scent : ''),
          img: c.img || '',
          sellingPrice: c.price || 0,
          cost: c.cost,
          stock: c.stock
        });
      });
    });
    var cGrid = document.getElementById('customCandlesGrid');
    var cWrap = document.getElementById('customCandlesWrap');
    if (candlesHtml) { cGrid.innerHTML = candlesHtml; cWrap.style.display = 'block'; }

    // ── Containers ── (flat — one independent record per shape, no variants)
    var containers = d.containers || [];
    var contHtml = '';
    containers.forEach(function(c) {
      if (!c.id) return;
      contHtml += makeCustomCard({
        key: c.id,
        id: c.id,
        itemType: 'container',
        badge: (c.type || 'uncategorized').toUpperCase(),
        name: c.name || '—',
        img: c.image || '',
        sellingPrice: c.price || 0,
        cost: c.cost,
        stock: c.stock
      });
    });
    var conGrid = document.getElementById('customContainersGrid');
    var conWrap = document.getElementById('customContainersWrap');
    if (contHtml) { conGrid.innerHTML = contHtml; conWrap.style.display = 'block'; }

    // ── Accessories ──
    var accs = d.accessories || [];
    var accsHtml = '';
    accs.forEach(function(a) {
      if (!a.id) return;
      accsHtml += makeCustomCard({
        key: a.id,
        id: a.id,
        itemType: 'acc',
        badge: 'Accessory',
        name: a.name || '—',
        img: a.img || '',
        sellingPrice: a.price || 0,
        cost: a.cost,
        stock: a.stock
      });
    });
    var aGrid = document.getElementById('customAccsGrid');
    var aWrap = document.getElementById('customAccsWrap');
    if (accsHtml) { aGrid.innerHTML = accsHtml; aWrap.style.display = 'block'; }

    section.style.display = 'block';

  } catch(e) { console.error('Custom items load failed:', e); }
}

// ===== CATEGORY MANAGER =====
var DEFAULT_CATS = [
  { key:'candles',   label:'🕯️ Scented Candles' },
  { key:'unscented', label:'🤍 Unscented' },
  { key:'containers',label:'🫙 Containers & Accessories' },
  { key:'offers',    label:'✨ Limited Edition' }
];

var _cachedCats = null;

function loadCategories() {
  if (_cachedCats) return _cachedCats;
  return DEFAULT_CATS.map(function(c){ return Object.assign({}, c); });
}

async function loadCategoriesFromSupabase() {
  try {
    const { data: row, error } = await sb.from('settings').select('value').eq('key', 'categories').maybeSingle();
    if (!error && row && row.value && row.value.list && row.value.list.length > 0) {
      _cachedCats = row.value.list;
    } else {
      _cachedCats = DEFAULT_CATS.map(function(c){ return Object.assign({}, c); });
    }
  } catch(e) {
    console.warn('Could not load categories from Supabase:', e);
    _cachedCats = DEFAULT_CATS.map(function(c){ return Object.assign({}, c); });
  }
  buildCategorySelect();
}

async function saveCategoriesToStorage(cats) {
  _cachedCats = cats;
  try {
    const { error } = await sb.from('settings').upsert({ key: 'categories', value: { list: cats } });
    if (error) throw error;
  } catch(e) {
    console.warn('Could not save categories to Supabase:', e);
  }
}

function buildCategorySelect() {
  var cats = loadCategories();
  var sel = document.getElementById('f_category');
  var cur = sel.value;
  sel.innerHTML = cats.map(function(c){
    return '<option value="'+c.key+'">'+c.label+'</option>';
  }).join('');
  if (cur && sel.querySelector('option[value="'+cur+'"]')) sel.value = cur;
}

window.openCatManager = function() {
  if (isRestrictedAdmin) return;
  var cats = loadCategories();
  var list = document.getElementById('catList');
  list.innerHTML = cats.map(function(c, i){
    return '<div class="cat-row" id="catrow_'+i+'">'
      + '<input type="text" value="'+c.label+'" id="catlabel_'+i+'" />'
      + '<button class="cat-del" onclick="deleteCategory('+i+')">🗑</button>'
      + '</div>';
  }).join('');
  document.getElementById('newCatEmoji').value = '';
  document.getElementById('newCatName').value = '';
  document.getElementById('catModalOverlay').style.display = 'flex';
};

window.closeCatManager = function() {
  document.getElementById('catModalOverlay').style.display = 'none';
};

window.addCategory = async function() {
  if (isRestrictedAdmin) return;
  var emoji = document.getElementById('newCatEmoji').value.trim();
  var name  = document.getElementById('newCatName').value.trim();
  if (!name) { alert('Please enter a category name.'); return; }
  var label = emoji ? emoji + ' ' + name : name;
  var key   = name.toLowerCase().replace(/[^a-z0-9]/g,'_');
  var cats  = loadCategories();
  // Check duplicate key
  var i = 2;
  var origKey = key;
  while (cats.some(function(c){ return c.key === key; })) { key = origKey + '_' + i++; }
  cats.push({ key: key, label: label });
  saveCategoriesToStorage(cats);
  openCatManager();
  buildCategorySelect();
};

window.deleteCategory = async function(idx) {
  if (isRestrictedAdmin) return;
  var cats = loadCategories();
  if (cats.length <= 1) { alert('Must have at least one category.'); return; }
  cats.splice(idx, 1);
  saveCategoriesToStorage(cats);
  openCatManager();
  buildCategorySelect();
};

window.saveCategories = async function() {
  if (isRestrictedAdmin) return;
  var cats = loadCategories();
  cats.forEach(function(c, i){
    var inp = document.getElementById('catlabel_'+i);
    if (inp) c.label = inp.value.trim() || c.label;
  });
  saveCategoriesToStorage(cats);
  buildCategorySelect();
  closeCatManager();
};

window.updatePreview();
