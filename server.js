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

app.use(bodyParser.json({ limit: "15mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "15mb" }));
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
    foto TEXT,
    FOREIGN KEY(karyawan_id) REFERENCES karyawan(id)
  );
`);

// Pastikan kolom foto tersedia jika tabel lama belum memilikinya
try {
  const tableInfo = db.prepare("PRAGMA table_info(absensi)").all();
  if (!tableInfo.some(c => c.name === "foto")) {
    db.exec("ALTER TABLE absensi ADD COLUMN foto TEXT");
  }
} catch (e) {}

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

// 1. LOGIN API
app.post("/api/login", (req, res) => {
  const { id, password } = req.body || {};
  if (!id || !password) {
    return res.status(400).json({ ok: false, success: false, error: "ID dan Password wajib diisi.", message: "ID dan Password wajib diisi." });
  }
  const normalizedId = String(id).toUpperCase().trim();
  const user = db.prepare("SELECT * FROM karyawan WHERE id = ?").get(normalizedId);
  if (user && String(user.password).trim() === String(password).trim()) {
    const userData = {
      id: user.id,
      nama: user.nama,
      name: user.nama,
      role: user.role
    };
    res.json({
      ok: true,
      success: true,
      user: userData,
      data: userData
    });
  } else {
    res.status(401).json({ ok: false, success: false, error: "ID atau Password salah.", message: "ID atau Password salah." });
  }
});

// 2. GANTI PASSWORD MANDIRI
app.post("/api/change-password", (req, res) => {
  const { id, old_password, new_password } = req.body || {};
  if (!id || !old_password || !new_password) {
    return res.status(400).json({ ok: false, success: false, error: "Semua kolom wajib diisi.", message: "Semua kolom wajib diisi." });
  }
  const normalizedId = String(id).toUpperCase().trim();
  const user = db.prepare("SELECT * FROM karyawan WHERE id = ?").get(normalizedId);
  if (!user || String(user.password).trim() !== String(old_password).trim()) {
    return res.status(401).json({ ok: false, success: false, error: "Password lama salah.", message: "Password lama salah." });
  }
  if (String(new_password).trim().length < 4) {
    return res.status(400).json({ ok: false, success: false, error: "Password baru minimal 4 karakter.", message: "Password baru minimal 4 karakter." });
  }
  db.prepare("UPDATE karyawan SET password = ? WHERE id = ?").run(String(new_password).trim(), user.id);
  res.json({ ok: true, success: true, message: "Password berhasil diperbarui." });
});

// 3. ABSENSI API (mendukung selfie foto base64 & geofencing)
const handleAbsen = (req, res) => {
  const body = req.body || {};
  const karyawan_id = body.karyawan_id || body.id;
  const tipe = body.tipe || body.type;
  const latitude = body.latitude !== undefined ? body.latitude : body.lat;
  const longitude = body.longitude !== undefined ? body.longitude : body.lng;
  const jarak_meter = body.jarak_meter !== undefined ? body.jarak_meter : body.distance;
  const keterangan = body.keterangan !== undefined ? body.keterangan : body.note;
  const fotoBase64 = body.foto || body.photo || body.image;
  let status = body.status;

  if (!karyawan_id || !tipe) {
    return res.status(400).json({ ok: false, success: false, error: "Data absensi tidak lengkap (ID dan Tipe wajib).", message: "Data absensi tidak lengkap." });
  }

  // Simpan foto selfie jika ada
  let fotoPath = null;
  if (fotoBase64 && typeof fotoBase64 === "string" && fotoBase64.startsWith("data:image")) {
    try {
      const base64Data = fotoBase64.replace(/^data:image\/\w+;base64,/, "");
      const fileName = `selfie_${karyawan_id}_${Date.now()}.jpg`;
      const uploadDir = path.join(__dirname, "public", "uploads");
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
      fs.writeFileSync(path.join(uploadDir, fileName), base64Data, "base64");
      fotoPath = `/uploads/${fileName}`;
    } catch (photoErr) {
      console.error("Gagal menyimpan foto selfie:", photoErr.message);
    }
  } else if (fotoBase64 && typeof fotoBase64 === "string" && fotoBase64.startsWith("/")) {
    fotoPath = fotoBase64;
  }

  const now = new Date();
  const tanggal = now.toISOString().split("T")[0];
  const waktu = now.toTimeString().split(" ")[0].substring(0, 8);
  const tipeLower = String(tipe).toLowerCase();

  // Evaluasi jam kerja & status
  if (!status) {
    if (tipeLower === "izin" || tipeLower === "sakit" || tipeLower === "cuti") {
      status = tipe.charAt(0).toUpperCase() + tipe.slice(1);
    } else if (jarak_meter !== undefined && jarak_meter !== null && Number(jarak_meter) > 50) {
      status = `Ditolak (Jarak ${Math.round(jarak_meter)}m)`;
    } else {
      // Jam kerja masuk: jam 08:00 WIB (08:00:00)
      if (tipeLower === "masuk") {
        const jam = parseInt(waktu.split(":")[0], 10);
        const menit = parseInt(waktu.split(":")[1], 10);
        if (jam > 8 || (jam === 8 && menit > 15)) {
          const telatMenit = (jam * 60 + menit) - (8 * 60);
          status = `Terlambat (${telatMenit}m)`;
        } else {
          status = "Hadir";
        }
      } else if (tipeLower === "pulang") {
        status = "Pulang";
      } else {
        status = "Hadir";
      }
    }
  }

  db.prepare(`
    INSERT INTO absensi (karyawan_id, tanggal, waktu, tipe, status, latitude, longitude, jarak_meter, keterangan, foto)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(karyawan_id, tanggal, waktu, tipe, status, latitude || null, longitude || null, jarak_meter || null, keterangan || null, fotoPath);

  res.json({
    ok: true,
    success: true,
    message: "Absensi berhasil dicatat.",
    status,
    data: { karyawan_id, tanggal, waktu, tipe, status, jarak_meter, foto: fotoPath }
  });
};

app.post("/api/absen", handleAbsen);
app.post("/api/absensi", handleAbsen);

// 4. RIWAYAT PER KARYAWAN
const handleRiwayat = (req, res) => {
  const id = req.params.karyawan_id || req.query.id;
  if (!id) {
    return res.json({ ok: true, success: true, data: [] });
  }
  const rows = db.prepare("SELECT * FROM absensi WHERE karyawan_id = ? ORDER BY tanggal DESC, waktu DESC").all(id);
  const formatted = rows.map(r => ({
    id: r.id,
    karyawan_id: r.karyawan_id,
    tanggal: r.tanggal,
    date: r.tanggal,
    waktu: r.waktu,
    time: r.waktu,
    tipe: r.tipe,
    type: r.tipe,
    status: r.status,
    latitude: r.latitude,
    longitude: r.longitude,
    jarak_meter: r.jarak_meter,
    distance: r.jarak_meter,
    keterangan: r.keterangan,
    note: r.keterangan,
    foto: r.foto
  }));
  res.json({ ok: true, success: true, data: formatted });
};

app.get("/api/riwayat/:karyawan_id", handleRiwayat);
app.get("/api/riwayat", handleRiwayat);

// 5. REKAP SELURUH KARYAWAN (dengan filter tanggal & status)
const handleRekap = (req, res) => {
  const filterDate = req.query.tanggal || null;
  const filterStatus = req.query.status || null;

  let query = `
    SELECT k.id, k.nama, a.tanggal, a.waktu, a.tipe, a.status, a.jarak_meter, a.keterangan, a.foto
    FROM karyawan k
    LEFT JOIN absensi a ON k.id = a.karyawan_id
  `;
  const params = [];

  if (filterDate) {
    query += " AND a.tanggal = ? ";
    params.push(filterDate);
  } else {
    query += " AND a.tanggal = date('now', 'localtime') ";
  }

  query += " ORDER BY k.id ASC";

  let rows = db.prepare(query).all(...params).map(r => ({
    id: r.id,
    nama: r.nama,
    name: r.nama,
    tanggal: r.tanggal,
    date: r.tanggal,
    waktu: r.waktu,
    time: r.waktu,
    tipe: r.tipe,
    type: r.tipe,
    status: r.status || "Belum Absen",
    jarak_meter: r.jarak_meter,
    distance: r.jarak_meter,
    keterangan: r.keterangan,
    note: r.keterangan,
    foto: r.foto
  }));

  if (filterStatus && filterStatus !== "all") {
    rows = rows.filter(r => r.status.toLowerCase().includes(filterStatus.toLowerCase()));
  }

  if (req.query.format === "array") {
    return res.json(rows);
  }

  res.json({ ok: true, success: true, data: rows });
};

app.get("/api/rekap", handleRekap);
app.get("/api/admin/rekap", handleRekap);

// 6. LIST KARYAWAN
app.get("/api/karyawan", (req, res) => {
  const rows = db.prepare("SELECT id, nama, role FROM karyawan ORDER BY id ASC").all().map(r => ({ ...r, name: r.nama }));
  res.json({ ok: true, success: true, data: rows });
});
app.get("/api/employees", (req, res) => {
  const rows = db.prepare("SELECT id, nama, role FROM karyawan ORDER BY id ASC").all().map(r => ({ ...r, name: r.nama }));
  res.json({ ok: true, success: true, data: rows });
});

// 7. JALANKAN SERVER HTTP (PORT 3005)
http.createServer(app).listen(PORT, "0.0.0.0", () => {
  console.log(`Server Absensi HTTP berjalan di http://0.0.0.0:${PORT}`);
});

// 8. JALANKAN SERVER HTTPS (PORT 3006)
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
