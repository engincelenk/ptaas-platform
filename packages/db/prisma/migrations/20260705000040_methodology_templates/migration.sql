-- M40: Pentest Methodology Templates
-- Adds Methodology, MethodologyCheck, MethodologyAssignment, MethodologyProgress tables

CREATE TABLE IF NOT EXISTS methodologies (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  preset          TEXT NOT NULL DEFAULT 'CUSTOM',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_methodologies_org ON methodologies(organization_id);

CREATE TABLE IF NOT EXISTS methodology_checks (
  id             TEXT PRIMARY KEY,
  methodology_id TEXT NOT NULL REFERENCES methodologies(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  description    TEXT,
  category       TEXT NOT NULL DEFAULT 'General',
  sort_order     INT  NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_methodology_checks_method ON methodology_checks(methodology_id);

CREATE TABLE IF NOT EXISTS methodology_assignments (
  id              TEXT PRIMARY KEY,
  methodology_id  TEXT NOT NULL REFERENCES methodologies(id) ON DELETE CASCADE,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL,
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(methodology_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_methodology_assignments_project ON methodology_assignments(project_id);

CREATE TABLE IF NOT EXISTS methodology_progress (
  id              TEXT PRIMARY KEY,
  assignment_id   TEXT NOT NULL REFERENCES methodology_assignments(id) ON DELETE CASCADE,
  check_id        TEXT NOT NULL REFERENCES methodology_checks(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL,
  completed       BOOLEAN NOT NULL DEFAULT FALSE,
  notes           TEXT,
  completed_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  completed_at    TIMESTAMPTZ,
  UNIQUE(assignment_id, check_id)
);

CREATE INDEX IF NOT EXISTS idx_methodology_progress_assignment ON methodology_progress(assignment_id);
