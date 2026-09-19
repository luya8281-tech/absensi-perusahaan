const db = require('./db');

const employees = [
  "Daman Huri","Nanang Wahyudin","Lisa","Rustam","Yulianti","Kalwani","Suganda","Siti rokhmah","Nining yuniawati","Jelita amelia",
  "Suntiyah","Nurul Komariyah","Muhamad sahroni","Sadiyah","Agisni","Nurasiyah","Ciliwung","Nari Susanti","Zaenal Muttaqin","Maryati",
  "Toyibah","Dede sumarna","Jahro Chatur Ningsih","Mursad","Jamad","Rosita","Arkani","Nazri Syahlan Mughofar","Suherni","Hapip",
  "Sunandar","Satian","Marsonah","Junedi B.salim","Siti Nur Alyanti","M.irfan alfiansyah","Mursinah","Rohman","Sulkah","Zakiyah safara",
  "Sabika amanah","Muhamad Al fadli","AGUS YAHRI","M. Rahman","Karinah","Siti soleha","MUHAMAD TOHIR","Nopitasari","Kamsin"
];

// Admin account
const insertUser = db.prepare('INSERT OR IGNORE INTO users (employee_id, name, password, role) VALUES (?, ?, ?, ?)');
insertUser.run('ADMIN-01', 'Administrator', 'admin123', 'admin');

// Employee accounts
employees.forEach((name, index) => {
  const empId = `EMP-${String(index + 1).padStart(3, '0')}`;
  const password = '123456'; // Default password
  insertUser.run(empId, name, password, 'karyawan');
});

console.log(`Seeded 1 admin and ${employees.length} employees successfully.`);
