const express = require("express");
const Database = require("better-sqlite3");
const bodyParser = require("body-parser");
const path = require("path");
const https = require("https");
const http = require("http");
const fs = require("fs");
const crypto = require("crypto");

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

// Inisialisasi Tabel & Skema Basis Data
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
    cabang_id TEXT,
    shift_id TEXT DEFAULT 'pagi',
    device_id TEXT,
    accuracy REAL,
    is_mock INTEGER DEFAULT 0,
    FOREIGN KEY(karyawan_id) REFERENCES karyawan(id)
  );
  CREATE TABLE IF NOT EXISTS cabang (
    id TEXT PRIMARY KEY,
    nama TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    radius_meter REAL NOT NULL DEFAULT 50,
    is_active INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS shifts (
    id TEXT PRIMARY KEY,
    nama TEXT NOT NULL,
    jam_masuk TEXT NOT NULL,
    toleransi_menit INTEGER NOT NULL DEFAULT 15,
    jam_pulang TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS kios_tokens (
    token TEXT PRIMARY KEY,
    cabang_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
`);

// Migrasi Kolom Dinamis jika tabel sudah ada sebelumnya
try {
  const tableInfo = db.prepare("PRAGMA table_info(absensi)").all();
  const existingCols = tableInfo.map(c => c.name);
  if (!existingCols.includes("foto")) db.exec("ALTER TABLE absensi ADD COLUMN foto TEXT");
  if (!existingCols.includes("cabang_id")) db.exec("ALTER TABLE absensi ADD COLUMN cabang_id TEXT");
  if (!existingCols.includes("shift_id")) db.exec("ALTER TABLE absensi ADD COLUMN shift_id TEXT DEFAULT 'pagi'");
  if (!existingCols.includes("device_id")) db.exec("ALTER TABLE absensi ADD COLUMN device_id TEXT");
  if (!existingCols.includes("accuracy")) db.exec("ALTER TABLE absensi ADD COLUMN accuracy REAL");
  if (!existingCols.includes("is_mock")) db.exec("ALTER TABLE absensi ADD COLUMN is_mock INTEGER DEFAULT 0");
} catch (e) {
  console.error("Migrasi kolom absensi:", e.message);
}

// Seed Cabang Kantor Default
const countCabang = db.prepare("SELECT COUNT(*) as total FROM cabang").get();
if (countCabang.total === 0) {
  const insertCabang = db.prepare("INSERT INTO cabang (id, nama, latitude, longitude, radius_meter, is_active) VALUES (?, ?, ?, ?, ?, ?)");
  insertCabang.run("CAB-01", "Kantor Utama Cipaeh", -6.0935245, 106.3641939, 50, 1);
  insertCabang.run("CAB-02", "Gudang Logistik Onyam", -6.0952000, 106.3658000, 60, 1);
  insertCabang.run("CAB-03", "Pos Jaga Gunung Keler", -6.0918000, 106.3615000, 75, 1);
}

// Seed Shift Kerja Default
const countShifts = db.prepare("SELECT COUNT(*) as total FROM shifts").get();
if (countShifts.total === 0) {
  const insertShift = db.prepare("INSERT INTO shifts (id, nama, jam_masuk, toleransi_menit, jam_pulang) VALUES (?, ?, ?, ?, ?)");
  insertShift.run("pagi", "Shift Pagi", "08:00", 15, "16:00");
  insertShift.run("siang", "Shift Siang", "13:00", 15, "21:00");
  insertShift.run("malam", "Shift Malam", "21:00", 15, "05:00");
}

// Seed Karyawan jika kosong
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

// Fungsi Haversine Formula untuk kalkulasi jarak GPS
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = x => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Helper pengiriman notifikasi ke WhatsApp Bot (Internal Webhook Port 3000)
function sendWaNotification(payload) {
  try {
    const postData = JSON.stringify(payload);
    const req = http.request({
      hostname: "127.0.0.1",
      port: 3000,
      path: "/api/notify-absensi",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData)
      },
      timeout: 3000
    }, () => {});
    req.on("error", () => {});
    req.write(postData);
    req.end();
  } catch (err) {}
}

// Pencadangan Otomatis SQLite (SQLite VACUUM INTO)
function autoBackupDatabase() {
  try {
    const backupsDir = path.join(__dirname, "backups");
    if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
    
    const today = new Date().toISOString().split("T")[0];
    const backupFile = path.join(backupsDir, `absensi_backup_${today}.db`);
    if (!fs.existsSync(backupFile)) {
      db.prepare(`VACUUM INTO '${backupFile}'`).run();
      console.log(`[BACKUP] Basis data berhasil dicadangkan ke: ${backupFile}`);

      // Rotasi backup: Hapus file lebih dari 14 hari
      const files = fs.readdirSync(backupsDir);
      const now = Date.now();
      const maxAgeMs = 14 * 24 * 60 * 60 * 1000;
      for (const f of files) {
        if (f.startsWith("absensi_backup_") && f.endsWith(".db")) {
          const filePath = path.join(backupsDir, f);
          const stat = fs.statSync(filePath);
          if (now - stat.mtimeMs > maxAgeMs) {
            fs.unlinkSync(filePath);
            console.log(`[BACKUP] Menghapus backup usang: ${f}`);
          }
        }
      }
    }
  } catch (err) {
    console.error("[BACKUP] Gagal mencadangkan database:", err.message);
  }
}
autoBackupDatabase();
setInterval(autoBackupDatabase, 6 * 60 * 60 * 1000);

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

// 3. API CABANG KANTOR
app.get("/api/cabang", (req, res) => {
  const rows = db.prepare("SELECT * FROM cabang WHERE is_active = 1 ORDER BY id ASC").all();
  res.json({ ok: true, success: true, data: rows });
});

app.post("/api/cabang", (req, res) => {
  const { id, nama, latitude, longitude, radius_meter } = req.body || {};
  if (!nama || latitude === undefined || longitude === undefined) {
    return res.status(400).json({ ok: false, success: false, error: "Data cabang belum lengkap." });
  }
  const newId = id || `CAB-${Date.now().toString().slice(-4)}`;
  db.prepare("INSERT OR REPLACE INTO cabang (id, nama, latitude, longitude, radius_meter, is_active) VALUES (?, ?, ?, ?, ?, 1)")
    .run(newId, nama, Number(latitude), Number(longitude), Number(radius_meter) || 50);
  res.json({ ok: true, success: true, message: "Cabang berhasil disimpan.", id: newId });
});

// 4. API SHIFT KERJA
app.get("/api/shifts", (req, res) => {
  const rows = db.prepare("SELECT * FROM shifts ORDER BY jam_masuk ASC").all();
  res.json({ ok: true, success: true, data: rows });
});

// 5. API KIOS QR DINAMIS
const QRCode = require("qrcode");

app.get("/api/kios/token", async (req, res) => {
  try {
    const cabang_id = req.query.cabang_id || "CAB-01";
    const now = Date.now();
    const expires_at = now + 35000;
    const token = crypto.randomBytes(16).toString("hex");
    
    // Hapus token lama
    db.prepare("DELETE FROM kios_tokens WHERE expires_at < ?").run(now);
    db.prepare("INSERT INTO kios_tokens (token, cabang_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(token, cabang_id, now, expires_at);
    
    const qrPayload = JSON.stringify({ token, cabang_id, t: now });
    const qrImage = await QRCode.toDataURL(qrPayload, { width: 280, margin: 1 });

    res.json({ ok: true, success: true, token, expires_at, cabang_id, qr_image: qrImage });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/kios/verify", (req, res) => {
  const { token, id, type, shift_id, device_id } = req.body || {};
  if (!token || !id || !type) {
    return res.status(400).json({ ok: false, success: false, error: "Token dan identitas wajib disertakan." });
  }
  const now = Date.now();
  const row = db.prepare("SELECT * FROM kios_tokens WHERE token = ? AND expires_at > ?").get(token, now);
  if (!row) {
    return res.status(400).json({ ok: false, success: false, error: "QR Code Kios kedaluwarsa atau tidak valid. Silakan scan ulang." });
  }
  
  req.body.jarak_meter = 0;
  req.body.cabang_id = row.cabang_id;
  req.body.keterangan = "[Verifikasi Kios QR]";
  return handleAbsen(req, res);
});

// 6. ABSENSI CORE HANDLER
const handleAbsen = (req, res) => {
  const body = req.body || {};
  const karyawan_id = (body.karyawan_id || body.id || "").toUpperCase().trim();
  const tipe = body.tipe || body.type;
  let latitude = body.latitude !== undefined ? body.latitude : body.lat;
  let longitude = body.longitude !== undefined ? body.longitude : body.lng;
  let jarak_meter = body.jarak_meter !== undefined ? body.jarak_meter : body.distance;
  let keterangan = body.keterangan !== undefined ? body.keterangan : body.note;
  const fotoBase64 = body.foto || body.photo || body.image;
  let cabang_id = body.cabang_id || "CAB-01";
  const shift_id = body.shift_id || "pagi";
  const device_id = body.device_id || null;
  const accuracy = body.accuracy !== undefined ? Number(body.accuracy) : null;
  let status = body.status;

  if (!karyawan_id || !tipe) {
    return res.status(400).json({ ok: false, success: false, error: "Data absensi tidak lengkap (ID dan Tipe wajib).", message: "Data absensi tidak lengkap." });
  }

  const user = db.prepare("SELECT nama FROM karyawan WHERE id = ?").get(karyawan_id);
  const employeeName = user ? user.nama : karyawan_id;

  // Cek Cabang Operasional
  let selectedCabang = db.prepare("SELECT * FROM cabang WHERE id = ? AND is_active = 1").get(cabang_id);
  if (!selectedCabang) {
    selectedCabang = db.prepare("SELECT * FROM cabang WHERE is_active = 1 LIMIT 1").get();
    if (selectedCabang) cabang_id = selectedCabang.id;
  }

  // Hitung ulang jarak jika koordinat diberikan dan cabang ditemukan
  if (selectedCabang && latitude !== undefined && longitude !== undefined && (jarak_meter === undefined || jarak_meter === null)) {
    jarak_meter = calculateHaversineDistance(selectedCabang.latitude, selectedCabang.longitude, Number(latitude), Number(longitude));
  }

  // Simpan foto selfie
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

  // Validasi Multi-Device (Mencegah titip absen menggunakan satu ponsel)
  let isMultiDevice = false;
  if (device_id) {
    const otherUsersToday = db.prepare(`
      SELECT DISTINCT karyawan_id FROM absensi 
      WHERE tanggal = ? AND device_id = ? AND karyawan_id != ?
    `).all(tanggal, device_id, karyawan_id);
    if (otherUsersToday.length > 0) {
      isMultiDevice = true;
      const flaggedStr = `[⚠️ Multi-Device: ${otherUsersToday.map(u => u.karyawan_id).join(", ")}]`;
      keterangan = keterangan ? `${keterangan} ${flaggedStr}` : flaggedStr;
    }
  }

  // Validasi Mock GPS / Akurasi Mencurigakan
  let isMock = 0;
  if (accuracy !== null && accuracy > 100 && !body.isFallback) {
    isMock = 1;
    const mockStr = `[⚠️ GPS Rendah: Akurasi ${Math.round(accuracy)}m]`;
    keterangan = keterangan ? `${keterangan} ${mockStr}` : mockStr;
  }

  // Evaluasi Jam Kerja & Status Presensi
  if (!status) {
    if (tipeLower === "izin" || tipeLower === "sakit" || tipeLower === "cuti") {
      status = tipe.charAt(0).toUpperCase() + tipe.slice(1);
    } else {
      const maxRadius = selectedCabang ? selectedCabang.radius_meter : 50;
      if (jarak_meter !== undefined && jarak_meter !== null && Number(jarak_meter) > maxRadius && !body.isFallback) {
        status = `Ditolak (Jarak ${Math.round(jarak_meter)}m)`;
      } else {
        // Ambil aturan shift
        let shift = db.prepare("SELECT * FROM shifts WHERE id = ?").get(shift_id);
        if (!shift) shift = { jam_masuk: "08:00", toleransi_menit: 15, jam_pulang: "16:00" };

        if (tipeLower === "masuk") {
          const [targetJam, targetMenit] = shift.jam_masuk.split(":").map(Number);
          const jam = parseInt(waktu.split(":")[0], 10);
          const menit = parseInt(waktu.split(":")[1], 10);
          const currentMinutes = jam * 60 + menit;
          const targetMinutes = targetJam * 60 + targetMenit;
          const toleranceMinutes = targetMinutes + (shift.toleransi_menit || 15);

          if (currentMinutes > toleranceMinutes) {
            const telatMenit = currentMinutes - targetMinutes;
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
  }

  // Simpan ke SQLite
  db.prepare(`
    INSERT INTO absensi (karyawan_id, tanggal, waktu, tipe, status, latitude, longitude, jarak_meter, keterangan, foto, cabang_id, shift_id, device_id, accuracy, is_mock)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    karyawan_id, tanggal, waktu, tipe, status,
    latitude !== undefined ? Number(latitude) : null,
    longitude !== undefined ? Number(longitude) : null,
    jarak_meter !== undefined ? Number(jarak_meter) : null,
    keterangan || null,
    fotoPath,
    cabang_id,
    shift_id,
    device_id,
    accuracy,
    isMock
  );

  // Trigger Notifikasi Instan ke WhatsApp Bot jika Pengajuan Izin / Sakit / Cuti
  if (tipeLower === "izin" || tipeLower === "sakit" || tipeLower === "cuti") {
    sendWaNotification({
      type: "leave_alert",
      karyawan_id,
      nama: employeeName,
      jenis: status,
      keterangan: keterangan || "(Tanpa keterangan)",
      tanggal,
      waktu,
      foto: fotoPath
    });
  }

  res.json({
    ok: true,
    success: true,
    message: "Absensi berhasil dicatat.",
    status,
    data: {
      karyawan_id,
      nama: employeeName,
      tanggal,
      waktu,
      tipe,
      status,
      jarak_meter,
      cabang_id,
      shift_id,
      foto: fotoPath,
      is_multi_device: isMultiDevice,
      is_mock: isMock
    }
  });
};

app.post("/api/absen", handleAbsen);
app.post("/api/absensi", handleAbsen);

// 7. RIWAYAT KARYAWAN
const handleRiwayat = (req, res) => {
  const id = req.params.karyawan_id || req.query.id;
  if (!id) {
    return res.json({ ok: true, success: true, data: [] });
  }
  const rows = db.prepare(`
    SELECT a.*, c.nama as cabang_nama 
    FROM absensi a 
    LEFT JOIN cabang c ON a.cabang_id = c.id
    WHERE a.karyawan_id = ? 
    ORDER BY a.tanggal DESC, a.waktu DESC
  `).all(id);

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
    foto: r.foto,
    cabang_id: r.cabang_id,
    cabang_nama: r.cabang_nama || "Kantor Cipaeh",
    shift_id: r.shift_id
  }));
  res.json({ ok: true, success: true, data: formatted });
};

