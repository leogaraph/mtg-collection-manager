-- ============================================================
-- MTG Collection Manager — Schema
-- Criado: 2026-06-09
-- Fonte de referência: Scryfall API
-- ============================================================

CREATE DATABASE IF NOT EXISTS mtg_collection
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE mtg_collection;

-- ────────────────────────────────────────────────────────────
-- USERS
-- Cada usuario ve so a propria colecao/decks/partidas. cards/card_faces/
-- card_legalities/tags sao catalogo global, compartilhado por todos.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name          VARCHAR(128),
  is_admin      BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW() ON UPDATE NOW()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ────────────────────────────────────────────────────────────
-- CARDS
-- Representa uma impressão específica de uma carta
-- (set_code + collector_number = impressão única)
-- oracle_id agrupa todas as impressões da mesma carta
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cards (
  id               INT AUTO_INCREMENT PRIMARY KEY,

  -- Identificadores
  scryfall_id      VARCHAR(64) UNIQUE,                 -- ID único Scryfall por impressão
  oracle_id        VARCHAR(64),                        -- Estável entre reprints (mesma carta, edições diferentes)
  arena_id         VARCHAR(64),                        -- ID interno Arena
  mtgo_id          VARCHAR(64),                        -- Magic Online

  -- Nome
  name             VARCHAR(255) NOT NULL,
  flavor_name      VARCHAR(255),                       -- Nome alternativo de arte (ex: "Godzilla" cards)

  -- Custo e mana
  mana_cost        VARCHAR(64),                        -- Ex: "{2}{W}{W}"
  cmc              DECIMAL(5,1),                       -- Converted mana cost (pode ser fracionário)
  colors           VARCHAR(32),                        -- Ex: "W,U" (cores do custo)
  color_identity   VARCHAR(32),                        -- Ex: "W,U,B" (identidade Commander)
  color_indicator  VARCHAR(32),                        -- Para cartas sem custo mas com cor (tokens, DFC faces)
  produced_mana    VARCHAR(32),                        -- Mana que a carta produz (ex: "W,U,B,R,G,C")

  -- Tipo e regras
  type_line        VARCHAR(255),                       -- Ex: "Legendary Creature — Elf Druid"
  oracle_text      TEXT,                               -- Texto de regras oficial
  keywords         JSON,                               -- ["Flying","Trample","Deathtouch"]
  layout           VARCHAR(32) DEFAULT 'normal',       -- normal/transform/modal_dfc/split/adventure/saga/class/battle/flip

  -- Stats de criaturas / planeswalkers / batalhas
  power            VARCHAR(8),                         -- Pode ser "*" ou "1+*"
  toughness        VARCHAR(8),
  loyalty          VARCHAR(8),                         -- Planeswalkers
  defense          VARCHAR(8),                         -- Batalhas (tipo introduzido em 2023)
  hand_modifier    VARCHAR(8),                         -- Vanguard
  life_modifier    VARCHAR(8),                         -- Vanguard

  -- Impressão / edição
  set_code         VARCHAR(8),                         -- Ex: "CMM"
  set_name         VARCHAR(128),                       -- Ex: "Commander Masters"
  collector_number VARCHAR(16),                        -- Ex: "396" ou "396★" (variantes)
  rarity           ENUM('common','uncommon','rare','mythic','special','bonus'),
  released_at      DATE,
  lang             VARCHAR(8) DEFAULT 'en',            -- en, pt, ja, de, etc.

  -- Arte e frame
  artist           VARCHAR(128),
  flavor_text      TEXT,
  image_uri        VARCHAR(512),                       -- URL da imagem normal resolution
  image_uri_large  VARCHAR(512),                       -- URL large
  border_color     VARCHAR(16) DEFAULT 'black',        -- black/borderless/gold/silver/white
  frame            VARCHAR(16),                        -- Versão do frame: "2015", "2003", "future"
  frame_effects    JSON,                               -- ["showcase","extendedart","etched","textured","inverted"]
  full_art         BOOLEAN DEFAULT FALSE,
  watermark        VARCHAR(64),

  -- Disponibilidade física
  finishes         JSON,                               -- ["foil","nonfoil","etched"]
  foil             BOOLEAN DEFAULT FALSE,              -- Existe versão foil
  nonfoil          BOOLEAN DEFAULT TRUE,               -- Existe versão não-foil
  promo            BOOLEAN DEFAULT FALSE,
  reprint          BOOLEAN DEFAULT FALSE,
  digital          BOOLEAN DEFAULT FALSE,              -- Exclusivo digital (Arena/MTGO)
  reserved         BOOLEAN DEFAULT FALSE,              -- Reserved List

  -- Popularidade / ranking
  edhrec_rank      INT,                                -- Rank de uso no Commander (menor = mais popular)
  penny_rank       INT,                                -- Rank Penny Dreadful

  -- Preços (snapshot — atualizado pelo script de sync)
  price_usd        DECIMAL(10,2),
  price_usd_foil   DECIMAL(10,2),
  price_usd_etched DECIMAL(10,2),
  price_eur        DECIMAL(10,2),
  price_eur_foil   DECIMAL(10,2),
  prices_updated_at TIMESTAMP,
  last_synced_at   TIMESTAMP NULL,                    -- Última vez que /api/sync atualizou esta carta
  phash            CHAR(16),                          -- dHash 64-bit (hex) da imagem, p/ scanner de cartas físicas

  created_at       TIMESTAMP DEFAULT NOW(),
  updated_at       TIMESTAMP DEFAULT NOW() ON UPDATE NOW(),

  -- Índices
  INDEX idx_oracle   (oracle_id),
  INDEX idx_set      (set_code, collector_number),
  INDEX idx_arena    (arena_id),
  INDEX idx_rarity   (rarity),
  INDEX idx_cmc      (cmc),
  FULLTEXT INDEX ft_card (name, oracle_text, type_line, flavor_text)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ────────────────────────────────────────────────────────────
-- CARD FACES
-- Faces de cartas double-faced, split, adventure, saga, etc.
-- Só populado quando layout != 'normal'
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS card_faces (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  card_id      INT NOT NULL,
  face_index   TINYINT DEFAULT 0,        -- 0 = frente, 1 = verso
  face_name    VARCHAR(255) NOT NULL,
  mana_cost    VARCHAR(64),
  type_line    VARCHAR(255),
  oracle_text  TEXT,
  keywords     JSON,
  colors       VARCHAR(32),
  power        VARCHAR(8),
  toughness    VARCHAR(8),
  loyalty      VARCHAR(8),
  defense      VARCHAR(8),
  flavor_text  TEXT,
  artist       VARCHAR(128),
  image_uri    VARCHAR(512),

  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
  INDEX idx_card_face (card_id, face_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ────────────────────────────────────────────────────────────
-- CARD LEGALITIES
-- Legalidade por formato (Standard, Pioneer, Modern, Commander...)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS card_legalities (
  card_id  INT NOT NULL,
  format   VARCHAR(32) NOT NULL,         -- standard/pioneer/modern/legacy/vintage/commander/pauper/etc.
  status   ENUM('legal','not_legal','banned','restricted') NOT NULL,
  PRIMARY KEY (card_id, format),
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ────────────────────────────────────────────────────────────
-- COLEÇÃO DIGITAL (Arena / MTGO)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS collection_digital (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  card_id    INT NOT NULL,
  quantity   SMALLINT DEFAULT 1,
  platform   ENUM('arena','mtgo') DEFAULT 'arena',
  updated_at TIMESTAMP DEFAULT NOW() ON UPDATE NOW(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (card_id) REFERENCES cards(id),
  UNIQUE KEY uq_digital (user_id, card_id, platform)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ────────────────────────────────────────────────────────────
-- COLEÇÃO FÍSICA
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS collection_physical (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  user_id         INT NOT NULL,
  card_id         INT NOT NULL,
  quantity        SMALLINT DEFAULT 1,
  `condition`     ENUM('NM','LP','MP','HP','DMG') DEFAULT 'NM',
  finish          ENUM('nonfoil','foil','etched') DEFAULT 'nonfoil',
  lang            VARCHAR(8) DEFAULT 'en',
  frame_treatment VARCHAR(32),           -- showcase, extendedart, borderless, etc.
  notes           TEXT,
  acquired_price  DECIMAL(10,2),         -- Quanto pagou
  acquired_at     DATE,
  updated_at      TIMESTAMP DEFAULT NOW() ON UPDATE NOW(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (card_id) REFERENCES cards(id),
  UNIQUE KEY uq_physical_card (user_id, card_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ────────────────────────────────────────────────────────────
-- TAGS PESSOAIS
-- Ex: #ramp #draw #sacrifice #favorita
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tags (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(64) UNIQUE NOT NULL,
  color       VARCHAR(7),                       -- hex para UI (ex: "#c89b3c")
  is_auto     BOOLEAN DEFAULT FALSE,            -- TRUE = tag calculada (staple/meta), recriada por POST /api/tags/auto
  description VARCHAR(255)                       -- explicação curta (mostrada em tooltip na UI)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- card_tags e' por usuario: cada usuario marca/recalcula suas proprias
-- tags (inclusive as automaticas - "meta" depende dos decks de cada um).
-- A definicao da tag (nome/cor/descricao) continua em `tags`, global.
CREATE TABLE IF NOT EXISTS card_tags (
  user_id INT NOT NULL,
  card_id INT NOT NULL,
  tag_id  INT NOT NULL,
  note    TEXT,                           -- Anotação pessoal sobre a carta nesse contexto
  PRIMARY KEY (user_id, card_id, tag_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id)  REFERENCES tags(id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ────────────────────────────────────────────────────────────
-- DECKS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS decks (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  slug        VARCHAR(64) NOT NULL,          -- Ex: "hapatra", "lorehold" - unico POR USUARIO, nao global
  name        VARCHAR(255),                  -- Nome legível
  format      VARCHAR(32) DEFAULT 'commander',
  commander_id INT,                          -- FK para cards.id do comandante
  color_identity VARCHAR(32),
  platform    ENUM('arena','mtgo','physical','all') DEFAULT 'arena',
  description TEXT,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW() ON UPDATE NOW(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (commander_id) REFERENCES cards(id),
  UNIQUE KEY uq_deck_slug (user_id, slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS deck_cards (
  id       INT AUTO_INCREMENT PRIMARY KEY,
  deck_id  INT NOT NULL,
  card_id  INT NOT NULL,
  quantity SMALLINT DEFAULT 1,
  board    ENUM('main','side','maybe','commander') DEFAULT 'main',
  UNIQUE KEY uq_deck_card_board (deck_id, card_id, board),
  FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE,
  FOREIGN KEY (card_id) REFERENCES cards(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ────────────────────────────────────────────────────────────
-- MATCHES (MTGA Tracker)
-- Histórico de partidas do Arena, capturado do Player.log
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS matches (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  user_id         INT NOT NULL,
  arena_match_id  VARCHAR(64) UNIQUE,        -- ID do Arena, globalmente unico (nao precisa escopo por usuario)
  deck_id         INT NULL,                  -- detectado por overlap com deck_cards; NULL se não identificado
  opponent_name   VARCHAR(128),
  started_at      DATETIME,
  ended_at        DATETIME NULL,
  result          ENUM('win','loss','draw','in_progress') DEFAULT 'in_progress',
  event_name      VARCHAR(64),               -- ex: Play_Brawl_Historic (InternalEventName do log)
  commander_name  VARCHAR(128),              -- comandante da partida (Brawl/Commander), se houver
  total_turns     INT,                       -- numero de turnos ao final da partida
  on_play         BOOLEAN,                   -- true se jogou primeiro
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (deck_id) REFERENCES decks(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ────────────────────────────────────────────────────────────
-- SYNC LOG (MTGA Tracker)
-- Linhas de progresso postadas pelo mtga-tracker durante --history,
-- exibidas na UI ao clicar em "Sincronizar"
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_log (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  created_at TIMESTAMP DEFAULT NOW(),
  message    VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
