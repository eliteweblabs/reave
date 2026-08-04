/** @type {import('./types').InventoryProvider} */
const squareProvider = {
  id: 'square',
  label: 'Square Catalog + Inventory',
  platform: 'square',
  isConfigured() {
    return Boolean(process.env.SQUARE_ACCESS_TOKEN?.trim() && process.env.SQUARE_LOCATION_ID?.trim());
  },
  async search() {
    const err = new Error(
      'Square live sync ships when inventory_sync is prioritized for your install. Mock provider available for demos.',
    );
    err.status = 501;
    throw err;
  },
  async getProduct() {
    const err = new Error('Square live sync not enabled yet.');
    err.status = 501;
    throw err;
  },
};

module.exports = { squareProvider };
