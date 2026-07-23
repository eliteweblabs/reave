const pg = require('pg');

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS fleet_vehicles (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  plate           TEXT,
  status          TEXT NOT NULL DEFAULT 'unknown',
  client_uid      TEXT,
  assigned_user_id TEXT,
  last_lat        DOUBLE PRECISION,
  last_lng        DOUBLE PRECISION,
  last_heading    REAL,
  last_speed      REAL,
  last_accuracy   REAL,
  last_seen_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fleet_vehicles_client ON fleet_vehicles (client_uid);
CREATE INDEX IF NOT EXISTS idx_fleet_vehicles_user ON fleet_vehicles (assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_fleet_vehicles_status ON fleet_vehicles (status);

CREATE TABLE IF NOT EXISTS fleet_location_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id    TEXT NOT NULL REFERENCES fleet_vehicles(id) ON DELETE CASCADE,
  lat           DOUBLE PRECISION NOT NULL,
  lng           DOUBLE PRECISION NOT NULL,
  heading       REAL,
  speed         REAL,
  accuracy      REAL,
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source        TEXT NOT NULL DEFAULT 'app' CHECK (source IN ('app', 'webhook', 'manual'))
);
CREATE INDEX IF NOT EXISTS idx_fleet_history_vehicle ON fleet_location_history (vehicle_id, recorded_at DESC);
`;

let pool = null;
let schemaReady = null;

function poolSsl(url) {
  if (/sslmode=(require|verify-full|verify-ca)/i.test(url)) {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

function getPool() {
  if (pool !== null) return pool;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    pool = false;
    return pool;
  }
  pool = new pg.Pool({ connectionString: url, ssl: poolSsl(url), max: 5 });
  return pool;
}

async function ensureSchema() {
  const p = getPool();
  if (!p) throw new Error('DATABASE_URL is not set');
  if (!schemaReady) {
    schemaReady = p.query(SCHEMA_SQL).catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  await schemaReady;
  return p;
}

function rowToVehicle(row) {
  return {
    id: row.id,
    name: row.name,
    plate: row.plate,
    status: row.status,
    clientUid: row.client_uid,
    assignedUserId: row.assigned_user_id,
    lastLat: row.last_lat != null ? Number(row.last_lat) : null,
    lastLng: row.last_lng != null ? Number(row.last_lng) : null,
    lastHeading: row.last_heading != null ? Number(row.last_heading) : null,
    lastSpeed: row.last_speed != null ? Number(row.last_speed) : null,
    lastAccuracy: row.last_accuracy != null ? Number(row.last_accuracy) : null,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listVehicles({ assignedUserId } = {}) {
  const p = await ensureSchema();
  const params = [];
  let where = '';
  if (assignedUserId) {
    params.push(assignedUserId);
    where = `WHERE assigned_user_id = $${params.length}`;
  }
  const { rows } = await p.query(
    `SELECT * FROM fleet_vehicles ${where} ORDER BY name ASC`,
    params,
  );
  return rows.map(rowToVehicle);
}

async function getVehicle(id) {
  const p = await ensureSchema();
  const { rows } = await p.query('SELECT * FROM fleet_vehicles WHERE id = $1', [id]);
  return rows[0] ? rowToVehicle(rows[0]) : null;
}

async function createVehicle(input) {
  const p = await ensureSchema();
  const id = input.id || `veh_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const { rows } = await p.query(
    `INSERT INTO fleet_vehicles (id, name, plate, client_uid, assigned_user_id, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      id,
      input.name,
      input.plate || null,
      input.clientUid || null,
      input.assignedUserId || null,
      input.status || 'idle',
    ],
  );
  return rowToVehicle(rows[0]);
}

async function updateVehicle(id, patch) {
  const p = await ensureSchema();
  const fields = [];
  const params = [id];
  const set = (col, val) => {
    params.push(val);
    fields.push(`${col} = $${params.length}`);
  };
  if (patch.name != null) set('name', patch.name);
  if (patch.plate != null) set('plate', patch.plate || null);
  if (patch.clientUid !== undefined) set('client_uid', patch.clientUid || null);
  if (patch.assignedUserId !== undefined) set('assigned_user_id', patch.assignedUserId || null);
  if (patch.status != null) set('status', patch.status);
  if (!fields.length) return getVehicle(id);
  fields.push('updated_at = NOW()');
  const { rows } = await p.query(
    `UPDATE fleet_vehicles SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
    params,
  );
  return rows[0] ? rowToVehicle(rows[0]) : null;
}

