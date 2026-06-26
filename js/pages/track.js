// js/pages/track.js
// Moved verbatim out of the TWO <script> blocks in pages/track.html (one
// type="module" for Supabase setup, one classic for tracking/cancel logic)
// and combined into one file, loaded as
// <script type="module" src="../js/pages/track.js"></script>.
//
// Stock restore is NOT reimplemented here — only called via
// window.CandellaStock.adjustProductStock / .adjustCustomGiftStock
// (js/services/stockService.js). item.id / giftCandleId / giftContainerIds /
// giftAccessoryIds pass through unchanged on every order item read back
// from Supabase — track.js never rewrites them.

// The customer name below comes straight from the checkout form's free-text
// field — escape before rendering into innerHTML so it can't inject markup.
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ════════════════════════════════════════════
// SUPABASE SETUP
// ════════════════════════════════════════════
window._sb = window.createSupabaseClient();

// ── Adjust Custom Gift Set stock (restore on cancel) ──
// Delegates to the single shared, stable-id based implementation in
// js/services/stockService.js (replaces the previous inline duplicate).
window.adjustCustomGiftStock = async function(giftItem, direction) {
  var result = await window.CandellaStock.adjustCustomGiftStock(window._sb, giftItem, direction);
  if (result && result.error) console.warn('adjustCustomGiftStock error:', result.error);
  return result;
};

// ── Gift-set "fanned" image stack — shows every selected component's
// photo (candle/containers/accessories) overlapping like a hand of cards,
// instead of just one image. Falls back to the single `img` field for
// older orders saved before these per-component fields existed. ──
function giftImageStack(item, size) {
  size = size || 48;
  var imgs = [];
  if (item.giftCandleImg) imgs.push(item.giftCandleImg);
  if (item.giftContainerImgs) imgs = imgs.concat(item.giftContainerImgs);
  if (item.giftAccessoryImgs) imgs = imgs.concat(item.giftAccessoryImgs);
  if (!imgs.length && item.img) imgs.push(item.img);
  if (!imgs.length) {
    return '<div style="width:' + size + 'px;height:' + size + 'px;background:#f0ede8;border-radius:4px;flex-shrink:0;"></div>';
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
        return '<img src="' + url + '" loading="lazy" style="position:absolute;left:' + (i * Math.round(size * 0.2)) + 'px;top:0;width:' + size + 'px;height:' + size + 'px;object-fit:cover;border-radius:4px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.18);transform:rotate(' + rot + 'deg);z-index:' + i + ';" />';
      }).join('')
    + '</div>';
}
// Enlarged gallery — each selected component shown as its own card
// (image + name + price), stacked vertically, instead of a flat row of
// unlabeled images.
window.openGiftGallery = function(enc) {
  var components = JSON.parse(decodeURIComponent(enc));
  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px;overflow-y:auto;';
  overlay.onclick = function(e){ if (e.target === overlay) overlay.remove(); };
  var cardsHtml = components.map(function(comp){
    return '<div style="display:flex;align-items:center;gap:16px;background:#fff;border-radius:10px;padding:14px 20px;width:100%;max-width:440px;box-shadow:0 4px 16px rgba(0,0,0,0.25);">'
      + (comp.img ? '<img src="' + comp.img + '" loading="lazy" style="width:64px;height:64px;object-fit:cover;border-radius:8px;flex-shrink:0;" />' : '<div style="width:64px;height:64px;background:#f0ede8;border-radius:8px;flex-shrink:0;"></div>')
      + '<div style="flex:1;min-width:140px;font-family:Montserrat,sans-serif;font-size:13px;font-weight:600;color:#1a1a2e;">' + (comp.name || '') + '</div>'
      + (comp.price != null ? '<div style="font-family:\'Cormorant Garamond\',serif;font-size:15px;font-weight:700;color:#c9a24d;white-space:nowrap;">EGP ' + comp.price + '</div>' : '')
      + '</div>';
  }).join('');
  overlay.innerHTML =
    '<button onclick="this.parentElement.remove()" style="position:fixed;top:18px;right:18px;width:38px;height:38px;border-radius:50%;background:#fff;border:none;font-size:18px;color:#333;cursor:pointer;z-index:1;">&#10005;</button>' +
    '<div style="display:flex;flex-direction:column;gap:12px;align-items:center;max-width:90vw;">' + cardsHtml + '</div>';
  document.body.appendChild(overlay);
};

