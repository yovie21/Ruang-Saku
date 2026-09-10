# 🔒 Kebijakan Keamanan

Jika Anda menemukan kerentanan keamanan, silakan hubungi kami melalui:

**Email:** yovie6513@gmail.com

## 📌 Praktik Keamanan Saat Ini

- 🔐 **NextAuth.js** dengan Google OAuth
- 🔑 **PIN 4–6 digit** hash dengan SHA-256
- 🖐️ **WebAuthn** untuk biometrik
- 🛡️ **Environment variables** untuk semua secrets
- 🔒 **HTTPS enforced** untuk production
- 📊 **Vercel Speed Insights** — tidak mengumpulkan data pribadi

## 🔄 Proses

1. Laporkan keamanan melalui email (bukan GitHub Issues)
2. Kami akan merespons dalam **48 jam**
3. Fix akan diumumkan setelah patch dirilis
4. Kredit akan diberikan untuk laporan yang valid

## ⚠️ Catatan

- Jangan pernah commit `.env` atau file yang mengandung secrets
- Gunakan `.env.example` sebagai referensi
- Semua API routes menggunakan middleware NextAuth auth protection
- Database connection string harus dienkripsi/dijaga kerahasiaannya
