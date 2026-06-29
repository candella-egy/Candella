// js/api/productsApi.js
// Products domain API layer (Architecture Phase 3.3). Sits between pages
// and Supabase — each function is a thin wrapper around a query that
// previously lived inline in a page file. The API layer owns the query
// shape: every method selects exactly the columns its caller(s) need,
// never '*', so no column is exposed to a page that doesn't read it.
//
// Same calling convention as js/api/reviewsApi.js and js/services/*.js:
// `sb` is passed in explicitly by the caller, never assumed to be a global.
(function (global) {

  // Previously inline in js/pages/home.js's loadProductsForHome() and
  // js/pages/shop.js's loadProductsForShop() — identical query, identical
  // field needs (both map id/name/description/price/category/img/stock/order).
  async function getStoreProducts(sb) {
    return await sb.from('products').select('id, name, description, price, category, img, stock, order, product_type');
  }

  // Previously inline in js/pages/homeEditor.js's loadEditorProducts() —
  // feeds only the Home Editor's carousel product picker, which never
  // reads description/category.
  async function getCarouselProducts(sb) {
    return await sb.from('products').select('id, name, price, img, stock, order');
  }

  // Previously inline in js/pages/dashboard.js's loadProductCosts() — builds
  // cost/name/img/category lookup maps for profit reporting only.
  async function getProductsForCosts(sb) {
    return await sb.from('products').select('id, cost_price, name, img, category');
  }

  // Previously inline in js/pages/products.js's loadProducts() — the admin
  // grid reads every one of these columns (cost_price, description,
  // category, img, price, stock, order) for its product cards.
  async function getAdminProducts(sb) {
    return await sb.from('products').select('id, name, description, category, img, cost_price, price, stock, order, product_type');
  }

  // Previously inline in js/pages/checkout.js's saveAndShowSuccess() stock
  // re-check, run per cart item inside a Promise.all.
  async function getStockAndName(sb, id) {
    return await sb.from('products').select('stock, name').eq('id', id).single();
  }

  // Previously inline in js/pages/products.js's saveProduct() (add path).
  async function createProduct(sb, data) {
    return await sb.from('products').insert(data);
  }

  // Previously inline in js/pages/products.js's saveProduct() (edit path).
  async function updateProduct(sb, id, data) {
    return await sb.from('products').update(data).eq('id', id);
  }

  // Previously inline in js/pages/products.js's deleteProduct().
  async function deleteProduct(sb, id) {
    return await sb.from('products').delete().eq('id', id);
  }

  // Previously inline in js/pages/products.js's saveCategoriesToStorage().
  async function saveCategoriesList(sb, cats) {
    return await sb.from('settings').upsert({ key: 'categories', value: { list: cats } });
  }

  global.ProductsApi = {
    getStoreProducts: getStoreProducts,
    getCarouselProducts: getCarouselProducts,
    getProductsForCosts: getProductsForCosts,
    getAdminProducts: getAdminProducts,
    getStockAndName: getStockAndName,
    createProduct: createProduct,
    updateProduct: updateProduct,
    deleteProduct: deleteProduct,
    saveCategoriesList: saveCategoriesList
  };
})(window);
