/** @type {import('./types').InventoryProvider} */
const woocommerceProvider = {
  id: 'woocommerce',
  label: 'WooCommerce REST API',
  platform: 'woocommerce',
  isConfigured() {
    return Boolean(
      process.env.WOOCOMMERCE_URL?.trim() &&
        process.env.WOOCOMMERCE_KEY?.trim() &&
        process.env.WOOCOMMERCE_SECRET?.trim(),
    );
  },
  async search() {
    const err = new Error(
      'WooCommerce live sync ships when inventory_sync is prioritized for your install. Mock provider available for demos.',
    );
    err.status = 501;
    throw err;
  },
  async getProduct() {
    const err = new Error('WooCommerce live sync not enabled yet.');
    err.status = 501;
    throw err;
  },
};

module.exports = { woocommerceProvider };
