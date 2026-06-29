// js/pages/dashboard.js
// Moved verbatim out of the <script type="module"> block in pages/dashboard.html.
// Loaded as <script type="module" src="../js/pages/dashboard.js"></script> at the
// end of <body>, same as before — only the location changed, not the type,
// not the order, not a single line of logic.
//
// Every function invoked from an onclick="" / onchange="" / oninput="" attribute
// in dashboard.html is exposed via window.functionName, exactly as it was
// pre-extraction — none of those assignments were touched.
//
// Reuses stock logic via window.CandellaStock (js/services/stockService.js),
// loaded by dashboard.html before this file. No stock/cost logic is
// duplicated here.

// escapeHtml() now comes from js/shared/domUtils.js (loaded before this
// file) — used below wherever customer-submitted free text is rendered
// into innerHTML.

// ════════════════════════════════════════════
// SUPABASE SETUP
// ════════════════════════════════════════════
const sb = window.createSupabaseClient();

let productCostMap = {};
let productNameMap = {};
let productImgMap = {};
let productCategoryMap = {};

// Category key → Arabic display label (same categories used across the site)
var CATEGORY_LABELS = {
  candles:    'شموع معطرة',
  unscented:  'شموع غير معطرة',
  containers: 'أوعية وإكسسوارات',
  offers:     'عروض محدودة'
};

let allOrders = [];
let currentUserRole = 'custom'; // 'custom' or 'super', resolved from admins table after sign-in
let currentUserPermissions = {}; // permissions object for 'custom' role
let currentUserId = null;
let currentUserToken = null;
let currentUserEmail = null; // used to label who changed an order's status (super-only audit trail)

// ===== PERMISSION HELPER =====
// Super always has everything; custom users need the specific flag set true
function hasPermission(key) {
  if (currentUserRole === 'super') return true;
  return !!currentUserPermissions[key];
}

// Toggle login password visibility
window.toggleLoginPw = function() {
  var inp = document.getElementById('adminPass');
  var icon = document.getElementById('loginEyeIcon');
  if (inp.type === 'password') {
    inp.type = 'text';
    icon.className = 'fa-solid fa-eye-slash';
  } else {
    inp.type = 'password';
    icon.className = 'fa-solid fa-eye';
  }
};

// ===== LOGIN (Supabase Auth) =====
window.login = async function() {
  const u = document.getElementById('adminUser').value.trim();
  const p = document.getElementById('adminPass').value.trim();
  const errEl = document.getElementById('loginErr');
  const btn = document.querySelector('.login-btn');
  errEl.textContent = '';
  if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }

  try {
    const { data, error } = await sb.auth.signInWithPassword({ email: u, password: p });
    if (error) throw error;

    const { data: adminRow, error: adminErr } = await sb
      .from('admins')
      .select('role, permissions')
      .eq('id', data.user.id)
      .single();

    if (adminErr || !adminRow) {
      await sb.auth.signOut();
      errEl.textContent = '❌ This account is not authorized for admin access.';
      if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
      return;
    }

    currentUserRole = adminRow.role === 'super' ? 'super' : 'custom';
    currentUserPermissions = adminRow.permissions || {};
    currentUserId = data.user.id;
    currentUserToken = data.session.access_token;
    currentUserEmail = data.user.email;

    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('dashSection').style.display = 'block';
    applyRoleVisibility();
    loadOrders();
  } catch (e) {
    console.error('Login error:', e);
    errEl.textContent = '❌ Wrong email or password';
  }
  if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
}

window.logout = async function() {
  try { await sb.auth.signOut(); } catch(e) { console.error(e); }
  currentUserId = null;
  currentUserToken = null;
  currentUserEmail = null;
  sessionStorage.removeItem('candella_products_unlock');
  sessionStorage.removeItem('candella_he_unlock');
  document.getElementById('loginSection').style.display = 'flex';
  document.getElementById('dashSection').style.display = 'none';
}

// Restore session on page load if Supabase still has the user signed in
async function restoreSession() {
  const { data: { session } } = await sb.auth.getSession();
  if (session && session.user) {
    try {
      const { data: adminRow, error: adminErr } = await sb
        .from('admins')
        .select('role, permissions')
        .eq('id', session.user.id)
        .single();

      if (adminErr || !adminRow) {
        await sb.auth.signOut();
        document.getElementById('loginSection').style.display = 'flex';
        document.getElementById('dashSection').style.display = 'none';
        return;
      }

      currentUserRole = adminRow.role === 'super' ? 'super' : 'custom';
      currentUserPermissions = adminRow.permissions || {};
      currentUserId = session.user.id;
      currentUserToken = session.access_token;
      currentUserEmail = session.user.email;

      document.getElementById('loginSection').style.display = 'none';
      document.getElementById('dashSection').style.display = 'block';
      applyRoleVisibility();
      loadOrders();
      // Realtime subscription
      if (window._ordersChannel) { sb.removeChannel(window._ordersChannel); }
      window._ordersChannel = sb.channel('orders-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, function() { if(currentUserId) loadOrders(); })
        .subscribe();
    } catch(e) {
      console.error('Session restore failed:', e);
    }
  } else {
    document.getElementById('loginSection').style.display = 'flex';
    document.getElementById('dashSection').style.display = 'none';
  }
}
restoreSession();

// ── Auto-refresh safety net ──
// The realtime subscription above (orders-realtime) already pushes
// updates instantly when it's working, but Supabase Realtime depends on
// replication being enabled for the `orders` table in the Supabase
// project settings — if that ever isn't on, or a subscription silently
// drops, this polling loop is what guarantees the dashboard still updates
// on its own instead of needing a manual refresh. Only polls while
// actually logged in and the dashboard is visible, so it's a no-op on the
// login screen.
setInterval(function () {
  if (document.getElementById('dashSection').style.display === 'block') {
    loadOrders();
  }
}, 15000);

// ════════════════════════════════════════════
// EMPLOYEE MANAGEMENT (super only)
// ════════════════════════════════════════════
const EDGE_FUNCTION_URL = "https://jepimvvjavgxkomqigrl.supabase.co/functions/v1/create-admin";

window.openEmployeesModal = async function() {
  if (currentUserRole !== 'super') return;
  document.getElementById('empModal').style.display = 'flex';
  document.getElementById('empAddErr').textContent = '';
  document.getElementById('empEmail').value = '';
  document.getElementById('empPassword').value = '';
  document.getElementById('permFinancials').checked = false;
  document.getElementById('permExportMonthly').checked = false;
  document.getElementById('permMonthlyClosing').checked = false;
  document.getElementById('permViewProducts').checked = false;
  document.getElementById('permViewHomeEditor').checked = false;
  await loadEmployeesList();
};

window.closeEmployeesModal = function() {
  document.getElementById('empModal').style.display = 'none';
};

function empPermCheckbox(id, checked, label) {
  return '<label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">' +
    '<input type="checkbox" id="' + id + '"' + (checked ? ' checked' : '') + ' /> ' + label +
    '</label>';
}

async function loadEmployeesList() {
  const listEl = document.getElementById('empList');
  listEl.innerHTML = '<div style="text-align:center;padding:20px;color:#aaa;"><i class="fa-solid fa-spinner fa-spin"></i></div>';
  try {
    const { data, error } = await sb.from('admins').select('*').order('email');
    if (error) throw error;
    listEl.innerHTML = data.map(function(emp) {
      var isSuper = emp.role === 'super';
      var perms = emp.permissions || {};
      var permLabels = [];
      if (perms.view_financials) permLabels.push('الإيرادات');
      if (perms.export_monthly) permLabels.push('تصدير شهري');
      if (perms.monthly_closing) permLabels.push('تقفيل الشهر');
      if (perms.view_products) permLabels.push('المنتجات');
      if (perms.view_home_editor) permLabels.push('الهوم إديتور');
      var permsText = isSuper ? 'كل الصلاحيات (مدير عام)' : (permLabels.length ? permLabels.join('، ') : 'بدون صلاحيات إضافية');

      var editPanel = isSuper ? '' :
        '<div id="editPanel_' + emp.id + '" style="display:none;width:100%;margin-top:12px;padding-top:12px;border-top:1px solid rgba(0,0,0,0.08);">' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">' +
            empPermCheckbox('editPermFinancials_' + emp.id, perms.view_financials, 'عرض الإيرادات والأرباح') +
            empPermCheckbox('editPermExportMonthly_' + emp.id, perms.export_monthly, 'تصدير إكسل شهري') +
            empPermCheckbox('editPermMonthlyClosing_' + emp.id, perms.monthly_closing, 'تقفيل الشهر') +
            empPermCheckbox('editPermViewProducts_' + emp.id, perms.view_products, 'فتح صفحة المنتجات') +
            empPermCheckbox('editPermViewHomeEditor_' + emp.id, perms.view_home_editor, 'فتح صفحة الهوم إديتور') +
          '</div>' +
          '<button onclick="saveEmployeePermissions(\'' + emp.id + '\')" class="login-btn" style="padding:9px 18px;font-size:12px;width:auto;display:inline-block;margin-right:8px;"><i class="fa-solid fa-floppy-disk"></i> حفظ</button>' +
          '<button onclick="toggleEditEmployee(\'' + emp.id + '\')" style="background:#f5f0e8;border:none;border-radius:8px;padding:9px 18px;font-size:12px;color:#555;cursor:pointer;">إلغاء</button>' +
          '<div id="editErr_' + emp.id + '" style="color:#e74c3c;font-size:12px;margin-top:8px;"></div>' +
        '</div>';

      return '<div style="background:#fff;border:1px solid rgba(201,162,77,0.15);border-radius:12px;padding:14px 16px;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;">' +
        '<div>' +
          '<div style="font-weight:700;font-size:14px;">' + emp.email + (isSuper ? ' <span style="color:var(--gold);">⭐</span>' : '') + '</div>' +
          '<div style="font-size:12px;color:#888;margin-top:3px;">' + permsText + '</div>' +
        '</div>' +
        (isSuper ? '' :
          '<div style="display:flex;gap:8px;">' +
            '<button onclick="toggleEditEmployee(\'' + emp.id + '\')" style="background:#eef2ff;border:1px solid #c7d2fe;color:#3730a3;border-radius:8px;padding:7px 12px;font-size:12px;cursor:pointer;white-space:nowrap;"><i class="fa-solid fa-pen"></i> تعديل</button>' +
            '<button onclick="deleteEmployee(\'' + emp.id + '\',\'' + emp.email + '\')" style="background:#fee;border:1px solid #fcc;color:#c0392b;border-radius:8px;padding:7px 12px;font-size:12px;cursor:pointer;white-space:nowrap;"><i class="fa-solid fa-trash"></i> حذف</button>' +
          '</div>'
        ) +
        editPanel +
      '</div>';
    }).join('');
  } catch(e) {
    console.error(e);
    listEl.innerHTML = '<div style="color:#e74c3c;font-size:13px;">فشل تحميل قائمة الموظفين.</div>';
  }
}

window.toggleEditEmployee = function(id) {
  var panel = document.getElementById('editPanel_' + id);
  if (!panel) return;
  panel.style.display = (panel.style.display === 'block') ? 'none' : 'block';
};

window.saveEmployeePermissions = async function(id) {
  var errEl = document.getElementById('editErr_' + id);
  if (errEl) errEl.textContent = '⏳ جاري الحفظ...';
  var permissions = {
    view_financials:   document.getElementById('editPermFinancials_' + id).checked,
    export_monthly:    document.getElementById('editPermExportMonthly_' + id).checked,
    monthly_closing:   document.getElementById('editPermMonthlyClosing_' + id).checked,
    view_products:     document.getElementById('editPermViewProducts_' + id).checked,
    view_home_editor:  document.getElementById('editPermViewHomeEditor_' + id).checked
  };
  try {
    const { error } = await sb.from('admins').update({ permissions: permissions }).eq('id', id);
    if (error) throw error;
    await loadEmployeesList();
  } catch(e) {
    console.error(e);
    if (errEl) errEl.textContent = '❌ فشل حفظ التعديلات.';
  }
};

window.submitNewEmployee = async function() {
  const email = document.getElementById('empEmail').value.trim();
  const password = document.getElementById('empPassword').value.trim();
  const errEl = document.getElementById('empAddErr');
  errEl.textContent = '';

  if (!email || !password) {
    errEl.textContent = '❌ من فضلك أدخل الإيميل والباسورد.';
    return;
  }
  if (password.length < 6) {
    errEl.textContent = '❌ الباسورد لازم يكون 6 أحرف على الأقل.';
    return;
  }

  const permissions = {
    view_financials:   document.getElementById('permFinancials').checked,
    export_monthly:    document.getElementById('permExportMonthly').checked,
    monthly_closing:   document.getElementById('permMonthlyClosing').checked,
    view_products:     document.getElementById('permViewProducts').checked,
    view_home_editor:  document.getElementById('permViewHomeEditor').checked
  };

  errEl.textContent = '⏳ جاري الإضافة...';
  try {
    const resp = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + currentUserToken
      },
      body: JSON.stringify({ email, password, permissions, callerToken: currentUserToken })
    });
    const result = await resp.json();
    if (!resp.ok) throw new Error(result.error || 'فشل غير معروف');

    errEl.textContent = '';
    document.getElementById('empEmail').value = '';
    document.getElementById('empPassword').value = '';
    await loadEmployeesList();
  } catch(e) {
    console.error(e);
    errEl.textContent = '❌ ' + (e.message || 'فشل إضافة الموظف.');
  }
};

