// js/pages/checkout.js
// Moved verbatim out of the THREE <script> blocks in pages/checkout.html
// (one type="module" for Supabase setup, one classic for the
// adjustCustomGiftStock wrapper, one classic for the main checkout logic)
// and combined into a single file, loaded as
// <script type="module" src="../js/pages/checkout.js"></script>.
//
// Safe as a module: every onclick="" handler in checkout.html already
// calls a function exposed via window.X (selectPayment, applyPromo,
// submitOrder, cancelOrder, closeCancelReasonModal, confirmCancelWithReason) —
// confirmed before merging.
//
// Cart/Stock/Order logic is NOT reimplemented here — only called via the
// existing services:
//   window.CartService.loadCart() / .clearCart()      (js/services/cartService.js)
//   window.CandellaStock.adjustProductStock/.adjustCustomGiftStock/.validateStock
//                                                       (js/services/stockService.js)
//   window.OrderService.generateShortId()              (js/services/orderService.js)
// item.id / giftCandleId / giftContainerIds / giftAccessoryIds pass through
// unchanged on every cart/order item — checkout never rewrites them.

// ════════════════════════════════════════════
// SUPABASE SETUP
// ════════════════════════════════════════════
window._sb = window.createSupabaseClient();

// window.adjustCustomGiftStock(giftItem, direction) now comes from
// js/services/stockService.js (loaded before this file) — reads
// window._sb set just above, same as before.

var selectedPayment = 'cash';
var cart = window.CartService.loadCart();
var savedOrderData = null;

// ── Promo codes (15% discount each) ──
var PROMO_CODES = ['CNDL15A','CNDL15B','CNDL15C','CNDL15D','CNDL15E','CNDL15F','CNDL15G','CNDL15H','CNDL15J','CNDL15K'];
var PROMO_DISCOUNT_PCT = 15;
var SHIPPING_FEES = {
  'Cairo': 85, 'Giza': 75, 'Alexandria': 85, 'Qalyubia': 85,
  'Dakahlia': 85, 'Beheira': 85, 'Gharbia': 85, 'Sharqia': 85,
  'Monufia': 85, 'Faiyum': 70, 'Beni Suef': 70, 'Minya': 75,
  'Assiut': 100, 'Sohag': 115, 'Qena': 120, 'Luxor': 150,
  'Aswan': 150, 'Red Sea': 150, 'South Sinai': 150, 'North Sinai': 250,
  'Port Said': 100, 'Ismailia': 100, 'Suez': 100, 'Damietta': 100,
  'Kafr El Sheikh': 95, 'Matrouh': 150, 'New Valley': 190
};
var FREE_SHIPPING_THRESHOLD = 2000;
var appliedPromo = null;