// ── Step definitions ──
const STEPS = [
  { key: 'new',       icon: 'fa-solid fa-circle-check',   title: 'Order Placed',        desc: 'Your order has been received and is being reviewed.' },
  { key: 'confirmed', icon: 'fa-solid fa-box-open',        title: 'Order Confirmed',     desc: 'Your order is confirmed and being prepared.' },
  { key: 'shipped',   icon: 'fa-solid fa-truck',           title: 'Out for Delivery',    desc: 'Your order is on its way with our delivery team.' },
  { key: 'delivered', icon: 'fa-solid fa-house-circle-check', title: 'Order Delivered', desc: 'Your order has been delivered. Enjoy your purchase!' },
];

const STATUS_ORDER = { new: 0, confirmed: 1, shipped: 2, delivered: 3 };

// ── Auto-fill last order from localStorage ──
const lastOrder = JSON.parse(localStorage.getItem('candella_last_order') || 'null');
if (lastOrder && lastOrder.shortId) {
  document.getElementById('orderInput').value = lastOrder.shortId;
  document.getElementById('autofillHint').classList.add('show');
}

// ── Active listener — kept alive after first search ──
var _activeListener = null;

window.trackOrder = async function() {
  const num = document.getElementById('orderInput').value.trim();
  const errEl = document.getElementById('searchErr');
  const cardEl = document.getElementById('orderCard');
  const nfEl = document.getElementById('notFound');
  const btn = document.getElementById('trackBtn');

  errEl.textContent = '';
  cardEl.className = 'order-card';
  nfEl.className = 'not-found';

  if (num.length !== 4) {
    errEl.textContent = 'Please enter a valid 4-digit order number.';
    return;
  }

  // Stop any previous polling
  if (_activeListener) { window._sb.removeChannel(_activeListener); _activeListener = null; }

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

  var firstCall = true;

  async function fetchAndRenderOrder() {
    try {
      const { data, error } = await window._sb.from('orders').select('*').eq('short_id', num).single();
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Track';

      if (error || !data) {
        nfEl.className = 'not-found visible';
        cardEl.className = 'order-card';
        return;
      }

      nfEl.className = 'not-found';
      const docData = {
        shortId:      data.short_id,
        customer:     data.customer || {},
        items:        data.items || [],
        subtotal:     data.subtotal || 0,
        discount:     data.discount || 0,
        shipping:     data.shipping || 0,
        total:        data.total || 0,
        promoCode:    data.promo_code || '',
        paymentMethod:data.payment_method || 'cash',
        status:       data.status || 'new',
        cancelReason: data.cancel_reason || '',
        firestoreId:  data.id,
        createdAt:    data.created_at
      };

      // لو مش أول مرة → نبعت notification لو الحالة اتغيرت
      if (!firstCall) {
        var prevStatus = window._lastKnownStatus;
        var newStatus  = docData.status;
        if (prevStatus && prevStatus !== newStatus) {
          showStatusToast(newStatus);
        }
      }
      window._lastKnownStatus = docData.status;
      firstCall = false;

      renderOrderCard(docData, num);
      cardEl.className = 'order-card visible';
    } catch(e) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Track';
      errEl.textContent = '❌ Connection error. Please try again.';
      console.error(e);
    }
  }

  await fetchAndRenderOrder();
  var trackNum = num;
  _activeListener = window._sb.channel('track-order-' + trackNum)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: 'short_id=eq.' + trackNum }, function() {
      fetchAndRenderOrder();
    })
    .subscribe();
};

