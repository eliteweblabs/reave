-- Allow client portal uploads in project_files.source

ALTER TABLE project_files DROP CONSTRAINT IF EXISTS project_files_source_check;
ALTER TABLE project_files ADD CONSTRAINT project_files_source_check
  CHECK (source IN ('chat', 'admin', 'agent', 'email', 'client'));