// Gift-set items keep their own volume discount (already baked into
// c.price) regardless of any promo code — a promo never touches them.
function getGiftSetSubtotal() {
  return cart.reduce(function(s,c){ return s + (c.isGiftSet ? c.price * c.qty : 0); }, 0);
}
// Promo codes only ever discount the regular (non-gift-set) products.
function getRegularSubtotal() {
  return cart.reduce(function(s,c){ return s + (!c.isGiftSet ? c.price * c.qty : 0); }, 0);
}
function getSubtotal() {
  return getGiftSetSubtotal() + getRegularSubtotal();
}
function getDiscount() {
  return appliedPromo ? Math.round(getRegularSubtotal() * PROMO_DISCOUNT_PCT / 100) : 0;
}
function getShipping(afterDisc, sub) {
  var gov = (document.getElementById('governorate') || {}).value || '';
  // لو المحافظة مش متحددة → صفر
  if (!gov) return 0;
  // شحن مجاني لو الطلب بعد الخصم (خصم الكاستم أو خصم البرومو، أيًا منهم كان مطبّق) فوق الـ threshold.
  if (afterDisc >= FREE_SHIPPING_THRESHOLD) return 0;
  return SHIPPING_FEES[gov] || 80;
}
function recalcTotals() {
  var sub = getSubtotal();
  var disc = getDiscount();
  var afterDisc = sub - disc;
  var gov = (document.getElementById('governorate') || {}).value || '';
  var ship = getShipping(afterDisc, sub);
  var total = afterDisc + ship;
  var subtotalEl = document.getElementById('subtotalVal');
  if(subtotalEl) subtotalEl.textContent = sub;
  var discRow = document.getElementById('discountRow');
  if(discRow) {
    discRow.style.display = disc > 0 ? 'flex' : 'none';
    var discPct = document.getElementById('discountPct');
    if(discPct) discPct.textContent = '-' + PROMO_DISCOUNT_PCT + '%';
    var discVal = document.getElementById('discountVal');
    if(discVal) discVal.textContent = disc;
  }
  var shipVal = document.getElementById('shippingVal');
  if(shipVal) {
    if (!gov) {
      shipVal.innerHTML = '<span style="color:#aaa;">—</span>';
    } else if (ship === 0) {
      shipVal.innerHTML = '<span style="color:#27ae60;font-weight:700;">FREE</span>';
    } else {
      shipVal.innerHTML = 'EGP ' + ship;
    }
  }
  var totalEl = document.getElementById('summaryTotal');
  if(totalEl) totalEl.textContent = !gov ? '—' : total;
  return { subtotal: sub, discount: disc, shipping: ship, total: total };
}
document.getElementById('governorate').addEventListener('change', recalcTotals);

function applyPromo() {
  var code = document.getElementById('promoInput').value.trim().toUpperCase();
  var msg = document.getElementById('promoMsg');

  // Promo codes only ever discount regular products. A Custom Gift
  // Set keeps its own volume discount either way — but if the cart
  // is ONLY a gift set (nothing for the promo to discount), applying
  // one would do nothing, so we tell the customer why instead.
  var hasRegularItems = cart.some(function(c) { return !c.isGiftSet; });
  if (!hasRegularItems) {
    appliedPromo = null;
    msg.innerHTML = '<span style="color:#e74c3c;">You already have a discount applied</span>';
    renderSummaryItems();
    recalcTotals();
    return;
  }

  if(PROMO_CODES.indexOf(code) !== -1) {
    appliedPromo = code;
    msg.innerHTML = '<span style="color:#27ae60;">Discount applied! ' + PROMO_DISCOUNT_PCT + '% off</span>';
    renderSummaryItems();
    recalcTotals();
  } else {
    appliedPromo = null;
    msg.innerHTML = '<span style="color:#e74c3c;">Invalid promo code</span>';
    renderSummaryItems();
    recalcTotals();
  }
}
window.applyPromo = applyPromo;

