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

module.exports = db;
