/**
 * @typedef {Object} InventoryPrice
 * @property {number} amount
 * @property {string} currency
 */

/**
 * @typedef {Object} InventoryLocation
 * @property {string} id
 * @property {string} name
 * @property {number} quantity
 */

/**
 * @typedef {Object} InventoryProduct
 * @property {string} platform
 * @property {string} externalId
 * @property {string|null} [sku]
 * @property {string} title
 * @property {string|null} [variantTitle]
 * @property {InventoryPrice} price
 * @property {number|null} quantity
 * @property {boolean} inStock
 * @property {InventoryLocation[]|null} [locations]
 * @property {string|null} [url]
 * @property {string|null} [imageUrl]
 * @property {string} lastSyncedAt
 * @property {Record<string, unknown>|null} [raw]
 */

/**
 * @typedef {Object} SearchOptions
 * @property {number} [limit]
 * @property {number} [page]
 * @property {number} [minPrice]
 * @property {number} [maxPrice]
 * @property {boolean} [inStockOnly]
 */

/**
 * @typedef {Object} InventoryProvider
 * @property {string} id
 * @property {string} label
 * @property {string} platform
 * @property {() => boolean} isConfigured
 * @property {(query: string, opts?: SearchOptions) => Promise<InventoryProduct[]>} search
 * @property {(externalId: string, opts?: SearchOptions) => Promise<InventoryProduct>} getProduct
 * @property {(sku: string, opts?: SearchOptions) => Promise<InventoryProduct|null>} [getBySku]
 */

module.exports = {};
