'use strict';
const mysql = require('mysql2/promise');

const db = mysql.createPool({
  host:               process.env.DB_HOST || 'localhost',
  user:               process.env.DB_USER || 'root',
  password:           process.env.DB_PASS || '',
  database:           process.env.DB_NAME || 'lucky_reels',
  waitForConnections: true,
  connectionLimit:    10,
  timezone:           'Z',
});

// Runs fn(conn) inside a transaction — commits on success, rolls back on error
db.withTransaction = async function(fn) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

module.exports = db;