window.deleteEmployee = async function(id, email) {
  if (!confirm('متأكد عاوز تحذف ' + email + '؟')) return;
  try {
    // Remove from admins table — this revokes dashboard access immediately.
    // (The underlying auth user remains but can no longer log into the dashboard.)
    const { error } = await sb.from('admins').delete().eq('id', id);
    if (error) throw error;
    await loadEmployeesList();
  } catch(e) {
    console.error(e);
    alert('❌ فشل حذف الموظف.');
  }
};

// ===== LOAD ORDERS =====
async function loadOrders() {
  const tbody = document.getElementById('ordersBody');
  tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:30px;color:#aaa;"><i class="fa-solid fa-spinner fa-spin"></i> Loading orders...</td></tr>';
  try {
    const { data, error } = await sb
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Common field mapping now comes from OrderService.normalizeOrderRow
    // (js/services/orderService.js) — this page still adds its own
    // _id/statusHistory/shortId+createdAt fallbacks on top, exactly as before.
    allOrders = data.map(function(row) {
      var normalized = window.OrderService.normalizeOrderRow(row);
      normalized._id = row.id;
      normalized.shortId = row.short_id || null;
      normalized.createdAt = row.created_at || new Date().toISOString();
      // Audit trail of who changed the status and when — super-admin-only
      // display, populated by dashboard status changes (see updateStatus).
      // Column may not exist yet on older deployments, hence the
      // fallback to [].
      normalized.statusHistory = row.status_history || [];
      return normalized;
    });
  } catch(e) {
    console.error('Supabase error:', e);
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:30px;color:#e74c3c;">❌ Failed to load orders.</td></tr>';
    return;
  }
  await loadProductCosts();
  updateStats();
  renderOrders();
  populateMonthDropdown();
}
window.loadOrders = loadOrders;

// ===== LOAD PRODUCT COSTS (for profit estimation) =====
async function loadProductCosts() {
  try {
    const { data, error } = await window.ProductsApi.getProductsForCosts(sb);
    if (error) throw error;
    productCostMap = {};
    productNameMap = {};
    productImgMap = {};
    productCategoryMap = {};
    (data || []).forEach(function(row){
      productCostMap[row.id] = (typeof row.cost_price === 'number') ? row.cost_price : 0;
      productNameMap[row.id] = row.name || '';
      productImgMap[row.id] = row.img || '';
      productCategoryMap[row.id] = row.category || 'candles';
    });
    console.log('[Candella] Loaded ' + (data || []).length + ' products:', Object.keys(productNameMap));
  } catch(e) {
    console.error('Failed to load product costs:', e);
  }
}

// ===== ROLE / PERMISSION VISIBILITY =====
function applyRoleVisibility() {
  var isSuper = currentUserRole === 'super';
  // Elements marked super-only need explicit permission OR super role
  document.querySelectorAll('.super-only').forEach(function(el) {
    var permKey = el.getAttribute('data-perm');
    var allowed = isSuper || (permKey && hasPermission(permKey));
    el.style.display = allowed ? '' : 'none';
  });
  // Manage Employees nav link — super only, always
  var manageEmpLink = document.getElementById('manageEmployeesLink');
  if (manageEmpLink) manageEmpLink.style.display = isSuper ? '' : 'none';

  // Manage Products / Home Editor nav links — visible if super or has permission
  var manageProdLink = document.getElementById('manageProductsLink');
  if (manageProdLink) manageProdLink.style.display = (isSuper || hasPermission('view_products')) ? '' : 'none';
  var homeEditorLink = document.getElementById('homeEditorLink');
  if (homeEditorLink) homeEditorLink.style.display = (isSuper || hasPermission('view_home_editor')) ? '' : 'none';
}

// ===== STATS (cancelled مش بتتحسب في الـ revenue) =====
function updateStats() {
  const active    = allOrders.filter(o => o.status !== 'cancelled');
  const cancelled = allOrders.filter(o => o.status === 'cancelled');

  const totalRev    = active.reduce((s, o) => s + (o.total    || 0), 0);
  const shippingRev = active.reduce((s, o) => s + (o.shipping || 0), 0);
  const productRev  = totalRev - shippingRev;

  // Estimated profit: (price - cost) * qty for items whose product still exists,
  // for custom/unknown items assume zero cost (full price counted as profit).
  let estProfit = 0;
  active.forEach(function(o){
    (o.items || []).forEach(function(it){
      var cost = (it.id != null && productCostMap.hasOwnProperty(it.id)) ? productCostMap[it.id] : 0;
      estProfit += ((it.price || 0) - cost) * (it.qty || 0);
    });
    estProfit -= (o.discount || 0);
  });

  document.getElementById('statTotal').textContent        = allOrders.length;
  document.getElementById('statNew').textContent          = allOrders.filter(o => o.status === 'new').length;
  document.getElementById('statConfirmed').textContent    = allOrders.filter(o => o.status === 'confirmed').length;
  document.getElementById('statDelivered').textContent    = allOrders.filter(o => o.status === 'delivered').length;
  document.getElementById('statCancelled').textContent    = cancelled.length;
  document.getElementById('statRevenue').textContent      = 'EGP ' + totalRev.toLocaleString();
  document.getElementById('statProductRev').textContent   = 'EGP ' + productRev.toLocaleString();
  document.getElementById('statShippingRev').textContent  = 'EGP ' + shippingRev.toLocaleString();
  document.getElementById('statProfit').textContent       = 'EGP ' + Math.round(estProfit).toLocaleString();

  // Best Seller card removed

  renderTrackerTables();
}

// ===== RENDER TABLE =====
window.clearDateFilter = function() {
  document.getElementById('dateFilter').value = '';
  renderOrders();
};