app.get("/api/riwayat/:karyawan_id", handleRiwayat);
app.get("/api/riwayat", handleRiwayat);

// 8. REKAP SELURUH KARYAWAN (Admin)
function handleRekap(req, res) {
    try {
        // Tentukan tanggal filter: dari query atau hari ini (WIB)
        let tanggalFilter = req.query.tanggal;
        if (!tanggalFilter) {
            // Hitung tanggal hari ini dalam zona waktu Asia/Jakarta
            const now = new Date();
            const wibOffset = 7 * 60 * 60 * 1000; // WIB is UTC+7
            const wibTime = new Date(now.getTime() + wibOffset);
            tanggalFilter = wibTime.toISOString().split('T')[0];
        }

        const employees = db.prepare('SELECT id, nama FROM karyawan ORDER BY id').all();
        
        const result = employees.map(emp => {
            // Ambil record absensi terakhir untuk tanggal tersebut
            const record = db.prepare('SELECT * FROM absensi WHERE karyawan_id = ? AND tanggal = ? ORDER BY id DESC LIMIT 1').get(emp.id, tanggalFilter);
            
            let status = 'Belum Absen';
            let waktuDisplay = '-';
            let tipe = '-';

            if (record) {
                status = record.status; 
                tipe = record.tipe;
                // Format waktu ke HH:MM WIB
                try {
                    const d = new Date(record.waktu);
                    // Pastikan formatasi menggunakan locale Indonesia dan timezone Jakarta
                    waktuDisplay = d.toLocaleTimeString('id-ID', { 
                        hour: '2-digit', 
                        minute: '2-digit', 
                        timeZone: 'Asia/Jakarta' 
                    }) + ' WIB';
                } catch(e) {
                    waktuDisplay = record.waktu;
                }
            }

            return { 
                id: emp.id, 
                nama: emp.nama, 
                status: status, 
                waktu: waktuDisplay,
                tipe: tipe,
                tanggal: tanggalFilter
            };
        });
        
        res.json({ success: true, data: result, tanggal: tanggalFilter });
    } catch (err) {
        console.error('Error di handleRekap:', err);
        res.status(500).json({ success: false, message: err.message });
    }
}

app.get("/api/rekap", handleRekap);
app.get("/api/admin/rekap", handleRekap);

// 9. LIST KARYAWAN
app.get("/api/karyawan", (req, res) => {
  const rows = db.prepare("SELECT id, nama, role FROM karyawan ORDER BY id ASC").all().map(r => ({ ...r, name: r.nama }));
  res.json({ ok: true, success: true, data: rows });
});
app.get("/api/employees", (req, res) => {
  const rows = db.prepare("SELECT id, nama, role FROM karyawan ORDER BY id ASC").all().map(r => ({ ...r, name: r.nama }));
  res.json({ ok: true, success: true, data: rows });
});

// 10. JALANKAN SERVER HTTP (PORT 3005)
http.createServer(app).listen(PORT, "0.0.0.0", () => {
  console.log(`Server Absensi HTTP berjalan di http://0.0.0.0:${PORT}`);
});

// 11. JALANKAN SERVER HTTPS (PORT 3006)
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
