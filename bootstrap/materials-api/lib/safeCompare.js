const { timingSafeEqual, createHash } = require('crypto');

/** Timing-safe string compare (hashed to fixed length). */
function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

module.exports = { safeCompare };
