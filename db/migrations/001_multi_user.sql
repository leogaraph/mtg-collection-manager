-- ============================================================
-- Migration 001: multi-usuario
-- Aplica num banco existente (single-user) o schema multi-conta.
-- Backfilla todos os dados existentes para um unico usuario "legado".
--
-- Uso:
--   1. Crie a conta real via POST /api/auth/register e anote o id retornado
--   2. Troque os "2" abaixo pelo id real (busca/substitui rapido) OU rode
--      em uma sessao com SET @LEGACY_USER_ID e adapte os UPDATEs (MySQL
--      nao aceita variavel de sessao em ALTER, so em UPDATE/SELECT, por
--      isso o valor esta hardcoded nas linhas UPDATE abaixo)
--   3. docker exec -i <container_db> mysql -u<user> -p<pass> <database> < 001_multi_user.sql
--
-- IMPORTANTE: a ordem das operacoes evita o erro
-- "Cannot drop index 'X': needed in a foreign key constraint" — sempre
-- crie um indice simples na coluna referenciada pela FK (card_id) ANTES
-- de soltar o indice antigo que a sustentava.
-- ============================================================

-- ── collection_digital ──────────────────────────────────────
ALTER TABLE collection_digital ADD COLUMN user_id INT NULL AFTER id;
UPDATE collection_digital SET user_id = 2 WHERE user_id IS NULL;
ALTER TABLE collection_digital MODIFY user_id INT NOT NULL;
ALTER TABLE collection_digital ADD INDEX idx_coldig_card (card_id);
ALTER TABLE collection_digital DROP INDEX uq_digital;
ALTER TABLE collection_digital ADD UNIQUE KEY uq_digital (user_id, card_id, platform);
ALTER TABLE collection_digital ADD CONSTRAINT fk_coldig_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- ── collection_physical ─────────────────────────────────────
ALTER TABLE collection_physical ADD COLUMN user_id INT NULL AFTER id;
UPDATE collection_physical SET user_id = 2 WHERE user_id IS NULL;
ALTER TABLE collection_physical MODIFY user_id INT NOT NULL;
ALTER TABLE collection_physical ADD INDEX idx_colphys_card (card_id);
ALTER TABLE collection_physical DROP INDEX uq_physical_card;
ALTER TABLE collection_physical ADD UNIQUE KEY uq_physical_card (user_id, card_id);
ALTER TABLE collection_physical ADD CONSTRAINT fk_colphys_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- ── decks (slug nao tinha FK dependendo do indice, drop direto funciona) ──
ALTER TABLE decks ADD COLUMN user_id INT NULL AFTER id;
UPDATE decks SET user_id = 2 WHERE user_id IS NULL;
ALTER TABLE decks MODIFY user_id INT NOT NULL;
ALTER TABLE decks ADD UNIQUE KEY uq_deck_slug (user_id, slug);
ALTER TABLE decks DROP INDEX slug;
ALTER TABLE decks ADD CONSTRAINT fk_decks_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- ── card_tags (troca a PRIMARY KEY) ─────────────────────────
ALTER TABLE card_tags ADD COLUMN user_id INT NULL AFTER tag_id;
UPDATE card_tags SET user_id = 2 WHERE user_id IS NULL;
ALTER TABLE card_tags MODIFY user_id INT NOT NULL;
ALTER TABLE card_tags ADD INDEX idx_cardtags_card (card_id);
ALTER TABLE card_tags DROP PRIMARY KEY;
ALTER TABLE card_tags ADD PRIMARY KEY (user_id, card_id, tag_id);
ALTER TABLE card_tags ADD CONSTRAINT fk_cardtags_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- ── matches (sem FK na coluna antiga, direto) ───────────────
ALTER TABLE matches ADD COLUMN user_id INT NULL AFTER id;
UPDATE matches SET user_id = 2 WHERE user_id IS NULL;
ALTER TABLE matches MODIFY user_id INT NOT NULL;
ALTER TABLE matches ADD CONSTRAINT fk_matches_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
