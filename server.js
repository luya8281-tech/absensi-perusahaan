const express = require('express');
const Database = require('better-sqlite3');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3005;

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const db = new Database(path.join(__dirname, 'absensi.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS karyawan (
    id TEXT PRIMARY KEY,
    nama TEXT NOT NULL,
    password TEXT NOT NULL DEFAULT '123456',
    role TEXT NOT NULL DEFAULT 'karyawan'
  );
  CREATE TABLE IF NOT EXISTS absensi (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    karyawan_id TEXT NOT NULL,
    tanggal TEXT NOT NULL,
    waktu TEXT NOT NULL,
    tipe TEXT NOT NULL,
    status TEXT NOT NULL,
    latitude REAL,
    longitude REAL,
    jarak_meter REAL,
    keterangan TEXT,
    FOREIGN KEY(karyawan_id) REFERENCES karyawan(id)
  );
`);

const countStmt = db.prepare('SELECT COUNT(*) as total FROM karyawan');
if (countStmt.get().total === 0) {
  const insertStmt = db.prepare('INSERT INTO karyawan (id, nama, password, role) VALUES (?, ?, ?, ?)');
  const seedData = [
    ['EMP-001', 'Daman Huri'], ['EMP-002', 'Nanang Wahyudin'], ['EMP-003', 'Lisa'],
    ['EMP-004', 'Rustam'], ['EMP-005', 'Yulianti'], ['EMP-006', 'Kalwani'],
    ['EMP-007', 'Suganda'], ['EMP-008', 'Siti Rokhmah'], ['EMP-009', 'Nining Yuniawati'],
    ['EMP-010', 'Jelita Amelia'], ['EMP-011', 'Suntiyah'], ['EMP-012', 'Nurul Komariyah'],
    ['EMP-013', 'Muhamad Sahroni'], ['EMP-014', 'Sadiyah'], ['EMP-015', 'Agisni'],
    ['EMP-016', 'Nurasiyah'], ['EMP-017', 'Ciliwung'], ['EMP-018', 'Nari Susanti'],
    ['EMP-019', 'Zaenal Muttaqin'], ['EMP-020', 'Maryati'], ['EMP-021', 'Toyibah'],
    ['EMP-022', 'Dede Sumarna'], ['EMP-023', 'Jahro Chatur Ningsih'], ['EMP-024', 'Mursad'],
    ['EMP-025', 'Jamad'], ['EMP-026', 'Rosita'], ['EMP-027', 'Arkani'],
    ['EMP-028', 'Nazri Syahlan Mughofar'], ['EMP-029', 'Suherni'], ['EMP-030', 'Hapip'],
    ['EMP-031', 'Sunandar'], ['EMP-032', 'Satian'], ['EMP-033', 'Marsonah'],
    ['EMP-034', 'Junedi B.Salim'], ['EMP-035', 'Siti Nur Alyanti'], ['EMP-036', 'M.Irfan Alfiansyah'],
    ['EMP-037', 'Mursinah'], ['EMP-038', 'Rohman'], ['EMP-039', 'Sulkah'],
    ['EMP-040', 'Zakiyah Safara'], ['EMP-041', 'Sabika Amanah'], ['EMP-042', 'Muhamad Al Fadli'],
    ['EMP-043', 'AGUS YAHRI'], ['EMP-044', 'M. Rahman'], ['EMP-045', 'Karinah'],
    ['EMP-046', 'Siti Soleha'], ['EMP-047', 'MUHAMAD TOHIR'], ['EMP-048', 'Nopitasari'],
    ['EMP-049', 'Kamsin']
  ];
  const insertMany = db.transaction((data) => {
    for (const item of data) {
      const role = item[0] === 'EMP-001' ? 'admin' : 'karyawan';
      insertStmt.run(item[0], item[1], '123456', role);
    }
  });
  insertMany(seedData);
}

app.post('/api/login', (req, res) => {
  const { id, password } = req.body;
  const stmt = db.prepare('SELECT * FROM karyawan WHERE id = ? AND password = ?');
  const user = stmt.get(id.toUpperCase(), password);
  if (user) {
    res.json({ success: true, data: { id: user.id, nama: user.nama, role: user.role } });
  } else {
    res.status(401).json({ success: false, message: 'ID atau Password salah.' });
  }
});

app.post('/api/absensi', (req, res) => {
  const { karyawan_id, tipe, latitude, longitude, jarak_meter, keterangan } = req.body;
  const now = new Date();
  const tanggal = now.toISOString().split('T')[0];
  const waktu = now.toTimeString().split(' ')[0].substring(0, 5);
  let status = tipe;
  if ((tipe === 'masuk' || tipe === 'pulang') && jarak_meter !== undefined) {
    status = jarak_meter <= 50 ? 'Hadir' : 'Ditolak (Di Luar Radius)';
  }
  const stmt = db.prepare('INSERT INTO absensi (karyawan_id, tanggal, waktu, tipe, status, latitude, longitude, jarak_meter, keterangan) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  stmt.run(karyawan_id, tanggal, waktu, tipe, status, latitude || null, longitude || null, jarak_meter || null, keterangan || null);
  res.json({ success: true, message: 'Absensi berhasil dicatat dengan status: ' + status });
});

app.get('/api/admin/rekap', (req, res) => {
  const rows = db.prepare('SELECT k.id, k.nama, a.tanggal, a.waktu, a.tipe, a.status, a.jarak_meter, a.keterangan FROM karyawan k LEFT JOIN absensi a ON k.id = a.karyawan_id ORDER BY a.tanggal DESC, a.waktu DESC').all();
  res.json(rows);
});

app.get('/api/karyawan', (req, res) => {
  const rows = db.prepare('SELECT id, nama, role FROM karyawan ORDER BY id ASC').all();
  res.json(rows);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('Server absensi berjalan di http://0.0.0.0:' + PORT);
});
