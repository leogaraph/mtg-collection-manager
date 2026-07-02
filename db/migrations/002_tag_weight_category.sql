-- Adiciona peso por associacao carta-tag e categoria/namespace na definicao
-- da tag. Necessario para diferenciar sinal de sinergia real (ex: tags de
-- arquetipo/funcao, peso 100) de tags "goodstuff" que nao indicam sinergia
-- tematica com o deck (staple/meta, peso baixo) no calculo de /tag-suggestions.
-- Aplicar manualmente: docker exec -i <container_mysql> mysql -u root -p mtg_collection < db/migrations/002_tag_weight_category.sql
ALTER TABLE card_tags ADD COLUMN weight TINYINT UNSIGNED NOT NULL DEFAULT 100 AFTER tag_id;
ALTER TABLE tags ADD COLUMN category VARCHAR(32) NULL AFTER is_auto;
