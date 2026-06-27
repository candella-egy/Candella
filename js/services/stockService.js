/* ============================================================
   js/services/stockService.js — SINGLE stock-tracking service for the
   whole project (Regular Products + Custom Gift Builder).

   Originally moved verbatim from js/stockShared.js (now inside
   js/services/, matching the rest of the Services Layer). Organized into
   3 clearly-labeled sections: Validation Logic, Custom Builder Stock,
   Regular Product Stock. The one-time Migration Logic section was removed
   once all candles/containers/accessories were confirmed migrated and no
   active workflow depended on it anymore.

   Public API (unchanged): window.CandellaStock.*
     - adjustProductStock(...)
     - adjustCustomGiftStock(...)
     - validateCatalogBeforeSave(...)
     - validateStock(...), checkCatalogIntegrity(...), logInventoryHealth(...)
     - findCandle/findContainer/findAccessory/buildInventoryIndex/slug

   STOCK MODEL (post-migration):
   Stock and cost live directly on each item inside settings.giftSet,
   addressed by a permanent string `id` — never by array index or by
   display label. There is no more per-type index key
   (candle__size_0__0 / container__0__1 / acc__0) — those were the
   root cause of repeated matching bugs because they depended on
   array position and on rebuilding display labels.

   settings.giftSet.value shape:
     sizes: [ {label, weight, price, img} ]
     candlesBySize: { size_<i>: [ {id, name, scent, img, price, cost, stock} ] }
     containers: [ {id, type, name, image, price, cost, stock} ]   (flat — no variants[])
     accessories: [ {id, name, img, price, cost, stock} ]

   Cart / order item shape:
     giftCandleId:      "candle_..."   | null
     giftContainerIds:  ["container_...", ...]
     giftAccessoryIds:  ["acc_...", ...]
   ============================================================ */
