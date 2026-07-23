const express = require('express');
const db = require('./db');

const app = express();
app.use(express.json({ limit: '256kb' }));

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const API_KEY = process.env.API_KEY || '';
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || '*';
const APP_NAME = process.env.APP_NAME || 'fleet-api';

app.use((req, res, next) => {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS === '*') {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else {
    const allowed = ALLOWED_ORIGINS.split(',').map((s) => s.trim());
    if (allowed.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use((req, res, next) => {
  if (!API_KEY) return next();
  if (req.path === '/health' || req.method === 'OPTIONS') return next();
  const provided = req.headers['x-api-key'] || req.query.apiKey;
  if (provided !== API_KEY) return res.status(401).json({ ok: false, error: 'Invalid or missing API key' });
  next();
});

function json(res, status, body) {
  return res.status(status).json(body);
}

function handleError(res, err) {
  const status = err.status && Number.isInteger(err.status) ? err.status : 500;
  return json(res, status, { ok: false, error: err.message || 'Internal error' });
}

app.get('/health', async (_req, res) => {
  const pool = db.getPool();
  let dbOk = false;
  if (pool) {
    try {
      await db.ensureSchema();
      dbOk = true;
    } catch {
      dbOk = false;
    }
  }
  res.json({
    ok: true,
    service: APP_NAME,
    database: dbOk ? 'connected' : pool === false ? 'not configured' : 'error',
    checkedAt: new Date().toISOString(),
  });
});

app.get('/api/vehicles', async (req, res) => {
  try {
    const assignedUserId = req.query.assignedUserId ? String(req.query.assignedUserId) : undefined;
    const vehicles = await db.listVehicles({ assignedUserId });
    return json(res, 200, { ok: true, vehicles });
  } catch (err) {
    return handleError(res, err);
  }
});

app.post('/api/vehicles', async (req, res) => {
  try {
    const { name, plate, clientUid, assignedUserId, status } = req.body || {};
    if (!name || !String(name).trim()) {
      return json(res, 400, { ok: false, error: 'name is required' });
    }
    const vehicle = await db.createVehicle({
      name: String(name).trim(),
      plate: plate != null ? String(plate).trim() : null,
      clientUid: clientUid != null ? String(clientUid).trim() : null,
      assignedUserId: assignedUserId != null ? String(assignedUserId).trim() : null,
      status: status != null ? String(status).trim() : undefined,
    });
    return json(res, 201, { ok: true, vehicle });
  } catch (err) {
    return handleError(res, err);
  }
});

app.patch('/api/vehicles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const vehicle = await db.updateVehicle(id, {
      name: body.name != null ? String(body.name).trim() : undefined,
      plate: body.plate !== undefined ? (body.plate ? String(body.plate).trim() : null) : undefined,
      clientUid: body.clientUid !== undefined ? (body.clientUid ? String(body.clientUid).trim() : null) : undefined,
      assignedUserId:
        body.assignedUserId !== undefined
          ? body.assignedUserId
            ? String(body.assignedUserId).trim()
            : null
          : undefined,
      status: body.status != null ? String(body.status).trim() : undefined,
    });
    if (!vehicle) return json(res, 404, { ok: false, error: 'Vehicle not found' });
    return json(res, 200, { ok: true, vehicle });
  } catch (err) {
    return handleError(res, err);
  }
});

app.delete('/api/vehicles/:id', async (req, res) => {
  try {
    const deleted = await db.deleteVehicle(req.params.id);
    if (!deleted) return json(res, 404, { ok: false, error: 'Vehicle not found' });
    return json(res, 200, { ok: true });
  } catch (err) {
    return handleError(res, err);
  }
});

app.post('/api/location', async (req, res) => {
  try {
    const { userId, lat, lng, heading, speed, accuracy, source } = req.body || {};
    if (!userId || !String(userId).trim()) {
      return json(res, 400, { ok: false, error: 'userId is required' });
    }
    const latN = Number(lat);
    const lngN = Number(lng);
    if (!Number.isFinite(latN) || !Number.isFinite(lngN)) {
      return json(res, 400, { ok: false, error: 'lat and lng are required numbers' });
    }
    const vehicle = await db.recordLocation({
      userId: String(userId).trim(),
      lat: latN,
      lng: lngN,
      heading: heading != null ? Number(heading) : null,
      speed: speed != null ? Number(speed) : null,
      accuracy: accuracy != null ? Number(accuracy) : null,
      source: source != null ? String(source) : 'app',
    });
    return json(res, 200, { ok: true, vehicle });
  } catch (err) {
    return handleError(res, err);
  }
});

app.get('/api/locations/latest', async (_req, res) => {
  try {
    const summary = await db.summary();
    return json(res, 200, { ok: true, ...summary });
  } catch (err) {
    return handleError(res, err);
  }
});

app.get('/api/vehicles/:id/history', async (req, res) => {
  try {
    const vehicle = await db.getVehicle(req.params.id);
    if (!vehicle) return json(res, 404, { ok: false, error: 'Vehicle not found' });
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const history = await db.vehicleHistory(req.params.id, limit);
    return json(res, 200, { ok: true, vehicleId: req.params.id, history });
  } catch (err) {
    return handleError(res, err);
  }
});

app.use((_req, res) => json(res, 404, { ok: false, error: 'Not found' }));

app.listen(PORT, HOST, () => {
  const pool = db.getPool();
  console.log(`[${APP_NAME}] listening on http://${HOST}:${PORT}`);
  console.log(`[${APP_NAME}] database: ${pool ? 'configured' : 'DATABASE_URL not set'}`);
});
