/** In-memory sliding-window rate limiter for bootstrap satellite APIs. */
const store = new Map();

function checkRateLimit(key, limit, windowMs = 60_000) {
  const now = Date.now();
  const cutoff = now - windowMs;
  let win = store.get(key);
  if (!win) {
    win = { timestamps: [] };
    store.set(key, win);
  }
  win.timestamps = win.timestamps.filter((t) => t > cutoff);
  if (win.timestamps.length >= limit) {
    const oldest = win.timestamps[0];
    const retryAfterMs = Math.max(oldest + windowMs - now, 0);
    return { allowed: false, retryAfterMs };
  }
  win.timestamps.push(now);
  return { allowed: true };
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0]?.trim() || 'unknown';
  return String(req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown').trim();
}

module.exports = { checkRateLimit, clientIp };