async function deleteVehicle(id) {
  const p = await ensureSchema();
  const { rowCount } = await p.query('DELETE FROM fleet_vehicles WHERE id = $1', [id]);
  return rowCount > 0;
}

async function recordLocation({ userId, lat, lng, heading, speed, accuracy, source = 'app' }) {
  const p = await ensureSchema();
  const { rows } = await p.query(
    'SELECT * FROM fleet_vehicles WHERE assigned_user_id = $1 LIMIT 1',
    [userId],
  );
  if (!rows.length) {
    const err = new Error('No vehicle assigned to this user');
    err.status = 404;
    throw err;
  }
  const vehicle = rows[0];
  const now = new Date().toISOString();
  await p.query(
    `UPDATE fleet_vehicles
     SET last_lat = $2, last_lng = $3, last_heading = $4, last_speed = $5,
         last_accuracy = $6, last_seen_at = $7, status = 'active', updated_at = NOW()
     WHERE id = $1`,
    [vehicle.id, lat, lng, heading ?? null, speed ?? null, accuracy ?? null, now],
  );
  await p.query(
    `INSERT INTO fleet_location_history
       (vehicle_id, lat, lng, heading, speed, accuracy, recorded_at, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [vehicle.id, lat, lng, heading ?? null, speed ?? null, accuracy ?? null, now, source],
  );
  const limit = Math.max(Number(process.env.HISTORY_LIMIT) || 500, 50);
  await p.query(
    `DELETE FROM fleet_location_history
     WHERE vehicle_id = $1
       AND id NOT IN (
         SELECT id FROM fleet_location_history
         WHERE vehicle_id = $1
         ORDER BY recorded_at DESC
         LIMIT $2
       )`,
    [vehicle.id, limit],
  );
  return getVehicle(vehicle.id);
}

async function latestLocations() {
  const p = await ensureSchema();
  const staleMinutes = Math.max(Number(process.env.STALE_MINUTES) || 15, 1);
  await p.query(
    `UPDATE fleet_vehicles
     SET status = 'offline', updated_at = NOW()
     WHERE last_seen_at IS NOT NULL
       AND last_seen_at < NOW() - ($1 || ' minutes')::interval
       AND status = 'active'`,
    [String(staleMinutes)],
  );
  const { rows } = await p.query('SELECT * FROM fleet_vehicles ORDER BY name ASC');
  return rows.map(rowToVehicle);
}

async function vehicleHistory(vehicleId, limit = 50) {
  const p = await ensureSchema();
  const capped = Math.min(Math.max(Number(limit) || 50, 1), 500);
  const { rows } = await p.query(
    `SELECT id, vehicle_id, lat, lng, heading, speed, accuracy, recorded_at, source
     FROM fleet_location_history
     WHERE vehicle_id = $1
     ORDER BY recorded_at DESC
     LIMIT $2`,
    [vehicleId, capped],
  );
  return rows.map((row) => ({
    id: row.id,
    vehicleId: row.vehicle_id,
    lat: Number(row.lat),
    lng: Number(row.lng),
    heading: row.heading != null ? Number(row.heading) : null,
    speed: row.speed != null ? Number(row.speed) : null,
    accuracy: row.accuracy != null ? Number(row.accuracy) : null,
    recordedAt: row.recorded_at,
    source: row.source,
  }));
}

async function summary() {
  const vehicles = await latestLocations();
  const withLocation = vehicles.filter((v) => v.lastLat != null && v.lastLng != null);
  return {
    total: vehicles.length,
    active: vehicles.filter((v) => v.status === 'active').length,
    offline: vehicles.filter((v) => v.status === 'offline').length,
    located: withLocation.length,
    vehicles,
  };
}

module.exports = {
  ensureSchema,
  getPool,
  listVehicles,
  getVehicle,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  recordLocation,
  latestLocations,
  vehicleHistory,
  summary,
};