// ── Toast notification لما الحالة تتغير ──
function showStatusToast(newStatus) {
  var labels = {
    confirmed: '✅ Order Confirmed!',
    shipped:   '🚚 Out for Delivery!',
    delivered: '🏠 Order Delivered!',
    cancelled: '❌ Order Cancelled'
  };
  var msg = labels[newStatus] || '🔄 Order Updated';
  var toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:var(--navy);color:white;padding:14px 28px;border-radius:8px;font-family:Montserrat,sans-serif;font-size:14px;font-weight:600;letter-spacing:1px;z-index:9999;box-shadow:0 8px 30px rgba(0,0,0,0.2);animation:fadeUp 0.3s ease;';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(function() { toast.remove(); }, 4000);
}

function renderOrderCard(o, num) {
  const status = o.status || 'new';
  const statusIdx = STATUS_ORDER[status] ?? 0;
  const isCancelled = status === 'cancelled';
  const date = o.createdAt?.toDate ? o.createdAt.toDate() : new Date(o.createdAt || Date.now());
  const dateStr = date.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });

  // Build stepper HTML
  let stepperHTML = '';
  STEPS.forEach(function(s, i) {
    let cls = '';
    if (isCancelled) { cls = i === 0 ? 'done' : ''; }
    else if (i < statusIdx) cls = 'done';
    else if (i === statusIdx) cls = 'active';

    const isNow = (!isCancelled && i === statusIdx);
    stepperHTML +=
      '<div class="step ' + cls + '">' +
        '<div class="step-icon"><i class="' + s.icon + '"></i></div>' +
        '<div class="step-body">' +
          '<div class="step-title">' + s.title + (isNow ? '<span class="now-badge">Now</span>' : '') + '</div>' +
          '<div class="step-desc">' + s.desc + '</div>' +
        '</div>' +
      '</div>';
  });

  // Build items HTML
  let itemsHTML = '';
  (o.items || []).forEach(function(it) {
    if (it.isGiftSet) {
      var giftDetails = '';
      if(it.giftSize && it.giftSize !== '—') giftDetails += 'Size: ' + it.giftSize + '<br>';
      if(it.giftCandle && it.giftCandle !== '—') giftDetails += 'Candle: ' + it.giftCandle + '<br>';
      if(it.giftContainer && it.giftContainer !== '—') giftDetails += 'Container: ' + it.giftContainer + '<br>';
      if(it.giftAccessories && it.giftAccessories !== '—' && it.giftAccessories !== 'None') giftDetails += 'Accessories: ' + it.giftAccessories;
      itemsHTML +=
        '<div class="oi">' +
          giftImageStack(it) +
          '<div>' +
            '<div class="oi-name">Custom Gift Set</div>' +
            (giftDetails ? '<div class="oi-sub" style="line-height:1.6;">' + giftDetails + '</div>' : '') +
          '</div>' +
          '<div class="oi-price">EGP ' + (it.qty * it.price) + '</div>' +
        '</div>';
      return;
    }
    itemsHTML +=
      '<div class="oi">' +
        (it.img ? '<img src="' + it.img + '" alt="' + it.name + '" loading="lazy" />' : '') +
        '<div>' +
          '<div class="oi-name">' + it.name + '</div>' +
          '<div class="oi-sub">Qty: ' + it.qty + '</div>' +
        '</div>' +
        '<div class="oi-price">EGP ' + (it.qty * it.price) + '</div>' +
      '</div>';
  });

  document.getElementById('orderCard').innerHTML =
    // Header
    '<div class="order-card-header">' +
      '<div><div style="font-size:10px;opacity:0.6;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px;">Order Number</div>' +
      '<div class="order-num">#' + num + '</div></div>' +
      '<div class="order-date">' + dateStr + '</div>' +
    '</div>' +

    // Meta grid
    '<div class="order-meta-grid">' +
      '<div class="meta-cell"><label>Customer</label><span>' + escapeHtml(o.customer?.fullName || '-') + '</span></div>' +
      '<div class="meta-cell"><label>Governorate</label><span>' + escapeHtml(o.customer?.governorate || '-') + '</span></div>' +
      '<div class="meta-cell"><label>Total</label><span class="total-val">EGP ' + o.total + '</span></div>' +
      '<div class="meta-cell"><label>Status</label><span style="color:' + statusColor(status) + ';font-weight:700;">' + statusLabel(status) + '</span></div>' +
    '</div>' +

    // Cancelled banner
    (isCancelled ?
      '<div class="cancelled-banner"><i class="fa-solid fa-circle-xmark"></i> This order has been cancelled.</div>' : '') +

    // Stepper
    (!isCancelled ?
      '<div class="stepper-wrap"><h4>📦 Delivery Progress</h4><div class="stepper">' + stepperHTML + '</div></div>' : '') +

    // Items
    '<div class="order-items-wrap"><h4>🛍 Items</h4>' + itemsHTML + '</div>' +

    // Cancel box
    buildCancelBox(o, num);
}

