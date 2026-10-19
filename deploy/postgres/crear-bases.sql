-- Usuarios y bases de ToolTracker (como postgres):
--   sudo -u postgres psql -v ON_ERROR_STOP=1 -v prod_pw="'<clave-prod>'" -v dev_pw="'<clave-dev>'" -f crear-bases.sql
-- Cada usuario es dueño solo de su base; ninguno es superusuario ni puede crear bases o roles.
-- Idempotente: no cambia la clave de un usuario que ya existe.

SELECT 'CREATE ROLE tt_prod LOGIN PASSWORD ' || :prod_pw
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tt_prod') \gexec
SELECT 'CREATE ROLE tt_dev LOGIN PASSWORD ' || :dev_pw
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tt_dev') \gexec

SELECT 'CREATE DATABASE tooltracker_prod OWNER tt_prod ENCODING ''UTF8'' TEMPLATE template0'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'tooltracker_prod') \gexec
SELECT 'CREATE DATABASE tooltracker_dev OWNER tt_dev ENCODING ''UTF8'' TEMPLATE template0'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'tooltracker_dev') \gexec

-- Nadie más que su dueño se conecta a cada base.
REVOKE CONNECT, TEMPORARY ON DATABASE tooltracker_prod FROM PUBLIC;
REVOKE CONNECT, TEMPORARY ON DATABASE tooltracker_dev FROM PUBLIC;