// ── Render summary ──
// ── Gift-set "fanned" image stack — shows every selected component's
// photo (candle/containers/accessories) overlapping like a hand of cards,
// instead of just one image. Clicking it opens a full-size gallery.
// Falls back to the single `img` field for older cart/order items saved
// before these per-component fields existed. ──
function giftImageStack(item, size) {
  size = size || 52;
  var imgs = [];
  if (item.giftCandleImg) imgs.push(item.giftCandleImg);
  if (item.giftContainerImgs) imgs = imgs.concat(item.giftContainerImgs);
  if (item.giftAccessoryImgs) imgs = imgs.concat(item.giftAccessoryImgs);
  if (!imgs.length && item.img) imgs.push(item.img);
  if (!imgs.length) {
    return '<div style="width:' + size + 'px;height:' + size + 'px;background:#f0ede8;border-radius:2px;flex-shrink:0;"></div>';
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

function renderSummaryItems() {
  var summaryEl = document.getElementById('summaryItems');
  if (!summaryEl) return;
  if (cart.length === 0) {
    summaryEl.innerHTML = '<p style="opacity:.6">No items in cart</p>';
    return;
  }
  summaryEl.innerHTML = cart.map(function(c){
    if (c.isGiftSet) {
      var imgEl = giftImageStack(c);
      var giftDetails = '';
      if(c.giftSize && c.giftSize !== '—') giftDetails += 'Size: '+c.giftSize+'<br>';
      if(c.giftCandle && c.giftCandle !== '—') giftDetails += 'Candle: '+c.giftCandle+'<br>';
      if(c.giftContainer && c.giftContainer !== '—') giftDetails += 'Container: '+c.giftContainer+'<br>';
      if(c.giftAccessories && c.giftAccessories !== '—' && c.giftAccessories !== 'None') giftDetails += 'Accessories: '+c.giftAccessories;
      // A gift set always keeps its own volume discount, independent
      // of any promo code applied to the rest of the cart.
      var displayPrice = c.price * c.qty;
      var discBadge = '';
      if (c.volumeDiscountPct && c.volumeDiscountPct > 0) {
        discBadge = ' <span style="font-size:10px;background:#27ae60;color:white;padding:1px 5px;border-radius:3px;">-'+c.volumeDiscountPct+'%</span>';
      }
      return '<div class="summary-item">' +
        imgEl +
        '<div><div class="summary-name">Custom Gift Set' + discBadge + '</div>' +
        (giftDetails ? '<div class="summary-qty" style="line-height:1.6;">'+giftDetails+'</div>' : '') +
        '</div>' +
        '<div class="summary-price">EGP '+displayPrice+'</div></div>';
    }
    var sub = '';
    if(c.scent) sub += '<div class="summary-qty">Scent: ' + c.scent + '</div>';
    if(c.size)  sub += '<div class="summary-qty">Size: ' + c.size + '</div>';
    return '<div class="summary-item">' +
      '<img src="'+c.img+'" alt="'+c.name+'" loading="lazy" />' +
      '<div><div class="summary-name">'+c.name+'</div><div class="summary-qty">Qty: '+c.qty+'</div>' + sub + '</div>' +
      '<div class="summary-price">EGP '+(c.price*c.qty)+'</div></div>';
  }).join('');
}
renderSummaryItems();
if (cart.length > 0) recalcTotals();

// ── Payment selector ──
function selectPayment(method) {
  selectedPayment = method;
  document.getElementById('opt_'+method).classList.add('selected');
  document.getElementById('err_payment').textContent = '';
}
window.selectPayment = selectPayment;

// ── Validate ──
function validate() {
  var ok=true;
  ['fullName','phone','governorate','address'].forEach(function(id){ document.getElementById('err_'+id).textContent=''; });
  var fn=document.getElementById('fullName').value;
  var ph=document.getElementById('phone').value;
  var gv=document.getElementById('governorate').value;
  var ad=document.getElementById('address').value;

  if(fn.trim().split(/\s+/).filter(Boolean).length<2){document.getElementById('err_fullName').textContent='Please enter at least a first and last name';ok=false;}
  if(ad.trim()===''){document.getElementById('err_address').textContent='Please enter your delivery address';ok=false;}
  if(!/^01[0-9]{9}$/.test(ph.trim())){document.getElementById('err_phone').textContent='Please enter a valid Egyptian phone number (11 digits)';ok=false;}
  if(gv===''){document.getElementById('err_governorate').textContent='Please select your governorate';ok=false;}

  return ok;
}

// ── Unique 4-digit ID — now in js/services/orderService.js ──
function generateShortId() {
  return window.OrderService.generateShortId(window._sb);
}

// ── Main submit ──
async function submitOrder() {
  if(!validate()) return;
  if(cart.length===0){alert('Your cart is empty!');return;}
  if(!window._sb){alert('Connection error. Please refresh the page and try again.');return;}

  var btn=document.getElementById('submitBtn');
  btn.disabled=true;
  btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Processing...';

  var shortId = await generateShortId();
  var pricing = recalcTotals();

  savedOrderData = {
    shortId:        shortId,
    customer:{
      fullName:    document.getElementById('fullName').value.trim(),
      phone:       document.getElementById('phone').value.trim(),
      governorate: document.getElementById('governorate').value,
      address:     document.getElementById('address').value.trim(),
      notes:       document.getElementById('notes').value.trim(),
    },
    items:          cart,
    subtotal:       pricing.subtotal,
    discount:       pricing.discount,
    promoCode:      appliedPromo || '',
    shipping:       pricing.shipping,
    total:          pricing.total,
    paymentMethod:  selectedPayment,
    paymentStatus:  'cash_on_delivery',
    status:         'new'
  };

  await saveAndShowSuccess(savedOrderData);
}
window.submitOrder = submitOrder;

function resetBtn(){
  var btn=document.getElementById('submitBtn');
  btn.disabled=false;
  btn.innerHTML='<i class="fa-solid fa-paper-plane"></i> <span id="submitLabel">Confirm Order</span>';
}

/* ════════════════════════════════════════
   SUPABASE SAVE + UI
════════════════════════════════════════ */
async function saveAndShowSuccess(orderData) {
  try {
    // ── الفحص النهائي قبل تأكيد الطلب: نتأكد إن كل منتج لسه متوفر بالكمية المطلوبة ──
    // Independent reads (different product rows) — safe to run concurrently
    // instead of one round-trip at a time.
    var stockChecks = await Promise.all(orderData.items.map(function(checkItem) {
      if (!checkItem.id) return null;
      return window._sb.from('products').select('stock, name').eq('id', checkItem.id).single()
        .then(function(res) { return { item: checkItem, pCheck: res.data }; });
    }));

    for (var ci = 0; ci < stockChecks.length; ci++) {
      var check = stockChecks[ci];
      if (!check) continue;
      var pCheck = check.pCheck;
      if (pCheck && typeof pCheck.stock === 'number' && pCheck.stock < check.item.qty) {
        alert('❌ "' + (pCheck.name || 'A product') + '" is no longer available in the quantity you requested. Please update your cart.');
        resetBtn();
        return;
      }
    }

    // ── Same final check, but for Custom Gift Set components (candle/
    // container/accessory) — previously only regular products were
    // re-validated here. Uses the existing CandellaStock.validateStock
    // helper (was defined but never called anywhere until now). ──
    var giftItemsToCheck = orderData.items.filter(function(it) { return !it.id && it.isGiftSet; });
    if (giftItemsToCheck.length) {
      const { data: giftRow } = await window._sb.from('settings').select('value').eq('key', 'giftSet').maybeSingle();
      var giftDataForCheck = (giftRow && giftRow.value) || {};
      for (var gci = 0; gci < giftItemsToCheck.length; gci++) {
        var giftCheck = window.CandellaStock.validateStock(giftDataForCheck, giftItemsToCheck[gci]);
        if (!giftCheck.ok) {
          alert('❌ Some items in your custom gift set are no longer available:\n' + giftCheck.problems.join('\n') + '\nPlease update your selection.');
          resetBtn();
          return;
        }
      }
    }

    var orderId = crypto.randomUUID();
    const { error: insertError } = await window._sb.from('orders').insert({
      id: orderId,
      short_id: orderData.shortId,
      customer: orderData.customer,
      items: orderData.items,
      subtotal: orderData.subtotal,
      discount: orderData.discount,
      promo_code: orderData.promoCode,
      shipping: orderData.shipping,
      total: orderData.total,
      payment_method: orderData.paymentMethod,
      status: orderData.status
    });
    if (insertError) throw insertError;

    // Deduct stock for each item (atomic — safe even with simultaneous orders).
    // Normal products hit independent rows via an atomic RPC, so they run
    // concurrently. Custom gift-set items read-modify-write the SHARED
    // 'customCosts'/'giftSet' settings rows, so those stay sequential to
    // avoid a lost-update race if a cart has more than one gift set.
    var normalItems = orderData.items.filter(function(item) { return !!item.id; });
    var giftItems = orderData.items.filter(function(item) { return !item.id && item.isGiftSet; });

    await Promise.all(normalItems.map(function(item) {
      return window.CandellaStock.adjustProductStock(window._sb, item.id, item.qty, -1);
    }));

    for (var gi = 0; gi < giftItems.length; gi++) {
      try { await window.adjustCustomGiftStock(giftItems[gi], -1); }
      catch(se) { console.warn('Custom stock deduct failed', se); }
    }
    window.CartService.clearCart();
    var t = Date.now();
    localStorage.setItem('candella_last_order', JSON.stringify({
      id:'ORD-'+orderData.shortId, shortId:orderData.shortId,
      firestoreId:orderId, time:t, status:'new',
      items: orderData.items
    }));
    showSuccessUI(orderData.shortId, orderId, t);
  } catch(e){console.error(e);alert('Error saving order: '+e.message);resetBtn();}
}

function showSuccessUI(shortId, firestoreId, orderTime) {
  document.getElementById('formContainer').style.display='none';
  var note = '<p style="font-size:12px;color:#aaa;margin-top:4px;">💵 Cash on Delivery</p>';
  var s=document.getElementById('successMsg');
  s.style.display='block';
  s.innerHTML=
    '<div style="text-align:center;padding:8px 0 18px;">'+
      '<div style="font-size:42px;margin-bottom:8px;">✅</div>'+
      '<h3 style="font-family:\'Cormorant Garamond\',serif;font-size:22px;color:var(--navy);letter-spacing:2px;margin-bottom:4px;">Order Placed!</h3>'+
      note+
      '<p style="font-size:13px;color:#888;margin-top:8px;">We will contact you shortly to confirm.</p>'+
    '</div>'+
    '<div class="order-num-box">'+
      '<div class="onum-label">Your Order Number</div>'+
      '<span class="onum-digits">'+shortId+'</span>'+
      '<div class="onum-hint">Save this number · Use it to track your order</div>'+
    '</div>'+
    '<a href="track.html?auto=1" class="track-order-btn"><i class="fa-solid fa-truck"></i> Track My Order</a>'+
    '<a href="home.html" class="landing-btn landing-btn-primary" style="display:flex;margin-top:10px;text-decoration:none;"><i class="fa-solid fa-house"></i> Back to Shop</a>';
  startCancelBox(firestoreId, orderTime);
}

function startCancelBox(firestoreId, orderTime){
  var cc=document.getElementById('cancelBoxContainer');
  if(!cc) return;
  cc.innerHTML='<div class="cancel-box" id="cancelBox"><p class="cancel-label">Cancel within <strong id="cancelTimer">60:00</strong></p><button class="cancel-order-btn" id="cancelBtn" onclick="cancelOrder()">Cancel Order</button></div>';

  // فحص الحالة من Supabase كل 10 ثواني — لو shipped أو delivered نخفي الخانة
  var statusCheck = setInterval(async function(){
    try {
      var order = JSON.parse(localStorage.getItem('candella_last_order')||'null');
      if(!order || !order.firestoreId) { clearInterval(statusCheck); return; }
      const { data: row } = await window._sb.from('orders').select('status').eq('short_id', order.shortId).single();
      if(row){
        var st = row.status;
        if(st === 'shipped' || st === 'delivered' || st === 'cancelled'){
          clearInterval(statusCheck);
          var box = document.getElementById('cancelBox');
          if(box){
            if(st === 'shipped') box.innerHTML = '<p style="font-size:12px;color:#888;">🚚 Your order is out for delivery — cancellation is no longer available.</p>';
            else if(st === 'delivered') box.innerHTML = '<p style="font-size:12px;color:#27ae60;font-weight:700;">✅ Order delivered!</p>';
            else if(st === 'cancelled') box.innerHTML = '<p style="color:#e74c3c;font-weight:700;font-size:13px;">❌ Your order has been cancelled.</p>';
          }
        }
      }
    } catch(e) {}
  }, 10000);

  var end=orderTime+60*60*1000;
  var iv=setInterval(function(){
    var rem=end-Date.now();
    if(rem<=0){clearInterval(iv);var cb=document.getElementById('cancelBtn'),ct=document.getElementById('cancelTimer');if(cb){cb.disabled=true;cb.textContent='Cancellation window closed';cb.style.opacity='0.4';cb.style.cursor='not-allowed';}if(ct)ct.textContent='00:00';return;}
    var ct=document.getElementById('cancelTimer');
    if(ct) ct.textContent=String(Math.floor(rem/60000)).padStart(2,'0')+':'+String(Math.floor((rem%60000)/1000)).padStart(2,'0');
  },1000);
}

function cancelOrder(){
  document.getElementById('cancelReasonOverlay').style.display='flex';
  document.querySelectorAll('input[name="cancelReason"]').forEach(function(r){r.checked=false;});
  document.getElementById('cancelReasonOtherText').style.display='none';
  document.getElementById('cancelReasonOtherText').value='';
}
window.cancelOrder=cancelOrder;

window.closeCancelReasonModal=function(){
  document.getElementById('cancelReasonOverlay').style.display='none';
};

window.confirmCancelWithReason=async function(){
  var selected=document.querySelector('input[name="cancelReason"]:checked');
  if(!selected){alert('Please select a reason.');return;}
  var reason=selected.value==='other'?(document.getElementById('cancelReasonOtherText').value.trim()||'Other'):selected.value;
  var order=JSON.parse(localStorage.getItem('candella_last_order')||'null');
  if(!order||!order.firestoreId){alert('Order not found.');return;}
  if((order.time+60*60*1000)-Date.now()<=0){alert('Cancellation window has closed.');return;}
  document.getElementById('cancelReasonOverlay').style.display='none';
  var cb=document.getElementById('cancelBtn');
  if(cb){cb.disabled=true;cb.textContent='Cancelling...';}
  try{
    // Atomic conditional update: only matches (and only returns a row) if
    // the order's status in the DB is NOT already 'cancelled' at the
    // instant this runs. This is a single round-trip, so there's no
    // read-then-write race window — two tabs/clicks racing each other can
    // both reach this line, but only ONE of them can possibly receive a
    // row back, no matter how they're interleaved.
    const { data: updatedRows, error: updateError } = await window._sb.from('orders')
      .update({ status: 'cancelled', cancel_reason: reason })
      .eq('id', order.firestoreId)
      .neq('status', 'cancelled')
      .select('id, items');
    if (updateError) throw updateError;
    var didTransition = !!(updatedRows && updatedRows.length > 0);

    // Restore stock ONLY if THIS call is the one that actually flipped the
    // order to cancelled. If it was already cancelled (stale tab, double
    // click, etc.), updatedRows is empty — skip the RPCs entirely, but
    // still show the normal "cancelled" success UI below, since the order
    // genuinely is cancelled (just not because of this particular click).
    if (didTransition) {
      try{
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
            catch(se){ console.warn('Custom stock restore failed',se); }
          }
        }
      }catch(re){console.warn('Stock restore error:',re);}
    }
    order.status='cancelled';localStorage.setItem('candella_last_order',JSON.stringify(order));
    var box=document.getElementById('cancelBox');
    if(box) box.innerHTML='<p style="color:#e74c3c;font-weight:700;font-size:13px;">❌ Your order has been cancelled.</p>';
  }catch(e){console.error(e);alert('❌ Failed to cancel. Contact us on WhatsApp.');if(cb){cb.disabled=false;cb.textContent='Cancel Order';}}
};
