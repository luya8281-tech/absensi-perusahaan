const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'absensi.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'karyawan'
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id TEXT NOT NULL,
    date TEXT NOT NULL,
    time_in TEXT,
    time_out TEXT,
    status TEXT NOT NULL DEFAULT 'Hadir',
    latitude REAL,
    longitude REAL,
    notes TEXT,
    FOREIGN KEY(employee_id) REFERENCES users(employee_id)
  );
`);

module.exports = db;
