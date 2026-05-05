-- Run on the production PostgreSQL server as an admin user.
-- Adjust passwords and CIDR ranges outside this file before applying.

CREATE ROLE zwitter_app LOGIN PASSWORD 'change-me' CONNECTION LIMIT 40;
CREATE DATABASE zwitter OWNER zwitter_app;

\connect zwitter

ALTER DATABASE zwitter SET log_min_duration_statement = '250ms';
ALTER DATABASE zwitter SET idle_in_transaction_session_timeout = '30s';
ALTER DATABASE zwitter SET statement_timeout = '15s';
ALTER DATABASE zwitter SET lock_timeout = '5s';

CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

GRANT CONNECT ON DATABASE zwitter TO zwitter_app;
GRANT USAGE ON SCHEMA public TO zwitter_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO zwitter_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO zwitter_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO zwitter_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO zwitter_app;

-- Recommended server-level settings for a small 500-2000 online deployment:
-- max_connections = 100
-- shared_preload_libraries = 'pg_stat_statements'
-- pg_stat_statements.track = all
-- track_io_timing = on
-- log_min_duration_statement = 250ms
-- log_lock_waits = on
-- autovacuum = on
