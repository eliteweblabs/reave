/**
 * @typedef {Object} ProductOffer
 * @property {number} price
 * @property {number|null} [listPrice]
 * @property {string} currency
 * @property {boolean} [inStock]
 * @property {string|null} [availabilityText]
 * @property {boolean} [storePickup]
 * @property {boolean} [shipToHome]
 */

/**
 * @typedef {Object} MaterialProduct
 * @property {string} provider
 * @property {string} id
 * @property {string} title
 * @property {string|null} [brand]
 * @property {string|null} [modelNumber]
 * @property {string|null} [sku]
 * @property {string|null} [upc]
 * @property {string|null} [url]
 * @property {string|null} [imageUrl]
 * @property {ProductOffer} offer
 * @property {string|null} [unit]
 * @property {number|null} [rating]
 * @property {number|null} [reviewCount]
 * @property {Record<string, unknown>|null} [raw]
 */

/**
 * @typedef {Object} SearchOptions
 * @property {string} [zip]
 * @property {number} [limit]
 * @property {number} [page]
 * @property {number} [minPrice]
 * @property {number} [maxPrice]
 */

/**
 * @typedef {Object} MaterialsProvider
 * @property {string} id
 * @property {string} label
 * @property {() => boolean} isConfigured
 * @property {(query: string, opts?: SearchOptions) => Promise<MaterialProduct[]>} search
 * @property {(id: string, opts?: SearchOptions) => Promise<MaterialProduct>} getProduct
 * @property {(url: string, opts?: SearchOptions) => Promise<MaterialProduct>} lookupUrl
 */

module.exports = {};