function renderOrders() {
  const search = document.getElementById('searchInput').value.toLowerCase();
  const status = document.getElementById('statusFilter').value;
  const dateVal = document.getElementById('dateFilter').value; // format: YYYY-MM-DD

  let filtered = allOrders.filter(o => {
    const matchSearch = !search ||
      (o.customer.fullName||'').toLowerCase().includes(search) ||
      (o.customer.phone||'').includes(search) ||
      (o.shortId||'').includes(search) ||
      String(o.shortId||'').startsWith(search);
    const matchStatus = status === 'all' || o.status === status;
    let matchDate = true;
    if (dateVal) {
      const oDate = new Date(o.createdAt);
      const oDateStr = oDate.getFullYear() + '-' +
        String(oDate.getMonth()+1).padStart(2,'0') + '-' +
        String(oDate.getDate()).padStart(2,'0');
      matchDate = oDateStr === dateVal;
    }
    return matchSearch && matchStatus && matchDate;
  });

  // لو في فلتر تاريخ → رتب من الأقدم للأحدث، غير كده الأحدث أول
  if (dateVal) {
    filtered = filtered.slice().sort(function(a,b){ return new Date(a.createdAt) - new Date(b.createdAt); });
  }

  const tbody = document.getElementById('ordersBody');
  const empty = document.getElementById('emptyState');

  if (filtered.length === 0) { tbody.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';

  tbody.innerHTML = filtered.map(function(o, i) {
    const date = new Date(o.createdAt);
    const dateStr = date.toLocaleDateString('en-GB') + ' ' + date.toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit'});
    const itemsCount = o.items.reduce(function(s, it){ return s + (it.qty||1); }, 0);
    const isCancelled = o.status === 'cancelled';
    return '<tr style="' + (isCancelled ? 'opacity:0.55;' : '') + '">' +
      '<td><strong>#' + (i+1) + '</strong></td>' +
      '<td><strong style="font-family:monospace;font-size:16px;letter-spacing:3px;color:var(--gold);">' + (o.shortId || '-') + '</strong></td>' +
      '<td><strong>' + escapeHtml(o.customer.fullName||'-') + '</strong></td>' +
      '<td>' + (o.customer.phone||'-') + '</td>' +
      '<td>' + (o.customer.governorate||'-') + '</td>' +
      '<td>' + itemsCount + ' item' + (itemsCount > 1 ? 's' : '') + '</td>' +
      '<td><strong style="color:' + (isCancelled ? '#aaa;text-decoration:line-through' : 'var(--gold)') + '">EGP ' + o.total + '</strong></td>' +
      '<td><span class="badge badge-' + o.status + '">' + o.status.toUpperCase() + '</span></td>' +
      '<td style="font-size:12px;color:#888;">' + dateStr + '</td>' +
      '<td><button class="action-btn btn-view" onclick="viewOrder(\'' + o._id + '\')"><i class="fa-solid fa-eye"></i></button></td>' +
    '</tr>';
  }).join('');
}
window.renderOrders = renderOrders;

// ===== POPULATE MONTH DROPDOWN =====
function populateMonthDropdown() {
  const months = {};
  allOrders.forEach(o => {
    const d = new Date(o.createdAt);
    const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
    const label = d.toLocaleString('en-GB', { month: 'long', year: 'numeric' });
    months[key] = label;
  });
  const sel = document.getElementById('exportMonth');
  sel.innerHTML = '<option value="">-- Select Month --</option>';
  Object.keys(months).sort().reverse().forEach(k => {
    sel.innerHTML += '<option value="' + k + '">' + months[k] + '</option>';
  });

  // نفس قايمة الشهور لقسم تقفيل الشهر
  const closingSel = document.getElementById('closingMonth');
  if (closingSel) {
    const prevVal = closingSel.value;
    closingSel.innerHTML = '<option value="">-- اختار الشهر --</option>';
    Object.keys(months).sort().reverse().forEach(k => {
      closingSel.innerHTML += '<option value="' + k + '">' + months[k] + '</option>';
    });
    if (prevVal && months[prevVal]) closingSel.value = prevVal;
  }
}

// ===== EXPORT MONTHLY EXCEL (CSV) =====
window.exportMonthly = function() {
  const monthVal = document.getElementById('exportMonth').value;
  if (!monthVal) { alert('Please select a month first'); return; }

  const [year, month] = monthVal.split('-').map(Number);
  const monthName = new Date(year, month-1).toLocaleString('en-GB', { month: 'long', year: 'numeric' });

  const filtered = allOrders.filter(o => {
    const d = new Date(o.createdAt);
    return d.getFullYear() === year && d.getMonth()+1 === month && o.status !== 'cancelled';
  });
  const cancelled = allOrders.filter(o => {
    const d = new Date(o.createdAt);
    return d.getFullYear() === year && d.getMonth()+1 === month && o.status === 'cancelled';
  });

  if (filtered.length === 0 && cancelled.length === 0) { alert('No orders found for this month'); return; }

  const wb = XLSX.utils.book_new();

  // ==========================================
  // SHEET 1: الطلبات التفصيلية
  // ==========================================
  const ordersData = [
    ['Candella – Monthly Orders Report'],
    [monthName],
    [],
    ['Order#', 'Date', 'Customer', 'Phone', 'Governorate', 'Address', 'Items (Scent/Size)', 'Qty', 'Subtotal (EGP)', 'Discount (EGP)', 'Shipping (EGP)', 'Total (EGP)', 'Payment', 'Status', 'Promo', 'Notes']
  ];
  [...filtered, ...cancelled].forEach((o, i) => {
    const itemsStr = o.items.map(it => {
      if (it.isGiftSet) return '🎁 Gift Set [Size:' + (it.giftSize||'') + ' | Candle:' + (it.giftCandle||'') + ' | Container:' + (it.giftContainer||'') + ' | Acc:' + (it.giftAccessories||'') + '] x' + it.qty;
      return it.name + ' x' + it.qty + (it.scent ? ' ['+it.scent+']' : '') + (it.size ? ' ['+it.size+']' : '');
    }).join(' | ');
    const totalQty = o.items.reduce((s, it) => s + (it.qty||1), 0);
    ordersData.push([
      o.shortId || (i + 1),
      new Date(o.createdAt).toLocaleString('en-GB'),
      o.customer.fullName || '',
      o.customer.phone || '',
      o.customer.governorate || '',
      (o.customer.address || ''),
      itemsStr,
      totalQty,
      o.subtotal || o.total,
      o.discount || 0,
      o.shipping || 0,
      o.status === 'cancelled' ? 0 : o.total,
      o.paymentMethod || 'cash',
      o.status.toUpperCase(),
      o.promoCode || '',
      o.customer.notes || ''
    ]);
  });
  // Summary
  const netRev      = filtered.reduce((s, o) => s + o.total, 0);
  const shippingRev = filtered.reduce((s, o) => s + (o.shipping || 0), 0);
  const productRev  = netRev - shippingRev;
  ordersData.push([]);
  ordersData.push(['صافي الإيراد (EGP):', netRev]);
  ordersData.push(['  منه إيراد المنتجات (EGP):', productRev]);
  ordersData.push(['  منه إيراد التوصيل (EGP):', shippingRev]);
  ordersData.push(['الطلبات النشطة:', filtered.length]);
  ordersData.push(['الملغية:', cancelled.length]);

  const ws1 = XLSX.utils.aoa_to_sheet(ordersData);
  ws1['!cols'] = [
    {wch:4},{wch:18},{wch:22},{wch:14},{wch:14},{wch:30},
    {wch:35},{wch:5},{wch:10},{wch:12},{wch:20}
  ];
  xlsxStyle(wb, ws1, 3, 'FFF8F4EE');
  XLSX.utils.book_append_sheet(wb, ws1, 'Orders');

  // ==========================================
  // SHEET 2: تحليل المنتجات
  // ==========================================
  const productMap = {};
  filtered.forEach(o => {
    o.items.forEach(it => {
      const key = it.name;
      if (!productMap[key]) {
        productMap[key] = { name: key, price: it.price, totalQty: 0, totalRevenue: 0, orderCount: 0 };
      }
      productMap[key].totalQty += (it.qty || 1);
      productMap[key].totalRevenue += (it.qty || 1) * it.price;
      productMap[key].orderCount += 1;
    });
  });

  const productsSorted = Object.values(productMap).sort((a, b) => b.totalQty - a.totalQty);

  const productsData = [
    ['Candella – Products Analysis'],
    [monthName],
    [],
    ['Rank', 'Product Name', 'Unit Price (EGP)', 'Qty Sold', 'Orders Count', 'Total Revenue (EGP)', '% of Revenue']
  ];
  const totalAllRev = productsSorted.reduce((s, p) => s + p.totalRevenue, 0);
  productsSorted.forEach((p, i) => {
    const pct = totalAllRev > 0 ? ((p.totalRevenue / totalAllRev) * 100).toFixed(1) + '%' : '0%';
    productsData.push([
      i + 1,
      p.name,
      p.price,
      p.totalQty,
      p.orderCount,
      p.totalRevenue,
      pct
    ]);
  });
  productsData.push([]);
  productsData.push(['', 'TOTAL', '', productsSorted.reduce((s,p)=>s+p.totalQty,0), '', totalAllRev, '100%']);

  const ws2 = XLSX.utils.aoa_to_sheet(productsData);
  ws2['!cols'] = [
    {wch:6},{wch:28},{wch:14},{wch:10},{wch:13},{wch:16},{wch:13}
  ];
  xlsxStyle(wb, ws2, 3, 'FFF8F4EE');
  XLSX.utils.book_append_sheet(wb, ws2, 'Products Analysis');

  // ==========================================
  // SHEET 3: ملخص الشهر
  // ==========================================
  const summaryData = [
    ['Candella – ملخص الشهر'],
    [monthName],
    [''],
    ['المؤشر', 'القيمة'],
    ['الطلبات النشطة', filtered.length],
    ['الطلبات الملغية', cancelled.length],
    ['إجمالي الطلبات', filtered.length + cancelled.length],
    [''],
    ['صافي الإيراد (EGP)', netRev],
    ['  إيراد المنتجات (EGP)', productRev],
    ['  إيراد التوصيل (EGP)', shippingRev],
    ['متوسط قيمة الطلب (EGP)', filtered.length > 0 ? (netRev / filtered.length).toFixed(2) : 0],
    [''],
    ['أكثر منتج مبيعاً', productsSorted.length > 0 ? productsSorted[0].name : '-'],
    ['كمية المنتج الأكثر مبيعاً', productsSorted.length > 0 ? productsSorted[0].totalQty : 0],
    ['إيراد المنتج الأكثر مبيعاً (EGP)', productsSorted.length > 0 ? productsSorted[0].totalRevenue : 0],
    [''],
    ['أكثر محافظة طلباتها', getMostPopular(filtered)],
  ];

  const ws3 = XLSX.utils.aoa_to_sheet(summaryData);
  ws3['!cols'] = [{wch:28},{wch:20}];
  xlsxStyle(wb, ws3, 3, 'FFF8F4EE');
  XLSX.utils.book_append_sheet(wb, ws3, 'Summary');

  // ==========================================
  // SHEET 4: Best Sellers
  // ==========================================
  const bestSellersData = [
    ['Candella – Best Sellers'],
    [monthName],
    [],
    ['Rank', 'Product Name', 'Qty Sold', 'Orders Count', 'Revenue (EGP)', '% of Revenue']
  ];
  const totalBSRev = productsSorted.reduce((s,p) => s + p.totalRevenue, 0);
  productsSorted.forEach((p, i) => {
    const medals = ['🥇','🥈','🥉'];
    const rank = medals[i] || (i+1);
    const pct = totalBSRev > 0 ? ((p.totalRevenue / totalBSRev)*100).toFixed(1)+'%' : '0%';
    bestSellersData.push([rank, p.name, p.totalQty, p.orderCount, p.totalRevenue, pct]);
  });
  bestSellersData.push([]);
  bestSellersData.push(['', 'TOTAL', productsSorted.reduce((s,p)=>s+p.totalQty,0), '', totalBSRev, '100%']);

  const ws4 = XLSX.utils.aoa_to_sheet(bestSellersData);
  ws4['!cols'] = [{wch:6},{wch:28},{wch:10},{wch:13},{wch:16},{wch:13}];
  xlsxStyle(wb, ws4, 3, 'FFF3F3');
  XLSX.utils.book_append_sheet(wb, ws4, '🔥 Best Sellers');

  // Download
  XLSX.writeFile(wb, 'Candella_' + monthName.replace(' ', '_') + '.xlsx', { cellStyles: true });
}

function getMostPopular(orders) {
  const govMap = {};
  orders.forEach(o => {
    const g = o.customer.governorate || 'Unknown';
    govMap[g] = (govMap[g] || 0) + 1;
  });
  return Object.entries(govMap).sort((a,b) => b[1]-a[1])[0]?.[0] || '-';
}

// ===== QUICK STATUS UPDATE =====
const STATUS_RANK = {new:0, confirmed:1, shipped:2, delivered:3, cancelled:4};

// Super always passes straight through. Custom users only get here if they already
// have the permission (the link itself is hidden otherwise) — no second password needed,
// since they already authenticated to reach the dashboard.
window.goToHomeEditor = function() {
  if (!hasPermission('view_home_editor') && currentUserRole !== 'super') return;
  sessionStorage.setItem('candella_admin_token', currentUserToken);
  sessionStorage.setItem('candella_admin_role', currentUserRole);
  window.location.href = 'home-editor.html';
};

window.goToProducts = function() {
  if (!hasPermission('view_products') && currentUserRole !== 'super') return;
  sessionStorage.setItem('candella_admin_token', currentUserToken);
  sessionStorage.setItem('candella_admin_role', currentUserRole);
  window.location.href = 'products.html';
};

window.closePwModal = function() {
  document.getElementById('pwModal').style.display = 'none';
  window._pwCallback = null;
};

window.togglePwVisibility = function() {
  var inp = document.getElementById('pwInput');
  var icon = document.getElementById('pwEyeIcon');
  if (inp.type === 'password') {
    inp.type = 'text';
    icon.className = 'fa-solid fa-eye-slash';
  } else {
    inp.type = 'password';
    icon.className = 'fa-solid fa-eye';
  }
};

// ===== RESTORE STOCK ON CANCEL =====
async function restoreStockForOrder(o) {
  try {
    var items = o.items || [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];

      // ── منتج عادي: نستخدم RPC ذرّية عشان منوقعش في مشاكل لو حصل تحديث في نفس اللحظة ──
      if (it.id) {
        var rpcResult = await window.CandellaStock.adjustProductStock(sb, it.id, it.qty, +1);
        if (rpcResult && rpcResult.error) console.error('فشل إرجاع منتج', it.id, rpcResult.error);
        continue;
      }

      // ── كاستم جيفت سيت ──
      if (it.isGiftSet) {
        await restoreCustomGiftStock(it);
      }
    }
  } catch(e) { console.error('فشل إرجاع الكمية للمخزون:', e); }
}

