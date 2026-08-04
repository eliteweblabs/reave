/** @type {import('./types').InventoryProvider} */
const shopifyProvider = {
  id: 'shopify',
  label: 'Shopify Admin API',
  platform: 'shopify',
  isConfigured() {
    return Boolean(process.env.SHOPIFY_SHOP?.trim() && process.env.SHOPIFY_ADMIN_TOKEN?.trim());
  },
  async search() {
    const err = new Error(
      'Shopify live sync ships when inventory_sync is prioritized for your install. Mock provider available for demos.',
    );
    err.status = 501;
    throw err;
  },
  async getProduct() {
    const err = new Error('Shopify live sync not enabled yet.');
    err.status = 501;
    throw err;
  },
};

module.exports = { shopifyProvider };
