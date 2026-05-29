CREATE DATABASE IF NOT EXISTS lucky_reels
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE lucky_reels;

CREATE TABLE IF NOT EXISTS players (
  id            CHAR(36)     NOT NULL PRIMARY KEY,
  name          VARCHAR(20)  NOT NULL,
  password_hash VARCHAR(60)  NOT NULL,
  tokens        INT          NOT NULL DEFAULT 0,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_name (name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS spin_logs (
  id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  player_id   CHAR(36)     NOT NULL,
  machine_num TINYINT      NOT NULL,
  symbols     VARCHAR(40)  NOT NULL,
  bet         INT          NOT NULL,
  win_amount  INT          NOT NULL,
  spin_type   VARCHAR(10)  NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_player_time (player_id, created_at),
  CONSTRAINT fk_spin_player FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS bj_logs (
  id           BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  player_id    CHAR(36)     NOT NULL,
  result       VARCHAR(15)  NOT NULL,
  player_cards VARCHAR(120) NOT NULL,
  dealer_cards VARCHAR(120) NOT NULL,
  bet          INT          NOT NULL,
  net          INT          NOT NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_bj_player_time (player_id, created_at),
  CONSTRAINT fk_bj_player FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS roulette_logs (
  id         BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  player_id  CHAR(36)    NOT NULL,
  win_num    VARCHAR(3)  NOT NULL,
  total_bet  INT         NOT NULL,
  net        INT         NOT NULL,
  created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_rl_player_time (player_id, created_at),
  CONSTRAINT fk_rl_player FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS horse_logs (
  id           BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  player_id    CHAR(36)     NOT NULL,
  winner_name  VARCHAR(30)  NOT NULL,
  picked_name  VARCHAR(30)  NOT NULL,
  bet          INT          NOT NULL,
  net          INT          NOT NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_hl_player_time (player_id, created_at),
  CONSTRAINT fk_hl_player FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS baccarat_logs (
  id           BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  player_id    CHAR(36)     NOT NULL,
  bet_type     VARCHAR(10)  NOT NULL,
  outcome      VARCHAR(10)  NOT NULL,
  player_hand  VARCHAR(60)  NOT NULL,
  banker_hand  VARCHAR(60)  NOT NULL,
  bet          INT          NOT NULL,
  net          INT          NOT NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_bac_player_time (player_id, created_at),
  CONSTRAINT fk_bac_player FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS admins (
  id            INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(40)  NOT NULL,
  password_hash VARCHAR(60)  NOT NULL,
  UNIQUE KEY uq_username (username)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sessions (
  token      CHAR(36)  NOT NULL PRIMARY KEY,
  player_id  CHAR(36)  NOT NULL,
  created_at DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_sess_player (player_id),
  CONSTRAINT fk_sess_player FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS admin_logs (
  id         BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  admin_user VARCHAR(40)  NOT NULL,
  action     VARCHAR(30)  NOT NULL,
  target_id  CHAR(36)     NULL,
  detail     VARCHAR(255) NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_admin_time (admin_user, created_at)
) ENGINE=InnoDB;