// يرجع الاستوك لكل عنصر داخل الكاستم جيفت سيت
// يستخدم الموديول المشترك في js/services/stockService.js (stable-id based)
// بدلاً من النسخة الداخلية المكررة سابقًا.
async function restoreCustomGiftStock(giftItem) {
  var result = await window.CandellaStock.adjustCustomGiftStock(sb, giftItem, +1);
  if (result && result.error) console.error('فشل إرجاع استوك الكاستم:', result.error);
}

function requirePassword(callback) {
  document.getElementById('pwModal').style.display = 'flex';
  document.getElementById('pwInput').value = '';
  document.getElementById('pwErr').textContent = '';
  document.getElementById('pwInput').focus();
  window._pwCallback = callback;
}

window.submitPwModal = async function() {
  var pw = document.getElementById('pwInput').value;
  var errEl = document.getElementById('pwErr');
  var btn = document.querySelector('#pwModal button[onclick="submitPwModal()"]');
  errEl.textContent = '⏳ جاري التحقق...';
  if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }
  try {
    // Verify against the super admin's password using a disposable client,
    // so we don't disturb the currently logged-in session.
    const tempClient = window.createSupabaseClient();
    const { error } = await tempClient.auth.signInWithPassword({
      email: 'doosa@candella-store.com',
      password: pw
    });
    if (error) throw error;
    await tempClient.auth.signOut();
    errEl.textContent = '';
    document.getElementById('pwModal').style.display = 'none';
    if (window._pwCallback) window._pwCallback();
  } catch(e) {
    errEl.textContent = '❌ باسورد غلط.';
    document.getElementById('pwInput').value = '';
    document.getElementById('pwInput').focus();
  }
  if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
};

// ── Gift-set "fanned" image stack — shows every selected component's
// photo (candle/containers/accessories) overlapping like a hand of cards,
// instead of just one image. Falls back to the single `img` field for
// older orders saved before these per-component fields existed. ──
function giftImageStack(item, size) {
  size = size || 56;
  // Image-gathering/component-derivation logic now comes from
  // CustomGiftService.buildGiftStackData (js/services/customGiftService.js).
  var data = window.CustomGiftService.buildGiftStackData(item, size);
  if (!data.imgs.length) {
    return '<div style="width:' + size + 'px;height:' + size + 'px;background:#ede8df;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;">🎁</div>';
  }
  var shown = data.shown, stackWidth = data.stackWidth;
  var enc = encodeURIComponent(JSON.stringify(data.components));
  // openGiftGallery now comes from js/shared/giftGallery.js (loaded
  // before this file) — explicit options here reproduce this page's two
  // deliberate differences (higher z-index so the gallery sits above the
  // dashboard's other modals, and no loading="lazy" on the thumbnails)
  // exactly as before.
  return '<div onclick="event.stopPropagation();openGiftGallery(\'' + enc + '\',{zIndex:99999,lazy:false})" style="cursor:zoom-in;position:relative;width:' + stackWidth + 'px;height:' + size + 'px;flex-shrink:0;">'
    + shown.map(function(url, i) {
        var rot = (i - (shown.length - 1) / 2) * 8;
        return '<img src="' + url + '" style="position:absolute;left:' + (i * Math.round(size * 0.2)) + 'px;top:0;width:' + size + 'px;height:' + size + 'px;object-fit:cover;border-radius:8px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.18);transform:rotate(' + rot + 'deg);z-index:' + i + ';" />';
      }).join('')
    + '</div>';
}

