const { timingSafeEqual, createHash } = require('crypto');

/** Timing-safe string compare (SHA-256 digest padding). */
function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

module.exports = { safeCompare };
