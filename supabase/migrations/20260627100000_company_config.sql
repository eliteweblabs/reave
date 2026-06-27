-- Organization branding (single-tenant; edited from /admin/profile).
CREATE TABLE IF NOT EXISTS company_config (
  id              INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name            TEXT,
  legal_name      TEXT,
  description     TEXT,
  domain          TEXT,
  support_email   TEXT,
  from_email      TEXT,
  logo_path       TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO company_config (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;