// ===== VIEW ORDER MODAL =====
window.viewOrder = function(id) {
  const o = allOrders.find(x => x._id === id);
  if (!o) return;
  const date = new Date(o.createdAt).toLocaleString('en-GB');
  document.getElementById('modalContent').innerHTML =
    '<div class="modal-row"><span>Order #</span><span style="font-family:monospace;font-size:22px;letter-spacing:4px;font-weight:900;color:var(--gold);">' + (o.shortId || '-') + '</span></div>' +
    '<div class="modal-row"><span>Order ID</span><span style="font-size:10px;word-break:break-all;color:#aaa;">' + o._id + '</span></div>' +
    '<div class="modal-row"><span>Date</span><span>' + date + '</span></div>' +
    '<div class="modal-row"><span>Customer</span><span>' + escapeHtml(o.customer.fullName||'-') + '</span></div>' +
    '<div class="modal-row"><span>Phone</span><span>' + escapeHtml(o.customer.phone||'-') + '</span></div>' +
    '<div class="modal-row"><span>Governorate</span><span>' + escapeHtml(o.customer.governorate||'-') + '</span></div>' +
    '<div class="modal-row"><span>Address</span><span style="max-width:280px;">' + escapeHtml(o.customer.address||'-') + '</span></div>' +
    (o.customer.notes ? '<div class="modal-row"><span>Notes</span><span>' + escapeHtml(o.customer.notes) + '</span></div>' : '') +
    (o.cancelReason ? '<div class="modal-row"><span style="color:#e74c3c;">Cancel Reason</span><span style="color:#e74c3c;font-weight:700;">' + escapeHtml(o.cancelReason) + '</span></div>' : '') +
    '<div class="modal-items">' +
      o.items.map(function(it) {
        if (it.isGiftSet) {
          return '<div class="modal-item" style="flex-direction:column;align-items:flex-start;gap:8px;">' +
            '<div style="display:flex;align-items:center;gap:12px;width:100%;">' +
              giftImageStack(it) +
              '<div style="flex:1"><div class="modal-item-name">🎁 Custom Gift Set</div>' +
              '<div class="modal-item-sub">Qty: ' + it.qty + ' × EGP ' + it.price + '</div></div>' +
              '<div style="font-weight:700;color:var(--gold);">EGP ' + (it.qty * it.price) + '</div>' +
            '</div>' +
            '<div style="width:100%;background:#f9f7f4;border-radius:6px;padding:8px 12px;font-size:12px;color:#666;line-height:2;">' +
              (it.giftSize && it.giftSize !== '—' ? '<div><strong>Size:</strong> ' + it.giftSize + '</div>' : '') +
              (it.giftCandle && it.giftCandle !== '—' ? '<div><strong>Candle:</strong> ' + it.giftCandle + '</div>' : '') +
              (it.giftContainer && it.giftContainer !== '—' ? '<div><strong>Container:</strong> ' + it.giftContainer + '</div>' : '') +
              (it.giftAccessories && it.giftAccessories !== '—' && it.giftAccessories !== 'None' ? '<div><strong>Accessories:</strong> ' + it.giftAccessories + '</div>' : '') +
            '</div>' +
          '</div>';
        }
        var itJson = JSON.stringify({name:it.name,img:(it.img||''),price:it.price,qty:it.qty,scent:(it.scent||''),size:(it.size||''),desc:(it.desc||'')});
        var enc = encodeURIComponent(itJson);
        return '<div class="modal-item" style="cursor:pointer;border-radius:6px;padding:10px 6px;transition:background 0.2s;" '
          + 'ondblclick="showItemDetail(\'' + enc + '\')" '
          + 'title="انقر مرتين لعرض التفاصيل">'
          + (it.img ? '<img src="' + it.img + '" />' : '<div style="width:48px;height:48px;background:#ede8df;border-radius:8px;text-align:center;line-height:48px;">🕯️</div>')
          + '<div style="flex:1"><div class="modal-item-name">' + it.name + '</div>'
          + '<div class="modal-item-sub">Qty: ' + it.qty + ' × EGP ' + it.price + (it.scent ? ' · ' + it.scent : '') + (it.size ? ' · ' + it.size : '') + '</div></div>'
          + '<div style="font-weight:700;color:var(--gold);">EGP ' + (it.qty * it.price) + '</div>'
          + '<span style="font-size:10px;color:#bbb;margin-left:4px;" title="انقر مرتين">⤡</span>'
          + '</div>';
      }).join('') +
    '</div>' +
    '<div class="modal-total">' +
      '<div style="font-size:12px;color:#888;margin-bottom:6px;line-height:2;">' +
        'Subtotal: EGP ' + (o.subtotal || o.total) +
        (o.discount ? ' &nbsp;·&nbsp; Discount: <span style="color:#e74c3c;">-EGP ' + o.discount + '</span>' : '') +
        ' &nbsp;·&nbsp; Shipping (' + (o.customer.governorate||'-') + '): <strong style="color:' + ((o.shipping||0) === 0 ? '#27ae60' : '#1a5276') + ';">' + ((o.shipping||0) === 0 ? 'FREE 🎉' : 'EGP ' + o.shipping) + '</strong>' +
      '</div>' +
      'Total: EGP ' + o.total +
    '</div>' +
    (o.status === 'cancelled'
      ? '<div style="margin-top:14px;padding:12px 16px;background:#fdecea;border:1px solid #f5c6c2;border-radius:8px;color:#c0392b;font-weight:700;font-size:13px;text-align:center;">❌ هذا الطلب ملغي — الحالة مقفولة ولا يمكن تعديلها لأي حد.</div>'
      : '<select class="status-select" id="modalStatus">' +
        '<option value="new"' + (o.status==='new'?' selected':'') + '>🆕 New</option>' +
        '<option value="confirmed"' + (o.status==='confirmed'?' selected':'') + '>✅ Confirmed</option>' +
        '<option value="shipped"' + (o.status==='shipped'?' selected':'') + '>🚚 Out for Delivery</option>' +
        '<option value="delivered"' + (o.status==='delivered'?' selected':'') + '>🏠 Delivered</option>' +
        '<option value="cancelled"' + (o.status==='cancelled'?' selected':'') + '>❌ Cancelled</option>' +
      '</select>' +
      '<button class="save-status-btn" onclick="updateStatus(\'' + o._id + '\')">💾 Save Status</button>') +
    // Super-admin-only audit trail — who changed the status, to what, and
    // when. Hidden from regular ('custom') admin accounts entirely.
    (currentUserRole === 'super' && o.statusHistory && o.statusHistory.length
      ? '<div style="margin-top:14px;padding:10px 14px;background:#f7f4ee;border-radius:8px;font-size:11px;color:#888;line-height:1.9;">' +
          '<div style="font-weight:700;color:#555;margin-bottom:4px;">🔒 سجل التعديلات (Super Admin فقط)</div>' +
          o.statusHistory.map(function(h){
            var d = new Date(h.at);
            return '<div>' + (h.by||'?') + ' → <strong>' + (h.status||'').toUpperCase() + '</strong> <span style="color:#bbb;">(' + d.toLocaleString('en-GB') + ')</span></div>';
          }).join('') +
        '</div>'
      : '');
  document.getElementById('modalOverlay').classList.add('show');
}

// ===== UPDATE STATUS IN SUPABASE =====
window.updateStatus = async function(id) {
  const o = allOrders.find(x => x._id === id);
  if (!o) return;
  // Locked once cancelled — the Save Status button isn't even rendered
  // in that case, but this stays as a hard backstop.
  if (o.status === 'cancelled') { alert('❌ هذا الطلب ملغي بالفعل — الحالة مقفولة ولا يمكن تعديلها.'); return; }
  const modalStatusEl = document.getElementById('modalStatus');
  if (!modalStatusEl) return;
  const newStatus = modalStatusEl.value;
  const curRank = STATUS_RANK[o.status] ?? 0;
  const newRank = STATUS_RANK[newStatus] ?? 0;
  const doSave = async function() {
    try {
      // Super-admin-only audit trail: who changed the status, to what,
      // and when — appended to the order's status_history column.
      var historyEntry = { status: newStatus, by: currentUserEmail || 'unknown', role: currentUserRole, at: new Date().toISOString() };
      var newHistory = (o.statusHistory || []).concat([historyEntry]);

      // When cancelling, the update itself — not the in-memory `o.status`
      // snapshot — decides whether THIS call is the one that actually
      // transitions the order. `o` comes from `allOrders.find(...)`,
      // captured whenever this modal was opened; if the customer
      // self-cancelled the same order in the meantime (and the realtime
      // subscription refreshed allOrders in the background), this local
      // `o` can still show the old pre-cancel status even though the row
      // is already cancelled. .neq('status','cancelled') makes Postgres
      // re-check the CURRENT row at the instant of the write, atomically,
      // in the same round trip — no separate read-then-write race window.
      var query = sb.from('orders').update({ status: newStatus, status_history: newHistory }).eq('id', id);
      if (newStatus === 'cancelled') query = query.neq('status', 'cancelled');
      const { data: updatedRows, error } = await query.select('id, items');
      if (error) throw error;

      if (newStatus === 'cancelled') {
        var didTransition = !!(updatedRows && updatedRows.length > 0);
        // Only restore stock if THIS call actually flipped the row — if
        // it was already cancelled, updatedRows is empty and the RPCs
        // are skipped entirely, using the items Postgres just confirmed
        // rather than whatever `o.items` happened to hold locally.
        if (didTransition) {
          await restoreStockForOrder({ items: updatedRows[0].items });
        }
      }
      o.status = newStatus;
      o.statusHistory = newHistory;
      updateStats();
      renderOrders();
      closeModal();
    } catch(e) { alert('❌ فشل تحديث الحالة.'); console.error(e); }
  };
  // السوبر يوزر → بدون باسورد
  if (currentUserRole === 'super') {
    await doSave();
  } else if (newStatus === 'cancelled' || newRank < curRank) {
    // cancelled دايماً يطلب باسورد + أي رجوع لحالة أقل
    requirePassword(doSave);
  } else {
    await doSave();
  }
}

// ===== PRODUCT DETAIL POPUP =====
window.showItemDetail = function(enc) {
  var it = JSON.parse(decodeURIComponent(enc));
  document.getElementById('productPopupContent').innerHTML =
    '<h3 style="font-family:\'Playfair Display\',serif;font-size:18px;margin-bottom:16px;padding-bottom:10px;border-bottom:2px solid rgba(201,162,77,0.2);">🕯️ تفاصيل المنتج</h3>' +
    (it.img ? '<img src="' + it.img + '" style="width:100%;height:200px;object-fit:cover;border-radius:10px;margin-bottom:16px;" />' : '') +
    '<div class="modal-row"><span>الاسم</span><span style="font-weight:900;color:#111;">' + it.name + '</span></div>' +
    (it.desc ? '<div class="modal-row"><span>الوصف</span><span>' + it.desc + '</span></div>' : '') +
    '<div class="modal-row"><span>السعر</span><span style="color:var(--gold);font-weight:700;">EGP ' + it.price + '</span></div>' +
    '<div class="modal-row"><span>الكمية</span><span>' + it.qty + '</span></div>' +
    '<div class="modal-row"><span>الإجمالي</span><span style="color:var(--gold);font-weight:700;">EGP ' + (it.qty * it.price) + '</span></div>' +
    (it.scent ? '<div class="modal-row"><span>العطر</span><span>' + it.scent + '</span></div>' : '') +
    (it.size  ? '<div class="modal-row"><span>الحجم</span><span>' + it.size + '</span></div>' : '');
  document.getElementById('productPopupOverlay').classList.add('show');
}

window.closeProductPopup = function(e) {
  if (e && e.target !== document.getElementById('productPopupOverlay')) return;
  document.getElementById('productPopupOverlay').classList.remove('show');
}

