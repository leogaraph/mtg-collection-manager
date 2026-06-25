-- Adiciona a coluna is_admin para instalacoes existentes (schema.sql so
-- roda no primeiro init do container MySQL via docker-entrypoint-initdb.d).
-- Aplicar manualmente: docker exec -i <container_mysql> mysql -u root -p mtg_collection < db/migrations/001_add_is_admin.sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