function buildCancelBox(o, num) {
  var lastOrder = JSON.parse(localStorage.getItem('candella_last_order') || 'null');
  if (!lastOrder || String(lastOrder.shortId) !== String(num)) return '';

  // ── الطلب خرج للتوصيل أو اتسلّم → منع الإلغاء نهائياً ──
  if (o.status === 'shipped') {
    return '<div class="cancel-box" style="border-color:#e67e22;background:#fff8f0;">' +
      '<p class="cancel-label" style="color:#e67e22;font-weight:600;">🚚 Your order is already out for delivery — cancellation is no longer available.</p>' +
      '</div>';
  }
  if (o.status === 'delivered') {
    return '<div class="cancel-box" style="border-color:#27ae60;background:#f0fff4;">' +
      '<p class="cancel-label" style="color:#27ae60;font-weight:600;">🏠 Your order has been delivered. Thank you!</p>' +
      '</div>';
  }
  if (o.status === 'cancelled') return '';

  // ── تحقق من نافذة الساعة ──
  var remaining = (lastOrder.time + 60 * 60 * 1000) - Date.now();
  if (remaining <= 0) {
    return '<div class="cancel-box"><p class="cancel-label">❌ Cancellation window has closed.</p></div>';
  }
  setTimeout(function() { startCancelTimer(lastOrder, num); }, 50);
  return '<div class="cancel-box" id="trackCancelBox">' +
    '<p class="cancel-label">You can cancel within <strong id="trackCancelTimer">--:--</strong></p>' +
    '<button class="cancel-order-btn" id="trackCancelBtn" onclick="cancelFromTrack()">Cancel Order</button>' +
    '</div>';
}

var _cancelTimerIv = null;
function startCancelTimer(lastOrder, num) {
  if (_cancelTimerIv) clearInterval(_cancelTimerIv);
  var end = lastOrder.time + 60 * 60 * 1000;
  function tick() {
    var rem = end - Date.now();
    var timerEl = document.getElementById('trackCancelTimer');
    var btn = document.getElementById('trackCancelBtn');
    if (!timerEl) { clearInterval(_cancelTimerIv); return; }
    if (rem <= 0) {
      clearInterval(_cancelTimerIv);
      timerEl.textContent = '00:00';
      if (btn) { btn.disabled = true; btn.textContent = 'Cancellation window closed'; }
      return;
    }
    var mins = String(Math.floor(rem / 60000)).padStart(2, '0');
    var secs = String(Math.floor((rem % 60000) / 1000)).padStart(2, '0');
    timerEl.textContent = mins + ':' + secs;
  }
  tick();
  _cancelTimerIv = setInterval(tick, 1000);
}

window.cancelFromTrack = function() {
  document.getElementById('cancelReasonOverlay').style.display='flex';
  document.querySelectorAll('input[name="cancelReason"]').forEach(function(r){r.checked=false;});
  document.getElementById('cancelReasonOtherText').style.display='none';
  document.getElementById('cancelReasonOtherText').value='';
};

