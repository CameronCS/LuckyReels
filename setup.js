/**
 * Lucky Reels — one-time setup script
 *
 * Usage:
 *   node setup.js <db-user> <db-pass> <admin-username> <admin-password>
 *
 * Example:
 *   node setup.js root mydbpass admin supersecret123
 *
 * This will:
 *   1. Create the lucky_reels database (if it doesn't exist)
 *   2. Create all required tables
 *   3. Create (or update) the admin account
 */

'use strict';
require('dotenv').config();
const mysql  = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function main() {
  const [dbUser, dbPass, adminUser, adminPass] = process.argv.slice(2);

  if (!dbUser || !adminUser || !adminPass) {
    console.error('Usage: node setup.js <db-user> <db-pass> <admin-username> <admin-password>');
    console.error('Example: node setup.js root "" admin mypassword');
    process.exit(1);
  }

  if (adminPass.length < 6) {
    console.error('Admin password must be at least 6 characters.');
    process.exit(1);
  }

  const con = await mysql.createConnection({
    host:               process.env.DB_HOST || 'localhost',
    user:               dbUser,
    password:           dbPass || '',
    multipleStatements: true,
  });

  console.log('Connected to MySQL.');

  // ── Create database + tables ───────────────────────────────────────
  await con.query(`
    CREATE DATABASE IF NOT EXISTS lucky_reels
      CHARACTER SET utf8mb4
      COLLATE utf8mb4_unicode_ci;
  `);
  await con.query('USE lucky_reels;');

  await con.query(`
    CREATE TABLE IF NOT EXISTS players (
      id            CHAR(36)     NOT NULL PRIMARY KEY,
      name          VARCHAR(20)  NOT NULL,
      password_hash VARCHAR(60)  NOT NULL,
      tokens        INT          NOT NULL DEFAULT 0,
      created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_name (name)
    ) ENGINE=InnoDB;
  `);

  await con.query(`
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
  `);

  await con.query(`
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
  `);

  await con.query(`
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
  `);

  await con.query(`
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
  `);

  await con.query(`
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
  `);

  await con.query(`
    CREATE TABLE IF NOT EXISTS plinko_logs (
      id          BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
      player_id   CHAR(36)      NOT NULL,
      bet         INT           NOT NULL,
      risk        VARCHAR(8)    NOT NULL,
      slot        INT           NOT NULL,
      multiplier  DECIMAL(8,2)  NOT NULL,
      net         INT           NOT NULL,
      created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_pl_player_time (player_id, created_at),
      CONSTRAINT fk_pl_player FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  await con.query(`
    CREATE TABLE IF NOT EXISTS crash_logs (
      id            BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
      player_id     CHAR(36)      NOT NULL,
      bet           INT           NOT NULL,
      crash_point   DECIMAL(10,2) NOT NULL,
      cashout_mult  DECIMAL(10,2) NULL,
      net           INT           NOT NULL,
      outcome       VARCHAR(12)   NOT NULL,
      created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_cr_player_time (player_id, created_at),
      CONSTRAINT fk_cr_player FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  await con.query(`
    CREATE TABLE IF NOT EXISTS mines_logs (
      id             BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
      player_id      CHAR(36)    NOT NULL,
      bet            INT         NOT NULL,
      mine_count     INT         NOT NULL,
      cells_revealed INT         NOT NULL,
      net            INT         NOT NULL,
      outcome        VARCHAR(12) NOT NULL,
      created_at     DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_mn_player_time (player_id, created_at),
      CONSTRAINT fk_mn_player FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  await con.query(`
    CREATE TABLE IF NOT EXISTS admins (
      id            INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
      username      VARCHAR(40)  NOT NULL,
      password_hash VARCHAR(60)  NOT NULL,
      UNIQUE KEY uq_username (username)
    ) ENGINE=InnoDB;
  `);

  await con.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      token      CHAR(36)  NOT NULL PRIMARY KEY,
      player_id  CHAR(36)  NOT NULL,
      created_at DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_sess_player (player_id),
      CONSTRAINT fk_sess_player FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  await con.query(`
    CREATE TABLE IF NOT EXISTS admin_logs (
      id         BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
      admin_user VARCHAR(40)  NOT NULL,
      action     VARCHAR(30)  NOT NULL,
      target_id  CHAR(36)     NULL,
      detail     VARCHAR(255) NULL,
      created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_admin_time (admin_user, created_at)
    ) ENGINE=InnoDB;
  `);

  console.log('Tables ready.');

  // ── Create / update admin account ──────────────────────────────────
  const hash = await bcrypt.hash(adminPass, 10);
  await con.query(
    `INSERT INTO admins (username, password_hash)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
    [adminUser, hash]
  );

  console.log(`\n✓ Admin account "${adminUser}" created/updated.`);
  console.log('\nStart the server with these environment variables set:');
  console.log(`  DB_USER=${dbUser}`);
  console.log(`  DB_PASS=${dbPass || '(empty)'}`);
  console.log('  DB_HOST=localhost');
  console.log('  DB_NAME=lucky_reels');
  console.log('\nOr just run: node server.js  (uses those defaults)\n');

  await con.end();
}

main().catch(err => {
  console.error('\nSetup failed:', err.message);
  process.exit(1);
});
