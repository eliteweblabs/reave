-- UptimeRobot monitoring tables

CREATE TABLE IF NOT EXISTS uptimerobot_monitors (
  id SERIAL PRIMARY KEY,
  monitor_id INTEGER NOT NULL UNIQUE,
  friendly_name TEXT NOT NULL,
  url TEXT NOT NULL,
  status INTEGER NOT NULL DEFAULT 1, -- 0=paused, 1=not checked, 2=up, 8=seems down, 9=down
  muted BOOLEAN DEFAULT FALSE,
  muted_until TIMESTAMP,
  mute_reason TEXT,
  last_check TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS uptimerobot_alerts (
  id SERIAL PRIMARY KEY,
  monitor_id INTEGER NOT NULL,
  alert_type TEXT NOT NULL, -- 'down', 'up', 'paused', etc
  status INTEGER NOT NULL,
  reason TEXT,
  timestamp BIGINT NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  job_created INTEGER REFERENCES work(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (monitor_id) REFERENCES uptimerobot_monitors(monitor_id)
);

CREATE INDEX idx_uptimerobot_alerts_monitor ON uptimerobot_alerts(monitor_id);
CREATE INDEX idx_uptimerobot_alerts_processed ON uptimerobot_alerts(processed);
CREATE INDEX idx_uptimerobot_monitors_muted ON uptimerobot_monitors(muted);
