const express = require("express");
const Database = require("better-sqlite3");
const bodyParser = require("body-parser");
const path = require("path");
const https = require("https");
const http = require("http");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3005;
const HTTPS_PORT = process.env.HTTPS_PORT || 3006;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public"), {
  etag: false,
  lastModified: false,
  setHeaders: (res) => res.set("Cache-Control", "no-store")
}));

const db = new Database(path.join(__dirname, "absensi.db"));
db.pragma("journal_mode = WAL");

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

const countStmt = db.prepare("SELECT COUNT(*) as total FROM karyawan");
if (countStmt.get().total === 0) {
  const insertStmt = db.prepare("INSERT INTO karyawan (id, nama, password, role) VALUES (?, ?, ?, ?)");
  const seedData = [
    ["EMP-001", "Daman Huri"], ["EMP-002", "Nanang Wahyudin"], ["EMP-003", "Lisa"],
    ["EMP-004", "Rustam"], ["EMP-005", "Yulianti"], ["EMP-006", "Kalwani"],
    ["EMP-007", "Suganda"], ["EMP-008", "Siti Rokhmah"], ["EMP-009", "Nining Yuniawati"],
    ["EMP-010", "Jelita Amelia"], ["EMP-011", "Suntiyah"], ["EMP-012", "Nurul Komariyah"],
    ["EMP-013", "Muhamad Sahroni"], ["EMP-014", "Sadiyah"], ["EMP-015", "Agisni"],
    ["EMP-016", "Nurasiyah"], ["EMP-017", "Ciliwung"], ["EMP-018", "Nari Susanti"],
    ["EMP-019", "Zaenal Muttaqin"], ["EMP-020", "Maryati"], ["EMP-021", "Toyibah"],
    ["EMP-022", "Dede Sumarna"], ["EMP-023", "Jahro Chatur Ningsih"], ["EMP-024", "Mursad"],
    ["EMP-025", "Jamad"], ["EMP-026", "Rosita"], ["EMP-027", "Arkani"],
    ["EMP-028", "Nazri Syahlan Mughofar"], ["EMP-029", "Suherni"], ["EMP-030", "Hapip"],
    ["EMP-031", "Sunandar"], ["EMP-032", "Satian"], ["EMP-033", "Marsonah"],
    ["EMP-034", "Junedi B.Salim"], ["EMP-035", "Siti Nur Alyanti"], ["EMP-036", "M.Irfan Alfiansyah"],
    ["EMP-037", "Mursinah"], ["EMP-038", "Rohman"], ["EMP-039", "Sulkah"],
    ["EMP-040", "Zakiyah Safara"], ["EMP-041", "Sabika Amanah"], ["EMP-042", "Muhamad Al Fadli"],
    ["EMP-043", "AGUS YAHRI"], ["EMP-044", "M. Rahman"], ["EMP-045", "Karinah"],
    ["EMP-046", "Siti Soleha"], ["EMP-047", "MUHAMAD TOHIR"], ["EMP-048", "Nopitasari"],
    ["EMP-049", "Kamsin"]
  ];
  const insertMany = db.transaction((data) => {
    for (const item of data) {
      const role = item[0] === "EMP-001" ? "admin" : "karyawan";
      insertStmt.run(item[0], item[1], "123456", role);
    }
  });
  insertMany(seedData);
}

// 1. LOGIN API (mendukung user dan data untuk kompatibilitas penuh)
app.post("/api/login", (req, res) => {
  const { id, password } = req.body || {};
  if (!id || !password) {
    return res.status(400).json({ success: false, message: "ID dan Password wajib diisi." });
  }
  const normalizedId = String(id).toUpperCase().trim();
  const user = db.prepare("SELECT * FROM karyawan WHERE id = ?").get(normalizedId);
  if (user && String(user.password) === String(password).trim()) {
    const userData = { id: user.id, nama: user.nama, role: user.role };
    res.json({ success: true, user: userData, data: userData });
  } else {
    res.status(401).json({ success: false, message: "ID atau Password salah." });
  }
});

