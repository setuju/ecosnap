const fs = require('fs');
const path = require('path');

// Ambil API Key dari environment variable saat build
const apiKey = process.env.GEMINI_API_KEY || 'YOUR_API_KEY';

// Buat konten file config.js yang baru
const content = `window.ENV = {
    GEMINI_API_KEY: '${apiKey}'
};`;

// Tulis ke file config.js (atau timpa jika sudah ada)
const filePath = path.join(__dirname, 'config.js');
fs.writeFileSync(filePath, content);

console.log('✅ config.js berhasil dibuat dengan API Key dari environment variable.');