window.closeCancelReasonModal=function(){
  document.getElementById('cancelReasonOverlay').style.display='none';
};

window.confirmCancelWithReason=async function(){
  var selected=document.querySelector('input[name="cancelReason"]:checked');
  if(!selected){alert('Please select a reason.');return;}
  var reason=selected.value==='other'?(document.getElementById('cancelReasonOtherText').value.trim()||'Other'):selected.value;
  var lastOrder=JSON.parse(localStorage.getItem('candella_last_order')||'null');
  if(!lastOrder||!lastOrder.firestoreId) return;
  if((lastOrder.time+60*60*1000)-Date.now()<=0){alert('Cancellation window has closed.');return;}
  var currentStatus=window._lastKnownStatus;
  if(currentStatus==='shipped'||currentStatus==='delivered'){alert('❌ Sorry, your order is already out for delivery and cannot be cancelled.');return;}
  document.getElementById('cancelReasonOverlay').style.display='none';
  var btn=document.getElementById('trackCancelBtn');
  if(btn){btn.disabled=true;btn.textContent='Cancelling...';}
  try{
    // Atomic conditional update — only matches (and only returns a row) if
    // the order is NOT already 'cancelled' in the DB at this instant. One
    // round trip, no read-then-write race window: two tabs/clicks racing
    // each other can both reach this line, but only one can ever get a
    // row back, regardless of timing. Also pulls `items` back directly,
    // so the restore loop below uses the row Postgres just confirmed,
    // never a cached/assumed value.
    const { data: updatedRows, error: updateError } = await window._sb.from('orders')
      .update({ status: 'cancelled', cancel_reason: reason })
      .eq('id', lastOrder.firestoreId)
      .neq('status', 'cancelled')
      .select('id, items');
    if (updateError) throw updateError;
    var didTransition = !!(updatedRows && updatedRows.length > 0);

    // Restore stock ONLY if THIS call is the one that actually flipped the
    // order to cancelled. If it was already cancelled, skip the RPCs
    // entirely — the success UI still shows below either way.
    if (didTransition) {
      try {
        var oItems=updatedRows[0].items||[];
        for(var si=0;si<oItems.length;si++){
          var sItem=oItems[si];
          // ── منتج عادي ──
          if(sItem.id){
            await window.CandellaStock.adjustProductStock(window._sb, sItem.id, sItem.qty, +1);
            continue;
          }

          // ── كاستم جيفت سيت ──
          if(sItem.isGiftSet){
            try{ await window.adjustCustomGiftStock(sItem, +1); }
            catch(se){ console.warn('Custom gift stock restore failed',se); }
          }
        }
      }catch(re){console.warn('Stock restore error:',re);}
    }
    lastOrder.status='cancelled';
    localStorage.setItem('candella_last_order',JSON.stringify(lastOrder));
    var box=document.getElementById('trackCancelBox');
    if(box) box.innerHTML='<p style="color:#e74c3c;font-weight:700;font-size:13px;">❌ Your order has been cancelled.</p>';
  }catch(e){
    console.error(e);
    alert('❌ Failed to cancel. Contact us on WhatsApp.');
    if(btn){btn.disabled=false;btn.textContent='Cancel Order';}
  }
};

function statusColor(s) {
  return { new:'#e67e22', confirmed:'#27ae60', shipped:'#2980b9', delivered:'#1a1a1a', cancelled:'#e74c3c' }[s] || '#888';
}
function statusLabel(s) {
  return { new:'🆕 Order Placed', confirmed:'✅ Confirmed', shipped:'🚚 Out for Delivery', delivered:'🏠 Delivered', cancelled:'❌ Cancelled' }[s] || s;
}

// Auto track if coming from checkout page
if (lastOrder && lastOrder.shortId && window.location.search.includes('auto=1')) {
  setTimeout(function() { window.trackOrder(); }, 400);
}