// 2. ABSENSI API (mendukung /api/absen dan /api/absensi)
const handleAbsen = (req, res) => {
  const { karyawan_id, tipe, latitude, longitude, keterangan } = req.body || {};
  let status = req.body ? req.body.status : null;
  let jarak_meter = req.body ? req.body.jarak_meter : null;

  if (!karyawan_id || !tipe) {
    return res.status(400).json({ success: false, message: "Data absensi tidak lengkap (karyawan_id dan tipe wajib)." });
  }

  if (!status) {
    if (tipe === "izin" || tipe === "sakit" || tipe === "cuti") {
      status = tipe.charAt(0).toUpperCase() + tipe.slice(1);
    } else if (jarak_meter !== undefined && jarak_meter !== null) {
      status = Number(jarak_meter) <= 50 ? "Hadir" : `Ditolak (Jarak ${Math.round(jarak_meter)}m)`;
    } else {
      status = "Hadir";
    }
  }

  const now = new Date();
  const tanggal = now.toISOString().split("T")[0];
  const waktu = now.toTimeString().split(" ")[0].substring(0, 8);

  db.prepare(`
    INSERT INTO absensi (karyawan_id, tanggal, waktu, tipe, status, latitude, longitude, jarak_meter, keterangan)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(karyawan_id, tanggal, waktu, tipe, status, latitude || null, longitude || null, jarak_meter || null, keterangan || null);

  res.json({ success: true, message: "Absensi berhasil dicatat.", status, data: { karyawan_id, tanggal, waktu, tipe, status, jarak_meter } });
};

app.post("/api/absen", handleAbsen);
app.post("/api/absensi", handleAbsen);

// 3. RIWAYAT PER KARYAWAN
app.get("/api/riwayat/:karyawan_id", (req, res) => {
  const { karyawan_id } = req.params;
  const rows = db.prepare("SELECT * FROM absensi WHERE karyawan_id = ? ORDER BY tanggal DESC, waktu DESC").all(karyawan_id);
  res.json({ success: true, data: rows });
});

// 4. REKAP SELURUH KARYAWAN (mengembalikan array agar kompatibel dengan .map() dan .filter())
const handleRekap = (req, res) => {
  const rows = db.prepare(`
    SELECT k.id, k.nama, a.tanggal, a.waktu, a.tipe, a.status, a.jarak_meter, a.keterangan
    FROM karyawan k
    LEFT JOIN absensi a ON k.id = a.karyawan_id
    ORDER BY a.tanggal DESC, a.waktu DESC
  `).all();
  res.json(rows);
};

app.get("/api/rekap", handleRekap);
app.get("/api/admin/rekap", handleRekap);

// 5. LIST KARYAWAN
app.get("/api/karyawan", (req, res) => {
  const rows = db.prepare("SELECT id, nama, role FROM karyawan ORDER BY id ASC").all();
  res.json(rows);
});

// 6. JALANKAN SERVER HTTP (PORT 3005)
http.createServer(app).listen(PORT, "0.0.0.0", () => {
  console.log(`Server Absensi HTTP berjalan di http://0.0.0.0:${PORT}`);
});

// 7. JALANKAN SERVER HTTPS (PORT 3006) JIKA SERTIFIKAT TERSEDIA
try {
  const keyPath = path.join(__dirname, "key.pem");
  const certPath = path.join(__dirname, "cert.pem");
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    const credentials = {
      key: fs.readFileSync(keyPath, "utf8"),
      cert: fs.readFileSync(certPath, "utf8")
    };
    https.createServer(credentials, app).listen(HTTPS_PORT, "0.0.0.0", () => {
      console.log(`Server Absensi HTTPS berjalan di https://0.0.0.0:${HTTPS_PORT}`);
    });
  }
} catch (err) {
  console.error("Gagal menjalankan server HTTPS:", err.message);
}