(function (global) {

  function slug(s) {
    return (s || '')
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'item';
  }

  /* ════════════════════════════════════════════════════════════
     SECTION: VALIDATION LOGIC
     ════════════════════════════════════════════════════════════ */

  /* ── Resolve a candle object by id ── */
  function findCandle(giftData, candleId) {
    if (!candleId) return null;
    var candlesBySize = giftData.candlesBySize || {};
    var sizeKeys = Object.keys(candlesBySize);
    for (var s = 0; s < sizeKeys.length; s++) {
      var list = candlesBySize[sizeKeys[s]] || [];
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === candleId) return list[i];
      }
    }
    return null;
  }

  function findContainer(giftData, containerId) {
    var list = giftData.containers || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === containerId) return list[i];
    }
    return null;
  }

  function findAccessory(giftData, accId) {
    var list = giftData.accessories || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === accId) return list[i];
    }
    return null;
  }

  /* ── Inventory index: O(1) lookup by id instead of re-scanning arrays
     every time. Built fresh from whatever giftData object is passed in —
     entries are references to the SAME objects inside that giftData, so
     mutating index.candlesById[id].stock mutates the original object too. ── */
  function buildInventoryIndex(giftData) {
    var candlesById = {}, containersById = {}, accessoriesById = {};

    var candlesBySize = giftData.candlesBySize || {};
    Object.keys(candlesBySize).forEach(function (skey) {
      (candlesBySize[skey] || []).forEach(function (c) {
        if (c && c.id) candlesById[c.id] = c;
      });
    });

    (giftData.containers || []).forEach(function (c) {
      if (c && c.id) containersById[c.id] = c;
    });

    (giftData.accessories || []).forEach(function (a) {
      if (a && a.id) accessoriesById[a.id] = a;
    });

    return { candlesById: candlesById, containersById: containersById, accessoriesById: accessoriesById };
  }

  /* ── Catalog integrity check: scans candlesBySize/containers/accessories
     for missing ids, empty ids, duplicate ids, and broken (non-object)
     entries. Used by the admin "Custom Catalog Integrity Check" tool and
     by the one-time inventory health log on page load. ── */
  function checkCatalogIntegrity(giftData) {
    var report = {
      ok: true,
      missingIds: [], emptyIds: [], duplicateIds: [], brokenObjects: [],
      counts: { candles: 0, containers: 0, accessories: 0 }
    };
    var seenIds = {};

    function checkItem(item, label) {
      if (!item || typeof item !== 'object') {
        report.brokenObjects.push(label);
        report.ok = false;
        return;
      }
      if (item.id === undefined || item.id === null) {
        report.missingIds.push(label);
        report.ok = false;
        return;
      }
      if (item.id === '') {
        report.emptyIds.push(label);
        report.ok = false;
        return;
      }
      if (seenIds[item.id]) {
        report.duplicateIds.push(item.id);
        report.ok = false;
      } else {
        seenIds[item.id] = true;
      }
    }

    var candlesBySize = giftData.candlesBySize || {};
    Object.keys(candlesBySize).forEach(function (skey) {
      (candlesBySize[skey] || []).forEach(function (c, ci) {
        report.counts.candles++;
        checkItem(c, 'candle ' + skey + '[' + ci + '] (' + (c && c.name || '?') + ')');
      });
    });
    (giftData.containers || []).forEach(function (c, ci) {
      report.counts.containers++;
      checkItem(c, 'container[' + ci + '] (' + (c && c.name || '?') + ')');
    });
    (giftData.accessories || []).forEach(function (a, ai) {
      report.counts.accessories++;
      checkItem(a, 'accessory[' + ai + '] (' + (a && a.name || '?') + ')');
    });

    return report;
  }

  /* ── Save-time validation: blocks saving a candle/container/accessory
     list if it contains a duplicate id or an empty-string id. Missing
     (null/undefined) ids are NOT blocked here — those belong to
     not-yet-named blank rows the admin is still filling in. This is the
     ONLY validation gate called from home-editor.html's saveCandles() /
     saveContShapes() / saveAccs() — none of those duplicate this check. ── */
  function validateCatalogBeforeSave(items) {
    var problems = [];
    var seen = {};
    (items || []).forEach(function (item, i) {
      var label = (item && item.name) ? item.name : ('item #' + (i + 1));
      if (item && item.id === '') {
        problems.push('"' + label + '" has an empty ID.');
        return;
      }
      if (item && item.id) {
        if (seen[item.id]) {
          problems.push('Duplicate ID "' + item.id + '" on "' + label + '" and "' + seen[item.id] + '".');
        } else {
          seen[item.id] = label;
        }
      }
    });
    return { ok: problems.length === 0, message: problems.join(' ') };
  }

  /* ── One-time inventory health log — call once after giftSet loads. ── */
  function logInventoryHealth(giftData) {
    var integrity = checkCatalogIntegrity(giftData);
    console.log('[inventory-health]', {
      candles: integrity.counts.candles,
      containers: integrity.counts.containers,
      accessories: integrity.counts.accessories,
      duplicateIds: integrity.duplicateIds.length,
      missingIds: integrity.missingIds.length
    });
  }

  /* ── Stock validation (used before allowing selection AND again at checkout) ── */
  function validateStock(giftData, giftItem) {
    var problems = [];
    var qty = giftItem.qty || 1;

    if (giftItem.giftCandleId) {
      var c = findCandle(giftData, giftItem.giftCandleId);
      if (!c) problems.push('Candle not found: ' + giftItem.giftCandleId);
      else if (c.stock != null && c.stock < qty) problems.push('Candle out of stock: ' + (c.name || c.id));
    }
    (giftItem.giftContainerIds || []).forEach(function (id) {
      var con = findContainer(giftData, id);
      if (!con) problems.push('Container not found: ' + id);
      else if (con.stock != null && con.stock < qty) problems.push('Container out of stock: ' + (con.name || con.id));
    });
    (giftItem.giftAccessoryIds || []).forEach(function (id) {
      var acc = findAccessory(giftData, id);
      if (!acc) problems.push('Accessory not found: ' + id);
      else if (acc.stock != null && acc.stock < qty) problems.push('Accessory out of stock: ' + (acc.name || acc.id));
    });

    return { ok: problems.length === 0, problems: problems };
  }

  /* ════════════════════════════════════════════════════════════
     SECTION: CUSTOM BUILDER STOCK
     ════════════════════════════════════════════════════════════ */

  /* ── Core: adjust stock for one gift-set cart/order item ──
     direction: -1 = decrement on order confirm, +1 = restore on cancel.
     sb: an initialized supabase client (window._sb / window.createSupabaseClient() result / sb var)

     TRANSITIONAL DUAL-MODE MATCHING:
     If the cart/order item carries stable ids (giftCandleId /
     giftContainerIds / giftAccessoryIds), this calls the server-side RPC
     `adjust_custom_gift_stock` (security definer) once, atomically — this
     is the path every current order uses. If no stable ids are present
     (a cart/order created before the stable-id system existed — none
     currently exist in the live database), it falls back to the original
     label-based match against `settings.giftSet`/`customCosts` directly.
     See the "Legacy Fallback Report" for exact reach/usage of this branch.
  */
  async function adjustCustomGiftStock(sb, giftItem, direction) {
    try {
      var hasStableIds = !!(
        giftItem.giftCandleId ||
        (giftItem.giftContainerIds && giftItem.giftContainerIds.length) ||
        (giftItem.giftAccessoryIds && giftItem.giftAccessoryIds.length)
      );

      // ── Stable-id path: one atomic call to the server-side RPC. This is
      // the ONLY write path for current orders — the JS no longer reads or
      // writes `settings` directly for id-based items, which lets the
      // `settings` table be locked down with RLS (the RPC runs with
      // elevated privileges via `security definer` in Postgres). ──
      if (hasStableIds) {
        const { data, error } = await sb.rpc('adjust_custom_gift_stock', {
          p_candle_id: giftItem.giftCandleId || null,
          p_container_ids: giftItem.giftContainerIds || [],
          p_accessory_ids: giftItem.giftAccessoryIds || [],
          p_qty: giftItem.qty || 1,
          p_direction: direction
        });
        if (error) {
          console.warn('[stock] adjust_custom_gift_stock RPC error:', error);
          return { changed: false, error: error };
        }
        return { changed: !!(data && data.changed) };
      }

      // ── LEGACY FALLBACK (see Legacy Fallback Report) — only reachable
      // for a cart/order created before the stable-id system existed (none
      // currently exist in the live database). Reads/writes `settings`
      // directly, the same way it always has. NOTE: once `settings` is
      // locked down with RLS for anonymous writes, this fallback will stop
      // working — that's an accepted tradeoff since there is no real order
      // left that needs it. ──
      var qty = (giftItem.qty || 1) * direction;

      const { data: giftRow } = await sb.from('settings').select('value').eq('key', 'giftSet').maybeSingle();
      if (!giftRow) return { changed: false, reason: 'giftSet not found' };
      var giftData = giftRow.value || {};

      const { data: costsRow } = await sb.from('settings').select('value').eq('key', 'customCosts').maybeSingle();
      var costs = (costsRow && costsRow.value) || {};

      var updatedCosts = Object.assign({}, costs);
      var costsChanged = false;

      if (giftItem.giftCandle) {
        // Fallback: legacy label-based match (name + ' - ' + scent), legacy customCosts key.
        var fbSizes = giftData.sizes || [];
        var fbCandlesBySize = giftData.candlesBySize || {};
        for (var fsi = 0; fsi < fbSizes.length; fsi++) {
          var fsz = fbSizes[fsi];
          if ((fsz.label || fsz.sizeLabel || '') !== giftItem.giftSize) continue;
          var fbCandles = fbCandlesBySize['size_' + fsi] || [];
          for (var fci = 0; fci < fbCandles.length; fci++) {
            var fc = fbCandles[fci];
            var cFullLabel = (fc.name || '') + (fc.scent ? ' - ' + fc.scent : '');
            if (cFullLabel !== giftItem.giftCandle) continue;
            var candleKey = 'candle__size_' + fsi + '__' + fci;
            if (updatedCosts[candleKey] && updatedCosts[candleKey].stock != null) {
              updatedCosts[candleKey] = Object.assign({}, updatedCosts[candleKey], {
                stock: Math.max(0, (updatedCosts[candleKey].stock || 0) + qty)
              });
              costsChanged = true;
            }
          }
        }
      }

      // ── Containers ──
      if (giftItem.giftContainer) {
        // Fallback: legacy label/variant-string match against legacy containers[]/variants[].
        var fbContainers = giftData.containers || [];
        var fbEntries = (giftItem.giftContainer || '').split(', ').filter(Boolean);
        fbEntries.forEach(function (entry) {
          var entryMatch = entry.match(/^(.*) \(([^)]+)\)$/);
          var entryLabel = entryMatch ? entryMatch[1] : entry;
          var entryVariant = entryMatch ? entryMatch[2] : null;
          for (var coni = 0; coni < fbContainers.length; coni++) {
            var con = fbContainers[coni];
            var conLabel = con.label || con.name || '';
            if (conLabel !== entryLabel) continue;
            var conKey;
            if (con.variants && con.variants.length) {
              var vi = -1;
              for (var vvi = 0; vvi < con.variants.length; vvi++) {
                if ((con.variants[vvi].label || '') === entryVariant) { vi = vvi; break; }
              }
              if (vi === -1) break;
              conKey = 'container__' + coni + '__' + vi;
            } else {
              conKey = 'container__' + coni;
            }
            if (updatedCosts[conKey] && updatedCosts[conKey].stock != null) {
              updatedCosts[conKey] = Object.assign({}, updatedCosts[conKey], {
                stock: Math.max(0, (updatedCosts[conKey].stock || 0) + qty)
              });
              costsChanged = true;
            }
            break;
          }
        });
      }

      // ── Accessories ──
      if (giftItem.giftAccessories) {
        // Fallback: legacy name match against legacy accessories[].
        var fbAccessories = giftData.accessories || [];
        var fbAccLabels = (giftItem.giftAccessories || '').split(', ').filter(Boolean);
        for (var fai = 0; fai < fbAccessories.length; fai++) {
          var facc = fbAccessories[fai];
          var faccLabel = facc.name || facc.label || '';
          if (fbAccLabels.indexOf(faccLabel) === -1) continue;
          var accKey = 'acc__' + fai;
          if (updatedCosts[accKey] && updatedCosts[accKey].stock != null) {
            updatedCosts[accKey] = Object.assign({}, updatedCosts[accKey], {
              stock: Math.max(0, (updatedCosts[accKey].stock || 0) + qty)
            });
            costsChanged = true;
          }
        }
      }

      if (costsChanged) {
        await sb.from('settings').upsert({ key: 'customCosts', value: updatedCosts });
      }
      return { changed: costsChanged };
    } catch (e) {
      console.warn('[stock] adjustCustomGiftStock error:', e);
      return { changed: false, error: e };
    }
  }

  /* ════════════════════════════════════════════════════════════
     SECTION: REGULAR PRODUCT STOCK
     ════════════════════════════════════════════════════════════ */

  /* ── Regular (non-custom) product stock — single wrapper around the
     atomic `adjust_product_stock` RPC already used everywhere. The RPC
     itself (in Supabase) is the real single source of truth and is not
     being changed; this just centralizes the JS call + logging so the
     4 call sites don't each format errors differently.
     direction: -1 = decrement on order confirm, +1 = restore on cancel.
  */
  async function adjustProductStock(sb, productId, qty, direction) {
    try {
      var delta = (qty || 1) * direction;
      const { error } = await sb.rpc('adjust_product_stock', { p_id: productId, p_delta: delta });
      if (error) {
        console.warn('[stock] adjust_product_stock failed for', productId, error);
        return { changed: false, error: error };
      }
      return { changed: true };
    } catch (e) {
      console.warn('[stock] adjust_product_stock error for', productId, e);
      return { changed: false, error: e };
    }
  }

  global.CandellaStock = {
    slug: slug,
    findCandle: findCandle,
    findContainer: findContainer,
    findAccessory: findAccessory,
    buildInventoryIndex: buildInventoryIndex,
    checkCatalogIntegrity: checkCatalogIntegrity,
    validateCatalogBeforeSave: validateCatalogBeforeSave,
    logInventoryHealth: logInventoryHealth,
    validateStock: validateStock,
    adjustCustomGiftStock: adjustCustomGiftStock,
    adjustProductStock: adjustProductStock
  };

  // Page-convenience wrapper — previously duplicated identically in
  // js/pages/checkout.js and js/pages/track.js. Both pages already define
  // window._sb (their own Supabase client) before this would ever be
  // called, so reading it here at call-time changes nothing about how
  // either page invokes this.
  global.adjustCustomGiftStock = async function (giftItem, direction) {
    var result = await global.CandellaStock.adjustCustomGiftStock(global._sb, giftItem, direction);
    if (result && result.error) console.warn('adjustCustomGiftStock error:', result.error);
    return result;
  };

})(window);