// ===== DAILY EXPORT =====
window.exportDaily = function() {
  var dayVal = document.getElementById('exportDay').value;
  if (!dayVal) { alert('من فضلك اختر يوم أولاً'); return; }

  var [year, month, day] = dayVal.split('-').map(Number);
  var dayLabel = new Date(year, month-1, day).toLocaleDateString('ar-EG', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

  var dayOrders = allOrders.filter(function(o) {
    var d = new Date(o.createdAt);
    return d.getFullYear()===year && d.getMonth()+1===month && d.getDate()===day && o.status!=='cancelled';
  });

  if (dayOrders.length === 0) { alert('لا يوجد طلبات في هذا اليوم'); return; }

  var wb = XLSX.utils.book_new();

  // ── الورقة 1: الأصناف باعدادها (للتجهيز) ──
  var productMap = {};
  dayOrders.forEach(function(o) {
    o.items.forEach(function(it) {
      var key = it.name + (it.scent ? ' [' + it.scent + ']' : '') + (it.size ? ' [' + it.size + ']' : '');
      if (!productMap[key]) productMap[key] = { name:it.name, scent:it.scent||'', size:it.size||'', price:it.price, qty:0 };
      productMap[key].qty += (it.qty||1);
    });
  });
  var items1 = [['Candella – قائمة التجهيز اليومي'], [dayLabel], ['']];
  items1.push(['المنتج', 'العطر / الحجم', 'السعر (EGP)', 'الكمية المطلوبة', 'الإجمالي (EGP)']);
  Object.values(productMap).sort(function(a,b){return b.qty-a.qty;}).forEach(function(p) {
    items1.push([p.name, (p.scent||p.size||'-'), p.price, p.qty, p.price*p.qty]);
  });
  items1.push([]);
  items1.push(['إجمالي عدد الأصناف:', Object.values(productMap).reduce(function(s,p){return s+p.qty;},0)]);
  var ws1 = XLSX.utils.aoa_to_sheet(items1);
  ws1['!cols'] = [{wch:30},{wch:16},{wch:14},{wch:16},{wch:14}];
  xlsxStyle(wb, ws1, 3, 'FFF8F4EE');
  XLSX.utils.book_append_sheet(wb, ws1, 'قائمة التجهيز');

  // ── الورقة 2: كل طلب بالرقم والتفاصيل ──
  var items2 = [['Candella – تفاصيل طلبات اليوم'], [dayLabel], ['']];
  items2.push(['رقم الطلب', 'العميل', 'التليفون', 'المحافظة', 'المنتجات', 'الكمية', 'Subtotal (EGP)', 'شحن (EGP)', 'الإجمالي (EGP)', 'الحالة', 'الوقت']);
  dayOrders.forEach(function(o) {
    var itemsStr = o.items.map(function(it){return it.name+' ×'+it.qty+(it.scent?'['+it.scent+']':'')+(it.size?'['+it.size+']':'');}).join(' | ');
    var totalQty = o.items.reduce(function(s,it){return s+(it.qty||1);},0);
    var t = new Date(o.createdAt);
    var timeStr = t.toLocaleTimeString('ar-EG', {hour:'2-digit',minute:'2-digit'});
    items2.push([
      o.shortId||'-', o.customer.fullName||'', o.customer.phone||'',
      o.customer.governorate||'', itemsStr, totalQty,
      o.subtotal||o.total, o.shipping||0, o.total,
      o.status.toUpperCase(), timeStr
    ]);
  });
  items2.push([]);
  items2.push(['إجمالي الإيراد:', '', '', '', '', '', '', '', dayOrders.reduce(function(s,o){return s+o.total;},0)]);
  var ws2 = XLSX.utils.aoa_to_sheet(items2);
  ws2['!cols'] = [{wch:8},{wch:22},{wch:14},{wch:14},{wch:35},{wch:8},{wch:12},{wch:10},{wch:12},{wch:12},{wch:8}];
  xlsxStyle(wb, ws2, 3, 'FFF8F4EE');
  XLSX.utils.book_append_sheet(wb, ws2, 'تفاصيل الطلبات');

  var fname = 'Candella_يوم_' + dayVal + '.xlsx';
  XLSX.writeFile(wb, fname, { cellStyles: true });
}

window.closeModal = function(e) {
  if (e && e.target !== document.getElementById('modalOverlay')) return;
  document.getElementById('modalOverlay').classList.remove('show');
}

// ===== SHARED EXCEL STYLE HELPER — matches candella_customers.xlsx exactly =====
function xlsxStyle(wb, ws, headerRow, bgEven) {
  // Exact colors from candella_customers.xlsx:
  // Row 0 (Title):    fill=1E3A5F (navy),  font=FFFFFF (white), bold, sz=13
  // Row 1 (Subtitle): fill=F8F4EE (cream),  font=888888 (grey),  normal
  // Row 2 (empty):    fill=FFFFFF
  // headerRow:        fill=C8A96E (gold),   font=FFFFFF (white), bold, sz=10
  // data even rows:   fill=bgEven,           font=111111
  // data odd rows:    fill=FFFFFF,           font=111111
  // borders: thin DDDDDD on all cells

  var NAVY  = 'FF1E3A5F';
  var GOLD  = 'FFC8A96E';
  var WHITE = 'FFFFFFFF';
  var CREAM = 'FFF8F4EE';
  var GREY  = 'FF888888';
  var BLUE_LINK = 'FF0070C0';
  var EVEN  = bgEven ? ('FF' + bgEven.replace(/^FF/,'').replace(/^#/,'')) : 'FFE8F5E9';
  var border = {
    top:    { style: 'thin', color: { rgb: 'FFDDDDDD' } },
    bottom: { style: 'thin', color: { rgb: 'FFDDDDDD' } },
    left:   { style: 'thin', color: { rgb: 'FFDDDDDD' } },
    right:  { style: 'thin', color: { rgb: 'FFDDDDDD' } }
  };

  var range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  if (!ws['!rows']) ws['!rows'] = [];

  for (var R = range.s.r; R <= range.e.r; R++) {
    // Row heights
    if (R === 0)         ws['!rows'][R] = { hpt: 32 };
    else if (R === 1)    ws['!rows'][R] = { hpt: 20 };
    else if (R === headerRow) ws['!rows'][R] = { hpt: 26 };
    else                 ws['!rows'][R] = { hpt: 20 };

    for (var C = range.s.c; C <= range.e.c; C++) {
      var addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[addr]) ws[addr] = { v: '', t: 's' };

      var isDataRow = R > headerRow;
      var dataIdx   = R - headerRow; // 1-based data row index
      var isEvenData = isDataRow && (dataIdx % 2 === 1); // 1st data row = even fill

      // Detect hyperlink/link cell
      var isLink = isDataRow && ws[addr].v && typeof ws[addr].v === 'string' &&
                   (ws[addr].v.indexOf('wa.me') !== -1 || ws[addr].v.indexOf('HYPERLINK') !== -1 ||
                    ws[addr].v.indexOf('http') !== -1);

      var fillColor, fontColor, isBold, fontSize, hAlign;

      if (R === 0) {
        // Title row
        fillColor = NAVY; fontColor = WHITE; isBold = true; fontSize = 13; hAlign = 'left';
      } else if (R === 1) {
        // Subtitle row
        fillColor = CREAM; fontColor = GREY; isBold = false; fontSize = 10; hAlign = 'left';
      } else if (R === 2 && R < headerRow) {
        // Empty spacer row
        fillColor = WHITE; fontColor = WHITE; isBold = false; fontSize = 10; hAlign = 'left';
      } else if (R === headerRow) {
        // Header row — GOLD background
        fillColor = GOLD; fontColor = WHITE; isBold = true; fontSize = 10; hAlign = 'center';
      } else {
        // Data rows
        fillColor = isEvenData ? EVEN : WHITE;
        fontColor = isLink ? BLUE_LINK : '111111';
        isBold = false; fontSize = 10; hAlign = 'left';
      }

      ws[addr].s = {
        font: { name: 'Arial', bold: isBold, sz: fontSize, color: { rgb: fontColor } },
        fill: { patternType: 'solid', fgColor: { rgb: fillColor } },
        alignment: { horizontal: hAlign, vertical: 'center', wrapText: false },
        border: border
      };
    }
  }
}

// ===== EXPORT TRACKER EXCEL =====
window.exportTrackerExcel = function() {
  var delivered = allOrders.filter(function(o) { return o.status === 'delivered'; });
  var cancelled = allOrders.filter(function(o) { return o.status === 'cancelled'; });

  if (delivered.length === 0 && cancelled.length === 0) {
    alert('No delivered or cancelled orders yet.');
    return;
  }

  var wb = XLSX.utils.book_new();

  function makeTrackerSheet(orders, titleText) {
    var data = [
      [titleText],
      ['Candella – Customer Tracker'],
      [],
      ['#', 'Order #', 'Customer Name', 'Phone', 'Governorate', 'Total (EGP)', 'Date', 'WhatsApp Link']
    ];
    orders.forEach(function(o, i) {
      var phone = (o.customer.phone || '').replace(/^0/, '');
      var d = new Date(o.createdAt);
      var dateStr = d.toLocaleDateString('en-GB') + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      data.push([
        i + 1,
        o.shortId || '-',
        o.customer.fullName || '-',
        o.customer.phone || '-',
        o.customer.governorate || '-',
        o.total,
        dateStr,
        'https://wa.me/2' + phone
      ]);
    });
    var ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{wch:5},{wch:10},{wch:28},{wch:16},{wch:16},{wch:14},{wch:20},{wch:36}];
    xlsxStyle(wb, ws, 3, 'E8F5E9');
    return ws;
  }

  var ws1 = makeTrackerSheet(delivered, '✅ Customers — Orders Delivered');
  var ws2 = makeTrackerSheet(cancelled, '❌ Customers — Orders Cancelled');
  // Override even-row color for cancelled sheet to red tint
  xlsxStyle(wb, ws2, 3, 'FFF3F3');

  XLSX.utils.book_append_sheet(wb, ws1, '✅ Delivered');
  XLSX.utils.book_append_sheet(wb, ws2, '❌ Cancelled');

  XLSX.writeFile(wb, 'Candella_Customer_Tracker.xlsx', { cellStyles: true });
};

// ===== CUSTOMER TRACKER =====
window.switchTab = function(tab) {
  document.querySelectorAll('.tracker-tab').forEach(function(btn, i) {
    btn.classList.toggle('active', (i === 0 && tab === 'delivered') || (i === 1 && tab === 'cancelled'));
  });
  document.getElementById('panel-delivered').classList.toggle('active', tab === 'delivered');
  document.getElementById('panel-cancelled').classList.toggle('active', tab === 'cancelled');
};

function renderTrackerTables() {
  var delivered = allOrders.filter(function(o) { return o.status === 'delivered'; });
  var cancelled = allOrders.filter(function(o) { return o.status === 'cancelled'; });

  function buildRows(orders, tbodyId, emptyId) {
    var tbody = document.getElementById(tbodyId);
    var empty = document.getElementById(emptyId);
    if (!tbody) return;
    if (orders.length === 0) {
      tbody.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';
    tbody.innerHTML = orders.map(function(o, i) {
      var phone = (o.customer.phone || '').replace(/^0/, '');
      var waUrl = 'https://wa.me/2' + phone;
      var name = o.customer.fullName || '-';
      var d = new Date(o.createdAt);
      var dateStr = d.toLocaleDateString('en-GB') + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      return '<tr>' +
        '<td><strong>' + (i + 1) + '</strong></td>' +
        '<td><strong style="font-family:monospace;font-size:15px;letter-spacing:3px;color:var(--gold);">' + (o.shortId || '-') + '</strong></td>' +
        '<td><strong>' + escapeHtml(name) + '</strong></td>' +
        '<td style="font-family:monospace;">' + escapeHtml(o.customer.phone || '-') + '</td>' +
        '<td>' + escapeHtml(o.customer.governorate || '-') + '</td>' +
        '<td><strong style="color:var(--gold);">EGP ' + o.total + '</strong></td>' +
        '<td style="font-size:12px;color:#888;">' + dateStr + '</td>' +
        '<td><a class="wa-btn" href="' + waUrl + '" target="_blank"><i class="fab fa-whatsapp"></i> ' + name.split(' ')[0] + '</a></td>' +
        '</tr>';
    }).join('');
  }

  buildRows(delivered, 'deliveredBody', 'deliveredEmpty');
  buildRows(cancelled, 'cancelledBody', 'cancelledEmpty');
}

// Set today as default for daily export
var today = new Date().toISOString().slice(0,10);
document.getElementById('exportDay').value = today;

if (currentUserId) {
  loadOrders();
}
// ════════════════════════════════════════════
// تقفيل الشهر (Monthly Closing) — مطابق لشيت الإكسل
// ════════════════════════════════════════════
var closingData = null; // current month's data object
var closingCurrentMonth = '';

function closingEmptyData() {
  return {
    employees: [{ name:'', role:'', salary:0, allowance:0 }],
    fixed:     [{ label:'إيجار المكان / المستودع', amount:0 }],
    marketing: [{ label:'إعلانات سوشيال ميديا', amount:0 }],
    misc:      [{ label:'نقل ومواصلات', amount:0 }],
    productCosts: {} // { productKey: unitCost }
  };
}

function closingNum(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }

// ── Build rows for a simple (label, amount) table: fixed / marketing / misc ──
function closingRenderSimpleTable(tbodyId, rows, kind) {
  var tbody = document.getElementById(tbodyId);
  tbody.innerHTML = rows.map(function(row, i) {
    return '<tr>' +
      '<td><input type="text" value="' + (row.label||'').replace(/"/g,'&quot;') + '" oninput="window.closingUpdateRow(\'' + kind + '\',' + i + ',\'label\',this.value)" placeholder="اسم البند" /></td>' +
      '<td><input type="number" value="' + (row.amount||0) + '" oninput="window.closingUpdateRow(\'' + kind + '\',' + i + ',\'amount\',this.value)" /></td>' +
      '<td><button class="closing-row-del" onclick="window.closingDelRow(\'' + kind + '\',' + i + ')">&#10005;</button></td>' +
      '</tr>';
  }).join('');
}

function closingRenderEmpTable() {
  var tbody = document.getElementById('closingEmpBody');
  tbody.innerHTML = closingData.employees.map(function(row, i) {
    return '<tr>' +
      '<td><input type="text" value="' + (row.name||'').replace(/"/g,'&quot;') + '" oninput="window.closingUpdateRow(\'emp\',' + i + ',\'name\',this.value)" placeholder="اسم العامل" /></td>' +
      '<td><input type="text" value="' + (row.role||'').replace(/"/g,'&quot;') + '" oninput="window.closingUpdateRow(\'emp\',' + i + ',\'role\',this.value)" placeholder="المهمة" /></td>' +
      '<td><input type="number" value="' + (row.salary||0) + '" oninput="window.closingUpdateRow(\'emp\',' + i + ',\'salary\',this.value)" /></td>' +
      '<td><input type="number" value="' + (row.allowance||0) + '" oninput="window.closingUpdateRow(\'emp\',' + i + ',\'allowance\',this.value)" /></td>' +
      '<td><button class="closing-row-del" onclick="window.closingDelRow(\'emp\',' + i + ')">&#10005;</button></td>' +
      '</tr>';
  }).join('');
}

function closingRenderProductTable() {
  var monthVal = closingCurrentMonth;
  var parts = monthVal.split('-').map(Number);
  var year = parts[0], month = parts[1];

  // اجمع كل المنتجات المباعة فعلياً في الشهر ده من الأوردرات (مش ملغاة)
  var qtyMap = {};   // key -> qty
  var nameMap = {};  // key -> display name
  allOrders.forEach(function(o){
    if (o.status === 'cancelled') return;
    var d = new Date(o.createdAt);
    if (d.getFullYear() !== year || (d.getMonth()+1) !== month) return;
    (o.items || []).forEach(function(it){
      var key = it.id || ('name:' + (it.name||'غير معروف'));
      qtyMap[key] = (qtyMap[key]||0) + (it.qty||1);
      if (!nameMap[key]) nameMap[key] = it.name || 'غير معروف';
    });
  });

  var keys = Object.keys(qtyMap).sort(function(a,b){ return qtyMap[b]-qtyMap[a]; });
  var tbody = document.getElementById('closingProdBody');

  if (keys.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#999;padding:14px;">لا توجد مبيعات في هذا الشهر</td></tr>';
    document.getElementById('closingCogsTotal').textContent = 'EGP 0';
    return;
  }

  var cogsTotal = 0;
  tbody.innerHTML = keys.map(function(key){
    var qty = qtyMap[key];
    var unitCost = closingNum(closingData.productCosts[key]);
    var lineTotal = qty * unitCost;
    cogsTotal += lineTotal;
    return '<tr>' +
      '<td>' + nameMap[key] + '</td>' +
      '<td style="text-align:center;">' + qty + '</td>' +
      '<td><input type="number" value="' + (closingData.productCosts[key]||0) + '" oninput="window.closingUpdateProductCost(\'' + key.replace(/'/g,"\\'") + '\',this.value)" /></td>' +
      '<td style="text-align:center;font-weight:700;">EGP ' + lineTotal.toLocaleString() + '</td>' +
      '</tr>';
  }).join('');
  document.getElementById('closingCogsTotal').textContent = 'EGP ' + Math.round(cogsTotal).toLocaleString();
  closingRecalc();
}

function closingRenderAll() {
  closingRenderEmpTable();
  closingRenderSimpleTable('closingFixBody', closingData.fixed, 'fix');
  closingRenderSimpleTable('closingMktBody', closingData.marketing, 'mkt');
  closingRenderSimpleTable('closingMiscBody', closingData.misc, 'misc');
  closingRenderProductTable();
  closingRecalc();
}

window.closingUpdateRow = function(kind, idx, field, value) {
  var arr = kind === 'emp' ? closingData.employees :
            kind === 'fix' ? closingData.fixed :
            kind === 'mkt' ? closingData.marketing : closingData.misc;
  if (field === 'salary' || field === 'allowance' || field === 'amount') {
    arr[idx][field] = closingNum(value);
  } else {
    arr[idx][field] = value;
  }
  closingRecalc();
};

window.closingDelRow = function(kind, idx) {
  var arr = kind === 'emp' ? closingData.employees :
            kind === 'fix' ? closingData.fixed :
            kind === 'mkt' ? closingData.marketing : closingData.misc;
  arr.splice(idx, 1);
  closingRenderAll();
};

window.closingAddRow = function(kind) {
  if (kind === 'emp') closingData.employees.push({ name:'', role:'', salary:0, allowance:0 });
  else if (kind === 'fix') closingData.fixed.push({ label:'', amount:0 });
  else if (kind === 'mkt') closingData.marketing.push({ label:'', amount:0 });
  else closingData.misc.push({ label:'', amount:0 });
  closingRenderAll();
};

window.closingUpdateProductCost = function(key, value) {
  closingData.productCosts[key] = closingNum(value);
  closingRenderProductTable();
};

function closingSum(arr, field) {
  return arr.reduce(function(s, r){ return s + closingNum(r[field]); }, 0);
}

function closingRecalc() {
  var empTotal  = closingData.employees.reduce(function(s,r){ return s + closingNum(r.salary) + closingNum(r.allowance); }, 0);
  var fixTotal  = closingSum(closingData.fixed, 'amount');
  var mktTotal  = closingSum(closingData.marketing, 'amount');
  var miscTotal = closingSum(closingData.misc, 'amount');
  var opexTotal = empTotal + fixTotal + mktTotal + miscTotal;

  document.getElementById('closingEmpTotal').textContent  = 'EGP ' + Math.round(empTotal).toLocaleString();
  document.getElementById('closingFixTotal').textContent  = 'EGP ' + Math.round(fixTotal).toLocaleString();
  document.getElementById('closingMktTotal').textContent  = 'EGP ' + Math.round(mktTotal).toLocaleString();
  document.getElementById('closingMiscTotal').textContent = 'EGP ' + Math.round(miscTotal).toLocaleString();

  // إيراد المبيعات الحقيقي للشهر من الأوردرات (نفس منطق باقي الداش: cancelled مستثناة)
  var parts = closingCurrentMonth.split('-').map(Number);
  var year = parts[0], month = parts[1];
  var revenue = 0;
  allOrders.forEach(function(o){
    if (o.status === 'cancelled') return;
    var d = new Date(o.createdAt);
    if (d.getFullYear() !== year || (d.getMonth()+1) !== month) return;
    revenue += (o.total || 0);
  });

  // تكلفة البضاعة المباعة من جدول المنتجات
  var qtyMap = {};
  allOrders.forEach(function(o){
    if (o.status === 'cancelled') return;
    var d = new Date(o.createdAt);
    if (d.getFullYear() !== year || (d.getMonth()+1) !== month) return;
    (o.items || []).forEach(function(it){
      var key = it.id || ('name:' + (it.name||'غير معروف'));
      qtyMap[key] = (qtyMap[key]||0) + (it.qty||1);
    });
  });
  var cogsTotal = 0;
  Object.keys(qtyMap).forEach(function(key){
    cogsTotal += qtyMap[key] * closingNum(closingData.productCosts[key]);
  });

  var grossProfit = revenue - cogsTotal;
  var netProfit = grossProfit - opexTotal;

  document.getElementById('closingRevenue').textContent    = 'EGP ' + Math.round(revenue).toLocaleString();
  document.getElementById('closingCogsLine').textContent   = 'EGP ' + Math.round(cogsTotal).toLocaleString();
  document.getElementById('closingGrossProfit').textContent= 'EGP ' + Math.round(grossProfit).toLocaleString();
  document.getElementById('closingOpexLine').textContent   = 'EGP ' + Math.round(opexTotal).toLocaleString();

  var netEl = document.getElementById('closingNetProfit');
  var labelEl = document.getElementById('closingFinalLabel');
  var resultBox = document.getElementById('closingResult');
  netEl.textContent = (netProfit < 0 ? '-' : '') + 'EGP ' + Math.round(Math.abs(netProfit)).toLocaleString();
  labelEl.textContent = netProfit < 0 ? 'صافي الخسارة' : 'صافي الربح';
  var finalRow = document.querySelector('.closing-final');
  if (finalRow) finalRow.classList.toggle('loss', netProfit < 0);
}

window.loadMonthlyClosing = async function() {
  var monthVal = document.getElementById('closingMonth').value;
  var body = document.getElementById('closingBody');
  if (!monthVal) { body.style.display = 'none'; return; }

  closingCurrentMonth = monthVal;
  body.style.display = 'block';
  document.getElementById('closingSaveStatus').textContent = 'جاري التحميل...';

  try {
    const { data: row } = await window.AnalyticsApi.getMonthlyClosing(sb, monthVal);
    closingData = row ? Object.assign(closingEmptyData(), row.value) : closingEmptyData();
    // تأكد إن كل المصفوفات موجودة حتى لو الداتا القديمة ناقصة حقل
    if (!closingData.employees || !closingData.employees.length) closingData.employees = closingEmptyData().employees;
    if (!closingData.fixed)     closingData.fixed = [];
    if (!closingData.marketing) closingData.marketing = [];
    if (!closingData.misc)      closingData.misc = [];
    if (!closingData.productCosts) closingData.productCosts = {};
    document.getElementById('closingSaveStatus').textContent = '';
  } catch(e) {
    console.error('Error loading monthly closing:', e);
    closingData = closingEmptyData();
    document.getElementById('closingSaveStatus').textContent = '⚠️ خطأ في التحميل';
  }
  closingRenderAll();
};

window.saveMonthlyClosing = async function() {
  if (!closingCurrentMonth || !closingData) return;
  var statusEl = document.getElementById('closingSaveStatus');
  statusEl.textContent = 'جاري الحفظ...';
  try {
    const { error } = await window.AnalyticsApi.saveMonthlyClosing(sb, closingCurrentMonth, closingData);
    if (error) throw error;
    statusEl.textContent = '✅ تم الحفظ';
    setTimeout(function(){ statusEl.textContent = ''; }, 2500);
  } catch(e) {
    console.error('Error saving monthly closing:', e);
    statusEl.textContent = '⚠️ فشل الحفظ';
  }
};

// ===== EXPORT MONTHLY CLOSING TO EXCEL =====
window.exportClosingExcel = function() {
  if (!closingCurrentMonth || !closingData) { alert('من فضلك اختر الشهر الأول.'); return; }

  var parts = closingCurrentMonth.split('-').map(Number);
  var year = parts[0], month = parts[1];
  var monthName = closingCurrentMonth;

  // ── نفس حسابات closingRecalc بالظبط، عشان الأرقام في الإكسل تطابق الشاشة ──
  var empTotal  = closingData.employees.reduce(function(s,r){ return s + closingNum(r.salary) + closingNum(r.allowance); }, 0);
  var fixTotal  = closingSum(closingData.fixed, 'amount');
  var mktTotal  = closingSum(closingData.marketing, 'amount');
  var miscTotal = closingSum(closingData.misc, 'amount');
  var opexTotal = empTotal + fixTotal + mktTotal + miscTotal;

  var revenue = 0;
  allOrders.forEach(function(o){
    if (o.status === 'cancelled') return;
    var d = new Date(o.createdAt);
    if (d.getFullYear() !== year || (d.getMonth()+1) !== month) return;
    revenue += (o.total || 0);
  });

  var qtyMap = {};
  allOrders.forEach(function(o){
    if (o.status === 'cancelled') return;
    var d = new Date(o.createdAt);
    if (d.getFullYear() !== year || (d.getMonth()+1) !== month) return;
    (o.items || []).forEach(function(it){
      var key = it.id || ('name:' + (it.name||'غير معروف'));
      qtyMap[key] = (qtyMap[key]||0) + (it.qty||1);
    });
  });
  var cogsTotal = 0;
  var productRows = [['المنتج', 'الكمية المباعة', 'تكلفة الوحدة (EGP)', 'الإجمالي (EGP)']];
  Object.keys(qtyMap).forEach(function(key){
    var unitCost = closingNum(closingData.productCosts[key]);
    var lineTotal = qtyMap[key] * unitCost;
    cogsTotal += lineTotal;
    var label = productNameMap[key] || key.replace('name:', '');
    productRows.push([label, qtyMap[key], unitCost, lineTotal]);
  });

  var grossProfit = revenue - cogsTotal;
  var netProfit = grossProfit - opexTotal;

  var wb = XLSX.utils.book_new();

  // ── شيت 1: الملخص النهائي ──
  var summaryRows = [
    ['تقفيل شهر', monthName],
    [],
    ['إيراد المبيعات', revenue],
    ['تكلفة البضاعة المباعة (COGS)', cogsTotal],
    ['إجمالي الربح (Gross Profit)', grossProfit],
    [],
    ['رواتب وبدلات الموظفين', empTotal],
    ['مصاريف ثابتة', fixTotal],
    ['تسويق وإعلانات', mktTotal],
    ['نثريات', miscTotal],
    ['إجمالي المصاريف التشغيلية (OPEX)', opexTotal],
    [],
    [netProfit < 0 ? 'صافي الخسارة' : 'صافي الربح', Math.abs(netProfit)]
  ];
  var ws0 = XLSX.utils.aoa_to_sheet(summaryRows);
  ws0['!cols'] = [{wch:35},{wch:18}];
  XLSX.utils.book_append_sheet(wb, ws0, 'الملخص');

  // ── شيت 2: الموظفين ──
  var empRows = [['الاسم', 'الوظيفة', 'الراتب', 'البدل']];
  closingData.employees.forEach(function(r){ empRows.push([r.name||'', r.role||'', closingNum(r.salary), closingNum(r.allowance)]); });
  empRows.push(['', '', '', '']);
  empRows.push(['الإجمالي', '', '', empTotal]);
  var ws1 = XLSX.utils.aoa_to_sheet(empRows);
  ws1['!cols'] = [{wch:20},{wch:18},{wch:14},{wch:14}];
  XLSX.utils.book_append_sheet(wb, ws1, 'الموظفين');

  // ── شيت 3: المصاريف (ثابتة + تسويق + نثريات) ──
  var expRows = [['النوع', 'البند', 'المبلغ (EGP)']];
  closingData.fixed.forEach(function(r){ expRows.push(['مصاريف ثابتة', r.label||'', closingNum(r.amount)]); });
  closingData.marketing.forEach(function(r){ expRows.push(['تسويق', r.label||'', closingNum(r.amount)]); });
  closingData.misc.forEach(function(r){ expRows.push(['نثريات', r.label||'', closingNum(r.amount)]); });
  expRows.push(['', '', '']);
  expRows.push(['', 'الإجمالي', fixTotal + mktTotal + miscTotal]);
  var ws2 = XLSX.utils.aoa_to_sheet(expRows);
  ws2['!cols'] = [{wch:16},{wch:28},{wch:14}];
  XLSX.utils.book_append_sheet(wb, ws2, 'المصاريف');

  // ── شيت 4: تكلفة البضاعة المباعة بالتفصيل ──
  productRows.push(['', '', 'الإجمالي', cogsTotal]);
  var ws3 = XLSX.utils.aoa_to_sheet(productRows);
  ws3['!cols'] = [{wch:28},{wch:16},{wch:18},{wch:16}];
  XLSX.utils.book_append_sheet(wb, ws3, 'تكلفة البضاعة');

  XLSX.writeFile(wb, 'Candella_Closing_' + monthName + '.xlsx', { cellStyles: true });
};
